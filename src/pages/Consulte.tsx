import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, addDoc, query, orderBy, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { Plus, Trash2, Calendar, MapPin, Search, Pencil, FileText, ClipboardList, Download, X, Bold, Italic, List, Save, Users, Check, Maximize2, Minimize2, AlignCenter, AlignLeft, Type, AlignJustify, AlignRight } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import jsPDF from 'jspdf';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const Consulte: React.FC = () => {
  const { currentParish } = useParish();
  const councilsColl = useParishCollection('councils');
  const volunteersColl = useParishCollection('volunteers');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [councils, setCouncils] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [parishInfo, setParishInfo] = useState<any>({
    name: 'Parrocchia S. Maria Assunta',
    address: 'Via della Chiesa, 1 - 00100 Roma (RM)',
  });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [councilToDelete, setCouncilToDelete] = useState<string | null>(null);
  const [selectedCouncil, setSelectedCouncil] = useState<any>(null);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentYear = new Date().getFullYear();
  const currentSeason = `${currentYear}/${(currentYear + 1).toString().slice(-2)}`;
  
  const initialFormState = {
    number: '',
    year: currentSeason,
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    agenda: '',
    location: '',
    fullMinutes: '',
  };

  const [form, setForm] = useState(initialFormState);

  const parishInfoRef = useRef(parishInfo);
  useEffect(() => {
    parishInfoRef.current = parishInfo;
  }, [parishInfo]);

  // Quill Modules configuration
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['clean']
    ],
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list',
    'align'
  ];

  useEffect(() => {
    const q = query(councilsColl, orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setCouncils(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'councils');
    });

    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    });

    const unsubVolunteers = onSnapshot(query(volunteersColl, orderBy('lastName', 'asc')), (snap) => {
      const volCouncil = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(v => v.isCouncilMember === true)
        .map(v => ({ 
          id: v.id, 
          firstName: v.firstName, 
          lastName: v.lastName, 
          group: v.councilGroup || ((v.groups && v.groups.length > 0) ? v.groups.join(', ') : (v.group || 'Volontario')),
          source: 'volunteer' 
        }));
      setMembers(volCouncil);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'volunteers');
    });

    return () => {
      unsub();
      unsubParish();
      unsubVolunteers();
    };
  }, []);

  // Remove the merge effect as it's no longer needed

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        number: parseInt(form.number),
        year: form.year,
        date: form.date,
        agenda: form.agenda,
        location: form.location,
        fullMinutes: form.fullMinutes,
        createdAt: isEditing ? (councils.find(c => c.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      };

      if (isEditing && editingId) {
        await updateDoc(doc(councilsColl, editingId), data);
      } else {
        await addDoc(councilsColl, data);
      }

      setIsModalOpen(false);
      setForm(initialFormState);
      setIsEditing(false);
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, isEditing ? OperationType.UPDATE : OperationType.CREATE, 'councils');
    }
  };

  const handleDelete = async () => {
    if (!councilToDelete) return;
    try {
      await deleteDoc(doc(councilsColl, councilToDelete));
      setCouncilToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'councils');
    }
  };

  const handleEdit = (council: any) => {
    setForm({
      number: council.number.toString(),
      year: council.year.toString(),
      date: council.date,
      agenda: council.agenda,
      location: council.location,
      fullMinutes: council.fullMinutes || '',
    });
    setEditingId(council.id);
    setIsEditing(true);
    setIsModalOpen(true);
    setIsFullScreen(false);
  };

  const handleOpenAttendance = (council: any) => {
    setSelectedCouncil(council);
    setAttendance(council.attendance || {});
    setIsAttendanceModalOpen(true);
  };

  const handleSaveAttendance = async () => {
    if (!selectedCouncil) return;
    try {
      await updateDoc(doc(councilsColl, selectedCouncil.id), {
        attendance: attendance
      });
      setIsAttendanceModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'councils');
    }
  };

  const toggleAttendance = (memberId: string) => {
    setAttendance(prev => ({
      ...prev,
      [memberId]: !prev[memberId]
    }));
  };

  const generatePDF = (council: any) => {
    const doc = new jsPDF();
    const blueColor = [37, 99, 235]; // blue-600 pattern
    
    // Header (Matched with Events.tsx)
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

    // Season Box top right
    doc.setFillColor(blueColor[0], blueColor[1], blueColor[2]);
    doc.roundedRect(155, 5, 45, 15, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('CONSULTA', 177.5, 11, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`N. ${council.number} - ${council.year}`, 177.5, 16, { align: 'center' });

    // Decorative line
    doc.setDrawColor(blueColor[0], blueColor[1], blueColor[2]);
    doc.setLineWidth(0.5);
    doc.line(0, 25, 210, 25);
    
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(blueColor[0], blueColor[1], blueColor[2]);
    doc.text('VERBALE CONSULTA PARROCCHIALE', 105, 40, { align: 'center' });
    
    // Subinfo
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Data: ${format(new Date(council.date), 'dd/MM/yyyy HH:mm', { locale: it })} - Luogo: ${council.location || 'Non specificato'}`, 105, 48, { align: 'center' });
    
    // Content
    doc.setTextColor(51, 65, 85);
    
    // Agenda section
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('ORDINE DEL GIORNO:', 20, 60);
    
    doc.setFont('helvetica', 'normal');
    const splitAgenda = doc.splitTextToSize(council.agenda, 170);
    doc.text(splitAgenda, 20, 66);
    
    // Attendance Table BEFORE Minutes
    let currentY = 66 + (splitAgenda.length * 5) + 10;
    const pageHeight = 280;

    doc.setFont('helvetica', 'bold');
    doc.text('ELENCO PRESENZE:', 20, currentY);
    currentY += 8;

    doc.setFontSize(9);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, currentY, 170, 7, 'F');
    doc.text('PARTECIPANTE', 25, currentY + 5);
    doc.text('GRUPPO', 90, currentY + 5);
    doc.text('STATO', 160, currentY + 5);
    currentY += 7;

    doc.setFont('helvetica', 'normal');
    const councilAttendance = council.attendance || {};
    
    // Group members for PDF as well
    const sortedMembers = [...members].sort((a, b) => {
      const groupA = (a.group || 'Altro').toLowerCase();
      const groupB = (b.group || 'Altro').toLowerCase();
      if (groupA !== groupB) return groupA.localeCompare(groupB);
      return a.lastName.localeCompare(b.lastName);
    });

    sortedMembers.forEach((member) => {
      if (currentY > pageHeight - 20) {
        doc.addPage();
        currentY = 20;
      }
      const isPresent = councilAttendance[member.id];
      doc.text(`${member.lastName} ${member.firstName}`, 25, currentY + 5);
      doc.text(member.group || '-', 90, currentY + 5);
      doc.text(isPresent ? 'PRESENTE' : 'ASSENTE', 160, currentY + 5);
      
      doc.line(20, currentY + 7, 190, currentY + 7);
      currentY += 7;
    });

    // Minutes section after attendance
    currentY += 10;
    if (currentY > pageHeight - 30) {
      doc.addPage();
      currentY = 20;
    }
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('VERBALE E DECISIONI:', 20, currentY);
    
    currentY += 8;

    // Enhanced HTML Parser for PDF (rendering ReactQuill output)
    const renderHTMLToPDF = (html: string) => {
      const parser = new DOMParser();
      const docHtml = parser.parseFromString(html, 'text/html');
      const body = docHtml.body;

      let currentX = 20;

      const walk = (node: Node, styles: any) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          if (!text.trim() && text.length === 0) return;
          
          doc.setFontSize(styles.fontSize || 10);
          doc.setFont('helvetica', styles.fontStyle || 'normal');
          
          const align = styles.align || 'left';
          
          // Special case: if we are at the start of a block, reset X and potentially move Y
          if (styles.isBlockStart) {
            currentY += (styles.fontSize * 0.5) + 2;
            currentX = align === 'center' ? 105 : (align === 'right' ? 190 : 20);
            styles.isBlockStart = false;
          }

          const maxWidth = 170;
          const splitLines = doc.splitTextToSize(text, maxWidth);
          
          splitLines.forEach((line: string, index: number) => {
            if (currentY > pageHeight - 20) {
              doc.addPage();
              currentY = 20;
            }
            
            doc.text(line, currentX, currentY, { align: align });
            
            if (index < splitLines.length - 1) {
              currentY += (styles.fontSize * 0.5) + 3;
              currentX = align === 'center' ? 105 : (align === 'right' ? 190 : 20);
            } else {
              // For the last line, update X for potential inline brothers
              if (align === 'left') {
                currentX += doc.getTextWidth(line) + 1;
              }
            }
          });
          return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const newStyles = { ...styles };
          let isBlock = false;

          // Alignment
          if (el.classList.contains('ql-align-center')) newStyles.align = 'center';
          else if (el.classList.contains('ql-align-right')) newStyles.align = 'right';
          else if (el.classList.contains('ql-align-justify')) newStyles.align = 'justify';

          switch (el.tagName.toLowerCase()) {
            case 'h1':
              newStyles.fontSize = 16;
              newStyles.fontStyle = 'bold';
              isBlock = true;
              break;
            case 'h2':
              newStyles.fontSize = 14;
              newStyles.fontStyle = 'bold';
              isBlock = true;
              break;
            case 'h3':
              newStyles.fontSize = 12;
              newStyles.fontStyle = 'bold';
              isBlock = true;
              break;
            case 'strong':
            case 'b':
              newStyles.fontStyle = (newStyles.fontStyle === 'italic') ? 'bolditalic' : 'bold';
              break;
            case 'em':
            case 'i':
              newStyles.fontStyle = (newStyles.fontStyle === 'bold') ? 'bolditalic' : 'italic';
              break;
            case 'p':
            case 'div':
              isBlock = true;
              newStyles.fontSize = 10;
              break;
            case 'li':
              isBlock = true;
              currentY += 2;
              doc.setFontSize(10);
              doc.setFont('helvetica', 'normal');
              doc.text('•', 15, currentY + 5);
              currentX = 20;
              break;
            case 'br':
              currentY += 5;
              currentX = 20;
              break;
          }

          if (isBlock) {
            newStyles.isBlockStart = true;
          }

          el.childNodes.forEach(child => walk(child, newStyles));
          
          if (isBlock) {
            currentY += 2;
            currentX = 20;
          }
        }
      };

      walk(body, { fontSize: 10, fontStyle: 'normal', align: 'left', isBlockStart: false });
    };

    renderHTMLToPDF(council.fullMinutes || '<p>Nessun verbale inserito.</p>');
    
    return doc;
  };

  const handleDownloadPDF = (council: any) => {
    const doc = generatePDF(council);
    doc.save(`Verbale_Consulta_${council.number}_${council.year}.pdf`);
  };

  const handlePreviewPDF = (council: any) => {
    const doc = generatePDF(council);
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    setPreviewPdfUrl(pdfUrl);
    setSelectedCouncil(council);
    setIsPreviewModalOpen(true);
  };

  const filteredCouncils = councils.filter(c => 
    c.agenda.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.number.toString().includes(searchTerm) ||
    c.year.toString().includes(searchTerm)
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Consulte</h1>
          <p className="text-slate-500 font-medium">Gestione dei verbali e dell'ordine del giorno</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setForm(initialFormState);
              setIsEditing(false);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all text-sm uppercase tracking-wider"
          >
            <Plus size={20} />
            Nuova Consulta
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Cerca per numero, anno o contenuto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-white border border-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredCouncils.length > 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider text-center w-24">N.</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Stagione</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Data e Ora</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Luogo</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider">Ordine del Giorno</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 tracking-wider text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCouncils.map((council) => (
                <tr key={council.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-700 font-black text-sm">
                      {council.number}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-slate-700">{council.year}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">
                        {format(new Date(council.date), 'dd/MM/yyyy', { locale: it })}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {format(new Date(council.date), 'HH:mm', { locale: it })}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MapPin size={14} className="text-slate-400" />
                      <span className="truncate max-w-[150px]">{council.location || 'Non specificato'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-slate-500 line-clamp-1 italic max-w-xs">
                      {council.agenda}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleDownloadPDF(council)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                        title="Scarica PDF"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        onClick={() => handleEdit(council)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                        title="Modifica / Documento"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setCouncilToDelete(council.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors shadow-sm bg-white border border-slate-100"
                        title="Elimina"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="text-slate-300" size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Nessun verbale trovato</h3>
          <p className="text-slate-500 max-w-xs mx-auto">Non sono ancora stati registrati verbali per le consulte parrocchiali.</p>
        </div>
      )}

      {/* Attendance Modal */}
      {isAttendanceModalOpen && selectedCouncil && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <Users size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Rilevazione Presenze</h2>
                  <p className="text-xs text-slate-500 font-medium">Consulta N. {selectedCouncil.number}/{selectedCouncil.year}</p>
                </div>
              </div>
              <button
                onClick={() => setIsAttendanceModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              <div className="space-y-8">
                {Object.entries(
                  members.reduce((acc: Record<string, any[]>, member) => {
                    const group = member.group || 'Altro';
                    if (!acc[group]) acc[group] = [];
                    acc[group].push(member);
                    return acc;
                  }, {})
                ).sort(([a], [b]) => a === 'Altro' ? 1 : b === 'Altro' ? -1 : a.localeCompare(b))
                .map(([group, groupMembers]) => (
                  <div key={group} className="space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                      <div className="h-px flex-1 bg-slate-200"></div>
                      {group}
                      <div className="h-px flex-1 bg-slate-200"></div>
                    </h3>
                    <div className="space-y-3">
                      {(groupMembers as any[]).sort((a, b) => a.lastName.localeCompare(b.lastName)).map(member => (
                        <button
                          key={member.id}
                          onClick={() => toggleAttendance(member.id)}
                          className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                            attendance[member.id] 
                              ? 'bg-blue-50 border-blue-200 shadow-sm' 
                              : 'bg-white border-slate-200 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                              attendance[member.id] ? 'bg-blue-600 text-white' : 'bg-slate-100'
                            }`}>
                              {attendance[member.id] && <Check size={14} />}
                            </div>
                            <div className="text-left">
                              <p className={`font-bold text-sm ${attendance[member.id] ? 'text-blue-900' : 'text-slate-900'}`}>
                                {member.lastName} {member.firstName}
                              </p>
                              <p className="text-[10px] uppercase font-bold text-slate-400">{member.group || 'Nessun gruppo'}</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-black tracking-widest uppercase ${
                            attendance[member.id] ? 'text-blue-600' : 'text-slate-300'
                          }`}>
                            {attendance[member.id] ? 'Presente' : 'Assente'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {members.length === 0 && (
                  <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-300">
                    <p className="text-slate-500 text-sm italic">Nessun partecipante configurato. <br/> Abilita i "membro della consulta {parishInfo.name}" dalla sezione Volontari.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-white flex justify-end shrink-0">
              <button
                onClick={handleSaveAttendance}
                className="w-full px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm uppercase tracking-wider"
              >
                Salva Presenze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`bg-white rounded-3xl w-full ${isFullScreen ? 'max-w-full h-full' : 'max-w-5xl max-h-[90vh]'} overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col`}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{isEditing ? 'Modifica Verbale' : 'Nuovo Verbale Consulta'}</h2>
                <p className="text-xs text-slate-500 font-medium">Inserisci i dettagli del verbale</p>
              </div>
              <div className="flex items-center gap-3">
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      const council = councils.find(c => c.id === editingId);
                      if (council) handleOpenAttendance(council);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-100 transition-colors"
                  >
                    <Users size={16} /> Presenze
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handlePreviewPDF(form)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-100 transition-colors"
                >
                  <FileText size={16} /> Documento
                </button>
                {isFullScreen && (
                  <button
                    type="button"
                    onClick={() => setIsFullScreen(false)}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900"
                  >
                    <Minimize2 size={24} />
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsFullScreen(false);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col min-h-0">
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 ${isFullScreen ? 'hidden' : ''}`}>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        Numero Consulta
                      </label>
                      <input
                        type="number"
                        required
                        value={form.number}
                        onChange={(e) => setForm({ ...form, number: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="es. 1"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        Stagione
                      </label>
                      <input
                        type="text"
                        required
                        value={form.year}
                        onChange={(e) => setForm({ ...form, year: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="es. 2024/25"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                       Data e Ora
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="datetime-local"
                        required
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      Luogo
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="es. Sala Consiliare, Oratorio..."
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 h-full flex flex-col">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    Ordine del Giorno
                  </label>
                  <textarea
                    required
                    value={form.agenda}
                    onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                    className="flex-1 w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none min-h-[150px]"
                    placeholder="Inserisci l'ordine del giorno..."
                  />
                </div>
              </div>

              {/* Sviluppo Verbale Section */}
              <div className={`flex-1 flex flex-col min-h-0 ${isFullScreen ? 'h-full' : 'mt-2'}`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={14} className="text-blue-500" />
                    Sviluppo Verbale della Seduta
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg font-bold text-[10px] uppercase tracking-wider hover:bg-slate-200 transition-colors"
                  >
                    {isFullScreen ? (
                      <><Minimize2 size={14} /> Riduci</>
                    ) : (
                      <><Maximize2 size={14} /> Schermo Intero</>
                    )}
                  </button>
                </div>

                <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <ReactQuill
                    theme="snow"
                    value={form.fullMinutes}
                    onChange={(content) => setForm({ ...form, fullMinutes: content })}
                    modules={modules}
                    formats={formats}
                    className={`flex-1 flex flex-col ${isFullScreen ? 'h-full' : 'min-h-[400px]'}`}
                    placeholder="Approfondimento del verbale e decisioni prese..."
                  />
                </div>
              </div>

              {!isFullScreen && (
                <div className="flex gap-4 pt-6 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all text-sm uppercase tracking-wider"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all text-sm uppercase tracking-wider"
                  >
                    {isEditing ? 'Salva Modifiche' : 'Crea Verbale'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {isPreviewModalOpen && previewPdfUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[95vh] overflow-hidden shadow-2xl flex flex-col scale-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <FileText size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Anteprima Documento</h2>
                  <p className="text-xs text-slate-500 font-medium">Verbale della Consulta</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDownloadPDF(selectedCouncil || form)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                >
                  <Download size={18} /> Scarica PDF
                </button>
                <button
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    setPreviewPdfUrl(null);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-800 p-4">
              <iframe
                src={previewPdfUrl}
                className="w-full h-full rounded-lg shadow-inner"
                title="Anteprima PDF"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Council Confirmation Modal */}
      {councilToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
                <Trash2 size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">Elimina Verbale</h3>
                <p className="text-sm text-slate-500">Sei sicuro di voler eliminare questo verbale? L'operazione è definitiva.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCouncilToDelete(null)}
                className="flex-1 px-4 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200"
              >
                Annulla
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors shadow-md shadow-red-100"
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

export default Consulte;
