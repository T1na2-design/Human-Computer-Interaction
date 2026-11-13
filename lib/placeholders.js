// Temporary template questions so a brand-new module is playable.
// Replace them with real content: `npm run import:questions questions.json`
const db = require('../db');

const T = ['What is the key idea behind', 'Which example best demonstrates', 'What is a common mistake students make with'];
const DIFF = ['easy', 'medium', 'hard'];

function ensureQuestions(moduleId, name) {
  if (db.prepare('SELECT 1 FROM questions WHERE module_id = ?').get(moduleId)) return;
  const ins = db.prepare(`INSERT INTO questions(module_id,difficulty,question,options,correct,explanation,source)
                          VALUES(?,?,?,?,?,?,'placeholder')`);
  const expl = 'Placeholder question. Real content for this module has not been added yet.';
  DIFF.forEach((d, i) => ins.run(moduleId, d, `${T[i]} ${name}?`,
    JSON.stringify(['The foundational approach', 'A related but incomplete idea', 'The most accurate answer', 'An unrelated approach']), 2, expl));
  for (let i = 0; i < 2; i++) ins.run(moduleId, 'exam', `Exam challenge: choose the strongest ${name} statement.`,
    JSON.stringify(['It never changes', 'It depends on context', 'It is only theoretical', 'It replaces every other idea']), 1, expl);
}
module.exports = { ensureQuestions };
