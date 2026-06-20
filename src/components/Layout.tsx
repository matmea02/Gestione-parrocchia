import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Calendar, 
  Wrench, 
  DoorOpen, 
  Settings as SettingsIcon, 
  ClipboardList, 
  Wallet, 
  Users, 
  CalendarDays, 
  LogOut, 
  Church, 
  BookOpen, 
  ArrowLeft, 
  Grid,
  User as UserIcon,
  Plus,
  Key,
  CheckCircle2,
  AlertCircle,
  Sun
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { useParish } from './ParishContext';
import { motion, AnimatePresence } from 'motion/react';

const Layout: React.FC = () => {
  const location = useLocation();
  const { user, portalUser, logout } = useAuth();
  const { currentParish, setCurrentParishId } = useParish();
  const [parishSettings, setParishSettings] = useState<any>({ name: '', logoUrl: '' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ 
    newPassword: '', 
    confirmPassword: '' 
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

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
    { id: 'events', path: '/eventi', label: 'Eventi', icon: CalendarDays },
    { id: 'rooms', path: '/sale', label: 'Gestione Sale', icon: DoorOpen },
    { id: 'liturgy', path: '/liturgie', label: 'Messe e Liturgie', icon: Church },
    { id: 'catechism', path: '/catechismo', label: 'Catechismo', icon: BookOpen },
    { id: 'oratorio', path: '/oratorio', label: 'Oratorio Feriale', icon: Sun },
    { id: 'aperture', path: '/aperture', label: 'Aperture Oratorio', icon: DoorOpen },
    { id: 'volunteers', path: '/volontari', label: 'Volontari', icon: Users },
    { id: 'expenses', path: '/spese', label: 'Gestione Spese', icon: Wallet },
    { id: 'maintenance', path: '/manutenzione', label: 'Manutenzione', icon: Wrench },
    { id: 'councils', path: '/consulte', label: 'Consulte', icon: ClipboardList },
    { id: 'settings', path: '/impostazioni', label: 'Impostazioni', icon: SettingsIcon },
  ];

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalUser) return;
    
    setPasswordError('');
    setPasswordSuccess(false);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Le password non coincidono');
      return;
    }

    if (passwordForm.newPassword.length < 4) {
      setPasswordError('Password troppo breve (min 4 caratteri)');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const userRef = doc(db, 'portal_users', portalUser.id);
      await updateDoc(userRef, {
        password: passwordForm.newPassword,
        updatedAt: new Date().toISOString()
      });
      setPasswordSuccess(true);
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordSuccess(false);
        setPasswordForm({ newPassword: '', confirmPassword: '' });
      }, 2000);
    } catch (error) {
      console.error("Error updating password:", error);
      setPasswordError('Errore durante l\'aggiornamento');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const navItems = portalUser 
    ? baseNavItems.filter(item => {
        if (portalUser.isAdmin) return true;
        if (item.id === 'aperture' || item.id === 'dashboard') return true;
        const parishPerms = (portalUser.permissions || {})[currentParish?.id || ''];
        return parishPerms?.modules?.includes(item.id);
      })
    : baseNavItems;

  return (
    <div className="flex min-h-screen bg-slate-50 relative overflow-x-hidden">
      {/* Sidebar - Desktop and Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`fixed lg:sticky top-0 h-screen w-64 bg-white border-r border-slate-200 flex flex-col z-[101] transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between lg:block">
            <button 
              onClick={handleSwitchUnit}
              className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest group"
            >
              <ArrowLeft size={12} className="group-hover:-translate-x-1 transition-transform" />
              Torna al Portale
            </button>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 text-slate-400 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
          </div>
          
          <div className="flex items-start gap-3">
            {parishSettings.logoUrl ? (
              <img src={parishSettings.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-100 shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-xl shadow-sm border border-blue-200 shrink-0">⛪</div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-black text-slate-900 leading-tight uppercase italic break-words tracking-tight">
                {parishSettings.name || currentParish?.name || 'Unità Pastorale'}
              </h1>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1.5 italic flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-blue-400" />
                Lissone (MB)
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 lg:bg-blue-50 lg:text-blue-700 lg:shadow-none'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={20} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 flex flex-col items-center">
          {(user || portalUser) && (
            <div className="flex items-center gap-2 bg-white pl-3 pr-1 py-1 rounded-2xl border border-slate-100 shadow-sm w-full max-w-[220px]">
              <button 
                onClick={() => {
                  if (portalUser) {
                    setIsPasswordModalOpen(true);
                    setPasswordError('');
                    setPasswordSuccess(false);
                  }
                }}
                className={`flex items-center gap-2 text-left flex-1 min-w-0 ${portalUser ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
              >
                <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                  <UserIcon size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">Profilo</p>
                  <p className="text-[10px] font-bold text-slate-900 italic leading-none mt-1 truncate">{user ? "Admin" : portalUser?.volunteerName || "Utente"}</p>
                </div>
              </button>
              <div className="w-px h-5 bg-slate-100 mx-0.5" />
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Esci da questa parrocchia"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
          <p className="text-[8px] text-slate-300 text-center uppercase font-black tracking-[0.2em] pt-4 italic">
            CP. Santa Teresa Benedetta della Croce
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden flex flex-col max-w-full">
        {/* Universal Header with User Chip */}
        <header className="h-20 border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50 px-4 md:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2.5 bg-slate-900 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-sm"
            >
              <Grid size={20} />
            </button>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)] animate-pulse shrink-0" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] italic truncate">Sistema Operativo Parrocchiale</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3 bg-slate-50 pl-4 pr-1 py-1 rounded-full border border-slate-200/50 shadow-sm transition-all hover:bg-white hover:shadow-md group">
              <div className="flex items-center gap-3 text-left">
                <div className="w-8 h-8 rounded-full bg-slate-900 overflow-hidden border-2 border-white shadow-sm flex items-center justify-center text-white">
                  <UserIcon size={16} />
                </div>
                <div className="min-w-0 pr-2">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Accesso come</p>
                  <p className="text-[11px] font-bold text-slate-900 italic leading-none mt-1 truncate">{user ? "Amministratore" : portalUser?.volunteerName || "Utente"}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-8 h-8 flex items-center justify-center bg-white text-slate-400 hover:text-red-500 rounded-full border border-slate-200 transition-all hover:border-red-100 hover:shadow-sm"
                title="Esci"
              >
                <LogOut size={14} />
              </button>
            </div>
            
            {/* Mobile User Chip (Simplified) */}
            <div className="md:hidden flex items-center bg-slate-900 text-white rounded-full p-1 border shadow-lg border-white/20">
               <div className="w-8 h-8 rounded-full flex items-center justify-center">
                 <UserIcon size={16} />
               </div>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      {/* Password Change Modal */}
      <AnimatePresence>
        {isPasswordModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl overflow-hidden border border-white"
            >
              <div className="p-8 pb-4 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase italic">Cambia Password</h2>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Aggiorna le tue credenziali</p>
                </div>
                <button onClick={() => setIsPasswordModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-300">
                  <Plus size={20} className="rotate-45" />
                </button>
              </div>

              <form onSubmit={handleUpdatePassword} className="p-8 space-y-6">
                {passwordSuccess ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-20 h-20 bg-green-50 text-green-500 rounded-3xl flex items-center justify-center shadow-inner">
                      <CheckCircle2 size={40} />
                    </div>
                    <p className="text-sm font-black text-slate-900 uppercase italic tracking-widest">Password aggiornata!</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nuova Password</label>
                        <div className="relative group">
                          <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                          <input
                            required
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                            className="w-full pl-14 pr-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Conferma Password</label>
                        <div className="relative group">
                          <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                          <input
                            required
                            type="password"
                            value={passwordForm.confirmPassword}
                            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                            className="w-full pl-14 pr-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    {passwordError && (
                      <div className="p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3">
                        <AlertCircle size={18} className="shrink-0" />
                        <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">{passwordError}</p>
                      </div>
                    )}

                    <button
                      disabled={isUpdatingPassword}
                      type="submit"
                      className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-blue-600 transition-all disabled:opacity-50"
                    >
                      {isUpdatingPassword ? 'Aggiornamento...' : 'Salva Nuova Password'}
                    </button>
                  </>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Layout;
