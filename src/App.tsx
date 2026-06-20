import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, AuthGuard } from './components/AuthContext';
import { ParishProvider, useParish } from './components/ParishContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Events from './pages/Events';
import Maintenance from './pages/Maintenance';
import Rooms from './pages/Rooms';
import Consulte from './pages/Consulte';
import Spese from './pages/Spese';
import Volontari from './pages/Volontari';
import Calendar from './pages/Calendar';
import Liturgies from './pages/Liturgies';
import Catechism from './pages/Catechism';
import OratorioFeriale from './pages/OratorioFeriale';
import Aperture from './pages/Aperture';
import MasterDashboard from './pages/MasterDashboard';
import Users from './pages/Users';
import Login from './pages/Login';
import { useAuth } from './components/AuthContext';
import { Navigate } from 'react-router-dom';

const AppRoutes = () => {
  const { currentParish, loading: parishLoading } = useParish();
  const { user, portalUser, loading: authLoading } = useAuth();

  if (parishLoading || authLoading) return null;

  // Redirect to login if not authenticated and not already on login page
  if (!user && !portalUser && window.location.pathname !== '/login') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // If on login page but already authenticated, redirect to home
  if ((user || portalUser) && window.location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  if (!currentParish) {
    return (
      <Routes>
        <Route path="/utenti" element={<Users />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<MasterDashboard />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AuthGuard><Layout /></AuthGuard>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/impostazioni" element={<Settings />} />
        <Route path="/eventi" element={<Events />} />
        <Route path="/calendario" element={<Calendar />} />
        <Route path="/liturgie" element={<Liturgies />} />
        <Route path="/manutenzione" element={<Maintenance />} />
        <Route path="/sale" element={<Rooms />} />
        <Route path="/consulte" element={<Consulte />} />
        <Route path="/spese" element={<Spese />} />
        <Route path="/volontari" element={<Volontari />} />
        <Route path="/catechismo" element={<Catechism />} />
        <Route path="/oratorio" element={<OratorioFeriale />} />
        <Route path="/aperture" element={<Aperture />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ParishProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ParishProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
