import { API_BASE_URL } from '../config';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, token, timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new ApiError(
        `The request timed out after ${Math.round(timeoutMs / 1000)}s. Check the backend terminal for errors (e.g. an invalid ANTHROPIC_API_KEY or model name).`,
        0
      );
    }
    throw new ApiError(
      `Could not reach the server at ${API_BASE_URL}. Check src/config.js and that the backend is running.`,
      0
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // no body
  }

  if (!res.ok) {
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  register: (email, password, name) =>
    request('/api/auth/register', { method: 'POST', body: { email, password, name } }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: { email, password } }),
  getState: (token) => request('/api/state', { token }),
  addTransaction: (token, tx) => request('/api/transactions', { method: 'POST', body: tx, token }),
  updateTransaction: (token, id, patch) => request(`/api/transactions/${id}`, { method: 'PUT', body: patch, token }),
  deleteTransaction: (token, id) => request(`/api/transactions/${id}`, { method: 'DELETE', token }),
  updateBudget: (token, id, patch) => request(`/api/budgets/${id}`, { method: 'PUT', body: patch, token }),
  addBudget: (token, budget) => request('/api/budgets', { method: 'POST', body: budget, token }),
  deleteBudget: (token, id) => request(`/api/budgets/${id}`, { method: 'DELETE', token }),
  addGoal: (token, goal) => request('/api/goals', { method: 'POST', body: goal, token }),
  updateGoal: (token, id, patch) => request(`/api/goals/${id}`, { method: 'PUT', body: patch, token }),
  deleteGoal: (token, id) => request(`/api/goals/${id}`, { method: 'DELETE', token }),
  updateProfile: (token, patch) => request('/api/profile', { method: 'PUT', body: patch, token }),
  setSip: (token, paid, monthKey) => request('/api/sip', { method: 'POST', body: { paid, monthKey }, token }),

  // Assets / liabilities
  addAsset: (token, asset) => request('/api/assets', { method: 'POST', body: asset, token }),
  updateAsset: (token, id, patch) => request(`/api/assets/${id}`, { method: 'PUT', body: patch, token }),
  deleteAsset: (token, id) => request(`/api/assets/${id}`, { method: 'DELETE', token }),

  // Investment holdings
  addHolding: (token, holding) => request('/api/holdings', { method: 'POST', body: holding, token }),
  updateHolding: (token, id, patch) => request(`/api/holdings/${id}`, { method: 'PUT', body: patch, token }),
  refreshHoldingPrices: (token) => request('/api/holdings/refresh-prices', { method: 'POST', token, timeoutMs: 30000 }),
  checkDips: (token) => request('/api/holdings/check-dips', { token, timeoutMs: 30000 }),
  deleteHolding: (token, id) => request(`/api/holdings/${id}`, { method: 'DELETE', token }),

  // Reset
  resetData: (token) => request('/api/reset-data', { method: 'POST', token }),

  // Recurring expenses
  addRecurring: (token, item) => request('/api/recurring', { method: 'POST', body: item, token }),
  updateRecurring: (token, id, patch) => request(`/api/recurring/${id}`, { method: 'PUT', body: patch, token }),
  deleteRecurring: (token, id) => request(`/api/recurring/${id}`, { method: 'DELETE', token }),

  // SIP plans
  addSipPlan: (token, plan) => request('/api/sip-plans', { method: 'POST', body: plan, token }),
  updateSipPlan: (token, id, patch) => request(`/api/sip-plans/${id}`, { method: 'PUT', body: patch, token }),
  addSipAllocation: (token, planId, alloc) => request(`/api/sip-plans/${planId}/allocations`, { method: 'POST', body: alloc, token }),
  deleteSipAllocation: (token, planId, allocId) => request(`/api/sip-plans/${planId}/allocations/${allocId}`, { method: 'DELETE', token }),
  deleteSipPlan: (token, id) => request(`/api/sip-plans/${id}`, { method: 'DELETE', token }),

  // Recurring deposits (RDs)
  addRecurringDeposit: (token, rd) => request('/api/recurring-deposits', { method: 'POST', body: rd, token }),
  updateRecurringDeposit: (token, id, patch) => request(`/api/recurring-deposits/${id}`, { method: 'PUT', body: patch, token }),
  deleteRecurringDeposit: (token, id) => request(`/api/recurring-deposits/${id}`, { method: 'DELETE', token }),

  // Bank accounts
  upsertBankAccount: (token, bankName, balance) =>
    request('/api/bank-accounts', { method: 'POST', body: { bankName, balance }, token }),
  deleteBankAccount: (token, id) => request(`/api/bank-accounts/${id}`, { method: 'DELETE', token }),

  // Salary slip agent
  uploadSalarySlip: (token, fileBase64, mediaType) =>
    request('/api/agents/salary-slip', { method: 'POST', body: { fileBase64, mediaType }, token, timeoutMs: 90000 }),

  // Tax
  getTaxState: (token) => request('/api/tax/state', { token }),
  computeTax: (token) => request('/api/tax/compute', { token }),
  addIncomeSource: (token, source) => request('/api/tax/income-sources', { method: 'POST', body: source, token }),
  updateIncomeSource: (token, id, patch) => request(`/api/tax/income-sources/${id}`, { method: 'PUT', body: patch, token }),
  deleteIncomeSource: (token, id) => request(`/api/tax/income-sources/${id}`, { method: 'DELETE', token }),
  updateTaxProfile: (token, patch) => request('/api/tax/profile', { method: 'PUT', body: patch, token }),
  addAdvancePayment: (token, payment) => request('/api/tax/advance-payments', { method: 'POST', body: payment, token }),
  deleteAdvancePayment: (token, id) => request(`/api/tax/advance-payments/${id}`, { method: 'DELETE', token }),

  // Agents
  askAdvisor: (token, message, history) => request('/api/agents/advisor', { method: 'POST', body: { message, history }, token, timeoutMs: 60000 }),
  askTracker: (token, text) => request('/api/agents/tracker', { method: 'POST', body: { text }, token, timeoutMs: 60000 }),
  askAuditor: (token, message) => request('/api/agents/auditor', { method: 'POST', body: { message }, token, timeoutMs: 60000 }),
};

export { ApiError };
