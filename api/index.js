// Single serverless entry point. vercel.json rewrites /api/* here.
import { q, one, many, tx, getPool } from './_lib/db.js';
import { HttpError, readBody, send, need } from './_lib/http.js';
import { requireUser, getUser, signToken, hashPassword, checkPassword, isStaff, isDemo, blockDemo, STAFF } from './_lib/auth.js';
import { createTicket, updateTicket, statusPatch, logActivity, findOrCreateCustomer, tnum, OPEN } from './_lib/tickets.js';
import { withSla, policyFor, dueDates } from './_lib/sla.js';
import { rankArticles } from './_lib/kb.js';
import { emailRequester } from './_lib/notify.js';
import { SCHEMA, DROP } from './_lib/schema.js';
import { seed } from './_lib/seed.js';

const routes = [];
const on = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, re, keys, handler });
};

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '');
    path = '/' + String(path).replace(/^\/+/, '');
    url.searchParams.delete('__path');
    const query = Object.fromEntries(url.searchParams);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      const out = await r.handler({ req, params, query, body });
      return send(res, 200, out ?? { ok: true });
    }
    throw new HttpError(404, `No endpoint for ${req.method} /api${path}`);
  } catch (e) {
    const status = e.status || (e.code === '23505' ? 409 : 500);
    const message = e.code === '23505' ? 'That already exists.' : e.message || 'Server error';
    if (status >= 500) console.error(e);
    return send(res, status, { error: message });
  }
}

/* ---------------- Setup & health ---------------- */

on('GET', '/health', async () => {
  await q('select 1');
  return { ok: true, time: new Date().toISOString() };
});

on('POST', '/setup', async ({ body, query }) => {
  const key = body.key || query.key;
  if (!process.env.SETUP_KEY || key !== process.env.SETUP_KEY) throw new HttpError(403, 'Setup key is missing or wrong.');
  const client = await getPool().connect();
  try {
    if (body.reset) await client.query(DROP);
    await client.query(SCHEMA);
    return await seed(client);
  } finally {
    client.release();
  }
});

/* ---------------- Auth ---------------- */

on('POST', '/auth/login', async ({ body }) => {
  need(body, 'email', 'password');
  const u = await one('select * from users where lower(email) = lower($1) and active', [body.email]);
  if (!u || !(await checkPassword(body.password, u.password_hash))) throw new HttpError(401, 'Email or password is incorrect.');
  delete u.password_hash;
  u.demo = isDemo(u);
  return { token: signToken(u), user: u };
});

on('POST', '/auth/register', async ({ body }) => {
  need(body, 'name', 'email', 'password');
  if (body.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  const existing = await one('select id, password_hash from users where lower(email) = lower($1)', [body.email]);
  const hash = await hashPassword(body.password);
  let u;
  if (existing && existing.password_hash) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  if (existing) {
    // Customer created by an inbound email; let them claim the account.
    u = await one(`update users set name = $2, password_hash = $3 where id = $1 returning id,name,email,role,team_id,org_id`, [existing.id, body.name, hash]);
  } else {
    u = await findOrCreateCustomer({ query: q }, body.email, body.name);
    u = await one('update users set password_hash = $2 where id = $1 returning id,name,email,role,team_id,org_id', [u.id, hash]);
  }
  return { token: signToken(u), user: u };
});

on('GET', '/auth/me', async ({ req }) => ({ user: await requireUser(req) }));

/* ---------------- Lookups ---------------- */

on('GET', '/meta', async ({ req }) => {
  const u = await requireUser(req);
  const [categories, customFields] = await Promise.all([
    many('select * from categories order by name'),
    many('select * from custom_fields order by position, id'),
  ]);
  if (!isStaff(u)) return { categories, customFields };
  const [teams, agents, organizations, macros, slaPolicies] = await Promise.all([
    many('select * from teams order by name'),
    many(`select id, name, email, role, team_id, skills from users where role in ('admin','agent') and active order by name`),
    many('select * from organizations order by name'),
    many('select * from macros order by name'),
    many(`select * from sla_policies order by array_position(array['urgent','high','normal','low'], priority)`),
  ]);
  return { categories, customFields, teams, agents, organizations, macros, slaPolicies };
});

/* ---------------- Tickets ---------------- */

const TICKET_SELECT = `
  select t.*, r.name as requester_name, r.email as requester_email, a.name as assignee_name,
         tm.name as team_name, c.name as category_name, c.color as category_color, o.name as org_name
    from tickets t
    left join users r on r.id = t.requester_id
    left join users a on a.id = t.assignee_id
    left join teams tm on tm.id = t.team_id
    left join categories c on c.id = t.category_id
    left join organizations o on o.id = t.org_id`;

async function loadTicket(id, user) {
  const t = await one(`${TICKET_SELECT} where t.id = $1`, [id]);
  if (!t) throw new HttpError(404, 'Ticket not found.');
  if (!isStaff(user) && t.requester_id !== user.id) throw new HttpError(404, 'Ticket not found.');
  return t;
}

on('GET', '/tickets', async ({ req, query }) => {
  const u = await requireUser(req);
  const where = [];
  const p = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
  if (!isStaff(u)) add('t.requester_id = ?', u.id);
  const view = query.view || 'open';
  if (view === 'open') where.push(`t.status in ('new','in_progress','pending')`);
  if (view === 'mine') { where.push(`t.status in ('new','in_progress','pending')`); add('t.assignee_id = ?', u.id); }
  if (view === 'unassigned') where.push(`t.status in ('new','in_progress','pending') and t.assignee_id is null`);
  if (view === 'team' && u.team_id) { where.push(`t.status in ('new','in_progress','pending')`); add('t.team_id = ?', u.team_id); }
  if (view === 'breached') where.push(`t.status in ('new','in_progress') and (t.resolution_due < now() or (t.first_responded_at is null and t.first_response_due < now()))`);
  if (view === 'pending') where.push(`t.status = 'pending'`);
  if (view === 'solved') where.push(`t.status in ('resolved','closed')`);
  if (query.status) add('t.status = ?', query.status);
  if (query.priority) add('t.priority = ?', query.priority);
  if (query.category_id) add('t.category_id = ?', Number(query.category_id));
  if (query.team_id) add('t.team_id = ?', Number(query.team_id));
  if (query.assignee_id) add('t.assignee_id = ?', Number(query.assignee_id));
  if (query.org_id) add('t.org_id = ?', Number(query.org_id));
  if (query.channel) add('t.channel = ?', query.channel);
  if (query.tag) add('? = any(t.tags)', query.tag);
  if (query.q) {
    const s = query.q.trim();
    const idMatch = s.match(/^(?:ats-)?0*(\d+)$/i);
    if (idMatch) add('t.id = ?', Number(idMatch[1]));
    else add(`(t.subject ilike ? or t.description ilike $${p.length + 1} or r.email ilike $${p.length + 1} or r.name ilike $${p.length + 1})`, `%${s}%`);
  }
  const order = {
    due: `(t.status = 'pending'), t.resolution_due asc nulls last`,
    newest: 't.created_at desc',
    updated: 't.updated_at desc',
    priority: `array_position(array['urgent','high','normal','low'], t.priority), t.created_at`,
  }[query.sort] || (view === 'solved' ? 't.updated_at desc' : `(t.status = 'pending'), t.resolution_due asc nulls last`);
  const limit = Math.min(Number(query.limit) || 200, 500);
  const rows = await many(`${TICKET_SELECT} ${where.length ? 'where ' + where.join(' and ') : ''} order by ${order} limit ${limit}`, p);
  return { tickets: rows.map(withSla) };
});

on('GET', '/tickets/counts', async ({ req }) => {
  const u = await requireUser(req, STAFF);
  return one(
    `select
       count(*) filter (where status in ('new','in_progress','pending'))::int as open,
       count(*) filter (where status in ('new','in_progress','pending') and assignee_id = $1)::int as mine,
       count(*) filter (where status in ('new','in_progress','pending') and assignee_id is null)::int as unassigned,
       count(*) filter (where status in ('new','in_progress','pending') and team_id = $2)::int as team,
       count(*) filter (where status in ('new','in_progress') and (resolution_due < now() or (first_responded_at is null and first_response_due < now())))::int as breached,
       count(*) filter (where status = 'pending')::int as pending,
       count(*) filter (where status = 'new')::int as new
     from tickets`,
    [u.id, u.team_id]
  );
});

on('POST', '/tickets', async ({ req, body }) => {
  const u = await requireUser(req);
  need(body, 'subject');
  return tx(async (db) => {
    let requesterId = u.id;
    if (isStaff(u) && body.requester_email) {
      requesterId = (await findOrCreateCustomer(db, body.requester_email, body.requester_name)).id;
    }
    const input = {
      subject: body.subject,
      description: body.description || '',
      requester_id: requesterId,
      channel: isStaff(u) ? body.channel || 'phone' : 'web',
      category_id: body.category_id ? Number(body.category_id) : null,
      custom_fields: body.custom_fields || {},
      tags: Array.isArray(body.tags) ? body.tags : [],
    };
    if (isStaff(u)) {
      if (body.priority) input.priority = body.priority;
      if (body.assignee_id) input.assignee_id = Number(body.assignee_id);
      if (body.team_id) input.team_id = Number(body.team_id);
    }
    const t = await createTicket(db, input, u);
    if (input.description) {
      await db.query('insert into comments (ticket_id, author_id, body, channel) values ($1,$2,$3,$4)', [t.id, requesterId, input.description, t.channel]);
    }
    return { ticket: t, number: tnum(t.id) };
  });
});

on('GET', '/tickets/:id', async ({ req, params }) => {
  const u = await requireUser(req);
  const t = await loadTicket(params.id, u);
  const [comments, activity, linked, articles, others] = await Promise.all([
    many(
      `select c.*, u.name as author_name, u.role as author_role from comments c left join users u on u.id = c.author_id
        where c.ticket_id = $1 ${isStaff(u) ? '' : 'and not c.is_internal'} order by c.created_at`,
      [t.id]
    ),
    isStaff(u)
      ? many('select a.*, u.name as actor_name from activity a left join users u on u.id = a.actor_id where ticket_id = $1 order by a.created_at desc', [t.id])
      : [],
    many('select k.id, k.title from ticket_articles ta join kb_articles k on k.id = ta.article_id where ta.ticket_id = $1', [t.id]),
    isStaff(u) ? many('select id, title, body, tags from kb_articles where published') : [],
    isStaff(u)
      ? many(`select id, subject, status, created_at from tickets where requester_id = $1 and id <> $2 order by created_at desc limit 5`, [t.requester_id, t.id])
      : [],
  ]);
  const suggestions = isStaff(u) ? rankArticles(articles, `${t.subject} ${t.description} ${(t.tags || []).join(' ')}`, 4) : [];
  return { ticket: withSla(t), comments, activity, linked, suggestions, requesterTickets: others };
});

const EDITABLE = ['status', 'priority', 'category_id', 'assignee_id', 'team_id', 'tags', 'custom_fields', 'subject'];

async function applyChanges(db, ticket, body, actor) {
  const patch = {};
  const changes = [];
  for (const k of EDITABLE) {
    if (body[k] === undefined) continue;
    let v = body[k];
    if (['category_id', 'assignee_id', 'team_id'].includes(k)) v = v === '' || v === null ? null : Number(v);
    if (JSON.stringify(v) === JSON.stringify(ticket[k])) continue;
    changes.push({ field: k, from: ticket[k], to: v });
    if (k === 'status') Object.assign(patch, statusPatch(ticket, v));
    else patch[k] = v;
  }
  if (patch.priority) {
    const d = dueDates(await policyFor(db, patch.priority), ticket.created_at, patch.sla_paused_mins ?? ticket.sla_paused_mins);
    if (!ticket.first_responded_at) patch.first_response_due = d.first_response_due;
    patch.resolution_due = d.resolution_due;
  }
  const updated = await updateTicket(db, ticket.id, patch);
  for (const c of changes) {
    if (c.field === 'custom_fields' || c.field === 'tags') await logActivity(db, ticket.id, actor.id, c.field, {});
    else await logActivity(db, ticket.id, actor.id, c.field, { from: c.from, to: c.to });
  }
  return updated;
}

on('PATCH', '/tickets/:id', async ({ req, params, body }) => {
  const u = await requireUser(req);
  const t = await loadTicket(params.id, u);
  if (!isStaff(u)) {
    // Customers can only mark solved or reopen their own ticket.
    if (!['resolved', 'in_progress'].includes(body.status)) throw new HttpError(403, 'You can only resolve or reopen your request.');
    body = { status: body.status };
  }
  return tx(async (db) => ({ ticket: withSla(await applyChanges(db, t, body, u)) }));
});

on('POST', '/tickets/bulk', async ({ req, body }) => {
  const u = await requireUser(req, STAFF);
  if (!Array.isArray(body.ids) || !body.ids.length) throw new HttpError(400, 'Select at least one ticket.');
  return tx(async (db) => {
    for (const id of body.ids) {
      const t = (await db.query('select * from tickets where id = $1', [id])).rows[0];
      if (t) await applyChanges(db, t, body.changes || {}, u);
    }
    return { updated: body.ids.length };
  });
});

on('POST', '/tickets/:id/comments', async ({ req, params, body }) => {
  const u = await requireUser(req);
  need(body, 'body');
  const t = await loadTicket(params.id, u);
  const internal = isStaff(u) && !!body.is_internal;
  return tx(async (db) => {
    const c = (
      await db.query('insert into comments (ticket_id, author_id, body, is_internal, channel) values ($1,$2,$3,$4,$5) returning *', [
        t.id, u.id, body.body, internal, isStaff(u) ? 'web' : 'web',
      ])
    ).rows[0];
    const changes = { ...(body.changes || {}) };
    if (isStaff(u) && !internal) {
      if (!t.first_responded_at) await db.query('update tickets set first_responded_at = now() where id = $1', [t.id]);
      if (t.status === 'new' && !changes.status) changes.status = 'in_progress';
      if (!t.assignee_id && !changes.assignee_id) changes.assignee_id = u.id;
    }
    if (!isStaff(u) && ['pending', 'resolved'].includes(t.status)) changes.status = 'in_progress';
    const fresh = (await db.query('select * from tickets where id = $1', [t.id])).rows[0];
    const updated = isStaff(u) ? await applyChanges(db, fresh, changes, u) : await applyChanges(db, fresh, { status: changes.status }, u);
    await logActivity(db, t.id, u.id, internal ? 'internal_note' : 'reply', {});
    if (isStaff(u) && !internal) {
      await emailRequester({
        to: t.requester_email,
        subject: `[${tnum(t.id)}] ${t.subject}`,
        text: `${body.body}\n\n--\nReply to this email to respond. View your request: ${process.env.APP_URL || ''}/portal/requests/${t.id}`,
      });
    }
    return { comment: c, ticket: withSla(updated) };
  });
});

on('POST', '/tickets/:id/articles', async ({ req, params, body }) => {
  const u = await requireUser(req, STAFF);
  await loadTicket(params.id, u);
  if (body.remove) await q('delete from ticket_articles where ticket_id = $1 and article_id = $2', [params.id, body.article_id]);
  else await q('insert into ticket_articles values ($1,$2) on conflict do nothing', [params.id, body.article_id]);
  return { ok: true };
});

/* ---------------- Public portal & omnichannel intake ---------------- */

on('GET', '/public/kb', async ({ query }) => {
  const rows = await many(
    `select k.id, k.title, k.body, k.tags, k.views, c.name as category_name from kb_articles k
       left join categories c on c.id = k.category_id where k.published order by k.views desc`
  );
  if (query.q) return { articles: rankArticles(rows, query.q, 8) };
  return { articles: rows.map(({ body, ...r }) => ({ ...r, excerpt: body.slice(0, 160) })) };
});

on('GET', '/public/kb/:id', async ({ params }) => {
  const a = await one(
    `update kb_articles k set views = views + 1 where k.id = $1 and k.published
     returning k.*, (select name from categories where id = k.category_id) as category_name`,
    [params.id]
  );
  if (!a) throw new HttpError(404, 'Article not found.');
  return { article: a };
});

on('POST', '/public/kb/:id/feedback', async ({ params, body }) => {
  await q(`update kb_articles set ${body.helpful ? 'helpful = helpful + 1' : 'not_helpful = not_helpful + 1'} where id = $1`, [params.id]);
  return { ok: true };
});

on('GET', '/public/categories', async () => ({ categories: await many('select id, name from categories order by name') }));

// Web form / chat widget submissions from the portal (no account needed).
on('POST', '/public/tickets', async ({ req, body }) => {
  const signedIn = await getUser(req);
  if (!signedIn) need(body, 'email', 'name');
  need(body, 'subject');
  const channel = body.channel === 'chat' ? 'chat' : 'web';
  return tx(async (db) => {
    const requester = signedIn || (await findOrCreateCustomer(db, body.email, body.name));
    const t = await createTicket(db, {
      subject: body.subject, description: body.description || '', requester_id: requester.id, channel,
      category_id: body.category_id ? Number(body.category_id) : null, custom_fields: body.custom_fields || {},
    }, requester);
    if (body.description) await db.query('insert into comments (ticket_id, author_id, body, channel) values ($1,$2,$3,$4)', [t.id, requester.id, body.description, channel]);
    return { number: tnum(t.id), id: t.id };
  });
});

// Inbound webhooks: email (Postmark/SendGrid/any JSON), chat, social, phone (call logs).
// Replies with [ATS-00012] in the subject thread onto the existing ticket.
on('POST', '/inbound/:channel', async ({ params, body, query, req }) => {
  const key = query.key || req.headers['x-inbound-key'];
  if (!process.env.INBOUND_KEY || key !== process.env.INBOUND_KEY) throw new HttpError(403, 'Inbound key is missing or wrong.');
  const channel = params.channel;
  if (!['email', 'chat', 'social', 'phone'].includes(channel)) throw new HttpError(400, 'Channel must be email, chat, social or phone.');
  const fromRaw = body.from || body.From || body.email || body.sender || '';
  const email = (String(fromRaw).match(/[^\s<>"]+@[^\s<>"]+/) || [])[0];
  const name = body.fromName || body.FromName || body.name || String(fromRaw).split('<')[0].replace(/"/g, '').trim();
  const subject = body.subject || body.Subject || (body.text || body.message || '').slice(0, 80) || `New ${channel} conversation`;
  const text = body.text || body.TextBody || body['stripped-text'] || body.message || body.body || '';
  if (!email) throw new HttpError(400, 'A sender email is required (from, email or sender).');
  return tx(async (db) => {
    const requester = await findOrCreateCustomer(db, email, name);
    const thread = String(subject).match(/ATS-0*(\d+)/i);
    if (thread) {
      const t = (await db.query('select * from tickets where id = $1 and requester_id = $2', [Number(thread[1]), requester.id])).rows[0];
      if (t) {
        await db.query('insert into comments (ticket_id, author_id, body, channel) values ($1,$2,$3,$4)', [t.id, requester.id, text, channel]);
        if (['pending', 'resolved'].includes(t.status)) await updateTicket(db, t.id, statusPatch(t, 'in_progress'));
        else await updateTicket(db, t.id, {});
        await logActivity(db, t.id, requester.id, 'reply', { channel });
        return { threaded: true, number: tnum(t.id) };
      }
    }
    const t = await createTicket(db, { subject, description: text, requester_id: requester.id, channel }, requester);
    await db.query('insert into comments (ticket_id, author_id, body, channel) values ($1,$2,$3,$4)', [t.id, requester.id, text || subject, channel]);
    return { threaded: false, number: tnum(t.id) };
  });
});

/* ---------------- Knowledge base (staff) ---------------- */

on('GET', '/kb', async ({ req, query }) => {
  await requireUser(req, STAFF);
  const rows = await many(
    `select k.*, c.name as category_name, u.name as author_name,
            (select count(*)::int from ticket_articles ta where ta.article_id = k.id) as linked_tickets
       from kb_articles k left join categories c on c.id = k.category_id left join users u on u.id = k.author_id
      order by k.updated_at desc`
  );
  if (query.q) {
    const ranked = rankArticles(rows, query.q, 50);
    return { articles: ranked.map((r) => rows.find((x) => x.id === r.id)) };
  }
  return { articles: rows };
});

on('GET', '/kb/:id', async ({ req, params }) => {
  await requireUser(req, STAFF);
  const a = await one('select * from kb_articles where id = $1', [params.id]);
  if (!a) throw new HttpError(404, 'Article not found.');
  return { article: a };
});

on('POST', '/kb', async ({ req, body }) => {
  const u = await requireUser(req, STAFF);
  need(body, 'title', 'body');
  return {
    article: await one(
      'insert into kb_articles (title, body, category_id, tags, published, author_id) values ($1,$2,$3,$4,$5,$6) returning *',
      [body.title, body.body, body.category_id || null, body.tags || [], body.published !== false, u.id]
    ),
  };
});

on('PATCH', '/kb/:id', async ({ req, params, body }) => {
  blockDemo(await requireUser(req, STAFF));
  return {
    article: await one(
      `update kb_articles set title = coalesce($2,title), body = coalesce($3,body), category_id = $4, tags = coalesce($5,tags),
              published = coalesce($6,published), updated_at = now() where id = $1 returning *`,
      [params.id, body.title, body.body, body.category_id || null, body.tags, body.published]
    ),
  };
});

on('DELETE', '/kb/:id', async ({ req, params }) => {
  blockDemo(await requireUser(req, ['admin']));
  await q('delete from kb_articles where id = $1', [params.id]);
});

/* ---------------- Reports ---------------- */

on('GET', '/reports', async ({ req, query }) => {
  await requireUser(req, STAFF);
  const days = Math.min(Math.max(Number(query.days) || 30, 1), 365);
  const tz = /^[A-Za-z_]+\/[A-Za-z_\/+-]+$|^UTC$/.test(query.tz || '') ? query.tz : 'UTC';
  const since = `now() - interval '${days} days'`;
  const [summary, daily, byCategory, byChannel, byPriority, heat, agents, tags, backlog] = await Promise.all([
    one(`select
          count(*)::int as created,
          count(*) filter (where resolved_at is not null)::int as resolved,
          round(avg(extract(epoch from (first_responded_at - created_at)) / 60) filter (where first_responded_at is not null))::int as avg_first_response_mins,
          round((avg(extract(epoch from (resolved_at - created_at)) / 3600) filter (where resolved_at is not null))::numeric, 1)::float as avg_resolution_hours,
          round(100.0 * count(*) filter (where first_responded_at is not null and first_responded_at <= first_response_due)
                / nullif(count(*) filter (where first_responded_at is not null), 0))::int as first_response_sla,
          round(100.0 * count(*) filter (where resolved_at is not null and resolved_at <= resolution_due)
                / nullif(count(*) filter (where resolved_at is not null), 0))::int as resolution_sla
        from tickets where created_at >= ${since}`),
    many(`select to_char(d, 'YYYY-MM-DD') as day,
                 (select count(*) from tickets where (created_at at time zone $1)::date = d)::int as created,
                 (select count(*) from tickets where (resolved_at at time zone $1)::date = d)::int as resolved
            from generate_series((now() at time zone $1)::date - ${days - 1}, (now() at time zone $1)::date, interval '1 day') d
           order by d`, [tz]),
    many(`select coalesce(c.name,'Uncategorized') as name, coalesce(c.color,'#98A3A0') as color, count(*)::int as value
            from tickets t left join categories c on c.id = t.category_id where t.created_at >= ${since} group by 1,2 order by 3 desc`),
    many(`select channel as name, count(*)::int as value from tickets where created_at >= ${since} group by 1 order by 2 desc`),
    many(`select priority as name, count(*)::int as value from tickets where created_at >= ${since} group by 1`),
    many(`select extract(dow from created_at at time zone $1)::int as dow, extract(hour from created_at at time zone $1)::int as hour, count(*)::int as value
            from tickets where created_at >= ${since} group by 1,2`, [tz]),
    many(`select u.id, u.name, tm.name as team,
                 count(t.id) filter (where t.created_at >= ${since})::int as assigned,
                 count(t.id) filter (where t.resolved_at >= ${since})::int as resolved,
                 count(t.id) filter (where t.status in ('new','in_progress','pending'))::int as open,
                 round((avg(extract(epoch from (t.resolved_at - t.created_at)) / 3600) filter (where t.resolved_at >= ${since}))::numeric,1)::float as avg_resolution_hours,
                 round(avg(extract(epoch from (t.first_responded_at - t.created_at)) / 60) filter (where t.first_responded_at >= ${since}))::int as avg_first_response_mins,
                 round(100.0 * count(t.id) filter (where t.resolved_at >= ${since} and t.resolved_at <= t.resolution_due)
                       / nullif(count(t.id) filter (where t.resolved_at >= ${since}), 0))::int as sla
            from users u left join teams tm on tm.id = u.team_id left join tickets t on t.assignee_id = u.id
           where u.role in ('admin','agent') group by u.id, tm.name order by resolved desc`),
    many(`select tag as name, count(*)::int as value from tickets, unnest(tags) tag where created_at >= ${since} group by 1 order by 2 desc limit 10`),
    one(`select count(*) filter (where status in ('new','in_progress','pending'))::int as open,
                count(*) filter (where status = 'new')::int as new,
                count(*) filter (where status = 'pending')::int as pending from tickets`),
  ]);
  return { days, summary, daily, byCategory, byChannel, byPriority, heat, agents, tags, backlog };
});

/* ---------------- Admin: generic CRUD for configuration ---------------- */

const RESOURCES = {
  users: ['name', 'email', 'role', 'team_id', 'org_id', 'skills', 'active'],
  teams: ['name', 'description'],
  organizations: ['name', 'domain', 'plan'],
  categories: ['name', 'color', 'default_team_id'],
  sla_policies: ['priority', 'first_response_mins', 'resolution_mins'],
  routing_rules: ['name', 'position', 'active', 'match_keywords', 'match_category_id', 'match_channel', 'set_category_id', 'set_priority', 'set_team_id', 'add_tags', 'stop_processing'],
  macros: ['name', 'body', 'set_status', 'set_priority', 'is_internal'],
  custom_fields: ['key', 'label', 'type', 'options', 'required', 'position'],
};

function resource(name) {
  if (!RESOURCES[name]) throw new HttpError(404, `Unknown setting: ${name}`);
  return RESOURCES[name];
}

function clean(cols, body) {
  const out = {};
  for (const c of cols) if (body[c] !== undefined) out[c] = body[c] === '' ? null : body[c];
  return out;
}

on('GET', '/admin/:res', async ({ req, params }) => {
  await requireUser(req, STAFF);
  const cols = resource(params.res);
  const order = params.res === 'routing_rules' ? 'position, id' : params.res === 'custom_fields' ? 'position, id' : 'id';
  const select = params.res === 'users' ? `id, ${cols.join(', ')}, created_at` : '*';
  return { rows: await many(`select ${select} from ${params.res} order by ${order}`) };
});

on('POST', '/admin/:res', async ({ req, params, body }) => {
  blockDemo(await requireUser(req, ['admin']));
  const data = clean(resource(params.res), body);
  if (params.res === 'users') {
    need(body, 'name', 'email');
    if (body.password) data.password_hash = await hashPassword(body.password);
  }
  const keys = Object.keys(data);
  if (!keys.length) throw new HttpError(400, 'Nothing to save.');
  const row = await one(
    `insert into ${params.res} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
    keys.map((k) => data[k])
  );
  delete row.password_hash;
  return { row };
});

on('PATCH', '/admin/:res/:id', async ({ req, params, body }) => {
  blockDemo(await requireUser(req, ['admin']));
  const data = clean(resource(params.res), body);
  if (params.res === 'users' && body.password) data.password_hash = await hashPassword(body.password);
  const keys = Object.keys(data);
  if (!keys.length) throw new HttpError(400, 'Nothing to save.');
  const row = await one(
    `update ${params.res} set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1 returning *`,
    [params.id, ...keys.map((k) => data[k])]
  );
  if (row) delete row.password_hash;
  return { row };
});

on('DELETE', '/admin/:res/:id', async ({ req, params }) => {
  const u = await requireUser(req, ['admin']);
  blockDemo(u);
  resource(params.res);
  if (params.res === 'users' && Number(params.id) === u.id) throw new HttpError(400, 'You cannot delete your own account.');
  if (params.res === 'users') await q('update users set active = false where id = $1', [params.id]);
  else await q(`delete from ${params.res} where id = $1`, [params.id]);
});
