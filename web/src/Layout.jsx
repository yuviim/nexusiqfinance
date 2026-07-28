import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './Layout.css';
import { useWealth } from './store/DataContext';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/banks', label: 'Banks' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/budget', label: 'Budget' },
  { to: '/investments', label: 'Investments' },
  { to: '/advisor', label: 'Advisor' },
  { to: '/tax', label: 'Tax' },
  { to: '/profile', label: 'You' },
];

export default function Layout() {
  const { syncing } = useWealth();

  return (
    <div className="shell">
      <header className="topnav">
        <div className="topnav-brand">NexusIQ Finance</div>
        <nav className="topnav-links">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topnav-status">{syncing ? 'Syncing…' : 'Synced'}</div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
