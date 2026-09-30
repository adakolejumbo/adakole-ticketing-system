import { Router } from 'express';
import { many } from '../db.js';
import { requireAuth, isStaff } from '../auth.js';

const r = Router();

// One call that loads every lookup list the UI needs.
r.get('/', requireAuth, async (req, res) => {
  const staff = isStaff(req.user);
  const categories = await many('SELECT * FROM categories ORDER BY name');
  const custom_fields = await many(
    `SELECT * FROM custom_fields ${staff ? '' : 'WHERE visible_to_client = true'} ORDER BY position, id`);
  if (!staff) return res.json({ categories, custom_fields });
  const [teams, agents, organizations, macros, sla] = await Promise.all([
    many(`SELECT t.id, t.name, COALESCE(array_agg(tm.user_id) FILTER (WHERE tm.user_id IS NOT NULL), '{}') AS member_ids
            FROM teams t LEFT JOIN team_members tm ON tm.team_id = t.id GROUP BY t.id ORDER BY t.name`),
    many(`SELECT id, name, email, role FROM users WHERE role IN ('agent','admin') AND active = true ORDER BY name`),
    many('SELECT id, name, domain FROM organizations ORDER BY name'),
    many('SELECT * FROM macros ORDER BY title'),
    many('SELECT * FROM sla_policies'),
  ]);
  res.json({ categories, custom_fields, teams, agents, organizations, macros, sla });
});

// Requester lookup for agents logging phone/chat tickets.
r.get('/requesters', requireAuth, async (req, res) => {
  if (!isStaff(req.user)) return res.json([]);
  const q = `%${String(req.query.q || '').trim()}%`;
  res.json(await many(
    `SELECT u.id, u.name, u.email, u.organization_id, o.name AS organization_name
       FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.name ILIKE $1 OR u.email ILIKE $1 ORDER BY u.name LIMIT 8`, [q]));
});

export default r;
