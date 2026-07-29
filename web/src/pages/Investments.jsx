import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, SectionLabel, ProgressBar, Pill, Divider } from '../components/ui';
import '../components/markdown.css';
import { useWealth } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { api } from '../api/client';
import { formatINR } from '../format';
import { BANK_NAMES } from './BankAccounts';

const ALLOCATION_COLORS = ['teal', 'violet', 'amber', 'rose', 'teal'];
const HOLDING_CATEGORIES = ['Mutual Funds', 'Stocks', 'PPF', 'EPF', 'Gold', 'Other'];
const RISK_PROFILES = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'aggressive', label: 'Aggressive' },
];
const GOAL_ACCENTS = ['teal', 'amber', 'violet', 'rose'];
const GOAL_ACCENT_VAR = { teal: 'var(--teal)', amber: 'var(--amber)', violet: 'var(--violet)', rose: 'var(--rose)' };

export default function Investments() {
  const { data, derived, markSip, addHolding, deleteHolding, addGoal, setProfile, addSipPlan, deleteSipPlan, addRecurringDeposit, deleteRecurringDeposit } = useWealth();
  const { token } = useAuth();
  const holdings = data.investments.holdings;
  const total = derived.totalInvestments || 1;

  const [name, setName] = useState('');
  const [category, setCategory] = useState(HOLDING_CATEGORIES[0]);
  const [value, setValue] = useState('');
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestReply, setSuggestReply] = useState(null);

  const createHolding = async () => {
    if (!name.trim() || !value) return;
    await addHolding({ name: name.trim(), category, value: parseFloat(value) });
    setName('');
    setValue('');
  };

  const askForSuggestions = async () => {
    setSuggestBusy(true);
    setSuggestReply(null);
    try {
      const res = await api.askAdvisor(
        token,
        'Given my current investment allocation, risk profile, and any surplus, where should I be investing right now? Be specific.'
      );
      setSuggestReply(res.reply);
    } catch (e) {
      setSuggestReply(e.message);
    } finally {
      setSuggestBusy(false);
    }
  };

  const allocations = useMemo(() => {
    const byCategory = {};
    holdings.forEach((h) => {
      byCategory[h.category] = (byCategory[h.category] || 0) + h.value;
    });
    return Object.entries(byCategory)
      .map(([category, value], i) => ({ category, value, pct: value / total, accent: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, total]);

  return (
    <div className="stack">
      <h1 className="page-title">Investments</h1>

      <Card>
        <SectionLabel>Risk profile</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {RISK_PROFILES.map((r) => (
            <button
              key={r.value}
              className={`btn ${data.profile.riskProfile === r.value ? 'btn--teal' : 'btn--ghost'}`}
              style={{ flex: 1 }}
              onClick={() => setProfile({ riskProfile: r.value })}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>Total investments</SectionLabel>
        <div style={{ fontWeight: 700, fontSize: 28 }}>{formatINR(derived.totalInvestments)}</div>
      </Card>

      <Card>
        <SectionLabel>Portfolio allocation</SectionLabel>
        {allocations.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>No holdings added yet.</p>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {allocations.map((a) => (
              <div key={a.category}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span>{a.category}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{Math.round(a.pct * 100)}%</span>
                </div>
                <ProgressBar pct={a.pct} accent={a.accent} height={6} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="page-header-row" style={{ marginBottom: suggestReply ? 12 : 0 }}>
          <SectionLabel style={{ margin: 0 }}>Where should I invest?</SectionLabel>
          <button className="btn btn--teal btn--pill" onClick={askForSuggestions} disabled={suggestBusy}>
            {suggestBusy ? 'Thinking…' : 'Ask advisor'}
          </button>
        </div>
        {!!suggestReply && (
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{suggestReply}</ReactMarkdown>
          </div>
        )}
      </Card>

      <SipCard
        amount={data.investments.sipMonthly}
        paid={derived.sipPaidThisMonth}
        onSave={(amt) => setProfile({ sipMonthly: amt })}
        onMarkDone={() => markSip(!derived.sipPaidThisMonth)}
      />

      <SectionLabel style={{ marginLeft: 2 }}>Other SIPs</SectionLabel>
      <Card>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Add as many SIPs as you like — each one can optionally be linked to a goal above.
        </p>
        <SipPlanList plans={data.sipPlans} goals={data.goals} onAdd={addSipPlan} onDelete={deleteSipPlan} />
      </Card>

      <SectionLabel style={{ marginLeft: 2 }}>Recurring deposits (RD)</SectionLabel>
      <Card>
        <RecurringDepositList deposits={data.recurringDeposits} onAdd={addRecurringDeposit} onDelete={deleteRecurringDeposit} />
      </Card>

      <SectionLabel style={{ marginLeft: 2 }}>Holdings</SectionLabel>
      <Card>
        {holdings.map((h, idx) => (
          <div key={h.id}>
            {idx > 0 && <Divider />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{h.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{h.category}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(h.value)}</div>
                <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => deleteHolding(h.id)}>✕</button>
              </div>
            </div>
          </div>
        ))}
        <Divider />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Holding name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 140px' }} />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}
          >
            {HOLDING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input type="number" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: '1 1 120px' }} />
          <button className="btn btn--teal" onClick={createHolding}>Add</button>
        </div>
      </Card>

      <div className="page-header-row" style={{ marginTop: 4 }}>
        <SectionLabel style={{ margin: 0, marginLeft: 2 }}>Goals</SectionLabel>
        <button className="btn btn--amber btn--pill" onClick={() => setGoalModalOpen(true)}>+ New goal</button>
      </div>
      <div className="stack">
        {data.goals.length === 0 && (
          <Card><p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>No goals yet.</p></Card>
        )}
        {data.goals.map((g) => {
          const pct = g.target ? g.current / g.target : 0;
          return (
            <Card key={g.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>{g.name}</span>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>{Math.round(pct * 100)}%</span>
              </div>
              <ProgressBar pct={pct} accent={g.color} height={10} />
              <div style={{ fontSize: 13, marginTop: 8 }}>
                {formatINR(g.current)} <span style={{ color: 'var(--text-secondary)' }}>of {formatINR(g.target)}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {goalModalOpen && (
        <NewGoalModal
          onClose={() => setGoalModalOpen(false)}
          onSubmit={(g) => { addGoal(g); setGoalModalOpen(false); }}
        />
      )}
    </div>
  );
}

function SipCard({ amount, paid, onSave, onMarkDone }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(amount || ''));

  const save = () => {
    onSave(parseFloat(value) || 0);
    setEditing(false);
  };

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <SectionLabel style={{ marginBottom: 2 }}>Monthly SIP</SectionLabel>
          {editing ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <input
                type="number"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                style={{ maxWidth: 160 }}
              />
              <button className="btn btn--teal" style={{ padding: '8px 14px' }} onClick={save}>Save</button>
              <button className="btn btn--ghost" style={{ padding: '8px 14px' }} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 22 }}>{formatINR(amount)}</div>
              <button
                className="btn btn--ghost"
                style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => { setValue(String(amount || '')); setEditing(true); }}
              >
                Edit
              </button>
            </div>
          )}
        </div>
        {!editing && (
          <button
            className="btn btn--pill"
            style={{ background: paid ? 'var(--bg-elevated-2)' : undefined, color: paid ? 'var(--teal)' : undefined }}
            onClick={onMarkDone}
          >
            {paid ? 'Logged ✓' : 'Mark as done'}
          </button>
        )}
      </div>
      {!paid && !editing && <Pill tone="warn">SIP due this month</Pill>}
    </Card>
  );
}

function SipPlanList({ plans, goals, onAdd, onDelete }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [goalId, setGoalId] = useState('');

  const create = async () => {
    if (!name.trim() || !amount) return;
    await onAdd({ name: name.trim(), amount: parseFloat(amount), goalId: goalId ? parseInt(goalId, 10) : null });
    setName('');
    setAmount('');
    setGoalId('');
  };

  const goalName = (id) => goals.find((g) => g.id === id)?.name;

  return (
    <>
      {plans.length === 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)' }}>No additional SIPs yet.</p>
      )}
      {plans.map((p, idx) => (
        <div key={p.id}>
          {idx > 0 && <Divider />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
              {!!p.goalId && goalName(p.goalId) && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>→ {goalName(p.goalId)}</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(p.amount)}</div>
              <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onDelete(p.id)}>✕</button>
            </div>
          </div>
        </div>
      ))}
      {plans.length > 0 && <Divider />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="text" placeholder="SIP name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 140px' }} />
        <input type="number" placeholder="Monthly amount" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: '1 1 130px' }} />
        <select
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          style={{ background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}
        >
          <option value="">No linked goal</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button className="btn btn--teal" onClick={create}>Add</button>
      </div>
    </>
  );
}

function RecurringDepositList({ deposits, onAdd, onDelete }) {
  const [name, setName] = useState('');
  const [bank, setBank] = useState(BANK_NAMES[0]);
  const [amount, setAmount] = useState('');

  const create = async () => {
    if (!name.trim() || !amount) return;
    await onAdd({ name: name.trim(), bankName: bank, amount: parseFloat(amount) });
    setName('');
    setAmount('');
  };

  return (
    <>
      {deposits.length === 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)' }}>No recurring deposits yet.</p>
      )}
      {deposits.map((rd, idx) => (
        <div key={rd.id}>
          {idx > 0 && <Divider />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{rd.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{rd.bankName}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(rd.amount)}</div>
              <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onDelete(rd.id)}>✕</button>
            </div>
          </div>
        </div>
      ))}
      {deposits.length > 0 && <Divider />}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="text" placeholder="RD name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 140px' }} />
        <select
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          style={{ background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}
        >
          {BANK_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <input type="number" placeholder="Monthly amount" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: '1 1 130px' }} />
        <button className="btn btn--teal" onClick={create}>Add</button>
      </div>
    </>
  );
}

function NewGoalModal({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [color, setColor] = useState('teal');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>New goal</h2>
        <input type="text" placeholder="Goal name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" placeholder="Target amount" value={target} onChange={(e) => setTarget(e.target.value)} />
        <input type="number" placeholder="Current amount saved" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <div style={{ display: 'flex', gap: 10 }}>
          {GOAL_ACCENTS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 32, height: 32, borderRadius: 16, background: GOAL_ACCENT_VAR[c], border: '2px solid',
                borderColor: color === c ? 'var(--text-primary)' : 'transparent', padding: 0,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn--ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            className="btn btn--amber"
            style={{ flex: 1 }}
            onClick={() => {
              const t = parseFloat(target);
              if (!name.trim() || !t) return;
              onSubmit({ name: name.trim(), target: t, current: parseFloat(current) || 0, color });
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
