import React, { useState } from 'react';
import { Card, SectionLabel, ProgressBar } from '../components/ui';
import { useWealth } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { formatINR } from '../format';

const PILLARS = [
  { key: 'budgetDiscipline', label: 'Budget discipline', accent: 'teal' },
  { key: 'savingsScore', label: 'Savings rate', accent: 'violet' },
  { key: 'investmentConsistency', label: 'Investment consistency', accent: 'amber' },
];

export default function Profile() {
  const { data, derived, setProfile, syncing, syncError, refresh, resetData } = useWealth();
  const { user, logout } = useAuth();
  const [income, setIncome] = useState(String(data.profile.monthlyIncome));
  const [budget, setBudget] = useState(String(data.profile.monthlyBudget));
  const [salaryDay, setSalaryDay] = useState(String(data.profile.salaryDay || 1));
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!window.confirm('This clears every account, transaction, goal, budget category, and tax entry back to zero. This cannot be undone. Continue?')) {
      return;
    }
    setResetting(true);
    const ok = await resetData();
    setResetting(false);
    if (ok) {
      setIncome('0');
      setBudget('0');
    }
  };

  return (
    <div className="stack">
      <h1 className="page-title" style={{ marginBottom: 2 }}>{data.profile.name}</h1>
      {!!user?.email && <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)', fontSize: 13 }}>{user.email}</p>}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{syncing ? 'Syncing…' : syncError ? 'Sync failed' : 'Synced'}</span>
          <button className="btn btn--ghost" onClick={refresh}>Refresh</button>
        </div>
        {!!syncError && <p style={{ color: 'var(--rose)', fontSize: 12, marginTop: 8 }}>{syncError}</p>}
      </Card>

      <Card>
        <SectionLabel>Financial health</SectionLabel>
        <div style={{ fontWeight: 700, fontSize: 34, marginBottom: 12 }}>
          {derived.financialHealthScore}
          <span style={{ fontWeight: 500, fontSize: 16, color: 'var(--text-secondary)' }}> / 100</span>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          {PILLARS.map((p) => (
            <div key={p.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span>{p.label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{derived.pillars[p.key]}</span>
              </div>
              <ProgressBar pct={derived.pillars[p.key] / 100} accent={p.accent} height={6} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>Net worth snapshot</SectionLabel>
        <SnapRow label="Assets" value={formatINR(derived.totalAssets)} />
        <SnapRow label="Liabilities" value={formatINR(derived.totalLiabilities)} valueColor="var(--rose)" />
        <div className="divider" />
        <SnapRow label="Net worth" value={formatINR(derived.netWorth)} bold />
      </Card>

      <Card>
        <SectionLabel>Monthly settings</SectionLabel>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Monthly income</label>
        <input
          type="number"
          value={income}
          onChange={(e) => setIncome(e.target.value)}
          onBlur={() => setProfile({ monthlyIncome: parseFloat(income) || data.profile.monthlyIncome })}
          style={{ marginBottom: 14 }}
        />
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Monthly budget</label>
        <input
          type="number"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          onBlur={() => setProfile({ monthlyBudget: parseFloat(budget) || data.profile.monthlyBudget })}
          style={{ marginBottom: 14 }}
        />
        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
          Salary day (Dashboard tracks each month from this day to the day before it next month)
        </label>
        <input
          type="number"
          min="1"
          max="31"
          value={salaryDay}
          onChange={(e) => setSalaryDay(e.target.value)}
          onBlur={() => {
            const day = Math.min(31, Math.max(1, parseInt(salaryDay, 10) || 1));
            setSalaryDay(String(day));
            setProfile({ salaryDay: day });
          }}
        />
      </Card>

      <Card>
        <SectionLabel>Danger zone</SectionLabel>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Clear every seeded/demo number — accounts, transactions, goals, budgets, and tax entries — back to zero, so you can start entering your real numbers.
        </p>
        <button className="btn btn--ghost" style={{ color: 'var(--rose)' }} onClick={handleReset} disabled={resetting}>
          {resetting ? 'Clearing…' : 'Clear all data'}
        </button>
      </Card>

      <button className="btn btn--ghost" style={{ color: 'var(--rose)' }} onClick={logout}>Log out</button>
    </div>
  );
}

function SnapRow({ label, value, valueColor, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: bold ? 600 : 500 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, fontSize: bold ? 16 : 14, color: valueColor }}>{value}</span>
    </div>
  );
}
