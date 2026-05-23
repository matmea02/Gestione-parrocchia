import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthContext';
import { useParish, useParishCollection } from '../components/ParishContext';
import { Calendar, Wrench, DoorOpen, Users, Tag, AlertCircle, Clock, PlusCircle, Wallet, GraduationCap, ChevronRight, BookOpen, Building2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addDays, getDay, setHours, setMinutes, setSeconds, isBefore, startOfDay, isSameDay, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Church, Heart, MapPin, CalendarDays, FileText, Image as ImageIcon } from 'lucide-react';
import { useParishDoc } from '../components/ParishContext';

const Dashboard: React.FC = () => {
  const { user, portalUser } = useAuth();
  const { currentParish } = useParish();
  const settingsDoc = useParishDoc('settings', 'parish');
  const [parishSettings, setParishSettings] = useState<any>(null);

  useEffect(() => {
    const unsub = onSnapshot(settingsDoc, (doc) => {
      if (doc.exists()) setParishSettings(doc.data());
    });
    return unsub;
  }, [settingsDoc]);

  const hasModule = (moduleId: string) => {
    if (user) return true;
    if (portalUser?.isAdmin) return true;
    if (!currentParish || !portalUser) return false;
    const pData = portalUser.permissions?.[currentParish.id];
    return pData?.enabled && pData?.modules?.includes(moduleId);
  };
  
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
  const catechismColl = useParishCollection('catechism_groups');

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
  const [catechismGroups, setCatechismGroups] = useState<any[]>([]);
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
    const unsubCatechism = onSnapshot(catechismColl, (snap) => {
      setCatechismGroups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
      unsubCatechism();
    };
  }, []);

  const getUpcomingLiturgies = () => {
    const now = new Date();
    const result: any[] = [];
    // ... logic remains same ...

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

  const getUpcomingCatechism = () => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const result: any[] = [];

    catechismGroups.forEach(group => {
      const dates = group.meetingDates || [];
      dates.forEach((date: string) => {
        const meetingDate = parseISO(date);
        const [h, m] = group.time.split(':').map(Number);
        const meetingStart = setSeconds(setMinutes(setHours(meetingDate, h), m), 0);
        
        if (meetingStart >= now && isBefore(meetingStart, addDays(now, 21))) {
          result.push({
            id: `${group.id}-${date}`,
            name: group.name,
            pathYear: group.pathYear,
            catechismYear: group.catechismYear,
            time: group.time,
            date: meetingStart,
            catechists: (group.catechistNames || []).join(', ')
          });
        }
      });
    });

    return result.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);
  };

  const todaysAgenda = getTodaysAgenda().filter(item => {
    if (item.type === 'calendar') return hasModule('calendar');
    if (item.type === 'liturgy') return hasModule('liturgy');
    return true;
  });
  const upcomingLiturgies = getUpcomingLiturgies();
  const upcomingCatechism = getUpcomingCatechism();

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
      id: 'events',
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
      id: 'maintenance',
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
      id: 'expenses',
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
      id: 'rooms',
      label: 'Sale & Prenotazioni', 
      value: stats.bookings, 
      subValue: `${stats.rooms} sale configurate`, 
      icon: DoorOpen, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50',
      to: '/sale'
    },
  ].filter(card => hasModule(card.id));

  return (
    <div className="space-y-10 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 italic uppercase tracking-tight">Dashboard</h1>
          <p className="text-slate-500 mt-1 italic font-medium flex items-center gap-2">
            Benvenuto, <span className="text-blue-600 font-black not-italic">{portalUser?.volunteerName || user?.displayName || 'Utente'}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         {statCards.map(card => (
           <Link 
             key={card.id} 
             to={card.to}
             className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col justify-between"
           >
             <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-2xl ${card.bg} ${card.color} group-hover:scale-110 transition-transform`}>
                  <card.icon size={20} />
                </div>
                {card.id === 'maintenance' && stats.pendingTickets > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-red-100 animate-pulse">
                    <AlertCircle size={10} />
                    {stats.pendingTickets} Urgenti
                  </div>
                )}
             </div>
             <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">{card.label}</p>
               <h3 className="text-2xl font-black text-slate-900 tracking-tighter italic uppercase">{card.value}</h3>
               <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tight">{card.subValue}</p>
             </div>
           </Link>
         ))}
      </div>

      {/* Main Grid: Masonry/Liquid Layout */}
      <div className="flex flex-col gap-8">
        
        {/* Agenda di Oggi - Full Width but fluid */}
        <div className="bg-white rounded-[2.5rem] border-2 border-blue-100 shadow-xl shadow-blue-50/50 overflow-hidden h-auto">
          <div className="p-8 border-b border-blue-50 bg-gradient-to-r from-blue-50/20 to-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-200">
                <CalendarDays size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase italic">Agenda di Oggi</h2>
                <p className="text-sm font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                  {format(new Date(), 'EEEE d MMMM yyyy', { locale: it })}
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                </p>
              </div>
            </div>
            <Link to="/calendario" className="w-full md:w-auto px-6 py-2.5 bg-white border-2 border-blue-100 text-blue-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm text-center">
              Vedi Calendario Completo
            </Link>
          </div>
          
          <div className="p-6">
            {todaysAgenda.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <CalendarDays size={32} className="text-slate-300" />
                </div>
                <p className="text-slate-500 font-bold">Nessun impegno in programma per oggi.</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {todaysAgenda.map((item) => (
                  <Link 
                    key={item.id}
                    to={item.type === 'calendar' ? `/calendario?edit=${item.id}` : '/calendario'}
                    className={`flex-1 min-w-[280px] relative p-5 rounded-[2rem] border-2 transition-all hover:scale-[1.02] hover:shadow-lg flex flex-col justify-between ${
                      item.type === 'liturgy' 
                        ? 'bg-purple-50/30 border-purple-100/50' 
                        : 'bg-white border-slate-100'
                    }`}
                    style={item.type === 'calendar' ? { borderColor: `${item.color}30` } : {}}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                          item.type === 'liturgy' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                        }`}
                        style={item.type === 'calendar' ? { backgroundColor: `${item.color}15`, color: item.color } : {}}
                        >
                          {item.type === 'liturgy' ? 'Liturgia' : item.calendarName}
                        </div>
                        <div className="flex items-center gap-1 text-slate-900 font-black text-xs">
                          <Clock size={12} className="opacity-40" />
                          {item.timeStr}
                        </div>
                      </div>
                      <h3 className="text-sm font-black text-slate-900 italic uppercase leading-tight mb-2 group-hover:text-blue-600 truncate">{item.title}</h3>
                    </div>

                    {item.names && item.names.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-purple-200/50 flex flex-wrap gap-1">
                        {item.names.slice(0, 3).map((n: string, i: number) => (
                          <span key={i} className="text-[8px] font-black text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-50">† {n}</span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bento Grid - Columns that grow based on content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          
          {/* CATECHISMO - Section */}
          {hasModule('catechism') && (
            <div className="bg-white rounded-[2.5rem] border border-indigo-100 shadow-sm overflow-hidden flex flex-col hover:border-indigo-300 transition-all lg:col-span-1 xl:col-span-1 h-auto">
              <div className="p-6 border-b border-indigo-50 bg-indigo-50/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                    <GraduationCap size={20} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase italic">Catechismo</h3>
                </div>
                <Link to="/catechismo" className="p-1.5 hover:bg-white rounded-lg text-indigo-600">
                  <PlusCircle size={20} />
                </Link>
              </div>
              <div className="p-5 space-y-4">
                {upcomingCatechism.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold italic text-center py-6">Nessun incontro programmato.</p>
                ) : (
                  upcomingCatechism.map(meet => (
                    <div key={meet.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-2 group">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-600 uppercase italic leading-none">{meet.name}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{format(meet.date, 'dd MMM', { locale: it })}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-slate-300" />
                          <span className="text-xs font-black text-slate-900">{meet.time}</span>
                        </div>
                        <span className="text-[8px] font-black text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-100">{meet.pathYear}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {upcomingCatechism.length > 0 && (
                <div className="px-5 pb-5 mt-auto">
                  <Link to="/catechismo" className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-100 transition-all">
                    Tutti i gruppi <ChevronRight size={14} />
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* MANUTENZIONI - Fluid Height */}
          {hasModule('maintenance') && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-amber-200 transition-all md:col-span-1 lg:col-span-1 h-auto">
              <div className="p-6 border-b border-slate-50 bg-amber-50/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-amber-200">
                    <Wrench size={20} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase italic">Manutenzioni</h3>
                </div>
                <Link to="/manutenzione" className="p-1.5 hover:bg-white rounded-lg text-amber-600">
                  <PlusCircle size={20} />
                </Link>
              </div>
              <div className="p-5 space-y-3">
                {allTickets.filter(t => t.status !== 'Completato').slice(0, 4).map(ticket => (
                  <Link 
                    key={ticket.id} 
                    to={`/manutenzione?edit=${ticket.id}`} 
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100"
                  >
                    <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                      ticket.status === 'In Corso' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {ticket.status === 'In Corso' ? <Clock size={14} /> : <AlertCircle size={14} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 truncate">{ticket.title}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">{ticket.status}</p>
                    </div>
                  </Link>
                ))}
                {allTickets.filter(t => t.status !== 'Completato').length === 0 && (
                  <p className="text-xs text-slate-400 font-bold italic text-center py-6">Nessun ticket aperto.</p>
                )}
              </div>
              <div className="px-5 pb-5 mt-auto">
                <Link to="/manutenzione" className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 text-slate-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-100 transition-all">
                  Gestisci Ticket <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          )}

          {/* SPESE - Compact but fluid */}
          {hasModule('expenses') && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-red-200 transition-all h-auto">
              <div className="p-6 border-b border-slate-50 bg-red-50/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center">
                    <Wallet size={20} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase italic">Spese Mensili</h3>
                </div>
                <Link to="/spese" className="p-1.5 hover:bg-white rounded-lg text-red-600">
                  <PlusCircle size={20} />
                </Link>
              </div>
              <div className="p-6 text-center space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Totale Mese</p>
                  <p className="text-4xl font-black text-slate-900 tracking-tighter italic">€{stats.totalExpensesMonth.toLocaleString('it-IT')}</p>
                </div>
                <div className="space-y-3">
                  {expenseCategoryDistribution.slice(0, 3).map(cat => (
                    <div key={cat.status} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 italic">
                        <span>{cat.status}</span>
                        <span>{cat.percentage.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${cat.percentage}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-5 pb-5 mt-auto">
                <Link to="/spese" className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-700 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-red-100 transition-all">
                  Dettaglio Spese <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          )}

          {/* LITURGIE - List that sizes by content */}
          {hasModule('liturgy') && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-purple-200 transition-all h-auto xl:col-span-1">
               <div className="p-6 border-b border-slate-50 bg-purple-50/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-purple-100">
                    <Church size={20} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase italic">Sante Messe</h3>
                </div>
                <Link to="/liturgie" className="p-1.5 hover:bg-white rounded-lg text-purple-600">
                  <PlusCircle size={20} />
                </Link>
              </div>
              <div className="p-5 space-y-3">
                {upcomingLiturgies.map(lit => (
                  <div key={lit.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100/50 group">
                    <div className="w-10 h-10 bg-white rounded-full flex flex-col items-center justify-center shrink-0 border border-slate-100 text-purple-600">
                      <span className="text-[8px] font-black uppercase leading-none opacity-50">{format(lit.start, 'EEE', { locale: it })}</span>
                      <span className="text-xs font-black">{format(lit.start, 'dd')}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate uppercase mt-0.5">{lit.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock size={10} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500">{lit.timeStr}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-5 mt-auto">
                <Link to="/liturgie" className="w-full flex items-center justify-center gap-2 py-3 bg-purple-50 text-purple-700 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-purple-100 transition-all">
                  Orari S.Messe <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          )}

          {/* SALE - Section */}
          {hasModule('rooms') && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-emerald-200 transition-all h-auto">
              <div className="p-6 border-b border-slate-50 bg-emerald-50/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center">
                    <DoorOpen size={20} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase italic">Sale e Affitti</h3>
                </div>
                <Link to="/sale" className="p-1.5 hover:bg-white rounded-lg text-emerald-600">
                  <PlusCircle size={20} />
                </Link>
              </div>
              <div className="p-5 space-y-3">
                {allBookings.filter(b => b.status === 'In Attesa').slice(0, 3).map(booking => (
                  <Link key={booking.id} to="/sale" className="block p-3 bg-amber-50 border border-amber-100 rounded-2xl space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-amber-700 uppercase italic">{booking.roomName}</span>
                      <span className="text-[10px] font-bold text-amber-600">{format(new Date(booking.startTime), 'dd/MM')}</span>
                    </div>
                    <p className="text-xs font-black text-slate-900 truncate">{booking.requesterName}</p>
                  </Link>
                ))}
                {allBookings.filter(b => b.status === 'In Attesa').length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase italic">Nessuna richiesta pendente</p>
                  </div>
                )}
              </div>
              <div className="px-5 pb-5 mt-auto">
                <Link to="/sale" className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-50 text-emerald-700 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-100 transition-all">
                  Configura Sale <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          )}

          {/* EVENTI - Dynamic List */}
          {hasModule('events') && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:border-blue-200 transition-all h-auto xl:col-span-2">
              <div className="p-6 border-b border-slate-50 bg-blue-50/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center">
                    <Calendar size={20} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase italic">Iniziative</h3>
                </div>
                <Link to="/eventi" className="p-1.5 hover:bg-white rounded-lg text-blue-600">
                  <PlusCircle size={20} />
                </Link>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {recentEvents.slice(0, 4).map(event => (
                   <Link 
                     key={event.id}
                     to="/eventi" 
                     className="p-4 bg-slate-50 rounded-3xl border border-slate-100 hover:bg-white hover:border-blue-200 transition-all group"
                   >
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-full flex flex-col items-center justify-center border border-slate-100 text-blue-700 shadow-sm">
                          <span className="text-[8px] font-black uppercase leading-none">{format(new Date(event.date), 'MMM', { locale: it })}</span>
                          <span className="text-sm font-black">{format(new Date(event.date), 'dd')}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 group-hover:text-blue-600 truncate uppercase mt-0.5 italic">{event.title}</p>
                          <p className="text-[9px] font-bold text-slate-400 truncate">{event.location || 'Senza luogo'}</p>
                        </div>
                     </div>
                   </Link>
                 ))}
                 {recentEvents.length === 0 && (
                   <p className="text-xs text-slate-400 font-bold italic text-center py-6 col-span-full">Nessun evento futuro.</p>
                 )}
              </div>
              <div className="px-5 pb-5 mt-auto">
                <Link to="/eventi" className="w-full flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-700 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-blue-100 transition-all">
                  Vedi Tutti <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
