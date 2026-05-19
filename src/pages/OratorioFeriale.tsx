import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection } from '../components/ParishContext';
import { 
  Sun, 
  Plus, 
  Users, 
  Calendar, 
  Clock, 
  Trash2, 
  Pencil, 
  Search, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Trophy,
  UserCheck,
  UserX,
  Phone,
  Mail,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface Animator {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
}

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  activity: string;
  animatorIds: string[];
  createdAt: string;
}

interface Kid {
  firstName: string;
  lastName: string;
  note?: string;
}

interface Team {
  id: string;
  name: string;
  color: string;
  animatorIds: string[];
  kids: Kid[];
  createdAt: string;
}

interface Absence {
  id: string;
  animatorId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  createdAt: string;
}

const OratorioFeriale: React.FC = () => {
  const { currentParish } = useParish();
  const animatorsColl = useParishCollection('oratorio_animators');
  const shiftsColl = useParishCollection('oratorio_shifts');
  const teamsColl = useParishCollection('oratorio_teams');
  const absencesColl = useParishCollection('oratorio_absences');

  const [activeTab, setActiveTab] = useState<'animators' | 'shifts' | 'teams' | 'absences'>('animators');
  const [animators, setAnimators] = useState<Animator[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Animators State
  const [animatorForm, setAnimatorForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: ''
  });

  // Shifts State
  const [shiftForm, setShiftForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '08:30',
    endTime: '17:30',
    activity: '',
    animatorIds: [] as string[]
  });

  // Teams State
  const [teamForm, setTeamForm] = useState({
    name: '',
    color: '#3B82F6',
    animatorIds: [] as string[],
    kids: [] as Kid[]
  });
  const [newKid, setNewKid] = useState({ firstName: '', lastName: '', note: '' });

  // Absences State
  const [absenceForm, setAbsenceForm] = useState({
    animatorId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '',
    endTime: '',
    reason: ''
  });

  useEffect(() => {
    if (!currentParish) return;

    const unsubAnimators = onSnapshot(query(animatorsColl, orderBy('lastName', 'asc')), (snap) => {
      setAnimators(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Animator)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'oratorio_animators'));

    const unsubShifts = onSnapshot(query(shiftsColl, orderBy('date', 'desc')), (snap) => {
      setShifts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shift)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'oratorio_shifts'));

    const unsubTeams = onSnapshot(query(teamsColl, orderBy('name', 'asc')), (snap) => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'oratorio_teams'));

    const unsubAbsences = onSnapshot(query(absencesColl, orderBy('date', 'desc')), (snap) => {
      setAbsences(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Absence)));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'oratorio_absences'));

    return () => {
      unsubAnimators();
      unsubShifts();
      unsubTeams();
      unsubAbsences();
    };
  }, [currentParish?.id]);

  const resetForms = () => {
    setAnimatorForm({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
    setShiftForm({ date: format(new Date(), 'yyyy-MM-dd'), startTime: '08:30', endTime: '17:30', activity: '', animatorIds: [] });
    setTeamForm({ name: '', color: '#3B82F6', animatorIds: [], kids: [] });
    setAbsenceForm({ animatorId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '', endTime: '', reason: '' });
    setNewKid({ firstName: '', lastName: '', note: '' });
    setEditingId(null);
    setErrorStatus(null);
  };

  const handleOpenModal = (type: typeof activeTab, data?: any) => {
    resetForms();
    if (data) {
      setEditingId(data.id);
      if (type === 'animators') setAnimatorForm({ ...data });
      if (type === 'shifts') setShiftForm({ ...data });
      if (type === 'teams') setTeamForm({ ...data });
      if (type === 'absences') setAbsenceForm({ ...data });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorStatus(null);

    try {
      let coll;
      let payload: any;

      if (activeTab === 'animators') {
        coll = animatorsColl;
        payload = { ...animatorForm };
      } else if (activeTab === 'shifts') {
        coll = shiftsColl;
        payload = { ...shiftForm };
      } else if (activeTab === 'teams') {
        coll = teamsColl;
        payload = { ...teamForm };
      } else {
        coll = absencesColl;
        payload = { ...absenceForm };
      }

      if (editingId) {
        await updateDoc(doc(coll, editingId), { ...payload, updatedAt: new Date().toISOString() });
      } else {
        await addDoc(coll, { ...payload, createdAt: new Date().toISOString() });
      }

      setSuccessStatus('Salvataggio completato!');
      setTimeout(() => setSuccessStatus(null), 3000);
      setIsModalOpen(false);
      resetForms();
    } catch (error) {
      console.error('Save error:', error);
      setErrorStatus('Errore durante il salvataggio. Riprova.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, coll: any) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo elemento?')) return;
    try {
      await deleteDoc(doc(coll, id));
    } catch (error) {
      console.error('Delete error:', error);
      alert('Errore durante l\'eliminazione.');
    }
  };

  const TabItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
        activeTab === id 
          ? 'bg-blue-600 text-white shadow-xl shadow-blue-100 scale-105 z-10' 
          : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100 hover:border-slate-200 shadow-sm'
      }`}
    >
      <Icon size={16} />
      <span className="hidden md:inline">{label}</span>
    </button>
  );

  if (loading && !currentParish) return null;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-2xl shadow-sm">
              <Sun size={24} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight italic uppercase">Oratorio Feriale</h1>
              <p className="text-slate-500 text-xs md:text-sm font-medium">Gestione animatori, turni, squadre ed assenze.</p>
            </div>
          </div>
        </div>
        {activeTab !== 'animators' && (
          <button
            onClick={() => handleOpenModal(activeTab)}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-full font-black uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 text-[11px]"
          >
            <Plus size={20} />
            Aggiungi {activeTab === 'shifts' ? 'Turno' : activeTab === 'teams' ? 'Squadra' : 'Assenza'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 overflow-x-auto pb-4 custom-scrollbar">
        <TabItem id="animators" label="Animatori" icon={Users} />
        <TabItem id="shifts" label="Turni" icon={Clock} />
        <TabItem id="teams" label="Squadre" icon={Trophy} />
        <TabItem id="absences" label="Assenze" icon={UserX} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {activeTab === 'animators' && (
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 border-b border-slate-50 bg-blue-50/10">
              <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-widest flex items-center gap-3">
                <Users size={18} className="text-blue-600" />
                Elenco Rapido Animatori
              </h3>
            </div>
            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/30 border-b border-slate-100 italic">
                    <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Nome</th>
                    <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Cognome</th>
                    <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Telefono (opz)</th>
                    <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Email (opz)</th>
                    <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {/* Insertion Row */}
                  <tr className="bg-blue-50/5 group">
                    <td className="px-6 py-4">
                      <input 
                        type="text" 
                        value={animatorForm.firstName} 
                        onChange={e => setAnimatorForm({...animatorForm, firstName: e.target.value})} 
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold" 
                        placeholder="Nome..."
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input 
                        type="text" 
                        value={animatorForm.lastName} 
                        onChange={e => setAnimatorForm({...animatorForm, lastName: e.target.value})} 
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold" 
                        placeholder="Cognome..."
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input 
                        type="tel" 
                        value={animatorForm.phone} 
                        onChange={e => setAnimatorForm({...animatorForm, phone: e.target.value})} 
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-mono font-bold" 
                        placeholder="Telefono..."
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input 
                        type="email" 
                        value={animatorForm.email} 
                        onChange={e => setAnimatorForm({...animatorForm, email: e.target.value})} 
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold" 
                        placeholder="Email..."
                      />
                    </td>
                    <td className="px-8 py-4 text-right">
                      <button
                        onClick={async () => {
                          if (!animatorForm.firstName || !animatorForm.lastName) return;
                          setIsSaving(true);
                          try {
                            await addDoc(animatorsColl, { 
                              ...animatorForm, 
                              createdAt: new Date().toISOString() 
                            });
                            setAnimatorForm({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
                            setSuccessStatus('Animatore aggiunto!');
                            setTimeout(() => setSuccessStatus(null), 2000);
                          } catch (err) {
                            setErrorStatus('Errore durante il salvataggio.');
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        disabled={isSaving || !animatorForm.firstName || !animatorForm.lastName}
                        className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-30 active:scale-95"
                      >
                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                      </button>
                    </td>
                  </tr>

                  {/* List Rows */}
                  {animators.length > 0 ? animators.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-4">
                        <span className="text-xs font-bold text-slate-700 italic uppercase">{a.firstName}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-xs font-black text-slate-900 italic uppercase">{a.lastName}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-xs font-mono font-bold text-slate-500">{a.phone || '-'}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-xs font-bold text-slate-400 italic">{a.email || '-'}</span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleOpenModal('animators', a)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Modifica dettagli/note">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(a.id, animatorsColl)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <Users size={40} className="mx-auto text-slate-100 mb-4" />
                        <p className="text-slate-300 font-black uppercase tracking-widest text-[9px]">Nessun animatore registrato</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'shifts' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {shifts.length > 0 ? shifts.map(s => (
              <div key={s.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all">
                <div className="flex items-center gap-6">
                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex flex-col items-center min-w-[80px]">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{format(new Date(s.date), 'MMM', { locale: it })}</span>
                    <span className="text-2xl font-black text-blue-600">{format(new Date(s.date), 'dd')}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tight">{s.activity || 'Attività Oratorio'}</h3>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <Clock size={12} /> {s.startTime} - {s.endTime}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex flex-wrap gap-2 px-4">
                  {s.animatorIds.map(aid => {
                    const anim = animators.find(a => a.id === aid);
                    return anim ? (
                      <span key={aid} className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg border border-slate-100 italic">
                        {anim.lastName} {anim.firstName[0]}.
                      </span>
                    ) : null;
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleOpenModal('shifts', s)} className="p-3 text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors"><Pencil size={18} /></button>
                  <button onClick={() => handleDelete(s.id, shiftsColl)} className="p-3 text-red-600 hover:bg-red-50 rounded-2xl transition-colors"><Trash2 size={18} /></button>
                </div>
              </div>
            )) : (
              <div className="py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                <Clock size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Nessun turno programmato</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {teams.length > 0 ? teams.map(t => (
              <div key={t.id} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-lg transition-all border-t-8" style={{ borderTopColor: t.color }}>
                <div className="p-8 pb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">{t.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {t.animatorIds.map(aid => {
                        const anim = animators.find(a => a.id === aid);
                        return anim ? (
                          <span key={aid} className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 italic flex items-center gap-1.5">
                            <UserCheck size={10} />
                            {anim.lastName} {anim.firstName[0]}.
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleOpenModal('teams', t)} className="p-3 text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors"><Pencil size={20} /></button>
                    <button onClick={() => handleDelete(t.id, teamsColl)} className="p-3 text-red-600 hover:bg-red-50 rounded-2xl transition-colors"><Trash2 size={20} /></button>
                  </div>
                </div>
                <div className="p-8 pt-4 flex-1">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                        <Users size={12} /> Elenco Ragazzi ({t.kids.length})
                      </span>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                      {t.kids.map((k, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-white last:border-0">
                          <span className="text-xs font-bold text-slate-700 italic">{k.lastName} {k.firstName}</span>
                          {k.note && <span className="text-[9px] text-slate-400 italic truncate max-w-[120px]">{k.note}</span>}
                        </div>
                      ))}
                      {t.kids.length === 0 && <p className="text-[10px] text-slate-300 uppercase font-black italic py-4 text-center">Nessun ragazzo assegnato</p>}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                <Trophy size={48} className="mx-auto text-slate-200 mb-4" />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Nessuna squadra creata</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'absences' && (
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 border-b border-slate-50 bg-slate-50/30">
              <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-widest flex items-center gap-3">
                <UserX size={18} className="text-red-500" />
                Riepilogo Assenze Animatori
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/10 border-b border-slate-100">
                    <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Data</th>
                    <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Animatore</th>
                    <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Orario</th>
                    <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Motivazione</th>
                    <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 italic">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {absences.length > 0 ? absences.map(ab => {
                    const anim = animators.find(a => a.id === ab.animatorId);
                    return (
                      <tr key={ab.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-5">
                          <span className="text-xs font-black text-slate-900 italic">{format(new Date(ab.date), 'dd/MM/yyyy')}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center text-[10px] font-black uppercase">
                              {anim?.lastName[0]}{anim?.firstName[0]}
                            </div>
                            <span className="text-xs font-bold text-slate-700 italic">{anim?.lastName} {anim?.firstName}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-xs font-bold text-slate-500">
                            {ab.startTime && ab.endTime ? `${ab.startTime} - ${ab.endTime}` : 'Intera Giornata'}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-xs font-medium text-slate-400 italic">{ab.reason || '-'}</span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleOpenModal('absences', ab)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => handleDelete(ab.id, absencesColl)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <UserX size={48} className="mx-auto text-slate-100 mb-4" />
                        <p className="text-slate-300 font-black uppercase tracking-widest text-[10px]">Nessuna assenza segnalata</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in fade-in duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase italic">
                  {editingId ? 'Modifica' : 'Nuovo'} {activeTab === 'animators' ? 'Animatore' : activeTab === 'shifts' ? 'Turno' : activeTab === 'teams' ? 'Squadra' : 'Assenza'}
                </h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configurazione Oratorio Feriale</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2.5 hover:bg-slate-100 rounded-full transition-all text-slate-300">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {activeTab === 'animators' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome</label>
                      <input required type="text" value={animatorForm.firstName} onChange={e => setAnimatorForm({...animatorForm, firstName: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner" placeholder="es. Luca"/>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cognome</label>
                      <input required type="text" value={animatorForm.lastName} onChange={e => setAnimatorForm({...animatorForm, lastName: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner" placeholder="es. Verdi"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                      <input type="email" value={animatorForm.email} onChange={e => setAnimatorForm({...animatorForm, email: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner" placeholder="es. luca@mail.it"/>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefono</label>
                      <input type="tel" value={animatorForm.phone} onChange={e => setAnimatorForm({...animatorForm, phone: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-mono font-bold shadow-inner" placeholder="+39 333..."/>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Note / Allergie / Info</label>
                    <textarea value={animatorForm.notes} onChange={e => setAnimatorForm({...animatorForm, notes: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner" rows={3} placeholder="Aggiungi eventuali informazioni importanti..."/>
                  </div>
                </div>
              )}

              {activeTab === 'shifts' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                      <input required type="date" value={shiftForm.date} onChange={e => setShiftForm({...shiftForm, date: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner outline-none"/>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Inizio</label>
                      <input required type="time" value={shiftForm.startTime} onChange={e => setShiftForm({...shiftForm, startTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner outline-none"/>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fine</label>
                      <input required type="time" value={shiftForm.endTime} onChange={e => setShiftForm({...shiftForm, endTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner outline-none"/>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Attività Principale</label>
                    <input required type="text" value={shiftForm.activity} onChange={e => setShiftForm({...shiftForm, activity: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner" placeholder="es. Laboratori, Tornei, Compiti..."/>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleziona Animatori</label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-4 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner custom-scrollbar">
                      {animators.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            const ids = shiftForm.animatorIds.includes(a.id) 
                              ? shiftForm.animatorIds.filter(id => id !== a.id)
                              : [...shiftForm.animatorIds, a.id];
                            setShiftForm({...shiftForm, animatorIds: ids});
                          }}
                          className={`flex items-center gap-3 p-3 rounded-xl transition-all border text-left italic ${
                            shiftForm.animatorIds.includes(a.id) 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' 
                              : 'bg-white text-slate-500 border-slate-100 hover:border-blue-400'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${shiftForm.animatorIds.includes(a.id) ? 'bg-white/20' : 'bg-slate-50 text-slate-400'}`}>
                            {a.lastName[0]}{a.firstName[0]}
                          </div>
                          <span className="text-[11px] font-bold truncate">{a.lastName} {a.firstName}</span>
                        </button>
                      ))}
                      {animators.length === 0 && <p className="col-span-full py-4 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">Nessun animatore disponibile</p>}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'teams' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Squadra</label>
                      <input required type="text" value={teamForm.name} onChange={e => setTeamForm({...teamForm, name: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner" placeholder="es. I Draghi Rossi"/>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Colore Rappresentativo</label>
                        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-50 shadow-inner">
                            <input type="color" value={teamForm.color} onChange={e => setTeamForm({...teamForm, color: e.target.value})} className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent"/>
                            <span className="text-xs font-bold text-slate-500 font-mono italic">{teamForm.color.toUpperCase()}</span>
                        </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Animatori della Squadra</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-4 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner custom-scrollbar">
                      {animators.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            const ids = teamForm.animatorIds.includes(a.id) 
                              ? teamForm.animatorIds.filter(id => id !== a.id)
                              : [...teamForm.animatorIds, a.id];
                            setTeamForm({...teamForm, animatorIds: ids});
                          }}
                          className={`flex items-center gap-3 p-3 rounded-xl transition-all border text-left italic ${
                            teamForm.animatorIds.includes(a.id) 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' 
                              : 'bg-white text-slate-500 border-slate-100 hover:border-blue-400'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${teamForm.animatorIds.includes(a.id) ? 'bg-white/20' : 'bg-slate-50 text-slate-400'}`}>
                            {a.lastName[0]}{a.firstName[0]}
                          </div>
                          <span className="text-[11px] font-bold truncate">{a.lastName} {a.firstName}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gestione Elenco Ragazzi</label>
                    <div className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 shadow-inner space-y-4">
                        <div className="flex flex-wrap gap-2 mb-4">
                            {teamForm.kids.map((k, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white text-slate-600 px-4 py-2 rounded-xl border border-slate-100 text-[11px] font-bold shadow-sm animate-in fade-in zoom-in italic">
                                    <span>{k.lastName} {k.firstName[0]}.</span>
                                    <button type="button" onClick={() => setTeamForm({...teamForm, kids: teamForm.kids.filter((_, i) => i !== idx)})} className="text-red-400 hover:text-red-600"><X size={14}/></button>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input type="text" placeholder="Nome" value={newKid.firstName} onChange={e => setNewKid({...newKid, firstName: e.target.value})} className="px-4 py-3 bg-white rounded-xl border-none text-xs font-bold shadow-sm outline-none focus:ring-1 focus:ring-blue-500"/>
                            <input type="text" placeholder="Cognome" value={newKid.lastName} onChange={e => setNewKid({...newKid, lastName: e.target.value})} className="px-4 py-3 bg-white rounded-xl border-none text-xs font-bold shadow-sm outline-none focus:ring-1 focus:ring-blue-500"/>
                        </div>
                        <div className="flex gap-2">
                            <input type="text" placeholder="Note (es. allergie)" value={newKid.note} onChange={e => setNewKid({...newKid, note: e.target.value})} className="flex-1 px-4 py-3 bg-white rounded-xl border-none text-xs font-bold shadow-sm outline-none focus:ring-1 focus:ring-blue-500"/>
                            <button 
                                type="button" 
                                onClick={() => {
                                    if(!newKid.firstName || !newKid.lastName) return;
                                    setTeamForm({...teamForm, kids: [...teamForm.kids, newKid]});
                                    setNewKid({firstName: '', lastName: '', note: ''});
                                }}
                                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
                            >
                                <Plus size={20}/>
                            </button>
                        </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'absences' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleziona Animatore</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-4 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner custom-scrollbar">
                      {animators.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setAbsenceForm({...absenceForm, animatorId: a.id})}
                          className={`flex items-center gap-3 p-3 rounded-xl transition-all border text-left italic ${
                            absenceForm.animatorId === a.id
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' 
                              : 'bg-white text-slate-500 border-slate-100 hover:border-blue-400'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${absenceForm.animatorId === a.id ? 'bg-white/20' : 'bg-slate-50 text-slate-400'}`}>
                            {a.lastName[0]}{a.firstName[0]}
                          </div>
                          <span className="text-[11px] font-bold truncate">{a.lastName} {a.firstName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Assenza</label>
                        <input required type="date" value={absenceForm.date} onChange={e => setAbsenceForm({...absenceForm, date: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner outline-none"/>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dalle (opz)</label>
                        <input type="time" value={absenceForm.startTime} onChange={e => setAbsenceForm({...absenceForm, startTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner outline-none"/>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alle (opz)</label>
                        <input type="time" value={absenceForm.endTime} onChange={e => setAbsenceForm({...absenceForm, endTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner outline-none"/>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivazione / Note</label>
                    <textarea value={absenceForm.reason} onChange={e => setAbsenceForm({...absenceForm, reason: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner italic" rows={2} placeholder="es. Esame universitario, Visita medica..."/>
                  </div>
                </div>
              )}

              {errorStatus && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3">
                  <AlertCircle size={18} className="shrink-0" />
                  <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">{errorStatus}</p>
                </div>
              )}

              <div className="flex gap-4 pt-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all border border-slate-100 shadow-sm italic"
                >
                  Annulla
                </button>
                <button
                  disabled={isSaving}
                  type="submit"
                  className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-blue-600 transition-all disabled:opacity-50 italic"
                >
                  {isSaving ? 'Salvataggio...' : 'Conferma e Salva'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {successStatus && (
        <div className="fixed bottom-10 right-10 z-[100] animate-in slide-in-from-right-10 fade-in duration-300">
           <div className="bg-green-600 text-white px-6 py-4 rounded-2xl shadow-[0_20px_50px_rgba(22,163,74,0.3)] flex items-center gap-4 border-2 border-white/20">
              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                 <CheckCircle2 size={20} />
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest italic">{successStatus}</span>
           </div>
        </div>
      )}
    </div>
  );
};

export default OratorioFeriale;
