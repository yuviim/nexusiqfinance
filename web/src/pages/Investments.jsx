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
  const { data, derived, markSip, addHolding, updateHolding, deleteHolding, addGoal, deleteGoal, setProfile, addSipPlan, updateSipPlan, deleteSipPlan, addRecurringDeposit, updateRecurringDeposit, deleteRecurringDeposit, refresh } = useWealth();
  const { token } = useAuth();
  const holdings = data.investments.holdings;
  const total = derived.totalInvestments || 1;

  const [name, setName] = useState('');
  const [category, setCategory] = useState(HOLDING_CATEGORIES[0]);
  const [value, setValue] = useState('');
  const [holdingGoalId, setHoldingGoalId] = useState('');
  const [isForeign, setIsForeign] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);
  const [editingHoldingId, setEditingHoldingId] = useState(null);
  const [dipCheckBusy, setDipCheckBusy] = useState(false);
  const [dipResults, setDipResults] = useState(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestReply, setSuggestReply] = useState(null);

  const createHolding = async () => {
    if (!name.trim() || !value) return;
    await addHolding({
      name: name.trim(),
      category,
      value: parseFloat(value),
      goalId: holdingGoalId ? parseInt(holdingGoalId, 10) : null,
      isForeign,
      purchaseDate: purchaseDate || null,
      purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
      ticker: ticker.trim() || null,
      quantity: quantity ? parseFloat(quantity) : null,
    });
    setName('');
    setValue('');
    setHoldingGoalId('');
    setIsForeign(false);
    setPurchaseDate('');
    setPurchasePrice('');
    setTicker('');
    setQuantity('');
  };

  const refreshPrices = async () => {
    setRefreshBusy(true);
    setRefreshMessage(null);
    try {
      const res = await api.refreshHoldingPrices(token);
      if (res.note) {
        setRefreshMessage(res.note);
      } else {
        const parts = [];
        if (res.updated?.length) parts.push(`Updated ${res.updated.length}: ${res.updated.map((u) => u.ticker).join(', ')}`);
        if (res.failed?.length) parts.push(`Couldn't fetch: ${res.failed.join(', ')}`);
        setRefreshMessage(parts.join(' · ') || 'Nothing to update.');
      }
      await refresh();
    } catch (e) {
      setRefreshMessage(e.message);
    } finally {
      setRefreshBusy(false);
    }
  };

  const checkDips = async () => {
    setDipCheckBusy(true);
    setDipResults(null);
    try {
      const res = await api.checkDips(token);
      setDipResults(res);
    } catch (e) {
      setDipResults({ error: e.message });
    } finally {
      setDipCheckBusy(false);
    }
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
        <SipPlanList
          plans={data.sipPlans}
          goals={data.goals}
          holdings={data.investments.holdings}
          onAdd={addSipPlan}
          onMarkPaid={(id) => updateSipPlan(id, { markPaid: true })}
          onDelete={deleteSipPlan}
        />
      </Card>

      <SectionLabel style={{ marginLeft: 2 }}>Recurring deposits (RD)</SectionLabel>
      <Card>
        <RecurringDepositList
          deposits={data.recurringDeposits}
          goals={data.goals}
          onAdd={addRecurringDeposit}
          onMarkDeposited={(id) => updateRecurringDeposit(id, { markDeposited: true })}
          onDelete={deleteRecurringDeposit}
        />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: 2 }}>
        <SectionLabel style={{ margin: 0 }}>Holdings</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={checkDips} disabled={dipCheckBusy}>
            {dipCheckBusy ? 'Checking…' : '📉 Check for dip opportunities'}
          </button>
          <button className="btn btn--ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={refreshPrices} disabled={refreshBusy}>
            {refreshBusy ? 'Refreshing…' : '↻ Refresh live prices'}
          </button>
        </div>
      </div>
      {refreshMessage && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 2px 8px' }}>{refreshMessage}</p>
      )}
      {dipResults && (
        <div style={{ margin: '4px 2px 8px' }}>
          {dipResults.error ? (
            <p style={{ fontSize: 12, color: 'var(--rose)', margin: 0 }}>{dipResults.error}</p>
          ) : dipResults.dips.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              Nothing down {dipResults.dropThresholdPct}%+ from its 3-month high right now.
            </p>
          ) : (
            dipResults.dips.map((d) => (
              <div key={d.ticker} className="card" style={{ padding: '10px 14px', marginBottom: 6, background: 'var(--amber-dim)' }}>
                <span style={{ fontSize: 13 }}>
                  <strong>{d.name}</strong> ({d.ticker}) is down <strong>{d.pctDrop}%</strong> from its 3-month high
                  (${d.threeMonthHighUsd.toFixed(2)} → ${d.currentPriceUsd.toFixed(2)}) — you have{' '}
                  <strong>{formatINR(dipResults.unallocatedSurplus)}</strong> of unallocated surplus. Want to add more?
                </span>
              </div>
            ))
          )}
        </div>
      )}
      <Card>
        {holdings.map((h, idx) => {
          const linkedGoal = data.goals.find((g) => g.id === h.goalId);
          const hasCostBasis = h.purchaseDate && h.purchasePrice != null;
          if (editingHoldingId === h.id) {
            return (
              <div key={h.id}>
                {idx > 0 && <Divider />}
                <HoldingEditForm
                  holding={h}
                  goals={data.goals}
                  onSave={async (patch) => {
                    await updateHolding(h.id, patch);
                    setEditingHoldingId(null);
                  }}
                  onCancel={() => setEditingHoldingId(null)}
                />
              </div>
            );
          }
          return (
            <div key={h.id}>
              {idx > 0 && <Divider />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{h.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {h.category}
                    {linkedGoal ? ` · → ${linkedGoal.name}` : ' · General / no goal'}
                    {h.isForeign ? ' · Foreign asset' : ''}
                    {h.ticker && h.quantity ? ` · ${h.ticker} × ${h.quantity}` : ''}
                  </div>
                  {hasCostBasis && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: h.unrealizedGain >= 0 ? 'var(--teal)' : 'var(--rose)' }}>
                        {h.unrealizedGain >= 0 ? '+' : ''}{formatINR(h.unrealizedGain)} unrealized
                      </span>
                      <Pill tone={h.isLongTerm ? 'good' : 'neutral'}>{h.isLongTerm ? 'Long-term' : 'Short-term'}</Pill>
                      {h.scheduleFARequired && <Pill tone="warn">Schedule FA</Pill>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(h.value)}</div>
                  <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEditingHoldingId(h.id)}>Edit</button>
                  <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => deleteHolding(h.id)}>✕</button>
                </div>
              </div>
            </div>
          );
        })}
        <Divider />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input type="text" placeholder="Holding name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 140px' }} />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}
          >
            {HOLDING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input type="number" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: '1 1 120px' }} />
          <select
            value={holdingGoalId}
            onChange={(e) => setHoldingGoalId(e.target.value)}
            style={{ background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}
            title="Optional — which goal this holding counts toward"
          >
            <option value="">General / no specific goal</option>
            {data.goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={isForeign} onChange={(e) => setIsForeign(e.target.checked)} />
            Foreign asset (e.g. US stock)
          </label>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            title="Purchase date (optional — enables gain/holding-period tracking)"
            style={{ flex: '1 1 140px' }}
          />
          <input
            type="number"
            placeholder="Cost basis (total paid)"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            style={{ flex: '1 1 150px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <input
            type="text"
            placeholder="Ticker (e.g. AMD)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            title="Optional — pair with quantity to enable one-click live price refresh (foreign/US stocks only)"
            style={{ flex: '1 1 130px' }}
          />
          <input
            type="number"
            placeholder="Shares held"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ flex: '1 1 120px' }}
          />
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
          const linkedSipTotal = data.sipPlans.filter((p) => p.goalId === g.id).reduce((s, p) => s + p.amount, 0);
          const pace = computeGoalPace(g, linkedSipTotal);
          return (
            <Card key={g.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>{g.name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>{Math.round(pct * 100)}%</span>
                  <button className="btn btn--ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => { if (window.confirm(`Delete goal "${g.name}"?`)) deleteGoal(g.id); }}>✕</button>
                </span>
              </div>
              <ProgressBar pct={pct} accent={g.color} height={10} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ fontSize: 13 }}>
                  {formatINR(g.current)} <span style={{ color: 'var(--text-secondary)' }}>of {formatINR(g.target)}</span>
                  {g.targetDate && (
                    <span style={{ color: 'var(--text-secondary)' }}> · by {new Date(g.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                  )}
                </div>
                {pace && <Pill tone={pace.tone}>{pace.label}</Pill>}
              </div>
              {pace?.detail && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{pace.detail}</p>
              )}
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

function computeGoalPace(goal, linkedSipTotal) {
  const remaining = Math.max(0, goal.target - goal.current);
  if (remaining <= 0) return { tone: 'good', label: 'Achieved' };
  if (!goal.targetDate) {
    return linkedSipTotal > 0
      ? { tone: 'neutral', label: `${formatINR(linkedSipTotal)}/mo linked` }
      : { tone: 'neutral', label: 'No target date', detail: 'Add a target date to see whether your linked SIP is on pace.' };
  }
  const now = new Date();
  const target = new Date(goal.targetDate);
  const monthsRemaining = Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
  const requiredMonthly = remaining / monthsRemaining;

  if (target < now) {
    return { tone: 'alert', label: 'Overdue', detail: `Target date has passed with ${formatINR(remaining)} still to go.` };
  }
  if (linkedSipTotal <= 0) {
    return { tone: 'warn', label: 'No SIP linked', detail: `You'd need ${formatINR(requiredMonthly)}/mo to hit this on time — link a SIP above.` };
  }
  if (linkedSipTotal >= requiredMonthly) {
    return { tone: 'good', label: 'On track', detail: `${formatINR(linkedSipTotal)}/mo linked, ${formatINR(requiredMonthly)}/mo needed.` };
  }
  return { tone: 'warn', label: 'Behind pace', detail: `${formatINR(linkedSipTotal)}/mo linked, but ${formatINR(requiredMonthly)}/mo needed to hit this on time.` };
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

function HoldingEditForm({ holding, goals, onSave, onCancel }) {
  const [name, setName] = useState(holding.name);
  const [category, setCategory] = useState(holding.category);
  const [value, setValue] = useState(String(holding.value));
  const [goalId, setGoalId] = useState(holding.goalId ? String(holding.goalId) : '');
  const [isForeign, setIsForeign] = useState(holding.isForeign);
  const [purchaseDate, setPurchaseDate] = useState(holding.purchaseDate || '');
  const [purchasePrice, setPurchasePrice] = useState(holding.purchasePrice != null ? String(holding.purchasePrice) : '');
  const [ticker, setTicker] = useState(holding.ticker || '');
  const [quantity, setQuantity] = useState(holding.quantity != null ? String(holding.quantity) : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave({
      name: name.trim() || holding.name,
      category,
      value: parseFloat(value) || 0,
      goalId: goalId ? parseInt(goalId, 10) : null,
      isForeign,
      purchaseDate: purchaseDate || null,
      purchasePrice: purchasePrice !== '' ? parseFloat(purchasePrice) : null,
      ticker: ticker.trim() || null,
      quantity: quantity !== '' ? parseFloat(quantity) : null,
    });
    setSaving(false);
  };

  const selectStyle = { background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '0 10px' };

  return (
    <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Editing "{holding.name}"</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Holding name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 140px' }} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          {HOLDING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input type="number" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: '1 1 120px' }} />
        <select value={goalId} onChange={(e) => setGoalId(e.target.value)} style={selectStyle}>
          <option value="">General / no specific goal</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={isForeign} onChange={(e) => setIsForeign(e.target.checked)} />
          Foreign asset (e.g. US stock)
        </label>
        <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} style={{ flex: '1 1 140px' }} title="Purchase date" />
        <input type="number" placeholder="Cost basis (total paid)" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} style={{ flex: '1 1 150px' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Ticker (e.g. AMD)" value={ticker} onChange={(e) => setTicker(e.target.value)} style={{ flex: '1 1 130px' }} />
        <input type="number" placeholder="Shares held" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ flex: '1 1 120px' }} />
        <button className="btn btn--ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn--teal" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function SipPlanList({ plans, goals, holdings, onAdd, onMarkPaid, onDelete }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [goalId, setGoalId] = useState('');
  const [linkedHoldingId, setLinkedHoldingId] = useState('');

  const create = async () => {
    if (!name.trim() || !amount) return;
    await onAdd({
      name: name.trim(),
      amount: parseFloat(amount),
      goalId: goalId ? parseInt(goalId, 10) : null,
      linkedHoldingId: linkedHoldingId ? parseInt(linkedHoldingId, 10) : null,
    });
    setName('');
    setAmount('');
    setGoalId('');
    setLinkedHoldingId('');
  };

  const goalName = (id) => goals.find((g) => g.id === id)?.name;
  const holdingName = (id) => holdings.find((h) => h.id === id)?.name;
  const currentMonthKey = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;

  return (
    <>
      {plans.length === 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)' }}>No additional SIPs yet.</p>
      )}
      {plans.map((p, idx) => {
        const paidThisMonth = p.lastPaidMonth === currentMonthKey;
        return (
          <div key={p.id}>
            {idx > 0 && <Divider />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {p.goalId && goalName(p.goalId) ? `→ ${goalName(p.goalId)}` : ''}
                  {p.goalId && p.linkedHoldingId ? ' · ' : ''}
                  {p.linkedHoldingId && holdingName(p.linkedHoldingId) ? `funds: ${holdingName(p.linkedHoldingId)}` : ''}
                  {!p.goalId && !p.linkedHoldingId ? 'Not linked to a goal or holding' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(p.amount)}</div>
                {paidThisMonth ? (
                  <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>Paid ✓</span>
                ) : (
                  <button className="btn btn--teal" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => onMarkPaid(p.id)}>
                    Mark as paid
                  </button>
                )}
                <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onDelete(p.id)}>✕</button>
              </div>
            </div>
          </div>
        );
      })}
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
        <select
          value={linkedHoldingId}
          onChange={(e) => setLinkedHoldingId(e.target.value)}
          style={{ background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}
          title="Optional — which holding actually receives this SIP's money"
        >
          <option value="">No linked fund</option>
          {holdings.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <button className="btn btn--teal" onClick={create}>Add</button>
      </div>
    </>
  );
}

function RecurringDepositList({ deposits, goals, onAdd, onMarkDeposited, onDelete }) {
  const [name, setName] = useState('');
  const [bank, setBank] = useState(BANK_NAMES[0]);
  const [amount, setAmount] = useState('');
  const [goalId, setGoalId] = useState('');

  const create = async () => {
    if (!name.trim() || !amount) return;
    await onAdd({ name: name.trim(), bankName: bank, amount: parseFloat(amount), goalId: goalId ? parseInt(goalId, 10) : null });
    setName('');
    setAmount('');
    setGoalId('');
  };

  const goalName = (id) => goals.find((g) => g.id === id)?.name;
  const currentMonthKey = `${new Date().getFullYear()}-${new Date().getMonth() + 1}`;

  return (
    <>
      {deposits.length === 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)' }}>No recurring deposits yet.</p>
      )}
      {deposits.map((rd, idx) => {
        const depositedThisMonth = rd.lastDepositedMonth === currentMonthKey;
        return (
          <div key={rd.id}>
            {idx > 0 && <Divider />}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{rd.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {rd.bankName}
                  {rd.goalId && goalName(rd.goalId) ? ` · → ${goalName(rd.goalId)}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(rd.amount)}</div>
                {depositedThisMonth ? (
                  <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>Deposited ✓</span>
                ) : (
                  <button className="btn btn--teal" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => onMarkDeposited(rd.id)}>
                    Mark as deposited
                  </button>
                )}
                <button className="btn btn--ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onDelete(rd.id)}>✕</button>
              </div>
            </div>
          </div>
        );
      })}
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

function NewGoalModal({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [color, setColor] = useState('teal');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>New goal</h2>
        <input type="text" placeholder="Goal name" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" placeholder="Target amount" value={target} onChange={(e) => setTarget(e.target.value)} />
        <input type="number" placeholder="Current amount saved" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            Target date (optional — enables on-track/behind tracking)
          </label>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
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
              onSubmit({ name: name.trim(), target: t, current: parseFloat(current) || 0, targetDate: targetDate || null, color });
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
