import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import itLocale from '@fullcalendar/core/locales/it';
import { collection, onSnapshot, addDoc, query, orderBy, deleteDoc, doc, updateDoc, writeBatch, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { Plus, Trash2, X, Search, Calendar as CalendarIcon, Tag, Clock, MapPin, Check, PlusCircle, Palette, ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon, Download, Settings2, FileDown, CalendarDays, Church, Heart, Pencil, Save } from 'lucide-react';
import { format, startOfWeek, addDays, parseISO, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, endOfWeek, isSameDay, getDay, startOfDay, startOfYear, endOfYear, isBefore, setSeconds, setMinutes, setHours } from 'date-fns';
import { it } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CalendarModel {
  id: string;
  name: string;
  color: string;
  visible: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  calendarId: string;
  location?: string;
  description?: string;
  sourceEventId?: string; // If suggested from 'events'
}

const Calendar: React.FC = () => {
  const { currentParish } = useParish();
  const calendarsColl = useParishCollection('calendars');
  const calEventsColl = useParishCollection('calendar_events');
  const litTemplatesColl = useParishCollection('liturgy_templates');
  const litSpecialsColl = useParishCollection('liturgy_specials');
  const litExceptionsColl = useParishCollection('liturgy_exceptions');
  const litIntentionsColl = useParishCollection('liturgy_intentions');
  const eventsColl = useParishCollection('events');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [calendars, setCalendars] = useState<CalendarModel[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]); // Actual events on calendar
  const [liturgyTemplates, setLiturgyTemplates] = useState<any[]>([]);
  const [liturgySpecials, setLiturgySpecials] = useState<any[]>([]);
  const [liturgyExceptions, setLiturgyExceptions] = useState<any[]>([]);
  const [liturgyIntentions, setLiturgyIntentions] = useState<any[]>([]);
  const [parishInfo, setParishInfo] = useState<any>({
    name: 'Parrocchia S. Maria Assunta',
    address: 'Via della Chiesa, 1 - 00100 Roma (RM)',
    logoUrl: '',
    diocese: '',
    pastoralCommunity: ''
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isCalendarMenuOpen, setIsCalendarMenuOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLiturgyActionModalOpen, setIsLiturgyActionModalOpen] = useState(false);
  const [liturgyActionData, setLiturgyActionData] = useState<any>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  const initialEventState = {
    title: '',
    start: '',
    end: '',
    calendarId: '',
    location: '',
    description: '',
    sourceEventId: '',
  };

  const [form, setForm] = useState(initialEventState);
  const [calendarForm, setCalendarForm] = useState({ name: '', color: '#3b82f6' });
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [exportForm, setExportForm] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    selectedCalendars: [] as string[],
    format: 'agenda' as 'agenda' | 'settimana' | 'mensile'
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const calendarRef = useRef<FullCalendar>(null);

  useEffect(() => {
    if (editId && calendarEvents.length > 0) {
      const event = calendarEvents.find(e => e.id === editId);
      if (event) {
        setIsEditing(true);
        setSelectedEvent(event);
        setForm({
          title: event.title,
          start: event.start.slice(0, 16),
          end: event.end.slice(0, 16),
          calendarId: event.calendarId,
          location: event.location || '',
          description: event.description || '',
          sourceEventId: event.sourceEventId || '',
        });
        setIsModalOpen(true);
        // Clear search params to avoid re-opening on manual refreshes if desired, 
        // but often it's better to keep it until closed.
      }
    }
  }, [editId, calendarEvents]);

  useEffect(() => {
    // 1. Fetch Calendars
    const unsubCalendars = onSnapshot(calendarsColl, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CalendarModel));
      if (data.length === 0) {
        // Create a default calendar if none exists
        const defaultCal = { name: 'Generale', color: '#3b82f6', visible: true };
        addDoc(calendarsColl, defaultCal);
      }
      
      // Also ensure FUNZIONI calendar exists
      const hasFunctions = data.some(c => c.name.toUpperCase() === 'FUNZIONI');
      if (data.length > 0 && !hasFunctions) {
        addDoc(calendarsColl, { name: 'FUNZIONI', color: '#9333ea', visible: true });
      }

      setCalendars(data);
      // Initialize export selection if empty
      setExportForm(prev => ({
        ...prev,
        selectedCalendars: prev.selectedCalendars.length > 0 
          ? prev.selectedCalendars 
          : data.map(c => c.id)
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calendars');
    });

    // 2. Fetch Calendar Events
    const unsubEvents = onSnapshot(calEventsColl, (snap) => {
      setCalendarEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calendar_events');
    });

    // 3. Fetch Liturgies
    const unsubLitTemplates = onSnapshot(litTemplatesColl, (snap) => {
      setLiturgyTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liturgy_templates');
    });

    const unsubLitSpecials = onSnapshot(litSpecialsColl, (snap) => {
      setLiturgySpecials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liturgy_specials');
    });

    const unsubLitExceptions = onSnapshot(litExceptionsColl, (snap) => {
      setLiturgyExceptions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liturgy_exceptions');
    });

    const unsubLitIntentions = onSnapshot(litIntentionsColl, (snap) => {
      setLiturgyIntentions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'liturgy_intentions');
    });

    // 4. Fetch Parish Info
    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/parish');
    });

    return () => {
      unsubCalendars();
      unsubEvents();
      unsubLitTemplates();
      unsubLitSpecials();
      unsubLitExceptions();
      unsubLitIntentions();
      unsubParish();
    };
  }, []);

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
    setConfirmDeleteEvent(false);
    if (searchParams.has('edit')) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('edit');
      setSearchParams(newParams);
    }
  };

  const handleDateSelect = (selectInfo: any) => {
    setIsEditing(false);
    setForm({
      ...initialEventState,
      start: selectInfo.startStr.slice(0, 16),
      end: selectInfo.endStr.slice(0, 16),
      calendarId: calendars[0]?.id || '',
    });
    setIsModalOpen(true);
  };

  const handleEventClick = (clickInfo: any) => {
    const { liturgyId, liturgyType, isVirtual, isCatechism, sourceCatechismId } = clickInfo.event.extendedProps;
    
    if (isCatechism && sourceCatechismId) {
      if (window.confirm("Vuoi andare alla gestione del gruppo di catechismo?")) {
        window.location.href = `/catechismo`;
        return;
      }
    }

    if (liturgyId || isVirtual) {
      setLiturgyActionData({
        id: liturgyId,
        type: liturgyType || 'recurring',
        title: clickInfo.event.title,
        start: clickInfo.event.start,
        isVirtual
      });
      setIsLiturgyActionModalOpen(true);
      return;
    }
    const event = calendarEvents.find(e => e.id === clickInfo.event.id);
    if (event) {
      setIsEditing(true);
      setSelectedEvent(event);
      setForm({
        title: event.title,
        start: event.start.slice(0, 16),
        end: event.end.slice(0, 16),
        calendarId: event.calendarId,
        location: event.location || '',
        description: event.description || '',
        sourceEventId: event.sourceEventId || '',
      });
      setIsModalOpen(true);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing && selectedEvent) {
        await updateDoc(doc(calEventsColl, selectedEvent.id), form);
      } else {
        await addDoc(calEventsColl, form);
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, isEditing ? OperationType.WRITE : OperationType.CREATE, 'calendar_events');
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent?.id) {
      alert("Errore: ID evento non trovato.");
      return;
    }
    
    try {
      const eventId = selectedEvent.id;
      const sourceId = selectedEvent.sourceEventId;
      
      console.log(`Eliminazione evento: ${eventId}`);
      
      const batch = writeBatch(db);
      
      // 1. Delete the calendar event
      batch.delete(doc(calEventsColl, eventId));
      
      // 2. Update source event if linked
      if (sourceId) {
        try {
          batch.update(doc(eventsColl, sourceId), {
            showInCalendar: false
          });
        } catch (err) {
          console.warn('Impossibile aggiornare evento sorgente:', err);
        }
      }
      
      await batch.commit();
      console.log("Eliminazione completata con successo.");
      
      closeModal();
    } catch (error) {
      console.error('Errore durante l\'eliminazione dell\'evento:', error);
      handleFirestoreError(error, OperationType.DELETE, `calendar_events/${selectedEvent?.id}`);
    }
  };

  const handleSaveCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = calendarForm.name.trim();
    if (!name) return;
    
    try {
      if (editingCalendarId) {
        await updateDoc(doc(calendarsColl, editingCalendarId), {
          name: name,
          color: calendarForm.color
        });
      } else {
        await addDoc(calendarsColl, { 
          name: name, 
          color: calendarForm.color, 
          visible: true 
        });
      }
      setIsCalendarModalOpen(false);
      setCalendarForm({ name: '', color: '#3b82f6' });
      setEditingCalendarId(null);
    } catch (error) {
      handleFirestoreError(error, editingCalendarId ? OperationType.WRITE : OperationType.CREATE, 'calendars');
    }
  };

  const toggleCalendarVisibility = async (calId: string, current: boolean) => {
    try {
      await updateDoc(doc(calendarsColl, calId), { visible: !current });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `calendars/${calId}`);
    }
  };

  const handleLiturgyDeleteOccurrence = async () => {
    if (!liturgyActionData) return;
    try {
      const dateStr = format(liturgyActionData.start, 'yyyy-MM-dd');
      const timeStr = format(liturgyActionData.start, 'HH:mm');
      
      await addDoc(litExceptionsColl, {
        templateId: liturgyActionData.id,
        date: dateStr,
        time: timeStr
      });
      setIsLiturgyActionModalOpen(false);
      alert("Occorrenza rimossa.");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'liturgy_exceptions');
    }
  };

  const handleLiturgyDeleteTemplate = async () => {
    if (!liturgyActionData) return;
    if (!window.confirm("Sei sicuro di voler eliminare l'intera programmazione settimanale?")) return;
    
    try {
      await deleteDoc(doc(litTemplatesColl, liturgyActionData.id));
      setIsLiturgyActionModalOpen(false);
      alert("Programmazione eliminata.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'liturgy_templates');
    }
  };

  const handleLiturgyDeleteSpecial = async () => {
    if (!liturgyActionData) return;
    if (!window.confirm("Vuoi eliminare questa funzione speciale?")) return;
    
    try {
      await deleteDoc(doc(litSpecialsColl, liturgyActionData.id));
      setIsLiturgyActionModalOpen(false);
      alert("Funzione eliminata.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'liturgy_specials');
    }
  };

   const deleteCalendar = async (calId: string) => {
    if (!calId) return;
    if (calendars.length <= 1) {
      alert("Non è possibile eliminare l'ultimo calendario.");
      return;
    }

    try {
      console.log(`Inizio eliminazione calendario: ${calId}`);
      const batch = writeBatch(db);
      
      // 1. Collect all events of this calendar
      const associatedEvents = calendarEvents.filter(e => e.calendarId === calId);
      
      // 2. Mark events for deletion and update sources
      associatedEvents.forEach(e => {
        batch.delete(doc(calEventsColl, e.id));
        if (e.sourceEventId) {
          try {
            batch.update(doc(eventsColl, e.sourceEventId), { showInCalendar: false });
          } catch (err) { /* ignore */ }
        }
      });
      
      // 3. Delete the calendar itself
      batch.delete(doc(calendarsColl, calId));
      
      await batch.commit();
      console.log("Calendario e relativi eventi eliminati con successo.");

      if (form.calendarId === calId) {
        const remainingCal = calendars.find(c => c.id !== calId);
        setForm(prev => ({ ...prev, calendarId: remainingCal?.id || '' }));
      }
    } catch (error) {
      console.error('Errore durante l\'eliminazione del calendario:', error);
      handleFirestoreError(error, OperationType.DELETE, `calendars/${calId}`);
    }
  };

  const getAllEvents = () => {
    const functionsCal = calendars.find(c => c.name.toUpperCase() === 'FUNZIONI');
    const functionsCalId = functionsCal?.id || 'funzioni-virtual';
    
    // 1. Regular Calendar Events
    const events = [...calendarEvents];

    // 2. Special Liturgies
    liturgySpecials.forEach(s => {
      const start = new Date(s.start);
      const dateKey = format(start, 'yyyy-MM-dd');
      const timeStr = format(start, 'HH:mm');

      const intention = liturgyIntentions.find(i => 
        i.liturgyId === s.id && 
        i.date === dateKey && 
        i.time === timeStr
      );

      events.push({
        ...s,
        title: s.title + (intention?.names?.length ? ' 🕊️' : ''),
        calendarId: functionsCalId,
        isVirtual: true,
        liturgyId: s.id,
        liturgyType: 'special'
      });
    });

    // 3. Recurring Liturgies
    // We expand them for a wide range (e.g. current year)
    // In a real app we might want to restrict this to the visible range of FullCalendar
    const yearStart = startOfYear(new Date());
    const yearEnd = endOfYear(new Date());
    const days = eachDayOfInterval({ start: yearStart, end: yearEnd });

    liturgyTemplates.forEach(t => {
      const validFrom = parseISO(t.validFrom);
      const validUntil = parseISO(t.validUntil);
      
      days.forEach(day => {
        const currentDayNum = getDay(day);
        if (day >= validFrom && day <= validUntil) {
          let daySchedule = null;
          
          if (t.schedule) {
            daySchedule = t.schedule.find((s: any) => s.day === currentDayNum);
          } else {
            // Fallback for old data
            const templateDays = t.days || (t.dayOfWeek !== undefined ? [t.dayOfWeek] : []);
            if (templateDays.includes(currentDayNum)) {
              daySchedule = { times: t.times || [t.time] };
            }
          }

          if (daySchedule && daySchedule.times) {
            daySchedule.times.forEach((timeStr: string) => {
              const [hours, minutes] = timeStr.split(':').map(Number);
              const start = new Date(day);
              start.setHours(hours, minutes, 0, 0);
              
              const end = new Date(start);
              end.setMinutes(end.getMinutes() + 60); // Default 1h duration

              // Check for exception
              const dateKey = format(day, 'yyyy-MM-dd');
              const isExcluded = liturgyExceptions.some(ex => 
                ex.templateId === t.id && 
                ex.date === dateKey && 
                ex.time === timeStr
              );

              if (!isExcluded) {
                const intention = liturgyIntentions.find(i => 
                  i.liturgyId === t.id && 
                  i.date === dateKey && 
                  i.time === timeStr
                );

                events.push({
                  id: `virtual-${t.id}-${format(day, 'yyyyMMdd')}-${timeStr.replace(':', '')}`,
                  title: t.title + (intention?.names?.length ? ' 🕊️' : ''),
                  start: start.toISOString(),
                  end: end.toISOString(),
                  calendarId: functionsCalId,
                  location: t.location,
                  description: t.notes,
                  isVirtual: true,
                  liturgyId: t.id,
                  liturgyType: 'recurring'
                });
              }
            });
          }
        }
      });
    });

    return events;
  };

  const generatePDF = () => {
    const isLandscape = exportForm.format !== 'agenda';
    const doc = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const start = startOfDay(new Date(exportForm.startDate));
    const end = startOfDay(new Date(exportForm.endDate));

    const drawHeader = (pdf: jsPDF) => {
      const blueColor = [37, 99, 235]; // blue-600

      // Header Background
      pdf.setFillColor(248, 250, 252); // slate-50
      pdf.rect(0, 0, pageWidth, 32, 'F');
      
      const margin = 14;

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
      if (parishInfo.email) {
        hRowY += 4;
        pdf.text(parishInfo.email, textStartX, hRowY);
      }
      
      // Blue Info Box at Top Right
      const boxWidth = 70;
      const boxHeight = 20;
      const boxX = pageWidth - margin - boxWidth;
      const boxY = 7;

      pdf.setFillColor(blueColor[0], blueColor[1], blueColor[2]);
      pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'F');

      // Title inside box
      pdf.setFontSize(9);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.text('FOGLIO APPUNTAMENTI', boxX + boxWidth / 2, boxY + 6, { align: 'center' });
      pdf.text('E ATTIVITÀ', boxX + boxWidth / 2, boxY + 10, { align: 'center' });
      
      // Date Range inside box
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      const rangeText = `${format(start, 'dd MMMM yyyy', { locale: it })} - ${format(end, 'dd MMMM yyyy', { locale: it })}`;
      pdf.text(rangeText, boxX + boxWidth / 2, boxY + 14.5, { align: 'center' });
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7);
      pdf.text(`Formato: ${exportForm.format.toUpperCase()}`, boxX + boxWidth / 2, boxY + 18, { align: 'center' });

      // Decorative Line
      pdf.setDrawColor(blueColor[0], blueColor[1], blueColor[2]);
      pdf.setLineWidth(0.6);
      pdf.line(0, 32, pageWidth, 32);
    };

    const allEventsForExport = getAllEvents();
    
    const filteredExportEvents = allEventsForExport
      .filter(e => {
        const eventDate = new Date(e.start);
        return isWithinInterval(eventDate, { start, end }) && 
               exportForm.selectedCalendars.includes(e.calendarId);
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    if (exportForm.format === 'agenda') {
      autoTable(doc, {
        startY: 40,
        head: [['Data', 'Orario', 'Impegno', 'Luogo', 'Calendario']],
        body: filteredExportEvents.map(e => {
          const cal = calendars.find(c => c.id === e.calendarId);
          return [
            format(new Date(e.start), 'dd/MM/yyyy'),
            `${format(new Date(e.start), 'HH:mm')} - ${format(new Date(e.end), 'HH:mm')}`,
            e.title,
            e.location || '-',
            cal?.name || '-'
          ];
        }),
        styles: { fontSize: 12, cellPadding: 5 },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 40 },
        didDrawPage: (data) => {
          drawHeader(doc);
        }
      });
    } else if (exportForm.format === 'settimana') {
      const intervalStart = startOfWeek(start, { weekStartsOn: 1 });
      const intervalEnd = endOfWeek(end, { weekStartsOn: 1 });
      const allDays = eachDayOfInterval({ start: intervalStart, end: intervalEnd });
      
      const weeks: Date[][] = [];
      for (let i = 0; i < allDays.length; i += 7) {
        weeks.push(allDays.slice(i, i + 7));
      }

      const hoursList = Array.from({ length: 19 }, (_, i) => i + 6); // 06:00 to 00:00

      weeks.forEach((week, index) => {
        if (index > 0) doc.addPage();
        drawHeader(doc);
        
        const weekHeader = ['Ora', ...week.map(day => `${format(day, 'EEEE', { locale: it })}\n${format(day, 'dd/MM')}`)];
        const weekBody = hoursList.map(hour => {
          const row = [`${hour.toString().padStart(2, '0')}:00`];
          week.forEach(day => {
            const dayHourEvents = filteredExportEvents.filter(e => {
              const eventStart = new Date(e.start);
              return isSameDay(eventStart, day) && eventStart.getHours() === hour;
            });
            row.push(dayHourEvents.map(e => e.title).join('\n'));
          });
          return row;
        });

        autoTable(doc, {
          startY: 40,
          head: [weekHeader],
          body: weekBody,
          styles: { fontSize: 8.5, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
          headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], halign: 'center' },
          columnStyles: {
            0: { cellWidth: 15, fontStyle: 'bold', halign: 'center', fillColor: [241, 245, 249] }
          },
          theme: 'grid',
          margin: { top: 40, left: 14, right: 14 }
        });
      });
    } else {
      const intervalStart = startOfWeek(start, { weekStartsOn: 1 });
      const intervalEnd = endOfWeek(end, { weekStartsOn: 1 });
      const allDays = eachDayOfInterval({ start: intervalStart, end: intervalEnd });
      const weeks: Date[][] = [];
      for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

      autoTable(doc, {
        startY: 40,
        head: [['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']],
        body: weeks.map(week => week.map(day => {
          const dayEvents = filteredExportEvents.filter(e => isSameDay(new Date(e.start), day));
          let cellText = `${format(day, 'd')}\n`;
          dayEvents.forEach(e => {
            cellText += `• ${format(new Date(e.start), 'HH:mm')} ${e.title}\n`;
          });
          return cellText;
        })),
        styles: { fontSize: 8.5, cellPadding: 2, minCellHeight: 25, valign: 'top', overflow: 'linebreak' },
        headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], halign: 'center' },
        theme: 'grid',
        margin: { left: 14, right: 14, top: 40 },
        didDrawPage: (data) => drawHeader(doc)
      });
    }

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
            `Pagina ${i} di ${pageCount} - Documento generato il ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
        );
    }

    doc.save(`calendario-${exportForm.format}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    setIsExportModalOpen(false);
  };

  const filteredCalendarEvents = getAllEvents().filter(e => {
    const cal = calendars.find(c => c.id === e.calendarId);
    return cal?.visible !== false || e.calendarId === 'funzioni-virtual';
  }).map(e => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    backgroundColor: calendars.find(c => c.id === e.calendarId)?.color || '#9333ea', // Purple for Funzioni default
    borderColor: calendars.find(c => c.id === e.calendarId)?.color || '#9333ea',
    extendedProps: { ...e }
  }));

  return (
    <div className="space-y-8">       <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Calendario</h1>
          <p className="text-slate-500 mt-1">Organizza gli impegni e le attività della parrocchia.</p>
        </div>
        <div className="flex items-center gap-3 relative">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
          >
            <FileDown size={20} />
            Scarica PDF
          </button>
          
          <div className="relative">
            <button
              onClick={() => setIsCalendarMenuOpen(!isCalendarMenuOpen)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider transition-all border shadow-sm active:scale-95 text-[10px] ${isCalendarMenuOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <Settings2 size={20} />
              Gestisci Calendari
            </button>

            {isCalendarMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsCalendarMenuOpen(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-3">
                    <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <Tag size={16} className="text-blue-500" />
                      Visualizzazione
                    </h3>
                    <button 
                      onClick={() => {
                        setEditingCalendarId(null);
                        setCalendarForm({ name: '', color: '#3b82f6' });
                        setIsCalendarModalOpen(true);
                      }}
                      className="p-1 hover:bg-slate-100 rounded text-blue-600 font-bold text-xs flex items-center gap-1"
                    >
                      <Plus size={14} /> Nuovo
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                    {calendars.map(cal => (
                      <div key={cal.id} className="flex items-center justify-between group py-1">
                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={cal.visible}
                            onChange={() => toggleCalendarVisibility(cal.id, cal.visible)}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded border-2 transition-all flex items-center justify-center`} style={{ borderColor: cal.color, backgroundColor: cal.visible ? cal.color : 'transparent' }}>
                            {cal.visible && <Check size={10} className="text-white" />}
                          </div>
                          <span className={`text-xs font-bold ${cal.visible ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                            {cal.name}
                          </span>
                        </label>
                        
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCalendarId(cal.id);
                              setCalendarForm({ name: cal.name, color: cal.color });
                              setIsCalendarModalOpen(true);
                            }}
                            className="p-1 text-slate-300 hover:text-blue-500 opacity-20 group-hover:opacity-100 transition-all"
                          >
                            <Pencil size={12} />
                          </button>
                          
                          {confirmDeleteId === cal.id ? (
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => deleteCalendar(cal.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                              >
                                <Check size={12} />
                              </button>
                              <button 
                                onClick={() => setConfirmDeleteId(null)}
                                className="p-1 text-slate-400 hover:bg-slate-50 rounded"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(cal.id);
                                setTimeout(() => setConfirmDeleteId(null), 5000);
                              }}
                              className="p-1 text-slate-300 hover:text-red-500 opacity-20 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => {
              setIsEditing(false);
              setForm({ ...initialEventState, calendarId: calendars[0]?.id || '' });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-95 text-[10px]"
          >
            <Plus size={20} />
            Nuovo Impegno
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative z-0">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'timeGridWeek,dayGridMonth,listWeek'
            }}
            locale={itLocale}
            firstDay={1}
            events={filteredCalendarEvents}
            selectable={true}
            editable={true}
            select={handleDateSelect}
            eventClick={handleEventClick}
            eventContent={(eventInfo) => {
              const { isRoomBooking, requesterName, rooms, purpose, isCatechism, catechistName, year, name } = eventInfo.event.extendedProps;
              
              if (isRoomBooking) {
                return (
                  <div className="fc-content p-0.5 overflow-hidden text-[10px] leading-tight">
                    <div className="font-black uppercase truncate">{rooms}</div>
                    <div className="font-bold text-white/90 truncate">{purpose || 'Uso Sala'}</div>
                    <div className="italic text-white/80 truncate opacity-90">{requesterName}</div>
                  </div>
                );
              }

              if (isCatechism) {
                return (
                  <div className="fc-content p-0.5 overflow-hidden text-[10px] leading-tight">
                    <div className="font-black uppercase truncate">{eventInfo.event.title}</div>
                    <div className="font-bold text-white/90 truncate italic">{name}</div>
                  </div>
                );
              }
              
              return (
                <div className="fc-content p-0.5 overflow-hidden">
                  <div className="fc-title font-bold text-[10px] truncate">{eventInfo.event.title}</div>
                </div>
              );
            }}
            height="auto"
            slotMinTime="06:00:00"
            slotMaxTime="24:00:00"
            allDaySlot={false}
            nowIndicator={true}
            eventTimeFormat={{
              hour: '2-digit',
              minute: '2-digit',
              meridiem: false,
              hour12: false
            }}
          />
        </div>

      {/* Liturgy Action Modal */}
      {isLiturgyActionModalOpen && liturgyActionData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-6 z-[110]">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0 bg-slate-50/30">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl shadow-lg shadow-purple-100 ${liturgyActionData.type === 'recurring' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'}`}>
                  <Church size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase italic">{liturgyActionData.title}</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                    {liturgyActionData.type === 'recurring' ? 'Programmazione Settimanale' : 'Evento Speciale / Celebrazione'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsLiturgyActionModalOpen(false)} 
                className="p-3 hover:bg-white hover:shadow-sm rounded-full transition-all text-slate-300 hover:text-red-500 border border-transparent hover:border-slate-100"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-10 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Info Section */}
                <div className="space-y-6">
                  <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 italic space-y-6">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-blue-600 border border-blue-50">
                        <CalendarIcon size={24} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Data Celebrazione</p>
                        <p className="text-lg font-black text-slate-800 leading-tight">
                          {format(liturgyActionData.start, 'EEEE d MMMM yyyy', { locale: it })}
                        </p>
                      </div>
                    </div>
                    
                    <div className="w-full h-px bg-slate-200/50" />

                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-purple-600 border border-purple-50">
                        <Clock size={24} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Orario d'Inizio</p>
                        <p className="text-xl font-black text-slate-800 leading-tight">
                          ore {format(liturgyActionData.start, 'HH:mm', { locale: it })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => {
                        window.location.href = `/liturgie?edit=${liturgyActionData.id}&type=${liturgyActionData.type}`;
                      }}
                      className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase italic tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 active:scale-95 text-[11px]"
                    >
                      Modifica Dettagli Programmazione
                    </button>
                  </div>
                </div>

                {/* Intentions / Actions Section */}
                <div className="space-y-6">
                  {(() => {
                    const dateStr = format(liturgyActionData.start, 'yyyy-MM-dd');
                    const timeStr = format(liturgyActionData.start, 'HH:mm');
                    const intention = liturgyIntentions.find(i => 
                      i.liturgyId === liturgyActionData.id && 
                      i.date === dateStr && 
                      i.time === timeStr
                    );

                    if (intention && intention.names && intention.names.length > 0) {
                      return (
                        <div className="bg-purple-50/50 p-8 rounded-[2rem] border border-purple-100/50 animate-in fade-in duration-500">
                          <div className="flex items-center gap-4 mb-6">
                            <div className="p-2.5 bg-white rounded-xl shadow-sm text-purple-600 border border-purple-50">
                              <Heart size={20} />
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase text-purple-400 tracking-widest mb-0.5 italic">Intenzioni di Preghiera</p>
                              <h3 className="text-sm font-black text-slate-900 leading-none uppercase">Defunti Ricordati</h3>
                            </div>
                          </div>
                          <div className="space-y-2.5">
                            {intention.names.map((name: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-4 bg-white/80 p-4 rounded-2xl border border-purple-100/30 group hover:border-purple-300 transition-all">
                                <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.4)]" />
                                <span className="text-sm font-black text-slate-700 italic uppercase">{name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="bg-slate-50 p-8 rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-center italic min-h-[200px]">
                        <Heart size={32} className="text-slate-200 mb-3" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose">Nessuna intenzione particolare<br/>registrata per questa data</p>
                      </div>
                    );
                  })()}

                  <div className="space-y-3 pt-4">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-center italic mb-4">Azioni Rapide</p>
                    {liturgyActionData.type === 'recurring' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
                        <button
                          onClick={handleLiturgyDeleteOccurrence}
                          className="w-full py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase italic tracking-widest hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm active:scale-95 text-[10px]"
                        >
                          Rimuovi solo questa data
                        </button>
                        <button
                          onClick={handleLiturgyDeleteTemplate}
                          className="w-full py-4 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-black uppercase italic tracking-widest hover:bg-red-100 transition-all active:scale-95 text-[10px]"
                        >
                          Elimina l'intera serie
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleLiturgyDeleteSpecial}
                        className="w-full py-4 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-black uppercase italic tracking-widest hover:bg-red-100 transition-all active:scale-95 text-[10px]"
                      >
                        Elimina Celebrazione
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 md:p-6 z-[100]">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-full animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100">
                  <Plus size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase italic">
                    {isEditing ? 'Modifica Impegno' : 'Nuovo Impegno'}
                  </h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Gestione Calendario Parrocchiale</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-3 hover:bg-white hover:shadow-sm rounded-full transition-all text-slate-400 hover:text-red-500 border border-transparent hover:border-slate-100">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveEvent} className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                {/* Left Column: Core Info */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Titolo dell'Impegno</label>
                    <input
                      type="text"
                      required
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner"
                      placeholder="es. Incontro Consiglio Pastorale"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Calendario</label>
                      <div className="relative">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <select
                          value={form.calendarId}
                          onChange={(e) => setForm({ ...form, calendarId: e.target.value })}
                          className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold appearance-none shadow-inner"
                        >
                          {calendars.map(cal => (
                            <option key={cal.id} value={cal.id}>{cal.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Luogo (Opzionale)</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          value={form.location}
                          onChange={(e) => setForm({ ...form, location: e.target.value })}
                          className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-inner"
                          placeholder="es. Salone Parrocchiale"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Note e Dettagli</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none text-sm font-medium shadow-inner"
                      placeholder="Aggiungi ulteriori dettagli sull'appuntamento..."
                    />
                  </div>
                </div>

                {/* Right Column: Time Selection */}
                <div className="space-y-8 bg-slate-50/50 p-6 md:p-8 rounded-[2.5rem] border border-slate-100 italic">
                  <div className="grid grid-cols-1 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <Clock size={14} className="text-blue-500" />
                          Inizio Appuntamento
                        </label>
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => {
                              const now = new Date();
                              const currentVal = form.start ? new Date(form.start) : now;
                              const newVal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentVal.getHours(), currentVal.getMinutes());
                              setForm({ ...form, start: format(newVal, "yyyy-MM-dd'T'HH:mm") });
                            }}
                            className="text-[9px] font-black uppercase text-blue-600 bg-white border border-blue-100 px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors shadow-sm"
                          >
                            Oggi
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              const tom = addDays(new Date(), 1);
                              const currentVal = form.start ? new Date(form.start) : new Date();
                              const newVal = new Date(tom.getFullYear(), tom.getMonth(), tom.getDate(), currentVal.getHours(), currentVal.getMinutes());
                              setForm({ ...form, start: format(newVal, "yyyy-MM-dd'T'HH:mm") });
                            }}
                            className="text-[9px] font-black uppercase text-blue-600 bg-white border border-blue-100 px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors shadow-sm"
                          >
                            Domani
                          </button>
                        </div>
                      </div>
                      <input
                        type="datetime-local"
                        required
                        value={form.start}
                        onChange={(e) => setForm({ ...form, start: e.target.value })}
                        className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-sm"
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        {['08:30', '10:00', '15:00', '18:00', '21:00'].map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              const [h, m] = t.split(':').map(Number);
                              const current = form.start ? new Date(form.start) : new Date();
                              const newVal = setMinutes(setHours(current, h), m);
                              setForm({ ...form, start: format(newVal, "yyyy-MM-dd'T'HH:mm") });
                            }}
                            className="text-[10px] font-black text-slate-500 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 px-3 py-2 rounded-xl transition-all shadow-sm"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <Clock size={14} className="text-red-500" />
                          Fine Appuntamento
                        </label>
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => {
                              if (!form.start) return;
                              const start = new Date(form.start);
                              const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h
                              setForm({ ...form, end: format(end, "yyyy-MM-dd'T'HH:mm") });
                            }}
                            className="text-[9px] font-black uppercase text-blue-600 bg-white border border-blue-100 px-3 py-1 rounded-lg hover:bg-blue-50 shadow-sm"
                          >
                            +1h
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              if (!form.start) return;
                              const start = new Date(form.start);
                              const end = new Date(start.getTime() + 120 * 60 * 1000); // +2h
                              setForm({ ...form, end: format(end, "yyyy-MM-dd'T'HH:mm") });
                            }}
                            className="text-[9px] font-black uppercase text-blue-600 bg-white border border-blue-100 px-3 py-1 rounded-lg hover:bg-blue-50 shadow-sm"
                          >
                            +2h
                          </button>
                        </div>
                      </div>
                      <input
                        type="datetime-local"
                        required
                        value={form.end}
                        onChange={(e) => setForm({ ...form, end: e.target.value })}
                        className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-12 border-t border-slate-50 mt-8">
                {isEditing && (
                  confirmDeleteEvent ? (
                    <div className="flex-1 flex gap-2 animate-in slide-in-from-left-2 duration-200">
                      <button
                        type="button"
                        onClick={handleDeleteEvent}
                        className="bg-red-600 text-white px-8 py-5 rounded-2xl font-black uppercase italic tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-100 active:scale-95 text-[11px] flex-1"
                      >
                        Conferma Eliminazione
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteEvent(false)}
                        className="bg-white border border-slate-200 text-slate-400 px-6 py-5 rounded-2xl font-black uppercase italic tracking-widest hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[11px]"
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteEvent(true)}
                      className="bg-red-50 text-red-600 border border-red-100 px-10 py-5 rounded-2xl font-black uppercase italic tracking-widest hover:bg-red-100 transition-all active:scale-95 text-[11px] md:w-auto"
                    >
                      Elimina
                    </button>
                  )
                )}
                <div className="flex-1"></div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-10 py-5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all italic border border-slate-100"
                >
                  Indietro
                </button>
                <button
                  type="submit"
                  className="bg-slate-900 text-white px-12 py-5 rounded-2xl font-black uppercase italic tracking-widest shadow-2xl shadow-slate-200 hover:bg-blue-600 transition-all active:scale-95 text-[11px]"
                >
                  {isEditing ? 'Salva Modifiche' : 'Crea Appuntamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Calendar Modal */}
      {isCalendarModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                {editingCalendarId ? 'Modifica Calendario' : 'Nuovo Calendario'}
              </h2>
              <button 
                onClick={() => {
                  setIsCalendarModalOpen(false);
                  setEditingCalendarId(null);
                  setCalendarForm({ name: '', color: '#3b82f6' });
                }} 
                className="p-2.5 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900"
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveCalendar} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Nome</label>
                <input
                  type="text"
                  required
                  value={calendarForm.name}
                  onChange={(e) => setCalendarForm({ ...calendarForm, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                  placeholder="Es: Catechismo, Coro..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Colore</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={calendarForm.color}
                    onChange={(e) => setCalendarForm({ ...calendarForm, color: e.target.value })}
                    className="w-12 h-12 rounded-lg cursor-pointer border-none p-0 overflow-hidden"
                  />
                  <span className="text-sm font-mono text-slate-500">{calendarForm.color}</span>
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-4 bg-blue-600 text-white rounded-full font-bold uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 text-[10px] flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {editingCalendarId ? 'Salva Modifiche' : 'Crea Calendario'}
              </button>
            </form>
          </div>
        </div>
      )}

       {/* PDF Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <FileDown size={24} />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Esportazione</h2>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="p-2.5 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block">Scegli Formato</label>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                  {(['agenda', 'settimana', 'mensile'] as const).map((formatOption) => (
                    <button
                      key={formatOption}
                      onClick={() => setExportForm({ ...exportForm, format: formatOption })}
                      className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                        exportForm.format === formatOption 
                          ? 'bg-white text-blue-600 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {formatOption}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Inizio</label>
                  <input
                    type="date"
                    value={exportForm.startDate}
                    onChange={(e) => setExportForm({ ...exportForm, startDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Fine</label>
                  <input
                    type="date"
                    value={exportForm.endDate}
                    onChange={(e) => setExportForm({ ...exportForm, endDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calendari da includere</label>
                <div className="grid grid-cols-1 gap-2 max-h-[150px] overflow-y-auto pr-2">
                  {calendars.map(cal => (
                    <label key={cal.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cal.color }}></div>
                        <span className="text-xs font-bold text-slate-700">{cal.name}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={exportForm.selectedCalendars.includes(cal.id)}
                        onChange={(e) => {
                          const ids = e.target.checked 
                            ? [...exportForm.selectedCalendars, cal.id]
                            : exportForm.selectedCalendars.filter(id => id !== cal.id);
                          setExportForm({ ...exportForm, selectedCalendars: ids });
                        }}
                        className="w-5 h-5 rounded border-slate-200 text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                <div className="flex gap-3">
                  <div className="text-amber-600 shrink-0"><CalendarDays size={18} /></div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">Visualizzazione PDF</h4>
                    <p className="text-[10px] text-amber-700 leading-relaxed mt-0.5">
                      {exportForm.format === 'agenda' 
                        ? 'Il formato Agenda include tutti i dettagli: Data, Orario, Nome impegno, Luogo e Calendario.'
                        : `Il formato ${exportForm.format.charAt(0).toUpperCase() + exportForm.format.slice(1)} ottimizza lo spazio mostrando solo Data, Ora e Nome impegno.`}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={generatePDF}
                disabled={exportForm.selectedCalendars.length === 0}
                className="w-full py-4 bg-blue-600 text-white rounded-full font-bold uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 text-[10px] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
              >
                <Download size={18} />
                Genera Documento PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
