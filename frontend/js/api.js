// ═══════════════════════════════════════════════════════════
//  FlowEngine — API Client (js/api.js)
//  All HTTP calls to the backend go through here
// ═══════════════════════════════════════════════════════════

const API_BASE = 'http://localhost:3000/api';

const API = {

  async _request(method, path, body = null) {
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) opts.body = JSON.stringify(body);

      const res  = await fetch(API_BASE + path, opts);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API ${method} ${path} failed:`, err.message);
      throw err;
    }
  },

  // ── WORKFLOWS ──────────────────────────────────────────

  getWorkflows(search = '')    { return this._request('GET', `/workflows?search=${encodeURIComponent(search)}`); },
  getWorkflow(id)               { return this._request('GET', `/workflows/${id}`); },
  createWorkflow(body)          { return this._request('POST', '/workflows', body); },
  updateWorkflow(id, body)      { return this._request('PUT', `/workflows/${id}`, body); },
  deleteWorkflow(id)            { return this._request('DELETE', `/workflows/${id}`); },

  // ── STEPS ──────────────────────────────────────────────

  addStep(wfId, body)           { return this._request('POST', `/workflows/${wfId}/steps`, body); },
  updateStep(id, body)          { return this._request('PUT', `/workflows/steps/${id}`, body); },
  deleteStep(id)                { return this._request('DELETE', `/workflows/steps/${id}`); },

  // ── RULES ──────────────────────────────────────────────

  addRule(stepId, body)         { return this._request('POST', `/workflows/steps/${stepId}/rules`, body); },
  updateRule(id, body)          { return this._request('PUT', `/workflows/rules/${id}`, body); },
  deleteRule(id)                { return this._request('DELETE', `/workflows/rules/${id}`); },
  bulkSaveRules(stepId, rules)  { return this._request('PUT', `/workflows/rules/bulk/${stepId}`, { rules }); },

  // ── EXECUTIONS ─────────────────────────────────────────

  startExecution(body)          { return this._request('POST', '/executions', body); },
  getExecutions(status = '')    { return this._request('GET', `/executions?status=${status}&limit=100`); },
  getExecution(id)              { return this._request('GET', `/executions/${id}`); },
  getExecLogs(id)               { return this._request('GET', `/executions/${id}/logs`); },
  cancelExecution(id)           { return this._request('POST', `/executions/${id}/cancel`); },
  retryExecution(id)            { return this._request('POST', `/executions/${id}/retry`); },

  // ── STATS ──────────────────────────────────────────────

  getStats()                    { return this._request('GET', '/stats'); },
  healthCheck()                 { return this._request('GET', '/health'); },
};
