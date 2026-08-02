/* ══════════════════════════════════════════════════════════════
   LIKETWIN — Service Worker لرفع الملفات الصوتية في الخلفية
   ------------------------------------------------------------
   الهدف: جعل رفع الملف (/compare_audio) مستقلاً تماماً عن دورة
   حياة صفحة الويب. الصفحة قد تنتقل فوراً لصفحة أخرى (لوحتي/الأسعار)
   بعد الضغط على "ابدأ المقارنة"، لكن هذا الـ Service Worker يواصل
   الرفع لأن دورة حياته منفصلة عن أي تبويب أو صفحة محددة.

   الآلية:
   1) الصفحة تُرسل رسالة 'start-upload' تحمل الملف (File) + uploadId
      فريد + عنوان الـ API + رمز المصادقة (إن وجد).
   2) نستدعي event.waitUntil(...) فوراً — هذا يُبقي الـ Service Worker
      حياً طول مدة الرفع حتى لو أُغلقت كل الصفحات المرتبطة به.
   3) نخزّن حالة الرفع (uploading → done/error) في IndexedDB، وهي
      قاعدة بيانات مشتركة بين الـ Service Worker وأي صفحة تُفتح على
      نفس الأصل (origin) — هكذا يمكن لأي صفحة (حتى بعد إغلاق وفتح
      من جديد) أن تسأل: "وش صار بالرفع اللي بدأته قبل ما أخرج؟"
   4) نُرسل أيضاً postMessage لأي صفحة نشطة حالياً — تحسين إضافي
      لتحديث فوري إن كانت نفس الصفحة الأصلية لا تزال مفتوحة.
══════════════════════════════════════════════════════════════ */

const DB_NAME = 'liketwin-sw';
const DB_STORE = 'uploads';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveUploadState(id, state) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put({ id, ...state, ts: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteUploadState(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ✅ نُفعّل الـ Service Worker فوراً بلا انتظار إغلاق كل التبويبات
// القديمة — ضروري لأن أول عملية رفع قد تحدث مباشرة بعد أول تسجيل
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function notifyClients(msg) {
  try {
    const list = await self.clients.matchAll({ includeUncontrolled: true });
    list.forEach((c) => c.postMessage(msg));
  } catch (e) { /* لا مشكلة إن فشل الإشعار — IndexedDB يبقى المصدر الأساسي */ }
}

// ✅ نحتفظ بمتحكمات الإلغاء (AbortController) الجارية حسب uploadId
// حتى يمكن للصفحة طلب إلغاء رفع لا يزال جارياً (زر "إلغاء")
const activeControllers = new Map();

async function doUpload(uploadId, apiBase, file, authHeader) {
  await saveUploadState(uploadId, { status: 'uploading' });

  const ctrl = new AbortController();
  activeControllers.set(uploadId, ctrl);

  try {
    const fd = new FormData();
    fd.append('file', file);

    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${apiBase}/compare_audio`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers,
      signal: ctrl.signal,
    });

    const data = await res.json();

    await saveUploadState(uploadId, { status: 'done', data });
    await notifyClients({ type: 'upload-complete', uploadId, data });

  } catch (err) {
    if (err && err.name === 'AbortError') {
      // ✅ المستخدم ألغى الرفع بنفسه — لا داعي لحفظ أي حالة خطأ
      await deleteUploadState(uploadId);
    } else {
      await saveUploadState(uploadId, { status: 'error', error: String((err && err.message) || err) });
      await notifyClients({ type: 'upload-error', uploadId, error: String((err && err.message) || err) });
    }
  } finally {
    activeControllers.delete(uploadId);
  }
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'start-upload') {
    const { uploadId, apiBase, file, authHeader } = msg;
    if (!uploadId || !apiBase || !file) return;
    // ✅ event.waitUntil يُبقي الـ Service Worker حياً حتى تنتهي
    // عملية الرفع فعلياً، بغض النظر عن حالة أي صفحة مرتبطة به
    event.waitUntil(doUpload(uploadId, apiBase, file, authHeader));
    return;
  }

  if (msg.type === 'cancel-upload') {
    const c = activeControllers.get(msg.uploadId);
    if (c) c.abort();
    return;
  }
});
