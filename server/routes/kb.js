import { Router } from 'express';
import { many, one, query } from '../db.js';
import { optionalAuth, requireAuth, requireStaff, isStaff, HttpError } from '../auth.js';

const r = Router();

const words = (q) =>
  String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 &&
    !['the', 'and', 'for', 'with', 'not', 'can', 'cant', 'how', 'why', 'what', 'our', 'your', 'you', 'are', 'this', 'that', 'from', 'have', 'has', 'was', 'when', 'will', 'does', 'into', 'help', 'need', 'please', 'working', 'work', 'issue', 'problem'].includes(w));

// Suggest articles for a draft request (ticket deflection) or for an agent's reply.
r.get('/suggest', optionalAuth, async (req, res) => {
  const terms = [...new Set(words(req.query.q))].slice(0, 12);
  if (!terms.length) return res.json([]);
  const score = terms.map((_, i) =>
    `(CASE WHEN a.title ILIKE $${i + 1} THEN 3 ELSE 0 END + CASE WHEN a.body ILIKE $${i + 1} THEN 1 ELSE 0 END + CASE WHEN array_to_string(a.tags, ' ') ILIKE $${i + 1} THEN 2 ELSE 0 END)`).join(' + ');
  const rows = await many(
    `SELECT * FROM (SELECT a.id, a.title, left(a.body, 180) AS excerpt, ${score} AS score FROM kb_articles a
       WHERE a.published = true) s WHERE score >= 3 ORDER BY score DESC LIMIT 4`,
    terms.map((t) => `%${t}%`));
  res.json(rows);
});

r.get('/', optionalAuth, async (req, res) => {
  const params = [];
  const where = [];
  if (!isStaff(req.user)) where.push('a.published = true');
  if (req.query.category_id) {
    params.push(Number(req.query.category_id));
    where.push(`a.category_id = $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where.push(`(a.title ILIKE $${params.length} OR a.body ILIKE $${params.length})`);
  }
  res.json(await many(
    `SELECT a.id, a.title, left(a.body, 220) AS excerpt, a.category_id, c.name AS category_name, a.tags, a.published,
            a.views, a.helpful_count, a.deflections, a.updated_at,
            (SELECT COUNT(*) FROM ticket_kb_links l WHERE l.article_id = a.id) AS linked_tickets
       FROM kb_articles a LEFT JOIN categories c ON c.id = a.category_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.views DESC, a.title`, params));
});

r.get('/:id', optionalAuth, async (req, res) => {
  const a = await one(
    `UPDATE kb_articles SET views = views + 1 WHERE id = $1 ${isStaff(req.user) ? '' : 'AND published = true'}
     RETURNING *, (SELECT name FROM categories WHERE id = kb_articles.category_id) AS category_name,
               (SELECT name FROM users WHERE id = kb_articles.author_id) AS author_name`, [req.params.id]);
  if (!a) throw new HttpError(404, 'That article is not available.');
  res.json(a);
});

r.post('/:id/helpful', async (req, res) => {
  await query('UPDATE kb_articles SET helpful_count = helpful_count + 1 WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Called when a customer says an article solved their problem instead of submitting a ticket.
r.post('/:id/deflect', async (req, res) => {
  await query('UPDATE kb_articles SET deflections = deflections + 1, helpful_count = helpful_count + 1 WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

const save = async (req, res) => {
  const { title, body, category_id, tags, published } = req.body;
  if (!title?.trim() || !body?.trim()) throw new HttpError(400, 'Articles need a title and a body.');
  const tagArr = (Array.isArray(tags) ? tags : String(tags || '').split(',')).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const vals = [title.trim(), body, category_id || null, tagArr, published !== false];
  const row = req.params.id
    ? await one(`UPDATE kb_articles SET title=$2, body=$3, category_id=$4, tags=$5, published=$6, updated_at=now()
                  WHERE id=$1 RETURNING *`, [req.params.id, ...vals])
    : await one(`INSERT INTO kb_articles (title, body, category_id, tags, published, author_id)
                  VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [...vals, req.user.id]);
  res.json(row);
};
r.post('/', requireAuth, requireStaff, save);
r.put('/:id', requireAuth, requireStaff, save);
r.delete('/:id', requireAuth, requireStaff, async (req, res) => {
  await query('DELETE FROM kb_articles WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default r;
