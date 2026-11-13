const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth, clearSession } = require('../auth');

const POINTS = { easy: 10, medium: 20, hard: 30, exam: 50 };
const LIMITS = { speed: 60, boss: 180 };          // seconds
const MODES = ['daily', 'speed', 'survival', 'boss'];
const YEARS = ['1st', '2nd', '3rd', 'Honours'];
const BADGES = ['First Steps', 'Sharp Shooter', 'Week Warrior', 'Century', 'Mastermind'];
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
const level = xp => Math.floor(Math.sqrt(xp / 100)) + 1;

router.use(requireAuth);

/* ---------- profile & dashboard data ---------- */
function snapshot(uid) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  const modules = db.prepare(`SELECT m.id, m.name, um.mastery FROM user_modules um
                              JOIN modules m ON m.id = um.module_id WHERE um.user_id = ?`).all(uid);
  const earned = new Set(db.prepare('SELECT name FROM badges WHERE user_id = ?').all(uid).map(b => b.name));
  const sessions = db.prepare(`SELECT mode, score, total, xp, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS date
                               FROM quiz_runs WHERE user_id = ? AND finished = 1 ORDER BY id DESC LIMIT 50`).all(uid);
  return {
    user: { name: u.name, email: u.email, avatar: u.avatar, university: u.university, course: u.course, year: u.year,
            xp: u.xp, level: level(u.xp), streak: u.streak, lastStudyDate: u.last_study_date },
    modules,
    badges: BADGES.map(name => ({ name, earned: earned.has(name) })),
    sessions
  };
}
router.get('/me', (req, res) => res.json(snapshot(req.user.id)));

router.patch('/me', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 50) : '';
  if (!name) return res.status(400).json({ error: 'Enter a display name.' });
  if (!YEARS.includes(req.body.year)) return res.status(400).json({ error: 'Invalid year.' });
  db.prepare('UPDATE users SET name = ?, year = ? WHERE id = ?').run(name, req.body.year, req.user.id);
  res.json(snapshot(req.user.id));
});

router.post('/me/reset', (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM quiz_runs WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM badges WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE user_modules SET mastery = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare("UPDATE users SET xp = 0, streak = 0, last_study_date = NULL WHERE id = ?").run(req.user.id);
  })();
  res.json(snapshot(req.user.id));
});

router.delete('/me', (req, res) => {          // full account deletion (POPIA: right to deletion)
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  clearSession(res);
  res.json({ ok: true });
});

/* ---------- quiz engine (scoring happens here, not in the browser) ---------- */
function getRun(req, res, allowFinished = false) {
  const run = db.prepare('SELECT * FROM quiz_runs WHERE id = ? AND user_id = ?').get(+req.params.id, req.user.id);
  if (!run) { res.status(404).json({ error: 'Quiz not found.' }); return null; }
  if (run.finished && !allowFinished) { res.status(409).json({ error: 'Quiz already finished.', ended: true }); return null; }
  return run;
}

router.post('/quiz/start', (req, res) => {
  const mode = req.body?.mode;
  if (!MODES.includes(mode)) return res.status(400).json({ error: 'Invalid mode.' });
  const mods = db.prepare('SELECT module_id FROM user_modules WHERE user_id = ?').all(req.user.id).map(r => r.module_id);
  if (!mods.length) return res.status(400).json({ error: 'No modules selected.' });
  const count = mode === 'boss' ? 5 : mode === 'daily' ? 10 : 50;
  const rows = db.prepare(`SELECT id, module_id, difficulty, question, options FROM questions
                           WHERE module_id IN (${mods.map(() => '?').join(',')}) ${mode === 'boss' ? "AND difficulty = 'hard'" : ''}
                           ORDER BY RANDOM() LIMIT ?`).all(...mods, count);
  if (!rows.length) return res.status(404).json({ error: 'No questions available yet.' });
  const run = db.prepare('INSERT INTO quiz_runs(user_id, mode, question_ids, started_at) VALUES(?,?,?,?)')
    .run(req.user.id, mode, JSON.stringify(rows.map(r => r.id)), Date.now());
  res.json({
    runId: run.lastInsertRowid, mode, timeLimit: LIMITS[mode] || null,
    items: rows.map(r => ({ id: r.id, moduleId: r.module_id, difficulty: r.difficulty, question: r.question, options: JSON.parse(r.options) }))
  });
});

router.post('/quiz/:id/answer', (req, res) => {
  const run = getRun(req, res); if (!run) return;
  const qid = Number(req.body?.questionId), choice = Number(req.body?.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) return res.status(400).json({ error: 'Invalid choice.' });
  if (!JSON.parse(run.question_ids).includes(qid)) return res.status(400).json({ error: 'Question is not part of this quiz.' });
  const limit = LIMITS[run.mode];
  if (limit && Date.now() > run.started_at + (limit + 5) * 1000) return res.status(409).json({ error: 'Time is up.', ended: true });
  if (db.prepare('SELECT 1 FROM quiz_answers WHERE run_id = ? AND question_id = ?').get(run.id, qid))
    return res.status(409).json({ error: 'Already answered.' });

  const q = db.prepare('SELECT module_id, difficulty, correct, explanation FROM questions WHERE id = ?').get(qid);
  const correct = choice === q.correct ? 1 : 0;
  const points = correct ? POINTS[q.difficulty] : 0;
  db.transaction(() => {
    const seq = db.prepare('SELECT COUNT(*) AS n FROM quiz_answers WHERE run_id = ?').get(run.id).n + 1;
    db.prepare('INSERT INTO quiz_answers(run_id, question_id, correct, points, seq) VALUES(?,?,?,?,?)').run(run.id, qid, correct, points, seq);
    db.prepare(`UPDATE user_modules SET mastery = MAX(0, MIN(100, CASE WHEN ? = 1 THEN mastery + (100 - mastery) * 0.15
                ELSE mastery - mastery * 0.1 END)) WHERE user_id = ? AND module_id = ?`).run(correct, req.user.id, q.module_id);
  })();
  res.json({ correct: !!correct, correctIndex: q.correct, explanation: q.explanation, points,
             ended: run.mode === 'survival' && !correct });
});

router.post('/quiz/:id/finish', (req, res) => {
  const run = getRun(req, res); if (!run) return;
  const uid = req.user.id;
  const result = db.transaction(() => {
    const answers = db.prepare('SELECT correct, points FROM quiz_answers WHERE run_id = ? ORDER BY seq').all(run.id);
    const total = answers.length, score = answers.reduce((a, r) => a + r.correct, 0);
    let xp = answers.reduce((a, r) => a + r.points, 0);
    if (run.mode === 'daily' && total === JSON.parse(run.question_ids).length) xp += 50;
    const best = db.prepare('SELECT MAX(score) AS s FROM quiz_runs WHERE user_id = ? AND mode = ? AND finished = 1').get(uid, run.mode).s || 0;
    if (score > best) xp += 25;

    db.prepare('UPDATE quiz_runs SET finished = 1, score = ?, total = ?, xp = ? WHERE id = ?').run(score, total, xp, run.id);

    const u = db.prepare('SELECT streak, last_study_date FROM users WHERE id = ?').get(uid);
    const t = today();
    let streak = u.streak;
    if (u.last_study_date !== t) {
      const diff = u.last_study_date ? Math.round((new Date(t) - new Date(u.last_study_date)) / 864e5) : 99;
      streak = diff === 1 ? u.streak + 1 : 1;
    }
    db.prepare('UPDATE users SET xp = xp + ?, streak = ?, last_study_date = ? WHERE id = ?').run(xp, streak, t, uid);

    let run10 = 0, maxRun = 0;
    for (const a of answers) { run10 = a.correct ? run10 + 1 : 0; maxRun = Math.max(maxRun, run10); }
    const answered = db.prepare(`SELECT COUNT(*) AS n FROM quiz_answers qa JOIN quiz_runs r ON r.id = qa.run_id WHERE r.user_id = ?`).get(uid).n;
    const mastered = !!db.prepare('SELECT 1 FROM user_modules WHERE user_id = ? AND mastery >= 90').get(uid);
    const checks = [true, maxRun >= 10, streak >= 7, answered >= 100, mastered];
    const unlocked = [];
    BADGES.forEach((name, i) => {
      if (checks[i] && db.prepare('INSERT OR IGNORE INTO badges(user_id, name) VALUES(?,?)').run(uid, name).changes) unlocked.push(name);
    });
    return { score, total, xp, unlocked };
  })();
  res.json({ ...result, ...snapshot(uid) });
});

/* ---------- leaderboard ---------- */
router.get('/leaderboard', (req, res) => {
  const uid = req.user.id;
  const mine = req.query.scope === 'modules';
  const where = mine
    ? `WHERE (u.id = ? OR u.id IN (SELECT b.user_id FROM user_modules a JOIN user_modules b ON a.module_id = b.module_id WHERE a.user_id = ?))`
    : 'WHERE 1 = 1';
  const p = mine ? [uid, uid] : [];
  const rows = db.prepare(`SELECT u.id, u.name, u.avatar, u.xp FROM users u ${where} ORDER BY u.xp DESC, u.id LIMIT 10`).all(...p);
  const myXp = db.prepare('SELECT xp FROM users WHERE id = ?').get(uid).xp;
  const myRank = db.prepare(`SELECT COUNT(*) + 1 AS r FROM users u ${where} AND u.xp > ?`).get(...p, myXp).r;
  res.json({
    scope: mine ? 'modules' : 'global',
    rows: rows.map((r, i) => ({ rank: i + 1, name: r.name, avatar: r.avatar, xp: r.xp, level: level(r.xp), me: r.id === uid })),
    myRank
  });
});

/* ---------- tutor ---------- */
const tutorLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 40, keyGenerator: req => `u${req.user.id}`,
                                 validate: false, message: { error: 'Tutor limit reached. Try again later.' } });

function cleanHistory(raw) {
  const out = [];
  for (const m of (Array.isArray(raw) ? raw : []).slice(-8)) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') continue;
    if (!out.length && m.role !== 'user') continue;                    // must start with user
    if (out.length && out[out.length - 1].role === m.role) continue;   // must alternate
    out.push({ role: m.role, content: m.content.slice(0, 1000) });
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop();    // next message is the new user turn
  return out;
}

router.post('/tutor', tutorLimiter, async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1000) : '';
  if (!message) return res.status(400).json({ error: 'Type a message first.' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.json({ reply: 'The AI tutor is not switched on yet. Try writing the concept in your own words, give one example, and name one limit of it.', source: 'offline' });

  const u = db.prepare('SELECT course, year FROM users WHERE id = ?').get(req.user.id);
  const mods = db.prepare('SELECT m.name FROM user_modules um JOIN modules m ON m.id = um.module_id WHERE um.user_id = ?').all(req.user.id).map(m => m.name);
  const system = `You are StudyQuest Tutor, a friendly, encouraging tutor for a South African student studying ${u.course || 'a tertiary qualification'} (${u.year || 'year not given'}). Their modules: ${mods.join(', ') || 'none selected'}. Coach rather than just hand over answers: explain clearly, use short examples, check understanding with one question. Keep replies under 150 words and stay on study topics.`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.TUTOR_MODEL || 'claude-sonnet-5-5', max_tokens: 500, system,
                             messages: [...cleanHistory(req.body.history), { role: 'user', content: message }] })
    });
    if (!r.ok) throw new Error(`Anthropic API ${r.status}`);
    const data = await r.json();
    res.json({ reply: (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n'), source: 'ai' });
  } catch (e) {
    console.error('Tutor error:', e.message);
    res.status(502).json({ error: 'The tutor is unavailable right now.' });
  }
});

module.exports = router;
