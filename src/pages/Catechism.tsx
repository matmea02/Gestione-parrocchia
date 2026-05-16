import React, { useEffect, useState } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  query, 
  orderBy,
  writeBatch,
  where,
  getDocs
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { 
  BookOpen, 
  Plus, 
  Users, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Trash2, 
  Pencil, 
  X, 
  ChevronRight,
  FileText,
  Info,
  CheckCircle2,
  AlertCircle,
  FilePlus,
  ArrowRight,
  GraduationCap
} from 'lucide-react';
import { format, addWeeks, isBefore, isAfter, startOfDay, parseISO, getDay } from 'date-fns';
import { it } from 'date-fns/locale';

interface CatechismGroup {
  id: string;
  name: string;
  year: string; // Birth year of children
  pathYear: string; // e.g. 1° anno, 2° anno...
  catechismYear: string; // e.g. 2025/26
  dayOfWeek: string;
  time: string;
  catechistIds: string[];
  catechistNames: string[];
  subscriberCount: number;
  notes: string;
  documents: { id: string; name: string; date: string; url?: string }[];
  meetingDates: string[];
  calendarId?: string;
  calendarEventIds?: string[];
  createdAt: string;
}

const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

const Catechism: React.FC = () => {
  const { currentParish } = useParish();
  const groupsColl = useParishCollection('catechism_groups');
  const volunteersColl = useParishCollection('volunteers');
  const calendarsColl = useParishCollection('calendars');
  const calEventsColl = useParishCollection('calendar_events');

  const [groups, setGroups] = useState<CatechismGroup[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [catechismCalendarId, setCatechismCalendarId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: '',
    year: format(new Date(), 'yyyy'),
    pathYear: '1° anno',
    catechismYear: `${format(new Date(), 'yyyy')}/${format(addWeeks(new Date(), 52), 'yy')}`,
    dayOfWeek: '1', // Monday
    time: '17:00',
    catechistIds: [] as string[],
    subscriberCount: 0,
    notes: '',
    documents: [] as { id: string; name: string; date: string; url?: string }[],
    meetingDates: [] as string[],
    dateRange: {
      start: format(new Date(), 'yyyy-MM-dd'),
      end: format(addWeeks(new Date(), 12), 'yyyy-MM-dd')
    },
    frequency: '1', // weeks
    singleDate: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    // 1. Fetch Catechism Groups
    const q = query(groupsColl, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setGroups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CatechismGroup)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'catechism_groups');
    });

    // 2. Fetch Volunteers (Catechists)
    const vQuery = query(volunteersColl);
    const unsubV = onSnapshot(vQuery, (snap) => {
      const allV = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      setVolunteers(allV.filter(v => (v.groups || []).includes('CATECHISTA')));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'volunteers');
    });

    // 3. Ensure Catechism Calendar exists
    const unsubCal = onSnapshot(calendarsColl, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const catCal = data.find(c => c.name.toUpperCase() === 'CATECHISMO');
      if (catCal) {
        setCatechismCalendarId(catCal.id);
      } else {
        addDoc(calendarsColl, {
          name: 'CATECHISMO',
          color: '#4f46e5', // Indigo-600
          visible: true
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'calendars'));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calendars');
    });

    return () => {
      unsub();
      unsubV();
      unsubCal();
    };
  }, []);

  const generateDates = () => {
    const startDate = parseISO(form.dateRange.start);
    const endDate = parseISO(form.dateRange.end);
    const targetDay = parseInt(form.dayOfWeek);
    const step = parseInt(form.frequency) || 1;
    
    let current = startDate;
    const dates: string[] = [];
    
    while (isBefore(current, endDate) || format(current, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')) {
      if (getDay(current) === targetDay) {
        dates.push(format(current, 'yyyy-MM-dd'));
        current = addWeeks(current, step);
      } else {
        current = addWeeks(current, 1);
      }
    }
    
    // Merge with existing avoiding duplicates
    setForm(prev => ({ 
      ...prev, 
      meetingDates: Array.from(new Set([...prev.meetingDates, ...dates])).sort() 
    }));
  };

  const addSingleDate = () => {
    if (!form.singleDate) return;
    setForm(prev => ({
      ...prev,
      meetingDates: Array.from(new Set([...prev.meetingDates, form.singleDate])).sort()
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newDoc = {
        id: crypto.randomUUID(),
        name: file.name,
        date: new Date().toISOString(),
        url: '#' // Simulated URL
      };
      setForm(prev => ({ ...prev, documents: [...prev.documents, newDoc] }));
    }
  };

  const syncMeetingsWithCalendar = async (groupId: string, data: Partial<CatechismGroup>) => {
    if (!catechismCalendarId) return;

    // Remove old events first if they exist
    const oldGroup = groups.find(g => g.id === groupId);
    if (oldGroup?.calendarEventIds) {
      for (const eventId of oldGroup.calendarEventIds) {
        try {
          await deleteDoc(doc(calEventsColl, eventId));
        } catch (e) {
          console.warn('Event not found during cleanup');
        }
      }
    }

    // Create new events
    const eventIds: string[] = [];
    for (const date of data.meetingDates || []) {
      const startTime = `${date}T${data.time || '17:00'}:00`;
      const endTime = `${date}T${(parseInt((data.time || '17:00').split(':')[0]) + 1).toString().padStart(2, '0')}:${(data.time || '17:00').split(':')[1]}:00`;
      
      const eventRef = await addDoc(calEventsColl, {
        title: `CATECHISMO - ${data.year}`,
        start: startTime,
        end: endTime,
        calendarId: catechismCalendarId,
        description: `Gruppo: ${data.name} (${data.year})\nCatechisti: ${(data.catechistNames || []).join(', ')}\nNote: ${data.notes || ''}`,
        sourceCatechismId: groupId,
        isCatechism: true,
        year: data.year,
        name: data.name,
        pathYear: data.pathYear,
        catechistNames: data.catechistNames
      });
      eventIds.push(eventRef.id);
    }

    await updateDoc(doc(groupsColl, groupId), { calendarEventIds: eventIds });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedCatechists = volunteers.filter(v => form.catechistIds.includes(v.id));
    const catechistNames = selectedCatechists.map(v => `${v.lastName} ${v.firstName}`);

    const payload = {
      name: form.name,
      year: form.year,
      pathYear: form.pathYear,
      catechismYear: form.catechismYear,
      dayOfWeek: form.dayOfWeek,
      time: form.time,
      catechistIds: form.catechistIds,
      catechistNames,
      subscriberCount: form.subscriberCount,
      notes: form.notes,
      documents: form.documents,
      meetingDates: form.meetingDates,
      updatedAt: new Date().toISOString()
    };

    try {
      let finalId = editingId;
      if (editingId) {
        await updateDoc(doc(groupsColl, editingId), payload);
      } else {
        const docRef = await addDoc(groupsColl, {
          ...payload,
          createdAt: new Date().toISOString()
        });
        finalId = docRef.id;
      }

      if (finalId) {
        await syncMeetingsWithCalendar(finalId, payload);
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'catechism_groups');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    const group = groups.find(g => g.id === id);
    if (group?.calendarEventIds) {
      for (const eventId of group.calendarEventIds) {
        try {
          await deleteDoc(doc(calEventsColl, eventId));
        } catch (e) {}
      }
    }
    await deleteDoc(doc(groupsColl, id));
  };

  const openModal = (g?: CatechismGroup) => {
    if (g) {
      setForm({
        name: g.name,
        year: g.year,
        pathYear: g.pathYear || '1° anno',
        catechismYear: g.catechismYear || '',
        dayOfWeek: g.dayOfWeek,
        time: g.time,
        catechistIds: g.catechistIds || [],
        subscriberCount: g.subscriberCount,
        notes: g.notes,
        documents: g.documents || [],
        meetingDates: g.meetingDates || [],
        dateRange: {
          start: g.meetingDates?.[0] || format(new Date(), 'yyyy-MM-dd'),
          end: g.meetingDates?.[g.meetingDates.length - 1] || format(addWeeks(new Date(), 12), 'yyyy-MM-dd')
        },
        frequency: '1',
        singleDate: format(new Date(), 'yyyy-MM-dd')
      });
      setEditingId(g.id);
    } else {
      setForm({
        name: '',
        year: format(new Date(), 'yyyy'),
        pathYear: '1° anno',
        catechismYear: `${format(new Date(), 'yyyy')}/${format(addWeeks(new Date(), 52), 'yy')}`,
        dayOfWeek: '1',
        time: '17:00',
        catechistIds: [],
        subscriberCount: 0,
        notes: '',
        documents: [],
        meetingDates: [],
        dateRange: {
          start: format(new Date(), 'yyyy-MM-dd'),
          end: format(addWeeks(new Date(), 12), 'yyyy-MM-dd')
        },
        frequency: '1',
        singleDate: format(new Date(), 'yyyy-MM-dd')
      });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Catechismo</h1>
          <p className="text-slate-500 font-medium">Gestione percorsi formativi e gruppi di catechismo.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all text-xs uppercase tracking-[0.15em]"
        >
          <Plus size={18} />
          Nuovo Gruppo
        </button>
      </div>

      <div className="space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm animate-pulse flex items-center gap-6">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-50 rounded-lg w-1/4" />
                <div className="h-3 bg-slate-50 rounded-lg w-1/3" />
              </div>
            </div>
          ))
        ) : groups.length > 0 ? (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Gruppo / Percorso</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Incontro</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Catechista</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Iscritti</th>
                    <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Documenti</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {groups.map((group) => (
                    <tr key={group.id} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                            <GraduationCap size={22} />
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-black text-slate-900 italic">{group.name}</h3>
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase rounded-lg tracking-wider">
                                {group.catechismYear}
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{group.pathYear || 'Percorso'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-slate-700">
                            <CalendarIcon size={14} className="text-indigo-500" />
                            <span className="text-xs font-bold">{dayNames[parseInt(group.dayOfWeek)]}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-400">
                            <Clock size={12} />
                            <span className="text-[10px] font-black uppercase">{group.time}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                            <User size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-600 truncate max-w-[150px]">
                              {group.catechistNames?.join(', ') || 'Nessuno'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
                          <Users size={12} className="text-indigo-500" />
                          <span className="text-xs font-black text-slate-700">{group.subscriberCount}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="flex justify-center flex-wrap gap-1 max-w-[120px] mx-auto">
                          {group.documents?.length > 0 ? (
                            <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[9px] font-black rounded-lg border border-indigo-100">
                              {group.documents.length} FILE
                            </span>
                          ) : (
                            <span className="text-[9px] font-black text-slate-300 uppercase">Nessuno</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openModal(group)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                            <Pencil size={18} />
                          </button>
                          <button onClick={() => handleDeleteGroup(group.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-white rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-6">
             <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
               <GraduationCap size={48} strokeWidth={1} />
             </div>
             <div className="space-y-2">
               <h3 className="text-xl font-black text-slate-900">Nessun gruppo configurato</h3>
               <p className="text-slate-400 font-medium">Inizia creando il primo percorso di catechismo.</p>
             </div>
             <button
               onClick={() => openModal()}
               className="px-8 py-3.5 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all text-xs uppercase tracking-widest"
             >
               Crea Gruppo
             </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
          <div className="bg-white w-full max-w-5xl rounded-[40px] shadow-2xl h-[90vh] flex flex-col animate-in fade-in zoom-in duration-300">
            <div className="p-8 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <GraduationCap size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">{editingId ? 'Modifica Gruppo' : 'Nuovo Gruppo Catechismo'}</h2>
                  <p className="text-[10px] uppercase font-black tracking-[0.2em] text-indigo-500">Impostazioni Percorso</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 bg-slate-50/20">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Info Base */}
                <div className="space-y-8">
                  <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                       <Info size={14} className="text-indigo-500" /> Dati Generali
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2 col-span-full">
                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1">Nome Gruppo</label>
                        <input
                          required
                          type="text"
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none transition-all text-sm font-bold"
                          placeholder="es. III Elementare"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1">Anno Catechismo</label>
                        <input
                          required
                          type="text"
                          value={form.catechismYear}
                          onChange={(e) => setForm({ ...form, catechismYear: e.target.value })}
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none transition-all text-sm font-bold"
                          placeholder="es. 2025/26"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1">Anno Nascita Bambini</label>
                        <input
                          required
                          type="text"
                          value={form.year}
                          onChange={(e) => setForm({ ...form, year: e.target.value })}
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none transition-all text-sm font-bold"
                          placeholder="es. 2018"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1">Anno Percorso (es. 1° anno)</label>
                        <input
                          required
                          type="text"
                          value={form.pathYear}
                          onChange={(e) => setForm({ ...form, pathYear: e.target.value })}
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none transition-all text-sm font-bold"
                          placeholder="es. 1° anno"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1">N° Iscritti</label>
                        <input
                          type="number"
                          value={form.subscriberCount}
                          onChange={(e) => setForm({ ...form, subscriberCount: parseInt(e.target.value) || 0 })}
                          className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none transition-all text-sm font-bold"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-slate-500 uppercase ml-1">Catechisti (Volontari "CATECHISTA")</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus-within:border-indigo-400 transition-all">
                        {volunteers.map(v => (
                          <label key={v.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 cursor-pointer hover:border-indigo-200 transition-all group">
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${form.catechistIds.includes(v.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'}`}>
                              {form.catechistIds.includes(v.id) && <CheckCircle2 size={12} className="text-white" />}
                            </div>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={form.catechistIds.includes(v.id)}
                              onChange={(e) => {
                                const newIds = e.target.checked 
                                  ? [...form.catechistIds, v.id]
                                  : form.catechistIds.filter(id => id !== v.id);
                                setForm({ ...form, catechistIds: newIds });
                              }}
                            />
                            <span className="text-xs font-bold text-slate-700">{v.lastName} {v.firstName}</span>
                          </label>
                        ))}
                      </div>
                      {volunteers.length === 0 && (
                        <p className="text-[10px] text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-center gap-2">
                          <AlertCircle size={14} /> Nessun volontario nel gruppo "CATECHISTA" trovato.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                        <FilePlus size={14} className="text-indigo-500" /> Documenti
                      </h3>
                      <label className="p-2 bg-indigo-600 text-white rounded-xl cursor-pointer hover:bg-indigo-700 transition-all">
                        <Plus size={18} />
                        <input type="file" onChange={handleFileUpload} className="hidden" />
                      </label>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                      {form.documents.map((doc, idx) => (
                        <div key={doc.id} className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-lg text-slate-400">
                              <FileText size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{doc.name}</p>
                              <p className="text-[9px] text-slate-400 uppercase font-black">{format(new Date(doc.date), 'dd MMM yyyy', { locale: it })}</p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== doc.id) }))}
                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {form.documents.length === 0 && (
                        <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Nessun documento</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Calendar & Scheduling */}
                <div className="space-y-8">
                  <div className="bg-slate-900 p-8 rounded-[3rem] text-white space-y-8 shadow-xl">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                      <CalendarIcon size={14} className="text-indigo-400" /> Pianificazione Incontri
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase ml-1">Giorno Settimana</label>
                        <select
                          value={form.dayOfWeek}
                          onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
                          className="w-full px-5 py-3.5 rounded-2xl bg-white/10 border-none focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-bold text-white appearance-none cursor-pointer"
                        >
                          {dayNames.map((day, idx) => (
                            <option key={idx} value={idx} className="bg-slate-900 text-white">{day}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase ml-1">Orario Incontro</label>
                        <input
                          type="time"
                          value={form.time}
                          onChange={(e) => setForm({ ...form, time: e.target.value })}
                          className="w-full px-5 py-3.5 rounded-2xl bg-white/10 border-none focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-bold text-white"
                        />
                      </div>
                    </div>

                    <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/10 space-y-6">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest text-center">Generazione Automatica Date</p>
                      
                      <div className="grid grid-cols-1 gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Dal</label>
                            <input
                              type="date"
                              value={form.dateRange.start}
                              onChange={(e) => setForm({ ...form, dateRange: { ...form.dateRange, start: e.target.value } })}
                              className="w-full px-4 py-3 rounded-xl bg-white/5 border-none text-xs font-bold text-white outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <ArrowRight size={16} className="text-slate-600 mt-5" />
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Al</label>
                            <input
                              type="date"
                              value={form.dateRange.end}
                              onChange={(e) => setForm({ ...form, dateRange: { ...form.dateRange, end: e.target.value } })}
                              className="w-full px-4 py-3 rounded-xl bg-white/5 border-none text-xs font-bold text-white outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Frequenza Ripetizione</label>
                          <select
                            value={form.frequency}
                            onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border-none text-xs font-bold text-white outline-none focus:ring-1 focus:ring-indigo-500 appearance-none"
                          >
                            <option value="1" className="bg-slate-900">Ogni settimana</option>
                            <option value="2" className="bg-slate-900">Ogni 2 settimane</option>
                            <option value="3" className="bg-slate-900">Ogni 3 settimane</option>
                            <option value="4" className="bg-slate-900">Ogni 4 settimane (Mensile)</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={generateDates}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/40"
                      >
                        Genera Sequenza Date
                      </button>
                    </div>

                    {/* Manual Date Entry */}
                    <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/10 space-y-4">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest text-center">Inserimento Manuale Data</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={form.singleDate}
                          onChange={(e) => setForm({ ...form, singleDate: e.target.value })}
                          className="flex-1 px-4 py-3 rounded-xl bg-white/5 border-none text-xs font-bold text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={addSingleDate}
                          className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{form.meetingDates.length} Incontri programmati</h4>
                        <button 
                          type="button"
                          onClick={() => setForm(p => ({ ...p, meetingDates: [] }))}
                          className="text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors uppercase"
                        >
                          Svuota
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-2">
                        {form.meetingDates.map((date, idx) => (
                          <div key={idx} className="px-3 py-2 bg-white/5 rounded-xl border border-white/5 text-[11px] font-bold text-slate-300 flex items-center justify-between group/date">
                            {format(parseISO(date), 'dd/MM/yyyy')}
                            <button 
                              type="button"
                              onClick={() => setForm(p => ({ ...p, meetingDates: p.meetingDates.filter((_, i) => i !== idx) }))}
                              className="text-red-400 opacity-0 group-hover/date:opacity-100 transition-opacity"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      {form.meetingDates.length === 0 && (
                        <p className="text-xs text-slate-500 italic text-center py-4">Genera le date per popolare il calendario.</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-4">
                    <label className="text-[11px] font-black text-slate-500 uppercase ml-1">Note Aggiuntive</label>
                    <textarea
                      rows={4}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-5 py-4 rounded-3xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm resize-none"
                      placeholder="Note per il catechista o dettagli sul percorso..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-12">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-8 py-5 rounded-3xl font-black text-xs text-slate-400 hover:bg-slate-100 transition-all uppercase tracking-[0.2em]"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-slate-900 text-white px-10 py-5 rounded-3xl font-black text-xs shadow-xl hover:bg-indigo-600 transition-all uppercase tracking-[0.2em] active:scale-95"
                >
                  {editingId ? 'Salva Modifiche' : 'Conferma e Crea Gruppo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Catechism;
