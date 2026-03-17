// ═══════════════════════════════════════════════════════════
//  FlowEngine — Modals (js/modals.js)
//  All modals call the real backend API
// ═══════════════════════════════════════════════════════════

const Modals = {

  _createSchema: [],
  _createSteps:  [],
  _editWF:       null,
  _execWF:       null,
  _rulesWF:      null,
  _rulesStep:    null,
  _editRules:    [],

  // ═══════════════════════════════════════════════════════
  //  CREATE WORKFLOW
  // ═══════════════════════════════════════════════════════

  openCreate() {
    this._createSchema = [];
    this._createSteps  = [];
    document.getElementById('c-name').value = '';
    document.getElementById('c-desc').value = '';
    this._renderCSchema();
    this._renderCSteps();
    UI.openModal('m-create');
  },

  addSchemaField() {
    this._createSchema.push({ name:'', type:'string', required:false, allowed:'' });
    this._renderCSchema();
  },

  _renderCSchema() {
    document.getElementById('c-schema').innerHTML = this._createSchema.map((f,i) => `
      <div class="schema-field">
        <input class="fi" placeholder="field name" value="${UI.esc(f.name)}"
          oninput="Modals._createSchema[${i}].name=this.value" style="padding:5px 8px;font-size:11px"/>
        <select class="fsel" onchange="Modals._createSchema[${i}].type=this.value" style="padding:5px 8px;font-size:11px">
          <option value="string"  ${f.type==='string' ?'selected':''}>string</option>
          <option value="number"  ${f.type==='number' ?'selected':''}>number</option>
          <option value="boolean" ${f.type==='boolean'?'selected':''}>boolean</option>
        </select>
        <input class="fi" placeholder="a,b,c allowed" value="${UI.esc(f.allowed)}"
          oninput="Modals._createSchema[${i}].allowed=this.value" style="padding:5px 8px;font-size:11px"/>
        <label class="schema-label">
          <input type="checkbox" ${f.required?'checked':''} onchange="Modals._createSchema[${i}].required=this.checked"/> Req
        </label>
        <button class="btn btn-ghost btn-xs" onclick="Modals._createSchema.splice(${i},1);Modals._renderCSchema()">✕</button>
      </div>`).join('')
      || '<div style="font-size:11px;color:var(--text3)">No fields yet.</div>';
  },

  addStepRow() {
    this._createSteps.push({ name:'', type:'task' });
    this._renderCSteps();
  },

  _renderCSteps() {
    document.getElementById('c-steps').innerHTML = this._createSteps.map((s,i) => `
      <div style="display:grid;grid-template-columns:auto 1fr 130px auto;gap:6px;align-items:center;
        background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px">
        <div class="step-num" style="width:22px;height:22px;font-size:10px">${i+1}</div>
        <input class="fi" placeholder="Step name…" value="${UI.esc(s.name)}"
          oninput="Modals._createSteps[${i}].name=this.value" style="padding:5px 8px;font-size:11px"/>
        <select class="fsel" onchange="Modals._createSteps[${i}].type=this.value" style="padding:5px 8px;font-size:11px">
          <option value="task"         ${s.type==='task'        ?'selected':''}>task</option>
          <option value="approval"     ${s.type==='approval'    ?'selected':''}>approval</option>
          <option value="notification" ${s.type==='notification'?'selected':''}>notification</option>
        </select>
        <button class="btn btn-ghost btn-xs" onclick="Modals._createSteps.splice(${i},1);Modals._renderCSteps()">✕</button>
      </div>`).join('')
      || '<div style="font-size:11px;color:var(--text3)">No steps yet.</div>';
  },

  async saveCreate() {
    const name = document.getElementById('c-name').value.trim();
    const desc = document.getElementById('c-desc').value.trim();
    if (!name) { UI.toast('Workflow name is required', 'error'); return; }
    const validSteps = this._createSteps.filter(s => s.name.trim());
    if (!validSteps.length) { UI.toast('Add at least one named step', 'error'); return; }

    const btn = document.querySelector('#m-create .btn-grad');
    btn.textContent = 'Creating…';
    btn.disabled = true;

    try {
      await API.createWorkflow({
        name,
        description: desc,
        input_schema: this._createSchema.filter(f => f.name.trim()),
        steps: validSteps.map((s,i) => ({ name: s.name.trim(), step_type: s.type, step_order: i+1 }))
      });
      UI.closeModal('m-create');
      await UI.renderWorkflows();
      await UI.updateBadges();
      UI.toast(`Workflow "${name}" created!`, 'success');
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    } finally {
      btn.textContent = 'Create Workflow';
      btn.disabled = false;
    }
  },

  // ═══════════════════════════════════════════════════════
  //  VIEW / EDIT WORKFLOW
  // ═══════════════════════════════════════════════════════

  async viewWorkflow(id) {
    UI.openModal('m-view');
    document.getElementById('mv-body').innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)">Loading…</div>';
    try {
      const { data: wf } = await API.getWorkflow(id);
      this._editWF = wf;
      document.getElementById('mv-title').textContent = `${wf.name}  (v${wf.version})`;

      document.getElementById('mv-body').innerHTML = `
        <div class="fg">
          <label class="fl">Workflow Name</label>
          <input class="fi" id="edit-name" value="${UI.esc(wf.name)}"/>
        </div>
        <div class="fg">
          <label class="fl">Description</label>
          <textarea class="fta" id="edit-desc">${UI.esc(wf.description||'')}</textarea>
        </div>
        <div class="fg">
          <label class="fl">Status</label>
          <select class="fsel" id="edit-active">
            <option value="true"  ${wf.is_active ?'selected':''}>Active</option>
            <option value="false" ${!wf.is_active?'selected':''}>Inactive</option>
          </select>
        </div>
        <div class="fg">
          <label class="fl">Input Schema (${(wf.input_schema||[]).length} fields)</label>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${(wf.input_schema||[]).map(f=>`
              <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);
                border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px">
                <span style="font-weight:700;color:var(--blue);font-size:12px;min-width:80px">${UI.esc(f.name)}</span>
                <span class="badge badge-task" style="font-size:9px">${f.type}</span>
                ${f.required?'<span class="badge badge-pending" style="font-size:9px">required</span>':''}
                ${f.allowed?`<span style="font-size:10px;color:var(--text3)">[${UI.esc(f.allowed)}]</span>`:''}
              </div>`).join('') || '<div style="font-size:11px;color:var(--text3)">No schema fields.</div>'}
          </div>
        </div>
        <div class="fg">
          <label class="fl">Steps & Rules</label>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${(wf.steps||[]).map((s,i)=>`
              <div class="step-card">
                <div class="step-card-hdr">
                  <div class="step-num">${s.step_order}</div>
                  <div style="flex:1">
                    <div class="step-name">${UI.esc(s.name)}</div>
                    <div class="step-meta">${UI.badge(s.step_type)} &nbsp; ${s.rules.length} rule${s.rules.length!==1?'s':''}</div>
                  </div>
                  <button class="btn btn-outline btn-xs" onclick="Modals._switchToRules('${wf.id}','${s.id}')">
                    Edit Rules (${s.rules.length})
                  </button>
                </div>
              </div>
              ${i<wf.steps.length-1?'<div class="arrow-down">↓</div>':''}`).join('')}
          </div>
        </div>`;

      document.getElementById('mv-save-btn').onclick = () => this._saveEditWF();
      document.getElementById('mv-exec-btn').onclick = () => { UI.closeModal('m-view'); this.openExec(wf.id); };
    } catch (err) {
      document.getElementById('mv-body').innerHTML =
        `<div style="color:var(--danger);padding:20px">${UI.esc(err.message)}</div>`;
    }
  },

  async _saveEditWF() {
    const wf = this._editWF; if (!wf) return;
    const name      = document.getElementById('edit-name').value.trim();
    const desc      = document.getElementById('edit-desc').value.trim();
    const is_active = document.getElementById('edit-active').value === 'true';
    if (!name) { UI.toast('Name is required','error'); return; }
    try {
      await API.updateWorkflow(wf.id, { name, description: desc, is_active });
      UI.closeModal('m-view');
      await UI.renderWorkflows();
      UI.toast('Workflow updated!', 'success');
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  _switchToRules(wfId, stepId) {
    UI.closeModal('m-view');
    this.openRules(wfId, stepId);
  },

  // ═══════════════════════════════════════════════════════
  //  RULES EDITOR
  // ═══════════════════════════════════════════════════════

  async openRules(wfId, stepId) {
    UI.openModal('m-rules');
    document.getElementById('mr-body').innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)">Loading…</div>';
    try {
      const { data: wf } = await API.getWorkflow(wfId);
      this._rulesWF   = wf;
      this._rulesStep = wf.steps.find(s => s.id === stepId) || wf.steps[0];
      this._editRules = JSON.parse(JSON.stringify(this._rulesStep.rules || []));
      document.getElementById('mr-title').textContent = `Rules: ${this._rulesStep.name}`;
      this._renderRulesModal();
    } catch (err) {
      document.getElementById('mr-body').innerHTML =
        `<div style="color:var(--danger);padding:20px">${UI.esc(err.message)}</div>`;
    }
  },

  _renderRulesModal() {
    const wf   = this._rulesWF;
    const step = this._rulesStep;

    document.getElementById('mr-body').innerHTML = `
      <div class="info-box">
        Rules are evaluated in <b style="color:var(--blue)">priority order</b>. First match wins.
        Use <code>DEFAULT</code> as a catch-all.<br>
        Operators: <code>== != &lt; &gt; &lt;= >=</code> · Logic: <code>&amp;&amp; ||</code>
        · Strings: <code>contains(field,"val")</code>
      </div>
      <div class="fg">
        <label class="fl">Editing step for:</label>
        <select class="fsel" onchange="Modals._switchRuleStep(this.value)">
          ${wf.steps.map(s=>`<option value="${s.id}" ${s.id===step.id?'selected':''}>${s.step_order}. ${UI.esc(s.name)} (${s.step_type})</option>`).join('')}
        </select>
      </div>
      <div id="rules-list" style="display:flex;flex-direction:column;gap:10px"></div>
      <button class="btn btn-outline btn-sm" style="width:fit-content" onclick="Modals.addRule()">+ Add Rule</button>`;

    this._renderRulesList();
  },

  async _switchRuleStep(stepId) {
    const wf      = this._rulesWF;
    const newStep = wf.steps.find(s => s.id === stepId);
    if (!newStep) return;
    this._rulesStep  = newStep;
    this._editRules  = JSON.parse(JSON.stringify(newStep.rules || []));
    document.getElementById('mr-title').textContent = `Rules: ${newStep.name}`;
    this._renderRulesList();
  },

  _renderRulesList() {
    const wf     = this._rulesWF;
    const step   = this._rulesStep;
    const others = wf.steps.filter(s => s.id !== step.id);

    const sorted = [...this._editRules].sort((a,b) => {
      const pa = a.condition==='DEFAULT'?9999999:(parseInt(a.priority)||999);
      const pb = b.condition==='DEFAULT'?9999999:(parseInt(b.priority)||999);
      return pa - pb;
    });

    document.getElementById('rules-list').innerHTML = sorted.length ? sorted.map((r,i) => `
      <div class="rule-card">
        <div class="rule-grid">
          <div>
            <label class="fl" style="margin-bottom:4px">Priority</label>
            <input class="fi rule-fi" type="number" min="1" value="${r.condition==='DEFAULT'?999:r.priority}"
              onchange="Modals._editRules[${i}].priority=parseInt(this.value)||1"/>
          </div>
          <div>
            <label class="fl" style="margin-bottom:4px">Condition</label>
            <input class="fi rule-fi rule-mono" value="${UI.esc(r.condition)}"
              placeholder='e.g. amount > 100 && country == "US"'
              oninput="Modals._editRules[${i}].condition=this.value"/>
          </div>
          <button class="btn btn-ghost btn-xs" style="margin-top:22px" onclick="Modals._editRules.splice(${i},1);Modals._renderRulesList()">✕</button>
        </div>
        <div class="fg" style="margin-top:10px">
          <label class="fl">Next Step</label>
          <select class="fsel rule-fi" onchange="Modals._editRules[${i}].next_step_id=this.value==='null'?null:this.value">
            <option value="null" ${!r.next_step_id?'selected':''}>→ End Workflow</option>
            ${others.map(s=>`<option value="${s.id}" ${r.next_step_id===s.id?'selected':''}>${s.step_order}. ${UI.esc(s.name)}</option>`).join('')}
          </select>
        </div>
      </div>`).join('')
      : '<div style="font-size:12px;color:var(--text3);padding:8px 0">No rules — workflow ends after this step.</div>';
  },

  addRule() {
    this._editRules.push({ id: null, priority: this._editRules.length+1, condition:'DEFAULT', next_step_id:null });
    this._renderRulesList();
  },

  async saveRules() {
    const step = this._rulesStep; if (!step) return;
    const btn  = document.querySelector('#m-rules .btn-grad');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
      await API.bulkSaveRules(step.id, this._editRules.map(r => ({
        id:           r.id || undefined,
        condition:    r.condition || 'DEFAULT',
        next_step_id: r.next_step_id || null,
        priority:     parseInt(r.priority) || 1
      })));
      UI.closeModal('m-rules');
      UI.toast('Rules saved!', 'success');
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    } finally {
      btn.textContent = 'Save Rules'; btn.disabled = false;
    }
  },

  // ═══════════════════════════════════════════════════════
  //  EXECUTE WORKFLOW
  // ═══════════════════════════════════════════════════════

  async openExec(wfId) {
    UI.openModal('m-exec');
    document.getElementById('me-fields').innerHTML = '<div style="color:var(--text3);font-size:12px">Loading…</div>';
    try {
      const { data: wf } = await API.getWorkflow(wfId);
      this._execWF = wf;
      document.getElementById('me-title').textContent = `Execute: ${wf.name}`;
      document.getElementById('me-user').value = 'user123';

      document.getElementById('me-fields').innerHTML = (wf.input_schema||[]).map(f => `
        <div class="fg">
          <label class="fl">${UI.esc(f.name)}${f.required?'<span style="color:var(--pink)"> *</span>':''} <span style="color:var(--text3);font-weight:400">(${f.type}${f.allowed?' · '+f.allowed:''})</span></label>
          ${f.allowed
            ? `<select class="fsel" id="ef-${f.name}">
                <option value="">Select…</option>
                ${f.allowed.split(',').map(v=>v.trim()).filter(Boolean).map(v=>`<option value="${UI.esc(v)}">${UI.esc(v)}</option>`).join('')}
               </select>`
            : `<input class="fi" id="ef-${f.name}" type="${f.type==='number'?'number':'text'}" placeholder="${f.type==='number'?'0':'Enter '+f.name+'…'}"/>`
          }
        </div>`).join('') || '<div style="font-size:12px;color:var(--text3)">No input fields for this workflow.</div>';
    } catch (err) {
      document.getElementById('me-fields').innerHTML = `<div style="color:var(--danger)">${UI.esc(err.message)}</div>`;
    }
  },

  async runExec() {
    const wf = this._execWF; if (!wf) return;
    const user     = (document.getElementById('me-user').value || 'user123').trim();
    const data     = {};
    let   valid    = true;

    for (const f of (wf.input_schema||[])) {
      const el  = document.getElementById('ef-' + f.name);
      const val = el ? el.value.trim() : '';
      if (f.required && !val) { UI.toast(`"${f.name}" is required`, 'error'); valid=false; break; }
      data[f.name] = f.type === 'number' ? (val===''?0:Number(val)) : val;
    }
    if (!valid) return;

    const btn = document.querySelector('#m-exec .btn-grad');
    btn.textContent = 'Starting…'; btn.disabled = true;

    try {
      const { data: exec } = await API.startExecution({ workflow_id: wf.id, input_data: data, triggered_by: user });
      UI.closeModal('m-exec');
      UI.toast(`Execution started: ${exec.id.substring(0,8)}…`, 'info');
      await UI.navigate('executions');
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    } finally {
      btn.textContent = '▶ Start Execution'; btn.disabled = false;
    }
  },

  // ═══════════════════════════════════════════════════════
  //  VIEW EXECUTION DETAIL
  // ═══════════════════════════════════════════════════════

  async viewExecution(id) {
    UI.openModal('m-exview');
    document.getElementById('mev-body').innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)">Loading…</div>';
    try {
      const { data: exec } = await API.getExecution(id);
      document.getElementById('mev-title').textContent = `Execution: ${id.substring(0,8)}…`;

      const duration = exec.ended_at
        ? ((new Date(exec.ended_at) - new Date(exec.started_at))/1000).toFixed(2) + 's'
        : 'In progress…';

      document.getElementById('mev-body').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
          <div class="stat-card" style="padding:12px"><div class="stat-lbl">Status</div><div style="margin-top:6px">${UI.badge(exec.status)}</div></div>
          <div class="stat-card" style="padding:12px"><div class="stat-lbl">Triggered By</div><div style="font-weight:700;margin-top:6px">${UI.esc(exec.triggered_by)}</div></div>
          <div class="stat-card" style="padding:12px"><div class="stat-lbl">Duration</div><div style="font-weight:700;margin-top:6px">${duration}</div></div>
        </div>
        <div class="fg">
          <label class="fl">Workflow</label>
          <div style="font-weight:700;font-size:13px">${UI.esc(exec.workflow_name)} <span style="color:var(--text3);font-weight:400">v${exec.workflow_version}</span></div>
        </div>
        <div class="fg">
          <label class="fl">Input Data</label>
          <div class="tl-log">${UI.esc(JSON.stringify(exec.input_data, null, 2))}</div>
        </div>
        <div class="fg">
          <label class="fl">Execution Timeline (${exec.logs.length} events)</label>
          <div class="timeline">
            ${exec.logs.length ? exec.logs.map((log,i) => `
              <div class="tl-step">
                <div class="tl-spine">
                  <div class="tl-dot ${log.log_type==='error'?'failed':log.log_type==='done'?'completed':log.log_type==='step'?'running':'completed'}"></div>
                  ${i<exec.logs.length-1?'<div class="tl-line"></div>':''}
                </div>
                <div class="tl-body">
                  <div class="tl-title">
                    ${log.log_type==='step'  ? `▶ ${log.step_name||''} ${log.step_type?UI.badge(log.step_type):''}` : ''}
                    ${log.log_type==='rule'  ? '⚡ ' : ''}
                    ${log.log_type==='done'  ? '✓ ' : ''}
                    ${log.log_type==='error' ? '✕ ' : ''}
                    ${log.log_type==='info'  ? 'ℹ ' : ''}
                    ${log.log_type!=='step'  ? UI.esc(log.message) : ''}
                  </div>
                  ${log.approver  ? `<div class="tl-meta">Approver: <span style="color:var(--blue)">${UI.esc(log.approver)}</span></div>` : ''}
                  ${log.duration_ms ? `<div class="tl-meta">Duration: ${log.duration_ms}ms</div>` : ''}
                  <div class="tl-log">${UI.fmtTime(log.logged_at)}</div>
                </div>
              </div>`).join('')
            : '<div style="color:var(--text3);font-size:11px;padding:10px 0">No logs yet…</div>'}
          </div>
        </div>`;

      // Auto-refresh if still running
      if (exec.status === 'running') {
        setTimeout(() => this.viewExecution(id), 2000);
      }
    } catch (err) {
      document.getElementById('mev-body').innerHTML = `<div style="color:var(--danger);padding:20px">${UI.esc(err.message)}</div>`;
    }
  }
};
