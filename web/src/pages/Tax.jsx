import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, SectionLabel, Divider, ProgressBar, Pill } from '../components/ui';
import '../components/markdown.css';
import { useWealth } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { api } from '../api/client';
import { formatINR } from '../format';

export default function Tax() {
  const { token } = useAuth();
  const [taxState, setTaxState] = useState(null);
  const [computed, setComputed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [auditReply, setAuditReply] = useState(null);
  const [auditBusy, setAuditBusy] = useState(false);

  const [slipBusy, setSlipBusy] = useState(false);
  const [slipReply, setSlipReply] = useState(null);
  const [slipError, setSlipError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [state, comp] = await Promise.all([api.getTaxState(token), api.computeTax(token)]);
      setTaxState(state);
      setComputed(comp);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runAuditor = async () => {
    setAuditBusy(true);
    setAuditReply(null);
    try {
      const res = await api.askAuditor(token);
      setAuditReply(res.reply);
    } catch (e) {
      setAuditReply(e.message);
    } finally {
      setAuditBusy(false);
    }
  };

  const handleSlipUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setSlipError('Please upload a PDF, PNG, JPEG, or WebP file.');
      return;
    }

    setSlipBusy(true);
    setSlipReply(null);
    setSlipError(null);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });
      const res = await api.uploadSalarySlip(token, base64, file.type);
      setSlipReply(res.reply);
      await load();
    } catch (err) {
      setSlipError(err.message);
    } finally {
      setSlipBusy(false);
    }
  };

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>;
  if (error) return <Card><p style={{ color: 'var(--rose)', margin: 0 }}>{error}</p></Card>;

  return (
    <div className="stack">
      <h1 className="page-title">Tax</h1>

      {computed && (
        <Card>
          <SectionLabel>Regime comparison, FY 2026-27</SectionLabel>
          <div className="row" style={{ marginBottom: 14 }}>
            <RegimeBox label="New regime" data={computed.new} highlight={computed.recommended === 'new'} />
            <RegimeBox label="Old regime" data={computed.old} highlight={computed.recommended === 'old'} />
          </div>
          <Pill tone="good">
            {computed.recommended === 'new' ? 'New' : 'Old'} regime saves {formatINR(computed.savingsIfRecommended)}
          </Pill>

          <Divider />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>TDS deducted</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{formatINR(computed.totalTDS)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Advance tax paid</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{formatINR(computed.totalAdvanceTaxPaid)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Liability ({computed.currentRegimeSelected} regime selected)</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{formatINR(computed.currentRegimeLiability)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {computed.shortfallOrRefund > 0 ? 'Shortfall (still owed)' : 'Refund due'}
            </span>
            <span style={{ fontWeight: 700, fontSize: 16, color: computed.shortfallOrRefund > 0 ? 'var(--rose)' : 'var(--teal)' }}>
              {formatINR(Math.abs(computed.shortfallOrRefund))}
            </span>
          </div>
        </Card>
      )}

      <Card>
        <div className="page-header-row" style={{ marginBottom: auditReply ? 12 : 0 }}>
          <SectionLabel style={{ margin: 0 }}>Auditor agent</SectionLabel>
          <button className="btn btn--teal btn--pill" onClick={runAuditor} disabled={auditBusy}>
            {auditBusy ? 'Auditing…' : 'Run full audit'}
          </button>
        </div>
        {!!auditReply && (
          <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{auditReply}</ReactMarkdown>
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>Upload salary slip</SectionLabel>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Upload this month's payslip (PDF or image) and the agent will read your gross
          salary, basic pay, and TDS deducted straight off it, and update your income
          source below automatically (annualized ×12).
        </p>
        <label className="btn btn--teal" style={{ display: 'inline-block', cursor: 'pointer' }}>
          {slipBusy ? 'Reading…' : 'Choose file'}
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={handleSlipUpload}
            disabled={slipBusy}
            style={{ display: 'none' }}
          />
        </label>
        {!!slipError && <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--rose)' }}>{slipError}</p>}
        {!!slipReply && (
          <div className="markdown" style={{ marginTop: 12 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{slipReply}</ReactMarkdown>
          </div>
        )}
      </Card>

      {taxState && (
        <>
          <SectionLabel style={{ marginLeft: 2 }}>Income sources</SectionLabel>
          <IncomeSources token={token} sources={taxState.incomeSources} onChange={load} />

          <SectionLabel style={{ marginLeft: 2 }}>Tax profile</SectionLabel>
          <TaxProfileForm token={token} profile={taxState.profile} onChange={load} />

          <SectionLabel style={{ marginLeft: 2 }}>Advance tax payments</SectionLabel>
          <AdvancePayments token={token} payments={taxState.advancePayments} onChange={load} />
        </>
      )}
    </div>
  );
}

function RegimeBox({ label, data, highlight }) {
  return (
    <Card style={{ borderColor: highlight ? 'var(--teal)' : undefined }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>{formatINR(data.totalTax)}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Taxable income: {formatINR(data.taxableIncome)}</div>
    </Card>
  );
}

function IncomeSources({ token, sources, onChange }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Salary');
  const [annual, setAnnual] = useState('');
  const [tds, setTds] = useState('');

  const add = async () => {
    if (!name.trim() || !annual) return;
    await api.addIncomeSource(token, { name: name.trim(), category, annualAmount: parseFloat(annual), tdsDeducted: parseFloat(tds) || 0 });
    setName(''); setAnnual(''); setTds('');
    onChange();
  };

  return (
    <Card>
      {sources.map((s, idx) => (
        <div key={s.id}>
          {idx > 0 && <Divider />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{s.category} · TDS {formatINR(s.tdsDeducted)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(s.annualAmount)}</div>
              <button
                className="btn btn--ghost"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={async () => { await api.deleteIncomeSource(token, s.id); onChange(); }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
      <Divider />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Source name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 140px' }} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ background: 'var(--bg-elevated-2)', color: 'var(--text-primary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '0 10px' }}>
          <option>Salary</option>
          <option>Interest</option>
          <option>Other</option>
        </select>
        <input type="number" placeholder="Annual amount" value={annual} onChange={(e) => setAnnual(e.target.value)} style={{ flex: '1 1 120px' }} />
        <input type="number" placeholder="TDS deducted" value={tds} onChange={(e) => setTds(e.target.value)} style={{ flex: '1 1 120px' }} />
        <button className="btn btn--teal" onClick={add}>Add</button>
      </div>
    </Card>
  );
}

function TaxProfileForm({ token, profile, onChange }) {
  const [regime, setRegime] = useState(profile.regime);
  const [basicSalary, setBasicSalary] = useState(String(profile.basicSalary));
  const [d, setD] = useState(profile.deductions);

  const save = async () => {
    await api.updateTaxProfile(token, {
      regime,
      basicSalary: parseFloat(basicSalary) || 0,
      deductions: {
        section80C: parseFloat(d.section80C) || 0,
        section80D: parseFloat(d.section80D) || 0,
        hraExemption: parseFloat(d.hraExemption) || 0,
        homeLoanInterest: parseFloat(d.homeLoanInterest) || 0,
        nps80CCD1B: parseFloat(d.nps80CCD1B) || 0,
        npsEmployer: parseFloat(d.npsEmployer) || 0,
        npsEmployerPct: parseFloat(d.npsEmployerPct) || 0.10,
      },
    });
    onChange();
  };

  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className={`btn ${regime === 'new' ? 'btn--teal' : 'btn--ghost'}`} style={{ flex: 1 }} onClick={() => setRegime('new')}>New regime</button>
        <button className={`btn ${regime === 'old' ? 'btn--teal' : 'btn--ghost'}`} style={{ flex: 1 }} onClick={() => setRegime('old')}>Old regime</button>
      </div>

      <FormRow label="Basic salary (annual, for NPS caps)" value={basicSalary} onChange={setBasicSalary} />

      {regime === 'old' && (
        <>
          <FormRow label="Section 80C" value={d.section80C} onChange={(v) => setD({ ...d, section80C: v })} />
          <FormRow label="Section 80D (health insurance)" value={d.section80D} onChange={(v) => setD({ ...d, section80D: v })} />
          <FormRow label="HRA exemption" value={d.hraExemption} onChange={(v) => setD({ ...d, hraExemption: v })} />
          <FormRow label="Home loan interest (24b, capped ₹2L)" value={d.homeLoanInterest} onChange={(v) => setD({ ...d, homeLoanInterest: v })} />
          <FormRow label="NPS 80CCD(1B), additional" value={d.nps80CCD1B} onChange={(v) => setD({ ...d, nps80CCD1B: v })} />
        </>
      )}
      <FormRow label="Employer NPS contribution (80CCD(2), annual)" value={d.npsEmployer} onChange={(v) => setD({ ...d, npsEmployer: v })} />

      <button className="btn btn--teal" onClick={save} style={{ marginTop: 4 }}>Save</button>
    </Card>
  );
}

function FormRow({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AdvancePayments({ token, payments, onChange }) {
  const [quarter, setQuarter] = useState('');
  const [amount, setAmount] = useState('');

  const add = async () => {
    if (!quarter.trim() || !amount) return;
    await api.addAdvancePayment(token, { quarter: quarter.trim(), amount: parseFloat(amount) });
    setQuarter(''); setAmount('');
    onChange();
  };

  return (
    <Card>
      {payments.length === 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)' }}>No advance tax logged yet.</p>
      )}
      {payments.map((p, idx) => (
        <div key={p.id}>
          {idx > 0 && <Divider />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{p.quarter}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(p.amount)}</span>
              <button
                className="btn btn--ghost"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={async () => { await api.deleteAdvancePayment(token, p.id); onChange(); }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
      <Divider />
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" placeholder="e.g. Q1 FY2026-27" value={quarter} onChange={(e) => setQuarter(e.target.value)} style={{ flex: 1 }} />
        <input type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn--teal" onClick={add}>Add</button>
      </div>
    </Card>
  );
}
