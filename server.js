require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

require('./db');
const app = express();
app.set('trust proxy', 1);

// 1. Updated Security Policy to allow inline scripts and external CDNs
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', "https://*"],
      connectSrc: ["'self'", "https://*"],
    }
  }
}));

app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// API Routes
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { error: 'Too many attempts. Try again later.' } }), require('./routes/auth'));
app.use('/api', require('./routes/api'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// 2. Serve Static Files (This allows your index.html to load)
app.use(express.static(path.join(__dirname, 'public')));

// 3. Catch-all route to serve index.html for any non-API request
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`StudyQuest running on http://localhost:${port}`));