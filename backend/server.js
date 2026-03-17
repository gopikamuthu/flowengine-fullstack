// ═══════════════════════════════════════════════════════════
//  FlowEngine — Express Server (server.js)
// ═══════════════════════════════════════════════════════════

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { db, seedIfEmpty } = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────

app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500',
           'http://localhost:3000', 'http://127.0.0.1:3000', '*'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  const ts = new Date().toISOString().split('T')[1].replace('Z','');
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ── SERVE FRONTEND ────────────────────────────────────────
// Serve the frontend folder as static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── API ROUTES ────────────────────────────────────────────

app.use('/api/workflows',  require('./routes/workflows'));
app.use('/api/executions', require('./routes/executions'));

// Stats endpoint
app.get('/api/stats', (req, res) => {
  try {
    const stats = {
      workflows:  db.prepare('SELECT COUNT(*) as c FROM workflows').get().c,
      executions: db.prepare('SELECT COUNT(*) as c FROM executions').get().c,
      completed:  db.prepare("SELECT COUNT(*) as c FROM executions WHERE status='completed'").get().c,
      failed:     db.prepare("SELECT COUNT(*) as c FROM executions WHERE status='failed'").get().c,
      running:    db.prepare("SELECT COUNT(*) as c FROM executions WHERE status='running'").get().c,
    };
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// API root info
app.get('/api', (req, res) => {
  res.json({
    name: 'FlowEngine API',
    version: '1.0.0',
    endpoints: {
      workflows:  'GET/POST /api/workflows',
      workflow:   'GET/PUT/DELETE /api/workflows/:id',
      steps:      'POST /api/workflows/:id/steps',
      step:       'PUT/DELETE /api/steps/:id',
      rules:      'POST /api/steps/:stepId/rules',
      rule:       'PUT/DELETE /api/rules/:id',
      bulkRules:  'PUT /api/rules/bulk/:stepId',
      executions: 'GET/POST /api/executions',
      execution:  'GET /api/executions/:id',
      execLogs:   'GET /api/executions/:id/logs',
      cancel:     'POST /api/executions/:id/cancel',
      retry:      'POST /api/executions/:id/retry',
      stats:      'GET /api/stats',
      health:     'GET /api/health',
    }
  });
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ── ERROR HANDLER ─────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── START ─────────────────────────────────────────────────

seedIfEmpty();

app.listen(PORT, () => {
  console.log('');
  console.log('  ⚡ FlowEngine is running!');
  console.log('');
  console.log(`  🌐 App:    http://localhost:${PORT}`);
  console.log(`  📡 API:    http://localhost:${PORT}/api`);
  console.log(`  🗄️  DB:     flowengine.db (SQLite)`);
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('');
});

module.exports = app;
