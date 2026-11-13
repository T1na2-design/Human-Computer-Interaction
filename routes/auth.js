const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { setSession, clearSession } = require('../auth');
const { ensureQuestions } = require('../lib/placeholders');

const YEARS = ['1st', '2nd', '3rd', 'Honours'];
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

router.post('/register', async (req, res) => {
  const b = req.body || {};
  const email = str(b.email, 254).toLowerCase();
  const name = str(b.name, 50);
  const password = typeof b.password === 'string' ? b.password : '';
  const avatar = /^[\w .()-]+\.png$/.test(b.avatar || '') ? b.avatar : 'profile.png';
  const mods = Array.isArray(b.modules) ? b.modules.slice(0, 12) : [];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be 8-128 characters.' });
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (!YEARS.includes(b.year)) return res.status(400).json({ error: 'Choose a valid year of study.' });
  const cleanMods = mods
    .map(m => ({ id: str(m?.id, 60), name: str(m?.name, 100) }))
    .filter(m => /^[A-Za-z0-9_]+$/.test(m.id) && m.name);
  if (!cleanMods.length) return res.status(400).json({ error: 'Choose at least one module.' });

  const hash = await bcrypt.hash(password, 11);
  try {
    const userId = db.transaction(() => {
      const r = db.prepare(`INSERT INTO users(email,name,password_hash,avatar,university_id,university,course_id,course,year)
                            VALUES(?,?,?,?,?,?,?,?,?)`)
        .run(email, name, hash, avatar, str(b.universityId, 60), str(b.university, 120), str(b.courseId, 60), str(b.course, 120), b.year);
      const upMod = db.prepare('INSERT OR IGNORE INTO modules(id,name,course_id) VALUES(?,?,?)');
      const link = db.prepare('INSERT OR IGNORE INTO user_modules(user_id,module_id) VALUES(?,?)');
      for (const m of cleanMods) {
        upMod.run(m.id, m.name, str(b.courseId, 60));
        link.run(r.lastInsertRowid, m.id);
        ensureQuestions(m.id, m.name);
      }
      return r.lastInsertRowid;
    })();
    setSession(res, userId);
    res.status(201).json({ ok: true });
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'That email is already registered.' });
    console.error(e);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

router.post('/login', async (req, res) => {
  const email = str(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const u = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  // Compare even when the user is missing so response time does not reveal which emails exist
  const ok = await bcrypt.compare(password, u?.password_hash || '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  if (!u || !ok) return res.status(401).json({ error: 'Incorrect email or password.' });
  setSession(res, u.id);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

module.exports = router;
