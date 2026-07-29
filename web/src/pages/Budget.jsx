import React, { useMemo, useState } from 'react';
import { Card, SectionLabel, ProgressBar, Pill, Divider } from '../components/ui';
import { useWealth } from '../store/DataContext';
import { formatINR } from '../format';

const RECURRING_CATEGORIES = ['Loan EMI', 'House Expense', 'Insurance', 'Subscription', 'Utility', 'Other'];

export default function Budget() {
  const { data, derived, addBudget, deleteBudget, addRecurring, deleteRecurring, addTransaction } = useWealth();
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');

  const income = data.profile.monthlyIncome || 0;

  const rows = useMemo(() => {
    return data.budgets.map((b) => {
      const spent = derived.spendByCategory[b.category] || 0;
      const pct = b.limit ? spent / b.limit : 0;
      const pctOfIncome = income ? (b.limit / income) * 100 : 0;
      return { ...b, spent, pct, pctOfIncome };
    });
  }, [data.budgets, derived.spendByCategory, income]);

  const totalBudgeted = data.budgets.reduce((s, b) => s + b.limit, 0);
  const totalRecurring = data.recurringExpenses.reduce((s, r) => s + r.amount, 0);
  const totalCommitted = totalBudgeted + totalRecurring;
  const pctCommitted = income ? (totalCommitted / income) * 100 : 0;

  const create = async () => {
    if (!name.trim() || !limit) return;
    await addBudget({ category: name.trim(), limit: parseFloat(limit) });
    setName('');
    setLimit('');
  };

  return (
    <div className="stack">
      <h1 className="page-title">Budget</h1>

      <Card>
        <SectionLabel>Committed vs. income</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 24 }}>{formatINR(totalCommitted)}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14, marginLeft: 6 }}>
            of {formatINR(income)} income ({pctCommitted.toFixed(0)}%)
          </span>
        </div>
        <ProgressBar pct={pctCommitted / 100} accent={pctCommitted >= 100 ? 'rose' : pctCommitted >= 85 ? 'amber' : 'teal'} />
        {pctCommitted >= 100 && (
          <div style={{ marginTop: 10 }}>
            <Pill tone="alert">Budget + recurring bills exceed your income</Pill>
          </div>
        )}
        {!income && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            Set your monthly income on the You page to see this as a % of income.
          </p>
        )}
      </Card>

      <Card>
        <SectionLabel>Actual spend this month</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 24 }}>{formatINR(derived.spentThisMonth)}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14, marginLeft: 6 }}>
            of {formatINR(totalCommitted)} budgeted (categories + recurring bills)
          </span>
        </div>
        <ProgressBar
          pct={totalCommitted ? derived.spentThisMonth / totalCommitted : 0}
          accent={derived.spentThisMonth > totalCommitted ? 'rose' : 'teal'}
        />
      </Card>

      <SectionLabel style={{ marginLeft: 2 }}>Categories</SectionLabel>
      <div className="stack">
        {rows.map((b) => (
          <Card key={b.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{b.category}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {b.pct >= 1 ? (
                  <Pill tone="alert">Over</Pill>
                ) : b.pct >= 0.85 ? (
                  <Pill tone="warn">Close</Pill>
                ) : (
                  <Pill tone="good">On track</Pill>
                )}
                <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => deleteBudget(b.id)}>✕</button>
              </div>
            </div>
            <ProgressBar pct={b.pct} accent={b.pct >= 1 ? 'rose' : b.pct >= 0.85 ? 'amber' : 'teal'} />
            <div style={{ fontSize: 13, marginTop: 8 }}>
              {formatINR(b.spent)} <span style={{ color: 'var(--text-secondary)' }}>of {formatINR(b.limit)}</span>
              {income > 0 && <span style={{ color: 'var(--text-secondary)' }}> · {b.pctOfIncome.toFixed(1)}% of income</span>}
            </div>
          </Card>
        ))}

        <Card>
          <SectionLabel>Add a category</SectionLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <input type="number" placeholder="Monthly limit" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn--teal" onClick={create}>Add</button>
          </div>
        </Card>
      </div>

      <SectionLabel style={{ marginLeft: 2 }}>Recurring bills</SectionLabel>
      <Card>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Fixed monthly amounts — loan EMIs, insurance, subscriptions. Two ways to log
          one as an actual expense once it's paid: type just the name in the tracker on
          the Transactions page (e.g. "homeloan") and the amount fills in automatically,
          or tap "Log this month" below for an instant, no-typing version of the same thing.
        </p>
        <RecurringList
          items={data.recurringExpenses}
          transactions={data.transactions}
          onAdd={addRecurring}
          onDelete={deleteRecurring}
          onLog={addTransaction}
        />
      </Card>
    </div>
  );
}

function RecurringList({ items, transactions, onAdd, onDelete, onLog }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(RECURRING_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [outstandingBalance, setOutstandingBalance] = useState('');

  const isLoan = category === 'Loan EMI';
  const now = new Date();

  const loggedThisMonth = (item) =>
    transactions.some((t) => {
      const d = new Date(t.date);
      return (
        t.type === 'expense' &&
        t.note === item.name &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      );
    });

  const logNow = (item) => {
    onLog({
      type: 'expense',
      amount: item.amount,
      category: item.category,
      note: item.name,
      date: now.toISOString().slice(0, 10),
    });
  };

  const create = async () => {
    if (!name.trim() || !amount) return;
    await onAdd({
      name: name.trim(),
      category,
      amount: parseFloat(amount),
      interestRate: isLoan ? parseFloat(interestRate) || 0 : 0,
      outstandingBalance: isLoan ? parseFloat(outstandingBalance) || 0 : 0,
    });
    setName('');
    setAmount('');
    setInterestRate('');
    setOutstandingBalance('');
  };

  return (
    <>
      {items.map((item, idx) => (
        <div key={item.id}>
          {idx > 0 && <Divider />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {item.category}
                {item.category === 'Loan EMI' && item.interestRate > 0 ? ` · ${item.interestRate}% p.a.` : ''}
                {item.category === 'Loan EMI' && item.outstandingBalance > 0 ? ` · ${formatINR(item.outstandingBalance)} outstanding` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(item.amount)}</div>
              {loggedThisMonth(item) ? (
                <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>Logged ✓</span>
              ) : (
                <button className="btn btn--teal" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => logNow(item)}>
                  Log this month
                </button>
              )}
              <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onDelete(item.id)}>✕</button>
            </div>
          </div>
        </div>
      ))}
      {items.length > 0 && <Divider />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: isLoan ? 8 : 0 }}>
        <input type="text" placeholder="e.g. Home Loan EMI" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 160px' }} />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}
        >
          {RECURRING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input type="number" placeholder="Monthly amount" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: '1 1 130px' }} />
      </div>
      {isLoan && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input type="number" placeholder="Interest rate % p.a." value={interestRate} onChange={(e) => setInterestRate(e.target.value)} style={{ flex: '1 1 160px' }} />
          <input type="number" placeholder="Outstanding balance" value={outstandingBalance} onChange={(e) => setOutstandingBalance(e.target.value)} style={{ flex: '1 1 160px' }} />
        </div>
      )}
      <button className="btn btn--teal" onClick={create}>Add recurring bill</button>
    </>
  );
}
