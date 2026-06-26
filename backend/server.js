require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const tripsRoutes = require('./routes/trips');
const reservationsRoutes = require('./routes/reservations');
const paymentsRoutes = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 5000;

function isLocalRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function isAuthorizedProgressUpdate(req) {
  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (internalApiKey) {
    return req.headers['x-internal-api-key'] === internalApiKey;
  }

  return isLocalRequest(req);
}

// Security & logging
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(morgan('dev'));

// CORS — allow Next.js frontend
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const progressSessions = new Map();

// Serve uploaded avatars as static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'TravelElite Backend', time: new Date().toISOString() });
});

app.get('/api/generate/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:3000');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ percent: 0, label: 'Starting...' })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  progressSessions.set(sessionId, { res, heartbeat });

  req.on('close', () => {
    clearInterval(heartbeat);
    progressSessions.delete(sessionId);
  });
});

app.post('/api/generate/progress/:sessionId', express.json(), (req, res) => {
  if (!isAuthorizedProgressUpdate(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { sessionId } = req.params;
  const { percent, label } = req.body;
  const session = progressSessions.get(sessionId);

  if (session) {
    session.res.write(`data: ${JSON.stringify({ percent, label })}\n\n`);
    if (percent >= 100) {
      setTimeout(() => {
        clearInterval(session.heartbeat);
        session.res.end();
        progressSessions.delete(sessionId);
      }, 500);
    }
  }

  res.json({ ok: true });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/trips', tripsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/payments', paymentsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`🚀 TravelElite Backend running on http://localhost:${PORT}`);
  console.log('   Database: Supabase/PostgreSQL via DATABASE_URL');
  console.log(`   CORS: ${process.env.CORS_ORIGIN}`);
});

module.exports = app;
