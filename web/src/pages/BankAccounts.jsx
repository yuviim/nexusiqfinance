import React, { useState } from 'react';
import { Card, SectionLabel, Divider } from '../components/ui';
import { useWealth } from '../store/DataContext';
import { formatINR } from '../format';

export const BANK_NAMES = ['HDFC', 'IDFC', 'SBI', 'KOTAK', 'Other'];

export default function BankAccounts() {
  const { data, derived, upsertBankAccount, deleteBankAccount } = useWealth();

  const findAccount = (bank) => data.bankAccounts.find((b) => b.bankName === bank);
  const totalBalance = derived.totalBankBalance;

  return (
    <div className="stack">
      <h1 className="page-title">Bank Accounts</h1>

      <Card>
        <SectionLabel>Total across banks</SectionLabel>
        <div style={{ fontWeight: 700, fontSize: 28 }}>{formatINR(totalBalance)}</div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Counted as part of your net worth on the Dashboard and Accounts page.
        </p>
      </Card>

      <SectionLabel style={{ marginLeft: 2 }}>Balances</SectionLabel>
      <Card>
        {BANK_NAMES.filter((b) => b !== 'Other').map((bank, idx) => (
          <React.Fragment key={bank}>
            {idx > 0 && <Divider />}
            <BankRow
              bank={bank}
              account={findAccount(bank)}
              onSave={(balance) => upsertBankAccount(bank, balance)}
              onDelete={findAccount(bank) ? () => deleteBankAccount(findAccount(bank).id) : null}
            />
          </React.Fragment>
        ))}
      </Card>

      <SectionLabel style={{ marginLeft: 2 }}>Other bank</SectionLabel>
      <Card>
        <BankRow
          bank="Other"
          account={findAccount('Other')}
          onSave={(balance) => upsertBankAccount('Other', balance)}
          onDelete={findAccount('Other') ? () => deleteBankAccount(findAccount('Other').id) : null}
        />
      </Card>
    </div>
  );
}

function BankRow({ bank, account, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(account ? String(account.balance) : '');

  const save = () => {
    onSave(parseFloat(value) || 0);
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
        <span style={{ fontWeight: 600, fontSize: 14, minWidth: 70 }}>{bank}</span>
        <input
          type="number"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          style={{ flex: 1 }}
        />
        <button className="btn btn--teal" style={{ padding: '8px 14px' }} onClick={save}>Save</button>
        <button className="btn btn--ghost" style={{ padding: '8px 14px' }} onClick={() => setEditing(false)}>Cancel</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
      <span style={{ fontWeight: 600, fontSize: 14 }}>{bank}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{formatINR(account ? account.balance : 0)}</span>
        <button className="btn btn--ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => { setValue(account ? String(account.balance) : ''); setEditing(true); }}>
          {account ? 'Edit' : 'Add'}
        </button>
        {onDelete && (
          <button className="btn btn--ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={onDelete}>✕</button>
        )}
      </div>
    </div>
  );
}
