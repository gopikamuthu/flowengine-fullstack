// ═══════════════════════════════════════════════════════════
//  FlowEngine — Workflows Routes (routes/workflows.js)
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db }  = require('../db/database');

// Helper: get full workflow with steps + rules
function getFullWorkflow(id) {
  const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  if (!wf) return null;

  const steps = db.prepare(
    'SELECT * FROM steps WHERE workflow_id = ? ORDER BY step_order ASC'
  ).all(id);

  for (const step of steps) {
    step.metadata = JSON.parse(step.metadata || '{}');
    step.rules = db.prepare(
      'SELECT r.*, s2.name as next_step_name FROM rules r ' +
      'LEFT JOIN steps s2 ON s2.id = r.next_step_id ' +
      'WHERE r.step_id = ? ORDER BY r.priority ASC'
    ).all(step.id);
  }

  wf.input_schema = JSON.parse(wf.input_schema || '[]');
  wf.steps = steps;
  return wf;
}

// ── GET /api/workflows — List all (with search & pagination) ──
router.get('/', (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = 'SELECT * FROM workflows';
    let params = [];

    if (search) {
      query += ' WHERE name LIKE ? OR description LIKE ?';
      params = [`%${search}%`, `%${search}%`];
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const workflows = db.prepare(query).all(...params);

    // Attach step count & parse schema
    for (const wf of workflows) {
      const sc = db.prepare('SELECT COUNT(*) as c FROM steps WHERE workflow_id = ?').get(wf.id);
      wf.step_count  = sc.c;
      wf.input_schema = JSON.parse(wf.input_schema || '[]');
    }

    const total = db.prepare(
      search ? 'SELECT COUNT(*) as c FROM workflows WHERE name LIKE ? OR description LIKE ?' : 'SELECT COUNT(*) as c FROM workflows'
    ).get(...(search ? [`%${search}%`, `%${search}%`] : []));

    res.json({ success: true, data: workflows, total: total.c, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/workflows/:id — Get single workflow with steps+rules ──
router.get('/:id', (req, res) => {
  try {
    const wf = getFullWorkflow(req.params.id);
    if (!wf) return res.status(404).json({ success: false, error: 'Workflow not found' });
    res.json({ success: true, data: wf });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/workflows — Create workflow ──
router.post('/', (req, res) => {
  try {
    const { name, description = '', input_schema = [], steps = [] } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
    if (!steps.length) return res.status(400).json({ success: false, error: 'At least one step is required' });

    const id = uuidv4();

    db.prepare(`INSERT INTO workflows(id,name,description,version,is_active,input_schema)
      VALUES(?,?,?,1,1,?)`).run(id, name.trim(), description.trim(), JSON.stringify(input_schema));

    // Insert steps
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const sid = s.id || uuidv4();
      db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata)
        VALUES(?,?,?,?,?,?)`).run(sid, id, s.name, s.type || s.step_type || 'task', i + 1, JSON.stringify(s.metadata || {}));
    }

    const wf = getFullWorkflow(id);
    res.status(201).json({ success: true, data: wf });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/workflows/:id — Update workflow (bumps version) ──
router.put('/:id', (req, res) => {
  try {
    const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(req.params.id);
    if (!wf) return res.status(404).json({ success: false, error: 'Workflow not found' });

    const { name, description, is_active, input_schema } = req.body;
    const newName   = (name !== undefined)        ? name.trim()          : wf.name;
    const newDesc   = (description !== undefined) ? description.trim()   : wf.description;
    const newActive = (is_active !== undefined)   ? (is_active ? 1 : 0)  : wf.is_active;
    const newSchema = (input_schema !== undefined) ? JSON.stringify(input_schema) : wf.input_schema;

    db.prepare(`UPDATE workflows SET name=?,description=?,is_active=?,input_schema=?,
      version=version+1, updated_at=datetime('now') WHERE id=?`)
      .run(newName, newDesc, newActive, newSchema, req.params.id);

    res.json({ success: true, data: getFullWorkflow(req.params.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/workflows/:id — Delete workflow ──
router.delete('/:id', (req, res) => {
  try {
    const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(req.params.id);
    if (!wf) return res.status(404).json({ success: false, error: 'Workflow not found' });
    db.prepare('DELETE FROM workflows WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: `Workflow "${wf.name}" deleted` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/workflows/:id/steps — Add step to workflow ──
router.post('/:id/steps', (req, res) => {
  try {
    const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(req.params.id);
    if (!wf) return res.status(404).json({ success: false, error: 'Workflow not found' });

    const { name, step_type, metadata = {} } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Step name is required' });

    const maxOrder = db.prepare('SELECT MAX(step_order) as m FROM steps WHERE workflow_id = ?').get(req.params.id);
    const order    = (maxOrder.m || 0) + 1;
    const sid      = uuidv4();

    db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`)
      .run(sid, req.params.id, name, step_type || 'task', order, JSON.stringify(metadata));

    const step = db.prepare('SELECT * FROM steps WHERE id = ?').get(sid);
    step.metadata = JSON.parse(step.metadata);
    step.rules    = [];
    res.status(201).json({ success: true, data: step });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/steps/:id — Update step ──
router.put('/steps/:id', (req, res) => {
  try {
    const step = db.prepare('SELECT * FROM steps WHERE id = ?').get(req.params.id);
    if (!step) return res.status(404).json({ success: false, error: 'Step not found' });

    const { name, step_type, step_order, metadata } = req.body;
    db.prepare(`UPDATE steps SET name=?,step_type=?,step_order=?,metadata=?,updated_at=datetime('now') WHERE id=?`)
      .run(
        name       || step.name,
        step_type  || step.step_type,
        step_order || step.step_order,
        JSON.stringify(metadata || JSON.parse(step.metadata)),
        req.params.id
      );
    const updated = db.prepare('SELECT * FROM steps WHERE id = ?').get(req.params.id);
    updated.metadata = JSON.parse(updated.metadata);
    updated.rules = db.prepare('SELECT * FROM rules WHERE step_id = ? ORDER BY priority ASC').all(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/steps/:id — Delete step ──
router.delete('/steps/:id', (req, res) => {
  try {
    const step = db.prepare('SELECT * FROM steps WHERE id = ?').get(req.params.id);
    if (!step) return res.status(404).json({ success: false, error: 'Step not found' });
    db.prepare('DELETE FROM steps WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Step deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/steps/:id/rules — Add rule to step ──
router.post('/steps/:stepId/rules', (req, res) => {
  try {
    const step = db.prepare('SELECT * FROM steps WHERE id = ?').get(req.params.stepId);
    if (!step) return res.status(404).json({ success: false, error: 'Step not found' });

    const { condition, next_step_id = null, priority = 1 } = req.body;
    if (!condition) return res.status(400).json({ success: false, error: 'Condition is required' });

    const rid = uuidv4();
    db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`)
      .run(rid, req.params.stepId, condition, next_step_id, priority);

    const rule = db.prepare('SELECT * FROM rules WHERE id = ?').get(rid);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/rules/:id — Update rule ──
router.put('/rules/:id', (req, res) => {
  try {
    const rule = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id);
    if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });

    const { condition, next_step_id, priority } = req.body;
    db.prepare(`UPDATE rules SET condition=?,next_step_id=?,priority=?,updated_at=datetime('now') WHERE id=?`)
      .run(
        condition    !== undefined ? condition    : rule.condition,
        next_step_id !== undefined ? next_step_id : rule.next_step_id,
        priority     !== undefined ? priority     : rule.priority,
        req.params.id
      );
    res.json({ success: true, data: db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/rules/:id — Delete rule ──
router.delete('/rules/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM rules WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/rules/bulk/:stepId — Replace all rules for a step ──
router.put('/rules/bulk/:stepId', (req, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) return res.status(400).json({ success: false, error: 'rules must be an array' });

    db.prepare('DELETE FROM rules WHERE step_id = ?').run(req.params.stepId);

    for (const r of rules) {
      db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`)
        .run(r.id || uuidv4(), req.params.stepId, r.condition, r.next_step_id || null, r.priority || 1);
    }

    const updated = db.prepare('SELECT * FROM rules WHERE step_id = ? ORDER BY priority ASC').all(req.params.stepId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
