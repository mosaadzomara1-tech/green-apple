/* إعدادات التشغيل — الملف الوحيد اللي بيتغيّر بين النسخة المحلية والمنشورة.
 *
 * firebase: null  → وضع «بلا خادم»: المنيو من data/menu.json والطلب يروح واتساب.
 * firebase: {...} → وضع «اللوحة»: المنيو والطلبات والحالة لحظياً من Firebase،
 *                   ولوحة التحكم بتحدّث الأسعار والصور على كل الأجهزة فوراً.
 * القيم دي تيجي من: Firebase Console ▸ Project settings ▸ Your apps ▸ Web app.
 */
window.GA_CONFIG = {
  appVersion: '1.0.0',
  menuUrl: 'data/menu.json',
  // الحفظ من اللوحة على الرابط الحي: يكتب في المستودع ده مباشرة (برمز يُدخله المالك مرة على جهازه)
  github: { repo: 'mosaadzomara1-tech/green-apple', branch: 'gh-pages', site: 'https://mosaadzomara1-tech.github.io/green-apple/' },
  firebase: null,
  // firebase: { apiKey: '', authDomain: '', projectId: '', storageBucket: '', appId: '' },
  payment: {
    // الدفع الإلكتروني (مدى · Apple Pay · فيزا) عبر Moyasar — مفتاح النشر فقط (pk_live_...)،
    // والمفتاح السري لا يوضع هنا أبداً. يظل الخيار مقفولاً في التطبيق حتى يُملأ.
    moyasarPublishableKey: '',
  },
};
