# ⚡ FlowEngine — Full Stack Workflow Automation

**Backend:** Node.js + Express + SQLite  
**Frontend:** Vanilla HTML/CSS/JS  
**No Docker, no cloud — runs 100% locally on your machine**

---

## 📁 Project Structure

```
flowengine-fullstack/
│
├── backend/                   ← Node.js / Express API
│   ├── server.js              ← Entry point (start here)
│   ├── package.json           ← Dependencies
│   ├── flowengine.db          ← SQLite database (auto-created)
│   ├── db/
│   │   └── database.js        ← DB schema + seed data
│   ├── middleware/
│   │   ├── ruleEngine.js      ← Condition evaluator
│   │   └── executionEngine.js ← Step runner / workflow engine
│   └── routes/
│       ├── workflows.js       ← Workflow, Step & Rule APIs
│       └── executions.js      ← Execution APIs
│
└── frontend/                  ← Web UI
    ├── index.html             ← Main app
    ├── css/
    │   └── style.css          ← Dark mode styles
    └── js/
        ├── api.js             ← HTTP client (all API calls)
        ├── ui.js              ← Rendering & navigation
        ├── modals.js          ← All modal logic
        └── actions.js         ← Delete, retry, cancel
```

---

## 🚀 Setup & Run

### Step 1 — Open in VS Code
```
File → Open Folder → select flowengine-fullstack/
```

### Step 2 — Install backend dependencies
Open the **VS Code Terminal** (Ctrl+` ) and run:
```bash
cd backend
npm install
```
This installs: `express`, `cors`, `better-sqlite3`, `uuid`, `nodemon`

### Step 3 — Start the backend server
```bash
node server.js
```
You should see:
```
  ⚡ FlowEngine is running!

  🌐 App:    http://localhost:3000
  📡 API:    http://localhost:3000/api
  🗄️  DB:     flowengine.db (SQLite)
```

### Step 4 — Open the frontend
**Option A — Via the running server (recommended)**
Open your browser at: **http://localhost:3000**

**Option B — Via Live Server extension**
- Install "Live Server" extension in VS Code
- Right-click `frontend/index.html` → **"Open with Live Server"**
- Opens at `http://127.0.0.1:5500`

> The backend already serves the frontend at port 3000 — Option A is simpler.

---

## 🔄 Development Mode (auto-restart on file changes)
```bash
cd backend
npm run dev
```
(Uses `nodemon` — restarts automatically when you edit backend files)

---

## 📡 Full REST API Reference

### Workflows
| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| GET    | `/api/workflows`                | List all (supports `?search=`)   |
| POST   | `/api/workflows`                | Create workflow                  |
| GET    | `/api/workflows/:id`            | Get workflow + steps + rules     |
| PUT    | `/api/workflows/:id`            | Update workflow (bumps version)  |
| DELETE | `/api/workflows/:id`            | Delete workflow                  |
| POST   | `/api/workflows/:id/steps`      | Add step to workflow             |

### Steps
| Method | Endpoint                        | Description                      |
|--------|---------------------------------|----------------------------------|
| PUT    | `/api/workflows/steps/:id`      | Update step                      |
| DELETE | `/api/workflows/steps/:id`      | Delete step                      |

### Rules
| Method | Endpoint                             | Description                 |
|--------|--------------------------------------|-----------------------------|
| POST   | `/api/workflows/steps/:stepId/rules` | Add rule to step            |
| PUT    | `/api/workflows/rules/:id`           | Update rule                 |
| DELETE | `/api/workflows/rules/:id`           | Delete rule                 |
| PUT    | `/api/workflows/rules/bulk/:stepId`  | Replace ALL rules for step  |

### Executions
| Method | Endpoint                          | Description                      |
|--------|-----------------------------------|----------------------------------|
| POST   | `/api/executions`                 | Start execution                  |
| GET    | `/api/executions`                 | List all (supports `?status=`)   |
| GET    | `/api/executions/:id`             | Get execution + logs             |
| GET    | `/api/executions/:id/logs`        | Get logs only                    |
| POST   | `/api/executions/:id/cancel`      | Cancel running execution         |
| POST   | `/api/executions/:id/retry`       | Retry failed execution           |

### System
| Method | Endpoint       | Description          |
|--------|----------------|----------------------|
| GET    | `/api/stats`   | Dashboard statistics |
| GET    | `/api/health`  | Health check         |

---

## 🧠 Rule Condition Syntax

```
# Comparison
amount > 100
country == "US"
priority != "Low"
leave_days <= 5

# Logic
amount > 100 && country == "US"
priority == "High" || priority == "Medium"

# String functions
contains(department, "Finance")
startsWith(employee_id, "EMP")
endsWith(email, ".com")

# Catch-all fallback (always matches last)
DEFAULT
```

---

## 💡 Example: Running Expense Approval

**Input:**
```json
{ "amount": 250, "country": "US", "priority": "High", "department": "Finance" }
```

**Execution path:**
```
Manager Approval  →  [Rule: amount > 100 && country == "US" && priority == "High"]
Finance Notification  →  [Rule: DEFAULT]
CEO Approval  →  [Rule: DEFAULT]
→ End ✓
```

---

## 🗄️ Database

SQLite file is created automatically at `backend/flowengine.db`  
To reset all data: **delete `flowengine.db`** and restart the server.  
Sample workflows are seeded automatically on first run.

**Tables:**
- `workflows` — workflow definitions
- `steps` — steps belonging to workflows
- `rules` — rules belonging to steps
- `executions` — execution records
- `execution_logs` — per-step logs for each execution

---

## 📦 Dependencies

```json
{
  "express":       "HTTP server & routing",
  "cors":          "Cross-origin resource sharing",
  "better-sqlite3":"SQLite database (no separate server)",
  "uuid":          "Generate unique IDs",
  "nodemon":       "Auto-restart in dev mode (devDependency)"
}
```
