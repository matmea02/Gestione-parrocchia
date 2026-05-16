import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useParish, useParishDoc } from '../components/ParishContext';
import { Save, Building2, Mail, Phone, MapPin, User, Image as ImageIcon, X, Clock, AlignLeft, Camera, Star, Trash2, Plus } from 'lucide-react';

const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

const TimeSlotsEditor: React.FC<{
  slots: { start: string, end: string }[];
  onChange: (newSlots: { start: string, end: string }[]) => void;
}> = ({ slots = [], onChange }) => {
  const addSlot = () => onChange([...slots, { start: '09:00', end: '12:00' }]);
  const removeSlot = (index: number) => onChange(slots.filter((_, i) => i !== index));
  const updateSlot = (index: number, field: 'start' | 'end', value: string) => {
    const newSlots = [...slots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    onChange(newSlots);
  };

  return (
    <div className="space-y-1.5">
      {slots.map((slot, index) => (
        <div key={index} className="flex items-center gap-1 group">
          <input
            type="time"
            value={slot.start}
            onChange={(e) => updateSlot(index, 'start', e.target.value)}
            className="px-1.5 py-1 text-[10px] font-medium bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-20 transition-all"
          />
          <span className="text-[10px] text-slate-400 font-bold">al</span>
          <input
            type="time"
            value={slot.end}
            onChange={(e) => updateSlot(index, 'end', e.target.value)}
            className="px-1.5 py-1 text-[10px] font-medium bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-20 transition-all"
          />
          <button
            type="button"
            onClick={() => removeSlot(index)}
            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addSlot}
        className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-black text-blue-600 hover:bg-blue-50 rounded-lg uppercase tracking-widest transition-all"
      >
        <Plus size={10} /> Aggiungi
      </button>
    </div>
  );
};

const Settings: React.FC = () => {
  const { currentParish } = useParish();
  const settingsDoc = useParishDoc('settings', 'parish');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parish, setParish] = useState({
    name: '',
    logoUrl: '',
    address: '',
    contactPerson: '',
    email: '',
    phone: '',
    diocese: '',
    pastoralCommunity: '',
    description: '',
    officeHours: {} as Record<string, { start: string, end: string }[]>,
    churchHours: {} as Record<string, { start: string, end: string }[]>,
    confessionHours: {} as Record<string, { start: string, end: string }[]>,
    photos: [] as { id: string, url: string, isFeatured: boolean }[],
  });

  const [newPhotoUrl, setNewPhotoUrl] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(settingsDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        
        // Migrate old string hours to day-by-day objects and arrays if necessary
        const migrateHours = (oldValue: any) => {
          const empty = days.reduce((acc, day) => ({ ...acc, [day]: [] }), {});
          if (!oldValue) return empty;
          
          if (typeof oldValue === 'string') {
            // Old generic string: can't easily map to days, just keep as empty array for each day
            return empty;
          }

          const migrated = { ...empty };
          Object.keys(oldValue).forEach(day => {
            const val = oldValue[day];
            if (Array.isArray(val)) {
              migrated[day] = val;
            } else if (typeof val === 'string' && val.trim() !== '') {
              // Try to parse "HH:mm - HH:mm" or similar
              const match = val.match(/(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/);
              if (match) {
                migrated[day] = [{ start: match[1].replace('.', ':'), end: match[2].replace('.', ':') }];
              } else {
                migrated[day] = [];
              }
            } else {
              migrated[day] = [];
            }
          });
          return migrated;
        };

        setParish({
          ...data,
          officeHours: migrateHours(data.officeHours),
          churchHours: migrateHours(data.churchHours),
          confessionHours: migrateHours(data.confessionHours),
          photos: data.photos || []
        });
      } else {
        // Initialize if doesn't exist
        const emptyHours = days.reduce((acc, day) => ({ ...acc, [day]: [] }), {});
        setParish(prev => ({
          ...prev,
          officeHours: emptyHours,
          churchHours: emptyHours,
          confessionHours: emptyHours,
        }));
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/parish');
    });
    return unsub;
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const photo = {
          id: crypto.randomUUID(),
          url: reader.result as string,
          isFeatured: parish.photos.length === 0,
        };
        setParish({
          ...parish,
          photos: [...parish.photos, photo],
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddPhotoUrl = () => {
    if (!newPhotoUrl.trim()) return;
    const photo = {
      id: crypto.randomUUID(),
      url: newPhotoUrl,
      isFeatured: parish.photos.length === 0, // First photo is featured by default
    };
    setParish({
      ...parish,
      photos: [...parish.photos, photo],
    });
    setNewPhotoUrl('');
  };

  const handleRemovePhoto = (id: string) => {
    setParish({
      ...parish,
      photos: parish.photos.filter(p => p.id !== id),
    });
  };

  const handleSetFeatured = (id: string) => {
    setParish({
      ...parish,
      photos: parish.photos.map(p => ({
        ...p,
        isFeatured: p.id === id,
      })),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const featuredPhoto = parish.photos.find(p => p.isFeatured);
      await setDoc(settingsDoc, parish);

      // Sync summary info to the main parishes collection for the Master Dashboard
      if (currentParish) {
        await updateDoc(doc(db, 'parishes', currentParish.id), {
          name: parish.name,
          logoUrl: parish.logoUrl,
          address: parish.address,
          email: parish.email,
          phone: parish.phone,
          contactPerson: parish.contactPerson,
          featuredImageUrl: featuredPhoto ? featuredPhoto.url : '',
          updatedAt: new Date().toISOString()
        });
      }

      alert('Impostazioni salvate con successo!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `parishes/${currentParish?.id}/settings/parish`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Caricamento...</div>;

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Impostazioni Parrocchia</h1>
        <p className="text-slate-500 mt-1">Gestisci le informazioni generali della tua parrocchia.</p>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 space-y-8">
          {/* Logo Section */}
            <div className="flex flex-col md:flex-row items-center gap-8 pb-8 border-b border-slate-100">
            <div className="relative group">
              {parish.logoUrl ? (
                <div className="relative">
                  <img 
                    src={parish.logoUrl} 
                    alt="Logo Parrocchia" 
                    className="w-32 h-32 rounded-2xl object-cover border-2 border-slate-100 shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    onClick={() => setParish({ ...parish, logoUrl: '' })}
                    className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="w-32 h-32 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                  <ImageIcon size={32} />
                  <span className="text-[10px] uppercase font-bold mt-2">Nessun Logo</span>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-4 w-full">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <ImageIcon size={16} /> Carica Logo Parrocchia
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="parish-logo-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setParish({ ...parish, logoUrl: reader.result as string });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <label 
                    htmlFor="parish-logo-upload"
                    className="flex-1 border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center gap-1 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all text-slate-500 hover:text-blue-600"
                  >
                    <ImageIcon size={20} />
                    <span className="text-xs font-medium">Seleziona immagine (PNG, JPG)</span>
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">O inserisci URL</label>
                <input
                  type="url"
                  value={(parish.logoUrl || '').startsWith('data:') ? '' : (parish.logoUrl || '')}
                  onChange={(e) => setParish({ ...parish, logoUrl: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="https://esempio.it/logo.png"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Building2 size={16} /> Nome Parrocchia
              </label>
              <input
                type="text"
                required
                value={parish.name || ''}
                onChange={(e) => setParish({ ...parish, name: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="es. Parrocchia San Giovanni"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <MapPin size={16} /> Indirizzo
              </label>
              <input
                type="text"
                value={parish.address || ''}
                onChange={(e) => setParish({ ...parish, address: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Via Roma 1, 12345 Città"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Building2 size={16} /> Diocesi
              </label>
              <input
                type="text"
                value={parish.diocese || ''}
                onChange={(e) => setParish({ ...parish, diocese: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="es. Diocesi di Milano"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Building2 size={16} /> Comunità Pastorale
              </label>
              <input
                type="text"
                value={parish.pastoralCommunity || ''}
                onChange={(e) => setParish({ ...parish, pastoralCommunity: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="es. Comunità Pastorale San Paolo"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <User size={16} /> Referente
              </label>
              <input
                type="text"
                value={parish.contactPerson || ''}
                onChange={(e) => setParish({ ...parish, contactPerson: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Don Mario Rossi"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Mail size={16} /> Email
              </label>
              <input
                type="email"
                value={parish.email || ''}
                onChange={(e) => setParish({ ...parish, email: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="parrocchia@esempio.it"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Phone size={16} /> Telefono
              </label>
              <input
                type="tel"
                value={parish.phone || ''}
                onChange={(e) => setParish({ ...parish, phone: e.target.value })}
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="+39 012 3456789"
              />
            </div>
          </div>

          {/* Description Section */}
          <div className="space-y-4 pt-8 border-t border-slate-100">
            <label className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <AlignLeft size={18} className="text-blue-600" /> Descrizione Parrocchia
            </label>
            <textarea
              rows={4}
              value={parish.description || ''}
              onChange={(e) => setParish({ ...parish, description: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
              placeholder="Racconta brevemente la storia o la missione della parrocchia..."
            />
          </div>

          {/* Hours Section */}
          <div className="pt-8 border-t border-slate-100 space-y-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Clock size={18} className="text-blue-600" /> Orari
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="py-4 px-2 text-[10px] font-black uppercase text-slate-400 tracking-widest">Giorno</th>
                    <th className="py-4 px-2 text-[10px] font-black uppercase text-slate-400 tracking-widest">Segreteria</th>
                    <th className="py-4 px-2 text-[10px] font-black uppercase text-slate-400 tracking-widest">Apertura Chiesa</th>
                    <th className="py-4 px-2 text-[10px] font-black uppercase text-slate-400 tracking-widest">Confessioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {days.map((day) => (
                    <tr key={day} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-2 font-bold text-slate-700 text-sm align-top">{day}</td>
                      <td className="py-3 px-2 align-top">
                        <TimeSlotsEditor
                          slots={parish.officeHours?.[day] || []}
                          onChange={(newSlots) => setParish({
                            ...parish,
                            officeHours: { ...parish.officeHours, [day]: newSlots }
                          })}
                        />
                      </td>
                      <td className="py-3 px-2 align-top">
                        <TimeSlotsEditor
                          slots={parish.churchHours?.[day] || []}
                          onChange={(newSlots) => setParish({
                            ...parish,
                            churchHours: { ...parish.churchHours, [day]: newSlots }
                          })}
                        />
                      </td>
                      <td className="py-3 px-2 align-top">
                        <TimeSlotsEditor
                          slots={parish.confessionHours?.[day] || []}
                          onChange={(newSlots) => setParish({
                            ...parish,
                            confessionHours: { ...parish.confessionHours, [day]: newSlots }
                          })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Photo Gallery Section */}
          <div className="pt-8 border-t border-slate-100 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                  <Camera size={18} className="text-blue-600" /> Galleria Foto Parrocchia
                </h3>
                <p className="text-xs font-medium text-slate-500 mt-1">Aggiungi foto e seleziona quella in evidenza.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={newPhotoUrl}
                  onChange={(e) => setNewPhotoUrl(e.target.value)}
                  className="flex-1 md:w-64 px-4 py-2 text-sm rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="O inserisci URL..."
                />
                <button
                  type="button"
                  onClick={handleAddPhotoUrl}
                  className="p-2 border-2 border-slate-200 text-slate-400 rounded-xl hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm"
                  title="Aggiungi da URL"
                >
                  <Plus size={20} />
                </button>
                <div className="h-10 w-[1px] bg-slate-100 mx-2" />
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  id="photo-upload"
                  onChange={handlePhotoUpload}
                />
                <label
                  htmlFor="photo-upload"
                  className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm cursor-pointer flex items-center justify-center"
                  title="Carica da computer (JPG, PNG)"
                >
                  <Plus size={20} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {(parish.photos || []).map((photo) => (
                <div key={photo.id} className="relative group aspect-square rounded-2xl overflow-hidden border border-slate-100 bg-slate-50">
                  <img 
                    src={photo.url} 
                    alt="Foto Parrocchia" 
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Photo Actions Dropdown/Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <button
                      type="button"
                      onClick={() => handleSetFeatured(photo.id)}
                      className={`w-full py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all ${
                        photo.isFeatured 
                          ? 'bg-yellow-400 text-yellow-900' 
                          : 'bg-white/20 text-white hover:bg-white/40'
                      }`}
                    >
                      <Star size={12} fill={photo.isFeatured ? 'currentColor' : 'none'} />
                      {photo.isFeatured ? 'In Evidenza' : 'Metti in Evidenza'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(photo.id)}
                      className="w-full py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 bg-red-500/80 text-white hover:bg-red-600/90 transition-all"
                    >
                      <Trash2 size={12} /> Elimina
                    </button>
                  </div>

                  {photo.isFeatured && (
                    <div className="absolute top-2 left-2 p-1 bg-yellow-400 text-yellow-900 rounded-lg shadow-lg">
                      <Star size={12} fill="currentColor" />
                    </div>
                  )}
                </div>
              ))}
              {(!parish.photos || parish.photos.length === 0) && (
                <div className="col-span-full py-12 border-2 border-dashed border-slate-100 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-300 gap-2">
                  <ImageIcon size={32} strokeWidth={1} />
                  <p className="text-xs font-bold uppercase tracking-widest">Nessuna foto caricata</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;
