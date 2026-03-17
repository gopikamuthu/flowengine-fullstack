// ═══════════════════════════════════════════════════════════
//  FlowEngine — Actions (js/actions.js)
// ═══════════════════════════════════════════════════════════

const Actions = {

  async deleteWorkflow(id, name) {
    if (!confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;
    try {
      await API.deleteWorkflow(id);
      await UI.renderWorkflows();
      await UI.updateBadges();
      UI.toast(`"${name}" deleted`, 'info');
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async retryExecution(id) {
    try {
      await API.retryExecution(id);
      await UI.renderExecutions();
      UI.toast('Execution retried', 'success');
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  },

  async cancelExecution(id) {
    if (!confirm('Cancel this execution?')) return;
    try {
      await API.cancelExecution(id);
      await UI.renderExecutions();
      UI.toast('Execution cancelled', 'info');
    } catch (err) {
      UI.toast('Error: ' + err.message, 'error');
    }
  }
};
