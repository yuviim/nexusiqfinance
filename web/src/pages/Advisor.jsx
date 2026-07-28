import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../components/markdown.css';
import { useAuth } from '../store/AuthContext';
import { api } from '../api/client';

const WELCOME = "I'm your financial advisor agent. Ask me anything about your budget, savings rate, surplus, or where to invest — I'll pull your current numbers before answering.";

export default function Advisor() {
  const { token } = useAuth();
  const [messages, setMessages] = useState([{ role: 'assistant', text: WELCOME }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const isFirstRender = useRef(true);

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

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setBusy(true);
    setError(null);
    try {
      const res = await api.askAdvisor(token, question);
      setMessages((m) => [...m, { role: 'assistant', text: res.reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => {
    setMessages([{ role: 'assistant', text: WELCOME }]);
    setError(null);
    setInput('');
  };

  return (
    <div className="stack" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="page-header-row">
        <h1 className="page-title" style={{ margin: 0 }}>Advisor</h1>
        <button className="btn btn--ghost" onClick={newChat} disabled={busy}>New chat</button>
      </div>

      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 'calc(100vh - 230px)',
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8 }}>
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

        <div style={{ flexShrink: 0 }}>
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
              placeholder="Ask your advisor…"
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
              onClick={send}
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
