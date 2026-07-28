import React, { useMemo, useState } from 'react';
import { Card, SectionLabel, ProgressBar, Pill } from '../components/ui';
import { TrendChart } from '../components/TrendChart';
import { useWealth } from '../store/DataContext';
import { formatINR } from '../format';

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m - 1 }; // JS month is 0-indexed
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { data } = useWealth();
  const now = new Date();
  const currentMonthKey = monthKeyOf(now);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  const { year, month } = parseMonthKey(selectedMonth);

  const prevDate = new Date(year, month - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth();

  const txInMonth = (y, m) =>
    data.transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === y && d.getMonth() === m;
    });

  const thisMonthTx = useMemo(() => txInMonth(year, month), [data.transactions, year, month]);
  const prevMonthTx = useMemo(() => txInMonth(prevYear, prevMonth), [data.transactions, prevYear, prevMonth]);

  const income = thisMonthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = thisMonthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const spendByCategory = useMemo(() => {
    const map = {};
    thisMonthTx.filter((t) => t.type === 'expense').forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [thisMonthTx]);

  const totalBudgeted = data.budgets.reduce((s, b) => s + b.limit, 0);

  const budgetRows = useMemo(() => {
    return data.budgets.map((b) => {
      const spent = thisMonthTx
        .filter((t) => t.type === 'expense' && t.category === b.category)
        .reduce((s, t) => s + t.amount, 0);
      return { ...b, spent, pct: b.limit ? spent / b.limit : 0 };
    });
  }, [data.budgets, thisMonthTx]);

  const trend = useMemo(() => {
    const daysThis = daysInMonth(year, month);
    const daysPrev = daysInMonth(prevYear, prevMonth);
    const buildCumulative = (txs, totalDays) => {
      const daily = Array(totalDays).fill(0);
      txs.filter((t) => t.type === 'expense').forEach((t) => {
        const day = new Date(t.date).getDate();
        if (day >= 1 && day <= totalDays) daily[day - 1] += t.amount;
      });
      const cumulative = [];
      let running = 0;
      for (const v of daily) {
        running += v;
        cumulative.push(running);
      }
      return cumulative;
    };
    return {
      current: buildCumulative(thisMonthTx, daysThis),
      previous: buildCumulative(prevMonthTx, daysPrev),
    };
  }, [thisMonthTx, prevMonthTx, year, month, prevYear, prevMonth]);

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const prevMonthLabel = new Date(prevYear, prevMonth, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  return (
    <div className="stack">
      <div className="page-header-row">
        <h1 className="page-title" style={{ margin: 0 }}>{greeting()}, {data.profile.name}</h1>
        <input
          type="month"
          value={selectedMonth}
          max={currentMonthKey}
          onChange={(e) => setSelectedMonth(e.target.value)}
        />
      </div>

      <div className="row">
        <Card>
          <SectionLabel>Income — {monthLabel}</SectionLabel>
          <div style={{ fontWeight: 700, fontSize: 26, color: 'var(--teal)' }}>{formatINR(income)}</div>
        </Card>
        <Card>
          <SectionLabel>Expense — {monthLabel}</SectionLabel>
          <div style={{ fontWeight: 700, fontSize: 26, color: 'var(--rose)' }}>{formatINR(expense)}</div>
        </Card>
      </div>

      <Card>
        <SectionLabel>Budget vs. expense — overall</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 24 }}>{formatINR(expense)}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14, marginLeft: 6 }}>of {formatINR(totalBudgeted)} budgeted</span>
        </div>
        <ProgressBar pct={totalBudgeted ? expense / totalBudgeted : 0} accent={expense > totalBudgeted ? 'rose' : 'teal'} />
      </Card>

      <SectionLabel style={{ marginLeft: 2 }}>Budget vs. expense — by category</SectionLabel>
      <div className="stack">
        {budgetRows.length === 0 && (
          <Card><p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>No budget categories set up yet — add some on the Budget page.</p></Card>
        )}
        {budgetRows.map((b) => (
          <Card key={b.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{b.category}</span>
              {b.pct >= 1 ? <Pill tone="alert">Over</Pill> : b.pct >= 0.85 ? <Pill tone="warn">Close</Pill> : <Pill tone="good">On track</Pill>}
            </div>
            <ProgressBar pct={b.pct} accent={b.pct >= 1 ? 'rose' : b.pct >= 0.85 ? 'amber' : 'teal'} />
            <div style={{ fontSize: 13, marginTop: 8 }}>
              {formatINR(b.spent)} <span style={{ color: 'var(--text-secondary)' }}>of {formatINR(b.limit)}</span>
            </div>
          </Card>
        ))}
      </div>

      <SectionLabel style={{ marginLeft: 2 }}>Spend by category</SectionLabel>
      <Card>
        {spendByCategory.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>No expenses logged for {monthLabel} yet.</p>
        ) : (
          spendByCategory.map(([cat, amt]) => (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span>{cat}</span>
              <span style={{ fontWeight: 600 }}>{formatINR(amt)}</span>
            </div>
          ))
        )}
      </Card>

      <SectionLabel style={{ marginLeft: 2 }}>Spend trend — this month vs. last</SectionLabel>
      <Card>
        <TrendChart
          seriesA={trend.current}
          seriesB={trend.previous}
          labelA={monthLabel}
          labelB={prevMonthLabel}
        />
      </Card>
    </div>
  );
}
