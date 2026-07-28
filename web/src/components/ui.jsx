import React from 'react';
import './components.css';

export function Card({ children, style, className = '' }) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, style }) {
  return <p className="section-label" style={style}>{children}</p>;
}

export function Divider() {
  return <div className="divider" />;
}

const accentVar = {
  teal: 'var(--teal)',
  amber: 'var(--amber)',
  rose: 'var(--rose)',
  violet: 'var(--violet)',
};

export function ProgressBar({ pct, accent = 'teal', height = 8 }) {
  const clamped = Math.max(0, Math.min(1, pct || 0));
  return (
    <div className="progress-track" style={{ height }}>
      <div
        className="progress-fill"
        style={{ width: `${clamped * 100}%`, background: accentVar[accent] || accentVar.teal }}
      />
    </div>
  );
}

const toneWord = { good: 'On track', warn: 'Watch', alert: 'Alert', neutral: 'Note' };

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export { toneWord };

export function GaugeRing({ pct, size = 176, strokeWidth = 14, accent = 'teal', label, value }) {
  const clamped = Math.max(0, Math.min(1, pct || 0));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - clamped);
  const gradientId = 'gauge-gradient';
  const useGradient = accent === 'teal';
  const color = useGradient ? `url(#${gradientId})` : (accentVar[accent] || accentVar.teal);

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#17B8A6" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--hairline)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-value">{value}</span>
        {label && <span className="gauge-label">{label}</span>}
      </div>
    </div>
  );
}

export function Sparkline({ points, width = 120, height = 40, accent = 'teal' }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * height;
    return `${x},${y}`;
  });
  const color = accentVar[accent] || accentVar.teal;
  const last = coords[coords.length - 1].split(',');

  return (
    <svg width={width} height={height}>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} />
    </svg>
  );
}
