// ═══════════════════════════════════════════════════════════
//  FlowEngine — Database Setup (db/database.js)
//  Uses SQLite via better-sqlite3 (no separate DB server needed)
// ═══════════════════════════════════════════════════════════

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, '..', 'flowengine.db');
const db      = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── CREATE TABLES ──────────────────────────────────────────

db.exec(`
  -- Workflows table
  CREATE TABLE IF NOT EXISTS workflows (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    version     INTEGER DEFAULT 1,
    is_active   INTEGER DEFAULT 1,
    input_schema TEXT DEFAULT '[]',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- Steps table
  CREATE TABLE IF NOT EXISTS steps (
    id          TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    name        TEXT NOT NULL,
    step_type   TEXT NOT NULL CHECK(step_type IN ('task','approval','notification')),
    step_order  INTEGER NOT NULL DEFAULT 1,
    metadata    TEXT DEFAULT '{}',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
  );

  -- Rules table
  CREATE TABLE IF NOT EXISTS rules (
    id           TEXT PRIMARY KEY,
    step_id      TEXT NOT NULL,
    condition    TEXT NOT NULL DEFAULT 'DEFAULT',
    next_step_id TEXT,
    priority     INTEGER DEFAULT 1,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (step_id)      REFERENCES steps(id) ON DELETE CASCADE,
    FOREIGN KEY (next_step_id) REFERENCES steps(id) ON DELETE SET NULL
  );

  -- Executions table
  CREATE TABLE IF NOT EXISTS executions (
    id               TEXT PRIMARY KEY,
    workflow_id      TEXT NOT NULL,
    workflow_version INTEGER NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK(status IN ('pending','running','completed','failed','cancelled')),
    input_data       TEXT DEFAULT '{}',
    triggered_by     TEXT DEFAULT 'user',
    current_step_id  TEXT,
    retries          INTEGER DEFAULT 0,
    started_at       TEXT DEFAULT (datetime('now')),
    ended_at         TEXT,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
  );

  -- Execution logs table
  CREATE TABLE IF NOT EXISTS execution_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT NOT NULL,
    log_type     TEXT NOT NULL,
    message      TEXT NOT NULL,
    step_name    TEXT,
    step_type    TEXT,
    rule_matched TEXT,
    next_step    TEXT,
    approver     TEXT,
    duration_ms  INTEGER,
    logged_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
  );
`);

// ── SEED SAMPLE DATA ───────────────────────────────────────

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM workflows').get();
  if (count.c > 0) return; // already seeded

  console.log('🌱 Seeding sample workflows...');

  const { v4: uuidv4 } = require('uuid');

  // ── Workflow 1: Expense Approval ──────────────────────
  const wf1 = uuidv4();
  db.prepare(`INSERT INTO workflows(id,name,description,version,is_active,input_schema)
    VALUES(?,?,?,?,?,?)`).run(
    wf1,
    'Expense Approval',
    'Multi-level expense approval with finance & CEO sign-off',
    3, 1,
    JSON.stringify([
      { name: 'amount',     type: 'number', required: true,  allowed: '' },
      { name: 'country',    type: 'string', required: true,  allowed: '' },
      { name: 'priority',   type: 'string', required: true,  allowed: 'High,Medium,Low' },
      { name: 'department', type: 'string', required: false, allowed: 'Finance,HR,Engineering,Marketing' }
    ])
  );

  const s1a = uuidv4(), s1b = uuidv4(), s1c = uuidv4(), s1d = uuidv4();
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s1a, wf1, 'Manager Approval',      'approval',     1, JSON.stringify({ assignee_email: 'manager@example.com', instructions: 'Review expense request' }));
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s1b, wf1, 'Finance Notification',   'notification', 2, JSON.stringify({ notification_channel: 'email', template: 'finance_alert' }));
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s1c, wf1, 'CEO Approval',           'approval',     3, JSON.stringify({ assignee_email: 'ceo@example.com', instructions: 'Final approval' }));
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s1d, wf1, 'Task Rejection',         'task',         4, JSON.stringify({ instructions: 'Notify requester of rejection' }));

  // Rules for step 1a (Manager Approval)
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s1a, 'amount > 100 && country == "US" && priority == "High"', s1b, 1);
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s1a, 'amount <= 100',                                         s1d, 2);
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s1a, 'priority == "Low" && country != "US"',                  s1d, 3);
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s1a, 'DEFAULT',                                               s1d, 999);
  // Rules for s1b
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s1b, 'DEFAULT', s1c, 999);
  // Rules for s1c
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s1c, 'DEFAULT', null, 999);

  // ── Workflow 2: Employee Onboarding ───────────────────
  const wf2 = uuidv4();
  db.prepare(`INSERT INTO workflows(id,name,description,version,is_active,input_schema) VALUES(?,?,?,?,?,?)`).run(
    wf2, 'Employee Onboarding',
    'New hire onboarding with IT setup, HR notifications and manager approval',
    1, 1,
    JSON.stringify([
      { name: 'employee_name', type: 'string', required: true,  allowed: '' },
      { name: 'department',    type: 'string', required: true,  allowed: 'Engineering,HR,Finance,Marketing' },
      { name: 'start_date',    type: 'string', required: true,  allowed: '' },
      { name: 'role',          type: 'string', required: false, allowed: '' }
    ])
  );

  const s2a = uuidv4(), s2b = uuidv4(), s2c = uuidv4();
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s2a, wf2, 'HR Notification',   'notification', 1, JSON.stringify({ notification_channel: 'slack', template: 'new_hire_alert' }));
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s2b, wf2, 'Manager Approval',  'approval',     2, JSON.stringify({ assignee_email: 'manager@example.com' }));
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s2c, wf2, 'IT Setup Task',     'task',         3, JSON.stringify({ instructions: 'Provision laptop, accounts, and access' }));

  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s2a, 'DEFAULT', s2b, 999);
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s2b, 'DEFAULT', s2c, 999);

  // ── Workflow 3: Leave Request ─────────────────────────
  const wf3 = uuidv4();
  db.prepare(`INSERT INTO workflows(id,name,description,version,is_active,input_schema) VALUES(?,?,?,?,?,?)`).run(
    wf3, 'Leave Request',
    'Employee leave request approval workflow with HR validation',
    2, 1,
    JSON.stringify([
      { name: 'employee_id', type: 'string', required: true,  allowed: '' },
      { name: 'leave_days',  type: 'number', required: true,  allowed: '' },
      { name: 'leave_type',  type: 'string', required: true,  allowed: 'Annual,Sick,Unpaid,Emergency' },
      { name: 'urgent',      type: 'string', required: false, allowed: 'yes,no' }
    ])
  );

  const s3a = uuidv4(), s3b = uuidv4(), s3c = uuidv4();
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s3a, wf3, 'Manager Approval',    'approval',     1, JSON.stringify({ assignee_email: 'manager@example.com' }));
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s3b, wf3, 'HR Review',           'approval',     2, JSON.stringify({ assignee_email: 'hr@example.com' }));
  db.prepare(`INSERT INTO steps(id,workflow_id,name,step_type,step_order,metadata) VALUES(?,?,?,?,?,?)`).run(s3c, wf3, 'Urgent Notification', 'notification', 3, JSON.stringify({ notification_channel: 'email', template: 'urgent_leave' }));

  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s3a, 'leave_days > 10',          s3b, 1);
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s3a, 'leave_type == "Unpaid"',    s3b, 2);
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s3a, 'urgent == "yes"',           s3c, 3);
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s3a, 'DEFAULT',                   null,999);
  db.prepare(`INSERT INTO rules(id,step_id,condition,next_step_id,priority) VALUES(?,?,?,?,?)`).run(uuidv4(), s3b, 'DEFAULT',                   null,999);

  console.log('✅ Sample data seeded!');
}

module.exports = { db, seedIfEmpty };
