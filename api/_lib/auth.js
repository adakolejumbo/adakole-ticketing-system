import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { one } from './db.js';
import { HttpError } from './http.js';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new HttpError(500, 'JWT_SECRET is not set. Add it to your environment variables.');
  return s;
}

export const hashPassword = (p) => bcrypt.hash(p, 10);
export const checkPassword = (p, h) => bcrypt.compare(p, h || '');
export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: '7d' });

export async function getUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const s = secret();
  let payload;
  try {
    payload = jwt.verify(token, s);
  } catch {
    return null;
  }
  return one(
    `select id, name, email, role, team_id, org_id, skills from users where id = $1 and active`,
    [payload.sub]
  );
}

export async function requireUser(req, roles) {
  const user = await getUser(req);
  if (!user) throw new HttpError(401, 'Your session has ended. Sign in again.');
  if (roles && !roles.includes(user.role)) throw new HttpError(403, 'Your role does not have access to this.');
  return user;
}

export const STAFF = ['admin', 'agent'];
export const isStaff = (u) => u && STAFF.includes(u.role);
