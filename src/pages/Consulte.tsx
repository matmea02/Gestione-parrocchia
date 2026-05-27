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
      const volDocs = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(v => v.isCouncilMember === true);

      const volCouncil: any[] = [];
      volDocs.forEach(v => {
        const reprGroups: string[] = v.councilGroups && v.councilGroups.length > 0 
          ? v.councilGroups 
          : [v.councilGroup || ((v.groups && v.groups.length > 0) ? v.groups[0] : (v.group || 'Volontario'))];

        reprGroups.forEach((g: string) => {
          volCouncil.push({
            id: `${v.id}_${g}`,
            volunteerId: v.id,
            firstName: v.firstName,
            lastName: v.lastName,
            group: g,
            source: 'volunteer'
          });
        });
      });

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
    const apiAttendance = council.attendance || {};
    const preparedAttendance: Record<string, boolean> = {};
    members.forEach(m => {
      if (apiAttendance[m.id] !== undefined) {
        preparedAttendance[m.id] = apiAttendance[m.id];
      } else if (m.volunteerId && apiAttendance[m.volunteerId] !== undefined) {
        preparedAttendance[m.id] = apiAttendance[m.volunteerId];
      } else {
        preparedAttendance[m.id] = false;
      }
    });
    setAttendance(preparedAttendance);
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
      const isPresent = councilAttendance[member.id] !== undefined 
        ? councilAttendance[member.id] 
        : (member.volunteerId && councilAttendance[member.volunteerId] !== undefined ? councilAttendance[member.volunteerId] : false);
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

      interface TextSegment {
        text: string;
        fontSize: number;
        fontStyle: string;
      }

      interface Token {
        text: string;
        fontSize: number;
        fontStyle: string;
      }

      const collectSegments = (node: Node, parentStyles: { fontSize: number; fontStyle: string }): TextSegment[] => {
        let segments: TextSegment[] = [];
        
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          if (text.length > 0) {
            segments.push({
              text,
              fontSize: parentStyles.fontSize,
              fontStyle: parentStyles.fontStyle
            });
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const currentStyles = { ...parentStyles };
          
          const tag = el.tagName.toLowerCase();
          if (tag === 'strong' || tag === 'b') {
            currentStyles.fontStyle = currentStyles.fontStyle.includes('italic') ? 'bolditalic' : 'bold';
          } else if (tag === 'em' || tag === 'i') {
            currentStyles.fontStyle = currentStyles.fontStyle.includes('bold') ? 'bolditalic' : 'italic';
          }
          
          el.childNodes.forEach(child => {
            segments = segments.concat(collectSegments(child, currentStyles));
          });
        }
        
        return segments;
      };

      const wrapTokens = (tokens: Token[], maxWidth: number): Token[][] => {
        const resultLines: Token[][] = [];
        let currentLine: Token[] = [];
        let currentLineWidth = 0;
        
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];
          
          doc.setFontSize(token.fontSize);
          doc.setFont('helvetica', token.fontStyle);
          const tokenWidth = doc.getTextWidth(token.text);
          
          const isWhitespace = /^\s+$/.test(token.text);
          if (isWhitespace && currentLine.length === 0) {
            continue;
          }
          
          if (currentLineWidth + tokenWidth <= maxWidth) {
            currentLine.push(token);
            currentLineWidth += tokenWidth;
          } else {
            if (isWhitespace) {
              if (currentLine.length > 0) {
                resultLines.push(currentLine);
                currentLine = [];
                currentLineWidth = 0;
              }
            } else {
              if (currentLine.length > 0) {
                resultLines.push(currentLine);
                currentLine = [token];
                currentLineWidth = tokenWidth;
              } else {
                currentLine.push(token);
                resultLines.push(currentLine);
                currentLine = [];
                currentLineWidth = 0;
              }
            }
          }
        }
        
        if (currentLine.length > 0) {
          resultLines.push(currentLine);
        }
        
        return resultLines;
      };

      interface BlockItem {
        node: Node;
        isListItem: boolean;
        baseStyles: { fontSize: number; fontStyle: string };
        align: string;
      }

      const blocks: BlockItem[] = [];

      const processNodeForBlocks = (node: Node, parentAlign: string) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tag = el.tagName.toLowerCase();
          
          let currentAlign = parentAlign;
          if (el.classList.contains('ql-align-center')) currentAlign = 'center';
          else if (el.classList.contains('ql-align-right')) currentAlign = 'right';
          else if (el.classList.contains('ql-align-justify')) currentAlign = 'justify';

          if (tag === 'p' || tag === 'div' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'li' || tag === 'blockquote') {
            let fontSize = 10;
            let fontStyle = 'normal';
            if (tag === 'h1') { fontSize = 16; fontStyle = 'bold'; }
            else if (tag === 'h2') { fontSize = 14; fontStyle = 'bold'; }
            else if (tag === 'h3') { fontSize = 12; fontStyle = 'bold'; }
            
            blocks.push({
              node: el,
              isListItem: tag === 'li',
              baseStyles: { fontSize, fontStyle },
              align: currentAlign
            });
          } else if (tag === 'ul' || tag === 'ol') {
            el.childNodes.forEach(child => processNodeForBlocks(child, currentAlign));
          } else if (tag === 'br') {
            blocks.push({
              node: el,
              isListItem: false,
              baseStyles: { fontSize: 10, fontStyle: 'normal' },
              align: currentAlign
            });
          } else {
            const hasDirectText = Array.from(el.childNodes).some(c => c.nodeType === Node.TEXT_NODE && c.textContent?.trim());
            if (hasDirectText) {
              blocks.push({
                node: el,
                isListItem: false,
                baseStyles: { fontSize: 10, fontStyle: 'normal' },
                align: currentAlign
              });
            } else {
              el.childNodes.forEach(child => processNodeForBlocks(child, currentAlign));
            }
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          if (text.trim().length > 0) {
            blocks.push({
              node,
              isListItem: false,
              baseStyles: { fontSize: 10, fontStyle: 'normal' },
              align: parentAlign
            });
          }
        }
      };

      body.childNodes.forEach(child => processNodeForBlocks(child, 'left'));

      blocks.forEach(block => {
        if (block.node.nodeName.toLowerCase() === 'br') {
          currentY += 5;
          return;
        }

        const segments = collectSegments(block.node, block.baseStyles);
        if (segments.length === 0) {
          currentY += 4;
          return;
        }

        const tokens: Token[] = [];
        segments.forEach(seg => {
          const parts = seg.text.split(/(\s+)/);
          parts.forEach(part => {
            if (part) {
              tokens.push({
                text: part,
                fontSize: seg.fontSize,
                fontStyle: seg.fontStyle
              });
            }
          });
        });

        if (tokens.length === 0) {
          currentY += 4;
          return;
        }

        const wrappedLines = wrapTokens(tokens, 170);

        if (block.isListItem) {
          currentY += 1.5;
        } else {
          currentY += 3;
        }

        wrappedLines.forEach((line, idx) => {
          const maxFS = Math.max(...line.map(t => t.fontSize), 10);
          const lineHeight = maxFS * 0.3527 * 1.35;

          if (currentY + lineHeight > pageHeight - 15) {
            doc.addPage();
            currentY = 20;
          }

          if (block.isListItem && idx === 0) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(51, 65, 85);
            doc.text('•', 15, currentY + (10 * 0.3527 * 1.0));
          }

          let totalW = 0;
          line.forEach(t => {
            doc.setFontSize(t.fontSize);
            doc.setFont('helvetica', t.fontStyle);
            totalW += doc.getTextWidth(t.text);
          });

          let startX = 20;
          if (block.align === 'center') {
            startX = 105 - (totalW / 2);
          } else if (block.align === 'right') {
            startX = 190 - totalW;
          }

          let drawX = startX;
          line.forEach(t => {
            doc.setFontSize(t.fontSize);
            doc.setFont('helvetica', t.fontStyle);
            doc.setTextColor(51, 65, 85);
            doc.text(t.text, drawX, currentY + (maxFS * 0.3527 * 1.0));
            drawX += doc.getTextWidth(t.text);
          });

          currentY += lineHeight;
        });
      });
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
  );  return (
    <div className="space-y-6 md:space-y-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight italic uppercase">Verbali e Consulte</h1>
          <p className="text-slate-500 font-medium text-xs md:text-sm">Gestisci l'agenda e archivia i verbali delle consulte parrocchiali.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              setForm(initialFormState);
              setIsEditing(false);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-4 rounded-full font-black uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 text-[10px]"
          >
            <Plus size={18} />
            Nuova Consulta
          </button>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-3xl md:rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Cerca per numero, anno o contenuto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-slate-50 border border-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filteredCouncils.length > 0 ? (
            <>
              <table className="hidden lg:table w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center w-24">N.</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Stagione</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Data e Ora</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Luogo</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCouncils.map((council) => (
                    <tr key={council.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-8 py-6 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 text-blue-700 font-black text-sm border border-blue-100 shadow-sm">
                          {council.number}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className="text-[11px] font-black uppercase text-slate-500 tracking-widest">{council.year}</span>
                      </td>
                      <td className="px-8 py-6">
                        <div>
                          <p className="text-sm font-black text-slate-900 uppercase italic leading-none mb-1">
                            {format(new Date(council.date), 'dd MMMM yyyy', { locale: it })}
                          </p>
                          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                            {format(new Date(council.date), 'HH:mm', { locale: it })}
                          </p>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 italic">
                          <MapPin size={14} className="text-slate-300 shrink-0" />
                          <span className="truncate max-w-[200px]">{council.location || 'Non specificato'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDownloadPDF(council)}
                            className="p-3 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-2xl transition-all border border-slate-100 hover:border-blue-100 hover:scale-105 active:scale-95"
                            title="Scarica PDF"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={() => handleEdit(council)}
                            className="p-3 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-2xl transition-all border border-slate-100 hover:border-blue-100 hover:scale-105 active:scale-95"
                            title="Modifica / Documento"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setCouncilToDelete(council.id)}
                            className="p-3 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-2xl transition-all border border-slate-100 hover:border-red-100 hover:scale-105 active:scale-95"
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

              {/* Mobile Card View */}
              <div className="lg:hidden p-4 space-y-4 bg-slate-50/50">
                {filteredCouncils.map((council) => (
                  <div key={council.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 font-black text-base border border-blue-100 shadow-sm">
                          {council.number}
                        </span>
                        <div>
                          <h3 className="font-black text-slate-900 italic uppercase text-xs">Stagione {council.year}</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verbale Consulta</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownloadPDF(council)}
                          className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => handleEdit(council)}
                          className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100"
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50 bg-slate-50/50 p-4 rounded-3xl">
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data</p>
                        <p className="text-[10px] font-bold text-slate-900">
                          {format(new Date(council.date), 'dd/MM/yyyy', { locale: it })}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ora</p>
                        <p className="text-[10px] font-bold text-slate-900">
                          {format(new Date(council.date), 'HH:mm', { locale: it })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold italic truncate flex-1">
                        <MapPin size={14} className="text-slate-400 shrink-0" />
                        <span className="truncate">{council.location || 'Non specificato'}</span>
                      </div>
                      <button
                        onClick={() => setCouncilToDelete(council.id)}
                        className="p-3 text-red-600 bg-red-50 hover:bg-red-50 rounded-2xl border border-red-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-24 bg-white px-6">
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <ClipboardList className="text-slate-300" size={40} strokeWidth={1} />
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase italic">Nessun verbale trovato</h3>
              <p className="text-slate-500 max-w-xs mx-auto text-sm font-medium mt-2">Non sono ancora stati registrati verbali per le consulte parrocchiali.</p>
            </div>
          )}
        </div>
      </div>

      {/* Attendance Modal */}
      {isAttendanceModalOpen && selectedCouncil && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-0 md:p-4 z-[200]">
          <div className="bg-white rounded-none md:rounded-[3.5rem] w-full h-full md:h-auto md:max-h-[85vh] md:max-w-4xl overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="p-6 md:p-10 border-b border-slate-50 flex items-center justify-between shrink-0 bg-white shadow-sm z-10">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-50 text-blue-600 rounded-2xl md:rounded-3xl flex items-center justify-center border border-blue-100">
                  <Users size={32} className="w-6 h-6 md:w-8 md:h-8" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic">Rilevazione Presenze</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 mt-1">Consulta N. {selectedCouncil.number}/{selectedCouncil.year} • {format(new Date(selectedCouncil.date), 'dd/MM/yyyy')}</p>
                </div>
              </div>
              <button
                onClick={() => setIsAttendanceModalOpen(false)}
                className="p-2.5 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900"
              >
                <X size={28} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-10 bg-slate-50/30 space-y-10 custom-scrollbar">
              {Object.entries(
                members.reduce((acc: Record<string, any[]>, member) => {
                  const group = member.group || 'Altro';
                  if (!acc[group]) acc[group] = [];
                  acc[group].push(member);
                  return acc;
                }, {})
              ).sort(([a], [b]) => a === 'Altro' ? 1 : b === 'Altro' ? -1 : a.localeCompare(b))
              .map(([group, groupMembers]) => (
                <div key={group} className="space-y-4">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-4 italic">
                    <div className="h-px flex-1 bg-slate-200"></div>
                    {group}
                    <div className="h-px flex-1 bg-slate-200"></div>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(groupMembers as any[]).sort((a, b) => a.lastName.localeCompare(b.lastName)).map(member => (
                      <button
                        key={member.id}
                        onClick={() => toggleAttendance(member.id)}
                        className={`w-full flex items-center justify-between p-5 rounded-3xl border transition-all ${
                          attendance[member.id] 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-500/20' 
                            : 'bg-white border-slate-100 hover:border-blue-200 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                            attendance[member.id] ? 'bg-white/20 text-white' : 'bg-slate-50 text-slate-400'
                          }`}>
                            <Users size={18} />
                          </div>
                          <div className="text-left leading-tight">
                            <p className="font-black text-sm uppercase italic">
                              {member.lastName} {member.firstName}
                            </p>
                          </div>
                        </div>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${
                          attendance[member.id] ? 'bg-white border-white text-blue-600' : 'border-slate-100 text-transparent bg-slate-50'
                        }`}>
                          {attendance[member.id] && <Check size={14} />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {members.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
                  <p className="text-slate-500 text-sm italic font-medium">Nessun partecipante configurato. <br/> Abilita i membri della consulta dalla sezione Volontari.</p>
                </div>
              )}
            </div>

            <div className="p-6 md:p-10 border-t border-slate-100 bg-white shrink-0 flex gap-4 uppercase italic">
              <button
                onClick={() => setIsAttendanceModalOpen(false)}
                className="flex-1 bg-white border border-slate-200 text-slate-600 py-5 rounded-full font-black text-[11px] tracking-widest hover:bg-slate-50 transition-all active:scale-95"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveAttendance}
                className="flex-[2] bg-blue-600 text-white py-5 rounded-full font-black text-[11px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95"
              >
                Salva Registro Presenze ({Object.values(attendance).filter(Boolean).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-0 md:p-4 z-[150]">
          <div className={`bg-white rounded-none md:rounded-[3.5rem] w-full ${isFullScreen ? 'h-full' : 'max-w-6xl h-full md:h-auto md:max-h-[90vh]'} overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300`}>
            <div className="p-6 md:p-10 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-50 text-blue-600 rounded-2xl md:rounded-3xl flex items-center justify-center border border-blue-100">
                  <FileText size={32} className="w-6 h-6 md:w-8 md:h-8" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic">
                    {isEditing ? 'Modifica Verbale' : 'Nuovo Verbale Consulta'}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 italic">Inserisci i dettagli e lo sviluppo della seduta</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      const council = councils.find(c => c.id === editingId);
                      if (council) handleOpenAttendance(council);
                    }}
                    className="hidden md:flex items-center gap-3 px-6 py-3 bg-blue-50 text-blue-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all"
                  >
                    <Users size={16} /> Presenze
                  </button>
                )}
                {!isFullScreen && (
                  <button
                    type="button"
                    onClick={() => setIsFullScreen(true)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-2xl transition-all"
                  >
                    <Maximize2 size={22} />
                  </button>
                )}
                {isFullScreen && (
                  <button
                    type="button"
                    onClick={() => setIsFullScreen(false)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-2xl transition-all"
                  >
                    <Minimize2 size={22} />
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsFullScreen(false);
                  }}
                  className="p-3 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-2xl transition-all"
                >
                  <X size={28} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 md:p-10 space-y-10 custom-scrollbar bg-slate-50/30">
              <div className={`grid grid-cols-1 lg:grid-cols-2 gap-10 ${isFullScreen ? 'hidden' : ''}`}>
                <div className="space-y-8 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-4 border-b border-slate-50 pb-6 mb-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                      <Calendar size={20} />
                    </div>
                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest italic">Riferimenti Seduta</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">N. Consulta</label>
                      <input
                        type="number"
                        required
                        value={form.number}
                        onChange={(e) => setForm({ ...form, number: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold text-sm"
                        placeholder="es. 1"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Stagione</label>
                      <input
                        type="text"
                        required
                        value={form.year}
                        onChange={(e) => setForm({ ...form, year: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold text-sm"
                        placeholder="es. 2024/25"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Data e Ora Inizio</label>
                    <div className="relative">
                      <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="datetime-local"
                        required
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Luogo della Riunione</label>
                    <div className="relative">
                      <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        required
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                        className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold text-sm"
                        placeholder="es. Sala Consiliare, Oratorio..."
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col">
                  <div className="flex items-center gap-4 border-b border-slate-50 pb-6 mb-6">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                      <ClipboardList size={20} />
                    </div>
                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest italic">Ordine del Giorno</h3>
                  </div>
                  <textarea
                    required
                    value={form.agenda}
                    onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                    className="flex-1 w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all text-slate-900 font-bold text-sm resize-none min-h-[150px] leading-relaxed italic"
                    placeholder="Elenca i punti trattati..."
                  />
                </div>
              </div>

              {/* Sviluppo Verbale Section */}
              <div className={`space-y-6 flex flex-col min-h-0 ${isFullScreen ? 'h-full' : ''}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] italic flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    Sviluppo Verbale della Seduta
                  </h3>
                </div>

                <div className="flex-1 bg-white rounded-[2.5rem] md:rounded-[3rem] border border-slate-200 overflow-hidden shadow-xl flex flex-col min-h-[500px]">
                  <ReactQuill
                    theme="snow"
                    value={form.fullMinutes}
                    onChange={(content) => setForm({ ...form, fullMinutes: content })}
                    modules={modules}
                    formats={formats}
                    className="flex-1 flex flex-col quill-modern"
                    placeholder="Riporta qui il resoconto dettagliato della consulta..."
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-10 border-t border-slate-100 uppercase italic">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsFullScreen(false);
                  }}
                  className="flex-1 bg-white border border-slate-200 text-slate-600 py-5 rounded-full font-black text-[11px] tracking-widest hover:bg-slate-50 transition-all active:scale-95"
                >
                  Annulla
                </button>
                <div className="flex-[2] flex gap-3">
                  <button
                    type="button"
                    onClick={() => handlePreviewPDF(form)}
                    className="flex-1 bg-slate-100 text-slate-900 py-5 rounded-full font-black text-[11px] tracking-widest hover:bg-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Download size={16} /> Anteprima PDF
                  </button>
                  <button
                    type="submit"
                    className="flex-[1.5] bg-blue-600 text-white py-5 rounded-full font-black text-[11px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95"
                  >
                    {isEditing ? 'Aggiorna Documento' : 'Crea Verbale Ufficiale'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF View Modal */}
      {isPreviewModalOpen && previewPdfUrl && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-0 md:p-6 z-[250]">
          <div className="bg-white rounded-none md:rounded-[3.5rem] w-full h-full md:max-w-6xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-6 md:p-10 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 z-10 shadow-sm">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center border border-blue-100 italic">
                  <FileText size={32} />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic leading-none">Anteprima Documento</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{selectedCouncil?.name || 'Verbale Consulta'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleDownloadPDF(selectedCouncil || form)}
                  className="bg-blue-600 text-white px-8 py-4 rounded-full font-black uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95 text-[11px] flex items-center gap-2"
                >
                  <Download size={20} /> <span className="hidden md:inline">Scarica Documento</span>
                </button>
                <button
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    setPreviewPdfUrl(null);
                  }}
                  className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-400"
                >
                  <X size={32} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-800/20 p-4 md:p-10 overflow-hidden relative">
              <div className="w-full h-full bg-white shadow-2xl rounded-2xl overflow-hidden">
                <iframe
                  src={previewPdfUrl}
                  className="w-full h-full border-none"
                  title="PDF Preview"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {councilToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl p-10 text-center animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
              <Trash2 size={40} />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2 italic uppercase tracking-tight">Elimina Verbale</h2>
            <p className="text-slate-500 text-sm font-medium mb-10 leading-relaxed italic">
              Sei sicuro di voler eliminare definitivamente questo verbale?<br/>
              <strong>L'operazione non è reversibile.</strong>
            </p>
            <div className="flex gap-4 uppercase italic">
              <button
                onClick={() => setCouncilToDelete(null)}
                className="flex-1 bg-white border border-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-black text-[10px] tracking-widest hover:bg-slate-50 transition-all active:scale-95"
              >
                Annulla
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 text-white px-6 py-4 rounded-2xl font-black text-[10px] tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-500/20 active:scale-95"
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
