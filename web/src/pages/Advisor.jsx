import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../components/markdown.css';
import { useAuth } from '../store/AuthContext';
import { useWealth } from '../store/DataContext';
import { api } from '../api/client';

const WELCOME = "I'm your financial advisor. I can see your budget, banks, investments, goals, and tax — ask me anything, or tell me about a transaction and I'll log it for you.";

const CONNECTED = ['Budget', 'Banks', 'Transactions', 'Investments', 'Goals', 'Tax'];

const ACTION_CARDS = [
  { key: 'budget', label: 'Budget & Spend', sub: 'This month', question: 'How am I doing on my budget this month? Break it down by category.' },
  { key: 'invest', label: 'Investments', sub: 'Where to invest', question: 'Given my current allocation, risk profile, and surplus, where should I invest right now?' },
  { key: 'tax', label: 'Tax', sub: 'Regime & TDS', question: 'Walk me through my tax situation — which regime is better, and am I on track with TDS?' },
];

const SUGGESTIONS = [
  'Am I saving enough this month?',
  'Should I pay off a loan faster or invest?',
  'How am I doing on my goals?',
  'Add food cost 480 california burrito',
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Advisor() {
  const { token } = useAuth();
  const { data, refresh } = useWealth();
  const [messages, setMessages] = useState([]);
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
    setMessages([]);
    setError(null);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
      <div className="page-header-row" style={{ flexShrink: 0 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Advisor</h1>
        {hasConversation && <button className="btn btn--ghost" onClick={newChat} disabled={busy}>New chat</button>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {!hasConversation ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 13, background: 'var(--accent-gradient)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: '0 6px 16px -6px rgba(59,130,246,0.4)',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="white" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{greeting()}, {data.profile.name}</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{WELCOME}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 700, letterSpacing: 0.5 }}>CONNECTED</span>
              {CONNECTED.map((c) => <span key={c} className="chip chip--active" style={{ cursor: 'default' }}>{c}</span>)}
            </div>

            <div className="row" style={{ marginBottom: 16 }}>
              {ACTION_CARDS.map((card) => (
                <div
                  key={card.key}
                  className="card"
                  style={{ cursor: 'pointer', padding: '20px 18px' }}
                  onClick={() => send(card.question)}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{card.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{card.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map((q) => (
                <button key={q} className="chip" onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 820 }}>
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

      <div style={{ flexShrink: 0, paddingTop: 14, maxWidth: 820 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--hairline)',
            borderRadius: 20,
            padding: '10px 10px 10px 16px',
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Ask anything about your money, or tell me about a transaction…"
            value={input}
            onChange={(e) => { setInput(e.target.value); autoGrow(e.target); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: 15,
              lineHeight: 1.5,
              maxHeight: 160,
              padding: '6px 0',
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
  );
}

function ChatRow({ role, text }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 4px', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <Avatar role={role} />
      <div style={{ maxWidth: '82%', paddingTop: 4 }}>
        {isUser ? (
          <div
            style={{
              background: 'var(--teal-dim)',
              borderRadius: 16,
              padding: '10px 14px',
              fontSize: 14.5,
              whiteSpace: 'pre-wrap',
            }}
          >
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
      <div style={{
        width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-elevated-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
      }}>
        You
      </div>
    );
  }
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-gradient)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
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
