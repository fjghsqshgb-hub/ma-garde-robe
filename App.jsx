import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Calendar, Shirt, Sparkles, Trash2, Edit3, ChevronLeft, ChevronRight, Archive, Wand2, Download, Camera, Image as ImageIcon } from 'lucide-react';

// ---------- Stockage IndexedDB (supporte les images) ----------
const DB_NAME = 'garde-robe-db';
const DB_VERSION = 1;
const STORE = 'data';

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const dbGet = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const dbSet = async (key, value) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// ---------- Compression d'image ----------
const compressImage = (file, maxDim = 800, quality = 0.75) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = (height * maxDim) / width;
        width = maxDim;
      } else if (height > maxDim) {
        width = (width * maxDim) / height;
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = e.target.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// ---------- Recommandation locale ----------
const recommanderTenue = (items, occasion, meteo) => {
  if (items.length < 2) return { error: 'Ajoutez au moins 2 pièces à votre garde-robe.' };

  const saisonsOk = {
    froid: ['toute saison', 'automne', 'hiver'],
    doux: ['toute saison', 'printemps', 'automne'],
    chaud: ['toute saison', 'été', 'printemps'],
    pluvieux: ['toute saison', 'automne', 'hiver']
  }[meteo] || ['toute saison'];

  const filtres = items.filter(i => saisonsOk.includes(i.saison));
  const pool = filtres.length >= 2 ? filtres : items;

  const keywords = {
    travail: ['chemise', 'blazer', 'costume', 'pantalon', 'tailleur'],
    soirée: ['robe', 'soie', 'velours', 'noir'],
    sport: ['jogging', 'sport', 'baskets', 'legging', 'sweat'],
    cérémonie: ['costume', 'robe', 'tailleur', 'escarpins'],
    décontracté: ['jean', 't-shirt', 'pull', 'sweat']
  }[occasion] || [];

  const scored = pool.map(i => {
    const lower = (i.nom + ' ' + (i.notes || '')).toLowerCase();
    const score = keywords.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0) + Math.random() * 0.5;
    return { ...i, _score: score };
  });

  const byCategory = {};
  scored.forEach(i => {
    if (!byCategory[i.categorie]) byCategory[i.categorie] = [];
    byCategory[i.categorie].push(i);
  });
  Object.keys(byCategory).forEach(c => byCategory[c].sort((a, b) => b._score - a._score));

  const pieces = [];

  if (byCategory.robes && byCategory.robes.length > 0 && Math.random() > 0.5) {
    pieces.push(byCategory.robes[0]);
  } else {
    if (byCategory.hauts?.[0]) pieces.push(byCategory.hauts[0]);
    if (byCategory.bas?.[0]) pieces.push(byCategory.bas[0]);
  }

  if ((meteo === 'froid' || meteo === 'pluvieux') && byCategory.vestes?.[0]) {
    pieces.push(byCategory.vestes[0]);
  } else if (occasion === 'travail' && byCategory.vestes?.[0] && Math.random() > 0.4) {
    pieces.push(byCategory.vestes[0]);
  }

  if (byCategory.chaussures?.[0]) pieces.push(byCategory.chaussures[0]);
  if (byCategory.accessoires?.[0] && Math.random() > 0.4) pieces.push(byCategory.accessoires[0]);

  if (pieces.length < 2) {
    pieces.length = 0;
    scored.sort((a,b) => b._score - a._score).slice(0, 3).forEach(p => pieces.push(p));
  }

  const titres = {
    travail: 'Silhouette professionnelle',
    soirée: 'Tenue de soirée',
    sport: 'Allure sportive',
    cérémonie: 'Tenue de cérémonie',
    décontracté: 'Style décontracté'
  };

  const conseils = {
    froid: 'Les superpositions réchauffent autant qu\'elles structurent la silhouette.',
    doux: 'Jouez sur les textures pour créer du relief sans surcharger.',
    chaud: 'Privilégiez les matières légères et respirantes pour rester élégant.',
    pluvieux: 'Une veste imperméable bien coupée reste votre meilleure alliée.'
  };

  return {
    titre: titres[occasion] || 'Tenue proposée',
    pieces: pieces.map(p => p.nom),
    piecesData: pieces,
    conseil: conseils[meteo] || 'Faites confiance à votre style personnel.'
  };
};

export default function App() {
  const [view, setView] = useState('garderobe');
  const [data, setData] = useState({ items: [], planning: {} });
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [filterCategory, setFilterCategory] = useState('tout');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [occasion, setOccasion] = useState('décontracté');
  const [meteo, setMeteo] = useState('doux');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);

  const { items, planning } = data;

  const categories = ['hauts', 'bas', 'robes', 'vestes', 'chaussures', 'accessoires'];
  const couleurs = ['noir', 'blanc', 'gris', 'beige', 'marron', 'bleu', 'rouge', 'vert', 'jaune', 'rose', 'violet', 'multicolore'];
  const saisons = ['toute saison', 'printemps', 'été', 'automne', 'hiver'];
  const occasions = ['décontracté', 'travail', 'soirée', 'sport', 'cérémonie'];
  const meteos = ['froid', 'doux', 'chaud', 'pluvieux'];

  const getColorHex = (c) => ({
    noir: '#1a1a1a', blanc: '#f8f4ed', gris: '#8a8680', beige: '#d4c5a9',
    marron: '#6b4423', bleu: '#4a6fa5', rouge: '#a53e3e', vert: '#5a7a4a',
    jaune: '#d4a843', rose: '#d49bad', violet: '#7a5a8a', multicolore: '#a53e3e'
  }[c] || '#999');

  const isLightColor = (c) => ['blanc', 'beige', 'jaune', 'rose'].includes(c);

  useEffect(() => {
    const load = async () => {
      try {
        const oldRaw = localStorage.getItem('garde-robe-data-v1');
        if (oldRaw && !(await dbGet('main'))) {
          await dbSet('main', JSON.parse(oldRaw));
          localStorage.removeItem('garde-robe-data-v1');
        }
        const stored = await dbGet('main');
        if (stored) setData(stored);
      } catch (e) {
        console.error('Erreur chargement:', e);
      }
      setLoading(false);
    };
    load();

    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const updateData = async (newData) => {
    setData(newData);
    try { await dbSet('main', newData); } catch (e) { console.error(e); }
  };

  const saveItem = async (item) => {
    const id = item.id || `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const toSave = { ...item, id };
    const newItems = item.id
      ? items.map(i => i.id === id ? toSave : i)
      : [...items, toSave];
    await updateData({ ...data, items: newItems });
  };

  const deleteItem = async (id) => {
    const newItems = items.filter(i => i.id !== id);
    const cleaned = {};
    Object.entries(planning).forEach(([date, ids]) => {
      const filtered = ids.filter(i => i !== id);
      if (filtered.length) cleaned[date] = filtered;
    });
    await updateData({ items: newItems, planning: cleaned });
  };

  const formatDateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const installer = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const genererRecommandation = () => {
    setRecommendation(null);
    setTimeout(() => setRecommendation(recommanderTenue(items, occasion, meteo)), 300);
  };

  const itemsFiltres = filterCategory === 'tout' ? items : items.filter(i => i.categorie === filterCategory);

  const Vignette = ({ item, size = 'md', onClick }) => {
    const sizeMap = { sm: 32, md: 56, lg: 80 };
    const iconSize = { sm: 14, md: 22, lg: 30 };
    if (item.image) {
      return (
        <div style={{width: sizeMap[size], height: sizeMap[size]}}
          className="border-2 border-black overflow-hidden bg-[#faf7f2] flex-shrink-0 cursor-pointer"
          onClick={onClick}>
          <img src={item.image} alt={item.nom} className="w-full h-full object-cover" />
        </div>
      );
    }
    return (
      <div
        className="rounded-full border-2 border-black flex items-center justify-center flex-shrink-0"
        style={{width: sizeMap[size], height: sizeMap[size], background: getColorHex(item.couleur)}}>
        <Shirt size={iconSize[size]} className={isLightColor(item.couleur) ? 'text-black' : 'text-white'} strokeWidth={1.5} />
      </div>
    );
  };

  const ItemModal = () => {
    const [form, setForm] = useState(editingItem || {
      nom: '', categorie: 'hauts', couleur: 'noir', saison: 'toute saison', marque: '', notes: '', image: null
    });
    const [uploading, setUploading] = useState(false);
    const cameraRef = useRef(null);
    const galleryRef = useRef(null);

    const handleImage = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const compressed = await compressImage(file);
        setForm({...form, image: compressed});
      } catch (err) {
        alert('Impossible de charger cette image');
      }
      setUploading(false);
      e.target.value = '';
    };

    const handleSave = async () => {
      if (!form.nom.trim()) return;
      await saveItem(form);
      setShowAddModal(false);
      setEditingItem(null);
    };

    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={() => { setShowAddModal(false); setEditingItem(null); }}>
        <div className="bg-[#f5f1ea] w-full sm:max-w-md max-h-[92vh] overflow-y-auto border-t-2 sm:border-2 border-black safe-bottom"
          onClick={e => e.stopPropagation()}>
          <div className="border-b-2 border-black p-5 flex justify-between items-center bg-black text-[#f5f1ea] sticky top-0 z-10">
            <h2 className="text-2xl" style={{fontFamily: 'Playfair Display, serif', fontStyle: 'italic'}}>
              {editingItem ? 'Modifier' : 'Nouvelle pièce'}
            </h2>
            <button onClick={() => { setShowAddModal(false); setEditingItem(null); }}>
              <X size={22} />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <label className="block text-[10px] tracking-[0.25em] uppercase mb-2 text-stone-600">Photo</label>
              {form.image ? (
                <div className="relative border-2 border-black aspect-square overflow-hidden bg-[#faf7f2]">
                  <img src={form.image} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setForm({...form, image: null})}
                    className="absolute top-2 right-2 bg-black text-[#f5f1ea] p-2">
                    <Trash2 size={14} />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[#f5f1ea] p-2 flex gap-2">
                    <button type="button" onClick={() => cameraRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] tracking-widest uppercase py-1">
                      <Camera size={12} /> Reprendre
                    </button>
                    <button type="button" onClick={() => galleryRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1 text-[10px] tracking-widest uppercase py-1">
                      <ImageIcon size={12} /> Galerie
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading}
                    className="border-2 border-black py-6 flex flex-col items-center gap-2 hover:bg-black hover:text-[#f5f1ea] transition-colors disabled:opacity-50">
                    <Camera size={24} strokeWidth={1.5} />
                    <span className="text-[10px] tracking-[0.25em] uppercase">
                      {uploading ? 'Chargement...' : 'Photo'}
                    </span>
                  </button>
                  <button type="button" onClick={() => galleryRef.current?.click()} disabled={uploading}
                    className="border-2 border-black py-6 flex flex-col items-center gap-2 hover:bg-black hover:text-[#f5f1ea] transition-colors disabled:opacity-50">
                    <ImageIcon size={24} strokeWidth={1.5} />
                    <span className="text-[10px] tracking-[0.25em] uppercase">Galerie</span>
                  </button>
                </div>
              )}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                onChange={handleImage} className="hidden" />
              <input ref={galleryRef} type="file" accept="image/*"
                onChange={handleImage} className="hidden" />
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.25em] uppercase mb-2 text-stone-600">Nom de la pièce</label>
              <input type="text" value={form.nom}
                onChange={e => setForm({...form, nom: e.target.value})}
                placeholder="Ex: Chemise en lin blanche"
                className="w-full bg-transparent border-b-2 border-black py-2 focus:outline-none text-lg"
                style={{fontFamily: 'Playfair Display, serif'}} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] tracking-[0.25em] uppercase mb-2 text-stone-600">Catégorie</label>
                <select value={form.categorie} onChange={e => setForm({...form, categorie: e.target.value})}
                  className="w-full bg-transparent border-b-2 border-black py-2 focus:outline-none capitalize">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] tracking-[0.25em] uppercase mb-2 text-stone-600">Couleur</label>
                <select value={form.couleur} onChange={e => setForm({...form, couleur: e.target.value})}
                  className="w-full bg-transparent border-b-2 border-black py-2 focus:outline-none capitalize">
                  {couleurs.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.25em] uppercase mb-2 text-stone-600">Saison</label>
              <select value={form.saison} onChange={e => setForm({...form, saison: e.target.value})}
                className="w-full bg-transparent border-b-2 border-black py-2 focus:outline-none capitalize">
                {saisons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.25em] uppercase mb-2 text-stone-600">Marque (optionnel)</label>
              <input type="text" value={form.marque}
                onChange={e => setForm({...form, marque: e.target.value})}
                className="w-full bg-transparent border-b-2 border-black py-2 focus:outline-none" />
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.25em] uppercase mb-2 text-stone-600">Notes</label>
              <textarea value={form.notes}
                onChange={e => setForm({...form, notes: e.target.value})}
                rows="2"
                placeholder="Matière, coupe, souvenirs..."
                className="w-full bg-transparent border-2 border-black p-2 focus:outline-none resize-none text-sm" />
            </div>

            <button onClick={handleSave}
              className="w-full bg-black text-[#f5f1ea] py-4 tracking-[0.3em] text-xs uppercase">
              {editingItem ? 'Mettre à jour' : 'Ajouter'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const AssignModal = () => {
    if (!selectedDay) return null;
    const dateKey = formatDateKey(selectedDay);
    const assignedIds = planning[dateKey] || [];

    const toggleItem = async (id) => {
      const newAssigned = assignedIds.includes(id) ? assignedIds.filter(i => i !== id) : [...assignedIds, id];
      const newP = { ...planning };
      if (newAssigned.length) newP[dateKey] = newAssigned;
      else delete newP[dateKey];
      await updateData({ ...data, planning: newP });
    };

    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={() => setShowAssignModal(false)}>
        <div className="bg-[#f5f1ea] w-full sm:max-w-lg max-h-[85vh] overflow-y-auto border-t-2 sm:border-2 border-black safe-bottom"
          onClick={e => e.stopPropagation()}>
          <div className="border-b-2 border-black p-5 flex justify-between items-center bg-black text-[#f5f1ea] sticky top-0 z-10">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase opacity-70">Planification</div>
              <h2 className="text-xl" style={{fontFamily: 'Playfair Display, serif', fontStyle: 'italic'}}>
                {selectedDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
            </div>
            <button onClick={() => setShowAssignModal(false)}><X size={22} /></button>
          </div>
          <div className="p-5">
            {items.length === 0 ? (
              <p className="text-center text-stone-600 py-8 text-sm">Ajoutez d'abord des pièces à votre garde-robe.</p>
            ) : (
              <>
                <p className="text-[10px] tracking-[0.25em] uppercase text-stone-600 mb-4">Sélectionnez les pièces</p>
                <div className="grid grid-cols-2 gap-2">
                  {items.map(item => {
                    const selected = assignedIds.includes(item.id);
                    return (
                      <button key={item.id} onClick={() => toggleItem(item.id)}
                        className={`p-3 border-2 text-left transition-all ${selected ? 'border-black bg-black text-[#f5f1ea]' : 'border-black/30'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Vignette item={item} size="sm" />
                          <div className="text-[9px] tracking-widest uppercase opacity-70">{item.categorie}</div>
                        </div>
                        <div className="text-sm leading-tight" style={{fontFamily: 'Playfair Display, serif'}}>{item.nom}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ImageViewer = () => {
    if (!viewingImage) return null;
    return (
      <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
        onClick={() => setViewingImage(null)}>
        <button onClick={() => setViewingImage(null)}
          className="absolute top-4 right-4 text-white p-2 z-10">
          <X size={28} />
        </button>
        <img src={viewingImage.image} alt={viewingImage.nom}
          className="max-w-full max-h-full object-contain" />
        <div className="absolute bottom-6 left-0 right-0 text-center text-white px-4">
          <div className="text-lg" style={{fontFamily: 'Playfair Display, serif', fontStyle: 'italic'}}>
            {viewingImage.nom}
          </div>
          <div className="text-[10px] tracking-[0.3em] uppercase opacity-70 mt-1">
            {viewingImage.categorie} · {viewingImage.couleur}
          </div>
        </div>
      </div>
    );
  };

  const VueGarderobe = () => (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-5 px-5 no-scrollbar">
        {['tout', ...categories].map(c => (
          <button key={c} onClick={() => setFilterCategory(c)}
            className={`px-4 py-2 text-[10px] tracking-[0.25em] uppercase whitespace-nowrap border-2 transition-all ${
              filterCategory === c ? 'bg-black text-[#f5f1ea] border-black' : 'border-black/30 bg-transparent'
            }`}>
            {c} {c !== 'tout' && <span className="opacity-60 ml-1">({items.filter(i => i.categorie === c).length})</span>}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-black/30">
          <Shirt size={56} className="mx-auto mb-4 opacity-20" strokeWidth={1} />
          <p className="text-xl mb-2" style={{fontFamily: 'Playfair Display, serif', fontStyle: 'italic'}}>Votre garde-robe est vide</p>
          <p className="text-[10px] tracking-[0.25em] uppercase text-stone-600 mb-6">Ajoutez votre première pièce avec une photo</p>
          <button onClick={() => setShowAddModal(true)}
            className="bg-black text-[#f5f1ea] px-6 py-3 text-[10px] tracking-[0.3em] uppercase">
            Ajouter une pièce
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {itemsFiltres.map((item, idx) => (
            <div key={item.id} className="border-2 border-black bg-[#faf7f2] relative overflow-hidden">
              <div className="absolute top-2 right-2 text-[8px] tracking-[0.2em] text-stone-400 font-mono z-10 bg-[#faf7f2]/80 px-1">
                N°{String(idx + 1).padStart(3, '0')}
              </div>

              {item.image ? (
                <div className="aspect-square cursor-pointer relative"
                  onClick={() => setViewingImage(item)}>
                  <img src={item.image} alt={item.nom} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-square flex items-center justify-center border-b-2 border-black/10 bg-[#faf7f2]">
                  <div className="w-16 h-16 rounded-full border-2 border-black flex items-center justify-center"
                    style={{background: getColorHex(item.couleur)}}>
                    <Shirt size={26} className={isLightColor(item.couleur) ? 'text-black' : 'text-white'} strokeWidth={1.5} />
                  </div>
                </div>
              )}

              <div className="p-3">
                <div className="text-[8px] tracking-[0.25em] uppercase text-stone-500 mb-1">{item.categorie}</div>
                <div className="text-sm leading-tight mb-2 line-clamp-2" style={{fontFamily: 'Playfair Display, serif'}}>{item.nom}</div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full border border-black" style={{background: getColorHex(item.couleur)}}></div>
                  <div className="text-[9px] tracking-wider text-stone-500 capitalize">{item.couleur} · {item.saison}</div>
                </div>
                {item.marque && <div className="text-[9px] italic text-stone-500">{item.marque}</div>}
                <div className="mt-3 pt-2 border-t border-black/10 flex gap-2">
                  <button onClick={() => { setEditingItem(item); setShowAddModal(true); }}
                    className="text-[9px] tracking-widest uppercase flex items-center gap-1">
                    <Edit3 size={10} /> Modifier
                  </button>
                  <button onClick={() => { if (confirm('Supprimer cette pièce ?')) deleteItem(item.id); }}
                    className="text-[9px] tracking-widest uppercase flex items-center gap-1 text-red-700 ml-auto">
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const VueRecommandations = () => (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="text-[10px] tracking-[0.3em] uppercase text-stone-600 mb-2">Assistant stylistique</div>
        <h2 className="text-4xl mb-2" style={{fontFamily: 'Playfair Display, serif', fontStyle: 'italic'}}>
          Que porter aujourd'hui ?
        </h2>
        <p className="text-sm text-stone-600">Tenue composée à partir de vos {items.length} pièce{items.length > 1 ? 's' : ''}.</p>
      </div>

      <div className="border-2 border-black p-5 mb-5 bg-[#faf7f2]">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-[10px] tracking-[0.25em] uppercase mb-2 text-stone-600">Occasion</label>
            <select value={occasion} onChange={e => setOccasion(e.target.value)}
              className="w-full bg-transparent border-b-2 border-black py-2 focus:outline-none capitalize">
              {occasions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] tracking-[0.25em] uppercase mb-2 text-stone-600">Météo</label>
            <select value={meteo} onChange={e => setMeteo(e.target.value)}
              className="w-full bg-transparent border-b-2 border-black py-2 focus:outline-none capitalize">
              {meteos.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      <button onClick={genererRecommandation}
        className="w-full bg-black text-[#f5f1ea] py-4 tracking-[0.3em] text-xs uppercase flex items-center justify-center gap-3">
        <Wand2 size={16} strokeWidth={1.5} />
        Générer une tenue
      </button>

      {recommendation && (
        <div className="mt-8 border-2 border-black bg-[#faf7f2] p-6">
          {recommendation.error ? (
            <p className="text-center text-stone-700 py-4">{recommendation.error}</p>
          ) : (
            <>
              <div className="text-[10px] tracking-[0.3em] uppercase text-stone-500 mb-2">Tenue proposée</div>
              <h3 className="text-3xl mb-5" style={{fontFamily: 'Playfair Display, serif', fontStyle: 'italic'}}>
                {recommendation.titre}
              </h3>
              <div className="space-y-3 mb-5">
                {recommendation.piecesData?.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-black/10 pb-3">
                    <Vignette item={p} size="md" onClick={() => p.image && setViewingImage(p)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-base truncate" style={{fontFamily: 'Playfair Display, serif'}}>{p.nom}</div>
                      <div className="text-[9px] tracking-wider text-stone-500 uppercase">{p.categorie} · {p.couleur}</div>
                    </div>
                    <div className="text-[9px] tracking-widest text-stone-400 font-mono">0{i+1}</div>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-black pt-4 italic text-sm text-stone-700" style={{fontFamily: 'Playfair Display, serif'}}>
                « {recommendation.conseil} »
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  const VueCalendrier = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();
    const moisNom = currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const joursSem = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const today = new Date();
    const isToday = (d) => d && today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;

    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="p-2 border-2 border-black">
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-2xl capitalize" style={{fontFamily: 'Playfair Display, serif', fontStyle: 'italic'}}>
            {moisNom}
          </h2>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="p-2 border-2 border-black">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {joursSem.map(j => (
            <div key={j} className="text-center text-[9px] tracking-[0.2em] uppercase text-stone-500 py-2">{j}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i}></div>;
            const dateObj = new Date(year, month, d);
            const key = formatDateKey(dateObj);
            const assigned = planning[key] || [];
            const hasOutfit = assigned.length > 0;
            return (
              <button key={i} onClick={() => { setSelectedDay(dateObj); setShowAssignModal(true); }}
                className={`aspect-square border-2 p-1 flex flex-col items-center justify-start relative ${
                  isToday(d) ? 'border-black bg-[#e8dfcf]' : 'border-black/30'
                } ${hasOutfit ? 'border-black' : ''}`}>
                <div className={`text-sm ${isToday(d) ? 'font-bold' : ''}`} style={{fontFamily: 'Playfair Display, serif'}}>{d}</div>
                {hasOutfit && (
                  <div className="flex gap-0.5 mt-auto mb-1 flex-wrap justify-center">
                    {assigned.slice(0, 4).map(id => {
                      const it = items.find(x => x.id === id);
                      if (!it) return null;
                      return <div key={id} className="w-1.5 h-1.5 rounded-full border border-black" style={{background: getColorHex(it.couleur)}}></div>;
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-6 text-[10px] tracking-[0.25em] uppercase text-stone-500 text-center">
          Touchez un jour pour planifier une tenue
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f1ea] flex items-center justify-center">
        <div className="text-[10px] tracking-[0.4em] uppercase">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f1ea] text-black" style={{fontFamily: 'Inter, system-ui, sans-serif'}}>
      <header className="border-b-2 border-black bg-[#f5f1ea] sticky top-0 z-40 safe-top">
        <div className="max-w-5xl mx-auto px-5 py-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-[9px] tracking-[0.4em] uppercase text-stone-600 mb-1">
                Le journal vestimentaire
              </div>
              <h1 className="text-3xl leading-none" style={{fontFamily: 'Playfair Display, serif'}}>
                <span style={{fontStyle: 'italic'}}>Ma</span> Garde-robe
              </h1>
            </div>
            <div className="text-right">
              <div className="text-[9px] tracking-[0.3em] uppercase text-stone-500">Édition</div>
              <div className="text-sm" style={{fontFamily: 'Playfair Display, serif'}}>
                {new Date().toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
              </div>
              <div className="text-[9px] tracking-widest text-stone-500 mt-1">{items.length} pièces</div>
            </div>
          </div>

          {installPrompt && (
            <button onClick={installer}
              className="w-full mb-3 bg-black text-[#f5f1ea] py-2 text-[10px] tracking-[0.25em] uppercase flex items-center justify-center gap-2">
              <Download size={12} /> Installer l'application
            </button>
          )}

          <nav className="flex gap-1 border-t border-black/20 pt-2">
            {[
              { id: 'garderobe', label: 'Garde-robe', icon: Archive },
              { id: 'recommandations', label: 'Tenues', icon: Sparkles },
              { id: 'calendrier', label: 'Agenda', icon: Calendar }
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setView(id)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[10px] tracking-[0.2em] uppercase ${
                  view === id ? 'bg-black text-[#f5f1ea]' : ''
                }`}>
                <Icon size={13} strokeWidth={1.5} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6">
        {view === 'garderobe' && <VueGarderobe />}
        {view === 'recommandations' && <VueRecommandations />}
        {view === 'calendrier' && <VueCalendrier />}
      </main>

      {view === 'garderobe' && items.length > 0 && (
        <button onClick={() => setShowAddModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-black text-[#f5f1ea] rounded-full flex items-center justify-center shadow-lg z-30 border-2 border-black">
          <Plus size={24} strokeWidth={1.5} />
        </button>
      )}

      <footer className="border-t-2 border-black mt-16 py-6 text-center safe-bottom">
        <div className="text-[9px] tracking-[0.4em] uppercase text-stone-500">
          Vestiaire · Personnel · {new Date().getFullYear()}
        </div>
      </footer>

      {showAddModal && <ItemModal />}
      {showAssignModal && <AssignModal />}
      <ImageViewer />
    </div>
  );
}
