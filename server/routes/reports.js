import { Router } from 'express';
import { many } from '../db.js';
import { requireAuth, requireStaff } from '../auth.js';

const r = Router();
r.use(requireAuth, requireStaff);

r.get('/', async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const tz = /^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$|^UTC$/.test(req.query.tz || '') ? req.query.tz : 'UTC';
  const p = [days];
  const pz = [days, tz];
  const inRange = `t.created_at >= now() - ($1 || ' days')::interval`;

  const [summary] = await many(
    `SELECT COUNT(*) AS created,
            COUNT(*) FILTER (WHERE t.resolved_at IS NOT NULL) AS resolved,
            COUNT(*) FILTER (WHERE t.status IN ('new','in_progress','pending')) AS still_open,
            ROUND(AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.created_at)) / 60) FILTER (WHERE t.first_response_at IS NOT NULL)) AS avg_first_response_min,
            ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 60) FILTER (WHERE t.resolved_at IS NOT NULL)) AS avg_resolution_min,
            COUNT(*) FILTER (WHERE t.first_response_at IS NOT NULL AND t.first_response_at <= t.first_response_due) AS fr_met,
            COUNT(*) FILTER (WHERE t.first_response_due IS NOT NULL AND (t.first_response_at IS NOT NULL OR t.first_response_due < now())) AS fr_measured,
            COUNT(*) FILTER (WHERE t.resolved_at IS NOT NULL AND t.resolved_at <= t.resolution_due) AS res_met,
            COUNT(*) FILTER (WHERE t.resolution_due IS NOT NULL AND (t.resolved_at IS NOT NULL OR t.resolution_due < now())) AS res_measured
       FROM tickets t WHERE ${inRange}`, p);

  const daily = await many(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            (SELECT COUNT(*) FROM tickets t WHERE (t.created_at AT TIME ZONE $2)::date = d) AS created,
            (SELECT COUNT(*) FROM tickets t WHERE (t.resolved_at AT TIME ZONE $2)::date = d) AS resolved
       FROM generate_series(((now() AT TIME ZONE $2) - ($1 || ' days')::interval)::date, (now() AT TIME ZONE $2)::date, '1 day') d ORDER BY d`, pz);

  const group = (col, join = '', label = col) =>
    many(`SELECT ${label} AS label, COUNT(*) AS count FROM tickets t ${join} WHERE ${inRange} GROUP BY 1 ORDER BY 2 DESC`, p);

  const [byStatus, byChannel, byPriority, byCategory, byOrg] = await Promise.all([
    group('t.status'),
    group('t.channel'),
    group('t.priority'),
    group('c.name', 'LEFT JOIN categories c ON c.id = t.category_id', `COALESCE(c.name, 'Uncategorized')`),
    group('o.name', 'LEFT JOIN organizations o ON o.id = t.organization_id', `COALESCE(o.name, 'No organization')`),
  ]);

  const byAgent = await many(
    `SELECT u.id, u.name,
            COUNT(t.id) FILTER (WHERE t.status IN ('new','in_progress','pending')) AS open,
            COUNT(t.id) FILTER (WHERE t.resolved_at >= now() - ($1 || ' days')::interval) AS resolved,
            ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 60)
                  FILTER (WHERE t.resolved_at >= now() - ($1 || ' days')::interval)) AS avg_resolution_min,
            ROUND(100.0 * COUNT(t.id) FILTER (WHERE t.resolved_at >= now() - ($1 || ' days')::interval AND t.resolved_at <= t.resolution_due)
                  / NULLIF(COUNT(t.id) FILTER (WHERE t.resolved_at >= now() - ($1 || ' days')::interval), 0)) AS sla_pct
       FROM users u LEFT JOIN tickets t ON t.assignee_id = u.id
      WHERE u.role IN ('agent','admin') AND u.active = true
      GROUP BY u.id, u.name ORDER BY resolved DESC, u.name`, p);

  const heatmap = await many(
    `SELECT EXTRACT(DOW FROM t.created_at AT TIME ZONE $2)::int AS dow, EXTRACT(HOUR FROM t.created_at AT TIME ZONE $2)::int AS hour,
            COUNT(*) AS count
       FROM tickets t WHERE ${inRange} GROUP BY 1, 2`, pz);

  const topTags = await many(
    `SELECT tag AS label, COUNT(*) AS count FROM tickets t, unnest(t.tags) tag WHERE ${inRange}
      GROUP BY tag ORDER BY count DESC LIMIT 10`, p);

  const kb = await many(
    `SELECT id, title, views, helpful_count, deflections FROM kb_articles ORDER BY deflections DESC, views DESC LIMIT 5`);

  res.json({ days, summary, daily, byStatus, byChannel, byPriority, byCategory, byOrg, byAgent, heatmap, topTags, kb });
});

export default r;
