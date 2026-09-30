import pool, { tx } from '../db.js';
import { HttpError, isStaff } from '../auth.js';
import { routeTicket, leastLoadedAgent } from './routing.js';
import { slaTargets, addMinutes } from './sla.js';
import { sendEmail, ticketRef, appUrl } from './notify.js';

export const STATUSES = ['new', 'in_progress', 'pending', 'resolved', 'closed'];
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const CHANNELS = ['web', 'portal', 'email', 'chat', 'phone', 'social', 'api'];
const OPEN = ['new', 'in_progress', 'pending'];

export const TICKET_SELECT = `
  SELECT t.*,
         c.name  AS category_name, c.color AS category_color,
         r.name  AS requester_name, r.email AS requester_email,
         a.name  AS assignee_name,
         tm.name AS team_name,
         o.name  AS organization_name,
         (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = t.id AND tc.is_internal = false) AS reply_count
    FROM tickets t
    LEFT JOIN categories c     ON c.id = t.category_id
    LEFT JOIN users r          ON r.id = t.requester_id
    LEFT JOIN users a          ON a.id = t.assignee_id
    LEFT JOIN teams tm         ON tm.id = t.team_id
    LEFT JOIN organizations o  ON o.id = t.organization_id`;

const normTags = (tags) =>
  [...new Set((Array.isArray(tags) ? tags : String(tags || '').split(','))
    .map((t) => String(t).trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean))];

const logEvent = (db, ticketId, actorId, type, detail = {}) =>
  db.query('INSERT INTO ticket_events (ticket_id, actor_id, type, detail) VALUES ($1,$2,$3,$4)', [
    ticketId,
    actorId || null,
    type,
    detail,
  ]);

/** Find a requester by email, creating a client contact (no password) if needed. */
export async function findOrCreateRequester(db, { email, name, phone }) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) throw new HttpError(400, 'A valid requester email is required.');
  const existing = await db.query('SELECT * FROM users WHERE email = $1', [clean]);
  if (existing.rows[0]) return existing.rows[0];
  const domain = clean.split('@')[1];
  const org = await db.query('SELECT id FROM organizations WHERE lower(domain) = $1', [domain]);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, role, organization_id, phone) VALUES ($1,$2,'client',$3,$4) RETURNING *`,
    [name?.trim() || clean.split('@')[0], clean, org.rows[0]?.id || null, phone || null],
  );
  return rows[0];
}

async function validateCustomFields(db, values = {}, { forClient = false } = {}) {
  const { rows: defs } = await db.query('SELECT * FROM custom_fields ORDER BY position, id');
  const out = {};
  for (const def of defs) {
    if (forClient && !def.visible_to_client) continue;
    const v = values[def.key];
    const empty = v === undefined || v === null || v === '';
    if (empty) {
      if (def.required && forClient !== null) throw new HttpError(400, `${def.label} is required.`);
      continue;
    }
    if (def.type === 'number' && Number.isNaN(Number(v))) throw new HttpError(400, `${def.label} must be a number.`);
    if (def.type === 'select' && def.options.length && !def.options.includes(v))
      throw new HttpError(400, `${def.label} must be one of: ${def.options.join(', ')}.`);
    out[def.key] = def.type === 'number' ? Number(v) : def.type === 'checkbox' ? Boolean(v) : v;
  }
  return out;
}

export async function createTicket(input, actor) {
  const subject = String(input.subject || '').trim();
  if (!subject) throw new HttpError(400, 'Add a subject so the team knows what this is about.');
  const channel = CHANNELS.includes(input.channel) ? input.channel : 'web';
  const staff = isStaff(actor);

  const created = await tx(async (db) => {
    let requester;
    if (input.requester_id && staff) {
      const r = await db.query('SELECT * FROM users WHERE id = $1', [input.requester_id]);
      requester = r.rows[0];
      if (!requester) throw new HttpError(400, 'That requester does not exist.');
    } else if (input.requester_email) {
      requester = await findOrCreateRequester(db, {
        email: input.requester_email,
        name: input.requester_name,
        phone: input.requester_phone,
      });
    } else if (actor) {
      requester = actor;
    } else {
      throw new HttpError(400, 'A requester email is required.');
    }

    const draft = {
      subject,
      description: String(input.description || '').trim(),
      priority: PRIORITIES.includes(input.priority) ? input.priority : 'normal',
      channel,
      category_id: input.category_id ? Number(input.category_id) : null,
      organization_id: (staff && input.organization_id ? Number(input.organization_id) : null) || requester.organization_id || null,
      team_id: staff && input.team_id ? Number(input.team_id) : null,
      assignee_id: staff && input.assignee_id ? Number(input.assignee_id) : null,
      tags: normTags(input.tags),
      custom_fields: await validateCustomFields(db, input.custom_fields || {}, {
        forClient: input.skip_required ? null : !staff,
      }),
      requester_email: requester.email,
    };

    const { routed, matched, autoAssigned } = await routeTicket(db, draft);
    const now = new Date();
    const sla = await slaTargets(routed.priority, now, 0, db);

    const { rows } = await db.query(
      `INSERT INTO tickets (subject, description, priority, channel, category_id, requester_id, organization_id,
                            assignee_id, team_id, tags, custom_fields, first_response_due, resolution_due, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING *`,
      [routed.subject, routed.description, routed.priority, routed.channel, routed.category_id, requester.id,
       routed.organization_id, routed.assignee_id, routed.team_id, routed.tags, routed.custom_fields,
       sla.first_response_due, sla.resolution_due, now],
    );
    const ticket = rows[0];
    await logEvent(db, ticket.id, actor?.id, 'created', { channel });
    if (matched.length) await logEvent(db, ticket.id, null, 'routed', { rules: matched.map((m) => m.name) });
    if (autoAssigned) await logEvent(db, ticket.id, null, 'auto_assigned', { agent: autoAssigned.name, load: autoAssigned.load });
    return { ticket, requester };
  });

  const { ticket, requester } = created;
  sendEmail({
    to: requester.email,
    subject: `[${ticketRef(ticket.id)}] We received your request: ${ticket.subject}`,
    text: `Hi ${requester.name},\n\nThanks for reaching out. Your request ${ticketRef(ticket.id)} is logged and the team will reply soon.\n\nYou can follow it at ${appUrl()}/portal/tickets/${ticket.id}\n\nReply to this email to add more detail. Keep [${ticketRef(ticket.id)}] in the subject line.`,
  });
  if (ticket.assignee_id) notifyAssignee(ticket, 'A ticket was assigned to you');
  return getTicket(ticket.id, actor || requester);
}

async function notifyAssignee(ticket, heading) {
  const a = await pool.query('SELECT name, email FROM users WHERE id = $1', [ticket.assignee_id]);
  if (!a.rows[0]) return;
  sendEmail({
    to: a.rows[0].email,
    subject: `[${ticketRef(ticket.id)}] ${heading}: ${ticket.subject}`,
    text: `${heading}.\n\n${ticket.subject}\nPriority: ${ticket.priority}\n\nOpen it: ${appUrl()}/tickets/${ticket.id}`,
  });
}

const UPDATABLE = ['subject', 'status', 'priority', 'assignee_id', 'team_id', 'category_id', 'organization_id',
  'requester_id', 'tags', 'custom_fields'];

export async function updateTicket(id, changes, actor, existingDb) {
  const run = async (db) => {
    const { rows } = await db.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [id]);
    const cur = rows[0];
    if (!cur) throw new HttpError(404, `Ticket ${ticketRef(id)} was not found.`);

    const next = {};
    for (const key of UPDATABLE) {
      if (changes[key] === undefined) continue;
      let v = changes[key];
      if (['assignee_id', 'team_id', 'category_id', 'organization_id', 'requester_id'].includes(key))
        v = v === '' || v === null ? null : Number(v);
      if (key === 'tags') v = normTags(v);
      if (key === 'status' && !STATUSES.includes(v)) throw new HttpError(400, 'Unknown status.');
      if (key === 'priority' && !PRIORITIES.includes(v)) throw new HttpError(400, 'Unknown priority.');
      if (key === 'custom_fields') v = { ...cur.custom_fields, ...(await validateCustomFields(db, v, { forClient: null })) };
      if (key === 'subject') {
        v = String(v).trim();
        if (!v) throw new HttpError(400, 'Subject cannot be empty.');
      }
      if (JSON.stringify(v) !== JSON.stringify(cur[key])) next[key] = v;
    }

    // Moving to a new team without choosing an agent hands it to that team's least-busy agent.
    if (next.team_id && changes.assignee_id === undefined) {
      const agent = await leastLoadedAgent(db, next.team_id);
      if (agent && agent.id !== cur.assignee_id) {
        next.assignee_id = agent.id;
        await logEvent(db, id, null, 'auto_assigned', { agent: agent.name, load: agent.load });
      }
    }

    if (!Object.keys(next).length) return { ticket: cur, changed: {} };
    const now = new Date();

    if (next.status) {
      const from = cur.status;
      const to = next.status;
      if (to === 'pending' && from !== 'pending') next.sla_paused_at = now;
      if (from === 'pending' && to !== 'pending' && cur.sla_paused_at) {
        const paused = Math.max(0, Math.round((now - new Date(cur.sla_paused_at)) / 60_000));
        next.sla_paused_minutes = cur.sla_paused_minutes + paused;
        next.sla_paused_at = null;
        if (cur.resolution_due) next.resolution_due = addMinutes(cur.resolution_due, paused);
      }
      if (to === 'resolved') next.resolved_at = now;
      if (to === 'closed') {
        next.closed_at = now;
        if (!cur.resolved_at) next.resolved_at = now;
      }
      if (OPEN.includes(to) && !OPEN.includes(from)) {
        next.resolved_at = null;
        next.closed_at = null;
      }
    }

    if (next.priority) {
      const sla = await slaTargets(next.priority, cur.created_at, next.sla_paused_minutes ?? cur.sla_paused_minutes, db);
      next.first_response_due = sla.first_response_due;
      next.resolution_due = sla.resolution_due;
    }

    const keys = Object.keys(next);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const updated = await db.query(`UPDATE tickets SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`, [
      id,
      ...keys.map((k) => next[k]),
    ]);

    const tracked = UPDATABLE.filter((k) => k in next);
    for (const field of tracked) {
      await logEvent(db, id, actor?.id, 'field_changed', { field, from: cur[field], to: next[field] });
    }
    return { ticket: updated.rows[0], changed: next, previous: cur };
  };

  const result = existingDb ? await run(existingDb) : await tx(run);
  const { ticket, changed } = result;
  if (changed.assignee_id && changed.assignee_id !== actor?.id) notifyAssignee(ticket, 'A ticket was assigned to you');
  if (changed.status === 'resolved') {
    const r = await pool.query('SELECT name, email FROM users WHERE id = $1', [ticket.requester_id]);
    if (r.rows[0])
      sendEmail({
        to: r.rows[0].email,
        subject: `[${ticketRef(ticket.id)}] Resolved: ${ticket.subject}`,
        text: `Hi ${r.rows[0].name},\n\nWe've marked ${ticketRef(ticket.id)} as resolved. If something still isn't right, reply to this email and the ticket will reopen.\n\n${appUrl()}/portal/tickets/${ticket.id}`,
      });
  }
  return result;
}

export async function addComment(ticketId, { body, is_internal, status }, actor) {
  const text = String(body || '').trim();
  if (!text) throw new HttpError(400, 'Write a message before sending.');
  const staff = isStaff(actor);

  const result = await tx(async (db) => {
    const { rows } = await db.query('SELECT * FROM tickets WHERE id = $1 FOR UPDATE', [ticketId]);
    const ticket = rows[0];
    if (!ticket) throw new HttpError(404, 'Ticket not found.');
    if (!staff && ticket.requester_id !== actor.id) throw new HttpError(404, 'Ticket not found.');
    if (!staff && ticket.status === 'closed')
      throw new HttpError(400, 'This request is closed. Open a new request and mention this reference.');

    const internal = staff && Boolean(is_internal);
    const { rows: c } = await db.query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, channel) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ticketId, actor.id, text, internal, actor.channel || 'web'],
    );
    await logEvent(db, ticketId, actor.id, internal ? 'internal_note' : 'reply', {});

    const changes = {};
    if (staff && !internal) {
      if (!ticket.first_response_at)
        await db.query('UPDATE tickets SET first_response_at = now() WHERE id = $1', [ticketId]);
      if (!ticket.assignee_id) changes.assignee_id = actor.id;
      if (ticket.status === 'new' && !status) changes.status = 'in_progress';
    }
    if (!staff && ['pending', 'resolved'].includes(ticket.status)) changes.status = 'in_progress';
    if (staff && status) changes.status = status;
    if (Object.keys(changes).length) await updateTicket(ticketId, changes, actor, db);
    else await db.query('UPDATE tickets SET updated_at = now() WHERE id = $1', [ticketId]);
    return { comment: c[0], ticket };
  });

  const { ticket } = result;
  if (staff && !is_internal) {
    const r = await pool.query('SELECT name, email FROM users WHERE id = $1', [ticket.requester_id]);
    if (r.rows[0])
      sendEmail({
        to: r.rows[0].email,
        subject: `Re: [${ticketRef(ticket.id)}] ${ticket.subject}`,
        text: `${text}\n\n—\n${actor.name}\nReply to this email to respond. View the request: ${appUrl()}/portal/tickets/${ticket.id}`,
      });
  } else if (!staff && ticket.assignee_id) {
    notifyAssignee(ticket, 'The requester replied');
  }
  return result.comment;
}

export async function getTicket(id, user) {
  const { rows } = await pool.query(`${TICKET_SELECT} WHERE t.id = $1`, [id]);
  const ticket = rows[0];
  if (!ticket) throw new HttpError(404, `Ticket ${ticketRef(id)} was not found.`);
  const staff = isStaff(user);
  if (!staff && ticket.requester_id !== user.id) throw new HttpError(404, `Ticket ${ticketRef(id)} was not found.`);

  const comments = await pool.query(
    `SELECT tc.*, u.name AS author_name, u.role AS author_role
       FROM ticket_comments tc LEFT JOIN users u ON u.id = tc.author_id
      WHERE tc.ticket_id = $1 ${staff ? '' : 'AND tc.is_internal = false'}
      ORDER BY tc.created_at`,
    [id],
  );
  const articles = await pool.query(
    `SELECT a.id, a.title FROM ticket_kb_links l JOIN kb_articles a ON a.id = l.article_id
      WHERE l.ticket_id = $1 ${staff ? '' : 'AND a.published = true'}`,
    [id],
  );
  const events = staff
    ? (
        await pool.query(
          `SELECT e.*, u.name AS actor_name FROM ticket_events e LEFT JOIN users u ON u.id = e.actor_id
            WHERE e.ticket_id = $1 ORDER BY e.created_at, e.id`,
          [id],
        )
      ).rows
    : [];

  if (!staff) {
    const { rows: hidden } = await pool.query('SELECT key FROM custom_fields WHERE visible_to_client = false');
    for (const h of hidden) delete ticket.custom_fields[h.key];
  }
  return { ...ticket, comments: comments.rows, articles: articles.rows, events };
}
