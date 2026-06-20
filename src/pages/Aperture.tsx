import React, { useEffect, useState } from 'react';
import { 
  onSnapshot, 
  query, 
  orderBy, 
  where 
} from 'firebase/firestore';
import { useParish, useParishCollection } from '../components/ParishContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  format, 
  addDays, 
  subDays, 
  startOfDay, 
  endOfDay, 
  isSameDay, 
  isWithinInterval, 
  getDay, 
  setHours, 
  setMinutes, 
  setSeconds,
  parseISO
} from 'date-fns';
import { it } from 'date-fns/locale';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Phone, 
  ChevronLeft, 
  ChevronRight, 
  DoorOpen, 
  CheckCircle,
  Church,
  Info,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TimelineItem {
  id: string;
  type: 'booking' | 'event' | 'liturgy_recurring' | 'liturgy_special' | 'calendar_event';
  title: string;
  startTime: Date;
  endTime: Date;
  location: string;
  requesterName?: string;
  requesterPhone?: string;
  status?: string;
  description?: string;
  color?: string;
  details?: string;
}

const Aperture: React.FC = () => {
  const { currentParish } = useParish();
  
  // Data Collections
  const roomsColl = useParishCollection('rooms');
  const bookingsColl = useParishCollection('bookings');
  const eventsColl = useParishCollection('events');
  const litTemplatesColl = useParishCollection('liturgy_templates');
  const litSpecialsColl = useParishCollection('liturgy_specials');
  const litExceptionsColl = useParishCollection('liturgy_exceptions');
  const litIntentionsColl = useParishCollection('liturgy_intentions');
  const calEventsColl = useParishCollection('calendar_events');
  const calendarsColl = useParishCollection('calendars');

  // React State
  const [rooms, setRooms] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [litTemplates, setLitTemplates] = useState<any[]>([]);
  const [litSpecials, setLitSpecials] = useState<any[]>([]);
  const [litExceptions, setLitExceptions] = useState<any[]>([]);
  const [litIntentions, setLitIntentions] = useState<any[]>([]);
  const [calEvents, setCalEvents] = useState<any[]>([]);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filterType, setFilterType] = useState<string>('all');

  // Real-time listener setup
  useEffect(() => {
    if (!currentParish) return;

    setLoading(true);

    const unsubRooms = onSnapshot(roomsColl, (snap) => {
      setRooms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rooms'));

    const unsubBookings = onSnapshot(bookingsColl, (snap) => {
      setBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bookings'));

    const unsubEvents = onSnapshot(eventsColl, (snap) => {
      setEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'events'));

    const unsubLitTemplates = onSnapshot(litTemplatesColl, (snap) => {
      setLitTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'liturgy_templates'));

    const unsubLitSpecials = onSnapshot(litSpecialsColl, (snap) => {
      setLitSpecials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'liturgy_specials'));

    const unsubLitExceptions = onSnapshot(litExceptionsColl, (snap) => {
      setLitExceptions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'liturgy_exceptions'));

    const unsubLitIntentions = onSnapshot(litIntentionsColl, (snap) => {
      setLitIntentions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'liturgy_intentions'));

    const unsubCalEvents = onSnapshot(calEventsColl, (snap) => {
      setCalEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'calendar_events'));

    const unsubCalendars = onSnapshot(calendarsColl, (snap) => {
      setCalendars(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'calendars'));

    return () => {
      unsubRooms();
      unsubBookings();
      unsubEvents();
      unsubLitTemplates();
      unsubLitSpecials();
      unsubLitExceptions();
      unsubLitIntentions();
      unsubCalEvents();
      unsubCalendars();
    };
  }, [currentParish]);

  // Aggregate and filter all events of the selected date
  const getTimelineItems = (): TimelineItem[] => {
    const targetDayStart = startOfDay(selectedDate);
    const targetDayEnd = endOfDay(selectedDate);
    const dateStrYMD = format(selectedDate, 'yyyy-MM-dd');
    const dayNum = getDay(selectedDate); // 0 = Sunday, 1 = Monday etc.

    const items: TimelineItem[] = [];

    // 1. Room bookings
    bookings.forEach(b => {
      if (!b.startTime) return;
      const bStart = new Date(b.startTime);
      const bEnd = b.endTime ? new Date(b.endTime) : bStart;

      // Check if booking falls on the selected day
      if (bStart <= targetDayEnd && bEnd >= targetDayStart) {
        // Resolve room names
        const roomNames = b.roomIds
          ? b.roomIds.map((rid: string) => rooms.find(r => r.id === rid)?.name || 'Sala').join(', ')
          : (rooms.find(r => r.id === b.roomId)?.name || 'Aula Oratorio');

        items.push({
          id: b.id,
          type: 'booking',
          title: b.purpose || 'Prenotazione Sala',
          startTime: bStart,
          endTime: bEnd,
          location: roomNames,
          requesterName: b.requesterName || 'N/D',
          requesterPhone: b.requesterPhone || '',
          status: b.status || 'Approvata',
          description: b.notes || '',
          color: '#10b981' // Emerald
        });
      }
    });

    // 2. Parish Events
    events.forEach(e => {
      if (!e.date) return;
      const eStart = new Date(e.date);
      const eEnd = e.endDate ? new Date(e.endDate) : eStart;

      // Handle simple date without full timestamp fallback
      if (isSameDay(eStart, selectedDate) || isWithinInterval(selectedDate, { start: startOfDay(eStart), end: endOfDay(eEnd) })) {
        let preciseStart = eStart;
        let preciseEnd = eEnd;

        // If there are hour times, apply them
        if (e.startTime) {
          const [sh, sm] = e.startTime.split(':').map(Number);
          preciseStart = setMinutes(setHours(preciseStart, sh || 0), sm || 0);
        }
        if (e.endTime) {
          const [eh, em] = e.endTime.split(':').map(Number);
          preciseEnd = setMinutes(setHours(preciseEnd, eh || 0), em || 0);
        } else {
          // Fallback to +1 hour if no end time
          preciseEnd = new Date(preciseStart.getTime() + 60 * 60 * 1000);
        }

        const roomNames = e.roomIds
          ? e.roomIds.map((rid: string) => rooms.find(r => r.id === rid)?.name || 'Sala').join(', ')
          : 'Oratorio / Parrocchia';

        items.push({
          id: e.id,
          type: 'event',
          title: e.title || 'Evento Parrocchiale',
          startTime: preciseStart,
          endTime: preciseEnd,
          location: roomNames,
          requesterName: 'Segreteria',
          status: 'In Programma',
          description: e.description || '',
          color: '#f59e0b' // Amber
        });
      }
    });

    // 3. Liturgies (Recurring and Specials)
    // Recurring liturgy templates
    litTemplates.forEach(t => {
      // Check if selectedDate is within valid range
      const validFrom = t.validFrom ? new Date(t.validFrom) : startOfDay(new Date());
      const validUntil = t.validUntil ? new Date(t.validUntil) : endOfDay(new Date());

      if (selectedDate >= startOfDay(validFrom) && selectedDate <= endOfDay(validUntil)) {
        t.schedule?.forEach((s: any) => {
          if (s.day === dayNum) {
            s.times?.forEach((timeVal: any) => {
              const timeStr = typeof timeVal === 'string' ? timeVal : timeVal.time;
              const label = typeof timeVal === 'string' ? '' : timeVal.label;

              // Check exceptions
              const isExcluded = litExceptions.some(ex => 
                ex.templateId === t.id && 
                ex.date === dateStrYMD && 
                ex.time === timeStr
              );

              if (!isExcluded) {
                const [h, m] = timeStr.split(':').map(Number);
                const start = setSeconds(setMinutes(setHours(targetDayStart, h), m), 0);
                const end = new Date(start.getTime() + 45 * 60 * 1000); // Messa duration fallback 45 mins

                // Fetch intentional if any
                const intention = litIntentions.find(intent => 
                  intent.templateId === t.id && 
                  intent.dateStr === dateStrYMD && 
                  intent.timeStr === timeStr
                );
                const intentionNames = intention?.names?.join(', ');

                items.push({
                  id: `${t.id}-rec-${timeStr}`,
                  type: 'liturgy_recurring',
                  title: t.title + (label ? ` (${label})` : ''),
                  startTime: start,
                  endTime: end,
                  location: t.location || 'Chiesa Parrocchiale',
                  details: intentionNames ? `Intenzioni di preghiera: ${intentionNames}` : undefined,
                  status: 'Celebrata',
                  description: t.notes || '',
                  color: '#6366f1' // Indigo
                });
              }
            });
          }
        });
      }
    });

    // Liturgy Specials
    litSpecials.forEach(s => {
      if (!s.start) return;
      const sStart = new Date(s.start);
      if (isSameDay(sStart, selectedDate)) {
        const timeStr = format(sStart, 'HH:mm');
        const end = s.end ? new Date(s.end) : new Date(sStart.getTime() + 60 * 60 * 1000);

        items.push({
          id: s.id,
          type: 'liturgy_special',
          title: s.title || 'Celebrazione Straordinaria',
          startTime: sStart,
          endTime: end,
          location: s.location || 'Chiesa Parrocchiale',
          status: 'Speciale',
          description: s.notes || '',
          color: '#8b5cf6' // Violet
        });
      }
    });

    // 4. Manually added Calendar Events (if any)
    calEvents.forEach(ce => {
      if (!ce.start) return;
      const ceStart = new Date(ce.start);
      const ceEnd = ce.end ? new Date(ce.end) : ceStart;

      if (ceStart <= targetDayEnd && ceEnd >= targetDayStart) {
        // Resolve calendar colors
        const cal = calendars.find(c => c.id === ce.calendarId);
        const calendarName = cal ? cal.name : 'Generale';
        const calendarColor = cal ? cal.color : '#3b82f6';

        // Filter out those representing liturgy templates/bookings to avoid duplicates
        // (usually manually made have different id prefix, check if standard event)
        if (ce.id.startsWith('virtual-') || ce.id.startsWith('lit-') || ce.id.startsWith('v-')) return;

        items.push({
          id: ce.id,
          type: 'calendar_event',
          title: ce.title || 'Impegno Generico',
          startTime: ceStart,
          endTime: ceEnd,
          location: ce.location || 'Oratorio',
          description: ce.description || `Calendario: ${calendarName}`,
          color: calendarColor
        });
      }
    });

    // Sort items chronologically by start time
    return items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  };

  const rawTimelineItems = getTimelineItems();
  
  // Filter items by type
  const sortedAndFilteredItems = rawTimelineItems.filter(item => {
    if (filterType === 'all') return true;
    if (filterType === 'bookings') return item.type === 'booking';
    if (filterType === 'events') return item.type === 'event' || item.type === 'calendar_event';
    if (filterType === 'liturgies') return item.type === 'liturgy_recurring' || item.type === 'liturgy_special';
    return true;
  });

  // Unique list of rooms being used today (for volunteers opening reference)
  const busyRooms = Array.from(new Set(
    rawTimelineItems
      .filter(item => item.type === 'booking' || item.type === 'event')
      .map(item => item.location)
  )).filter(Boolean);

  // Dynamic calculation of the "Oratorio Cover Hours" (first start time -> last end time)
  let openingHoursText = "Nessuna attività programmata";
  if (rawTimelineItems.length > 0) {
    // Find earliest and latest ranges for items physically located at Oratorio (excluding parish church if in another building, but let's include all to be safe)
    const physicalItems = rawTimelineItems.filter(item => 
      !item.location.toLowerCase().includes('chiesa') && 
      !item.location.toLowerCase().includes('santuario')
    );

    if (physicalItems.length > 0) {
      const sortedByStart = [...physicalItems].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      const sortedByEnd = [...physicalItems].sort((a, b) => b.endTime.getTime() - a.endTime.getTime());

      const earliest = format(sortedByStart[0].startTime, 'HH:mm');
      const latest = format(sortedByEnd[0].endTime, 'HH:mm');
      openingHoursText = `Dalle ore ${earliest} alle ore ${latest}`;
    } else {
      // Display first celebration / church duty
      const earliest = format(rawTimelineItems[0].startTime, 'HH:mm');
      const latest = format(rawTimelineItems[rawTimelineItems.length - 1].endTime, 'HH:mm');
      openingHoursText = `Fascia impegni liturgici: ${earliest} - ${latest}`;
    }
  }

  // Next 7 days helper list
  const nextDays = Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i));

  // Switch Selected Date
  const handleDaySelect = (d: Date) => {
    setSelectedDate(d);
  };

  return (
    <div className="space-y-6">
      {/* Visual Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase italic tracking-wider flex items-center gap-2">
            <DoorOpen className="text-blue-600 shrink-0" size={32} />
            Aperture & Impegni Oratorio
          </h1>
          <p className="text-slate-500 text-xs md:text-sm font-semibold mt-1">
            Vista di sola consultazione per i volontari di turno per la gestione dei locali ed eventi.
          </p>
        </div>

        {/* Date picking input */}
        <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm w-fit self-start md:self-auto">
          <Calendar size={16} className="text-blue-600" />
          <input
            type="date"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={(e) => {
              if (e.target.value) {
                setSelectedDate(new Date(e.target.value));
              }
            }}
            className="bg-transparent text-xs font-black uppercase tracking-wider outline-none cursor-pointer text-slate-700 italic"
          />
        </div>
      </div>

      {/* Week Selector (7 visual cards) */}
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        <button
          onClick={() => handleDaySelect(subDays(selectedDate, 1))}
          className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center shrink-0 shadow-sm text-slate-500 transition-colors"
          title="Giorno Precedente"
        >
          <ChevronLeft size={18} />
        </button>

        {nextDays.map((d) => {
          const isSelected = isSameDay(d, selectedDate);
          const isTodayDay = isSameDay(d, new Date());
          return (
            <button
              key={d.toISOString()}
              onClick={() => handleDaySelect(d)}
              className={`flex-1 min-w-[85px] py-3.5 px-3 rounded-2xl transition-all border flex flex-col items-center justify-center shrink-0 select-none cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="text-[9px] font-black uppercase tracking-wider opacity-60">
                {format(d, 'eee', { locale: it })}
              </span>
              <span className="text-xl font-black mt-1 leading-none shadow-text">
                {format(d, 'd')}
              </span>
              {isTodayDay && (
                <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full mt-1.5 leading-none ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'
                }`}>
                  Oggi
                </span>
              )}
            </button>
          )
        })}

        <button
          onClick={() => handleDaySelect(addDays(selectedDate, 1))}
          className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center shrink-0 shadow-sm text-slate-500 transition-colors"
          title="Giorno Successivo"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Grid Layout of logistics check & list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Logistics Card Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 text-white rounded-[2rem] border border-slate-800 shadow-xl overflow-hidden p-6 md:p-8 relative">
            <div className="absolute top-0 right-0 p-8 opacity-15 text-white pointer-events-none">
              <Sparkles size={110} />
            </div>

            <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-full">
              Logistica & Apertura
            </span>

            <h2 className="text-2xl font-black italic tracking-wide uppercase mt-4 mb-1">
              {format(selectedDate, 'EEEE d MMMM', { locale: it })}
            </h2>
            <p className="text-slate-400 text-xs font-semibold pl-1">
              Sintesi calcolata delle attività odierne
            </p>

            <div className="border-t border-slate-800 my-6" />

            {/* List of actions/details */}
            <div className="space-y-6">
              {/* Coverage hours */}
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center shrink-0 text-blue-400">
                  <Clock size={18} />
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Presenza Necessaria</h4>
                  <p className="text-sm font-black text-white italic mt-1">{openingHoursText}</p>
                </div>
              </div>

              {/* Busy rooms */}
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center shrink-0 text-emerald-400">
                  <DoorOpen size={18} />
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Spazi Oratorio da Aprire</h4>
                  {busyRooms.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {busyRooms.map((room) => (
                        <span key={room} className="text-[10px] font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl whitespace-nowrap">
                          {room}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-bold text-slate-500 italic mt-1">Nessuno spazio assegnato</p>
                  )}
                </div>
              </div>

              {/* Liturgical presence */}
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center shrink-0 text-purple-400">
                  <Church size={18} />
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Uffici & Liturgie Chiesa</h4>
                  <p className="text-xs font-bold text-white leading-relaxed mt-1">
                    {rawTimelineItems.filter(item => item.type === 'liturgy_recurring' || item.type === 'liturgy_special').length} celebrazioni programmate nell'edificio principale.
                  </p>
                </div>
              </div>
            </div>


          </div>
        </div>

        {/* Master Timeline list */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* List Headers & Quick Filters */}
          <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex-wrap gap-2">
            
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                Impegni ({sortedAndFilteredItems.length})
              </span>
            </div>

            {/* Quick Filter Controls */}
            <div className="flex gap-1">
              {[
                { id: 'all', label: 'Tutti' },
                { id: 'bookings', label: 'Sale' },
                { id: 'events', label: 'Eventi' },
                { id: 'liturgies', label: 'Messe' }
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setFilterType(filter.id)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                    filterType === filter.id 
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

          </div>

          {loading ? (
            <div className="py-20 text-center text-slate-400 font-bold bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs uppercase tracking-widest font-black">Caricamento in corso...</span>
            </div>
          ) : sortedAndFilteredItems.length > 0 ? (
            // Timeline Content
            <div className="relative border-l-2 border-slate-150 pl-6 space-y-5 ml-4 py-2">
              
              {sortedAndFilteredItems.map((item, idx) => {
                const startHour = format(item.startTime, 'HH:mm');
                const endHour = format(item.endTime, 'HH:mm');
                
                return (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={item.id}
                    className="relative bg-white p-5 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm group hover:shadow-md hover:border-slate-300 transition-all text-black"
                  >
                    {/* Visual dot on left timeline axis */}
                    <div 
                      className="absolute -left-[33px] top-6 w-3.5 h-3.5 rounded-full border-4 border-slate-50 shadow-sm transition-all group-hover:scale-125"
                      style={{ backgroundColor: item.color || '#3b82f6' }}
                    />

                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      
                      <div className="space-y-1.5">
                        {/* Title, Badge and Status */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span 
                            className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest text-white shrink-0"
                            style={{ backgroundColor: item.color || '#3b82f6' }}
                          >
                            {item.type === 'booking' ? 'Prenotazione' : 
                             item.type === 'event' || item.type === 'calendar_event' ? 'Evento' : 
                             'Liturges'}
                          </span>

                          <h3 className="text-sm md:text-base font-black text-slate-900 group-hover:text-blue-600 transition-colors leading-tight italic break-words">
                            {item.title}
                          </h3>
                        </div>

                        {/* Location / Space */}
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-bold bg-slate-50 px-2.5 py-1 rounded-xl w-fit border border-slate-100">
                          <MapPin size={13} className="text-slate-400" />
                          <span>{item.location}</span>
                        </div>

                        {/* Event descriptions/prayer intentions */}
                        {item.description && (
                          <p className="text-xs text-slate-500 leading-relaxed font-medium pl-1 max-w-xl">
                            {item.description}
                          </p>
                        )}

                        {item.details && (
                          <div className="mt-1 pt-1.5 border-t border-slate-100 text-xs font-semibold text-indigo-600 flex items-start gap-1 pb-1">
                            <Church size={12} className="shrink-0 mt-0.5" />
                            <span>{item.details}</span>
                          </div>
                        )}
                      </div>

                      {/* Right Hand Side: Times & Contact Details */}
                      <div className="flex flex-col items-start md:items-end justify-between self-stretch shrink-0 min-w-[150px] border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                        {/* Time label */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-900 font-black tracking-wide bg-blue-50/50 border border-blue-100 text-blue-700 px-3 py-1.5 rounded-full">
                          <Clock size={13} />
                          <span>{startHour} - {endHour}</span>
                        </div>

                        {/* Referente contact (for room bookings and events) */}
                        {item.requesterName && (
                          <div className="mt-3 md:text-right space-y-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Contatto Referente</span>
                            <div className="text-[10px] font-bold text-slate-700 italic flex items-center gap-1 justify-start md:justify-end">
                              <User size={10} className="text-slate-400" />
                              <span>{item.requesterName}</span>
                            </div>
                            
                            {item.requesterPhone && (
                              <a 
                                href={`tel:${item.requesterPhone}`}
                                className="text-[10px] text-blue-600 hover:underline font-bold tracking-wider inline-flex items-center gap-1 select-all cursor-pointer"
                              >
                                <Phone size={10} className="text-blue-400" />
                                {item.requesterPhone}
                              </a>
                            )}
                          </div>
                        )}
                        
                        {/* Booking status badge */}
                        {item.status && (
                          <div className="mt-2.5">
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
                              item.status === 'Approvata' || item.status === 'Celebrata'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-amber-50 text-amber-600 border-amber-200'
                            }`}>
                              {item.status}
                            </span>
                          </div>
                        )}
                      </div>

                    </div>
                  </motion.div>
                );
              })}

            </div>
          ) : (
            // No events empty placeholder states
            <div className="py-16 md:py-24 px-6 text-center bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center max-w-full text-black">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 border border-blue-100 shadow-sm">
                <CheckCircle size={28} />
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase italic tracking-wider">
                Nessun impegno programmato
              </h3>
              <p className="text-slate-400 text-xs font-semibold max-w-sm mt-2 leading-relaxed">
                Nessun evento, prenotazione sale o servizio liturgico è pianificato per questo giorno. I locali dell'oratorio possono rimanere chiusi eccetto disposizioni straordinarie.
              </p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default Aperture;
