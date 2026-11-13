const jwt = require('jsonwebtoken');
const db = require('./db');

const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET || (PROD ? null : 'dev-only-secret-change-me');
if (!SECRET) { console.error('JWT_SECRET must be set in production.'); process.exit(1); }

const COOKIE = 'sq_token';
const DAYS = 14;

function setSession(res, userId) {
  const token = jwt.sign({ id: userId }, SECRET, { expiresIn: `${DAYS}d` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: DAYS * 864e5 });
}
function clearSession(res) { res.clearCookie(COOKIE); }

function requireAuth(req, res, next) {
  try {
    const { id } = jwt.verify(req.cookies?.[COOKIE] || '', SECRET);
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(id);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Not signed in' });
  }
}

module.exports = { setSession, clearSession, requireAuth };
