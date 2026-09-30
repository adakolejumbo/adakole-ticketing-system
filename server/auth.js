import jwt from 'jsonwebtoken';
import { one } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });

export const isStaff = (user) => user && (user.role === 'agent' || user.role === 'admin');

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function loadUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SECRET);
    return await one(
      'SELECT id, name, email, role, organization_id, active FROM users WHERE id = $1 AND active = true',
      [payload.id],
    );
  } catch {
    return null;
  }
}

export const optionalAuth = async (req, _res, next) => {
  req.user = await loadUser(req);
  next();
};

export const requireAuth = async (req, res, next) => {
  req.user = await loadUser(req);
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role))
    return res.status(403).json({ error: 'You do not have permission to do that.' });
  next();
};

export const requireStaff = requireRole('agent', 'admin');
export const requireAdmin = requireRole('admin');
