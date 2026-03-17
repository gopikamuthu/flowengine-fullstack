// ═══════════════════════════════════════════════════════════
//  FlowEngine — Execution Engine (middleware/executionEngine.js)
// ═══════════════════════════════════════════════════════════

const { db }            = require('../db/database');
const { evaluateRules } = require('./ruleEngine');

const MAX_STEPS = 20; // Prevent infinite loops

/**
 * Run a workflow execution asynchronously.
 * Walks through steps, evaluates rules, logs everything.
 */
async function runExecution(executionId) {
  const exec = db.prepare('SELECT * FROM executions WHERE id = ?').get(executionId);
  if (!exec) throw new Error('Execution not found: ' + executionId);

  const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(exec.workflow_id);
  if (!workflow) return failExecution(executionId, 'Workflow not found');

  const inputData = JSON.parse(exec.input_data || '{}');

  // Get first step
  const firstStep = db.prepare(
    'SELECT * FROM steps WHERE workflow_id = ? ORDER BY step_order ASC LIMIT 1'
  ).get(exec.workflow_id);

  if (!firstStep) return failExecution(executionId, 'Workflow has no steps');

  addLog(executionId, 'info', `Execution started by ${exec.triggered_by}`, {});

  // Update status to running
  db.prepare(`UPDATE executions SET status='running', current_step_id=? WHERE id=?`)
    .run(firstStep.id, executionId);

  // Start async step processing
  setTimeout(() => processStep(executionId, firstStep.id, inputData, 0), 300);
}

/**
 * Recursively process each step.
 */
function processStep(executionId, stepId, inputData, depth) {
  if (depth >= MAX_STEPS) {
    return failExecution(executionId, 'Max step limit reached — possible infinite loop');
  }

  const step = db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId);
  if (!step) return completeExecution(executionId);

  // Update current step
  db.prepare('UPDATE executions SET current_step_id=? WHERE id=?').run(stepId, executionId);

  // Log step start
  addLog(executionId, 'step', `Executing: ${step.name}`, {
    step_name: step.name,
    step_type: step.step_type
  });

  // Simulate processing delay
  const delay = 500 + Math.floor(Math.random() * 700);

  setTimeout(() => {
    // Get rules for this step
    const rules = db.prepare(
      'SELECT r.*, s2.name as next_step_name FROM rules r ' +
      'LEFT JOIN steps s2 ON s2.id = r.next_step_id ' +
      'WHERE r.step_id = ? ORDER BY r.priority ASC'
    ).all(stepId);

    // Evaluate rules
    const matched = evaluateRules(rules, inputData);

    if (rules.length > 0) {
      addLog(executionId, 'rule',
        matched
          ? `Rule matched: "${matched.condition}" → ${matched.next_step_name || 'End'}`
          : 'No rule matched — ending workflow',
        { rule_matched: matched?.condition, next_step: matched?.next_step_name || 'End' }
      );
    }

    // Update log with duration and approver
    db.prepare(`
      UPDATE execution_logs SET duration_ms=?, approver=?
      WHERE execution_id=? AND step_name=? AND log_type='step'
      ORDER BY id DESC LIMIT 1
    `).run(delay, step.step_type === 'approval' ? JSON.parse(step.metadata || '{}').assignee_email : null,
      executionId, step.name);

    // Continue or end
    if (matched && matched.next_step_id) {
      setTimeout(() => processStep(executionId, matched.next_step_id, inputData, depth + 1), 200);
    } else {
      completeExecution(executionId);
    }
  }, delay);
}

function completeExecution(executionId) {
  db.prepare(`UPDATE executions SET status='completed', ended_at=datetime('now') WHERE id=?`)
    .run(executionId);
  addLog(executionId, 'done', 'Workflow completed successfully', {});
  console.log(`✅ Execution ${executionId} completed`);
}

function failExecution(executionId, reason) {
  db.prepare(`UPDATE executions SET status='failed', ended_at=datetime('now') WHERE id=?`)
    .run(executionId);
  addLog(executionId, 'error', `Execution failed: ${reason}`, {});
  console.error(`❌ Execution ${executionId} failed: ${reason}`);
}

function addLog(executionId, type, message, extra = {}) {
  db.prepare(`
    INSERT INTO execution_logs(execution_id, log_type, message, step_name, step_type, rule_matched, next_step, approver)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    executionId, type, message,
    extra.step_name   || null,
    extra.step_type   || null,
    extra.rule_matched || null,
    extra.next_step   || null,
    extra.approver    || null
  );
}

module.exports = { runExecution, failExecution };
