import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc, 
  query, 
  orderBy,
  serverTimestamp,
  setDoc 
} from 'firebase/firestore';
import { 
  Plus, 
  Church, 
  Calendar, 
  Clock, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  CalendarPlus,
  Repeat,
  Info,
  Heart,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Download,
  FileDown,
  Cross
} from 'lucide-react';
import { format, parse, isValid, startOfWeek, addDays, isSameDay, getDay, setHours, setMinutes, setSeconds, isWithinInterval, addWeeks, subWeeks, endOfWeek } from 'date-fns';
import { it } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const DAYS_OF_WEEK = [
  { id: 1, label: 'Lunedì' },
  { id: 2, label: 'Martedì' },
  { id: 3, label: 'Mercoledì' },
  { id: 4, label: 'Giovedì' },
  { id: 5, label: 'Venerdì' },
  { id: 6, label: 'Sabato' },
  { id: 0, label: 'Domenica' }
];

export default function Liturgies() {
  const { currentParish } = useParish();
  const litTemplatesColl = useParishCollection('liturgy_templates');
  const litSpecialsColl = useParishCollection('liturgy_specials');
  const litIntentionsColl = useParishCollection('liturgy_intentions');
  const litExceptionsColl = useParishCollection('liturgy_exceptions');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [templates, setTemplates] = useState<any[]>([]);
  const [specials, setSpecials] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'recurring' | 'special'>('recurring');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isIntentionsModalOpen, setIsIntentionsModalOpen] = useState(false);
  const [intentionsWeekStart, setIntentionsWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [liturgyIntentions, setLiturgyIntentions] = useState<any[]>([]);
  const [liturgyExceptions, setLiturgyExceptions] = useState<any[]>([]);
  const [parishInfo, setParishInfo] = useState<any>({
    name: 'Parrocchia S. Maria Assunta',
    address: 'Via della Chiesa, 1 - 00100 Roma (RM)',
    logoUrl: '',
    diocese: '',
    pastoralCommunity: ''
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Form State
  const [formData, setFormData] = useState({
    title: 'S. Messa',
    schedule: DAYS_OF_WEEK.map(d => ({ day: d.id, times: [] as string[] })),
    validFrom: format(new Date(), 'yyyy-MM-dd'),
    validUntil: format(new Date(new Date().getFullYear(), 11, 31), 'yyyy-MM-dd'),
    location: '',
    notes: '',
    start: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    end: format(new Date(), "yyyy-MM-dd'T'HH:mm")
  });

  const [dayTimes, setDayTimes] = useState<{ [key: number]: string }>(
    DAYS_OF_WEEK.reduce((acc, d) => ({ ...acc, [d.id]: '08:00' }), {})
  );

  useEffect(() => {
    const qT = query(litTemplatesColl, orderBy('validFrom', 'desc'));
    const unsubT = onSnapshot(qT, (snapshot) => {
      setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liturgy_templates');
    });

    const qS = query(litSpecialsColl, orderBy('start', 'desc'));
    const unsubS = onSnapshot(qS, (snapshot) => {
      setSpecials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liturgy_specials');
    });

    const unsubIntentions = onSnapshot(litIntentionsColl, (snap) => {
      setLiturgyIntentions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liturgy_intentions');
    });

    const unsubExceptions = onSnapshot(litExceptionsColl, (snap) => {
      setLiturgyExceptions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liturgy_exceptions');
    });

    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/parish');
    });

    return () => {
      unsubT();
      unsubS();
      unsubIntentions();
      unsubExceptions();
      unsubParish();
    };
  }, []);

  useEffect(() => {
    const editId = searchParams.get('edit');
    const type = searchParams.get('type');

    if (editId && type) {
      if (type === 'special' && specials.length > 0) {
        const item = specials.find(s => s.id === editId);
        if (item) {
          setActiveTab('special');
          handleEdit(item);
          setSearchParams({}, { replace: true });
        }
      } else if (type === 'recurring' && templates.length > 0) {
        const item = templates.find(t => t.id === editId);
        if (item) {
          setActiveTab('recurring');
          handleEdit(item);
          setSearchParams({}, { replace: true });
        }
      }
    }
  }, [searchParams, templates, specials]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const collectionName = activeTab === 'recurring' ? 'liturgy_templates' : 'liturgy_specials';
    const targetColl = activeTab === 'recurring' ? litTemplatesColl : litSpecialsColl;
    
    let dataToSave: any = {
      title: formData.title,
      location: formData.location,
      notes: formData.notes,
      updatedAt: serverTimestamp()
    };

    if (activeTab === 'recurring') {
      // Filter out days with no times
      const activeSchedule = formData.schedule.filter(s => s.times.length > 0);
      if (activeSchedule.length === 0) {
        alert("Inserisci almeno un orario per almeno un giorno.");
        return;
      }

      dataToSave = {
        ...dataToSave,
        schedule: activeSchedule,
        validFrom: formData.validFrom,
        validUntil: formData.validUntil
      };
    } else {
      dataToSave = {
        ...dataToSave,
        start: formData.start,
        end: formData.end
      };
    }

    try {
      if (editingId) {
        await updateDoc(doc(targetColl, editingId), dataToSave);
      } else {
        await addDoc(targetColl, {
          ...dataToSave,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving liturgy: ", error);
      handleFirestoreError(error, OperationType.WRITE, collectionName);
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    
    let schedule = item.schedule;
    if (!schedule) {
      // Migrate old data on the fly for the form
      const oldDays = item.days || (item.dayOfWeek !== undefined ? [item.dayOfWeek] : []);
      const oldTimes = item.times || (item.time ? [item.time] : []);
      schedule = DAYS_OF_WEEK.map(d => ({
        day: d.id,
        times: oldDays.includes(d.id) ? [...oldTimes] : []
      }));
    } else {
      // Ensure all 7 days are represented in form state for easy editing
      schedule = DAYS_OF_WEEK.map(d => {
        const found = item.schedule.find((s: any) => s.day === d.id);
        return { day: d.id, times: found ? found.times : [] };
      });
    }

    setFormData({
      ...formData,
      ...item,
      schedule
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, collectionName: string) => {
    const targetColl = collectionName === 'liturgy_templates' ? litTemplatesColl : litSpecialsColl;
    try {
      await deleteDoc(doc(targetColl, id));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Delete failed:", err);
      handleFirestoreError(err, OperationType.DELETE, collectionName);
    }
  };

  const addTimeToDay = (dayId: number) => {
    const timeToAdd = dayTimes[dayId];
    if (!timeToAdd) return;
    
    setFormData(prev => ({
      ...prev,
      schedule: prev.schedule.map(s => 
        s.day === dayId 
          ? { ...s, times: s.times.includes(timeToAdd) ? s.times : [...s.times, timeToAdd].sort() } 
          : s
      )
    }));
  };

  const clearDayTimes = (dayId: number) => {
    setFormData(prev => ({
      ...prev,
      schedule: prev.schedule.map(s => 
        s.day === dayId ? { ...s, times: [] } : s
      )
    }));
  };

  const removeTimeFromDay = (dayId: number, time: string) => {
    setFormData(prev => ({
      ...prev,
      schedule: prev.schedule.map(s => 
        s.day === dayId 
          ? { ...s, times: s.times.filter(t => t !== time) } 
          : s
      )
    }));
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      title: 'S. Messa',
      schedule: DAYS_OF_WEEK.map(d => ({ day: d.id, times: [] as string[] })),
      validFrom: format(new Date(), 'yyyy-MM-dd'),
      validUntil: format(new Date(new Date().getFullYear(), 11, 31), 'yyyy-MM-dd'),
      location: '',
      notes: '',
      start: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      end: format(new Date(), "yyyy-MM-dd'T'HH:mm")
    });
    setDayTimes(DAYS_OF_WEEK.reduce((acc, d) => ({ ...acc, [d.id]: '08:00' }), {}));
  };

  const getWeekLiturgyInstances = () => {
    const weekStart = intentionsWeekStart;
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    
    const instances: any[] = [];
    
    templates.forEach(t => {
      t.schedule?.forEach((s: any) => {
        let day = weekStart;
        for (let i = 0; i < 7; i++) {
          const currentDay = addDays(weekStart, i);
          if (getDay(currentDay) === s.day) {
            s.times?.forEach((timeStr: string) => {
              const [h, m] = timeStr.split(':').map(Number);
              const start = setSeconds(setMinutes(setHours(currentDay, h), m), 0);
              const dateStr = format(start, 'yyyy-MM-dd');

              const isExcluded = liturgyExceptions.some(ex => 
                ex.templateId === t.id && 
                ex.date === dateStr && 
                ex.time === timeStr
              );
              
              if (!isExcluded) {
                instances.push({
                  id: t.id,
                  type: 'recurring',
                  title: t.title,
                  start: start,
                  dateStr: dateStr,
                  timeStr: timeStr
                });
              }
            });
          }
        }
      });
    });
    
    specials.forEach(s => {
      const start = new Date(s.start);
      if (isWithinInterval(start, { start: weekStart, end: weekEnd })) {
        instances.push({
          id: s.id,
          type: 'special',
          title: s.title,
          start: start,
          dateStr: format(start, 'yyyy-MM-dd'),
          timeStr: format(start, 'HH:mm')
        });
      }
    });

    return instances.sort((a, b) => a.start.getTime() - b.start.getTime());
  };

  const handleUpdateIntentions = async (instance: any, names: string[]) => {
    const intentionId = `${instance.id}_${instance.dateStr}_${instance.timeStr}`;
    try {
      if (names.length === 0) {
        await deleteDoc(doc(litIntentionsColl, intentionId));
      } else {
        await setDoc(doc(litIntentionsColl, intentionId), {
          liturgyId: instance.id,
          date: instance.dateStr,
          time: instance.timeStr,
          names: names
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'liturgy_intentions');
    }
  };

  const downloadWeekIntentionsPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const start = intentionsWeekStart;
    const end = addDays(intentionsWeekStart, 6);

    const drawHeader = (pdf: jsPDF) => {
      const purpleColor = [147, 51, 234]; // purple-600

      // Header Background
      pdf.setFillColor(250, 245, 255); // purple-50
      pdf.rect(0, 0, pageWidth, 35, 'F');
      
      const margin = 14;

      // Parish Logo
      if (parishInfo.logoUrl) {
        try {
          pdf.addImage(parishInfo.logoUrl, 'PNG', margin, 6, 20, 20);
        } catch (e) {
          pdf.setDrawColor(147, 51, 234);
          pdf.circle(margin + 10, 16, 10, 'S');
        }
      }

      const textStartX = parishInfo.logoUrl ? 38 : margin;

      // Parish Info
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(51, 65, 85); // slate-700
      pdf.text(parishInfo.name || 'Parrocchia', textStartX, 10);
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139); // slate-500

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
      
      // Purple Info Box at Top Right
      const boxWidth = 70;
      const boxHeight = 22;
      const boxX = pageWidth - margin - boxWidth;
      const boxY = 7;

      pdf.setFillColor(purpleColor[0], purpleColor[1], purpleColor[2]);
      pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'F');

      // Title inside box
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.text('INTENZIONI S. MESSE', boxX + boxWidth / 2, boxY + 8, { align: 'center' });
      
      // Date Range inside box
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      const rangeText = `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`;
      pdf.text(rangeText, boxX + boxWidth / 2, boxY + 14, { align: 'center' });

      // Decorative Line
      pdf.setDrawColor(purpleColor[0], purpleColor[1], purpleColor[2]);
      pdf.setLineWidth(0.6);
      pdf.line(0, 35, pageWidth, 35);
    };

    const instances = getWeekLiturgyInstances();
    const tableBody = instances.map(instance => {
      const intention = liturgyIntentions.find(i => 
        i.liturgyId === instance.id && 
        i.date === instance.dateStr && 
        i.time === instance.timeStr
      );
      const names = intention?.names || [];
      return [
        format(instance.start, 'EEEE d MMMM', { locale: it }),
        instance.timeStr,
        names.join('\n') || '-'
      ];
    });

    autoTable(doc, {
      startY: 42,
      head: [['Giorno', 'Ora', 'Nomi dei Defunti / Intenzioni']],
      body: tableBody,
      styles: { fontSize: 14, cellPadding: 6, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [147, 51, 234], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 245, 255] },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 30, halign: 'center' },
        2: { fontStyle: 'italic' }
      },
      margin: { top: 42 },
      didDrawPage: (data) => {
        drawHeader(doc);
      }
    });

    // Page numbers
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
            `Pagina ${i} di ${pageCount} - Generato il ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
        );
    }

    doc.save(`intenzioni-messe-${format(start, 'yyyy-MM-dd')}.pdf`);
  };


  const visibleSpecials = specials.filter(s => new Date(s.end || s.start) >= new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Church className="text-blue-600" size={32} />
            MESSE E LITURGIE
          </h1>
          <p className="text-slate-500 font-medium text-sm">Gestione orari funzioni e celebrazioni speciali</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsIntentionsModalOpen(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
          >
            <Heart size={20} />
            Messe a Suffragio
          </button>
          <button
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-95 text-[10px]"
          >
            <Plus size={20} />
            {activeTab === 'recurring' ? 'Nuovo Orario' : 'Nuova Celebrazione'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-slate-100 rounded-2xl w-full max-w-md">
        <button
          onClick={() => setActiveTab('recurring')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-xs font-bold transition-all ${
            activeTab === 'recurring' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Repeat size={16} />
          Orari Settimanali
        </button>
        <button
          onClick={() => setActiveTab('special')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-xs font-bold transition-all ${
            activeTab === 'special' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarPlus size={16} />
          Celebrazioni Speciali
        </button>
      </div>

      <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden text-black">
        {/* Desktop Table View */}
        <div className="hidden lg:block">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              {activeTab === 'recurring' ? (
                <tr>
                  <th className="px-6 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Titolo / Luogo</th>
                  <th className="px-6 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Programmazione Settimanale</th>
                  <th className="px-6 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Periodo Validità</th>
                  <th className="px-6 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest text-right">Azioni</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Data Celebrazione</th>
                  <th className="px-6 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Titolo</th>
                  <th className="px-6 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Luogo</th>
                  <th className="px-6 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest text-right">Azioni</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-50 text-black">
              {activeTab === 'recurring' ? (
                templates.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900 uppercase italic tracking-tight">{t.title}</p>
                      {t.location && <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">{t.location}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        {(t.schedule || []).map((s: any) => (
                          <div key={s.day} className="flex items-center gap-2">
                            <span className="w-20 text-[9px] font-black uppercase text-slate-400 shrink-0">
                              {DAYS_OF_WEEK.find(d => d.id === s.day)?.label}:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {s.times.map((tm: string) => (
                                <span key={tm} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[9px] font-black">
                                  {tm}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {(!t.schedule || t.schedule.length === 0) && !t.dayOfWeek && (
                          <span className="text-[10px] text-slate-300 italic">Nessun orario</span>
                        )}
                        {/* Old data fallback */}
                        {!t.schedule && (t.dayOfWeek !== undefined || t.days) && (
                          <div className="flex items-center gap-2">
                            <div className="flex flex-wrap gap-1">
                              {(t.days || [t.dayOfWeek]).map((d: number) => (
                                <span key={d} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-black">
                                  {DAYS_OF_WEEK.find(day => day.id === d)?.label.substring(0, 3)}
                                </span>
                              ))}
                              {(t.times || [t.time]).map((tm: string) => (
                                <span key={tm} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-black">
                                  {tm}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-bold">
                      {format(new Date(t.validFrom), 'dd/MM/yy')} - {format(new Date(t.validUntil), 'dd/MM/yy')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {deleteConfirmId === t.id ? (
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handleDelete(t.id, 'liturgy_templates')}
                              className="bg-red-600 text-white px-4 py-2 rounded-full font-black uppercase italic tracking-widest hover:bg-red-700 transition-all shadow-sm active:scale-95 text-[9px]"
                            >
                              Conferma
                            </button>
                            <button 
                              onClick={() => setDeleteConfirmId(null)}
                              className="bg-white border border-slate-200 text-slate-600 p-2 rounded-full font-black hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEdit(t)}
                              className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100 shadow-sm hover:scale-110 active:scale-95"
                              title="Modifica"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(t.id)}
                              className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-all border border-red-100 shadow-sm hover:scale-110 active:scale-95"
                              title="Elimina"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                visibleSpecials.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-50 text-blue-600 p-2.5 rounded-2xl border border-blue-100">
                          <Calendar size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 uppercase italic leading-tight">{format(new Date(s.start), 'eeee d MMMM', { locale: it })}</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">dalle {format(new Date(s.start), 'HH:mm', { locale: it })} alle {format(new Date(s.end), 'HH:mm', { locale: it })}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900 uppercase italic">{s.title}</td>
                    <td className="px-6 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest leading-loose">{s.location || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {deleteConfirmId === s.id ? (
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handleDelete(s.id, 'liturgy_specials')}
                              className="bg-red-600 text-white px-4 py-2 rounded-full font-black uppercase italic tracking-widest hover:bg-red-700 transition-all shadow-sm active:scale-95 text-[9px]"
                            >
                              Conferma
                            </button>
                            <button 
                              onClick={() => setDeleteConfirmId(null)}
                              className="bg-white border border-slate-200 text-slate-600 p-2 rounded-full font-black hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEdit(s)}
                              className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100 shadow-sm hover:scale-110 active:scale-95"
                              title="Modifica"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(s.id)}
                              className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-all border border-red-100 shadow-sm hover:scale-110 active:scale-95"
                              title="Elimina"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile/Tablet Card View */}
        <div className="lg:hidden grid grid-cols-1 divide-y divide-slate-100">
          {activeTab === 'recurring' ? (
            templates.map((t) => (
              <div key={t.id} className="p-5 space-y-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase italic leading-tight">{t.title}</h3>
                    {t.location && <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] mt-1">{t.location}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(t)} className="p-2 text-blue-600 bg-blue-50 rounded-xl border border-blue-100 shadow-sm">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => setDeleteConfirmId(t.id)} className="p-2 text-red-600 bg-red-50 rounded-xl border border-red-100 shadow-sm">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-2xl border border-slate-100 space-y-2 mt-2">
                  {(t.schedule || []).map((s: any) => (
                    <div key={s.day} className="flex gap-3 text-[11px] font-bold">
                      <span className="w-20 text-[9px] font-black uppercase text-slate-400 shrink-0">{DAYS_OF_WEEK.find(d => d.id === s.day)?.label}:</span>
                      <div className="flex flex-wrap gap-1">
                        {s.times.map((tm: string) => (
                          <span key={tm} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-[9px] font-black">{tm}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    VALIDITÀ: {format(new Date(t.validFrom), 'dd/MM/yy')} - {format(new Date(t.validUntil), 'dd/MM/yy')}
                  </p>
                  {deleteConfirmId === t.id && (
                    <button 
                      onClick={() => handleDelete(t.id, 'liturgy_templates')}
                      className="bg-red-600 text-white px-3 py-1.5 rounded-full font-black uppercase italic tracking-widest text-[9px] shadow-lg shadow-red-200"
                    >
                      Conferma Elimina
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            visibleSpecials.map((s) => (
              <div key={s.id} className="p-5 space-y-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-50 text-blue-600 p-2 rounded-xl shrink-0">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase italic leading-tight">{format(new Date(s.start), 'eeee d MMMM', { locale: it })}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">dalle {format(new Date(s.start), 'HH:mm', { locale: it })} alle {format(new Date(s.end), 'HH:mm', { locale: it })}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(s)} className="p-2 text-blue-600 bg-blue-50 rounded-xl border border-blue-100 shadow-sm">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => setDeleteConfirmId(s.id)} className="p-2 text-red-600 bg-red-50 rounded-xl border border-red-100 shadow-sm">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold text-slate-700 uppercase italic">{s.title}</p>
                  {s.location && (
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100 self-start">
                      LOC: {s.location}
                    </p>
                  )}
                </div>

                {deleteConfirmId === s.id && (
                  <div className="pt-2">
                    <button 
                      onClick={() => handleDelete(s.id, 'liturgy_specials')}
                      className="w-full bg-red-600 text-white py-3 rounded-2xl font-black uppercase italic tracking-widest text-[10px] shadow-lg shadow-red-200"
                    >
                      Conferma Eliminazione Celebrazione
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {((activeTab === 'recurring' ? templates : visibleSpecials).length === 0) && (
          <div className="py-20 md:py-32 px-6 flex flex-col items-center justify-center text-center space-y-4">
             <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200">
               <Cross size={40} strokeWidth={1} />
             </div>
             <div>
               <p className="text-sm md:text-base text-slate-500 font-bold uppercase tracking-widest italic">Nessun dato disponibile</p>
               <p className="text-xs text-slate-400 mt-1">{activeTab === 'recurring' ? 'Nessun orario settimanale configurato.' : 'Nessuna celebrazione speciale registrata.'}</p>
             </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isIntentionsModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsIntentionsModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 w-full md:max-w-2xl bg-white md:rounded-[2.5rem] shadow-2xl z-[210] overflow-hidden flex flex-col md:h-auto md:max-h-[85vh]"
            >
              <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl">
                    <Heart size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight leading-tight">Messe a Suffragio</h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gestione nomi defunti</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadWeekIntentionsPDF}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 md:px-6 py-2.5 rounded-full font-black uppercase italic tracking-wider hover:bg-indigo-700 transition-all shadow-md active:scale-95 text-[9px] md:text-[10px]"
                    title="Scarica PDF"
                  >
                    <FileDown size={18} />
                    <span className="hidden sm:block">Scarica PDF</span>
                  </button>
                  <button onClick={() => setIsIntentionsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900">
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Week Selector */}
              <div className="px-6 md:px-8 py-4 bg-slate-50/50 border-b border-slate-100/50 flex items-center justify-between shrink-0">
                <button 
                  onClick={() => setIntentionsWeekStart(subWeeks(intentionsWeekStart, 1))}
                  className="p-2 md:p-3 hover:bg-white bg-white/50 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all border border-slate-100 shadow-sm"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="text-center font-sans px-2">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">Settimana selezionata</p>
                  <p className="text-xs md:text-sm font-black text-slate-900 leading-tight">
                    Dal {format(intentionsWeekStart, 'd MMMM', { locale: it })} al {format(addDays(intentionsWeekStart, 6), 'd MMMM yyyy', { locale: it })}
                  </p>
                </div>
                <button 
                  onClick={() => setIntentionsWeekStart(addWeeks(intentionsWeekStart, 1))}
                  className="p-2 md:p-3 hover:bg-white bg-white/50 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all border border-slate-100 shadow-sm"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar bg-white flex-1">
                <div className="space-y-6">
                  {getWeekLiturgyInstances().map((instance) => {
                    const intentionKey = `${activeTab}_${instance.id}_${instance.dateStr}_${instance.timeStr}`;
                    const intention = liturgyIntentions.find(i => 
                      i.liturgyId === instance.id && 
                      i.date === instance.dateStr && 
                      i.time === instance.timeStr
                    );
                    const currentNames = intention?.names || [];

                    return (
                      <div 
                        key={`${instance.id}_${instance.dateStr}_${instance.timeStr}`} 
                        className="p-5 md:p-6 rounded-[2rem] border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                                {format(instance.start, 'EEEE', { locale: it })}
                              </span>
                              <p className="text-xs md:text-sm font-black text-slate-900 uppercase italic truncate max-w-[200px]">
                                {instance.title}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black text-slate-400 uppercase italic tracking-tight">
                                {format(instance.start, 'd MMMM', { locale: it })}
                              </span>
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                              <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">
                                ore {instance.timeStr}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {currentNames.map((name: string, idx: number) => (
                            <div key={idx} className="flex gap-2 group">
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => {
                                  const newNames = [...currentNames];
                                  newNames[idx] = e.target.value;
                                  handleUpdateIntentions(instance, newNames.filter(n => n.trim() !== ''));
                                }}
                                className="flex-1 px-5 py-3 rounded-2xl bg-white border border-slate-100 text-xs md:text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300 shadow-sm"
                                placeholder="Nome del defunto o intenzione..."
                              />
                              <button
                                onClick={() => {
                                  const newNames = currentNames.filter((_, i) => i !== idx);
                                  handleUpdateIntentions(instance, newNames);
                                }}
                                className="p-3 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ))}
                          
                          <button
                            onClick={() => {
                              handleUpdateIntentions(instance, [...currentNames, '']);
                            }}
                            className="w-full py-4 flex items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all group"
                          >
                            <PlusCircle size={18} className="group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black uppercase tracking-[0.15em] italic">Aggiungi Defunto</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {getWeekLiturgyInstances().length === 0 && (
                    <div className="text-center py-20 px-6 bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-100">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-200 mx-auto mb-4 border border-slate-50">
                        <Heart size={32} strokeWidth={1} />
                      </div>
                      <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Nessuna liturgia prevista</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal Programmazione */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 w-full md:max-w-2xl bg-white md:rounded-[2.5rem] shadow-2xl z-[210] overflow-hidden flex flex-col h-full md:h-auto md:max-h-[90vh]"
            >
              <div className="p-6 md:p-8 flex items-center justify-between border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                    {activeTab === 'recurring' ? <Repeat size={24} /> : <CalendarPlus size={24} />}
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-tight">
                      {editingId ? 'Modifica' : 'Nuova'} {activeTab === 'recurring' ? 'Programmazione' : 'Celebrazione'}
                    </h2>
                    <p className="text-[10px] uppercase font-black tracking-[0.2em] text-blue-500">{activeTab === 'recurring' ? 'Orari settimanali' : 'Evento speciale'}</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/30 custom-scrollbar">
                <form onSubmit={handleSubmit} className="space-y-8 pb-12">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Titolo Funzione</label>
                    <input
                      type="text"
                      required
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none text-sm font-bold shadow-sm transition-all focus:ring-4 focus:ring-blue-500/5 text-black"
                      placeholder="es. S. Messa Feriale"
                    />
                  </div>

                  {activeTab === 'recurring' ? (
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Orari per Giorno</label>
                        <div className="space-y-3">
                          {formData.schedule.map((daySched) => (
                            <div key={daySched.day} className="flex flex-col gap-3 p-4 md:p-5 rounded-3xl bg-white border border-slate-100 shadow-sm">
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase tracking-widest italic ${daySched.times.length > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                  {DAYS_OF_WEEK.find(d => d.id === daySched.day)?.label}
                                </span>
                                {daySched.times.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => clearDayTimes(daySched.day)}
                                    className="text-[9px] font-black text-red-400 uppercase hover:text-red-600 transition-colors"
                                  >
                                    Rimuovi tutti
                                  </button>
                                )}
                              </div>
                              
                              <div className="flex flex-wrap gap-2">
                                {daySched.times.map(t => (
                                  <div key={t} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/50 border border-blue-100 text-blue-700 rounded-full">
                                    <span className="text-[10px] font-black">{t}</span>
                                    <button 
                                      type="button" 
                                      onClick={() => removeTimeFromDay(daySched.day, t)}
                                      className="text-blue-300 hover:text-red-500 transition-colors"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ))}
                                {daySched.times.length === 0 && (
                                  <span className="text-[10px] text-slate-300 italic uppercase font-black tracking-widest">Nessun orario</span>
                                )}
                              </div>

                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2">
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                  <input
                                    type="time"
                                    value={dayTimes[daySched.day] || '08:00'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDayTimes(prev => ({ ...prev, [daySched.day]: val }));
                                    }}
                                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-black outline-none focus:ring-2 focus:ring-blue-500/20 w-full"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => addTimeToDay(daySched.day)}
                                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md transition-all active:scale-90"
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                                <div className="flex gap-1.5 overflow-x-auto w-full pb-1 no-scrollbar">
                                  {['08:30', '10:00', '18:00'].map(t => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => {
                                        setFormData(prev => ({
                                          ...prev,
                                          schedule: prev.schedule.map(s => 
                                            s.day === daySched.day 
                                              ? { ...s, times: s.times.includes(t) ? s.times : [...s.times, t].sort() } 
                                              : s
                                          )
                                        }));
                                      }}
                                      className="text-[9px] font-black text-slate-400 hover:text-blue-600 bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl whitespace-nowrap transition-all"
                                    >
                                      {t}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Validità Dal</label>
                          <input
                            type="date"
                            required
                            value={formData.validFrom}
                            onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                            className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none text-sm font-bold shadow-sm transition-all text-black"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Fino Al</label>
                          <input
                            type="date"
                            required
                            value={formData.validUntil}
                            onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                            className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none text-sm font-bold shadow-sm transition-all text-black"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Inizio Celebrazione</label>
                          <div className="flex gap-1.5">
                            {['Oggi', 'Domani'].map((label, idx) => (
                              <button 
                                key={label}
                                type="button"
                                onClick={() => {
                                  const date = idx === 0 ? new Date() : addDays(new Date(), 1);
                                  const currentVal = formData.start ? new Date(formData.start) : new Date();
                                  const newVal = new Date(date.getFullYear(), date.getMonth(), date.getDate(), currentVal.getHours(), currentVal.getMinutes());
                                  setFormData({ ...formData, start: format(newVal, "yyyy-MM-dd'T'HH:mm") });
                                }}
                                className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type="datetime-local"
                          required
                          value={formData.start}
                          onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                          className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none text-sm font-bold shadow-sm transition-all text-black"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {['08:30', '10:00', '11:00', '18:00', '20:30'].map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                const [h, m] = t.split(':').map(Number);
                                const current = formData.start ? new Date(formData.start) : new Date();
                                const newVal = setMinutes(setHours(current, h), m);
                                setFormData({ ...formData, start: format(newVal, "yyyy-MM-dd'T'HH:mm") });
                              }}
                              className="text-[10px] font-black text-slate-400 bg-white border border-slate-100 hover:text-blue-600 hover:border-blue-200 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Fine Celebrazione</label>
                          <button 
                            type="button"
                            onClick={() => {
                              if (!formData.start) return;
                              const start = new Date(formData.start);
                              const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h
                              setFormData({ ...formData, end: format(end, "yyyy-MM-dd'T'HH:mm") });
                            }}
                            className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
                          >
                            +1 ora
                          </button>
                        </div>
                        <input
                          type="datetime-local"
                          required
                          value={formData.end}
                          onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                          className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none text-sm font-bold shadow-sm transition-all text-black"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Luogo Celebrazione (opzionale)</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none text-sm font-bold shadow-sm transition-all text-black placeholder:text-slate-300"
                      placeholder="es. Chiesa Parrocchiale"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Altre Note (Sacrestia, Avvisi...)</label>
                    <textarea
                      rows={3}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none text-xs font-bold shadow-sm transition-all text-black placeholder:text-slate-300 resize-none"
                      placeholder="es. Servizio Chierichetti, Avvisi a fine messa..."
                    />
                  </div>
                </form>
              </div>

              <div className="p-6 md:p-8 border-t border-slate-100 flex flex-col md:flex-row gap-3 shrink-0 bg-white">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-white border border-slate-200 text-slate-400 p-4 rounded-3xl font-black uppercase tracking-widest hover:bg-slate-50 transition-all text-[10px] flex-1 active:scale-95"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSubmit}
                  className="bg-blue-600 text-white p-4 rounded-3xl font-black uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 text-[10px] flex-[2] flex items-center justify-center gap-3 active:scale-95"
                >
                  <Save size={18} />
                  Salva Informazioni
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

