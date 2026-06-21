import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, addDoc, query, orderBy, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { Plus, Trash2, DoorOpen, Users, Calendar, Clock, User, X, Check, XCircle, Pencil, Info, AlertCircle, FileDown } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const Rooms: React.FC = () => {
  const { currentParish } = useParish();
  const roomsColl = useParishCollection('rooms');
  const bookingsColl = useParishCollection('bookings');
  const calendarsColl = useParishCollection('calendars');
  const calEventsColl = useParishCollection('calendar_events');
  const eventsColl = useParishCollection('events');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [searchParams, setSearchParams] = useSearchParams();
  const [rooms, setRooms] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [parishInfo, setParishInfo] = useState<any>({ name: '', logoUrl: '' });
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isManageRoomsOpen, setIsManageRoomsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [bookingToDelete, setBookingToDelete] = useState<string | null>(null);
  
  const [roomsCalendarId, setRoomsCalendarId] = useState<string | null>(null);
  
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [showPast, setShowPast] = useState<boolean>(false);
  
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteYear, setBulkDeleteYear] = useState('');
  const [bulkDeleteInput, setBulkDeleteInput] = useState('');
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const [isWeeklyReportModalOpen, setIsWeeklyReportModalOpen] = useState(false);
  const [weeklyReportDate, setWeeklyReportDate] = useState<Date>(new Date());
  
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  
  const [newRoom, setNewRoom] = useState({ name: '', capacity: 0, description: '' });
  const [newBooking, setNewBooking] = useState({
    roomIds: [] as string[],
    requesterName: '',
    requesterPhone: '',
    purpose: '',
    startTime: '',
    endTime: '',
    status: 'In Attesa' as 'In Attesa' | 'Approvata' | 'Rifiutata',
  });

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && !loading && bookings.length > 0) {
      const bookingToEdit = bookings.find(b => b.id === editId);
      if (bookingToEdit) {
        handleEditBooking(bookingToEdit);
        // Clear the param after opening to avoid re-opening if the user closes and stays on the page
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('edit');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [searchParams, loading, bookings]);

  useEffect(() => {
    const unsubRooms = onSnapshot(roomsColl, (snap) => {
      setRooms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qBookings = query(bookingsColl, orderBy('startTime', 'desc'));
    const unsubBookings = onSnapshot(qBookings, (snap) => {
      setBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const unsubEvents = onSnapshot(eventsColl, (snap) => {
      setEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
    });

    const unsubCalEvents = onSnapshot(calEventsColl, (snap) => {
      setCalendarEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any })));
    });

    const unsubCalendars = onSnapshot(calendarsColl, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const roomsCal = data.find(c => c.name.toUpperCase() === 'UTILIZZO SALE');
      if (roomsCal) {
        setRoomsCalendarId(roomsCal.id);
      } else {
        addDoc(calendarsColl, {
          name: 'UTILIZZO SALE',
          color: '#10b981',
          visible: true
        });
      }
    });

    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    });

    return () => {
      unsubRooms();
      unsubBookings();
      unsubEvents();
      unsubCalEvents();
      unsubCalendars();
      unsubParish();
    };
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRoomId) {
        await updateDoc(doc(roomsColl, editingRoomId), newRoom);
      } else {
        await addDoc(roomsColl, newRoom);
      }
      setIsRoomModalOpen(false);
      setEditingRoomId(null);
      setNewRoom({ name: '', capacity: 0, description: '' });
    } catch (error) {
      handleFirestoreError(error, editingRoomId ? OperationType.UPDATE : OperationType.CREATE, 'rooms');
    }
  };

  const handleEditRoom = (room: any) => {
    setEditingRoomId(room.id);
    setNewRoom({
      name: room.name,
      capacity: room.capacity,
      description: room.description || '',
    });
    setIsRoomModalOpen(true);
  };

  const syncWithCalendar = async (bookingId: string, bookingData: any) => {
    if (!roomsCalendarId) return;

    const bookingRef = doc(bookingsColl, bookingId);
    
    if (bookingData.status === 'Approvata') {
      let descriptionNote = `Prenotato da: ${bookingData.requesterName}${bookingData.requesterPhone ? ` - Tel: ${bookingData.requesterPhone}` : ''}`;
      if (bookingData.createdAt) {
        const createdDate = new Date(bookingData.createdAt);
        const formattedCreated = createdDate.toLocaleString('it-IT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        descriptionNote += `\nInserita il: ${formattedCreated}`;
      }

      const eventData = {
        title: bookingData.purpose || 'Uso Sala',
        start: bookingData.startTime,
        end: bookingData.endTime,
        location: bookingData.roomNames || bookingData.roomName || '',
        description: descriptionNote,
        calendarId: roomsCalendarId,
        sourceBookingId: bookingId,
        isRoomBooking: true,
        requesterName: bookingData.requesterName,
        requesterPhone: bookingData.requesterPhone || '',
        rooms: bookingData.roomNames || bookingData.roomName || '',
        purpose: bookingData.purpose || '',
        createdAt: bookingData.createdAt || ''
      };

      if (bookingData.calendarEventId) {
        await updateDoc(doc(calEventsColl, bookingData.calendarEventId), eventData);
      } else {
        const eventRef = await addDoc(calEventsColl, eventData);
        await updateDoc(bookingRef, { calendarEventId: eventRef.id });
      }
    } else {
      // If not approved, remove from calendar if it exists
      if (bookingData.calendarEventId) {
        try {
          await deleteDoc(doc(calEventsColl, bookingData.calendarEventId));
        } catch (e) {
          console.warn('Calendar event already deleted or not found');
        }
        await updateDoc(bookingRef, { calendarEventId: null });
      }
    }
  };

  const handleStartHourPreset = (timeStr: string) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const baseDate = newBooking.startTime ? newBooking.startTime.split('T')[0] : todayStr;
    setNewBooking(prev => ({
      ...prev,
      startTime: `${baseDate}T${timeStr}`
    }));
  };

  const handleDurationPreset = (hoursNum: number) => {
    if (!newBooking.startTime) return;
    try {
      const startDt = new Date(newBooking.startTime);
      const endDt = new Date(startDt.getTime() + hoursNum * 60 * 60 * 1000);
      setNewBooking(prev => ({
        ...prev,
        endTime: format(endDt, "yyyy-MM-dd'T'HH:mm")
      }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleFullSlotPreset = (startStr: string, endStr: string) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const baseDate = newBooking.startTime ? newBooking.startTime.split('T')[0] : todayStr;
    setNewBooking(prev => ({
      ...prev,
      startTime: `${baseDate}T${startStr}`,
      endTime: `${baseDate}T${endStr}`
    }));
  };

  const executeSaveBooking = async (roomNamesJoined: string) => {
    try {
      let bookingId = editingBookingId;
      const nowIso = new Date().toISOString();
      const bookingData = {
        ...newBooking,
        roomNames: roomNamesJoined,
      };

      if (editingBookingId) {
        await updateDoc(doc(bookingsColl, editingBookingId), bookingData);
      } else {
        const docRef = await addDoc(bookingsColl, {
          ...bookingData,
          createdAt: nowIso,
        });
        bookingId = docRef.id;
      }

      // Sync after saving
      if (bookingId) {
        // If it was an edit, we need the existing calendarEventId/createdAt if any
        let finalData: any = { ...bookingData };
        if (editingBookingId) {
          const existing = bookings.find(b => b.id === editingBookingId);
          if (existing?.calendarEventId) {
            finalData.calendarEventId = existing.calendarEventId;
          }
          if (existing?.createdAt) {
            finalData.createdAt = existing.createdAt;
          }
        } else {
          finalData.createdAt = nowIso;
        }
        await syncWithCalendar(bookingId, finalData);
      }

      setIsBookingModalOpen(false);
      setEditingBookingId(null);
      setNewBooking({
        roomIds: [],
        requesterName: '',
        requesterPhone: '',
        purpose: '',
        startTime: '',
        endTime: '',
        status: 'In Attesa',
      });
    } catch (error) {
      handleFirestoreError(error, editingBookingId ? OperationType.UPDATE : OperationType.CREATE, 'bookings');
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newBooking.roomIds.length === 0) {
      alert("Seleziona almeno una sala");
      return;
    }
    
    const selectedRooms = rooms.filter(r => newBooking.roomIds.includes(r.id));
    const roomNamesJoined = selectedRooms.map(r => r.name).join(', ');

    // Check for overlap with existing active bookings (Approvata or In Attesa)
    let hasOverlap = false;
    let conflictMsg = '';

    try {
      const startA = new Date(newBooking.startTime).getTime();
      const endA = new Date(newBooking.endTime).getTime();

      for (const b of bookings) {
        if (editingBookingId && b.id === editingBookingId) continue;
        if (b.status === 'Rifiutata') continue;

        const startB = new Date(b.startTime).getTime();
        const endB = new Date(b.endTime).getTime();

        if (startA < endB && startB < endA) {
          const activeRoomIdsB = b.roomIds || (b.roomId ? [b.roomId] : []);
          const overlapping = newBooking.roomIds.filter(rid => activeRoomIdsB.includes(rid));

          if (overlapping.length > 0) {
            const conflictingNames = rooms
              .filter(r => overlapping.includes(r.id))
              .map(r => r.name)
              .join(', ');
            
            const formattedDate = format(new Date(b.startTime), 'dd/MM/yyyy', { locale: it });
            const formattedStartB = format(new Date(b.startTime), 'HH:mm', { locale: it });
            const formattedEndB = format(new Date(b.endTime), 'HH:mm', { locale: it });

            conflictMsg = `La sala (o le sale):\n"${conflictingNames}"\n\nrisulta già occupata in queste ore (${formattedDate} dalle ${formattedStartB} alle ${formattedEndB}) da:\n` +
              `• "${b.requesterName}" per lo scopo: "${b.purpose || 'Uso Sala'}" [Stato: ${b.status}]\n\n` +
              `Vuoi registrare comunque la prenotazione creando una sovrapposizione?`;
            
            hasOverlap = true;
            break; // Warn once is enough
          }
        }
      }

      // Check overlap with scheduled events as well
      if (!hasOverlap) {
        for (const e of events) {
          if (!e.roomIds || e.roomIds.length === 0) continue;
          if (!e.date) continue;

          const startE = new Date(e.date).getTime();
          const endE = e.endDate ? new Date(e.endDate).getTime() : startE;

          if (startA < endE && startE < endA) {
            const overlapping = newBooking.roomIds.filter(rid => e.roomIds.includes(rid));

            if (overlapping.length > 0) {
              const conflictingNames = rooms
                .filter(r => overlapping.includes(r.id))
                .map(r => r.name)
                .join(', ');

              const formattedDate = format(new Date(e.date), 'dd/MM/yyyy', { locale: it });
              const formattedStartE = format(new Date(e.date), 'HH:mm', { locale: it });
              const formattedEndE = e.endDate
                ? format(new Date(e.endDate), 'HH:mm', { locale: it })
                : format(new Date(startE), 'HH:mm', { locale: it });

              conflictMsg = `La sala (o le sale):\n"${conflictingNames}"\n\nrisulta occupata da un evento programmato in queste ore (${formattedDate} dalle ${formattedStartE} alle ${formattedEndE}) da:\n` +
                `• "📅 ${e.title || 'Evento'}"\n\n` +
                `Vuoi registrare comunque la prenotazione creando una sovrapposizione?`;

              hasOverlap = true;
              break;
            }
          }
        }
      }

      // Check overlap with calendar events (including Catechism, other calendar events)
      if (!hasOverlap) {
        for (const ce of calendarEvents) {
          if (editingBookingId && ce.sourceBookingId === editingBookingId) continue;

          const ceRoomIds: string[] = ce.roomIds || (ce.roomId ? [ce.roomId] : []);
          if (ceRoomIds.length === 0) continue;
          if (!ce.start || !ce.end) continue;

          const startCE = new Date(ce.start).getTime();
          const endCE = new Date(ce.end).getTime();

          if (startA < endCE && startCE < endA) {
            const overlapping = newBooking.roomIds.filter(rid => ceRoomIds.includes(rid));

            if (overlapping.length > 0) {
              const conflictingNames = rooms
                .filter(r => overlapping.includes(r.id))
                .map(r => r.name)
                .join(', ');

              const formattedDate = format(new Date(ce.start), 'dd/MM/yyyy', { locale: it });
              const formattedStartCE = format(new Date(ce.start), 'HH:mm', { locale: it });
              const formattedEndCE = format(new Date(ce.end), 'HH:mm', { locale: it });

              const isCatechismStr = ce.isCatechism ? 'Incontro di Catechismo' : 'Attività a calendario';

              conflictMsg = `La sala (o le sale):\n"${conflictingNames}"\n\nrisulta occupata da un'attività a calendario in queste ore (${formattedDate} dalle ${formattedStartCE} alle ${formattedEndCE}) per:\n` +
                `• "${ce.title || 'Incontro'}" (${isCatechismStr})\n\n` +
                `Vuoi registrare comunque la prenotazione creando una sovrapposizione?`;

              hasOverlap = true;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error("Error during overlap check: ", err);
    }

    if (hasOverlap) {
      setConfirmModal({
        isOpen: true,
        title: "Rilevato Conflitto Sale",
        message: conflictMsg,
        onConfirm: () => executeSaveBooking(roomNamesJoined)
      });
    } else {
      await executeSaveBooking(roomNamesJoined);
    }
  };

  const handleEditBooking = (booking: any) => {
    setEditingBookingId(booking.id);
    setNewBooking({
      roomIds: booking.roomIds || [],
      requesterName: booking.requesterName,
      requesterPhone: booking.requesterPhone || '',
      purpose: booking.purpose || '',
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
    });
    setIsBookingModalOpen(true);
  };

  const handleDeleteBooking = async (id: string) => {
    try {
      const booking = bookings.find(b => b.id === id);
      if (booking?.calendarEventId && roomsCalendarId) {
        try {
          await deleteDoc(doc(calEventsColl, booking.calendarEventId));
        } catch (e) {
          console.warn('Calendar event not found during booking deletion');
        }
      }
      await deleteDoc(doc(bookingsColl, id));
      setBookingToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `bookings/${id}`);
    }
  };

  const handleDeleteAllByYear = async (yearStr: string) => {
    if (!yearStr) return;
    setIsDeletingBulk(true);
    try {
      const bookingsToDeleteList = bookings.filter(b => {
        try {
          return b.startTime && new Date(b.startTime).getFullYear().toString() === yearStr;
        } catch {
          return false;
        }
      });

      for (const booking of bookingsToDeleteList) {
        if (booking.calendarEventId && roomsCalendarId) {
          try {
            await deleteDoc(doc(calEventsColl, booking.calendarEventId));
          } catch (e) {
            console.warn('Calendar event not found during bulk deletion');
          }
        }
        await deleteDoc(doc(bookingsColl, booking.id));
      }
      
      setIsBulkDeleteModalOpen(false);
      setBulkDeleteYear('');
      setBulkDeleteInput('');
    } catch (error) {
      console.error("Error during bulk delete:", error);
      alert("Si è verificato un errore durante l'eliminazione delle prenotazioni.");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const downloadWeeklyReportPDF = (targetDate: Date) => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const start = startOfWeek(targetDate, { weekStartsOn: 1 });
    const end = endOfWeek(targetDate, { weekStartsOn: 1 });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    const drawHeader = (pdf: jsPDF) => {
      // Header Background (very soft blue)
      pdf.setFillColor(240, 246, 255);
      pdf.rect(0, 0, pageWidth, 35, 'F');
      
      // Parish Logo
      if (parishInfo.logoUrl) {
        try {
          pdf.addImage(parishInfo.logoUrl, 'PNG', margin, 6, 22, 22);
        } catch (e) {
          pdf.setDrawColor(37, 99, 235);
          pdf.setFillColor(219, 234, 254);
          pdf.circle(margin + 11, 17, 11, 'FD');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(11);
          pdf.setTextColor(37, 99, 235);
          pdf.text('UP', margin + 11, 20.5, { align: 'center' });
        }
      } else {
        pdf.setDrawColor(37, 99, 235);
        pdf.setFillColor(219, 234, 254);
        pdf.circle(margin + 11, 17, 11, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(37, 99, 235);
        pdf.text('UP', margin + 11, 20.5, { align: 'center' });
      }

      const textStartX = margin + 28;

      // Parish Name
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(30, 41, 59); // slate-800
      pdf.text(parishInfo.name || currentParish?.name || 'Parrocchia', textStartX, 11);
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(100, 116, 139); // slate-500

      let hRowY = 16;
      if (parishInfo.diocese) {
        pdf.text(parishInfo.diocese, textStartX, hRowY);
        hRowY += 4;
      }
      if (parishInfo.pastoralCommunity) {
        pdf.text(parishInfo.pastoralCommunity, textStartX, hRowY);
        hRowY += 4;
      }
      
      // Print address and contacts in a lighter italic font
      const contactInfoArr = [];
      if (parishInfo.address) contactInfoArr.push(parishInfo.address);
      if (parishInfo.phone) contactInfoArr.push(`Tel: ${parishInfo.phone}`);
      if (parishInfo.email) contactInfoArr.push(parishInfo.email);
      
      if (contactInfoArr.length > 0) {
        pdf.setFont('helvetica', 'oblique');
        pdf.text(contactInfoArr.join('  •  '), textStartX, hRowY);
      }

      // Info Box at Top Right for Week
      const boxWidth = 85;
      const boxHeight = 22;
      const boxX = pageWidth - margin - boxWidth;
      const boxY = 7;

      pdf.setFillColor(37, 99, 235);
      pdf.roundedRect(boxX, boxY, boxWidth, boxHeight, 3, 3, 'F');

      // Title inside box
      pdf.setFontSize(8.5);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.text('REPORT SETTIMANALE OCCUPAZIONE', boxX + boxWidth / 2, boxY + 7.5, { align: 'center' });
      
      // Date Range inside box
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      const rangeText = `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`;
      pdf.text(rangeText, boxX + boxWidth / 2, boxY + 14.5, { align: 'center' });

      // Decorative Line
      pdf.setDrawColor(37, 99, 235);
      pdf.setLineWidth(0.6);
      pdf.line(0, 35, pageWidth, 35);
    };

    // Filter and Sort bookings for this week
    const weekBookings = bookings.filter(b => {
      try {
        const bStart = new Date(b.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();
        const weekStart = start.getTime();
        const weekEnd = end.getTime();
        // Overlap condition
        return bStart < weekEnd && bEnd > weekStart;
      } catch {
        return false;
      }
    });

    // Filter events for this week
    const weekEvents = events.filter(e => {
      try {
        if (!e.roomIds || e.roomIds.length === 0) return false;
        if (!e.date) return false;
        const eStart = new Date(e.date).getTime();
        const eEnd = e.endDate ? new Date(e.endDate).getTime() : eStart;
        const weekStart = start.getTime();
        const weekEnd = end.getTime();
        // Overlap condition
        return eStart < weekEnd && eEnd > weekStart;
      } catch {
        return false;
      }
    });

    // Merge both into a unified list
    const unifiedWeekItems = [
      ...weekBookings.map(b => {
        const roomNames = b.roomIds
          ? b.roomIds.map((id: string) => {
              const found = rooms.find(r => r.id === id);
              return found ? found.name : 'Sala non trovata';
            }).join(', ')
          : (rooms.find(r => r.id === b.roomId)?.name || 'N/D');

        return {
          dateVal: new Date(b.startTime),
          dateStr: format(new Date(b.startTime), 'EEEE dd/MM/yyyy', { locale: it }),
          timeRange: `${format(new Date(b.startTime), 'HH:mm')} - ${format(new Date(b.endTime), 'HH:mm')}`,
          rooms: roomNames,
          requester: b.requesterName || '-',
          phone: b.requesterPhone || '-',
          purpose: b.purpose || '-',
          status: b.status || 'Approvata'
        };
      }),
      ...weekEvents.map(e => {
        const roomNames = e.roomIds.map((roomId: string) => {
          const found = rooms.find(r => r.id === roomId);
          return found ? found.name : '';
        }).filter(Boolean).join(', ');

        const eStart = new Date(e.date);
        const eEnd = e.endDate ? new Date(e.endDate) : eStart;

        return {
          dateVal: eStart,
          dateStr: format(eStart, 'EEEE dd/MM/yyyy', { locale: it }),
          timeRange: `${format(eStart, 'HH:mm')} - ${format(eEnd, 'HH:mm')}`,
          rooms: roomNames || 'Nessuna sala specificata',
          requester: 'Evento Programmato',
          phone: '-',
          purpose: e.title || '-',
          status: 'Programmato'
        };
      })
    ];

    // Sort by chronological start time
    unifiedWeekItems.sort((a, b) => a.dateVal.getTime() - b.dateVal.getTime());

    const tableBody = unifiedWeekItems.map(item => {
      const uppercaseDate = item.dateStr.charAt(0).toUpperCase() + item.dateStr.slice(1);
      return [
        uppercaseDate,
        item.timeRange,
        item.rooms,
        item.requester,
        item.phone,
        item.purpose,
        item.status
      ];
    });

    autoTable(doc, {
      startY: 42,
      head: [['Giorno', 'Orario', 'Sala/e', 'Richiedente', 'Telefono', 'Scopo/Evento', 'Stato']],
      body: tableBody,
      styles: { fontSize: 8.5, cellPadding: 3.5, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 45, fontStyle: 'bold' },
        3: { cellWidth: 35 },
        4: { cellWidth: 30 },
        5: { fontStyle: 'italic' },
        6: { cellWidth: 25, halign: 'center' }
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

    doc.save(`occupazione-sale-settimana-${format(start, 'yyyy-MM-dd')}.pdf`);
  };

  const executeUpdateBookingStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(bookingsColl, id), { status });
      // Sync after status update
      const booking = bookings.find(b => b.id === id);
      if (booking) {
        await syncWithCalendar(id, { ...booking, status });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${id}`);
    }
  };

  const updateBookingStatus = async (id: string, status: string) => {
    try {
      if (status === 'Approvata') {
        const bookingToApprove = bookings.find(b => b.id === id);
        if (bookingToApprove) {
          const startA = new Date(bookingToApprove.startTime).getTime();
          const endA = new Date(bookingToApprove.endTime).getTime();
          const rIdsA = bookingToApprove.roomIds || (bookingToApprove.roomId ? [bookingToApprove.roomId] : []);
          
          let hasOverlap = false;
          let conflictMsg = '';

          for (const b of bookings) {
            if (b.id === id) continue;
            if (b.status !== 'Approvata') continue;

            const startB = new Date(b.startTime).getTime();
            const endB = new Date(b.endTime).getTime();

            if (startA < endB && startB < endA) {
              const activeRoomIdsB = b.roomIds || (b.roomId ? [b.roomId] : []);
              const overlapping = rIdsA.filter((rid: string) => activeRoomIdsB.includes(rid));

              if (overlapping.length > 0) {
                const conflictingNames = rooms
                  .filter(r => overlapping.includes(r.id))
                  .map(r => r.name)
                  .join(', ');
                
                const formattedDate = format(new Date(b.startTime), 'dd/MM/yyyy', { locale: it });
                const formattedStartB = format(new Date(b.startTime), 'HH:mm', { locale: it });
                const formattedEndB = format(new Date(b.endTime), 'HH:mm', { locale: it });

                conflictMsg = `La sala (o le sale):\n"${conflictingNames}"\n\nrisulta già occupata e APPROVATA in queste ore (${formattedDate} dalle ${formattedStartB} alle ${formattedEndB}) da:\n` +
                  `• "${b.requesterName}" per lo scopo: "${b.purpose || 'Uso Sala'}"\n\n` +
                  `Vuoi approvare comunque questa prenotazione creandone una duplicata?`;
                
                hasOverlap = true;
                break; // Warn once is enough
              }
            }
          }

          // Check overlap with calendar events (including Catechism, other calendar events)
          if (!hasOverlap) {
            for (const ce of calendarEvents) {
              if (ce.sourceBookingId === id) continue; // Skip itself if already logged

              const ceRoomIds: string[] = ce.roomIds || (ce.roomId ? [ce.roomId] : []);
              if (ceRoomIds.length === 0) continue;
              if (!ce.start || !ce.end) continue;

              const startCE = new Date(ce.start).getTime();
              const endCE = new Date(ce.end).getTime();

              if (startA < endCE && startCE < endA) {
                const overlapping = rIdsA.filter((rid: string) => ceRoomIds.includes(rid));

                if (overlapping.length > 0) {
                  const conflictingNames = rooms
                    .filter(r => overlapping.includes(r.id))
                    .map(r => r.name)
                    .join(', ');

                  const formattedDate = format(new Date(ce.start), 'dd/MM/yyyy', { locale: it });
                  const formattedStartCE = format(new Date(ce.start), 'HH:mm', { locale: it });
                  const formattedEndCE = format(new Date(ce.end), 'HH:mm', { locale: it });

                  const isCatechismStr = ce.isCatechism ? 'Incontro di Catechismo' : 'Attività a calendario';

                  conflictMsg = `La sala (o le sale):\n"${conflictingNames}"\n\nrisulta occupata da un'attività a calendario in queste ore (${formattedDate} dalle ${formattedStartCE} alle ${formattedEndCE}) per:\n` +
                    `• "${ce.title || 'Incontro'}" (${isCatechismStr})\n\n` +
                    `Vuoi approvare comunque questa prenotazione creandone una duplicata?`;

                  hasOverlap = true;
                  break;
                }
              }
            }
          }

          if (hasOverlap) {
            setConfirmModal({
              isOpen: true,
              title: "Approvazione con Conflitto",
              message: conflictMsg,
              onConfirm: () => executeUpdateBookingStatus(id, status)
            });
            return;
          }
        }
      }

      await executeUpdateBookingStatus(id, status);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${id}`);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    try {
      await deleteDoc(doc(roomsColl, id));
      setRoomToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rooms/${id}`);
    }
  };

  const availableYears = Array.from(new Set([
    new Date().getFullYear(),
    new Date().getFullYear() + 1,
    ...bookings.map(b => {
      try {
        return b.startTime ? new Date(b.startTime).getFullYear() : null;
      } catch {
        return null;
      }
    }).filter(Boolean) as number[],
    ...events.map(e => {
      try {
        return e.date ? new Date(e.date).getFullYear() : null;
      } catch {
        return null;
      }
    }).filter(Boolean) as number[]
  ])).sort((a, b) => b - a);

  const eventItems = events
    .filter(e => e.roomIds && e.roomIds.length > 0)
    .map(e => {
      const assignedRooms = e.roomIds.map((roomId: string) => {
        const found = rooms.find(r => r.id === roomId);
        return found ? found.name : '';
      }).filter(Boolean).join(', ');
      
      return {
        id: e.id,
        isEvent: true,
        requesterName: '📅 Evento Programmato',
        requesterPhone: '',
        purpose: e.title || 'Nessun nome specificato',
        roomNames: assignedRooms || 'Nessuna sala specificata',
        startTime: e.date,
        endTime: e.endDate || e.date,
        status: 'Programmato',
        rawEvent: e
      };
    });

  const bookingItems = bookings.map(b => {
    const roomNames = b.roomIds
      ? b.roomIds.map((id: string) => {
          const found = rooms.find(r => r.id === id);
          return found ? found.name : 'Sala non trovata';
        }).join(', ')
      : (rooms.find(r => r.id === b.roomId)?.name || 'N/D');

    return {
      id: b.id,
      isEvent: false,
      requesterName: b.requesterName || 'N/D',
      requesterPhone: b.requesterPhone || '',
      purpose: b.purpose || 'Nessuno scopo specificato',
      roomNames: roomNames,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status || 'Approvata',
      rawBooking: b
    };
  });

  const allFilteredItems = [...eventItems, ...bookingItems].filter(item => {
    if (selectedYear) {
      try {
        const bYear = new Date(item.startTime).getFullYear().toString();
        if (bYear !== selectedYear) return false;
      } catch {
        return false;
      }
    }
    if (!showPast) {
      try {
        const isPast = new Date(item.endTime) < new Date();
        if (isPast) return false;
      } catch {
        return false;
      }
    }
    return true;
  });

  allFilteredItems.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Prenotazione Sale</h1>
          <p className="text-slate-500 font-medium italic text-sm">Gestisci le richieste di utilizzo e la disponibilità delle sale.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setWeeklyReportDate(new Date());
              setIsWeeklyReportModalOpen(true);
            }}
            className="flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-100 transition-all shadow-sm active:scale-95 text-[10px] cursor-pointer"
          >
            <FileDown size={18} className="text-blue-600" />
            Report Settimanale (PDF)
          </button>
          <button
            onClick={() => setIsManageRoomsOpen(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
          >
            <DoorOpen size={18} />
            Gestisci Sale
          </button>
          <button
            onClick={() => {
              setEditingBookingId(null);
              setNewBooking({
                roomIds: [],
                requesterName: '',
                requesterPhone: '',
                purpose: '',
                startTime: '',
                endTime: '',
                status: 'In Attesa',
              });
              setIsBookingModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-95 text-[10px]"
          >
            <Calendar size={18} />
            Nuova Prenotazione
          </button>
        </div>
      </div>

      {/* Bookings Section */}
      <section>
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          {/* Filters Bar */}
          <div className="bg-slate-50/50 px-8 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-xs font-black text-slate-800 uppercase italic tracking-wider flex items-center gap-2">
              <Calendar size={16} className="text-blue-500" />
              Filtra Prenotazioni
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              {/* Year Filter */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Anno:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 px-4 py-1.5 rounded-full font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all cursor-pointer shadow-sm hover:border-slate-300"
                >
                  <option value="">Tutti</option>
                  {availableYears.map(year => (
                    <option key={year} value={year.toString()}>{year}</option>
                  ))}
                </select>
                {selectedYear && (
                  <button
                    type="button"
                    onClick={() => {
                      setBulkDeleteYear(selectedYear);
                      setBulkDeleteInput('');
                      setIsBulkDeleteModalOpen(true);
                    }}
                    title={`Elimina tutte le prenotazioni del ${selectedYear}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-full font-bold text-[10px] uppercase tracking-wide transition-colors shadow-sm cursor-pointer ml-1 active:scale-95"
                  >
                    <Trash2 size={12} />
                    Svuota Anno
                  </button>
                )}
              </div>

              {/* Past Bookings Filter */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Visualizza:</label>
                <select
                  value={showPast ? 'all' : 'upcoming'}
                  onChange={(e) => setShowPast(e.target.value === 'all')}
                  className="bg-white border border-slate-200 text-slate-700 px-4 py-1.5 rounded-full font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all cursor-pointer shadow-sm hover:border-slate-300"
                >
                  <option value="upcoming">Solo Future</option>
                  <option value="all">Tutte (anche passate)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Richiedente / Scopo</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Sala</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Data e Ora</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Stato</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allFilteredItems
                  .map((item) => {
                    if (item.isEvent) {
                      return (
                        <tr key={`event-${item.id}`} className="bg-purple-50/20 hover:bg-purple-50/40 transition-colors">
                          <td className="px-8 py-5">
                            <div className="space-y-1">
                              <p className="text-sm font-black text-purple-900 leading-tight">{item.requesterName}</p>
                              <p className="text-[11px] font-bold text-slate-700 italic">{item.purpose}</p>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-purple-500 shadow-sm" />
                              <span className="text-sm font-bold text-purple-950">{item.roomNames}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-[11px] font-black text-slate-600 uppercase tracking-tighter">
                                <Calendar size={12} className="text-purple-300" />
                                {item.startTime ? format(new Date(item.startTime), 'dd MMM yyyy', { locale: it }) : ''}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                <Clock size={12} className="text-purple-300" />
                                {item.startTime ? format(new Date(item.startTime), 'HH:mm') : ''} - {item.endTime ? format(new Date(item.endTime), 'HH:mm') : ''}
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-50 text-purple-700 border border-purple-100">
                              {item.status}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <span className="text-[9px] font-bold text-purple-600 uppercase tracking-wider italic">
                              Gestito in Eventi
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    const booking = item.rawBooking;
                    return (
                      <tr key={`booking-${item.id}`} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-8 py-5">
                          <div className="space-y-1">
                            <p className="text-sm font-black text-slate-900 leading-tight">{item.requesterName}</p>
                            {item.requesterPhone && (
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                <span className="opacity-75">📞</span> {item.requesterPhone}
                              </p>
                            )}
                            <p className="text-[11px] font-bold text-slate-400 italic">{item.purpose}</p>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-sm" />
                            <span className="text-sm font-black text-slate-700">{item.roomNames}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-[11px] font-black text-slate-600 uppercase tracking-tighter">
                              <Calendar size={12} className="text-slate-300" />
                              {item.startTime ? format(new Date(item.startTime), 'dd MMM yyyy', { locale: it }) : ''}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                              <Clock size={12} className="text-slate-300" />
                              {item.startTime ? format(new Date(item.startTime), 'HH:mm') : ''} - {item.endTime ? format(new Date(item.endTime), 'HH:mm') : ''}
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            item.status === 'Approvata' ? 'bg-blue-50 text-blue-700' :
                            item.status === 'Rifiutata' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {item.status === 'In Attesa' && (
                              <>
                                <button
                                  onClick={() => updateBookingStatus(item.id, 'Approvata')}
                                  className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100 shadow-sm hover:scale-110"
                                  title="Approva"
                                >
                                  <Check size={18} />
                                </button>
                                <button
                                  onClick={() => updateBookingStatus(item.id, 'Rifiutata')}
                                  className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-all border border-red-100 shadow-sm hover:scale-110"
                                  title="Rifiuta"
                                >
                                  <XCircle size={18} />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleEditBooking(booking)}
                              className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100 shadow-sm hover:scale-110"
                              title="Modifica"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() => setBookingToDelete(item.id)}
                              className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-all border border-red-100 shadow-sm hover:scale-110"
                              title="Elimina"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          
          {/* Booking Deletion Confirmation */}
          {bookingToDelete && (
            <div className="p-4 bg-red-50 border-t border-red-100 flex items-center justify-between animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <AlertCircle size={18} className="text-red-500" />
                <p className="text-xs font-bold text-red-700 uppercase tracking-tight">Confermi l'eliminazione di questa prenotazione?</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setBookingToDelete(null)}
                  className="bg-white border border-slate-200 text-slate-600 px-6 py-2 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
                >
                  Annulla
                </button>
                <button 
                  onClick={() => handleDeleteBooking(bookingToDelete)}
                  className="bg-red-600 text-white px-6 py-2 rounded-full font-bold uppercase italic tracking-wider hover:bg-red-700 transition-all shadow-md active:scale-95 text-[10px]"
                >
                  Elimina
                </button>
              </div>
            </div>
          )}
          {allFilteredItems.length === 0 && !loading && (
            <div className="p-20 text-center space-y-4">
              <div className="inline-flex p-4 bg-slate-50 text-slate-300 rounded-[2rem]">
                <Calendar size={32} strokeWidth={1} />
              </div>
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Nessuna prenotazione registrata</p>
            </div>
          )}
        </div>
      </section>

      {/* Manage Rooms Modal */}
      {isManageRoomsOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-[200]">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Gestione Sale</h2>
                <p className="text-xs font-bold text-slate-400 italic">Configura l'elenco delle sale disponibili.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsRoomModalOpen(true)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-md active:scale-95 text-[10px]"
                >
                  <Plus size={16} />
                  Nuova Sala
                </button>
                <button 
                  onClick={() => setIsManageRoomsOpen(false)} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto p-4">
              <div className="space-y-2">
                {rooms.map((room) => (
                  <div key={room.id} className="flex items-center justify-between p-5 bg-slate-50/50 rounded-2xl border border-transparent hover:border-blue-100 hover:bg-white transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white text-blue-600 rounded-xl shadow-sm group-hover:scale-110 transition-transform">
                        <DoorOpen size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 leading-none mb-1">{room.name}</h4>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest">
                            <Users size={12} className="text-slate-300" />
                            {room.capacity} persone
                          </span>
                          {room.description && (
                            <span className="text-[10px] font-medium text-slate-300 truncate max-w-[200px]">
                              {room.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleEditRoom(room)}
                        className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100 shadow-sm hover:scale-110"
                        title="Modifica sala"
                      >
                        <Pencil size={16} />
                      </button>
                      <button 
                        onClick={() => setRoomToDelete(room.id)}
                        className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-all border border-red-100 shadow-sm hover:scale-110"
                        title="Elimina sala"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {rooms.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-sm font-black text-slate-300 uppercase tracking-widest">Nessuna sala configurata</p>
                  </div>
                )}
              </div>
            </div>

            {/* Inline Deletion Confirmation */}
            {roomToDelete && (
              <div className="mx-6 mb-6 p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className="text-red-500" />
                  <p className="text-xs font-bold text-red-700">Sei sicuro? Questo eliminerà la sala e le sue impostazioni.</p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setRoomToDelete(null)}
                    className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
                  >
                    Annulla
                  </button>
                  <button 
                    onClick={() => handleDeleteRoom(roomToDelete)}
                    className="bg-red-600 text-white px-4 py-2 rounded-full font-bold uppercase italic tracking-wider hover:bg-red-700 transition-all shadow-md active:scale-95 text-[10px]"
                  >
                    Conferma
                  </button>
                </div>
              </div>
            )}
            
            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsManageRoomsOpen(false)}
                className="bg-white border border-slate-200 text-slate-600 px-6 py-2 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[200]">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingRoomId ? 'Modifica Sala' : 'Aggiungi Nuova Sala'}
              </h2>
              <button 
                onClick={() => {
                  setIsRoomModalOpen(false);
                  setEditingRoomId(null);
                  setNewRoom({ name: '', capacity: 0, description: '' });
                }} 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateRoom} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Nome Sala</label>
                <input
                  type="text"
                  required
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Capienza Massima</label>
                <input
                  type="number"
                  required
                  value={isNaN(newRoom.capacity) ? '' : newRoom.capacity}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setNewRoom({ ...newRoom, capacity: isNaN(parsed) ? 0 : parsed });
                  }}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Descrizione</label>
                <textarea
                  value={newRoom.description}
                  onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                />
              </div>
              <div className="flex justify-end gap-4 pt-6">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsRoomModalOpen(false);
                    setEditingRoomId(null);
                    setNewRoom({ name: '', capacity: 0, description: '' });
                  }} 
                  className="bg-white border border-slate-200 text-slate-600 px-10 py-3 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
                >
                  Annulla
                </button>
                <button 
                  type="submit" 
                  className="bg-blue-600 text-white px-10 py-3 rounded-full font-bold uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 text-[10px]"
                >
                  {editingRoomId ? 'Aggiorna Sala' : 'Salva Sala'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {isBookingModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-[200]">
          <div className="bg-white rounded-[2.5rem] w-full max-w-5xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  {editingBookingId ? 'Modifica Prenotazione' : 'Nuova Prenotazione'}
                </h2>
                <p className="text-xs font-bold text-slate-400 italic">Inserisci i dettagli per l'utilizzo delle sale.</p>
              </div>
              <button onClick={() => {
                setIsBookingModalOpen(false);
                setEditingBookingId(null);
              }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleCreateBooking} className="p-8 max-h-[75vh] overflow-y-auto">
              {/* Responsive Two-Column Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                
                {/* Left Column (span 5): Rooms Selection & Status Picker */}
                <div className="md:col-span-5 space-y-6 md:border-r md:border-slate-100 md:pr-8">
                  {/* Sale da Prenotare */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1 block">Sale da Prenotare</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-1">
                      {rooms.map(room => (
                        <label 
                          key={room.id} 
                          className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                            newBooking.roomIds.includes(room.id) 
                              ? 'bg-blue-50 border-blue-200' 
                              : 'bg-slate-50 border-transparent hover:border-slate-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded-lg border-2 border-slate-200 text-blue-600 focus:ring-blue-500/20"
                            checked={newBooking.roomIds.includes(room.id)}
                            onChange={(e) => {
                              const ids = e.target.checked 
                                ? [...newBooking.roomIds, room.id]
                                : newBooking.roomIds.filter(id => id !== room.id);
                              setNewBooking({ ...newBooking, roomIds: ids });
                            }}
                          />
                          <div>
                            <p className="text-xs font-black text-slate-700 leading-none">{room.name}</p>
                            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Cap. {room.capacity} persone</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    {rooms.length === 0 && (
                       <div className="p-8 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nessuna sala disponibile</p>
                       </div>
                    )}
                  </div>

                  {/* Status Selection (Placed on left column) */}
                  <div className="space-y-3 pt-6 border-t border-slate-100">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1 block">Stato Prenotazione</label>
                    <div className="flex gap-2">
                      {[
                        { id: 'In Attesa', label: 'In Attesa', color: 'bg-amber-100 text-amber-700' },
                        { id: 'Approvata', label: 'Approvata', color: 'bg-blue-100 text-blue-700' },
                        { id: 'Rifiutata', label: 'Rifiutata', color: 'bg-red-100 text-red-700' }
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setNewBooking({ ...newBooking, status: s.id as any })}
                          className={`flex-1 py-2.5 px-3 rounded-2xl text-[9px] font-black uppercase tracking-wider border-2 transition-all ${
                            newBooking.status === s.id 
                              ? `${s.color} border-current` 
                              : 'bg-slate-50 text-slate-400 border-transparent hover:border-slate-200'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column (span 7): Contact details, Purpose, Presets & Timers */}
                <div className="md:col-span-7 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Nome Richiedente *</label>
                      <input
                        type="text"
                        required
                        value={newBooking.requesterName}
                        onChange={(e) => setNewBooking({ ...newBooking, requesterName: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Numero di Telefono</label>
                      <input
                        type="tel"
                        placeholder="Es. +39 333 1234567"
                        value={newBooking.requesterPhone}
                        onChange={(e) => setNewBooking({ ...newBooking, requesterPhone: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Scopo Utilizzo</label>
                    <input
                      type="text"
                      placeholder="Scopo o descrizione breve dell'uso"
                      value={newBooking.purpose}
                      onChange={(e) => setNewBooking({ ...newBooking, purpose: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>

                  {/* Fasce Orarie Rapide */}
                  <div className="space-y-1.5 bg-slate-50/70 p-4 rounded-2xl border border-slate-100 shadow-inner">
                    <span className="text-[9px] font-black uppercase text-indigo-700 tracking-widest block ml-1">Fasce Orarie Preimpostate (Intere)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '☀️ Mattina (08:30 - 12:30)', start: '08:30', end: '12:30' },
                        { label: '⛅ Pomeriggio (14:30 - 18:30)', start: '14:30', end: '18:30' },
                        { label: '🌙 Sera (20:30 - 23:00)', start: '20:30', end: '23:00' },
                        { label: '📅 Giornata (08:30 - 18:30)', start: '08:30', end: '18:30' }
                      ].map(slot => (
                        <button
                          key={slot.label}
                          type="button"
                          onClick={() => handleFullSlotPreset(slot.start, slot.end)}
                          className={`text-[9px] sm:text-[10px] font-bold px-2.5 py-1.5 rounded-xl transition-all shadow-sm border ${
                            slot.label.includes('Pomeriggio')
                              ? 'bg-sky-50 text-sky-700 border-sky-300 hover:border-sky-500 hover:bg-sky-100 hover:text-sky-800'
                              : 'text-slate-700 bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40'
                          }`}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Inizio</label>
                      <input
                        type="datetime-local"
                        required
                        value={newBooking.startTime}
                        onChange={(e) => setNewBooking({ ...newBooking, startTime: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {['08:30', '10:00', '14:30', '16:00', '18:00', '20:30'].map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => handleStartHourPreset(t)}
                            className="text-[9px] font-bold text-slate-500 bg-slate-100/70 hover:bg-slate-200/80 hover:text-indigo-600 px-2 py-1 rounded-lg transition-colors border border-slate-200/30"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Fine</label>
                      <input
                        type="datetime-local"
                        required
                        value={newBooking.endTime}
                        onChange={(e) => setNewBooking({ ...newBooking, endTime: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {['+1h', '+2h', '+3h', '+4h', '+6h'].map(label => {
                          const hours = parseInt(label);
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => handleDurationPreset(hours)}
                              className="text-[9px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors border border-indigo-100"
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Form Actions Footer */}
              <div className="flex justify-end gap-4 pt-6 mt-8 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsBookingModalOpen(false);
                    setEditingBookingId(null);
                  }} 
                  className="bg-white border border-slate-200 text-slate-600 px-10 py-3 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
                >
                  Annulla
                </button>
                <button 
                  type="submit" 
                  disabled={newBooking.roomIds.length === 0}
                  className="bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-10 py-3 rounded-full font-bold uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 text-[10px]"
                >
                  {editingBookingId ? 'Salva Modifiche' : 'Salva Prenotazione'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overlap Confirmation Modal */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[300]">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-rose-600 uppercase italic tracking-wider mb-2 flex items-center gap-2">
              ⚠️ ATTENZIONE
            </h3>
            <div className="text-sm font-semibold text-slate-700 leading-relaxed space-y-2 whitespace-pre-line mb-6">
              {confirmModal.message}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-6 py-2.5 rounded-full border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 active:scale-95 transition-all text-[11px] uppercase tracking-wider"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="px-6 py-2.5 rounded-full bg-rose-600 text-white font-bold hover:bg-rose-700 active:scale-95 transition-all text-[11px] uppercase tracking-wider shadow-md"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Secure Confirmation Modal */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[300]">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl p-8 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-4 animate-bounce">
              <Trash2 size={24} />
            </div>
            <h3 className="text-xl font-black text-rose-600 uppercase italic tracking-wider mb-2">
              Eliminare tutte le prenotazioni del {bulkDeleteYear}?
            </h3>
            <p className="text-sm font-semibold text-slate-500 leading-relaxed mb-6">
              Questa azione è irreversibile. Tutte le prenotazioni associate all'anno <strong className="text-slate-900">{bulkDeleteYear}</strong> e i relativi eventi a calendario saranno eliminati in modo permanente.
            </p>
            
            <div className="space-y-2 mb-6">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                Digita l'anno "{bulkDeleteYear}" per confermare:
              </label>
              <input
                type="text"
                placeholder={bulkDeleteYear}
                value={bulkDeleteInput}
                onChange={(e) => setBulkDeleteInput(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none text-center font-bold text-slate-800 text-lg tracking-wider"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsBulkDeleteModalOpen(false);
                  setBulkDeleteYear('');
                  setBulkDeleteInput('');
                }}
                disabled={isDeletingBulk}
                className="px-6 py-2.5 rounded-full border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 active:scale-95 transition-all text-[11px] uppercase tracking-wider"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={bulkDeleteInput !== bulkDeleteYear || isDeletingBulk}
                onClick={() => handleDeleteAllByYear(bulkDeleteYear)}
                className="px-6 py-2.5 rounded-full bg-rose-600 text-white font-bold hover:bg-rose-700 active:scale-95 transition-all text-[11px] uppercase tracking-wider shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isDeletingBulk ? 'Eliminazione...' : 'Conferma ed Elimina'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly PDF Report Modal */}
      {isWeeklyReportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[300]">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl p-8 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 animate-pulse">
              <FileDown size={24} />
            </div>
            <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-wider mb-2">
              Report Settimanale Occupazione
            </h3>
            <p className="text-sm font-semibold text-slate-500 leading-relaxed mb-6">
              Seleziona una settimana per generare e scaricare l'elenco completo di utilizzo di tutte le sale parrocchiali.
            </p>

            {/* Week Navigator Controls */}
            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 mb-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setWeeklyReportDate(prev => subWeeks(prev, 1))}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-full border border-slate-200 text-xs shadow-sm transition-all cursor-pointer text-center"
                >
                  ← Prec.
                </button>
                <div className="text-center">
                  <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider block">Settimana Selezionata</span>
                  <span className="text-xs font-black text-slate-800">
                    Dal {format(startOfWeek(weeklyReportDate, { weekStartsOn: 1 }), 'dd/MM/yyyy')} al {format(endOfWeek(weeklyReportDate, { weekStartsOn: 1 }), 'dd/MM/yyyy')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setWeeklyReportDate(prev => addWeeks(prev, 1))}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-full border border-slate-200 text-xs shadow-sm transition-all cursor-pointer text-center"
                >
                  Succ. →
                </button>
              </div>

              {/* Direct Date Picker */}
              <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-200/55">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Oppure scegli una data:</label>
                <input
                  type="date"
                  value={format(weeklyReportDate, 'yyyy-MM-dd')}
                  onChange={(e) => {
                    const parsed = new Date(e.target.value);
                    if (!isNaN(parsed.getTime())) {
                      setWeeklyReportDate(parsed);
                    }
                  }}
                  className="bg-white border border-slate-200 px-3 py-1.5 rounded-full text-slate-700 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Bookings Preview */}
            <div className="mb-6 space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block ml-1">
                Anteprima Prenotazioni Trovate
              </label>
              {(() => {
                const start = startOfWeek(weeklyReportDate, { weekStartsOn: 1 });
                const end = endOfWeek(weeklyReportDate, { weekStartsOn: 1 });
                const foundBookings = bookings.filter(b => {
                  try {
                    const bStart = new Date(b.startTime).getTime();
                    const bEnd = new Date(b.endTime).getTime();
                    return bStart < end.getTime() && bEnd > start.getTime();
                  } catch {
                    return false;
                  }
                });

                if (foundBookings.length === 0) {
                  return (
                    <div className="rounded-2xl border-2 border-dashed border-slate-100 p-6 text-center text-slate-400 text-xs font-semibold">
                      Nessuna prenotazione trovata per questa settimana. Il PDF sarà vuoto.
                    </div>
                  );
                }

                // Show up to 4 bookings, then "e altre X..."
                foundBookings.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
                return (
                  <div className="bg-slate-50/50 rounded-2xl border border-slate-100 max-h-[160px] overflow-y-auto p-4 space-y-2">
                    {foundBookings.map(b => {
                      const roomNames = b.roomIds
                        ? b.roomIds.map((id: string) => {
                            const found = rooms.find(r => r.id === id);
                            return found ? found.name : 'Sala non trovata';
                          }).join(', ')
                        : (rooms.find(r => r.id === b.roomId)?.name || 'N/D');

                      return (
                        <div key={b.id} className="text-left bg-white p-2.5 rounded-xl border border-slate-100 flex items-start justify-between gap-4 text-xs">
                          <div className="min-w-0 flex-1">
                            <div className="font-extrabold text-slate-700 italic truncate">
                              {format(new Date(b.startTime), 'eee dd/MM HH:mm', { locale: it })} - {format(new Date(b.endTime), 'HH:mm')}
                            </div>
                            <div className="font-semibold text-slate-500 text-[10px] uppercase tracking-tighter mt-0.5 truncate">
                              {roomNames} • Richiedente: {b.requesterName} {b.requesterPhone ? `(${b.requesterPhone})` : ''}
                            </div>
                          </div>
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full font-black text-[9px] uppercase tracking-wider ${
                            b.status === 'Approvata' 
                              ? 'bg-blue-50 text-blue-600' 
                              : b.status === 'Rifiutata' 
                                ? 'bg-red-50 text-red-500' 
                                : 'bg-amber-50 text-amber-600'
                          }`}>
                            {b.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsWeeklyReportModalOpen(false);
                }}
                className="px-6 py-2.5 rounded-full border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 active:scale-95 transition-all text-[11px] uppercase tracking-wider cursor-pointer"
              >
                Chiudi
              </button>
              <button
                type="button"
                onClick={() => downloadWeeklyReportPDF(weeklyReportDate)}
                className="px-6 py-2.5 rounded-full bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 transition-all text-[11px] uppercase tracking-wider shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown size={14} />
                Scarica PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Rooms;
