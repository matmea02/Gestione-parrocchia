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
  FileDown
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
            className="flex items-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 px-6 py-3 rounded-2xl font-bold transition-all border border-purple-200"
          >
            <Heart size={20} />
            Messe a Suffragio
          </button>
          <button
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-blue-200"
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
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'recurring' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Repeat size={16} />
          Orari Settimanali
        </button>
        <button
          onClick={() => setActiveTab('special')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'special' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarPlus size={16} />
          Celebrazioni Speciali
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden text-black">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            {activeTab === 'recurring' ? (
              <tr>
                <th className="px-6 py-4 font-bold text-slate-600 text-sm">Titolo</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-sm">Programmazione</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-sm">Periodo</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-sm text-right">Azioni</th>
              </tr>
            ) : (
              <tr>
                <th className="px-6 py-4 font-bold text-slate-600 text-sm">Data Celebrazione</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-sm">Titolo</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-sm">Luogo</th>
                <th className="px-6 py-4 font-bold text-slate-600 text-sm text-right">Azioni</th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-50 text-black">
            {activeTab === 'recurring' ? (
              templates.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">{t.title}</p>
                    {t.location && <p className="text-[10px] text-slate-400 font-medium">{t.location}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      {(t.schedule || []).map((s: any) => (
                        <div key={s.day} className="flex items-center gap-2">
                          <span className="w-20 text-[10px] font-black uppercase text-slate-400 shrink-0">
                            {DAYS_OF_WEEK.find(d => d.id === s.day)?.label}:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {s.times.map((tm: string) => (
                              <span key={tm} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">
                                {tm}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                      {/* Old data fallback */}
                      {!t.schedule && (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-wrap gap-1">
                            {(t.days || [t.dayOfWeek]).map((d: number) => (
                              <span key={d} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                                {DAYS_OF_WEEK.find(day => day.id === d)?.label.substring(0, 3)}
                              </span>
                            ))}
                            {(t.times || [t.time]).map((tm: string) => (
                              <span key={tm} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">
                                {tm}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                    {format(new Date(t.validFrom), 'dd/MM/yy')} - {format(new Date(t.validUntil), 'dd/MM/yy')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {deleteConfirmId === t.id ? (
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => handleDelete(t.id, 'liturgy_templates')}
                            className="bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold"
                          >
                            Conferma
                          </button>
                          <button 
                            onClick={() => setDeleteConfirmId(null)}
                            className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(t)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => setDeleteConfirmId(t.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
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
                      <div className="bg-blue-50 text-blue-600 p-2 rounded-xl">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{format(new Date(s.start), 'eeee d MMMM', { locale: it })}</p>
                        <p className="text-xs font-medium text-slate-500">dalle {format(new Date(s.start), 'HH:mm', { locale: it })} alle {format(new Date(s.end), 'HH:mm', { locale: it })}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900">{s.title}</td>
                  <td className="px-6 py-4 text-slate-500 font-medium text-sm">{s.location || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 text-black">
                      {deleteConfirmId === s.id ? (
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => handleDelete(s.id, 'liturgy_specials')}
                            className="bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold"
                          >
                            Conferma
                          </button>
                          <button 
                            onClick={() => setDeleteConfirmId(null)}
                            className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(s)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => setDeleteConfirmId(s.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
            {(activeTab === 'recurring' ? templates : visibleSpecials).length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center text-slate-400 font-medium">
                  {activeTab === 'recurring' ? 'Nessun orario settimanale configurato.' : 'Nessuna celebrazione speciale registrata.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {isIntentionsModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsIntentionsModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl z-[60] overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl">
                    <Heart size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Messe a Suffragio</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestione nomi defunti</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadWeekIntentionsPDF}
                    className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl transition-all border border-slate-200 flex items-center gap-2"
                    title="Scarica PDF"
                  >
                    <FileDown size={20} />
                    <span className="text-xs font-bold md:block hidden">Scarica PDF</span>
                  </button>
                  <button onClick={() => setIsIntentionsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-black">
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Week Selector */}
              <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0 font-sans">
                <button 
                  onClick={() => setIntentionsWeekStart(subWeeks(intentionsWeekStart, 1))}
                  className="p-2 hover:bg-white rounded-xl text-slate-600 transition-all border border-transparent hover:border-slate-200"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="text-center font-sans">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 font-sans">Settimana Selezionata</p>
                  <p className="text-sm font-black text-slate-900 font-sans">
                    Dal {format(intentionsWeekStart, 'd MMMM', { locale: it })} al {format(addDays(intentionsWeekStart, 6), 'd MMMM yyyy', { locale: it })}
                  </p>
                </div>
                <button 
                  onClick={() => setIntentionsWeekStart(addWeeks(intentionsWeekStart, 1))}
                  className="p-2 hover:bg-white rounded-xl text-slate-600 transition-all border border-transparent hover:border-slate-200"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar bg-white font-sans text-black">
                <div className="space-y-4 font-sans text-black">
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
                        className="p-6 rounded-2xl border border-slate-100 bg-slate-50 font-sans text-black"
                      >
                        <div className="flex items-center justify-between mb-4 font-sans text-black">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded-md uppercase">
                                {format(instance.start, 'EEE', { locale: it })}
                              </span>
                              <p className="text-sm font-black text-slate-900 truncate max-w-[300px]">
                                {instance.title}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs font-black text-slate-900 uppercase tracking-tight">
                                {format(instance.start, 'd MMMM', { locale: it })}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-sm font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">
                                {instance.timeStr}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 font-sans text-black">
                          {currentNames.map((name: string, idx: number) => (
                            <div key={idx} className="flex gap-2 font-sans text-black">
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => {
                                  const newNames = [...currentNames];
                                  newNames[idx] = e.target.value;
                                  handleUpdateIntentions(instance, newNames.filter(n => n.trim() !== ''));
                                }}
                                className="flex-1 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder:text-slate-300 text-black"
                                placeholder="Nome e Cognome..."
                              />
                              <button
                                onClick={() => {
                                  const newNames = currentNames.filter((_, i) => i !== idx);
                                  handleUpdateIntentions(instance, newNames);
                                }}
                                className="p-2 text-red-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ))}
                          
                          <button
                            onClick={() => {
                              handleUpdateIntentions(instance, [...currentNames, '']);
                            }}
                            className="w-full py-2 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-purple-300 hover:text-purple-500 transition-all font-sans"
                          >
                            <PlusCircle size={16} />
                            <span className="text-[10px] font-black uppercase tracking-widest font-sans">Aggiungi Defunto</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {getWeekLiturgyInstances().length === 0 && (
                    <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                      <p className="text-slate-400 font-bold">Nessuna liturgia prevista per questa settimana.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl z-[60] overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 flex-1 overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-slate-900">
                    {editingId ? 'Modifica' : 'Nuova'} {activeTab === 'recurring' ? 'Programmazione Settimanale' : 'Celebrazione'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-black">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Titolo Funzione</label>
                    <input
                      type="text"
                      required
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-black"
                      placeholder="es. S. Messa Feriale"
                    />
                  </div>

                  {activeTab === 'recurring' ? (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-4 uppercase tracking-wider">Orari per Giorno</label>
                        <div className="space-y-4">
                          {formData.schedule.map((daySched) => (
                            <div key={daySched.day} className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                              <div className="w-24 pt-2">
                                <span className={`text-xs font-black uppercase ${daySched.times.length > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                                  {DAYS_OF_WEEK.find(d => d.id === daySched.day)?.label}
                                </span>
                              </div>
                              <div className="flex-1 space-y-3">
                                <div className="flex flex-wrap gap-2">
                                  {daySched.times.map(t => (
                                    <div key={t} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg shadow-sm">
                                      <span className="text-xs font-bold text-slate-700">{t}</span>
                                      <button 
                                        type="button" 
                                        onClick={() => removeTimeFromDay(daySched.day, t)}
                                        className="text-slate-300 hover:text-red-600"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ))}
                                  {daySched.times.length === 0 && (
                                    <span className="text-[10px] text-slate-400 italic">Nessun orario impostato</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="time"
                                    value={dayTimes[daySched.day] || '08:00'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDayTimes(prev => ({ ...prev, [daySched.day]: val }));
                                    }}
                                    className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-black outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => addTimeToDay(daySched.day)}
                                    className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-700 underline underline-offset-2"
                                  >
                                    Aggiungi
                                  </button>
                                  <div className="flex gap-1 ml-2">
                                    {['08:30', '10:00', '18:00'].map(t => (
                                      <button
                                        key={t}
                                        type="button"
                                        onClick={() => {
                                          setDayTimes(prev => ({ ...prev, [daySched.day]: t }));
                                          // Small delay to ensure state update or just call helper directly
                                          setFormData(prev => ({
                                            ...prev,
                                            schedule: prev.schedule.map(s => 
                                              s.day === daySched.day 
                                                ? { ...s, times: s.times.includes(t) ? s.times : [...s.times, t].sort() } 
                                                : s
                                            )
                                          }));
                                        }}
                                        className="text-[9px] font-bold text-slate-400 hover:text-blue-600 bg-white border border-slate-100 px-1.5 py-0.5 rounded"
                                      >
                                        {t}
                                      </button>
                                    ))}
                                  </div>
                                  {daySched.times.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => clearDayTimes(daySched.day)}
                                      className="text-[10px] font-black uppercase text-slate-400 hover:text-red-600 ml-auto"
                                    >
                                      Svuota
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Validità Dal</label>
                          <input
                            type="date"
                            required
                            value={formData.validFrom}
                            onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-black"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Fino Al</label>
                          <input
                            type="date"
                            required
                            value={formData.validUntil}
                            onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-black"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Inizio</label>
                          <div className="flex gap-1">
                            <button 
                              type="button"
                              onClick={() => {
                                const now = new Date();
                                const currentVal = formData.start ? new Date(formData.start) : now;
                                const newVal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentVal.getHours(), currentVal.getMinutes());
                                setFormData({ ...formData, start: format(newVal, "yyyy-MM-dd'T'HH:mm") });
                              }}
                              className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                            >
                              Oggi
                            </button>
                            <button 
                              type="button"
                              onClick={() => {
                                const tom = addDays(new Date(), 1);
                                const currentVal = formData.start ? new Date(formData.start) : new Date();
                                const newVal = new Date(tom.getFullYear(), tom.getMonth(), tom.getDate(), currentVal.getHours(), currentVal.getMinutes());
                                setFormData({ ...formData, start: format(newVal, "yyyy-MM-dd'T'HH:mm") });
                              }}
                              className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                            >
                              Dom
                            </button>
                          </div>
                        </div>
                        <input
                          type="datetime-local"
                          required
                          value={formData.start}
                          onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-black text-sm"
                        />
                        <div className="flex flex-wrap gap-1 mt-1">
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
                              className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Fine</label>
                          <div className="flex gap-1">
                            <button 
                              type="button"
                              onClick={() => {
                                if (!formData.start) return;
                                const start = new Date(formData.start);
                                const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h
                                setFormData({ ...formData, end: format(end, "yyyy-MM-dd'T'HH:mm") });
                              }}
                              className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                            >
                              +1h
                            </button>
                          </div>
                        </div>
                        <input
                          type="datetime-local"
                          required
                          value={formData.end}
                          onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-black text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Luogo (opzionale)</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-black placeholder:text-slate-300"
                      placeholder="es. Chiesa Parrocchiale"
                    />
                  </div>

                  <div className="flex gap-4 pt-4 text-black">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 py-4 rounded-2xl font-bold border border-slate-200 hover:bg-slate-50 transition-all text-sm"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-4 rounded-2xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <Save size={18} />
                      Salva
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

