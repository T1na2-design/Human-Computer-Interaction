// Usage: npm run import:questions -- questions.json
// File format: [{ "moduleId":"UJ_BCS_M02", "difficulty":"easy|medium|hard|exam",
//                 "question":"...", "options":["A","B","C","D"], "correct":0, "explanation":"..." }]
require('dotenv').config();
const fs = require('fs');
const db = require('../db');
const file = process.argv[2];
if (!file) { console.error('Usage: npm run import:questions -- questions.json'); process.exit(1); }
const items = JSON.parse(fs.readFileSync(file, 'utf8'));
const ok = q => q && typeof q.moduleId === 'string' && ['easy', 'medium', 'hard', 'exam'].includes(q.difficulty) &&
  typeof q.question === 'string' && Array.isArray(q.options) && q.options.length === 4 &&
  q.options.every(o => typeof o === 'string') && Number.isInteger(q.correct) && q.correct >= 0 && q.correct <= 3;
const bad = items.map((q, i) => (ok(q) ? null : i)).filter(i => i !== null);
if (bad.length) { console.error('Invalid entries at index:', bad.join(', ')); process.exit(1); }
db.transaction(() => {
  const mods = [...new Set(items.map(q => q.moduleId))];
  for (const m of mods) db.prepare("DELETE FROM questions WHERE module_id = ? AND source = 'placeholder'").run(m);
  const ins = db.prepare('INSERT INTO questions(module_id,difficulty,question,options,correct,explanation) VALUES(?,?,?,?,?,?)');
  for (const q of items) ins.run(q.moduleId, q.difficulty, q.question, JSON.stringify(q.options), q.correct, q.explanation || '');
  console.log(`Imported ${items.length} questions for ${mods.length} module(s).`);
})();
