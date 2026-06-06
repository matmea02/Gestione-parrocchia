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
import { useAuth } from '../components/AuthContext';
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
  UserMinus,
  Save,
  ChevronDown,
  Star,
  List,
  Copy,
  Square,
  CheckSquare,
  BookOpen
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
  presentWeeks?: { [seasonId: string]: string[] };
}

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  activity: string;
  animatorIds: string[];
  season?: string;
  requiredPeopleCount?: number;
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
  referentIds?: string[];
  assignments?: { [animatorId: string]: 'grandi' | 'piccoli' | '' };
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

interface Workshop {
  id: string;
  name: string;
  maxSubscribers: number;
  animatorIds: string[];
  referentId: string;
  weeks: string[];
  season: string;
  createdAt: string;
}

const OratorioFeriale: React.FC = () => {
  const { currentParish } = useParish();
  const { portalUser } = useAuth();
  const animatorsColl = useParishCollection('oratorio_animators');
  const shiftsColl = useParishCollection('oratorio_shifts');
  const teamsColl = useParishCollection('oratorio_teams');
  const absencesColl = useParishCollection('oratorio_absences');
  const seasonsColl = useParishCollection('oratorio_seasons');
  const workshopsColl = useParishCollection('oratorio_workshops');
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
  const [isOratorioSettingsOpen, setIsOratorioSettingsOpen] = useState(false);
  const [oratorioNameForm, setOratorioNameForm] = useState('');
  const [oratorioLogoUrlForm, setOratorioLogoUrlForm] = useState('');
  const [savingOratorioSettings, setSavingOratorioSettings] = useState(false);

  useEffect(() => {
    if (isOratorioSettingsOpen) {
      setOratorioNameForm(parishInfo.oratorioName || parishInfo.name || '');
      setOratorioLogoUrlForm(parishInfo.oratorioLogoUrl || '');
    }
  }, [isOratorioSettingsOpen, parishInfo]);

  const handleSaveOratorioSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOratorioSettings(true);
    try {
      await setDoc(parishSettingsDoc, {
        oratorioName: oratorioNameForm,
        oratorioLogoUrl: oratorioLogoUrlForm
      }, { merge: true });
      setSuccessStatus('Impostazioni Oratorio Feriale salvate con successo!');
      setIsOratorioSettingsOpen(false);
    } catch (err) {
      console.error(err);
      setErrorStatus('Errore nel salvataggio delle impostazioni.');
    } finally {
      setSavingOratorioSettings(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'animators' | 'shifts' | 'teams' | 'absences' | 'workshops'>('animators');
  const [animators, setAnimators] = useState<Animator[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [seasonsData, setSeasonsData] = useState<{ [seasonId: string]: string[] }>({});
  const [loading, setLoading] = useState(true);

  // Active season state (persisted)
  const [activeSeason, setActiveSeason] = useState<string>(() => {
    return localStorage.getItem('oratorio_active_season') || '2026';
  });

  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const allowedTabs = portalUser?.isAdmin 
    ? ['animators', 'shifts', 'teams', 'absences', 'workshops']
    : portalUser 
      ? (portalUser.permissions?.[currentParish?.id || '']?.oratorioTabs || ['animators', 'shifts', 'teams', 'absences', 'workshops'])
      : ['animators', 'shifts', 'teams', 'absences', 'workshops'];

  useEffect(() => {
    if (allowedTabs && allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0] as 'animators' | 'shifts' | 'teams' | 'absences' | 'workshops');
    }
  }, [allowedTabs, activeTab]);

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
  const [shiftsSubTab, setShiftsSubTab] = useState<'list' | 'weekly'>('weekly');
  const [selectedWeeklyWeekId, setSelectedWeeklyWeekId] = useState<string>('');
  const [isMultiDayShift, setIsMultiDayShift] = useState(false);
  const [shiftFormSelectedDates, setShiftFormSelectedDates] = useState<string[]>([]);
  const [copiedShiftsDay, setCopiedShiftsDay] = useState<string | null>(null);
  const [onlyActiveSeasonAnimators, setOnlyActiveSeasonAnimators] = useState(true);

  // Seasons dropdown and days popup states
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const [isSeasonManagerOpen, setIsSeasonManagerOpen] = useState(false);
  const [isDaysConfigOpen, setIsDaysConfigOpen] = useState(false);
  const [isDownloadDropdownOpen, setIsDownloadDropdownOpen] = useState(false);
  const [selectedWeekId, setSelectedWeekId] = useState<string>('all');
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
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

  // State elements for present weeks selection/enrollment modal
  const [weeksModalOpen, setWeeksModalOpen] = useState(false);
  const [selectedWeeksAnimator, setSelectedWeeksAnimator] = useState<Animator | null>(null);
  const [tempPresentWeeks, setTempPresentWeeks] = useState<string[]>([]);
  const [tempIsEnrollActive, setTempIsEnrollActive] = useState<boolean>(false);

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
    animatorIds: [] as string[],
    requiredPeopleCount: '' as number | ''
  });

  const [teamForm, setTeamForm] = useState({
    name: '',
    color: '#3B82F6',
    animatorIds: [] as string[],
    kids: [] as Kid[],
    referentIds: [] as string[],
    assignments: {} as { [animatorId: string]: 'grandi' | 'piccoli' | '' }
  });
  const [newKid, setNewKid] = useState({ firstName: '', lastName: '', note: '' });

  const [absenceForm, setAbsenceForm] = useState({
    animatorId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '',
    endTime: '',
    reason: ''
  });

  const [workshopForm, setWorkshopForm] = useState({
    name: '',
    maxSubscribers: '' as number | '',
    animatorIds: [] as string[],
    referentId: '',
    weeks: [] as string[]
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

  const sortedAnimators = [...animators].sort((a, b) => {
    const lnA = (a.lastName || '').trim().toLowerCase();
    const lnB = (b.lastName || '').trim().toLowerCase();
    if (lnA !== lnB) return lnA.localeCompare(lnB, 'it');
    const fnA = (a.firstName || '').trim().toLowerCase();
    const fnB = (b.firstName || '').trim().toLowerCase();
    return fnA.localeCompare(fnB, 'it');
  });

  const activeSeasonAnimatorsList = sortedAnimators.filter(belongsToSeason);
  const filteredAnimators = sortedAnimators.filter(a => !onlyActiveSeasonAnimators || belongsToSeason(a));

  const filteredShifts = shifts.filter(s => s.season === activeSeason || (!s.season && new Date(s.date).getFullYear().toString() === activeSeason));
  const filteredTeams = teams.filter(t => t.season === activeSeason || (!t.season && (activeSeason === '2026' || activeSeason === '26')));
  const filteredAbsences = absences.filter(ab => ab.season === activeSeason || (!ab.season && (activeSeason === '2026' || activeSeason === '26')));
  const filteredWorkshops = workshops.filter(w => w.season === activeSeason);

  const activeSeasonDays = seasonsData[activeSeason] || [];

  const getWeekIdForDay = (dayStr: string): string => {
    const parts = dayStr.split('-');
    if (parts.length < 3) return '';
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
    return `${yyyy}-${mm}-${dd}`;
  };

  const isAnimatorPresentInWeek = (anim: Animator, seasonId: string, weekId: string): boolean => {
    const presentWeeksForSeason = anim.presentWeeks?.[seasonId];
    if (!presentWeeksForSeason) {
      return true;
    }
    return presentWeeksForSeason.includes(weekId);
  };

  const getAbsencesForDay = (day: string): Absence[] => {
    const weekId = getWeekIdForDay(day);
    const virtualAbsences: Absence[] = [];
    
    activeSeasonAnimatorsList.forEach(anim => {
      const isPresentInWeek = isAnimatorPresentInWeek(anim, activeSeason, weekId);
      if (!isPresentInWeek) {
        virtualAbsences.push({
          id: `virtual-week-${anim.id}-${day}`,
          animatorId: anim.id,
          date: day,
          reason: 'Assente (Settimana non selezionata)',
          season: activeSeason,
          createdAt: new Date().toISOString()
        });
      }
    });
    
    const explicitAbsences = absences.filter(ab => ab.date === day);
    const allAbsences: Absence[] = [...virtualAbsences];
    explicitAbsences.forEach(ab => {
      if (!allAbsences.some(v => v.animatorId === ab.animatorId)) {
        allAbsences.push(ab);
      }
    });
    
    return allAbsences;
  };

  const getAbsenceForAnimatorOnDay = (animId: string, day: string): Absence | undefined => {
    const dayAbsences = getAbsencesForDay(day);
    return dayAbsences.find(ab => ab.animatorId === animId);
  };

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

  // Calculate distinct list of seasons (from database config, fall back to default if totally empty)
  const allSeasons = Array.from(new Set([
    ...Object.keys(seasonsData)
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

    const unsubWorkshops = onSnapshot(query(workshopsColl, orderBy('name', 'asc')), (snap) => {
      setWorkshops(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workshop)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'oratorio_workshops'));

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
      unsubWorkshops();
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
    setShiftForm({ date: format(new Date(), 'yyyy-MM-dd'), startTime: '08:30', endTime: '17:30', activity: '', animatorIds: [], requiredPeopleCount: '' });
    setTeamForm({ name: '', color: '#3B82F6', animatorIds: [], kids: [], referentIds: [], assignments: {} });
    setAbsenceForm({ animatorId: '', date: format(new Date(), 'yyyy-MM-dd'), startTime: '', endTime: '', reason: '' });
    setWorkshopForm({ name: '', maxSubscribers: '', animatorIds: [], referentId: '', weeks: [] });
    setNewKid({ firstName: '', lastName: '', note: '' });
    setEditingId(null);
    setErrorStatus(null);
    setIsMultiDayShift(false);
    setShiftFormSelectedDates([]);
  };

  const handleOpenModal = (type: typeof activeTab, data?: any, presetData?: any) => {
    resetForms();
    if (data) {
      setEditingId(data.id);
      if (type === 'animators') setAnimatorForm({ ...data, seasons: data.seasons || [activeSeason] });
      if (type === 'shifts') {
        setShiftForm({ ...data, requiredPeopleCount: data.requiredPeopleCount !== undefined && data.requiredPeopleCount !== null ? data.requiredPeopleCount : '' });
        setShiftFormSelectedDates([data.date]);
      }
      if (type === 'teams') {
        setTeamForm({
          name: data.name || '',
          color: data.color || '#3B82F6',
          animatorIds: data.animatorIds || [],
          kids: data.kids || [],
          referentIds: data.referentIds || [],
          assignments: data.assignments || {}
        });
      }
      if (type === 'absences') setAbsenceForm({ ...data });
      if (type === 'workshops') {
        setWorkshopForm({
          name: data.name || '',
          maxSubscribers: data.maxSubscribers || '',
          animatorIds: data.animatorIds || [],
          referentId: data.referentId || '',
          weeks: data.weeks || []
        });
      }
    } else if (presetData) {
      if (type === 'shifts') {
        setShiftForm(prev => ({ ...prev, ...presetData }));
        if (presetData.date) {
          setShiftFormSelectedDates([presetData.date]);
        }
      }
    } else {
      if (type === 'shifts') {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        setShiftFormSelectedDates([todayStr]);
      }
      if (type === 'workshops') {
        const currentWeeks = getWeeks();
        setWorkshopForm({
          name: '',
          maxSubscribers: '',
          animatorIds: [],
          referentId: '',
          weeks: currentWeeks.map(w => w.id)
        });
      }
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

          // 2. Clean up animators seasons and their presentWeeks mapping
          const animatorsToUpdate = animators.filter(a => a.seasons?.includes(seasonId));
          console.log(`[Season delete] Updating ${animatorsToUpdate.length} animators`);
          await Promise.all(
            animatorsToUpdate.map(async (a) => {
              try {
                const nextSeasons = (a.seasons || []).filter(s => s !== seasonId);
                const nextPresentWeeks = { ...(a.presentWeeks || {}) };
                if (seasonId in nextPresentWeeks) {
                  delete nextPresentWeeks[seasonId];
                }
                await updateDoc(doc(animatorsColl, a.id), { 
                  seasons: nextSeasons,
                  presentWeeks: nextPresentWeeks
                });
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
        const chosenLogoUrl = parishInfo.oratorioLogoUrl || parishInfo.logoUrl;
        if (chosenLogoUrl) {
          try {
            pdf.addImage(chosenLogoUrl, 'PNG', margin, 6, 20, 20);
          } catch (e) {
            pdf.setDrawColor(30, 58, 138);
            pdf.circle(margin + 10, 16, 10, 'S');
          }
        }

        const textStartX = chosenLogoUrl ? 38 : margin;

        // Blue Info Box at Top Right
        const boxWidth = 95;
        const boxHeight = 22;
        const boxX = pageWidth - margin - boxWidth;
        const boxY = 5;

        // Auto-fit function to prevent overlap
        const maxWidth = boxX - textStartX - 5;
        const drawTextFit = (text: string, x: number, y: number, bSize: number, fontStyle: string = 'normal') => {
          pdf.setFont('helvetica', fontStyle);
          pdf.setFontSize(bSize);
          let currentSize = bSize;
          while (pdf.getTextWidth(text) > maxWidth && currentSize > 6) {
            currentSize -= 0.5;
            pdf.setFontSize(currentSize);
          }
          pdf.text(text, x, y);
        };

        // Parish Info Header
        pdf.setTextColor(51, 65, 85);
        drawTextFit(`${parishInfo.oratorioName || parishInfo.name || 'Oratorio Feriale'} - ${activeSeason}`, textStartX, 10, 11, 'bold');
        
        pdf.setTextColor(100, 116, 139);

        let hRowY = 15;
        if (parishInfo.diocese) {
          drawTextFit(parishInfo.diocese, textStartX, hRowY, 8.5);
          hRowY += 4;
        }
        if (parishInfo.pastoralCommunity) {
          drawTextFit(parishInfo.pastoralCommunity, textStartX, hRowY, 8.5);
          hRowY += 4;
        }
        if (parishInfo.address) {
          drawTextFit(parishInfo.address, textStartX, hRowY, 8.5);
          hRowY += 4;
        }
        if (parishInfo.phone || parishInfo.email) {
          const contacts: string[] = [];
          if (parishInfo.phone) contacts.push(`Tel: ${parishInfo.phone}`);
          if (parishInfo.email) contacts.push(`Email: ${parishInfo.email}`);
          drawTextFit(contacts.join(' - '), textStartX, hRowY, 8.5);
        }

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
          const matchingAbs = getAbsenceForAnimatorOnDay(anim.id, targetDay);
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
            const matchingAbs = getAbsenceForAnimatorOnDay(anim.id, day);
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
            const matchingAbs = getAbsenceForAnimatorOnDay(anim.id, day);
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
        const chosenLogoUrl = parishInfo.oratorioLogoUrl || parishInfo.logoUrl;
        if (chosenLogoUrl) {
          try {
            pdf.addImage(chosenLogoUrl, 'PNG', margin, 6, 20, 20);
          } catch (e) {
            pdf.setDrawColor(30, 58, 138);
            pdf.circle(margin + 10, 16, 10, 'S');
          }
        }

        const textStartX = chosenLogoUrl ? 38 : margin;

        // Blue Info Box at Top Right
        const boxWidth = 92;
        const boxHeight = 22;
        const boxX = pageWidth - margin - boxWidth;
        const boxY = 5;

        // Auto-fit function inside drawHeader to prevent overlap
        const maxWidth = boxX - textStartX - 5;
        const drawTextFit = (text: string, x: number, y: number, bSize: number, fontStyle: string = 'normal') => {
          pdf.setFont('helvetica', fontStyle);
          pdf.setFontSize(bSize);
          let currentSize = bSize;
          while (pdf.getTextWidth(text) > maxWidth && currentSize > 6) {
            currentSize -= 0.5;
            pdf.setFontSize(currentSize);
          }
          pdf.text(text, x, y);
        };

        // Parish Info Header
        pdf.setTextColor(51, 65, 85);
        drawTextFit(`${parishInfo.oratorioName || parishInfo.name || 'Oratorio Feriale'} - ${activeSeason}`, textStartX, 10, 10.5, 'bold');
        
        pdf.setTextColor(100, 116, 139);

        let hRowY = 14;
        if (parishInfo.diocese) {
          drawTextFit(parishInfo.diocese, textStartX, hRowY, 8);
          hRowY += 3.5;
        }
        if (parishInfo.pastoralCommunity) {
          drawTextFit(parishInfo.pastoralCommunity, textStartX, hRowY, 8);
          hRowY += 3.5;
        }
        if (parishInfo.address) {
          drawTextFit(parishInfo.address, textStartX, hRowY, 8);
          hRowY += 3.5;
        }

        if (parishInfo.phone || parishInfo.email) {
          const contacts: string[] = [];
          if (parishInfo.phone) contacts.push(`Tel: ${parishInfo.phone}`);
          if (parishInfo.email) contacts.push(`Email: ${parishInfo.email}`);
          drawTextFit(contacts.join(' - '), textStartX, hRowY, 8);
        }

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
          const isAbsent = getAbsenceForAnimatorOnDay(aid, targetDay);
          if (!isAbsent) {
            const isRef = t.referentIds?.includes(aid);
            const assign = t.assignments?.[aid] ? `(${t.assignments[aid].toUpperCase()})` : '';
            const refLabel = isRef ? '⭐ [REFERENTE]' : '';
            const fullNameAndDetail = `${anim.lastName.toUpperCase()} ${anim.firstName} ${refLabel} ${assign}`.trim().replace(/\s+/g, ' ');
            presentRows.push([
              t.name.toUpperCase(),
              fullNameAndDetail,
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
          const isAbsent = getAbsenceForAnimatorOnDay(aid, targetDay);
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
        const chosenLogoUrl = parishInfo.oratorioLogoUrl || parishInfo.logoUrl;
        if (chosenLogoUrl) {
          try {
            pdf.addImage(chosenLogoUrl, 'PNG', margin, 6, 20, 20);
          } catch (e) {
            pdf.setDrawColor(30, 58, 138);
            pdf.circle(margin + 10, 16, 10, 'S');
          }
        }

        const textStartX = chosenLogoUrl ? 38 : margin;

        // Blue Info Box at Top Right
        const boxWidth = 92;
        const boxHeight = 22;
        const boxX = pageWidth - margin - boxWidth;
        const boxY = 5;

        // Auto-fit function inside drawHeader to prevent overlap
        const maxWidth = boxX - textStartX - 5;
        const drawTextFit = (text: string, x: number, y: number, bSize: number, fontStyle: string = 'normal') => {
          pdf.setFont('helvetica', fontStyle);
          pdf.setFontSize(bSize);
          let currentSize = bSize;
          while (pdf.getTextWidth(text) > maxWidth && currentSize > 6) {
            currentSize -= 0.5;
            pdf.setFontSize(currentSize);
          }
          pdf.text(text, x, y);
        };

        // Parish Info Header
        pdf.setTextColor(51, 65, 85);
        drawTextFit(`${parishInfo.oratorioName || parishInfo.name || 'Oratorio Feriale'} - ${activeSeason}`, textStartX, 10, 11, 'bold');
        
        pdf.setTextColor(100, 116, 139);

        let hRowY = 14;
        if (parishInfo.diocese) {
          drawTextFit(parishInfo.diocese, textStartX, hRowY, 8);
          hRowY += 3.5;
        }
        if (parishInfo.pastoralCommunity) {
          drawTextFit(parishInfo.pastoralCommunity, textStartX, hRowY, 8);
          hRowY += 3.5;
        }
        if (parishInfo.address) {
          drawTextFit(parishInfo.address, textStartX, hRowY, 8);
          hRowY += 3.5;
        }

        if (parishInfo.phone || parishInfo.email) {
          const contacts: string[] = [];
          if (parishInfo.phone) contacts.push(`Tel: ${parishInfo.phone}`);
          if (parishInfo.email) contacts.push(`Email: ${parishInfo.email}`);
          drawTextFit(contacts.join(' - '), textStartX, hRowY, 8);
        }

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
            const ab = getAbsenceForAnimatorOnDay(aid, day);
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
            const ab = getAbsenceForAnimatorOnDay(aid, day);
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

  const generateWeeklyShiftsPDF = () => {
    try {
      const currentWeeklyWeek = weeks.find(w => w.id === selectedWeeklyWeekId) || weeks[0];
      const daysToPrint = currentWeeklyWeek ? currentWeeklyWeek.days : [];

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
        const chosenLogoUrl = parishInfo.oratorioLogoUrl || parishInfo.logoUrl;
        if (chosenLogoUrl) {
          try {
            pdf.addImage(chosenLogoUrl, 'PNG', margin, 6, 20, 20);
          } catch (e) {
            pdf.setDrawColor(30, 58, 138);
            pdf.circle(margin + 10, 16, 10, 'S');
          }
        }

        const textStartX = chosenLogoUrl ? 38 : margin;

        // Blue Info Box at Top Right
        const boxWidth = 92;
        const boxHeight = 22;
        const boxX = pageWidth - margin - boxWidth;
        const boxY = 5;

        // Auto-fit function inside drawHeader to prevent overlap
        const maxWidth = boxX - textStartX - 5;
        const drawTextFit = (text: string, x: number, y: number, bSize: number, fontStyle: string = 'normal') => {
          pdf.setFont('helvetica', fontStyle);
          pdf.setFontSize(bSize);
          let currentSize = bSize;
          while (pdf.getTextWidth(text) > maxWidth && currentSize > 6) {
            currentSize -= 0.5;
            pdf.setFontSize(currentSize);
          }
          pdf.text(text, x, y);
        };

        // Parish Info Header
        pdf.setTextColor(51, 65, 85);
        drawTextFit(`${parishInfo.oratorioName || parishInfo.name || 'Oratorio Feriale'} - ${activeSeason}`, textStartX, 10, 11, 'bold');
        
        pdf.setTextColor(100, 116, 139);

        let hRowY = 14;
        if (parishInfo.diocese) {
          drawTextFit(parishInfo.diocese, textStartX, hRowY, 8);
          hRowY += 3.5;
        }
        if (parishInfo.pastoralCommunity) {
          drawTextFit(parishInfo.pastoralCommunity, textStartX, hRowY, 8);
          hRowY += 3.5;
        }
        if (parishInfo.address) {
          drawTextFit(parishInfo.address, textStartX, hRowY, 8);
          hRowY += 3.5;
        }

        if (parishInfo.phone || parishInfo.email) {
          const contacts: string[] = [];
          if (parishInfo.phone) contacts.push(`Tel: ${parishInfo.phone}`);
          if (parishInfo.email) contacts.push(`Email: ${parishInfo.email}`);
          drawTextFit(contacts.join(' - '), textStartX, hRowY, 8);
        }

        pdf.setFillColor(blueColor[0], blueColor[1], blueColor[2]);
        pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'F');

        // Status / Title inside info box
        pdf.setFontSize(8.5);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text(titleName, boxX + boxWidth / 2, boxY + 6, { align: 'center' });
        
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        const weekLabel = currentWeeklyWeek ? currentWeeklyWeek.label : '';
        pdf.text(`Riferimento: ${weekLabel}`, boxX + boxWidth / 2, boxY + 11.5, { align: 'center' });
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.text(`Stagione: ${activeSeason}`, boxX + boxWidth / 2, boxY + 17, { align: 'center' });

        // Bottom Decorative Line
        pdf.setDrawColor(blueColor[0], blueColor[1], blueColor[2]);
        pdf.setLineWidth(0.6);
        pdf.line(0, 32, pageWidth, 32);
      };

      drawHeader(doc, 'TABELLA SETTIMANALE TURNI');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text('PROGRAMMAZIONE SETTIMANALE DEI TURNI A GRIGLIA', margin, 42);

      // We have columns for each day of ferial selected week:
      const colHeaders = daysToPrint.map(dayStr => {
        const parts = dayStr.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
        const dayLabelName = format(d, 'eeee', { locale: it }).toUpperCase();
        const dayLabelDate = format(d, 'dd/MM/yyyy', { locale: it });
        return `${dayLabelName}\n${dayLabelDate}`;
      });

      // Let's index shifts by day
      const shiftsByDay: { [key: string]: any[] } = {};
      daysToPrint.forEach(dayStr => {
        shiftsByDay[dayStr] = [...filteredShifts]
          .filter(s => s.date === dayStr)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
      });

      const maxShifts = Math.max(...daysToPrint.map(dayStr => shiftsByDay[dayStr].length));

      const rows: any[] = [];
      if (maxShifts > 0) {
        for (let r = 0; r < maxShifts; r++) {
          const rowData = daysToPrint.map(dayStr => {
            const shift = shiftsByDay[dayStr][r];
            if (!shift) return '';

            const animList = shift.animatorIds.map(aid => {
              const a = animators.find(anim => anim.id === aid);
              return a ? `- ${a.lastName} ${a.firstName[0]}.` : '';
            }).filter(Boolean).join('\n');

            const reqText = shift.requiredPeopleCount ? ` (Copertura: ${shift.animatorIds.length}/${shift.requiredPeopleCount})` : '';

            return `SERVIZIO: ${shift.activity.toUpperCase()}\nOrario: ${shift.startTime} - ${shift.endTime}${reqText}\nAnimatori:\n${animList || 'Nessun assegnato'}`;
          });
          rows.push(rowData);
        }
      } else {
        rows.push(daysToPrint.map(() => 'Nessun turno programmato'));
      }

      autoTable(doc, {
        startY: 46,
        head: [colHeaders],
        body: rows,
        theme: 'grid',
        styles: { 
          fontSize: 7.5, 
          cellPadding: 4, 
          font: 'helvetica', 
          valign: 'top', 
          halign: 'left',
          overflow: 'linebreak'
        },
        headStyles: { 
          fillColor: [37, 99, 235], 
          textColor: [255, 255, 255], 
          fontStyle: 'bold',
          halign: 'center'
        },
        alternateRowStyles: { 
          fillColor: [248, 250, 252] 
        },
        columnStyles: daysToPrint.reduce((acc, _, index) => {
          acc[index] = { cellWidth: (pageWidth - (margin * 2)) / daysToPrint.length };
          return acc;
        }, {} as any),
        willDrawCell: (data) => {
          if (data.section === 'body' && data.cell.raw) {
            data.cell.text = [];
          }
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.cell.raw) {
            const rawText = data.cell.raw as string;
            if (!rawText || rawText === 'Nessun turno programmato') {
              const doc = data.doc;
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(7.5);
              doc.setTextColor(148, 163, 184);
              const padding = data.cell.styles.cellPadding as number || 4;
              doc.text(rawText || 'Nessun turno', data.cell.x + padding, data.cell.y + padding + 3);
              return;
            }

            const doc = data.doc;
            const padding = data.cell.styles.cellPadding as number || 4;
            const cellWidth = data.cell.width - (padding * 2);
            const startX = data.cell.x + padding;
            let startY = data.cell.y + padding + 3;

            const paragraphs = rawText.split('\n');

            paragraphs.forEach(p => {
              if (p.startsWith('SERVIZIO:')) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                
                const serviceName = p.replace('SERVIZIO:', '').trim();
                
                // Draw a beautiful subtle background strip for the service header
                doc.setFillColor(239, 246, 255); // soft blue-50 instead of grey
                doc.rect(data.cell.x + 1, data.cell.y + 1, data.cell.width - 2, 8, 'F');
                
                doc.setDrawColor(191, 219, 254); // blue-200 border for separation
                doc.rect(data.cell.x + 1, data.cell.y + 1, data.cell.width - 2, 8, 'S');

                doc.setTextColor(29, 78, 216); // blue-700
                doc.text(serviceName, startX, data.cell.y + 6.2, { maxWidth: cellWidth });
                
                startY = data.cell.y + 13;
              } else if (p.startsWith('Orario:')) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(71, 85, 105);
                doc.text(p, startX, startY, { maxWidth: cellWidth });
                startY += 4.5;
              } else if (p.startsWith('Animatori:')) {
                startY += 1;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(100, 116, 139);
                doc.text(p.toUpperCase(), startX, startY, { maxWidth: cellWidth });
                startY += 3.5;
              } else if (p.trim().length > 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(15, 23, 42);
                doc.text(p, startX, startY, { maxWidth: cellWidth });
                startY += 3.5;
              }
            });
          }
        }
      });

      setSuccessStatus('Download completato!');
      setTimeout(() => setSuccessStatus(null), 2000);

      const weekFilename = currentWeeklyWeek ? currentWeeklyWeek.id : 'settimana';
      doc.save(`Griglia_Turni_Settimanale_${activeSeason}_${weekFilename}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setErrorStatus('Impossibile generare la griglia settimanale dei turni.');
    }
  };

  const generateSingleTeamPDF = (team: Team) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      const ferialeName = `${parishInfo.oratorioName || parishInfo.name || 'Oratorio Feriale'} - ${activeSeason}`;
      const seasonText = `Stagione Feriale ${activeSeason}`;
      const targetWeekId = selectedWeekId !== 'all' ? selectedWeekId : getWeekIdForDay(activeRecapDay);
      const targetWeekObj = weeks.find(w => w.id === targetWeekId);
      const weekLabel = targetWeekObj?.label || `Settimana del ${format(new Date(targetWeekId), 'dd/MM/yyyy', { locale: it })}`;

      // Header Banner - Elegant Light layout with Team Accent Color top-bar
      const teamColorHex = team.color || '#334155';
      const r_accent = parseInt(teamColorHex.slice(1, 3), 16) || 51;
      const g_accent = parseInt(teamColorHex.slice(3, 5), 16) || 65;
      const b_accent = parseInt(teamColorHex.slice(5, 7), 16) || 85;

      // 1. Team accent line
      doc.setFillColor(r_accent, g_accent, b_accent);
      doc.rect(0, 0, pageWidth, 5, 'F');

      let headerY = 13;

      // 2. Parish Logo on top-left if it exists
      let textStartX = margin;
      const chosenLogoUrl = parishInfo.oratorioLogoUrl || parishInfo.logoUrl;
      if (chosenLogoUrl) {
        try {
          doc.addImage(chosenLogoUrl, 'PNG', margin, headerY - 4, 18, 18);
          textStartX += 22;
        } catch (e) {
          // Fallback if image load fails
        }
      }

      // 4. Right Side: Reference Period Card (Declared early to calculate maxWidth)
      const cardWidth = 72;
      const cardHeight = 18;
      const cardX = pageWidth - margin - cardWidth;
      const cardY = headerY - 4;

      // Auto-fit function to prevent overlap
      const maxWidth = cardX - textStartX - 5;
      const drawTextFit = (text: string, x: number, y: number, bSize: number, fontStyle: string = 'normal') => {
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(bSize);
        let currentSize = bSize;
        while (doc.getTextWidth(text) > maxWidth && currentSize > 6) {
          currentSize -= 0.5;
          doc.setFontSize(currentSize);
        }
        doc.text(text, x, y);
      };

      // 3. Left Side Title details (using auto-fit to avoid collision)
      doc.setTextColor(148, 163, 184); // Slate-400
      drawTextFit(ferialeName.toUpperCase(), textStartX, headerY, 8.5, 'bold');

      doc.setTextColor(30, 41, 59); // Slate-800
      drawTextFit(team.name.toUpperCase(), textStartX, headerY + 8, 19, 'bold');

      doc.setFillColor(248, 250, 252); // Slate-50 background
      doc.setDrawColor(226, 232, 240); // Slate-200 border
      doc.setLineWidth(0.3);
      doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

      // Card Content
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // Slate-400
      doc.text('RIFERIMENTO SETTIMANALE', cardX + 4, cardY + 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(r_accent, g_accent, b_accent); // Brand accent
      doc.text(weekLabel.toUpperCase(), cardX + 4, cardY + 10);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text(`${seasonText} • Generato: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: it })}`, cardX + 4, cardY + 14.5);

      // Clean horizontal divider line under header
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.4);
      doc.line(margin, headerY + 18, pageWidth - margin, headerY + 18);

      let currentY = headerY + 26;

      // ANIMATORI SECTION TITLE
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text("ANIMATORI DELLA SQUADRA", margin, currentY);
      currentY += 5;

      const teamAnimators = team.animatorIds.map(aid => animators.find(a => a.id === aid)).filter(Boolean) as Animator[];
      const animatorsForWeek = teamAnimators.filter(anim => isAnimatorPresentInWeek(anim, activeSeason, targetWeekId));
      const animatorsNotScheduledForWeek = teamAnimators.filter(anim => !isAnimatorPresentInWeek(anim, activeSeason, targetWeekId));

      const animatorsRows: any[] = [];
      
      // Active animators
      animatorsForWeek.forEach(anim => {
        const isRef = team.referentIds?.includes(anim.id);
        const assign = team.assignments?.[anim.id] ? team.assignments[anim.id].toUpperCase() : '-';
        const roleStr = isRef ? '⭐ REFERENTE SQUADRA' : 'Animatore';
        animatorsRows.push([
          `${anim.lastName.toUpperCase()} ${anim.firstName}`,
          roleStr,
          assign,
          'CONFERMATO / PRESENTE IN SETTIMANA'
        ]);
      });

      // Non-active animators
      animatorsNotScheduledForWeek.forEach(anim => {
        const isRef = team.referentIds?.includes(anim.id);
        const assign = team.assignments?.[anim.id] ? team.assignments[anim.id].toUpperCase() : '-';
        const roleStr = isRef ? '⭐ REFERENTE SQUADRA' : 'Animatore';
        animatorsRows.push([
          `${anim.lastName.toUpperCase()} ${anim.firstName}`,
          roleStr,
          assign,
          'NON SEGNATO / ASSENTE QUESTA SETTIMANA'
        ]);
      });

      if (animatorsRows.length === 0) {
        animatorsRows.push(['-', 'Nessun animatore associato', '-', '-']);
      }

      autoTable(doc, {
        startY: currentY,
        head: [['NOME E COGNOME', 'RUOLO', 'ASSEGNAZIONE', 'STATO SETTIMANA']],
        body: animatorsRows,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3.5, font: 'helvetica' },
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 55 },
          1: { cellWidth: 45 },
          2: { cellWidth: 35 },
          3: { cellWidth: 47 }
        },
        didParseCell: (data) => {
          if (data.row.index >= 0 && data.cell.section === 'body') {
            const statusText = data.row.cells[3].text[0];
            if (statusText && statusText.includes('NON SEGNATO')) {
              data.cell.styles.textColor = [120, 113, 108]; // Slate-500/stone style
              data.cell.styles.fillColor = [250, 250, 249];
            }
          }
        }
      });

      // Always start the kids' grid on the second page for clean page breaks
      doc.addPage();
      
      // Draw top decoration line on page 2
      doc.setFillColor(r_accent, g_accent, b_accent);
      doc.rect(0, 0, pageWidth, 5, 'F');
      
      currentY = 16;
      
      // Draw Page 2 header matching team style for extreme polish
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`${ferialeName.toUpperCase()}`, margin, currentY);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text(`SQUADRA: ${team.name.toUpperCase()}`, margin, currentY + 7);
      
      currentY += 18;

      // RAGAZZI SECTION TITLE
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text(`ELENCO RAGAZZI SQUADRA (${team.kids?.length || 0})`, margin, currentY);
      currentY += 5;

      const sortedKids = [...(team.kids || [])].sort((a, b) => {
        const comp = (a.lastName || '').localeCompare(b.lastName || '', 'it', { sensitivity: 'base' });
        if (comp !== 0) return comp;
        return (a.firstName || '').localeCompare(b.firstName || '', 'it', { sensitivity: 'base' });
      });

      const kidsRows = sortedKids.map((k, kIdx) => [
        (kIdx + 1).toString(),
        k.lastName.toUpperCase(),
        k.firstName.toUpperCase(),
        k.note || '-'
      ]);

      if (kidsRows.length === 0) {
        kidsRows.push(['-', 'Nessun ragazzo iscritto a questa squadra', '-', '-']);
      }

      autoTable(doc, {
        startY: currentY,
        head: [['N.', 'COGNOME', 'NOME', 'NOTE']],
        body: kidsRows,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3.5, font: 'helvetica' },
        headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [243, 244, 246] },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { fontStyle: 'bold', cellWidth: 50 },
          2: { cellWidth: 50 },
          3: { cellWidth: 72 }
        }
      });

      setSuccessStatus(`Scheda ${team.name} scaricata!`);
      setTimeout(() => setSuccessStatus(null), 2000);

      const fName = `${team.name.replace(/\s+/g, '_')}_Scheda_Feriale_${activeSeason}.pdf`;
      doc.save(fName);
    } catch (err) {
      console.error('Single Team PDF Generation Error:', err);
      setErrorStatus('Impossibile scaricare la scheda della squadra.');
    }
  };

  const getAbsenceMeta = (ab?: Absence) => {
    if (!ab) return null;
    const s = ab.startTime || '';
    const e = ab.endTime || '';
    const r = ab.reason || '';

    if (r.includes('Settimana non selezionata')) {
      return {
        label: '(NI)',
        tooltip: 'Non iscritto in questa settimana feriale (NI)',
        className: 'bg-red-500 text-white ring-2 ring-red-100 font-extrabold text-[8px]'
      };
    }

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
        className: 'bg-sky-500 text-white ring-2 ring-sky-100'
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
    if (!animators.some(a => a.id === anim.id)) {
      setErrorStatus("Impossibile aggiornare: l'animatore non esiste più.");
      return;
    }
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
      console.warn('Could not update animator enrollment status', err);
      setErrorStatus("Errore nell'aggiornamento.");
    }
  };

  const handleSaveWeeks = async () => {
    if (!selectedWeeksAnimator) return;
    if (!animators.some(a => a.id === selectedWeeksAnimator.id)) {
      setErrorStatus("Impossibile salvare: l'animatore non esiste più.");
      setSelectedWeeksAnimator(null);
      setWeeksModalOpen(false);
      return;
    }
    setIsSaving(true);
    setErrorStatus(null);
    try {
      const currentSeasons = selectedWeeksAnimator.seasons || [];
      let nextSeasons = [...currentSeasons];
      
      if (tempIsEnrollActive) {
        if (!nextSeasons.includes(activeSeason)) {
          nextSeasons.push(activeSeason);
        }
      } else {
        nextSeasons = nextSeasons.filter(s => s !== activeSeason);
      }
      
      const currentPresentWeeks = selectedWeeksAnimator.presentWeeks || {};
      const nextPresentWeeks = {
        ...currentPresentWeeks,
        [activeSeason]: tempPresentWeeks
      };
      
      await updateDoc(doc(animatorsColl, selectedWeeksAnimator.id), {
        seasons: nextSeasons,
        presentWeeks: nextPresentWeeks
      });
      
      setWeeksModalOpen(false);
      setSelectedWeeksAnimator(null);
      setSuccessStatus('Presenze settimanali salvate con successo!');
      setTimeout(() => setSuccessStatus(null), 2000);
    } catch (err) {
      console.warn('Could not save animator present weeks', err);
      setErrorStatus('Errore nel salvataggio delle presenze.');
    } finally {
      setIsSaving(false);
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
        const reqCount = shiftForm.requiredPeopleCount === '' ? 0 : Number(shiftForm.requiredPeopleCount);
        payload = { ...shiftForm, requiredPeopleCount: reqCount, season: activeSeason };
      } else if (activeTab === 'teams') {
        coll = teamsColl;
        payload = { ...teamForm, season: activeSeason };
      } else if (activeTab === 'absences') {
        coll = absencesColl;
        payload = { ...absenceForm, season: activeSeason };
      } else {
        coll = workshopsColl;
        const maxSub = workshopForm.maxSubscribers === '' ? 0 : Number(workshopForm.maxSubscribers);
        payload = { ...workshopForm, maxSubscribers: maxSub, season: activeSeason };
      }

      if (activeTab === 'shifts' && !editingId && isMultiDayShift) {
        if (shiftFormSelectedDates.length === 0) {
          throw new Error("Seleziona almeno una giornata!");
        }
        const reqCount = shiftForm.requiredPeopleCount === '' ? 0 : Number(shiftForm.requiredPeopleCount);
        
        // Loop over selected dates and save independent Shift docs with blank animator list and copy details
        for (const targetDate of shiftFormSelectedDates) {
          const multiPayload = {
            ...shiftForm,
            date: targetDate,
            requiredPeopleCount: reqCount,
            season: activeSeason,
            createdAt: new Date().toISOString()
          };
          await addDoc(shiftsColl, multiPayload);
        }
      } else {
        if (editingId) {
          // Robust checking before updateDoc to prevent No Document To Update errors
          let exists = false;
          if (activeTab === 'animators') {
            exists = animators.some(a => a.id === editingId);
          } else if (activeTab === 'shifts') {
            exists = shifts.some(s => s.id === editingId);
          } else if (activeTab === 'teams') {
            exists = teams.some(t => t.id === editingId);
          } else if (activeTab === 'absences') {
            exists = absences.some(ab => ab.id === editingId);
          } else if (activeTab === 'workshops') {
            exists = workshops.some(w => w.id === editingId);
          }

          if (!exists) {
            throw new Error("L'elemento selezionato non esiste più o è stato rimosso.");
          }

          await updateDoc(doc(coll, editingId), { ...payload, updatedAt: new Date().toISOString() });
        } else {
          await addDoc(coll, { ...payload, createdAt: new Date().toISOString() });
        }
      }

      setSuccessStatus('Salvataggio completato!');
      setTimeout(() => setSuccessStatus(null), 3000);
      setIsModalOpen(false);
      resetForms();
    } catch (error: any) {
      console.warn('Save error:', error);
      setErrorStatus(error.message || 'Errore durante il salvataggio.');
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

  if (portalUser && !portalUser.isAdmin && allowedTabs.length === 0) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-slate-400 space-y-4 px-6 text-center py-24 bg-white rounded-[3rem] border border-slate-100 shadow-sm">
        <div className="w-16 h-16 bg-orange-50 border border-orange-100 rounded-2xl flex items-center justify-center text-orange-500 shadow-inner">
          <AlertCircle size={32} />
        </div>
        <p className="font-bold uppercase tracking-widest text-[10px] text-slate-500">Accesso Limitato</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Non sei abilitato a nessuna delle sezioni di questa pagina. Contatta l'amministratore per abilitare i tuoi accessi granulari per l'Oratorio Feriale.
        </p>
      </div>
    );
  }

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
        <div className="flex items-center gap-2">
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

          <button
            onClick={() => setIsOratorioSettingsOpen(true)}
            className="p-2.5 bg-white border border-slate-150 text-slate-600 hover:text-orange-600 hover:border-orange-200 rounded-full shadow-sm transition-all hover:shadow focus:ring-2 focus:ring-blue-500"
            title="Configura Logo e Nome Oratorio Feriale"
          >
            <Sun size={14} className="text-orange-500 hover:rotate-45 transition-transform" />
          </button>
        </div>

        {activeTab !== 'animators' && (
          <button
            onClick={() => handleOpenModal(activeTab)}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-full font-black uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 text-[11px] self-start md:self-auto"
          >
            <Plus size={20} />
            Aggiungi {activeTab === 'shifts' ? 'Turno' : activeTab === 'teams' ? 'Squadra' : activeTab === 'absences' ? 'Assenza' : 'Laboratorio'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 overflow-x-auto pb-2 custom-scrollbar">
        {allowedTabs.includes('animators') && <TabItem id="animators" label="Animatori" icon={Users} />}
        {allowedTabs.includes('shifts') && <TabItem id="shifts" label="Turni" icon={Clock} />}
        {allowedTabs.includes('teams') && <TabItem id="teams" label="Squadre" icon={Trophy} />}
        {allowedTabs.includes('absences') && <TabItem id="absences" label="Assenze" icon={UserX} />}
        {allowedTabs.includes('workshops') && <TabItem id="workshops" label="Laboratori" icon={BookOpen} />}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {errorStatus && (
          <div className="space-y-2">
            <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-800 text-xs font-bold animate-in fade-in duration-300">
              <AlertCircle size={16} className="text-red-500 shrink-0 cursor-pointer" onClick={() => setErrorStatus(null)} />
              <span>{errorStatus}</span>
            </div>
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
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Cognome</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Nome</th>
                      <th className="px-8 py-5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Iscritto {activeSeason}</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Telefono</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Note</th>
                      <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {/* Quick row insertion */}
                    <tr className="bg-blue-50/5 group">
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          value={animatorForm.lastName} 
                          onChange={e => setAnimatorForm({...animatorForm, lastName: e.target.value})} 
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold shadow-sm" 
                          placeholder="Nuovo Cognome..."
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input 
                          type="text" 
                          value={animatorForm.firstName} 
                          onChange={e => setAnimatorForm({...animatorForm, firstName: e.target.value})} 
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold shadow-sm" 
                          placeholder="Nuovo Nome..."
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
                                  value={editingAnimatorForm.lastName}
                                  onChange={e => setEditingAnimatorForm({...editingAnimatorForm, lastName: e.target.value})}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold shadow-sm"
                                />
                              </td>
                              <td className="px-6 py-3">
                                <input 
                                  type="text"
                                  value={editingAnimatorForm.firstName}
                                  onChange={e => setEditingAnimatorForm({...editingAnimatorForm, firstName: e.target.value})}
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
                                      if (!animators.some(o => o.id === a.id)) {
                                        setErrorStatus("Impossibile salvare: l'animatore non esiste più.");
                                        setEditingAnimatorId(null);
                                        return;
                                      }
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
                                        console.warn('Could not save inline edited animator', err);
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
                                <span className="text-xs font-black text-slate-900 italic uppercase">{a.lastName}</span>
                              </td>
                              <td className="px-8 py-4">
                                <span className="text-xs font-bold text-slate-700 italic uppercase">{a.firstName}</span>
                              </td>
                              <td className="px-8 py-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedWeeksAnimator(a);
                                    setTempIsEnrollActive(registered);
                                    setTempPresentWeeks(a.presentWeeks?.[activeSeason] || weeks.map(w => w.id));
                                    setWeeksModalOpen(true);
                                  }}
                                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${
                                    registered 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                      : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                                  }`}
                                  title="Gestisci iscrizione e settimane di presenza per questa stagione"
                                >
                                  {registered ? 'ISCRITTO' : 'INATTIVO'}
                                </button>
                                {registered && (
                                  <span className="block text-[8px] font-bold text-slate-405 uppercase tracking-widest mt-1">
                                    {(() => {
                                      const totalWeeksCount = weeks.length;
                                      const animWeeksSelected = a.presentWeeks?.[activeSeason]?.length ?? totalWeeksCount;
                                      return `${animWeeksSelected}/${totalWeeksCount} SETT.`;
                                    })()}
                                  </span>
                                )}
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
        {activeTab === 'shifts' && (() => {
          const currentWeeklyWeek = weeks.find(w => w.id === selectedWeeklyWeekId) || weeks[0];
          const weeklyDays = currentWeeklyWeek ? currentWeeklyWeek.days : [];
          
          return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Sub-navigation & Actions Bar - HIGHER CONTRAST & RESPONSIVE DESIGN */}
              <div className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                {/* Segmented Controls for Sub-tabs */}
                <div className="flex bg-slate-100 p-1 rounded-2xl w-full lg:w-auto shadow-inner border border-slate-200">
                  <button
                    onClick={() => setShiftsSubTab('weekly')}
                    className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                      shiftsSubTab === 'weekly'
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-950 bg-transparent hover:bg-slate-200/50'
                    }`}
                  >
                    <Calendar size={13} />
                    Visione Settimanale
                  </button>
                  <button
                    onClick={() => setShiftsSubTab('list')}
                    className={`flex-1 lg:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                      shiftsSubTab === 'list'
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-950 bg-transparent hover:bg-slate-200/50'
                    }`}
                  >
                    <List size={13} />
                    Lista Semplice
                  </button>
                </div>

                {/* Week Selector (rendered only for weekly view) */}
                {shiftsSubTab === 'weekly' && weeks.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest self-center text-center sm:text-left">Settimana Attiva:</span>
                    <div className="relative flex-1 sm:flex-none">
                      <select
                        value={selectedWeeklyWeekId || (weeks[0]?.id || '')}
                        onChange={(e) => setSelectedWeeklyWeekId(e.target.value)}
                        className="w-full sm:w-auto pl-5 pr-10 py-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-250 outline-none font-black text-xs text-slate-900 uppercase tracking-wider appearance-none cursor-pointer transition-colors shadow-sm"
                      >
                        {weeks.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-600">
                        <ChevronDown size={14} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions & Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
                  {shiftsSubTab === 'weekly' && weeks.length > 0 && (
                    <button
                      onClick={generateWeeklyShiftsPDF}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-850 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md hover:shadow-lg active:scale-95"
                      title="Scarica la programmazione dei turni settimanali a griglia in formato PDF"
                    >
                      <Download size={14} strokeWidth={3} />
                      Scarica Griglia
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenModal('shifts')}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3.5 bg-blue-700 hover:bg-blue-800 text-white border border-blue-850 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md hover:shadow-lg active:scale-95"
                  >
                    <Plus size={14} strokeWidth={3} />
                    Nuovo Turno
                  </button>
                </div>
              </div>

              {/* Clipboard Info Bar (when structure is copied) */}
              {copiedShiftsDay && (
                <div className="bg-indigo-50 border border-indigo-150 p-4 rounded-[2rem] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 text-white p-3 rounded-2xl">
                      <Copy size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-indigo-950 uppercase italic leading-none">
                        Struttura Turni Copiata!
                      </p>
                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1">
                        Copiati i turni di: {format(new Date(copiedShiftsDay), 'eeee dd MMMM', { locale: it })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {shiftsSubTab === 'weekly' && weeks.length > 0 && (
                      <button
                        onClick={async () => {
                          const sourceShifts = filteredShifts.filter(s => s.date === copiedShiftsDay);
                          if (sourceShifts.length === 0) {
                            setErrorStatus("Nessun turno trovato nel giorno copiato!");
                            setTimeout(() => setErrorStatus(null), 2500);
                            return;
                          }
                          
                          const targetDays = weeklyDays.filter(d => d !== copiedShiftsDay);
                          if (targetDays.length === 0) return;

                          setIsSaving(true);
                          try {
                            for (const targetDay of targetDays) {
                              const existingForDay = filteredShifts.filter(s => s.date === targetDay);
                              
                              for (const s of sourceShifts) {
                                const alreadyExists = existingForDay.some(ex => 
                                  ex.activity.toLowerCase() === s.activity.toLowerCase() && 
                                  ex.startTime === s.startTime && 
                                  ex.endTime === s.endTime
                                );
                                
                                if (!alreadyExists) {
                                  const replica = {
                                    activity: s.activity,
                                    startTime: s.startTime,
                                    endTime: s.endTime,
                                    requiredPeopleCount: s.requiredPeopleCount || 0,
                                    animatorIds: [], // Keep Empty so they can assign them
                                    season: activeSeason,
                                    date: targetDay,
                                    createdAt: new Date().toISOString()
                                  };
                                  await addDoc(shiftsColl, replica);
                                }
                              }
                            }
                            setSuccessStatus("Turni applicati a tutta la settimana con successo!");
                            setTimeout(() => setSuccessStatus(null), 2000);
                            setCopiedShiftsDay(null); // Clear clipboard
                          } catch (err) {
                            console.error(err);
                            setErrorStatus("Errore nell'applicazione di gruppo.");
                            setTimeout(() => setErrorStatus(null), 2500);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-sm transition"
                      >
                        ⚡ Applica a tutta la settimana
                      </button>
                    )}
                    
                    <button
                      onClick={() => setCopiedShiftsDay(null)}
                      className="px-5 py-3 bg-white text-slate-500 hover:text-slate-850 text-[10px] font-black uppercase tracking-wider rounded-xl border border-slate-205 transition"
                    >
                      Annulla Copia
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-tab 1: Visione Settimanale */}
              {shiftsSubTab === 'weekly' && (
                <div className="space-y-6">
                  {weeks.length === 0 ? (
                    <div className="py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                      <Calendar size={48} className="mx-auto text-slate-200 mb-4" />
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Aggiungi dei giorni alla stagione nella barra in alto per caricare le settimane</p>
                    </div>
                  ) : (
                    <div>
                      {/* Weekly Grid - RESPONSIVE COLUMNS CONFIG */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 items-stretch">
                        {weeklyDays.map(dayStr => {
                          const dayDateObj = new Date(dayStr);
                          const dayName = format(dayDateObj, 'EEEE', { locale: it });
                          const capitalizedDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                          const formattedDate = format(dayDateObj, 'dd MMMM', { locale: it });

                          const isDayToday = format(new Date(), 'yyyy-MM-dd') === dayStr;
                          const cssToday = isDayToday 
                            ? 'border-2 border-blue-500 shadow-md ring-4 ring-blue-50 bg-white' 
                            : 'bg-white border border-slate-150 shadow-sm';

                          // Filter shifts for this day and sort by startTime
                          const dayShifts = [...filteredShifts]
                            .filter(s => s.date === dayStr)
                            .sort((a, b) => a.startTime.localeCompare(b.startTime));

                          return (
                            <div 
                              key={dayStr} 
                              className={`rounded-[2.5rem] p-5 flex flex-col min-h-[460px] hover:shadow-md transition-all duration-300 relative ${cssToday}`}
                            >
                              {/* Day Header - MAX CONTRAST & SEPARATION PILL */}
                              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-4 flex items-center justify-between gap-2 shadow-xs">
                                <div className="min-w-0">
                                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight italic flex items-center gap-1 leading-none">
                                    <span className="truncate">{capitalizedDayName}</span>
                                    {isDayToday && (
                                      <span className="text-[7.5px] px-1.5 py-0.5 bg-blue-600 text-white rounded uppercase tracking-wider font-extrabold not-italic leading-none shrink-0 shadow-xs">Oggi</span>
                                    )}
                                  </h3>
                                  <span className="text-[9.5px] font-black text-slate-500 uppercase tracking-wider mt-1.5 block">
                                    {formattedDate}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Copy Button */}
                                  <button
                                    onClick={() => {
                                      setCopiedShiftsDay(dayStr);
                                      const dObj = new Date(dayStr);
                                      setSuccessStatus(`Struttura turni copiata per ${format(dObj, 'dd/MM')}!`);
                                      setTimeout(() => setSuccessStatus(null), 1500);
                                    }}
                                    className={`p-1.5 rounded-lg border transition-all ${
                                      copiedShiftsDay === dayStr 
                                        ? 'text-indigo-805 bg-indigo-100 border-indigo-300 shadow-xs' 
                                        : 'text-slate-600 hover:text-indigo-600 bg-white border-slate-200 hover:bg-indigo-50/20'
                                    }`}
                                    title="Copia struttura turni di questo giorno"
                                  >
                                    <Copy size={11} strokeWidth={3} />
                                  </button>

                                  {/* Paste Button (only visible if copiedShiftsDay is set and is NOT the current day) */}
                                  {copiedShiftsDay && copiedShiftsDay !== dayStr && (
                                    <button
                                      onClick={async () => {
                                        const sourceShifts = filteredShifts.filter(s => s.date === copiedShiftsDay);
                                        
                                        if (sourceShifts.length === 0) {
                                          setErrorStatus("Nessun turno trovato nel giorno copiato!");
                                          setTimeout(() => setErrorStatus(null), 2500);
                                          return;
                                        }

                                        setIsSaving(true);
                                        try {
                                          const existingForDay = filteredShifts.filter(s => s.date === dayStr);
                                          
                                          for (const s of sourceShifts) {
                                            const alreadyExists = existingForDay.some(ex => 
                                              ex.activity.toLowerCase() === s.activity.toLowerCase() && 
                                              ex.startTime === s.startTime && 
                                              ex.endTime === s.endTime
                                            );
                                            
                                            if (!alreadyExists) {
                                              const replica = {
                                                activity: s.activity,
                                                startTime: s.startTime,
                                                endTime: s.endTime,
                                                requiredPeopleCount: s.requiredPeopleCount || 0,
                                                animatorIds: [], // Empty list of animators to begin clean selection
                                                season: activeSeason,
                                                date: dayStr,
                                                createdAt: new Date().toISOString()
                                              };
                                              await addDoc(shiftsColl, replica);
                                            }
                                          }
                                          const dObj = new Date(dayStr);
                                          setSuccessStatus(`Turni pronti per ${format(dObj, 'dd/MM')}!`);
                                          setTimeout(() => setSuccessStatus(null), 1500);
                                        } catch (err) {
                                          console.error("Paste error:", err);
                                          setErrorStatus("Errore durante l'incollamento.");
                                          setTimeout(() => setErrorStatus(null), 2500);
                                        } finally {
                                          setIsSaving(false);
                                        }
                                      }}
                                      className="p-1.5 text-indigo-900 bg-indigo-50 hover:bg-indigo-150 border border-indigo-250 rounded-lg transition-all shadow-xs"
                                      title="Incolla turni copiati qui"
                                    >
                                      <Check size={11} strokeWidth={3.5} />
                                    </button>
                                  )}

                                  {/* Create shift shortcut for this specific day */}
                                  <button
                                    onClick={() => handleOpenModal('shifts', null, { date: dayStr })}
                                    className="p-1.5 text-blue-900 bg-blue-50 hover:bg-blue-150 border border-blue-200 rounded-lg transition-all shadow-xs"
                                    title={`Crea un turno per ${capitalizedDayName}`}
                                  >
                                    <Plus size={11} strokeWidth={3} />
                                  </button>
                                </div>
                              </div>

                              {/* Shifts list for this day */}
                              <div className="space-y-4 flex-1">
                                {dayShifts.map((s, sIdx) => {
                                  const matchedCount = s.animatorIds?.length || 0;
                                  const requiredCount = s.requiredPeopleCount || 0;
                                  const isFulfilled = requiredCount > 0 && matchedCount >= requiredCount;

                                  return (
                                    <div 
                                      key={`${s.id}-${sIdx}`} 
                                      className="bg-slate-50/65 border border-slate-100/80 hover:bg-white hover:border-slate-200 rounded-[1.8rem] p-4 shadow-sm hover:shadow-md transition-all space-y-3 relative group"
                                    >
                                      <div className="flex items-start justify-between gap-1">
                                        <div className="min-w-0 flex-1">
                                          <h4 className="text-xs font-black uppercase text-slate-900 tracking-tight italic leading-tight truncate" title={s.activity}>
                                            {s.activity || 'Attività Oratorio'}
                                          </h4>
                                          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-1 block">
                                            ⏱️ {s.startTime} - {s.endTime}
                                          </span>
                                        </div>
                                        
                                        <div className="flex gap-1 items-center opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
                                          <button 
                                            onClick={() => handleOpenModal('shifts', s)}
                                            className="p-1 text-blue-650 text-blue-650 hover:bg-blue-50 bg-white rounded-lg border border-slate-100 transition"
                                            title="Modifica Orario/Attività"
                                          >
                                            <Pencil size={11} />
                                          </button>
                                          <button 
                                            onClick={() => handleDelete(s.id, shiftsColl)}
                                            className="p-1 text-red-600 hover:bg-red-55 rounded-lg bg-white border border-slate-100 transition"
                                            title="Elimina Turno"
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Progress badge with required counts */}
                                      {requiredCount > 0 && (
                                        <div className="space-y-1">
                                          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider">
                                            <span className={isFulfilled ? 'text-emerald-600' : 'text-amber-600'}>
                                              Copertura: {matchedCount} / {requiredCount}
                                            </span>
                                            <span className="text-slate-400">
                                              {Math.round((matchedCount / requiredCount) * 100)}%
                                            </span>
                                          </div>
                                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                            <div 
                                              className={`h-full rounded-full transition-all duration-300 ${
                                                isFulfilled ? 'bg-emerald-500' : 'bg-amber-500'
                                              }`} 
                                              style={{ width: `${Math.min((matchedCount / requiredCount) * 100, 100)}%` }}
                                            />
                                          </div>
                                        </div>
                                      )}

                                      {/* List of currently assigned animators with individual remove buttons */}
                                      <div className="space-y-1.5">
                                        <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">Animatori Assegnati:</span>
                                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                                          {s.animatorIds.map((aid, index) => {
                                            const anim = animators.find(a => a.id === aid);
                                            if (!anim) return null;
                                            return (
                                              <div key={`${s.id}-animlist-${aid}-${index}`} className="flex items-center justify-between gap-1 px-2 py-1 bg-white text-[9.5px] font-bold text-slate-700 rounded-lg border border-slate-150/60 italic leading-none shadow-sm shrink-0">
                                                <span className="truncate max-w-[85px]">{anim.lastName} {anim.firstName[0]}.</span>
                                                <button 
                                                  onClick={async () => {
                                                    const newIds = s.animatorIds.filter(id => id !== aid);
                                                    await updateDoc(doc(shiftsColl, s.id), { animatorIds: newIds });
                                                    setSuccessStatus(`Animatore rimosso!`);
                                                    setTimeout(() => setSuccessStatus(null), 1200);
                                                  }}
                                                  className="text-red-500 hover:text-red-700 font-black px-1 rounded-sm hover:bg-red-50 transition"
                                                  title="Rimuovi"
                                                >
                                                  &times;
                                                </button>
                                              </div>
                                            );
                                          })}
                                          {matchedCount === 0 && (
                                            <span className="text-[10px] text-slate-450 italic">Nessuno ancora assegnato</span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Dropdown to add an animator */}
                                      <div className="pt-2 border-t border-slate-200/50">
                                        <select 
                                          className="w-full text-[9px] font-black uppercase tracking-wider p-2 bg-white border border-slate-200 hover:border-slate-350 rounded-xl text-slate-605 text-slate-600 focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all appearance-none outline-none"
                                          value=""
                                          onChange={async (e) => {
                                            const val = e.target.value;
                                            if (!val) return;
                                            if (s.animatorIds.includes(val)) return;
                                            const newIds = [...s.animatorIds, val];
                                            await updateDoc(doc(shiftsColl, s.id), { animatorIds: newIds });
                                            setSuccessStatus(`Animatore assegnato!`);
                                            setTimeout(() => setSuccessStatus(null), 1200);
                                          }}
                                        >
                                          <option value="">+ Assegna...</option>
                                          <optgroup label="Presenti questa settimana">
                                            {activeSeasonAnimatorsList
                                              .filter(a => isAnimatorPresentInWeek(a, activeSeason, currentWeeklyWeek.id) && !s.animatorIds.includes(a.id))
                                              .map(a => {
                                                const hasAbsence = getAbsenceForAnimatorOnDay(a.id, dayStr);
                                                const isAbsentInfo = hasAbsence ? ` (${hasAbsence.reason || 'S.M./P.'})` : '';
                                                return (
                                                  <option key={`opt-${s.id}-${a.id}`} value={a.id}>
                                                    👤 {a.lastName} {a.firstName}{isAbsentInfo}
                                                  </option>
                                                );
                                              })
                                            }
                                          </optgroup>
                                          <optgroup label="Altri della stagione">
                                            {activeSeasonAnimatorsList
                                              .filter(a => !isAnimatorPresentInWeek(a, activeSeason, currentWeeklyWeek.id) && !s.animatorIds.includes(a.id))
                                              .map(a => (
                                                <option key={`opt-non-${s.id}-${a.id}`} value={a.id}>
                                                  💤 {a.lastName} {a.firstName} (Non iscritto)
                                                </option>
                                              ))
                                            }
                                          </optgroup>
                                        </select>
                                      </div>
                                    </div>
                                  );
                                })}

                                {dayShifts.length === 0 && (
                                  <div className="border border-dashed border-slate-200 rounded-[1.8rem] p-6 text-center text-slate-400 italic flex flex-col items-center justify-center min-h-[140px] bg-slate-50/20">
                                    <Clock size={20} className="text-slate-300 mb-2" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Nessun Turno</span>
                                    <span className="text-[9px] text-slate-400 mt-1">Clicca + per crearne uno</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 2: Lista Semplice (the original layout, updated to show required counts) */}
              {shiftsSubTab === 'list' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  {filteredShifts.length > 0 ? filteredShifts.map((s, idx) => {
                    const matchedCount = s.animatorIds?.length || 0;
                    const requiredCount = s.requiredPeopleCount || 0;
                    const isFulfilled = requiredCount > 0 && matchedCount >= requiredCount;

                    return (
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
                              {requiredCount > 0 && (
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border flex items-center gap-1 leading-none ${
                                  isFulfilled 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                    : 'bg-amber-50 text-amber-700 border-amber-100'
                                }`}>
                                  <Users size={10} /> {matchedCount} / {requiredCount} richiesti
                                </span>
                              )}
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
                    );
                  }) : (
                    <div className="py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                      <Clock size={48} className="mx-auto text-slate-200 mb-4" />
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Nessun turno registrato per la stagione {activeSeason}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Squadre Tab */}
        {activeTab === 'teams' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Day Selector and PDF export panel - HIGH CONTRAST & COMPACT */}
            <div className="bg-slate-900 text-white p-5 rounded-[2rem] border border-slate-950 shadow-md">
              <div className="space-y-4 w-full">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-amber-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block leading-none">GIORNO SELEZIONATO</span>
                      {activeRecapDay ? (
                        <span className="text-sm font-black uppercase text-amber-300 font-sans tracking-tight">
                          {format(new Date(activeRecapDay), 'eeee dd MMMM yyyy', { locale: it })}
                        </span>
                      ) : (
                        <span className="text-sm font-black text-slate-400">Nessun giorno selezionato</span>
                      )}
                    </div>
                  </div>
                  
                  {/* PDF Actions directly nested inside the day box header */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => generateDailyTeamsPDF(activeRecapDay)}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-750 text-white border border-indigo-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
                    >
                      <Download size={13} className="text-white" />
                      Scarica Presenti/Assenti Oggi
                    </button>
                    <button
                      type="button"
                      onClick={() => generateWeeklyTeamsPDF()}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-750 text-white border border-emerald-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
                    >
                      <Download size={13} className="text-white" />
                      Scarica Settimanale Squadre
                    </button>
                    {activeRecapDay && (
                      <span className="bg-amber-400 text-slate-950 text-[9px] font-black uppercase px-2.5 py-2.5 rounded-xl tracking-wider italic flex items-center shadow-sm">
                        Visualizzato Ora
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Scrollable Day Selection Pills (Micro sized with extreme contrast) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1.5 scrollbar-thin scrollbar-thumb-slate-850">
                  {activeSeasonDays.map(day => {
                    const isSel = day === activeRecapDay;
                    const dayObj = new Date(day);
                    const formattedDateStr = format(dayObj, 'eee dd/MM', { locale: it });
                    return (
                      <button
                        key={`teams-day-${day}`}
                        type="button"
                        onClick={() => setSelectedRecapDay(day)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wider shrink-0 transition-all ${
                          isSel 
                            ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm scale-102 font-black font-sans' 
                            : 'bg-slate-800 text-slate-300 border border-slate-700/85 hover:bg-slate-700 hover:text-white'
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
              </div>
            </div>

            {/* Teams Grid */}
            <div className="flex flex-col gap-6">
              {filteredTeams.length > 0 ? filteredTeams.map((t, idx) => {
                const teamAnimators = t.animatorIds.map(aid => animators.find(a => a.id === aid)).filter(Boolean) as Animator[];
                const presentToday = teamAnimators.filter(anim => {
                  const ab = getAbsenceForAnimatorOnDay(anim.id, activeRecapDay);
                  if (!ab) return true;
                  const isMezza = ab.reason === 'Solo Mattina' || ab.reason === 'Solo Pomeriggio' || 
                                  (ab.startTime === '13:30' && ab.endTime === '17:30') || 
                                  (ab.startTime === '08:30' && ab.endTime === '13:30');
                  return isMezza;
                });
                const absentToday = teamAnimators.filter(anim => {
                  const ab = getAbsenceForAnimatorOnDay(anim.id, activeRecapDay);
                  if (!ab) return false;
                  const isMezza = ab.reason === 'Solo Mattina' || ab.reason === 'Solo Pomeriggio' || 
                                  (ab.startTime === '13:30' && ab.endTime === '17:30') || 
                                  (ab.startTime === '08:30' && ab.endTime === '13:30');
                  return !isMezza;
                });

                return (
                  <div key={`${t.id}-${idx}`} className="bg-white rounded-[2rem] border-2 border-slate-300 shadow-md overflow-hidden flex flex-col hover:shadow-xl transition-all border-t-8" style={{ borderTopColor: t.color }}>
                    <div className="p-6 pb-4 flex items-center justify-between bg-slate-50/70 border-b border-slate-200">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tight">{t.name}</h2>
                          {t.referentIds && t.referentIds.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {t.referentIds.map((refId, rIdx) => {
                                const refAnim = teamAnimators.find(a => a.id === refId);
                                if (!refAnim) return null;
                                return (
                                  <span key={`ref-badge-${refId}-${rIdx}`} className="text-[8.5px] font-black uppercase tracking-wider px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded flex items-center gap-1 italic shadow-sm" title={`Referente: ${refAnim.lastName} ${refAnim.firstName}`}>
                                    <Star size={9} className="text-amber-500 fill-amber-500 shrink-0" />
                                    <span>{refAnim.lastName} {refAnim.firstName[0]}.</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block mt-1">
                          {teamAnimators.length} Animatori • {t.kids?.length || 0} Ragazzi
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          onClick={() => generateSingleTeamPDF(t)} 
                          className="p-2.5 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900 border border-slate-300 rounded-xl transition-all bg-white hover:border-emerald-500 active:scale-95"
                          title="Scarica scheda squadra (PDF)"
                        >
                          <Download size={15} className="font-extrabold" />
                        </button>
                        <button 
                          onClick={() => handleOpenModal('teams', t)} 
                          className="p-2.5 text-blue-700 hover:bg-blue-50 hover:text-blue-900 border border-slate-300 rounded-xl transition-all bg-white hover:border-blue-500 active:scale-95"
                          title="Modifica squadra"
                        >
                          <Pencil size={15} className="font-extrabold" />
                        </button>
                        <button 
                          onClick={() => handleDelete(t.id, teamsColl)} 
                          className="p-2.5 text-red-700 hover:bg-red-50 hover:text-red-900 border border-slate-300 rounded-xl transition-all bg-white hover:border-red-500 active:scale-95"
                          title="Elimina squadra"
                        >
                          <Trash2 size={15} className="font-extrabold" />
                        </button>
                      </div>
                    </div>

                    {/* Dynamic Present / Absent Animators lists for Selected Day */}
                    <div className="px-6 pt-4 pb-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-100/60 p-4 rounded-2xl border border-slate-250">
                        {/* Present Block */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5 bg-emerald-100 border border-emerald-300 px-2.5 py-1.5 rounded-lg w-fit">
                            <CheckCircle2 size={11} className="text-emerald-700 animate-pulse" />
                            Presenti ({presentToday.length})
                          </span>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                            {presentToday.map((anim, idx) => {
                              const isRef = t.referentIds?.includes(anim.id);
                              const assign = t.assignments?.[anim.id];
                              const ab = getAbsenceForAnimatorOnDay(anim.id, activeRecapDay);
                              const hasAbs = !!ab;
                              return (
                                <div key={`${anim.id}-${idx}`} className="text-[11px] font-extrabold text-slate-900 flex items-center gap-1.5 py-0.5 italic flex-wrap">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasAbs ? 'bg-amber-500 animate-pulse' : 'bg-emerald-600'}`} />
                                  {isRef && <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" />}
                                  <span className="truncate">{anim.lastName} {anim.firstName}</span>
                                  {assign && (
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ml-1 tracking-normal uppercase border leading-none ${
                                      assign === 'grandi' 
                                        ? 'bg-orange-50 text-orange-600 border-orange-200' 
                                        : 'bg-teal-50 text-teal-600 border-teal-200'
                                    }`}>
                                      {assign}
                                    </span>
                                  )}
                                  {ab && (() => {
                                    const isMorning = ab.reason === 'Solo Mattina' || (ab.startTime === '13:30' && ab.endTime === '17:30');
                                    return (
                                      <span className={`text-[7.5px] font-black px-1 py-0.5 rounded uppercase leading-none border ${
                                        isMorning 
                                          ? 'bg-amber-100 text-amber-800 border-amber-200' 
                                          : 'bg-sky-50 text-sky-700 border-sky-300'
                                      }`} title={ab.reason}>
                                        {isMorning ? '☀️ Solo Mattina' : '⛅ Solo Pom.'}
                                      </span>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                            {presentToday.length === 0 && (
                              <p className="text-[10px] text-slate-500 font-extrabold uppercase italic">Nessuno presente</p>
                            )}
                          </div>
                        </div>

                        {/* Absent Block */}
                        <div className="space-y-2 border-t sm:border-t-0 sm:border-l border-slate-300 pt-3 sm:pt-0 sm:pl-4">
                          <span className="text-[10px] font-black text-red-800 uppercase tracking-widest flex items-center gap-1.5 bg-red-100 border border-red-305 px-2.5 py-1.5 rounded-lg w-fit">
                            <AlertCircle size={11} className="text-red-650" />
                            Assenti ({absentToday.length})
                          </span>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                            {absentToday.map((anim, idx) => {
                              const ab = getAbsenceForAnimatorOnDay(anim.id, activeRecapDay);
                              let spec = 'Tutto il giorno';
                              if (ab?.reason === 'Solo Mattina') {
                                spec = 'Solo Mattina';
                              } else if (ab?.reason === 'Solo Pomeriggio') {
                                spec = 'Solo Pomeriggio';
                              } else if (ab?.startTime || ab?.endTime) {
                                spec = `${ab.startTime || ''}-${ab.endTime || ''}`;
                              }
                              const reason = ab?.reason && ab.reason !== 'Solo Mattina' && ab.reason !== 'Solo Pomeriggio' ? `(${ab.reason})` : '';
                              const isRef = t.referentIds?.includes(anim.id);
                              const assign = t.assignments?.[anim.id];

                              return (
                                <div key={`${anim.id}-${idx}`} className="text-[11px] font-medium text-slate-900 flex flex-col gap-0.5 py-0.5 border-b border-dashed border-slate-200 last:border-none">
                                  <span className="font-extrabold text-red-700 flex items-center gap-1.5 italic">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0 animate-ping" />
                                    {isRef && <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" />}
                                    {anim.lastName} {anim.firstName[0]}.
                                    {assign && (
                                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ml-1 tracking-normal uppercase border leading-none ${
                                        assign === 'grandi' 
                                          ? 'bg-orange-50 text-orange-600 border-orange-200' 
                                          : 'bg-teal-50 text-teal-600 border-teal-200'
                                      }`}>
                                        {assign}
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[9.5px] text-slate-600 font-mono font-bold pl-3 italic">
                                    {spec} {reason}
                                  </span>
                                </div>
                              );
                            })}
                            {absentToday.length === 0 && (
                              <p className="text-[10px] text-slate-500 font-extrabold uppercase italic">Nessun assente</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Details Panel (Tendina) */}
                    {(() => {
                      const isExpanded = !!expandedTeams[t.id];
                      return (
                        <>
                          <div className="px-6 py-3">
                            <button
                              type="button"
                              onClick={() => setExpandedTeams(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                                isExpanded
                                  ? 'bg-slate-900 border-slate-950 text-white shadow-inner font-sans'
                                  : 'bg-white border-slate-350 text-slate-800 hover:bg-slate-50 hover:border-slate-800 hover:text-slate-900 shadow-sm font-sans'
                              }`}
                            >
                              <span className="font-black">
                                {isExpanded ? 'Nascondi Altri Dettagli' : `Mostra Altri Dettagli (${teamAnimators.length} Anim, ${t.kids?.length || 0} Ragazzi)`}
                              </span>
                              <ChevronDown
                                size={14}
                                className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="space-y-4 px-6 pb-6 border-t border-slate-250 pt-4 bg-slate-50/70 animate-in fade-in duration-200 flex-grow">
                              
                              {/* 1. All Animators List */}
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-black text-slate-505 uppercase tracking-widest italic block">
                                  TUTTI GLI ANIMATORI ASSOCIATI (@ = REFERENTE)
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {teamAnimators.map((anim, itemIdx) => {
                                    const isRef = t.referentIds?.includes(anim.id);
                                    const assign = t.assignments?.[anim.id];
                                    return (
                                      <span key={`${t.id}-anim-${anim.id}-${itemIdx}`} className="text-[9.5px] font-black uppercase tracking-widest px-3 py-1.5 bg-white text-slate-800 rounded-lg border border-slate-300 italic flex items-center gap-1.5 shadow-sm">
                                        {isRef ? (
                                          <Star size={11} className="text-amber-500 fill-amber-500 font-black shrink-0" />
                                        ) : (
                                          <UserCheck size={11} className="text-blue-700 font-black shrink-0" />
                                        )}
                                        <span>{anim.lastName} {anim.firstName[0]}.</span>
                                        {assign && (
                                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ml-1 tracking-normal uppercase border leading-none ${
                                            assign === 'grandi' 
                                              ? 'bg-orange-50 text-orange-600 border-orange-200' 
                                              : 'bg-teal-50 text-teal-600 border-teal-200'
                                          }`}>
                                            {assign}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                  {teamAnimators.length === 0 && (
                                    <span className="text-[10px] text-slate-500 font-bold italic">Nessun animatore associato</span>
                                  )}
                                </div>
                              </div>

                              {/* 2. Storico presenze nel Camp - Diviso per settimane con l'attuale all'inizio */}
                              <div className="bg-white border border-slate-305 p-4 rounded-2xl flex flex-col gap-2 shadow-sm">
                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest pb-1 border-b border-slate-100 flex items-center gap-2">
                                  <UserX size={12} className="text-red-600" />
                                  Storico Presenze Stagione {activeSeason} (Settimana Corrente Prima)
                                </span>
                                {teamAnimators.length > 0 ? (
                                  <div className="space-y-3.5">
                                    {teamAnimators.map((anim, itemIdx) => {
                                      const isRef = t.referentIds?.includes(anim.id);
                                      const assign = t.assignments?.[anim.id];
                                      
                                      // Get weeks and align the current active week at the start of the list
                                      const weeksList = getWeeks();
                                      const currentWeekIdx = weeksList.findIndex(w => w.days.includes(activeRecapDay));
                                      let sortedWeeks = [...weeksList];
                                      if (currentWeekIdx > -1) {
                                        const [currWeek] = sortedWeeks.splice(currentWeekIdx, 1);
                                        sortedWeeks = [currWeek, ...sortedWeeks];
                                      }

                                      return (
                                        <div key={`${t.id}-absence-${anim.id}-${itemIdx}`} className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 py-2 border-b border-slate-100 last:border-none">
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {isRef && <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" />}
                                            <span className="text-[11px] font-extrabold text-slate-900 italic">
                                              {anim.lastName} {anim.firstName[0]}.
                                            </span>
                                            {assign && (
                                              <span className={`text-[7.5px] font-black px-1 rounded uppercase border font-sans scale-90 ${
                                                assign === 'grandi' 
                                                  ? 'bg-orange-50 text-orange-600 border-orange-200' 
                                                  : 'bg-teal-50 text-teal-600 border-teal-200'
                                              }`}>
                                                {assign[0]}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 overflow-x-auto py-1 max-w-full scrollbar-thin">
                                            {sortedWeeks.map(week => {
                                              const isCurrentWeek = week.days.includes(activeRecapDay);
                                              return (
                                                <div key={week.id} className={`flex items-center gap-1.5 p-1 rounded-xl border-2 ${
                                                  isCurrentWeek 
                                                    ? 'bg-amber-55 lg:bg-amber-50/50 border-amber-300' 
                                                    : 'bg-slate-50/50 border-slate-200'
                                                } shrink-0`}>
                                                  <span className={`text-[7.5px] font-black uppercase tracking-wider font-mono px-1.5 border-r border-slate-200/80 leading-tight shrink-0 text-slate-500`}>
                                                    {week.label.replace('Settimana ', '')}
                                                  </span>
                                                  <div className="flex items-center gap-1">
                                                    {week.days.map(day => {
                                                      const matchingAbs = getAbsenceForAnimatorOnDay(anim.id, day);
                                                      const meta = getAbsenceMeta(matchingAbs);
                                                      const weekdayStr = format(new Date(day), 'eeeee d', { locale: it });
                                                      const isSelectDay = day === activeRecapDay;
                                                      
                                                      let bgClass = 'bg-emerald-600 text-white border-emerald-700 shadow-sm font-black';
                                                      let labelChar = ''; 
                                                      let titleText = 'Presente';
                                                      
                                                      if (meta) {
                                                        bgClass = meta.className;
                                                        titleText = meta.tooltip;
                                                        if (meta.label.includes('M')) {
                                                          labelChar = 'M';
                                                        } else if (meta.label.includes('P')) {
                                                          labelChar = 'P';
                                                        } else if (meta.label.includes('T')) {
                                                          labelChar = 'T';
                                                        } else if (meta.label.includes('-')) {
                                                          labelChar = '-';
                                                        } else {
                                                          labelChar = 'H';
                                                        }
                                                      }

                                                      return (
                                                        <div 
                                                          key={day}
                                                          className={`w-7 h-7 rounded-lg flex flex-col items-center justify-center text-[7px] font-black transition-all shrink-0 border ${
                                                            isSelectDay ? 'ring-2 ring-slate-900 scale-105 border-transparent' : ''
                                                          } ${bgClass}`}
                                                          title={`${format(new Date(day), 'dd/MM/yyyy')}: ${titleText}${isSelectDay ? ' (Oggi/Selezionato)' : ''}`}
                                                        >
                                                          <span className={`text-[4.2px] uppercase font-bold leading-none ${isSelectDay ? 'text-slate-950 font-black' : 'opacity-90'}`}>
                                                            {weekdayStr[0]}{labelChar ? ` · ${labelChar}` : ''}
                                                          </span>
                                                          <span className="leading-none mt-0.5">{format(new Date(day), 'd')}</span>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-slate-500 uppercase font-bold italic py-1 text-center">Nessun animatore associato</p>
                                )}
                              </div>

                              {/* 3. Elenco ragazzi */}
                              <div className="bg-white rounded-2xl p-4 border border-slate-305 font-normal shadow-sm">
                                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-1.5">
                                  <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest italic flex items-center gap-2">
                                    <Users size={12} className="text-blue-700" /> Elenco Ragazzi ({t.kids?.length || 0})
                                  </span>
                                </div>
                                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                  {t.kids && [...t.kids].sort((a, b) => {
                                    const comp = (a.lastName || '').localeCompare(b.lastName || '', 'it', { sensitivity: 'base' });
                                    if (comp !== 0) return comp;
                                    return (a.firstName || '').localeCompare(b.firstName || '', 'it', { sensitivity: 'base' });
                                  }).map((k, idx) => (
                                    <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-150 last:border-0 hover:bg-slate-50 px-1 rounded">
                                      <span className="text-[11px] font-black text-slate-900 italic">{k.lastName} {k.firstName}</span>
                                      {k.note && <span className="text-[9.5px] text-slate-600 font-bold italic truncate max-w-[150px]" title={k.note}>{k.note}</span>}
                                    </div>
                                  ))}
                                  {(!t.kids || t.kids.length === 0) && <p className="text-[10px] text-slate-400 uppercase font-black italic py-2 text-center">Nessun ragazzo assegnato</p>}
                                </div>
                              </div>

                            </div>
                          )}
                        </>
                      );
                    })()}
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
            
            {/* Matrix of Attendance (Tanti Quadratini) */}
            <div className="bg-white rounded-[3rem] border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-widest flex items-center gap-3">
                    <UserX size={18} className="text-red-500 animate-pulse" />
                    Pannello Rilevamento Assenze Rapido (Stagione {activeSeason})
                  </h3>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                    Clicca sul quadratino corrispondente per impostare e pianificare la presenza/assenza (Mezza giornata, Tutto il giorno o Orari)
                  </p>
                </div>

                {/* PDF Download & Days configuration - CLEAN & HIGH CONTRAST */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0 relative">
                  {/* Gestisci Giornate Camp (Solo tasto arancio) */}
                  <button
                    type="button"
                    onClick={() => setIsDaysConfigOpen(true)}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-3 rounded-full font-black uppercase italic tracking-wider transition-all shadow-md active:scale-95 text-[10px]"
                  >
                    <Calendar size={13} />
                    Gestisci Giornate Camp
                  </button>

                  {/* Single Download button with dropdown menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsDownloadDropdownOpen(!isDownloadDropdownOpen)}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-5 py-3 rounded-full text-[10px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95 border border-slate-800"
                    >
                      <Download size={13} className="text-white animate-bounce" style={{ animationDuration: '3s' }} />
                      Scarica Report
                      <ChevronDown size={12} className="text-slate-300 ml-0.5" />
                    </button>

                    {isDownloadDropdownOpen && (
                      <>
                        {/* Invisible click-away overlay */}
                        <div 
                          className="fixed inset-0 z-[190]" 
                          onClick={() => setIsDownloadDropdownOpen(false)}
                        />
                        
                        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2.5 z-[200] animate-in fade-in slide-in-from-top-1 duration-150 origin-top-right">
                          <div className="px-4 py-1.5 border-b border-slate-100 mb-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Seleziona Tipo Report</span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              generateAbsencesPDF('daily');
                              setIsDownloadDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-extrabold uppercase tracking-widest flex items-center gap-2.5 transition-colors"
                          >
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            <div>
                              <p className="font-extrabold text-[10px]">Report Giornaliero</p>
                              <p className="text-[8px] text-slate-400 font-medium normal-case tracking-normal">Giorno selezionato nel riepilogo</p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              generateAbsencesPDF('weekly');
                              setIsDownloadDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-extrabold uppercase tracking-widest flex items-center gap-2.5 transition-colors"
                          >
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            <div>
                              <p className="font-extrabold text-[10px]">Griglia Settimanale</p>
                              <p className="text-[8px] text-slate-400 font-medium normal-case tracking-normal">La settimana visualizzata</p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              generateAbsencesPDF('totals');
                              setIsDownloadDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-extrabold uppercase tracking-widest flex items-center gap-2.5 transition-colors"
                          >
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <div>
                              <p className="font-extrabold text-[10px]">Report Stagionale</p>
                              <p className="text-[8px] text-slate-400 font-medium normal-case tracking-normal">Resoconto complessivo stagione</p>
                            </div>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {activeSeasonDays.length > 0 ? (
                (() => {
                  const dailyStats = displayedDays.reduce((acc, day) => {
                    const weekId = getWeekIdForDay(day);
                    const activeAnimators = activeSeasonAnimatorsList.filter(anim => 
                      isAnimatorPresentInWeek(anim, activeSeason, weekId)
                    );
                    const total = activeAnimators.length;
                    const dayAbsences = absences.filter(ab => 
                      ab.date === day && activeAnimators.some(anim => anim.id === ab.animatorId)
                    );
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
                      {/* Week Selector Pills - COMPACT & LESS INVASIVE */}
                      <div className="px-8 py-3.5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Filtra per Settimana:</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedWeekId('all')}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition-all select-none border shrink-0 ${
                              selectedWeekId === 'all'
                                ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                                : 'bg-white text-slate-500 hover:text-slate-800 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            Tutte le giornate ({activeSeasonDays.length})
                          </button>
                          {weeks.map((w, idx) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => setSelectedWeekId(w.id)}
                              className={`px-3 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition-all select-none border shrink-0 ${
                                selectedWeekId === w.id
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                  : 'bg-white text-slate-500 hover:text-slate-800 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Sett. {idx + 1} ({w.label})
                            </button>
                          ))}
                        </div>
                      </div>
                                    {/* Daily Recap summary & interactive chosen day panel */}
                      <div className="p-8 bg-slate-100/40 border-b border-slate-200">
                        {displayedDays.length > 0 ? (
                          (() => {
                            const activeRecapDay = displayedDays.includes(selectedRecapDay)
                              ? selectedRecapDay
                              : (displayedDays[0] || selectedRecapDay || activeSeasonDays[0]);

                            const activeDayStats = dailyStats[activeRecapDay] || { present: 0, absent: 0, partial: 0, total: 0 };
                            const activeDayAbsences = absences.filter(ab => { if (ab.date !== activeRecapDay) return false; const anim = activeSeasonAnimatorsList.find(a => a.id === ab.animatorId); if (!anim) return false; const recapWeekId = getWeekIdForDay(activeRecapDay); return isAnimatorPresentInWeek(anim, activeSeason, recapWeekId); });
                            
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
                                  colorClass: 'bg-sky-50 text-sky-700 border border-sky-100'
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
                                    <Calendar size={14} className="text-slate-705" />
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
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
                                              ? 'bg-slate-900 text-white border-slate-950 shadow-md scale-[1.02] font-black'
                                              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between w-full">
                                            <div className="flex flex-col">
                                              <span className={`text-[10px] font-black uppercase text-left ${isSel ? 'text-slate-350 font-bold' : 'text-slate-500'}`}>
                                                {format(dayObj, 'eee', { locale: it })}
                                              </span>
                                              <span className="text-xs font-black">
                                                {format(dayObj, 'dd/MM')}
                                                {isDayToday && <span className={`${isSel ? 'text-amber-400 font-extrabold' : 'text-blue-600'} text-[8px] font-black`}> (Oggi)</span>}
                                              </span>
                                            </div>
                                            {dayStats.absent > 0 ? (
                                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isSel ? 'bg-white/25 text-white' : 'bg-red-50 text-red-650 font-black border border-red-100'}`}>
                                                🔴 {dayStats.absent}
                                              </span>
                                            ) : (
                                              <span className={`text-[9.5px] font-black ${isSel ? 'text-emerald-400 font-extrabold' : 'text-emerald-650 font-extrabold'}`}>
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
                                <div className="lg:col-span-7 bg-white rounded-[2rem] border border-slate-250 shadow-md p-6 flex flex-col justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-205 pb-4">
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
                                                className="flex flex-wrap items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100/60 transition-colors gap-2"
                                              >
                                                <span className="text-[11px] font-extrabold text-slate-800 uppercase italic">
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
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-100/90 border-b border-slate-250 italic">
                              <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-650 font-sans">Animatore</th>
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
                                        ? 'bg-indigo-50/95 text-indigo-950 border-x border-t border-indigo-200 rounded-t-2xl shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-805 hover:bg-slate-205/50'
                                    }`}
                                    title="Clicca per caricare i dettagli di questa giornata nel riepilogo sopra"
                                  >
                                    <div className="flex flex-col items-center">
                                      <span className={isActive ? 'text-indigo-650 font-black' : 'opacity-75'}>
                                        {format(dateObj, 'eee', { locale: it })}
                                      </span>
                                      <span className={`text-xs font-black mt-0.5 ${isActive ? 'text-indigo-950' : 'text-slate-700'}`}>
                                        {format(dateObj, 'dd/MM')}
                                      </span>
                                      {/* Inline stats block */}
                                      <div className={`mt-2 pt-1.5 border-t w-full flex items-center justify-center gap-1.5 text-[9px] font-extrabold ${isActive ? 'border-indigo-200' : 'border-slate-200'}`}>
                                        <span className="text-emerald-700" title="Presenti">🟢{stats.present}</span>
                                        <span className="text-red-500 font-extrabold" title="Assenti">🔴{stats.absent}</span>
                                      </div>
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {activeSeasonAnimatorsList.length > 0 ? activeSeasonAnimatorsList.map((anim, index) => (
                              <tr key={`${anim.id}-${index}`} className="hover:bg-slate-100/60 transition-colors">
                                <td className="px-8 py-4 whitespace-nowrap">
                                  <span className="text-xs font-black text-slate-800 uppercase italic">{anim.lastName} {anim.firstName}</span>
                                </td>
                                {displayedDays.map(day => {
                                  const matchingAbs = getAbsenceForAnimatorOnDay(anim.id, day);
                                  const meta = getAbsenceMeta(matchingAbs);
                                  const isActive = activeRecapDay === day;

                                  return (
                                    <td 
                                      key={day} 
                                      className={`px-2 py-4 text-center transition-all ${
                                        isActive 
                                          ? 'bg-indigo-50/30 border-x border-indigo-150/85 shadow-inner' 
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
                                          meta ? meta.className : 'bg-emerald-50/40 border border-emerald-100 hover:bg-emerald-50 hover:border-emerald-255 text-emerald-600 hover:text-emerald-800'
                                        }`}
                                        title={meta ? meta.tooltip : `${anim.lastName}: Presente (Clicca per impostare assenza)`}
                                      >
                                        {meta ? (
                                          <span className="font-extrabold text-[10px] whitespace-nowrap">{meta.label}</span>
                                        ) : (
                                          <Plus size={11} className="opacity-60 hover:opacity-100 hover:scale-110 transition-all font-bold" />
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
                          <span className="w-5 h-5 rounded-md bg-red-500 text-white flex items-center justify-center font-bold text-[8px]">NI</span>
                          <span>Non Iscritto in settimana (NI)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600">
                          <span className="w-5 h-5 rounded-md bg-amber-500 text-white flex items-center justify-center font-bold text-[8px]">☀️ M</span>
                          <span>Fa solo mattina (Assente PM)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600">
                          <span className="w-5 h-5 rounded-md bg-sky-500 text-white flex items-center justify-center font-bold text-[8px]">⛅ P</span>
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

        {activeTab === 'workshops' && (
          <div className="space-y-6">
            {/* Stats Display */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
                  <BookOpen size={24} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Laboratori Totali</span>
                  <span className="text-2xl font-black italic text-slate-900">{filteredWorkshops.length}</span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                  <Users size={24} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Capacità Iscritti Sommata</span>
                  <span className="text-2xl font-black italic text-slate-900">
                    {filteredWorkshops.reduce((acc, w) => acc + (w.maxSubscribers || 0), 0)}
                  </span>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shrink-0">
                  <Star size={24} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Animatori Coinvolti</span>
                  <span className="text-2xl font-black italic text-slate-900">
                    {new Set(filteredWorkshops.flatMap(w => [w.referentId, ...(w.animatorIds || [])]).filter(Boolean)).size}
                  </span>
                </div>
              </div>
            </div>

            {/* Week Selector / Filters */}
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 mb-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-widest flex items-center gap-3">
                    <BookOpen size={18} className="text-blue-600" />
                    Pianificazione Laboratori per Settimana
                  </h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                    Visualizza e suddividi i laboratori attivi
                  </p>
                </div>
                
                {/* Horizontal scrollable selector of weeks */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedWeekId('all')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all select-none border shrink-0 ${
                      selectedWeekId === 'all'
                        ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-500 hover:text-slate-800 border-slate-200 hover:bg-slate-105'
                    }`}
                  >
                    Tutti i Laboratori
                  </button>
                  {weeks.map((w, idx) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setSelectedWeekId(w.id)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all select-none border shrink-0 ${
                        selectedWeekId === w.id
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                          : 'bg-slate-50 text-slate-500 hover:text-slate-800 border-slate-200 hover:bg-slate-105'
                      }`}
                    >
                      Sett. {idx + 1} ({w.label.replace('Settimana ', '')})
                    </button>
                  ))}
                </div>
              </div>

              {/* Workshops Grid */}
              {(() => {
                const workshopsToShow = selectedWeekId === 'all'
                  ? filteredWorkshops
                  : filteredWorkshops.filter(w => w.weeks?.includes(selectedWeekId));

                if (workshopsToShow.length > 0) {
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {workshopsToShow.map(w => {
                        const referent = animators.find(a => a.id === w.referentId);
                        const supportAnimators = (w.animatorIds || [])
                          .map(id => animators.find(a => a.id === id))
                          .filter(Boolean) as Animator[];

                        return (
                          <div
                            key={w.id}
                            className="group bg-white p-6 rounded-[2.5rem] border border-slate-150 hover:border-slate-250 hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between"
                          >
                            <div className="space-y-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <h4 className="text-lg font-black text-slate-900 italic uppercase tracking-tight">
                                    {w.name}
                                  </h4>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] font-black uppercase bg-slate-50 text-slate-500 px-2 py-0.5 rounded-md border border-slate-100">
                                      {w.maxSubscribers} iscritti max
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                  <button
                                    onClick={() => handleOpenModal('workshops', w)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                    title="Modifica"
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(w.id, workshopsColl)}
                                    className="p-2 text-red-650 hover:bg-red-50 rounded-xl transition-all"
                                    title="Elimina"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </div>

                              {/* Referent display */}
                              <div className="p-3 bg-amber-50/20 border border-amber-100/50 rounded-2xl flex items-center gap-3">
                                <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 text-amber-500 shadow-sm border border-amber-100/30">
                                  <Star size={14} className="fill-amber-450 text-amber-500" />
                                </div>
                                <div>
                                  <span className="text-[8.5px] font-black uppercase text-amber-600 tracking-wider block">
                                    Referente Laboratorio
                                  </span>
                                  <span className="text-xs font-black text-slate-800">
                                    {referent ? `${referent.lastName} ${referent.firstName}` : 'Referente non impostato'}
                                  </span>
                                </div>
                              </div>

                              {/* Supports display */}
                              <div className="space-y-1.5">
                                <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block ml-1">
                                  Animatori di Supporto ({supportAnimators.length})
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {supportAnimators.map(a => (
                                    <span
                                      key={`${w.id}-support-${a.id}`}
                                      className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg"
                                    >
                                      {a.lastName} {a.firstName[0]}.
                                    </span>
                                  ))}
                                  {supportAnimators.length === 0 && (
                                    <span className="text-[10px] text-slate-400 italic ml-1 block">
                                      Nessun altro animatore assegnato
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Weeks display */}
                              <div className="space-y-1.5 pt-2 border-t border-slate-50">
                                <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block ml-1">
                                  Attivo nelle settimane:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {w.weeks && w.weeks.map(weekId => {
                                    const weekObj = weeks.find(wk => wk.id === weekId);
                                    const weekIndex = weeks.findIndex(wk => wk.id === weekId);
                                    return weekObj ? (
                                      <span
                                        key={`${w.id}-active-week-${weekId}`}
                                        className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md"
                                      >
                                        Sett. {weekIndex + 1}
                                      </span>
                                    ) : null;
                                  })}
                                  {(!w.weeks || w.weeks.length === 0) && (
                                    <span className="text-[10px] text-red-500 italic block ml-1">
                                      ⚠️ Non attivo in alcuna settimana
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                } else {
                  return (
                    <div className="py-20 text-center bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-205">
                      <BookOpen size={48} className="mx-auto text-slate-200 mb-4 animate-pulse" />
                      <p className="text-slate-405 font-black uppercase tracking-widest text-[10px]">
                        Nessun laboratorio pianificato per questa selezione
                      </p>
                      <button
                        onClick={() => handleOpenModal('workshops')}
                        className="mt-4 px-6 py-2.5 bg-blue-600 text-white font-extrabold uppercase italic tracking-wider rounded-full hover:bg-blue-700 transition-all text-[9px] shadow-md shadow-blue-105"
                      >
                        Pianifica Primo Laboratorio
                      </button>
                    </div>
                  );
                }
              })()}
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
                  {editingId ? 'Modifica' : 'Nuovo'} {activeTab === 'animators' ? 'Animatore' : activeTab === 'shifts' ? 'Turno' : activeTab === 'teams' ? 'Squadra' : activeTab === 'absences' ? 'Assenza' : 'Laboratorio'}
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
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Note</span>
                    <textarea value={animatorForm.notes} onChange={e => setAnimatorForm({...animatorForm, notes: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner" rows={3}/>
                  </div>
                </div>
              )}

              {activeTab === 'shifts' && (
                <div className="space-y-6">
                  {/* Single Day vs Multi Day toggler (only when creating) */}
                  {!editingId && (
                    <div className="bg-slate-100 p-1 rounded-2xl flex shadow-inner border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setIsMultiDayShift(false)}
                        className={`flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          !isMultiDayShift
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Calendar size={13} />
                        Giorno Singolo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsMultiDayShift(true);
                          // Ensure we have current date selected by default
                          if (shiftFormSelectedDates.length === 0) {
                            setShiftFormSelectedDates([shiftForm.date]);
                          }
                        }}
                        className={`flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-1.5 ${
                          isMultiDayShift
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Users size={13} />
                        Più Giorni Contemporaneamente
                      </button>
                    </div>
                  )}

                  {/* Date, Start, End controls */}
                  <div className="space-y-4">
                    {(!isMultiDayShift || editingId) ? (
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
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Orario Inizio</span>
                            <input required type="time" value={shiftForm.startTime} onChange={e => setShiftForm({...shiftForm, startTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner" />
                          </div>
                          <div className="space-y-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Orario Fine</span>
                            <input required type="time" value={shiftForm.endTime} onChange={e => setShiftForm({...shiftForm, endTime: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner" />
                          </div>
                        </div>

                        {/* Multi Day picker */}
                        <div className="space-y-3 bg-slate-50 border border-slate-100 p-4 rounded-[2rem] shadow-inner">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-200">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Seleziona Giorni</span>
                              <span className="text-[11px] font-black text-blue-650 uppercase italic tracking-tight block">
                                {shiftFormSelectedDates.length} giornate selezionate
                              </span>
                            </div>
                            
                            {/* Fast Week selector within modal */}
                            {weeks.length > 0 && (
                              <div className="flex items-center gap-1">
                                <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider">Settimana:</span>
                                <select
                                  value={selectedWeeklyWeekId || (weeks[0]?.id || '')}
                                  onChange={(e) => setSelectedWeeklyWeekId(e.target.value)}
                                  className="text-[9px] font-black uppercase tracking-wider p-2 bg-white border border-slate-150 rounded-xl text-slate-700 outline-none cursor-pointer"
                                >
                                  {weeks.map(w => (
                                    <option key={w.id} value={w.id}>{w.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>

                          {/* Render Days for the currently chosen week with interactive checkbox labels */}
                          {(() => {
                            const modalWeek = weeks.find(w => w.id === selectedWeeklyWeekId) || weeks[0];
                            const modalDaysList = modalWeek ? modalWeek.days : activeSeasonDays;

                            return (
                              <div className="space-y-2.5">
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const allChecked = modalDaysList.every(d => shiftFormSelectedDates.includes(d));
                                      if (allChecked) {
                                        setShiftFormSelectedDates(shiftFormSelectedDates.filter(d => !modalDaysList.includes(d)));
                                      } else {
                                        const merged = Array.from(new Set([...shiftFormSelectedDates, ...modalDaysList]));
                                        setShiftFormSelectedDates(merged);
                                      }
                                    }}
                                    className="text-[9.5px] font-black uppercase text-blue-600 hover:text-blue-800 transition"
                                  >
                                    {modalDaysList.every(d => shiftFormSelectedDates.includes(d)) ? '❌ Deseleziona Settimana' : '✔️ Seleziona Intera Settimana'}
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto px-1 custom-scrollbar">
                                  {modalDaysList.map(dayStr => {
                                    const dObj = new Date(dayStr);
                                    const isChecked = shiftFormSelectedDates.includes(dayStr);
                                    return (
                                      <button
                                        key={`modal-day-${dayStr}`}
                                        type="button"
                                        onClick={() => {
                                          if (isChecked) {
                                            setShiftFormSelectedDates(shiftFormSelectedDates.filter(d => d !== dayStr));
                                          } else {
                                            setShiftFormSelectedDates([...shiftFormSelectedDates, dayStr]);
                                          }
                                        }}
                                        className={`flex items-center gap-3 p-3 rounded-xl border text-left italic transition-all ${
                                          isChecked
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                            : 'bg-white text-slate-500 border-slate-100 hover:border-slate-300'
                                        }`}
                                      >
                                        {isChecked ? <CheckSquare size={13} strokeWidth={3} /> : <Square size={13} className="text-slate-300" />}
                                        <div className="min-w-0">
                                          <span className="text-[10px] font-black uppercase tracking-tight block leading-none">
                                            {format(dObj, 'eeee', { locale: it })}
                                          </span>
                                          <span className="text-[8.5px] font-bold block opacity-75 mt-0.5">
                                            {format(dObj, 'dd MMM', { locale: it })}
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 -mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100/50">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest self-center mr-1">Orari Rapidi:</span>
                    {[
                      { label: '☀️ Mattina (08:30-12:30)', start: '08:30', end: '12:30' },
                      { label: '⛅ Pomeriggio (13:30-17:30)', start: '13:30', end: '17:30' },
                      { label: '📅 Giornata (08:30-17:30)', start: '08:30', end: '17:30' }
                    ].map(slot => (
                      <button
                        key={slot.label}
                        type="button"
                        onClick={() => setShiftForm({ ...shiftForm, startTime: slot.start, endTime: slot.end })}
                        className={`text-[9px] font-black uppercase shadow-sm px-2 py-1 rounded-lg transition-all border ${
                          slot.label.includes('Pomeriggio')
                            ? 'bg-sky-50 text-sky-750 border-sky-300 hover:border-sky-500 hover:bg-sky-100'
                            : 'text-slate-600 bg-white border-slate-200/60 hover:border-blue-400 hover:text-blue-600'
                        }`}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                   <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Attività Principale</span>
                    <input required type="text" value={shiftForm.activity} onChange={e => setShiftForm({...shiftForm, activity: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner"/>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Numero di Animatori Richiesti</span>
                    <input 
                      type="number" 
                      min="1" 
                      placeholder="Es. 4"
                      value={shiftForm.requiredPeopleCount} 
                      onChange={e => setShiftForm({...shiftForm, requiredPeopleCount: e.target.value === '' ? '' : Number(e.target.value)})} 
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner"
                    />
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

                  <div className="space-y-4">
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
                            
                            // Clean up referentIds and assignments on deselect
                            let refIds = teamForm.referentIds || [];
                            let assigns = { ...(teamForm.assignments || {}) };
                            if (teamForm.animatorIds.includes(a.id)) {
                              refIds = refIds.filter(id => id !== a.id);
                              delete assigns[a.id];
                            }

                            setTeamForm({
                              ...teamForm,
                              animatorIds: ids,
                              referentIds: refIds,
                              assignments: assigns
                            });
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

                  {teamForm.animatorIds.length > 0 && (
                    <div className="space-y-3 bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                          RUOLI E GRUPPI ANIMATORI
                        </span>
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase">
                          {teamForm.animatorIds.length} Selezionati
                        </span>
                      </div>
                      <div className="space-y-3.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                        {teamForm.animatorIds.map((aid, idx) => {
                          const a = animators.find(anim => anim.id === aid);
                          if (!a) return null;
                          const isRef = (teamForm.referentIds || []).includes(a.id);
                          const currentAssign = (teamForm.assignments || {})[a.id] || '';

                          return (
                            <div key={`form-config-anim-${a.id}-${idx}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80 last:border-b-0">
                              {/* Left side: Animator Name & Star toggle */}
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const refIds = isRef
                                      ? (teamForm.referentIds || []).filter(id => id !== a.id)
                                      : [...(teamForm.referentIds || []), a.id];
                                    setTeamForm({ ...teamForm, referentIds: refIds });
                                  }}
                                  className="p-1 px-1.5 bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-55 rounded-md transition-all group flex items-center justify-center shrink-0"
                                  title={isRef ? "Rimuovi referente" : "Contrassegna come referente"}
                                >
                                  <Star 
                                    size={14} 
                                    className={`transition-all ${
                                      isRef 
                                        ? "text-amber-500 fill-amber-500 scale-110" 
                                        : "text-slate-450 hover:text-amber-500 hover:scale-110"
                                    }`} 
                                  />
                                </button>
                                <span className="text-xs font-extrabold text-slate-800 italic truncate">
                                  {a.lastName} {a.firstName}
                                </span>
                              </div>

                              {/* Right side: Grandi/Piccoli designation toggle */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newAssignments = { ...(teamForm.assignments || {}), [a.id]: 'grandi' as const };
                                    setTeamForm({ ...teamForm, assignments: newAssignments });
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                                    currentAssign === 'grandi'
                                      ? 'bg-orange-600 text-white border-orange-700 shadow-sm'
                                      : 'bg-white text-slate-600 border-slate-250 hover:bg-slate-100 hover:text-slate-800'
                                  }`}
                                >
                                  Grandi
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newAssignments = { ...(teamForm.assignments || {}), [a.id]: 'piccoli' as const };
                                    setTeamForm({ ...teamForm, assignments: newAssignments });
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
                                    currentAssign === 'piccoli'
                                      ? 'bg-teal-600 text-white border-teal-700 shadow-sm'
                                      : 'bg-white text-slate-600 border-slate-250 hover:bg-slate-100 hover:text-slate-800'
                                  }`}
                                >
                                  Piccoli
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newAssignments = { ...(teamForm.assignments || {}) };
                                    delete newAssignments[a.id];
                                    setTeamForm({ ...teamForm, assignments: newAssignments });
                                  }}
                                  className={`px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all border ${
                                    currentAssign === '' || !currentAssign
                                      ? 'bg-slate-800 text-white border-slate-900 shadow-sm'
                                      : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-55 hover:text-slate-600'
                                  }`}
                                >
                                  Nessuno
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                        <input type="text" placeholder="Note" value={newKid.note} onChange={e => setNewKid({...newKid, note: e.target.value})} className="flex-1 px-4 py-3 bg-white rounded-xl text-xs font-bold shadow-sm outline-none"/>
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
                  <div className="flex flex-wrap gap-2 -mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100/50">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest self-center mr-1">Orari Rapidi:</span>
                    {[
                      { label: '☀️ Mattina (08:30-12:30)', start: '08:30', end: '12:30' },
                      { label: '⛅ Pomeriggio (13:30-17:30)', start: '13:30', end: '17:30' },
                      { label: '📅 Giornata (08:30-17:30)', start: '08:30', end: '17:30' }
                    ].map(slot => (
                      <button
                        key={slot.label}
                        type="button"
                        onClick={() => setAbsenceForm({ ...absenceForm, startTime: slot.start, endTime: slot.end })}
                        className={`text-[9px] font-black uppercase shadow-sm px-2 py-1 rounded-lg transition-all border ${
                          slot.label.includes('Pomeriggio')
                            ? 'bg-sky-50 text-sky-755 border-sky-300 hover:border-sky-500 hover:bg-sky-100'
                            : 'text-slate-600 bg-white border-slate-200/60 hover:border-blue-400 hover:text-blue-600'
                        }`}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Motivazione / Note</span>
                    <textarea value={absenceForm.reason || ''} onChange={e => setAbsenceForm({...absenceForm, reason: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none text-sm font-bold shadow-inner" rows={2}/>
                  </div>
                </div>
              )}

              {activeTab === 'workshops' && (
                <div className="space-y-6">
                  {/* Name field */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Nome Laboratorio</span>
                    <input 
                      required 
                      type="text" 
                      placeholder="Es. Laboratorio di Falegnameria"
                      value={workshopForm.name} 
                      onChange={e => setWorkshopForm({...workshopForm, name: e.target.value})} 
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner"
                    />
                  </div>

                  {/* Max subscribers */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Numero Iscritti Massimi</span>
                    <input 
                      required 
                      type="number" 
                      min="1"
                      placeholder="Es. 20"
                      value={workshopForm.maxSubscribers} 
                      onChange={e => setWorkshopForm({...workshopForm, maxSubscribers: e.target.value === '' ? '' : Number(e.target.value)})} 
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner"
                    />
                  </div>

                  {/* Referent Animator Select list */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Seleziona Referente (Responsabile)</span>
                    <select
                      required
                      value={workshopForm.referentId}
                      onChange={e => setWorkshopForm({...workshopForm, referentId: e.target.value})}
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold shadow-inner"
                    >
                      <option value="">-- Seleziona un Animatore --</option>
                      {activeSeasonAnimatorsList.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.lastName} {a.firstName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Support Animators Checkbox Grid */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Seleziona Animatori di Supporto</span>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-4 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner custom-scrollbar">
                      {activeSeasonAnimatorsList.map(a => {
                        const isSelected = workshopForm.animatorIds.includes(a.id);
                        return (
                          <button
                            key={`${a.id}-workshop-support`}
                            type="button"
                            onClick={() => {
                              const ids = isSelected 
                                ? workshopForm.animatorIds.filter(id => id !== a.id)
                                : [...workshopForm.animatorIds, a.id];
                              setWorkshopForm({...workshopForm, animatorIds: ids});
                            }}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left italic ${
                              isSelected 
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                                : 'bg-white text-slate-500 border-slate-100'
                            }`}
                          >
                            <span className="text-[11px] font-bold truncate">{a.lastName} {a.firstName}</span>
                          </button>
                        );
                      })}
                      {activeSeasonAnimatorsList.length === 0 && (
                        <p className="col-span-full py-4 text-center text-[10px] font-black text-slate-300 uppercase">
                          Nessun animatore iscritto in questa stagione Ledger
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Active Weeks Checkbox Grid */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Seleziona in quali Settimane attivare</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-4 bg-slate-50 rounded-[2rem] border border-slate-100 shadow-inner custom-scrollbar">
                      {weeks.map((w, idx) => {
                        const isSelected = workshopForm.weeks.includes(w.id);
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => {
                              const ids = isSelected
                                ? workshopForm.weeks.filter(id => id !== w.id)
                                : [...workshopForm.weeks, w.id];
                              setWorkshopForm({...workshopForm, weeks: ids});
                            }}
                            className={`flex items-center justify-between p-3.5 rounded-xl border text-left ${
                              isSelected
                                ? 'bg-orange-50/30 border-orange-200 text-orange-900 shadow-sm font-extrabold'
                                : 'bg-white text-slate-500 border-slate-100'
                            }`}
                          >
                            <span className="text-[10px] font-bold truncate">Settimana {idx + 1} ({w.label.replace('Settimana ', '')})</span>
                            <div className={`w-4 h-4 rounded border flex items-center shrink-0 justify-center ${isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200'}`}>
                              {isSelected && <Check size={10} />}
                            </div>
                          </button>
                        );
                      })}
                      {weeks.length === 0 && (
                        <p className="col-span-full py-4 text-center text-[10px] font-black text-red-400 uppercase">
                          Nessuna settimana feriale avviata. Abilita dei giorni in alto.
                        </p>
                      )}
                    </div>
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

      {/* Oratorio Feriale Settings Modal */}
      {isOratorioSettingsOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 fade-in duration-200">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase italic flex items-center gap-2">
                  <Sun size={20} className="text-orange-500" />
                  Intestazione &amp; Logo Oratorio
                </h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configura nome e logo visibili nei PDF dell'Oratorio Feriale</p>
              </div>
              <button 
                onClick={() => setIsOratorioSettingsOpen(false)} 
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveOratorioSettings} className="p-8 space-y-6">
              {/* Form Input: Name */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                  Nome Oratorio Feriale (per Intestazioni)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Oratorio San Luigi"
                  value={oratorioNameForm}
                  onChange={(e) => setOratorioNameForm(e.target.value)}
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

              {/* Form Input: Logo */}
              <div className="space-y-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                  Logo Oratorio Feriale
                </span>
                
                <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-3xl bg-slate-50/50 border border-slate-100 shadow-inner">
                  {/* Current Logo Preview */}
                  <div className="relative group shrink-0">
                    {oratorioLogoUrlForm ? (
                      <div className="relative">
                        <img 
                          src={oratorioLogoUrlForm} 
                          alt="Logo Oratorio" 
                          className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-md bg-white"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={() => setOratorioLogoUrlForm('')}
                          className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-transform hover:scale-110"
                          title="Rimuovi Logo"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 bg-slate-100/80 rounded-2xl border border-slate-200/60 flex flex-col items-center justify-center text-slate-400">
                        <Sun size={24} className="text-slate-300" />
                        <span className="text-[8px] uppercase font-bold mt-1 text-slate-400">Default</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Upload Controls */}
                  <div className="flex-1 w-full space-y-3">
                    {/* File Upload */}
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        id="oratorio-logo-file-upload"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setOratorioLogoUrlForm(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <label 
                        htmlFor="oratorio-logo-file-upload"
                        className="w-full border border-dashed border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center gap-1 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition-all text-slate-500 hover:text-blue-600"
                      >
                        <span className="text-[10px] font-black uppercase tracking-wider text-center block">Scegli file logo...</span>
                      </label>
                    </div>

                    {/* URL Input */}
                    <div className="space-y-1">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block ml-1">Oppure inserisci URL immagine</span>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={oratorioLogoUrlForm.startsWith('data:') ? '' : oratorioLogoUrlForm}
                        onChange={(e) => setOratorioLogoUrlForm(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOratorioSettingsOpen(false)}
                  className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={savingOratorioSettings}
                  className="px-8 py-3 bg-slate-900 hover:bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {savingOratorioSettings ? 'Salvataggio...' : 'Salva'}
                </button>
              </div>
            </form>
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
              {selectedGridAbsence.existingAbs?.id.startsWith('virtual-') ? (
                <div className="space-y-4 py-2">
                  <div className="p-5 bg-amber-50/60 border border-amber-200 rounded-2xl">
                    <div className="flex items-center gap-2 text-amber-800 mb-2.5">
                      <AlertCircle size={18} className="shrink-0" />
                      <span className="text-xs font-black uppercase tracking-wider">Assenza Settimanale Profilo</span>
                    </div>
                    <p className="text-[10px] font-bold text-amber-700 uppercase leading-relaxed">
                      L&apos;animatore è impostato come non presente per questa settimana nelle impostazioni della sua iscrizione (fatta sulla chip &quot;ISCRITTO&quot; nel database animatori).
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed mt-4">
                      Se vuoi che l&apos;animatore sia presente in questa settimana, vai nella lista animatori, clicca sulla chip &quot;ISCRITTO&quot; del suo profilo e abilita questa settimana feriale nelle sue presenze.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGridAbsence(null);
                      setCustomAbsTime({ show: false, startTime: '08:30', endTime: '13:30', reason: '' });
                    }}
                    className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition duration-150 active:scale-95 shadow-md flex items-center justify-center gap-2"
                  >
                    Chiudi
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-medium">Seleziona Tipo di Assenza</span>
                  
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
                    ? 'border-sky-500 bg-sky-50/50 text-sky-800' 
                    : 'border-slate-100 hover:border-sky-250 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-wider block">⛅ Solo Pomeriggio</span>
                  <span className="text-[10px] font-normal text-slate-400 font-medium">Lavora solo al pomeriggio, assente la mattina</span>
                </div>
                {selectedGridAbsence.existingAbs && selectedGridAbsence.existingAbs.reason === 'Solo Pomeriggio' && <Check size={16} className="text-sky-600" />}
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
                  <div className="flex flex-wrap gap-1.5 bg-white border border-slate-200/50 p-2 rounded-2xl shadow-inner">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest self-center mr-1">Orari:</span>
                    {[
                      { label: '☀️ Mattina (08:30-12:30)', start: '08:30', end: '12:30' },
                      { label: '⛅ Pomeriggio (13:30-17:30)', start: '13:30', end: '17:30' },
                      { label: '📅 Giornata (08:30-17:30)', start: '08:30', end: '17:30' }
                    ].map(slot => (
                      <button
                        key={slot.label}
                        type="button"
                        onClick={() => setCustomAbsTime({ ...customAbsTime, startTime: slot.start, endTime: slot.end })}
                        className={`text-[9px] font-bold px-2 py-1 rounded-lg transition-all border ${
                          slot.label.includes('Pomeriggio')
                            ? 'bg-sky-50 text-sky-755 border-sky-200 hover:border-sky-400 hover:bg-sky-100'
                            : 'text-slate-600 bg-slate-50 border-slate-100 hover:border-purple-300'
                        }`}
                      >
                        {slot.label}
                      </button>
                    ))}
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
                </>
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

      {/* Weeks Presence Modal */}
      {weeksModalOpen && selectedWeeksAnimator && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-white animate-in zoom-in fade-in duration-300">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase italic">
                  Presenze Settimanali
                </h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                  {selectedWeeksAnimator.firstName} {selectedWeeksAnimator.lastName} — {activeSeason}
                </p>
              </div>
              <button 
                onClick={() => setWeeksModalOpen(false)} 
                className="p-2.5 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* Enrollment State switch */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">Iscrizione Attiva</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Stagione feriale {activeSeason}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTempIsEnrollActive(!tempIsEnrollActive)}
                  className={`w-12 h-6.5 rounded-full p-1 transition-all duration-300 ${
                    tempIsEnrollActive ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4.5 h-4.5 rounded-full bg-white transition-all shadow transform ${
                      tempIsEnrollActive ? 'translate-x-[22px]' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {tempIsEnrollActive && (
                <div className="space-y-3.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-medium">Seleziona le settimane di presenza:</span>
                  
                  {weeks.length === 0 ? (
                    <div className="p-6 bg-amber-50/50 border border-amber-100 rounded-2xl text-center">
                      <p className="text-[10px] font-black text-amber-850 uppercase italic tracking-wide">Nessuna settimana programmata</p>
                      <p className="text-[9px] text-slate-450 font-bold uppercase mt-1 leading-relaxed">
                        Aggiungi le giornate attive tramite l&apos;interfaccia dei Turni o Turnazioni per generare le settimane di apertura.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                      {weeks.map((week, index) => {
                        const isChecked = tempPresentWeeks.includes(week.id);
                        return (
                          <button
                            key={week.id}
                            type="button"
                            onClick={() => {
                              if (isChecked) {
                                setTempPresentWeeks(tempPresentWeeks.filter(id => id !== week.id));
                              } else {
                                setTempPresentWeeks([...tempPresentWeeks, week.id]);
                              }
                            }}
                            className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left font-bold transition-all ${
                              isChecked
                                ? 'border-indigo-500 bg-indigo-50/40 text-indigo-900 shadow-sm'
                                : 'border-slate-100 hover:border-indigo-200 text-slate-600 hover:bg-slate-50/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 bg-white'
                              }`}>
                                {isChecked && <Check size={11} strokeWidth={3} />}
                              </div>
                              <span className="text-xs font-black uppercase tracking-wider">Settimana {index + 1}</span>
                            </div>
                            <span className="text-[9px] font-mono tracking-wider font-bold text-slate-400">
                              {week.label.replace('Settimana', '').trim()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-[9px] text-slate-400 font-bold leading-relaxed uppercase tracking-wider">
                    ⚠️ NOTA: Se un&apos;animatore non è selezionato in una specifica settimana feriale, verrà considerato e stampato come ASSENTE automatico per tutti i giorni di quella settimana.
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setWeeksModalOpen(false)}
                className="bg-white text-slate-500 border border-slate-200 text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-full hover:bg-slate-100 transition active:scale-95"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveWeeks}
                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-full shadow-lg hover:shadow-blue-50 transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Salva Modifiche
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OratorioFeriale;
