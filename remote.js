/* طبقة الخادم (Firebase) — اختيارية بالكامل.
 * لو GA_CONFIG.firebase = null → GA_REMOTE = null والتطبيق يشتغل بملف المنيو وواتساب.
 * الواجهة الموحّدة اللي بيستعملها app.js و admin.js و branch.js:
 *   ready() · loadMenu() · saveMenu(menu) · placeOrder(order) · watchOrder(id, cb)
 *   watchOrders(branchId|null, cb) · setStatus(id, status) · uploadImage(file) · signIn · signOut · onAuth
 * قواعد الأمان في firestore.rules: العميل يُنشئ طلباً ويقرأه بمعرّفه فقط، والتعديل للموظفين. */
(function () {
  'use strict';
  const cfg = window.GA_CONFIG && window.GA_CONFIG.firebase;
  if (!cfg || !cfg.projectId) { window.GA_REMOTE = null; return; }

  const V = '10.12.5';
  const libs = ['app', 'auth', 'firestore', 'storage'].map((m) => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}-compat.js`);
  const load = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });

  let db, auth, storage;
  const readyP = libs.reduce((p, src) => p.then(() => load(src)), Promise.resolve()).then(() => {
    firebase.initializeApp(cfg);
    db = firebase.firestore();
    auth = firebase.auth();
    storage = cfg.storageBucket ? firebase.storage() : null;
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  });

  const TS = () => firebase.firestore.FieldValue.serverTimestamp();

  window.GA_REMOTE = {
    ready: () => readyP,

    async loadMenu() {
      await readyP;
      const d = await db.doc('config/menu').get();
      return d.exists ? d.data().menu : null;
    },

    async saveMenu(menu) {
      await readyP;
      const errors = window.GA.validateMenu(menu);
      if (errors.length) throw new Error(errors.join('\n'));
      menu.version = (menu.version || 0) + 1;
      menu.updated = new Date().toISOString().slice(0, 10);
      await db.doc('config/menu').set({ menu, savedAt: TS(), savedBy: auth.currentUser && auth.currentUser.email });
      return menu.version;
    },

    async placeOrder(order) {
      await readyP;
      const ref = await db.collection('orders').add({ ...order, status: 'new', createdAt: TS(), history: [{ status: 'new', at: Date.now() }] });
      return ref.id;
    },

    watchOrder(id, cb) {
      let off = () => {};
      readyP.then(() => { off = db.collection('orders').doc(id).onSnapshot((d) => d.exists && cb({ id: d.id, ...d.data() }), () => {}); });
      return () => off();
    },

    watchOrders(branchId, cb) {
      let off = () => {};
      readyP.then(() => {
        const since = new Date(Date.now() - 36 * 3600 * 1000);
        let q = db.collection('orders').where('createdAt', '>=', since);
        if (branchId) q = q.where('branchId', '==', branchId);
        off = q.orderBy('createdAt', 'desc').onSnapshot((s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
      });
      return () => off();
    },

    async setStatus(id, status) {
      await readyP;
      await db.collection('orders').doc(id).update({
        status, updatedAt: TS(),
        history: firebase.firestore.FieldValue.arrayUnion({ status, at: Date.now() }),
      });
    },

    async uploadImage(file) {
      await readyP;
      if (!storage) throw new Error('storageBucket غير مضبوط في config.js');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const ref = storage.ref(`menu/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
      await ref.put(file, { contentType: file.type, cacheControl: 'public,max-age=31536000' });
      return ref.getDownloadURL();
    },

    signIn: async (email, pass) => { await readyP; return auth.signInWithEmailAndPassword(email, pass); },
    signOut: async () => { await readyP; return auth.signOut(); },
    onAuth: (cb) => { readyP.then(() => auth.onAuthStateChanged(cb)); },
  };
})();
