export const formatINR = (value) => {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const s = abs.toString();
  let last3 = s.substring(s.length - 3);
  let other = s.substring(0, s.length - 3);
  if (other !== '') {
    last3 = ',' + last3;
  }
  const formatted = other.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3;
  return `${sign}₹${formatted}`;
};

export const formatCompactINR = (value) => {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${(n / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${(n / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
};
