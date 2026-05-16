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
  X, 
  Briefcase,
  Layers,
  Download,
  Mail,
  Shield,
  Key
} from 'lucide-react';
import { format } from 'date-fns';
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Volontari</h1>
          <p className="text-slate-500 mt-1">Gestisci i volontari suddivisi per i gruppi parrocchiali.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsGroupsModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white text-slate-700 rounded-2xl font-bold shadow-sm border border-slate-200 hover:bg-slate-50 transition-all text-sm uppercase tracking-wider"
          >
            <Layers size={18} />
            Gestisci Gruppi
          </button>
          <button
            onClick={exportToPDF}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white text-slate-700 rounded-2xl font-bold shadow-sm border border-slate-200 hover:bg-slate-50 transition-all text-sm uppercase tracking-wider disabled:opacity-50"
          >
            <Download size={18} />
            {isExporting ? '...' : 'Esporta PDF'}
          </button>
          <button
            onClick={() => openModal()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition-all active:translate-y-0 text-sm uppercase tracking-wider"
          >
            <Plus size={18} />
            Aggiungi Volontario
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Cerca per nome, ruolo o gruppo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
          />
        </div>
      </div>

      {/* Grouped Volunteers List */}
      <div className="space-y-12">
        {loading ? (
          <div className="space-y-8">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white rounded-3xl border border-slate-200 overflow-hidden animate-pulse">
                <div className="h-14 bg-slate-50 border-b border-slate-100" />
                <div className="p-6 space-y-4">
                  <div className="h-10 bg-slate-50 rounded-xl w-full" />
                  <div className="h-10 bg-slate-50 rounded-xl w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedGroups.length > 0 ? (
          sortedGroups.map((group) => (
            <div key={group.name} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                    <Layers size={18} />
                  </div>
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">{group.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm">
                    {group.members.length} {group.members.length === 1 ? 'VOLONTARIO' : 'VOLONTARI'}
                  </span>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/30 border-b border-slate-100">
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Volontario</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Ruolo / Incarico</th>
                      <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Contatti</th>
                      <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 w-32">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.members.map((v) => (
                      <tr key={v.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-sm font-bold border border-blue-100 shrink-0">
                              {v.lastName[0]}{v.firstName[0]}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900 leading-tight">
                                {v.lastName} {v.firstName}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                                Aggiunto il {format(new Date(v.createdAt), 'dd/MM/yyyy')}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center border border-slate-200">
                              <Briefcase size={12} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-600 uppercase tracking-tighter">
                                {v.role || 'Volontario'}
                              </span>
                              {v.isCouncilMember && (
                                <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-0.5">
                                  membro della consulta {parishInfo.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            {v.phone && (
                              <a 
                                href={`tel:${v.phone}`} 
                                className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors group/tel"
                              >
                                <div className="w-6 h-6 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center border border-slate-200 group-hover/tel:bg-blue-50 group-hover/tel:text-blue-500 group-hover/tel:border-blue-100">
                                  <Phone size={12} />
                                </div>
                                <span className="text-xs font-mono font-medium">{v.phone}</span>
                              </a>
                            )}
                            {v.email && (
                              <a 
                                href={`mailto:${v.email}`} 
                                className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors group/mail"
                              >
                                <div className="w-6 h-6 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center border border-slate-200 group-hover/mail:bg-blue-50 group-hover/mail:text-blue-500 group-hover/mail:border-blue-100">
                                  <Mail size={12} />
                                </div>
                                <span className="text-xs font-medium truncate max-w-[150px]">{v.email}</span>
                              </a>
                            )}
                            {!v.phone && !v.email && (
                              <span className="text-xs text-slate-300 italic">Nessun contatto</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              onClick={() => openModal(v)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all shadow-sm shadow-transparent hover:shadow-blue-100 border border-transparent hover:border-blue-100"
                              title="Modifica"
                            >
                              <Pencil size={18} />
                            </button>
                            <button 
                              onClick={() => setDeleteConfirm({ id: v.id, name: `${v.firstName} ${v.lastName}`, type: 'volunteer' })}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-white rounded-xl transition-all shadow-sm shadow-transparent hover:shadow-red-100 border border-transparent hover:border-red-100"
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
            </div>
          ))
        ) : (
          <div className="py-20 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
            <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users size={40} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Nessun volontario trovato</h3>
            <p className="text-slate-500 text-sm mt-1">
              {searchTerm ? 'Prova a cambiare i termini di ricerca.' : 'Inizia aggiungendo il primo volontario parrocchiale.'}
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20">
            <div className="bg-white p-8 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <User size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">{editingId ? 'Modifica Volontario' : 'Nuovo Volontario'}</h2>
                  <p className="text-[10px] uppercase font-black tracking-[0.2em] text-blue-500">Configurazione Anagrafica</p>
                </div>
              </div>
              <button 
                onClick={closeModal}
                className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-900"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8 bg-slate-50/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Personale */}
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                    Dati Anagrafici
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome</label>
                      <input
                        required
                        type="text"
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                        placeholder="es. Mario"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Cognome</label>
                      <input
                        required
                        type="text"
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                        placeholder="es. Rossi"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Indirizzo Email</label>
                    <div className="relative group">
                      <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full pl-14 pr-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                        placeholder="mario.rossi@esempio.it"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefono</label>
                    <div className="relative group">
                      <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full pl-14 pr-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-mono"
                        placeholder="+39 012 3456789"
                      />
                    </div>
                  </div>
                </div>

                {/* Parrocchiale */}
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                    Impegno in Parrocchia
                  </h3>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Ruolo / Incarico Principale</label>
                    <div className="relative group">
                      <Briefcase className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                      <input
                        type="text"
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        className="w-full pl-14 pr-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                        placeholder="es. Lettore, Corista, Educatore..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Gruppi di Appartenenza</label>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 min-h-[120px] max-h-48 overflow-y-auto">
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
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm active:scale-95 ${
                              form.groups.includes(group.name)
                                ? 'bg-blue-600 text-white border-blue-600 shadow-blue-200'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-500'
                            }`}
                          >
                            {group.name}
                          </button>
                        ))}
                      </div>
                      {groupsMaster.length === 0 && (
                        <p className="text-[10px] text-slate-400 italic text-center py-4">Nessun gruppo configurato.</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className={`p-5 rounded-3xl border-2 transition-all ${
                      form.isCouncilMember ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-slate-50/50 border-transparent border-dashed'
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={form.isCouncilMember}
                            onChange={(e) => setForm({ ...form, isCouncilMember: e.target.checked })}
                            className="w-6 h-6 rounded-lg border-2 border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                          />
                          <div>
                            <span className="text-sm font-black text-slate-700 uppercase tracking-tight">membro della consulta {parishInfo.name}</span>
                          </div>
                        </label>
                        {form.isCouncilMember && (
                          <Users className="text-blue-500" size={24} />
                        )}
                      </div>
                      
                      {form.isCouncilMember && (
                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                           <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 ml-1">Gruppo di Riferimento Consulta</label>
                           <select
                            required
                            value={form.councilGroup}
                            onChange={(e) => setForm({ ...form, councilGroup: e.target.value })}
                            className="w-full px-5 py-3 rounded-2xl bg-white border-none shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold text-blue-900"
                           >
                             <option value="">Seleziona il gruppo...</option>
                             {form.groups.map(g => (
                               <option key={g} value={g}>{g}</option>
                             ))}
                             {/* Support old selections or cases where group isn't in list */}
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
                <div className="md:col-span-2 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                       <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                       Accesso Portale
                    </h3>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.isPortalUser}
                        onChange={(e) => setForm({ ...form, isPortalUser: e.target.checked })}
                        className="w-6 h-6 rounded-lg border-2 border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                      />
                      <span className="text-xs font-black text-slate-700 uppercase tracking-tight">Abilita Accesso al Sito</span>
                    </label>
                  </div>

                  {form.isPortalUser && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-500">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome Utente</label>
                        <div className="relative group">
                          <Shield className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                          <input
                            required={form.isPortalUser}
                            type="text"
                            value={form.portalUsername}
                            onChange={(e) => setForm({ ...form, portalUsername: e.target.value })}
                            className="w-full pl-14 pr-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                            placeholder="es. mrossi_portale"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                        <div className="relative group">
                          <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                          <input
                            required={form.isPortalUser}
                            type="password"
                            value={form.portalPassword}
                            onChange={(e) => setForm({ ...form, portalPassword: e.target.value })}
                            className="w-full pl-14 pr-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-bold"
                            placeholder="Imposta una password..."
                          />
                        </div>
                      </div>
                      <p className="md:col-span-2 text-[9px] text-slate-400 bg-blue-50 p-4 rounded-xl border border-blue-100/50 italic font-medium">
                        Nota: Abilitando l'utente, verranno assegnati permessi predefiniti per questa parrocchia. Potrai personalizzarli nella sezione "Gestione Utenti" del portale principale.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-8 py-4 rounded-[20px] font-black text-xs text-slate-400 hover:bg-slate-100 transition-all uppercase tracking-[0.2em]"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-slate-900 text-white px-10 py-4 rounded-[20px] font-black text-xs shadow-xl shadow-slate-200 hover:bg-blue-600 hover:shadow-blue-100 transition-all uppercase tracking-[0.2em] active:scale-95"
                >
                  {editingId ? 'Salva Modifiche' : 'Salva Volontario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Groups Management Modal */}
      {isGroupsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-50 p-6 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                  <Layers size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Gestione Gruppi</h2>
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Anagrafica Gruppi</p>
                </div>
              </div>
              <button 
                onClick={() => setIsGroupsModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleAddGroupMaster} className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Nuovo gruppo..."
                  className="flex-1 px-4 py-2 rounded-xl bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all text-sm"
                />
                <button
                  type="submit"
                  className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
                >
                  <Plus size={20} />
                </button>
              </form>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {groupsMaster.map(group => (
                  <div key={group.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group/item">
                    {editingGroupId === group.id ? (
                      <form onSubmit={handleUpdateGroupMaster} className="flex-1 flex gap-2">
                        <input
                          autoFocus
                          type="text"
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          className="flex-1 px-3 py-1 rounded-lg bg-white border border-blue-400 outline-none text-sm"
                        />
                        <button
                          type="submit"
                          className="p-1 px-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
                        >
                          Salva
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingGroupId(null)}
                          className="p-1 px-2 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold"
                        >
                          Annulla
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="text-sm font-bold text-slate-700">{group.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingGroupId(group.id);
                              setEditingGroupName(group.name);
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ id: group.id, name: group.name, type: 'group' })}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {groupsMaster.length === 0 && (
                  <p className="text-center py-4 text-slate-400 text-xs italic">Nessun gruppo creato.</p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setIsGroupsModalOpen(false)}
                className="w-full py-3 bg-white text-slate-700 rounded-2xl font-bold border border-slate-200 hover:bg-slate-100 transition-all text-xs uppercase tracking-widest"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Overlays */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={40} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Conferma eliminazione</h2>
            <p className="text-slate-500 text-sm mb-8">
              Sei sicuro di voler eliminare <strong>{deleteConfirm.name}</strong>? 
              {deleteConfirm.type === 'group' ? ' Questa azione rimuoverà il gruppo da tutti i volontari assegnati.' : ' Questa azione non può essere annullata.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all uppercase tracking-widest text-xs"
              >
                Annulla
              </button>
              <button
                onClick={() => deleteConfirm.type === 'volunteer' ? handleDelete(deleteConfirm.id) : handleDeleteGroupMaster(deleteConfirm.id, deleteConfirm.name)}
                className="flex-1 py-3 bg-red-600 text-white rounded-2xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all uppercase tracking-widest text-xs"
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

export default Volontari;
