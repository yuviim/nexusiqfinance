import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../components/markdown.css';
import { useAuth } from '../store/AuthContext';
import { useWealth } from '../store/DataContext';
import { api } from '../api/client';
import { formatINR } from '../format';

const ACTION_CARDS = [
  {
    key: 'budget', label: 'Budget & Spend', sub: 'Understand your spending and budgets',
    question: 'How am I doing on my budget this month? Break it down by category.',
    icon: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  },
  {
    key: 'invest', label: 'Investments', sub: 'Track performance and allocations',
    question: 'Given my current allocation, risk profile, and surplus, where should I invest right now?',
    icon: <path d="M4 17l5-5 4 4 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  },
  {
    key: 'tax', label: 'Tax', sub: 'Plan, save and stay on top of it',
    question: 'Walk me through my tax situation — which regime is better, and am I on track with TDS?',
    icon: <path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2V4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />,
  },
];

const SUGGESTIONS = [
  'Am I saving enough this month?',
  'Should I pay off a loan faster or invest?',
  'How am I doing on my goals?',
  'Surplus this month?',
  'Tax saving opportunities',
  'Retirement planning',
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function monthSavingsRate(transactions, income, sip, year, month) {
  const tx = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const spent = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const denom = income || 1;
  return Math.max(Math.round(((denom - spent - sip) / denom) * 100), 0);
}

export default function Advisor() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { data, derived, refresh } = useWealth();
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const isFirstRender = useRef(true);

  const hasConversation = messages.length > 0;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const autoGrow = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const send = async (overrideText) => {
    const question = (overrideText ?? input).trim();
    if (!question || busy) return;
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setBusy(true);
    setError(null);
    try {
      const res = await api.askAdvisor(token, question);
      setMessages((m) => [...m, { role: 'assistant', text: res.reply }]);
      if (res.created) await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => {
    if (messages.length > 0) {
      const firstUser = messages.find((m) => m.role === 'user');
      setHistory((h) => [{ id: Date.now(), title: firstUser ? firstUser.text : 'Conversation', messages }, ...h]);
    }
    setMessages([]);
    setError(null);
    setInput('');
  };

  const openHistoryItem = (item) => {
    if (messages.length > 0) {
      const firstUser = messages.find((m) => m.role === 'user');
      setHistory((h) => [{ id: Date.now(), title: firstUser ? firstUser.text : 'Conversation', messages }, ...h.filter((x) => x.id !== item.id)]);
    } else {
      setHistory((h) => h.filter((x) => x.id !== item.id));
    }
    setMessages(item.messages);
    setError(null);
  };

  const now = new Date();
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevSavingsRate = useMemo(
    () => monthSavingsRate(data.transactions, data.profile.monthlyIncome, data.investments.sipMonthly || 0, prevDate.getFullYear(), prevDate.getMonth()),
    [data.transactions, data.profile.monthlyIncome, data.investments.sipMonthly]
  );
  const savingsDelta = derived.savingsRate - prevSavingsRate;

  const surplusUnallocated = useMemo(() => {
    const categoryBudgetTotal = data.budgets.reduce((s, b) => s + b.limit, 0);
    const recurringBillsTotal = data.recurringExpenses.reduce((s, r) => s + r.amount, 0);
    const monthlyIncome = data.profile.monthlyIncome || 0;
    const surplus = monthlyIncome - categoryBudgetTotal - recurringBillsTotal;
    const committed =
      (data.investments.sipMonthly || 0) +
      data.sipPlans.reduce((s, p) => s + p.amount, 0) +
      data.recurringDeposits.reduce((s, r) => s + r.amount, 0);
    return surplus - committed;
  }, [data]);

  const biggestSpend = useMemo(() => {
    const entries = Object.entries(derived.spendByCategory || {});
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return { category: entries[0][0], amount: entries[0][1] };
  }, [derived.spendByCategory]);

  const tip = useMemo(() => {
    if (surplusUnallocated > 0) {
      return { text: `You have ${formatINR(surplusUnallocated)} of surplus not yet assigned to a goal.`, cta: 'Add a SIP or RD', to: '/investments' };
    }
    const highInterestLoan = data.recurringExpenses.find((r) => r.category === 'Loan EMI' && r.interestRate > 10 && r.outstandingBalance > 0);
    if (highInterestLoan) {
      return { text: `"${highInterestLoan.name}" is at ${highInterestLoan.interestRate}% interest — prepaying it may beat what you'd earn investing.`, cta: 'Ask the advisor', to: null };
    }
    return { text: "Your surplus is fully allocated and no loan stands out as high-interest — you're in a solid spot.", cta: null, to: null };
  }, [surplusUnallocated, data.recurringExpenses]);

  const dataSourceRows = [
    { label: 'Bank accounts', count: data.bankAccounts.length, to: '/banks' },
    { label: 'Investments', count: data.investments.holdings.length, to: '/investments' },
    { label: 'Recurring bills', count: data.recurringExpenses.length, to: '/budget' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 260px', gap: 20, height: 'calc(100vh - 160px)' }}>

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <button className="btn btn--teal" style={{ marginBottom: 16 }} onClick={newChat} disabled={busy}>+ New chat</button>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.5, marginBottom: 8 }}>HISTORY</div>
        <div style={{ overflowY: 'auto', marginBottom: 20 }}>
          {history.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>No past questions yet this session.</p>
          )}
          {history.map((item) => (
            <div
              key={item.id}
              onClick={() => openHistoryItem(item)}
              style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated-2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {item.title}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.5, marginBottom: 8 }}>DATA SOURCES</div>
        <div>
          {dataSourceRows.map((row) => (
            <div
              key={row.label}
              onClick={() => navigate(row.to)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2 }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated-2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span>{row.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{row.count}</span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: row.count > 0 ? 'var(--teal)' : 'var(--text-faint)' }} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: hasConversation ? 'flex-start' : 'center',
        }}>
          {!hasConversation ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 15, background: 'var(--accent-gradient)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="white" />
                </svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>{greeting()}, {data.profile.name}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Ask questions about your money and get insights instantly.</p>

              <div className="row" style={{ marginBottom: 20 }}>
                {ACTION_CARDS.map((card) => (
                  <div key={card.key} className="card" style={{ cursor: 'pointer', textAlign: 'left', padding: '16px 18px' }} onClick={() => send(card.question)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" style={{ color: 'var(--teal)', marginBottom: 8 }}>{card.icon}</svg>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{card.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{card.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {SUGGESTIONS.map((q) => (
                  <button key={q} className="chip" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {messages.map((m, i) => (
                <ChatRow key={i} role={m.role} text={m.text} />
              ))}
              {busy && <ThinkingRow />}
              {!!error && (
                <div style={{ display: 'flex', gap: 12, padding: '14px 4px' }}>
                  <Avatar role="assistant" />
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <p style={{ margin: 0, color: 'var(--rose)', fontSize: 14 }}>{error}</p>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, paddingTop: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 10, background: 'var(--bg-elevated)',
            border: '1px solid var(--hairline)', borderRadius: 20, padding: '10px 10px 10px 16px',
          }}>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Ask anything about your money…"
              value={input}
              onChange={(e) => { setInput(e.target.value); autoGrow(e.target); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
                color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.5,
                maxHeight: 160, padding: '6px 0',
              }}
            />
            <button
              className="btn btn--teal"
              style={{ borderRadius: '50%', width: 40, height: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              onClick={() => send()}
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', margin: '8px 0 0' }}>
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.5, marginBottom: 10 }}>INSIGHTS</div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Savings rate</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--teal)', marginTop: 2 }}>{derived.savingsRate}%</div>
          {savingsDelta !== 0 && (
            <div style={{ fontSize: 11, color: savingsDelta > 0 ? 'var(--teal)' : 'var(--rose)', marginTop: 4 }}>
              {savingsDelta > 0 ? '↑' : '↓'} {Math.abs(savingsDelta)}% vs last month
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Surplus (unallocated)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: surplusUnallocated > 0 ? 'var(--amber)' : 'var(--text-primary)', marginTop: 2 }}>{formatINR(surplusUnallocated)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>This month</div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Biggest spend</div>
          {biggestSpend ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{biggestSpend.category}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{formatINR(biggestSpend.amount)}</div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>Nothing logged yet</div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Financial health</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{derived.financialHealthScore}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>/100</span></div>
          <div style={{ height: 5, background: 'var(--bg-elevated-2)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${derived.financialHealthScore}%`, background: 'var(--teal)' }} />
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Tip for you</div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>{tip.text}</p>
          {tip.cta && (
            <button
              className="btn btn--ghost"
              style={{ fontSize: 12, padding: '6px 10px' }}
              onClick={() => (tip.to ? navigate(tip.to) : send('Where should I invest my unallocated surplus?'))}
            >
              {tip.cta} →
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

function ChatRow({ role, text }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 4px', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <Avatar role={role} />
      <div style={{ maxWidth: '82%', paddingTop: 4 }}>
        {isUser ? (
          <div style={{ background: 'var(--teal-dim)', borderRadius: 16, padding: '10px 14px', fontSize: 14.5, whiteSpace: 'pre-wrap' }}>
            {text}
          </div>
        ) : (
          <div className="markdown" style={{ fontSize: 14.5 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingRow() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 4px' }}>
      <Avatar role="assistant" />
      <div style={{ paddingTop: 10 }}>
        <span className="thinking-dots">
          <style>{`
            .thinking-dots span {
              display: inline-block;
              width: 6px;
              height: 6px;
              margin-right: 4px;
              border-radius: 50%;
              background: var(--text-faint);
              animation: thinking-bounce 1.2s infinite ease-in-out;
            }
            .thinking-dots span:nth-child(2) { animation-delay: 0.15s; }
            .thinking-dots span:nth-child(3) { animation-delay: 0.3s; }
            @keyframes thinking-bounce {
              0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
              40% { opacity: 1; transform: translateY(-3px); }
            }
          `}</style>
          <span></span><span></span><span></span>
        </span>
      </div>
    </div>
  );
}

function Avatar({ role }) {
  if (role === 'user') {
    return (
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-elevated-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
        You
      </div>
    );
  }
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="white" />
      </svg>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 12L20 4L13 20L11 13L4 12Z" fill="white" />
    </svg>
  );
}
