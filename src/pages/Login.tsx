import React, { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { Shield, Key, User as UserIcon, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

const Login: React.FC = () => {
  const { loginWithGoogle, loginWithPortal } = useAuth();
  const [loginType, setLoginType] = useState<'admin' | 'portal'>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handlePortalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');
    try {
      await loginWithPortal(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Errore durante l\'accesso.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[3.5rem] shadow-2xl p-10 border border-slate-100 space-y-10"
      >
        <div className="text-center space-y-4">
          <div className="w-24 h-24 bg-blue-100 rounded-[2.5rem] flex items-center justify-center text-5xl mx-auto shadow-inner">⛪</div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 italic uppercase tracking-tight">Accesso Portale</h1>
            <p className="text-slate-500 text-sm font-medium mt-1">Santa Teresa Benedetta della Croce</p>
          </div>
        </div>

        <div className="flex p-2 bg-slate-50 rounded-[2rem] gap-2">
          <button 
            onClick={() => setLoginType('admin')}
            className={`flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all ${loginType === 'admin' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}
          >
            Amministratore
          </button>
          <button 
            onClick={() => setLoginType('portal')}
            className={`flex-1 py-4 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all ${loginType === 'portal' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'}`}
          >
            Volontario
          </button>
        </div>

        {loginType === 'admin' ? (
          <div className="space-y-6">
            <div className="bg-blue-50/50 p-8 rounded-[2.5rem] border border-blue-100/50 text-center space-y-6">
              <p className="text-xs font-medium text-slate-600 leading-relaxed italic">
                L'accesso amministratore richiede l'autenticazione tramite Google per una gestione sicura.
              </p>
              <button
                onClick={handleGoogleLogin}
                className="w-full py-5 bg-white text-slate-700 rounded-[2rem] font-bold shadow-sm border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-3 group"
              >
                <svg className="w-6 h-6 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-xs font-black uppercase tracking-[0.2em]">Entra come Admin</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePortalLogin} className="space-y-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome Utente</label>
                <div className="relative group">
                  <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                  <input 
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-14 pr-5 py-5 rounded-[2rem] bg-slate-50 border-none outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 transition-all"
                    placeholder="Il tuo username"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                <div className="relative group">
                  <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-14 pr-5 py-5 rounded-[2rem] bg-slate-50 border-none outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-50 text-red-600 p-5 rounded-[2rem] text-[10px] font-black uppercase tracking-wider flex items-center gap-3 border border-red-100"
              >
                 <AlertCircle size={18} /> {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black uppercase tracking-[0.2em] text-xs shadow-2xl hover:bg-blue-600 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : <Shield size={20} />}
              Accedi al Portale
            </button>
          </form>
        )}

        <div className="pt-2 border-t border-slate-50">
          <button
            type="button"
            onClick={() => navigate('/segnala-assenza')}
            className="w-full py-5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100/70 rounded-[2rem] text-[10px] font-extrabold uppercase tracking-widest transition-all shadow-xs flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
          >
            📱 Segnala Assenza Animatore
          </button>
        </div>

        <div className="pt-4 flex flex-col items-center gap-4">
           <div className="h-px w-12 bg-slate-100" />
           <p className="text-[9px] text-center font-black uppercase text-slate-300 tracking-[0.4em]">
             Comunità Pastorale • S.T.B.C.
           </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
