/* ══════════════════════════════════════════════════════════════
   LIKETWIN — Service Worker لتشغيل تحليل الصوت في الخلفية
   ──────────────────────────────────────────────────────────────
   لماذا هذا الملف ضروري:
   لا توجد طريقة في جافاسكريبت الصفحة العادية لإبقاء طلب fetch يعمل
   عبر تنقّل كامل بين الصفحات (مثلاً من "تحليل" إلى "لوحتي" ثم
   العودة) — المتصفح يُلغي أي طلب شبكة قيد التنفيذ فور مغادرة الصفحة
   لأن كل شيء في تلك الصفحة (بما فيه الـ fetch) يُدمَّر مع تدميرها.

   الحل الوحيد المتاح فعلياً هو Service Worker: برنامج صغير يعمل في
   خيط منفصل تديره المتصفح نفسه، غير مرتبط بأي صفحة محددة. حين تطلب
   الصفحة منه بدء "مهمة" (رفع الملف وتحليله)، يستمر هو بتنفيذها حتى
   لو أُغلقت الصفحة التي طلبتها أو انتقل المستخدم لصفحة أخرى، لأن
   الطلب أصبح "طلبه هو" وليس طلب تلك الصفحة تحديدًا.

   آلية العمل:
   1) الصفحة تخزّن الملف الصوتي + معرّف مهمة (jobId) في IndexedDB
      (قاعدة بيانات مشتركة بين الصفحة وهذا الـ Worker على نفس النطاق).
   2) الصفحة تُرسل رسالة لهذا الـ Worker: "ابدأ المهمة رقم كذا".
   3) هذا الملف يقرأ الملف من IndexedDB، يرفعه فعلياً للسيرفر
      (compare_audio)، وعند اكتمال الطلب (نجاحًا أو فشلًا) يكتب
      النتيجة في IndexedDB أيضًا، بشكل مستقل تمامًا عن حالة الصفحة.
   4) الصفحة (سواء بقيت مفتوحة، أو أُعيد فتحها بعد التنقّل) تتحقق من
      IndexedDB (مباشرة، أو عبر رسالة "ما حالة المهمة؟") لتعرف: هل ما
      زالت المعالجة جارية؟ أم انتهت بنتيجة؟ أم بخطأ؟

   ملاحظات نشر مهمة:
   - يجب تقديم هذا الملف من جذر الموقع (أو من أعلى مسار تريد أن يغطيه
     نطاق الـ Service Worker) — عدّل السطر الخاص بـ importScripts أدناه
     إذا كان مسار config.js مختلفًا عندك.
   - Service Workers تعمل فقط على HTTPS (أو localhost أثناء التطوير).
   - Safari/iOS لا يدعمان Background Sync، لذا أضفنا مسارًا احتياطيًا:
     تنفيذ الطلب فور استلام الرسالة داخل event.waitUntil مباشرة (بلا
     انتظار حدث sync)، وهذا يعمل طالما الـ Service Worker نفسه لم
     يُغلق (المتصفح يُبقيه حيًّا طوال مدة waitUntil عادة، وهي مدة
     كافية لمعظم عمليات الرفع والتحليل).
══════════════════════════════════════════════════════════════ */

// ✅ عدّل هذا المسار إذا كان config.js في مكان مختلف عن جذر الموقع.
// يجب أن يعرّف config.js متغيرًا عامًا اسمه CONFIG بداخله { API: '...' }
try { importScripts('/config.js'); } catch (e) { /* سنعتمد عندها على apiBase المخزّن مع كل مهمة */ }

const IDB_NAME  = 'liketwin_jobs';
const IDB_STORE = 'jobs';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGetJob(jobId) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const r = tx.objectStore(IDB_STORE).get(jobId);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}
async function idbSetJob(jobId, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, jobId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ✅ نتتبع AbortController لكل مهمة قيد التنفيذ فعليًا، لنتمكن من قطع
// طلب الرفع فورًا عند طلب الإلغاء من الصفحة (بدل ترك الطلب يكتمل
// بلا فائدة في الخلفية)
const activeControllers = new Map();

async function notifyClients(jobId, payload) {
  try {
    const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    clientsList.forEach((c) => c.postMessage({ type: 'lt_job_update', jobId, ...payload }));
  } catch (e) { /* لا مشكلة إن لم توجد صفحات مفتوحة الآن — ستقرأ النتيجة من IndexedDB لاحقًا */ }
}

async function runCompareJob(jobId) {
  let job = await idbGetJob(jobId);
  // ✅ فحص + تحديث الحالة إلى "running" فورًا لمنع تنفيذ نفس المهمة
  // مرتين لو وصلت رسالة "ابدأ" أكثر من مرة (مثلاً من صفحة أُعيد فتحها)
  if (!job || job.status !== 'pending') return;
  job.status = 'running';
  await idbSetJob(jobId, job);

  const abortCtrl = new AbortController();
  activeControllers.set(jobId, abortCtrl);

  try {
    const apiBase = job.apiBase || (typeof CONFIG !== 'undefined' ? CONFIG.API : '');
    const fd = new FormData();
    fd.append('file', job.blob, job.name || 'audio');
    const headers = {};
    if (job.bearer) headers['Authorization'] = 'Bearer ' + job.bearer;

    const res = await fetch(apiBase + '/compare_audio', {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers,
      signal: abortCtrl.signal,
    });
    const data = await res.json();

    // ✅ نتحقق أن المهمة لم تُلغَ (تُحذف من IndexedDB عند الإلغاء من
    // الصفحة) قبل كتابة النتيجة، حتى لا "تُحيي" مهمة أُلغيت عمدًا
    const stillExists = await idbGetJob(jobId);
    if (!stillExists) return;

    stillExists.status = 'done';
    stillExists.result = data;
    stillExists.finishedAt = Date.now();
    await idbSetJob(jobId, stillExists);
    notifyClients(jobId, { status: 'done', result: data });
  } catch (err) {
    if (err && err.name === 'AbortError') return; // ✅ إلغاء مقصود — لا نكتب أي خطأ
    const stillExists = await idbGetJob(jobId);
    if (!stillExists) return;
    stillExists.status = 'error';
    stillExists.error = 'فشل الاتصال بالخادم، حاول مجدداً.';
    stillExists.finishedAt = Date.now();
    await idbSetJob(jobId, stillExists);
    notifyClients(jobId, { status: 'error', error: stillExists.error });
  } finally {
    activeControllers.delete(jobId);
  }
}

self.addEventListener('message', (event) => {
  const msg = event.data || {};

  if (msg.type === 'lt_start_job' && msg.jobId) {
    // ✅ ExtendableMessageEvent يدعم waitUntil تمامًا كأحداث fetch/sync —
    // هذا ما يُبقي الـ Service Worker حيًّا حتى تكتمل عملية الرفع
    // والتحليل، بصرف النظر عمّا يحدث لصفحة الموقع نفسها بعد ذلك
    event.waitUntil(runCompareJob(msg.jobId));
    return;
  }

  if (msg.type === 'lt_cancel_job' && msg.jobId) {
    // ✅ نقطع طلب الرفع فورًا إن كان لا يزال قيد التنفيذ فعليًا
    const c = activeControllers.get(msg.jobId);
    if (c) c.abort();
    return;
  }

  if (msg.type === 'lt_check_job' && msg.jobId) {
    event.waitUntil(
      idbGetJob(msg.jobId).then((job) => {
        const reply = {
          type: 'lt_job_update',
          jobId: msg.jobId,
          status: job ? job.status : 'missing',
          result: job && job.status === 'done' ? job.result : undefined,
          error: job && job.status === 'error' ? job.error : undefined,
        };
        if (event.source) event.source.postMessage(reply);
      })
    );
  }
});

// ✅ مسار إضافي عبر Background Sync (Chrome/Edge/Android) — يمنح
// المتصفح فرصة لإعادة محاولة المهمة تلقائيًا إذا انقطع الاتصال
// بالإنترنت مؤقتًا أثناء التنفيذ، حتى بعد إغلاق كل صفحات الموقع
self.addEventListener('sync', (event) => {
  if (event.tag && event.tag.startsWith('lt-job-')) {
    const jobId = event.tag.slice('lt-job-'.length);
    event.waitUntil(runCompareJob(jobId));
  }
});
