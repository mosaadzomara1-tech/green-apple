/* لوحة التحكم — الأسعار · الصور · الإتاحة لكل فرع · الفروع ووضع «فرع واحد» · الإعدادات.
 * الحفظ: Firebase لو مضبوط (يوصل كل الأجهزة فوراً)، وإلا الخادم المحلي build/serve.py.
 * أي حفظ يمر أولاً على GA.validateMenu — نفس الحارس اللي بيحمي التطبيق. */
(function () {
  'use strict';
  const GA = window.GA, R = window.GA_REMOTE;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, ms = 2800) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms); };

  const CFG = window.GA_CONFIG;
  const LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);
  /* وضع الحفظ: firebase لو مضبوط · local على جهاز المالك (serve.py) · github على الرابط الحي */
  const MODE = R ? 'firebase' : LOCAL ? 'local' : CFG.github ? 'github' : 'none';
  const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* تخزين مقفول */ } } };
  let GH = null;
  const A = { menu: null, saved: '', tab: 'items', sec: 0, pass: sessionStorage.getItem('ga.adminPass') || '', baseVersion: null, previews: {} };
  const shown = (p) => A.previews[p] || p;   // صورة اترفعت لسه ما اتنشرتش على الرابط → معاينتها من الجهاز
  const dirty = () => JSON.stringify(A.menu) !== A.saved;
  const markDirty = () => { const d = dirty(); $('#dirtyNote').textContent = d ? '● تعديلات غير محفوظة' : 'كل التعديلات محفوظة'; $('#dirtyNote').className = d ? 'dirty' : 'note'; };
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  const uid = (base) => { const all = new Set(); A.menu.sections.forEach((s) => s.categories.forEach((c) => c.items.forEach((i) => all.add(i.id)))); let id = slug(base), n = 2; while (all.has(id)) id = `${slug(base)}-${n++}`; return id; };
  const num = (v) => (v === '' || v == null ? null : Math.round(Number(v) * 100) / 100);

  window.addEventListener('beforeunload', (e) => { if (A.menu && dirty()) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- الدخول ---------------- */
  function login(err) {
    $('#modeNote').textContent = { firebase: 'متصل بالخادم السحابي', local: 'وضع محلي — الحفظ على هذا الجهاز ثم النشر', github: 'الحفظ مباشرة على التطبيق المنشور', none: '' }[MODE];
    const gh = CFG.github || {};
    const tokenUrl = `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent('green-apple-admin')}&description=${encodeURIComponent('لوحة تحكم التفاح الأخضر')}&target_name=${encodeURIComponent((gh.repo || '').split('/')[0])}&expires_in=none&contents=write`;
    $('#app').innerHTML = `<div class="card login">
      <h2 style="margin-top:0">دخول اللوحة</h2>
      ${MODE === 'firebase' ? `<div class="field"><label>البريد</label><input id="em" type="email" autocomplete="username"></div>` : ''}
      ${MODE === 'github' ? `
        <div class="field"><label>رمز GitHub الخاص باللوحة</label>
          <div style="display:flex;gap:6px">
            <input id="pw" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" dir="ltr" placeholder="github_pat_…" style="flex:1;min-width:0">
            <button class="mini" id="pasteBtn" type="button">📋 لصق</button>
            <button class="mini" id="eyeBtn" type="button" aria-label="إظهار الرمز">👁</button>
          </div>
          <small class="note" id="tokHint" dir="rtl"></small></div>
        <details class="note" style="margin-bottom:12px"><summary><b>أول مرة؟ طلّع الرمز في دقيقة</b></summary>
          <ol style="padding-inline-start:18px;line-height:1.9">
            <li>افتح <a href="${esc(tokenUrl)}" target="_blank" rel="noopener">صفحة إنشاء الرمز</a> (من حساب GitHub بتاعك).</li>
            <li><b>Repository access</b> ← Only select repositories ← <code>${esc(gh.repo || '')}</code></li>
            <li><b>Permissions ▸ Contents</b> ← Read and write · <b>Expiration</b> ← No expiration</li>
            <li>Generate token ← انسخه والصقه هنا. بيتحفظ على الجهاز ده بس.</li>
          </ol>
          الرمز ده صلاحيته على مستودع التطبيق وحده — لا يلمس سدرة المنتهى ولا أي حاجة تانية.</details>`
      : `<div class="field"><label>كلمة السر</label><input id="pw" type="password" autocomplete="current-password"></div>`}
      ${MODE === 'local' ? '<p class="note">كلمة السر المحلية في الملف <code>build/.admin_pass</code> — تتولّد أول تشغيل للخادم.</p>' : ''}
      <button class="btn" id="lg">دخول</button><div id="lgErr">${err ? `<div class="alert">${esc(err)}</div>` : ''}</div></div>`;
    $('#lg').onclick = async () => {
      $('#lg').disabled = true;
      try {
        if (MODE === 'firebase') await R.signIn($('#em').value.trim(), $('#pw').value);
        else if (MODE === 'github') {
          const token = cleanToken($('#pw').value);
          GH = window.GA_GITHUB.create({ ...CFG.github, token });
          await GH.check();
          ls.set('ga.ghToken', token);
        } else { A.pass = $('#pw').value; sessionStorage.setItem('ga.adminPass', A.pass); }
        await start();
      } catch (e) { $('#lg').disabled = false; $('#lgErr').innerHTML = `<div class="alert">${esc(e.message || 'تعذّر الدخول')}</div>`; }
    };
    $('#pw').onkeydown = (e) => { if (e.key === 'Enter') $('#lg').click(); };
    if (MODE === 'github') {
      // مساعدة الجوال: لصق مباشر من الحافظة (بدون كيبورد يغيّر الحروف) + إظهار الرمز + عدّاد طول فوري
      const hint = () => {
        const t = cleanToken($('#pw').value);
        if (!t) { $('#tokHint').textContent = ''; return; }
        const ok = (t.startsWith('github_pat_') && t.length >= 88 && t.length <= 100) || (t.startsWith('ghp_') && t.length === 40);
        $('#tokHint').textContent = ok ? `✓ شكل الرمز سليم (${t.length} حرف)` : `⚠ اتلصق ${t.length} حرف ويبدأ بـ «${t.slice(0, 11)}» — الرمز الكامل ٩٣ حرف ويبدأ بـ github_pat_`;
        $('#tokHint').style.color = ok ? 'var(--ok)' : 'var(--danger)';
      };
      $('#pw').oninput = hint;
      $('#eyeBtn').onclick = () => { $('#pw').type = $('#pw').type === 'password' ? 'text' : 'password'; };
      $('#pasteBtn').onclick = async () => {
        try { $('#pw').value = cleanToken(await navigator.clipboard.readText()); hint(); }
        catch (e) { $('#tokHint').textContent = 'المتصفح منع اللصق التلقائي — اضغط مطوّلاً في الخانة واختار «لصق».'; }
      };
    }
  }

  /* النسخ من الجوال بيجيب مسافات أو سطر جديد أو علامات اتجاه مخفية، والكيبورد ممكن يكبّر أول حرف. */
  function cleanToken(v) {
    return String(v || '').replace(/[\s​-‏‪-‮⁦-⁩﻿"'`]/g, '')
      .replace(/^github_pat_/i, 'github_pat_').replace(/^ghp_/i, 'ghp_');
  }

  async function start() {
    let menu = null;
    if (MODE === 'firebase') menu = await R.loadMenu().catch(() => null);
    if (MODE === 'github') menu = (await GH.loadMenu()).menu;   // من المستودع مباشرة — أحدث من كاش الرابط
    if (!menu) menu = await (await fetch(`data/menu.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    A.menu = menu; A.saved = JSON.stringify(menu); A.baseVersion = menu.version;
    if (MODE === 'github' && !$('#logoutBtn')) {
      const b = document.createElement('button');
      b.className = 'mini'; b.id = 'logoutBtn'; b.textContent = 'خروج';
      b.onclick = () => { if (dirty() && !confirm('فيه تعديلات غير محفوظة — خروج؟')) return; ls.set('ga.ghToken', ''); location.reload(); };
      $('.top .wrap').appendChild(b);
    }
    $('#savebar').hidden = false;
    $('#saveBtn').onclick = save;
    $('#exportBtn').onclick = exportCopy;
    render();
  }

  /* ---------------- الحفظ ---------------- */
  async function save() {
    const errs = GA.validateMenu(A.menu);
    if (errs.length) { toast('لم يُحفظ: ' + errs[0], 5000); console.warn(errs); return; }
    $('#saveBtn').disabled = true;
    try {
      if (MODE === 'firebase') {
        A.menu.version = await R.saveMenu(A.menu);
      } else if (MODE === 'github') {
        $('#saveBtn').textContent = 'جارٍ الحفظ…';
        const next = await GH.saveMenu(A.menu, A.baseVersion);
        A.menu = next; A.baseVersion = next.version; A.saved = JSON.stringify(next); markDirty();
        toast('✅ اتحفظ — بيوصل للعملاء خلال دقيقة أو اتنين…', 4000);
        GH.waitLive(CFG.github.site, next.version).then((ok) => toast(ok ? `✅ التعديل ظاهر للعملاء الآن (نسخة ${next.version})` : '⏳ اتحفظ، لكن الرابط لسه بيحدّث — افتح التطبيق بعد دقيقتين', 6000));
        return;
      } else {
        const r = await fetch('api/menu', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Pass': A.pass }, body: JSON.stringify(A.menu) });
        const j = await r.json();
        if (r.status === 401) { sessionStorage.removeItem('ga.adminPass'); toast('كلمة السر غير صحيحة'); login(); return; }
        if (!j.ok) throw new Error((j.errors || [j.error]).join(' · '));
        A.menu.version = j.version;
        if (j.publishing) watchPublish();
      }
      A.saved = JSON.stringify(A.menu); markDirty();
      if (MODE === 'firebase') toast('تم الحفظ — التعديل ظاهر للعملاء الآن');
    } catch (e) {
      if (e.code === 'conflict') {
        if (confirm(`${e.message}\n\nتحميل النسخة الأحدث الآن؟ (تعديلاتك غير المحفوظة هتضيع)`)) { A.saved = JSON.stringify(A.menu); location.reload(); }
      } else if (e.status === 401) { ls.set('ga.ghToken', ''); login(e.message); }
      else toast('تعذّر الحفظ: ' + e.message, 6000);
    } finally { $('#saveBtn').disabled = false; $('#saveBtn').textContent = 'حفظ ونشر'; }
  }

  /* لوحة الكمبيوتر: الخادم المحلي بينشر لوحده بعد الحفظ — نتابع حالته ونقول النتيجة بيقين. */
  async function watchPublish() {
    toast('✅ اتحفظ — بيتنشر للعملاء الآن (حوالي دقيقة)…', 6000);
    for (let i = 0; i < 72; i++) {
      await new Promise((ok) => setTimeout(ok, 5000));
      try {
        const s = await (await fetch(`api/publish-status?t=${Date.now()}`, { cache: 'no-store' })).json();
        if (s.state === 'done' && !s.pending) { toast('✅ التعديل ظاهر للعملاء الآن', 7000); return; }
        if (s.state === 'failed') { toast(`⚠ اتحفظ على الجهاز لكن النشر وقف: ${s.msg}`, 12000); return; }
      } catch (e) { /* الخادم بيعيد التشغيل — نكمّل */ }
    }
    toast('⏳ النشر لسه شغّال — افتح التطبيق بعد دقيقتين', 7000);
  }

  function exportCopy() {
    const w = window.open('', '_blank');
    if (w) { w.document.write(`<pre dir="ltr" style="white-space:pre-wrap">${esc(JSON.stringify(A.menu, null, 1))}</pre>`); w.document.close(); }
  }

  /* الصورة تتصغّر على الجهاز قبل الرفع (أقصى ١٠٠٠ بكسل webp) — أسرع للعميل وأوفر للاستضافة. */
  function pickImage(done) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const bmp = await createImageBitmap(f);
        const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
        const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.84));
        let path;
        toast('جارٍ رفع الصورة…', 1500);
        if (MODE === 'firebase') path = await R.uploadImage(new File([blob], 'img.webp', { type: 'image/webp' }));
        else if (MODE === 'github') { path = await GH.uploadImage(blob, 'webp'); A.previews[path] = URL.createObjectURL(blob); }
        else {
          const r = await fetch('api/upload', { method: 'POST', headers: { 'Content-Type': 'image/webp', 'X-Admin-Pass': A.pass }, body: blob });
          const j = await r.json(); if (!j.ok) throw new Error(j.error);
          path = j.path;
        }
        done(path); markDirty(); toast('تم رفع الصورة — اضغط حفظ');
      } catch (e) { toast('تعذّر رفع الصورة: ' + e.message, 5000); }
    };
    inp.click();
  }

  /* ---------------- الشاشات ---------------- */
  function render() {
    const tabs = [['items', 'الأصناف والأسعار'], ['branches', 'الفروع'], ['settings', 'الطلب والدفع'], ['orders', 'الطلبات']];
    $('#app').innerHTML = `<div class="admin-tabs">${tabs.map(([k, n]) => `<button class="tab ${A.tab === k ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div><div id="pane"></div>`;
    document.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { A.tab = b.dataset.t; render(); });
    ({ items: paneItems, branches: paneBranches, settings: paneSettings, orders: paneOrders })[A.tab]();
    markDirty();
  }

  function paneItems() {
    const m = A.menu, sec = m.sections[A.sec];
    const branches = m.branches;
    $('#pane').innerHTML = `
      <div class="admin-tabs" style="padding-top:0">${m.sections.map((s, i) => `<button class="tab ${i === A.sec ? 'on' : ''}" data-s="${i}">${esc(s.name)}</button>`).join('')}</div>
      <div class="card"><div class="row2">
        <div class="field"><label>اسم القسم</label><input id="secName" value="${esc(sec.name)}"></div>
        <div class="field"><label>صورة القسم</label><button class="mini" id="secImg">${sec.image ? 'تغيير الصورة' : 'إضافة صورة'}</button></div>
      </div><p class="note">💡 أسعار «عند الطلب» (فارغة) تظهر للعميل بزر «اطلب عرض سعر» بدل الإضافة للسلة.</p></div>
      ${sec.categories.map((c, ci) => `<details class="cat-box" ${ci === 0 ? 'open' : ''}>
        <summary><span>${esc(c.name)} <small class="note">${c.items.length} صنف</small></span><span class="note">▾</span></summary>
        <div class="row2">
          <div class="field"><label>اسم الفئة</label><input data-cat="${ci}" data-k="name" value="${esc(c.name)}"></div>
          <div class="field"><label>تعديل كل أسعار الفئة بنسبة ٪</label><div style="display:flex;gap:6px"><input type="number" step="1" id="pct-${ci}" placeholder="مثلاً 10 أو -5"><button class="mini" data-pct="${ci}">تطبيق</button></div></div>
          <div class="field"><label>إضافة للفئة (اختياري)</label><div style="display:flex;gap:6px"><input id="adn-${ci}" placeholder="عجينة بُر" value="${esc(c.addons && c.addons[0] ? c.addons[0].name : '')}"><input type="number" step="0.5" id="adp-${ci}" style="max-width:90px" value="${c.addons && c.addons[0] ? c.addons[0].price : ''}"><button class="mini" data-adn="${ci}">حفظ</button></div></div>
        </div>
        ${c.items.map((it, ii) => `<div class="it">
          <img class="thumb" data-img="${ci}.${ii}" src="${esc(shown(it.image || c.image || sec.image || 'icons/icon-192.png?h=6f1f1e01'))}" alt="" title="اضغط لتغيير الصورة">
          <div>
            <div style="display:flex;gap:6px"><input type="text" data-f="${ci}.${ii}.name" value="${esc(it.name)}"><input type="text" data-f="${ci}.${ii}.nameEn" value="${esc(it.nameEn || '')}" placeholder="English" dir="ltr"></div>
            <div class="prices">
              ${it.variants && it.variants.length
                ? it.variants.map((v, vi) => `<label>${esc(v.name)} <input type="number" step="0.5" min="0" data-vp="${ci}.${ii}.${vi}" value="${v.price == null ? '' : v.price}" placeholder="عند الطلب"></label>
                    <label>🔥 <input type="number" step="1" min="0" data-vk="${ci}.${ii}.${vi}" value="${v.calories == null ? '' : v.calories}" placeholder="سعرات" style="width:72px"></label>`).join('')
                : `<label>السعر <input type="number" step="0.5" min="0" data-p="${ci}.${ii}" value="${it.price == null ? '' : it.price}" placeholder="عند الطلب"></label>
                   <label>🔥 السعرات <input type="number" step="1" min="0" data-k="${ci}.${ii}" value="${it.calories == null ? '' : it.calories}" placeholder="—" style="width:72px"></label>`}
            </div>
            <input type="text" data-alg="${ci}.${ii}" value="${esc(it.allergens || '')}" maxlength="200" placeholder="⚠️ مسببات الحساسية (مثلاً: القمح، الحليب، السمسم)" style="margin-top:6px;font-size:13px">
            <div class="flags">
              <label><input type="checkbox" data-flag="${ci}.${ii}.soldOut" ${it.soldOut ? 'checked' : ''}> نفد اليوم</label>
              <label><input type="checkbox" data-flag="${ci}.${ii}.hidden" ${it.hidden ? 'checked' : ''}> مخفي</label>
              ${branches.map((b) => `<label><input type="checkbox" data-br="${ci}.${ii}.${esc(b.id)}" ${(it.unavailableAt || []).includes(b.id) ? '' : 'checked'}> ${esc(b.name)}</label>`).join('')}
            </div>
          </div>
          <button class="mini danger" data-del="${ci}.${ii}" aria-label="حذف">حذف</button>
        </div>`).join('')}
        <div style="padding:12px 0;display:flex;gap:8px"><button class="mini" data-add="${ci}">+ صنف جديد</button></div>
      </details>`).join('')}
      <button class="mini" id="addCat">+ فئة جديدة</button>`;

    const at = (key) => { const [ci, ii] = key.split('.').map(Number); return sec.categories[ci].items[ii]; };
    document.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { A.sec = +b.dataset.s; render(); });
    $('#secName').oninput = (e) => { sec.name = e.target.value; markDirty(); };
    $('#secImg').onclick = () => pickImage((p) => { sec.image = p; render(); });
    document.querySelectorAll('[data-cat]').forEach((n) => n.oninput = () => { sec.categories[+n.dataset.cat][n.dataset.k] = n.value; markDirty(); });
    document.querySelectorAll('[data-f]').forEach((n) => n.oninput = () => { const [ci, ii, k] = n.dataset.f.split('.'); sec.categories[+ci].items[+ii][k] = n.value; markDirty(); });
    document.querySelectorAll('[data-p]').forEach((n) => n.oninput = () => { at(n.dataset.p).price = num(n.value); markDirty(); });
    document.querySelectorAll('[data-vp]').forEach((n) => n.oninput = () => { const [ci, ii, vi] = n.dataset.vp.split('.').map(Number); sec.categories[ci].items[ii].variants[vi].price = num(n.value); markDirty(); });
    document.querySelectorAll('[data-alg]').forEach((n) => n.oninput = () => { const it = at(n.dataset.alg), v = n.value.trim(); if (v) it.allergens = v; else delete it.allergens; markDirty(); });
    const kc = (v) => (v === '' ? null : Math.max(0, Math.round(Number(v))));
    document.querySelectorAll('[data-k]').forEach((n) => n.oninput = () => { const it = at(n.dataset.k), k = kc(n.value); if (k == null) delete it.calories; else it.calories = k; markDirty(); });
    document.querySelectorAll('[data-vk]').forEach((n) => n.oninput = () => { const [ci, ii, vi] = n.dataset.vk.split('.').map(Number); const v = sec.categories[ci].items[ii].variants[vi], k = kc(n.value); if (k == null) delete v.calories; else v.calories = k; markDirty(); });
    document.querySelectorAll('[data-flag]').forEach((n) => n.onchange = () => { const [ci, ii, k] = n.dataset.flag.split('.'); const it = sec.categories[+ci].items[+ii]; if (n.checked) it[k] = true; else delete it[k]; markDirty(); });
    document.querySelectorAll('[data-br]').forEach((n) => n.onchange = () => {
      const [ci, ii, bid] = n.dataset.br.split('.'); const it = sec.categories[+ci].items[+ii];
      const set = new Set(it.unavailableAt || []); if (n.checked) set.delete(bid); else set.add(bid);
      if (set.size) it.unavailableAt = [...set]; else delete it.unavailableAt; markDirty();
    });
    document.querySelectorAll('[data-img]').forEach((n) => n.onclick = () => pickImage((p) => { at(n.dataset.img).image = p; render(); }));
    document.querySelectorAll('[data-del]').forEach((n) => n.onclick = () => {
      const [ci, ii] = n.dataset.del.split('.').map(Number); const it = sec.categories[ci].items[ii];
      if (confirm(`حذف «${it.name}» نهائياً من المنيو؟ (للإيقاف المؤقت استعمل «مخفي» أو «نفد اليوم»)`)) { sec.categories[ci].items.splice(ii, 1); render(); }
    });
    document.querySelectorAll('[data-add]').forEach((n) => n.onclick = () => addItemForm(sec, sec.categories[+n.dataset.add]));
    document.querySelectorAll('[data-pct]').forEach((n) => n.onclick = () => {
      const ci = +n.dataset.pct, pct = Number($(`#pct-${ci}`).value);
      if (!pct) return;
      if (!confirm(`تعديل كل أسعار «${sec.categories[ci].name}» بنسبة ${pct}٪ مع التقريب لأقرب نصف ريال؟`)) return;
      const adj = (p) => (p == null ? null : Math.max(0, Math.round(p * (1 + pct / 100) * 2) / 2));
      sec.categories[ci].items.forEach((it) => { if (it.variants) it.variants.forEach((v) => { v.price = adj(v.price); }); else it.price = adj(it.price); });
      render(); toast('تم — راجع الأسعار ثم اضغط حفظ');
    });
    document.querySelectorAll('[data-adn]').forEach((n) => n.onclick = () => {
      const ci = +n.dataset.adn, nm = $(`#adn-${ci}`).value.trim(), pr = num($(`#adp-${ci}`).value);
      if (nm && pr != null) sec.categories[ci].addons = [{ name: nm, price: pr }]; else delete sec.categories[ci].addons;
      markDirty(); toast('تم ضبط الإضافة');
    });
    $('#addCat').onclick = () => {
      const name = prompt('اسم الفئة الجديدة'); if (!name) return;
      sec.categories.push({ id: uid(`${sec.id}-cat`), name: name.trim(), items: [] });
      render();
    };
  }

  /* نموذج «صنف جديد» كامل في شاشة واحدة: الاسم · الوصف · سعر واحد أو مقاسات · صورة. */
  function addItemForm(sec, cat) {
    const st = { name: '', nameEn: '', desc: '', mode: 'single', price: '', calories: '', sizes: [{ name: '', price: '', calories: '' }], image: null };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const close = () => { host.remove(); document.body.style.overflow = ''; };
    document.body.style.overflow = 'hidden';

    const draw = () => {
      host.innerHTML = `<div class="sheet-bg" data-x></div>
      <div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="body">
        <h3>صنف جديد في «${esc(cat.name)}»</h3>
        <div class="field"><label>اسم الصنف *</label><input id="nf-name" value="${esc(st.name)}" placeholder="مثلاً: كرواسون زعتر وجبنة"></div>
        <div class="field"><label>الاسم بالإنجليزي (اختياري)</label><input id="nf-en" dir="ltr" value="${esc(st.nameEn)}" placeholder="Zaatar cheese croissant"></div>
        <div class="field"><label>وصف قصير (اختياري)</label><input id="nf-desc" value="${esc(st.desc)}"></div>
        <div class="field"><label>السعر</label>
          <div class="seg"><button data-m="single" class="${st.mode === 'single' ? 'on' : ''}">سعر واحد</button><button data-m="sizes" class="${st.mode === 'sizes' ? 'on' : ''}">أحجام / أنواع</button><button data-m="quote" class="${st.mode === 'quote' ? 'on' : ''}">عند الطلب</button></div>
        </div>
        ${st.mode === 'single' ? `<div class="field"><input id="nf-price" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(st.price)}" placeholder="السعر بالريال شامل الضريبة"></div>` : ''}
        ${st.mode !== 'sizes' ? `<div class="field"><label>🔥 السعرات الحرارية (اختياري)</label><input id="nf-kcal" type="number" step="1" min="0" inputmode="numeric" value="${esc(st.calories)}" placeholder="مثلاً 280"></div>` : ''}
        ${st.mode === 'sizes' ? `${st.sizes.map((z, i) => `<div style="display:flex;gap:6px;margin-bottom:8px">
            <input data-zn="${i}" value="${esc(z.name)}" placeholder="الحجم (80 جم / صغير)" style="flex:2;min-width:0;padding:11px;border-radius:12px;border:1px solid var(--line);background:var(--bg)">
            <input data-zp="${i}" type="number" step="0.5" min="0" inputmode="decimal" value="${esc(z.price)}" placeholder="السعر" style="flex:1;min-width:0;padding:11px;border-radius:12px;border:1px solid var(--line);background:var(--bg)">
            <input data-zk="${i}" type="number" step="1" min="0" inputmode="numeric" value="${esc(z.calories)}" placeholder="🔥" style="flex:1;min-width:0;padding:11px;border-radius:12px;border:1px solid var(--line);background:var(--bg)">
            ${st.sizes.length > 1 ? `<button class="mini danger" data-zd="${i}">✕</button>` : ''}</div>`).join('')}
          <button class="mini" id="nf-addsize">+ حجم آخر</button>` : ''}
        ${st.mode === 'quote' ? '<p class="note">يظهر للعميل «اطلب عرض سعر» على واتساب بدل الإضافة للسلة.</p>' : ''}
        <div class="field" style="margin-top:12px"><label>الصورة</label>
          <div style="display:flex;gap:10px;align-items:center">
            <img src="${esc(st.image ? shown(st.image) : (cat.image || sec.image || 'icons/icon-192.png?h=6f1f1e01'))}" alt="" style="width:72px;height:72px;border-radius:14px;object-fit:cover;background:var(--gold-soft)">
            <button class="mini" id="nf-img">${st.image ? 'تغيير الصورة' : '📷 اختيار صورة'}</button>
            ${st.image ? '' : '<span class="note">بدون صورة = صورة الفئة</span>'}
          </div></div>
        <div id="nf-err"></div>
        <div style="display:flex;gap:8px;margin-top:8px"><button class="btn ghost" data-x>إلغاء</button><button class="btn" id="nf-ok">إضافة الصنف</button></div>
      </div></div>`;

      const keep = () => {
        const v = (id) => { const el = host.querySelector(id); return el ? el.value : null; };
        if (v('#nf-name') != null) st.name = v('#nf-name');
        if (v('#nf-en') != null) st.nameEn = v('#nf-en');
        if (v('#nf-desc') != null) st.desc = v('#nf-desc');
        if (v('#nf-price') != null) st.price = v('#nf-price');
        if (v('#nf-kcal') != null) st.calories = v('#nf-kcal');
        host.querySelectorAll('[data-zk]').forEach((el) => { st.sizes[+el.dataset.zk].calories = el.value; });
        host.querySelectorAll('[data-zn]').forEach((el) => { st.sizes[+el.dataset.zn].name = el.value; });
        host.querySelectorAll('[data-zp]').forEach((el) => { st.sizes[+el.dataset.zp].price = el.value; });
      };
      host.querySelectorAll('[data-x]').forEach((b) => b.onclick = close);
      host.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { keep(); st.mode = b.dataset.m; draw(); });
      host.querySelectorAll('[data-zd]').forEach((b) => b.onclick = () => { keep(); st.sizes.splice(+b.dataset.zd, 1); draw(); });
      const as = host.querySelector('#nf-addsize'); if (as) as.onclick = () => { keep(); st.sizes.push({ name: '', price: '', calories: '' }); draw(); };
      host.querySelector('#nf-img').onclick = () => { keep(); pickImage((p) => { st.image = p; draw(); }); };
      host.querySelector('#nf-ok').onclick = () => {
        keep();
        const errs = [];
        if (st.name.trim().length < 2) errs.push('اكتب اسم الصنف');
        const item = { id: uid(st.nameEn || `${cat.id}-item`), name: st.name.trim() };
        if (st.nameEn.trim()) item.nameEn = st.nameEn.trim();
        if (st.desc.trim()) item.desc = st.desc.trim();
        if (st.mode === 'single') {
          if (st.price === '' || !(Number(st.price) >= 0)) errs.push('اكتب السعر (أو اختار «عند الطلب»)');
          item.price = num(st.price);
        } else if (st.mode === 'sizes') {
          const sizes = st.sizes.filter((z) => z.name.trim());
          if (!sizes.length) errs.push('اكتب حجماً واحداً على الأقل');
          if (sizes.some((z) => z.price !== '' && !(Number(z.price) >= 0))) errs.push('سعر حجم غير صالح');
          item.price = null;
          item.variants = sizes.map((z) => ({ name: z.name.trim(), price: num(z.price), ...(z.calories !== '' ? { calories: Math.max(0, Math.round(Number(z.calories))) } : {}) }));
        } else item.price = null;
        if (st.mode !== 'sizes' && st.calories !== '') item.calories = Math.max(0, Math.round(Number(st.calories)));
        if (st.image) item.image = st.image;
        if (errs.length) { host.querySelector('#nf-err').innerHTML = errs.map((e) => `<div class="alert">${esc(e)}</div>`).join(''); return; }
        cat.items.push(item);
        close(); render();
        toast(`أُضيف «${item.name}» — اضغط «حفظ ونشر» ليظهر للعملاء`, 4000);
      };
    };
    draw();
    setTimeout(() => { const el = host.querySelector('#nf-name'); if (el) el.focus(); }, 50);
  }

  /* يقبل رابط خرائط كامل فيه @lat,lng أو q=lat,lng أو إحداثيات منسوخة «26.34, 50.16». */
  function parseCoords(text) {
    const m = String(text).match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/) || String(text).match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    return m ? { lat: +m[1], lng: +m[2] } : null;
  }

  function paneBranches() {
    const m = A.menu, s = m.settings;
    $('#pane').innerHTML = `
      <div class="card">
        <b>توزيع الطلبات على الفروع</b>
        <label class="opt ${s.branchMode !== 'single' ? 'on' : ''}" style="margin-top:10px"><span class="l"><input type="radio" name="bm" value="nearest" ${s.branchMode !== 'single' ? 'checked' : ''}>كل عميل يروح لأقرب فرع مفعّل لموقعه</span></label>
        <label class="opt ${s.branchMode === 'single' ? 'on' : ''}"><span class="l"><input type="radio" name="bm" value="single" ${s.branchMode === 'single' ? 'checked' : ''}>فرع واحد لكل العملاء</span>
          <select id="single" ${s.branchMode === 'single' ? '' : 'disabled'} style="padding:8px;border-radius:10px;border:1px solid var(--line)">
            ${m.branches.map((b) => `<option value="${esc(b.id)}" ${b.id === s.singleBranchId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select></label>
        <p class="note">إيقاف فرع مؤقتاً: اشطب «مفعّل» تحت. لو الفرع الموحّد اتوقف، الطلبات تتحوّل تلقائياً لأول فرع مفعّل بدل ما تقف.</p>
      </div>
      ${m.branches.map((b, i) => `<div class="card">
        <div class="switch" style="padding-top:0"><b>${esc(b.name)}</b><label style="display:flex;gap:6px;align-items:center">مفعّل <input type="checkbox" data-bk="${i}.active" ${b.active ? 'checked' : ''}></label></div>
        <div class="row2" style="margin-top:10px">
          <div class="field"><label>الاسم</label><input data-bk="${i}.name" value="${esc(b.name)}"></div>
          <div class="field"><label>العنوان</label><input data-bk="${i}.address" value="${esc(b.address)}"></div>
          <div class="field"><label>هاتف الاتصال</label><input data-bk="${i}.phone" value="${esc(b.phone)}" dir="ltr"></div>
          <div class="field"><label>واتساب الطلبات (9665xxxxxxxx)</label><input data-bk="${i}.whatsapp" value="${esc(b.whatsapp)}" dir="ltr"></div>
          <div class="field"><label>يفتح</label><input type="time" data-bh="${i}.open" value="${esc(b.hours && b.hours.open)}"></div>
          <div class="field"><label>يقفل</label><input type="time" data-bh="${i}.close" value="${esc(b.hours && b.hours.close === '24:00' ? '00:00' : b.hours && b.hours.close)}"></div>
          <div class="field"><label>الموقع (الصق الإحداثيات أو رابط خرائط كامل)</label><input data-loc="${i}" value="${b.lat}, ${b.lng}" dir="ltr"></div>
          <div class="field"><label>رابط الخريطة للعميل</label><input data-bk="${i}.mapUrl" value="${esc(b.mapUrl || '')}" dir="ltr"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="mini" target="_blank" rel="noopener" href="https://maps.google.com/?q=${b.lat},${b.lng}">تأكيد الموقع على الخريطة ↗</a>
          ${m.branches.length > 1 ? `<button class="mini danger" data-bdel="${i}">حذف الفرع</button>` : ''}
        </div>
      </div>`).join('')}
      <button class="mini" id="addBranch">+ فرع جديد</button>
      <p class="note">💡 من خرائط جوجل على الجوال: اضغط مطوّلاً على مكان الفرع ← تظهر الإحداثيات فوق ← انسخها والصقها هنا.</p>`;

    document.querySelectorAll('input[name=bm]').forEach((n) => n.onchange = () => { s.branchMode = n.value; if (!m.branches.find((b) => b.id === s.singleBranchId)) s.singleBranchId = m.branches[0].id; render(); });
    $('#single').onchange = (e) => { s.singleBranchId = e.target.value; markDirty(); };
    document.querySelectorAll('[data-bk]').forEach((n) => n[n.type === 'checkbox' ? 'onchange' : 'oninput'] = () => {
      const [i, k] = n.dataset.bk.split('.'); m.branches[+i][k] = n.type === 'checkbox' ? n.checked : n.value.trim(); markDirty();
    });
    document.querySelectorAll('[data-bh]').forEach((n) => n.onchange = () => {
      const [i, k] = n.dataset.bh.split('.'); const b = m.branches[+i]; b.hours = b.hours || { open: '00:00', close: '00:00' };
      b.hours[k] = k === 'close' && n.value === '00:00' ? '24:00' : n.value; markDirty();
    });
    document.querySelectorAll('[data-loc]').forEach((n) => n.onchange = () => {
      const c = parseCoords(n.value), b = m.branches[+n.dataset.loc];
      if (!c) { toast('لم أجد إحداثيات — الصق مثل: 26.3440, 50.1628'); n.value = `${b.lat}, ${b.lng}`; return; }
      b.lat = c.lat; b.lng = c.lng; b.approx = false; render(); toast('تم تحديث موقع الفرع');
    });
    document.querySelectorAll('[data-bdel]').forEach((n) => n.onclick = () => {
      const b = m.branches[+n.dataset.bdel];
      if (!confirm(`حذف ${b.name}؟ (للإيقاف المؤقت اشطب «مفعّل»)`)) return;
      m.branches.splice(+n.dataset.bdel, 1);
      if (s.singleBranchId === b.id) s.singleBranchId = m.branches[0].id;
      m.sections.forEach((sec) => sec.categories.forEach((c) => c.items.forEach((it) => { if (it.unavailableAt) { it.unavailableAt = it.unavailableAt.filter((x) => x !== b.id); if (!it.unavailableAt.length) delete it.unavailableAt; } })));
      render();
    });
    $('#addBranch').onclick = () => {
      const name = prompt('اسم الفرع الجديد'); if (!name) return;
      let id = 'branch-' + (m.branches.length + 1); while (m.branches.find((b) => b.id === id)) id += 'x';
      const base = m.branches[0];
      m.branches.push({ id, name, address: '', lat: base.lat, lng: base.lng, approx: true, phone: '', whatsapp: base.whatsapp, hours: { ...base.hours }, active: false });
      render(); toast('أُضيف موقوفاً — اضبط موقعه ورقمه ثم فعّله');
    };
  }

  function paneSettings() {
    const s = A.menu.settings;
    delete s.fulfillment.curbside;   // أُلغي بقرار المالك — خياران فقط: استلام من الفرع أو توصيل
    const sw = (path, label, hint, disabled) => {
      const [a, b] = path.split('.');
      return `<div class="switch"><div><b>${label}</b>${hint ? `<div class="note">${hint}</div>` : ''}</div><input type="checkbox" data-sw="${path}" ${s[a][b] ? 'checked' : ''} ${disabled ? 'disabled' : ''}></div>`;
    };
    $('#pane').innerHTML = `
      <div class="card"><b>أين يذهب الطلب</b>
        ${sw('orderChannels.whatsapp', 'رسالة واتساب للفرع', 'يُفتح واتساب عند العميل برسالة الطلب جاهزة لرقم الفرع — بلا خادم.')}
        ${sw('orderChannels.dashboard', 'شاشة طلبات الفرع (لحظي)', R ? 'الطلب يظهر في شاشة الفرع بصوت تنبيه، والعميل يتابع الحالة.' : '⚠ يحتاج ربط Firebase في config.js أولاً — راجع «خطوات التشغيل».', !R)}
        <p class="note">تقدر تشغّل الاتنين مع بعض: الطلب يتسجّل في الشاشة وتوصل رسالة واتساب كمان.</p>
      </div>
      <div class="card"><b>طرق الاستلام</b>
        ${sw('fulfillment.pickup', 'استلام من الفرع', '')}
        ${sw('fulfillment.delivery', 'توصيل', '')}
        <div class="row2" style="margin-top:12px">
          <div class="field"><label>رسوم التوصيل (ر.س)</label><input type="number" step="0.5" min="0" data-d="fee" value="${s.delivery.fee}"></div>
          <div class="field"><label>مجاني فوق (ر.س) — فارغ = لا</label><input type="number" step="1" min="0" data-d="freeAbove" value="${s.delivery.freeAbove == null ? '' : s.delivery.freeAbove}"></div>
          <div class="field"><label>الحد الأدنى للتوصيل (ر.س)</label><input type="number" step="1" min="0" data-d="minOrder" value="${s.delivery.minOrder == null ? '' : s.delivery.minOrder}"></div>
          <div class="field"><label>نطاق التوصيل (كم)</label><input type="number" step="0.5" min="0" data-d="radiusKm" value="${s.delivery.radiusKm == null ? '' : s.delivery.radiusKm}"></div>
        </div>
      </div>
      <div class="card"><b>الدفع</b>
        ${sw('payments.cash', 'كاش عند الاستلام', '')}
        ${sw('payments.cardOnDelivery', 'شبكة مدى عند الاستلام', '')}
        ${sw('payments.online', 'دفع إلكتروني (مدى · Apple Pay · فيزا)', (window.GA_CONFIG.payment || {}).moyasarPublishableKey ? 'مربوط ببوابة Moyasar.' : '⚠ يحتاج حساب بوابة دفع (Moyasar) باسم الشركة ومفتاح النشر في config.js — يظهر للعميل «قريباً» لحد ما يتربط.')}
      </div>
      <div class="card"><b>صورة واجهة التطبيق</b>
        <div style="display:flex;gap:12px;align-items:center;margin-top:10px">
          <img src="${esc(shown(A.menu.brand.heroImage || 'icons/icon-512.png?h=3dd19d8c'))}" alt="" style="width:140px;height:70px;object-fit:cover;border-radius:12px;background:var(--gold-soft)">
          <button class="mini" id="heroBtn">تغيير الصورة</button>
        </div><p class="note">تظهر خلف «مخابز التفاح الأخضر» في أول شاشة — الأفضل صورة عريضة.</p></div>
      <div class="card"><b>نص أسفل المنيو</b><div class="field" style="margin-top:8px"><input id="notice" value="${esc(s.notice || '')}"></div></div>`;
    $('#heroBtn').onclick = () => pickImage((p) => { A.menu.brand.heroImage = p; render(); });
    document.querySelectorAll('[data-sw]').forEach((n) => n.onchange = () => { const [a, b] = n.dataset.sw.split('.'); s[a][b] = n.checked; markDirty(); });
    document.querySelectorAll('[data-d]').forEach((n) => n.oninput = () => { s.delivery[n.dataset.d] = num(n.value); markDirty(); });
    $('#notice').oninput = (e) => { s.notice = e.target.value; markDirty(); };
  }

  function paneOrders() {
    $('#pane').innerHTML = R
      ? `<div class="card"><b>شاشة طلبات الفروع</b><p>افتحها على جهاز الكاشير في كل فرع — تنبيه صوتي لكل طلب جديد وأزرار قبول/جاهز/تسليم.</p>
          ${A.menu.branches.map((b) => `<a class="btn ghost" style="margin-bottom:8px" target="_blank" href="branch.html?b=${esc(b.id)}">${esc(b.name)} ↗</a>`).join('')}
          <a class="btn" target="_blank" href="branch.html">كل الفروع ↗</a></div>`
      : `<div class="card"><b>الطلبات حالياً تصل واتساب الفرع</b><p class="note">شاشة الطلبات اللحظية وتتبّع الحالة للعميل تشتغل بعد ربط Firebase (مجاني). الخطوات في ملف «خطوات التشغيل والنشر».</p></div>`;
  }

  /* ---------------- تشغيل ---------------- */
  if (MODE === 'firebase') R.onAuth((u) => { if (u) start(); else login(); });
  else if (MODE === 'github') {
    const token = ls.get('ga.ghToken');
    if (!token) login();
    else { GH = window.GA_GITHUB.create({ ...CFG.github, token }); start().catch((e) => { if (e.status === 401) ls.set('ga.ghToken', ''); login(e.message); }); }
  } else if (A.pass) start().catch(() => login());
  else login();
})();
