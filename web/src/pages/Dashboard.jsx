import React, { useMemo, useState } from 'react';
import { Card, SectionLabel, ProgressBar, Pill } from '../components/ui';
import { TrendChart } from '../components/TrendChart';
import { useWealth } from '../store/DataContext';
import { formatINR } from '../format';

const DAY_MS = 24 * 60 * 60 * 1000;

// Returns { start, nextStart } for the pay cycle `offset` cycles away from the
// current one (offset 0 = the cycle containing today, negative = past cycles).
// A cycle runs from `salaryDay` of one month up to (but not including)
// `salaryDay` of the next month — e.g. salaryDay=26 means 26 Jul – 25 Aug.
function cycleForOffset(salaryDay, offset) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  if (now.getDate() < salaryDay) {
    month -= 1;
  }
  month += offset;
  while (month < 0) {
    month += 12;
    year -= 1;
  }
  while (month > 11) {
    month -= 12;
    year += 1;
  }
  const start = new Date(year, month, salaryDay);
  const nextStart = new Date(year, month + 1, salaryDay);
  return { start, nextStart };
}

function formatCycleLabel(start, nextStart) {
  const endDisplay = new Date(nextStart.getTime() - DAY_MS);
  const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const year = endDisplay.getFullYear();
  return `${fmt(start)} – ${fmt(endDisplay)} ${year}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { data } = useWealth();
  const salaryDay = Math.min(31, Math.max(1, data.profile.salaryDay || 1));
  const [offset, setOffset] = useState(0);

  const { start, nextStart } = useMemo(() => cycleForOffset(salaryDay, offset), [salaryDay, offset]);
  const { start: prevStart } = useMemo(() => cycleForOffset(salaryDay, offset - 1), [salaryDay, offset]);
  const prevNextStart = start; // previous cycle's exclusive end = this cycle's start

  const txInRange = (rangeStart, rangeEnd) =>
    data.transactions.filter((t) => {
      const d = new Date(t.date);
      return d >= rangeStart && d < rangeEnd;
    });

  const thisCycleTx = useMemo(() => txInRange(start, nextStart), [data.transactions, start, nextStart]);
  const prevCycleTx = useMemo(() => txInRange(prevStart, prevNextStart), [data.transactions, prevStart, prevNextStart]);

  const income = thisCycleTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = thisCycleTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const spendByCategory = useMemo(() => {
    const map = {};
    thisCycleTx.filter((t) => t.type === 'expense').forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [thisCycleTx]);

  const totalBudgeted = data.budgets.reduce((s, b) => s + b.limit, 0) + data.recurringExpenses.reduce((s, r) => s + r.amount, 0);

  const budgetRows = useMemo(() => {
    return data.budgets.map((b) => {
      const spent = thisCycleTx
        .filter((t) => t.type === 'expense' && t.category === b.category)
        .reduce((s, t) => s + t.amount, 0);
      return { ...b, spent, pct: b.limit ? spent / b.limit : 0 };
    });
  }, [data.budgets, thisCycleTx]);

  const trend = useMemo(() => {
    const daysThis = Math.round((nextStart - start) / DAY_MS);
    const daysPrev = Math.round((prevNextStart - prevStart) / DAY_MS);
    const buildCumulative = (txs, rangeStart, totalDays) => {
      const daily = Array(totalDays).fill(0);
      txs.filter((t) => t.type === 'expense').forEach((t) => {
        const dayIdx = Math.floor((new Date(t.date) - rangeStart) / DAY_MS);
        if (dayIdx >= 0 && dayIdx < totalDays) daily[dayIdx] += t.amount;
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
      current: buildCumulative(thisCycleTx, start, daysThis),
      previous: buildCumulative(prevCycleTx, prevStart, daysPrev),
    };
  }, [thisCycleTx, prevCycleTx, start, nextStart, prevStart, prevNextStart]);

  const cycleLabel = formatCycleLabel(start, nextStart);
  const prevCycleLabel = formatCycleLabel(prevStart, prevNextStart);

  return (
    <div className="stack">
      <div className="page-header-row">
        <h1 className="page-title" style={{ margin: 0 }}>{greeting()}, {data.profile.name}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn--ghost" style={{ padding: '8px 14px' }} onClick={() => setOffset((o) => o - 1)}>‹</button>
          <span style={{ fontWeight: 600, fontSize: 14, minWidth: 150, textAlign: 'center' }}>{cycleLabel}</span>
          <button
            className="btn btn--ghost"
            style={{ padding: '8px 14px', opacity: offset >= 0 ? 0.4 : 1 }}
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
          >
            ›
          </button>
        </div>
      </div>

      <div className="row">
        <Card>
          <SectionLabel>Income — this cycle</SectionLabel>
          <div style={{ fontWeight: 700, fontSize: 26, color: 'var(--teal)' }}>{formatINR(income)}</div>
        </Card>
        <Card>
          <SectionLabel>Expense — this cycle</SectionLabel>
          <div style={{ fontWeight: 700, fontSize: 26, color: 'var(--rose)' }}>{formatINR(expense)}</div>
        </Card>
      </div>

      <Card>
        <SectionLabel>Budget vs. expense — overall</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 24 }}>{formatINR(expense)}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14, marginLeft: 6 }}>of {formatINR(totalBudgeted)} budgeted (categories + recurring bills)</span>
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
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>No expenses logged for {cycleLabel} yet.</p>
        ) : (
          spendByCategory.map(([cat, amt]) => (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span>{cat}</span>
              <span style={{ fontWeight: 600 }}>{formatINR(amt)}</span>
            </div>
          ))
        )}
      </Card>

      <SectionLabel style={{ marginLeft: 2 }}>Spend trend — this cycle vs. last</SectionLabel>
      <Card>
        <TrendChart
          seriesA={trend.current}
          seriesB={trend.previous}
          labelA={cycleLabel}
          labelB={prevCycleLabel}
        />
      </Card>
    </div>
  );
}
