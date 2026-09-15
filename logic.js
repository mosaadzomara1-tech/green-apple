/* منطق التطبيق الحتمي — دوال خالصة بلا DOM ولا شبكة.
 * نفس الملف بيشتغل في المتصفح (window.GA) وفي node للحرّاس (module.exports).
 * كل الفلوس بالهللة (أعداد صحيحة) عشان مفيش كسور عائمة في أي إجمالي. */
(function (root) {
  'use strict';

  const toH = (sar) => Math.round(Number(sar) * 100);   // ريال → هللة
  const toSAR = (h) => h / 100;

  /* ---------- الفروع ---------- */
  function haversineKm(a, b) {
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  const minutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };

  /* مفتوح الآن؟ بيدعم الإقفال بعد نص الليل (مثلاً 16:00 → 02:00) و"24:00". */
  function isOpen(branch, date) {
    if (!branch || !branch.active) return false;
    if (!branch.hours) return true;
    const now = date.getHours() * 60 + date.getMinutes();
    const o = minutes(branch.hours.open), c = minutes(branch.hours.close);
    if (o === c) return true;                 // ٢٤ ساعة
    return o < c ? now >= o && now < c : now >= o || now < c;
  }

  /* اختيار الفرع: وضع "single" يثبّت فرعاً واحداً لكل العملاء،
   * و"nearest" يرتّب الفروع المفعّلة بالمسافة من العميل. */
  function pickBranch(branches, settings, userLoc) {
    const active = (branches || []).filter((b) => b.active);
    if (!active.length) return { branch: null, reason: 'no-active-branch', options: [] };
    const withDist = active.map((b) => ({
      branch: b,
      distanceKm: userLoc ? haversineKm(userLoc, b) : null,
    }));
    if (userLoc) withDist.sort((x, y) => x.distanceKm - y.distanceKm);
    if (settings && settings.branchMode === 'single') {
      const hit = withDist.find((x) => x.branch.id === settings.singleBranchId) || withDist[0];
      return { ...hit, reason: 'single', options: [hit] };
    }
    return { ...withDist[0], reason: userLoc ? 'nearest' : 'default', options: withDist };
  }

  /* ---------- الأصناف والأسعار ---------- */
  function findItem(menu, itemId) {
    for (const s of menu.sections || [])
      for (const c of s.categories || [])
        for (const it of c.items || [])
          if (it.id === itemId) return { section: s, category: c, item: it };
    return null;
  }

  /* الصنف متاح في الفرع؟ مخفي أو نافد أو موقوف في الفرع أو بلا سعر = غير قابل للطلب. */
  function isOrderable(item, branchId) {
    if (!item || item.hidden || item.soldOut) return false;
    if (branchId && (item.unavailableAt || []).includes(branchId)) return false;
    if (item.variants && item.variants.length) return item.variants.some((v) => v.price != null && v.price >= 0);
    return item.price != null && item.price >= 0;
  }

  /* سعر الوحدة بالهللة = سعر الصنف (أو المقاس) + الإضافات المختارة. null لو بلا سعر. */
  function unitPriceH(item, category, variantIdx, addonIdxs) {
    let base;
    if (item.variants && item.variants.length) {
      const v = item.variants[variantIdx == null ? 0 : variantIdx];
      if (!v || v.price == null) return null;
      base = toH(v.price);
    } else {
      if (item.price == null) return null;
      base = toH(item.price);
    }
    const addons = (item.addons || (category && category.addons) || []);
    for (const i of addonIdxs || []) {
      const a = addons[i];
      if (a && a.price != null) base += toH(a.price);
    }
    return base;
  }

  /* ---------- السلة ---------- */
  /* الأسعار شاملة الضريبة: الضريبة المضمّنة = الإجمالي × ١٥ ÷ ١١٥ مقرّبة لأقرب هللة. */
  function cartTotals(lines, settings, fulfillment) {
    const subtotal = (lines || []).reduce((s, l) => s + l.unitH * l.qty, 0);
    const d = (settings && settings.delivery) || {};
    let deliveryH = 0;
    if (fulfillment === 'delivery' && subtotal > 0) {
      const free = d.freeAbove != null && subtotal >= toH(d.freeAbove);
      deliveryH = free ? 0 : toH(d.fee || 0);
    }
    const total = subtotal + deliveryH;
    const rate = (settings && settings.vatRate) || 0.15;
    const vat = settings && settings.pricesIncludeVat === false
      ? Math.round(total * rate)
      : Math.round((total * rate) / (1 + rate));
    const grand = settings && settings.pricesIncludeVat === false ? total + vat : total;
    return { subtotalH: subtotal, deliveryH, vatH: vat, totalH: grand, count: (lines || []).reduce((s, l) => s + l.qty, 0) };
  }

  /* التوصيل مسموح؟ يرجّع السبب بالعربي لو لأ. */
  function deliveryCheck(settings, distanceKm, subtotalH) {
    const s = settings || {};
    if (!s.fulfillment || !s.fulfillment.delivery) return { ok: false, reason: 'التوصيل غير متاح حالياً' };
    const d = s.delivery || {};
    if (d.radiusKm != null && distanceKm != null && distanceKm > d.radiusKm)
      return { ok: false, reason: `موقعك خارج نطاق التوصيل (${d.radiusKm} كم)` };
    if (d.minOrder != null && subtotalH < toH(d.minOrder))
      return { ok: false, reason: `الحد الأدنى للتوصيل ${d.minOrder} ر.س` };
    return { ok: true };
  }

  const fmt = (h) => {
    const v = toSAR(h);
    return (Number.isInteger(v) ? String(v) : v.toFixed(2)) + ' ر.س';
  };

  /* ---------- رقم الطلب ونص واتساب ---------- */
  function orderCode(branchId, date, seq) {
    const p = (n) => String(n).padStart(2, '0');
    return `${String(branchId || 'GA').slice(0, 3).toUpperCase()}-${p(date.getMonth() + 1)}${p(date.getDate())}-${String(seq).padStart(3, '0')}`;
  }

  const FULFILL = { pickup: 'استلام من الفرع', curbside: 'استلام من السيارة', delivery: 'توصيل' };
  const PAY = { cash: 'كاش عند الاستلام', cardOnDelivery: 'شبكة (مدى) عند الاستلام', online: 'دفع إلكتروني' };

  function whatsappText(order) {
    const L = [];
    L.push(`🧾 *طلب جديد ${order.code}*`);
    L.push(`🏪 ${order.branchName}`);
    L.push(`👤 ${order.customer.name} — ${order.customer.phone}`);
    L.push(`🚚 ${FULFILL[order.fulfillment] || order.fulfillment}${order.when ? ' — ' + order.when : ''}`);
    if (order.fulfillment === 'curbside' && order.car) L.push(`🚗 السيارة: ${order.car}`);
    if (order.fulfillment === 'delivery') {
      L.push(`📍 ${order.address || ''}`);
      if (order.location) L.push(`https://maps.google.com/?q=${order.location.lat},${order.location.lng}`);
    }
    L.push('');
    for (const l of order.lines) {
      const extra = [l.variant, ...(l.addons || [])].filter(Boolean).join(' + ');
      L.push(`• ${l.qty} × ${l.name}${extra ? ' (' + extra + ')' : ''} = ${fmt(l.unitH * l.qty)}`);
      if (l.note) L.push(`   ↳ ${l.note}`);
    }
    L.push('');
    const t = order.totals;
    if (t.deliveryH) L.push(`التوصيل: ${fmt(t.deliveryH)}`);
    L.push(`*الإجمالي: ${fmt(t.totalH)}* (شامل ضريبة ${fmt(t.vatH)})`);
    L.push(`💳 ${PAY[order.payment] || order.payment}`);
    if (order.note) L.push(`📝 ${order.note}`);
    return L.join('\n');
  }

  /* ---------- التحقق من ملف المنيو (حارس قبل النشر وقبل الحفظ من اللوحة) ---------- */
  function validateMenu(menu) {
    const errors = [];
    const ids = new Set();
    if (!menu || !Array.isArray(menu.sections)) return ['menu.sections مفقودة'];
    const bIds = new Set();
    for (const b of menu.branches || []) {
      if (!b.id || bIds.has(b.id)) errors.push(`فرع بمعرّف مكرر أو فارغ: ${b.id}`);
      bIds.add(b.id);
      if (!(Math.abs(b.lat) <= 90 && Math.abs(b.lng) <= 180)) errors.push(`إحداثيات غير صالحة للفرع ${b.id}`);
      if (b.whatsapp && !/^9665\d{8}$/.test(b.whatsapp)) errors.push(`رقم واتساب الفرع ${b.id} لازم يبدأ 9665 و١٢ رقم`);
    }
    const s = menu.settings || {};
    if (s.branchMode === 'single' && !bIds.has(s.singleBranchId)) errors.push('الفرع الموحّد غير موجود في قائمة الفروع');
    if (!(menu.branches || []).some((b) => b.active)) errors.push('لازم فرع واحد مفعّل على الأقل');
    const price = (p, where) => {
      if (p === null) return;
      if (typeof p !== 'number' || !isFinite(p) || p < 0) errors.push(`سعر غير صالح في ${where}: ${p}`);
    };
    // السعرات الحرارية اختيارية؛ لو موجودة لازم عدد صحيح ٠–٥٠٠٠
    const kcal = (k, where) => {
      if (k === undefined || k === null) return;
      if (!Number.isInteger(k) || k < 0 || k > 5000) errors.push(`سعرات غير صالحة في ${where}: ${k}`);
    };
    for (const sec of menu.sections) {
      for (const c of sec.categories || []) {
        for (const a of c.addons || []) price(a.price, `إضافة ${c.id}`);
        for (const it of c.items || []) {
          if (!it.id) errors.push(`صنف بلا معرّف في ${c.id}`);
          else if (ids.has(it.id)) errors.push(`معرّف صنف مكرر: ${it.id}`);
          ids.add(it.id);
          if (!it.name) errors.push(`صنف بلا اسم: ${it.id}`);
          if (it.variants) it.variants.forEach((v, i) => { price(v.price, `${it.id} مقاس ${i + 1}`); kcal(v.calories, `${it.id} مقاس ${i + 1}`); });
          else price(it.price === undefined ? null : it.price, it.id);
          kcal(it.calories, it.id);
          if (it.allergens != null && (typeof it.allergens !== 'string' || it.allergens.length > 200)) errors.push(`مسببات حساسية غير صالحة في ${it.id}`);
          for (const bid of it.unavailableAt || []) if (!bIds.has(bid)) errors.push(`${it.id} موقوف في فرع غير موجود: ${bid}`);
        }
      }
    }
    return errors;
  }

  /* نص السعرات للعرض: سعرات المقاس المختار أولاً ثم سعرات الصنف؛ ولو المقاسات مختلفة «١٨٠–٣٢٠». */
  function caloriesText(item, variantIdx) {
    if (!item) return '';
    if (item.variants && item.variants.length) {
      if (variantIdx != null && item.variants[variantIdx] && item.variants[variantIdx].calories != null)
        return `${item.variants[variantIdx].calories} سعرة`;
      const ks = item.variants.map((v) => v.calories).filter((k) => k != null);
      if (ks.length) { const lo = Math.min(...ks), hi = Math.max(...ks); return lo === hi ? `${lo} سعرة` : `${lo}–${hi} سعرة`; }
    }
    return item.calories != null ? `${item.calories} سعرة` : '';
  }

  const GA = { caloriesText, toH, toSAR, fmt, haversineKm, isOpen, pickBranch, findItem, isOrderable, unitPriceH,
    cartTotals, deliveryCheck, orderCode, whatsappText, validateMenu, FULFILL, PAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = GA;
  else root.GA = GA;
})(typeof window !== 'undefined' ? window : globalThis);
