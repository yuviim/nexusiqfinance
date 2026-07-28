import React, { useState } from 'react';
import { useAuth } from '../store/AuthContext';

export default function Auth() {
  const { login, register, busy, error, setError } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e) => {
    e.preventDefault();
    setError(null);
    if (mode === 'login') login(email.trim(), password);
    else register(email.trim(), password, name.trim());
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ textAlign: 'center', fontSize: 32, margin: 0 }}>NexusIQ Finance</h1>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: '0 0 10px', fontSize: 14 }}>
          Am I getting richer every month?
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`btn ${mode === 'login' ? 'btn--teal' : 'btn--ghost'}`}
            style={{ flex: 1 }}
            onClick={() => { setMode('login'); setError(null); }}
          >
            Log in
          </button>
          <button
            type="button"
            className={`btn ${mode === 'register' ? 'btn--teal' : 'btn--ghost'}`}
            style={{ flex: 1 }}
            onClick={() => { setMode('register'); setError(null); }}
          >
            Sign up
          </button>
        </div>

        {mode === 'register' && (
          <input type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />

        {!!error && <p style={{ color: 'var(--rose)', fontSize: 13, textAlign: 'center', margin: 0 }}>{error}</p>}

        <button type="submit" className="btn btn--teal" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, margin: 0 }}>
          First time? Sign up creates a fresh account seeded with sample data you can edit or clear.
        </p>
      </form>
    </div>
  );
}
