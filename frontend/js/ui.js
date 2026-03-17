// ═══════════════════════════════════════════════════════════
//  FlowEngine — UI (js/ui.js)
// ═══════════════════════════════════════════════════════════

const UI = {

  currentPage: 'workflows',
  _execPollInterval: null,

  // ── NAVIGATION ──────────────────────────────────────────

  async navigate(page) {
    this.currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.getElementById('nav-' + page).classList.add('active');

    const titles = {
      workflows:  ['Workflows',         'Design and manage your automation workflows'],
      execute:    ['Execute',           'Run a workflow with live input data'],
      executions: ['Execution History', 'Monitor all workflow executions in real time'],
      audit:      ['Audit Log',         'Compliance records for every execution'],
    };
    const [t, s] = titles[page] || [page, ''];
    document.getElementById('topbar-title').textContent = t;
    document.getElementById('topbar-sub').textContent   = s;
    this.closeSidebar();

    if (page === 'workflows')  await this.renderWorkflows();
    if (page === 'execute')    await this.renderExecCards();
    if (page === 'executions') await this.renderExecutions();
    if (page === 'audit')      await this.renderAudit();

    await this.updateStats();
    this.updateBadges();
  },

  toggleSidebar() {
    const sb   = document.getElementById('sidebar');
    const ov   = document.getElementById('mobile-overlay');
    const open = sb.classList.toggle('open');
    ov.style.display = open ? 'block' : 'none';
  },

  closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('mobile-overlay').style.display = 'none';
  },

  // ── STATS & BADGES ──────────────────────────────────────

  async updateStats() {
    try {
      const { data: s } = await API.getStats();
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('stat-wf',   s.workflows);
      set('stat-ex',   s.executions);
      set('stat-ok',   s.completed);
      set('stat-fail', s.failed);
    } catch {}
  },

  async updateBadges() {
    try {
      const { data: s } = await API.getStats();
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('badge-wf', s.workflows);
      set('badge-ex', s.executions);
    } catch {}
  },

  // ── WORKFLOWS PAGE ───────────────────────────────────────

  async renderWorkflows(query = '') {
    const tbody = document.getElementById('wf-tbody');
    tbody.innerHTML = this.loadingRow(6);
    try {
      const { data } = await API.getWorkflows(query);
      if (!data.length) {
        tbody.innerHTML = this.emptyRow(6, '🔍', 'No workflows found', 'Create your first workflow using the button above.');
        return;
      }
      tbody.innerHTML = data.map(w => `
        <tr>
          <td><span class="id-pill">${this.esc(w.id.substring(0,8))}…</span></td>
          <td>
            <div class="wf-name-cell">${this.esc(w.name)}</div>
            <div class="wf-desc-cell">${this.esc((w.description||'').substring(0,60))}${(w.description||'').length>60?'…':''}</div>
          </td>
          <td><span class="step-count">${w.step_count || 0}</span></td>
          <td>v${w.version}</td>
          <td><span class="badge badge-${w.is_active ? 'active' : 'inactive'}">${w.is_active ? 'Active' : 'Inactive'}</span></td>
          <td>
            <div class="act-row">
              <button class="btn btn-outline btn-xs" onclick="Modals.viewWorkflow('${w.id}')">Edit</button>
              <button class="btn btn-blue btn-xs"    onclick="Modals.openExec('${w.id}')">▶ Run</button>
              <button class="btn btn-danger btn-xs"  onclick="Actions.deleteWorkflow('${w.id}','${this.esc(w.name)}')">Delete</button>
            </div>
          </td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = this.errorRow(6, err.message);
    }
  },

  // ── EXECUTE PAGE ─────────────────────────────────────────

  async renderExecCards() {
    const grid = document.getElementById('exec-cards-grid');
    grid.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px">Loading…</div>';
    try {
      const { data } = await API.getWorkflows();
      if (!data.length) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚡</div>
          <div class="empty-title">No workflows yet</div>
          <div class="empty-sub">Create a workflow first.</div></div>`;
        return;
      }
      grid.innerHTML = data.map(w => {
        const schema = w.input_schema || [];
        return `
        <div class="exec-card">
          <div class="exec-card-icon">⚡</div>
          <div class="exec-card-name">${this.esc(w.name)}</div>
          <div class="exec-card-meta">v${w.version} · ${w.step_count||0} steps · ${this.badge(w.is_active?'active':'inactive')}</div>
          <div class="exec-card-desc">${this.esc(w.description||'')}</div>
          <div class="schema-pills">
            ${schema.map(f=>`<span class="schema-pill${f.required?' required':''}">${this.esc(f.name)}</span>`).join('')}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline btn-sm" style="flex:1" onclick="Modals.viewWorkflow('${w.id}')">View Steps</button>
            <button class="btn btn-grad btn-sm"    style="flex:1" onclick="Modals.openExec('${w.id}')">▶ Execute</button>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-title">Error</div><div class="empty-sub">${err.message}</div></div>`;
    }
  },

  // ── EXECUTIONS PAGE ──────────────────────────────────────

  async renderExecutions(statusFilter = '') {
    const tbody = document.getElementById('ex-tbody');
    tbody.innerHTML = this.loadingRow(7);
    try {
      const { data } = await API.getExecutions(statusFilter);
      if (!data.length) {
        tbody.innerHTML = this.emptyRow(7, '🕐', 'No executions yet', 'Run a workflow to see execution history.');
        return;
      }
      tbody.innerHTML = data.map(e => `
        <tr>
          <td><span class="id-pill">${this.esc(e.id.substring(0,8))}…</span></td>
          <td><span class="wf-name-cell">${this.esc(e.workflow_name || 'Unknown')}</span></td>
          <td>v${e.workflow_version}</td>
          <td>${this.badge(e.status)}</td>
          <td>${this.esc(e.triggered_by)}</td>
          <td style="font-size:11px;color:var(--text2)">${this.fmtTime(e.started_at)}</td>
          <td>
            <div class="act-row">
              <button class="btn btn-outline btn-xs" onclick="Modals.viewExecution('${e.id}')">View</button>
              ${e.status==='failed'?`<button class="btn btn-success btn-xs" onclick="Actions.retryExecution('${e.id}')">Retry</button>`:''}
              ${e.status==='running'?`<button class="btn btn-danger btn-xs" onclick="Actions.cancelExecution('${e.id}')">Cancel</button>`:''}
            </div>
          </td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = this.errorRow(7, err.message);
    }
  },

  // ── AUDIT PAGE ───────────────────────────────────────────

  async renderAudit() {
    const tbody = document.getElementById('audit-tbody');
    tbody.innerHTML = this.loadingRow(7);
    try {
      const { data } = await API.getExecutions();
      if (!data.length) {
        tbody.innerHTML = this.emptyRow(7, '📋', 'No audit records', 'Records appear after executions run.');
        return;
      }
      tbody.innerHTML = data.map(e => `
        <tr>
          <td><span class="id-pill">${this.esc(e.id.substring(0,8))}…</span></td>
          <td>${this.esc(e.workflow_name || 'Unknown')}</td>
          <td>v${e.workflow_version}</td>
          <td>${this.badge(e.status)}</td>
          <td>${this.esc(e.triggered_by)}</td>
          <td style="font-size:11px;color:var(--text2)">${this.fmtTime(e.started_at)}</td>
          <td style="font-size:11px;color:var(--text2)">${e.ended_at ? this.fmtTime(e.ended_at) : '—'}</td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = this.errorRow(7, err.message);
    }
  },

  // ── AUTO-REFRESH running executions ─────────────────────

  startPolling() {
    if (this._execPollInterval) clearInterval(this._execPollInterval);
    this._execPollInterval = setInterval(async () => {
      if (this.currentPage === 'executions') await this.renderExecutions();
      if (this.currentPage === 'audit')      await this.renderAudit();
      await this.updateStats();
    }, 2500);
  },

  // ── HELPERS ──────────────────────────────────────────────

  badge(type) {
    return `<span class="badge badge-${type}">${type}</span>`;
  },

  esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  fmtTime(iso) {
    if (!iso) return '—';
    const d    = new Date(iso);
    const time = d.toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const date = d.toLocaleDateString('en', { month:'short', day:'numeric' });
    return `${time} · ${date}`;
  },

  loadingRow(cols) {
    return `<tr><td colspan="${cols}" style="text-align:center;color:var(--text3);padding:28px;font-size:12px">
      <span style="animation:blink 1s infinite;display:inline-block">Loading…</span></td></tr>`;
  },

  emptyRow(cols, icon, title, sub) {
    return `<tr><td colspan="${cols}"><div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${title}</div>
      <div class="empty-sub">${sub}</div>
    </div></td></tr>`;
  },

  errorRow(cols, msg) {
    return `<tr><td colspan="${cols}"><div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">Error</div>
      <div class="empty-sub">${this.esc(msg)}<br><br>
        <small>Make sure the backend server is running:<br>
        <code style="color:var(--blue)">cd backend && node server.js</code></small>
      </div>
    </div></td></tr>`;
  },

  openModal(id)  { document.getElementById(id).classList.add('show'); },
  closeModal(id) { document.getElementById(id).classList.remove('show'); },

  toast(message, type = 'info') {
    const c  = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${{success:'✓',error:'✕',info:'ℹ'}[type]||'ℹ'}</span> ${this.esc(message)}`;
    c.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s,transform .3s';
      el.style.opacity    = '0';
      el.style.transform  = 'translateX(10px)';
      setTimeout(() => el.remove(), 330);
    }, 3200);
  },
};
