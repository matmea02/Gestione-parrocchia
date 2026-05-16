import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, Wrench, DoorOpen, Settings as SettingsIcon, ClipboardList, Wallet, Users, CalendarDays, LogOut, Church, BookOpen, ArrowLeft, Grid } from 'lucide-react';
import { db, auth, signOut } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { useParish } from './ParishContext';

const Layout: React.FC = () => {
  const location = useLocation();
  const { user, portalUser, logout } = useAuth();
  const { currentParish, setCurrentParishId } = useParish();
  const [parishSettings, setParishSettings] = useState<any>({ name: '', logoUrl: '' });

  useEffect(() => {
    if (!currentParish) return;
    const unsub = onSnapshot(doc(db, 'parishes', currentParish.id, 'settings', 'parish'), (docSnap) => {
      if (docSnap.exists()) {
        setParishSettings(docSnap.data());
      } else {
        setParishSettings({ name: currentParish.name, logoUrl: currentParish.logoUrl });
      }
    });
    return unsub;
  }, [currentParish]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleSwitchUnit = () => {
    setCurrentParishId(null);
  };

  const baseNavItems = [
    { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', path: '/calendario', label: 'Calendario', icon: Calendar },
    { id: 'liturgy', path: '/liturgie', label: 'Messe e Liturgie', icon: Church },
    { id: 'events', path: '/eventi', label: 'Eventi', icon: CalendarDays },
    { id: 'volunteers', path: '/volontari', label: 'Volontari', icon: Users },
    { id: 'catechism', path: '/catechismo', label: 'Catechismo', icon: BookOpen },
    { id: 'councils', path: '/consulte', label: 'Consulte', icon: ClipboardList },
    { id: 'expenses', path: '/spese', label: 'Gestione Spese', icon: Wallet },
    { id: 'maintenance', path: '/manutenzione', label: 'Manutenzione', icon: Wrench },
    { id: 'rooms', path: '/sale', label: 'Gestione Sale', icon: DoorOpen },
    { id: 'settings', path: '/impostazioni', label: 'Impostazioni', icon: SettingsIcon },
  ];

  const navItems = portalUser 
    ? baseNavItems.filter(item => {
        const parishPerms = (portalUser.permissions || {})[currentParish?.id || ''];
        return parishPerms?.modules?.includes(item.id);
      })
    : baseNavItems;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen">
        <div className="p-6 space-y-4">
          <button 
            onClick={handleSwitchUnit}
            className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest group"
          >
            <ArrowLeft size={12} className="group-hover:-translate-x-1 transition-transform" />
            Torna al Portale
          </button>
          
          <div className="flex items-center gap-3">
            {parishSettings.logoUrl ? (
              <img src={parishSettings.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover shadow-sm border border-slate-100" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-xl shadow-sm border border-blue-200">⛪</div>
            )}
            <h1 className="text-lg font-bold text-slate-900 leading-tight italic truncate">
              {parishSettings.name || currentParish?.name || 'Gestione'}
            </h1>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={20} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-3">
          {(user || portalUser) && (
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 border border-blue-100">
                {(user?.photoURL) ? (
                  <img src={user.photoURL} alt="" className="w-full h-full rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  (portalUser?.volunteerName?.charAt(0) || user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U')
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{portalUser?.volunteerName || user?.displayName || 'Utente'}</p>
                <button 
                  onClick={handleLogout}
                  className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors uppercase font-bold tracking-tighter"
                >
                  <LogOut size={10} /> Disconnetti
                </button>
              </div>
            </div>
          )}
          <p className="text-[10px] text-slate-300 text-center uppercase font-bold tracking-[0.2em] pt-2">
            AI Parrocchia
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
