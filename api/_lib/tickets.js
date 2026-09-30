import { routeTicket } from './routing.js';
import { policyFor, dueDates } from './sla.js';

export const tnum = (id) => `ATS-${String(id).padStart(5, '0')}`;
export const OPEN = ['new', 'in_progress', 'pending'];

export async function logActivity(db, ticketId, actorId, action, detail = {}) {
  await db.query('insert into activity (ticket_id, actor_id, action, detail) values ($1,$2,$3,$4)', [ticketId, actorId, action, detail]);
}

export async function findOrCreateCustomer(db, email, name) {
  const e = String(email).trim().toLowerCase();
  const found = (await db.query('select * from users where lower(email) = $1', [e])).rows[0];
  if (found) return found;
  const domain = e.split('@')[1] || '';
  const org = (await db.query('select id from organizations where lower(domain) = $1', [domain])).rows[0];
  return (
    await db.query(
      `insert into users (name, email, role, org_id) values ($1,$2,'customer',$3) returning *`,
      [name || e.split('@')[0], e, org?.id || null]
    )
  ).rows[0];
}

export async function createTicket(db, input, actor) {
  const requester = (await db.query('select id, org_id from users where id = $1', [input.requester_id])).rows[0];
  const routed = await routeTicket(db, {
    subject: input.subject,
    description: input.description,
    channel: input.channel || 'web',
    priority: input.priority || 'normal',
    priorityLocked: !!input.priority,
    category_id: input.category_id || null,
    team_id: input.team_id || null,
    assignee_id: input.assignee_id || null,
    tags: input.tags || [],
    skipAi: input.skipAi,
  });
  const createdAt = input.created_at ? new Date(input.created_at) : new Date();
  const due = dueDates(await policyFor(db, routed.priority), createdAt);
  const t = (
    await db.query(
      `insert into tickets (subject, description, status, priority, channel, category_id, requester_id, org_id,
                            assignee_id, team_id, tags, custom_fields, first_response_due, resolution_due, created_at, updated_at)
       values ($1,$2,'new',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) returning *`,
      [
        input.subject, input.description || '', routed.priority, routed.channel, routed.category_id,
        requester.id, input.org_id || requester.org_id, routed.assignee_id, routed.team_id, routed.tags,
        input.custom_fields || {}, due.first_response_due, due.resolution_due, createdAt,
      ]
    )
  ).rows[0];
  await logActivity(db, t.id, actor?.id || null, 'created', { channel: t.channel, routing: routed.routing });
  return t;
}

// Apply a status change, handling the SLA pause clock and resolution time.
export function statusPatch(ticket, next, now = new Date()) {
  const p = { status: next };
  const wasPaused = ticket.status === 'pending' && ticket.sla_paused_at;
  if (next === 'pending' && ticket.status !== 'pending') p.sla_paused_at = now;
  if (wasPaused && next !== 'pending') {
    const mins = Math.round((now - new Date(ticket.sla_paused_at)) / 60000);
    p.sla_paused_at = null;
    p.sla_paused_mins = (ticket.sla_paused_mins || 0) + mins;
    const shift = (d) => (d ? new Date(new Date(d).getTime() + mins * 60000) : d);
    if (!ticket.first_responded_at) p.first_response_due = shift(ticket.first_response_due);
    p.resolution_due = shift(ticket.resolution_due);
  }
  if (['resolved', 'closed'].includes(next) && !ticket.resolved_at) p.resolved_at = now;
  if (OPEN.includes(next)) p.resolved_at = null;
  return p;
}

export async function updateTicket(db, id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return (await db.query('select * from tickets where id = $1', [id])).rows[0];
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  return (
    await db.query(`update tickets set ${sets}, updated_at = now() where id = $1 returning *`, [id, ...keys.map((k) => patch[k])])
  ).rows[0];
}
