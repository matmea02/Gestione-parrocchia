import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, addDoc, query, orderBy, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { Plus, Trash2, DoorOpen, Users, Calendar, Clock, User, X, Check, XCircle, Pencil, Info, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const Rooms: React.FC = () => {
  const { currentParish } = useParish();
  const roomsColl = useParishCollection('rooms');
  const bookingsColl = useParishCollection('bookings');
  const calendarsColl = useParishCollection('calendars');
  const calEventsColl = useParishCollection('calendar_events');

  const [searchParams, setSearchParams] = useSearchParams();
  const [rooms, setRooms] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isManageRoomsOpen, setIsManageRoomsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [bookingToDelete, setBookingToDelete] = useState<string | null>(null);
  
  const [roomsCalendarId, setRoomsCalendarId] = useState<string | null>(null);
  
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

    return () => {
      unsubRooms();
      unsubBookings();
      unsubCalendars();
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
      const eventData = {
        title: `${bookingData.roomNames || bookingData.roomName || ''} - ${bookingData.purpose || 'Uso Sala'} (${bookingData.requesterName})`,
        start: bookingData.startTime,
        end: bookingData.endTime,
        location: bookingData.roomNames || bookingData.roomName || '',
        description: `${bookingData.purpose || ''}${bookingData.requesterPhone ? ` (Contatto: ${bookingData.requesterPhone})` : ''}`,
        calendarId: roomsCalendarId,
        sourceBookingId: bookingId,
        isRoomBooking: true,
        requesterName: bookingData.requesterName,
        requesterPhone: bookingData.requesterPhone || '',
        rooms: bookingData.roomNames || bookingData.roomName || '',
        purpose: bookingData.purpose || ''
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

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newBooking.roomIds.length === 0) {
      alert("Seleziona almeno una sala");
      return;
    }
    
    const selectedRooms = rooms.filter(r => newBooking.roomIds.includes(r.id));
    const roomNamesJoined = selectedRooms.map(r => r.name).join(', ');

    try {
      let bookingId = editingBookingId;
      const bookingData = {
        ...newBooking,
        roomNames: roomNamesJoined,
      };

      if (editingBookingId) {
        await updateDoc(doc(bookingsColl, editingBookingId), bookingData);
      } else {
        const docRef = await addDoc(bookingsColl, {
          ...bookingData,
          createdAt: new Date().toISOString(),
        });
        bookingId = docRef.id;
      }

      // Sync after saving
      if (bookingId) {
        // If it was an edit, we need the existing calendarEventId if any
        let finalData = { ...bookingData };
        if (editingBookingId) {
          const existing = bookings.find(b => b.id === editingBookingId);
          if (existing?.calendarEventId) {
            finalData.calendarEventId = existing.calendarEventId;
          }
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

  const updateBookingStatus = async (id: string, status: string) => {
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

  const handleDeleteRoom = async (id: string) => {
    try {
      await deleteDoc(doc(roomsColl, id));
      setRoomToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rooms/${id}`);
    }
  };

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
                {bookings
                  .filter(b => new Date(b.endTime) >= new Date())
                  .map((booking) => (
                    <tr key={booking.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-5">
                      <div className="space-y-1">
                        <p className="text-sm font-black text-slate-900 leading-tight">{booking.requesterName}</p>
                        {booking.requesterPhone && (
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <span className="opacity-75">📞</span> {booking.requesterPhone}
                          </p>
                        )}
                        <p className="text-[11px] font-bold text-slate-400 italic">{booking.purpose || 'Nessuno scopo specificato'}</p>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-sm" />
                        <span className="text-sm font-black text-slate-700">{booking.roomNames || booking.roomName}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px] font-black text-slate-600 uppercase tracking-tighter">
                          <Calendar size={12} className="text-slate-300" />
                          {format(new Date(booking.startTime), 'dd MMM yyyy', { locale: it })}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                          <Clock size={12} className="text-slate-300" />
                          {format(new Date(booking.startTime), 'HH:mm')} - {format(new Date(booking.endTime), 'HH:mm')}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        booking.status === 'Approvata' ? 'bg-blue-50 text-blue-700' :
                        booking.status === 'Rifiutata' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {booking.status === 'In Attesa' && (
                          <>
                            <button
                              onClick={() => updateBookingStatus(booking.id, 'Approvata')}
                              className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100 shadow-sm hover:scale-110"
                              title="Approva"
                            >
                              <Check size={18} />
                            </button>
                            <button
                              onClick={() => updateBookingStatus(booking.id, 'Rifiutata')}
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
                          onClick={() => setBookingToDelete(booking.id)}
                          className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-all border border-red-100 shadow-sm hover:scale-110"
                          title="Elimina"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
          {bookings.filter(b => new Date(b.endTime) >= new Date()).length === 0 && !loading && (
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
                  value={newRoom.capacity}
                  onChange={(e) => setNewRoom({ ...newRoom, capacity: parseInt(e.target.value) })}
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
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
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
            <form onSubmit={handleCreateBooking} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-3">
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Sale da Prenotare</label>
                <div className="grid grid-cols-2 gap-3">
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
                        <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Cap. {room.capacity}</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Nome Richiedente *</label>
                  <input
                    type="text"
                    required
                    value={newBooking.requesterName}
                    onChange={(e) => setNewBooking({ ...newBooking, requesterName: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Numero di Telefono</label>
                  <input
                    type="tel"
                    placeholder="Es. +39 333 1234567"
                    value={newBooking.requesterPhone}
                    onChange={(e) => setNewBooking({ ...newBooking, requesterPhone: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Scopo Utilizzo</label>
                <input
                  type="text"
                  value={newBooking.purpose}
                  onChange={(e) => setNewBooking({ ...newBooking, purpose: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Fasce Orarie Rapide */}
              <div className="space-y-1.5 bg-slate-50/70 p-4 rounded-2xl border border-slate-100 shadow-inner">
                <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider block ml-1">Fasce Orarie Preimpostate (Intere)</span>
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
                      className="text-[10px] sm:text-[11px] font-bold text-slate-700 bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 px-2.5 py-1.5 rounded-xl transition-all shadow-sm"
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Inzio</label>
                  <input
                    type="datetime-local"
                    required
                    value={newBooking.startTime}
                    onChange={(e) => setNewBooking({ ...newBooking, startTime: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <div className="flex flex-wrap gap-1">
                    {['08:30', '10:00', '14:30', '16:00', '18:00', '20:30'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleStartHourPreset(t)}
                        className="text-[9px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-indigo-600 px-2.5 py-1 rounded-lg transition-colors border border-slate-200/50"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Fine</label>
                  <input
                    type="datetime-local"
                    required
                    value={newBooking.endTime}
                    onChange={(e) => setNewBooking({ ...newBooking, endTime: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <div className="flex flex-wrap gap-1">
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

              {/* Status Selection (Moved to bottom) */}
              <div className="space-y-3 pt-6 border-t border-slate-50">
                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Stato Prenotazione</label>
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
                      className={`flex-1 py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
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
              <div className="flex justify-end gap-4 pt-6 border-t border-slate-100">
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
                  className="bg-blue-600 text-white px-10 py-3 rounded-full font-bold uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 text-[10px]"
                >
                  {editingBookingId ? 'Salva Modifiche' : 'Salva Prenotazione'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Rooms;
