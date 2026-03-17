// ═══════════════════════════════════════════════════════════
//  FlowEngine — Rule Engine (middleware/ruleEngine.js)
// ═══════════════════════════════════════════════════════════

/**
 * Evaluates a step's rules against input data.
 * Returns the first matching rule (sorted by priority asc).
 * DEFAULT is always last.
 */
function evaluateRules(rules, inputData) {
  if (!rules || rules.length === 0) return null;

  const sorted = [...rules].sort((a, b) => {
    const pa = a.condition === 'DEFAULT' ? 9999999 : (parseInt(a.priority) || 999);
    const pb = b.condition === 'DEFAULT' ? 9999999 : (parseInt(b.priority) || 999);
    return pa - pb;
  });

  for (const rule of sorted) {
    if (rule.condition === 'DEFAULT') return rule;
    try {
      if (evalCondition(rule.condition, inputData)) return rule;
    } catch (e) {
      console.warn(`Rule eval error [${rule.id}]: ${e.message}`);
    }
  }
  return null;
}

/**
 * Safely evaluate a condition string with field values.
 * Supports: == != < > <= >= && || contains() startsWith() endsWith()
 */
function evalCondition(condition, data) {
  let expr = condition
    .replace(/contains\((\w+),\s*["'](.+?)["']\)/g,
      (_, f, v) => `String(${f}).toLowerCase().includes("${v.toLowerCase()}")`
    )
    .replace(/startsWith\((\w+),\s*["'](.+?)["']\)/g,
      (_, f, v) => `String(${f}).startsWith("${v}")`
    )
    .replace(/endsWith\((\w+),\s*["'](.+?)["']\)/g,
      (_, f, v) => `String(${f}).endsWith("${v}")`
    );

  const keys   = Object.keys(data);
  const values = Object.values(data).map(v =>
    v !== '' && !isNaN(v) ? Number(v) : v
  );

  const fn = new Function(...keys, `"use strict"; return (${expr});`);
  return fn(...values);
}

/**
 * Validate a condition string syntax.
 */
function validateCondition(condition) {
  if (!condition || !condition.trim()) return { valid: false, error: 'Condition is empty' };
  if (condition.trim() === 'DEFAULT')  return { valid: true };
  try {
    new Function(`"use strict"; return (${condition});`);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

module.exports = { evaluateRules, evalCondition, validateCondition };
