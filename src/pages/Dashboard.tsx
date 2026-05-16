import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthContext';
import { useParish, useParishCollection } from '../components/ParishContext';
import { Calendar, Wrench, DoorOpen, Users, Tag, AlertCircle, Clock, PlusCircle, Wallet } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addDays, getDay, setHours, setMinutes, setSeconds, isBefore, startOfDay, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Church, Heart, MapPin, CalendarDays, FileText } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { currentParish } = useParish();
  
  const eventsColl = useParishCollection('events');
  const maintenanceColl = useParishCollection('maintenance');
  const bookingsColl = useParishCollection('bookings');
  const roomsColl = useParishCollection('rooms');
  const expensesColl = useParishCollection('expenses');
  const litTemplatesColl = useParishCollection('liturgy_templates');
  const litSpecialsColl = useParishCollection('liturgy_specials');
  const litExceptionsColl = useParishCollection('liturgy_exceptions');
  const litIntentionsColl = useParishCollection('liturgy_intentions');
  const calEventsColl = useParishCollection('calendar_events');
  const calendarsColl = useParishCollection('calendars');

  const [stats, setStats] = useState({
    events: 0,
    upcomingEvents: 0,
    tickets: 0,
    pendingTickets: 0,
    inProgressTickets: 0,
    bookings: 0,
    rooms: 0,
    totalExpensesMonth: 0,
    totalExpenses: 0
  });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [allTickets, setAllTickets] = useState<any[]>([]);
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [liturgyTemplates, setLiturgyTemplates] = useState<any[]>([]);
  const [liturgySpecials, setLiturgySpecials] = useState<any[]>([]);
  const [liturgyExceptions, setLiturgyExceptions] = useState<any[]>([]);
  const [liturgyIntentions, setLiturgyIntentions] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'recent' | 'oldest' | 'progress'>('recent');

  useEffect(() => {
    const unsubEvents = onSnapshot(eventsColl, (snap) => {
      const events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAllEvents(events);
      
      const now = new Date();
      const upcoming = events.filter(e => new Date(e.date) > now).length;
      
      setStats(prev => ({ 
        ...prev, 
        events: snap.size,
        upcomingEvents: upcoming
      }));
    });
    const unsubTickets = onSnapshot(maintenanceColl, (snap) => {
      const tickets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAllTickets(tickets);
      
      const pending = tickets.filter(t => t.status === 'Segnalato' || t.status === 'In Attesa').length;
      const inProgress = tickets.filter(t => t.status === 'In Corso').length;
      
      setStats(prev => ({ 
        ...prev, 
        tickets: snap.size,
        pendingTickets: pending,
        inProgressTickets: inProgress
      }));
    });
    const unsubBookings = onSnapshot(bookingsColl, (snap) => {
      const bookings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAllBookings(bookings);
      setStats(prev => ({ ...prev, bookings: snap.size }));
    });
    const unsubRooms = onSnapshot(roomsColl, (snap) => {
      setStats(prev => ({ ...prev, rooms: snap.size }));
    });
    const unsubExpenses = onSnapshot(expensesColl, (snap) => {
      const expenses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAllExpenses(expenses);
      
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      
      const monthTotal = expenses
        .filter(e => {
          const d = new Date(e.date);
          return d >= monthStart && d <= monthEnd;
        })
        .reduce((sum, e) => sum + (e.amount || 0), 0);

      const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      
      setStats(prev => ({ 
        ...prev, 
        totalExpensesMonth: monthTotal,
        totalExpenses: total
      }));
    });

    const qEvents = query(eventsColl, orderBy('date', 'desc'), limit(5));
    const unsubRecentEvents = onSnapshot(qEvents, (snap) => {
      setRecentEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubLitTemplates = onSnapshot(litTemplatesColl, (snap) => {
      setLiturgyTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubLitSpecials = onSnapshot(litSpecialsColl, (snap) => {
      setLiturgySpecials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubLitExceptions = onSnapshot(litExceptionsColl, (snap) => {
      setLiturgyExceptions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubLitIntentions = onSnapshot(litIntentionsColl, (snap) => {
      setLiturgyIntentions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubCalendarEvents = onSnapshot(calEventsColl, (snap) => {
      setCalendarEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubCalendars = onSnapshot(calendarsColl, (snap) => {
      setCalendars(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubEvents();
      unsubTickets();
      unsubBookings();
      unsubRooms();
      unsubExpenses();
      unsubRecentEvents();
      unsubLitTemplates();
      unsubLitSpecials();
      unsubLitExceptions();
      unsubLitIntentions();
      unsubCalendarEvents();
      unsubCalendars();
    };
  }, []);

  const getUpcomingLiturgies = () => {
    const now = new Date();
    const result: any[] = [];

    // Recurring
    liturgyTemplates.forEach(t => {
      const validFrom = new Date(t.validFrom);
      const validUntil = new Date(t.validUntil);
      
      // Check next 7 days
      for (let i = 0; i < 7; i++) {
        const d = addDays(now, i);
        const dayNum = getDay(d);
        
        if (d >= validFrom && d <= validUntil) {
          let daySchedule = null;
          if (t.schedule) {
            daySchedule = t.schedule.find((s: any) => s.day === dayNum);
          } else {
            // Fallback
            const templateDays = t.days || (t.dayOfWeek !== undefined ? [t.dayOfWeek] : []);
            if (templateDays.includes(dayNum)) {
              daySchedule = { times: t.times || [t.time] };
            }
          }

          if (daySchedule && daySchedule.times) {
            daySchedule.times.forEach((timeStr: string) => {
              const [h, m] = timeStr.split(':').map(Number);
              const start = setSeconds(setMinutes(setHours(startOfDay(d), h), m), 0);
              const dateStr = format(start, 'yyyy-MM-dd');

              const isExcluded = liturgyExceptions.some(ex => 
                ex.templateId === t.id && 
                ex.date === dateStr && 
                ex.time === timeStr
              );

              if (start > now && !isExcluded) {
                result.push({
                  id: `v-${t.id}-${format(d, 'yyyyMMdd')}-${timeStr}`,
                  templateId: t.id,
                  title: t.title,
                  start: start,
                  isTemplate: true,
                  timeStr: timeStr
                });
              }
            });
          }
        }
      }
    });

    // Special
    liturgySpecials.forEach(s => {
      const start = new Date(s.start);
      if (start > now) {
        result.push({
          id: s.id,
          title: s.title,
          start: start,
          isTemplate: false,
          timeStr: format(start, 'HH:mm')
        });
      }
    });

    return result.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 4);
  };

  const getTodaysAgenda = () => {
    const now = new Date();
    const today = startOfDay(now);
    const result: any[] = [];

    // 1. Standard Calendar Events
    calendarEvents.forEach(e => {
      const start = new Date(e.start);
      if (isSameDay(start, now)) {
        const cal = calendars.find(c => c.id === e.calendarId);
        const end = e.end ? new Date(e.end) : null;
        result.push({
          id: e.id,
          title: e.title,
          start: start,
          timeStr: format(start, 'HH:mm'),
          endTimeStr: end ? format(end, 'HH:mm') : null,
          location: e.location,
          notes: e.description,
          type: 'calendar',
          color: cal?.color || '#3b82f6',
          calendarName: cal?.name || 'Generale'
        });
      }
    });

    // 2. Liturgy Templates (Recurring)
    liturgyTemplates.forEach(t => {
      const dayNum = getDay(now);
      const validFrom = new Date(t.validFrom);
      const validUntil = new Date(t.validUntil);
      
      if (today >= validFrom && today <= validUntil) {
        const daySchedule = t.schedule?.find((s: any) => s.day === dayNum);
        if (daySchedule && daySchedule.times) {
          daySchedule.times.forEach((timeStr: string) => {
            const isExcluded = liturgyExceptions.some(ex => 
              ex.templateId === t.id && 
              ex.date === format(now, 'yyyy-MM-dd') && 
              ex.time === timeStr
            );
            if (!isExcluded) {
              const [h, m] = timeStr.split(':').map(Number);
              const start = setSeconds(setMinutes(setHours(today, h), m), 0);
              
              // Intentions
              const intent = liturgyIntentions.find(i => 
                i.liturgyId === t.id && 
                i.date === format(now, 'yyyy-MM-dd') && 
                i.time === timeStr
              );

              result.push({
                id: `lit-${t.id}-${timeStr}`,
                title: t.title,
                start: start,
                timeStr: timeStr,
                type: 'liturgy',
                isTemplate: true,
                templateId: t.id,
                names: intent?.names || []
              });
            }
          });
        }
      }
    });

    // 3. Liturgy Specials
    liturgySpecials.forEach(s => {
      const start = new Date(s.start);
      if (isSameDay(start, now)) {
        // Intentions for specials
        const intent = liturgyIntentions.find(i => 
          i.liturgyId === s.id && 
          i.date === format(start, 'yyyy-MM-dd') && 
          i.time === format(start, 'HH:mm')
        );

        result.push({
          id: s.id,
          title: s.title,
          start: start,
          timeStr: format(start, 'HH:mm'),
          type: 'liturgy',
          isTemplate: false,
          names: intent?.names || []
        });
      }
    });

    return result.sort((a, b) => a.start.getTime() - b.start.getTime());
  };

  const todaysAgenda = getTodaysAgenda();
  const upcomingLiturgies = getUpcomingLiturgies();

  const statsByType = allTickets.reduce((acc: any, t) => {
    const label = t.label || 'Altro';
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const typeDistribution = Object.entries(statsByType)
    .map(([label, count]) => ({
      label,
      count: count as number,
      percentage: allTickets.length > 0 ? ((count as number) / allTickets.length * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const last3Tickets = [...allTickets]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const oldestPendingTickets = [...allTickets]
    .filter(t => t.status !== 'Completato' && t.status !== 'Annullato')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 5);

  const inProgressTicketsList = allTickets.filter(t => t.status === 'In Corso');

  const expenseCategoryDistribution = Object.entries(
    allExpenses.reduce((acc: any, e) => {
      const cat = e.category || 'Altro';
      acc[cat] = (acc[cat] || 0) + (e.amount || 0);
      return acc;
    }, {})
  ).map(([status, count]) => ({
    status,
    amount: count as number,
    percentage: stats.totalExpenses > 0 ? ((count as number) / stats.totalExpenses * 100) : 0
  })).sort((a, b) => b.amount - a.amount);

  const statsByStatus = allTickets.reduce((acc: any, t) => {
    const status = t.status || 'Segnalato';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const statusDistribution = Object.entries(statsByStatus)
    .map(([status, count]) => ({
      status,
      count: count as number,
      percentage: allTickets.length > 0 ? ((count as number) / allTickets.length * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const eventTypeDistribution = Object.entries(
    allEvents.reduce((acc: any, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {})
  ).map(([status, count]) => ({
    status,
    count: count as number,
    percentage: allEvents.length > 0 ? ((count as number) / allEvents.length * 100) : 0
  })).sort((a, b) => b.count - a.count);

  const audienceDistribution = Object.entries(
    allEvents.reduce((acc: any, e) => {
      const audience = e.targetAudience || 'Generale';
      acc[audience] = (acc[audience] || 0) + 1;
      return acc;
    }, {})
  ).map(([label, count]) => ({
    label,
    count: count as number,
    percentage: allEvents.length > 0 ? ((count as number) / allEvents.length * 100) : 0
  })).sort((a, b) => b.count - a.count);

  const statCards = [
    { 
      label: 'Eventi Totali', 
      value: stats.events, 
      subValue: `${stats.upcomingEvents} imminenti`,
      statusDistribution: eventTypeDistribution,
      icon: Calendar, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50',
      to: '/eventi'
    },
    { 
      label: 'Ticket Manutenzione', 
      value: stats.tickets, 
      subValue: `${stats.pendingTickets} pendenti, ${stats.inProgressTickets} in corso`,
      statusDistribution: statusDistribution,
      icon: Wrench, 
      color: 'text-amber-600', 
      bg: 'bg-amber-50',
      to: '/manutenzione'
    },
    { 
      label: 'Spese del Mese', 
      value: `€${stats.totalExpensesMonth.toLocaleString('it-IT', { minimumFractionDigits: 0 })}`, 
      subValue: `€${stats.totalExpenses.toLocaleString('it-IT', { minimumFractionDigits: 0 })} totali`,
      statusDistribution: expenseCategoryDistribution.map(c => ({ status: c.status, count: `€${c.amount.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`, percentage: c.percentage })),
      icon: Wallet, 
      color: 'text-red-600', 
      bg: 'bg-red-50',
      to: '/spese'
    },
    { 
      label: 'Sale & Prenotazioni', 
      value: stats.bookings, 
      subValue: `${stats.rooms} sale configurate`, 
      icon: DoorOpen, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50',
      to: '/sale'
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1 italic">
          Benvenuto, <span className="text-blue-600 font-bold not-italic">{user?.displayName || 'Utente'}</span>! Ecco il riepilogo della parrocchia.
        </p>
      </div>

      {/* Todays Agenda */}
      <div className="bg-white rounded-3xl border-2 border-blue-100 shadow-xl shadow-blue-50/50 overflow-hidden">
        <div className="p-8 border-b border-blue-50 bg-gradient-to-r from-blue-50/50 to-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
              <CalendarDays size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Agenda di Oggi</h2>
              <p className="text-sm font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                {format(new Date(), 'EEEE d MMMM yyyy', { locale: it })}
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              </p>
            </div>
          </div>
          <Link to="/calendario" className="px-6 py-2.5 bg-white border-2 border-blue-100 text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm">
            Vedi Calendario Completo
          </Link>
        </div>
        
        <div className="p-8">
          {todaysAgenda.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                <CalendarDays size={32} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-bold">Nessun impegno in programma per oggi.</p>
              <p className="text-slate-400 text-sm mt-1">Goditi una giornata di tranquillità!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {todaysAgenda.map((item) => (
                <Link 
                  key={item.id}
                  to={item.type === 'calendar' ? `/calendario?edit=${item.id}` : '/calendario'}
                  className={`relative p-5 rounded-[2rem] border-2 transition-all hover:scale-[1.02] hover:shadow-xl block group ${
                    item.type === 'liturgy' 
                      ? 'bg-purple-50/30 border-purple-100/50' 
                      : 'bg-white border-slate-100 hover:border-blue-200'
                  }`}
                  style={item.type === 'calendar' ? { borderColor: `${item.color}20` } : {}}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                       <div 
                         className="w-1.5 h-4 rounded-full" 
                         style={{ backgroundColor: item.type === 'liturgy' ? '#9333ea' : item.color }} 
                       />
                       <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                         item.type === 'liturgy' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                       }`}
                       style={item.type === 'calendar' ? { backgroundColor: `${item.color}15`, color: item.color } : {}}
                       >
                         {item.type === 'liturgy' ? 'Ad Orario' : item.calendarName}
                       </div>
                    </div>
                    <div className="flex items-center gap-1 text-slate-900 font-black">
                      <Clock size={14} className={item.type === 'liturgy' ? 'text-purple-600' : 'text-slate-400'} style={item.type === 'calendar' ? { color: item.color } : {}} />
                      <span className="text-sm">
                        {item.timeStr}
                        {item.endTimeStr && <span className="text-slate-400 font-bold"> - {item.endTimeStr}</span>}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-lg font-black text-slate-900 leading-tight mb-2 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {item.title}
                  </h3>

                  {(item.location || item.notes) && (
                    <div className="space-y-1 mb-3">
                      {item.location && (
                        <div className="flex items-center gap-2 text-slate-500">
                          <MapPin size={12} className="shrink-0 text-slate-400" />
                          <span className="text-[10px] font-bold truncate">{item.location}</span>
                        </div>
                      )}
                      {item.notes && (
                        <div className="flex items-start gap-2 text-slate-400">
                          <FileText size={12} className="shrink-0 mt-0.5 text-slate-300" />
                          <p className="text-[10px] font-medium line-clamp-1">{item.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {item.names && item.names.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-purple-200/50">
                      <div className="flex flex-wrap gap-1">
                        {item.names.map((name: string, i: number) => (
                          <span key={i} className="text-[9px] font-black text-slate-700 bg-white shadow-sm px-2 py-1 rounded-lg border border-purple-100">
                            † {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Events Combined Card */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-blue-100 transition-all">
          <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                 <Calendar size={28} />
               </div>
               <div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">Eventi e Iniziative</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{stats.events} totali • {stats.upcomingEvents} imminenti</p>
               </div>
            </div>
            <Link to="/eventi" className="p-2 hover:bg-white rounded-full transition-colors text-blue-600">
              <PlusCircle size={24} />
            </Link>
          </div>
          
          <div className="p-6 divide-y divide-slate-50">
            {recentEvents.length === 0 ? (
              <p className="py-12 text-slate-400 font-bold text-center italic">Nessun evento registrato.</p>
            ) : (
              recentEvents.map((event) => (
                <Link 
                  key={event.id} 
                  to={`/eventi?edit=${event.id}`}
                  className="py-4 flex items-center gap-4 hover:bg-slate-50 px-4 -mx-4 rounded-xl transition-all group"
                >
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex flex-col items-center justify-center text-blue-700 group-hover:bg-blue-100 transition-colors">
                    <span className="text-[10px] font-black uppercase text-blue-400">{format(new Date(event.date), 'MMM', { locale: it })}</span>
                    <span className="text-lg font-black leading-none">{format(new Date(event.date), 'dd')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">{event.title}</p>
                    <p className="text-xs font-bold text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin size={10} /> {event.location || 'Senza luogo'}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
          <div className="p-6 bg-slate-50 border-t border-slate-100 mt-auto">
             <div className="grid grid-cols-2 gap-4">
                {eventTypeDistribution.slice(0, 4).map(item => (
                  <div key={item.status} className="bg-white p-3 rounded-2xl border border-slate-200/50">
                     <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1 truncate">{item.status}</p>
                     <p className="text-lg font-black text-slate-900 leading-none">{item.count}</p>
                  </div>
                ))}
             </div>
          </div>
        </div>

        {/* Maintenance Combined Card */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-amber-100 transition-all">
          <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
                 <Wrench size={28} />
               </div>
               <div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">Manutenzioni</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{stats.tickets} segnalazioni • {stats.pendingTickets} da evadere</p>
               </div>
            </div>
            <Link to="/manutenzione" className="p-2 hover:bg-white rounded-full transition-colors text-amber-600">
              <PlusCircle size={24} />
            </Link>
          </div>

          <div className="p-6 divide-y divide-slate-50 overflow-y-auto max-h-[400px]">
            {allTickets.filter(t => t.status !== 'Completato' && t.status !== 'Annullato').slice(0, 5).map((ticket) => (
              <Link 
                key={ticket.id} 
                to={`/manutenzione?edit=${ticket.id}`}
                className="py-4 flex items-center gap-4 hover:bg-slate-50 px-4 -mx-4 rounded-xl transition-all group"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  ticket.status === 'In Corso' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                }`}>
                  {ticket.status === 'In Corso' ? <Clock size={18} /> : <AlertCircle size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate group-hover:text-amber-600 transition-colors">{ticket.title}</p>
                  <p className="text-xs font-bold text-slate-400 capitalize">{ticket.status} • {ticket.label || 'Generale'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-slate-300">{format(new Date(ticket.createdAt), 'dd MMM', { locale: it })}</p>
                </div>
              </Link>
            ))}
            {allTickets.filter(t => t.status !== 'Completato' && t.status !== 'Annullato').length === 0 && (
               <p className="py-12 text-slate-400 font-bold text-center italic">Ottimo! Nessuna manutenzione pendente.</p>
            )}
          </div>
          <div className="p-6 bg-slate-50 border-t border-slate-100 mt-auto">
             <div className="flex flex-wrap gap-2">
                {statusDistribution.map(item => (
                  <div key={item.status} className="bg-white px-4 py-2 rounded-xl border border-slate-200/50 flex flex-col">
                     <span className="text-[9px] font-black uppercase text-slate-400 leading-none mb-1">{item.status}</span>
                     <span className="text-sm font-black text-slate-900">{item.count}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Expenses Combined Card */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-red-100 transition-all">
          <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                 <Wallet size={28} />
               </div>
               <div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">Gestione Spese</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">€{stats.totalExpensesMonth.toLocaleString('it-IT')} questo mese</p>
               </div>
            </div>
            <Link to="/spese" className="p-2 hover:bg-white rounded-full transition-colors text-red-600">
              <PlusCircle size={24} />
            </Link>
          </div>
          
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Top Categorie</h3>
                <div className="space-y-3">
                  {expenseCategoryDistribution.slice(0, 4).map(cat => (
                    <div key={cat.status} className="space-y-1">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-slate-700 truncate mr-2">{cat.status}</span>
                        <span className="text-[10px] font-black text-slate-400">€{cat.amount.toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-red-500 rounded-full" 
                          style={{ width: `${cat.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
             </div>
             <div className="bg-slate-50 rounded-3xl p-6 flex flex-col justify-center items-center text-center">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Totale Storico</p>
                <p className="text-3xl font-black text-slate-900">€{stats.totalExpenses.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</p>
                <div className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 px-4 py-1.5 rounded-full text-xs font-bold">
                  <AlertCircle size={14} />
                  <span>Aggiornato a oggi</span>
                </div>
             </div>
          </div>
        </div>

        {/* Liturgy Combined Card */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-purple-100 transition-all">
          <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl">
                 <Church size={28} />
               </div>
               <div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">Celebrazioni</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Orari e intenzioni sante messe</p>
               </div>
            </div>
            <Link to="/liturgie" className="p-2 hover:bg-white rounded-full transition-colors text-purple-600">
              <PlusCircle size={24} />
            </Link>
          </div>
          
          <div className="p-6 divide-y divide-slate-50 flex-1">
            {upcomingLiturgies.length === 0 ? (
              <p className="py-12 text-slate-400 font-bold text-center italic">Caricamento celebrazioni...</p>
            ) : (
              upcomingLiturgies.map((lit) => (
                <Link 
                  key={lit.id} 
                  to="/liturgie"
                  className="py-4 flex items-center gap-4 hover:bg-slate-50 px-4 -mx-4 rounded-xl transition-all group"
                >
                  <div className="w-12 h-12 bg-purple-50 rounded-xl flex flex-col items-center justify-center text-purple-700 group-hover:bg-purple-100 transition-colors">
                    <span className="text-[10px] font-black uppercase leading-none text-purple-400">{format(lit.start, 'EEE', { locale: it })}</span>
                    <span className="text-lg font-black leading-none my-0.5">{format(lit.start, 'dd')}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate group-hover:text-purple-600 transition-colors">{lit.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock size={12} className="text-slate-400" />
                      <span className="text-xs font-bold text-slate-500">{format(lit.start, 'HH:mm')}</span>
                    </div>
                  </div>
                  {lit.isTemplate ? (
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-[9px] font-black uppercase tracking-wider">Ad Orario</span>
                  ) : (
                    <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black uppercase tracking-wider">Speciale</span>
                  )}
                </Link>
              ))
            )}
          </div>
          <div className="p-6 bg-slate-50 border-t border-slate-100 text-[10px] font-bold text-slate-400 flex items-center gap-2">
            <AlertCircle size={14} />
            Le funzioni "Ad Orario" sono ricorrenti settimanalmente.
          </div>
        </div>

        {/* Room Bookings Combined Card (NEW) */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-emerald-100 transition-all">
          <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                 <DoorOpen size={28} />
               </div>
               <div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">Prenotazioni Sale</h2>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{stats.bookings} richieste totali</p>
               </div>
            </div>
            <Link to="/sale" className="p-2 hover:bg-white rounded-full transition-colors text-emerald-600">
              <PlusCircle size={24} />
            </Link>
          </div>
          
          <div className="p-6 divide-y divide-slate-50 flex-1">
            {allBookings.filter(b => new Date(b.endTime) >= new Date()).length === 0 ? (
              <p className="py-12 text-slate-400 font-bold text-center italic">Nessuna prenotazione imminente.</p>
            ) : (
              allBookings
                .filter(b => new Date(b.endTime) >= new Date())
                .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                .slice(0, 5)
                .map((booking) => (
                  <Link 
                    key={booking.id} 
                    to={`/sale?edit=${booking.id}`}
                    className="py-4 flex items-center gap-4 hover:bg-slate-50 px-4 -mx-4 rounded-xl transition-all group"
                  >
                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center group-hover:scale-105 transition-transform ${
                      booking.status === 'Approvata' ? 'bg-emerald-50 text-emerald-700' :
                      booking.status === 'Rifiutata' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      <span className="text-[10px] font-black uppercase leading-none opacity-60">{format(new Date(booking.startTime), 'EEE', { locale: it })}</span>
                      <span className="text-lg font-black leading-none my-0.5">{format(new Date(booking.startTime), 'dd')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate group-hover:text-emerald-600 transition-colors">{booking.requesterName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-slate-500 truncate max-w-[150px]">{booking.roomNames || booking.roomName}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{format(new Date(booking.startTime), 'HH:mm')}</span>
                      </div>
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider ${
                        booking.status === 'Approvata' ? 'bg-emerald-100 text-emerald-700' :
                        booking.status === 'Rifiutata' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {booking.status}
                      </span>
                    </div>
                  </Link>
                ))
            )}
          </div>
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
              <Users size={14} />
              {stats.rooms} sale configurate nel sistema
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
