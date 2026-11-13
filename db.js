const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'studyquest.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  university_id TEXT, university TEXT,
  course_id TEXT, course TEXT,
  year TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_study_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS modules(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, course_id TEXT
);
CREATE TABLE IF NOT EXISTS user_modules(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id),
  mastery REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, module_id)
);
CREATE TABLE IF NOT EXISTS questions(
  id INTEGER PRIMARY KEY,
  module_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard','exam')),
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK(correct BETWEEN 0 AND 3),
  explanation TEXT,
  source TEXT NOT NULL DEFAULT 'bank'
);
CREATE INDEX IF NOT EXISTS idx_questions_module ON questions(module_id);
CREATE TABLE IF NOT EXISTS quiz_runs(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_runs_user ON quiz_runs(user_id);
CREATE TABLE IF NOT EXISTS quiz_answers(
  run_id INTEGER NOT NULL REFERENCES quiz_runs(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  points INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY(run_id, question_id)
);
CREATE TABLE IF NOT EXISTS badges(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, name)
);
`);

module.exports = db;
