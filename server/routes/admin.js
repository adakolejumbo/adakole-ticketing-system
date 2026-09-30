import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { many, one, query, tx } from '../db.js';
import { requireAuth, requireStaff, requireAdmin, HttpError } from '../auth.js';

const r = Router();
r.use(requireAuth, requireStaff);

/** Small CRUD factory. Only whitelisted columns are ever written. */
function crud(path, table, columns, { order = 'id', writeRole = requireAdmin, transform = (b) => b } = {}) {
  r.get(`/${path}`, async (_req, res) => res.json(await many(`SELECT * FROM ${table} ORDER BY ${order}`)));
  r.post(`/${path}`, writeRole, async (req, res) => {
    const body = await transform(req.body, true);
    const cols = columns.filter((c) => body[c] !== undefined);
    if (!cols.length) throw new HttpError(400, 'Nothing to save.');
    const row = await one(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      cols.map((c) => body[c]),
    );
    res.status(201).json(row);
  });
  r.put(`/${path}/:id`, writeRole, async (req, res) => {
    const body = await transform(req.body, false);
    const cols = columns.filter((c) => body[c] !== undefined);
    if (!cols.length) throw new HttpError(400, 'Nothing to save.');
    const row = await one(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [req.params.id, ...cols.map((c) => body[c])],
    );
    if (!row) throw new HttpError(404, 'Not found.');
    res.json(row);
  });
  r.delete(`/${path}/:id`, writeRole, async (req, res) => {
    await query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  });
}

const toArray = (v) => (Array.isArray(v) ? v : String(v || '').split(',').map((s) => s.trim()).filter(Boolean));
const nullIfEmpty = (v) => (v === '' ? null : v);

crud('organizations', 'organizations', ['name', 'domain', 'phone', 'notes'], {
  order: 'name',
  transform: (b) => ({ ...b, domain: b.domain ? String(b.domain).trim().toLowerCase() : b.domain }),
});
crud('categories', 'categories', ['name', 'color'], { order: 'name' });
crud('macros', 'macros', ['title', 'body', 'set_status', 'is_internal'], {
  order: 'title',
  writeRole: (_req, _res, next) => next(), // any agent can manage shared replies
  transform: (b) => ({ ...b, set_status: nullIfEmpty(b.set_status) }),
});
crud('custom-fields', 'custom_fields', ['key', 'label', 'type', 'options', 'required', 'visible_to_client', 'position'], {
  order: 'position, id',
  transform: (b) => ({
    ...b,
    key: b.key ? String(b.key).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') : b.key,
    options: b.options === undefined ? undefined : toArray(b.options),
  }),
});
crud('routing-rules', 'routing_rules', ['name', 'position', 'active', 'match_type', 'conditions', 'actions', 'stop_processing'], {
  order: 'position, id',
  transform: (b) => ({
    ...b,
    conditions: b.conditions === undefined ? undefined : JSON.stringify(b.conditions),
    actions: b.actions === undefined ? undefined : JSON.stringify(b.actions),
  }),
});

// Teams, with member lists
r.get('/teams', async (_req, res) => {
  res.json(await many(
    `SELECT t.*, COALESCE(array_agg(tm.user_id) FILTER (WHERE tm.user_id IS NOT NULL), '{}') AS member_ids
       FROM teams t LEFT JOIN team_members tm ON tm.team_id = t.id GROUP BY t.id ORDER BY t.name`));
});
const saveTeam = async (req, res) => {
  const { name, description, auto_assign, member_ids = [] } = req.body;
  if (!name?.trim()) throw new HttpError(400, 'Name the team.');
  const team = await tx(async (db) => {
    const { rows } = req.params.id
      ? await db.query('UPDATE teams SET name=$2, description=$3, auto_assign=$4 WHERE id=$1 RETURNING *',
          [req.params.id, name.trim(), description || null, auto_assign !== false])
      : await db.query('INSERT INTO teams (name, description, auto_assign) VALUES ($1,$2,$3) RETURNING *',
          [name.trim(), description || null, auto_assign !== false]);
    await db.query('DELETE FROM team_members WHERE team_id = $1', [rows[0].id]);
    for (const uid of member_ids) await db.query('INSERT INTO team_members VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].id, uid]);
    return rows[0];
  });
  res.json(team);
};
r.post('/teams', requireAdmin, saveTeam);
r.put('/teams/:id', requireAdmin, saveTeam);
r.delete('/teams/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM teams WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Users (agents, admins, client contacts)
r.get('/users', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.role) {
    params.push(String(req.query.role).split(','));
    where = 'WHERE u.role = ANY($1)';
  }
  res.json(await many(
    `SELECT u.id, u.name, u.email, u.role, u.organization_id, u.phone, u.active, u.created_at,
            o.name AS organization_name, (u.password_hash IS NOT NULL) AS can_sign_in,
            (SELECT COUNT(*) FROM tickets t WHERE t.assignee_id = u.id AND t.status IN ('new','in_progress','pending')) AS open_load
       FROM users u LEFT JOIN organizations o ON o.id = u.organization_id ${where} ORDER BY u.role, u.name`, params));
});
const saveUser = async (req, res) => {
  const b = req.body;
  const fields = {
    name: b.name?.trim(),
    email: b.email?.trim().toLowerCase(),
    role: b.role,
    organization_id: b.organization_id ? Number(b.organization_id) : null,
    phone: b.phone || null,
    active: b.active !== false,
  };
  if (!fields.name || !fields.email) throw new HttpError(400, 'Name and email are required.');
  if (!['admin', 'agent', 'client'].includes(fields.role)) throw new HttpError(400, 'Choose a role.');
  if (b.password) {
    if (String(b.password).length < 8) throw new HttpError(400, 'Passwords need at least 8 characters.');
    fields.password_hash = await bcrypt.hash(String(b.password), 10);
  }
  const cols = Object.keys(fields);
  try {
    const row = req.params.id
      ? await one(`UPDATE users SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING id`,
          [req.params.id, ...cols.map((c) => fields[c])])
      : await one(`INSERT INTO users (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
          cols.map((c) => fields[c]));
    res.json(row);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(400, 'Someone already uses that email.');
    throw e;
  }
};
r.post('/users', requireAdmin, saveUser);
r.put('/users/:id', requireAdmin, saveUser);

// SLA policies (one row per priority)
r.get('/sla', async (_req, res) =>
  res.json(await many(`SELECT * FROM sla_policies ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`)));
r.put('/sla', requireAdmin, async (req, res) => {
  for (const p of req.body.policies || []) {
    await query(
      `INSERT INTO sla_policies (priority, first_response_minutes, resolution_minutes) VALUES ($1,$2,$3)
       ON CONFLICT (priority) DO UPDATE SET first_response_minutes = $2, resolution_minutes = $3`,
      [p.priority, Number(p.first_response_minutes), Number(p.resolution_minutes)]);
  }
  res.json({ ok: true });
});

export default r;
