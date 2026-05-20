import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Users as UsersIcon, Shield, Search, X, Check, Trash2, Key, Building2, LayoutGrid, AlertCircle, Pencil } from 'lucide-react';
import { motion } from 'motion/react';

interface PortalUser {
  id: string;
  username: string;
  password?: string;
  volunteerId: string;
  volunteerName: string;
  isEnabled: boolean;
  isAdmin?: boolean;
  parishId: string; // The primary parish they belong to
  permissions: {
    [parishId: string]: {
      enabled: boolean;
      modules: string[];
    }
  };
}

const MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calendar', label: 'Calendario' },
  { id: 'events', label: 'Eventi' },
  { id: 'rooms', label: 'Gestione Sale' },
  { id: 'liturgy', label: 'Messe e Liturgie' },
  { id: 'catechism', label: 'Catechismo' },
  { id: 'oratorio', label: 'Oratorio Feriale' },
  { id: 'volunteers', label: 'Volontari' },
  { id: 'expenses', label: 'Gestione Spese' },
  { id: 'maintenance', label: 'Manutenzione' },
  { id: 'councils', label: 'Consulte' },
  { id: 'settings', label: 'Impostazioni' },
];

const Users: React.FC = () => {
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [parishes, setParishes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<PortalUser | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', password: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string, volunteerId: string, parishId: string } | null>(null);

  useEffect(() => {
    // Fetch Portal Users
    const unsubUsers = onSnapshot(collection(db, 'portal_users'), (snap) => {
      setPortalUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PortalUser)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'portal_users');
    });

    // Fetch Parishes for permission mapping
    const unsubParishes = onSnapshot(collection(db, 'parishes'), (snap) => {
      setParishes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubUsers();
      unsubParishes();
    };
  }, []);

  const handleEditOpen = (user: PortalUser) => {
    setSelectedUser(user);
    setEditForm({ username: user.username || '', password: user.password || '' });
    setIsModalOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    try {
      await updateDoc(doc(db, 'portal_users', selectedUser.id), {
        username: editForm.username,
        password: editForm.password,
        isAdmin: selectedUser.isAdmin || false
      });
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'portal_users');
    }
  };

  const handleUpdatePermissions = async (parishId: string, moduleId: string, checked: boolean) => {
    if (!selectedUser) return;

    const currentPermissions = selectedUser.permissions || {};
    const parishPerms = currentPermissions[parishId] || { enabled: false, modules: [] };
    
    let newModules = [...parishPerms.modules];
    if (checked) {
      if (!newModules.includes(moduleId)) newModules.push(moduleId);
    } else {
      newModules = newModules.filter(m => m !== moduleId);
    }

    const updatedPermissions = {
      ...currentPermissions,
      [parishId]: {
        ...parishPerms,
        modules: newModules
      }
    };

    try {
      await updateDoc(doc(db, 'portal_users', selectedUser.id), {
        permissions: updatedPermissions
      });
      // SelectedUser should be updated locally via onSnapshot for immediate feedback in modal
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'portal_users');
    }
  };

  const handleToggleParishAccess = async (parishId: string, enabled: boolean) => {
    if (!selectedUser) return;

    const currentPermissions = selectedUser.permissions || {};
    const updatedPermissions = {
      ...currentPermissions,
      [parishId]: {
        ...(currentPermissions[parishId] || { modules: [] }),
        enabled
      }
    };

    try {
      await updateDoc(doc(db, 'portal_users', selectedUser.id), {
        permissions: updatedPermissions
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'portal_users');
    }
  };

  const handleDeleteUser = async (user: PortalUser) => {
    try {
      // 1. Delete the portal user document
      await deleteDoc(doc(db, 'portal_users', user.id));
      
      // 2. Sync with the volunteer document
      const volunteerRef = doc(db, 'parishes', user.parishId, 'volunteers', user.volunteerId);
      await updateDoc(volunteerRef, {
        isPortalUser: false,
        updatedAt: new Date().toISOString()
      }).catch(err => console.error("Error updating volunteer on user delete:", err));

      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'portal_users');
    }
  };

  const filteredUsers = portalUsers.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.volunteerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight italic uppercase">Gestione Utenti Portale</h1>
            <p className="text-slate-500 font-medium text-xs md:text-sm">Amministra gli accessi e i permessi dei volontari abilitati.</p>
          </div>
          <button 
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all shadow-sm active:scale-95 transition-all w-full md:w-auto"
          >
            Torna al Portale
          </button>
        </div>

        <div className="bg-white p-3 md:p-4 rounded-2xl md:rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
          <Search className="text-slate-400 ml-2" size={20} />
          <input 
            type="text" 
            placeholder="Cerca utente o volontario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none font-bold text-slate-900 placeholder:text-slate-300 text-sm md:text-base"
          />
        </div>

        <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-slate-100">
            {filteredUsers.map((user) => {
              const mainParish = parishes.find(p => p.id === user.parishId);
              return (
                <div key={user.id} className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-center gap-4 md:gap-6">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-50 text-blue-600 rounded-xl md:rounded-2xl flex items-center justify-center border border-blue-100 group-hover:scale-105 transition-transform shrink-0">
                      <Shield size={22} className="md:w-6 md:h-6" />
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-bold text-slate-900 uppercase italic leading-tight">{user.volunteerName}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1">
                           <Building2 size={10} className="md:w-3 md:h-3" /> {mainParish?.name || 'Parrocchia Principale'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 justify-end">
                    <button 
                      onClick={() => handleEditOpen(user)}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 text-white px-5 md:px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-blue-600 active:scale-95 transition-all"
                    >
                      <Pencil size={14} /> Modifica
                    </button>
                    <button 
                      onClick={() => setDeleteConfirm({ id: user.id, name: user.volunteerName, volunteerId: user.volunteerId, parishId: user.parishId })}
                      className="p-3 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-2xl transition-all border border-slate-100 hover:border-red-100 hover:scale-105 active:scale-95 shrink-0"
                      title="Elimina"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredUsers.length === 0 && !loading && (
            <div className="py-20 md:py-24 flex flex-col items-center justify-center text-slate-400 space-y-4 px-6 text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-2xl md:rounded-3xl flex items-center justify-center">
                <UsersIcon size={32} className="md:w-10 md:h-10" strokeWidth={1} />
              </div>
              <p className="font-bold uppercase tracking-widest text-xs md:text-sm text-slate-500">Nessun utente abilitato trovato</p>
              <p className="text-[10px] md:text-xs text-slate-400">Abilita i volontari dalle loro schede personali.</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-2 md:p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-4xl rounded-[2rem] md:rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]"
          >
            <div className="p-5 md:p-8 border-b border-slate-50 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic">Modifica Utente</h2>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">{selectedUser.volunteerName}</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-5 md:p-8 overflow-y-auto space-y-8 flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome Utente</label>
                  <div className="relative group">
                    <Shield className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input
                      type="text"
                      value={editForm.username}
                      onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                      className="w-full pl-14 pr-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                      placeholder="Username..."
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                  <div className="relative group">
                    <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input
                      type="password"
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                      className="w-full pl-14 pr-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                      placeholder="Password..."
                    />
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Ruolo Speciale</label>
                  <button
                    onClick={() => {
                      const newIsAdmin = !selectedUser.isAdmin;
                      setSelectedUser({ ...selectedUser, isAdmin: newIsAdmin });
                      updateDoc(doc(db, 'portal_users', selectedUser.id), { isAdmin: newIsAdmin });
                    }}
                    className={`w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all ${
                      selectedUser.isAdmin 
                        ? 'bg-blue-50 border-blue-200 text-blue-700' 
                        : 'bg-slate-50 border-transparent text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Shield size={20} className={selectedUser.isAdmin ? 'text-blue-600' : 'text-slate-300'} />
                      <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Amministratore Globale</span>
                    </div>
                    <div className={`w-5 h-5 md:w-6 md:h-6 rounded-lg flex items-center justify-center ${selectedUser.isAdmin ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {selectedUser.isAdmin && <Check size={14} />}
                    </div>
                  </button>
                  <p className="text-[9px] text-slate-400 font-medium italic mt-1 ml-1 px-1">
                    * Gli amministratori possono vedere tutte le unità pastorali e gestire gli utenti.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] italic border-b border-slate-100 pb-2">Permessi Granulari</h3>
                <div className="space-y-4 md:space-y-6">
                   {parishes.map(parish => {
                     const liveUser = portalUsers.find(u => u.id === selectedUser.id) || selectedUser;
                     const parishPerms = (liveUser.permissions || {})[parish.id] || { enabled: false, modules: [] };
                     return (
                       <div key={parish.id} className="bg-slate-50 p-5 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 flex flex-col md:flex-row gap-4 md:gap-6">
                         <div className="w-full md:w-56 space-y-3">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md shrink-0"
                                style={{ backgroundColor: parish.color || '#3b82f6' }}
                              >
                                <Building2 size={20} />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-black text-slate-900 uppercase italic truncate">{parish.name}</h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Unità Pastorale</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleToggleParishAccess(parish.id, !parishPerms.enabled)}
                              className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                parishPerms.enabled 
                                  ? 'bg-green-600 text-white' 
                                  : 'bg-white text-slate-400 border border-slate-200'
                              }`}
                            >
                              {parishPerms.enabled ? 'Abilitato' : 'Disabilitato'}
                            </button>
                         </div>

                         {parishPerms.enabled && (
                           <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-2">
                             {MODULES.map(module => {
                               const isChecked = parishPerms.modules.includes(module.id);
                               return (
                                 <button
                                   key={module.id}
                                   onClick={() => handleUpdatePermissions(parish.id, module.id, !isChecked)}
                                   className={`p-3 rounded-xl text-left transition-all border flex items-center justify-between gap-2 ${
                                     isChecked 
                                       ? 'bg-white border-blue-200 shadow-sm' 
                                       : 'bg-slate-100/50 border-transparent opacity-60'
                                   }`}
                                 >
                                   <span className={`text-[9px] font-black uppercase tracking-widest truncate ${isChecked ? 'text-blue-600' : 'text-slate-400'}`}>
                                     {module.label}
                                   </span>
                                   <div className={`w-3.5 h-3.5 rounded-full border flex items-center shrink-0 justify-center ${isChecked ? 'bg-blue-600 border-blue-600' : 'border-slate-200'}`}>
                                     {isChecked && <Check size={8} className="text-white" />}
                                   </div>
                                 </button>
                               );
                             })}
                           </div>
                         )}
                       </div>
                     );
                   })}
                </div>
              </div>
            </div>

            <div className="p-5 md:p-8 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
               <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest italic hidden md:block">
                 Le modifiche ai permessi sono istantanee.
               </p>
               <div className="flex gap-3 w-full md:w-auto">
                 <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 md:flex-none px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200"
                >
                  Chiudi
                </button>
                <button 
                  onClick={handleUpdateUser}
                  className="flex-[2] md:flex-none bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-blue-600 active:scale-95 transition-all"
                >
                  Salva Credenziali
                </button>
               </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-sm rounded-[2.5rem] md:rounded-[3rem] shadow-2xl p-6 md:p-8 text-center border border-slate-100"
          >
            <div className="w-16 h-16 md:w-20 md:h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-4 md:mb-6 shadow-inner">
              <Trash2 size={32} className="md:w-10 md:h-10" />
            </div>
            <h2 className="text-lg md:text-xl font-black text-slate-900 mb-2 italic uppercase">Revoca Accesso</h2>
            <p className="text-slate-500 text-xs md:text-sm font-medium mb-6 md:mb-8 leading-relaxed">
              Sei sicuro di voler revocare l'accesso portale a <strong>{deleteConfirm.name}</strong>?<br/>
              Potrai riabilitarlo dalla sua scheda volontario in qualsiasi momento.
            </p>
            <div className="flex gap-3 md:gap-4">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-white border border-slate-200 text-slate-600 px-4 md:px-6 py-3.5 md:py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all shadow-sm active:scale-95"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  const user = portalUsers.find(u => u.id === deleteConfirm.id);
                  if (user) handleDeleteUser(user);
                }}
                className="flex-1 bg-red-600 text-white px-4 md:px-6 py-3.5 md:py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-xl shadow-red-500/20 active:scale-95"
              >
                Revoca
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Users;
