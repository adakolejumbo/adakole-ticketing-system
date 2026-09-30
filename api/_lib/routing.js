// Routing engine. Order of operations:
// 1. Rules (ordered by position) match on keywords, category and channel,
//    and can set category, priority, team and tags.
// 2. If no rule matched and ANTHROPIC_API_KEY is set, AI triage suggests
//    category, priority and tags.
// 3. Team falls back to the category's default team.
// 4. An agent in that team is picked: best skill match first, then lowest
//    open workload.

import { aiTriage } from './ai.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const wordMatch = (text, kw) => new RegExp(`(^|[^a-z0-9])${esc(kw.toLowerCase())}($|[^a-z0-9])`).test(text);

export async function routeTicket(db, input) {
  const t = { ...input, tags: [...(input.tags || [])] };
  const text = `${t.subject} ${t.description || ''}`.toLowerCase();
  const applied = [];
  let ai = null;

  const rules = (await db.query('select * from routing_rules where active order by position, id')).rows;
  for (const r of rules) {
    const kw = (r.match_keywords || []).filter(Boolean);
    if (!kw.length && !r.match_category_id && !r.match_channel) continue;
    const kwOk = !kw.length || kw.some((k) => wordMatch(text, k));
    const catOk = !r.match_category_id || r.match_category_id === t.category_id;
    const chOk = !r.match_channel || r.match_channel === t.channel;
    if (!(kwOk && catOk && chOk)) continue;
    if (r.set_category_id && !t.category_id) t.category_id = r.set_category_id;
    if (r.set_priority) t.priority = r.set_priority;
    if (r.set_team_id && !t.team_id) t.team_id = r.set_team_id;
    if (r.add_tags?.length) t.tags = [...new Set([...t.tags, ...r.add_tags])];
    applied.push(r.name);
    if (r.stop_processing) break;
  }

  const categories = (await db.query('select id, name, default_team_id from categories')).rows;

  if (!applied.length && process.env.ANTHROPIC_API_KEY && !input.skipAi) {
    ai = await aiTriage(t, categories);
    if (ai) {
      const cat = categories.find((c) => c.name.toLowerCase() === String(ai.category || '').toLowerCase());
      if (cat && !t.category_id) t.category_id = cat.id;
      if (ai.priority && !input.priorityLocked) t.priority = ai.priority;
      if (Array.isArray(ai.tags)) t.tags = [...new Set([...t.tags, ...ai.tags.map((x) => String(x).toLowerCase())])];
    }
  }

  const category = categories.find((c) => c.id === t.category_id);
  if (!t.team_id && category?.default_team_id) t.team_id = category.default_team_id;

  let agentReason = null;
  if (!t.assignee_id && t.team_id) {
    const agents = (
      await db.query(
        `select u.id, u.name, u.skills,
                count(tk.id) filter (where tk.status in ('new','in_progress','pending'))::int as load
           from users u
           left join tickets tk on tk.assignee_id = u.id
          where u.role in ('agent','admin') and u.active and u.team_id = $1
          group by u.id`,
        [t.team_id]
      )
    ).rows;
    if (agents.length) {
      const wanted = new Set([...(t.tags || []), category?.name].filter(Boolean).map((s) => s.toLowerCase()));
      const scored = agents
        .map((a) => ({ ...a, skill: (a.skills || []).filter((s) => wanted.has(s.toLowerCase())).length }))
        .sort((a, b) => b.skill - a.skill || a.load - b.load);
      t.assignee_id = scored[0].id;
      agentReason = `${scored[0].name}: ${scored[0].skill ? `${scored[0].skill} matching skill(s), ` : ''}${scored[0].load} open ticket(s)`;
    }
  }

  return { ...t, routing: { rules: applied, ai: ai ? { category: ai.category, priority: ai.priority } : null, agent: agentReason } };
}
