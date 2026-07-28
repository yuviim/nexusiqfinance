import React, { useMemo, useState } from 'react';
import { Card, SectionLabel, Divider } from '../components/ui';
import { useWealth } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { api } from '../api/client';
import { formatINR } from '../format';
import { BANK_NAMES } from './BankAccounts';

export default function Transactions() {
  const { data, addTransaction, deleteTransaction, addBudget, refresh } = useWealth();
  const { token } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickReply, setQuickReply] = useState(null);

  const categories = data.budgets.length > 0 ? data.budgets.map((b) => b.category) : ['Other'];

  const runTracker = async () => {
    const text = quickText.trim();
    if (!text || quickBusy) return;
    setQuickBusy(true);
    setQuickReply(null);
    try {
      const res = await api.askTracker(token, text);
      setQuickReply(res.reply);
      setQuickText('');
      await refresh();
    } catch (e) {
      setQuickReply(e.message);
    } finally {
      setQuickBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const groups = {};
    data.transactions.forEach((t) => {
      const day = new Date(t.date).toDateString();
      if (!groups[day]) groups[day] = [];
      groups[day].push(t);
    });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [data.transactions]);

  return (
    <div className="stack">
      <div className="page-header-row">
        <h1 className="page-title" style={{ margin: 0 }}>Transactions</h1>
        <button className="btn btn--teal btn--pill" onClick={() => setModalOpen(true)}>+ Add manually</button>
      </div>

      <Card>
        <SectionLabel>Quick add (tracker agent)</SectionLabel>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            placeholder='e.g. "swiggy 450 for lunch" or "salary credited 150000"'
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runTracker()}
          />
          <button className="btn btn--teal" onClick={runTracker} disabled={quickBusy}>
            {quickBusy ? '…' : 'Send'}
          </button>
        </div>
        {!!quickReply && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{quickReply}</p>
        )}
      </Card>

      {data.transactions.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontWeight: 600 }}>Nothing logged yet</p>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
            Add your first transaction to start tracking spend against your budget.
          </p>
        </Card>
      ) : (
        grouped.map(([day, txs]) => (
          <div key={day}>
            <SectionLabel style={{ marginLeft: 2 }}>{day}</SectionLabel>
            <Card>
              {txs.map((t, idx) => (
                <div key={t.id}>
                  {idx > 0 && <Divider />}
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}
                    title="Click to delete"
                    onClick={() => {
                      if (window.confirm(`Delete "${t.category}" — ${formatINR(t.amount)}?`)) deleteTransaction(t.id);
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.category}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {!!t.bankName && <span>{t.bankName}</span>}
                        {!!t.bankName && !!t.note && <span> · </span>}
                        {!!t.note && <span>{t.note}</span>}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: t.type === 'income' ? 'var(--teal)' : 'var(--rose)' }}>
                      {t.type === 'income' ? '+' : '-'}{formatINR(t.amount)}
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        ))
      )}

      {modalOpen && (
        <AddTransactionModal
          categories={categories}
          onAddCategory={addBudget}
          onClose={() => setModalOpen(false)}
          onSubmit={(tx) => {
            addTransaction(tx);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AddTransactionModal({ categories, onAddCategory, onClose, onSubmit }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [bank, setBank] = useState('HDFC');
  const [date, setDate] = useState(todayStr);
  const [note, setNote] = useState('');

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryLimit, setNewCategoryLimit] = useState('');

  const saveNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    await onAddCategory({ category: name, limit: parseFloat(newCategoryLimit) || 0 });
    setCategory(name);
    setNewCategoryName('');
    setNewCategoryLimit('');
    setAddingCategory(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>New transaction</h2>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${type === 'expense' ? '' : 'btn--ghost'}`}
            style={{ flex: 1, background: type === 'expense' ? 'var(--rose)' : undefined, color: type === 'expense' ? 'var(--bg)' : undefined }}
            onClick={() => setType('expense')}
          >
            Expense
          </button>
          <button
            className={`btn ${type === 'income' ? '' : 'btn--ghost'}`}
            style={{ flex: 1, background: type === 'income' ? 'var(--teal)' : undefined, color: type === 'income' ? 'var(--bg)' : undefined }}
            onClick={() => setType('income')}
          >
            Income
          </button>
        </div>

        <input type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date</label>
          <DateField value={date} max={todayStr} onChange={setDate} />
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Bank</label>
          <select
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 15 }}
          >
            {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {type === 'expense' && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {categories.map((c) => (
                <button
                  key={c}
                  className={`chip ${category === c ? 'chip--active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
              {!addingCategory && (
                <button className="chip" onClick={() => setAddingCategory(true)}>+ New category</button>
              )}
            </div>
            {addingCategory && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="e.g. Household Exp"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  style={{ flex: '1 1 140px' }}
                  autoFocus
                />
                <input
                  type="number"
                  placeholder="Monthly limit (optional)"
                  value={newCategoryLimit}
                  onChange={(e) => setNewCategoryLimit(e.target.value)}
                  style={{ flex: '1 1 140px' }}
                />
                <button className="btn btn--teal" style={{ padding: '8px 16px' }} onClick={saveNewCategory}>Add</button>
                <button className="btn btn--ghost" style={{ padding: '8px 16px' }} onClick={() => setAddingCategory(false)}>Cancel</button>
              </div>
            )}
          </div>
        )}

        <input type="text" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn--ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            className="btn btn--teal"
            style={{ flex: 1 }}
            onClick={() => {
              const numAmount = parseFloat(amount);
              if (!numAmount || numAmount <= 0) return;
              onSubmit({
                type,
                amount: numAmount,
                category: type === 'expense' ? category : 'Income',
                bankName: bank,
                date,
                note,
              });
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function DateField({ value, max, onChange }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="date-field-input"
        style={{ width: '100%', paddingRight: 40 }}
      />
      <svg
        width="18" height="18" viewBox="0 0 24 24" fill="none"
        style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      >
        <rect x="3" y="5" width="18" height="16" rx="3" stroke="var(--teal)" strokeWidth="1.8" />
        <path d="M3 9.5H21" stroke="var(--teal)" strokeWidth="1.8" />
        <path d="M8 3V6.5M16 3V6.5" stroke="var(--teal)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}
