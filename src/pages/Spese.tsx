import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { 
  Plus, Trash2, Search, Pencil, FileText, Download, X, 
  Euro, Tag, Calendar, Clock, AlertCircle, FileUp, 
  CheckCircle2, Info, ChevronRight, PieChart, Users,
  Building2, Coffee, Baby, Trophy, Filter, ListFilter, TrendingUp
} from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay, addDays, isAfter, isBefore, startOfQuarter, endOfQuarter, eachQuarterOfInterval, isValid } from 'date-fns';
import { it } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Spese: React.FC = () => {
  const { currentParish } = useParish();
  const expensesColl = useParishCollection('expenses');
  const categoriesColl = useParishCollection('expense_categories');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterDeadline, setFilterDeadline] = useState('All'); // All, Scadute, In Scadenza
  
  const [parishInfo, setParishInfo] = useState<any>({
    name: 'Parrocchia S. Maria Assunta',
    address: 'Via della Chiesa, 1 - 00100 Roma (RM)',
    logoUrl: '',
    diocese: '',
    pastoralCommunity: ''
  });

  // PDF Export Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const [newCategory, setNewCategory] = useState('');
  
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    category: '',
    amount: 0,
    invoiceUrl: '',
    reimbursableTo: '',
    notes: '',
    deadline: '',
    usage: '',
    paid: false,
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    const qExpenses = query(expensesColl, orderBy('date', 'desc'));
    const unsubExpenses = onSnapshot(qExpenses, (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qCats = query(categoriesColl, orderBy('name', 'asc'));
    const unsubCats = onSnapshot(qCats, (snap) => {
      setCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    });

    return () => {
      unsubExpenses();
      unsubCats();
      unsubParish();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(expensesColl, editingId), {
          ...form,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(expensesColl, {
          ...form,
          createdAt: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'expenses');
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      category: '',
      amount: 0,
      invoiceUrl: '',
      reimbursableTo: '',
      notes: '',
      deadline: '',
      usage: '',
      paid: false,
      date: format(new Date(), 'yyyy-MM-dd'),
    });
    setEditingId(null);
  };

  const togglePaid = async (expense: any) => {
    try {
      await updateDoc(doc(expensesColl, expense.id), {
        paid: !expense.paid,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'expenses');
    }
  };

  const handleEdit = (expense: any) => {
    setForm({
      name: expense.name,
      category: expense.category,
      amount: expense.amount,
      invoiceUrl: expense.invoiceUrl || '',
      reimbursableTo: expense.reimbursableTo || '',
      notes: expense.notes || '',
      deadline: expense.deadline || '',
      usage: expense.usage || '',
      paid: expense.paid || false,
      date: expense.date,
    });
    setEditingId(expense.id);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!expenseToDelete) return;
    try {
      await deleteDoc(doc(expensesColl, expenseToDelete));
      setExpenseToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'expenses');
    }
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    try {
      await addDoc(categoriesColl, {
        name: newCategory.trim(),
        createdAt: new Date().toISOString()
      });
      setNewCategory('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expense_categories');
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await deleteDoc(doc(categoriesColl, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'expense_categories');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Per favore carica solo file PDF.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setForm(prev => ({ ...prev, invoiceUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.usage || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === 'All' || e.category === filterCategory;
    
    let matchesDeadline = true;
    if (filterDeadline === 'Scadute' && e.deadline) {
      matchesDeadline = new Date(e.deadline) < startOfDay(new Date());
    } else if (filterDeadline === 'In Scadenza' && e.deadline) {
      const today = startOfDay(new Date());
      const nextWeek = addDays(today, 7);
      const deadline = new Date(e.deadline);
      matchesDeadline = deadline >= today && deadline <= nextWeek;
    } else if (filterDeadline !== 'All' && !e.deadline) {
       matchesDeadline = false;
    }

    return matchesSearch && matchesCategory && matchesDeadline;
  });

  // Dashboard Stats
  const now = new Date();
  const currentYear = now.getFullYear();

  // 1. Spese per categoria
  const expensesByCategory = expenses.reduce((acc: any, e) => {
    const cat = e.category || 'Generale';
    acc[cat] = (acc[cat] || 0) + (e.amount || 0);
    return acc;
  }, {});

  const categoryStats = Object.entries(expensesByCategory)
    .map(([name, amount]) => ({ name, amount: amount as number }))
    .sort((a, b) => b.amount - a.amount);

  // 2. Prossime scadenze (nei prossimi 14 giorni non pagate)
  const upcomingDeadlines = expenses
    .filter(e => {
      if (!e.deadline || e.paid) return false;
      const deadline = new Date(e.deadline);
      const today = startOfDay(new Date());
      const limit = addDays(today, 14);
      return deadline >= today && deadline <= limit;
    })
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  // 3. Spesa annuale divisa per trimestri
  const quarterlyExpenses = [0, 0, 0, 0]; // Q1, Q2, Q3, Q4
  expenses.forEach(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === currentYear) {
      const quarter = Math.floor(d.getMonth() / 3);
      quarterlyExpenses[quarter] += (e.amount || 0);
    }
  });

  const exportToPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const blueColor = [37, 99, 235]; // blue-600
      
      let toExport = [...expenses];
      if (startDate && endDate) {
        const start = startOfDay(new Date(startDate));
        const end = endOfDay(new Date(endDate));
        toExport = expenses.filter(e => {
          const d = new Date(e.date);
          return isWithinInterval(d, { start, end });
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
      doc.text('REPORT SPESE E USCITE', 105, 38, { align: 'center' });

      // Summary Box
      const total = toExport.reduce((sum, e) => sum + (e.amount || 0), 0);
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(14, 45, 182, 12, 2, 2, 'FD');
      
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.text(`Totale Documenti: ${toExport.length}`, 19, 52.5);
      doc.text(`Importo Complessivo: € ${total.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, 195, 52.5, { align: 'right' });

      // Table
      const tableData = toExport.map(e => [
        format(new Date(e.date), 'dd/MM/yy'),
        e.name,
        e.category || 'Generale',
        e.reimbursableTo || '-',
        e.deadline ? format(new Date(e.deadline), 'dd/MM/yy') : '-',
        `€ ${e.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`
      ]);

      autoTable(doc, {
        startY: 62,
        head: [['Data', 'Descrizione', 'Categoria', 'Rimborso', 'Scadenza', 'Importo']],
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

      doc.save(`report_spese_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Errore durante la generazione del PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Gestione Spese</h1>
          <p className="text-slate-500 font-medium italic text-sm">Monitora fatture, pagamenti e promemoria rimborsi.</p>
        </div>
        <div className="flex gap-3">
          <div className="hidden lg:flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-2xl text-sm shadow-sm">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="outline-none bg-transparent font-bold text-xs"
              />
            </div>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="outline-none bg-transparent font-bold text-xs"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="ml-2 p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                title="Resetta date"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={exportToPDF}
            disabled={isExporting}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px] disabled:opacity-50"
          >
            <Download size={18} />
            {isExporting ? '...' : 'PDF'}
          </button>
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
          >
            <Tag size={18} />
            Categorie
          </button>
          <button
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-full font-bold uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-95 text-[10px]"
          >
            <Plus size={18} />
            Nuova Spesa
          </button>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expenses by Category */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <PieChart size={16} className="text-blue-500" /> Spese per Categoria
            </h3>
          </div>
          <div className="space-y-4">
            {categoryStats.slice(0, 4).map((cat) => (
              <button 
                key={cat.name} 
                className="w-full text-left space-y-1 group"
                onClick={() => setFilterCategory(cat.name)}
              >
                <div className="flex justify-between text-[10px] font-black uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                  <span className="text-slate-600 truncate group-hover:text-blue-600">{cat.name}</span>
                  <span className="text-slate-900 font-black">€{cat.amount.toLocaleString('it-IT')}</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                    style={{ width: `${(cat.amount / Math.max(...categoryStats.map(s => s.amount))) * 100}%` }}
                  />
                </div>
              </button>
            ))}
            {categoryStats.length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">Nessun dato disponibile</p>}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Clock size={16} className="text-amber-500" /> Scadenze a breve
          </h3>
          <div className="space-y-3">
            {upcomingDeadlines.slice(0, 3).map((exp) => (
              <button
                key={exp.id}
                onClick={() => {
                  setSearchTerm(exp.name);
                }}
                className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-amber-200 transition-all text-left"
              >
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{exp.name}</p>
                  <p className="text-[10px] text-amber-600 font-bold uppercase">
                    Scade il {format(new Date(exp.deadline), 'dd/MM/yyyy')}
                  </p>
                </div>
                <p className="text-xs font-black text-slate-900">€{exp.amount.toLocaleString('it-IT')}</p>
              </button>
            ))}
            {upcomingDeadlines.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle2 size={32} className="text-blue-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400 italic">Nessuna scadenza imminente</p>
              </div>
            )}
          </div>
        </div>

        {/* Quarterly Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" /> Trend Spese {currentYear}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {quarterlyExpenses.map((amount, i) => (
              <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Q{i + 1} (Trimestre)</p>
                <p className="text-lg font-black text-slate-900">€{amount.toLocaleString('it-IT')}</p>
                <div className="mt-2 h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full" 
                    style={{ width: `${(amount / Math.max(...quarterlyExpenses, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[300px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Cerca per nome, categoria o utilizzo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
            <Tag size={16} className="text-slate-400" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 appearance-none pr-4 cursor-pointer"
            >
              <option value="All">Tutte le Categorie</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
            <Calendar size={16} className="text-slate-400" />
            <select
              value={filterDeadline}
              onChange={(e) => setFilterDeadline(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 appearance-none pr-4 cursor-pointer"
            >
              <option value="All">Tutte le Scadenze</option>
              <option value="Scadute">Scadute</option>
              <option value="In Scadenza">In Scadenza (7gg)</option>
            </select>
          </div>

          {(filterCategory !== 'All' || filterDeadline !== 'All' || searchTerm !== '') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterCategory('All');
                setFilterDeadline('All');
              }}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title="Resetta filtri"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="lg:bg-white lg:rounded-3xl lg:border lg:border-slate-200 lg:shadow-sm lg:overflow-hidden overflow-x-auto">
        <table className="hidden lg:table w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Pagato</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Voce</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Categoria / Data</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Utilizzo</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Rimborso</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider text-right">Importo</th>
              <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredExpenses.map((expense) => (
              <tr key={expense.id} className={`hover:bg-slate-50 transition-colors group ${expense.paid ? 'opacity-60' : ''}`}>
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={expense.paid || false}
                    onChange={() => togglePaid(expense)}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${expense.paid ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600'} rounded-xl flex items-center justify-center shrink-0 border ${expense.paid ? 'border-slate-200' : 'border-blue-100'}`}>
                      {expense.paid ? <CheckCircle2 size={20} /> : <Euro size={20} />}
                    </div>
                    <div>
                      <p className={`text-sm font-bold text-slate-900 line-clamp-1 ${expense.paid ? 'line-through text-slate-400' : ''}`}>{expense.name}</p>
                      {expense.deadline && !expense.paid && (
                        <p className={`text-[10px] font-bold uppercase ${new Date(expense.deadline) < startOfDay(new Date()) ? 'text-red-600' : 'text-amber-600'}`}>
                          Scadenza: {format(new Date(expense.deadline), 'dd/MM/yy')}
                        </p>
                      )}
                      {expense.paid && (
                        <p className="text-[10px] font-bold uppercase text-blue-600">Saldato</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase border border-slate-200 w-fit mb-1">
                      {expense.category || 'Generale'}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {format(new Date(expense.date), 'dd/MM/yyyy')}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-xs text-slate-500 italic line-clamp-1">{expense.usage || '-'}</p>
                </td>
                <td className="px-6 py-4">
                  {expense.reimbursableTo ? (
                    <div className="flex items-center gap-2">
                       <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-sm">
                         <Users size={14} />
                       </div>
                       <div>
                         <p className="text-[10px] font-black uppercase text-slate-400 leading-none">Rimborsare a:</p>
                         <p className="text-xs font-bold text-slate-700">{expense.reimbursableTo}</p>
                       </div>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-300 font-bold uppercase">Cassa Parrocchia</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="text-sm font-black text-slate-900">€{expense.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {expense.invoiceUrl && (
                      <a
                        href={expense.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100 shadow-sm hover:scale-110"
                        title="Vedi Fattura"
                      >
                        <Download size={16} />
                      </a>
                    )}
                    <button
                      onClick={() => handleEdit(expense)}
                      className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-all border border-blue-100 shadow-sm hover:scale-110"
                      title="Modifica"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setExpenseToDelete(expense.id)}
                      className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-all border border-red-100 shadow-sm hover:scale-110"
                      title="Elimina"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredExpenses.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-20 text-center text-slate-500 italic text-sm">
                  Nessun spesa registrata o corrispondente ai criteri di ricerca.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Mobile View */}
        <div className="lg:hidden space-y-4">
          {filteredExpenses.map((expense) => (
            <div key={expense.id} className={`bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm space-y-4 transition-opacity ${expense.paid ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={expense.paid || false}
                    onChange={() => togglePaid(expense)}
                    className="w-6 h-6 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                  />
                  <div>
                    <h3 className={`font-black text-slate-900 uppercase text-xs italic ${expense.paid ? 'line-through text-slate-400' : ''}`}>
                      {expense.name}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {expense.category || 'Spesa'}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-black text-slate-900 italic">€{expense.amount.toLocaleString('it-IT')}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-50">
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data</p>
                  <p className="text-[10px] font-bold text-slate-900">{format(new Date(expense.date), 'dd/MM/yyyy')}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Scadenza</p>
                  <p className={`text-[10px] font-bold uppercase ${!expense.paid && expense.deadline && new Date(expense.deadline) < startOfDay(new Date()) ? 'text-red-600' : 'text-slate-900'}`}>
                    {expense.deadline ? format(new Date(expense.deadline), 'dd/MM/yy') : '-'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Users size={14} className="text-slate-300 shrink-0" />
                  <p className="text-[10px] font-bold text-slate-500 truncate italic">
                    {expense.reimbursableTo ? `Rimborso: ${expense.reimbursableTo}` : 'Cassa Parrocchia'}
                  </p>
                </div>
                <div className="flex gap-2">
                   {expense.invoiceUrl && (
                    <a href={expense.invoiceUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-50 text-blue-600 rounded-full border border-blue-100">
                      <Download size={14} />
                    </a>
                  )}
                  <button onClick={() => handleEdit(expense)} className="p-2 bg-blue-50 text-blue-600 rounded-full border border-blue-100">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setExpenseToDelete(expense.id)} className="p-2 bg-red-50 text-red-600 rounded-full border border-red-100">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredExpenses.length === 0 && (
            <div className="text-center py-10 bg-white rounded-[2rem] border border-dashed border-slate-200">
               <p className="text-xs text-slate-400 italic">Nessun spesa trovata.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[3rem] w-full max-w-7xl max-h-[95vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-6 md:p-10 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3 uppercase italic">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                    <Euro size={24} />
                  </div>
                  {editingId ? 'Modifica Spesa' : 'Nuova Spesa'}
                </h2>
                <p className="hidden md:block text-slate-500 font-semibold mt-1 italic">Inserisci tutte le informazioni relative al costo e all'eventuale rimborso.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 md:space-y-12 custom-scrollbar bg-slate-50/30">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
                {/* Left Column: Basic Info */}
                <div className="space-y-6 md:space-y-8 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-50 pb-6 mb-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                      <FileText size={20} />
                    </div>
                    <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest">Dettagli Operazione</h3>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Descrizione voce di spesa</label>
                    <input
                      required
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="es. Fattura Manutenzione Caldaia"
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold placeholder:text-slate-300 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Categoria voce</label>
                      <select
                        required
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold appearance-none text-sm"
                      >
                        <option value="">Seleziona...</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Prezzo Totale (€)</label>
                      <div className="relative">
                        <Euro className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          required
                          type="number"
                          step="0.01"
                          value={form.amount}
                          onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-black text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Data Documento</label>
                      <input
                        required
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Scadenza Fattura</label>
                      <input
                        type="date"
                        value={form.deadline}
                        onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Destinazione / Utilizzo</label>
                    <input
                      type="text"
                      value={form.usage}
                      onChange={(e) => setForm({ ...form, usage: e.target.value })}
                      placeholder="es. Ripristino riscaldamento sala catechesi"
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold placeholder:text-slate-300 text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-4 p-4 md:p-6 bg-slate-50 rounded-2xl border-2 border-transparent transition-all">
                    <input
                      type="checkbox"
                      id="paid-checkbox"
                      checked={form.paid}
                      onChange={(e) => setForm({ ...form, paid: e.target.checked })}
                      className="w-6 h-6 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                    />
                    <label htmlFor="paid-checkbox" className="flex-1 cursor-pointer">
                      <p className="text-[10px] md:text-sm font-black text-slate-900 uppercase tracking-tighter">Pagamento Avvenuto</p>
                      <p className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase italic">Segna questa spesa come già saldata</p>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Allega Fattura (PDF)</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="invoice-upload"
                      />
                      <label
                        htmlFor="invoice-upload"
                        className={`w-full flex items-center justify-between px-6 py-4 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                          form.invoiceUrl ? 'bg-blue-50 border-blue-500/30 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-blue-500/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <FileUp size={20} />
                          <span className="font-bold text-sm italic">{form.invoiceUrl ? 'PDF caricato' : 'Carica PDF'}</span>
                        </div>
                        {form.invoiceUrl && <CheckCircle2 size={18} className="text-blue-500" />}
                      </label>
                    </div>
                  </div>
                </div>

                {/* Right Column: Reimbursement & Notes */}
                <div className="space-y-8 bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
                  <div>
                    <div className="flex items-center gap-3 border-b border-slate-50 pb-6 mb-8">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                        <Users size={20} />
                      </div>
                      <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest">Rimborso</h3>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Da Rimborsare a (Persona/Ditta)</label>
                        <div className="relative">
                          <Users className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                          <input
                            type="text"
                            value={form.reimbursableTo}
                            onChange={(e) => setForm({ ...form, reimbursableTo: e.target.value })}
                            placeholder="es. Mario Rossi"
                            className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold placeholder:text-slate-300 text-sm"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 ml-4 italic font-medium">Inserisci chi ha anticipato la somma.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 mt-8 flex-1 flex flex-col">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Note aggiuntive / Promemoria</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full flex-1 px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold placeholder:text-slate-300 resize-none shadow-inner min-h-[150px] text-sm"
                      placeholder="Annotazioni utili per la contabilità..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-white border border-slate-200 text-slate-600 px-6 py-4 md:py-5 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px] flex-1"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-6 py-4 md:py-5 rounded-full font-bold uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-xl active:scale-95 text-[10px] flex-1"
                >
                  Salva Movimento Cassa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Categories Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
                  <Tag size={20} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Categorie Spese</h2>
              </div>
              <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 bg-slate-50 space-y-6">
              <form onSubmit={addCategory} className="flex gap-2">
                <input
                  required
                  type="text"
                  placeholder="Nuova categoria..."
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-xl bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold"
                />
                <button
                  type="submit"
                  className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all shadow-md active:scale-95"
                >
                  <Plus size={20} />
                </button>
              </form>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {categories.map(c => (
                  <div key={c.id} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between group transition-all hover:border-blue-200">
                    <span className="text-sm font-bold text-slate-700 uppercase tracking-tight">{c.name}</span>
                    <button
                      onClick={() => deleteCategory(c.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-6 bg-white border-t border-slate-100 shrink-0">
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="bg-white border border-slate-200 text-slate-600 px-10 py-4 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px] w-full"
              >
                Fatto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center font-bold">
                <Trash2 size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">Elimina Spesa</h3>
                <p className="text-sm text-slate-500">Sei sicuro di voler eliminare questa spesa? L'operazione è definitiva.</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setExpenseToDelete(null)}
                className="flex-1 bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-full font-bold uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[10px]"
              >
                Annulla
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 text-white px-6 py-3 rounded-full font-bold uppercase italic tracking-wider hover:bg-red-700 transition-all shadow-md active:scale-95 text-[10px]"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Spese;
