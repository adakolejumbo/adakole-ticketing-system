import { Router } from 'express';
import { many, query } from '../db.js';
import { requireAuth, requireStaff, isStaff, HttpError } from '../auth.js';
import { createTicket, updateTicket, addComment, getTicket, TICKET_SELECT } from '../services/tickets.js';

const r = Router();
r.use(requireAuth);

const SORTS = {
  updated: 't.updated_at DESC',
  created: 't.created_at DESC',
  oldest: 't.created_at ASC',
  priority: `CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at`,
  due: 't.resolution_due ASC NULLS LAST',
};

r.get('/', async (req, res) => {
  const where = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  const q = req.query;

  if (!isStaff(req.user)) add('t.requester_id = ?', req.user.id);
  else {
    switch (q.view) {
      case 'mine': add('t.assignee_id = ?', req.user.id); where.push(`t.status IN ('new','in_progress','pending')`); break;
      case 'unassigned': where.push('t.assignee_id IS NULL', `t.status IN ('new','in_progress','pending')`); break;
      case 'open': where.push(`t.status IN ('new','in_progress','pending')`); break;
      case 'breached':
        where.push(`t.status IN ('new','in_progress','pending')`,
          `((t.first_response_at IS NULL AND t.first_response_due < now()) OR t.resolution_due < now())`);
        break;
      case 'pending': where.push(`t.status = 'pending'`); break;
      case 'resolved': where.push(`t.status IN ('resolved','closed')`); break;
      default: break;
    }
  }
  if (q.status) add('t.status = ANY(?)', String(q.status).split(','));
  if (q.priority) add('t.priority = ANY(?)', String(q.priority).split(','));
  if (q.channel) add('t.channel = ANY(?)', String(q.channel).split(','));
  if (q.category_id) add('t.category_id = ?', Number(q.category_id));
  if (q.team_id) add('t.team_id = ?', Number(q.team_id));
  if (q.assignee_id) add('t.assignee_id = ?', Number(q.assignee_id));
  if (q.organization_id) add('t.organization_id = ?', Number(q.organization_id));
  if (q.tag) add('? = ANY(t.tags)', String(q.tag).toLowerCase());
  if (q.q) {
    const term = String(q.q).trim();
    const num = term.replace(/^ats-/i, '');
    if (/^\d+$/.test(num)) add('t.id = ?', Number(num));
    else add(`(t.subject ILIKE ? OR t.description ILIKE $${params.length + 1} OR r.email ILIKE $${params.length + 1} OR r.name ILIKE $${params.length + 1})`, `%${term}%`);
  }

  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Number(q.limit) || 50);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = SORTS[q.sort] || SORTS.updated;

  const rows = await many(`${TICKET_SELECT} ${whereSql} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);
  const total = await many(
    `SELECT COUNT(*) AS n FROM tickets t LEFT JOIN users r ON r.id = t.requester_id ${whereSql}`, params);
  res.json({ tickets: rows, total: total[0].n, page, limit });
});

r.get('/counts', requireStaff, async (req, res) => {
  const [row] = await many(
    `SELECT
       COUNT(*) FILTER (WHERE assignee_id = $1 AND status IN ('new','in_progress','pending')) AS mine,
       COUNT(*) FILTER (WHERE assignee_id IS NULL AND status IN ('new','in_progress','pending')) AS unassigned,
       COUNT(*) FILTER (WHERE status IN ('new','in_progress','pending')) AS open,
       COUNT(*) FILTER (WHERE status = 'pending') AS pending,
       COUNT(*) FILTER (WHERE status IN ('new','in_progress','pending') AND
         ((first_response_at IS NULL AND first_response_due < now()) OR resolution_due < now())) AS breached,
       COUNT(*) AS all
     FROM tickets`,
    [req.user.id],
  );
  res.json(row);
});

r.post('/', async (req, res) => {
  const body = { ...req.body };
  if (!isStaff(req.user)) {
    body.channel = 'portal';
    delete body.requester_email;
  }
  const ticket = await createTicket(body, req.user);
  res.status(201).json(ticket);
});

r.post('/bulk', requireStaff, async (req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  if (!ids.length) throw new HttpError(400, 'Select at least one ticket.');
  for (const id of ids) await updateTicket(id, req.body.changes || {}, req.user);
  res.json({ updated: ids.length });
});

r.get('/:id', async (req, res) => res.json(await getTicket(Number(req.params.id), req.user)));

r.patch('/:id', requireStaff, async (req, res) => {
  await updateTicket(Number(req.params.id), req.body, req.user);
  res.json(await getTicket(Number(req.params.id), req.user));
});

r.post('/:id/comments', async (req, res) => {
  await addComment(Number(req.params.id), req.body, req.user);
  res.status(201).json(await getTicket(Number(req.params.id), req.user));
});

r.post('/:id/articles', requireStaff, async (req, res) => {
  await query('INSERT INTO ticket_kb_links (ticket_id, article_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [
    Number(req.params.id), Number(req.body.article_id)]);
  await query(`INSERT INTO ticket_events (ticket_id, actor_id, type, detail) VALUES ($1,$2,'article_linked',$3)`, [
    Number(req.params.id), req.user.id, { article_id: Number(req.body.article_id) }]);
  res.json(await getTicket(Number(req.params.id), req.user));
});

r.delete('/:id/articles/:articleId', requireStaff, async (req, res) => {
  await query('DELETE FROM ticket_kb_links WHERE ticket_id = $1 AND article_id = $2', [
    Number(req.params.id), Number(req.params.articleId)]);
  res.json(await getTicket(Number(req.params.id), req.user));
});

export default r;
