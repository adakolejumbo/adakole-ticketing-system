// Rule-based routing: rules run in order; each matching rule applies its actions.
// Afterwards, a ticket that has a team but no agent is given to the least-busy agent on that team.

const OPEN_STATUSES = ['new', 'in_progress', 'pending'];

function fieldValue(ticket, field) {
  switch (field) {
    case 'text':
      return `${ticket.subject || ''}\n${ticket.description || ''}`;
    case 'requester_email':
      return ticket.requester_email || '';
    case 'tags':
      return (ticket.tags || []).join(',');
    default:
      return ticket[field] == null ? '' : String(ticket[field]);
  }
}

function matches(ticket, cond) {
  const actual = fieldValue(ticket, cond.field).toLowerCase();
  const values = String(cond.value ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (!values.length) return false;
  switch (cond.op) {
    case 'contains':
      return values.some((v) => actual.includes(v));
    case 'not_contains':
      return values.every((v) => !actual.includes(v));
    case 'equals':
      return values.some((v) => actual === v);
    case 'not_equals':
      return values.every((v) => actual !== v);
    case 'starts_with':
      return values.some((v) => actual.startsWith(v));
    case 'ends_with':
      return values.some((v) => actual.endsWith(v));
    default:
      return false;
  }
}

export function evaluateRules(ticket, rules) {
  const result = { ...ticket, tags: [...(ticket.tags || [])] };
  const matched = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const conds = rule.conditions || [];
    if (!conds.length) continue;
    const ok = rule.match_type === 'any' ? conds.some((c) => matches(result, c)) : conds.every((c) => matches(result, c));
    if (!ok) continue;
    matched.push({ id: rule.id, name: rule.name });
    const a = rule.actions || {};
    if (a.team_id) result.team_id = Number(a.team_id);
    if (a.assignee_id) result.assignee_id = Number(a.assignee_id);
    if (a.priority) result.priority = a.priority;
    if (a.category_id) result.category_id = Number(a.category_id);
    if (a.add_tags) {
      for (const t of String(a.add_tags).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
        if (!result.tags.includes(t)) result.tags.push(t);
    }
    if (rule.stop_processing) break;
  }
  return { ticket: result, matched };
}

export async function leastLoadedAgent(db, teamId) {
  const { rows } = await db.query(
    `SELECT u.id, u.name, COUNT(t.id) AS load
       FROM team_members tm
       JOIN teams tm_team ON tm_team.id = tm.team_id AND tm_team.auto_assign = true
       JOIN users u ON u.id = tm.user_id AND u.active = true AND u.role IN ('agent','admin')
       LEFT JOIN tickets t ON t.assignee_id = u.id AND t.status = ANY($2)
      WHERE tm.team_id = $1
      GROUP BY u.id, u.name
      ORDER BY load ASC, random()
      LIMIT 1`,
    [teamId, OPEN_STATUSES],
  );
  return rows[0] || null;
}

export async function routeTicket(db, ticket) {
  const { rows: rules } = await db.query('SELECT * FROM routing_rules WHERE active = true ORDER BY position, id');
  const { ticket: routed, matched } = evaluateRules(ticket, rules);
  let autoAssigned = null;
  if (routed.team_id && !routed.assignee_id) {
    autoAssigned = await leastLoadedAgent(db, routed.team_id);
    if (autoAssigned) routed.assignee_id = autoAssigned.id;
  }
  return { routed, matched, autoAssigned };
}
