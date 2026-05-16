import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, query, orderBy, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish } from '../components/ParishContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, ChevronRight, LayoutGrid, List, Search, Loader2, Trash2, AlertCircle, Shield, LogOut, Phone, Mail, User as UserIcon, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../components/AuthContext';

const MasterDashboard: React.FC = () => {
  const [parishes, setParishes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [parishToDelete, setParishToDelete] = useState<any | null>(null);
  const [newParish, setNewParish] = useState({ 
    name: '', 
    color: '#3b82f6', 
    description: '',
    address: '',
    email: '',
    phone: '',
    contactPerson: '',
    diocese: '',
    pastoralCommunity: '',
    logoUrl: '',
    featuredImageUrl: ''
  });
  const { setCurrentParishId } = useParish();
  const { user, portalUser, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'parishes'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setParishes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'parishes');
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleCreateParish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParish.name) return;
    try {
      const parishData = {
        name: newParish.name,
        color: newParish.color,
        description: newParish.description,
        logoUrl: newParish.logoUrl,
        featuredImageUrl: newParish.featuredImageUrl,
        phone: newParish.phone,
        email: newParish.email,
        contactPerson: newParish.contactPerson,
        address: newParish.address,
        diocese: newParish.diocese || 'Milano',
        pastoralCommunity: newParish.pastoralCommunity || 'S.T.B.C.',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'parishes'), parishData);
      
      // Initialize settings for the new parish
      await setDoc(doc(db, 'parishes', docRef.id, 'settings', 'parish'), {
        ...parishData,
        officeHours: {},
        churchHours: {},
        confessionHours: {},
        photos: []
      });

      setIsModalOpen(false);
      setNewParish({ 
        name: '', 
        color: '#3b82f6', 
        description: '',
        address: '',
        email: '',
        phone: '',
        contactPerson: '',
        diocese: '',
        pastoralCommunity: '',
        logoUrl: '',
        featuredImageUrl: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'parishes');
    }
  };

  const handleDeleteParish = async () => {
    if (!parishToDelete) return;
    try {
      await deleteDoc(doc(db, 'parishes', parishToDelete.id));
      setParishToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'parishes');
    }
  };

  const selectParish = (id: string) => {
    setCurrentParishId(id);
    navigate('/');
  };

  const filteredParishes = parishes.filter(p => {
    if (user) return true; // Admin sees all
    if (portalUser) {
      const perms = portalUser.permissions || {};
      return perms[p.id]?.enabled;
    }
    return false;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 border-b border-slate-200 pb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-slate-900 rounded-[2rem] flex items-center justify-center text-white shadow-2xl rotate-3 shrink-0">
                <Building2 size={32} />
              </div>
              <div>
                <h2 className="text-xs font-black text-blue-600 uppercase tracking-[0.4em] mb-1">Lissone • Diocesi di Milano</h2>
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter italic uppercase">Comunità Pastorale</h1>
              </div>
            </div>
            <p className="text-slate-500 font-medium italic text-lg max-w-xl">Santa Teresa Benedetta della Croce: Portale di Gestione Centralizzata</p>
          </div>

          <div className="flex flex-col items-end gap-6 w-full md:w-auto">
            <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
              <div className="bg-white px-6 py-3 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <UserIcon size={20} />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Accesso come</p>
                  <p className="text-sm font-bold text-slate-900 italic">{user ? "Amministratore" : portalUser?.volunteerName || "Utente Portale"}</p>
                </div>
              </div>

              {(user || portalUser) && (
                <button
                  onClick={() => logout()}
                  className="flex items-center gap-2 bg-slate-100 text-slate-500 px-6 py-3.5 rounded-2xl font-black shadow-sm border border-transparent hover:bg-red-50 hover:text-red-600 transition-all uppercase tracking-widest text-[10px]"
                >
                  <LogOut size={16} /> Esci
                </button>
              )}
            </div>

            {user && (
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => navigate('/utenti')}
                  className="flex items-center gap-2 bg-white text-slate-700 px-6 py-3.5 rounded-2xl font-black shadow-sm border border-slate-200 hover:bg-slate-50 transition-all uppercase tracking-widest text-[10px]"
                >
                  <Shield size={16} className="text-blue-600" /> Gestione Utenti
                </button>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3.5 rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest text-[10px]"
                >
                  <Plus size={16} /> Nuova Parrocchia
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredParishes.map((parish) => (
            <motion.div
              key={parish.id}
              whileHover={{ y: -8 }}
              onClick={() => selectParish(parish.id)}
              className="bg-white rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-slate-200 transition-all text-left flex flex-col group relative overflow-hidden cursor-pointer h-full"
            >
              {/* Featured Image Section */}
              <div className="relative h-56 shrink-0 bg-slate-100 overflow-hidden">
                {parish.featuredImageUrl ? (
                  <img 
                    src={parish.featuredImageUrl} 
                    alt="" 
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                    <Building2 size={64} className="text-slate-300 opacity-20" />
                  </div>
                )}
                {/* Visual Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                
                {/* Badge */}
                <div className="absolute top-6 right-6">
                   <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                      <span className="text-[9px] font-black uppercase text-slate-900 tracking-widest">{parish.diocese || 'Milano'}</span>
                   </div>
                </div>
              </div>

              <div className="p-8 space-y-8 flex-1 flex flex-col">
                {/* Header with Logo and Name */}
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-white rounded-2xl p-0.5 shadow-xl border border-slate-100 shrink-0 flex items-center justify-center overflow-hidden">
                    {parish.logoUrl ? (
                      <img src={parish.logoUrl} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <Building2 size={24} className="text-slate-300" />
                    )}
                  </div>
                  <div className="space-y-1">
                  <h3 className="text-2xl font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase italic leading-tight tracking-tight">{parish.name}</h3>
                  <div className="flex items-center gap-2 text-blue-500">
                    <MapPin size={14} className="shrink-0" />
                    <p className="text-[10px] font-black uppercase tracking-widest italic">{parish.address || 'Indirizzo non specificato'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 flex-1">
                  {/* Priest Section */}
                  <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100/50 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-100">
                      <UserIcon size={20} />
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Prete Referente</p>
                      <p className="text-sm font-black text-slate-900 italic uppercase">{parish.contactPerson || 'Non assegnato'}</p>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-4 px-2">
                    <div className="flex items-center gap-5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Phone size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Telefono</p>
                        <p className="text-sm font-mono font-bold text-slate-700">{parish.phone || 'Non disponibile'}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-5">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <Mail size={18} />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">E-mail</p>
                        <p className="text-sm font-bold text-slate-700 truncate italic">{parish.email || 'Nessun contatto'}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between w-full pt-6 border-t border-slate-100">
                  <div className="flex items-center gap-3">
                    {user && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setParishToDelete(parish);
                        }}
                        className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                        title="Elimina Unità"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest italic">{parish.pastoralCommunity || 'S.T.B.C.'}</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-2xl text-white shadow-lg group-hover:bg-blue-600 transition-all flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest hidden group-hover:block px-2">Gestisci</span>
                    <ChevronRight size={20} />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {parishes.length === 0 && (
            <div className="col-span-full py-24 bg-white rounded-[3rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-4">
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center">
                <Building2 size={40} strokeWidth={1} />
              </div>
              <p className="font-bold uppercase tracking-widest text-sm">Nessuna parrocchia configurata</p>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="text-blue-600 font-bold hover:underline"
              >
                Crea la prima adesso
              </button>
            </div>
          )}
        </div>
      </div>

      {parishToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-8 rounded-[3rem] shadow-2xl max-w-sm w-full text-center space-y-6"
          >
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto">
              <AlertCircle size={40} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase italic">Elimina Unità?</h3>
              <p className="text-slate-500 text-sm mt-2">
                Stai per eliminare <strong>{parishToDelete.name}</strong>. Questa azione è irreversibile e rimuoverà solo il riferimento principale.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setParishToDelete(null)}
                className="px-6 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
              >
                Annulla
              </button>
              <button
                onClick={handleDeleteParish}
                className="px-6 py-4 rounded-2xl bg-red-600 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Elimina
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl overflow-hidden border border-white"
          >
            <div className="p-8 pb-4 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase italic">Nuova Unità</h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Configura una nuova parrocchia o servizio</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-50 rounded-2xl transition-all text-slate-400">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            <form onSubmit={handleCreateParish} className="p-8 pt-4 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Parrocchia / Servizio</label>
                  <input
                    required
                    type="text"
                    placeholder="es. Basilica di Superga"
                    value={newParish.name}
                    onChange={(e) => setNewParish({ ...newParish, name: e.target.value })}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Indirizzo</label>
                  <input
                    type="text"
                    placeholder="Via Roma 1, Città"
                    value={newParish.address}
                    onChange={(e) => setNewParish({ ...newParish, address: e.target.value })}
                    className="w-full px-6 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL Logo</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={newParish.logoUrl}
                    onChange={(e) => setNewParish({ ...newParish, logoUrl: e.target.value })}
                    className="w-full px-6 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL Immagine Evidenza</label>
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={newParish.featuredImageUrl}
                    onChange={(e) => setNewParish({ ...newParish, featuredImageUrl: e.target.value })}
                    className="w-full px-6 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                  <input
                    type="email"
                    placeholder="parrocchia@email.it"
                    value={newParish.email}
                    onChange={(e) => setNewParish({ ...newParish, email: e.target.value })}
                    className="w-full px-6 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefono</label>
                  <input
                    type="tel"
                    placeholder="+39 ..."
                    value={newParish.phone}
                    onChange={(e) => setNewParish({ ...newParish, phone: e.target.value })}
                    className="w-full px-6 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Referente / Parroco</label>
                  <input
                    type="text"
                    placeholder="Don Mario"
                    value={newParish.contactPerson}
                    onChange={(e) => setNewParish({ ...newParish, contactPerson: e.target.value })}
                    className="w-full px-6 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Diocesi</label>
                  <input
                    type="text"
                    placeholder="es. Diocesi di Milano"
                    value={newParish.diocese}
                    onChange={(e) => setNewParish({ ...newParish, diocese: e.target.value })}
                    className="w-full px-6 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comunità Pastorale</label>
                  <input
                    type="text"
                    placeholder="es. Comunità San Paolo"
                    value={newParish.pastoralCommunity}
                    onChange={(e) => setNewParish({ ...newParish, pastoralCommunity: e.target.value })}
                    className="w-full px-6 py-3 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Colore Identificativo</label>
                  <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border-2 border-transparent">
                    <input
                      type="color"
                      value={newParish.color}
                      onChange={(e) => setNewParish({ ...newParish, color: e.target.value })}
                      className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent p-0"
                    />
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-slate-700">Branding UI</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrizione Breve</label>
                  <textarea
                    rows={2}
                    placeholder="Descrivi brevemente l'unità..."
                    value={newParish.description}
                    onChange={(e) => setNewParish({ ...newParish, description: e.target.value })}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-400 outline-none transition-all font-bold text-slate-900 resize-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-5 rounded-[2.5rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
              >
                Crea e Attiva Unità
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default MasterDashboard;
