import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, addDoc, query, orderBy, deleteDoc, doc, updateDoc, increment, getDocs, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { Plus, Trash2, Calendar as CalendarIcon, MapPin, Users, X, Search, Filter, Tag, LayoutGrid, Pencil, AlertCircle, Clock, Upload, FileText, Image as ImageIcon, Download, ListTodo, UserPlus, Settings, CheckCircle2 } from 'lucide-react';
import { format, isAfter, isBefore, parseISO, startOfDay, endOfDay, isWithinInterval, addDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { it } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface RegistrationField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'tel';
  required: boolean;
}

const PARISH_INFO = {
  name: 'Parrocchia S. Maria Assunta',
  address: 'Via della Chiesa, 1 - 00100 Roma (RM)',
};

const Events: React.FC = () => {
  const { currentParish } = useParish();
  const eventsColl = useParishCollection('events');
  const calendarsColl = useParishCollection('calendars');
  const calEventsColl = useParishCollection('calendar_events');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [events, setEvents] = useState<any[]>([]);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [parishInfo, setParishInfo] = useState<any>({
    name: 'Parrocchia S. Maria Assunta',
    address: 'Via della Chiesa, 1 - 00100 Roma (RM)',
    logoUrl: '',
    diocese: '',
    pastoralCommunity: ''
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [registrationToDelete, setRegistrationToDelete] = useState<string | null>(null);
  
  // Registration Management State
  const [selectedEventForRegistrations, setSelectedEventForRegistrations] = useState<any | null>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [newParticipant, setNewParticipant] = useState<any>({});
  // PDF Export Filters
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  
  const initialEventState = {
    title: '',
    description: '',
    type: 'Messa',
    customType: '',
    targetAudience: '',
    date: '', // Start Date
    endDate: '', // End Date
    location: '',
    posterUrl: '',
    posterType: '' as 'image' | 'pdf' | '',
    price: '',
    isApproved: false,
    showInCalendar: false,
    calendarId: '',
    registrationsEnabled: false,
    maxParticipants: '',
    secretaryInfo: '',
    registrationFields: [
      { id: '1', label: 'Nome e Cognome', type: 'text', required: true },
      { id: '2', label: 'Telefono', type: 'tel', required: true }
    ] as RegistrationField[],
  };

  const [newEvent, setNewEvent] = useState(initialEventState);

  // Filter State
  const [filterSearch, setFilterSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Upcoming' | 'Past'>('All');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && events.length > 0) {
      const eventToEdit = events.find(e => e.id === editId);
      if (eventToEdit) {
        handleEdit(eventToEdit);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, events]);

  useEffect(() => {
    const q = query(eventsColl, orderBy('date', 'asc'));
    const unsubEvents = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'events');
    });

    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    });

    const unsubCalendars = onSnapshot(calendarsColl, (snap) => {
      setCalendars(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubEvents();
      unsubParish();
      unsubCalendars();
    };
  }, []);

  // Filter Logic
  const filteredEvents = events.filter(event => {
    const matchesSearch = filterSearch === '' || 
      (event.title || '').toLowerCase().includes(filterSearch.toLowerCase()) ||
      (event.description || '').toLowerCase().includes(filterSearch.toLowerCase()) ||
      (event.location || '').toLowerCase().includes(filterSearch.toLowerCase());
    
    const matchesType = filterType === 'All' || event.type === filterType;
    
    const eventDate = new Date(event.date);
    const now = new Date();
    const matchesStatus = filterStatus === 'All' || 
      (filterStatus === 'Upcoming' && isAfter(eventDate, now)) ||
      (filterStatus === 'Past' && isBefore(eventDate, now));

    return matchesSearch && matchesType && matchesStatus;
  });

  // Stats Logic
  const now = new Date();
  const approvedCount = events.filter(e => e.isApproved).length;
  const pendingCount = events.filter(e => !e.isApproved).length;
  const pastCount = events.filter(e => isBefore(new Date(e.date), now)).length;
  const scheduledCount = events.filter(e => isAfter(new Date(e.date), now)).length;

  useEffect(() => {
    if (selectedEventForRegistrations) {
      const q = query(collection(eventsColl, selectedEventForRegistrations.id, 'registrations'), orderBy('createdAt', 'asc'));
      const unsub = onSnapshot(q, (snap) => {
        setRegistrations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `events/${selectedEventForRegistrations.id}/registrations`);
      });
      return unsub;
    }
  }, [selectedEventForRegistrations]);

  const handleSubmitParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventForRegistrations) return;
    
    try {
      await addDoc(collection(eventsColl, selectedEventForRegistrations.id, 'registrations'), {
        ...newParticipant,
        createdAt: new Date().toISOString(),
      });
      // Increment registrations count in parent event
      await updateDoc(doc(eventsColl, selectedEventForRegistrations.id), {
        registrationsCount: increment(1)
      });
      setNewParticipant({});
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `events/${selectedEventForRegistrations.id}/registrations`);
    }
  };

  const handleDeleteParticipant = async (regId: string) => {
    setRegistrationToDelete(regId);
  };

  const executeDeleteParticipant = async () => {
    if (!selectedEventForRegistrations || !registrationToDelete) return;
    try {
      const eventId = selectedEventForRegistrations.id;
      const regId = registrationToDelete;
      await deleteDoc(doc(collection(eventsColl, eventId, 'registrations'), regId));
      // Decrement registrations count in parent event
      await updateDoc(doc(eventsColl, eventId), {
        registrationsCount: increment(-1)
      });
      setRegistrationToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${selectedEventForRegistrations.id}/registrations/${registrationToDelete}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const eventData = {
        ...newEvent,
        updatedAt: new Date().toISOString(),
      };

      let eventId = editingId;

      if (isEditing && editingId) {
        await updateDoc(doc(eventsColl, editingId), eventData);
        console.log('Evento aggiornato con successo');
      } else {
        const docRef = await addDoc(eventsColl, {
          ...eventData,
          registrationsCount: 0,
          createdAt: new Date().toISOString(),
          createdBy: 'public-user',
        });
        eventId = docRef.id;
        console.log('Evento creato con successo');
      }

      // Handle Calendar Sync
      if (eventId) {
        const calendarEventsQ = query(calEventsColl, where('sourceEventId', '==', eventId));
        const calendarEventsSnap = await getDocs(calendarEventsQ);
        
        if (newEvent.showInCalendar) {
          const calEventData = {
            title: newEvent.title,
            start: newEvent.date,
            end: newEvent.endDate || newEvent.date,
            calendarId: newEvent.calendarId || (calendars[0]?.id || ''),
            location: newEvent.location || '',
            description: newEvent.description || '',
            sourceEventId: eventId
          };

          if (calendarEventsSnap.empty) {
            await addDoc(calEventsColl, calEventData);
          } else {
            await updateDoc(doc(calEventsColl, calendarEventsSnap.docs[0].id), calEventData);
          }
        } else {
          // If not showInCalendar, delete any existing link
          if (!calendarEventsSnap.empty) {
            const batch = writeBatch(db);
            calendarEventsSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }
      }

      setIsModalOpen(false);
      setIsEditing(false);
      setEditingId(null);
      setNewEvent(initialEventState);
    } catch (error) {
      console.error('Errore durante il salvataggio dell\'evento:', error);
      handleFirestoreError(error, isEditing ? OperationType.WRITE : OperationType.CREATE, 'events');
    }
  };

  const exportToPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const blueColor = [37, 99, 235]; // blue-600
      
      // Filter events if dates are set
      let pdfEvents = [...events];
      if (exportStartDate && exportEndDate) {
        const start = startOfDay(new Date(exportStartDate));
        const end = endOfDay(new Date(exportEndDate));
        pdfEvents = events.filter(event => {
          const eventDate = new Date(event.date);
          return isWithinInterval(eventDate, { start, end });
        });
      }

      // Header: Parish Info
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(0, 0, 210, 25, 'F');
      
      if (parishInfo.logoUrl) {
        try {
          doc.addImage(parishInfo.logoUrl, 'PNG', 14, 4, 18, 18);
        } catch (e) {
          console.error('Could not add logo to PDF', e);
        }
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85); // slate-700
      doc.text(parishInfo.name, parishInfo.logoUrl ? 36 : 14, 8);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500
      
      let headerY = 12;
      if (parishInfo.diocese) {
        doc.text(parishInfo.diocese, parishInfo.logoUrl ? 36 : 14, headerY);
        headerY += 3.5;
      }
      if (parishInfo.pastoralCommunity) {
        doc.text(parishInfo.pastoralCommunity, parishInfo.logoUrl ? 36 : 14, headerY);
        headerY += 3.5;
      }
      doc.text(parishInfo.address, parishInfo.logoUrl ? 36 : 14, headerY);
      if (parishInfo.phone) {
        headerY += 3.5;
        doc.text(`Tel: ${parishInfo.phone}`, parishInfo.logoUrl ? 36 : 14, headerY);
      }

      // Date Box top right
      const rangeText = exportStartDate && exportEndDate 
        ? `${format(new Date(exportStartDate), 'dd/MM/yy')} - ${format(new Date(exportEndDate), 'dd/MM/yy')}`
        : 'TUTTO IL PERIODO';
      
      doc.setFillColor(blueColor[0], blueColor[1], blueColor[2]);
      doc.roundedRect(155, 5, 45, 15, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('PERIODO REPORT', 177.5, 11, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(rangeText, 177.5, 16, { align: 'center' });

      // Decorative line
      doc.setDrawColor(blueColor[0], blueColor[1], blueColor[2]);
      doc.setLineWidth(0.5);
      doc.line(0, 25, 210, 25);

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(blueColor[0], blueColor[1], blueColor[2]);
      doc.text('CALENDARIO EVENTI PARROCCHIALI', 105, 40, { align: 'center' });

      // Summary Box
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(14, 48, 182, 8, 2, 2, 'FD');
      
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.text(`Numero complessivo eventi in elenco: ${pdfEvents.length}`, 19, 53.5);

      // Table
      const tableData = pdfEvents.map(e => {
        const eventDate = new Date(e.date);
        const endDateStr = e.endDate ? ` - ${format(new Date(e.endDate), 'HH:mm')}` : '';
        return [
          format(eventDate, 'dd/MM/yy HH:mm', { locale: it }) + endDateStr,
          e.title,
          e.type,
          e.location || '-',
          e.price || 'Gratuito',
          e.targetAudience || 'Generale'
        ];
      });

      autoTable(doc, {
        startY: 60,
        head: [['Data e Ora', 'Evento', 'Tipo', 'Luogo', 'Prezzo', 'Target']],
        body: tableData,
        theme: 'grid',
        headStyles: { 
          fillColor: blueColor as [number, number, number],
          fontSize: 9,
          fontStyle: 'bold'
        },
        styles: { 
          fontSize: 8,
          cellPadding: 2.5
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didDrawPage: (data) => {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text('Pagina ' + data.pageNumber, 196, 285, { align: 'right' });
        }
      });

      doc.save(`eventi_parrocchia_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Si è verificato un errore durante la generazione del PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const togglePayment = async (regId: string, currentPaid: boolean) => {
    if (!selectedEventForRegistrations) return;
    try {
      await updateDoc(doc(collection(eventsColl, selectedEventForRegistrations.id, 'registrations'), regId), {
        isPaid: !currentPaid,
        paymentDate: !currentPaid ? new Date().toISOString() : null
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `events/${selectedEventForRegistrations.id}/registrations/${regId}`);
    }
  };

  const updateParticipantField = async (regId: string, fieldId: string, value: string) => {
    if (!selectedEventForRegistrations) return;
    try {
      await updateDoc(doc(collection(eventsColl, selectedEventForRegistrations.id, 'registrations'), regId), {
        [fieldId]: value
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `events/${selectedEventForRegistrations.id}/registrations/${regId}`);
    }
  };

  const updateSecretaryNotes = async (regId: string, notes: string) => {
    if (!selectedEventForRegistrations) return;
    try {
      await updateDoc(doc(collection(eventsColl, selectedEventForRegistrations.id, 'registrations'), regId), {
        secretaryNotes: notes
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `events/${selectedEventForRegistrations.id}/registrations/${regId}`);
    }
  };

  const exportRegistrationsToPDF = () => {
    if (!selectedEventForRegistrations) return;
    
    try {
      const doc = new jsPDF();
      const blueColor = [37, 99, 235]; // blue-600
      
      // Header: Parish Info (More compact)
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(0, 0, 210, 25, 'F');

      if (parishInfo.logoUrl) {
        try {
          doc.addImage(parishInfo.logoUrl, 'PNG', 14, 4, 18, 18);
        } catch (e) {
          console.error('Could not add logo to PDF', e);
        }
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85); // slate-700
      doc.text(parishInfo.name, parishInfo.logoUrl ? 36 : 14, 8);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500

      let hRowY = 12;
      if (parishInfo.diocese) {
        doc.text(parishInfo.diocese, parishInfo.logoUrl ? 36 : 14, hRowY);
        hRowY += 3.5;
      }
      if (parishInfo.pastoralCommunity) {
        doc.text(parishInfo.pastoralCommunity, parishInfo.logoUrl ? 36 : 14, hRowY);
        hRowY += 3.5;
      }
      doc.text(parishInfo.address, parishInfo.logoUrl ? 36 : 14, hRowY);
      if (parishInfo.phone) {
        hRowY += 3.5;
        doc.text(`Tel: ${parishInfo.phone}`, parishInfo.logoUrl ? 36 : 14, hRowY);
      }
      
      // Date Box top right
      const eventDate = new Date(selectedEventForRegistrations.date);
      const dateStr = format(eventDate, 'dd/MM/yyyy HH:mm', { locale: it });
      
      doc.setFillColor(blueColor[0], blueColor[1], blueColor[2]);
      doc.roundedRect(155, 5, 45, 15, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('DATA EVENTO', 177.5, 11, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(dateStr, 177.5, 16, { align: 'center' });

      // Decorative line
      doc.setDrawColor(blueColor[0], blueColor[1], blueColor[2]);
      doc.setLineWidth(0.5);
      doc.line(0, 25, 210, 25);

      // Event Info - Centered and Bold (First page only)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(blueColor[0], blueColor[1], blueColor[2]);
      doc.text(selectedEventForRegistrations.title.toUpperCase(), 105, 38, { align: 'center' });
      
      // Secretary Info in PDF (Yellow box)
      let tableStartY = 55;
      if (selectedEventForRegistrations.secretaryInfo) {
        const splitInfo = doc.splitTextToSize(selectedEventForRegistrations.secretaryInfo, 170);
        const boxHeight = (splitInfo.length * 4.5) + 10;
        
        doc.setFillColor(254, 252, 232); // amber-50
        doc.setDrawColor(254, 240, 138); // amber-200
        doc.roundedRect(14, 50, 182, boxHeight, 2, 2, 'FD');
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 83, 9); // amber-700
        doc.text('NOTE E ISTRUZIONI PER LA SEGRETERIA:', 19, 56);
        
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 53, 15); // amber-800
        doc.text(splitInfo, 19, 61);
        
        tableStartY = 50 + boxHeight + 8;
      }

      // Table Header Configuration
      const tableHeaders = ['N.', ...selectedEventForRegistrations.registrationFields.map((f: any) => f.label)];
      if (selectedEventForRegistrations.price) {
        tableHeaders.push('Pagamento');
      }
      tableHeaders.push('Note Segretaria');

      // Table Data
      // Default to 300 rows if no limit is set
      const maxRows = selectedEventForRegistrations.maxParticipants ? parseInt(selectedEventForRegistrations.maxParticipants) : 300;
      const tableData = [];

      for (let i = 0; i < maxRows; i++) {
        const reg = registrations[i];
        const row: any[] = [i + 1];
        
        selectedEventForRegistrations.registrationFields.forEach((field: any) => {
          row.push(reg ? reg[field.id] || '' : '');
        });

        if (selectedEventForRegistrations.price) {
          // Combined payment column
          if (reg) {
            const status = reg.isPaid ? 'S' : 'N';
            const date = reg.paymentDate ? ` (${format(new Date(reg.paymentDate), 'dd/MM/yy')})` : '';
            row.push(`${status}${date}`);
          } else {
            row.push('');
          }
        }
        
        row.push(reg?.secretaryNotes || '');

        tableData.push(row);
      }

      autoTable(doc, {
        startY: tableStartY,
        head: [tableHeaders],
        body: tableData,
        theme: 'grid', // Clearer grid
        headStyles: { 
          fillColor: blueColor as [number, number, number],
          fontSize: 9,
          fontStyle: 'bold'
        },
        styles: { 
          fontSize: 8,
          cellPadding: 2.5
        },
        margin: { top: 20 }, // Secondary pages will start higher
        didDrawPage: (data) => {
          // Add page number at bottom
          const str = 'Pagina ' + data.pageNumber;
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(str, 196, 285, { align: 'right' });
        }
      });

      doc.save(`iscritti_${selectedEventForRegistrations.title.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating registrations PDF:', error);
      alert('Errore nella generazione del PDF.');
    }
  };

  const handleEdit = (event: any) => {
    setNewEvent({
      title: event.title || '',
      description: event.description || '',
      type: event.type || 'Messa',
      customType: event.customType || '',
      targetAudience: event.targetAudience || '',
      date: event.date || '',
      endDate: event.endDate || '',
      location: event.location || '',
      posterUrl: event.posterUrl || '',
      posterType: event.posterType || '',
      price: event.price || '',
      isApproved: event.isApproved || false,
      showInCalendar: event.showInCalendar || false,
      calendarId: event.calendarId || '',
      registrationsEnabled: event.registrationsEnabled || false,
      maxParticipants: event.maxParticipants || '',
      secretaryInfo: event.secretaryInfo || '',
      registrationFields: event.registrationFields || initialEventState.registrationFields,
    });
    setEditingId(event.id);
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      // Delete from calendar_events if linked
      const calendarEventsQ = query(calEventsColl, where('sourceEventId', '==', id));
      const calendarEventsSnap = await getDocs(calendarEventsQ);
      if (!calendarEventsSnap.empty) {
        const batch = writeBatch(db);
        calendarEventsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      await deleteDoc(doc(eventsColl, id));
      setDeleteConfirmation(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${id}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Eventi</h1>
          <p className="text-slate-500 mt-1">Gestisci il calendario degli eventi parrocchiali.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-3 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm shadow-sm">
            <div className="flex gap-2 mr-2">
              <button 
                onClick={() => {
                  setExportStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                  setExportEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                }}
                className="text-[10px] font-black uppercase text-blue-600 hover:underline"
              >
                Mese
              </button>
              <button 
                onClick={() => {
                  setExportStartDate(format(startOfYear(new Date()), 'yyyy-MM-dd'));
                  setExportEndDate(format(endOfYear(new Date()), 'yyyy-MM-dd'));
                }}
                className="text-[10px] font-black uppercase text-blue-600 hover:underline"
              >
                Anno
              </button>
            </div>
            <div className="flex items-center gap-2">
              <CalendarIcon size={16} className="text-slate-400" />
              <input
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
                className="outline-none bg-transparent"
              />
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
                className="outline-none bg-transparent"
              />
            </div>
            {(exportStartDate || exportEndDate) && (
              <button
                onClick={() => { setExportStartDate(''); setExportEndDate(''); }}
                className="ml-2 p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                title="Resetta filtri"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={exportToPDF}
            disabled={isExporting}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
          >
            <Download size={20} />
            {isExporting ? 'Generando...' : 'Esporta PDF'}
          </button>
          <button
            onClick={() => {
              setIsEditing(false);
              setEditingId(null);
              setNewEvent(initialEventState);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Nuovo Evento
          </button>
        </div>
      </div>

      {!loading && events.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Approved vs Pending */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eventi Approvati</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{approvedCount}</span>
                <span className="text-xs font-semibold text-slate-400">/ {events.length}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">In Attesa</p>
              <span className="text-2xl font-black text-slate-900">{pendingCount}</span>
            </div>
          </div>

          {/* Past vs Scheduled */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <CalendarIcon size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Programmati</p>
              <span className="text-2xl font-black text-slate-900">{scheduledCount}</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-slate-50 text-slate-400 rounded-xl">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Passati</p>
              <span className="text-2xl font-black text-slate-900">{pastCount}</span>
            </div>
          </div>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[250px] relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cerca per titolo, descr o luogo..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            >
              <option value="All">Tutte le Tipologie</option>
              <option value="Messa">Messa</option>
              <option value="Oratorio">Oratorio</option>
              <option value="Catechismo">Catechismo</option>
              <option value="Preghiera">Preghiera</option>
              <option value="Incontro">Incontro</option>
              <option value="Festa">Festa</option>
              <option value="Cena">Cena</option>
              <option value="Gita">Gita</option>
              <option value="Concerto">Concerto</option>
              <option value="Volontariato">Volontariato</option>
              <option value="Formazione">Formazione</option>
              <option value="Altro">Altro</option>
            </select>
            
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            >
              <option value="All">Tutti gli Stati</option>
              <option value="Upcoming">In Arrivo</option>
              <option value="Past">Passati</option>
            </select>

            {(filterSearch !== '' || filterType !== 'All' || filterStatus !== 'All') && (
              <button
                onClick={() => {
                  setFilterSearch('');
                  setFilterType('All');
                  setFilterStatus('All');
                }}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Resetta filtri"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Data e Ora</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Evento</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Iscritti</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Tipologia</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Luogo</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Prezzo</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Stato</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                      Nessun evento trovato con i filtri selezionati.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map((event) => {
                    const eventDate = new Date(event.date);
                    const isPast = isBefore(eventDate, new Date());
                    
                    return (
                      <tr 
                        key={event.id} 
                        onClick={() => handleEdit(event)}
                        className={`hover:bg-slate-50 cursor-pointer transition-colors ${isPast ? 'opacity-75' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 border ${
                              isPast ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-blue-50 border-blue-100 text-blue-700'
                            }`}>
                              <span className="text-[10px] font-bold uppercase leading-none">{format(eventDate, 'MMM', { locale: it })}</span>
                              <span className="text-sm font-bold leading-none">{format(eventDate, 'dd')}</span>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-slate-900 leading-tight">
                                {format(eventDate, 'EEEE', { locale: it })}
                              </p>
                              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                                ore {format(eventDate, 'HH:mm')}
                                {event.endDate && (
                                  <> - {format(new Date(event.endDate), 'HH:mm')}</>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-900">{event.title}</p>
                              {isPast && (
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-bold uppercase">Passato</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-1 max-w-md">{event.description}</p>
                            {event.targetAudience && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase italic">
                                <Users size={10} />
                                {event.targetAudience}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {event.registrationsEnabled ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                <span>{event.registrationsCount || 0} / {event.maxParticipants || '∞'}</span>
                              </div>
                              <div className="h-1 w-20 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all ${
                                    (event.registrationsCount || 0) >= (parseInt(event.maxParticipants) || 9999) ? 'bg-red-500' : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${Math.min(100, ((event.registrationsCount || 0) / (parseInt(event.maxParticipants) || 100)) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-bold uppercase">Disabilitate</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                            event.type === 'Messa' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            event.type === 'Oratorio' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                            event.type === 'Catechismo' ? 'bg-red-50 text-red-700 border-red-100' :
                            event.type === 'Preghiera' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                            event.type === 'Incontro' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                            event.type === 'Festa' ? 'bg-pink-50 text-pink-700 border-pink-100' :
                            event.type === 'Cena' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                            event.type === 'Gita' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            event.type === 'Concerto' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                            event.type === 'Volontariato' ? 'bg-teal-50 text-teal-700 border-teal-100' :
                            event.type === 'Formazione' ? 'bg-cyan-50 text-cyan-700 border-cyan-100' :
                            'bg-slate-50 text-slate-700 border-slate-200'
                          }`}>
                            <Tag size={10} className="opacity-70" />
                            {event.type === 'Altro' && event.customType ? event.customType : event.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {event.location ? (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <MapPin size={14} className="text-slate-400" />
                              {event.location}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300 italic">Luogo non specificato</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {event.price ? (
                            <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md">
                              {event.price}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">---</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {event.isApproved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold uppercase border border-blue-100">
                              Approvato
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-bold uppercase border border-amber-100">
                              In Attesa
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2 text-black">
                            {event.posterUrl && (
                              <a 
                                href={event.posterUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                                title={`Visualizza ${event.posterType === 'pdf' ? 'PDF' : 'Locandina'}`}
                              >
                                {event.posterType === 'pdf' ? <FileText size={16} /> : <ImageIcon size={16} />}
                              </a>
                            )}
                            <button
                              onClick={() => handleEdit(event)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                              title="Modifica"
                            >
                              <Pencil size={16} />
                            </button>
                            {event.registrationsEnabled && (
                              <button
                                onClick={() => setSelectedEventForRegistrations(event)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                                title="Gestisci Iscrizioni"
                              >
                                <ListTodo size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteConfirmation(event.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                              title="Elimina"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Registrations Management Modal */}
      {selectedEventForRegistrations && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[55]">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <ListTodo size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Iscrizioni: {selectedEventForRegistrations.title}</h2>
                  <p className="text-xs text-slate-500">
                    {registrations.length} {registrations.length === 1 ? 'iscritto' : 'iscritti'} 
                    {selectedEventForRegistrations.maxParticipants && ` su ${selectedEventForRegistrations.maxParticipants} posti disponibili`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSelectedEventForRegistrations(null)} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* Secretary Info Banner */}
              {selectedEventForRegistrations.secretaryInfo && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
                  <div className="p-2 bg-white rounded-lg text-amber-600 shadow-sm self-start">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Nota per la Segreteria</p>
                    <p className="text-sm text-amber-900 whitespace-pre-wrap">{selectedEventForRegistrations.secretaryInfo}</p>
                  </div>
                </div>
              )}

              {/* Registration Summary Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                  <div className="p-3 bg-white rounded-lg text-blue-600 shadow-sm">
                    <Users size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Iscritti Totali</p>
                    <p className="text-xl font-black text-slate-900">
                      {registrations.length}
                      {selectedEventForRegistrations.maxParticipants && (
                        <span className="text-sm font-medium text-slate-400 ml-1">/ {selectedEventForRegistrations.maxParticipants}</span>
                      )}
                    </p>
                  </div>
                </div>

                {selectedEventForRegistrations.price && (
                  <>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                      <div className="p-3 bg-white rounded-lg text-blue-600 shadow-sm">
                        <CheckCircle2 size={20} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pagamenti Ricevuti</p>
                        <p className="text-xl font-black text-slate-900">
                          {registrations.filter(r => r.isPaid).length}
                          <span className="text-sm font-medium text-slate-400 ml-1">persone</span>
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center gap-4">
                      <div className="p-3 bg-white rounded-lg text-blue-600 shadow-sm">
                        <span className="font-bold">€</span>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Totale Incassato</p>
                        <p className="text-xl font-black text-blue-900">
                          {(registrations.filter(r => r.isPaid).length * (parseFloat(selectedEventForRegistrations.price.replace(',', '.').replace(/[^0-9.]/g, '')) || 0)).toFixed(2)}€
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <LayoutGrid size={16} /> Elenco Partecipanti
                </h3>
                <button
                  onClick={exportRegistrationsToPDF}
                  className="flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-200 transition-colors"
                >
                  <Download size={14} /> Scarica Elenco PDF
                </button>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider w-12">N.</th>
                      {selectedEventForRegistrations.registrationFields.map((field: any) => (
                        <th key={field.id} className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                          {field.label}
                        </th>
                      ))}
                      {selectedEventForRegistrations.price && (
                        <th className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Pagamento</th>
                      )}
                      <th className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Note</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider">Data Iscr.</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase text-slate-500 tracking-wider text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Inline Registration Entry Row */}
                    <tr className="bg-blue-50/50">
                      <td className="px-6 py-3">
                        <span className="text-[10px] font-bold text-blue-600 opacity-50">#</span>
                      </td>
                      {selectedEventForRegistrations.registrationFields.map((field: any) => (
                        <td key={field.id} className="px-6 py-3">
                          <input
                            type={field.type}
                            required={field.required}
                            placeholder={field.label}
                            value={newParticipant[field.id] || ''}
                            onChange={(e) => setNewParticipant({ ...newParticipant, [field.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSubmitParticipant(e as any);
                              }
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                          />
                        </td>
                      ))}
                      {selectedEventForRegistrations.price && <td className="px-6 py-3"></td>}
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          placeholder="Note segretaria"
                          value={newParticipant.secretaryNotes || ''}
                          onChange={(e) => setNewParticipant({ ...newParticipant, secretaryNotes: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSubmitParticipant(e as any);
                            }
                          }}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        />
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-[10px] font-bold text-blue-600 uppercase">Nuova</span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={handleSubmitParticipant}
                          className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                          title="Salva Iscritto"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      </td>
                    </tr>

                    {registrations.length === 0 ? (
                      <tr>
                        <td colSpan={selectedEventForRegistrations.registrationFields.length + 4 + (selectedEventForRegistrations.price ? 1 : 0)} className="px-6 py-12 text-center text-slate-400 space-y-4">
                          <div className="flex flex-col items-center justify-center">
                            <UserPlus size={32} className="opacity-20 mb-2" />
                            <p className="italic text-sm">Nessun partecipante ancora iscritto.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      registrations.map((reg, index) => (
                        <tr key={reg.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-xs font-bold text-slate-400">
                            {index + 1}
                          </td>
                          {selectedEventForRegistrations.registrationFields.map((field: any) => (
                            <td key={field.id} className="px-6 py-4">
                              <input
                                type={field.type}
                                defaultValue={reg[field.id] || ''}
                                onBlur={(e) => {
                                  if (e.target.value !== (reg[field.id] || '')) {
                                    updateParticipantField(reg.id, field.id, e.target.value);
                                  }
                                }}
                                className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700"
                              />
                            </td>
                          ))}
                          {selectedEventForRegistrations.price && (
                            <td className="px-6 py-4">
                              <button
                                onClick={() => togglePayment(reg.id, !!reg.isPaid)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                                  reg.isPaid 
                                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                                }`}
                              >
                                {reg.isPaid ? <CheckCircle2 size={14} /> : <div className="w-[14px] h-[14px] border border-current rounded-sm" />}
                                {reg.isPaid ? `Pagato (${format(new Date(reg.paymentDate), 'dd/MM')})` : 'Non Pagato'}
                              </button>
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              defaultValue={reg.secretaryNotes || ''}
                              placeholder="Aggiungi nota..."
                              onBlur={(e) => {
                                if (e.target.value !== (reg.secretaryNotes || '')) {
                                  updateSecretaryNotes(reg.id, e.target.value);
                                }
                              }}
                              className="w-full bg-transparent border-none focus:ring-0 text-sm text-slate-600 placeholder:text-slate-300 italic"
                            />
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 italic">
                            {format(new Date(reg.createdAt), 'dd/MM/yyyy HH:mm')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteParticipant(reg.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Elimina"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
                <AlertCircle size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">Conferma Eliminazione</h3>
                <p className="text-slate-500">Sei sicuro di voler eliminare questo evento? Questa operazione non può essere annullata.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="flex-1 px-4 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
              >
                Annulla
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmation)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Registration Delete Confirmation Modal */}
      {registrationToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
                <Trash2 size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">Elimina Iscrizione</h3>
                <p className="text-slate-500">Sei sicuro di voler eliminare questa iscrizione? L'operazione è definitiva.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setRegistrationToDelete(null)}
                className="flex-1 px-4 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
              >
                Annulla
              </button>
              <button
                onClick={executeDeleteParticipant}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-900">
                {isEditing ? 'Modifica Evento' : 'Aggiungi Nuovo Evento'}
              </h2>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setIsEditing(false);
                  setEditingId(null);
                  setNewEvent(initialEventState);
                }} 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Informazioni Base */}
                <div className="lg:col-span-3 space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-600 border-b border-blue-100 pb-1">Dettagli Evento</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Titolo</label>
                      <input
                        type="text"
                        required
                        value={newEvent.title}
                        onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                        placeholder="Nome dell'evento"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Tipologia</label>
                      <select
                        value={newEvent.type}
                        onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                      >
                        <option value="Messa">Messa</option>
                        <option value="Oratorio">Oratorio</option>
                        <option value="Catechismo">Catechismo</option>
                        <option value="Preghiera">Preghiera</option>
                        <option value="Incontro">Incontro</option>
                        <option value="Festa">Festa</option>
                        <option value="Cena">Cena</option>
                        <option value="Gita">Gita</option>
                        <option value="Concerto">Concerto</option>
                        <option value="Volontariato">Volontariato</option>
                        <option value="Formazione">Formazione</option>
                        <option value="Altro">Altro</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Descrizione</label>
                  <textarea
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none text-sm"
                    placeholder="Descrivi l'evento..."
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Luogo</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        value={newEvent.location}
                        onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                        placeholder="es. Aula Magna..."
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Destinatari</label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        value={newEvent.targetAudience}
                        onChange={(e) => setNewEvent({ ...newEvent, targetAudience: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                        placeholder="es. Giovani, Famiglie..."
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-500 uppercase">Inizio Evento</label>
                      <div className="flex gap-1">
                        <button 
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            const currentVal = newEvent.date ? new Date(newEvent.date) : now;
                            const newVal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentVal.getHours(), currentVal.getMinutes());
                            setNewEvent({ ...newEvent, date: format(newVal, "yyyy-MM-dd'T'HH:mm") });
                          }}
                          className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                        >
                          Oggi
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            const tom = addDays(new Date(), 1);
                            const currentVal = newEvent.date ? new Date(newEvent.date) : new Date();
                            const newVal = new Date(tom.getFullYear(), tom.getMonth(), tom.getDate(), currentVal.getHours(), currentVal.getMinutes());
                            setNewEvent({ ...newEvent, date: format(newVal, "yyyy-MM-dd'T'HH:mm") });
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
                      value={newEvent.date}
                      onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-mono"
                    />
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['08:30', '10:00', '11:00', '15:00', '18:00', '21:00'].map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            const [h, m] = t.split(':').map(Number);
                            const current = newEvent.date ? new Date(newEvent.date) : new Date();
                            const newVal = new Date(current.getFullYear(), current.getMonth(), current.getDate(), h, m);
                            setNewEvent({ ...newEvent, date: format(newVal, "yyyy-MM-dd'T'HH:mm") });
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
                      <label className="text-xs font-bold text-slate-500 uppercase">Fine Evento (Opz)</label>
                      <div className="flex gap-1">
                        <button 
                          type="button"
                          onClick={() => {
                            if (!newEvent.date) return;
                            const start = new Date(newEvent.date);
                            const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h
                            setNewEvent({ ...newEvent, endDate: format(end, "yyyy-MM-dd'T'HH:mm") });
                          }}
                          className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                        >
                          +1h
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            if (!newEvent.date) return;
                            const start = new Date(newEvent.date);
                            const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2h
                            setNewEvent({ ...newEvent, endDate: format(end, "yyyy-MM-dd'T'HH:mm") });
                          }}
                          className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                        >
                          +2h
                        </button>
                      </div>
                    </div>
                    <input
                      type="datetime-local"
                      value={newEvent.endDate}
                      onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Prezzo</label>
                    <input
                      type="text"
                      value={newEvent.price}
                      onChange={(e) => setNewEvent({ ...newEvent, price: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                      placeholder="es. Gratuito, 10€..."
                    />
                  </div>
                  {newEvent.type === 'Altro' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Specifica Tipo</label>
                      <input
                        type="text"
                        required
                        value={newEvent.customType}
                        onChange={(e) => setNewEvent({ ...newEvent, customType: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                        placeholder="Tipo custom"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Locandina / Poster</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      id="poster-upload"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewEvent({ 
                              ...newEvent, 
                              posterUrl: reader.result as string,
                              posterType: file.type.includes('pdf') ? 'pdf' : 'image'
                            });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <label 
                      htmlFor="poster-upload"
                      className="flex-1 border-2 border-dashed border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-1 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all text-slate-500 hover:text-blue-600 h-[104px]"
                    >
                      <Upload size={20} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Upload File</span>
                    </label>
                    {newEvent.posterUrl && (
                      <button
                        type="button"
                        onClick={() => setNewEvent({ ...newEvent, posterUrl: '', posterType: '' })}
                        className="p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors border border-red-100 h-[104px]"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sezione Iscrizioni */}
                <div className="lg:col-span-3 p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                        <ListTodo size={20} />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 uppercase tracking-tight">Iscrizioni & Registrazioni</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Configura il modulo di iscrizione</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200">
                      <input
                        type="checkbox"
                        id="registrationsEnabled"
                        checked={newEvent.registrationsEnabled}
                        onChange={(e) => setNewEvent({ ...newEvent, registrationsEnabled: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <label htmlFor="registrationsEnabled" className="text-xs font-bold text-slate-700 cursor-pointer uppercase">Attiva Modulo</label>
                    </div>
                  </div>

                  {newEvent.registrationsEnabled && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">N. Max Partecipanti</label>
                          <input
                            type="number"
                            placeholder="Senza limite"
                            value={newEvent.maxParticipants}
                            onChange={(e) => setNewEvent({ ...newEvent, maxParticipants: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            Note Segreteria (Istruzioni Interne)
                          </label>
                          <textarea
                            placeholder="es. Note interne per chi gestisce le iscrizioni..."
                            value={newEvent.secretaryInfo}
                            onChange={(e) => setNewEvent({ ...newEvent, secretaryInfo: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm h-32 resize-none focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Personalizzazione Campi</label>
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-2">
                          {newEvent.registrationFields.map((field, index) => (
                            <div key={field.id} className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                              <span className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded-lg text-xs font-black text-slate-400 border border-slate-100">{index + 1}</span>
                              <input
                                type="text"
                                value={field.label}
                                onChange={(e) => {
                                  const updated = [...newEvent.registrationFields];
                                  updated[index].label = e.target.value;
                                  setNewEvent({ ...newEvent, registrationFields: updated });
                                }}
                                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700"
                                placeholder="Esempio: Classe"
                              />
                              <select
                                value={field.type}
                                onChange={(e) => {
                                  const updated = [...newEvent.registrationFields];
                                  updated[index].type = e.target.value as any;
                                  setNewEvent({ ...newEvent, registrationFields: updated });
                                }}
                                className="bg-slate-50 border-none text-[9px] uppercase font-black py-1 px-2 rounded-lg text-slate-500"
                              >
                                <option value="text">Testo</option>
                                <option value="number">Num</option>
                                <option value="email">Email</option>
                                <option value="tel">Tel</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = newEvent.registrationFields.filter((_, i) => i !== index);
                                  setNewEvent({ ...newEvent, registrationFields: updated });
                                }}
                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newField: RegistrationField = {
                              id: Math.random().toString(36).substr(2, 9),
                              label: '',
                              type: 'text',
                              required: true
                            };
                            setNewEvent({ ...newEvent, registrationFields: [...newEvent.registrationFields, newField] });
                          }}
                          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-600 hover:text-white px-4 py-3 rounded-xl border-2 border-dashed border-blue-200 w-full justify-center transition-all bg-white"
                        >
                          <Plus size={16} /> Aggiungi Campo Personalizzato
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-3 space-y-4">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 flex items-center gap-3 p-5 bg-blue-600 rounded-3xl border border-blue-500 shadow-lg shadow-blue-100">
                      <input
                        type="checkbox"
                        id="isApproved"
                        checked={newEvent.isApproved}
                        onChange={(e) => setNewEvent({ ...newEvent, isApproved: e.target.checked })}
                        className="w-6 h-6 rounded-lg border-2 border-blue-400 text-white focus:ring-blue-300 cursor-pointer bg-blue-700"
                      />
                      <label htmlFor="isApproved" className="text-sm font-black text-white cursor-pointer select-none uppercase tracking-widest">
                        Pubblica Evento (Visibile nel portale pubblico)
                      </label>
                    </div>

                    <div className={`flex-1 p-5 rounded-3xl border transition-all flex flex-col gap-3 ${newEvent.showInCalendar ? 'bg-amber-500 border-amber-400 shadow-lg shadow-amber-100' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="showInCalendar"
                          checked={newEvent.showInCalendar}
                          onChange={(e) => {
                            const show = e.target.checked;
                            setNewEvent({ 
                              ...newEvent, 
                              showInCalendar: show,
                              calendarId: show && !newEvent.calendarId ? (calendars[0]?.id || '') : newEvent.calendarId
                            });
                          }}
                          className={`w-6 h-6 rounded-lg border-2 cursor-pointer ${newEvent.showInCalendar ? 'border-amber-300 text-white bg-amber-600' : 'border-slate-300 bg-white text-blue-600'}`}
                        />
                        <label htmlFor="showInCalendar" className={`text-sm font-black cursor-pointer select-none uppercase tracking-widest ${newEvent.showInCalendar ? 'text-white' : 'text-slate-600'}`}>
                          Mostra nel Calendario
                        </label>
                      </div>
                      
                      {newEvent.showInCalendar && (
                        <div className="animate-in fade-in zoom-in-95 duration-200">
                          <select
                            value={newEvent.calendarId}
                            onChange={(e) => setNewEvent({ ...newEvent, calendarId: e.target.value })}
                            className="w-full px-4 py-2 rounded-xl bg-white/20 border border-white/30 text-white text-xs font-bold outline-none focus:ring-2 focus:ring-white/50 backdrop-blur-sm placeholder:text-white/50"
                          >
                            <option value="" disabled className="text-slate-900">Seleziona Calendario...</option>
                            {calendars.map(cal => (
                              <option key={cal.id} value={cal.id} className="text-slate-900">{cal.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-8 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-100 transition-all uppercase tracking-widest text-[10px]"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-0 transition-all uppercase tracking-widest text-[10px]"
                >
                  {isEditing ? 'Salva Modifiche' : 'Crea Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Events;
