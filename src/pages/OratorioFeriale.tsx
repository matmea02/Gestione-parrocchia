import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  setDoc,
  query, 
  orderBy,
  writeBatch 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { 
  Sun, 
  Plus, 
  Users, 
  Calendar, 
  Clock, 
  Trash2, 
  Pencil, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Trophy,
  UserCheck,
  UserX,
  Phone,
  Check,
  Download,
  UserMinus
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Animator {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  notes?: string;
  seasons?: string[];
  createdAt: string;
}

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  activity: string;
  animatorIds: string[];
  season?: string;
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
  season?: string;
  createdAt: string;
}

interface Absence {
  id: string;
  animatorId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
  season?: string;
  createdAt: string;
}

const OratorioFeriale: React.FC = () => {
  const { currentParish } = useParish();
  const animatorsColl = useParishCollection('oratorio_animators');
  const shiftsColl = useParishCollection('oratorio_shifts');
  const teamsColl = useParishCollection('oratorio_teams');
  const absencesColl = useParishCollection('oratorio_absences');
  const seasonsColl = useParishCollection('oratorio_seasons');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [parishInfo, setParishInfo] = useState<any>({
    name: currentParish?.name || '',
    logoUrl: currentParish?.logoUrl || '',
    diocese: '',
    pastoralCommunity: '',
    address: '',
    phone: '',
    email: ''
  });

  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'animators' | 'shifts' | 'teams' | 'absences'>('animators');
  const [animators, setAnimators] = useState<Animator[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [seasonsData, setSeasonsData] = useState<{ [seasonId: string]: string[] }>({});
  const [loading, setLoading] = useState(true);

  // Active season state (persisted)
  const [activeSeason, setActiveSeason] = useState<string>(() => {
    return localStorage.getItem('oratorio_active_season') || '2026';
  });

  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (errorStatus) {
      const timer = setTimeout(() => setErrorStatus(null), 5050);
      return () => clearTimeout(timer);
    }
  }, [errorStatus]);

  useEffect(() => {
    if (successStatus) {
      const timer = setTimeout(() => setSuccessStatus(null), 5050);
      return () => clearTimeout(timer);
    }
  }, [successStatus]);

  // Modal and custom generation states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [onlyActiveSeasonAnimators, setOnlyActiveSeasonAnimators] = useState(true);

  // Seasons dropdown and days popup states
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const [isSeasonManagerOpen, setIsSeasonManagerOpen] = useState(false);
  const [isDaysConfigOpen, setIsDaysConfigOpen] = useState(false);
  const [selectedWeekId, setSelectedWeekId] = useState<string>('all');
  const [lastInitializedSeason, setLastInitializedSeason] = useState<string>('');
  const [selectedRecapDay, setSelectedRecapDay] = useState<string>('');
  const [seasonManagerForm, setSeasonManagerForm] = useState({
    name: '',
    isEditing: false,
    editingId: '',
    editingName: ''
  });

  // Cell-level grid click quick absence modal
  const [selectedGridAbsence, setSelectedGridAbsence] = useState<{
    anim: Animator;
    day: string;
    existingAbs?: Absence;
  } | null>(null);

  const [customAbsTime, setCustomAbsTime] = useState({
    show: false,
    startTime: '08:30',
    endTime: '13:30',
    reason: ''
  });

  // Custom delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);

  // Forms
  const [animatorForm, setAnimatorForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: '',
    seasons: [activeSeason]
  });

  const [editingAnimatorId, setEditingAnimatorId] = useState<string | null>(null);
  const [editingAnimatorForm, setEditingAnimatorForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: '',
    seasons: [] as string[]
  });

  const [shiftForm, setShiftForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '08:30',
    endTime: '17:30',
    activity: '',
    animatorIds: [] as string[]
  });

  const [teamForm, setTeamForm] = useState({
    name: '',
    color: '#3B82F6',
    animatorIds: [] as string[],
    kids: [] as Kid[]
  });
  const [newKid, setNewKid] = useState({ firstName: '', lastName: '', note: '' });

  const [absenceForm, setAbsenceForm] = useState({
    animatorId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '',
    endTime: '',
    reason: ''
  });

  // Helper helper to generate weedkays in a range
  const getDatesInRange = (startDateStr: string, endDateStr: string) => {
    const dates = [];
    const curr = new Date(startDateStr);
    const end = new Date(endDateStr);
    while (curr <= end) {
      const dayOfWeek = curr.getDay(); // 0 is Sunday, 6 is Saturday
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Lun-Ven
        dates.push(curr.toISOString().split('T')[0]);
      }
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  // Filters by Active Season
  const belongsToSeason = (a: Animator) => {
    if (!a.seasons || a.seasons.length === 0) {
      return activeSeason === '2026' || activeSeason === '26';
    }
    return a.seasons.includes(activeSeason);
  };

  const activeSeasonAnimatorsList = animators.filter(belongsToSeason);
  const filteredAnimators = animators.filter(a => !onlyActiveSeasonAnimators || belongsToSeason(a));

  const filteredShifts = shifts.filter(s => s.season === activeSeason || (!s.season && new Date(s.date).getFullYear().toString() === activeSeason));
  const filteredTeams = teams.filter(t => t.season === activeSeason || (!t.season && (activeSeason === '2026' || activeSeason === '26')));
  const filteredAbsences = absences.filter(ab => ab.season === activeSeason || (!ab.season && (activeSeason === '2026' || activeSeason === '26')));

  const activeSeasonDays = seasonsData[activeSeason] || [];

  const getWeeks = () => {
    const sorted = [...activeSeasonDays].sort((a, b) => a.localeCompare(b));
    const groupsMap: { [mondayStr: string]: string[] } = {};
    
    sorted.forEach(dayStr => {
      const parts = dayStr.split('-');
      if (parts.length < 3) return;
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const date = parseInt(parts[2], 10);
      
      const d = new Date(year, month, date, 12, 0, 0);
      const day = d.getDay();
      
      const offset = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + offset);
      
      const yyyy = monday.getFullYear();
      const mm = String(monday.getMonth() + 1).padStart(2, '0');
      const dd = String(monday.getDate()).padStart(2, '0');
      const mondayStr = `${yyyy}-${mm}-${dd}`;
      
      if (!groupsMap[mondayStr]) {
        groupsMap[mondayStr] = [];
      }
      groupsMap[mondayStr].push(dayStr);
    });
    
    const groups = Object.keys(groupsMap).map(mondayStr => {
      const parts = mondayStr.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const mondayDate = new Date(y, m, d, 12, 0, 0);
      const sundayDate = new Date(mondayDate);
      sundayDate.setDate(mondayDate.getDate() + 4); // Mon to Fri
      
      const label = `Settimana ${format(mondayDate, 'dd/MM')} - ${format(sundayDate, 'dd/MM')}`;
      return {
        id: mondayStr,
        label,
        days: groupsMap[mondayStr],
        mondayDate
      };
    });
    
    groups.sort((a, b) => a.mondayDate.getTime() - b.mondayDate.getTime());
    return groups;
  };

  // Calculate distinct list of seasons (from database and active animators, fall back to default if totally empty)
  const allSeasons = Array.from(new Set([
    ...Object.keys(seasonsData),
    ...animators.flatMap(a => a.seasons || [])
  ])).filter(s => s && s.trim() !== '');

  allSeasons.sort((a, b) => b.localeCompare(a));

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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'oratorio_absences'));

    const unsubSeasons = onSnapshot(seasonsColl, (snap) => {
      const result: { [seasonId: string]: string[] } = {};
      snap.docs.forEach(docSnap => {
        result[docSnap.id] = docSnap.data().days || [];
      });
      setSeasonsData(result);
      setLoading(false);

      // Auto-provision a default season '2026' only if the collection is completely empty
      if (snap.empty) {
        setDoc(doc(seasonsColl, '2026'), { days: [], createdAt: new Date().toISOString() })
          .catch(err => console.error("Could not create default season in Firebase", err));
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'oratorio_seasons'));

    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    }, (error) => {
      console.warn('Could not read settings/parish, using fallback', error);
    });

    return () => {
      unsubAnimators();
      unsubShifts();
      unsubTeams();
      unsubAbsences();
      unsubSeasons();
      unsubParish();
    };
  }, [currentParish?.id]);

  useEffect(() => {
    if (activeSeasonDays.length === 0) {
      setSelectedWeekId('all');
      return;
    }

    if (lastInitializedSeason === activeSeason) {
      return;
    }

    const currentWeeks = getWeeks();
    if (currentWeeks.length === 0) {
      setSelectedWeekId('all');
      return;
    }

    const d = new Date();
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + offset);
    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    const todayMondayStr = `${yyyy}-${mm}-${dd}`;

    const matchingWeek = currentWeeks.find(w => w.id === todayMondayStr);
    if (matchingWeek) {
      setSelectedWeekId(matchingWeek.id);
    } else {
      setSelectedWeekId(currentWeeks[0].id);
    }
    setLastInitializedSeason(activeSeason);
  }, [activeSeason, activeSeasonDays.length, lastInitializedSeason]);

  // Automatic clean up of Alessandro Grimoldi from DB as requested by user
  useEffect(() => {
    if (animators.length > 0) {
      const target = animators.find(a => {
        const fn = (a.firstName || '').toLowerCase().trim();
        const ln = (a.lastName || '').toLowerCase().trim();
        return (
          fn === 'alessandro' && ln === 'grimoldi' ||
          fn === 'grimoldi' && ln === 'alessandro' ||
          fn.includes('grimoldi') ||
          ln.includes('grimoldi')
        );
      });
      if (target) {
        console.log("Removing Alessandro Grimoldi as explicitly requested:", target.id);
        const removeGrimoldi = async () => {
          try {
            if (!auth.currentUser) {
              try {
                const { signInAnonymously } = await import('firebase/auth');
                await signInAnonymously(auth);
              } catch (authErr: any) {
                console.warn("Silent anonymous sign-in skipped (auth disabled or restricted):", authErr.message || authErr);
              }
            }
            // 1. Delete animator document
            await deleteDoc(doc(animatorsColl, target.id));

            // 2. Clean up his shifts assignments
            const relatedShifts = shifts.filter(s => s.animatorIds?.includes(target.id));
            for (const s of relatedShifts) {
              const nextAnimators = (s.animatorIds || []).filter(id => id !== target.id);
              await updateDoc(doc(shiftsColl, s.id), { animatorIds: nextAnimators });
            }

            // 3. Clean up his absences
            const relatedAbsences = absences.filter(ab => ab.animatorId === target.id);
            for (const ab of relatedAbsences) {
              await deleteDoc(doc(absencesColl, ab.id));
            }

            // 4. Clean up team assignments
            const relatedTeams = teams.filter(t => t.animatorIds?.includes(target.id));
            for (const t of relatedTeams) {
              const nextAnimators = (t.animatorIds || []).filter(id => id !== target.id);
              await updateDoc(doc(teamsColl, t.id), { animatorIds: nextAnimators });
            }

            console.log("Alessandro Grimoldi successfully removed from database, shifts, absences and teams.");
            setSuccessStatus("Profilo di Alessandro Grimoldi rimosso con successo dal sistema!");
            setTimeout(() => setSuccessStatus(null), 3000);
          } catch (err) {
            console.error("Error removing Alessandro Grimoldi:", err);
          }
        };
        removeGrimoldi();
      }
    }
  }, [animators, shifts, absences, teams]);

  useEffect(() => {
    const days = seasonsData[activeSeason] || [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (days.includes(todayStr)) {
      setSelectedRecapDay(todayStr);
    } else if (days.length > 0) {
      const sorted = [...days].sort((a, b) => a.localeCompare(b));
      setSelectedRecapDay(sorted[0]);
    } else {
      setSelectedRecapDay('');
    }
  }, [activeSeason, seasonsData]);

  const resetForms = () => {
    setAnimatorForm({ firstName: '', lastName: '', email: '', phone: '', notes: '', seasons: [activeSeason] });
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
      if (type === 'animators') setAnimatorForm({ ...data, seasons: data.seasons || [activeSeason] });
      if (type === 'shifts') setShiftForm({ ...data });
      if (type === 'teams') setTeamForm({ ...data });
      if (type === 'absences') setAbsenceForm({ ...data });
    }
    setIsModalOpen(true);
  };

  const handleAddSeason = async (seasonName: string) => {
    if (!seasonName.trim()) return;
    const cleanName = seasonName.trim();
    if (allSeasons.includes(cleanName)) {
      alert('Questa stagione esiste già!');
      return;
    }
    try {
      await setDoc(doc(seasonsColl, cleanName), { days: [], createdAt: new Date().toISOString() });
      setActiveSeason(cleanName);
      localStorage.setItem('oratorio_active_season', cleanName);
      setSuccessStatus(`Stagione ${cleanName} creata!`);
      setTimeout(() => setSuccessStatus(null), 2000);
    } catch (err) {
      console.error('Error adding season:', err);
    }
  };

  const handleRenameSeason = async (oldId: string, newId: string) => {
    if (!newId.trim() || oldId === newId) return;
    const cleanNewId = newId.trim();
    if (allSeasons.includes(cleanNewId)) {
      alert('Questa stagione esiste già!');
      return;
    }
    setIsSaving(true);
    try {
      // 1. Clone season doc
      const oldDays = seasonsData[oldId] || [];
      await setDoc(doc(seasonsColl, cleanNewId), { days: oldDays, createdAt: new Date().toISOString() });
      await deleteDoc(doc(seasonsColl, oldId));

      // 2. Update local state & storage if active
      if (activeSeason === oldId) {
        setActiveSeason(cleanNewId);
        localStorage.setItem('oratorio_active_season', cleanNewId);
      }

      // 3. Migrate Animators
      const animatorsToUpdate = animators.filter(a => a.seasons?.includes(oldId));
      for (const a of animatorsToUpdate) {
        const nextSeasons = a.seasons?.map(s => s === oldId ? cleanNewId : s) || [];
        await updateDoc(doc(animatorsColl, a.id), { seasons: nextSeasons });
      }

      // 4. Migrate Shifts
      const shiftsToUpdate = shifts.filter(s => s.season === oldId);
      for (const s of shiftsToUpdate) {
        await updateDoc(doc(shiftsColl, s.id), { season: cleanNewId });
      }

      // 5. Migrate Teams
      const teamsToUpdate = teams.filter(t => t.season === oldId);
      for (const t of teamsToUpdate) {
        await updateDoc(doc(teamsColl, t.id), { season: cleanNewId });
      }

      // 6. Migrate Absences
      const absencesToUpdate = absences.filter(ab => ab.season === oldId);
      for (const ab of absencesToUpdate) {
        await updateDoc(doc(absencesColl, ab.id), { season: cleanNewId });
      }

      setSuccessStatus(`Stagione rinominata con successo in ${cleanNewId}!`);
      setTimeout(() => setSuccessStatus(null), 2000);
    } catch (err) {
      console.error(err);
      setErrorStatus('Errore durante la ridenominazione della stagione.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSeason = (seasonId: string) => {
    setDeleteModalError(null);
    setDeleteConfirmation({
      isOpen: true,
      title: 'Elimina Stagione',
      message: `Sei sicuro di voler eliminare la stagione "${seasonId}"? Questo eliminerà i dati di configurazione dei giorni della stagione feriale, le iscrizioni degli animatori, i turni, le squadre e le assenze associate.`,
      onConfirm: async () => {
        setIsSaving(true);
        setDeleteModalError(null);
        setErrorStatus(null);
        try {
          if (!auth.currentUser) {
            console.log("Nessun utente autenticato su Firebase. Tentativo di sign-in anonimo...");
            try {
              const { signInAnonymously } = await import('firebase/auth');
              await signInAnonymously(auth);
              console.log("Sign-in anonimo completato con successo!");
            } catch (authErr: any) {
              console.warn("Sign-in anonimo saltato (disabilitato o limitato):", authErr.message || authErr);
            }
          }

          console.log(`[Season delete] Executing resilient deletion/cleanup of season ${seasonId}`);

          // 1. Delete season config document
          try {
            await deleteDoc(doc(seasonsColl, seasonId));
            console.log(`[Season delete] Season config deleted`);
          } catch (e: any) {
            console.error("[Season delete] Error deleting season doc:", e);
            throw new Error(`Impossibile eliminare la configurazione della stagione: ${e.message || e}`);
          }

          // 2. Clean up animators seasons
          const animatorsToUpdate = animators.filter(a => a.seasons?.includes(seasonId));
          console.log(`[Season delete] Updating ${animatorsToUpdate.length} animators`);
          await Promise.all(
            animatorsToUpdate.map(async (a) => {
              try {
                const nextSeasons = (a.seasons || []).filter(s => s !== seasonId);
                await updateDoc(doc(animatorsColl, a.id), { seasons: nextSeasons });
              } catch (e: any) {
                console.warn(`[Season delete] Could not update seasons for animator ${a.id}:`, e);
              }
            })
          );

          // 3. Clean up shifts
          const shiftsToDelete = shifts.filter(s => s.season === seasonId);
          console.log(`[Season delete] Deleting ${shiftsToDelete.length} shifts`);
          await Promise.all(
            shiftsToDelete.map(async (s) => {
              try {
                await deleteDoc(doc(shiftsColl, s.id));
              } catch (e: any) {
                console.warn(`[Season delete] Could not delete shift ${s.id}:`, e);
              }
            })
          );

          // 4. Clean up teams
          const teamsToDelete = teams.filter(t => t.season === seasonId);
          console.log(`[Season delete] Deleting ${teamsToDelete.length} teams`);
          await Promise.all(
            teamsToDelete.map(async (t) => {
              try {
                await deleteDoc(doc(teamsColl, t.id));
              } catch (e: any) {
                console.warn(`[Season delete] Could not delete team ${t.id}:`, e);
              }
            })
          );

          // 5. Clean up absences
          const absencesToDelete = absences.filter(ab => ab.season === seasonId);
          console.log(`[Season delete] Deleting ${absencesToDelete.length} absences`);
          await Promise.all(
            absencesToDelete.map(async (ab) => {
              try {
                await deleteDoc(doc(absencesColl, ab.id));
              } catch (e: any) {
                console.warn(`[Season delete] Could not delete absence ${ab.id}:`, e);
              }
            })
          );

          console.log(`[Season delete] Resilient cleanup completed successfully!`);

          // 6. Choose another season as active if deleted
          const remainingSeasons = allSeasons.filter(s => s !== seasonId);
          if (activeSeason === seasonId) {
            const fallback = remainingSeasons[0] || '2026';
            setActiveSeason(fallback);
            localStorage.setItem('oratorio_active_season', fallback);
          }

          // Close the manager modal on success so the user sees immediate feedback
          setIsSeasonManagerOpen(false);
          setDeleteConfirmation(null);

          setSuccessStatus(`Stagione ${seasonId} eliminata!`);
          setTimeout(() => setSuccessStatus(null), 2000);
        } catch (err: any) {
          console.error('[Season delete error]', err);
          setDeleteModalError(`Errore durante l'eliminazione: ${err?.message || err?.toString() || ""}`);
        } finally {
          setIsSaving(false);
        }
      }
    });
  };

  const handleBulkClearAnimators = async (actionType: 'unregister' | 'delete') => {
    setIsSaving(true);
    setBulkModalOpen(false);
    try {
      if (!auth.currentUser) {
        console.log("Nessun utente autenticato su Firebase. Tentativo di sign-in anonimo...");
        try {
          const { signInAnonymously } = await import('firebase/auth');
          await signInAnonymously(auth);
          console.log("Sign-in anonimo completato con successo!");
        } catch (authErr: any) {
          console.warn("Sign-in anonimo saltato (disabilitato o limitato):", authErr.message || authErr);
        }
      }

      const targetAnimators = animators.filter(belongsToSeason);

      if (targetAnimators.length === 0) {
        setSuccessStatus('Nessun animatore iscritto nella stagione corrente.');
        setTimeout(() => setSuccessStatus(null), 2000);
        return;
      }

      let count = 0;
      if (actionType === 'delete') {
        for (const a of targetAnimators) {
          await deleteDoc(doc(animatorsColl, a.id));
          count++;
        }
        setSuccessStatus(`${count} animatori eliminati definitivamente dal database!`);
      } else {
        // 'unregister' (pulisci la griglia, rimuovendo la stagione attiva)
        for (const a of targetAnimators) {
          const nextSeasons = (a.seasons || []).filter(s => s !== activeSeason);
          await updateDoc(doc(animatorsColl, a.id), { seasons: nextSeasons });
          count++;
        }
        setSuccessStatus(`Griglia ripulita! Iscrizione rimossa per ${count} animatori.`);
      }

      setTimeout(() => setSuccessStatus(null), 3000);
    } catch (err: any) {
      console.error('Bulk clear error:', err);
      setErrorStatus(`Errore durante l'operazione di pulizia: ${err?.message || err?.toString()}`);
    } finally {
      setIsSaving(false);
    }
  };

  const generateAbsencesPDF = (mode: 'daily' | 'weekly' | 'totals') => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      // Determine active target day for daily mode
      const targetDay = displayedDays.includes(selectedRecapDay)
        ? selectedRecapDay
        : (displayedDays[0] || selectedRecapDay || activeSeasonDays[0]);

      const drawHeader = (pdf: jsPDF) => {
        const blueColor = [37, 99, 235];

        // Header Background
        pdf.setFillColor(248, 250, 252);
        pdf.rect(0, 0, pageWidth, 32, 'F');
        
        // Parish Logo
        if (parishInfo.logoUrl) {
          try {
            pdf.addImage(parishInfo.logoUrl, 'PNG', margin, 6, 20, 20);
          } catch (e) {
            pdf.setDrawColor(30, 58, 138);
            pdf.circle(margin + 10, 16, 10, 'S');
          }
        }

        const textStartX = parishInfo.logoUrl ? 38 : margin;

        // Parish Info Header
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(51, 65, 85);
        pdf.text(parishInfo.name || 'Parrocchia', textStartX, 10);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(100, 116, 139);

        let hRowY = 15;
        if (parishInfo.diocese) {
          pdf.text(parishInfo.diocese, textStartX, hRowY);
          hRowY += 4;
        }
        if (parishInfo.pastoralCommunity) {
          pdf.text(parishInfo.pastoralCommunity, textStartX, hRowY);
          hRowY += 4;
        }
        pdf.text(parishInfo.address || '', textStartX, hRowY);
        if (parishInfo.phone) {
          hRowY += 4;
          pdf.text(`Tel: ${parishInfo.phone}`, textStartX, hRowY);
        }
        if (parishInfo.email) {
          hRowY += 4;
          pdf.text(parishInfo.email, textStartX, hRowY);
        }
        
        // Blue Info Box at Top Right
        const boxWidth = 95;
        const boxHeight = 22;
        const boxX = pageWidth - margin - boxWidth;
        const boxY = 5;

        pdf.setFillColor(blueColor[0], blueColor[1], blueColor[2]);
        pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'F');

        // Status / Title inside info box
        pdf.setFontSize(9);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text('RILEVAMENTO ASSENZE', boxX + boxWidth / 2, boxY + 6, { align: 'center' });
        pdf.text('ANIMATORI CAMP FERIALE', boxX + boxWidth / 2, boxY + 10, { align: 'center' });
        
        // Active Season or Week range inside info box
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        let subtitleText = '';
        if (mode === 'daily') {
          let formattedDate = targetDay;
          if (targetDay) {
            const parts = targetDay.split('-');
            if (parts.length === 3) {
              const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
              formattedDate = format(d, 'eeee dd/MM/yyyy', { locale: it }).toUpperCase();
            }
          } else {
            formattedDate = 'Nessuna Giornata';
          }
          subtitleText = `Giornata: ${formattedDate}`;
        } else if (mode === 'weekly') {
          subtitleText = `Settimana: ${selectedWeekId === 'all' ? 'Tutte' : (weeks.find(w => w.id === selectedWeekId)?.label || '')}`;
        } else {
          subtitleText = 'Report Totale Camp feriale';
        }
        pdf.text(subtitleText, boxX + boxWidth / 2, boxY + 14.5, { align: 'center' });
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.text(`Stagione feriale: ${activeSeason}`, boxX + boxWidth / 2, boxY + 18.5, { align: 'center' });

        // Bottom Decorative Line
        pdf.setDrawColor(blueColor[0], blueColor[1], blueColor[2]);
        pdf.setLineWidth(0.6);
        pdf.line(0, 32, pageWidth, 32);
      };

      // Call header block
      drawHeader(doc);

      if (mode === 'daily') {
        if (!targetDay) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(100, 116, 139);
          doc.text('Selezionare una giornata per scaricare il report giornaliero delle assenze.', margin, 45);
          doc.save(`assenze_oratorio_${activeSeason}_giornaliero.pdf`);
          return;
        }

        const colHeaders = ['ANIMATORE', 'PRESENZA / STATO', 'SPECIFICA ORARIO', 'NOTE / MOTIVAZIONE'];
        const tableRows = activeSeasonAnimatorsList.map(anim => {
          const matchingAbs = absences.find(ab => ab.animatorId === anim.id && ab.date === targetDay);
          const name = `${anim.lastName.toUpperCase()} ${anim.firstName}`;
          
          if (!matchingAbs) {
            return [name, 'PRESENTE', 'Intera Giornata (Standard)', '-'];
          }
          
          let statusText = 'ASSENTE';
          let timeText = 'Intero Giorno';
          if (matchingAbs.reason === 'Solo Mattina') {
            statusText = 'PARZIALE';
            timeText = 'Solo Mattina (8:30 - 13:30)';
          } else if (matchingAbs.reason === 'Solo Pomeriggio') {
            statusText = 'PARZIALE';
            timeText = 'Solo Pomeriggio (13:30 - 17:30)';
          } else if (matchingAbs.startTime || matchingAbs.endTime) {
            statusText = 'ORARIO SPECIFICO';
            timeText = `${matchingAbs.startTime || ''} - ${matchingAbs.endTime || ''}`;
          }
          
          const detailText = matchingAbs.reason || '-';
          return [name, statusText, timeText, detailText];
        });

        autoTable(doc, {
          startY: 40,
          head: [colHeaders],
          body: tableRows,
          theme: 'grid',
          styles: { fontSize: 8.5, cellPadding: 3.5, font: 'helvetica' },
          headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 60 },
            1: { cellWidth: 40 },
            2: { cellWidth: 60 }
          }
        });
        
        const parts = targetDay.split('-');
        let formattedFilenameDate = targetDay;
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
          formattedFilenameDate = format(d, 'dd-MM-yyyy');
        }
        doc.save(`Report_Assenze_Camp_${activeSeason}_Giornaliero_${formattedFilenameDate}.pdf`);
        return;
      }

      // Days selection
      const daysToPrint = mode === 'weekly' 
        ? (selectedWeekId !== 'all' ? displayedDays : (weeks[0]?.days || activeSeasonDays))
        : activeSeasonDays;

      if (daysToPrint.length === 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(100, 116, 139);
        doc.text('Nessuna giornata registrata per questa stagione.', margin, 45);
        doc.save(`assenze_oratorio_${activeSeason}.pdf`);
        return;
      }

      if (daysToPrint.length <= 10) {
        const colHeaders = ['ANIMATORE', ...daysToPrint.map(dayStr => {
          const parts = dayStr.split('-');
          const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
          return `${format(d, 'eee dd/MM', { locale: it }).toUpperCase()}`;
        })];

        const tableRows = activeSeasonAnimatorsList.map(anim => {
          const rowData = [`${anim.lastName.toUpperCase()} ${anim.firstName}`];
          daysToPrint.forEach(day => {
            const matchingAbs = absences.find(ab => ab.animatorId === anim.id && ab.date === day);
            const meta = getAbsenceMeta(matchingAbs);
            if (!meta) {
              rowData.push('P (OK)');
            } else {
              const labelClean = meta.label
                .replace('☀️', '')
                .replace('⛅', '')
                .replace('❌', '')
                .replace('🕒', '')
                .replace('⏰', '')
                .trim();
              rowData.push(labelClean);
            }
          });
          return rowData;
        });

        autoTable(doc, {
          startY: 40,
          head: [colHeaders],
          body: tableRows,
          theme: 'grid',
          styles: { fontSize: 8.5, cellPadding: 3.5, font: 'helvetica' },
          headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 45 }
          },
          didDrawPage: (data) => {
            const finalY = data.cursor?.y || 160;
            const pdfHeight = doc.internal.pageSize.getHeight();
            const boxY = Math.min(finalY + 12, pdfHeight - 25);
            
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(margin, boxY, pageWidth - 2 * margin, 12, 1, 1, 'F');
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            
            const legendText = 'LEGENDA:   P (OK) = Presente    M = Fa solo Mattina (Assente Pom.)    P = Fa solo Pomeriggio (Assente Matt.)    T = Assente tutto il giorno    Orari = Orario personalizzato';
            doc.text(legendText, margin + 4, boxY + 7.5);
          }
        });
      } else {
        const colHeaders = ['ANIMATORE', 'DATA GIORNATA', 'TIPO DI ASSENZA', 'DETTAGLI / MOTIVO'];
        const sortedDays = [...daysToPrint].sort((a, b) => a.localeCompare(b));
        const absRecords: any[] = [];
        
        activeSeasonAnimatorsList.forEach(anim => {
          sortedDays.forEach(day => {
            const matchingAbs = absences.find(ab => ab.animatorId === anim.id && ab.date === day);
            if (matchingAbs) {
              const parts = day.split('-');
              const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
              const dateFormatted = format(d, 'eeee dd MMMM yyyy', { locale: it }).toUpperCase();
              
              let typeText = 'Assenza Intera';
              if (matchingAbs.reason === 'Solo Mattina') {
                typeText = 'Fa Solo Mattina';
              } else if (matchingAbs.reason === 'Solo Pomeriggio') {
                typeText = 'Fa Solo Pomeriggio';
              } else if (matchingAbs.startTime || matchingAbs.endTime) {
                typeText = 'Orario Personalizzato';
              }
              
              const detailText = matchingAbs.startTime || matchingAbs.endTime 
                ? `${matchingAbs.startTime || '?'} - ${matchingAbs.endTime || '?'} ${matchingAbs.reason ? '(' + matchingAbs.reason + ')' : ''}`
                : matchingAbs.reason || 'Nessun dettaglio specificato';
                
              absRecords.push({
                animatorName: `${anim.lastName.toUpperCase()} ${anim.firstName}`,
                dateFormatted,
                typeText,
                detailText
              });
            }
          });
        });

        absRecords.sort((a, b) => a.animatorName.localeCompare(b.animatorName));

        const tableRows = absRecords.map(rec => [
          rec.animatorName,
          rec.dateFormatted,
          rec.typeText,
          rec.detailText
        ]);

        if (tableRows.length === 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(100, 116, 139);
          doc.text('Nessuna assenza inserita in questa stagione.', margin, 45);
        } else {
          autoTable(doc, {
            startY: 40,
            head: [colHeaders],
            body: tableRows,
            theme: 'striped',
            styles: { fontSize: 8.5, cellPadding: 4, font: 'helvetica' },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
              0: { fontStyle: 'bold', cellWidth: 60 },
              1: { cellWidth: 65 },
              2: { cellWidth: 50 }
            }
          });
        }
      }

      doc.save(`Report_Assenze_Camp_${activeSeason}_${mode === 'weekly' ? 'Settimanale' : 'Stagionale'}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setErrorStatus('Impossibile generare il file PDF. Verificare i dati.');
    }
  };

  const generateDailyTeamsPDF = (targetDay: string) => {
    try {
      if (!targetDay) {
        setErrorStatus('Selezionare una giornata per scaricare il report giornaliero delle squadre.');
        return;
      }

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      const drawHeader = (pdf: jsPDF, titleName: string) => {
        const blueColor = [37, 99, 235];

        // Header Background
        pdf.setFillColor(248, 250, 252);
        pdf.rect(0, 0, pageWidth, 32, 'F');
        
        // Parish Logo
        if (parishInfo.logoUrl) {
          try {
            pdf.addImage(parishInfo.logoUrl, 'PNG', margin, 6, 20, 20);
          } catch (e) {
            pdf.setDrawColor(30, 58, 138);
            pdf.circle(margin + 10, 16, 10, 'S');
          }
        }

        const textStartX = parishInfo.logoUrl ? 38 : margin;

        // Parish Info Header
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(51, 65, 85);
        pdf.text(parishInfo.name || 'Parrocchia', textStartX, 10);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);

        let hRowY = 14;
        if (parishInfo.diocese) {
          pdf.text(parishInfo.diocese, textStartX, hRowY);
          hRowY += 3.5;
        }
        if (parishInfo.pastoralCommunity) {
          pdf.text(parishInfo.pastoralCommunity, textStartX, hRowY);
          hRowY += 3.5;
        }
        pdf.text(parishInfo.address || '', textStartX, hRowY);

        if (parishInfo.phone || parishInfo.email) {
          hRowY += 3.5;
          const contacts: string[] = [];
          if (parishInfo.phone) contacts.push(`Tel: ${parishInfo.phone}`);
          if (parishInfo.email) contacts.push(`Email: ${parishInfo.email}`);
          pdf.text(contacts.join(' - '), textStartX, hRowY);
        }
        
        // Blue Info Box at Top Right
        const boxWidth = 92;
        const boxHeight = 22;
        const boxX = pageWidth - margin - boxWidth;
        const boxY = 5;

        pdf.setFillColor(blueColor[0], blueColor[1], blueColor[2]);
        pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'F');

        // Status / Title inside info box
        pdf.setFontSize(8.5);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text(titleName, boxX + boxWidth / 2, boxY + 6, { align: 'center' });
        
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        const dObj = new Date(targetDay);
        const formattedFullDate = format(dObj, "eeee dd MMMM yyyy", { locale: it }).toUpperCase();
        pdf.text(formattedFullDate, boxX + boxWidth / 2, boxY + 11.5, { align: 'center' });
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.text(`Stagione: ${activeSeason}`, boxX + boxWidth / 2, boxY + 17, { align: 'center' });

        // Bottom Decorative Line
        pdf.setDrawColor(blueColor[0], blueColor[1], blueColor[2]);
        pdf.setLineWidth(0.6);
        pdf.line(0, 32, pageWidth, 32);
      };

      drawHeader(doc, 'REPORT GIORNALIERO SQUADRE');

      // Add actual title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text('ELENCO PRESENTI PER SQUADRE', margin, 42);

      // Gather present animators grouped by team
      const presentRows: any[] = [];
      filteredTeams.forEach(t => {
        t.animatorIds.forEach(aid => {
          const anim = animators.find(a => a.id === aid);
          if (!anim) return;
          const isAbsent = absences.find(ab => ab.animatorId === aid && ab.date === targetDay);
          if (!isAbsent) {
            presentRows.push([
              t.name.toUpperCase(),
              `${anim.lastName.toUpperCase()} ${anim.firstName}`,
              'PRESENTE'
            ]);
          }
        });
      });

      if (presentRows.length === 0) {
        presentRows.push(['-', 'Nessun animatore presente registrato', '-']);
      }

      autoTable(doc, {
        startY: 46,
        head: [['SQUADRA', 'NOME E COGNOME ANIMATORE', 'PRESENZA']],
        body: presentRows,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3, font: 'helvetica' },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { cellWidth: 90 },
          2: { fontStyle: 'italic', cellWidth: 40, textColor: [16, 185, 129] }
        }
      });

      // Now add absent animators of that day
      const finalYBeforeAbs = (doc as any).lastAutoTable?.finalY || 100;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(220, 38, 38);
      doc.text('ELENCO ASSENTI DEL GIORNO (TUTTE LE SQUADRE)', margin, finalYBeforeAbs + 10);

      const absentRows: any[] = [];
      filteredTeams.forEach(t => {
        t.animatorIds.forEach(aid => {
          const anim = animators.find(a => a.id === aid);
          if (!anim) return;
          const isAbsent = absences.find(ab => ab.animatorId === aid && ab.date === targetDay);
          if (isAbsent) {
            let details = 'Tutto il giorno';
            if (isAbsent.reason === 'Solo Mattina') {
              details = 'Assente Pomeriggio (Fa Solo Mattina)';
            } else if (isAbsent.reason === 'Solo Pomeriggio') {
              details = 'Assente Mattina (Fa Solo Pomeriggio)';
            } else if (isAbsent.startTime || isAbsent.endTime) {
              details = `${isAbsent.startTime || ''} - ${isAbsent.endTime || ''}`;
            }
            if (isAbsent.reason && isAbsent.reason !== 'Solo Mattina' && isAbsent.reason !== 'Solo Pomeriggio') {
              details += ` (${isAbsent.reason})`;
            }

            absentRows.push([
              t.name.toUpperCase(),
              `${anim.lastName.toUpperCase()} ${anim.firstName}`,
              details
            ]);
          }
        });
      });

      if (absentRows.length === 0) {
        absentRows.push(['-', 'Nessun animatore assente registrato', '-']);
      }

      autoTable(doc, {
        startY: finalYBeforeAbs + 14,
        head: [['SQUADRA', 'NOME E COGNOME ANIMATORE', 'DETTAGLIO ASSENZA']],
        body: absentRows,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3, font: 'helvetica' },
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 50 },
          1: { cellWidth: 70 },
          2: { cellWidth: 60 }
        }
      });

      const parts = targetDay.split('-');
      let formattedFilenameDate = targetDay;
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
        formattedFilenameDate = format(d, 'dd-MM-yyyy');
      }

      setSuccessStatus('Download completato!');
      setTimeout(() => setSuccessStatus(null), 2000);

      doc.save(`Report_Presenze_Squadre_Giornaliero_${activeSeason}_${formattedFilenameDate}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setErrorStatus('Impossibile generare il PDF giornaliero delle squadre.');
    }
  };

  const generateWeeklyTeamsPDF = () => {
    try {
      const daysToPrint = selectedWeekId === 'all' 
        ? activeSeasonDays.slice(0, 10)
        : (weeks.find(w => w.id === selectedWeekId)?.days || []);

      if (daysToPrint.length === 0) {
        setErrorStatus('Nessun giorno feriale programmato per la settimana selezionata.');
        return;
      }

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      const drawHeader = (pdf: jsPDF, titleName: string) => {
        const blueColor = [37, 99, 235];

        // Header Background
        pdf.setFillColor(248, 250, 252);
        pdf.rect(0, 0, pageWidth, 32, 'F');
        
        // Parish Logo
        if (parishInfo.logoUrl) {
          try {
            pdf.addImage(parishInfo.logoUrl, 'PNG', margin, 6, 20, 20);
          } catch (e) {
            pdf.setDrawColor(30, 58, 138);
            pdf.circle(margin + 10, 16, 10, 'S');
          }
        }

        const textStartX = parishInfo.logoUrl ? 38 : margin;

        // Parish Info Header
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(51, 65, 85);
        pdf.text(parishInfo.name || 'Parrocchia', textStartX, 10);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);

        let hRowY = 14;
        if (parishInfo.diocese) {
          pdf.text(parishInfo.diocese, textStartX, hRowY);
          hRowY += 3.5;
        }
        if (parishInfo.pastoralCommunity) {
          pdf.text(parishInfo.pastoralCommunity, textStartX, hRowY);
          hRowY += 3.5;
        }
        pdf.text(parishInfo.address || '', textStartX, hRowY);

        if (parishInfo.phone || parishInfo.email) {
          hRowY += 3.5;
          const contacts: string[] = [];
          if (parishInfo.phone) contacts.push(`Tel: ${parishInfo.phone}`);
          if (parishInfo.email) contacts.push(`Email: ${parishInfo.email}`);
          pdf.text(contacts.join(' - '), textStartX, hRowY);
        }
        
        // Blue Info Box at Top Right
        const boxWidth = 92;
        const boxHeight = 22;
        const boxX = pageWidth - margin - boxWidth;
        const boxY = 5;

        pdf.setFillColor(blueColor[0], blueColor[1], blueColor[2]);
        pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'F');

        // Status / Title inside info box
        pdf.setFontSize(8.5);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text(titleName, boxX + boxWidth / 2, boxY + 6, { align: 'center' });
        
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        const weekLabel = selectedWeekId === 'all' ? 'Tutta la Stagione' : (weeks.find(w => w.id === selectedWeekId)?.label || '');
        pdf.text(`Riferimento: ${weekLabel}`, boxX + boxWidth / 2, boxY + 11.5, { align: 'center' });
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.text(`Stagione: ${activeSeason}`, boxX + boxWidth / 2, boxY + 17, { align: 'center' });

        // Bottom Decorative Line
        pdf.setDrawColor(blueColor[0], blueColor[1], blueColor[2]);
        pdf.setLineWidth(0.6);
        pdf.line(0, 32, pageWidth, 32);
      };

      drawHeader(doc, 'REPORT SETTIMANALE SQUADRE');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text('RIEPILOGO SETTIMANALE PRESENZE SQUADRE', margin, 42);

      // Build Headers: SQUADRA, ANIMATORE, then the days
      const colHeaders = [
        'SQUADRA',
        'ANIMATORE',
        ...daysToPrint.map(dayStr => {
          const parts = dayStr.split('-');
          const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
          return `${format(d, 'eee dd/MM', { locale: it }).toUpperCase()}`;
        })
      ];

      const rows: any[] = [];
      filteredTeams.forEach(t => {
        t.animatorIds.forEach(aid => {
          const anim = animators.find(a => a.id === aid);
          if (!anim) return;
          const rowData = [
            t.name.toUpperCase(),
            `${anim.lastName.toUpperCase()} ${anim.firstName}`
          ];

          daysToPrint.forEach(day => {
            const ab = absences.find(a => a.animatorId === aid && a.date === day);
            if (!ab) {
              rowData.push('PRESENTE');
            } else if (ab.reason === 'Solo Mattina') {
              rowData.push('Solo Mat.');
            } else if (ab.reason === 'Solo Pomeriggio') {
              rowData.push('Solo Pom.');
            } else if (ab.startTime || ab.endTime) {
              rowData.push(`Parz: ${ab.startTime || ''}-${ab.endTime || ''}`);
            } else {
              rowData.push('ASSENTE');
            }
          });

          rows.push(rowData);
        });
      });

      if (rows.length === 0) {
        rows.push(['-', 'Nessun animatore associato', ...daysToPrint.map(() => '-')]);
      }

      autoTable(doc, {
        startY: 46,
        head: [colHeaders],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica' },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 35 },
          1: { fontStyle: 'bold', cellWidth: 50 }
        }
      });

      // Now add weekly absences summary section
      const finalYBeforeAbs = (doc as any).lastAutoTable?.finalY || 100;
      let nextY = finalYBeforeAbs + 8;
      
      // If bottom of page is near, put on a new page
      if (nextY > pageHeight - 35) {
        doc.addPage();
        drawHeader(doc, 'REPORT SETTIMANALE SQUADRE');
        nextY = 40;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(220, 38, 38);
      doc.text('RIEPILOGO ASSENZE DELLA SETTIMANA', margin, nextY);

      const weeklyAbsenceRows: any[] = [];
      daysToPrint.forEach(day => {
        const dObj = new Date(day);
        const dayLabel = format(dObj, "eeee dd/MM", { locale: it }).toUpperCase();

        filteredTeams.forEach(t => {
          t.animatorIds.forEach(aid => {
            const anim = animators.find(a => a.id === aid);
            if (!anim) return;
            const ab = absences.find(a => a.animatorId === aid && a.date === day);
            if (ab) {
              let details = 'Tutto il giorno';
              if (ab.reason === 'Solo Mattina') {
                details = 'Solo Mattina';
              } else if (ab.reason === 'Solo Pomeriggio') {
                details = 'Solo Pomeriggio';
              } else if (ab.startTime || ab.endTime) {
                details = `${ab.startTime || ''} - ${ab.endTime || ''}`;
              }
              if (ab.reason && ab.reason !== 'Solo Mattina' && ab.reason !== 'Solo Pomeriggio') {
                details += ` (${ab.reason})`;
              }

              weeklyAbsenceRows.push([
                dayLabel,
                t.name.toUpperCase(),
                `${anim.lastName.toUpperCase()} ${anim.firstName}`,
                details
              ]);
            }
          });
        });
      });

      if (weeklyAbsenceRows.length === 0) {
        weeklyAbsenceRows.push(['-', '-', 'Nessuna assenza registrata questa settimana', '-']);
      }

      autoTable(doc, {
        startY: nextY + 4,
        head: [['GIORNO feriale', 'SQUADRA', 'ANIMATORE ASSENTE', 'DETTAGLIO ASSENZA']],
        body: weeklyAbsenceRows,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica' },
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 45 },
          1: { fontStyle: 'bold', cellWidth: 40 },
          2: { cellWidth: 65 }
        }
      });

      setSuccessStatus('Download completato!');
      setTimeout(() => setSuccessStatus(null), 2000);

      const weekFilename = selectedWeekId === 'all' ? 'stagione' : selectedWeekId;
      doc.save(`Report_Presenze_Squadre_Settimanale_${activeSeason}_${weekFilename}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setErrorStatus('Impossibile generare il PDF settimanale delle squadre.');
    }
  };

  const getAbsenceMeta = (ab?: Absence) => {
    if (!ab) return null;
    const s = ab.startTime || '';
    const e = ab.endTime || '';
    const r = ab.reason || '';

    if (r === 'Solo Mattina' || (s === '13:30' && e === '17:30')) {
      return {
        label: '☀️ M',
        tooltip: 'Fa solo Mattina (Assente Pomeriggio: 13:30-17:30)',
        className: 'bg-amber-500 text-white ring-2 ring-amber-100'
      };
    }
    if (r === 'Solo Pomeriggio' || (s === '08:30' && e === '13:30')) {
      return {
        label: '⛅ P',
        tooltip: 'Fa solo Pomeriggio (Assente Mattina: 08:30-13:30)',
        className: 'bg-orange-500 text-white ring-2 ring-orange-100'
      };
    }
    if (!s && !e) {
      return {
        label: '❌ T',
        tooltip: 'Assente tutto il giorno',
        className: 'bg-red-500 text-white ring-2 ring-red-100'
      };
    }
    return {
      label: `⏰ ${s || '?'}-${e || '?'}`,
      tooltip: `Orario personalizzato: ${s || '?'}-${e || '?'} (${r || 'Nessuna nota'})`,
      className: 'bg-purple-500 text-white ring-2 ring-purple-100 text-[9px]'
    };
  };

  const updateSeasonDays = async (seasonId: string, days: string[]) => {
    try {
      const sortedDays = [...days].sort((a, b) => a.localeCompare(b));
      await setDoc(doc(seasonsColl, seasonId), { days: sortedDays }, { merge: true });
    } catch (err) {
      console.error('Error updating days:', err);
      setErrorStatus('Errore aggiornamento dei giorni.');
    }
  };

  const toggleParticipation = async (anim: Animator) => {
    const currentSeasons = anim.seasons || [];
    let nextSeasons;
    if (currentSeasons.includes(activeSeason)) {
      nextSeasons = currentSeasons.filter(s => s !== activeSeason);
    } else {
      nextSeasons = [...currentSeasons, activeSeason];
    }
    try {
      await updateDoc(doc(animatorsColl, anim.id), { seasons: nextSeasons });
      setSuccessStatus(`Stato iscrizione aggiornato per ${activeSeason}!`);
      setTimeout(() => setSuccessStatus(null), 2000);
    } catch (err) {
      console.error(err);
      setErrorStatus("Errore nell'aggiornamento.");
    }
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
        payload = { ...shiftForm, season: activeSeason };
      } else if (activeTab === 'teams') {
        coll = teamsColl;
        payload = { ...teamForm, season: activeSeason };
      } else {
        coll = absencesColl;
        payload = { ...absenceForm, season: activeSeason };
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
      setErrorStatus('Errore durante il salvataggio.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string, coll: any) => {
    setDeleteConfirmation({
      isOpen: true,
      title: 'Elimina Elemento',
      message: 'Sei sicuro di voler eliminare definitivamente questo elemento? Questa azione non può essere annullata.',
      onConfirm: async () => {
        setIsSaving(true);
        try {
          if (!auth.currentUser) {
            console.log("Nessun utente autenticato su Firebase. Tentativo di sign-in anonimo...");
            try {
              const { signInAnonymously } = await import('firebase/auth');
              await signInAnonymously(auth);
              console.log("Sign-in anonimo completato con successo!");
            } catch (authErr: any) {
              console.warn("Sign-in anonimo saltato (disabilitato o limitato):", authErr.message || authErr);
            }
          }
          console.log(`Eliminazione in corso di docId: ${id} nel percorso: ${coll.path}. Utente auth: ${auth.currentUser?.uid || 'Nessuno'}`);
          await deleteDoc(doc(coll, id));
          setSuccessStatus('Eliminato con successo!');
          setTimeout(() => setSuccessStatus(null), 2000);
        } catch (error: any) {
          console.error('Delete error:', error);
          setErrorStatus(`Errore durante l'eliminazione: ${error?.message || error?.toString() || ""}`);
        } finally {
          setIsSaving(false);
          setDeleteConfirmation(null);
        }
      }
    });
  };

  const weeks = getWeeks();
  const displayedDays = selectedWeekId === 'all' 
    ? activeSeasonDays 
    : (weeks.find(w => w.id === selectedWeekId)?.days || []);

  const activeRecapDay = displayedDays.includes(selectedRecapDay)
    ? selectedRecapDay
    : (displayedDays[0] || selectedRecapDay || activeSeasonDays[0]);

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
              <p className="text-slate-500 text-xs md:text-sm font-medium">Gestione animatori, squadre, assenze e stagioni.</p>
            </div>
          </div>
        </div>

        {/* Sleek Season Selector Header (Low Visual Impact) */}
        <div className="relative">
          <button
            id="season-selector-btn"
            onClick={() => setIsSeasonDropdownOpen(!isSeasonDropdownOpen)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-155 rounded-full text-xs font-black uppercase tracking-wider text-slate-700 hover:text-slate-900 shadow-sm transition-all hover:shadow hover:border-slate-300 focus:ring-2 focus:ring-blue-500"
          >
            <Calendar size={14} className="text-blue-500" />
            <span>Stagione: <span className="text-blue-600 font-extrabold">{activeSeason}</span></span>
            <span className="text-[10px] text-slate-400">▼</span>
          </button>

          {isSeasonDropdownOpen && (
            <>
              <div className="fixed inset-0 z-[150]" onClick={() => setIsSeasonDropdownOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl z-[160] py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-3 pb-2 mb-2 border-b border-slate-50">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Seleziona Stagione</span>
                </div>
                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                  {allSeasons.map((sId) => (
                    <button
                      key={sId}
                      onClick={() => {
                        setActiveSeason(sId);
                        localStorage.setItem('oratorio_active_season', sId);
                        setIsSeasonDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors flex items-center justify-between ${
                        activeSeason === sId
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>{sId}</span>
                      {activeSeason === sId && <Check size={12} className="text-blue-600" />}
                    </button>
                  ))}
                </div>
                <div className="border-t border-slate-50 mt-2 pt-2 px-2">
                  <button
                    onClick={() => {
                      setIsSeasonDropdownOpen(false);
                      setIsSeasonManagerOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-slate-50 hover:bg-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 rounded-xl border border-slate-200"
                  >
                    Gestisci Stagioni...
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {activeTab !== 'animators' && (
          <button
            onClick={() => handleOpenModal(activeTab)}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-full font-black uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 text-[11px] self-start md:self-auto"
          >
            <Plus size={20} />
            Aggiungi {activeTab === 'shifts' ? 'Turno' : activeTab === 'teams' ? 'Squadra' : 'Assenza'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 overflow-x-auto pb-2 custom-scrollbar">
        <TabItem id="animators" label="Animatori" icon={Users} />
        <TabItem id="shifts" label="Turni" icon={Clock} />
        <TabItem id="teams" label="Squadre" icon={Trophy} />
        <TabItem id="absences" label="Assenze" icon={UserX} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {(successStatus || errorStatus) && (
          <div className="space-y-2">
            {successStatus && (
              <div className="bg-emerald-50 border border-emerald-100/50 p-4 rounded-2xl flex items-center gap-3 text-emerald-800 text-xs font-bold animate-in fade-in duration-300">
                <CheckCircle2 size={16} className="text-emerald-500 animate-bounce cursor-pointer" onClick={() => setSuccessStatus(null)} />
                <span>{successStatus}</span>
              </div>
            )}
            {errorStatus && (
              <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-800 text-xs font-bold animate-in fade-in duration-300">
                <AlertCircle size={16} className="text-red-500 shrink-0 cursor-pointer" onClick={() => setErrorStatus(null)} />
                <span>{errorStatus}</span>
              </div>
            )}
          </div>
        )}

        {/* Animatori Tab */}
        {activeTab === 'animators' && (
          <div className="space-y-4">
            
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-8 border-b border-slate-50 bg-blue-50/10">
                <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-widest flex items-center gap-3">
                  <Users size={18} className="text-blue-600" />
                  Database Animatori
                </h3>
                
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2.5 cursor-pointer selection-none">
                    <input 
                      type="checkbox"
                      checked={onlyActiveSeasonAnimators}
                      onChange={(e) => setOnlyActiveSeasonAnimators(e.target.checked)}
                      className="w-4.5 h-4.5 rounded text-blue-600 focus:ring-blue-500 border-slate-200"
                    />
                    <span className="text-xs font-black text-slate-600 uppercase tracking-wide">Filtra solo Iscritti {activeSeason}</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setBulkModalOpen(true)}
                    className="flex items-center gap-2 bg-red-105 border border-red-200 text-red-650 hover:bg-red-50 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 ml-2"
                    title="Pulisci la griglia animatori della stagione corrente o eliminali"
                  >
                    <Trash2 size={13} className="text-red-500" />
                    Pulisci Griglia Animatori
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/30 border-b border-slate-100 italic">
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Nome</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Cognome</th>
                      <th className="px-8 py-5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Iscritto {activeSeason}</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Telefono</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Note / Allergie</th>
                      <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {/* Quick row insertion */}
                    <tr className="bg-blue-50/5 group">
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          value={animatorForm.firstName} 
                          onChange={e => setAnimatorForm({...animatorForm, firstName: e.target.value})} 
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold shadow-sm" 
                          placeholder="Nuovo Nome..."
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          value={animatorForm.lastName} 
                          onChange={e => setAnimatorForm({...animatorForm, lastName: e.target.value})} 
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold shadow-sm" 
                          placeholder="Nuovo Cognome..."
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[10px] px-3 py-1 bg-blue-100 text-blue-700 font-black rounded-lg">Default: {activeSeason}</span>
                      </td>
                      <td className="px-6 py-4">
                        <input 
                          type="tel" 
                          value={animatorForm.phone} 
                          onChange={e => setAnimatorForm({...animatorForm, phone: e.target.value})} 
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-mono font-bold shadow-sm" 
                          placeholder="Telefono..."
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          value={animatorForm.notes} 
                          onChange={e => setAnimatorForm({...animatorForm, notes: e.target.value})} 
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold shadow-sm" 
                          placeholder="Note..."
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
                                seasons: [activeSeason], 
                                createdAt: new Date().toISOString() 
                              });
                              setAnimatorForm({ firstName: '', lastName: '', email: '', phone: '', notes: '', seasons: [activeSeason] });
                              setSuccessStatus('Animatore registrato con successo!');
                              setTimeout(() => setSuccessStatus(null), 2000);
                            } catch (err) {
                              setErrorStatus('Errore nel salvataggio.');
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                          disabled={isSaving || !animatorForm.firstName || !animatorForm.lastName}
                          className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-30 active:scale-95"
                          title="Aggiungi ora"
                        >
                          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                        </button>
                      </td>
                    </tr>

                    {/* Animators Rows */}
                    {filteredAnimators.length > 0 ? filteredAnimators.map((a, index) => {
                      const isEditing = a.id === editingAnimatorId;
                      const registered = a.seasons?.includes(activeSeason) || (!a.seasons && activeSeason === '2026');

                      return (
                        <tr key={`${a.id}-${index}`} className="hover:bg-slate-50/50 transition-colors group">
                          {isEditing ? (
                            <>
                              <td className="px-6 py-3">
                                <input 
                                  type="text"
                                  value={editingAnimatorForm.firstName}
                                  onChange={e => setEditingAnimatorForm({...editingAnimatorForm, firstName: e.target.value})}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold shadow-sm"
                                />
                              </td>
                              <td className="px-6 py-3">
                                <input 
                                  type="text"
                                  value={editingAnimatorForm.lastName}
                                  onChange={e => setEditingAnimatorForm({...editingAnimatorForm, lastName: e.target.value})}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold shadow-sm"
                                />
                              </td>
                              <td className="px-6 py-3 text-center">
                                <span className="text-xs font-bold text-slate-400">Salva e modifica nel popup</span>
                              </td>
                              <td className="px-6 py-3">
                                <input 
                                  type="tel"
                                  value={editingAnimatorForm.phone}
                                  onChange={e => setEditingAnimatorForm({...editingAnimatorForm, phone: e.target.value})}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-mono font-bold shadow-sm"
                                />
                              </td>
                              <td className="px-6 py-3">
                                <input 
                                  type="text"
                                  value={editingAnimatorForm.notes}
                                  onChange={e => setEditingAnimatorForm({...editingAnimatorForm, notes: e.target.value})}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold shadow-sm"
                                />
                              </td>
                              <td className="px-8 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={async () => {
                                      if (!editingAnimatorForm.firstName || !editingAnimatorForm.lastName) return;
                                      setIsSaving(true);
                                      try {
                                        await updateDoc(doc(animatorsColl, a.id), {
                                          ...editingAnimatorForm,
                                          updatedAt: new Date().toISOString()
                                        });
                                        setEditingAnimatorId(null);
                                        setSuccessStatus('Membro salvato con successo!');
                                        setTimeout(() => setSuccessStatus(null), 2000);
                                      } catch (err) {
                                        setErrorStatus('Errore nel salvataggio.');
                                      } finally {
                                        setIsSaving(false);
                                      }
                                    }}
                                    disabled={isSaving}
                                    className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    onClick={() => setEditingAnimatorId(null)}
                                    className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-8 py-4">
                                <span className="text-xs font-bold text-slate-700 italic uppercase">{a.firstName}</span>
                              </td>
                              <td className="px-8 py-4">
                                <span className="text-xs font-black text-slate-900 italic uppercase">{a.lastName}</span>
                              </td>
                              <td className="px-8 py-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleParticipation(a)}
                                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${
                                    registered 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200' 
                                      : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                                  }`}
                                  title="Clicca per invertire l'iscrizione a questa stagione"
                                >
                                  {registered ? 'ISCRITTO' : 'INATTIVO'}
                                </button>
                              </td>
                              <td className="px-8 py-4">
                                <span className="text-xs font-mono font-bold text-slate-500">{a.phone || '-'}</span>
                              </td>
                              <td className="px-8 py-4">
                                <span className="text-xs font-bold text-slate-400 italic max-w-[200px] inline-block truncate" title={a.notes}>
                                  {a.notes || '-'}
                                </span>
                              </td>
                              <td className="px-8 py-4 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button 
                                    onClick={() => handleOpenModal('animators', a)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                    title="Modifica dettagli dettagliata (Stagioni multiple)"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setEditingAnimatorId(a.id);
                                      setEditingAnimatorForm({
                                        firstName: a.firstName,
                                        lastName: a.lastName,
                                        email: a.email || '',
                                        phone: a.phone || '',
                                        notes: a.notes || '',
                                        seasons: a.seasons || []
                                      });
                                    }} 
                                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors" 
                                    title="Modifica rapida riga"
                                  >
                                    <Clock size={14} />
                                  </button>
                                  <button onClick={() => handleDelete(a.id, animatorsColl)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Elimina">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={6} className="py-20 text-center">
                          <Users size={40} className="mx-auto text-slate-100 mb-4" />
                          <p className="text-slate-300 font-black uppercase tracking-widest text-[9px]">Nessun animatore registrato corrisponde ai filtri</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Turni Tab */}
        {activeTab === 'shifts' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {filteredShifts.length > 0 ? filteredShifts.map((s, idx) => (
              <div key={`${s.id}-${idx}`} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all">
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
                  {s.animatorIds.map((aid, itemIdx) => {
                    const anim = animators.find(a => a.id === aid);
                    return anim ? (
                      <span key={`${s.id}-anim-${aid}-${itemIdx}`} className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg border border-slate-100 italic">
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
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Nessun turno registrato per la stagione {activeSeason}</p>
              </div>
            )}
          </div>
        )}

        {/* Squadre Tab */}
        {activeTab === 'teams' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Day Selector and PDF export panel */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col xl:flex-row items-center justify-between gap-6">
              <div className="flex-1 space-y-2 w-full">
                <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-widest flex items-center gap-2">
                  <Calendar size={18} className="text-blue-600" />
                  Rilevamento Squadre per il giorno:
                </h3>
                
                {/* Scrollable Day Selection Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-slate-200">
                  {activeSeasonDays.map(day => {
                    const isSel = day === activeRecapDay;
                    const dayObj = new Date(day);
                    const formattedDateStr = format(dayObj, 'eee dd/MM', { locale: it });
                    return (
                      <button
                        key={`teams-day-${day}`}
                        type="button"
                        onClick={() => setSelectedRecapDay(day)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider shrink-0 transition-all ${
                          isSel 
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-100 scale-102 font-bold' 
                            : 'bg-slate-50 text-slate-600 border border-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {formattedDateStr}
                      </button>
                    );
                  })}
                  {activeSeasonDays.length === 0 && (
                    <span className="text-xs text-slate-400 font-bold italic">Nessun giorno impostato nella stagione.</span>
                  )}
                </div>
                
                {activeRecapDay && (
                  <p className="text-xs font-bold text-slate-400 uppercase italic tracking-wider flex items-center gap-1">
                    🟢 Visualizzazione date del Camp: <span className="text-slate-800 font-black ml-1 uppercase">{format(new Date(activeRecapDay), 'eeee dd MMMM yyyy', { locale: it })}</span>
                  </p>
                )}
              </div>

              {/* PDF Actions */}
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => generateDailyTeamsPDF(activeRecapDay)}
                  className="flex items-center gap-2 bg-indigo-50 border border-indigo-150 text-indigo-700 hover:bg-indigo-100 px-4 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                >
                  <Download size={13} className="text-indigo-600" />
                  Scarica Presenti/Assenti Oggi
                </button>
                <button
                  type="button"
                  onClick={() => generateWeeklyTeamsPDF()}
                  className="flex items-center gap-2 bg-emerald-50 border border-emerald-150 text-emerald-700 hover:bg-emerald-100 px-4 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                >
                  <Download size={13} className="text-emerald-600" />
                  Scarica Settimanale Squadre
                </button>
              </div>
            </div>

            {/* Teams Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {filteredTeams.length > 0 ? filteredTeams.map((t, idx) => {
                const teamAnimators = t.animatorIds.map(aid => animators.find(a => a.id === aid)).filter(Boolean) as Animator[];
                const presentToday = teamAnimators.filter(anim => !absences.some(ab => ab.animatorId === anim.id && ab.date === activeRecapDay));
                const absentToday = teamAnimators.filter(anim => absences.some(ab => ab.animatorId === anim.id && ab.date === activeRecapDay));

                return (
                  <div key={`${t.id}-${idx}`} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-lg transition-all border-t-8" style={{ borderTopColor: t.color }}>
                    <div className="p-8 pb-4 flex items-start justify-between">
                      <div>
                        <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">{t.name}</h2>
                        <div className="flex flex-wrap gap-2 mt-4">
                          {teamAnimators.map((anim, itemIdx) => (
                            <span key={`${t.id}-anim-${anim.id}-${itemIdx}`} className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 italic flex items-center gap-1.5">
                              <UserCheck size={10} />
                              {anim.lastName} {anim.firstName[0]}.
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleOpenModal('teams', t)} className="p-3 text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors"><Pencil size={20} /></button>
                        <button onClick={() => handleDelete(t.id, teamsColl)} className="p-3 text-red-600 hover:bg-red-50 rounded-2xl transition-colors"><Trash2 size={20} /></button>
                      </div>
                    </div>

                    {/* Dynamic Present / Absent Animators lists for Selected Day */}
                    <div className="px-8 pb-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-3xl border border-slate-100">
                        {/* Present Block */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full w-fit">
                            <CheckCircle2 size={11} className="text-emerald-500 animate-pulse" />
                            Presenti oggi ({presentToday.length})
                          </span>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                            {presentToday.map(anim => (
                              <div key={anim.id} className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5 py-0.5 italic">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                <span className="truncate">{anim.lastName} {anim.firstName}</span>
                              </div>
                            ))}
                            {presentToday.length === 0 && (
                              <p className="text-[10px] text-slate-400 font-extrabold uppercase italic">Nessuno presente</p>
                            )}
                          </div>
                        </div>

                        {/* Absent Block */}
                        <div className="space-y-2 border-t sm:border-t-0 sm:border-l border-slate-200/50 pt-3 sm:pt-0 sm:pl-4">
                          <span className="text-[10px] font-black text-red-650 uppercase tracking-widest flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-full w-fit">
                            <AlertCircle size={11} className="text-red-500" />
                            Assenti oggi ({absentToday.length})
                          </span>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                            {absentToday.map(anim => {
                              const ab = absences.find(a => a.animatorId === anim.id && a.date === activeRecapDay);
                              let spec = 'Tutto il giorno';
                              if (ab?.reason === 'Solo Mattina') {
                                spec = 'Solo Mattina';
                              } else if (ab?.reason === 'Solo Pomeriggio') {
                                spec = 'Solo Pomeriggio';
                              } else if (ab?.startTime || ab?.endTime) {
                                spec = `${ab.startTime || ''}-${ab.endTime || ''}`;
                              }
                              const reason = ab?.reason && ab.reason !== 'Solo Mattina' && ab.reason !== 'Solo Pomeriggio' ? `(${ab.reason})` : '';

                              return (
                                <div key={anim.id} className="text-[11px] font-medium text-slate-550 flex flex-col gap-0.5 py-0.5 border-b border-dashed border-slate-100 last:border-none">
                                  <span className="font-bold text-red-650 flex items-center gap-1.5 italic">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-ping" />
                                    {anim.lastName} {anim.firstName[0]}.
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-mono pl-3 italic">
                                    {spec} {reason}
                                  </span>
                                </div>
                              );
                            })}
                            {absentToday.length === 0 && (
                              <p className="text-[10px] text-slate-400 font-extrabold uppercase italic">Nessun assente</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Absences Tracker Grid inside Team Cards Row */}
                    <div className="px-8 pb-4">
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-3xl flex flex-col gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-1 border-b border-white flex items-center gap-2">
                          <UserX size={12} className="text-red-500" />
                          Storico presenze nel Camp
                        </span>
                        {teamAnimators.length > 0 ? teamAnimators.map((anim, itemIdx) => {
                          return (
                            <div key={`${t.id}-absence-${anim.id}-${itemIdx}`} className="flex flex-col md:flex-row md:items-center justify-between gap-2 py-2 border-b border-dashed border-slate-200/50 last:border-none">
                              <span className="text-[11px] font-bold text-slate-700 italic shrink-0">{anim.lastName} {anim.firstName[0]}.</span>
                              <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-full">
                                {activeSeasonDays.map(day => {
                                  const isAbsent = absences.some(ab => ab.animatorId === anim.id && ab.date === day);
                                  const weekdayStr = format(new Date(day), 'eeeee d', { locale: it });
                                  return (
                                    <div 
                                      key={day}
                                      className={`w-7 h-7 rounded-lg flex flex-col items-center justify-center text-[8px] font-black transition-all shrink-0 ${
                                        isAbsent 
                                          ? 'bg-red-500 text-white ring-2 ring-red-105' 
                                          : 'bg-emerald-500 text-white ring-2 ring-emerald-105'
                                      }`}
                                      title={`${format(new Date(day), 'dd/MM/yyyy')}: ${isAbsent ? 'Assente' : 'Presente'}`}
                                    >
                                      <span className="text-[5px] uppercase opacity-75">{weekdayStr[0]}</span>
                                      <span className="leading-none">{format(new Date(day), 'd')}</span>
                                    </div>
                                  );
                                })}
                                {activeSeasonDays.length === 0 && (
                                  <span className="text-[9px] text-slate-400 font-bold italic">Nessun giorno feriale impostato</span>
                                )}
                              </div>
                            </div>
                          );
                        }) : (
                          <p className="text-[10px] text-slate-400 uppercase font-black italic py-1 text-center">Nessun animatore associato</p>
                        )}
                      </div>
                    </div>

                    <div className="p-8 pt-2 flex-grow">
                      <div className="bg-slate-50/50 rounded-3xl p-4 border border-slate-100 font-normal">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                            <Users size={12} /> Elenco Ragazzi ({t.kids?.length || 0})
                          </span>
                        </div>
                        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                          {t.kids && t.kids.map((k, idx) => (
                            <div key={idx} className="flex items-center justify-between py-2 border-b border-white last:border-0">
                              <span className="text-xs font-bold text-slate-700 italic">{k.lastName} {k.firstName}</span>
                              {k.note && <span className="text-[9px] text-slate-400 italic truncate max-w-[120px]">{k.note}</span>}
                            </div>
                          ))}
                          {(!t.kids || t.kids.length === 0) && <p className="text-[10px] text-slate-300 uppercase font-black italic py-4 text-center">Nessun ragazzo assegnato</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                  <Trophy size={48} className="mx-auto text-slate-200 mb-4" />
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Nessuna squadra attiva per la stagione {activeSeason}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assenze Tab & Matrices */}
        {activeTab === 'absences' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Minimalist Season Days configurator bar */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-widest flex items-center gap-2">
                  <Calendar size={18} className="text-amber-500" />
                  Giornate Camp della Stagione ({activeSeasonDays.length})
                </h3>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">
                  Configura e genera i giorni effettivi per questa stagione di oratorio ({activeSeason})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDaysConfigOpen(true)}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-6 py-3.5 rounded-full font-black uppercase italic tracking-wider transition-all shadow-md active:scale-95 text-[10px]"
              >
                <Calendar size={14} />
                Gestisci Giornate Camp
              </button>
            </div>

            {/* Matrix of Attendance (Tanti Quadratini) */}
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-widest flex items-center gap-3">
                    <UserX size={18} className="text-red-500" />
                    Pannello Rilevamento Assenze Rapido (Stagione {activeSeason})
                  </h3>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">
                    Clicca sul quadratino corrispondente per impostare e pianificare la presenza/assenza (Mezza giornata, Tutto il giorno o Orari)
                  </p>
                </div>

                {/* PDF Download Buttons */}
                <div className="flex flex-wrap gap-2 pt-2 lg:pt-0">
                  <button
                    type="button"
                    onClick={() => generateAbsencesPDF('daily')}
                    className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 hover:border-blue-300 hover:text-blue-600 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                    title="Scarica in formato PDF l'elenco delle presenze e assenze per la giornata selezionata"
                  >
                    <Download size={13} className="text-amber-500" />
                    Scarica Report Giornaliero
                  </button>
                  <button
                    type="button"
                    onClick={() => generateAbsencesPDF('weekly')}
                    className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 hover:border-blue-300 hover:text-blue-600 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                    title="Scarica in formato PDF la settimana di assenze correntemente visualizzata"
                  >
                    <Download size={13} className="text-blue-500" />
                    Scarica Griglia Settimanale
                  </button>
                  <button
                    type="button"
                    onClick={() => generateAbsencesPDF('totals')}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 border border-blue-600"
                    title="Scarica in formato PDF il riepilogo totale di tutte le assenze della stagione"
                  >
                    <Download size={13} className="text-white" />
                    Scarica Report Stagionale
                  </button>
                </div>
              </div>

              {activeSeasonDays.length > 0 ? (
                (() => {
                  const dailyStats = displayedDays.reduce((acc, day) => {
                    const total = activeSeasonAnimatorsList.length;
                    const dayAbsences = absences.filter(ab => ab.date === day);
                    const fullyAbsent = dayAbsences.filter(ab => !ab.startTime && !ab.endTime).length;
                    const partiallyAbsent = dayAbsences.filter(ab => ab.startTime || ab.endTime).length;
                    const presentTotal = total - fullyAbsent;
                    
                    acc[day] = {
                      present: presentTotal,
                      absent: fullyAbsent,
                      partial: partiallyAbsent,
                      total
                    };
                    return acc;
                  }, {} as { [day: string]: { present: number; absent: number; partial: number; total: number } });

                  return (
                    <div>
                      {/* Week Selector Pills */}
                      <div className="px-8 py-5 border-b border-slate-50 bg-slate-50/20 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-2">Filtra per Settimana:</span>
                        <button
                          type="button"
                          onClick={() => setSelectedWeekId('all')}
                          className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider transition-all select-none border ${
                            selectedWeekId === 'all'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100 scale-105'
                              : 'bg-white text-slate-500 hover:text-slate-800 border-slate-250'
                          }`}
                        >
                          Tutte le giornate ({activeSeasonDays.length})
                        </button>
                        {weeks.map((w, idx) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => setSelectedWeekId(w.id)}
                            className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider transition-all select-none border ${
                              selectedWeekId === w.id
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100 scale-105'
                                : 'bg-white text-slate-500 hover:text-slate-800 border-slate-250'
                            }`}
                          >
                            Sett. {idx + 1} ({w.label})
                          </button>
                        ))}
                                   {/* Daily Recap summary & interactive chosen day panel */}
                      <div className="p-8 bg-slate-50/20 border-b border-slate-50">
                        {displayedDays.length > 0 ? (
                          (() => {
                            const activeRecapDay = displayedDays.includes(selectedRecapDay)
                              ? selectedRecapDay
                              : (displayedDays[0] || selectedRecapDay || activeSeasonDays[0]);

                            const activeDayStats = dailyStats[activeRecapDay] || { present: 0, absent: 0, partial: 0, total: 0 };
                            const activeDayAbsences = absences.filter(ab => ab.date === activeRecapDay);
                            
                            const absenteesDetailedList = activeDayAbsences.map(ab => {
                              const anim = activeSeasonAnimatorsList.find(a => a.id === ab.animatorId);
                              return {
                                absence: ab,
                                animator: anim
                              };
                            }).filter(item => item.animator !== undefined) as { absence: Absence; animator: Animator }[];

                            absenteesDetailedList.sort((a, b) => {
                              const nameA = `${a.animator.lastName} ${a.animator.firstName}`.toUpperCase();
                              const nameB = `${b.animator.lastName} ${b.animator.firstName}`.toUpperCase();
                              return nameA.localeCompare(nameB);
                            });

                            const getAbsenceTypeTextAndStyle = (ab: Absence) => {
                              if (!ab.startTime && !ab.endTime) {
                                return {
                                  text: 'Assente tutto il giorno 🔴',
                                  colorClass: 'bg-red-50 text-red-650 border border-red-100'
                                };
                              }
                              if (ab.reason === 'Solo Mattina') {
                                return {
                                  text: 'Solo Mattina ☀️ (Assente PM)',
                                  colorClass: 'bg-amber-50 text-amber-600 border border-amber-100'
                                };
                              }
                              if (ab.reason === 'Solo Pomeriggio') {
                                return {
                                  text: 'Solo Pomeriggio ⛅ (Assente AM)',
                                  colorClass: 'bg-orange-50 text-orange-600 border border-orange-100'
                                };
                              }
                              return {
                                text: `Orario: ${ab.startTime} - ${ab.endTime} ⏰ ${ab.reason ? `(${ab.reason})` : ''}`,
                                colorClass: 'bg-purple-50 text-purple-600 border border-purple-100'
                              };
                            };

                            const dObj = new Date(activeRecapDay);
                            const formattedFullDate = format(dObj, "eeee dd MMMM yyyy", { locale: it });
                            const todayStr = format(new Date(), 'yyyy-MM-dd');
                            const isToday = activeRecapDay === todayStr;

                            return (
                              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                {/* Left Side: Day Selection Grid */}
                                <div className="lg:col-span-5 flex flex-col gap-3">
                                  <div className="flex items-center gap-2">
                                    <Calendar size={14} className="text-blue-500" />
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                      Seleziona Giorno per il Riepilogo:
                                    </h4>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[340px] overflow-y-auto pr-2 custom-scrollbar">
                                    {displayedDays.map(day => {
                                      const isSel = day === activeRecapDay;
                                      const dayObj = new Date(day);
                                      const dayStats = dailyStats[day] || { present: 0, absent: 0, partial: 0, total: 0 };
                                      const isDayToday = day === todayStr;

                                      return (
                                        <button
                                          key={`selector-${day}`}
                                          type="button"
                                          onClick={() => setSelectedRecapDay(day)}
                                          className={`p-3 rounded-2xl text-left border transition-all flex flex-col justify-between cursor-pointer select-none active:scale-95 ${
                                            isSel
                                              ? 'bg-blue-600 text-white border-blue-650 shadow-lg shadow-blue-100/50 scale-[1.02] font-black'
                                              : 'bg-white text-slate-700 border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between w-full">
                                            <div className="flex flex-col">
                                              <span className={`text-[10px] font-black uppercase text-left ${isSel ? 'text-white/80' : 'text-slate-400'}`}>
                                                {format(dayObj, 'eee', { locale: it })}
                                              </span>
                                              <span className="text-xs font-black">
                                                {format(dayObj, 'dd/MM')}
                                                {isDayToday && <span className={`${isSel ? 'text-white' : 'text-blue-300'} text-[8px] font-black`}> (Oggi)</span>}
                                              </span>
                                            </div>
                                            {dayStats.absent > 0 ? (
                                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isSel ? 'bg-white/20 text-white' : 'bg-red-50 text-red-600'}`}>
                                                🔴 {dayStats.absent}
                                              </span>
                                            ) : (
                                              <span className={`text-[9.5px] font-black ${isSel ? 'text-white' : 'text-emerald-500'}`}>
                                                🟢 OK
                                              </span>
                                            )}
                                          </div>
                                          
                                          <div className="mt-2 text-[9px] font-bold opacity-90 flex justify-between items-center w-full">
                                            <span>{dayStats.present} pr.</span>
                                            {dayStats.partial > 0 && <span className="opacity-75">({dayStats.partial} parz.)</span>}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Right Side: Chosen Day Detail card */}
                                <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/60 pb-4">
                                      <div>
                                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2.5 py-1 rounded-full animate-pulse">
                                          In Evidenza
                                        </span>
                                        <h4 className="text-xs font-black text-slate-800 uppercase italic mt-1.5 flex items-center gap-2">
                                          {formattedFullDate}
                                          {isToday && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black bg-emerald-100 text-emerald-800">
                                              Oggi
                                            </span>
                                          )}
                                        </h4>
                                      </div>

                                      <div className="flex flex-wrap gap-1.5 text-[9px] font-black uppercase tracking-wider">
                                        <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1 rounded-xl flex items-center gap-1">
                                          🟢 {activeDayStats.present} Pres.
                                        </span>
                                        {activeDayStats.partial > 0 && (
                                          <span className="bg-purple-50 border border-purple-100 text-purple-700 px-2.5 py-1 rounded-xl flex items-center gap-1">
                                            ⏰ {activeDayStats.partial} Part.
                                          </span>
                                        )}
                                        <span className="bg-red-50 border border-red-100 text-red-650 px-2.5 py-1 rounded-xl flex items-center gap-1">
                                          🔴 {activeDayStats.absent} Ass.
                                        </span>
                                      </div>
                                    </div>

                                    {/* List of Absentees with details name */}
                                    <div className="mt-4">
                                      <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                        <UserX size={12} className="text-red-500" />
                                        Dettaglio Assenti e Tipologia di Assenza:
                                      </h5>

                                      {absenteesDetailedList.length > 0 ? (
                                        <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                                          {absenteesDetailedList.map(item => {
                                            const badgeInfo = getAbsenceTypeTextAndStyle(item.absence);
                                            return (
                                              <div
                                                key={`abs-detail-${item.absence.id}`}
                                                className="flex flex-wrap items-center justify-between p-2 rounded-2xl bg-slate-50 border border-slate-100/80 hover:bg-slate-100/40 transition-colors gap-2"
                                              >
                                                <span className="text-[11px] font-bold text-slate-700 uppercase italic">
                                                  {item.animator.lastName} {item.animator.firstName}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                  <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-lg ${badgeInfo.colorClass}`}>
                                                    {badgeInfo.text}
                                                  </span>
                                                  {item.absence.reason && !['Solo Mattina', 'Solo Pomeriggio'].includes(item.absence.reason) && (
                                                    <span className="text-[10px] text-slate-400 font-medium italic">
                                                      ({item.absence.reason})
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <div className="p-5 rounded-2xl bg-emerald-50/40 border border-emerald-100/60 text-center flex flex-col items-center justify-center">
                                          <span className="text-lg">🎉</span>
                                          <p className="text-[10px] font-black text-emerald-800 uppercase italic">Tutti Presenti!</p>
                                          <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mt-0.5">
                                            Nessun animatore assente registrato in questa data.
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="pt-3 mt-4 border-t border-slate-100/60 text-[9px] text-slate-400 font-bold uppercase tracking-wider flex justify-between items-center">
                                    <span>Totale registrati: {activeDayStats.total}</span>
                                    <span className="italic text-blue-500 font-black">Clicca anche sulle colonne della tabella sotto per cambiare giorno!</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="py-8 text-center bg-white border border-slate-100 rounded-3xl">
                            <Calendar size={36} className="mx-auto text-slate-200 mb-2" />
                            <p className="text-slate-400 text-xs italic">Nessun giorno feriale attivo in questa settimana.</p>
                          </div>
                        )}
                      </div>                   </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-50/10 border-b border-slate-100 italic">
                              <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Animatore</th>
                              {displayedDays.map(day => {
                                const dateObj = new Date(day);
                                const stats = dailyStats[day] || { present: 0, absent: 0, partial: 0, total: 0 };
                                const isActive = activeRecapDay === day;
                                return (
                                  <th 
                                    key={day} 
                                    onClick={() => setSelectedRecapDay(day)}
                                    className={`px-3 py-5 text-center text-[10px] font-black uppercase tracking-widest min-w-[85px] cursor-pointer transition-all relative ${
                                      isActive 
                                        ? 'bg-blue-50 text-blue-700 border-x border-t border-blue-100 rounded-t-3xl shadow-sm' 
                                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/40'
                                    }`}
                                    title="Clicca per caricare i dettagli di questa giornata nel riepilogo sopra"
                                  >
                                    <div className="flex flex-col items-center">
                                      <span className={isActive ? 'text-blue-600 font-black' : 'opacity-75'}>
                                        {format(dateObj, 'eee', { locale: it })}
                                      </span>
                                      <span className={`text-xs font-black mt-0.5 ${isActive ? 'text-blue-800' : 'text-slate-600'}`}>
                                        {format(dateObj, 'dd/MM')}
                                      </span>
                                      {/* Inline stats block */}
                                      <div className={`mt-2 pt-1.5 border-t w-full flex items-center justify-center gap-1.5 text-[9px] font-extrabold ${isActive ? 'border-blue-200' : 'border-slate-100/50'}`}>
                                        <span className="text-emerald-600" title="Presenti">🟢{stats.present}</span>
                                        <span className="text-red-500" title="Assenti">🔴{stats.absent}</span>
                                      </div>
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {activeSeasonAnimatorsList.length > 0 ? activeSeasonAnimatorsList.map((anim, index) => (
                              <tr key={`${anim.id}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-8 py-4 whitespace-nowrap">
                                  <span className="text-xs font-black text-slate-800 uppercase italic">{anim.lastName} {anim.firstName}</span>
                                </td>
                                {displayedDays.map(day => {
                                  const matchingAbs = absences.find(ab => ab.animatorId === anim.id && ab.date === day);
                                  const meta = getAbsenceMeta(matchingAbs);
                                  const isActive = activeRecapDay === day;

                                  return (
                                    <td 
                                      key={day} 
                                      className={`px-2 py-4 text-center transition-all ${
                                        isActive 
                                          ? 'bg-blue-50/10 border-x border-blue-50/35 shadow-inner' 
                                          : ''
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedGridAbsence({
                                            anim,
                                            day,
                                            existingAbs: matchingAbs
                                          });
                                        }}
                                        className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-xs shadow-sm cursor-pointer transition-all active:scale-95 ${
                                          meta ? meta.className : 'bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600'
                                        }`}
                                        title={meta ? meta.tooltip : `${anim.lastName}: Presente (Clicca per impostare assenza)`}
                                      >
                                        {meta ? (
                                          <span className="font-extrabold text-[10px] whitespace-nowrap">{meta.label}</span>
                                        ) : (
                                          <Plus size={12} className="opacity-40 hover:opacity-100 transition-opacity" />
                                        )}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={displayedDays.length + 1} className="py-20 text-center">
                                  <Users size={32} className="mx-auto text-slate-100 mb-4" />
                                  <p className="text-slate-300 font-black uppercase tracking-widest text-[9px]">
                                    Nessun animatore iscritto attivo nella stagione {activeSeason}
                                  </p>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Aesthetic legend block */}
                      <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-x-6 gap-y-2 items-center justify-center md:justify-start">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">Legenda Assenze:</span>
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600">
                          <span className="w-5 h-5 rounded-md bg-red-500 text-white flex items-center justify-center font-bold text-[8px]">❌ T</span>
                          <span>Assente tutto il giorno</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600">
                          <span className="w-5 h-5 rounded-md bg-amber-500 text-white flex items-center justify-center font-bold text-[8px]">☀️ M</span>
                          <span>Fa solo mattina (Assente PM)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600">
                          <span className="w-5 h-5 rounded-md bg-orange-500 text-white flex items-center justify-center font-bold text-[8px]">⛅ P</span>
                          <span>Fa solo pomeriggio (Assente AM)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600">
                          <span className="w-5 h-5 rounded-md bg-purple-500 text-white flex items-center justify-center font-bold text-[8px]">⏰</span>
                          <span>Orari Personalizzati</span>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="py-16 text-center">
                  <Calendar size={48} className="mx-auto text-slate-200 mb-4" />
                  <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] px-8 leading-loose">
                    Nessun giorno del feriale configurato per questa stagione. <br/>
                    Configura i giorni cliccando su "Gestisci Giornate Camp" per sbloccare la fantastica tabella di rilevamento assenze avanzata!
                  </p>
                </div>
              )}
            </div>

            {/* Detailed list view of absences */}
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-slate-50/10 flex justify-between items-center">
                <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-widest">
                  Storico Assenze Dettagliate
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/10 border-b border-slate-100 italic">
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Data</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Animatore</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Orario</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Motivazione</th>
                      <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredAbsences.length > 0 ? filteredAbsences.map((ab, index) => {
                      const anim = animators.find(a => a.id === ab.animatorId);
                      return (
                        <tr key={`${ab.id}-${index}`} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-8 py-5">
                            <span className="text-xs font-black text-slate-900 italic">
                              {format(new Date(ab.date), 'dd/MM/yyyy')}
                            </span>
                          </td>
                          <td className="px-8 py-5">
                            <span className="text-xs font-bold text-slate-700 italic">{anim?.lastName} {anim?.firstName}</span>
                          </td>
                          <td className="px-8 py-5">
                            <span className="text-xs font-bold text-slate-500 font-mono">
                              {ab.startTime && ab.endTime ? `${ab.startTime} - ${ab.endTime}` : 'Intera Giornata'}
                            </span>
                          </td>
                          <td className="px-8 py-5">
                            <span className="text-xs font-medium text-slate-450 italic text-slate-400">{ab.reason || 'Segnato tramite grid'}</span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => handleOpenModal('absences', ab)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={14} /></button>
                              <button onClick={() => handleDelete(ab.id, absencesColl)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} className="py-20 text-center">
                          <UserX size={48} className="mx-auto text-slate-100 mb-4" />
                          <p className="text-slate-300 font-black uppercase tracking-widest text-[10px]">Nessuna assenza registrata per questa stagione</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Creation/Edit dialogue modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in fade-in duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase italic">
                  {editingId ? 'Modifica' : 'Nuovo'} {activeTab === 'animators' ? 'Animatore' : activeTab === 'shifts' ? 'Turno' : activeTab === 'teams' ? 'Squadra' : 'Assenza'}
                </h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configurazione Oratorio Feriale ({activeSeason})</p>
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
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Nome</span>
                      <input required type="text" value={animatorForm.firstName} onChange={e => setAnimatorForm({...animatorForm, firstName: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner" />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Cognome</span>
                      <input required type="text" value={animatorForm.lastName} onChange={e => setAnimatorForm({...animatorForm, lastName: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Email</span>
                      <input type="email" value={animatorForm.email} onChange={e => setAnimatorForm({...animatorForm, email: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner" />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Telefono</span>
                      <input type="tel" value={animatorForm.phone} onChange={e => setAnimatorForm({...animatorForm, phone: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono font-bold shadow-inner" />
                    </div>
                  </div>

                  {/* Multi-season check buttons in Modal Form */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Seleziona Stagioni di Partecipazione</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-4 rounded-2xl shadow-inner border border-slate-100">
                      {allSeasons.map(sId => {
                        const isSet = animatorForm.seasons?.includes(sId);
                        return (
                          <button
                            key={sId}
                            type="button"
                            onClick={() => {
                              const cur = animatorForm.seasons || [];
                              const next = cur.includes(sId) ? cur.filter(x => x !== sId) : [...cur, sId];
                              setAnimatorForm({ ...animatorForm, seasons: next });
                            }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all italic ${
                              isSet 
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm scale-102 font-bold'
                                : 'bg-white text-slate-500 border-slate-100 hover:border-blue-400'
                            }`}
                          >
                            {isSet ? <Check size={11} strokeWidth={3} /> : <div className="w-2.5 h-2.5 rounded-full border border-slate-300" />}
                            {sId}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Note / Allergie</span>
                    <textarea value={animatorForm.notes} onChange={e => setAnimatorForm({...animatorForm, notes: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner" rows={3}/>
                  </div>
                </div>
              )}

              {activeTab === 'shifts' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Data</span>
                      <input required type="date" value={shiftForm.date} onChange={e => setShiftForm({...shiftForm, date: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner"/>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Inizio</span>
                      <input required type="time" value={shiftForm.startTime} onChange={e => setShiftForm({...shiftForm, startTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner" />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Fine</span>
                      <input required type="time" value={shiftForm.endTime} onChange={e => setShiftForm({...shiftForm, endTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Attività Principale</span>
                    <input required type="text" value={shiftForm.activity} onChange={e => setShiftForm({...shiftForm, activity: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner"/>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Seleziona Animatori di {activeSeason}</span>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-4 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner custom-scrollbar">
                      {activeSeasonAnimatorsList.map((a, index) => (
                        <button
                          key={`${a.id}-shift-${index}`}
                          type="button"
                          onClick={() => {
                            const ids = shiftForm.animatorIds.includes(a.id) 
                              ? shiftForm.animatorIds.filter(id => id !== a.id)
                              : [...shiftForm.animatorIds, a.id];
                            setShiftForm({...shiftForm, animatorIds: ids});
                          }}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left italic ${
                            shiftForm.animatorIds.includes(a.id) 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-white text-slate-500 border-slate-100'
                          }`}
                        >
                          <span className="text-[11px] font-bold truncate">{a.lastName} {a.firstName}</span>
                        </button>
                      ))}
                      {activeSeasonAnimatorsList.length === 0 && <p className="col-span-full py-4 text-center text-[10px] font-black text-slate-300 uppercase">Nessun animatore iscritto in questa stagione</p>}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'teams' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Nome Squadra</span>
                      <input required type="text" value={teamForm.name} onChange={e => setTeamForm({...teamForm, name: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner"/>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Colore</span>
                      <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-50 shadow-inner">
                        <input type="color" value={teamForm.color} onChange={e => setTeamForm({...teamForm, color: e.target.value})} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent"/>
                        <span className="text-xs font-bold text-slate-500 font-mono italic">{teamForm.color}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Animatori della Squadra ({activeSeason})</span>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-4 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner custom-scrollbar">
                      {activeSeasonAnimatorsList.map((a, index) => (
                        <button
                          key={`${a.id}-team-${index}`}
                          type="button"
                          onClick={() => {
                            const ids = teamForm.animatorIds.includes(a.id) 
                              ? teamForm.animatorIds.filter(id => id !== a.id)
                              : [...teamForm.animatorIds, a.id];
                            setTeamForm({...teamForm, animatorIds: ids});
                          }}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left italic ${
                            teamForm.animatorIds.includes(a.id) 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-white text-slate-500 border-slate-100'
                          }`}
                        >
                          <span className="text-[11px] font-bold truncate">{a.lastName} {a.firstName}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Gestione Ragazzi</span>
                    <div className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 shadow-inner space-y-4">
                      <div className="flex flex-wrap gap-2 mb-4">
                        {teamForm.kids && teamForm.kids.map((k, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-white text-slate-600 px-4 py-2 rounded-xl border border-slate-100 text-[11px] font-bold shadow-sm italic animate-in zoom-in">
                            <span>{k.lastName} {k.firstName[0]}.</span>
                            <button type="button" onClick={() => setTeamForm({...teamForm, kids: teamForm.kids.filter((_, i) => i !== idx)})} className="text-red-400 hover:text-red-750 font-bold ml-1">×</button>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" placeholder="Nome" value={newKid.firstName} onChange={e => setNewKid({...newKid, firstName: e.target.value})} className="px-4 py-3 bg-white rounded-xl text-xs font-bold shadow-sm outline-none"/>
                        <input type="text" placeholder="Cognome" value={newKid.lastName} onChange={e => setNewKid({...newKid, lastName: e.target.value})} className="px-4 py-3 bg-white rounded-xl text-xs font-bold shadow-sm outline-none"/>
                      </div>
                      <div className="flex gap-2">
                        <input type="text" placeholder="Note (es. allergie)" value={newKid.note} onChange={e => setNewKid({...newKid, note: e.target.value})} className="flex-1 px-4 py-3 bg-white rounded-xl text-xs font-bold shadow-sm outline-none"/>
                        <button 
                          type="button" 
                          onClick={() => {
                            if(!newKid.firstName || !newKid.lastName) return;
                            setTeamForm({...teamForm, kids: [...(teamForm.kids || []), newKid]});
                            setNewKid({firstName: '', lastName: '', note: ''});
                          }}
                          className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-750 transition"
                        >
                          <Plus size={18}/>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'absences' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Seleziona Animatore ({activeSeason})</span>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-4 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner custom-scrollbar">
                      {activeSeasonAnimatorsList.map((a, index) => (
                        <button
                          key={`${a.id}-abs-${index}`}
                          type="button"
                          onClick={() => setAbsenceForm({...absenceForm, animatorId: a.id})}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left italic ${
                            absenceForm.animatorId === a.id
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-white text-slate-500 border-slate-100'
                          }`}
                        >
                          <span className="text-[11px] font-bold truncate">{a.lastName} {a.firstName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Data Assenza</span>
                      <input required type="date" value={absenceForm.date} onChange={e => setAbsenceForm({...absenceForm, date: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none text-sm font-bold outline-none"/>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Da (opz)</span>
                      <input type="time" value={absenceForm.startTime || ''} onChange={e => setAbsenceForm({...absenceForm, startTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none text-sm font-bold outline-none"/>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">A (opz)</span>
                      <input type="time" value={absenceForm.endTime || ''} onChange={e => setAbsenceForm({...absenceForm, endTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none text-sm font-bold outline-none"/>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Motivazione / Note</span>
                    <textarea value={absenceForm.reason || ''} onChange={e => setAbsenceForm({...absenceForm, reason: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none text-sm font-bold shadow-inner" rows={2}/>
                  </div>
                </div>
              )}

              {errorStatus && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3">
                  <AlertCircle size={18} className="shrink-0" />
                  <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">{errorStatus}</p>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 bg-white border border-slate-100 shadow-sm transition"
                >
                  Annulla
                </button>
                <button
                  disabled={isSaving}
                  type="submit"
                  className="flex-1 bg-slate-900 hover:bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg transition disabled:opacity-50"
                >
                  {isSaving ? 'Salvataggio...' : 'Conferma'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {successStatus && (
        <div className="fixed bottom-10 right-10 z-[100] animate-in slide-in-from-right-10 fade-in duration-300 pointer-events-none">
           <div className="bg-green-600 text-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-4 border-2 border-white/20">
              <CheckCircle2 size={20} />
              <span className="text-[11px] font-black uppercase tracking-widest italic">{successStatus}</span>
           </div>
        </div>
      )}

      {/* Season Manager Modal */}
      {isSeasonManagerOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in fade-in duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase italic">Gestione Stagioni</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Crea, modifica e rimuovi le stagioni feriali</p>
              </div>
              <button onClick={() => {
                setIsSeasonManagerOpen(false);
                setSeasonManagerForm({ name: '', isEditing: false, editingId: '', editingName: '' });
              }} className="p-2.5 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              {errorStatus && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-800 text-xs font-bold animate-in fade-in duration-300">
                  <AlertCircle size={16} className="text-red-500 shrink-0 cursor-pointer" onClick={() => setErrorStatus(null)} />
                  <span className="text-[10px] leading-snug">{errorStatus}</span>
                </div>
              )}
              {/* Form editing / creation */}
              {seasonManagerForm.isEditing ? (
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Rinomina stagione "{seasonManagerForm.editingId}"</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nuovo nome..."
                      value={seasonManagerForm.editingName}
                      onChange={(e) => setSeasonManagerForm({ ...seasonManagerForm, editingName: e.target.value })}
                      className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    />
                    <button
                      onClick={async () => {
                        await handleRenameSeason(seasonManagerForm.editingId, seasonManagerForm.editingName);
                        setSeasonManagerForm({ name: '', isEditing: false, editingId: '', editingName: '' });
                      }}
                      className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition"
                    >
                      Aggiorna
                    </button>
                    <button
                      onClick={() => setSeasonManagerForm({ ...seasonManagerForm, isEditing: false })}
                      className="bg-slate-200 text-slate-600 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-300 transition"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Crea Nuova Stagione</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Es. 2026, 2027..."
                      value={seasonManagerForm.name}
                      onChange={(e) => setSeasonManagerForm({ ...seasonManagerForm, name: e.target.value })}
                      className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    />
                    <button
                      onClick={async () => {
                        if (!seasonManagerForm.name.trim()) return;
                        await handleAddSeason(seasonManagerForm.name);
                        setSeasonManagerForm({ ...seasonManagerForm, name: '' });
                      }}
                      className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition"
                    >
                      Aggiungi
                    </button>
                  </div>
                </div>
              )}

              {/* Seasons list */}
              <div className="space-y-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Elenchi Stagioni Presenti</span>
                <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto custom-scrollbar bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                  {allSeasons.map(sId => (
                    <div key={sId} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800">{sId}</span>
                        {activeSeason === sId && <span className="bg-blue-100 text-blue-600 text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">Attiva</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSeasonManagerForm({
                            ...seasonManagerForm,
                            isEditing: true,
                            editingId: sId,
                            editingName: sId
                          })}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition"
                          title="Rinomina"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteSeason(sId)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="Elimina"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Camp Days Configurator Popup */}
      {isDaysConfigOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in fade-in duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase italic">Giornate Camp {activeSeason}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Definisci e genera i giorni feriali di attività dell'oratorio feriale</p>
              </div>
              <button onClick={() => setIsDaysConfigOpen(false)} className="p-2.5 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-6">
                {/* Manual single day */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Giorno Singolo</span>
                  <div className="flex gap-2">
                    <input 
                      type="date" 
                      id="popup-manual-camp-day"
                      className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                    />
                    <button 
                      onClick={async () => {
                        const val = (document.getElementById('popup-manual-camp-day') as HTMLInputElement)?.value;
                        if (!val) return;
                        
                        const curDays = seasonsData[activeSeason] || [];
                        if (curDays.includes(val)) {
                          alert('Questa data è già presente!');
                          return;
                        }
                        await updateSeasonDays(activeSeason, [...curDays, val]);
                        setSuccessStatus('Giorno aggiunto con successo!');
                        setTimeout(() => setSuccessStatus(null), 2000);
                      }}
                      className="bg-blue-600 text-white px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition"
                    >
                      Aggiungi
                    </button>
                  </div>
                </div>

                {/* Mass generation */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Generazione Feriale Rapida (Lun-Ven)</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Da Giorno</span>
                      <input type="date" id="popup-mass-start-day" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold" />
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">A Giorno</span>
                      <input type="date" id="popup-mass-end-day" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold" />
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const start = (document.getElementById('popup-mass-start-day') as HTMLInputElement)?.value;
                      const end = (document.getElementById('popup-mass-end-day') as HTMLInputElement)?.value;
                      if (!start || !end) {
                        alert('Seleziona entrambe le date!');
                        return;
                      }
                      const dates = getDatesInRange(start, end);
                      if (dates.length === 0) {
                        alert('Nessun giorno feriale (Lun-Ven) nell\'intervallo.');
                        return;
                      }
                      const curDays = seasonsData[activeSeason] || [];
                      const merged = Array.from(new Set([...curDays, ...dates]));
                      await updateSeasonDays(activeSeason, merged);
                      setSuccessStatus('Giorni del feriale generati con successo!');
                      setTimeout(() => setSuccessStatus(null), 2000);
                    }}
                    className="w-full bg-slate-900 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition shadow-md"
                  >
                    Genera Giornate Feriali
                  </button>
                </div>
              </div>

              {/* Configured days list */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col h-full">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pb-2 border-b border-slate-200 mb-3">
                  Giorni Attivi in Archivio ({activeSeasonDays.length})
                </span>
                <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[35vh] custom-scrollbar">
                  {activeSeasonDays.map(day => (
                    <div key={day} className="flex items-center gap-1.5 bg-white text-slate-700 border border-slate-100 rounded-xl px-3 py-1.5 text-xs font-bold shadow-sm italic">
                      <span>{format(new Date(day), 'dd MMM (eee)', { locale: it })}</span>
                      <button 
                        onClick={async () => {
                          const updated = activeSeasonDays.filter(d => d !== day);
                          await updateSeasonDays(activeSeason, updated);
                        }}
                        className="text-red-400 hover:text-red-650 ml-1 transition"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {activeSeasonDays.length === 0 && (
                    <div className="italic text-slate-300 text-xs py-8 text-center w-full font-bold uppercase tracking-wide">
                      Nessun giorno impostato. Utilizza i moduli a sinistra.
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDaysConfigOpen(false)}
                className="bg-slate-900 text-white px-8 py-3.5 rounded-full font-black uppercase tracking-widest text-xs hover:bg-blue-600 transition"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid Click Custom Absence Modal */}
      {selectedGridAbsence && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in fade-in duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase italic">
                  Presenza / Assenza
                </h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                  {selectedGridAbsence.anim.firstName} {selectedGridAbsence.anim.lastName} — {format(new Date(selectedGridAbsence.day), 'dd/MM/yyyy')}
                </p>
              </div>
              <button onClick={() => {
                setSelectedGridAbsence(null);
                setCustomAbsTime({ show: false, startTime: '08:30', endTime: '13:30', reason: '' });
              }} className="p-2.5 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Seleziona Tipo di Assenza</span>
              
              {/* Option 1: Present (cancels existing absence) */}
              <button
                onClick={async () => {
                  if (selectedGridAbsence.existingAbs) {
                    await deleteDoc(doc(absencesColl, selectedGridAbsence.existingAbs.id));
                    setSuccessStatus('Stato impostato a: Presente');
                    setTimeout(() => setSuccessStatus(null), 2000);
                  }
                  setSelectedGridAbsence(null);
                }}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left font-bold transition-all ${
                  !selectedGridAbsence.existingAbs 
                    ? 'border-emerald-500 bg-emerald-50/50 text-emerald-800' 
                    : 'border-slate-100 hover:border-emerald-250 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-wider block">🟢 Presente</span>
                  <span className="text-[10px] font-normal text-slate-400">L'animatore partecipa per l'intera giornata feriale</span>
                </div>
                {!selectedGridAbsence.existingAbs && <Check size={16} className="text-emerald-600" />}
              </button>

              {/* Option 2: Full day absent */}
              <button
                onClick={async () => {
                  if (selectedGridAbsence.existingAbs) {
                    await updateDoc(doc(absencesColl, selectedGridAbsence.existingAbs.id), {
                      startTime: '',
                      endTime: '',
                      reason: ''
                    });
                  } else {
                    await addDoc(absencesColl, {
                      animatorId: selectedGridAbsence.anim.id,
                      date: selectedGridAbsence.day,
                      season: activeSeason,
                      startTime: '',
                      endTime: '',
                      reason: '',
                      createdAt: new Date().toISOString()
                    });
                  }
                  setSuccessStatus('Assente tutto il giorno impostato!');
                  setTimeout(() => setSuccessStatus(null), 2000);
                  setSelectedGridAbsence(null);
                }}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left font-bold transition-all ${
                  selectedGridAbsence.existingAbs && !selectedGridAbsence.existingAbs.startTime && !selectedGridAbsence.existingAbs.endTime
                    ? 'border-red-500 bg-red-50/50 text-red-800' 
                    : 'border-slate-100 hover:border-red-250 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-wider block">❌ Assente tutto il giorno</span>
                  <span className="text-[10px] font-normal text-slate-400">Nessuna partecipazione per l'intera giornata</span>
                </div>
                {selectedGridAbsence.existingAbs && !selectedGridAbsence.existingAbs.startTime && !selectedGridAbsence.existingAbs.endTime && <Check size={16} className="text-red-600" />}
              </button>

              {/* Option 3: Only morning (means absent parameter 13:30 to 17:30) */}
              <button
                onClick={async () => {
                  if (selectedGridAbsence.existingAbs) {
                    await updateDoc(doc(absencesColl, selectedGridAbsence.existingAbs.id), {
                      startTime: '13:30',
                      endTime: '17:30',
                      reason: 'Solo Mattina'
                    });
                  } else {
                    await addDoc(absencesColl, {
                      animatorId: selectedGridAbsence.anim.id,
                      date: selectedGridAbsence.day,
                      season: activeSeason,
                      startTime: '13:30',
                      endTime: '17:30',
                      reason: 'Solo Mattina',
                      createdAt: new Date().toISOString()
                    });
                  }
                  setSuccessStatus('Stato impostato: Fa Solo Mattina');
                  setTimeout(() => setSuccessStatus(null), 2000);
                  setSelectedGridAbsence(null);
                }}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left font-bold transition-all ${
                  selectedGridAbsence.existingAbs && selectedGridAbsence.existingAbs.reason === 'Solo Mattina'
                    ? 'border-amber-500 bg-amber-50/50 text-amber-800' 
                    : 'border-slate-100 hover:border-amber-250 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-wider block">☀️ Solo Mattina</span>
                  <span className="text-[10px] font-normal text-slate-400 font-medium">Lavora solo al mattino, assente al pomeriggio</span>
                </div>
                {selectedGridAbsence.existingAbs && selectedGridAbsence.existingAbs.reason === 'Solo Mattina' && <Check size={16} className="text-amber-600" />}
              </button>

              {/* Option 4: Only afternoon (means absent parameter 08:30 to 13:30) */}
              <button
                onClick={async () => {
                  if (selectedGridAbsence.existingAbs) {
                    await updateDoc(doc(absencesColl, selectedGridAbsence.existingAbs.id), {
                      startTime: '08:30',
                      endTime: '13:30',
                      reason: 'Solo Pomeriggio'
                    });
                  } else {
                    await addDoc(absencesColl, {
                      animatorId: selectedGridAbsence.anim.id,
                      date: selectedGridAbsence.day,
                      season: activeSeason,
                      startTime: '08:30',
                      endTime: '13:30',
                      reason: 'Solo Pomeriggio',
                      createdAt: new Date().toISOString()
                    });
                  }
                  setSuccessStatus('Stato impostato: Fa Solo Pomeriggio');
                  setTimeout(() => setSuccessStatus(null), 2000);
                  setSelectedGridAbsence(null);
                }}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left font-bold transition-all ${
                  selectedGridAbsence.existingAbs && selectedGridAbsence.existingAbs.reason === 'Solo Pomeriggio'
                    ? 'border-orange-500 bg-orange-50/50 text-orange-800' 
                    : 'border-slate-100 hover:border-orange-250 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-wider block">⛅ Solo Pomeriggio</span>
                  <span className="text-[10px] font-normal text-slate-400 font-medium">Lavora solo al pomeriggio, assente la mattina</span>
                </div>
                {selectedGridAbsence.existingAbs && selectedGridAbsence.existingAbs.reason === 'Solo Pomeriggio' && <Check size={16} className="text-orange-600" />}
              </button>

              {/* Option 5: Custom hours */}
              <button
                type="button"
                onClick={() => {
                  const s = selectedGridAbsence.existingAbs?.startTime || '08:30';
                  const e = selectedGridAbsence.existingAbs?.endTime || '13:30';
                  const r = selectedGridAbsence.existingAbs?.reason || 'Orario personalizzato';
                  setCustomAbsTime({ show: true, startTime: s, endTime: e, reason: r });
                }}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left font-bold transition-all ${
                  customAbsTime.show || (selectedGridAbsence.existingAbs && selectedGridAbsence.existingAbs.startTime && selectedGridAbsence.existingAbs.reason !== 'Solo Mattina' && selectedGridAbsence.existingAbs.reason !== 'Solo Pomeriggio')
                    ? 'border-purple-500 bg-purple-50/50 text-purple-800' 
                    : 'border-slate-100 hover:border-purple-250 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-wider block">⏰ Orario Personalizzato...</span>
                  <span className="text-[10px] font-normal text-slate-400 font-medium">Imposta orari specifici per l'assenza</span>
                </div>
              </button>

              {customAbsTime.show && (
                <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl space-y-4 animate-in slide-in-from-top-4 duration-300">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Inizio assenza</span>
                      <input
                        type="time"
                        value={customAbsTime.startTime}
                        onChange={(e) => setCustomAbsTime({ ...customAbsTime, startTime: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Fine assenza</span>
                      <input
                        type="time"
                        value={customAbsTime.endTime}
                        onChange={(e) => setCustomAbsTime({ ...customAbsTime, endTime: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Motivazione</span>
                    <input
                      type="text"
                      placeholder="Visita medica, studio..."
                      value={customAbsTime.reason}
                      onChange={(e) => setCustomAbsTime({ ...customAbsTime, reason: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      if (selectedGridAbsence.existingAbs) {
                        await updateDoc(doc(absencesColl, selectedGridAbsence.existingAbs.id), {
                          startTime: customAbsTime.startTime,
                          endTime: customAbsTime.endTime,
                          reason: customAbsTime.reason || 'Orario personalizzato'
                        });
                      } else {
                        await addDoc(absencesColl, {
                          animatorId: selectedGridAbsence.anim.id,
                          date: selectedGridAbsence.day,
                          season: activeSeason,
                          startTime: customAbsTime.startTime,
                          endTime: customAbsTime.endTime,
                          reason: customAbsTime.reason || 'Orario personalizzato',
                          createdAt: new Date().toISOString()
                        });
                      }
                      setSuccessStatus('Assenza ad orario salvata con successo!');
                      setTimeout(() => setSuccessStatus(null), 2000);
                      setSelectedGridAbsence(null);
                      setCustomAbsTime({ show: false, startTime: '08:30', endTime: '13:30', reason: '' });
                    }}
                    className="w-full bg-purple-600 text-white font-black uppercase tracking-wider py-2.5 rounded-xl text-[10px] hover:bg-purple-700 transition"
                  >
                    Salva Orario Assenza
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmation?.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in fade-in duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase italic flex items-center gap-2">
                  <AlertCircle size={18} className="text-red-500" />
                  {deleteConfirmation.title}
                </h2>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Conferma azione irreversibile</p>
              </div>
              <button 
                onClick={() => setDeleteConfirmation(null)} 
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-wider">
                {deleteConfirmation.message}
              </p>

              {deleteModalError && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start gap-2.5 text-red-800 text-xs font-bold animate-in fade-in duration-300">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <span className="text-[10px] leading-snug">{deleteModalError}</span>
                </div>
              )}
              
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setDeleteConfirmation(null)}
                  className="bg-slate-105 text-slate-600 border border-slate-100 text-[9px] font-black uppercase tracking-widest px-5 py-3 rounded-full hover:bg-slate-100 transition active:scale-95 disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={async () => {
                    await deleteConfirmation.onConfirm();
                  }}
                  className="bg-red-500 hover:bg-red-650 text-white text-[9px] font-black uppercase tracking-widest px-5 py-3 rounded-full hover:shadow-lg hover:shadow-red-50 transition active:scale-95 disabled:opacity-50 min-w-[80px] text-center"
                >
                  {isSaving ? 'Eliminazione...' : 'Elimina'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Clear Animators Confirmation Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in fade-in duration-300 font-sans">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-red-50/10">
              <div>
                <h2 className="text-base font-black text-red-600 uppercase italic flex items-center gap-2">
                  <AlertCircle size={18} />
                  Pulisci Griglia Animatori
                </h2>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Stagione corrente feriale: {activeSeason}</p>
              </div>
              <button 
                onClick={() => setBulkModalOpen(false)} 
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <p className="text-xs font-bold text-slate-500 leading-relaxed uppercase tracking-wider">
                Questa è un&apos;azione di massa che coinvolgerà tutti gli animatori iscritti alla stagione <span className="text-red-650 font-black">{activeSeason}</span>. Scegli come procedere:
              </p>

              <div className="space-y-3 font-sans">
                <button
                  type="button"
                  onClick={() => handleBulkClearAnimators('unregister')}
                  className="w-full text-left p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-100 hover:border-slate-200 transition-all group flex items-start gap-4"
                >
                  <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl mt-0.5">
                    <UserMinus size={16} />
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase text-slate-800 tracking-wider">1. Rimuovi iscrizione (Mantieni nel database)</span>
                    <span className="block text-[9px] font-bold text-slate-450 uppercase tracking-widest mt-1.5 leading-relaxed">Rimuove solo l&apos;iscrizione alla stagione {activeSeason} per gli animatori correnti, salvando i loro profili per altre stagioni o anni.</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkClearAnimators('delete')}
                  className="w-full text-left p-4 rounded-2xl bg-red-50 hover:bg-red-100/50 border border-red-100 hover:border-red-200 transition-all group flex items-start gap-4 animate-pulse-once"
                >
                  <div className="p-2.5 bg-red-100 text-red-650 rounded-xl mt-0.5">
                    <Trash2 size={16} />
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase text-red-700 tracking-wider">2. Elimina definitivamente dal database</span>
                    <span className="block text-[9px] font-bold text-slate-450 uppercase tracking-widest mt-1.5 leading-relaxed">Cancella permanentemente le schede di tutti gli animatori iscritti a questa stagione dal database. L&apos;azione è IRREVERSIBILE.</span>
                  </div>
                </button>
              </div>
              
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="bg-slate-50 text-slate-500 hover:text-slate-800 text-[9px] font-black uppercase tracking-widest px-5 py-3 rounded-full hover:bg-slate-100 transition active:scale-95 border border-slate-205"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OratorioFeriale;
