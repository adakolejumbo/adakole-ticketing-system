import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, query } from '../db.js';
import { signToken, requireAuth } from '../auth.js';

const r = Router();

r.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await one('SELECT * FROM users WHERE email = $1 AND active = true', [email]);
  if (!user || !user.password_hash || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash)))
    return res.status(401).json({ error: 'That email and password do not match an account.' });
  const { password_hash, ...safe } = user;
  res.json({ token: signToken(user), user: safe });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

r.post('/password', requireAuth, async (req, res) => {
  const { current, next } = req.body;
  if (!next || String(next).length < 8) return res.status(400).json({ error: 'Use at least 8 characters.' });
  const user = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (user.password_hash && !(await bcrypt.compare(String(current || ''), user.password_hash)))
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(String(next), 10), req.user.id]);
  res.json({ ok: true });
});

export default r;
