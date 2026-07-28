import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { DataProvider } from './store/DataContext';
import Layout from './Layout';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import BankAccounts from './pages/BankAccounts';
import Transactions from './pages/Transactions';
import Budget from './pages/Budget';
import Investments from './pages/Investments';
import Advisor from './pages/Advisor';
import Tax from './pages/Tax';
import Profile from './pages/Profile';

function Gate() {
  const { token } = useAuth();

  if (!token) return <Auth />;

  return (
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/banks" element={<BankAccounts />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/investments" element={<Investments />} />
            <Route path="/advisor" element={<Advisor />} />
            <Route path="/tax" element={<Tax />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
