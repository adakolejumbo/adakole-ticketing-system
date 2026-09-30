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
  const user = await one(
    `select id, name, email, role, team_id, org_id, skills from users where id = $1 and active`,
    [payload.sub]
  );
  if (user) user.demo = isDemo(user);
  return user;
}

export async function requireUser(req, roles) {
  const user = await getUser(req);
  if (!user) throw new HttpError(401, 'Your session has ended. Sign in again.');
  if (roles && !roles.includes(user.role)) throw new HttpError(403, 'Your role does not have access to this.');
  return user;
}

export const STAFF = ['admin', 'agent'];

// Seeded accounts whose passwords are public. They can work tickets but cannot change
// settings, people, passwords or knowledge base articles. Set DEMO_READONLY=false to lift this.
const DEMO_EMAILS = new Set([
  'admin@ats.local', 'priya@ats.local', 'marcus@ats.local', 'elena@ats.local', 'tom@ats.local', 'sara@ats.local', 'dev@ats.local',
  'anna@fvdental.ca', 'jake@summitlogistics.ca', 'linda@harbourlegal.ca', 'omar@summitlogistics.ca',
]);
export const isDemo = (u) => process.env.DEMO_READONLY !== 'false' && !!u && DEMO_EMAILS.has(String(u.email).toLowerCase());
export function blockDemo(u) {
  if (isDemo(u)) throw new HttpError(403, 'Demo accounts are read-only here. You can still create and work tickets.');
}
export const isStaff = (u) => u && STAFF.includes(u.role);
