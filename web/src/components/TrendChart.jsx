import React from 'react';

const accentVar = {
  teal: 'var(--teal)',
  amber: 'var(--amber)',
  rose: 'var(--rose)',
  violet: 'var(--violet)',
};

// seriesA/seriesB: arrays of numbers (one per day), possibly different lengths.
export function TrendChart({ seriesA, seriesB, labelA, labelB, width = 600, height = 200 }) {
  const maxLen = Math.max(seriesA.length, seriesB.length, 1);
  const maxVal = Math.max(1, ...seriesA, ...seriesB);
  const padding = 24;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  const toPoints = (series) =>
    series
      .map((v, i) => {
        const x = padding + (maxLen > 1 ? (i / (maxLen - 1)) * plotW : 0);
        const y = padding + plotH - (v / maxVal) * plotH;
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMin meet">
        {/* baseline */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--hairline)" strokeWidth={1} />
        {seriesB.length > 1 && (
          <polyline points={toPoints(seriesB)} fill="none" stroke="var(--text-faint)" strokeWidth={2} strokeDasharray="4 4" />
        )}
        {seriesA.length > 1 && (
          <polyline points={toPoints(seriesA)} fill="none" stroke={accentVar.teal} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2.5, background: accentVar.teal, display: 'inline-block' }} />
          {labelA}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: 'var(--text-faint)', display: 'inline-block' }} />
          {labelB}
        </span>
      </div>
    </div>
  );
}
