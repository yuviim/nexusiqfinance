import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from './AuthContext';

const CACHE_KEY = 'wealthos:cache';

const emptyState = {
  profile: { name: '', monthlyIncome: 0, monthlyBudget: 0, riskProfile: 'moderate', salaryDay: 1 },
  assets: [],
  liabilities: [],
  transactions: [],
  budgets: [],
  goals: [],
  investments: { sipMonthly: 0, holdings: [] },
  sipLog: {},
  recurringExpenses: [],
  bankAccounts: [],
};

const monthKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}`;

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { token, logout } = useAuth();
  const [data, setData] = useState(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    if (!token) {
      setData(emptyState);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached && !cancelled) setData(JSON.parse(cached));
      } catch (e) {
        // ignore
      }
      await refresh();
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const persist = useCallback((next) => {
    setData(next);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch (e) {
      // ignore
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const state = await api.getState(token);
      persist(state);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        logout();
        return;
      }
      setSyncError(e instanceof ApiError ? e.message : 'Could not sync with the server.');
    } finally {
      setSyncing(false);
    }
  }, [token, persist, logout]);

  const addTransaction = useCallback(
    async (tx) => {
      try {
        const created = await api.addTransaction(token, tx);
        persist({ ...data, transactions: [created, ...data.transactions] });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const deleteTransaction = useCallback(
    async (id) => {
      try {
        await api.deleteTransaction(token, id);
        persist({ ...data, transactions: data.transactions.filter((t) => t.id !== id) });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const updateGoal = useCallback(
    async (id, patch) => {
      try {
        const updated = await api.updateGoal(token, id, patch);
        persist({ ...data, goals: data.goals.map((g) => (g.id === id ? updated : g)) });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const addGoal = useCallback(
    async (goal) => {
      try {
        const created = await api.addGoal(token, goal);
        persist({ ...data, goals: [...data.goals, created] });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const updateBudget = useCallback(
    async (id, patch) => {
      try {
        const updated = await api.updateBudget(token, id, patch);
        persist({ ...data, budgets: data.budgets.map((b) => (b.id === id ? updated : b)) });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const addBudget = useCallback(
    async (budget) => {
      try {
        const created = await api.addBudget(token, budget);
        persist({ ...data, budgets: [...data.budgets, created] });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const deleteBudget = useCallback(
    async (id) => {
      try {
        await api.deleteBudget(token, id);
        persist({ ...data, budgets: data.budgets.filter((b) => b.id !== id) });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const addAsset = useCallback(
    async (asset) => {
      try {
        const created = await api.addAsset(token, asset);
        const key = asset.kind === 'liability' ? 'liabilities' : 'assets';
        persist({ ...data, [key]: [...data[key], created] });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const updateAsset = useCallback(
    async (id, patch, kind = 'asset') => {
      try {
        const updated = await api.updateAsset(token, id, patch);
        const key = kind === 'liability' ? 'liabilities' : 'assets';
        persist({ ...data, [key]: data[key].map((a) => (a.id === id ? updated : a)) });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const deleteAsset = useCallback(
    async (id, kind = 'asset') => {
      try {
        await api.deleteAsset(token, id);
        const key = kind === 'liability' ? 'liabilities' : 'assets';
        persist({ ...data, [key]: data[key].filter((a) => a.id !== id) });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const addHolding = useCallback(
    async (holding) => {
      try {
        const created = await api.addHolding(token, holding);
        persist({ ...data, investments: { ...data.investments, holdings: [...data.investments.holdings, created] } });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const deleteHolding = useCallback(
    async (id) => {
      try {
        await api.deleteHolding(token, id);
        persist({ ...data, investments: { ...data.investments, holdings: data.investments.holdings.filter((h) => h.id !== id) } });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const resetData = useCallback(async () => {
    try {
      await api.resetData(token);
      await refresh();
      return true;
    } catch (e) {
      setSyncError(e.message);
      return false;
    }
  }, [token, refresh]);

  const addRecurring = useCallback(
    async (item) => {
      try {
        const created = await api.addRecurring(token, item);
        persist({ ...data, recurringExpenses: [...data.recurringExpenses, created] });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const deleteRecurring = useCallback(
    async (id) => {
      try {
        await api.deleteRecurring(token, id);
        persist({ ...data, recurringExpenses: data.recurringExpenses.filter((r) => r.id !== id) });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const upsertBankAccount = useCallback(
    async (bankName, balance) => {
      try {
        const updated = await api.upsertBankAccount(token, bankName, balance);
        const exists = data.bankAccounts.some((b) => b.id === updated.id);
        persist({
          ...data,
          bankAccounts: exists
            ? data.bankAccounts.map((b) => (b.id === updated.id ? updated : b))
            : [...data.bankAccounts, updated],
        });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const deleteBankAccount = useCallback(
    async (id) => {
      try {
        await api.deleteBankAccount(token, id);
        persist({ ...data, bankAccounts: data.bankAccounts.filter((b) => b.id !== id) });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const setProfile = useCallback(
    async (patch) => {
      try {
        const updated = await api.updateProfile(token, patch);
        const next = { ...data, profile: updated };
        if (updated.sipMonthly !== undefined) {
          next.investments = { ...data.investments, sipMonthly: updated.sipMonthly };
        }
        persist(next);
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const markSip = useCallback(
    async (paid) => {
      const key = monthKey();
      try {
        await api.setSip(token, paid, key);
        persist({ ...data, sipLog: { ...data.sipLog, [key]: paid } });
      } catch (e) {
        setSyncError(e.message);
      }
    },
    [token, data, persist]
  );

  const derived = useMemo(() => {
    const now = new Date();
    const thisMonthTx = data.transactions.filter((t) => {
      const dt = new Date(t.date);
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
    });
    const spentThisMonth = thisMonthTx
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const incomeThisMonth = thisMonthTx
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalBankBalance = data.bankAccounts.reduce((s, b) => s + b.balance, 0);
    const totalAssets = data.assets.reduce((s, a) => s + a.value, 0) + totalBankBalance;
    const totalLiabilities = data.liabilities.reduce((s, l) => s + l.value, 0);
    const netWorth = totalAssets - totalLiabilities;

    const budget = data.profile.monthlyBudget || 1;
    const remaining = Math.max(budget - spentThisMonth, 0);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(daysInMonth - now.getDate() + 1, 1);
    const safeToSpendToday = Math.max(Math.floor(remaining / daysLeft), 0);

    const income = data.profile.monthlyIncome || 1;
    const sip = data.investments.sipMonthly || 0;
    const savingsRate = Math.max(
      Math.round(((income - spentThisMonth - sip) / income) * 100),
      0
    );

    const totalInvestments = data.investments.holdings.reduce((s, h) => s + h.value, 0);

    const spendByCategory = {};
    thisMonthTx
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        spendByCategory[t.category] = (spendByCategory[t.category] || 0) + t.amount;
      });

    const sipPaidThisMonth = !!data.sipLog[monthKey()];

    const budgetDiscipline = Math.max(0, Math.min(100, Math.round(100 - (spentThisMonth / budget) * 100 + 20)));
    const savingsScore = Math.max(0, Math.min(100, savingsRate + 10));
    const investmentConsistency = sipPaidThisMonth ? 96 : 55;

    const financialHealthScore = Math.round(
      budgetDiscipline * 0.4 +
      savingsScore * 0.35 +
      investmentConsistency * 0.25
    );

    return {
      totalAssets,
      totalLiabilities,
      totalBankBalance,
      netWorth,
      spentThisMonth,
      incomeThisMonth,
      remaining,
      safeToSpendToday,
      savingsRate,
      totalInvestments,
      spendByCategory,
      sipPaidThisMonth,
      pillars: { budgetDiscipline, savingsScore, investmentConsistency },
      financialHealthScore,
    };
  }, [data]);

  const value = useMemo(
    () => ({
      data,
      derived,
      loaded,
      syncing,
      syncError,
      refresh,
      addTransaction,
      deleteTransaction,
      updateGoal,
      addGoal,
      updateBudget,
      addBudget,
      deleteBudget,
      addAsset,
      updateAsset,
      deleteAsset,
      addHolding,
      deleteHolding,
      resetData,
      addRecurring,
      deleteRecurring,
      upsertBankAccount,
      deleteBankAccount,
      setProfile,
      markSip,
    }),
    [data, derived, loaded, syncing, syncError, refresh, addTransaction, deleteTransaction, updateGoal, addGoal, updateBudget, addBudget, deleteBudget, addAsset, updateAsset, deleteAsset, addHolding, deleteHolding, resetData, addRecurring, deleteRecurring, upsertBankAccount, deleteBankAccount, setProfile, markSip]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useWealth() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useWealth must be used within DataProvider');
  return ctx;
}
