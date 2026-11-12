// Listas de alabanza: app instalable (iPhone y Android) para planear los cantos de cada servicio.
// Moderador: crea las fechas, ordena, aprueba y marca «Listo» (el Temporizador la descarga).
// Colaboradores: agregan cantos a las listas, sugieren cantos nuevos, comentan y suben charts.
// Los datos viven en Firebase (nube). Sin configurar Firebase, funciona en modo demostración.
import { FIREBASE_CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid8 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Demostración: sin Firebase configurado, o con «?demo» abriendo la app en esta misma computadora
// (para probar cambios sin tocar la nube).
const DEMO = !FIREBASE_CONFIG.apiKey || (new URLSearchParams(location.search).has('demo') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname));

function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); }

// ---- Fechas ----
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const niceDate = (k) => { const d = parseKey(k); return `${DAYS[d.getDay()][0].toUpperCase()}${DAYS[d.getDay()].slice(1)} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return keyOf(d); };
const today = () => keyOf(new Date());
// Una lista está «en preparación» hasta que quien la hizo la envía; entonces les llega a los
// moderadores. (Los estados antiguos «revision» y «listo» cuentan como enviada.)
const sent = (s) => !!s && ['enviada', 'revision', 'listo'].includes(s.status);
const statusPill = (s) => (sent(s) ? '<span class="status enviada">✓ Enviada</span>' : '<span class="status prep">En preparación</span>');

// ---- YouTube ----
function ytId(url) {
  const m = /(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(String(url || ''));
  return m ? m[1] : '';
}
const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

// ---- Tonalidades ----
const KEYS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F#', 'G', 'A♭', 'A', 'B♭', 'B'];

// ---- Mosaico geométrico de la cabecera (como la referencia), dibujado una vez en SVG ----
(function mosaic() {
  const colors = ['#0b2a6b', '#12204a', '#1f6fd1', '#2a8fe0', '#36d1e6', '#ffffff', '#1b3c8f'];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const t = 44, n = 4;
  let s = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const X = x * t, Y = y * t;
    const bg = colors[Math.floor(rnd() * 4)];
    const fg = colors[2 + Math.floor(rnd() * 5)];
    s += `<rect x="${X}" y="${Y}" width="${t}" height="${t}" fill="${bg}"/>`;
    const k = Math.floor(rnd() * 6);
    if (k === 0) s += `<path d="M${X} ${Y}h${t}a${t} ${t} 0 0 1-${t} ${t}z" fill="${fg}"/>`;
    else if (k === 1) s += `<circle cx="${X + t / 2}" cy="${Y + t / 2}" r="${t / 2.6}" fill="${fg}"/>`;
    else if (k === 2) s += `<path d="M${X} ${Y + t}a${t / 2} ${t / 2} 0 0 1 ${t} 0z" fill="${fg}"/>`;
    else if (k === 3) s += `<path d="M${X + t / 2} ${Y}L${X + t} ${Y + t / 2}L${X + t / 2} ${Y + t}L${X} ${Y + t / 2}z" fill="${fg}"/>`;
    else if (k === 4) s += `<rect x="${X + 8}" y="${Y + 8}" width="${t - 16}" height="${t - 16}" rx="6" fill="${fg}"/><circle cx="${X + t / 2}" cy="${Y + t / 2}" r="6" fill="${bg}"/>`;
    else s += `<path d="M${X + t} ${Y + t}V${Y}A${t} ${t} 0 0 0 ${X} ${Y + t}z" fill="${fg}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${t * n}" height="${t * n}" viewBox="0 0 ${t * n} ${t * n}">${s}</svg>`;
  document.documentElement.style.setProperty('--mosaic', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
})();

// ======================================================================================
// Almacén de datos: Firebase (nube) o demostración (este teléfono). Misma interfaz.
// ======================================================================================
function demoBackend() {
  const KEY = 'listas-demo-v1';
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
  if (!db) {
    const sun = nextSunday();
    db = {
      role: 'moderador',
      members: { demo: { name: 'Tú (demo)', email: 'demo@ejemplo.com', role: 'moderador' }, m2: { name: 'María', email: 'maria@ejemplo.com', role: 'colaborador' }, m3: { name: 'Pedro', email: 'pedro@ejemplo.com', role: 'participante' } },
      songs: {
        s1: { title: 'Grande eres Jehová', author: 'Ministerios Ebenezer', key: 'G', youtube: '', text: '[Coro]\nGrande eres Jehová\nsobre toda la tierra', chart: '[Coro]\nG          D\nGrande eres Jehová\nEm        C\nsobre toda la tierra', status: 'agregado', by: 'demo', byName: 'Tú (demo)', at: Date.now(), seed: true },
        s2: { title: 'A ti', author: 'Marcos Witt', key: 'D', youtube: '', text: '', chart: '', status: 'agregado', by: 'demo', byName: 'Tú (demo)', at: Date.now(), seed: true },
        s3: { title: 'Cuán grande es Él', author: 'Tradicional', key: 'B♭', youtube: '', text: '', chart: '', status: 'sugerido', by: 'm2', byName: 'María', at: Date.now() },
      },
      services: { [sun]: { date: sun, title: 'Culto general', note: 'Entrar con el coro después de la oración.', status: 'revision', by: 'demo', byName: 'Tú (demo)', leader: 'm2', leaderName: 'María' } },
      items: { [sun]: {
        i1: { songId: 's1', order: 1, key: 'G', notes: 'Bienvenida, empieza solo piano.', by: 'demo', byName: 'Tú (demo)', at: Date.now() },
        i2: { songId: 's2', order: 2, key: 'D', notes: '', by: 'm2', byName: 'María', at: Date.now() },
      } },
      comments: { [`${sun}/i1`]: { c1: { text: 'La batería entra en el segundo coro.', by: 'm2', byName: 'María', at: Date.now() - 3600e3 } } },
      files: {},
    };
  }
  db.notifs = db.notifs || {};
  const subs = new Set();
  // Un oyente de una pantalla vieja que falle no debe frenar a los demás.
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('El teléfono no tiene espacio para guardar más en la demostración'); } subs.forEach((f) => { try { f(); } catch (e) { console.warn(e); } }); };
  const watch = (fn) => { const f = () => fn(); subs.add(f); f(); return () => subs.delete(f); };
  const list = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));
  let authCb = null;
  // ---- Enlace con el Temporizador ----
  // 'buscando' al empezar; 'ok' si respondió; 'off' si el puente existe pero el Temporizador está
  // cerrado; 'none' si la app no se abrió desde servidor-prueba.js (no hay puente).
  let tempo = null;
  let tempoState = 'buscando';
  let pulling = false;
  const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
  async function pullTempo() {
    if (pulling || tempoState === 'none') return;
    pulling = true;
    try {
      const r = await fetch('puente/cantos', { cache: 'no-store' });
      if (r.status === 404) tempoState = 'none';
      else if (!r.ok) tempoState = 'off';
      else { const b = await r.json(); if (b.cargada !== false) { tempo = b.songs; tempoState = 'ok'; } }
    } catch { tempoState = 'off'; }
    pulling = false;
    emit();
  }
  setInterval(() => { if (!document.hidden) pullTempo(); }, 15000);
  addEventListener('visibilitychange', () => { if (!document.hidden) pullTempo(); });
  async function pushTempo(id, song, isNew) {
    let r;
    try {
      r = await fetch('puente/canto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: song.title, author: song.author || '', text: song.text || '' }) });
    } catch { throw new Error('No se pudo llegar a la PC del Temporizador'); }
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || 'El Temporizador no guardó el canto');
    if (tempo) {
      const t = { id: b.id || id, title: song.title, author: song.author || '', text: song.text || '' };
      const i = tempo.findIndex((x) => x.id === t.id);
      if (i >= 0) tempo[i] = t; else tempo.push(t);
    }
    setTimeout(pullTempo, 800);
    return isNew ? b.id || id : id;
  }
  // Los del Temporizador (con lo propio del teléfono encima) + los sugeridos y los propios del
  // teléfono. Con el Temporizador conectado se ocultan los cantos de ejemplo.
  function mergedSongs() {
    const out = [];
    const seen = new Set();
    for (const t of tempo || []) {
      out.push({ ...(db.songs[t.id] || {}), ...t, status: 'agregado', shared: true, by: (db.songs[t.id] || {}).by || '' });
      seen.add(t.id);
    }
    for (const [id, s] of Object.entries(db.songs)) {
      if (seen.has(id)) continue;
      if (tempo && (s.seed || (s.shared && s.status === 'agregado'))) continue; // borrado en el Temporizador o de ejemplo
      out.push({ id, ...s });
    }
    return out.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }

  // Marca la lista como cambiada (para ofrecer «Enviar cambios» si ya se había enviado).
  const touch = (date) => { if (db.services[date]) db.services[date].changedAt = Date.now(); };
  return {
    demo: true,
    onAuth(cb) { authCb = cb; setTimeout(() => cb({ uid: 'demo', email: 'demo@ejemplo.com' }), 0); },
    async signIn() {}, async signUp() {}, async reset() {}, async signOut() { toast('En la demostración no se cierra sesión'); },
    setDemoRole(role) { db.members.demo = { ...db.members.demo, role }; save(); },
    // Copia: así se nota cuando cambia el rol (comparando antes y después).
    watchMember(id, cb) { return watch(() => cb(db.members[id] ? { ...db.members[id] } : null)); },
    async createMember(id, data) { db.members[id] = { ...data, role: 'moderador' }; save(); },
    async hasOwner() { return true; },
    async createUser(email, pass, data) { const id = uid8(); db.members[id] = { ...data, email }; save(); return id; },
    async changePassword() { toast('En la demostración no hay contraseñas'); },
    async updateMember(id, patch) { db.members[id] = { ...db.members[id], ...patch }; save(); },
    async removeMember(id) { delete db.members[id]; save(); },
    watchMembers(cb) { return watch(() => cb(list(db.members))); },
    watchServices(cb) { return watch(() => cb(list(db.services).map((s) => ({ ...s, count: Object.keys(db.items[s.date] || {}).length })).sort((a, b) => a.date.localeCompare(b.date)))); },
    async saveService(date, data) { db.services[date] = { ...(db.services[date] || {}), ...data, date }; save(); },
    async deleteService(date) { delete db.services[date]; delete db.items[date]; save(); },
    watchItems(date, cb) { return watch(() => cb(list(db.items[date]).sort((a, b) => a.order - b.order))); },
    async addItem(date, item) { const id = uid8(); db.items[date] = { ...(db.items[date] || {}), [id]: { ...item, at: Date.now() } }; touch(date); save(); return id; },
    async updateItem(date, id, patch) { db.items[date][id] = { ...db.items[date][id], ...patch }; touch(date); save(); },
    async deleteItem(date, id) { delete db.items[date][id]; touch(date); save(); },
    watchNotifications(cb) { return watch(() => cb(list(db.notifs).sort((a, b) => b.at - a.at).slice(0, 60))); },
    async refresh() { await pullTempo(); emit(); },
    async addNotification(n) { db.notifs[uid8()] = { ...n, at: Date.now() }; save(); },
    watchComments(date, item, cb) { return watch(() => cb(list(db.comments[`${date}/${item}`]).sort((a, b) => a.at - b.at))); },
    async addComment(date, item, c) { const k = `${date}/${item}`; const id = uid8(); db.comments[k] = { ...(db.comments[k] || {}), [id]: { ...c, at: Date.now() } }; save(); return id; },
    async deleteNotification(id) { delete db.notifs[id]; save(); },
    async deleteComment(date, item, id) { delete db.comments[`${date}/${item}`][id]; save(); },
    // Cantos agregados = biblioteca de Letras del Temporizador (por el puente de servidor-prueba.js).
    // Lo propio del teléfono (tono, YouTube, chart) se guarda aquí, encima del canto del Temporizador.
    watchSongs(cb) { pullTempo(); return watch(() => cb(mergedSongs())); },
    tempoStatus: () => tempoState,
    async addSong(song) {
      let id = uid8();
      if (song.status === 'agregado' && tempoState !== 'none') id = await pushTempo(id, song, true);
      db.songs[id] = { ...song, at: Date.now(), shared: song.status === 'agregado' && tempoState === 'ok' };
      save(); return id;
    },
    async updateSong(id, patch) {
      const cur = mergedSongs().find((s) => s.id === id) || {};
      const next = { ...cur, ...patch };
      // Si es (o pasa a ser) un canto agregado, la letra también se guarda en el Temporizador.
      if (next.status === 'agregado' && tempoState !== 'none' && ['title', 'author', 'text', 'status'].some((k) => k in patch)) await pushTempo(id, next, false);
      db.songs[id] = { ...(db.songs[id] || cur), ...patch, shared: next.status === 'agregado' && (cur.shared || tempoState === 'ok') };
      save();
    },
    async deleteSong(id) { delete db.songs[id]; delete db.files[id]; save(); },
    watchFiles(song, cb) { return watch(() => cb(list(db.files[song]).map(({ data, ...meta }) => meta))); },
    async listFiles(song) { return list(db.files[song]).map(({ data, ...meta }) => meta); },
    async addFile(song, meta, base64) {
      if (base64.length > 1.5e6) throw new Error('En la demostración los archivos deben pesar menos de 1 MB');
      const id = uid8();
      db.files[song] = { ...(db.files[song] || {}), [id]: { ...meta, data: base64, at: Date.now() } }; save();
      return id;
    },
    async getFile(song, id) { return db.files[song][id].data; },
    async deleteFile(song, id) { delete db.files[song][id]; save(); },
  };
}

async function firebaseBackend() {
  const v = '10.12.2';
  const [{ initializeApp, deleteApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`),
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  // Copia local en el teléfono: al abrir, las listas y cantos salen al instante desde ella y
  // luego se ponen al día con la nube (y funciona sin señal).
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); } catch { db = F.getFirestore(app); }
  const D = (...p) => F.doc(db, ...p);
  const C = (...p) => F.collection(db, ...p);
  const snapList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const CHUNK = 700000; // los archivos se guardan en trozos (Firestore admite 1 MB por documento)
  // srvAt (hora del servidor): las computadoras con el Temporizador bajan solo las listas que cambiaron.
  const touch = (date) => F.updateDoc(D('services', date), { changedAt: Date.now(), srvAt: F.serverTimestamp() }).catch(() => {});
  return {
    demo: false,
    onAuth(cb) { A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null)); },
    signIn: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
    signUp: (e, p) => A.createUserWithEmailAndPassword(auth, e, p),
    reset: (e) => A.sendPasswordResetEmail(auth, e),
    signOut: () => A.signOut(auth),
    watchMember: (id, cb) => F.onSnapshot(D('members', id), (s) => cb(s.exists() ? s.data() : null), () => cb(null)),
    // Solo la primera cuenta se crea desde la pantalla de entrada: queda como moderador (dueño).
    // Todas las demás las crea un moderador desde «Equipo».
    async createMember(id, data) {
      const owner = await F.getDoc(D('config', 'owner'));
      if (owner.exists()) throw new Error('Las cuentas las crea un moderador');
      const batch = F.writeBatch(db);
      batch.set(D('config', 'owner'), { uid: id });
      batch.set(D('members', id), { ...data, role: 'moderador' });
      await batch.commit();
    },
    hasOwner: async () => { try { return (await F.getDoc(D('config', 'owner'))).exists(); } catch { return true; } },
    // El moderador crea la cuenta de otra persona con una segunda conexión, para no cerrar su
    // propia sesión; luego guarda su nombre y su rol.
    async createUser(email, pass, data) {
      const sec = initializeApp(FIREBASE_CONFIG, 'alta-' + Date.now());
      try {
        // Sesión solo en memoria, sin preparar el almacenamiento del navegador (más rápido).
        const sa = A.initializeAuth(sec, { persistence: A.inMemoryPersistence });
        const cred = await A.createUserWithEmailAndPassword(sa, email, pass);
        await F.setDoc(D('members', cred.user.uid), { ...data, email });
        await A.signOut(sa);
        return cred.user.uid;
      } finally { deleteApp(sec).catch(() => {}); }
    },
    changePassword: (p) => A.updatePassword(auth.currentUser, p),
    updateMember: (id, patch) => F.updateDoc(D('members', id), patch),
    removeMember: (id) => F.deleteDoc(D('members', id)),
    watchMembers: (cb) => F.onSnapshot(C('members'), (s) => cb(snapList(s))),
    watchServices(cb) {
      const since = keyOf(new Date(Date.now() - 14 * 864e5));
      return F.onSnapshot(F.query(C('services'), F.where('date', '>=', since), F.orderBy('date')), (s) => cb(snapList(s)));
    },
    saveService: (date, data) => F.setDoc(D('services', date), { ...data, date, updatedAt: Date.now(), srvAt: F.serverTimestamp() }, { merge: true }),
    async deleteService(date) {
      const items = await F.getDocs(C('services', date, 'items'));
      await Promise.all(items.docs.map((d) => F.deleteDoc(d.ref)));
      await F.deleteDoc(D('services', date));
    },
    watchItems: (date, cb) => F.onSnapshot(F.query(C('services', date, 'items'), F.orderBy('order')), (s) => cb(snapList(s))),
    addItem: async (date, item) => { const r = await F.addDoc(C('services', date, 'items'), { ...item, at: Date.now() }); touch(date); return r.id; },
    updateItem: async (date, id, patch) => { await F.updateDoc(D('services', date, 'items', id), patch); touch(date); },
    deleteItem: async (date, id) => { await F.deleteDoc(D('services', date, 'items', id)); touch(date); },
    // Deslizar para actualizar: se reconecta con la nube para traer lo último. Lo que se guardó
    // sin señal se envía primero (no se pierde nada).
    async refresh() {
      await Promise.race([F.waitForPendingWrites(db), wait(4000)]);
      await F.disableNetwork(db);
      await F.enableNetwork(db);
    },
    watchNotifications: (cb) => F.onSnapshot(F.query(C('notifications'), F.orderBy('at', 'desc'), F.limit(60)), (s) => cb(snapList(s)), () => cb([])),
    addNotification: (n) => F.addDoc(C('notifications'), { ...n, at: Date.now() }),
    watchComments: (date, item, cb) => F.onSnapshot(F.query(C('services', date, 'items', item, 'comments'), F.orderBy('at')), (s) => cb(snapList(s))),
    addComment: async (date, item, c) => (await F.addDoc(C('services', date, 'items', item, 'comments'), { ...c, at: Date.now() })).id,
    deleteNotification: (id) => F.deleteDoc(D('notifications', id)),
    deleteComment: (date, item, id) => F.deleteDoc(D('services', date, 'items', item, 'comments', id)),
    // srvAt (hora del servidor) le dice al Temporizador qué cantos cambiaron. Un canto borrado
    // queda como «borrado» para que también se borre en todas las computadoras.
    watchSongs: (cb) => F.onSnapshot(F.query(C('songs'), F.orderBy('title')), (s) => cb(snapList(s).filter((x) => x.status !== 'borrado'))),
    addSong: async (song) => (await F.addDoc(C('songs'), { ...song, at: Date.now(), updatedAt: Date.now(), srvAt: F.serverTimestamp() })).id,
    updateSong: (id, patch) => F.updateDoc(D('songs', id), { ...patch, updatedAt: Date.now(), srvAt: F.serverTimestamp() }),
    deleteSong: (id) => F.updateDoc(D('songs', id), { status: 'borrado', updatedAt: Date.now(), srvAt: F.serverTimestamp() }),
    watchFiles: (song, cb) => F.onSnapshot(C('songs', song, 'files'), (s) => cb(snapList(s))),
    listFiles: async (song) => snapList(await F.getDocs(C('songs', song, 'files'))),
    // Primero se suben todos los trozos y AL FINAL la ficha del archivo: así ningún teléfono lo
    // ve (ni lo precarga) hasta que está completo.
    async addFile(song, meta, base64) {
      const ref = F.doc(C('songs', song, 'files')); // id nuevo, todavía sin guardar
      const n = Math.ceil(base64.length / CHUNK);
      for (let i = 0; i < n; i++) await F.setDoc(D('songs', song, 'files', ref.id, 'chunks', String(i)), { data: base64.slice(i * CHUNK, (i + 1) * CHUNK) });
      await F.setDoc(ref, { ...meta, chunks: n, size: base64.length, at: Date.now() });
      return ref.id;
    },
    // Se comprueba que llegaron todos los trozos y el tamaño exacto; si no, es un error (y no se
    // guarda una copia rota en el teléfono).
    async getFile(song, id, f = {}) {
      const snap = await F.getDocs(C('songs', song, 'files', id, 'chunks'));
      const docs = snap.docs.sort((a, b) => Number(a.id) - Number(b.id));
      const data = docs.map((d) => d.data().data || '').join('');
      if (!docs.length || !data || (f.chunks && docs.length < f.chunks) || (f.size && data.length !== f.size)) {
        const e = new Error('El archivo está incompleto'); e.code = 'incompleto'; throw e;
      }
      return data;
    },
    async deleteFile(song, id) {
      const snap = await F.getDocs(C('songs', song, 'files', id, 'chunks'));
      await Promise.all(snap.docs.map((d) => F.deleteDoc(d.ref)));
      await F.deleteDoc(D('songs', song, 'files', id));
    },
  };
}

// ======================================================================================
// Estado y navegación
// ======================================================================================
let api = null;
let user = null; // { uid, email }
let me = null;   // { name, role }
let services = [];
let servicesLoaded = false;
let allMembers = {}; // id → ficha (para fotos y nombres)
let songs = [];
let viewSubs = [];
// Roles: moderador (acceso total), colaborador (hace sus listas y sugiere cantos) y
// participante (solo ve las listas y comenta). «pendiente» espera aprobación.
const ROLES = { moderador: 'Moderador', colaborador: 'Colaborador', participante: 'Participante', pendiente: 'Pendiente' };
const isMod = () => me && me.role === 'moderador';
// Un moderador puede ver la app como colaborador o participante (solo en este teléfono) y volver.
const VIEW_KEY = 'listas-ver-como';
let rawMe = null; // la ficha tal como viene de la nube (con el rol verdadero)
const viewAsRole = () => { try { return localStorage.getItem(VIEW_KEY) || ''; } catch { return ''; } };
const viewAs = (m) => {
  if (!m || m.role !== 'moderador') return m;
  const r = viewAsRole();
  return r === 'colaborador' || r === 'participante' ? { ...m, role: r, realRole: 'moderador' } : m;
};
const realMod = () => !!me && (me.realRole || me.role) === 'moderador';
function setViewAs(role) {
  try { if (role && role !== 'moderador') localStorage.setItem(VIEW_KEY, role); else localStorage.removeItem(VIEW_KEY); } catch { /* sin almacenamiento */ }
  me = viewAs(keepHidden(rawMe ? { ...rawMe, notifHidden: me && me.notifHidden, notifCleared: me && me.notifCleared } : me));
  toast(role && role !== 'moderador' ? 'Viendo la app como ' + ROLES[role].toLowerCase() : 'De vuelta como moderador');
  route();
}
function renderViewAsBar() {
  const r = me && me.realRole && me.role;
  let bar = $('viewAsBar');
  if (!r) { if (bar) bar.remove(); return; }
  if (!bar) { bar = Object.assign(document.createElement('div'), { id: 'viewAsBar' }); document.body.appendChild(bar); }
  bar.innerHTML = `<span>👁 Como <b>${esc(ROLES[r].toLowerCase())}</b></span><button type="button" id="viewAsBack">Volver a moderador</button>`;
  $('viewAsBack').onclick = () => { haptic(); setViewAs('moderador'); };
}
// «Seguir editando / Seguir viendo»: la última lista que abriste, a un toque desde otras pantallas.
const LAST_KEY = 'listas-ultima';
const lastList = () => { try { return sessionStorage.getItem(LAST_KEY) || ''; } catch { return ''; } };
function resumeChip() {
  const d = lastList();
  if (!d || !user || !me || !isMember()) return '';
  if (location.hash.startsWith('#/s/' + d)) return '';
  const s = services.find((x) => x.date === d);
  if (!s) return '';
  const word = canEditList(s) ? 'editando' : 'viendo';
  return `<button class="resume-chip" data-go="#/s/${d}" aria-label="Seguir ${word} la lista del ${esc(niceDate(d))}"><i>‹</i><span>Seguir<b>${word}</b></span></button>`;
}
// «ALABANZA» del encabezado: las letras aparecen una a una (solo la primera vez) y cada tanto
// se funden y se vuelven a formar. El ciclo sigue el reloj, así no se reinicia al cambiar de pantalla.
let wordShown = false;
function brandWord() {
  const first = !wordShown;
  wordShown = true;
  const phase = Date.now() % 9000;
  return `<span class="al-word${first ? ' reveal' : ''}" style="--ph:-${phase}ms">${[...'ALABANZA'].map((c, i) => `<i style="--i:${i}">${c}</i>`).join('')}</span>`;
}
const canCreate = () => me && (me.role === 'moderador' || me.role === 'colaborador');
const isMember = () => me && (me.role === 'moderador' || me.role === 'colaborador' || me.role === 'participante');
const songById = (id) => songs.find((s) => s.id === id);
// Foto de perfil (si la puso) o sus iniciales.
const face = (m) => (m && m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(initials(m && m.name)));
const initials = (n) => String(n || '?').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const clearView = () => { viewSubs.forEach((u) => { try { u(); } catch { /* ya cerrado */ } }); viewSubs = []; };
const go = (hash) => { if (location.hash !== hash) location.hash = hash; else { tabNav = false; backNav = false; route(); } };
addEventListener('hashchange', () => { trackNav(); route(); });

// Cabecera: «‹» vuelve a la pantalla anterior (siempre a una pantalla concreta, no al historial
// del navegador). La navegación está en la barra de abajo.
function hero({ title = '', back = '', tall = false } = {}) {
  const chip = resumeChip();
  return `<div class="hero${tall ? ' tall' : ''}"><div class="hero-logo" aria-hidden="true"><div class="hl-art"><img class="s" src="medios-sol.png" alt=""><img class="a" src="medios-aguila.png" alt=""></div></div><div class="tools">` +
    (chip || (back ? `<button class="round" data-go="${back}" aria-label="Atrás">‹</button>` : '<span class="round ghost"></span>')) +
    `<button class="pill-logo al" data-go="#/" aria-label="Alabanza · inicio">${brandWord()}</button>` +
    (user && me && isMember() ? `<button class="round bell${unread() ? ' has' : ''}" data-go="#/avisos" aria-label="Avisos">${bellInner()}</button>` : '<span class="round ghost"></span>') + '</div>' +
    (title ? `<h1>${esc(title)}</h1>` : '') + '</div>';
}

// ---- Avisos: cuando envían una lista, comentan tu lista, sugieren un canto o alguien pide entrar ----
let notifs = [];
let notifsReady = false;
const SEEN_KEY = 'listas-avisos-visto';
const seenAt = () => { try { return Number(localStorage.getItem(SEEN_KEY) || 0); } catch { return 0; } };
// Los avisos que cada quien borra se guardan en su ficha (notifCleared = «borrar todo» hasta esa
// hora; notifHidden = borrados uno por uno): así quedan borrados en todos sus teléfonos y no se
// le borran a los demás.
const notifHidden = (n) => !!me && ((me.notifCleared && n.at <= me.notifCleared) || (Array.isArray(me.notifHidden) && me.notifHidden.includes(n.id)));
const forMe = (n) => (n.to === user.uid || (n.to === 'moderadores' && isMod())) && (api.demo || n.from !== user.uid) && !notifHidden(n);
const myNotifs = () => (user ? notifs.filter(forMe) : []);
const unread = () => myNotifs().filter((n) => n.at > seenAt()).length;
const bellBadge = () => { const n = unread(); return n ? `<b>${n > 9 ? '9+' : n}</b>` : ''; };
const bellInner = () => `<span class="bi">🔔</span>${bellBadge()}`;
// La campana se mece mientras haya avisos sin ver; con uno nuevo, suena fuerte y lanza una onda.
let bellLast = -1;
function updateBell(ring) {
  const n = unread();
  document.querySelectorAll('.bell').forEach((b) => {
    if (n !== bellLast || !b.querySelector('.bi')) b.innerHTML = bellInner();
    b.classList.toggle('has', n > 0);
    if (ring && !reducedMotion()) { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }
  });
  bellLast = n;
}
const NOTIF_IC = { lista: '📋', comentario: '💬', canto: '♫', equipo: '👤' };
function notify(to, data) {
  return Promise.resolve(api.addNotification({ to, ...data, from: user.uid, fromName: (me && me.name) || '' })).catch(() => {});
}
function onNotifs(list) {
  const before = new Set(notifs.map((n) => n.id));
  notifs = list;
  const fresh = notifsReady ? list.filter((n) => !before.has(n.id) && forMe(n) && n.at > seenAt()) : [];
  notifsReady = true;
  if (location.hash === '#/avisos') { renderNotifs(); try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* sin almacenamiento */ } }
  updateBell(fresh.length > 0);
  if (fresh.length) haptic([20, 60, 20]);
  fresh.slice(0, 3).forEach((n) => {
    toast(`${NOTIF_IC[n.kind] || '🔔'} ${n.text}`);
    systemNotify(n);
  });
}
// Aviso del sistema (la barra de notificaciones del teléfono) mientras la app está abierta.
async function systemNotify(n) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body: n.text, icon: 'icon-192.png', tag: n.id, data: { link: n.link || '#/avisos' } };
  try {
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
    if (reg) { reg.showNotification('Listas de alabanza', opts); return; }
    new Notification('Listas de alabanza', opts);
  } catch { /* este navegador no deja mostrar avisos aquí */ }
}
function viewNotifs() {
  $('view').innerHTML = `${hero({ title: 'Avisos', back: '#/' })}<div class="sheetbody">
    <div id="ntPerm"></div><div id="ntList"></div></div>`;
  // Lo nuevo se resalta mientras estás aquí, pero el número de la 🔔 se borra al entrar.
  shownSeen = seenAt();
  renderNotifs();
  clearSystemNotifs(); // al ver los avisos, se quitan también de la barra del teléfono
  try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* sin almacenamiento */ }
  updateBell();
  const perm = () => {
    const box = $('ntPerm');
    if (!box) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (!('Notification' in window)) {
      box.innerHTML = `<div class="hint" style="margin-bottom:12px">${ios && !standalone ? 'Para recibir avisos en el iPhone, primero <b>instala la app</b> (Compartir › «Agregar a inicio») y ábrela desde su ícono.' : 'Este navegador no muestra avisos del sistema; los verás aquí y en la 🔔.'}</div>`;
    } else if (Notification.permission === 'default') {
      box.innerHTML = '<button class="btn" id="ntAsk" style="margin-bottom:12px">🔔 Activar avisos en este teléfono</button>';
      $('ntAsk').onclick = async () => { await Notification.requestPermission(); perm(); if (Notification.permission === 'granted') toast('✓ Avisos activados'); };
    } else if (Notification.permission === 'denied') {
      box.innerHTML = '<div class="hint" style="margin-bottom:12px">Los avisos están bloqueados para esta app. Actívalos en los ajustes del navegador.</div>';
    } else box.innerHTML = '';
  };
  perm();
  // Al salir de la pantalla, todo lo que se vio queda como leído.
  viewSubs.push(() => { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* sin almacenamiento */ } updateBell(); });
}
let shownSeen = 0;
function renderNotifs() {
  const box = $('ntList');
  if (!box) return;
  const seen = shownSeen;
  const list = myNotifs();
  box.innerHTML = (list.length ? `<div class="sec" style="margin-top:0"><h3>${list.length} aviso${list.length === 1 ? '' : 's'}</h3><button class="link" id="ntClear">🗑 Borrar todo</button></div>` : '')
    + list.map((n) => `<div class="notif${n.at > seen ? ' new' : ''}" role="button" tabindex="0" data-go="${esc(n.link || '#/avisos')}" data-nid="${esc(n.id)}"><span class="ic">${NOTIF_IC[n.kind] || '🔔'}</span><span class="t"><b>${esc(n.text)}</b><small>${new Date(n.at).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span><button class="nt-del" data-delnotif="${esc(n.id)}" aria-label="Borrar este aviso">✕</button></div>`).join('')
    || `<div class="empty">Sin avisos.<br>${isMod() ? 'Aquí te llegará cuando alguien envíe su lista.' : 'Aquí verás cuando comenten tu lista.'}</div>`;
}
// Borrar avisos: el ✕ de cada uno (se va deslizando) o «Borrar todo».
async function hideNotifs(patch) {
  me = { ...me, ...patch }; // al instante en pantalla; la nube lo confirma después
  pendingHide = { ...pendingHide, ...patch };
  renderNotifs();
  updateBell();
  clearSystemNotifs();
  try { await api.updateMember(user.uid, patch); } catch (err) {
    toast(err && err.code === 'permission-denied' ? 'La nube no dejó guardar: vuelve a pegar las reglas en Firebase' : 'No se pudo guardar: revisa la conexión');
  }
}
// Mientras la nube confirma, la ficha que llega no debe «devolver» los avisos borrados.
let pendingHide = {};
function keepHidden(m) {
  if (!m || !Object.keys(pendingHide).length) return m;
  const done = (!pendingHide.notifCleared || m.notifCleared >= pendingHide.notifCleared)
    && (!pendingHide.notifHidden || pendingHide.notifHidden.every((id) => (m.notifHidden || []).includes(id)));
  if (done) { pendingHide = {}; return m; }
  return { ...m, notifCleared: Math.max(m.notifCleared || 0, pendingHide.notifCleared || 0), notifHidden: [...new Set([...(m.notifHidden || []), ...(pendingHide.notifHidden || [])])] };
}
// Quita también los avisos que quedaron en la barra de notificaciones del teléfono.
async function clearSystemNotifs(tag) {
  try {
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    (await reg.getNotifications(tag ? { tag } : {})).forEach((n) => n.close());
  } catch { /* este navegador no lo permite */ }
}
// Al borrar un comentario: su aviso se quita (para todos si se puede; si no, al menos para ti).
function removeNotifFor(cid) {
  if (!cid) return;
  for (const n of notifs.filter((x) => x.cid === cid)) {
    Promise.resolve(api.deleteNotification(n.id)).catch(() => {});
    clearSystemNotifs(n.id);
  }
  notifs = notifs.filter((x) => x.cid !== cid);
  renderNotifs();
  updateBell();
}
document.addEventListener('click', async (e) => {
  const del = e.target.closest('[data-delnotif]');
  if (del) {
    e.stopPropagation();
    const row = del.closest('.notif');
    if (row) { row.classList.add('leaving'); await wait(220); }
    const hidden = (Array.isArray(me.notifHidden) ? me.notifHidden : []).filter((id) => notifs.some((n) => n.id === id));
    hideNotifs({ notifHidden: [...hidden, del.dataset.delnotif].slice(-200) });
    haptic(8);
    return;
  }
  if (e.target.closest('#ntClear')) {
    e.stopPropagation();
    if (!confirm('¿Borrar todos los avisos? (Solo se borran para ti.)')) return;
    document.querySelectorAll('#ntList .notif').forEach((r, i) => { r.style.transitionDelay = `${i * 30}ms`; r.classList.add('leaving'); });
    await wait(260);
    // Hasta el aviso más nuevo que se ve (no la hora de este teléfono: otro teléfono con la hora
    // adelantada dejaba avisos sin borrar).
    const newest = Math.max(Date.now(), ...myNotifs().map((n) => n.at || 0));
    hideNotifs({ notifCleared: newest + 1, notifHidden: [] });
    toast('Avisos borrados');
  }
}, true);
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (!g) return;
  if (g.matches('.hero .round[data-go]')) backNav = true;
  closeSheet();
  go(g.dataset.go);
});

// ---- Barra de abajo: Nueva lista, Cantos, Equipo y Más ----
function renderTabbar() {
  const show = !!(user && me && isMember());
  $('tabbar').hidden = !show;
  if (!show) return;
  const h = location.hash.replace(/^#/, '') || '/';
  // Primera pestaña: Inicio (las fechas; desde ahí se crea o se continúa la lista).
  const on = h === '/' || h === '/nueva' || h.startsWith('/s/') ? 'inicio' : h === '/cantos' ? 'cantos' : h === '/equipo' ? 'equipo' : h === '/cuenta' ? 'mas' : '';
  $('tabbar').querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === on));
}
// La lista que estoy armando (la más próxima que aún no envío).
const myDraft = () => (user && canCreate() ? services.find((s) => s.by === user.uid && !sent(s) && s.date >= today()) : null);
$('tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  closeSheet();
  haptic(6);
  b.querySelector('i').classList.remove('bounce'); void b.offsetWidth; b.querySelector('i').classList.add('bounce');
  if (b.dataset.tab !== 'mas') tabNav = true;
  if (b.dataset.tab === 'inicio') go('#/');
  if (b.dataset.tab === 'cantos') go('#/cantos');
  if (b.dataset.tab === 'equipo') go('#/equipo');
  if (b.dataset.tab === 'mas') openMore();
});
function openMore() {
  const t = theme();
  openSheet(`<h2>Más</h2>
    <button class="date-row" data-go="#/"><span class="d" style="font-size:20px">⌂</span><span class="t"><b>Inicio</b><small>Las fechas de las listas</small></span></button>
    <button class="date-row" data-go="#/cuenta"><span class="d" style="font-size:20px">☺</span><span class="t"><b>Mi cuenta</b><small>Tu nombre e instalar la app</small></span></button>
    <button class="date-row" id="mrDark" role="switch" aria-checked="${isDark()}"><span class="d" style="font-size:20px">☾</span><span class="t"><b>Modo oscuro</b><small>Tócalo para cambiar</small></span><span class="switch${isDark() ? ' on' : ''}"><i></i></span></button>
    <label class="l">Apariencia</label>
    <div class="tabs" id="mrTheme">${[['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']].map(([k, n]) => `<button data-th="${k}" class="${t === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <button class="btn ghost" id="mrClose">Cerrar</button>`, () => {
    $('mrClose').onclick = () => closeSheet();
    $('mrDark').onclick = (e) => {
      const next = isDark() ? 'claro' : 'oscuro';
      $('mrDark').querySelector('.switch').classList.toggle('on', next === 'oscuro');
      $('mrDark').setAttribute('aria-checked', String(next === 'oscuro'));
      $('mrTheme').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.th === next));
      haptic();
      // El interruptor termina de moverse y entonces se abre el nuevo tema.
      setTimeout(() => setTheme(next, e), 180);
    };
    $('mrTheme').onclick = (e) => { const b = e.target.closest('[data-th]'); if (!b) return; setTheme(b.dataset.th, e); $('mrTheme').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); setTimeout(() => { if ($('mrDark')) $('mrDark').querySelector('.switch').classList.toggle('on', isDark()); }, 30); };
  });
}

// ---- Tema claro / oscuro ----
const theme = () => { try { return localStorage.getItem('listas-tema') || 'auto'; } catch { return 'auto'; } };
const isDark = () => document.documentElement.dataset.theme === 'dark';
function applyTheme() {
  const t = theme();
  const dark = t === 'oscuro' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#060a16' : '#0b2a6b');
}
// Cambio de tema con animación: un círculo que se abre desde el botón tocado.
function setTheme(t, ev) {
  try { localStorage.setItem('listas-tema', t); } catch { /* sin almacenamiento */ }
  const root = document.documentElement;
  if (ev && ev.clientX != null) { root.style.setProperty('--tx', ev.clientX + 'px'); root.style.setProperty('--ty', ev.clientY + 'px'); }
  const wasDark = isDark();
  const willDark = t === 'oscuro' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (wasDark === willDark) { applyTheme(); return; }
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) { document.startViewTransition(applyTheme); return; }
  root.classList.add('theming');
  applyTheme();
  setTimeout(() => root.classList.remove('theming'), 1000);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
applyTheme();

function route() {
  clearView();
  closeSheet();
  closeChartReader(true);
  $('view').onclick = null;
  $('view').onchange = null;
  $('view').onkeydown = null;
  renderTabbar();
  renderViewAsBar();
  scrollTo(0, 0);
  renderRoute();
  animateView();
  // La bienvenida se va cuando ya hay algo que mostrar (en Inicio, cuando llegaron las listas).
  if (!user || !me || !isMember() || servicesLoaded) hideSplash();
}
function renderRoute() {
  if (!user) return viewLogin();
  if (!me) return viewName();
  if (!isMember()) return viewPending();
  const h = location.hash.replace(/^#/, '') || '/';
  const pk = /^\/s\/(\d{4}-\d{2}-\d{2})\/cantos$/.exec(h);
  if (pk) return viewPicker(pk[1]);
  const m = /^\/s\/(\d{4}-\d{2}-\d{2})(?:\/(\w+))?$/.exec(h);
  if (m) return viewService(m[1], m[2]);
  if (h === '/nueva') return canCreate() ? viewNew() : viewHome();
  if (h === '/avisos') return viewNotifs();
  if (h === '/cantos') return viewSongs();
  if (h === '/equipo') return viewTeam();
  if (h === '/cuenta') return viewAccount();
  return viewHome();
}
// Quién puede cambiar la lista de una fecha: el moderador, o quien la creó mientras no esté cerrada.
const canEditList = (s) => isMod() || (!!s && canCreate() && s.by === user.uid);

// ======================================================================================
// Hojas (paneles que suben desde abajo)
// ======================================================================================
let sheetSubs = [];
let sheetToken = 0;
const runSheetSubs = () => { sheetSubs.forEach((f) => { try { f(); } catch { /* ya cerrado */ } }); sheetSubs = []; };
function openSheet(html, onReady) {
  sheetToken++;
  runSheetSubs();
  const bg = $('sheetBg'), sh = $('sheet');
  bg.classList.remove('closing');
  sh.style.transform = ''; sh.style.transition = ''; bg.style.opacity = '';
  sh.innerHTML = '<div class="grab"></div>' + html;
  sh.scrollTop = 0;
  bg.classList.add('open');
  if (onReady) onReady(sh);
}
// Se cierra deslizándose hacia abajo (o al instante, si se pide).
function closeSheet(instant) {
  const bg = $('sheetBg'), sh = $('sheet');
  runSheetSubs();
  if (!bg.classList.contains('open')) return;
  const tk = ++sheetToken;
  const done = () => { if (tk !== sheetToken) return; bg.classList.remove('open', 'closing'); sh.innerHTML = ''; sh.style.transform = ''; sh.style.transition = ''; bg.style.opacity = ''; };
  if (instant === true || reducedMotion()) { done(); return; }
  bg.classList.add('closing');
  setTimeout(done, 280);
}
$('sheetBg').addEventListener('click', (e) => { if (e.target === $('sheetBg')) closeSheet(); });

// ======================================================================================
// Movimiento: carga, transiciones, gestos y microinteracciones
// ======================================================================================
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const haptic = (ms = 8) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* sin vibración */ } };
// Botón «cargando»: muestra un círculo girando mientras termina la tarea.
function busy(btn, promise) {
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  return Promise.resolve(promise).finally(() => { if (btn) { btn.classList.remove('loading'); btn.disabled = false; } });
}
// Sacudida (por ejemplo, contraseña incorrecta o campo vacío).
function shake(el) {
  if (!el) return;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  haptic(30);
}
// Onda al tocar los botones principales.
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn, .get, .send button, .date-row, .notif, .ticket .bottom button, .pick, .member.tap');
  if (!b || b.disabled || reducedMotion()) return;
  const r = b.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s);
  setTimeout(() => s.remove(), 650);
}, { passive: true });

// Pestañas (Automático/Claro/Oscuro, Agregados/Sugeridos…): una píldora que se desliza a la elegida.
function placeTabs(tabs, animate = true) {
  let ind = tabs.querySelector(':scope > .ind');
  if (!ind) { ind = document.createElement('i'); ind.className = 'ind'; tabs.prepend(ind); tabs.classList.add('has-ind'); animate = false; }
  const on = tabs.querySelector(':scope > button.on');
  if (!on) { ind.style.opacity = '0'; return; }
  ind.style.transition = animate ? '' : 'none';
  ind.style.opacity = '1';
  ind.style.width = on.offsetWidth + 'px';
  ind.style.transform = `translateX(${on.offsetLeft - 4}px)`;
  if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
}
new MutationObserver((muts) => {
  const seen = new Set();
  muts.forEach((m) => {
    const el = m.target.nodeType === 1 ? m.target : null;
    if (!el) return;
    if (m.type === 'attributes') { const t = el.parentElement && el.parentElement.closest('.tabs'); if (t) seen.add(t); return; }
    el.querySelectorAll('.tabs').forEach((t) => seen.add(t));
    if (el.classList.contains('tabs')) seen.add(el);
  });
  seen.forEach((t) => requestAnimationFrame(() => placeTabs(t)));
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
addEventListener('resize', () => document.querySelectorAll('.tabs.has-ind').forEach((t) => placeTabs(t, false)));

// ---- Transiciones de navegación ----
// Adelante: la pantalla entra desde la derecha; atrás: desde la izquierda; pestañas: sube suave.
let navStack = [location.hash || '#/'];
let pendingNav = null;
let tabNav = false;
function trackNav() {
  const h = location.hash || '#/';
  if (tabNav) { pendingNav = 'tab'; navStack = [h]; tabNav = false; return; }
  if (navStack.length > 1 && navStack[navStack.length - 2] === h) { navStack.pop(); pendingNav = 'back'; }
  else if (backNav) { pendingNav = 'back'; navStack.pop(); navStack[navStack.length - 1] = h; }
  else { navStack.push(h); if (navStack.length > 30) navStack.shift(); pendingNav = 'fwd'; }
  backNav = false;
}
let backNav = false;
function animateView() {
  const v = $('view');
  const kind = pendingNav;
  pendingNav = null;
  v.classList.remove('nav-fwd', 'nav-back', 'nav-tab');
  if (!kind || reducedMotion()) return;
  void v.offsetWidth;
  v.classList.add('nav-' + kind);
  clearTimeout(animateView.t);
  animateView.t = setTimeout(() => v.classList.remove('nav-' + kind), 900);
}

// ---- Gesto: deslizar desde el borde izquierdo para volver ----
(function edgeSwipe() {
  let sx = 0, sy = 0, dx = 0, on = false, decided = false, target = '', t0 = 0;
  const parts = () => [...$('view').children];
  const hint = document.createElement('div');
  hint.className = 'edge-hint';
  hint.textContent = '‹';
  document.body.appendChild(hint);
  addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || $('sheetBg').classList.contains('open')) return;
    const t = e.touches[0];
    if (t.clientX > 28) return;
    const back = $('view').querySelector('.hero .tools .round[data-go]');
    if (!back) return;
    target = back.dataset.go; sx = t.clientX; sy = t.clientY; dx = 0; on = true; decided = false; t0 = Date.now();
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!on) return;
    const t = e.touches[0];
    dx = Math.max(0, t.clientX - sx);
    if (!decided) {
      if (Math.abs(t.clientY - sy) > 14 && Math.abs(t.clientY - sy) > dx) { on = false; return; }
      if (dx < 8) return;
      decided = true;
    }
    e.preventDefault();
    const k = Math.min(1, dx / innerWidth);
    parts().forEach((p) => { p.style.transition = 'none'; p.style.transform = `translateX(${dx}px)`; });
    $('view').style.setProperty('--edge', k);
    hint.style.opacity = Math.min(1, dx / 90);
    hint.style.transform = `translate(${Math.min(dx, 90) - 50}px, -50%) scale(${0.6 + Math.min(1, dx / 120) * 0.4})`;
  }, { passive: false });
  addEventListener('touchend', () => {
    if (!on) return;
    on = false;
    const fast = dx > 40 && dx / Math.max(1, Date.now() - t0) > 0.5;
    const ok = decided && (dx > innerWidth * 0.33 || fast);
    hint.style.opacity = 0; hint.style.transform = '';
    parts().forEach((p) => { p.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)'; p.style.transform = ok ? `translateX(${innerWidth}px)` : ''; });
    if (ok) { haptic(); setTimeout(() => { backNav = true; go(target); }, 200); }
    else setTimeout(() => parts().forEach((p) => { p.style.transition = ''; }), 300);
  });
}());

// ---- Gesto: arrastrar una hoja hacia abajo para cerrarla ----
(function sheetDrag() {
  const sh = $('sheet'), bg = $('sheetBg');
  let sy = 0, dy = 0, on = false, t0 = 0, dragging = false;
  sh.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const fromGrab = e.target.closest('.grab');
    if (!fromGrab && sh.scrollTop > 0) return;
    if (e.target.closest('input, textarea, select, .keys, .chart, .video')) return;
    sy = e.touches[0].clientY; dy = 0; on = true; dragging = false; t0 = Date.now();
  }, { passive: true });
  sh.addEventListener('touchmove', (e) => {
    if (!on) return;
    dy = e.touches[0].clientY - sy;
    if (dy <= 0 && !dragging) { on = false; return; }
    dragging = true;
    e.preventDefault();
    const d = Math.max(0, dy);
    sh.style.transition = 'none';
    sh.style.transform = `translateY(${d}px)`;
    bg.style.opacity = String(Math.max(0.3, 1 - d / 500));
  }, { passive: false });
  sh.addEventListener('touchend', () => {
    if (!on) return;
    on = false;
    if (!dragging) return;
    const fast = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.6;
    sh.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
    bg.style.transition = 'opacity .28s';
    if (dy > 120 || fast) {
      sh.style.transform = 'translateY(105%)'; bg.style.opacity = '0';
      haptic();
      setTimeout(() => { closeSheet(true); bg.style.transition = ''; }, 260);
    } else { sh.style.transform = ''; bg.style.opacity = ''; setTimeout(() => { bg.style.transition = ''; }, 300); }
  });
}());

// ---- Gesto: deslizar hacia abajo (arriba de todo) para actualizar ----
// Pide a la nube lo último de todo (listas, cantos, avisos) y busca si hay versión nueva de la app.
// No vuelve a dibujar la pantalla: lo que estés escribiendo (notas, comentarios, un canto) se queda.
(function pullToRefresh() {
  const ind = document.createElement('div');
  ind.className = 'ptr';
  ind.innerHTML = '<i>↓</i>';
  document.body.appendChild(ind);
  let sy = 0, sx = 0, dy = 0, on = false, pulling = false, busyRefresh = false;
  const LIMIT = 70;
  addEventListener('touchstart', (e) => {
    if (busyRefresh || e.touches.length !== 1 || scrollY > 2 || $('sheetBg').classList.contains('open')) return;
    if (e.target.closest('input, textarea, select, .hscroll, .tabbar, .keys, iframe, .video')) return;
    sy = e.touches[0].clientY; sx = e.touches[0].clientX; dy = 0; on = true; pulling = false;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!on) return;
    const t = e.touches[0];
    dy = t.clientY - sy;
    if (!pulling) {
      if (dy < 6 || Math.abs(t.clientX - sx) > Math.abs(dy)) { if (dy < 0 || Math.abs(t.clientX - sx) > 12) on = false; return; }
      if (scrollY > 2) { on = false; return; }
      pulling = true;
    }
    e.preventDefault();
    const d = Math.min(110, dy * 0.5);
    ind.style.transition = 'none';
    ind.style.opacity = String(Math.min(1, d / 40));
    ind.style.transform = `translate(-50%, ${d}px) rotate(${Math.min(180, (d / LIMIT) * 180)}deg)`;
    ind.classList.toggle('ready', d >= LIMIT);
  }, { passive: false });
  addEventListener('touchend', async () => {
    if (!on) return;
    on = false;
    if (!pulling) return;
    const go = Math.min(110, dy * 0.5) >= LIMIT;
    ind.style.transition = '';
    if (!go) { ind.style.opacity = '0'; ind.style.transform = 'translate(-50%, 0)'; ind.classList.remove('ready'); return; }
    busyRefresh = true;
    haptic(12);
    ind.classList.add('spin');
    ind.style.transform = 'translate(-50%, 56px)';
    const t0 = Date.now();
    try {
      await Promise.all([
        api && api.refresh ? api.refresh() : null,
        navigator.serviceWorker && navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}),
      ]);
      await wait(Math.max(0, 600 - (Date.now() - t0))); // que se alcance a ver que actualizó
      toast('✓ Actualizado');
    } catch { toast('Sin conexión: se muestra lo último guardado'); }
    ind.classList.remove('spin', 'ready');
    ind.style.opacity = '0';
    ind.style.transform = 'translate(-50%, 0)';
    busyRefresh = false;
  });
}());

// ---- Celebración: palomita que se dibuja y confeti (al enviar una lista o crear un usuario) ----
function celebrate(text) {
  haptic([12, 40, 18]);
  if (reducedMotion()) { toast('✓ ' + text); return; }
  const el = document.createElement('div');
  el.className = 'celebrate';
  const colors = ['#36d1e6', '#1f6fd1', '#17b26a', '#f0b400', '#7a5cff', '#ffffff'];
  const bits = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2, r = 90 + Math.random() * 60;
    return `<i style="--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;--c:${colors[i % colors.length]};--d:${Math.random() * 0.12}s"></i>`;
  }).join('');
  el.innerHTML = `<div class="cel-in"><div class="cel-burst">${bits}</div><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34"/><path d="M24 41l11 11 22-24"/></svg><b>${esc(text)}</b></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 1250);
  setTimeout(() => el.remove(), 1700);
}

// ---- Pantalla de bienvenida (splash) ----
const splashT0 = Date.now();
function hideSplash() {
  const sp = $('splash');
  if (!sp || sp.classList.contains('out')) return;
  const left = Math.max(0, 600 - (Date.now() - splashT0));
  setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 700); }, left);
}
setTimeout(hideSplash, 7000); // por si la red tarda: no se queda la bienvenida para siempre

// ======================================================================================
// Entrar
// ======================================================================================
function viewLogin() {
  $('view').innerHTML = `<div class="login-wrap">${hero({ title: 'Bienvenido', tall: true })}<div class="sheetbody">
    <p class="hello">Listas de alabanza</p><h2 class="big">Entra con tu correo</h2>
    <input id="lgEmail" type="email" autocomplete="email" placeholder="tu@correo.com">
    <input id="lgPass" type="password" autocomplete="current-password" placeholder="Contraseña (mínimo 6)">
    <div class="err" id="lgErr"></div>
    <button class="btn" id="lgIn">Entrar</button>
    <button class="link center" id="lgReset">Olvidé mi contraseña</button>
    <div class="hint">🔒 Las cuentas las crea un <b>moderador</b>. Pídele tu correo y tu contraseña. Al entrar, la app recuerda tu sesión.</div>
    <div id="lgFirst"></div>
  </div></div>`;
  const err = (e) => { shake($('lgIn')); $('lgErr').textContent = authError(e); };
  const vals = () => [$('lgEmail').value.trim(), $('lgPass').value];
  $('lgIn').onclick = () => busy($('lgIn'), api.signIn(...vals())).catch(err);
  $('lgPass').onkeydown = (e) => { if (e.key === 'Enter') $('lgIn').click(); };
  // Solo la primera vez (nube vacía): crear la cuenta del moderador principal.
  api.hasOwner().then((has) => {
    if (has || !$('lgFirst')) return;
    $('lgFirst').innerHTML = '<div class="hint"><b>Primera vez</b>: escribe arriba tu correo y una contraseña para crear la cuenta del <b>moderador principal</b>.<button class="btn ghost" id="lgUp" style="margin-top:10px">Crear cuenta de moderador</button></div>';
    $('lgUp').onclick = () => busy($('lgUp'), api.signUp(...vals())).catch(err);
  });
  $('lgReset').onclick = () => { const e = $('lgEmail').value.trim(); if (!e) { $('lgErr').textContent = 'Escribe tu correo arriba'; return; } api.reset(e).then(() => toast('Te enviamos un correo para cambiar la contraseña')).catch(err); };
}
const AUTH_ERR = { 'auth/invalid-credential': 'Correo o contraseña incorrectos', 'auth/wrong-password': 'Correo o contraseña incorrectos', 'auth/user-not-found': 'Correo o contraseña incorrectos', 'auth/email-already-in-use': 'Ese correo ya tiene una cuenta', 'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres', 'auth/invalid-email': 'Ese correo no es válido', 'auth/too-many-requests': 'Demasiados intentos: espera un momento', 'auth/requires-recent-login': 'Por seguridad, sal y vuelve a entrar para cambiar la contraseña', 'auth/network-request-failed': 'Sin conexión a internet', 'auth/operation-not-allowed': 'Falta activar «Correo electrónico/contraseña» en Firebase › Authentication', 'auth/unauthorized-domain': 'Esta dirección no está autorizada en Firebase › Authentication › Dominios autorizados', 'permission-denied': 'La nube no dejó guardar: revisa que las reglas estén publicadas' };
const authError = (e) => AUTH_ERR[e && e.code] || (e && e.message) || 'Algo salió mal';

// Con sesión iniciada pero sin ficha en el equipo: o es la primera cuenta (moderador principal)
// o es una cuenta a la que un moderador le quitó el acceso.
function viewName() {
  $('view').innerHTML = `<div class="login-wrap">${hero({ title: 'Un momento', tall: true })}<div class="sheetbody"><div class="spinner big-spin"></div></div></div>`;
  api.hasOwner().then((has) => {
    if (me || !user) return;
    if (has) {
      $('view').innerHTML = `<div class="login-wrap">${hero({ title: 'Sin acceso', tall: true })}<div class="sheetbody">
        <h2 class="big">Esta cuenta no tiene acceso</h2><p class="muted">${esc(user.email || '')}<br>Pide a un moderador que te cree una cuenta o que te devuelva el acceso.</p>
        <button class="btn ghost" id="nmOut">Salir</button></div></div>`;
      $('nmOut').onclick = () => api.signOut();
      return;
    }
    $('view').innerHTML = `<div class="login-wrap">${hero({ title: 'Moderador principal', tall: true })}<div class="sheetbody">
      <h2 class="big">¿Cómo te llamas?</h2><p class="muted">Serás el <b>moderador principal</b>. Después creas las cuentas del equipo desde «Equipo».</p>
      <input id="nmName" maxlength="40" placeholder="Tu nombre">
      <input id="nmRole" maxlength="40" placeholder="Qué haces (ej. guitarra, voz, batería)">
      <button class="btn" id="nmOk">Continuar</button></div></div>`;
    $('nmOk').onclick = async () => {
      const name = $('nmName').value.trim();
      if (!name) { shake($('nmName')); toast('Escribe tu nombre'); return; }
      await busy($('nmOk'), api.createMember(user.uid, { name, instrument: $('nmRole').value.trim(), email: user.email || '' })).catch((e) => toast(authError(e)));
    };
  });
}
function viewPending() {
  $('view').innerHTML = `<div class="login-wrap">${hero({ title: 'Esperando aprobación', tall: true })}<div class="sheetbody">
    <h2 class="big">Hola, ${esc(me.name)}</h2>
    <p class="muted">El moderador tiene que aprobar tu cuenta. Cuando lo haga, esta pantalla cambia sola.</p>
    <button class="btn ghost" id="pdOut">Salir</button></div></div>`;
  $('pdOut').onclick = () => api.signOut();
}

// ======================================================================================
// Pantalla 1: inicio con las fechas de las listas
// ======================================================================================
function viewHome() {
  let q = '';
  let entered = false;
  const render = () => {
    // Mientras llegan las listas: tarjetas «fantasma» que brillan.
    if (!servicesLoaded) {
      $('dates').innerHTML = '<div class="date-card skel"><div class="img"></div><i></i><i class="s"></i></div>'.repeat(3);
      $('past').innerHTML = '<div class="date-row skel"><span class="d"></span><span class="t"><i></i><i class="s"></i></span></div>'.repeat(2);
      return;
    }
    // Las tarjetas entran en cascada solo la primera vez.
    const enter = !entered && !reducedMotion();
    entered = true;
    // Si dejaste una lista a medias, aquí la continúas.
    const d = myDraft();
    $('hmDraft').innerHTML = d ? `<button class="draft-card" data-open="${d.date}"><span class="ic">✎</span><span class="t"><b>Continuar mi lista</b><small>${esc(niceDate(d.date))} · ${esc(d.title || 'Servicio')} · aún no la envías</small></span><span class="go">›</span></button>` : '';
    const up = services.filter((s) => s.date >= today());
    const past = services.filter((s) => s.date < today()).reverse();
    const filt = (s) => !q || (niceDate(s.date) + ' ' + (s.title || '') + ' ' + (s.leaderName || '')).toLowerCase().includes(q);
    $('dates').innerHTML = up.filter(filt).map((s, i) => {
      const d = parseKey(s.date);
      return `<button class="date-card${enter ? ' enter' : ''}" style="--i:${i}" data-open="${s.date}">${canEditList(s) ? `<span class="edit" data-edit="${s.date}" role="button" aria-label="Editar">✎</span>` : ''}
        <div class="img"><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()]}</span></div>
        <h4>${esc(s.title || niceDate(s.date))}</h4><small>${s.leaderName ? '🎤 ' + esc(s.leaderName) + '<br>' : ''}${DAYS[d.getDay()]} · ${s.count != null ? s.count + ' cantos · ' : ''}${statusPill(s)}</small></button>`;
    }).join('') || '<div class="empty" style="flex:1">Aún no hay fechas. Crea la primera con «＋ Nueva lista».</div>';
    $('past').innerHTML = past.filter(filt).slice(0, 8).map((s) => {
      const d = parseKey(s.date);
      return `<button class="date-row" data-open="${s.date}"><span class="d">${d.getDate()}<small>${MONTHS[d.getMonth()].toUpperCase()}</small></span><span class="t"><b>${esc(s.title || niceDate(s.date))}</b><small>${niceDate(s.date)}</small></span>${statusPill(s)}</button>`;
    }).join('') || '<div class="empty">Sin listas anteriores</div>';
  };
  $('view').innerHTML = `${hero()}<div class="sheetbody">
    <button class="avatar-float" data-go="#/cuenta">${face(me)}</button>
    <div class="hello">Hola, ${esc(me.name.split(' ')[0])}</div>
    <h2 class="big">Listas de alabanza</h2>
    <div class="search"><span>🔍</span><input id="hmSearch" placeholder="Buscar fecha, servicio o quién ministra…"></div>
    <div id="hmDraft"></div>
    <div class="sec"><h3>Próximas fechas</h3>${canCreate() ? '<button class="new-pill" data-go="#/nueva">＋ Nueva lista</button>' : ''}</div>
    <div class="hscroll" id="dates"></div>
    <div class="sec"><h3>Anteriores</h3></div>
    <div id="past"></div>
  </div>`;
  $('hmSearch').oninput = (e) => { q = e.target.value.trim().toLowerCase(); render(); };
  $('view').onclick = (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { e.stopPropagation(); editService(ed.dataset.edit); return; }
    const op = e.target.closest('[data-open]');
    if (op) { go('#/s/' + op.dataset.open); }
  };
  render();
  viewSubs.push(onServices(render));
}
// Lista de servicios compartida por las pantallas (se escucha una sola vez).
const serviceListeners = new Set();
const onServices = (fn) => { serviceListeners.add(fn); return () => serviceListeners.delete(fn); };

// Miembros aprobados (para elegir quién ministra). Se cargan al usarlos.
let membersCache = [];
let membersOff = null;
function loadMembers(cb) {
  if (!membersOff) membersOff = api.watchMembers((list) => { membersCache = list.filter((m) => m.role === 'moderador' || m.role === 'colaborador'); if (cb) cb(); });
  else if (cb) cb();
}
const leaderOptions = (sel) => {
  const list = membersCache.length ? membersCache : [{ id: user.uid, name: me.name }];
  if (!list.some((m) => m.id === user.uid)) list.unshift({ id: user.uid, name: me.name });
  return list.map((m) => `<option value="${esc(m.id)}"${m.id === sel ? ' selected' : ''}>${esc(m.name)}${m.instrument ? ' · ' + esc(m.instrument) : ''}</option>`).join('');
};

// Editar los datos de una lista ya creada (moderador o quien la creó).
// Eliminar una lista: se confirma en una hoja (con el nombre y la fecha) antes de borrarla.
function confirmDeleteList(date) {
  const s = services.find((x) => x.date === date) || { date };
  openSheet(`<div class="del-ic">🗑</div><h2 style="text-align:center">¿Eliminar esta lista?</h2>
    <p class="muted center" style="margin:0">${esc(s.title || 'Servicio')} · ${esc(niceDate(date))}${s.leaderName ? ' · ministra ' + esc(s.leaderName) : ''}<br>Se borran también sus cantos y comentarios. No se puede deshacer.</p>
    <button class="btn red" id="dlOk" style="background:var(--red);color:#fff">Sí, eliminar</button>
    <button class="btn ghost" id="dlNo">Cancelar</button>`, () => {
    $('dlNo').onclick = () => closeSheet();
    $('dlOk').onclick = async () => {
      await busy($('dlOk'), api.deleteService(date));
      closeSheet(); toast('Lista eliminada'); haptic(20);
      if (location.hash.startsWith('#/s/' + date)) { backNav = true; go('#/'); }
    };
  });
}
function editService(date) {
  const s = services.find((x) => x.date === date);
  if (!s) return;
  openSheet(`<h2>Editar lista · ${esc(niceDate(date))}</h2>
    <label class="l">Quién ministra</label><select id="esLeader">${leaderOptions(s.leader || s.by)}</select>
    <label class="l">Nombre del servicio</label><input id="esTitle" maxlength="60" value="${esc(s.title || '')}" placeholder="Culto general, Santa Cena…">
    <label class="l">Nota para el equipo</label><textarea id="esNote" maxlength="400" placeholder="Indicaciones generales">${esc(s.note || '')}</textarea>
    <button class="btn" id="esSave">Guardar</button>
    <button class="btn ghost" id="esSongs">✎ Editar cantos y orden</button>
    <button class="btn red" id="esDel">Borrar esta lista</button>
    <button class="btn ghost" id="esCancel">Cancelar</button>`, () => {
    loadMembers(() => { if ($('esLeader')) $('esLeader').innerHTML = leaderOptions(s.leader || s.by); });
    $('esCancel').onclick = closeSheet;
    $('esSongs').onclick = () => { closeSheet(); go(`#/s/${date}/cantos`); };
    $('esSave').onclick = async () => {
      const lid = $('esLeader').value;
      const leader = membersCache.find((m) => m.id === lid) || { id: user.uid, name: me.name };
      await api.saveService(date, { title: $('esTitle').value.trim(), note: $('esNote').value.trim(), leader: leader.id, leaderName: leader.name });
      closeSheet();
      toast('Lista guardada');
    };
    $('esDel').onclick = () => confirmDeleteList(date);
  });
}

// ---- Crear una lista en pasos ----
// Paso 1: quién ministra y qué fecha. Paso 2: elegir y ordenar los cantos. Paso 3: detalles.
const stepsBar = (n) => `<div class="steps">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'on' : ''}"></span>`).join('')}</div>`;
function viewNew() {
  $('view').innerHTML = `${hero({ title: 'Nueva lista', back: '#/' })}<div class="sheetbody">
    ${stepsBar(1)}
    <div class="hello">Paso 1 de 3</div>
    <h2 class="big">¿Quién ministra y cuándo?</h2>
    <label class="l">Quién ministra</label><select id="nwLeader">${leaderOptions(user.uid)}</select>
    <label class="l" style="margin-top:12px">Fecha</label><input type="date" id="nwDate" value="${nextSunday()}">
    <label class="l" style="margin-top:12px">Servicio</label><input id="nwTitle" maxlength="60" value="Culto general" placeholder="Culto general, Santa Cena…">
    <div style="height:18px"></div>
    <button class="btn" id="nwNext">Siguiente: elegir cantos →</button>
  </div>`;
  loadMembers(() => { if ($('nwLeader')) $('nwLeader').innerHTML = leaderOptions($('nwLeader').value || user.uid); });
  $('nwNext').onclick = async () => {
    const date = $('nwDate').value;
    if (!date) { toast('Elige la fecha'); return; }
    const exists = services.find((s) => s.date === date);
    if (exists) {
      if (canEditList(exists)) { go(`#/s/${date}/cantos`); return; }
      toast(`Ya hay una lista para el ${niceDate(date)}${exists.leaderName ? ' (ministra ' + exists.leaderName + ')' : ''}. Ábrela desde Inicio.`);
      return;
    }
    const lid = $('nwLeader').value;
    const leader = membersCache.find((m) => m.id === lid) || { id: user.uid, name: me.name };
    try {
      await api.saveService(date, { title: $('nwTitle').value.trim() || 'Culto general', note: '', status: 'borrador', by: user.uid, byName: me.name, leader: leader.id, leaderName: leader.name });
    } catch (e) { toast('No se pudo crear la lista: ' + (e.message || e)); return; }
    go(`#/s/${date}/cantos`);
  };
}

// Paso 2: buscador con + y −, y «Tu lista» con el orden (↑ ↓).
function viewPicker(date) {
  let items = [];
  let q = '';
  const s = () => services.find((x) => x.date === date) || { date };
  $('view').innerHTML = `${hero({ title: niceDate(date), back: '#/s/' + date })}<div class="sheetbody" style="padding-bottom:calc(var(--nav-h) + 90px)">
    ${stepsBar(2)}
    <div class="hello">Paso 2 de 3</div>
    <h2 class="big">Elige los cantos</h2>
    <div class="sec" style="margin-top:4px"><h3>Tu lista <span class="muted small" id="pkCount"></span></h3></div>
    <div id="pkMine"></div>
    <div class="sec"><h3>Agregar</h3><button class="link" id="pkNew">＋ Canto nuevo</button></div>
    <div class="search" style="margin-bottom:12px"><span>🔍</span><input id="pkQ" placeholder="Buscar canto o autor…"></div>
    <div id="pkAll"></div>
  </div>
  <div class="next-bar"><button class="btn" id="pkNext">Siguiente: detalles →</button></div>`;
  // Lo último que tocaste se anima al volver a dibujarse (aparece, sube/baja o cambia ＋ por −).
  let fxKey = '', fxUntil = 0;
  const fx = (k) => { fxKey = k; fxUntil = Date.now() + 700; };
  const fxOn = (k) => k === fxKey && Date.now() < fxUntil;
  const render = () => {
    if (!canEditList(s())) { $('pkMine').innerHTML = '<div class="empty">Esta lista es de otra persona: solo puedes agregar cantos desde su pantalla.</div>'; }
    const inList = new Map(items.map((it) => [it.songId, it]));
    $('pkCount').textContent = items.length ? `· ${items.length} canto${items.length === 1 ? '' : 's'}` : '';
    if (canEditList(s())) {
      $('pkMine').innerHTML = items.map((it, i) => {
        const song = songById(it.songId) || {};
        return `<div class="pick${fxOn(it.songId) || fxOn(it.id) ? ' pop' : ''}"><span class="mine-num">${i + 1}</span><span class="t"><b>${esc(song.title || it.title || 'Canto')}</b><small>${esc(it.key || song.key || '—')}${song.author ? ' · ' + esc(song.author) : ''}</small></span>
          <span class="order-btns"><button data-up="${it.id}" aria-label="Subir">▲</button><button data-down="${it.id}" aria-label="Bajar">▼</button></span>
          <button class="pm rem" data-rem="${it.id}" aria-label="Quitar">−</button></div>`;
      }).join('') || '<div class="empty">Aún no elegiste cantos. Búscalos abajo y toca <b>＋</b>.</div>';
    }
    $('pkAll').innerHTML = songs.filter((x) => !q || (x.title + ' ' + (x.author || '')).toLowerCase().includes(q)).map((x) => {
      const it = inList.get(x.id);
      return `<div class="pick"><span class="t"><b>${esc(x.title)}</b><small>${esc(x.key || '—')}${x.author ? ' · ' + esc(x.author) : ''}${x.status === 'sugerido' ? ' · sugerido' : ''}</small></span>
        ${it ? `<button class="pm rem${fxOn(x.id) ? ' morph' : ''}" data-rem="${it.id}" aria-label="Quitar">−</button>` : `<button class="pm add${fxOn('out:' + x.id) ? ' morph' : ''}" data-add="${x.id}" aria-label="Agregar">＋</button>`}</div>`;
    }).join('') || '<div class="empty">Sin resultados. Créalo con «＋ Canto nuevo».</div>';
  };
  const move = async (id, dir) => {
    const i = items.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const a = items[i], b = items[j];
    await Promise.all([api.updateItem(date, a.id, { order: b.order }), api.updateItem(date, b.id, { order: a.order })]);
  };
  $('view').onclick = async (e) => {
    const t = e.target;
    const add = t.closest('[data-add]');
    if (add) { const song = songById(add.dataset.add); haptic(); fx(song.id); await addToList(date, items, song.id, song, true); return; }
    const rem = t.closest('[data-rem]');
    if (rem) {
      const it = items.find((x) => x.id === rem.dataset.rem);
      if (it) fx('out:' + it.songId);
      // El renglón se va deslizando antes de quitarlo.
      const row = $('pkMine').querySelector(`[data-rem="${rem.dataset.rem}"]`);
      if (row) { row.closest('.pick').classList.add('leaving'); await wait(220); }
      await api.deleteItem(date, rem.dataset.rem); return;
    }
    const up = t.closest('[data-up]');
    if (up) { fx(up.dataset.up); await move(up.dataset.up, -1); return; }
    const dn = t.closest('[data-down]');
    if (dn) { fx(dn.dataset.down); await move(dn.dataset.down, 1); return; }
    if (t.closest('#pkNew')) { editSong(null, { title: $('pkQ').value.trim(), addTo: { date, items, stay: true } }); return; }
    if (t.closest('#pkNext')) go(`#/s/${date}`);
  };
  $('pkQ').oninput = (e) => { q = e.target.value.trim().toLowerCase(); render(); };
  viewSubs.push(api.watchItems(date, (list) => { items = list; render(); }));
  viewSubs.push(onSongs(render));
  viewSubs.push(onServices(render));
}

// ======================================================================================
// Charts: los archivos (fotos y PDF) se guardan en el teléfono la primera vez que se abren o se
// precargan, así después abren al instante (y sin señal). Un archivo nunca cambia (si se sube
// otro, tiene otro id), por eso la copia guardada siempre sirve.
// ======================================================================================
const FILE_CACHE = 'listas-archivos';
const fileMem = new Map(); // id de archivo -> Promise<{ url, type, blob }>
const filesOf = new Map(); // id de canto -> Promise<[datos de sus archivos]>
const b64ToBlob = async (b64, type) => (await fetch(`data:${type};base64,${b64}`)).blob();
const isAudio = (f) => /^audio\//.test((f && f.type) || '') || (f && f.kind === 'audio');
function songFiles(songId) {
  if (filesOf.has(songId)) return filesOf.get(songId);
  const p = Promise.resolve(api.listFiles(songId)).then((l) => (l || []).sort((a, b) => (a.at || 0) - (b.at || 0)));
  filesOf.set(songId, p);
  p.catch(() => filesOf.delete(songId));
  return p;
}
// Tamaño real esperado de un archivo según su tamaño en texto (base64): sirve para saber si una
// copia guardada en el teléfono está completa.
const expectedBytes = (f) => (f && f.size ? Math.floor((f.size * 3) / 4) : 0);
const sizeOk = (blob, f) => !expectedBytes(f) || Math.abs(blob.size - expectedBytes(f)) <= 3;
function fileData(songId, f) {
  if (fileMem.has(f.id)) return fileMem.get(f.id);
  const p = (async () => {
    const key = new URL(`__archivo/${songId}/${f.id}`, location.href).href;
    let blob = null, cache = null;
    try {
      cache = await caches.open(FILE_CACHE);
      const hit = await cache.match(key);
      if (hit) blob = await hit.blob();
      // Una copia rota (de antes de esta corrección) se descarta y se baja de nuevo.
      if (blob && (!blob.size || !sizeOk(blob, f))) { cache.delete(key).catch(() => {}); blob = null; }
    } catch { cache = null; }
    if (!blob) {
      // Hasta 3 intentos (la señal puede fallar un momento o el archivo terminar de subirse).
      let lastErr = null;
      for (let i = 0; i < 3 && !blob; i++) {
        try {
          const b = await b64ToBlob(await api.getFile(songId, f.id, f), f.type);
          if (!b.size || !sizeOk(b, f)) { const e = new Error('El archivo está incompleto'); e.code = 'incompleto'; throw e; }
          blob = b;
        } catch (e) { lastErr = e; if (i < 2) await wait(i ? 2500 : 900); }
      }
      if (!blob) throw lastErr || new Error('No se pudo bajar');
      if (cache) cache.put(key, new Response(blob, { headers: { 'Content-Type': f.type } })).catch(() => {});
    }
    return { url: URL.createObjectURL(blob), type: f.type, blob };
  })();
  fileMem.set(f.id, p);
  p.catch(() => fileMem.delete(f.id));
  return p;
}
// Precarga de uno en uno, en segundo plano, sin frenar la app (no se hace con «ahorro de datos»).
let prefetchQ = Promise.resolve();
const prefetched = new Set();
function prefetchSongs(ids) {
  if (navigator.connection && navigator.connection.saveData) return;
  for (const id of ids) {
    if (!id || prefetched.has(id)) continue;
    prefetched.add(id);
    prefetchQ = prefetchQ.then(async () => {
      const files = (await songFiles(id).catch(() => [])).filter((f) => !isAudio(f));
      for (const f of files) await fileData(id, f).catch(() => {});
      if (files.some((f) => f.type === 'application/pdf')) loadPdfJs().catch(() => {});
    });
  }
}
// Al abrir la app: los charts de la próxima lista quedan listos sin que nadie los abra.
let upcomingDone = false;
function prefetchUpcoming() {
  if (upcomingDone || !api) return;
  const next = services.filter((s) => s.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return;
  upcomingDone = true;
  let off = null, done = false;
  off = api.watchItems(next.date, (list) => {
    if (done) return;
    done = true;
    prefetchSongs(list.map((it) => it.songId));
    setTimeout(() => { if (off) off(); }, 0);
  });
  if (done && off) off();
}

// ---- PDF: se dibuja dentro de la app con pdf.js (se carga solo la primera vez que hace falta) ----
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168';
let pdfjsP = null;
function loadPdfJs() {
  if (!pdfjsP) {
    pdfjsP = (async () => {
      const m = await import(`${PDFJS}/pdf.min.mjs`);
      // El «trabajador» se crea desde una copia local para que funcione desde esta dirección.
      const src = await (await fetch(`${PDFJS}/pdf.worker.min.mjs`)).text();
      m.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      return m;
    })();
    pdfjsP.catch(() => { pdfjsP = null; });
  }
  return pdfjsP;
}
async function renderPdf(box, blob) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  // Se dibuja con más detalle del necesario para que al hacer zoom se siga leyendo nítido.
  const w = Math.min(box.clientWidth || innerWidth, innerWidth);
  const dpr = Math.min(3, (devicePixelRatio || 1) * 1.5);
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (w * dpr) / base.width });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width);
    cv.height = Math.round(vp.height);
    cv.className = 'cr-page';
    box.appendChild(cv);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  }
}

// Muestra un archivo (foto o PDF) en el lector. Si falla, explica por qué y da «Reintentar»
// (que lo vuelve a bajar de la nube, sin la copia guardada).
function showFile(fb, songId, f) {
  fb.innerHTML = '<div class="cr-loading"><i></i></div>';
  const fail = (e) => {
    const incomplete = e && e.code === 'incompleto';
    const offline = !navigator.onLine;
    fb.innerHTML = `<div class="cr-msg"><b>${esc(f.name || 'Archivo')}</b><br>${offline ? 'Sin conexión: este archivo todavía no está guardado en el teléfono.'
      : incomplete ? 'Este archivo no terminó de subirse. Si al reintentar sigue igual, súbelo otra vez desde el canto (Chart › Subir foto o PDF).'
        : 'No se pudo mostrar este archivo.'}<br><button class="cr-retry" type="button">↻ Reintentar</button></div>`;
    fb.querySelector('.cr-retry').onclick = async () => {
      fileMem.delete(f.id);
      try { const c = await caches.open(FILE_CACHE); await c.delete(new URL(`__archivo/${songId}/${f.id}`, location.href).href); } catch { /* sin copia */ }
      showFile(fb, songId, f);
    };
  };
  fileData(songId, f).then(async (d) => {
    if (d.type === 'application/pdf') {
      await renderPdf(fb, d.blob);
      fb.querySelector('.cr-loading')?.remove();
      return;
    }
    const img = new Image();
    img.className = 'cr-page';
    img.decoding = 'async';
    img.alt = f.name || 'Chart';
    img.onload = () => fb.querySelector('.cr-loading')?.remove();
    img.onerror = () => fail({ code: 'incompleto' });
    img.src = d.url;
    fb.appendChild(img);
  }).catch(fail);
}

// ---- Lector «Solo chart»: pantalla completa, un canto tras otro ----
// Cada canto se arma una sola vez y se queda listo (oculto) al cambiar: así pasar de uno a otro
// es instantáneo. Se preparan también el anterior y el siguiente. Deslizar ← → o tocar los
// números de abajo cambia de canto; «‹ Lista» vuelve.
let reader = null;
// ---- Marcas sobre el chart (dibujos y notas). Se guardan solo en este teléfono, por lista y
// canto, y se borran solas cuando pasa la fecha de la lista. ----
const INK_KEY = 'listas-marcas';
const inkAll = () => { try { return JSON.parse(localStorage.getItem(INK_KEY) || '{}') || {}; } catch { return {}; } };
function inkSaveAll(all) {
  try { localStorage.setItem(INK_KEY, JSON.stringify(all)); } catch { toast('El teléfono no tiene espacio para guardar más marcas'); }
}
(function inkCleanup() {
  const all = inkAll();
  const t = today();
  let changed = false;
  for (const k of Object.keys(all)) if (!all[k] || !all[k].date || all[k].date < t) { delete all[k]; changed = true; }
  if (changed) inkSaveAll(all);
})();
const INK_TOOLS = {
  rojo: { c: '#ff3b30', w: 4 },
  azul: { c: '#1e7fe0', w: 4 },
  resaltar: { c: '#ffd60a', w: 20, hl: true },
};
// mode: 'chart' (fotos, PDF y acordes) o 'letra' (solo la letra por partes, en grande).
const LYR_SIZE_KEY = 'listas-letra-tam';
function openChartReader({ songIds, start = 0, keys = {}, onClose, mode = 'chart', date = '' }) {
  const inkDate = date || today();
  closeChartReader(true);
  const ids = songIds.filter(Boolean);
  if (!ids.length) { toast('Esta lista aún no tiene cantos'); return; }
  const el = document.createElement('div');
  el.className = 'cr' + (mode === 'letra' ? ' cr-letra' : '');
  let lyrSize = 20;
  try { lyrSize = Number(localStorage.getItem(LYR_SIZE_KEY)) || 20; } catch { /* sin almacenamiento */ }
  el.style.setProperty('--lyr', lyrSize + 'px');
  const chart = mode !== 'letra';
  el.innerHTML = `<div class="cr-top"><button class="cr-back" data-crback>‹ Lista</button><div class="cr-title"><b></b><small></small></div>${mode === 'letra' ? '<button class="cr-size" data-crsize="-2" aria-label="Letra más pequeña">A−</button><button class="cr-size" data-crsize="2" aria-label="Letra más grande">A+</button>' : '<button class="cr-inkbtn" data-crink aria-label="Marcar y escribir notas">✏️</button>'}<span class="cr-key"></span></div>
    <div class="cr-stage"><button class="cr-zoomreset" data-crzoom1 hidden>↺ 100%</button></div>
    ${chart ? `<div class="cr-tools" hidden>
      ${Object.entries(INK_TOOLS).map(([k, t], n) => `<button type="button" data-tool="${k}" class="${n ? '' : 'on'}" aria-label="${k}"><i style="background:${t.c}${t.hl ? ';opacity:.6;height:10px;border-radius:3px' : ''}"></i></button>`).join('')}
      <button type="button" data-tool="nota" aria-label="Escribir una nota"><b>T</b></button>
      <button type="button" data-tool="borrar" aria-label="Borrador">⌫</button>
      <button type="button" data-inkundo aria-label="Deshacer">↶</button>
      <button type="button" data-inkclear aria-label="Borrar todas las marcas de este canto">🗑</button>
      <button type="button" class="done" data-crink aria-label="Terminar de marcar">✓</button>
    </div>` : ''}
    <div class="cr-nav"><button data-crgo="-1" aria-label="Anterior">‹</button><div class="cr-strip">${ids.map((id, i) => `<button data-crto="${i}">${i + 1}</button>`).join('')}</div><button data-crgo="1" aria-label="Siguiente">›</button></div>`;
  document.body.appendChild(el);
  const stage = el.querySelector('.cr-stage');
  const built = new Map();
  let cur = -1;
  function build(i) {
    if (built.has(i) || i < 0 || i >= ids.length) return;
    const id = ids[i];
    const box = document.createElement('div');
    box.className = 'cr-song';
    box.innerHTML = '<div class="cr-loading"><i></i></div>';
    stage.appendChild(box);
    built.set(i, box);
    if (mode === 'letra') {
      // Solo la letra: cada parte con su color y cada diapositiva separada.
      const s = songById(id) || {};
      const secs = sectionsOf(s.text);
      box.innerHTML = secs.map((x) => `<div class="cr-sec">${x.name ? secChip(x.name) : ''}${x.body.split(/\n\s*\n/).filter((t) => t.trim()).map((t) => `<div class="cr-lyr k-${secKind(x.name)}">${esc(t.trim())}</div>`).join('')}</div>`).join('')
        || '<div class="cr-msg">Este canto aún no tiene letra.</div>';
      return;
    }
    songFiles(id).catch(() => []).then((all) => {
      const files = all.filter((f) => !isAudio(f)); // los audios de referencia no son charts
      const s = songById(id) || {};
      // .cr-zoom crece con el zoom (el teléfono deja recorrerlo con el dedo); encima van las marcas.
      box.innerHTML = '<div class="cr-zoom"><div class="cr-content"></div><svg class="cr-ink" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"></svg><div class="cr-notes"></div></div>';
      const content = box.querySelector('.cr-content');
      for (const f of files) {
        const fb = document.createElement('div');
        fb.className = 'cr-file';
        content.appendChild(fb);
        showFile(fb, id, f);
      }
      if (s.chart) content.insertAdjacentHTML('beforeend', `<pre class="cr-chart">${esc(s.chart)}</pre>`);
      if (!files.length && !s.chart) {
        const secs = sectionsOf(s.text);
        content.innerHTML = `<div class="cr-msg">Este canto no tiene chart todavía. Se muestra la letra.</div>` +
          (secs.map((x) => `<div class="cr-sec">${x.name ? secChip(x.name) : ''}<div class="cr-lyr">${esc(x.body)}</div></div>`).join('') || '<div class="cr-msg">Tampoco tiene letra.</div>');
      }
      box.ink = inkLayer(box, id);
      if (built.get(cur) === box) syncInkUi();
    });
  }

  // ---- Marcas: cada canto guarda sus trazos y notas en coordenadas del documento (no de la
  // pantalla), así siguen en su lugar al hacer zoom. ----
  let inking = false;
  let tool = 'rojo';
  function inkLayer(box, songId) {
    const zoomEl = box.querySelector('.cr-zoom');
    const svg = box.querySelector('.cr-ink');
    const notesEl = box.querySelector('.cr-notes');
    const key = inkDate + '|' + songId;
    const d = inkAll()[key] || { date: inkDate, strokes: [], notes: [] };
    let vh = 1000;
    const save = () => {
      const all = inkAll();
      if (d.strokes.length || d.notes.length) all[key] = d; else delete all[key];
      inkSaveAll(all);
      syncInkUi();
    };
    const pathD = (p) => 'M' + p.reduce((a, v, i) => a + (i % 2 ? ',' : i ? ' L' : '') + v, '');
    const pathEl = (s) => `<path d="${pathD(s.p)}" stroke="${s.c}" stroke-width="${s.w}" fill="none" stroke-linecap="round" stroke-linejoin="round"${s.hl ? ' stroke-opacity=".42"' : ''}/>`;
    function draw() {
      const W = zoomEl.clientWidth || 1;
      const H = zoomEl.clientHeight || 1;
      vh = (1000 * H) / W;
      svg.setAttribute('viewBox', `0 0 1000 ${vh.toFixed(1)}`);
      svg.innerHTML = d.strokes.map(pathEl).join('');
      notesEl.innerHTML = d.notes.map((n, i) => `<div class="cr-note" data-note="${i}" style="left:${(n.x / 10).toFixed(2)}%;top:${((n.y / vh) * 100).toFixed(2)}%;--nc:${n.c || '#ff3b30'}">${esc(n.t)}</div>`).join('');
    }
    new ResizeObserver(draw).observe(zoomEl);
    // Punto del documento bajo el dedo (0–1000 a lo ancho; lo alto en la misma escala).
    const at = (e) => { const r = zoomEl.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 10000) / 10, Math.round(((e.clientY - r.top) / r.width) * 10000) / 10]; };
    let live = null;
    let liveEl = null;
    function cancel() { if (liveEl) liveEl.remove(); live = null; liveEl = null; }
    svg.addEventListener('pointerdown', (e) => {
      if (!inking || pinching) return;
      e.preventDefault();
      const [x, y] = at(e);
      if (tool === 'nota') { addNote(x, y); return; }
      if (tool === 'borrar') { eraseAt(x, y); live = { erase: true }; svg.setPointerCapture(e.pointerId); return; }
      const t = INK_TOOLS[tool];
      live = { c: t.c, w: t.w, hl: !!t.hl, p: [x, y], at: Date.now() };
      svg.insertAdjacentHTML('beforeend', pathEl(live));
      liveEl = svg.lastElementChild;
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!live || pinching) return;
      const [x, y] = at(e);
      if (live.erase) { eraseAt(x, y); return; }
      const n = live.p.length;
      if (Math.hypot(x - live.p[n - 2], y - live.p[n - 1]) < 2.5) return;
      live.p.push(x, y);
      liveEl.setAttribute('d', pathD(live.p));
    });
    const end = () => {
      if (!live) return;
      if (!live.erase && live.p.length >= 2) {
        // Un toque sin mover deja un punto.
        if (live.p.length === 2) live.p.push(live.p[0] + 0.1, live.p[1]);
        d.strokes.push(live);
        save();
      }
      live = null; liveEl = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', () => { cancel(); });
    function eraseAt(x, y) {
      const before = d.strokes.length;
      for (let i = d.strokes.length - 1; i >= 0; i--) {
        const s = d.strokes[i];
        for (let j = 0; j < s.p.length; j += 2) if (Math.hypot(s.p[j] - x, s.p[j + 1] - y) < 14 + s.w / 2) { d.strokes.splice(i, 1); break; }
      }
      if (d.strokes.length !== before) { draw(); save(); haptic(4); }
    }
    function addNote(x, y, i) {
      const old = i != null ? d.notes[i] : null;
      const t = prompt(old ? 'Cambia la nota (déjala vacía para quitarla):' : 'Escribe la nota:', old ? old.t : '');
      if (t == null) return;
      if (old) { if (t.trim()) old.t = t.trim().slice(0, 200); else d.notes.splice(i, 1); }
      else if (t.trim()) d.notes.push({ x, y, t: t.trim().slice(0, 200), c: INK_TOOLS[Object.keys(INK_TOOLS).includes(lastColor) ? lastColor : 'rojo'].c, at: Date.now() });
      draw(); save();
    }
    notesEl.addEventListener('click', (e) => {
      const n = e.target.closest('[data-note]');
      if (n && inking) addNote(0, 0, Number(n.dataset.note));
    });
    return {
      draw, cancel,
      count: () => d.strokes.length + d.notes.length,
      undo() {
        const ls = d.strokes[d.strokes.length - 1], ln = d.notes[d.notes.length - 1];
        if (!ls && !ln) return false;
        if (ls && (!ln || (ls.at || 0) >= (ln.at || 0))) d.strokes.pop(); else d.notes.pop();
        draw(); save(); return true;
      },
      clear() { d.strokes = []; d.notes = []; draw(); save(); },
    };
  }
  let lastColor = 'rojo';
  const tools = el.querySelector('.cr-tools');
  function syncInkUi() {
    if (!chart) return;
    const b = built.get(cur);
    const n = b && b.ink ? b.ink.count() : 0;
    el.querySelector('.cr-inkbtn').classList.toggle('has', n > 0);
    el.classList.toggle('inking', inking);
    tools.hidden = !inking;
    tools.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x.dataset.tool === tool));
  }
  function setInking(on) {
    inking = on;
    built.forEach((b) => b.ink && b.ink.cancel());
    syncInkUi();
    haptic(6);
    if (on) {
      let seen = false;
      try { seen = !!localStorage.getItem('listas-marcas-visto'); localStorage.setItem('listas-marcas-visto', '1'); } catch { /* sin almacenamiento */ }
      if (!seen) toast('Dibuja con un dedo; con dos haces zoom y te mueves. Las marcas se borran solas cuando pasa la lista.');
    }
  }

  // ---- Zoom con dos dedos y doble toque; con zoom se recorre el documento arrastrando ----
  let pinching = false;
  const zoomOf = (b) => b.zoom || 1;
  function setZoom(b, z, cx, cy, px, py) {
    const zoomEl = b.querySelector('.cr-zoom');
    if (!zoomEl) return;
    z = Math.max(1, Math.min(4, z));
    if (z < 1.04) z = 1;
    b.zoom = z;
    zoomEl.style.transform = '';
    zoomEl.style.setProperty('--z', z);
    if (b.ink) b.ink.draw();
    const r = b.getBoundingClientRect();
    // El punto del documento que estaba bajo los dedos queda bajo los dedos.
    b.scrollLeft = px * z + zoomEl.offsetLeft - (cx - r.left);
    b.scrollTop = py * z + zoomEl.offsetTop - (cy - r.top);
    el.querySelector('[data-crzoom1]').hidden = z === 1;
    b.classList.toggle('zoomed', z > 1);
  }
  function zoomAround(b, z, cx, cy, animate) {
    const zoomEl = b.querySelector('.cr-zoom');
    if (!zoomEl) return;
    const zr = zoomEl.getBoundingClientRect();
    const z0 = zoomOf(b);
    const px = (cx - zr.left) / z0, py = (cy - zr.top) / z0;
    if (animate && !reducedMotion()) {
      zoomEl.style.transformOrigin = `${cx - zr.left}px ${cy - zr.top}px`;
      const a = zoomEl.animate([{ transform: 'scale(1)' }, { transform: `scale(${Math.max(1, Math.min(4, z)) / z0})` }], { duration: 260, easing: 'cubic-bezier(.25,.8,.25,1)' });
      const go = () => setZoom(b, z, cx, cy, px, py);
      let done = false;
      const fin = () => { if (!done) { done = true; a.cancel(); go(); } };
      a.onfinish = fin;
      setTimeout(fin, 320);
      return;
    }
    setZoom(b, z, cx, cy, px, py);
  }
  // Safari: que el gesto de pellizcar no agrande toda la página.
  for (const ev of ['gesturestart', 'gesturechange']) el.addEventListener(ev, (e) => e.preventDefault());

  let pz = null; // datos del pellizco en curso
  let lastTap = 0, lastTapX = 0, lastTapY = 0, tapStart = 0, moved = false;
  let sx = 0, sy = 0, dx = 0, horiz = null;
  const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  stage.addEventListener('touchstart', (e) => {
    const b = built.get(cur);
    if (e.touches.length === 2 && chart && b && b.querySelector('.cr-zoom')) {
      // Dos dedos: zoom y movimiento (también mientras se marca).
      if (b.ink) b.ink.cancel();
      pinching = true;
      horiz = false;
      const zoomEl = b.querySelector('.cr-zoom');
      const zr = zoomEl.getBoundingClientRect();
      const [cx, cy] = mid(e.touches);
      pz = { b, zoomEl, z0: zoomOf(b), d0: dist(e.touches), cx0: cx, cy0: cy, cx, cy, s: 1, ox: cx - zr.left, oy: cy - zr.top };
      zoomEl.style.transformOrigin = `${pz.ox}px ${pz.oy}px`;
      return;
    }
    if (e.touches.length !== 1) { horiz = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; horiz = null; moved = false; tapStart = Date.now();
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (pz && e.touches.length === 2) {
      e.preventDefault();
      const [cx, cy] = mid(e.touches);
      const z = Math.max(0.85, Math.min(4.5, (pz.z0 * dist(e.touches)) / pz.d0));
      pz.s = z / pz.z0; pz.cx = cx; pz.cy = cy;
      pz.zoomEl.style.transform = `translate(${cx - pz.cx0}px, ${cy - pz.cy0}px) scale(${pz.s})`;
      return;
    }
    if (pinching || e.touches.length !== 1) return;
    dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
    // Con zoom o marcando, deslizar recorre/dibuja: no cambia de canto.
    const b = built.get(cur);
    if (inking || (b && zoomOf(b) > 1)) { horiz = false; return; }
    if (horiz === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) horiz = Math.abs(dx) > Math.abs(dy) * 1.4;
    if (horiz) { e.preventDefault(); if (b) { b.style.transition = 'none'; b.style.transform = `translateX(${dx * 0.6}px)`; } }
  }, { passive: false });
  stage.addEventListener('touchend', (e) => {
    if (pz) {
      if (e.touches.length < 2) {
        const { b, z0, s, cx, cy, ox, oy } = pz;
        pz = null;
        setZoom(b, z0 * s, cx, cy, ox / z0, oy / z0);
        // Deja el dedo que queda sin efecto hasta levantarlo.
        setTimeout(() => { pinching = false; }, 60);
      }
      return;
    }
    if (pinching) return;
    const b = built.get(cur);
    if (b) { b.style.transition = ''; b.style.transform = ''; }
    if (horiz && Math.abs(dx) > 60) { const j = cur + (dx < 0 ? 1 : -1); if (j >= 0 && j < ids.length) { show(j, dx < 0 ? 1 : -1); haptic(6); } }
    horiz = null;
    // Doble toque: acerca donde tocaste (o vuelve al tamaño normal).
    const t = e.changedTouches[0];
    if (chart && !inking && !moved && Date.now() - tapStart < 260 && b) {
      if (Date.now() - lastTap < 320 && Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY) < 30) {
        lastTap = 0;
        zoomAround(b, zoomOf(b) > 1 ? 1 : 2.5, t.clientX, t.clientY, true);
        haptic(5);
      } else { lastTap = Date.now(); lastTapX = t.clientX; lastTapY = t.clientY; }
    }
  });
  // Con el ratón (o trackpad): Ctrl + rueda hace zoom.
  stage.addEventListener('wheel', (e) => {
    const b = built.get(cur);
    if (!chart || !e.ctrlKey || !b) return;
    e.preventDefault();
    zoomAround(b, zoomOf(b) * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY, false);
  }, { passive: false });
  function show(i, dir = 0) {
    if (i < 0 || i >= ids.length || i === cur) return;
    build(i); build(i + 1); build(i - 1);
    const prev = built.get(cur);
    const next = built.get(i);
    if (prev) { prev.classList.remove('on', 'in-l', 'in-r'); }
    next.classList.remove('in-l', 'in-r');
    void next.offsetWidth;
    next.classList.add('on');
    if (dir && !reducedMotion()) next.classList.add(dir > 0 ? 'in-r' : 'in-l');
    cur = i;
    const s = songById(ids[i]) || {};
    el.querySelector('.cr-title b').textContent = s.title || 'Canto';
    el.querySelector('.cr-title small').textContent = `${i + 1} de ${ids.length}${s.author ? ' · ' + s.author : ''}`;
    const k = keys[ids[i]] || s.key || '';
    el.querySelector('.cr-key').textContent = k;
    el.querySelector('.cr-key').hidden = !k;
    el.querySelectorAll('[data-crto]').forEach((b) => b.classList.toggle('on', Number(b.dataset.crto) === i));
    const chip = el.querySelector(`[data-crto="${i}"]`);
    if (chip) chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    el.querySelector('[data-crgo="-1"]').disabled = i === 0;
    el.querySelector('[data-crgo="1"]').disabled = i === ids.length - 1;
    el.querySelector('[data-crzoom1]').hidden = !next.zoom || next.zoom === 1;
    if (chart) built.forEach((b) => b.ink && b.ink.cancel());
    syncInkUi();
  }
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-crback]')) { closeChartReader(); return; }
    if (e.target.closest('[data-crink]')) { setInking(!inking); return; }
    if (e.target.closest('[data-crzoom1]')) { const b = built.get(cur); if (b) { const r = stage.getBoundingClientRect(); zoomAround(b, 1, r.left + r.width / 2, r.top + r.height / 2, true); } return; }
    const tl = e.target.closest('[data-tool]');
    if (tl) { tool = tl.dataset.tool; if (INK_TOOLS[tool]) lastColor = tool; syncInkUi(); haptic(4); if (tool === 'nota') toast('Toca donde quieres poner la nota'); return; }
    if (e.target.closest('[data-inkundo]')) { const b = built.get(cur); if (!(b && b.ink && b.ink.undo())) toast('No hay nada que deshacer'); haptic(4); return; }
    if (e.target.closest('[data-inkclear]')) { const b = built.get(cur); if (b && b.ink && b.ink.count() && confirm('¿Borrar todas las marcas y notas de este canto?')) b.ink.clear(); return; }
    const sz = e.target.closest('[data-crsize]');
    if (sz) {
      lyrSize = Math.max(14, Math.min(40, lyrSize + Number(sz.dataset.crsize)));
      el.style.setProperty('--lyr', lyrSize + 'px');
      try { localStorage.setItem(LYR_SIZE_KEY, String(lyrSize)); } catch { /* sin almacenamiento */ }
      haptic(4);
      return;
    }
    const g = e.target.closest('[data-crgo]');
    if (g) { show(cur + Number(g.dataset.crgo), Number(g.dataset.crgo)); haptic(6); return; }
    const t = e.target.closest('[data-crto]');
    if (t) { const j = Number(t.dataset.crto); show(j, j > cur ? 1 : -1); haptic(6); }
  });
  // Pantalla completa (Android); en el iPhone instalada ya ocupa toda la pantalla.
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch { /* sin pantalla completa */ }
  // El botón «atrás» del teléfono cierra el lector (no sale de la lista).
  history.pushState({ chart: true }, '');
  reader = { el, onClose };
  requestAnimationFrame(() => el.classList.add('open'));
  show(Math.max(0, Math.min(start, ids.length - 1)));
  if (mode !== 'letra') prefetchSongs(ids);
}
function closeChartReader(silent) {
  if (!reader) return;
  const { el, onClose } = reader;
  reader = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 300);
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { /* ya salió */ }
  if (!silent && history.state && history.state.chart) history.back();
  if (onClose) onClose();
}
addEventListener('popstate', () => { if (reader) closeChartReader(true); });

// ======================================================================================
// Pantalla 2: la fecha — carrusel de alabanzas abajo, el canto elegido arriba
// ======================================================================================
function viewService(date, selId) {
  let items = [];
  let comments = [];
  let commentsOff = null;
  let sel = selId || null;
  const svc = () => services.find((s) => s.date === date) || { date, status: 'borrador' };
  const itemSong = (it) => (it.songId && songById(it.songId)) || {};
  const val = (it, k) => it[k] || itemSong(it)[k] || '';
  // Moderadores: todo. Colaborador: solo SU lista; en las de otros (y los participantes) solo
  // ve y comenta.
  const canEdit = () => canEditList(svc());
  const canAdd = () => canEditList(svc());
  try { sessionStorage.setItem(LAST_KEY, date); } catch { /* sin almacenamiento */ }

  // Arriba: «Lista» (los cantos en cascada; al tocar uno se despliega todo lo suyo), «Chart» y
  // «Letra» (los dos últimos, a pantalla completa con los cantos en orden).
  $('view').innerHTML = `${hero({ title: niceDate(date), back: '#/' })}<div class="sheetbody" style="padding-bottom:calc(var(--nav-h) + 40px)">
    <button class="avatar-float" data-go="#/cuenta">${face(me)}</button>
    <div class="tabs view-sel" id="svView"><button data-vm="lista" class="on">☰ Lista</button><button data-vm="chart">🎼 Chart</button><button data-vm="letra">Aa Letra</button></div>
    <div id="svSteps"></div>
    <div class="modes" id="svModes"></div>
    <div id="svNote"></div>
    <div class="sec"><h3>Alabanzas <span class="muted small" id="svCount"></span></h3><button class="link" id="svAddTop">＋ Agregar</button></div>
    <div class="sv-list" id="svList"></div>
  </div>`;

  function renderHead() {
    const s = svc();
    const isOwner = s.by === user.uid;
    // Recién creada por quien la está armando: se ve que es el paso 3.
    $('svSteps').innerHTML = isOwner && canCreate() && !sent(s) ? stepsBar(3) + '<div class="hello" style="margin-bottom:8px">Paso 3 de 3 · toca cada alabanza para su tono, referencia y notas</div>' : '';
    $('svModes').innerHTML = statusPill(s)
      + (s.sentAt && sent(s) ? `<span class="small muted">${new Date(s.sentAt).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : '')
      + (canEditList(s) ? '<span style="margin-left:auto;display:flex;gap:6px"><button class="mode plain" data-editsvc>✎ Editar</button><button class="mode plain danger" data-delsvc>🗑 Eliminar</button></span>' : '');
    // Quien arma la lista (o un moderador) la envía; llega como aviso a los moderadores.
    const canSend = (isOwner && canCreate()) || isMod();
    const changed = sent(s) && s.changedAt && s.changedAt > (s.sentAt || 0);
    const sendBtn = !canSend || !items.length ? ''
      : !sent(s) ? '<button class="btn green" style="margin-top:10px" data-sendlist>📤 Enviar lista</button>'
      : changed ? '<button class="btn" style="margin-top:10px" data-sendlist>📤 Enviar cambios</button>'
      : '<div class="small muted" style="margin-top:8px">✓ Los moderadores ya la recibieron. Si cambias algo, aquí podrás enviar los cambios.</div>';
    $('svNote').innerHTML = `<div class="field"><div class="lab">${esc(s.title || 'Servicio')}${s.leaderName ? ` · 🎤 ministra <b style="color:var(--title)">${esc(s.leaderName)}</b>` : ''}</div>${s.note ? `<div class="small">${esc(s.note)}</div>` : ''}
      ${sendBtn}</div>`;
  }

  // Lista en cascada. La alabanza abierta guarda su contenido (lo que estés escribiendo en notas
  // o comentarios no se pierde aunque la lista se actualice).
  let opened = null; // id que tenía el detalle abierto la última vez que se dibujó
  function renderList() {
    $('svAddTop').style.display = canAdd() ? '' : 'none';
    $('svCount').textContent = items.length ? `· ${items.length}` : '';
    // Solo se tocan las filas que cambiaron y no se mueven las que siguen en su lugar: mover la
    // alabanza abierta recargaba su video (el «parpadeo»).
    const list = $('svList');
    if (!items.length) {
      list.innerHTML = `<div class="empty">Esta lista aún no tiene cantos.${canAdd() ? '<br>Toca «＋ Agregar».' : ''}</div>`;
      opened = null;
      return;
    }
    list.querySelectorAll(':scope > .empty').forEach((x) => x.remove());
    const rows = new Map([...list.querySelectorAll(':scope > .sv-item')].map((r) => [r.dataset.item, r]));
    rows.forEach((r, id) => { if (!items.some((x) => x.id === id)) r.remove(); });
    let after = null;
    items.forEach((it, i) => {
      const k = val(it, 'key');
      const notes = it.notes ? `<span class="sv-tag">✎ ${esc(it.notes.slice(0, 40))}${it.notes.length > 40 ? '…' : ''}</span>` : '';
      const head = `<span class="sv-num">${i + 1}</span><span class="sv-t"><b>${esc(val(it, 'title') || 'Sin título')}</b><small>${esc(val(it, 'author') || 'Canto')}${(it.refType || (it.audioId ? 'audio' : '')) === 'audio' && it.audioId ? ' · 🎙 audio' : ytId(val(it, 'youtube')) ? ' · ▶ video' : ''}</small>${notes}</span>
          <span class="sv-key">${esc(k || '—')}</span><span class="sv-chev">›</span>`;
      let r = rows.get(it.id);
      if (!r) {
        r = Object.assign(document.createElement('div'), { className: 'sv-item' });
        r.dataset.item = it.id;
        r.innerHTML = `<button class="sv-head" data-sel="${it.id}"></button>`;
      }
      const btn = r.querySelector(':scope > .sv-head');
      if (btn.dataset.h !== head) { btn.innerHTML = head; btn.dataset.h = head; }
      const want = after ? after.nextElementSibling : list.firstElementChild;
      if (want !== r) list.insertBefore(r, want);
      after = r;
      r.classList.toggle('open', it.id === sel);
    });
    // El detalle abierto se queda donde está; si cambió la alabanza abierta, se crea uno nuevo.
    let body = $('svDetail');
    if (body && (body.parentElement && body.parentElement.dataset.item) !== sel) { body.remove(); body = null; }
    const row = sel && list.querySelector(`[data-item="${sel}"]`);
    if (row && !body) row.appendChild(Object.assign(document.createElement('div'), { id: 'svDetail', className: 'sv-body' }));
    opened = row ? sel : null;
  }
  // Tocar una alabanza la abre (y cierra la que estaba abierta); tocarla otra vez la cierra.
  // Abrir y cerrar se deslizan (la altura crece o se encoge con suavidad), sin redibujar la lista.
  const SV_MS = 620;
  function slide(el, open, done) {
    const h = el.scrollHeight;
    if (reducedMotion() || !el.animate) { if (done) done(); return; }
    el.style.overflow = 'hidden';
    const shut = { height: '0px', paddingBottom: '0px', opacity: 0, transform: 'translateY(-8px)' };
    const full = { height: h + 'px', paddingBottom: '12px', opacity: 1, transform: 'none' };
    const ms = open ? SV_MS : SV_MS - 80;
    const a = el.animate(open ? [shut, full] : [full, shut], { duration: ms, easing: 'cubic-bezier(.45,.05,.25,1)' });
    let ended = false;
    const end = () => { if (ended) return; ended = true; el.style.overflow = ''; a.cancel(); if (done) done(); };
    a.onfinish = end;
    // Por si el teléfono pausa la animación (ahorro de batería): igual termina a tiempo.
    setTimeout(end, ms + 150);
  }
  function selectItem(id) {
    const prev = sel;
    sel = sel === id ? null : id;
    history.replaceState(null, '', sel ? `#/s/${date}/${sel}` : `#/s/${date}`);
    if (!sel && commentsOff) { commentsOff(); commentsOff = null; }
    haptic(6);
    // La que estaba abierta se cierra deslizándose (sin ids: la nueva usa los mismos).
    const old = $('svDetail');
    const oldRow = prev && $('svList').querySelector(`[data-item="${prev}"]`);
    if (oldRow) oldRow.classList.remove('open');
    if (old) {
      old.removeAttribute('id');
      old.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
      old.classList.add('closing');
      slide(old, false, () => old.remove());
    }
    opened = null;
    const row = sel && $('svList').querySelector(`[data-item="${sel}"]`);
    if (!row) return;
    row.classList.add('open');
    const body = Object.assign(document.createElement('div'), { id: 'svDetail', className: 'sv-body sliding' });
    row.appendChild(body);
    opened = sel;
    renderDetail();
    slide(body, true);
    // Cuando termina de abrir (y de cerrarse la de arriba), la deja a la vista.
    setTimeout(() => { if (row.isConnected) row.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }); }, old ? SV_MS : 140);
  }
  // ---- Referencia: video de YouTube o audio grabado por nosotros ----
  const refTypeOf = (it) => it.refType || (it.audioId ? 'audio' : 'youtube');
  let recorder = null;
  function renderAudioRef(it) {
    const box = $('dtRefAudio');
    if (!box) return;
    const edit = canEdit(it);
    box.innerHTML = `<div id="dtAudioPlay">${it.audioId ? '<div class="small muted">Cargando el audio…</div>' : '<div class="small muted">Aún no hay un audio nuestro para este canto.</div>'}</div>
      ${edit ? `<div class="audio-acts">
        <label class="btn ghost" style="flex:1">⬆ Subir audio<input type="file" id="dtAudioUp" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.opus" hidden></label>
        ${window.MediaRecorder ? '<button class="btn ghost" type="button" id="dtRec" style="flex:1">🎙 Grabar</button>' : ''}
      </div>${it.audioId ? '<button class="link small" type="button" id="dtAudioDel" style="color:var(--red)">Quitar este audio</button>' : ''}` : ''}`;
    if (it.audioId) {
      songFiles(it.songId).then((files) => {
        const f = files.find((x) => x.id === it.audioId);
        if (!f) { $('dtAudioPlay').innerHTML = '<div class="small muted">Este audio ya no está.</div>'; return; }
        return fileData(it.songId, f).then((d) => {
          if (!$('dtAudioPlay')) return;
          $('dtAudioPlay').innerHTML = `<audio controls preload="metadata" src="${d.url}"></audio><div class="small muted">${esc(f.name || 'Audio')}${f.byName ? ' · ' + esc(f.byName) : ''}</div>`;
        });
      }).catch(() => { if ($('dtAudioPlay')) $('dtAudioPlay').innerHTML = '<div class="small muted">No se pudo cargar el audio. Revisa la conexión.</div>'; });
    }
    if (!edit) return;
    const save = async (blob, name) => {
      if (blob.size > 8e6) { toast('El audio debe pesar menos de 8 MB (unos 8 minutos)'); return; }
      toast('Subiendo el audio…');
      try {
        const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
        const type = blob.type || 'audio/mp4';
        const fid = await api.addFile(it.songId, { name, type, size: base64.length, by: user.uid, byName: me.name, kind: 'audio' }, base64);
        filesOf.delete(it.songId);
        await api.updateItem(date, it.id, { refType: 'audio', audioId: fid });
        toast('✓ Audio guardado: el equipo ya lo puede escuchar');
      } catch (e) { toast(e.message || 'No se pudo subir el audio'); }
    };
    $('dtAudioUp').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) save(f, f.name); };
    if ($('dtAudioDel')) $('dtAudioDel').onclick = async () => { if (confirm('¿Quitar este audio de la referencia?')) await api.updateItem(date, it.id, { audioId: '', refType: 'youtube' }); };
    if ($('dtRec')) $('dtRec').onclick = async () => {
      const btn = $('dtRec');
      if (recorder) { recorder.stop(); return; }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast('Permite el micrófono para grabar'); return; }
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      const chunks = [];
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const t0 = Date.now();
      const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); if (btn.isConnected) btn.textContent = `⏹ Detener · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
      btn.classList.add('rec');
      btn.textContent = '⏹ Detener · 0:00';
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        clearInterval(tick);
        stream.getTracks().forEach((t) => t.stop());
        const type = (recorder.mimeType || mime || 'audio/webm').split(';')[0];
        recorder = null;
        if (btn.isConnected) { btn.classList.remove('rec'); btn.textContent = '🎙 Grabar'; }
        const blob = new Blob(chunks, { type });
        const when = new Date().toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        if (blob.size) save(blob, `Grabación de ${me.name} · ${when}.${type.includes('mp4') ? 'm4a' : 'webm'}`);
      };
      recorder.start(1000);
      haptic(10);
    };
  }
  viewSubs.push(() => { if (recorder) { try { recorder.stop(); } catch { /* ya detenido */ } } });

  function renderDetail() {
    const it = items.find((x) => x.id === sel);
    if (!it || !$('svDetail')) return;
    // Lo que estabas escribiendo (indicaciones, enlace, comentario) se conserva al redibujar.
    const typing = $('svDetail').dataset.item === it.id
      ? ['dtNotes', 'dtYt', 'dtComment'].map((k) => [k, $(k) && $(k).value, $(k) && document.activeElement === $(k)]).filter(([, v]) => v != null)
      : [];
    // Si lo único que cambió es cuál referencia está marcada (video o audio), no se rehace nada:
    // así el video no se recarga ni la pantalla parpadea.
    const sig = JSON.stringify([{ ...it, refType: undefined }, canEdit(it), itemSong(it).key, itemSong(it).youtube]);
    if ($('svDetail').dataset.item === it.id && $('svDetail').dataset.sig === sig && $('dtRefTabs')) {
      showRef(refTypeOf(it), false);
      return;
    }
    setTimeout(() => typing.forEach(([k, v, focused]) => { const el = $(k); if (el && v !== undefined) { el.value = v; if (focused) el.focus({ preventScroll: true }); } }), 0);
    $('svDetail').dataset.item = it.id;
    $('svDetail').dataset.sig = sig;
    const song = itemSong(it);
    const yt = ytId(val(it, 'youtube'));
    const k = val(it, 'key');
    $('svDetail').innerHTML = `
      ${it.byName ? `<div class="small muted" style="margin:0 2px 8px">Agregado por ${esc(it.byName)}</div>` : ''}
      <div class="field"><div class="lab">▶ Referencia</div>
        <div class="tabs ref-tabs" id="dtRefTabs">${[['youtube', '▶ Video de YouTube'], ['audio', '🎙 Audio nuestro']].map(([k, n]) => `<button type="button" data-ref="${k}" class="${refTypeOf(it) === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div id="dtRefYt"${refTypeOf(it) === 'youtube' ? '' : ' hidden'}>${yt ? `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0&playsinline=1" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>` : '<div class="small muted">Sin enlace de YouTube.</div>'}
          ${canEdit(it) ? `<div class="send"><input id="dtYt" placeholder="Pega el enlace de YouTube" value="${esc(it.youtube || '')}"><button data-saveyt>Guardar</button></div>` : ''}</div>
        <div id="dtRefAudio"${refTypeOf(it) === 'audio' ? '' : ' hidden'}></div></div>
      <div class="field"><div class="lab">♪ Tonalidad <b style="color:var(--blue);margin-left:auto;font-size:15px">${esc(k || '—')}</b></div>
        ${canEdit(it) ? `<div class="keys">${KEYS.map((x) => `<button data-key="${x}" class="${k.replace('m', '') === x ? 'on' : ''}">${x}</button>`).join('')}</div>
        <div class="keyline"><button class="mode${/m$/.test(k) ? ' on' : ''}" data-minor>Menor</button><span class="small muted">${song.key && song.key !== k ? 'Original: ' + esc(song.key) : ''}</span></div>` : ''}</div>
      <div class="field"><div class="lab">✎ Indicaciones</div>${canEdit(it) ? `<textarea id="dtNotes" placeholder="Quién empieza, repeticiones, dinámica…">${esc(it.notes || '')}</textarea><div class="send" style="justify-content:flex-end"><button data-savenotes>Guardar</button></div>` : `<div>${esc(it.notes || '—')}</div>`}</div>
      <div class="field"><div class="lab">💬 Comentarios</div><div id="dtComments"><div class="small muted">Cargando…</div></div>
        <div class="send"><input id="dtComment" maxlength="400" placeholder="Escribe un comentario…"><button data-comment>Enviar</button></div></div>
      ${it.songId ? `<div class="field"><div class="lab">📄 Charts, partituras y letra</div><button class="btn ghost" data-go="#/cantos" data-songopen="${it.songId}">Abrir el canto</button></div>` : ''}
      ${canEditList(svc()) ? `<div class="reorder"><button data-move="-1">↑ Subir</button><button data-move="1">↓ Bajar</button></div>` : ''}
      ${canEdit(it) ? '<button class="btn red" style="margin-top:12px" data-delitem>Quitar de esta lista</button>' : ''}`;
    renderAudioRef(it);
    // Video o audio: cualquiera puede mirar las dos; quien edita la lista elige cuál queda marcada.
    $('dtRefTabs').onclick = (e) => {
      const b = e.target.closest('[data-ref]');
      if (!b || b.classList.contains('on')) return;
      showRef(b.dataset.ref, true);
      haptic(5);
      const cur = items.find((x) => x.id === it.id) || it;
      if (canEdit(cur) && refTypeOf(cur) !== b.dataset.ref) api.updateItem(date, it.id, { refType: b.dataset.ref }).catch(() => {});
    };
    if (commentsOff) commentsOff();
    commentsOff = api.watchComments(date, it.id, (list) => { comments = list; renderComments(); });
  }
  // Cambia entre video y audio: la píldora se desliza y el contenido aparece con un fundido suave.
  // Los dos quedan cargados, así que el video no se recarga al volver.
  let refShown = '';
  function showRef(kind, animate) {
    const tabs = $('dtRefTabs');
    if (!tabs) return;
    tabs.dataset.on = kind;
    tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.ref === kind));
    const yt = $('dtRefYt'), au = $('dtRefAudio');
    const show = kind === 'audio' ? au : yt, hide = kind === 'audio' ? yt : au;
    if (!hide.hidden) hide.hidden = true;
    if (show.hidden) {
      show.hidden = false;
      if (animate && refShown !== kind && show.animate && !reducedMotion()) show.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.25,.8,.25,1)' });
    }
    refShown = kind;
  }
  function renderComments() {
    const box = $('dtComments');
    if (!box) return;
    box.innerHTML = comments.map((c) => `<div class="comment"><span class="c-av">${face(allMembers[c.by] || { name: c.byName })}</span><b>${esc(c.byName || '')}</b> <small>${new Date(c.at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>${(isMod() || c.by === user.uid) ? ` <button class="link small" data-delc="${c.id}">borrar</button>` : ''}<p>${esc(c.text)}</p></div>`).join('') || '<div class="small muted">Sin comentarios todavía.</div>';
  }

  $('view').onclick = async (e) => {
    const t = e.target;
    const s = t.closest('[data-sel]');
    if (s) { selectItem(s.dataset.sel); return; }
    if (t.closest('[data-addsong]') || t.closest('#svAddTop')) {
      if (!canAdd()) return;
      if (canEditList(svc())) go(`#/s/${date}/cantos`); else pickSong(date, items);
      return;
    }
    if (t.closest('[data-sendlist]')) {
      const s = svc();
      const again = sent(s);
      await busy(t.closest('[data-sendlist]'), api.saveService(date, { status: 'enviada', sentAt: Date.now() }));
      celebrate(again ? 'Cambios enviados' : '¡Lista enviada!');
      await notify('moderadores', {
        kind: 'lista', link: `#/s/${date}`,
        text: `${me.name} ${again ? 'actualizó' : 'envió'} la lista del ${niceDate(date)}${s.leaderName ? ' (ministra ' + s.leaderName + ')' : ''} · ${items.length} canto${items.length === 1 ? '' : 's'}`,
      });
      toast(again ? '✓ Cambios enviados a los moderadores' : '✓ Lista enviada: les llegó a los moderadores');
      return;
    }
    if (t.closest('[data-editsvc]')) { editService(date); return; }
    if (t.closest('[data-delsvc]')) { confirmDeleteList(date); return; }
    const so = t.closest('[data-songopen]');
    if (so) { sessionStorage.setItem('abrirCanto', so.dataset.songopen); return; }
    const it = items.find((x) => x.id === sel);
    if (!it) return;
    const key = t.closest('[data-key]');
    if (key) { const minor = /m$/.test(val(it, 'key')); await api.updateItem(date, it.id, { key: key.dataset.key + (minor ? 'm' : '') }); return; }
    if (t.closest('[data-minor]')) { const k = val(it, 'key') || 'C'; await api.updateItem(date, it.id, { key: /m$/.test(k) ? k.slice(0, -1) : k + 'm' }); return; }
    if (t.closest('[data-saveyt]')) { const url = $('dtYt').value.trim(); if (url && !ytId(url)) { toast('Ese enlace no parece de YouTube'); return; } await api.updateItem(date, it.id, { youtube: url }); toast('Referencia guardada'); return; }
    if (t.closest('[data-savenotes]')) { await api.updateItem(date, it.id, { notes: $('dtNotes').value.trim() }); toast('Notas guardadas'); return; }
    if (t.closest('[data-comment]')) {
      const text = $('dtComment').value.trim();
      if (!text) return;
      const cid = await api.addComment(date, it.id, { text, by: user.uid, byName: me.name });
      $('dtComment').value = '';
      // Le avisa a quien hizo la lista (si no soy yo). El aviso guarda qué comentario es, para
      // quitarlo si el comentario se borra.
      const owner = svc().by;
      if (owner && owner !== user.uid) notify(owner, { kind: 'comentario', cid: cid || '', link: `#/s/${date}/${it.id}`, text: `${me.name} comentó «${val(it, 'title')}» (${niceDate(date)}): ${text.slice(0, 80)}` });
      return;
    }
    const dc = t.closest('[data-delc]');
    if (dc) {
      // Se quita al instante de la pantalla; si la nube no lo deja, vuelve y se explica por qué.
      const row = dc.closest('.comment');
      const cid = dc.dataset.delc;
      if (row) row.classList.add('leaving');
      try {
        await api.deleteComment(date, it.id, cid);
        comments = comments.filter((c) => c.id !== cid);
        renderComments();
        // Su aviso («X comentó…») también se va.
        removeNotifFor(cid);
        toast('Comentario borrado');
      } catch (err) {
        if (row) row.classList.remove('leaving');
        toast(err && err.code === 'permission-denied' ? 'No tienes permiso para borrar ese comentario' : 'No se pudo borrar: revisa la conexión');
      }
      return;
    }
    const mv = t.closest('[data-move]');
    if (mv) {
      const i = items.indexOf(it);
      const j = i + Number(mv.dataset.move);
      if (j < 0 || j >= items.length) return;
      const other = items[j];
      await Promise.all([api.updateItem(date, it.id, { order: other.order }), api.updateItem(date, other.id, { order: it.order })]);
      return;
    }
    if (t.closest('[data-delitem]')) { if (!confirm('¿Quitar este canto de la lista?')) return; await api.deleteItem(date, it.id); sel = null; toast('Quitado de la lista'); }
  };
  $('view').onkeydown = (e) => { if (e.key === 'Enter' && e.target.id === 'dtComment') { e.preventDefault(); $('view').querySelector('[data-comment]').click(); } };
  viewSubs.push(() => { if (commentsOff) commentsOff(); });

  renderHead();
  viewSubs.push(onServices(() => { renderHead(); renderList(); }));
  viewSubs.push(api.watchItems(date, (list) => {
    // Mantiene al día lo que se está escribiendo: solo se rehace el detalle si cambió algo de él.
    const before = JSON.stringify(items.find((x) => x.id === sel) || null);
    items = list;
    if (sel && !items.some((x) => x.id === sel)) sel = null;
    renderHead();
    renderList();
    const after = JSON.stringify(items.find((x) => x.id === sel) || null);
    if (sel && (before !== after || !$('svDetail') || !$('svDetail').innerHTML)) renderDetail();
    // Los charts de esta lista se van guardando en el teléfono desde ya.
    prefetchSongs(items.map((it) => it.songId));
  }));
  viewSubs.push(() => { if (commentsOff) commentsOff(); });
  // «Chart» y «Letra»: el lector a pantalla completa con los cantos de esta lista en orden.
  $('svView').onclick = (e) => {
    const b = e.target.closest('[data-vm]');
    if (!b || b.dataset.vm === 'lista') return;
    $('svView').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    const keys = Object.fromEntries(items.map((it) => [it.songId, val(it, 'key')]));
    const start = Math.max(0, items.findIndex((it) => it.id === sel));
    setTimeout(() => openChartReader({
      songIds: items.map((it) => it.songId), start, keys, mode: b.dataset.vm, date,
      onClose: () => { if ($('svView')) $('svView').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.vm === 'lista')); },
    }), 120);
  };
  viewSubs.push(() => closeChartReader(true));
}

// Agregar un canto a una lista: de la biblioteca o uno nuevo.
function pickSong(date, items) {
  let q = '';
  openSheet(`<h2>Agregar canto</h2>
    <div class="search"><span>🔍</span><input id="pkQ" placeholder="Buscar en los cantos…"></div>
    <div id="pkList" style="max-height:46vh;overflow:auto"></div>
    <button class="btn dark" id="pkNew">＋ Canto nuevo</button>
    <button class="btn ghost" id="pkCancel">Cancelar</button>`, () => {
    const render = () => {
      const inList = new Set(items.map((x) => x.songId));
      $('pkList').innerHTML = songs.filter((s) => !q || (s.title + ' ' + s.author).toLowerCase().includes(q)).map((s) =>
        `<button class="date-row" data-pick="${s.id}"><span class="d" style="background:${s.status === 'sugerido' ? 'var(--cyan)' : 'var(--blue)'}">${esc(s.key || '♪')}</span><span class="t"><b>${esc(s.title)}</b><small>${esc(s.author || '')}${s.status === 'sugerido' ? ' · sugerido' : ''}</small></span>${inList.has(s.id) ? '<span class="status listo">En la lista</span>' : ''}</button>`).join('') || '<div class="empty">Sin resultados: créalo con «Canto nuevo».</div>';
    };
    render();
    $('pkQ').oninput = (e) => { q = e.target.value.trim().toLowerCase(); render(); };
    $('pkCancel').onclick = closeSheet;
    $('pkNew').onclick = () => editSong(null, { title: $('pkQ').value.trim(), addTo: { date, items } });
    $('pkList').onclick = async (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      const s = songById(b.dataset.pick);
      await addToList(date, items, s.id, s);
      closeSheet();
    };
  });
}
async function addToList(date, items, songId, song, stay) {
  const order = items.reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1;
  const id = await api.addItem(date, { songId, order, key: song.key || '', youtube: song.youtube || '', notes: '', by: user.uid, byName: me.name });
  toast(`«${song.title}» agregado a la lista`);
  if (!stay) go(`#/s/${date}/${id}`);
}

// ======================================================================================
// Pantalla 3: cantos (sugeridos y agregados) con charts y partituras
// ======================================================================================
function viewSongs() {
  // Dos grupos: Alabanza y Adoración (se recuerda el último que viste). Las sugerencias salen en
  // su grupo, marcadas, con «Aprobar» para los moderadores.
  let tab = 'alabanza';
  try { tab = sessionStorage.getItem('cantos-grupo') || 'alabanza'; } catch { /* sin almacenamiento */ }
  let q = '';
  let animTab = ''; // los boletos entran en cascada al abrir y al cambiar de pestaña
  $('view').innerHTML = `${hero({ title: 'Cantos', back: '#/' })}<div class="sheetbody">
    <button class="avatar-float" data-go="#/cuenta">${face(me)}</button>
    <h2 class="big" style="text-align:center;font-size:21px">Repertorio del equipo</h2>
    <div class="tabs" id="sgTabs">${Object.entries(CATS).map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n} <span class="tab-n" data-n="${k}"></span></button>`).join('')}</div>
    <div id="sgLink"></div>
    <div class="search" style="margin-bottom:16px"><span>🔍</span><input id="sgQ" placeholder="Buscar canto o autor…"></div>
    <div id="sgList"></div>
  </div>
  ${canCreate() ? `<button class="get" id="sgNew">＋ ${isMod() ? 'Nuevo canto' : 'Sugerir canto'}</button>` : ''}`;
  const render = () => {
    // Los agregados son los mismos cantos de Letras en el Temporizador.
    const st = api.tempoStatus ? api.tempoStatus() : 'nube';
    $('sgLink').innerHTML = `<div class="link-note ${st}"><span class="dot"></span><span>${st === 'ok' ? 'Compartidos con el <b>Temporizador</b>: lo que agrega un moderador aparece en Letras.' : st === 'off' ? 'El <b>Temporizador</b> no está abierto en la PC: se muestran los últimos cantos que se recibieron.' : st === 'buscando' ? 'Conectando con el <b>Temporizador</b>…' : 'Compartidos con el <b>Temporizador</b> por la nube.'}</span></div>`;
    Object.keys(CATS).forEach((k) => { const n = songs.filter((s) => catOf(s) === k).length; const el = document.querySelector(`[data-n="${k}"]`); if (el) el.textContent = n ? `· ${n}` : ''; });
    // Las sugerencias primero (para que los moderadores las vean), después por título.
    const list = songs.filter((s) => catOf(s) === tab)
      .filter((s) => !q || (s.title + ' ' + (s.author || '')).toLowerCase().includes(q))
      .sort((a, b) => (b.status === 'sugerido') - (a.status === 'sugerido') || (a.title || '').localeCompare(b.title || ''));
    const enter = animTab !== tab;
    animTab = tab;
    $('sgList').innerHTML = list.map((s, i) => `<div class="ticket${s.status === 'sugerido' ? ' sug' : ''}${catOf(s) === 'adoracion' ? ' ador' : ''}${enter && i < 12 ? ' enter' : ''}" style="--i:${i}">
      <div class="top"><span class="badge"><small>TONO</small><b>${esc(s.key || '—')}</b></span><span class="t"><b>${esc(s.title)}</b><small>${esc(s.author || 'Autor sin indicar')}</small></span>
        ${isMod() ? `<button class="tk-edit" data-editsong="${s.id}" aria-label="Editar canto">✎</button>` : ''}</div>
      <div class="dash"></div>
      <div class="bottom"><span class="ico">${ytId(s.youtube) ? '▶' : '♫'}</span><span class="grow">${s.status === 'sugerido' ? '💡 Sugerido por ' + esc(s.byName || '—') : sectionsOf(s.text).filter((x) => x.name).length + ' partes' + (s.chart ? ' · con chart' : '')}</span>
      ${s.status === 'sugerido' && isMod() ? `<button data-approve="${s.id}">Aprobar</button>` : ''}
      <button class="ghost" data-chart="${s.id}">Chart</button><button data-letra="${s.id}">Letra</button></div></div>`).join('')
      || `<div class="empty">${q ? 'Sin resultados.' : `Aún no hay cantos de ${CATS[tab].toLowerCase()}.`}</div>`;
  };
  $('sgTabs').onclick = (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    try { sessionStorage.setItem('cantos-grupo', tab); } catch { /* sin almacenamiento */ }
    $('sgTabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  };
  $('sgQ').oninput = (e) => { q = e.target.value.trim().toLowerCase(); render(); };
  if ($('sgNew')) $('sgNew').onclick = () => editSong(null, { category: tab });
  $('sgList').onclick = async (e) => {
    const a = e.target.closest('[data-approve]');
    if (a) { await busy(a, api.updateSong(a.dataset.approve, { status: 'agregado' })); celebrate('Canto aprobado'); return; }
    const ed = e.target.closest('[data-editsong]');
    if (ed) { editSong(ed.dataset.editsong); return; }
    const c = e.target.closest('[data-chart]');
    if (c) { openSong(c.dataset.chart, 'chart'); return; }
    const l = e.target.closest('[data-letra]');
    if (l) openSong(l.dataset.letra, 'letra');
  };
  render();
  viewSubs.push(onSongs(render));
  const want = sessionStorage.getItem('abrirCanto');
  if (want) { sessionStorage.removeItem('abrirCanto'); setTimeout(() => openSong(want), 50); }
}
const songListeners = new Set();
const onSongs = (fn) => { songListeners.add(fn); return () => songListeners.delete(fn); };

// ---- Grupos del repertorio ----
// Un canto sin grupo (p. ej. uno que vino del Temporizador) cuenta como Alabanza hasta que un
// moderador lo cambie al editarlo.
const CATS = { alabanza: 'Alabanza', adoracion: 'Adoración' };
const catOf = (s) => (s && s.category === 'adoracion' ? 'adoracion' : 'alabanza');

// ---- Partes de un canto (Intro, Verso, Pre-coro, Coro, Puente, Final) ----
// Se guardan en el mismo formato que Letras del Temporizador: «[Coro]» en una línea abre la parte,
// y una línea en blanco dentro de la parte separa diapositivas.
const SECTIONS = ['Intro', 'Verso', 'Pre-coro', 'Coro', 'Puente', 'Final'];
const secKind = (name) => (/^pre[\s-]?coro/i.test(name) ? 'precoro' : /^(coro|chorus|estribillo)/i.test(name) ? 'coro' : /^(verso|estrofa|verse)/i.test(name) ? 'verso'
  : /^(puente|bridge)/i.test(name) ? 'puente' : /^(intro)/i.test(name) ? 'intro' : /^(final|outro|tag)/i.test(name) ? 'final' : 'otro');
function sectionsOf(text) {
  const out = [];
  let cur = { name: '', body: [] };
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    const h = /^\s*\[(.+?)\]\s*$/.exec(line);
    if (h) { if (cur.name || cur.body.join('').trim()) out.push(cur); cur = { name: h[1].trim(), body: [] }; } else cur.body.push(line);
  }
  if (cur.name || cur.body.join('').trim()) out.push(cur);
  return out.map((s) => ({ name: s.name, body: s.body.join('\n').trim() }));
}
// Divide la letra de una parte en diapositivas de n líneas (como «Dividir» de Letras). Si ya tiene
// líneas en blanco (diapositivas hechas a mano) se respeta, salvo que se pida dividir de nuevo.
function splitSlides(body, n, force = false) {
  const text = String(body || '').replace(/\r/g, '').trim();
  if (!text || (!force && /\n\s*\n/.test(text))) return text;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!force && lines.length <= n) return text;
  const out = [];
  for (let i = 0; i < lines.length; i += n) out.push(lines.slice(i, i + n).join('\n'));
  return out.join('\n\n');
}
const splitN = () => { try { return Number(localStorage.getItem('listas-dividir')) || 2; } catch { return 2; } };
const textOf = (secs) => secs.filter((s) => s.name || s.body.trim()).map((s) => (s.name ? `[${s.name}]\n` : '') + s.body.trim()).join('\n\n');
const secChip = (name) => `<span class="sec-chip k-${secKind(name)}">${esc(name || 'Letra')}</span>`;

// Ver un canto: «Chart» (acordes, fotos y PDF de partituras) o «Letra» (por partes).
function openSong(id, mode = 'letra') {
  const s = songById(id);
  if (!s) return;
  const yt = ytId(s.youtube);
  let filesOff = null;
  const secs = sectionsOf(s.text);
  openSheet(`<div class="song-head"><span class="num">${esc(s.key || '♪')}</span><div class="grow"><b>${esc(s.title)}</b><small>${esc(s.author || '')}${s.status === 'sugerido' ? ' · sugerido' : ''}</small></div></div>
    <div class="tabs" id="soMode"><button data-m="letra" class="${mode === 'letra' ? 'on' : ''}">Letra</button><button data-m="chart" class="${mode === 'chart' ? 'on' : ''}">Chart</button></div>
    <div id="soLetra"${mode === 'letra' ? '' : ' hidden'}>
      ${secs.length ? secs.map((x, i) => `<div class="sec-block" style="--i:${i}">${x.name ? secChip(x.name) : ''}
        ${x.body.split(/\n\s*\n/).filter((t) => t.trim()).map((t) => `<div class="slide-card k-${secKind(x.name)}">${esc(t.trim())}</div>`).join('')}</div>`).join('') : '<div class="empty">Este canto aún no tiene letra.</div>'}
    </div>
    <div id="soChart"${mode === 'chart' ? '' : ' hidden'}>
      ${s.chart ? `<div class="field"><div class="lab">🎸 Acordes</div><div class="chart">${esc(s.chart)}</div></div>` : ''}
      <div class="field"><div class="lab">📄 Fotos y PDF de partituras</div><div class="files" id="soFiles"><span class="small muted">Cargando…</span></div>
        ${canCreate() ? '<label class="btn ghost" style="text-align:center;margin-top:10px">＋ Subir foto o PDF<input type="file" id="soUp" accept="image/*,application/pdf" hidden></label>' : ''}</div>
    </div>
    ${yt ? `<div class="field"><div class="lab">▶ Referencia</div><div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0&playsinline=1" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>` : ''}
    ${isMod() ? '<button class="btn" id="soEdit">✎ Editar canto</button>' : ''}
    <button class="btn ghost" id="soClose">Cerrar</button>`, () => {
    sheetSubs.push(() => { if (filesOff) filesOff(); filesOff = null; });
    $('soClose').onclick = () => closeSheet();
    if ($('soEdit')) $('soEdit').onclick = () => editSong(id);
    $('soMode').onclick = (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      $('soMode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      const show = $(b.dataset.m === 'letra' ? 'soLetra' : 'soChart'), hide = $(b.dataset.m === 'letra' ? 'soChart' : 'soLetra');
      hide.hidden = true; show.hidden = false;
      show.classList.remove('swap'); void show.offsetWidth; show.classList.add('swap');
    };
    filesOff = api.watchFiles(id, (files) => {
      // La lista de archivos del lector se mantiene al día (al subir o borrar uno).
      filesOf.set(id, Promise.resolve(files.slice().sort((a, b) => (a.at || 0) - (b.at || 0))));
      prefetched.delete(id);
      prefetchSongs([id]);
      if (!$('soFiles')) return;
      $('soFiles').innerHTML = files.map((f) => `<button class="file" data-file="${f.id}" data-type="${esc(f.type)}">${isAudio(f) ? '🎙' : f.type === 'application/pdf' ? '📕' : '🖼'}<span>${esc(f.name)}</span>${(isMod() || f.by === user.uid) ? `<i data-delfile="${f.id}">✕</i>` : ''}</button>`).join('') || '<span class="small muted">Aún no hay charts ni partituras.</span>';
    });
    $('soFiles').onclick = async (e) => {
      const del = e.target.closest('[data-delfile]');
      if (del) { e.stopPropagation(); if (confirm('¿Borrar este archivo?')) { await api.deleteFile(id, del.dataset.delfile); toast('Archivo borrado'); } return; }
      const f = e.target.closest('[data-file]');
      if (!f) return;
      // Un audio se escucha ahí mismo.
      if (/^audio\//.test(f.dataset.type)) {
        const meta = (await songFiles(id)).find((x) => x.id === f.dataset.file);
        if (!meta) return;
        const d = await fileData(id, meta).catch(() => null);
        if (!d) { toast('No se pudo cargar el audio'); return; }
        let pl = $('soAudio');
        if (!pl) { pl = document.createElement('audio'); pl.id = 'soAudio'; pl.controls = true; pl.style.cssText = 'width:100%;margin-top:8px'; $('soFiles').after(pl); }
        pl.src = d.url; pl.play().catch(() => {});
        return;
      }
      // Se abre en el lector de la app (pantalla completa), no en otra pestaña.
      closeSheet(true);
      openChartReader({ songIds: [id] });
    };
    if ($('soUp')) $('soUp').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        toast('Subiendo…');
        const { base64, type, name } = await prepareFile(file);
        await api.addFile(id, { name, type, size: base64.length, by: user.uid, byName: me.name }, base64);
        toast('Archivo agregado');
      } catch (err) { toast(err.message || 'No se pudo subir'); }
    };
  });
}
// Foto de perfil: cuadrado centrado, en JPEG pequeño (unos 15–25 KB).
function squarePhoto(file, size) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Elige una foto')); return; }
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('No se pudo leer la foto'));
    img.src = URL.createObjectURL(file);
  });
}
// Las fotos se achican (máx. 1800 px) para que pesen poco; los PDF hasta 6 MB.
function prepareFile(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      if (file.size > 6e6) { reject(new Error('El PDF debe pesar menos de 6 MB')); return; }
      const r = new FileReader();
      r.onload = () => resolve({ base64: String(r.result).split(',')[1], type: 'application/pdf', name: file.name });
      r.onerror = () => reject(new Error('No se pudo leer el archivo'));
      r.readAsDataURL(file);
      return;
    }
    if (!file.type.startsWith('image/')) { reject(new Error('Sube una foto o un PDF')); return; }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve({ base64: c.toDataURL('image/jpeg', 0.82).split(',')[1], type: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg' });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('No se pudo leer la foto'));
    img.src = URL.createObjectURL(file);
  });
}

// Crear o editar un canto.
// - Moderador: canto completo con la letra por partes (Intro, Verso, Pre-coro, Coro, Puente,
//   Final) y el chart. Se comparte con Letras del Temporizador.
// - Colaborador: solo sugiere (título, autor, referencia y tono); un moderador lo aprueba.
function editSong(id, opts = {}) {
  const s = (id && songById(id)) || { title: opts.title || '', author: '', key: '', youtube: '', text: '', chart: '' };
  const full = isMod();
  let secs = sectionsOf(s.text);
  let fresh = -1; // la parte recién agregada entra con animación
  openSheet(`<h2>${id ? 'Editar canto' : full ? 'Canto nuevo' : 'Sugerir canto'}</h2>
    <label class="l">¿Dónde va?</label>
    <div class="tabs cat-pick" id="edCat">${Object.entries(CATS).map(([k, n]) => `<button type="button" data-cat="${k}" class="${(id ? catOf(s) : opts.category || 'alabanza') === k ? 'on' : ''}">${k === 'adoracion' ? '🕊' : '🎺'} ${n}</button>`).join('')}</div>
    <label class="l">Título</label><input id="edTitle" maxlength="80" value="${esc(s.title)}" placeholder="Nombre del canto">
    <label class="l">Autor</label><input id="edAuthor" maxlength="80" value="${esc(s.author || '')}" placeholder="Opcional">
    <label class="l">Referencia de YouTube</label><input id="edYt" value="${esc(s.youtube || '')}" placeholder="https://youtube.com/watch?v=…">
    <label class="l">Tonalidad original</label><div class="keys" id="edKeys">${KEYS.map((x) => `<button data-key="${x}" class="${(s.key || '').replace('m', '') === x ? 'on' : ''}">${x}</button>`).join('')}</div>
    <div class="keyline"><button class="mode${/m$/.test(s.key || '') ? ' on' : ''}" id="edMinor">Menor</button></div>
    ${full ? `<label class="l">Letra por partes</label>
    <div id="edSecs"></div>
    <div class="sec-add" id="edAdd">${SECTIONS.map((n) => `<button data-add="${n}" class="k-${secKind(n)}">＋ ${n}</button>`).join('')}</div>
    <div class="emo-bar" id="edEmojis"><span>Agregar a la letra:</span>${['🎺', '🎻', '🎸', '🎤', '🎵'].map((x) => `<button type="button" data-emo="${x}">${x}</button>`).join('')}</div>
    <div class="split-row"><span>Diapositivas de</span><select id="edSplitN">${[2, 3, 4].map((n) => `<option value="${n}"${n === splitN() ? ' selected' : ''}>${n} líneas</option>`).join('')}</select><button type="button" class="link" id="edSplit">Dividir de nuevo</button></div>
    <div class="small muted">Como en el Temporizador: pega la letra y se divide sola en diapositivas. Si pegas la canción con «[Coro]», «[Verso 1]»…, se separa sola en sus partes.</div>
    <label class="l">Chart (acordes sobre la letra)</label><textarea id="edChart" class="chart" placeholder="G          D&#10;Grande eres Jehová">${esc(s.chart || '')}</textarea>
    <div class="hint">🔗 Al guardar, el canto también queda en <b>Letras</b> del Temporizador. Las fotos y PDF de partituras se suben desde «Chart».</div>`
    : '<div class="hint">Tu sugerencia les llega a los moderadores. Cuando la aprueben, ellos le agregan la letra por partes.</div>'}
    <div class="err" id="edErr"></div>
    <button class="btn" id="edSave">${id ? 'Guardar cambios' : full ? 'Agregar canto' : 'Enviar sugerencia'}</button>
    ${id && full && !s.shared ? '<button class="btn red" id="edDel">Borrar canto</button>' : ''}
    <button class="btn ghost" id="edCancel">Cancelar</button>`, () => {
    let key = s.key || '';
    let category = id ? catOf(s) : opts.category || 'alabanza';
    $('edCat').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; category = b.dataset.cat; $('edCat').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); haptic(5); };
    const renderSecs = () => {
      if (!$('edSecs')) return;
      // Verso 1, Verso 2…: se numeran solos si hay más de uno.
      $('edSecs').innerHTML = secs.map((x, i) => `<div class="sec-edit k-${secKind(x.name)}${i === fresh ? ' pop' : ''}" data-i="${i}">
        <div class="sec-top">${secChip(x.name)}<span class="grow"></span>
          <button data-mv="-1" aria-label="Subir"${i === 0 ? ' disabled' : ''}>▲</button><button data-mv="1" aria-label="Bajar"${i === secs.length - 1 ? ' disabled' : ''}>▼</button><button data-del aria-label="Quitar parte">✕</button></div>
        <textarea data-body rows="${Math.min(8, Math.max(3, x.body.split('\n').length + 1))}" placeholder="Escribe la letra de ${esc(x.name || 'esta parte')}…">${esc(x.body)}</textarea></div>`).join('')
        || '<div class="empty" style="padding:12px">Toca una parte de abajo para empezar: ＋ Intro, ＋ Verso, ＋ Coro…</div>';
      fresh = -1;
    };
    const renumber = () => {
      const versos = secs.filter((x) => secKind(x.name) === 'verso');
      if (versos.length > 1) versos.forEach((x, i) => { x.name = `Verso ${i + 1}`; });
      else if (versos.length === 1 && /^Verso \d+$/.test(versos[0].name)) versos[0].name = 'Verso';
    };
    renderSecs();
    if ($('edSecs')) {
      $('edSecs').oninput = (e) => { const ta = e.target.closest('[data-body]'); if (ta) secs[Number(ta.closest('[data-i]').dataset.i)].body = ta.value; };
      // Al pegar: si trae partes («[Coro]»…), se separan solas; si no, se divide en diapositivas.
      $('edSecs').addEventListener('paste', (e) => {
        const ta = e.target.closest('[data-body]');
        if (!ta) return;
        const text = ((e.clipboardData && e.clipboardData.getData('text/plain')) || '').replace(/\r/g, '');
        const i = Number(ta.closest('[data-i]').dataset.i);
        if (/^\s*\[.+\]\s*$/m.test(text)) {
          e.preventDefault();
          const pasted = sectionsOf(text).map((x) => ({ name: x.name || secs[i].name, body: splitSlides(x.body, splitN()) }));
          // Si la parte estaba vacía se reemplaza; si ya tenía letra, las nuevas van después.
          if (secs[i].body.trim()) secs.splice(i + 1, 0, ...pasted); else secs.splice(i, 1, ...pasted);
          fresh = -1; renumber(); renderSecs();
          toast(`✓ ${pasted.length} parte${pasted.length === 1 ? '' : 's'} separada${pasted.length === 1 ? '' : 's'}`);
          return;
        }
        const lines = text.split('\n').filter((l) => l.trim());
        if (/\n\s*\n/.test(text.trim()) || lines.length <= splitN()) return;
        e.preventDefault();
        ta.setRangeText(splitSlides(text, splitN()), ta.selectionStart, ta.selectionEnd, 'end');
        secs[i].body = ta.value;
        toast(`Letra dividida en diapositivas de ${splitN()} líneas`);
      });
      // Íconos 🎺 🎻 🎸 🎤 🎵: van a la parte donde estabas escribiendo, en el lugar del cursor
      // (si no tocaste ninguna, al final de la última).
      let lastTa = null;
      $('edSecs').addEventListener('focusin', (e) => { if (e.target.matches('[data-body]')) lastTa = e.target; });
      $('edEmojis').addEventListener('pointerdown', (e) => { if (e.target.closest('[data-emo]')) e.preventDefault(); });
      $('edEmojis').onclick = (e) => {
        const b = e.target.closest('[data-emo]');
        if (!b) return;
        let ta = lastTa && lastTa.isConnected ? lastTa : $('edSecs').querySelector('[data-body]:last-of-type') || [...$('edSecs').querySelectorAll('[data-body]')].pop();
        if (!ta) { toast('Primero agrega una parte (＋ Verso, ＋ Coro…)'); return; }
        const at = ta.selectionStart ?? ta.value.length, end = ta.selectionEnd ?? ta.value.length;
        const before = ta.value.slice(0, at);
        ta.setRangeText((before && !/\s$/.test(before) ? ' ' : '') + b.dataset.emo + ' ', at, end, 'end');
        secs[Number(ta.closest('[data-i]').dataset.i)].body = ta.value;
        ta.focus({ preventScroll: true });
        haptic(5);
      };
      $('edSplitN').onchange = () => { try { localStorage.setItem('listas-dividir', $('edSplitN').value); } catch { /* sin almacenamiento */ } };
      $('edSplit').onclick = () => { secs.forEach((x) => { x.body = splitSlides(x.body, splitN(), true); }); renderSecs(); toast(`Dividido en diapositivas de ${splitN()} líneas`); };
      $('edSecs').onclick = async (e) => {
        const box = e.target.closest('[data-i]');
        if (!box) return;
        const i = Number(box.dataset.i);
        const mv = e.target.closest('[data-mv]');
        if (mv) { const j = i + Number(mv.dataset.mv); if (j < 0 || j >= secs.length) return; [secs[i], secs[j]] = [secs[j], secs[i]]; fresh = j; renumber(); renderSecs(); haptic(5); return; }
        if (e.target.closest('[data-del]')) {
          if (secs[i].body.trim() && !confirm(`¿Quitar «${secs[i].name}» y su letra?`)) return;
          box.classList.add('leaving'); await wait(200);
          secs.splice(i, 1); renumber(); renderSecs();
        }
      };
      $('edAdd').onclick = (e) => {
        const b = e.target.closest('[data-add]');
        if (!b) return;
        secs.push({ name: b.dataset.add, body: '' });
        fresh = secs.length - 1;
        renumber(); renderSecs(); haptic(6);
        const ta = $('edSecs').querySelector(`[data-i="${fresh === -1 ? secs.length - 1 : fresh}"] textarea`) || $('edSecs').lastElementChild.querySelector('textarea');
        if (ta) { ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => ta.focus({ preventScroll: true }), 250); }
      };
    }
    $('edKeys').onclick = (e) => { const b = e.target.closest('[data-key]'); if (!b) return; key = b.dataset.key + (/m$/.test(key) ? 'm' : ''); $('edKeys').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    $('edMinor').onclick = () => { key = /m$/.test(key) ? key.slice(0, -1) : (key || 'C') + 'm'; $('edMinor').classList.toggle('on', /m$/.test(key)); };
    $('edCancel').onclick = () => closeSheet();
    $('edSave').onclick = async () => {
      const title = $('edTitle').value.trim();
      const youtube = $('edYt').value.trim();
      if (!title) { shake($('edTitle')); $('edErr').textContent = 'Escribe el título'; return; }
      if (youtube && !ytId(youtube)) { shake($('edYt')); $('edErr').textContent = 'El enlace de YouTube no es válido'; return; }
      const data = { title, author: $('edAuthor').value.trim(), youtube, key, category };
      // Una parte escrita sin líneas en blanco se divide en diapositivas (igual que en Letras).
      if (full) { data.text = textOf(secs.map((x) => ({ ...x, body: splitSlides(x.body, splitN()) }))); data.chart = $('edChart').value.replace(/\r/g, ''); }
      try {
        if (id) {
          await busy($('edSave'), api.updateSong(id, data));
          closeSheet(); toast('✓ Canto guardado'); setTimeout(() => openSong(id, 'letra'), 300); return;
        }
        const newId = await busy($('edSave'), api.addSong({ text: '', chart: '', ...data, status: full ? 'agregado' : 'sugerido', by: user.uid, byName: me.name }));
        closeSheet();
        if (!full) notify('moderadores', { kind: 'canto', link: '#/cantos', text: `${me.name} sugirió el canto «${title}» para ${CATS[category]}` });
        if (opts.addTo) await addToList(opts.addTo.date, opts.addTo.items, newId, data, opts.addTo.stay);
        else {
          celebrate(full ? `Agregado en ${CATS[category]}` : 'Sugerencia enviada');
          // Si estás en Cantos, se muestra el grupo donde quedó.
          try { sessionStorage.setItem('cantos-grupo', category); } catch { /* sin almacenamiento */ }
          if (location.hash === '#/cantos') setTimeout(route, 900);
        }
      } catch (e) { shake($('edSave')); if ($('edErr')) $('edErr').textContent = e.message || 'No se pudo guardar'; }
    };
    if ($('edDel')) $('edDel').onclick = async () => { if (!confirm('¿Borrar este canto del repertorio? También se borra de Letras en las computadoras con el Temporizador.')) return; await api.deleteSong(id); closeSheet(); toast('Canto borrado'); };
  });
}

// ======================================================================================
// Equipo (moderador) y cuenta
// ======================================================================================
function viewTeam() {
  let members = [];
  $('view').innerHTML = `${hero({ title: 'Equipo', back: '#/' })}<div class="sheetbody"><h2 class="big" style="font-size:21px">${isMod() ? 'Quién puede usar la app' : 'El equipo'}</h2>
    <p class="muted small">${isMod() ? '<b>Moderador</b>: acceso a todo (pueden ser varios). <b>Colaborador</b>: hace su lista, la envía, sugiere cantos y comenta. <b>Participante</b>: solo ve las listas y comenta. Toca a alguien para cambiar su rol.' : 'Las personas que planean los cantos. Los permisos los dan los moderadores.'}</p>
    ${isMod() ? '<button class="btn" id="tmNew" style="margin:6px 0 8px">＋ Crear usuario</button>' : ''}
    <div id="tmList"><div class="member skel"><span class="av"></span><span class="grow"><i></i><i class="s"></i></span></div><div class="member skel"><span class="av"></span><span class="grow"><i></i><i class="s"></i></span></div></div></div>`;
  const ORDER = { moderador: 0, colaborador: 1, participante: 2, pendiente: 3 };
  viewSubs.push(api.watchMembers((list) => {
    members = list;
    if (!isMod()) list = list.filter((m) => m.role !== 'pendiente');
    list.sort((a, b) => (ORDER[a.role] ?? 9) - (ORDER[b.role] ?? 9) || a.name.localeCompare(b.name));
    $('tmList').innerHTML = list.map((m, i) => `<div class="member${isMod() && m.id !== user.uid ? ' tap' : ''} enter" style="--i:${i}" data-member="${m.id}"><span class="av">${face(m)}</span><div class="grow"><b>${esc(m.name)}</b><div class="small muted">${esc(m.instrument || (isMod() ? m.email : '') || '')}</div></div>
      <span class="status role-${esc(m.role)}">${m.id === user.uid ? 'Tú · ' : ''}${esc(ROLES[m.role] || m.role)}</span>${isMod() && m.id !== user.uid ? '<span class="chev">›</span>' : ''}</div>`).join('');
  }));
  if ($('tmNew')) $('tmNew').onclick = () => newUser();
  $('view').onclick = (e) => {
    const r = e.target.closest('[data-member]');
    if (!r || !isMod() || r.dataset.member === user.uid) return;
    const m = members.find((x) => x.id === r.dataset.member);
    if (m) editMember(m);
  };
}
// Selector de rol con la píldora que se desliza.
const roleTabs = (id, sel) => `<div class="tabs" id="${id}">${['moderador', 'colaborador', 'participante'].map((r) => `<button data-r="${r}" class="${sel === r ? 'on' : ''}">${ROLES[r]}</button>`).join('')}</div>`;
const ROLE_HELP = { moderador: 'Acceso a todo: listas, cantos, equipo y avisos.', colaborador: 'Hace su lista, la envía, sugiere cantos, sube charts y comenta.', participante: 'Solo ve las listas y comenta.' };
function bindRoleTabs(id, onPick) {
  $(id).onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b) return; $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); haptic(5); onPick(b.dataset.r); };
}
const randomPass = () => { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let p = ''; const a = new Uint32Array(8); crypto.getRandomValues(a); a.forEach((n) => { p += c[n % c.length]; }); return p; };
// El moderador crea la cuenta (correo + contraseña inicial) y le da su rol.
function newUser() {
  let role = 'colaborador';
  openSheet(`<h2>Crear usuario</h2>
    <label class="l">Nombre</label><input id="nuName" maxlength="40" placeholder="Nombre de la persona">
    <label class="l">Qué hace</label><input id="nuInst" maxlength="40" placeholder="Opcional: voz, guitarra, batería…">
    <label class="l">Correo</label><input id="nuEmail" type="email" autocomplete="off" placeholder="correo@ejemplo.com">
    <label class="l">Contraseña inicial</label><div class="send" style="margin-top:0"><input id="nuPass" autocomplete="new-password" value="${randomPass()}"><button id="nuGen" type="button" aria-label="Otra contraseña">↻</button></div>
    <label class="l">Rol</label>${roleTabs('nuRole', role)}
    <div class="small muted" id="nuHelp">${ROLE_HELP[role]}</div>
    <div class="err" id="nuErr"></div>
    <button class="btn" id="nuOk">Crear usuario</button>
    <button class="btn ghost" id="nuCancel">Cancelar</button>`, () => {
    bindRoleTabs('nuRole', (r) => { role = r; $('nuHelp').textContent = ROLE_HELP[r]; });
    $('nuGen').onclick = () => { $('nuPass').value = randomPass(); $('nuGen').classList.remove('spin'); void $('nuGen').offsetWidth; $('nuGen').classList.add('spin'); };
    $('nuCancel').onclick = () => closeSheet();
    $('nuOk').onclick = async () => {
      const name = $('nuName').value.trim(), email = $('nuEmail').value.trim().toLowerCase(), pass = $('nuPass').value;
      if (!name) { shake($('nuName')); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { shake($('nuEmail')); $('nuErr').textContent = 'Escribe un correo válido'; return; }
      if (pass.length < 6) { shake($('nuPass')); $('nuErr').textContent = 'La contraseña debe tener al menos 6 caracteres'; return; }
      try {
        await busy($('nuOk'), api.createUser(email, pass, { name, instrument: $('nuInst').value.trim(), role, by: user.uid }));
      } catch (e) { shake($('nuOk')); $('nuErr').textContent = authError(e); return; }
      celebrate('Usuario creado');
      shareAccess(name, email, pass, role);
    };
  });
}
// Para pasarle a la persona sus datos de entrada.
function shareAccess(name, email, pass, role) {
  const link = location.origin + location.pathname;
  const msg = `Hola ${name}, ya tienes acceso a Listas de alabanza como ${ROLES[role].toLowerCase()}.\nEntra en: ${link}\nCorreo: ${email}\nContraseña: ${pass}\n(Puedes cambiarla en Más › Mi cuenta.)`;
  openSheet(`<h2>Listo: ${esc(name)}</h2>
    <p class="muted small" style="margin:0">Pásale estos datos. Al entrar, su teléfono recuerda la sesión.</p>
    <div class="hint" style="white-space:pre-line;user-select:text">${esc(msg)}</div>
    ${navigator.share ? '<button class="btn" id="saShare">Compartir…</button>' : ''}
    <button class="btn ${navigator.share ? 'ghost' : ''}" id="saCopy">Copiar</button>
    <button class="btn ghost" id="saClose">Cerrar</button>`, () => {
    if ($('saShare')) $('saShare').onclick = () => navigator.share({ text: msg }).catch(() => {});
    $('saCopy').onclick = async () => { try { await navigator.clipboard.writeText(msg); toast('✓ Copiado'); } catch { toast('Mantén presionado el texto para copiarlo'); } };
    $('saClose').onclick = () => closeSheet();
  });
}
function editMember(m) {
  let role = m.role;
  openSheet(`<div class="member" style="border:0;padding-top:0"><span class="av">${face(m)}</span><div class="grow"><b>${esc(m.name)}</b><div class="small muted">${esc(m.email || '')}</div></div></div>
    <label class="l">Rol</label>${roleTabs('emRole', ['moderador', 'colaborador', 'participante'].includes(role) ? role : '')}
    <div class="small muted" id="emHelp">${ROLE_HELP[role] || 'Elige un rol para darle acceso.'}</div>
    <button class="btn" id="emSave">Guardar</button>
    ${api.demo || !m.email ? '' : '<button class="btn ghost" id="emReset">Enviarle un correo para cambiar su contraseña</button>'}
    <button class="btn red" id="emDel">Quitarle el acceso</button>
    <button class="btn ghost" id="emCancel">Cancelar</button>`, () => {
    bindRoleTabs('emRole', (r) => { role = r; $('emHelp').textContent = ROLE_HELP[r]; });
    $('emCancel').onclick = () => closeSheet();
    $('emSave').onclick = async () => {
      if (!ROLE_HELP[role]) { shake($('emRole')); return; }
      await busy($('emSave'), api.updateMember(m.id, { role }));
      closeSheet(); toast(`✓ ${m.name} ahora es ${ROLES[role].toLowerCase()}`);
    };
    if ($('emReset')) $('emReset').onclick = () => busy($('emReset'), api.reset(m.email)).then(() => toast('Correo enviado a ' + m.email)).catch((e) => toast(authError(e)));
    $('emDel').onclick = async () => {
      if (!confirm(`¿Quitarle el acceso a ${m.name}? Ya no podrá entrar a la app.`)) return;
      await busy($('emDel'), api.removeMember(m.id));
      closeSheet(); toast('Acceso quitado');
    };
  });
}
function viewAccount() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('view').innerHTML = `${hero({ title: 'Mi cuenta', back: '#/' })}<div class="sheetbody">
    <div class="profile">
      <label class="photo-pick" aria-label="Cambiar foto"><span class="av big" id="acFace">${face(me)}</span><span class="cam">📷</span><input type="file" id="acPhoto" accept="image/*" hidden></label>
      <b>${esc(me.name)}</b><div class="small muted">${esc(user.email || '')} · ${esc(ROLES[me.role] || me.role)}</div>
      <div class="row" style="justify-content:center;margin-top:6px"><label class="link" for="acPhoto">${me.photo ? 'Cambiar foto' : 'Poner una foto'}</label>${me.photo ? '<button class="link" id="acNoPhoto" style="color:var(--red)">Quitar</button>' : ''}</div>
    </div>
    ${realMod() ? `<label class="l" style="margin-top:4px">Ver la app como</label>
    <div class="tabs" id="acViewAs" style="margin-top:8px">${['moderador', 'colaborador', 'participante'].map((r) => `<button data-va="${r}" class="${me.role === r ? 'on' : ''}">${ROLES[r]}</button>`).join('')}</div>
    <p class="small muted" style="margin:6px 2px 14px">Para ver lo que ven ellos. Solo cambia en este teléfono; sigues siendo moderador y puedes volver cuando quieras.</p>` : ''}
    <label class="l small muted">Tu nombre</label><div class="send"><input id="acName" maxlength="40" value="${esc(me.name)}"><button id="acSave">Guardar</button></div>
    <label class="l" style="margin-top:14px">Apariencia</label>
    <div class="tabs" id="acTheme" style="margin-top:8px">${[['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']].map(([k, n]) => `<button data-th="${k}" class="${theme() === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${standalone ? '' : `<div class="hint" style="margin-top:14px"><b>Instálala en tu teléfono</b><br>${ios ? 'En Safari toca <b>Compartir</b> (□↑) y luego <b>«Agregar a inicio»</b>.' : 'En Chrome toca <b>⋮</b> y luego <b>«Instalar app»</b> o «Agregar a la pantalla principal».'}</div>
      <button class="btn" id="acInstall" style="margin-top:10px" hidden>Instalar app</button>`}
    ${api.demo ? '' : '<label class="l" style="margin-top:14px">Cambiar contraseña</label><div class="send"><input id="acPass" type="password" autocomplete="new-password" placeholder="Nueva contraseña (mínimo 6)"><button id="acPassOk">Cambiar</button></div>'}
    ${api.demo ? `<div class="hint" style="margin-top:14px"><b>Modo demostración</b>: ver la app como <div class="tabs" id="acDemo" style="margin:8px 0 0"><button data-r="moderador" class="${me.role === 'moderador' ? 'on' : ''}">Moderador</button><button data-r="colaborador" class="${me.role === 'colaborador' ? 'on' : ''}">Colaborador</button><button data-r="participante" class="${me.role === 'participante' ? 'on' : ''}">Participante</button></div></div>` : '<button class="btn red" style="margin-top:14px" id="acOut">Cerrar sesión</button>'}
  </div>`;
  $('acSave').onclick = async () => { const n = $('acName').value.trim(); if (!n) { shake($('acName')); return; } await busy($('acSave'), api.updateMember(user.uid, { name: n })); toast('✓ Nombre guardado'); };
  // Foto: se recorta al centro en un cuadrado de 256 px (pesa poco y se ve en todo el equipo).
  $('acPhoto').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const photo = await squarePhoto(file, 256);
      $('acFace').innerHTML = `<img src="${photo}" alt="">`;
      $('acFace').classList.remove('pop'); void $('acFace').offsetWidth; $('acFace').classList.add('pop');
      await api.updateMember(user.uid, { photo });
      toast('✓ Foto guardada'); haptic();
    } catch (err) { toast(err.message || 'No se pudo usar esa foto'); }
  };
  if ($('acNoPhoto')) $('acNoPhoto').onclick = async () => { await api.updateMember(user.uid, { photo: '' }); toast('Foto quitada'); route(); };
  if ($('acOut')) $('acOut').onclick = () => { if (confirm('¿Cerrar sesión en este teléfono?')) api.signOut(); };
  if ($('acPassOk')) $('acPassOk').onclick = async () => {
    const p = $('acPass').value;
    if (p.length < 6) { shake($('acPass')); toast('Mínimo 6 caracteres'); return; }
    try { await busy($('acPassOk'), api.changePassword(p)); $('acPass').value = ''; toast('✓ Contraseña cambiada'); } catch (e) { shake($('acPass')); toast(authError(e)); }
  };
  $('acTheme').onclick = (e) => { const b = e.target.closest('[data-th]'); if (!b) return; setTheme(b.dataset.th, e); $('acTheme').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
  if ($('acDemo')) $('acDemo').onclick = (e) => {
    const b = e.target.closest('[data-r]');
    if (!b || b.classList.contains('on')) return;
    $('acDemo').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    haptic();
    // Deja ver la píldora deslizarse y luego rehace la app con el rol elegido.
    setTimeout(() => { api.setDemoRole(b.dataset.r); toast('Viendo como ' + b.textContent); }, 260);
  };
  if ($('acViewAs')) $('acViewAs').onclick = (e) => {
    const b = e.target.closest('[data-va]');
    if (!b || b.classList.contains('on')) return;
    $('acViewAs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    haptic();
    setTimeout(() => setViewAs(b.dataset.va), 260);
  };
  if (installEvent && $('acInstall')) { $('acInstall').hidden = false; $('acInstall').onclick = () => installEvent.prompt(); }
}
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });

// ======================================================================================
// Arranque
// ======================================================================================
(async function start() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  try { api = DEMO ? demoBackend() : await firebaseBackend(); } catch (e) {
    $('view').innerHTML = `<div class="empty" style="padding-top:40vh">No se pudo conectar con la nube.<br>Revisa tu internet.<br><br><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
    return;
  }
  $('demo').hidden = !api.demo;
  document.body.classList.toggle('demo', api.demo);
  let memberOff = null;
  let dataOff = [];
  api.onAuth((u) => {
    user = u;
    if (memberOff) { memberOff(); memberOff = null; }
    dataOff.forEach((f) => f()); dataOff = [];
    me = null;
    notifs = []; notifsReady = false; servicesLoaded = false; services = [];
    if (!u) { route(); return; }
    memberOff = api.watchMember(u.uid, (m) => {
      const wasMember = isMember();
      const wasRole = me && me.role;
      rawMe = m;
      me = viewAs(keepHidden(m));
      if (isMember() && !dataOff.length) {
        dataOff.push(api.watchServices((list) => {
          services = list; servicesLoaded = true; hideSplash();
          serviceListeners.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
          setTimeout(prefetchUpcoming, 2500); // los charts de la próxima lista, en segundo plano
        }));
        dataOff.push(api.watchSongs((list) => { songs = list; songListeners.forEach((f) => f()); }));
        dataOff.push(api.watchNotifications(onNotifs));
        dataOff.push(api.watchMembers((list) => { allMembers = Object.fromEntries(list.map((x) => [x.id, x])); }));
        dataOff.push(onServices(renderTabbar));
      }
      // Si cambió tu rol (por ejemplo, un moderador te dio otro permiso), la pantalla se rehace.
      if (!wasMember || !isMember() || !$('view').innerHTML || wasRole !== (me && me.role)) { pendingNav = wasMember && isMember() ? 'tab' : null; route(); }
      else { renderTabbar(); updateBell(); }
    });
  });
})();
