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
  GraduationCap,
  DoorOpen,
  FileDown
} from 'lucide-react';
import { format, addWeeks, isBefore, isAfter, startOfDay, parseISO, getDay } from 'date-fns';
import { it } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  roomIds?: string[];
  roomNames?: string[];
}

const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

const Catechism: React.FC = () => {
  const { currentParish } = useParish();
  const groupsColl = useParishCollection('catechism_groups');
  const volunteersColl = useParishCollection('volunteers');
  const calendarsColl = useParishCollection('calendars');
  const calEventsColl = useParishCollection('calendar_events');
  const roomsColl = useParishCollection('rooms');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [groups, setGroups] = useState<CatechismGroup[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [parishInfo, setParishInfo] = useState<any>({
    name: '',
    diocese: '',
    pastoralCommunity: '',
    address: '',
    phone: '',
    email: '',
    logoUrl: ''
  });
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
    roomIds: [] as string[],
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

    // 4. Fetch Rooms (Classrooms)
    const unsubRooms = onSnapshot(roomsColl, (snap) => {
      setRooms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rooms');
    });

    // 5. Fetch Parish Settings
    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    }, (error) => {
      // Allow minor fallback if doc settings don't exist yet
      console.warn("No settings/parish document yet", error);
    });

    return () => {
      unsub();
      unsubV();
      unsubCal();
      unsubRooms();
      unsubParish();
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
        title: `CATECHISMO - ${data.pathYear}`,
        start: startTime,
        end: endTime,
        calendarId: catechismCalendarId,
        description: `Gruppo: ${data.name} (Nati nel ${data.year})\nCatechisti: ${(data.catechistNames || []).join(', ')}\nAule: ${(data.roomNames || []).join(', ')}\nNote: ${data.notes || ''}`,
        sourceCatechismId: groupId,
        isCatechism: true,
        year: data.year,
        name: data.name,
        pathYear: data.pathYear,
        catechistNames: data.catechistNames,
        rooms: (data.roomNames || []).join(', '),
        roomIds: data.roomIds || []
      });
      eventIds.push(eventRef.id);
    }

    await updateDoc(doc(groupsColl, groupId), { calendarEventIds: eventIds });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedCatechists = volunteers.filter(v => form.catechistIds.includes(v.id));
    const catechistNames = selectedCatechists.map(v => `${v.lastName} ${v.firstName}`);

    const selectedRooms = rooms.filter(r => form.roomIds.includes(r.id));
    const roomNames = selectedRooms.map(r => r.name);

    const payload = {
      name: form.name,
      year: form.year,
      pathYear: form.pathYear,
      catechismYear: form.catechismYear,
      dayOfWeek: form.dayOfWeek,
      time: form.time,
      catechistIds: form.catechistIds,
      catechistNames,
      roomIds: form.roomIds,
      roomNames,
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
        roomIds: g.roomIds || [],
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
        roomIds: [],
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

  const downloadGroupPresentationPDF = (group: CatechismGroup) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const navyColor: [number, number, number] = [79, 70, 229]; // Indigo-600 #4f46e5
    const slateColor: [number, number, number] = [30, 41, 59]; // Slate-800
    const lightSlate: [number, number, number] = [100, 116, 139]; // Slate-500
    const bgLight: [number, number, number] = [248, 250, 252]; // Slate-50
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Header (Letterhead / Intestazione)
    // Header Background
    doc.setFillColor(250, 250, 250); // Light neutral letterhead region
    doc.rect(0, 0, pageWidth, 35, 'F');

    const logoUrl = parishInfo?.logoUrl || currentParish?.logoUrl;
    if (logoUrl) {
      try {
        doc.addImage(logoUrl, 'PNG', 20, 6, 22, 22);
      } catch (e) {
        doc.setDrawColor(79, 70, 229);
        doc.circle(31, 17, 10, 'S');
      }
    }

    const textStartX = logoUrl ? 47 : 20;

    // Parish Info
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59); // slate-800
    const finalParishName = parishInfo?.name || currentParish?.name || 'PARROCCHIA / ORATORIO';
    doc.text(finalParishName.toUpperCase(), textStartX, 12);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate-500

    let hRowY = 17;
    if (parishInfo?.diocese) {
      doc.text(parishInfo.diocese, textStartX, hRowY);
      hRowY += 4.5;
    }
    if (parishInfo?.pastoralCommunity) {
      doc.text(parishInfo.pastoralCommunity, textStartX, hRowY);
      hRowY += 4.5;
    }
    
    // Combined contacts row
    const contactParts = [];
    if (parishInfo?.address) contactParts.push(parishInfo.address);
    if (parishInfo?.phone) contactParts.push(`Tel: ${parishInfo.phone}`);
    if (parishInfo?.email) contactParts.push(parishInfo.email);
    
    if (contactParts.length > 0) {
      doc.text(contactParts.join('  |  '), textStartX, hRowY);
    }
    
    // Indigo Badge/Box at Top Right
    const boxWidth = 58;
    const boxHeight = 23;
    const boxX = pageWidth - 20 - boxWidth;
    const boxY = 6;

    doc.setFillColor(79, 70, 229); // Indigo-600 #4f46e5
    doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 3, 3, 'F');

    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont('Helvetica', 'bold');
    doc.text('GRUPPO CATECHISMO', boxX + boxWidth / 2, boxY + 7, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Anno Past: ${group.catechismYear || 'N/D'}`, boxX + boxWidth / 2, boxY + 13, { align: 'center' });
    doc.text(`Iscritti: ${group.subscriberCount || 0}`, boxX + boxWidth / 2, boxY + 20, { align: 'center' });

    // Dividers beneath the letterhead
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.8);
    doc.line(20, 35, pageWidth - 20, 35);

    // 2. Main Title & Doc Purpose
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text(group.name.toUpperCase(), 20, 46);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text(`Presentazione del Percorso di Catechismo: ${group.pathYear || 'Incontri'}`, 20, 52);

    // 3. Metadata Grid (Boxed info card) starts at boxY = 58
    const infoY = 58;
    const boxHeightVal = 42;
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.rect(20, infoY, 170, boxHeightVal, 'F');
    // and thin border
    doc.setDrawColor(226, 232, 240);
    doc.rect(20, infoY, 170, boxHeightVal, 'S');

    // Populate the Info Card with two columns
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    
    // Left Column
    doc.setTextColor(lightSlate[0], lightSlate[1], lightSlate[2]);
    doc.text("GIORNO DI INCONTRO:", 25, infoY + 7);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
    const dayName = dayNames[parseInt(group.dayOfWeek)] || 'Non specificato';
    doc.text(`${dayName} ore ${group.time || '17:00'}`, 25, infoY + 12);

    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(lightSlate[0], lightSlate[1], lightSlate[2]);
    doc.text("SPAZI E AULE:", 25, infoY + 21);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
    doc.text(group.roomNames?.join(', ') || 'Aule assegnate in loco', 25, infoY + 26);

    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(lightSlate[0], lightSlate[1], lightSlate[2]);
    doc.text("DESTINATARI:", 25, infoY + 34);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
    doc.text(`Giovanissimi nati nel ${group.year || 'N/D'}`, 25, infoY + 38);

    // Right Column
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(lightSlate[0], lightSlate[1], lightSlate[2]);
    doc.text("CATECHISTI REFERENTI:", 110, infoY + 7);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
    const catechistsStr = group.catechistNames?.join(', ') || 'In fase di assegnazione';
    const splitCatechists = doc.splitTextToSize(catechistsStr, 70);
    doc.text(splitCatechists, 110, infoY + 12);

    // notes block if present
    let currentY = infoY + boxHeightVal + 8;
    if (group.notes) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(79, 70, 229);
      doc.text("NOTE ED INDICAZIONI DEL PERCORSO", 20, currentY);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
      const splitNotes = doc.splitTextToSize(group.notes, 160);
      const notesHeight = splitNotes.length * 5;
      
      doc.setDrawColor(79, 70, 229);
      doc.setLineWidth(1.2);
      doc.line(20, currentY + 3, 20, currentY + 3 + notesHeight);

      doc.text(splitNotes, 24, currentY + 7);
      currentY += notesHeight + 10;
    } else {
      currentY += 2;
    }

    // 4. Meeting dates table
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
    doc.text("CALENDARIO DEGLI INCONTRI", 20, currentY);
    currentY += 4;

    const tableRows = (group.meetingDates || []).map((dateStr, idx) => {
      let formattedDate = dateStr;
      try {
        formattedDate = format(parseISO(dateStr), 'EEEE dd MMMM yyyy', { locale: it });
        // Capitalize first letter of weekday
        formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
      } catch (e) {
        formattedDate = dateStr;
      }
      return [
        `${idx + 1}° Incontro`,
        formattedDate,
        group.time || '17:00',
        group.roomNames?.join(', ') || 'Aula del percorso'
      ];
    });

    if (tableRows.length === 0) {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(lightSlate[0], lightSlate[1], lightSlate[2]);
      doc.text("Nessun incontro programmato.", 20, currentY + 4);
    } else {
      autoTable(doc, {
        startY: currentY,
        head: [['Incontro', 'Data', 'Orario', 'Aula / Sede']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: navyColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9.5,
          halign: 'left'
        },
        bodyStyles: {
          fontSize: 8.5,
          textColor: slateColor
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252] // Slate-50 zebra color
        },
        margin: { left: 20, right: 20 },
        styles: {
          font: 'Helvetica',
          cellPadding: 3.5
        }
      });
    }

    doc.save(`Presentazione_Catechismo_${group.name.replace(/\s+/g, '_')}_${group.catechismYear.replace(/\//g, '-')}.pdf`);
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
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-95 text-[10px]"
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
          <div className="space-y-4">
            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
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
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                              <GraduationCap size={22} />
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-black text-slate-900 italic">{group.name}</h3>
                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase rounded-full tracking-wider">
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
                            {group.roomNames && group.roomNames.length > 0 && (
                              <div className="flex items-center gap-2 text-indigo-650 font-bold shrink-0">
                                <DoorOpen size={12} className="text-indigo-500" />
                                <span className="text-[10px] tracking-tight">{group.roomNames.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 shrink-0">
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
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => downloadGroupPresentationPDF(group)} 
                              title="Scarica Presentazione PDF"
                              className="p-2.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-full transition-all border border-emerald-100 shadow-sm hover:scale-110"
                            >
                              <FileDown size={18} />
                            </button>
                            <button onClick={() => openModal(group)} className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100 shadow-sm hover:scale-110">
                              <Pencil size={18} />
                            </button>
                            <button onClick={() => handleDeleteGroup(group.id)} className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-all border border-red-100 shadow-sm hover:scale-110">
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

            {/* Mobile/Tablet Card View */}
            <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
              {groups.map((group) => (
                <div key={group.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 hover:border-indigo-200 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                        <GraduationCap size={20} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-slate-900 italic truncate">{group.name}</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{group.pathYear || 'Percorso'}</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase rounded-full tracking-wider shrink-0">
                      {group.catechismYear}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-50">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Incontro</p>
                      <div className="flex items-center gap-2 text-slate-700">
                        <CalendarIcon size={12} className="text-indigo-500" />
                        <span className="text-[11px] font-bold">{dayNames[parseInt(group.dayOfWeek)]}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Clock size={11} />
                        <span className="text-[10px] font-black">{group.time}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Iscritti</p>
                      <div className="flex items-center gap-2">
                        <Users size={12} className="text-indigo-500" />
                        <span className="text-[11px] font-black text-slate-700">{group.subscriberCount}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Catechista</p>
                    <p className="text-[11px] font-bold text-slate-600 truncate">
                      {group.catechistNames?.join(', ') || 'Nessuno assegnato'}
                    </p>
                  </div>

                  {group.roomNames && group.roomNames.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aula/Aule</p>
                      <div className="flex items-center gap-1.5 text-indigo-650 font-bold">
                        <DoorOpen size={12} className="text-indigo-500" />
                        <span className="text-[11px] font-semibold">{group.roomNames.join(', ')}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-[9px] font-black uppercase tracking-widest">
                      {group.documents?.length > 0 ? (
                        <span className="text-indigo-600">{group.documents.length} documenti</span>
                      ) : (
                        <span className="text-slate-300 italic">No documenti</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => downloadGroupPresentationPDF(group)} 
                        title="Scarica Presentazione PDF"
                        className="p-2 text-emerald-600 bg-emerald-50 rounded-full border border-emerald-100 hover:bg-emerald-100 transition shadow-sm flex items-center gap-1.5"
                      >
                        <FileDown size={14} />
                      </button>
                      <button onClick={() => openModal(group)} className="p-2 text-blue-600 bg-blue-50 rounded-full border border-blue-100">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => handleDeleteGroup(group.id)} className="p-2 text-red-600 bg-red-50 rounded-full border border-red-100">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-20 md:py-32 bg-white rounded-[2.5rem] md:rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center space-y-6 px-6">
             <div className="w-20 h-20 md:w-24 md:h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
               <GraduationCap size={40} className="md:w-12 md:h-12" strokeWidth={1} />
             </div>
             <div className="space-y-2">
               <h3 className="text-lg md:text-xl font-black text-slate-900">Nessun gruppo configurato</h3>
               <p className="text-slate-400 font-medium text-sm">Inizia creando il primo percorso di catechismo.</p>
             </div>
             <button
               onClick={() => openModal()}
               className="bg-blue-600 text-white px-8 py-3.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-95 text-[10px]"
             >
               Crea Gruppo
             </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 md:p-4 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
          <div className="bg-white w-full max-w-5xl rounded-[2rem] md:rounded-[2.5rem] lg:rounded-[3rem] shadow-2xl h-[95vh] md:h-[90vh] flex flex-col animate-in fade-in zoom-in duration-300">
            <div className="p-6 md:p-8 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shadow-inner">
                  <GraduationCap size={20} className="md:w-6 md:h-6" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-tight">{editingId ? 'Modifica Gruppo' : 'Nuovo Gruppo'}</h2>
                  <p className="text-[9px] md:text-[10px] uppercase font-black tracking-[0.2em] text-indigo-500">Impostazioni Percorso</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/20 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                {/* Info Base */}
                <div className="space-y-6 md:space-y-8">
                  <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-200 shadow-sm space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                       <Info size={14} className="text-indigo-500" /> Dati Generali
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2 md:col-span-2">
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
                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1">Anno Nascita</label>
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
                        <label className="text-[11px] font-black text-slate-500 uppercase ml-1">Anno Percorso</label>
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
                      <label className="text-[11px] font-black text-slate-500 uppercase ml-1">Catechisti</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus-within:border-indigo-400 transition-all custom-scrollbar">
                        {volunteers.map(v => (
                          <label key={v.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 cursor-pointer hover:border-indigo-200 transition-all group">
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${form.catechistIds.includes(v.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'}`}>
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
                            <span className="text-xs font-bold text-slate-700 truncate">{v.lastName} {v.firstName}</span>
                          </label>
                        ))}
                      </div>
                      {volunteers.length === 0 && (
                        <p className="text-[10px] text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-center gap-2">
                          <AlertCircle size={14} /> Nessun volontario "CATECHISTA" trovato.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-200 shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                          <FilePlus size={14} className="text-indigo-500" /> Documenti
                        </h3>
                        <label className="p-2.5 bg-blue-600 text-white rounded-full cursor-pointer hover:bg-blue-700 transition-all shadow-md active:scale-95">
                          <Plus size={18} />
                          <input type="file" onChange={handleFileUpload} className="hidden" />
                        </label>
                      </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {form.documents.map((doc, idx) => (
                        <div key={doc.id} className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-full text-slate-400">
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
                <div className="space-y-6 md:space-y-8">
                  <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] text-white space-y-8 shadow-xl">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                      <CalendarIcon size={14} className="text-indigo-400" /> Pianificazione Incontri
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                    {/* Selezione Aule / Aule utilizzate */}
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2">
                        <DoorOpen size={14} className="text-indigo-400" /> Aule Utilizzate per gli Incontri
                      </label>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/10 max-h-40 overflow-y-auto custom-scrollbar">
                        {rooms.length === 0 ? (
                          <p className="text-[10px] text-slate-500 italic p-1">Nessuna aula configurata in "Gestione Sale".</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {rooms.map((room) => {
                              const isChecked = form.roomIds.includes(room.id);
                              return (
                                <label key={room.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-all select-none">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const newIds = e.target.checked
                                        ? [...form.roomIds, room.id]
                                        : form.roomIds.filter(id => id !== room.id);
                                      setForm({ ...form, roomIds: newIds });
                                    }}
                                    className="w-4 h-4 rounded border-white/25 text-indigo-650 bg-white/10 focus:ring-indigo-500 cursor-pointer"
                                  />
                                  <span className="text-xs font-bold text-slate-200 truncate">{room.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white/5 p-5 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-white/10 space-y-6">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest text-center">Generazione Automatica Date</p>
                      
                      <div className="grid grid-cols-1 gap-4">
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                          <div className="w-full sm:flex-1 space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Dal</label>
                            <input
                              type="date"
                              value={form.dateRange.start}
                              onChange={(e) => setForm({ ...form, dateRange: { ...form.dateRange, start: e.target.value } })}
                              className="w-full px-4 py-3 rounded-xl bg-white/5 border-none text-xs font-bold text-white outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <ArrowRight size={16} className="text-slate-600 hidden sm:block mt-5" />
                          <div className="w-full sm:flex-1 space-y-1">
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
                        className="w-full py-4 bg-blue-600 text-white rounded-full font-bold uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 text-[10px]"
                      >
                        Genera Sequenza Date
                      </button>
                    </div>

                    {/* Manual Date Entry */}
                    <div className="bg-white/5 p-5 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-white/10 space-y-4">
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
                          className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all shadow-md active:scale-95 shrink-0"
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                        {form.meetingDates.map((date, idx) => (
                          <div key={idx} className="px-3 py-2 bg-white/5 rounded-xl border border-white/5 text-[11px] font-bold text-slate-300 flex items-center justify-between group/date">
                            {format(parseISO(date), 'dd/MM/yyyy')}
                            <button 
                              type="button"
                              onClick={() => setForm(p => ({ ...p, meetingDates: p.meetingDates.filter((_, i) => i !== idx) }))}
                              className="text-red-400 opacity-0 group-hover/date:opacity-100 lg:opacity-0 transition-opacity"
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

                  <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-200 shadow-sm space-y-4">
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

              <div className="flex flex-col sm:flex-row gap-4 pt-12">
                <button
                  type="button"
                  onClick={closeModal}
                  className="bg-white border border-slate-200 text-slate-600 px-10 py-5 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-12 py-5 rounded-full font-bold uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-xl active:scale-95 text-[10px] flex-1"
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
