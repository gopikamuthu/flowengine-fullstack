// ═══════════════════════════════════════════════════════════
//  FlowEngine — Executions Routes (routes/executions.js)
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db }              = require('../db/database');
const { runExecution }    = require('../middleware/executionEngine');

// Helper: get execution with its logs
function getFullExecution(id) {
  const exec = db.prepare('SELECT * FROM executions WHERE id = ?').get(id);
  if (!exec) return null;

  exec.input_data = JSON.parse(exec.input_data || '{}');
  exec.logs = db.prepare(
    'SELECT * FROM execution_logs WHERE execution_id = ? ORDER BY id ASC'
  ).all(id);

  const wf = db.prepare('SELECT id,name FROM workflows WHERE id = ?').get(exec.workflow_id);
  exec.workflow_name = wf ? wf.name : 'Unknown';
  return exec;
}

// ── POST /api/executions — Start execution ──
router.post('/', (req, res) => {
  try {
    const { workflow_id, input_data = {}, triggered_by = 'user' } = req.body;
    if (!workflow_id) return res.status(400).json({ success: false, error: 'workflow_id is required' });

    const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflow_id);
    if (!wf) return res.status(404).json({ success: false, error: 'Workflow not found' });

    // Validate required input fields
    const schema = JSON.parse(wf.input_schema || '[]');
    const missing = schema.filter(f => f.required && !input_data[f.name] && input_data[f.name] !== 0);
    if (missing.length) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.map(f => f.name).join(', ')}`
      });
    }

    const execId = uuidv4();
    db.prepare(`
      INSERT INTO executions(id, workflow_id, workflow_version, status, input_data, triggered_by)
      VALUES (?, ?, ?, 'running', ?, ?)
    `).run(execId, workflow_id, wf.version, JSON.stringify(input_data), triggered_by);

    // Run async
    runExecution(execId).catch(err => {
      console.error('Execution error:', err);
    });

    res.status(201).json({
      success: true,
      data: { id: execId, status: 'running', workflow_id, triggered_by },
      message: 'Execution started'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/executions — List executions (with filter & pagination) ──
router.get('/', (req, res) => {
  try {
    const { status, workflow_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where  = [];
    let params = [];

    if (status)      { where.push('e.status = ?');      params.push(status); }
    if (workflow_id) { where.push('e.workflow_id = ?');  params.push(workflow_id); }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const executions = db.prepare(`
      SELECT e.*, w.name as workflow_name
      FROM executions e
      LEFT JOIN workflows w ON w.id = e.workflow_id
      ${whereStr}
      ORDER BY e.started_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    for (const e of executions) {
      e.input_data = JSON.parse(e.input_data || '{}');
    }

    const total = db.prepare(`SELECT COUNT(*) as c FROM executions e ${whereStr}`).get(...params);

    res.json({ success: true, data: executions, total: total.c });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/executions/:id — Get execution details + logs ──
router.get('/:id', (req, res) => {
  try {
    const exec = getFullExecution(req.params.id);
    if (!exec) return res.status(404).json({ success: false, error: 'Execution not found' });
    res.json({ success: true, data: exec });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/executions/:id/cancel — Cancel execution ──
router.post('/:id/cancel', (req, res) => {
  try {
    const exec = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id);
    if (!exec) return res.status(404).json({ success: false, error: 'Execution not found' });
    if (exec.status !== 'running' && exec.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only running/pending executions can be cancelled' });
    }

    db.prepare(`UPDATE executions SET status='cancelled', ended_at=datetime('now') WHERE id=?`).run(req.params.id);
    db.prepare(`INSERT INTO execution_logs(execution_id,log_type,message) VALUES(?,?,?)`)
      .run(req.params.id, 'info', 'Execution cancelled by user');

    res.json({ success: true, message: 'Execution cancelled' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/executions/:id/retry — Retry failed execution ──
router.post('/:id/retry', (req, res) => {
  try {
    const exec = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id);
    if (!exec) return res.status(404).json({ success: false, error: 'Execution not found' });
    if (exec.status !== 'failed') {
      return res.status(400).json({ success: false, error: 'Only failed executions can be retried' });
    }

    db.prepare(`UPDATE executions SET status='running', ended_at=NULL, retries=retries+1 WHERE id=?`).run(req.params.id);
    db.prepare(`INSERT INTO execution_logs(execution_id,log_type,message) VALUES(?,?,?)`)
      .run(req.params.id, 'info', `Retry attempt #${exec.retries + 1}`);

    runExecution(req.params.id).catch(console.error);

    res.json({ success: true, message: 'Execution retried', data: getFullExecution(req.params.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/executions/:id/logs — Get logs only ──
router.get('/:id/logs', (req, res) => {
  try {
    const logs = db.prepare(
      'SELECT * FROM execution_logs WHERE execution_id = ? ORDER BY id ASC'
    ).all(req.params.id);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
