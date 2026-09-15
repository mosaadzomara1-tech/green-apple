/* تطبيق العميل — مخابز التفاح الأخضر.
 * كل الحساب (الفرع الأقرب · الأسعار · الضريبة · التوصيل) في logic.js كدوال خالصة محروسة؛
 * الملف ده عرض وتفاعل بس. */
(function () {
  'use strict';
  const GA = window.GA, CFG = window.GA_CONFIG, R = window.GA_REMOTE;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* وضع خاص أو تخزين مقفول */ } },
  };

  const S = {
    menu: null,
    loc: store.get('ga.loc', null),
    manualBranch: store.get('ga.branch', null),
    pick: null,
    cart: store.get('ga.cart', []),
    orders: store.get('ga.orders', []),
    profile: store.get('ga.profile', { name: '', phone: '', address: '', car: '' }),
    checkout: { fulfillment: 'pickup', when: 'asap', payment: 'cash', note: '' },
    watchers: [],
  };

  /* ---------------- أدوات ---------------- */
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

  function toast(msg, ms = 2600) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function imgOf(item, cat, sec) {
    return (item && item.image) || (cat && cat.image) || (sec && sec.image) || null;
  }
  const photo = (src, name) => src
    ? `<img src="${esc(src)}" alt="${esc(name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'mono',textContent:'${esc(String(name || '').trim().charAt(0))}'}))">`
    : `<span class="mono">${esc(String(name || '').trim().charAt(0))}</span>`;

  function branchId() { return S.pick && S.pick.branch && S.pick.branch.id; }

  /* ---------------- الفرع والموقع ---------------- */
  function resolveBranch() {
    const s = S.menu.settings;
    let r = GA.pickBranch(S.menu.branches, s, S.loc);
    if (s.branchMode !== 'single' && S.manualBranch) {
      const o = r.options.find((x) => x.branch.id === S.manualBranch);
      if (o) r = { ...o, reason: 'manual', options: r.options };
    }
    S.pick = r;
    renderHeader();
  }

  function renderHeader() {
    const r = S.pick, b = r && r.branch;
    if (!b) { $('#branchName').textContent = 'لا يوجد فرع متاح حالياً'; return; }
    const open = GA.isOpen(b, new Date());
    const single = S.menu.settings.branchMode === 'single';
    $('#branchLabel').innerHTML = `<span class="status-dot ${open ? '' : 'closed'}"></span>${open ? 'مفتوح الآن' : 'مغلق الآن'} · ${single ? 'فرع الطلبات' : r.reason === 'nearest' ? 'أقرب فرع لك' : 'الطلب من'}`;
    $('#branchName').innerHTML = `${esc(b.name)}${r.distanceKm != null ? ` <span class="dist">· ${r.distanceKm.toFixed(1)} كم</span>` : ''}`;
    $('#locBtn').hidden = single;
  }

  function locate(silent) {
    if (!navigator.geolocation) { if (!silent) toast('جهازك لا يدعم تحديد الموقع'); return Promise.resolve(false); }
    return new Promise((done) => {
      navigator.geolocation.getCurrentPosition((p) => {
        S.loc = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) };
        store.set('ga.loc', S.loc);
        S.manualBranch = null; store.set('ga.branch', null);
        resolveBranch();
        if (!silent) toast(`تم — ${S.pick.branch ? S.pick.branch.name : ''} هو الأقرب لك`);
        route();
        done(true);
      }, () => { if (!silent) toast('لم نتمكّن من تحديد موقعك — اختر الفرع يدوياً'); done(false); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5 * 60 * 1000 });
    });
  }

  /* ---------------- الأوراق السفلية ---------------- */
  function sheet(html, onMount) {
    closeSheet();
    const host = $('#sheets');
    host.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="body">${html}</div></div>`;
    host.querySelector('[data-close]').onclick = closeSheet;
    document.body.style.overflow = 'hidden';
    if (onMount) onMount(host.querySelector('.sheet'));
  }
  function closeSheet() { $('#sheets').innerHTML = ''; document.body.style.overflow = ''; }

  function branchSheet() {
    const s = S.menu.settings, single = s.branchMode === 'single';
    const now = new Date();
    const all = GA.pickBranch(S.menu.branches, { branchMode: 'nearest' }, S.loc).options;
    const list = single ? S.pick.options : all;
    sheet(`
      <h3>${single ? 'فرع الطلبات' : 'اختر الفرع'}</h3>
      ${single ? '<p class="note">كل الطلبات حالياً تُجهَّز من هذا الفرع.</p>' : S.loc ? '<p class="note">مرتبة من الأقرب لموقعك.</p>' : '<button class="btn ghost" id="bsLoc">📍 حدّد موقعي لاختيار الأقرب تلقائياً</button>'}
      <div class="group">
      ${list.map(({ branch: b, distanceKm }) => {
        const open = GA.isOpen(b, now);
        return `<div class="opt ${b.id === branchId() ? 'on' : ''}" ${single ? '' : `data-b="${esc(b.id)}" role="button" tabindex="0"`}>
          <div class="l" style="flex-direction:column;align-items:flex-start;gap:3px">
            <b>${esc(b.name)} ${distanceKm != null ? `<span class="badge">${distanceKm.toFixed(1)} كم</span>` : ''}</b>
            <small class="note">${esc(b.address)}</small>
            <small><span class="status-dot ${open ? '' : 'closed'}"></span>${open ? 'مفتوح' : 'مغلق'} · ${esc(b.hours ? b.hours.open + ' – ' + b.hours.close : '')}</small>
          </div>
          <div style="display:flex;gap:6px">
            <a class="icon-btn" href="tel:${esc(b.phone)}" aria-label="اتصال" onclick="event.stopPropagation()">📞</a>
            ${b.mapUrl || b.lat ? `<a class="icon-btn" target="_blank" rel="noopener" href="${esc(b.mapUrl || `https://maps.google.com/?q=${b.lat},${b.lng}`)}" aria-label="الخريطة" onclick="event.stopPropagation()">🗺️</a>` : ''}
          </div>
        </div>`;
      }).join('')}
      </div>`, (el) => {
      const l = el.querySelector('#bsLoc');
      if (l) l.onclick = () => { closeSheet(); locate(false); };
      el.querySelectorAll('[data-b]').forEach((n) => n.onclick = () => {
        S.manualBranch = n.dataset.b; store.set('ga.branch', S.manualBranch);
        resolveBranch(); closeSheet(); route();
        toast(`الطلب الآن من ${S.pick.branch.name}`);
      });
    });
  }

  /* ---------------- الصنف ---------------- */
  function itemSheet(itemId, lineKey) {
    const f = GA.findItem(S.menu, itemId);
    if (!f) return;
    const { item, category, section } = f;
    const addons = item.addons || category.addons || [];
    const editing = lineKey ? S.cart.find((l) => l.key === lineKey) : null;
    const st = { v: editing ? editing.variantIdx : (item.variants ? Math.max(0, item.variants.findIndex((v) => v.price != null)) : null), a: editing ? [...editing.addonIdxs] : [], qty: editing ? editing.qty : 1, note: editing ? editing.note || '' : '' };
    const orderable = GA.isOrderable(item, branchId());
    const b = S.pick.branch;

    const draw = (el) => {
      const unit = GA.unitPriceH(item, category, st.v, st.a);
      el.querySelector('.body').innerHTML = `
        <img class="big" src="${esc(imgOf(item, category, section) || 'icons/icon-512.png')}" alt="${esc(item.name)}">
        <h3>${esc(item.name)}</h3>
        <div class="note">${esc(item.nameEn || '')}${GA.caloriesText(item, st.v) ? ` · <span class="kcal">🔥 ${esc(GA.caloriesText(item, st.v))}</span>` : ''}</div>
        ${item.desc || category.desc ? `<p>${esc(item.desc || category.desc)}</p>` : ''}
        ${item.allergens ? `<p class="note">⚠️ <b>مسببات الحساسية:</b> ${esc(item.allergens)}</p>` : ''}
        ${item.soldOut ? '<div class="alert">نفدت الكمية اليوم</div>' : ''}
        ${!orderable && !item.soldOut ? (unit == null
          ? `<div class="alert">هذا الصنف متاح بالطلب المسبق والكميات — اطلب عرض سعر مباشرة من الفرع.</div>
             <a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${esc(b.whatsapp)}?text=${encodeURIComponent(`السلام عليكم، أرغب بعرض سعر لصنف: ${item.name}${st.v != null && item.variants ? ' (' + item.variants[st.v].name + ')' : ''}`)}">اطلب عرض سعر واتساب</a>`
          : '<div class="alert">غير متاح في هذا الفرع حالياً</div>') : ''}
        ${item.variants && item.variants.length ? `<div class="group"><b>اختر المقاس / النوع</b>
          ${item.variants.map((v, i) => `<label class="opt ${st.v === i ? 'on' : ''}" ${v.price == null ? 'aria-disabled="true"' : ''}>
            <span class="l"><input type="radio" name="v" value="${i}" ${st.v === i ? 'checked' : ''}>${esc(v.name)}</span>
            <span class="price ${v.price == null ? 'na' : ''}">${v.price == null ? 'عند الطلب' : GA.fmt(GA.toH(v.price))}</span></label>`).join('')}
        </div>` : ''}
        ${addons.length ? `<div class="group"><b>إضافات</b>
          ${addons.map((a, i) => `<label class="opt ${st.a.includes(i) ? 'on' : ''}">
            <span class="l"><input type="checkbox" name="a" value="${i}" ${st.a.includes(i) ? 'checked' : ''}>${esc(a.name)}</span>
            <span class="price">+ ${GA.fmt(GA.toH(a.price))}</span></label>`).join('')}
        </div>` : ''}
        ${orderable ? `
        <div class="field"><label for="inote">ملاحظة على الصنف (اختياري)</label>
          <input id="inote" maxlength="120" placeholder="مثلاً: بدون زيتون، مقطّع" value="${esc(st.note)}"></div>
        <div style="display:flex;gap:12px;align-items:center;margin-top:8px">
          <div class="stepper"><button data-q="1" aria-label="زيادة">+</button><span>${st.qty}</span><button data-q="-1" aria-label="إنقاص">−</button></div>
          <button class="btn" id="addBtn" ${unit == null ? 'disabled' : ''}>${editing ? 'تحديث' : 'أضف للسلة'} · ${unit == null ? '—' : GA.fmt(unit * st.qty)}</button>
        </div>` : ''}`;
      el.querySelectorAll('input[name=v]').forEach((n) => n.onchange = () => { st.v = +n.value; draw(el); });
      el.querySelectorAll('input[name=a]').forEach((n) => n.onchange = () => {
        const i = +n.value; st.a = n.checked ? [...st.a, i].sort() : st.a.filter((x) => x !== i); draw(el);
      });
      el.querySelectorAll('[data-q]').forEach((n) => n.onclick = () => { st.qty = Math.max(1, Math.min(99, st.qty + +n.dataset.q)); draw(el); });
      const note = el.querySelector('#inote'); if (note) note.oninput = () => { st.note = note.value; };
      const add = el.querySelector('#addBtn');
      if (add) add.onclick = () => {
        const line = {
          key: [item.id, st.v, st.a.join('.'), st.note.trim()].join('|'),
          itemId: item.id, name: item.name, image: imgOf(item, category, section),
          variantIdx: st.v, variant: st.v != null && item.variants ? item.variants[st.v].name : '',
          addonIdxs: st.a, addons: st.a.map((i) => addons[i].name), note: st.note.trim(), qty: st.qty, unitH: unit,
        };
        if (editing) S.cart = S.cart.filter((l) => l.key !== editing.key);
        const same = S.cart.find((l) => l.key === line.key);
        if (same && !editing) same.qty = Math.min(99, same.qty + line.qty); else S.cart.push(line);
        saveCart(); closeSheet(); route();
        toast(editing ? 'تم تحديث الصنف' : `أُضيف ${item.name} للسلة`);
      };
    };
    sheet('', draw);
  }

  /* ---------------- السلة ---------------- */
  function saveCart() { store.set('ga.cart', S.cart); updateCartbar(); }

  /* إعادة تسعير السلة من المنيو الحالي — لو المالك غيّر سعراً يطبَّق فوراً، ولو الصنف اتوقف يتعلّم. */
  function repriced() {
    return S.cart.map((l) => {
      const f = GA.findItem(S.menu, l.itemId);
      if (!f) return { ...l, unavailable: 'لم يعد متاحاً' };
      const unitH = GA.unitPriceH(f.item, f.category, l.variantIdx, l.addonIdxs);
      if (unitH == null || !GA.isOrderable(f.item, branchId())) return { ...l, unavailable: f.item.soldOut ? 'نفدت الكمية' : 'غير متاح في هذا الفرع' };
      return { ...l, unitH, name: f.item.name };
    });
  }

  function updateCartbar() {
    const lines = S.menu ? repriced() : S.cart;
    const t = GA.cartTotals(lines.filter((l) => !l.unavailable), S.menu && S.menu.settings, 'pickup');
    const onCart = location.hash.startsWith('#/cart') || location.hash.startsWith('#/order');
    $('#cartbar').hidden = !t.count || onCart;
    $('#cartbarCount').textContent = `${t.count} ${t.count === 1 ? 'صنف' : 'أصناف'}`;
    $('#cartbarTotal').textContent = GA.fmt(t.totalH);
  }

  /* ---------------- الشاشات ---------------- */
  function setNav(id) {
    document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.id === id));
  }

  function itemCard(item, category, section) {
    const ok = GA.isOrderable(item, branchId());
    const inCart = S.cart.filter((l) => l.itemId === item.id).reduce((s, l) => s + l.qty, 0);
    let price;
    if (item.variants && item.variants.length) {
      const ps = item.variants.map((v) => v.price).filter((p) => p != null);
      price = ps.length ? `${ps.length > 1 ? 'من ' : ''}${GA.fmt(GA.toH(Math.min(...ps)))}` : null;
    } else price = item.price != null ? GA.fmt(GA.toH(item.price)) : null;
    return `<button class="item ${ok ? '' : 'off'}" data-item="${esc(item.id)}">
      <div class="ph">${photo(imgOf(item, category, section), item.name)}</div>
      <div class="txt">
        <b>${esc(item.name)} ${inCart ? `<span class="qty-tag">${inCart}</span>` : ''}</b>
        <small>${esc(item.desc || item.nameEn || '')}</small>
        ${GA.caloriesText(item) ? `<small class="kcal">🔥 ${esc(GA.caloriesText(item))}</small>` : ''}
        <div class="row">
          ${price ? `<span class="price">${price}</span>` : '<span class="price na">السعر عند الطلب</span>'}
          ${item.soldOut ? '<span class="badge red">نفد</span>' : (item.unavailableAt || []).includes(branchId()) ? '<span class="badge red">غير متاح بالفرع</span>' : ok ? '<span class="add" aria-hidden="true">+</span>' : '<span class="badge">اطلب عرض سعر</span>'}
        </div>
      </div>
    </button>`;
  }

  function bindItems(root) {
    root.querySelectorAll('[data-item]').forEach((n) => n.onclick = () => itemSheet(n.dataset.item));
  }

  function viewHome() {
    setNav('nav-home');
    const m = S.menu, s = m.settings, b = S.pick.branch;
    const open = b && GA.isOpen(b, new Date());
    const last = S.orders[0];
    $('#view').innerHTML = `
      <section class="hero">
        ${m.brand.heroImage || (m.sections[2] && m.sections[2].image) ? `<img src="${esc(m.brand.heroImage || m.sections[2].image)}" alt="">` : ''}
        <div class="in">
          <h1>${esc(m.brand.name)}</h1>
          <p>${esc(m.brand.tagline)}</p>
          <div class="chips">
            ${s.fulfillment.pickup ? '<span class="pill">🏪 استلام من الفرع</span>' : ''}
            ${s.fulfillment.delivery ? '<span class="pill">🛵 توصيل</span>' : ''}
            ${b && !open ? '<span class="pill">⏰ الفرع مغلق — جدول طلبك</span>' : ''}
          </div>
        </div>
      </section>
      ${s.branchMode !== 'single' && !S.loc ? `<div class="card install"><span style="font-size:26px">📍</span><div style="flex:1"><b>نختار لك أقرب فرع</b><div class="note">اسمح بالموقع مرة واحدة فقط</div></div><button class="btn" style="width:auto;padding:10px 16px" id="homeLoc">حدّد موقعي</button></div>` : ''}
      ${last ? `<div class="card install"><span style="font-size:26px">🧾</span><div style="flex:1"><b>آخر طلب ${esc(last.code)}</b><div class="note">${esc(statusName(last.status))} · ${GA.fmt(last.totals.totalH)}</div></div><button class="btn ghost" style="width:auto;padding:10px 16px" data-reorder="${esc(last.code)}">اطلبه تاني</button></div>` : ''}
      <div class="search" role="search"><span>🔎</span><input id="homeSearch" placeholder="ابحث عن صنف… لبنة، بابكا، كرواسون"></div>
      <div class="sections">
        ${m.sections.map((sec) => `<button class="section-card" data-sec="${esc(sec.id)}">
          ${sec.image ? `<img src="${esc(sec.image)}" alt="" loading="lazy">` : ''}
          <span><b>${esc(sec.name)}</b><small>${esc(sec.nameEn)} · ${sec.categories.reduce((n, c) => n + c.items.length, 0)} صنف</small></span>
        </button>`).join('')}
      </div>
      <p class="note" style="text-align:center">${esc(s.notice || '')}</p>`;
    const hl = $('#homeLoc'); if (hl) hl.onclick = () => locate(false);
    $('#homeSearch').onfocus = () => { location.hash = '#/search'; };
    document.querySelectorAll('[data-sec]').forEach((n) => n.onclick = () => { location.hash = `#/s/${n.dataset.sec}`; });
    document.querySelectorAll('[data-reorder]').forEach((n) => n.onclick = () => reorder(n.dataset.reorder));
  }

  function viewSection(secId, catId) {
    setNav('nav-home');
    const sec = S.menu.sections.find((x) => x.id === secId);
    if (!sec) { location.hash = '#/'; return; }
    $('#view').innerHTML = `
      <button class="back" onclick="location.hash='#/'">→ الأقسام</button>
      <h1 class="sec-title">${esc(sec.name)}</h1>
      ${sec.note ? `<p class="note">${esc(sec.note)}</p>` : ''}
      <div class="tabs" id="tabs">${sec.categories.map((c) => `<button class="tab" data-tab="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>
      ${sec.categories.map((c) => `<section class="cat" id="cat-${esc(c.id)}">
        <div class="cat-head">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : ''}<div><h2>${esc(c.name)}</h2><p>${esc(c.desc || c.nameEn || '')}${c.addons && c.addons.length ? ' · ' + c.addons.map((a) => `${esc(a.name)} +${a.price}`).join('، ') : ''}</p></div></div>
        <div class="items">${c.items.filter((it) => !it.hidden).map((it) => itemCard(it, c, sec)).join('')}</div>
      </section>`).join('')}`;
    bindItems($('#view'));
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const mark = (id) => tabs.forEach((t) => { const on = t.dataset.tab === id; t.classList.toggle('on', on); if (on) t.scrollIntoView({ inline: 'center', block: 'nearest' }); });
    tabs.forEach((t) => t.onclick = () => { document.getElementById(`cat-${t.dataset.tab}`).scrollIntoView({ behavior: 'smooth' }); mark(t.dataset.tab); });
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) mark(vis.target.id.slice(4));
    }, { rootMargin: '-130px 0px -60% 0px' });
    document.querySelectorAll('.cat').forEach((c) => io.observe(c));
    S.watchers.push(() => io.disconnect());
    mark(catId || sec.categories[0].id);
    if (catId) setTimeout(() => { const el = document.getElementById(`cat-${catId}`); if (el) el.scrollIntoView(); }, 30);
    else window.scrollTo(0, 0);
  }

  function viewSearch() {
    setNav('nav-search');
    const all = [];
    for (const sec of S.menu.sections) for (const c of sec.categories) for (const it of c.items) if (!it.hidden) all.push({ it, c, sec, key: norm(`${it.name} ${it.nameEn || ''} ${c.name} ${sec.name} ${it.desc || ''}`) });
    $('#view').innerHTML = `<div style="height:14px"></div>
      <div class="search"><span>🔎</span><input id="q" placeholder="اكتب اسم الصنف" autocomplete="off"></div>
      <div id="res" class="items" style="margin-top:14px"></div>`;
    const q = $('#q'), res = $('#res');
    const run = () => {
      const words = norm(q.value).split(/\s+/).filter(Boolean);
      const hits = words.length ? all.filter((x) => words.every((w) => x.key.includes(w))).slice(0, 60) : [];
      res.innerHTML = !words.length ? '<p class="empty">ابحث في كل الأقسام مرة واحدة</p>'
        : hits.length ? hits.map((x) => itemCard(x.it, x.c, x.sec)).join('') : '<p class="empty">لا توجد نتائج</p>';
      bindItems(res);
    };
    q.oninput = run; run(); q.focus();
  }

  function timeSlots(branch) {
    const out = [], now = new Date();
    const t = new Date(now.getTime() + 30 * 60000);
    t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
    for (let i = 0; i < 24 * 4 && out.length < 16; i++) {
      const d = new Date(t.getTime() + i * 15 * 60000);
      if (GA.isOpen(branch, d)) out.push(d);
    }
    return out;
  }
  const hm = (d) => d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
  const dayWord = (d) => d.toDateString() === new Date().toDateString() ? 'اليوم' : 'غداً';

  function viewCart() {
    setNav('nav-cart');
    const m = S.menu, s = m.settings, b = S.pick.branch, ck = S.checkout, pf = S.profile;
    const lines = repriced();
    if (!lines.length) {
      $('#view').innerHTML = '<div class="empty"><div style="font-size:54px">🧺</div><h2>سلتك فاضية</h2><p>ابدأ من الأقسام واختار اللي تحبه</p><button class="btn" style="max-width:260px;margin:auto" onclick="location.hash=\'#/\'">تصفّح المنيو</button></div>';
      updateCartbar(); return;
    }
    const open = b && GA.isOpen(b, new Date());
    if (!open && ck.when === 'asap') ck.when = '';
    // خياران فقط (قرار المالك): «من السيارة» كان بيلخبط العملاء مع الاستلام والتوصيل
    const modes = [
      ['pickup', 'استلام من الفرع', s.fulfillment.pickup],
      ['delivery', 'توصيل', s.fulfillment.delivery],
    ];
    if (!modes.find((x) => x[0] === ck.fulfillment && x[2])) ck.fulfillment = (modes.find((x) => x[2]) || modes[0])[0];
    const good = lines.filter((l) => !l.unavailable);
    const totals = GA.cartTotals(good, s, ck.fulfillment);
    const dist = S.loc && b ? GA.haversineKm(S.loc, b) : null;
    const dchk = ck.fulfillment === 'delivery' ? (S.loc ? GA.deliveryCheck(s, dist, totals.subtotalH) : { ok: false, reason: 'شارك موقعك لحساب التوصيل' }) : { ok: true };
    const pays = [
      ['cash', 'كاش عند الاستلام', s.payments.cash],
      ['cardOnDelivery', 'شبكة مدى عند الاستلام', s.payments.cardOnDelivery],
      ['online', 'دفع إلكتروني (مدى · Apple Pay)', s.payments.online && !!(CFG.payment && CFG.payment.moyasarPublishableKey)],
    ];
    if (!pays.find((p) => p[0] === ck.payment && p[2])) ck.payment = (pays.find((p) => p[2]) || pays[0])[0];
    const slots = timeSlots(b);

    $('#view').innerHTML = `
      <h1 class="sec-title" style="margin-top:14px">السلة</h1>
      <p class="note">من ${esc(b.name)}${dist != null ? ` · ${dist.toFixed(1)} كم` : ''} — <a href="#" id="chgBranch">${m.settings.branchMode === 'single' ? 'تفاصيل الفرع' : 'تغيير'}</a></p>
      <div class="card">
        ${lines.map((l) => `<div class="line">
          <img src="${esc(l.image || 'icons/icon-192.png')}" alt="">
          <div class="t"><b>${esc(l.name)}</b><small>${esc([l.variant, ...(l.addons || [])].filter(Boolean).join(' + '))}${l.note ? ' · ' + esc(l.note) : ''}</small>
            ${l.unavailable ? `<small style="color:var(--danger)">${esc(l.unavailable)}</small>` : `<small class="price">${GA.fmt(l.unitH * l.qty)}</small>`}</div>
          <div class="stepper"><button data-inc="${esc(l.key)}">+</button><span>${l.qty}</span><button data-dec="${esc(l.key)}">${l.qty === 1 ? '🗑' : '−'}</button></div>
        </div>`).join('')}
      </div>

      <div class="card">
        <b>طريقة الاستلام</b>
        <div class="seg" style="margin-top:8px">${modes.map(([k, n, on]) => `<button data-ful="${k}" class="${ck.fulfillment === k ? 'on' : ''}" ${on ? '' : 'disabled'}>${n}</button>`).join('')}</div>
        ${ck.fulfillment === 'delivery' ? `
          <div style="margin-top:12px">
            ${S.loc ? `<p class="note">📍 موقعك محفوظ · ${dist.toFixed(1)} كم من الفرع — <a href="#" id="reLoc">تحديث</a></p>` : '<button class="btn ghost" id="shareLoc">📍 شارك موقع التوصيل</button>'}
            ${dchk.ok ? '' : `<div class="alert">${esc(dchk.reason)}</div>`}
            <div class="field"><label for="addr">العنوان بالتفصيل</label><input id="addr" value="${esc(pf.address)}" placeholder="الحي، الشارع، رقم المبنى، علامة مميزة"></div>
            <p class="note">رسوم التوصيل ${GA.fmt(GA.toH(s.delivery.fee))}${s.delivery.freeAbove ? ` · مجاناً للطلبات فوق ${s.delivery.freeAbove} ر.س` : ''}</p>
          </div>` : ''}
        <div class="field" style="margin-top:12px"><label for="when">الوقت</label>
          <select id="when">
            ${open ? `<option value="asap" ${ck.when === 'asap' ? 'selected' : ''}>في أقرب وقت (٢٠–٣٠ دقيقة)</option>` : '<option value="" disabled selected>الفرع مغلق الآن — اختر وقتاً</option>'}
            ${slots.map((d) => { const v = d.toISOString(); return `<option value="${v}" ${ck.when === v ? 'selected' : ''}>${dayWord(d)} ${hm(d)}</option>`; }).join('')}
          </select></div>
      </div>

      <div class="card">
        <b>بياناتك</b>
        <div class="field" style="margin-top:8px"><label for="nm">الاسم</label><input id="nm" autocomplete="name" value="${esc(pf.name)}"></div>
        <div class="field"><label for="ph">الجوال</label><input id="ph" type="tel" inputmode="numeric" autocomplete="tel" placeholder="05xxxxxxxx" value="${esc(pf.phone)}"></div>
        <div class="field"><label for="on">ملاحظة للفرع (اختياري)</label><textarea id="on" rows="2">${esc(ck.note)}</textarea></div>
      </div>

      <div class="card">
        <b>الدفع</b>
        <div class="group" style="margin-bottom:0">
        ${pays.map(([k, n, on]) => `<label class="opt ${ck.payment === k ? 'on' : ''}" ${on ? '' : 'aria-disabled="true"'}>
          <span class="l"><input type="radio" name="pay" value="${k}" ${ck.payment === k ? 'checked' : ''} ${on ? '' : 'disabled'}>${n}</span>${on ? '' : '<small class="note">قريباً</small>'}</label>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="sum"><span>المجموع</span><span>${GA.fmt(totals.subtotalH)}</span></div>
        ${ck.fulfillment === 'delivery' ? `<div class="sum"><span>التوصيل</span><span>${totals.deliveryH ? GA.fmt(totals.deliveryH) : 'مجاني'}</span></div>` : ''}
        <div class="sum total"><span>الإجمالي</span><span>${GA.fmt(totals.totalH)}</span></div>
        <div class="note">شامل ضريبة القيمة المضافة ${GA.fmt(totals.vatH)}</div>
      </div>
      <div id="err"></div>
      <button class="btn" id="placeBtn">${orderButtonLabel()} · ${GA.fmt(totals.totalH)}</button>
      <div style="height:20px"></div>`;

    const keep = () => {
      const v = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
      if (v('nm') !== undefined) pf.name = v('nm').trim();
      if (v('ph') !== undefined) pf.phone = v('ph').replace(/\D/g, '');
      if (v('addr') !== undefined) pf.address = v('addr').trim();
      if (v('car') !== undefined) pf.car = v('car').trim();
      if (v('on') !== undefined) ck.note = v('on').trim();
      if (v('when') !== undefined) ck.when = v('when');
      store.set('ga.profile', pf);
    };
    const redraw = () => { keep(); const y = scrollY; viewCart(); scrollTo(0, y); };
    document.querySelectorAll('[data-inc],[data-dec]').forEach((n) => n.onclick = () => {
      const key = n.dataset.inc || n.dataset.dec, l = S.cart.find((x) => x.key === key);
      if (!l) return;
      l.qty += n.dataset.inc ? 1 : -1;
      if (l.qty <= 0) S.cart = S.cart.filter((x) => x.key !== key);
      saveCart(); redraw();
    });
    document.querySelectorAll('[data-ful]').forEach((n) => n.onclick = () => { ck.fulfillment = n.dataset.ful; redraw(); });
    document.querySelectorAll('input[name=pay]').forEach((n) => n.onchange = () => { ck.payment = n.value; redraw(); });
    $('#chgBranch').onclick = (e) => { e.preventDefault(); keep(); branchSheet(); };
    const sl = $('#shareLoc') || $('#reLoc'); if (sl) sl.onclick = (e) => { e.preventDefault(); keep(); locate(false); };
    ['nm', 'ph', 'addr', 'car', 'on', 'when'].forEach((id) => { const el = document.getElementById(id); if (el) el.onchange = keep; });

    $('#placeBtn').onclick = () => {
      keep();
      const errs = [];
      if (lines.some((l) => l.unavailable)) errs.push('احذف الأصناف غير المتاحة من السلة');
      if (pf.name.length < 2) errs.push('اكتب اسمك');
      if (!/^05\d{8}$/.test(pf.phone)) errs.push('رقم الجوال لازم يبدأ 05 ويكون ١٠ أرقام');
      if (!ck.when) errs.push('اختر وقت الاستلام');
      if (ck.fulfillment === 'delivery') {
        if (!dchk.ok) errs.push(dchk.reason);
        if (pf.address.length < 6) errs.push('اكتب عنوان التوصيل بالتفصيل');
      }
      if (errs.length) { $('#err').innerHTML = errs.map((e) => `<div class="alert">${esc(e)}</div>`).join(''); $('#err').scrollIntoView({ block: 'center' }); return; }
      placeOrder(good, totals);
    };
    updateCartbar();
  }

  function orderButtonLabel() {
    const ch = S.menu.settings.orderChannels;
    return ch.dashboard && R ? 'تأكيد الطلب' : 'أرسل الطلب واتساب';
  }

  async function placeOrder(lines, totals) {
    const m = S.menu, s = m.settings, b = S.pick.branch, ck = S.checkout, pf = S.profile;
    const now = new Date();
    const seq = now.getHours() * 100 + now.getMinutes() + Math.floor(Math.random() * 10) * 10000;
    const order = {
      code: GA.orderCode(b.id, now, seq),
      branchId: b.id, branchName: b.name,
      customer: { name: pf.name, phone: pf.phone },
      fulfillment: ck.fulfillment,
      when: ck.when === 'asap' ? 'في أقرب وقت' : `${dayWord(new Date(ck.when))} ${hm(new Date(ck.when))}`,
      whenAt: ck.when === 'asap' ? null : ck.when,
      address: ck.fulfillment === 'delivery' ? pf.address : '',
      location: ck.fulfillment === 'delivery' ? S.loc : null,
      lines: lines.map(({ itemId, name, variant, addons, note, qty, unitH }) => ({ itemId, name, variant, addons, note, qty, unitH })),
      totals, payment: ck.payment, note: ck.note,
      placedAt: now.toISOString(), status: 'sent', channel: [],
    };
    const btn = $('#placeBtn'); btn.disabled = true; btn.textContent = 'جارٍ الإرسال…';
    try {
      if (s.orderChannels.dashboard && R) {
        order.remoteId = await R.placeOrder(order);
        order.status = 'new'; order.channel.push('dashboard');
      }
      if (s.orderChannels.whatsapp || !order.channel.length) {
        order.channel.push('whatsapp');
        window.open(`https://wa.me/${b.whatsapp}?text=${encodeURIComponent(GA.whatsappText(order))}`, '_blank');
      }
    } catch (e) {
      btn.disabled = false; btn.textContent = orderButtonLabel();
      $('#err').innerHTML = `<div class="alert">تعذّر إرسال الطلب: ${esc(e.message)} — جرّب مرة أخرى أو اطلب واتساب.</div>`;
      return;
    }
    S.orders.unshift(order); S.orders = S.orders.slice(0, 30); store.set('ga.orders', S.orders);
    S.cart = []; saveCart(); ck.note = '';
    location.hash = `#/order/${order.code}`;
  }

  const STATUS = { sent: 'أُرسل للفرع عبر واتساب', new: 'بانتظار قبول الفرع', accepted: 'تم القبول — جارٍ التجهيز', ready: 'جاهز للاستلام', out: 'خرج للتوصيل', done: 'تم التسليم', cancelled: 'أُلغي' };
  const statusName = (s) => STATUS[s] || s;
  const STEPS = ['new', 'accepted', 'ready', 'done'];

  function orderCard(o, full) {
    const idx = o.status === 'out' ? 2 : STEPS.indexOf(o.status);
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px"><b>طلب ${esc(o.code)}</b><span class="badge ${o.status === 'cancelled' ? 'red' : ''}">${esc(statusName(o.status))}</span></div>
      <div class="note">${esc(o.branchName)} · ${esc(GA.FULFILL[o.fulfillment])} · ${esc(o.when)}</div>
      ${o.remoteId ? `<div class="track">${['استلام', 'تجهيز', o.fulfillment === 'delivery' ? 'في الطريق' : 'جاهز', 'تسليم'].map((n, i) => `<div class="${i <= idx ? 'done' : ''}">${n}</div>`).join('')}</div>` : ''}
      ${full ? o.lines.map((l) => `<div class="sum"><span>${l.qty} × ${esc(l.name)}${l.variant ? ' (' + esc(l.variant) + ')' : ''}</span><span>${GA.fmt(l.unitH * l.qty)}</span></div>`).join('') : ''}
      <div class="sum total"><span>الإجمالي</span><span>${GA.fmt(o.totals.totalH)}</span></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn ghost" data-reorder="${esc(o.code)}">اطلبه تاني</button>
        ${!full ? `<button class="btn ghost" onclick="location.hash='#/order/${esc(o.code)}'">التفاصيل</button>` : ''}
      </div>
    </div>`;
  }

  function watchRemote(o) {
    if (!R || !o.remoteId) return;
    S.watchers.push(R.watchOrder(o.remoteId, (d) => {
      if (d.status && d.status !== o.status) {
        o.status = d.status; store.set('ga.orders', S.orders);
        toast(`طلب ${o.code}: ${statusName(d.status)}`);
        route();
      }
    }));
  }

  function viewOrder(code) {
    setNav('nav-orders');
    const o = S.orders.find((x) => x.code === code);
    if (!o) { location.hash = '#/orders'; return; }
    const b = S.menu.branches.find((x) => x.id === o.branchId) || {};
    $('#view').innerHTML = `
      <div class="empty" style="padding:24px 0 8px"><div style="font-size:52px">✅</div><h2 style="margin:6px 0">${o.status === 'sent' ? 'طلبك جاهز للإرسال' : 'تم استلام طلبك'}</h2>
      <p>${o.status === 'sent' ? 'اضغط «إرسال» في واتساب لو ما اتبعتش — الفرع يأكّد لك هناك.' : 'هنبلغك هنا بكل تحديث.'}</p></div>
      ${orderCard(o, true)}
      ${o.channel.includes('whatsapp') ? `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${esc(b.whatsapp)}?text=${encodeURIComponent(GA.whatsappText(o))}">إعادة فتح الطلب في واتساب</a><div style="height:8px"></div>` : ''}
      <a class="btn ghost" href="tel:${esc(b.phone)}">📞 اتصل بالفرع</a>`;
    document.querySelectorAll('[data-reorder]').forEach((n) => n.onclick = () => reorder(n.dataset.reorder));
    watchRemote(o);
  }

  function viewOrders() {
    setNav('nav-orders');
    $('#view').innerHTML = `<h1 class="sec-title" style="margin-top:14px">طلباتي</h1>
      ${S.orders.length ? S.orders.map((o) => orderCard(o, false)).join('') : '<div class="empty"><div style="font-size:50px">🧾</div><p>لسه ما طلبتش — طلباتك هتظهر هنا</p></div>'}`;
    document.querySelectorAll('[data-reorder]').forEach((n) => n.onclick = () => reorder(n.dataset.reorder));
    S.orders.slice(0, 5).forEach(watchRemote);
  }

  function reorder(code) {
    const o = S.orders.find((x) => x.code === code);
    if (!o) return;
    let added = 0, skipped = 0;
    for (const l of o.lines) {
      const f = GA.findItem(S.menu, l.itemId);
      if (!f) { skipped++; continue; }
      const variantIdx = f.item.variants ? Math.max(0, f.item.variants.findIndex((v) => v.name === l.variant)) : null;
      const addonsList = f.item.addons || f.category.addons || [];
      const addonIdxs = (l.addons || []).map((n) => addonsList.findIndex((a) => a.name === n)).filter((i) => i >= 0);
      const unitH = GA.unitPriceH(f.item, f.category, variantIdx, addonIdxs);
      if (unitH == null || !GA.isOrderable(f.item, branchId())) { skipped++; continue; }
      const key = [l.itemId, variantIdx, addonIdxs.join('.'), l.note || ''].join('|');
      const same = S.cart.find((x) => x.key === key);
      if (same) same.qty += l.qty;
      else S.cart.push({ key, itemId: l.itemId, name: f.item.name, image: imgOf(f.item, f.category, f.section), variantIdx, variant: l.variant, addonIdxs, addons: l.addons || [], note: l.note || '', qty: l.qty, unitH });
      added++;
    }
    saveCart();
    toast(skipped ? `أُضيف ${added} صنف · ${skipped} غير متاح الآن` : 'الطلب في السلة بالأسعار الحالية');
    location.hash = '#/cart';
  }

  /* ---------------- التوجيه ---------------- */
  function route() {
    S.watchers.forEach((off) => off()); S.watchers = [];
    const h = location.hash || '#/';
    const p = h.slice(2).split('/');
    if (p[0] === 's') viewSection(decodeURIComponent(p[1] || ''), p[2] === 'c' ? decodeURIComponent(p[3] || '') : null);
    else if (p[0] === 'search') viewSearch();
    else if (p[0] === 'cart') viewCart();
    else if (p[0] === 'orders') viewOrders();
    else if (p[0] === 'order') viewOrder(decodeURIComponent(p[1] || ''));
    else viewHome();
    updateCartbar();
  }

  /* ---------------- التشغيل ---------------- */
  async function loadMenu() {
    // ?t= يتخطّى كاش GitHub Pages (١٠ دقائق) — تعديل اللوحة يوصل أول ما النشر يخلص
    const r = await fetch(`${CFG.menuUrl}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('menu ' + r.status);
    return r.json();
  }

  async function boot() {
    try {
      S.menu = await loadMenu();
    } catch (e) {
      $('#view').innerHTML = '<div class="empty"><h2>تعذّر تحميل المنيو</h2><p>تأكد من الاتصال وحاول مرة أخرى</p><button class="btn" onclick="location.reload()">إعادة المحاولة</button></div>';
      return;
    }
    resolveBranch();
    route();
    window.addEventListener('hashchange', () => { closeSheet(); route(); });
    document.querySelectorAll('[data-go]').forEach((n) => n.onclick = () => { location.hash = n.dataset.go; });
    $('#branchBtn').onclick = branchSheet;
    $('#locBtn').onclick = () => locate(false);
    $('#cartbarBtn').onclick = () => { location.hash = '#/cart'; };

    if (S.menu.settings.branchMode !== 'single' && navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate(true); }).catch(() => {});
    }
    setInterval(renderHeader, 60 * 1000);

    if (R) {  // وضع اللوحة: المنيو الحي يغلب الملف المحلي
      R.loadMenu().then((live) => {
        if (live && !GA.validateMenu(live).length) { S.menu = live; resolveBranch(); route(); }
      }).catch(() => {});
    }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
        setInterval(() => reg.update(), 60 * 60 * 1000);
      }).catch(() => {});
    }
  }

  window.GA_APP = { S, route };  // للفحص من المتصفح والحرّاس
  boot();
})();
