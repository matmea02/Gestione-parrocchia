import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, addDoc, query, orderBy, updateDoc, doc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { Hash, Plus, Trash2, Pencil, Wrench, MapPin, User, CheckCircle2, Clock, AlertCircle, X, Euro, FileText, PlusCircle, Receipt, History, UserPlus, Upload, Download, Calendar, Tag, Paperclip, Search, Filter } from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Expense {
  id: string;
  amount: number;
  note: string;
  receiptUrl?: string;
}

interface Update {
  id: string;
  note: string;
  author: string;
  date: string;
}

interface Attachment {
  id: string;
  name: string;
  url: string;
}

const Maintenance: React.FC = () => {
  const { currentParish } = useParish();
  const maintenanceColl = useParishCollection('maintenance');
  const labelsColl = useParishCollection('maintenance_labels');
  const countersColl = useParishCollection('counters');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [tickets, setTickets] = useState<any[]>([]);
  const [parishInfo, setParishInfo] = useState<any>({
    name: 'Parrocchia S. Maria Assunta',
    address: 'Via della Chiesa, 1 - 00100 Roma (RM)',
    logoUrl: '',
    diocese: '',
    pastoralCommunity: ''
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // PDF Export Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  
  const initialTicketState = {
    title: '',
    description: '',
    reporter: '',
    location: '',
    status: 'Segnalato',
    label: 'Riparazione',
    priority: 'Programmato',
    dueDate: '',
    notes: '',
    expenses: 0,
    expensesList: [] as Expense[],
    updatesList: [] as Update[],
    attachments: [] as Attachment[],
    ticketNumber: undefined as number | undefined,
  };
  
  const [newTicket, setNewTicket] = useState(initialTicketState);

  // Filters State
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterLabel, setFilterLabel] = useState<string>('All');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && tickets.length > 0) {
      const ticketToEdit = tickets.find(t => t.id === editId);
      if (ticketToEdit) {
        handleEdit(ticketToEdit);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, tickets]);

  // For adding individual items in modal
  const [newExpense, setNewExpense] = useState({ amount: 0, note: '', receiptUrl: '' });
  const [newUpdate, setNewUpdate] = useState({ note: '', author: '' });

  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [isLabelsModalOpen, setIsLabelsModalOpen] = useState(false);
  const [viewingAttachments, setViewingAttachments] = useState<any | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{name: string, url: string} | null>(null);

  // Revoke blob URLs to avoid memory leaks
  useEffect(() => {
    const currentUrl = previewPdf?.url;
    return () => {
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [previewPdf]);

  const openPdfPreview = (name: string, dataUrl: string) => {
    if (!dataUrl) return;
    
    // If it's already a blob URL, just use it
    if (dataUrl.startsWith('blob:')) {
      setPreviewPdf({ name, url: dataUrl });
      return;
    }

    try {
      // Convert Data URL to Blob for better browser compatibility
      const arr = dataUrl.split(',');
      if (arr.length < 2) throw new Error('Invalid Data URL');
      
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      setPreviewPdf({ name, url: blobUrl });
    } catch (e) {
      console.error('Error preparing PDF preview:', e);
      // Fallback: try to open in a new tab if it's a simple link, 
      // but for base64 we still try to show the modal with the dataUrl
      setPreviewPdf({ name, url: dataUrl });
    }
  };
  const [customLabels, setCustomLabels] = useState<any[]>([]);
  const [newLabelName, setNewLabelName] = useState('');

  // Default labels as fallback
  const defaultLabels = ["Riparazione", "Sostituzione", "Nuova Installazione", "Controllo", "Altro"];

  useEffect(() => {
    console.log('Maintenance component mounted, initializing firestore listener for tickets...');
    const q = query(maintenanceColl, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      console.log('Received maintenance update, count:', snap.size);
      setTickets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error('Firestore listener error:', error);
      handleFirestoreError(error, OperationType.LIST, 'maintenance');
    });

    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    });

    return () => {
      unsub();
      unsubParish();
    };
  }, []);

  useEffect(() => {
    const q = query(labelsColl, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setCustomLabels(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'maintenance_labels');
    });
    return unsub;
  }, []);

  // Combined labels: custom from DB + defaults if DB is empty or they aren't already there
  const allLabels = customLabels.length > 0 
    ? customLabels.map(l => l.name)
    : defaultLabels;

  // Dashboard Stats & Lists
  const statsByType = tickets.reduce((acc: any, t) => {
    const label = t.label || 'Altro';
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const typeDistribution = Object.entries(statsByType)
    .map(([label, count]) => ({
      label,
      count: count as number,
      percentage: tickets.length > 0 ? ((count as number) / tickets.length * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const last3Tickets = [...tickets]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const oldestPendingTickets = [...tickets]
    .filter(t => t.status !== 'Completato' && t.status !== 'Annullato')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 3);

  const inProgressTicketsList = tickets.filter(t => t.status === 'In Corso');

  // Filtered Tickets
  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = filterStatus === 'All' || ticket.status === filterStatus;
    const matchesPriority = filterPriority === 'All' || ticket.priority === filterPriority;
    const matchesLabel = filterLabel === 'All' || ticket.label === filterLabel;
    
    const searchLower = filterSearch.toLowerCase();
    const matchesSearch = filterSearch === '' || 
      (ticket.title || '').toLowerCase().includes(searchLower) ||
      (ticket.description || '').toLowerCase().includes(searchLower) ||
      (ticket.reporter || '').toLowerCase().includes(searchLower) ||
      (ticket.location || '').toLowerCase().includes(searchLower) ||
      (ticket.ticketNumber?.toString().includes(searchLower));

    return matchesStatus && matchesPriority && matchesLabel && matchesSearch;
  });

  const statsByStatus = tickets.reduce((acc: any, t) => {
    const status = t.status || 'Segnalato';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const statusDistribution = Object.entries(statsByStatus)
    .map(([status, count]) => ({
      status,
      count: count as number,
      percentage: tickets.length > 0 ? ((count as number) / tickets.length * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  // Calculate total expense whenever expensesList changes
  useEffect(() => {
    const total = newTicket.expensesList.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    if (total !== newTicket.expenses) {
      setNewTicket(prev => ({ ...prev, expenses: total }));
    }
  }, [newTicket.expensesList]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSave = {
        ...newTicket,
        updatedAt: new Date().toISOString(),
      };

      if (editingTicketId) {
        await updateDoc(doc(maintenanceColl, editingTicketId), dataToSave);
      } else {
        let ticketNumber = 1;
        try {
          await runTransaction(db, async (transaction) => {
            const counterRef = doc(countersColl, 'maintenance');
            const counterSnap = await transaction.get(counterRef);
            
            if (counterSnap.exists()) {
              ticketNumber = (counterSnap.data().lastNumber || 0) + 1;
            }
            
            transaction.set(counterRef, { lastNumber: ticketNumber }, { merge: true });
          });
        } catch (e) {
          console.error("Error generating ticket number, using timestamp as fallback", e);
          ticketNumber = Date.now();
        }

        await addDoc(maintenanceColl, {
          ...dataToSave,
          ticketNumber,
          createdAt: new Date().toISOString(),
        });
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, editingTicketId ? OperationType.UPDATE : OperationType.CREATE, 'maintenance');
    }
  };

  const handleEdit = (ticket: any) => {
    setNewTicket({
      title: ticket.title || '',
      description: ticket.description || '',
      reporter: ticket.reporter || '',
      location: ticket.location || '',
      status: ticket.status || 'Segnalato',
      label: ticket.label || 'Riparazione',
      priority: ticket.priority || 'Programmato',
      dueDate: ticket.dueDate || '',
      notes: ticket.notes || '',
      expenses: ticket.expenses || 0,
      expensesList: ticket.expensesList || [],
      updatesList: ticket.updatesList || [],
      attachments: ticket.attachments || [],
      ticketNumber: ticket.ticketNumber,
    });
    setEditingTicketId(ticket.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTicketId(null);
    setNewTicket(initialTicketState);
    setNewExpense({ amount: 0, note: '', receiptUrl: '' });
    setNewUpdate({ note: '', author: '' });
  };

  const handleDelete = async (id: string) => {
    console.log('Requesting deletion of ticket:', id);
    try {
      await deleteDoc(doc(maintenanceColl, id));
      console.log('Ticket deleted successfully:', id);
      setDeleteConfirmation(null);
    } catch (error) {
      console.error('Ticket deletion failed:', error);
      handleFirestoreError(error, OperationType.DELETE, `maintenance/${id}`);
    }
  };

  const addExpense = () => {
    if (newExpense.amount <= 0 && !newExpense.note) return;
    const expense: Expense = {
      ...newExpense,
      id: Math.random().toString(36).substr(2, 9),
    };
    setNewTicket(prev => ({
      ...prev,
      expensesList: [...prev.expensesList, expense],
    }));
    setNewExpense({ amount: 0, note: '', receiptUrl: '' });
  };

  const removeExpense = (id: string) => {
    setNewTicket(prev => ({
      ...prev,
      expensesList: prev.expensesList.filter(e => e.id !== id),
    }));
  };

  const addUpdate = () => {
    if (!newUpdate.note || !newUpdate.author) return;
    const update: Update = {
      ...newUpdate,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
    };
    setNewTicket(prev => ({
      ...prev,
      updatesList: [update, ...prev.updatesList], // Newest first
    }));
    setNewUpdate({ note: '', author: '' });
  };

  const removeUpdate = (id: string) => {
    setNewTicket(prev => ({
      ...prev,
      updatesList: prev.updatesList.filter(u => u.id !== id),
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewExpense(prev => ({ ...prev, receiptUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's a PDF
    if (file.type !== 'application/pdf') {
      alert('Per favore carica solo file PDF.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const attachment: Attachment = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        url: reader.result as string,
      };
      setNewTicket(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), attachment],
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = (id: string) => {
    setNewTicket(prev => ({
      ...prev,
      attachments: prev.attachments.filter(a => a.id !== id),
    }));
  };

  const addCustomLabel = async () => {
    if (!newLabelName.trim()) return;
    try {
      await addDoc(labelsColl, {
        name: newLabelName.trim(),
        createdAt: new Date().toISOString(),
      });
      setNewLabelName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'maintenance_labels');
    }
  };

  const deleteCustomLabel = async (id: string) => {
    try {
      await deleteDoc(doc(labelsColl, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `maintenance_labels/${id}`);
    }
  };

  const exportToPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const blueColor = [37, 99, 235]; // blue-600
      
      // Filter tickets if dates are set
      let filteredTickets = [...tickets];
      if (startDate && endDate) {
        const start = startOfDay(new Date(startDate));
        const end = endOfDay(new Date(endDate));
        filteredTickets = tickets.filter(ticket => {
          const ticketDate = new Date(ticket.createdAt);
          return isWithinInterval(ticketDate, { start, end });
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
      const rangeText = startDate && endDate 
        ? `${format(new Date(startDate), 'dd/MM/yy')} - ${format(new Date(endDate), 'dd/MM/yy')}`
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
      doc.text('REPORT INTERVENTI MANUTENZIONE', 105, 38, { align: 'center' });

      // Summary Box
      const totalExpenses = filteredTickets.reduce((sum, t) => sum + (t.expenses || 0), 0);
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(14, 45, 182, 12, 2, 2, 'FD');
      
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.text(`Totale Interventi: ${filteredTickets.length}`, 19, 52.5);
      doc.text(`Totale Spese: € ${totalExpenses.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, 195, 52.5, { align: 'right' });

      // Table
      const tableData = filteredTickets.map(t => [
        t.ticketNumber?.toString().padStart(3, '0') || 'N/D',
        format(new Date(t.createdAt), 'dd/MM/yy', { locale: it }),
        t.title,
        t.label || '-',
        t.status,
        t.location || '-',
        t.reporter,
        `€ ${t.expenses?.toLocaleString('it-IT', { minimumFractionDigits: 2 }) || '0.00'}`
      ]);

      autoTable(doc, {
        startY: 62,
        head: [['#', 'Data', 'Titolo', 'Tipo', 'Stato', 'Luogo', 'Segnalatore', 'Spese']],
        body: tableData,
        theme: 'grid',
        headStyles: { 
          fillColor: blueColor as [number, number, number],
          fontSize: 9,
          fontStyle: 'bold'
        },
        styles: { 
          fontSize: 10,
          cellPadding: 3
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didDrawPage: (data) => {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text('Pagina ' + data.pageNumber, 196, 285, { align: 'right' });
        }
      });

      doc.save(`report_manutenzione_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Si è verificato un errore durante la generazione del PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Segnalato': return <AlertCircle size={16} className="text-sky-600" />;
      case 'In Attesa': return <AlertCircle size={16} className="text-red-600" />;
      case 'In Corso': return <Clock size={16} className="text-amber-600" />;
      case 'Completato': return <CheckCircle2 size={16} className="text-blue-600" />;
      default: return null;
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'Urgente': return <AlertCircle size={14} className="text-red-600" />;
      case 'Programmato': return <Calendar size={14} className="text-blue-600" />;
      case 'Da valutare': 
      case 'Non indispensabile': return <Clock size={14} className="text-slate-400" />;
      case 'Preventivato': return <Euro size={14} className="text-amber-600" />;
      default: return null;
    }
  };

  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case 'Urgente': return 'bg-red-50 text-red-700 border-red-100';
      case 'Programmato': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Da valutare': 
      case 'Non indispensabile': return 'bg-slate-50 text-slate-600 border-slate-100';
      case 'Preventivato': return 'bg-amber-50 text-amber-700 border-amber-100';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'Segnalato': return 'bg-sky-100 text-sky-700 border-sky-200';
      case 'In Attesa': return 'bg-red-100 text-red-700 border-red-200';
      case 'In Corso': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Completato': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-200 text-slate-700 border-slate-300';
    }
  };

  const getRowBgClass = (status: string) => {
    switch (status) {
      case 'Segnalato': return 'bg-sky-50/70 hover:bg-sky-50/90 transition-colors';
      case 'In Attesa': return 'bg-red-50/70 hover:bg-red-50/90 transition-colors';
      case 'In Corso': return 'bg-amber-50/70 hover:bg-amber-50/90 transition-colors';
      case 'Completato': return 'bg-blue-50/70 hover:bg-blue-50/90 transition-colors';
      case 'Annullato': return 'bg-slate-100/70 hover:bg-slate-100/90 transition-colors';
      default: return 'hover:bg-slate-50 transition-colors';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Manutenzione</h1>
          <p className="text-slate-500 mt-1">Gestisci i ticket di intervento per l'oratorio e la parrocchia.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-3 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm shadow-sm">
            <div className="flex gap-2 mr-2">
              <button 
                onClick={() => {
                  setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                  setEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                }}
                className="text-[10px] font-black uppercase text-blue-600 hover:underline"
              >
                Mese
              </button>
              <button 
                onClick={() => {
                  setStartDate(format(startOfYear(new Date()), 'yyyy-MM-dd'));
                  setEndDate(format(endOfYear(new Date()), 'yyyy-MM-dd'));
                }}
                className="text-[10px] font-black uppercase text-blue-600 hover:underline"
              >
                Anno
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="outline-none bg-transparent"
              />
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="outline-none bg-transparent"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
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
            onClick={() => setIsLabelsModalOpen(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-medium hover:bg-slate-50 transition-colors shadow-sm"
            title="Gestisci Etichette"
          >
            <Tag size={20} />
            <span className="hidden sm:inline">Etichette</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-md shadow-blue-100"
          >
            <Plus size={20} />
            Segnala
          </button>
        </div>
      </div>

      {!loading && tickets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Distribution by Status */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <CheckCircle2 size={16} /> Distribuzione per Stato
            </h3>
            <div className="space-y-3">
              {statusDistribution.map((item) => (
                <div key={item.status} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                    <span className="text-slate-600 truncate mr-2">{item.status}</span>
                    <span className="text-slate-400">{item.count} ({Math.round(item.percentage)}%)</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${
                        item.status === 'Completato' ? 'bg-blue-500' :
                        item.status === 'In Corso' ? 'bg-amber-500' :
                        item.status === 'In Attesa' ? 'bg-red-500' : 'bg-sky-500'
                      }`} 
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Distribution by Type */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Tag size={16} /> Distribuzione per Tipo
            </h3>
            <div className="space-y-3">
              {typeDistribution.slice(0, 5).map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                    <span className="text-slate-600 truncate mr-2">{item.label}</span>
                    <span className="text-slate-400">{item.count} ({Math.round(item.percentage)}%)</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
              {typeDistribution.length === 0 && (
                <p className="text-xs text-slate-400 italic">Dati non sufficienti.</p>
              )}
            </div>
          </div>

          {/* Recent Tickets */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <PlusCircle size={16} className="text-blue-500" /> Ultime Segnalazioni
            </h3>
            <div className="space-y-3">
              {last3Tickets.map((ticket) => (
                <button 
                  key={ticket.id} 
                  onClick={() => handleEdit(ticket)}
                  className="w-full flex items-center gap-3 group text-left p-1 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusClass(ticket.status).split(' ')[0].replace('bg-', 'bg-opacity-100 bg-')}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">{ticket.title}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-medium">
                      {format(new Date(ticket.createdAt), 'dd MMM HH:mm', { locale: it })}
                    </p>
                  </div>
                </button>
              ))}
              {last3Tickets.length === 0 && (
                <p className="text-xs text-slate-400 italic">Nessuna segnalazione.</p>
              )}
            </div>
          </div>

          {/* Oldest Pending */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Clock size={16} className="text-red-500" /> Più Vecchie (Pendenti)
            </h3>
            <div className="space-y-3">
              {oldestPendingTickets.map((ticket) => (
                <button 
                  key={ticket.id} 
                  onClick={() => handleEdit(ticket)}
                  className="w-full flex items-center gap-3 group text-left p-1 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 group-hover:bg-red-100 transition-colors">
                    <AlertCircle size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate group-hover:text-red-600 transition-colors">{ticket.title}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-medium">
                      {format(new Date(ticket.createdAt), 'dd MMM yyyy', { locale: it })}
                    </p>
                  </div>
                </button>
              ))}
              {oldestPendingTickets.length === 0 && (
                <p className="text-xs text-slate-400 italic">Tutto in ordine.</p>
              )}
            </div>
          </div>

          {/* In Progress */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Wrench size={16} className="text-amber-500" /> In Corso
            </h3>
            <div className="space-y-3">
              {inProgressTicketsList.slice(0, 3).map((ticket) => (
                <button 
                  key={ticket.id} 
                  onClick={() => handleEdit(ticket)}
                  className="w-full flex items-center gap-3 group text-left p-1 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-100 transition-colors">
                    <Clock size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-600 transition-colors">{ticket.title}</p>
                    <p className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter">
                      In lavorazione
                    </p>
                  </div>
                </button>
              ))}
              {inProgressTicketsList.length === 0 && (
                <p className="text-xs text-slate-400 italic">Niente in corso.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && tickets.length === 0 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wrench size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Nessuna segnalazione</h3>
          <p className="text-slate-500 max-w-xs mx-auto mt-2">Inizia a gestire gli interventi segnalando il primo ticket di manutenzione.</p>
        </div>
      )}

      {!loading && tickets.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[250px] relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cerca per titolo, descr, segnalatore o #ticket..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            >
              <option value="All">Tutti gli Stati</option>
              <option value="Segnalato">Segnalato</option>
              <option value="In Attesa">In Attesa</option>
              <option value="In Corso">In Corso</option>
              <option value="Completato">Completato</option>
              <option value="Annullato">Annullato</option>
            </select>
            
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            >
              <option value="All">Tutte le Priorità</option>
              <option value="Urgente">Urgente</option>
              <option value="Programmato">Programmato</option>
              <option value="Da valutare">Da valutare</option>
              <option value="Preventivato">Preventivato</option>
            </select>

            <select
              value={filterLabel}
              onChange={(e) => setFilterLabel(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium max-w-[150px]"
            >
              <option value="All">Tutti i Tipi</option>
              {allLabels.map(label => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>

            {(filterStatus !== 'All' || filterPriority !== 'All' || filterLabel !== 'All' || filterSearch !== '') && (
              <button
                onClick={() => {
                  setFilterStatus('All');
                  setFilterPriority('All');
                  setFilterLabel('All');
                  setFilterSearch('');
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
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider w-20">#</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Ticket</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Priorità / Scadenza</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Tipo</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Stato</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Luogo / Segnalatore</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider text-center">Spese Totali</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      Nessun ticket corrisponde ai filtri selezionati.
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((ticket) => (
                    <tr 
                      key={ticket.id} 
                      onClick={() => handleEdit(ticket)}
                      className={`${getRowBgClass(ticket.status)} cursor-pointer hover:brightness-[0.98] transition-all`}
                    >
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-400 font-mono">
                        #{ticket.ticketNumber?.toString().padStart(3, '0') || '---'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-900">{ticket.title}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{ticket.description}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-slate-400 uppercase font-medium">
                            {format(new Date(ticket.createdAt), 'dd MMM yyyy HH:mm', { locale: it })}
                          </p>
                          {ticket.updatesList?.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded border border-sky-100 font-bold uppercase" title={`${ticket.updatesList.length} aggiornamenti`}>
                              <History size={10} className="text-sky-400" />
                              {ticket.updatesList.length}
                            </span>
                          )}
                          {ticket.attachments?.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingAttachments(ticket);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 font-bold uppercase hover:bg-indigo-100 transition-colors cursor-pointer" 
                              title={`${ticket.attachments.length} allegati - Clicca per visualizzare`}
                            >
                              <Paperclip size={10} className="text-indigo-400" />
                              {ticket.attachments.length}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="space-y-1.5 flex flex-col items-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${getPriorityClass(ticket.priority || 'Programmato')}`}>
                          {getPriorityIcon(ticket.priority || 'Programmato')}
                          {ticket.priority || 'Programmato'}
                        </span>
                        {ticket.dueDate ? (
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase">
                            <Calendar size={10} className="text-slate-400" />
                            {format(new Date(ticket.dueDate), 'dd/MM/yy')}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300 italic font-bold uppercase tracking-tighter">Nessuna scadenza</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {ticket.label ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                          <Tag size={10} className="text-slate-400" />
                          {ticket.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase ${getStatusClass(ticket.status)}`}>
                        {getStatusIcon(ticket.status)}
                        {ticket.status}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <MapPin size={12} className="text-slate-400" />
                          {ticket.location || 'N/D'}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <User size={12} className="text-slate-400" />
                          {ticket.reporter}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-1 text-sm font-bold text-blue-700">
                          <Euro size={14} />
                          {ticket.expenses?.toFixed(2) || '0.00'}
                        </div>
                        {ticket.expensesList?.length > 0 && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {ticket.expensesList.length} ricevut{ticket.expensesList.length === 1 ? 'a' : 'e'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {ticket.attachments?.length > 0 && (
                          <button
                            onClick={() => setViewingAttachments(ticket)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                            title="Visualizza Allegati"
                          >
                            <FileText size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(ticket)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                          title="Modifica"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmation(ticket.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                          title="Elimina"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>
          {tickets.length === 0 && (
            <div className="p-12 text-center">
              <Wrench size={48} className="mx-auto text-slate-200 mb-4" />
              <p className="text-slate-500">Nessun ticket di manutenzione presente.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white z-10">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">
                  {editingTicketId ? 'Modifica Intervento' : 'Nuova Segnalazione Intervento'}
                </h2>
                {editingTicketId && newTicket.ticketNumber && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-mono font-bold">
                    #{newTicket.ticketNumber.toString().padStart(3, '0')}
                  </span>
                )}
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-900">
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6 space-y-8 bg-slate-50/50">
              <form id="ticket-form" onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Informazioni Generali */}
                  <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-600 border-b border-blue-100 pb-1 flex items-center gap-2">
                      <FileText size={14} /> Dettagli Segnalazione
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Titolo Intervento</label>
                        <input
                          type="text"
                          required
                          value={newTicket.title}
                          onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                          placeholder="es. Riparazione caldaia..."
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Descrizione</label>
                        <textarea
                          value={newTicket.description}
                          onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none transition-all text-sm"
                          placeholder="Descrivi il problema..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Segnalatore</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                          <input
                            type="text"
                            required
                            value={newTicket.reporter}
                            onChange={(e) => setNewTicket({ ...newTicket, reporter: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-medium"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Luogo / Area</label>
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                          <input
                            type="text"
                            value={newTicket.location}
                            onChange={(e) => setNewTicket({ ...newTicket, location: e.target.value })}
                            className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                            placeholder="es. Aula 1..."
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Tipo</label>
                        <select
                          value={newTicket.label}
                          onChange={(e) => setNewTicket({ ...newTicket, label: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                        >
                          {allLabels.map((lbl) => (
                            <option key={lbl} value={lbl}>{lbl}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Stato</label>
                        <select
                          value={newTicket.status}
                          onChange={(e) => setNewTicket({ ...newTicket, status: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                        >
                          <option value="Segnalato">Segnalato</option>
                          <option value="In Attesa">In Attesa</option>
                          <option value="In Corso">In Corso</option>
                          <option value="Completato">Completato</option>
                          <option value="Annullato">Annullato</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Priorità</label>
                        <select
                          value={newTicket.priority}
                          onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                        >
                          <option value="Urgente">URGENTE</option>
                          <option value="Programmato">Programmato</option>
                          <option value="Da valutare">Da valutare</option>
                          <option value="Preventivato">Preventivato</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-500 uppercase">Scadenza</label>
                          <div className="flex gap-1">
                            <button 
                              type="button"
                              onClick={() => setNewTicket({ ...newTicket, dueDate: format(new Date(), 'yyyy-MM-dd') })}
                              className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                            >
                              Oggi
                            </button>
                            <button 
                              type="button"
                              onClick={() => setNewTicket({ ...newTicket, dueDate: format(addDays(new Date(), 1), 'yyyy-MM-dd') })}
                              className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                            >
                              Dom
                            </button>
                            <button 
                              type="button"
                              onClick={() => setNewTicket({ ...newTicket, dueDate: format(addDays(new Date(), 7), 'yyyy-MM-dd') })}
                              className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                            >
                              +7g
                            </button>
                          </div>
                        </div>
                        <input
                          type="date"
                          value={newTicket.dueDate}
                          onChange={(e) => setNewTicket({ ...newTicket, dueDate: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expenses & Updates - Row */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
                        <Euro size={14} /> Gestione Spese
                      </h3>
                      <div className="flex items-center gap-2 text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
                        <span className="text-[10px] font-black uppercase">Totale:</span>
                        <span className="text-lg font-black leading-none">{newTicket.expenses.toFixed(2)}€</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400">Importo (€)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newExpense.amount}
                            onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                          />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400">Descrizione Spesa</label>
                          <input
                            type="text"
                            value={newExpense.note}
                            onChange={(e) => setNewExpense({ ...newExpense, note: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            placeholder="es. Ricambi..."
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex-1 space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">Ricevuta</label>
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              onChange={handleFileUpload}
                              className="hidden"
                              id="receipt-upload"
                            />
                            <label
                              htmlFor="receipt-upload"
                              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed cursor-pointer transition-all text-xs font-bold uppercase ${
                                newExpense.receiptUrl ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-400 hover:border-blue-500 hover:text-blue-500'
                              }`}
                            >
                              <Upload size={14} />
                              {newExpense.receiptUrl ? 'OK' : 'File'}
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={addExpense}
                            className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-all shadow-md active:scale-95"
                          >
                            <Plus size={20} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-[300px] overflow-auto pr-2">
                        {newTicket.expensesList.map((exp) => (
                          <div key={exp.id} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 transition-all shadow-sm group">
                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 font-bold text-xs group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                              €
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-900 leading-tight">{exp.amount.toFixed(2)}€</p>
                              <p className="text-[10px] text-slate-500 truncate font-medium">{exp.note || 'Nessuna nota'}</p>
                            </div>
                            {exp.receiptUrl && (
                              <a href={exp.receiptUrl} target="_blank" rel="noreferrer" className="p-2 text-blue-500 hover:bg-blue-100 rounded-lg transition-all">
                                <FileText size={18} />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => removeExpense(exp.id)}
                              className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-600 border-b border-blue-100 pb-1 flex items-center gap-2">
                      <History size={14} /> Cronologia & Update
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-400">Nota Aggiornamento</label>
                        <input
                          type="text"
                          value={newUpdate.note}
                          onChange={(e) => setNewUpdate({ ...newUpdate, note: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="Cosa è successo?"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400">Autore</label>
                          <input
                            type="text"
                            value={newUpdate.author}
                            onChange={(e) => setNewUpdate({ ...newUpdate, author: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                            placeholder="Nome"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={addUpdate}
                          className="bg-slate-900 text-white p-3 rounded-xl hover:bg-blue-600 transition-all shadow-md active:scale-95"
                        >
                          <PlusCircle size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4 max-h-[300px] overflow-auto pr-2">
                      {newTicket.updatesList.map((upd) => (
                        <div key={upd.id} className="relative pl-6 pb-6 border-l-2 border-slate-100 last:border-0 last:pb-0">
                          <div className="absolute left-[-9px] top-0 w-4 h-4 bg-white border-2 border-blue-500 rounded-full" />
                          <div className="bg-slate-50 p-4 rounded-2xl space-y-2 border border-slate-100">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">
                                {upd.author}
                              </span>
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                                {format(new Date(upd.date), 'dd MMM HH:mm', { locale: it })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 font-medium leading-relaxed">{upd.note}</p>
                            <button
                              type="button"
                              onClick={() => removeUpdate(upd.id)}
                              className="text-[9px] font-black uppercase tracking-widest text-slate-300 hover:text-red-500 transition-colors"
                            >
                              Elimina Nota
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-6 shadow-sm">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-600 border-b border-blue-100 pb-1 flex items-center gap-2">
                      <Paperclip size={14} /> Documenti Allegati (PDF)
                    </h3>

                    <div className="p-6 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-4 hover:border-blue-400 hover:bg-blue-50 transition-all group">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleAttachmentUpload}
                        className="hidden"
                        id="attachment-upload"
                      />
                      <label
                        htmlFor="attachment-upload"
                        className="flex flex-col items-center gap-2 cursor-pointer text-center"
                      >
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md border border-slate-200 group-hover:scale-110 transition-transform">
                          <Upload size={28} className="text-slate-400 group-hover:text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-700 uppercase tracking-tight">Trascina un PDF</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Massimo 10MB per file</p>
                        </div>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {newTicket.attachments?.map((att) => (
                        <div key={att.id} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl group hover:border-blue-400 transition-all shadow-sm">
                          <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0 font-black text-[10px]">
                            PDF
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate" title={att.name}>{att.name}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openPdfPreview(att.name, att.url)}
                              className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            >
                              <FileText size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeAttachment(att.id)}
                              className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-4 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
              <button
                type="button"
                onClick={closeModal}
                className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 transition-colors uppercase tracking-wider"
              >
                Annulla
              </button>
              <button
                form="ticket-form"
                type="submit"
                className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-md active:scale-95 uppercase tracking-wider"
              >
                {editingTicketId ? 'Salva Modifiche' : 'Salva Segnalazione'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Viewer Modal */}
      {viewingAttachments && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="text-indigo-600" size={24} />
                <div>
                  <h2 className="text-xl font-bold text-slate-900 leading-tight">Documenti Allegati</h2>
                  <p className="text-xs text-slate-500 font-medium whitespace-nowrap">Ticket #{viewingAttachments.ticketNumber?.toString().padStart(3, '0')}</p>
                </div>
              </div>
              <button 
                onClick={() => setViewingAttachments(null)} 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto bg-slate-50/50">
              {viewingAttachments.attachments?.map((att: Attachment) => (
                <div key={att.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl group hover:border-indigo-300 transition-all shadow-sm">
                  <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-xs shadow-inner">
                    PDF
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate" title={att.name}>
                      {att.name}
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-0.5">
                      Documento PDF
                    </p>
                  </div>
                  <button
                    onClick={() => openPdfPreview(att.name, att.url)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                  >
                    Visualizza
                  </button>
                </div>
              ))}
              {(!viewingAttachments.attachments || viewingAttachments.attachments.length === 0) && (
                <div className="text-center py-12 text-slate-400 italic">
                  Nessun allegato trovato per questo ticket.
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end bg-white">
              <button
                onClick={() => setViewingAttachments(null)}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all shadow-md uppercase tracking-widest"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Full Preview Modal */}
      {previewPdf && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2 text-slate-900">
                <FileText className="text-red-600" size={24} />
                <h2 className="text-lg font-bold truncate pr-4">{previewPdf.name}</h2>
              </div>
              <button 
                onClick={() => setPreviewPdf(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-900"
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 bg-slate-800 relative">
              <object
                data={previewPdf.url}
                type="application/pdf"
                className="w-full h-full border-0"
              >
                <div className="flex flex-col items-center justify-center h-full text-white p-8 space-y-6 text-center">
                  <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mb-2">
                    <AlertCircle size={40} className="text-amber-500" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h3 className="text-xl font-bold">Anteprima non disponibile</h3>
                    <p className="text-slate-400 text-sm">
                      Il tuo browser ha bloccato la visualizzazione integrata del PDF (questo accade spesso per motivi di sicurezza).
                    </p>
                  </div>
                  <a 
                    href={previewPdf.url} 
                    download={previewPdf.name}
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg flex items-center gap-3 uppercase tracking-widest text-sm"
                  >
                    <Download size={20} />
                    Scarica e Visualizza
                  </a>
                </div>
              </object>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50">
              <p className="text-xs text-slate-500 font-medium italic">Nota: Se il PDF non appare, potrebbe essere necessario scaricarlo.</p>
              <div className="flex gap-3">
                <a 
                  href={previewPdf.url} 
                  download={previewPdf.name}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all flex items-center gap-2 uppercase tracking-widest shadow-md"
                >
                  <Download size={16} />
                  Scarica
                </a>
                <button
                  onClick={() => setPreviewPdf(null)}
                  className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition-all uppercase tracking-widest shadow-md"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Label Management Modal */}
      {isLabelsModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl w-full max-w-xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Tag className="text-blue-600" size={24} />
                Gestione Etichette
              </h2>
              <button onClick={() => setIsLabelsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Aggiungi Nuova Etichetta</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder="es. Manutenzione Giardino"
                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    onKeyPress={(e) => e.key === 'Enter' && addCustomLabel()}
                  />
                  <button
                    onClick={addCustomLabel}
                    className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Plus size={24} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Etichette Disponibili</h3>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                  {customLabels.length === 0 && (
                    <div className="text-center py-4 text-slate-400 italic text-sm">
                      Usa le etichette di sistema o aggiungine di nuove.
                    </div>
                  )}
                  {customLabels.map((lbl) => (
                    <div key={lbl.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl group">
                      <span className="text-sm font-medium text-slate-700">{lbl.name}</span>
                      <button
                        onClick={() => deleteCustomLabel(lbl.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Elimina etichetta"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {customLabels.length === 0 && defaultLabels.map((lbl) => (
                    <div key={lbl} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl opacity-60">
                      <span className="text-sm font-medium text-slate-700">{lbl} (Sistema)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsLabelsModalOpen(false)}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-md uppercase tracking-wider"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
                <Trash2 size={32} />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">Elimina Ticket?</h2>
                <p className="text-sm text-slate-500">L'azione è irreversibile e cancellerà definitivamente il ticket.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleDelete(deleteConfirmation)}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-bold uppercase tracking-wider hover:bg-red-700 transition-colors shadow-md"
              >
                Elimina Definitivamente
              </button>
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="w-full py-3 text-slate-600 font-bold uppercase tracking-wider hover:bg-slate-100 rounded-xl transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Maintenance;
