import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, query, orderBy, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Calendar, 
  Clock, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ChevronDown, 
  Search, 
  Building, 
  MessageSquare, 
  Send, 
  ArrowLeft 
} from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

interface Parish {
  id: string;
  name: string;
  color?: string;
}

interface Season {
  id: string;
  days: string[];
}

interface Animator {
  id: string;
  firstName: string;
  lastName: string;
  seasons?: string[];
}

const SegnalaAssenza: React.FC = () => {
  const navigate = useNavigate();

  // Step state: 'parish' | 'form' | 'success'
  const [step, setStep] = useState<'parish' | 'form' | 'success'>('parish');

  // Firestore collections & states
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [selectedParishId, setSelectedParishId] = useState<string>(() => localStorage.getItem('self_service_parish_id') || '');
  const [selectedParish, setSelectedParish] = useState<Parish | null>(null);

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');

  const [animators, setAnimators] = useState<Animator[]>([]);
  const [selectedAnimatorId, setSelectedAnimatorId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAnimatorDropdownOpen, setIsAnimatorDropdownOpen] = useState(false);

  // Form Fields
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [timeMode, setTimeMode] = useState<'full' | 'morning' | 'afternoon' | 'custom'>('full');
  const [startTime, setStartTime] = useState<string>('08:30');
  const [endTime, setEndTime] = useState<string>('17:30');
  const [reason, setReason] = useState<string>('');

  // Statuses
  const [isLoading, setIsLoading] = useState(false);
  const [statusError, setStatusError] = useState<string>('');

  // 1. Load Parishes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'parishes'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Parish));
      setParishes(list);
      
      // If we have a saved id, restore selectedParish details
      if (selectedParishId) {
        const found = list.find(p => p.id === selectedParishId);
        if (found) {
          setSelectedParish(found);
          setStep('form');
        }
      }
    });
    return unsub;
  }, [selectedParishId]);

  // 2. Load Seasons and Animators when Parish is selected
  useEffect(() => {
    if (!selectedParishId) {
      setSeasons([]);
      setAnimators([]);
      return;
    }

    // Load Seasons
    const unsubSeasons = onSnapshot(collection(db, 'parishes', selectedParishId, 'oratorio_seasons'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Season));
      setSeasons(list);
      
      // Auto-select latest season
      if (list.length > 0) {
        const sorted = [...list].sort((a, b) => b.id.localeCompare(a.id));
        setSelectedSeason(sorted[0].id);
      }
    });

    // Load Animators
    const unsubAnimators = onSnapshot(
      query(collection(db, 'parishes', selectedParishId, 'oratorio_animators'), orderBy('lastName', 'asc')),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Animator));
        setAnimators(list);
      }
    );

    return () => {
      unsubSeasons();
      unsubAnimators();
    };
  }, [selectedParishId]);

  const handleSelectParish = (p: Parish) => {
    setSelectedParish(p);
    setSelectedParishId(p.id);
    localStorage.setItem('self_service_parish_id', p.id);
    setStep('form');
  };

  const handleResetParish = () => {
    setSelectedParish(null);
    setSelectedParishId('');
    localStorage.removeItem('self_service_parish_id');
    setStep('parish');
    setSelectedAnimatorId('');
    setSearchQuery('');
  };

  // Filter animators by active season and query
  const filteredAnimators = animators.filter(a => {
    const matchesSeason = selectedSeason ? a.seasons?.includes(selectedSeason) : true;
    const fullName = `${a.firstName} ${a.lastName}`.toLowerCase();
    const reverseFullName = `${a.lastName} ${a.firstName}`.toLowerCase();
    const matchesSearch = searchQuery 
      ? fullName.includes(searchQuery.toLowerCase()) || reverseFullName.includes(searchQuery.toLowerCase())
      : true;
    return matchesSeason && matchesSearch;
  });

  const selectedAnimator = animators.find(a => a.id === selectedAnimatorId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParishId) return;
    if (!selectedAnimatorId) {
      setStatusError('Seleziona il tuo nome e cognome.');
      return;
    }
    if (!date) {
      setStatusError('Seleziona la data dell\'assenza.');
      return;
    }

    setIsLoading(true);
    setStatusError('');

    try {
      let finalStartTime = '';
      let finalEndTime = '';
      let finalReason = reason.trim();

      if (timeMode === 'morning') {
        finalStartTime = '08:30';
        finalEndTime = '13:30';
        if (!finalReason) finalReason = 'Solo Mattina';
      } else if (timeMode === 'afternoon') {
        finalStartTime = '13:30';
        finalEndTime = '17:30';
        if (!finalReason) finalReason = 'Solo Pomeriggio';
      } else if (timeMode === 'custom') {
        finalStartTime = startTime;
        finalEndTime = endTime;
        if (!finalReason) finalReason = 'Orario personalizzato';
      }

      await addDoc(collection(db, 'parishes', selectedParishId, 'oratorio_absences'), {
        animatorId: selectedAnimatorId,
        date,
        season: selectedSeason,
        startTime: finalStartTime,
        endTime: finalEndTime,
        reason: finalReason,
        createdAt: new Date().toISOString()
      });

      setStep('success');
    } catch (err: any) {
      console.error(err);
      setStatusError('Impossibile salvare la segnalazione. Riprova più tardi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReportAnother = () => {
    // Keep animator selected for convenience, change date & reset reason
    setDate(new Date().toISOString().split('T')[0]);
    setTimeMode('full');
    setReason('');
    setStatusError('');
    setStep('form');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans text-slate-800">
      
      {/* Header Container */}
      <header className="bg-white border-b border-slate-100 py-5 px-6 shadow-xs select-none">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <h1 className="text-md font-black tracking-tight text-slate-900 uppercase italic">Oratorio Estivo</h1>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Segnalazione Assenza Rapida</p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/login')}
            className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
          >
            <ArrowLeft size={10} /> Login admin
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-8 flex flex-col justify-center">
        
        {step === 'parish' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] shadow-xl p-8 border border-slate-100 text-center space-y-6"
          >
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center text-3xl mx-auto shadow-inner">
              <Building size={28} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-900 uppercase italic">Seleziona la tua Parrocchia</h2>
              <p className="text-xs text-slate-500 font-medium">Scegli la tua comunità pastorale o parrocchia per poter inviare la segnalazione.</p>
            </div>

            {parishes.length === 0 ? (
              <div className="flex items-center justify-center py-6 gap-2 text-slate-400 text-xs">
                <Loader2 className="animate-spin text-blue-600" size={16} /> Caricamento parrocchie...
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {parishes.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectParish(p)}
                    className="w-full text-left p-5 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-2xl font-bold flex items-center justify-between transition-all group"
                  >
                    <span className="text-sm text-slate-800 font-extrabold">{p.name}</span>
                    <span className="text-xl group-hover:translate-x-1 transition-transform">➡️</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {step === 'form' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Header / Parish info */}
            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-lg">
                  ⛪
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">{selectedParish?.name}</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Stagione Attiva: {selectedSeason}</p>
                </div>
              </div>
              <button
                onClick={handleResetParish}
                className="text-[9px] font-black uppercase text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl transition-all"
              >
                Cambia
              </button>
            </div>

            {/* Main Form */}
            <form onSubmit={handleSubmit} className="bg-white rounded-[2.5rem] shadow-xl p-8 border border-slate-100 space-y-6">
              
              {/* Season Selection (Optional Dropdown if multiple exist) */}
              {seasons.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Stagione</label>
                  <select
                    value={selectedSeason}
                    onChange={(e) => {
                      setSelectedSeason(e.target.value);
                      setSelectedAnimatorId('');
                      setSearchQuery('');
                    }}
                    className="w-full p-4 text-xs font-bold bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                  >
                    {seasons.map(s => (
                      <option key={s.id} value={s.id}>Stagione Oratorio {s.id}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Animator Search & Selection */}
              <div className="space-y-1.5 relative">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1">
                  <User size={12} /> Nome e Cognome Animatore
                </label>
                
                {/* Custom autocomplete input */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search size={16} />
                  </div>
                  <input
                    type="text"
                    placeholder="Digita per cercare il tuo nome..."
                    value={searchQuery}
                    onFocus={() => setIsAnimatorDropdownOpen(true)}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsAnimatorDropdownOpen(true);
                    }}
                    className="w-full pl-11 pr-11 py-4 text-xs font-bold bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                  {selectedAnimatorId && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-600 text-xs font-black">
                      ✓
                    </span>
                  )}
                </div>

                {isAnimatorDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-50">
                    {filteredAnimators.length === 0 ? (
                      <div className="p-4 text-slate-400 text-xs font-medium text-center italic">
                        Nessun animatore trovato
                      </div>
                    ) : (
                      filteredAnimators.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setSelectedAnimatorId(a.id);
                            setSearchQuery(`${a.lastName} ${a.firstName}`);
                            setIsAnimatorDropdownOpen(false);
                          }}
                          className={`w-full text-left px-5 py-3 text-xs font-bold transition-all flex items-center justify-between ${
                            selectedAnimatorId === a.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span>{a.lastName} {a.firstName}</span>
                          {selectedAnimatorId === a.id && <span className="text-blue-600 font-bold">✓</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}

                {selectedAnimator && (
                  <p className="text-[10px] text-slate-500 font-bold mt-1 ml-1">
                    Hai selezionato: <span className="text-slate-800 font-black uppercase text-[11px]">{selectedAnimator.lastName} {selectedAnimator.firstName}</span>
                  </p>
                )}
              </div>

              {/* Absence Date */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1">
                  <Calendar size={12} /> Data dell'assenza
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-4 text-xs font-bold bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                />
              </div>

              {/* Time Selection Mode */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1">
                  <Clock size={12} /> Tipologia Assenza
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTimeMode('full')}
                    className={`py-3.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                      timeMode === 'full' 
                        ? 'bg-blue-650 bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Tutto il giorno
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeMode('morning')}
                    className={`py-3.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                      timeMode === 'morning' 
                        ? 'bg-blue-650 bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Solo Mattina
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeMode('afternoon')}
                    className={`py-3.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                      timeMode === 'afternoon' 
                        ? 'bg-blue-650 bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Solo Pomeriggio
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeMode('custom')}
                    className={`py-3.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                      timeMode === 'custom' 
                        ? 'bg-blue-650 bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Orario Personalizzato
                  </button>
                </div>
              </div>

              {/* Custom Hours inputs */}
              {timeMode === 'custom' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Da (Ora inizio)</span>
                    <input 
                      type="time" 
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full p-3.5 text-xs font-bold bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">A (Ora fine)</span>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full p-3.5 text-xs font-bold bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </motion.div>
              )}

              {/* Motivo dell'assenza (Reason description) */}
              <div className="space-y-1.5 overflow-hidden">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1">
                  <MessageSquare size={12} /> Motivo / Note aggiuntive
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Es. Visita medica, esame, studio, febbre..."
                  rows={2}
                  className="w-full p-4 text-xs font-bold bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                />
              </div>

              {statusError && (
                <div className="bg-red-50 text-red-600 p-4 border border-red-100 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2.5">
                  <AlertCircle size={16} /> {statusError}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-5 bg-slate-900 text-white rounded-[1.8rem] font-black uppercase tracking-[0.15em] text-xs shadow-xl hover:bg-blue-600 active:scale-98 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <Send size={15} />
                    Invia Segnalazione
                  </>
                )}
              </button>

            </form>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2.5rem] shadow-xl p-8 border border-slate-100 text-center space-y-6"
          >
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-5xl mx-auto shadow-inner">
              <CheckCircle2 size={36} className="text-emerald-555 text-emerald-600" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-900 uppercase italic">Segnalato con Successo!</h2>
              <p className="text-xs text-slate-500 font-bold leading-relaxed px-2">
                La tua assenza è stata registrata correttamente ed è ora visibile in tempo reale al coordinatore dell'oratorio feriale.
              </p>
            </div>

            <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 text-left text-xs space-y-1.5">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Animatore</span>
                <p className="font-extrabold text-slate-800">{selectedAnimator?.lastName} {selectedAnimator?.firstName}</p>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-between">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Giorno</span>
                  <span className="font-extrabold text-slate-800">{date.split('-').reverse().join('/')}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Fascia Oraria</span>
                  <span className="font-extrabold text-slate-800">
                    {timeMode === 'full' && 'Tutto il giorno'}
                    {timeMode === 'morning' && 'Solo Mattina'}
                    {timeMode === 'afternoon' && 'Solo Pomeriggio'}
                    {timeMode === 'custom' && `${startTime} - ${endTime}`}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2.5">
              <button
                onClick={handleReportAnother}
                className="w-full py-4.5 bg-slate-900 text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-wider hover:bg-slate-850 hover:scale-102 active:scale-98 transition-all shadow-sm"
              >
                Segnala un'altra assenza
              </button>
              
              <button
                onClick={handleResetParish}
                className="w-full py-4.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-[1.5rem] font-black uppercase text-[10px] tracking-wider transition-all border border-slate-100"
              >
                Torna alle parrocchie
              </button>
            </div>
          </motion.div>
        )}

      </main>

      {/* Footer disclaimer */}
      <footer className="py-6 text-center select-none">
        <p className="text-[9px] font-black uppercase text-slate-300 tracking-[0.4em]">
          Comunità Pastorale • S.T.B.C.
        </p>
      </footer>

    </div>
  );
};

export default SegnalaAssenza;
