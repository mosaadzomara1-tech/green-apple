/* شاشة التسطيب — طلب المالك: اللي يفتح اللينك يشوف «ثبّت التطبيق» على طول، مش رسالة صغيرة فوق.
 *
 * - أندرويد/كمبيوتر (كروم · إيدج · سامسونج): زر واحد يفتح نافذة التثبيت الأصلية (beforeinstallprompt).
 * - آيفون سفاري/كروم: خطوات «مشاركة ← إضافة إلى الشاشة الرئيسية» (أبل ما بتسمحش بزر مباشر).
 * - جوّه متصفح مصغّر (واتساب · إنستغرام · فيسبوك): مفيش تثبيت أصلاً ← زر «افتح في Safari/Chrome».
 *   ⚠ واتساب آيفون بينتحل UA سفاري بالحرف — الفارق الوحيد إن navigator.standalone مش مُعرَّف.
 * التصنيف دالة خالصة محروسة في tests/install_check.js. */
(function (root) {
  'use strict';

  const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|MicroMessenger|WhatsApp|GSA\/|TikTok|musical_ly|Telegram/i;

  function classify(env) {
    const ua = env.ua || '';
    if (env.standaloneValue === true || env.displayStandalone === true) return 'installed';
    const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (env.touchPoints || 0) > 1);
    if (iOS) {
      const other = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua);
      if (!other && (IN_APP.test(ua) || !env.standaloneDefined)) return 'ios-inapp';
      return other ? 'ios-other' : 'ios-safari';
    }
    if (/Android/.test(ua)) return (IN_APP.test(ua) || /; wv\)/.test(ua)) ? 'android-inapp' : 'android';
    return 'desktop';
  }

  const api = { classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GA_INSTALL = api;
  if (typeof document === 'undefined') return;

  /* ---------------- الواجهة ---------------- */
  let deferred = null;
  const SKIP = 'ga.skipInstall';
  const mode = classify({
    ua: navigator.userAgent,
    standaloneDefined: 'standalone' in navigator,
    standaloneValue: navigator.standalone,
    displayStandalone: !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches),
    touchPoints: navigator.maxTouchPoints,
  });
  const skipped = (() => { try { return sessionStorage.getItem(SKIP) === '1'; } catch (e) { return false; } })();
  const fromApp = /[?&]source=pwa/.test(location.search);

  root.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();               // بدل الشريط الصغير — الزر الكبير هو اللي يفتحها
    deferred = e;
    const b = document.getElementById('gateInstall');
    if (b) { b.disabled = false; b.classList.add('ready'); }
  });
  root.addEventListener('appinstalled', () => { deferred = null; paint('done'); });

  if (mode === 'installed' || skipped || fromApp) return;

  const SHARE = '<svg class="gate-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  const PLUS = '<svg class="gate-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  const steps = (arr) => '<ol class="gate-steps">' + arr.map((s) => '<li><span>' + s + '</span></li>').join('') + '</ol>';

  function body(m) {
    switch (m) {
      case 'android':
      case 'desktop':
        return '<button class="gate-btn" id="gateInstall">تثبيت التطبيق</button>' +
          '<div class="gate-help" id="gateHelp" hidden>' + (m === 'android'
            ? steps(['افتح قائمة المتصفح <b>⋮</b> فوق', 'اختار <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>'])
            : steps(['اضغط أيقونة التثبيت ' + PLUS + ' في شريط العنوان', 'اختار <b>«تثبيت»</b>'])) + '</div>';
      case 'android-inapp':
        return '<button class="gate-btn ready" id="gateChrome">افتح في Chrome وثبّته</button>' +
          '<p class="gate-note">المتصفح اللي جوّه التطبيق ده ما بيسمحش بالتثبيت</p>';
      case 'ios-inapp':
        return '<button class="gate-btn ready" id="gateSafari">افتح في Safari وثبّته</button>' +
          '<p class="gate-note" id="gateCopied">متصفح واتساب/إنستغرام ما فيهوش خيار التثبيت — أو اضغط <b>⋯</b> واختار «فتح في Safari»</p>';
      case 'ios-safari':
        return steps(['اضغط زر المشاركة ' + SHARE + ' تحت', 'انزل واختار <b>«إضافة إلى الشاشة الرئيسية»</b> ' + PLUS, 'اضغط <b>«إضافة»</b> — والأيقونة هتظهر على شاشتك']) +
          '<div class="gate-arrow" aria-hidden="true">↓</div>';
      case 'ios-other':
        return steps(['اضغط زر المشاركة ' + SHARE + ' جنب شريط العنوان', 'اختار <b>«إضافة إلى الشاشة الرئيسية»</b> ' + PLUS, 'اضغط <b>«إضافة»</b>']);
      case 'done':
        return '<p class="gate-ok">✓ اتثبّت التطبيق</p><p class="gate-note">افتحه من أيقونة «مخابز التفاح الأخضر» على شاشتك</p>';
    }
    return '';
  }

  function close() {
    try { sessionStorage.setItem(SKIP, '1'); } catch (e) { /* وضع خاص */ }
    const g = document.getElementById('gate');
    if (g) g.remove();
    document.documentElement.classList.remove('gate-open');
  }

  function paint(m) {
    const g = document.getElementById('gate');
    if (!g) return;
    g.querySelector('.gate-body').innerHTML = body(m);
    g.querySelector('.gate-skip').textContent = m === 'done' ? 'تمام' : 'متابعة من المتصفح';
    wire();
  }

  function wire() {
    const inst = document.getElementById('gateInstall');
    if (inst) {
      if (deferred) inst.classList.add('ready');
      inst.onclick = async () => {
        if (!deferred) { document.getElementById('gateHelp').hidden = false; return; }
        const e = deferred; deferred = null;
        e.prompt();
        try { const c = await e.userChoice; if (c && c.outcome === 'accepted') paint('done'); } catch (err) { /* اتقفلت */ }
      };
      // لو المتصفح ما بعتش نافذة التثبيت خلال ثواني (فايرفوكس · مثبَّت قبل كده) — الخطوات تظهر لوحدها
      setTimeout(() => { const h = document.getElementById('gateHelp'); if (h && !deferred) h.hidden = false; }, 3500);
    }
    const chrome = document.getElementById('gateChrome');
    if (chrome) chrome.onclick = () => {
      location.href = 'intent://' + location.host + location.pathname + location.search +
        '#Intent;scheme=https;package=com.android.chrome;end';
    };
    const safari = document.getElementById('gateSafari');
    if (safari) safari.onclick = () => {
      const url = location.href.split('#')[0];
      try { navigator.clipboard && navigator.clipboard.writeText(url); } catch (e) { /* مش مهم */ }
      location.href = 'x-safari-' + url;
      setTimeout(() => {
        const n = document.getElementById('gateCopied');
        if (n && document.visibilityState === 'visible') n.innerHTML = 'اتنسخ الرابط ✓ افتح <b>Safari</b> والصقه في شريط العنوان';
      }, 1200);
    };
  }

  function mount() {
    const g = document.createElement('div');
    g.id = 'gate'; g.className = 'gate'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true');
    g.setAttribute('aria-labelledby', 'gateT');
    g.innerHTML = '<div class="gate-card">' +
      '<img class="gate-logo" src="icons/icon-512.png?h=3dd19d8c" alt="مخابز التفاح الأخضر" width="512" height="512">' +
      '<h1 id="gateT">ثبّت تطبيق مخابز التفاح الأخضر</h1>' +
      '<p class="gate-sub">اطلب فطايرك ومخبوزاتك في ثواني — بدون متجر وبدون مساحة</p>' +
      '<div class="gate-body"></div>' +
      '<button class="gate-skip" type="button">متابعة من المتصفح</button></div>';
    document.body.appendChild(g);
    document.documentElement.classList.add('gate-open');
    g.querySelector('.gate-skip').onclick = close;
    paint(mode);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(typeof window !== 'undefined' ? window : globalThis);
