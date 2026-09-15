/* الحفظ من لوحة التحكم على الرابط الحي مباشرة في مستودع GitHub — بلا خادم ولا حساب جديد.
 * GitHub Pages بيعيد النشر خلال دقيقة، والتطبيق بيقرا المنيو بلا كاش، فالتعديل يوصل للعملاء تلقائياً.
 *
 * حماية التزامن: الحفظ بيقارن رقم نسخة المنيو اللي اتفتحت باللي على المستودع؛ لو جهاز تاني حفظ
 * في النص يرفض بدل ما يمسح تعديله. والتحقق GA.validateMenu قبل أي كتابة.
 * يشتغل في المتصفح (window.GA_GITHUB) وفي node للحرّاس (module.exports). */
(function (root) {
  'use strict';
  const API = 'https://api.github.com';
  const GA = root.GA || (typeof require !== 'undefined' ? require('./logic.js') : null);

  function b64FromBytes(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function bytesFromB64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function create({ repo, branch, token, fetchImpl }) {
    const F = fetchImpl || fetch;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

    async function call(method, path, body) {
      const r = await F(`${API}/repos/${repo}/${path}`, {
        method, cache: 'no-store',
        headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = r.status === 401 ? 'رمز GitHub غير صالح أو انتهى'
          : r.status === 403 || r.status === 404 ? 'الرمز لا يملك صلاحية على المستودع'
          : r.status === 409 ? 'تعارض — المنيو اتعدّل من جهاز آخر' : (j.message || `GitHub ${r.status}`);
        const e = new Error(msg); e.status = r.status; throw e;
      }
      return j;
    }

    const api = {
      /* فحص الدخول بسبب محدّد لكل حالة — عشان المالك يعرف يصلّح إيه بالظبط بدل «مش بيدخل». */
      async check() {
        const fail = (msg, code) => { const e = new Error(msg); e.code = code; throw e; };
        // رمز Fine-grained كامل = ٩٣ حرف (github_pat_ + 82) · Classic = ٤٠ (ghp_ + 36).
        // الطول بيكشف النسخ الناقص أو الكتابة بالإيد قبل ما نسأل GitHub.
        const fine = /^github_pat_[A-Za-z0-9_]+$/.test(token), classic = /^ghp_[A-Za-z0-9]+$/.test(token);
        if (!fine && !classic) {
          fail(`شكل الرمز غلط — لازم يبدأ بـ github_pat_ (اللي اتلصق بيبدأ بـ «${token.slice(0, 11)}»). انسخه تاني بزرّ النسخ اللي جنبه في GitHub.`, 'format');
        }
        if ((fine && (token.length < 88 || token.length > 100)) || (classic && token.length !== 40)) {
          fail(`الرمز ناقص أو زايد: اتلصق ${token.length} حرف والمفروض ${fine ? '٩٣' : '٤٠'}. انسخه تاني بزرّ النسخ — ما تكتبهوش بالإيد.`, 'format');
        }
        let r;
        try { r = await F(`${API}/repos/${repo}`, { headers, cache: 'no-store' }); }
        catch (e) { fail('المتصفح منع الاتصال بـ GitHub — افتح اللوحة في كروم أو سفاري العادي (مش من جوه واتساب)، واقفل مانع الإعلانات لو فيه.', 'network'); }
        if (r.status === 401) fail('GitHub رفض الرمز. الأسباب: (١) عملت Regenerate فالرمز القديم بطل — الصق الجديد · (٢) الرمز اتمسح أو انتهت مدته · (٣) اتنسخ من صفحة قديمة. الحل: اعمل رمز جديد وانسخه فوراً بزرّ النسخ والصقه هنا.', 'bad-token');
        if (r.status === 404 || r.status === 403) fail(`الرمز مش شايف مستودع التطبيق — في صفحة الرمز: Repository access ← Only select repositories ← اختار ${repo}.`, 'no-repo');
        if (!r.ok) fail(`GitHub رجّع خطأ ${r.status} — جرّب بعد دقيقة.`, 'github');
        // الرمز شايف المستودع؛ نتأكد إنه يقدر يقرا الملفات (صلاحية Contents)
        const c = await F(`${API}/repos/${repo}/contents/data/menu.json?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
        if (c.status === 403 || c.status === 404) fail('الرمز ناقصه صلاحية الملفات — في صفحة الرمز: Permissions ← Repository permissions ← Contents ← Read and write.', 'no-contents');
        const j = await r.json().catch(() => ({}));
        // المستودع عام، فرمز GitHub الافتراضي («Public repositories» قراءة بس) بيشوفه لكن ما يقدرش يكتب —
        // ده أشيع سبب لـ«مش بيدخل». GitHub بيرجّع push=false في الحالة دي.
        if (j.permissions && j.permissions.push === false) {
          fail(`الرمز «قراءة بس». عدّله في GitHub: Repository access ← Only select repositories ← ${repo}، وبعدين Permissions ← Contents ← Read and write ← Update.`, 'read-only');
        }
        return true;
      },
      async getFile(path) {
        try {
          const j = await call('GET', `contents/${path}?ref=${encodeURIComponent(branch)}`);
          return { sha: j.sha, bytes: bytesFromB64(j.content) };
        } catch (e) { if (e.status === 404) return null; throw e; }
      },
      putFile(path, bytes, message, sha) {
        return call('PUT', `contents/${path}`, { message, branch, content: b64FromBytes(bytes), ...(sha ? { sha } : {}) });
      },
      async loadMenu() {
        const f = await api.getFile('data/menu.json');
        if (!f) throw new Error('ملف المنيو غير موجود على المستودع');
        return { menu: JSON.parse(new TextDecoder().decode(f.bytes)), sha: f.sha };
      },
      /* expectedVersion = رقم النسخة لما اللوحة فتحت؛ لو اختلف = حد عدّل من جهاز تاني. */
      async saveMenu(menu, expectedVersion) {
        const errors = GA.validateMenu(menu);
        if (errors.length) { const e = new Error(errors.join('\n')); e.code = 'invalid'; throw e; }
        const cur = await api.loadMenu();
        if (expectedVersion != null && cur.menu.version !== expectedVersion) {
          const e = new Error(`المنيو اتعدّل من جهاز آخر (نسخة ${cur.menu.version}) — أعد فتح اللوحة ثم عدّل`);
          e.code = 'conflict'; e.remoteVersion = cur.menu.version; throw e;
        }
        const next = { ...menu, version: (cur.menu.version || 0) + 1, updated: new Date().toISOString().slice(0, 10) };
        await api.putFile('data/menu.json', new TextEncoder().encode(JSON.stringify(next, null, 1) + '\n'), `تعديل المنيو — نسخة ${next.version}`, cur.sha);
        return next;
      },
      async uploadImage(blob, ext) {
        const name = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext || 'webp'}`;
        await api.putFile(name, new Uint8Array(await blob.arrayBuffer()), 'صورة جديدة من لوحة التحكم');
        return name;
      },
      /* ينتظر لحد ما الرابط الحي يقدّم النسخة الجديدة — عشان اللوحة تقول «وصل للعملاء» عن يقين. */
      async waitLive(siteUrl, version, { timeoutMs = 240000, everyMs = 8000 } = {}) {
        const end = Date.now() + timeoutMs;
        while (Date.now() < end) {
          try {
            const r = await F(`${siteUrl}data/menu.json?t=${Date.now()}`, { cache: 'no-store' });
            if (r.ok && (await r.json()).version >= version) return true;
          } catch (e) { /* شبكة متقطعة — نكمّل */ }
          await new Promise((ok) => setTimeout(ok, everyMs));
        }
        return false;
      },
    };
    return api;
  }

  const mod = { create, b64FromBytes, bytesFromB64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.GA_GITHUB = mod;
})(typeof window !== 'undefined' ? window : globalThis);
