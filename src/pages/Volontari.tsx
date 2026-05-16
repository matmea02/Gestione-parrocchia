import React, { useEffect, useState } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  query, 
  orderBy,
  getDocs,
  writeBatch,
  where,
  setDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishCollection, useParishDoc } from '../components/ParishContext';
import { 
  Users, 
  Plus, 
  Search, 
  Phone, 
  User, 
  Trash2, 
  Pencil, 
  Save,
  X, 
  Briefcase,
  Layers,
  Download,
  Mail,
  Shield,
  Key
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Volunteer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  role: string;
  group: string; // Legacy
  groups?: string[];
  isCouncilMember?: boolean;
  councilGroup?: string;
  isPortalUser?: boolean;
  portalUsername?: string;
  portalPassword?: string;
  createdAt: string;
}

interface VolunteerGroup {
  id: string;
  name: string;
  description?: string;
}

const Volontari: React.FC = () => {
  const { currentParish } = useParish();
  const volunteersColl = useParishCollection('volunteers');
  const groupsColl = useParishCollection('volunteer_groups');
  const parishSettingsDoc = useParishDoc('settings', 'parish');

  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [groupsMaster, setGroupsMaster] = useState<VolunteerGroup[]>([]);
  const [parishInfo, setParishInfo] = useState<any>({
    name: 'Parrocchia S. Maria Assunta',
    address: '',
    logoUrl: '',
    diocese: '',
    pastoralCommunity: ''
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Groups Management Form
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    role: '',
    groups: [] as string[],
    isCouncilMember: false,
    councilGroup: '',
    isPortalUser: false,
    portalUsername: '',
    portalPassword: ''
  });

  useEffect(() => {
    const q = query(volunteersColl, orderBy('lastName', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setVolunteers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Volunteer)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'volunteers');
    });

    const qGroups = query(groupsColl, orderBy('name', 'asc'));
    const unsubGroups = onSnapshot(qGroups, (snap) => {
      setGroupsMaster(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VolunteerGroup)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'volunteer_groups');
    });

    const unsubParish = onSnapshot(parishSettingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        setParishInfo(docSnap.data());
      }
    });

    return () => {
      unsub();
      unsubGroups();
      unsubParish();
    };
  }, []);

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string, type: 'volunteer' | 'group' } | null>(null);

  const handleAddGroupMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await addDoc(groupsColl, {
        name: newGroupName.trim(),
        createdAt: new Date().toISOString()
      });
      setNewGroupName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'volunteer_groups');
    }
  };

  const handleUpdateGroupMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroupId || !editingGroupName.trim()) return;
    
    const oldGroup = groupsMaster.find(g => g.id === editingGroupId);
    if (!oldGroup) return;

    const oldName = oldGroup.name;
    const newName = editingGroupName.trim();

    try {
      // 1. Update Group Master
      await updateDoc(doc(groupsColl, editingGroupId), {
        name: newName
      });

      // 2. Sync with volunteers (if name changed)
      if (oldName !== newName) {
        const batch = writeBatch(db);
        const volsToUpdate = volunteers.filter(v => (v.groups || []).includes(oldName) || v.group === oldName);
        
        for (const vol of volsToUpdate) {
          const vRef = doc(volunteersColl, vol.id);
          const newGroups = (vol.groups || []).map(g => g === oldName ? newName : g);
          const updateObj: any = { groups: newGroups };
          if (vol.group === oldName) updateObj.group = newName;
          batch.update(vRef, updateObj);
        }
        await batch.commit();
      }

      setEditingGroupId(null);
      setEditingGroupName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'volunteer_groups');
    }
  };

  const handleDeleteGroupMaster = async (id: string, name: string) => {
    try {
      // 1. Delete Group Master
      await deleteDoc(doc(groupsColl, id));

      // 2. Remove from volunteers
      const batch = writeBatch(db);
      const volsToUpdate = volunteers.filter(v => (v.groups || []).includes(name) || v.group === name);
      
      for (const vol of volsToUpdate) {
        const vRef = doc(volunteersColl, vol.id);
        const newGroups = (vol.groups || []).filter(g => g !== name);
        const updateObj: any = { groups: newGroups };
        if (vol.group === name) updateObj.group = '';
        batch.update(vRef, updateObj);
      }
      await batch.commit();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Delete group error:', error);
      handleFirestoreError(error, OperationType.DELETE, 'volunteer_groups');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!currentParish) return;
      
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email,
        role: form.role,
        groups: form.groups,
        isCouncilMember: form.isCouncilMember,
        councilGroup: form.isCouncilMember ? form.councilGroup : '',
        isPortalUser: form.isPortalUser,
        portalUsername: form.portalUsername,
        portalPassword: form.portalPassword,
        updatedAt: new Date().toISOString()
      };

      let vid = editingId;
      if (editingId) {
        await updateDoc(doc(volunteersColl, editingId), payload);
      } else {
        const docRef = await addDoc(volunteersColl, {
          ...payload,
          createdAt: new Date().toISOString()
        });
        vid = docRef.id;
      }

      // Handle Portal User Synchronization
      if (vid) {
        const portalUserId = `${currentParish.id}_${vid}`;
        if (form.isPortalUser) {
          // Check if portal user exists to preserve permissions
          const portalRef = doc(db, 'portal_users', portalUserId);
          const portalSnap = await getDocs(query(collection(db, 'portal_users'), where('volunteerId', '==', vid), where('parishId', '==', currentParish.id)));
          
          let existingPermissions = {};
          if (!portalSnap.empty) {
            existingPermissions = portalSnap.docs[0].data().permissions || {};
          } else {
             // Default permissions for their paroches
             existingPermissions = {
               [currentParish.id]: {
                 enabled: true,
                 modules: ['dashboard', 'calendar', 'liturgy', 'events']
               }
             };
          }

          await setDoc(doc(db, 'portal_users', portalUserId), {
            username: form.portalUsername,
            password: form.portalPassword,
            volunteerId: vid,
            parishId: currentParish.id,
            volunteerName: `${form.firstName} ${form.lastName}`,
            isEnabled: true,
            permissions: existingPermissions,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } else if (editingId) {
          // If was portal user and now not, we could delete or disable. 
          // User said "lo possiamo vedere all'interno della sezione utenti... se lo si abilita". 
          // If disabled, maybe just set isEnabled to false.
          await updateDoc(doc(db, 'portal_users', portalUserId), { isEnabled: false }).catch(() => {});
        }
      }

      closeModal();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'volunteers');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (!currentParish) return;
      
      // 1. Delete volunteer doc
      await deleteDoc(doc(volunteersColl, id));
      
      // 2. Delete portal user doc if it exists
      const portalUserId = `${currentParish.id}_${id}`;
      await deleteDoc(doc(db, 'portal_users', portalUserId)).catch(() => {});

      setDeleteConfirm(null);
    } catch (error) {
      console.error('Delete volunteer error:', error);
      handleFirestoreError(error, OperationType.DELETE, 'volunteers');
    }
  };

  const openModal = (v?: Volunteer) => {
    if (v) {
      setForm({
        firstName: v.firstName,
        lastName: v.lastName,
        phone: v.phone || '',
        email: v.email || '',
        role: v.role || '',
        groups: v.groups || (v.group ? [v.group] : []),
        isCouncilMember: v.isCouncilMember || false,
        councilGroup: v.councilGroup || '',
        isPortalUser: v.isPortalUser || false,
        portalUsername: v.portalUsername || '',
        portalPassword: v.portalPassword || ''
      });
      setEditingId(v.id);
    } else {
      setForm({ 
        firstName: '', 
        lastName: '', 
        phone: '', 
        email: '',
        role: '', 
        groups: [], 
        isCouncilMember: false,
        councilGroup: '',
        isPortalUser: false,
        portalUsername: '',
        portalPassword: ''
      });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setForm({ 
      firstName: '', 
      lastName: '', 
      phone: '', 
      email: '',
      role: '', 
      groups: [], 
      isCouncilMember: false,
      councilGroup: '', 
      isPortalUser: false,
      portalUsername: '',
      portalPassword: ''
    });
    setEditingId(null);
  };

  const exportToPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const blueColor = [37, 99, 235];

      // Header: Parish Info
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, 210, 25, 'F');

      if (parishInfo.logoUrl) {
        try {
          doc.addImage(parishInfo.logoUrl, 'PNG', 14, 4, 18, 18);
        } catch (e) {
          console.error('Could not add logo', e);
        }
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85);
      doc.text(parishInfo.name, parishInfo.logoUrl ? 36 : 14, 8);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);

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

      // Info Box top right
      doc.setFillColor(blueColor[0], blueColor[1], blueColor[2]);
      doc.roundedRect(155, 5, 45, 15, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('ELENCO VOLONTARI', 177.5, 11, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(format(new Date(), 'dd/MM/yyyy'), 177.5, 16, { align: 'center' });

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(blueColor[0], blueColor[1], blueColor[2]);
      doc.text('ELENCO VOLONTARI PARROCCHIALI', 105, 40, { align: 'center' });

      // Summary
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 48, 182, 8, 2, 2, 'FD');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(`Totale volontari registrati: ${volunteers.length}`, 19, 53.5);

      // Prepare Table Data (grouped and sorted)
      const tableData: any[] = [];
      const distinctGroups = Array.from(new Set(volunteers.flatMap(v => v.groups || (v.group ? [v.group] : [])))).filter(Boolean).sort() as string[];
      
      if (distinctGroups.length === 0) {
        volunteers
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
          .forEach(v => {
            tableData.push([
              `${v.lastName} ${v.firstName}`,
              v.role || '-',
              v.phone || '-',
              'Senza Gruppo'
            ]);
          });
      } else {
        distinctGroups.forEach(groupName => {
          // Group Header Row
          tableData.push([{ 
            content: groupName.toUpperCase(), 
            colSpan: 4, 
            styles: { fillColor: [241, 245, 249], fontStyle: 'bold', textColor: blueColor } 
          }]);
          
          const groupVolunteers = volunteers
            .filter(v => (v.groups || (v.group ? [v.group] : [])).includes(groupName))
            .sort((a, b) => a.lastName.localeCompare(b.lastName));
            
          groupVolunteers.forEach(v => {
            tableData.push([
              `${v.lastName} ${v.firstName}`,
              v.role || '-',
              v.phone || '-',
              groupName
            ]);
          });
        });
      }

      autoTable(doc, {
        startY: 60,
        head: [['Nome e Cognome', 'Ruolo', 'Telefono', 'Gruppo']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: blueColor as [number, number, number], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2.5 },
        didDrawPage: (data) => {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text('Pagina ' + data.pageNumber, 196, 285, { align: 'right' });
        }
      });

      doc.save(`volontari_${format(new Date(), 'yyyyMMdd')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Errore durante la generazione del PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const filteredVolunteers = volunteers.filter(v => {
    const searchLower = searchTerm.toLowerCase();
    const vGroups = v.groups || (v.group ? [v.group] : []);
    return (
      v.firstName.toLowerCase().includes(searchLower) ||
      v.lastName.toLowerCase().includes(searchLower) ||
      `${v.lastName} ${v.firstName}`.toLowerCase().includes(searchLower) ||
      (v.role || '').toLowerCase().includes(searchLower) ||
      vGroups.some(g => g.toLowerCase().includes(searchLower))
    );
  });

  // Grouping logic for display
  const groupedVolunteers = filteredVolunteers.reduce((acc: { [key: string]: Volunteer[] }, curr) => {
    const vGroups = curr.groups || (curr.group ? [curr.group] : []);
    if (vGroups.length === 0) {
      const groupName = 'Senza Gruppo';
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(curr);
    } else {
      vGroups.forEach(groupName => {
        if (!acc[groupName]) acc[groupName] = [];
        // Avoid adding the same person multiple times to the SAME group (shouldn't happen with correct data)
        if (!acc[groupName].find(m => m.id === curr.id)) {
          acc[groupName].push(curr);
        }
      });
    }
    return acc;
  }, {});

  // Sort groups alphabetically and names within groups
  const sortedGroups = Object.keys(groupedVolunteers).sort().map(groupName => ({
    name: groupName,
    members: groupedVolunteers[groupName].sort((a, b) => a.lastName.localeCompare(b.lastName))
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Volontari</h1>
          <p className="text-slate-500 text-xs md:text-sm font-medium mt-1">Gestione anagrafica e gruppi parrocchiali.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <button
            onClick={() => setIsGroupsModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 md:px-6 py-3 md:py-2.5 rounded-full font-black uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[9px] md:text-[10px]"
          >
            <Layers size={16} className="md:w-[18px] md:h-[18px]" />
            <span>Gruppi</span>
          </button>
          <button
            onClick={exportToPDF}
            disabled={isExporting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 md:px-6 py-3 md:py-2.5 rounded-full font-black uppercase italic tracking-wider hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-[9px] md:text-[10px] disabled:opacity-50"
          >
            <Download size={16} className="md:w-[18px] md:h-[18px]" />
            <span>{isExporting ? '...' : 'PDF'}</span>
          </button>
          <button
            onClick={() => openModal()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-6 md:px-8 py-4 md:py-3 rounded-full font-black uppercase italic tracking-wider hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 text-[10px] md:text-[11px]"
          >
            <Plus size={20} />
            Aggiungi Volontario
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-2 md:p-3 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-2 md:gap-4 group focus-within:ring-4 focus-within:ring-blue-500/5 transition-all">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={20} />
          <input
            type="text"
            placeholder="Cerca per nome, ruolo o gruppo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-6 py-4 md:py-3.5 rounded-2xl bg-slate-50 md:bg-white md:hover:bg-slate-50 border-none outline-none transition-all text-sm font-medium placeholder:text-slate-400 text-black"
          />
        </div>
      </div>

      {/* Grouped Volunteers List */}
      <div className="space-y-12 pb-24">
        {loading ? (
          <div className="space-y-8">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden animate-pulse">
                <div className="h-16 bg-slate-50 border-b border-slate-100" />
                <div className="p-6 md:p-8 space-y-4">
                  <div className="h-14 bg-slate-50/50 rounded-2xl w-full" />
                  <div className="h-14 bg-slate-50/50 rounded-2xl w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedGroups.length > 0 ? (
          sortedGroups.map((group) => (
            <div key={group.name} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="bg-slate-50/50 px-6 md:px-10 py-5 md:py-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-white text-blue-600 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100">
                    <Layers size={20} className="md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h2 className="text-xs md:text-sm font-black uppercase tracking-[0.2em] text-slate-500">{group.name}</h2>
                    <p className="text-[9px] font-black text-slate-300 uppercase italic tracking-widest mt-0.5">Elenco membri</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] md:text-xs font-black text-blue-600 bg-blue-50/50 px-3 md:px-4 py-1.5 md:py-2 rounded-xl border border-blue-100/50 shadow-sm">
                    {group.members.length} {group.members.length === 1 ? 'VOLONTARIO' : 'VOLONTARI'}
                  </span>
                </div>
              </div>
              
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/20 border-b border-slate-100">
                      <th className="px-10 py-5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Volontario</th>
                      <th className="px-10 py-5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ruolo / Incarico</th>
                      <th className="px-10 py-5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Contatti</th>
                      <th className="px-10 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 w-32">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.members.map((v) => (
                      <tr key={v.id} className="hover:bg-blue-50/30 transition-all group">
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 bg-white text-blue-600 rounded-2xl flex items-center justify-center text-sm font-black border border-slate-100 shrink-0 shadow-sm group-hover:scale-110 transition-transform">
                              {v.lastName[0]}{v.firstName[0]}
                            </div>
                            <div>
                              <p className="text-base font-black text-slate-900 leading-tight">
                                {v.lastName} {v.firstName}
                              </p>
                              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1 italic">
                                Dal {format(new Date(v.createdAt), 'dd MMMM yyyy', { locale: it })}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-700 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100 uppercase tracking-tight italic">
                                {v.role || 'Volontario'}
                              </span>
                            </div>
                            {v.isCouncilMember && (
                              <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Users size={10} />
                                membro consulta
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex flex-col gap-2">
                            {v.phone && (
                              <a href={`tel:${v.phone}`} className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors">
                                <div className="p-1.5 bg-slate-50 text-slate-400 rounded-lg border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                  <Phone size={14} />
                                </div>
                                <span className="text-xs font-bold font-mono tracking-tight">{v.phone}</span>
                              </a>
                            )}
                            {v.email && (
                              <a href={`mailto:${v.email}`} className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors">
                                <div className="p-1.5 bg-slate-50 text-slate-400 rounded-lg border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                  <Mail size={14} />
                                </div>
                                <span className="text-xs font-bold truncate max-w-[150px]">{v.email}</span>
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => openModal(v)}
                              className="p-3 text-blue-600 bg-white hover:bg-blue-600 hover:text-white rounded-2xl transition-all border border-slate-100 shadow-sm active:scale-95"
                              title="Modifica"
                            >
                              <Pencil size={18} />
                            </button>
                            <button 
                              onClick={() => setDeleteConfirm({ id: v.id, name: `${v.firstName} ${v.lastName}`, type: 'volunteer' })}
                              className="p-3 text-red-600 bg-white hover:bg-red-600 hover:text-white rounded-2xl transition-all border border-slate-100 shadow-sm active:scale-95"
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

              {/* Mobile Cards */}
              <div className="lg:hidden p-4 md:p-6 space-y-4 bg-slate-50/20">
                {group.members.map((v) => (
                  <div key={v.id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-sm font-black border border-blue-100 shrink-0">
                          {v.lastName[0]}{v.firstName[0]}
                        </div>
                        <div>
                          <p className="text-base font-black text-slate-900 leading-tight">
                            {v.lastName} {v.firstName}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100 uppercase italic">
                              {v.role || 'Volontario'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => openModal(v)}
                          className="p-2.5 text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
                        >
                          <Pencil size={18} />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm({ id: v.id, name: `${v.firstName} ${v.lastName}`, type: 'volunteer' })}
                          className="p-2.5 text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {v.phone && (
                        <a href={`tel:${v.phone}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100/50 group/tel transition-all active:scale-[0.98]">
                          <div className="p-2 bg-white text-slate-400 rounded-xl border border-slate-100 group-active/tel:text-blue-500 transition-colors">
                            <Phone size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Telefono</p>
                            <p className="text-xs font-black font-mono text-slate-700">{v.phone}</p>
                          </div>
                        </a>
                      )}
                      {v.email && (
                        <a href={`mailto:${v.email}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100/50 group/mail transition-all active:scale-[0.98]">
                          <div className="p-2 bg-white text-slate-400 rounded-xl border border-slate-100 group-active/mail:text-blue-500 transition-colors">
                            <Mail size={16} />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Email</p>
                            <p className="text-xs font-black text-slate-700 truncate">{v.email}</p>
                          </div>
                        </a>
                      )}
                      {v.isCouncilMember && (
                        <div className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-2xl border border-blue-100/30">
                          <div className="p-2 bg-white text-blue-500 rounded-xl shadow-sm">
                            <Users size={16} />
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">Ruolo Istituzionale</p>
                            <p className="text-[10px] font-black text-blue-600 uppercase italic">Membro Consulta Parrocchiale</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100 shadow-sm mx-4">
            <div className="w-24 h-24 bg-slate-50 text-slate-200 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Users size={48} strokeWidth={1} />
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Nessun volontario trovato</h3>
            <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto font-medium">
              {searchTerm ? 'Prova a cambiare i parametri di ricerca o pulire il campo.' : 'Inizia popolando l\'anagrafica aggiungendo il primo volontario.'}
            </p>
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="mt-6 text-blue-600 font-black uppercase text-[10px] tracking-widest hover:underline"
              >
                Pulisci ricerca
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-4xl md:rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20 flex flex-col">
            <div className="bg-white p-6 md:p-10 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <User size={24} />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-none">{editingId ? 'Modifica Volontario' : 'Nuovo Volontario'}</h2>
                  <p className="text-[10px] uppercase font-black tracking-[0.2em] text-blue-500 mt-1">Configurazione Anagrafica</p>
                </div>
              </div>
              <button 
                onClick={closeModal}
                className="p-2.5 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-900"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 md:space-y-12 bg-slate-50/30 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                {/* Personale */}
                <div className="space-y-6 md:space-y-8">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full shadow-lg shadow-blue-200"></div>
                    Dati Anagrafici
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome</label>
                      <input
                        required
                        type="text"
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none transition-all text-sm font-bold shadow-sm text-black"
                        placeholder="es. Mario"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Cognome</label>
                      <input
                        required
                        type="text"
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        className="w-full px-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none transition-all text-sm font-bold shadow-sm text-black"
                        placeholder="es. Rossi"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Indirizzo Email</label>
                    <div className="relative group">
                      <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18} />
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full pl-14 pr-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none transition-all text-sm font-bold shadow-sm text-black"
                        placeholder="mario.rossi@esempio.it"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefono</label>
                    <div className="relative group">
                      <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18} />
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full pl-14 pr-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none transition-all text-sm font-mono font-bold shadow-sm text-black"
                        placeholder="+39 012 3456789"
                      />
                    </div>
                  </div>
                </div>

                {/* Parrocchiale */}
                <div className="space-y-6 md:space-y-8">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full shadow-lg shadow-blue-200"></div>
                    Impegno in Parrocchia
                  </h3>
                  
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Ruolo / Incarico Principale</label>
                    <div className="relative group">
                      <Briefcase className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18} />
                      <input
                        type="text"
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        className="w-full pl-14 pr-5 py-4 rounded-2xl bg-white border border-slate-200 focus:border-blue-500 outline-none transition-all text-sm font-bold shadow-sm text-black"
                        placeholder="es. Lettore, Corista, Educatore..."
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Gruppi di Appartenenza</label>
                    <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-inner min-h-[140px] max-h-48 overflow-y-auto custom-scrollbar">
                      <div className="flex flex-wrap gap-2">
                        {groupsMaster.map(group => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => {
                              const newGroups = form.groups.includes(group.name)
                                ? form.groups.filter(g => g !== group.name)
                                : [...form.groups, group.name];
                              setForm({ ...form, groups: newGroups });
                            }}
                            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm active:scale-95 ${
                              form.groups.includes(group.name)
                                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200 scale-105'
                                : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-blue-400 hover:text-blue-500'
                            }`}
                          >
                            {group.name}
                          </button>
                        ))}
                      </div>
                      {groupsMaster.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-6 text-slate-300">
                          <Layers size={24} strokeWidth={1} />
                          <p className="text-[10px] uppercase font-black tracking-widest mt-2">Nessun gruppo disponibile</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className={`p-6 rounded-[2.5rem] border-2 transition-all group ${
                      form.isCouncilMember ? 'bg-white border-blue-600 shadow-xl shadow-blue-100/50' : 'bg-slate-50 border-slate-200 border-dashed hover:bg-slate-100/50'
                    }`}>
                      <div className="flex items-center justify-between mb-6">
                        <label className="flex items-center gap-4 cursor-pointer">
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={form.isCouncilMember}
                              onChange={(e) => setForm({ ...form, isCouncilMember: e.target.checked })}
                              className="w-7 h-7 rounded-lg border-2 border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer shadow-sm"
                            />
                          </div>
                          <div>
                            <span className="text-sm font-black text-slate-700 uppercase tracking-tight">MEMBRO CONSULTA</span>
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest italic">{parishInfo.name}</p>
                          </div>
                        </label>
                        {form.isCouncilMember && (
                          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-inner">
                            <Users size={20} />
                          </div>
                        )}
                      </div>
                      
                      {form.isCouncilMember && (
                        <div className="space-y-3 animate-in slide-in-from-top-4 duration-300">
                           <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 ml-1">Gruppo di Riferimento</label>
                           <select
                            required
                            value={form.councilGroup}
                            onChange={(e) => setForm({ ...form, councilGroup: e.target.value })}
                            className="w-full px-5 py-4 rounded-2xl bg-blue-50 border border-blue-100 shadow-sm focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-sm font-black text-blue-900 appearance-none italic"
                           >
                             <option value="">Scegli il tuo gruppo...</option>
                             {form.groups.map(g => (
                               <option key={g} value={g}>{g}</option>
                             ))}
                             {form.councilGroup && !form.groups.includes(form.councilGroup) && (
                               <option value={form.councilGroup}>{form.councilGroup}</option>
                             )}
                           </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Accesso Portale */}
                <div className="md:col-span-2 space-y-6">
                  <div className="p-6 md:p-8 bg-white rounded-[32px] border border-slate-200 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 text-slate-50 group-hover:text-blue-50 transition-colors">
                      <Key size={80} strokeWidth={1} />
                    </div>
                    
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                             <Shield size={20} />
                          </div>
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
                             Accesso al Portale
                          </h3>
                        </div>
                        <p className="text-slate-500 text-xs font-medium max-w-md">
                          Abilita questo volontario all'accesso privato del sito parrocchiale per gestire i propri ambiti di competenza.
                        </p>
                      </div>

                      <label className="flex items-center gap-4 cursor-pointer bg-slate-50 px-8 py-5 rounded-3xl border border-slate-100 hover:bg-blue-50 transition-all active:scale-95 shrink-0 group-hover:border-blue-200">
                        <input
                          type="checkbox"
                          checked={form.isPortalUser}
                          onChange={(e) => setForm({ ...form, isPortalUser: e.target.checked })}
                          className="w-7 h-7 rounded-lg border-2 border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer shadow-sm"
                        />
                        <span className="text-sm font-black text-slate-700 uppercase tracking-tight">Abilita Accesso</span>
                      </label>
                    </div>

                    {form.isPortalUser && (
                      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-6 duration-500 relative z-10">
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Username Portale</label>
                          <div className="relative">
                            <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                            <input
                              required={form.isPortalUser}
                              type="text"
                              value={form.portalUsername}
                              onChange={(e) => setForm({ ...form, portalUsername: e.target.value })}
                              className="w-full pl-14 pr-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:border-blue-500 focus:bg-white outline-none transition-all text-sm font-black text-black"
                              placeholder="es. m.rossi_lissone"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Password Portale</label>
                          <div className="relative">
                            <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                            <input
                              required={form.isPortalUser}
                              type="password"
                              value={form.portalPassword}
                              onChange={(e) => setForm({ ...form, portalPassword: e.target.value })}
                              className="w-full pl-14 pr-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:border-blue-500 focus:bg-white outline-none transition-all text-sm font-black text-black"
                              placeholder="••••••••"
                            />
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 text-[10px] font-bold text-blue-500 italic leading-relaxed flex gap-4 items-start">
                            <Shield className="shrink-0 mt-0.5" size={16} />
                            <span>L'abilitazione assegna i permessi base. Per restrizioni specifiche o accessi avanzati, utilizza la sezione "Gestione Utenti" nella dashboard principale del portale.</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </form>

            <div className="p-6 md:p-10 border-t border-slate-100 flex flex-col md:flex-row gap-4 shrink-0 bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
              <button
                type="button"
                onClick={closeModal}
                className="bg-white border border-slate-200 text-slate-400 p-5 rounded-3xl font-black uppercase tracking-widest hover:bg-slate-50 transition-all text-[11px] flex-1 active:scale-95"
              >
                Annulla
              </button>
              <button
                onClick={handleSubmit}
                className="bg-blue-600 text-white p-5 rounded-3xl font-black uppercase italic tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 text-[11px] flex-[2] flex items-center justify-center gap-4 active:scale-95"
              >
                <Save className="md:w-5 md:h-5" />
                <span>{editingId ? 'Salva Modifiche' : 'Crea Anagrafica'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups Management Modal */}
      {isGroupsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[85vh] md:max-w-xl md:rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
            <div className="bg-slate-50/50 p-6 md:p-8 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white text-blue-600 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100">
                  <Layers size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none">Gestione Gruppi</h2>
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mt-1.5">Anagrafica Struttura</p>
                </div>
              </div>
              <button 
                onClick={() => setIsGroupsModalOpen(false)}
                className="p-2.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
              <form onSubmit={handleAddGroupMaster} className="flex gap-3 mb-10 items-end">
                <div className="flex-1 space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nuovo Gruppo Parrocchiale</label>
                   <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="es. Coro, Catechisti..."
                    className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-blue-500 outline-none transition-all text-sm font-bold shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  className="p-4 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
                  title="Aggiungi Gruppo"
                >
                  <Plus size={24} />
                </button>
              </form>

              <div className="space-y-3 pb-8">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Elenco Gruppi Attivi</label>
                {groupsMaster.map(group => (
                  <div key={group.id} className="flex items-center justify-between p-4 md:p-5 bg-white rounded-[2rem] border border-slate-100 shadow-sm transition-all hover:border-blue-200 group/item">
                    {editingGroupId === group.id ? (
                      <form onSubmit={handleUpdateGroupMaster} className="flex-1 flex gap-3">
                        <input
                          autoFocus
                          type="text"
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          className="flex-1 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 font-bold text-sm outline-none text-blue-900"
                        />
                        <button
                          type="submit"
                          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-md shadow-blue-100"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingGroupId(null)}
                          className="bg-slate-100 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
                        >
                          X
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-center gap-4">
                          <div className="w-2 h-2 bg-blue-400 rounded-full group-hover/item:scale-150 transition-transform"></div>
                          <span className="text-sm md:text-base font-black text-slate-700">{group.name}</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingGroupId(group.id);
                              setEditingGroupName(group.name);
                            }}
                            className="p-3 text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white rounded-xl transition-all border border-blue-100 shadow-sm"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ id: group.id, name: group.name, type: 'group' })}
                            className="p-3 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-xl transition-all border border-red-100 shadow-sm"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {groupsMaster.length === 0 && (
                  <div className="text-center py-16 px-6 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-100">
                    <Layers size={32} strokeWidth={1} className="text-slate-200 mx-auto mb-3" />
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-300">Nessun gruppo censito</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 md:p-8 border-t border-slate-100 bg-white shrink-0">
              <button
                onClick={() => setIsGroupsModalOpen(false)}
                className="bg-slate-900 text-white p-5 rounded-[2rem] font-black uppercase italic tracking-[0.2em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 text-[11px] w-full active:scale-95"
              >
                Chiudi Gestione
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Overlays */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl p-8 md:p-10 text-center animate-in fade-in zoom-in duration-200 border border-white/20">
            <div className="w-24 h-24 bg-red-50 text-red-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner shadow-red-100/50 rotate-3">
              <Trash2 size={48} strokeWidth={2.5} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-3 tracking-tight leading-none uppercase italic">Attenzione!</h2>
            <div className="space-y-4 mb-10">
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                Stai per rimuovere definitivamente 
                <span className="block mt-1 font-black text-slate-900 text-base">{deleteConfirm.name}</span>
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-50 py-2 rounded-xl border border-red-100 italic">
                {deleteConfirm.type === 'group' ? 'L\'azione scollegherà il gruppo da tutti i volontari.' : 'L\'operazione è irreversibile.'}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => deleteConfirm.type === 'volunteer' ? handleDelete(deleteConfirm.id) : handleDeleteGroupMaster(deleteConfirm.id, deleteConfirm.name)}
                className="w-full bg-red-600 text-white p-5 rounded-3xl font-black uppercase italic tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-200 active:scale-95 text-[11px]"
              >
                Sì, Confermo Eliminazione
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="w-full bg-white border border-slate-200 text-slate-400 p-4 rounded-3xl font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 text-[10px]"
              >
                Annulla e Torna Indietro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Volontari;
