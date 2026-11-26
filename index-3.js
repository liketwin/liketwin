function toggleAuthExtra() {
    const extra = document.getElementById("authExtra");
    const btn = document.getElementById("authToggleBtn");
    const label = document.getElementById("authToggleLabel");
    const isOpen = extra.classList.toggle("open");
    btn.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    label.textContent = isOpen ? "إخفاء الطرق الأخرى" : "طرق تسجيل دخول أخرى";
}

function toggleMobileMenu() {
    const menu = document.getElementById("mobileMenu");
    const btn = document.getElementById("navToggleBtn");
    const icon = document.getElementById("navToggleIcon");
    const isOpen = menu.classList.toggle("open");
    btn.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    icon.className = isOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars";
}

function closeMobileMenu() {
    const menu = document.getElementById("mobileMenu");
    const btn = document.getElementById("navToggleBtn");
    const icon = document.getElementById("navToggleIcon");
    if (!menu.classList.contains("open")) return;
    menu.classList.remove("open");
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    icon.className = "fa-solid fa-bars";
}

document.querySelectorAll(".mobile-menu-link").forEach(function(a) {
    a.addEventListener("click", closeMobileMenu);
});

document.addEventListener("click", function(e) {
    const menu = document.getElementById("mobileMenu");
    const btn = document.getElementById("navToggleBtn");
    if (!menu.classList.contains("open")) return;
    if (menu.contains(e.target) || btn.contains(e.target)) return;
    closeMobileMenu();
});

window.addEventListener("resize", function() {
    if (window.innerWidth > 800) closeMobileMenu();
});

try {
    sessionStorage.removeItem("lt_bearer");
} catch (_) {}

if (/auth_token=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);

function authHeaders() {
    return {};
}

document.getElementById("btnGoogleLogin").href = `${CONFIG.API}/auth/google`;

document.getElementById("btnGithubLogin").href = `${CONFIG.API}/auth/github`;

const TELEGRAM_BOT_ID = 8866235667;

(function loadTelegramLoginScript() {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    document.head.appendChild(script);
})();

async function handleTelegramAuth(user) {
    if (!user) return;
    try {
        const res = await fetch(`${CONFIG.API}/auth/telegram/callback`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(user)
        });
        if (!res.ok) throw new Error("تعذر تسجيل الدخول عبر تلغرام، حاول مجددًا");
        window.location.assign("/");
    } catch (error) {
        alert(error.message);
    }
}

document.getElementById("btnTelegramLogin").addEventListener("click", function() {
    if (window.Telegram && window.Telegram.Login) {
        window.Telegram.Login.auth({
            bot_id: TELEGRAM_BOT_ID,
            request_access: "write"
        }, handleTelegramAuth);
    } else {
        console.warn("سكربت Telegram Login لم يكتمل تحميله بعد، حاول مجدداً بعد لحظة");
    }
});

const MAX_DURATION_SEC = 60;

const MAX_SIZE_MB = 20;

const ALLOWED_TYPES = [ "audio/mpeg", "audio/wav", "audio/webm", "audio/aac", "audio/mp4", "audio/ogg", "audio/x-m4a", "audio/m4a" ];

function setLabelState(state, nameText, chipText, msgText) {
    const label = document.getElementById("fileLabel");
    const icon = document.getElementById("fileIcon");
    const name = document.getElementById("fileNameLabel");
    const chip = document.getElementById("fileChip");
    const msg = document.getElementById("fileValMsg");
    const valTxt = document.getElementById("fileValText");
    const btn = document.getElementById("btnGo");
    label.classList.remove("valid", "invalid", "checking");
    chip.classList.remove("valid", "invalid", "checking");
    msg.classList.remove("valid", "invalid");
    msg.style.display = "";
    name.textContent = nameText;
    if (state === "idle") {
        icon.innerHTML = '<i class="fa-solid fa-upload"></i>';
        chip.style.display = "none";
        msg.style.display = "none";
        btn.disabled = true;
        return;
    }
    if (state === "checking") {
        label.classList.add("checking");
        icon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        chip.classList.add("checking");
        chip.textContent = "فحص...";
        msg.style.display = "none";
        btn.disabled = true;
        return;
    }
    if (state === "valid") {
        label.classList.add("valid");
        icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        chip.classList.add("valid");
        chip.textContent = chipText;
        msg.style.display = "none";
        btn.disabled = false;
        return;
    }
    if (state === "invalid") {
        label.classList.add("invalid");
        icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        chip.classList.add("invalid");
        chip.textContent = "مرفوض";
        msg.classList.add("invalid");
        valTxt.textContent = msgText;
        btn.disabled = true;
        return;
    }
}

document.getElementById("fileInput").addEventListener("change", function(e) {
    const file = e.target.files[0];
    lastSubmittedFile = null;
    if (!file) {
        setLabelState("idle", window.idleLabel);
        return;
    }
    const typeOk = ALLOWED_TYPES.includes(file.type) || file.name.match(/\.(mp3|wav|m4a|mp4|aac|ogg|webm|flac)$/i);
    if (!typeOk) {
        setLabelState("invalid", file.name, "", "نوع الملف غير مدعوم — يُقبل فقط: mp3, wav, m4a, mp4, webm, ogg, aac");
        return;
    }
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
        setLabelState("invalid", file.name, "", `حجم الملف (${sizeMB.toFixed(0)}MB) يتجاوز الحد الأقصى (${MAX_SIZE_MB}MB)`);
        return;
    }
    setLabelState("checking", file.name);
    const audio = new Audio;
    const objUrl = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.src = objUrl;
    audio.addEventListener("loadedmetadata", () => {
        URL.revokeObjectURL(objUrl);
        if (audio.duration === Infinity || isNaN(audio.duration)) {
            setLabelState("valid", file.name, "");
            return;
        }
        if (audio.duration > MAX_DURATION_SEC) {
            const m = Math.floor(audio.duration / 60);
            const s = Math.round(audio.duration % 60);
            setLabelState("invalid", file.name, "", `المدة (${m}:${String(s).padStart(2, "0")}) تتجاوز الدقيقة الواحدة — قصّر التسجيل وحاول مجدداً`);
            return;
        }
        const dur = Math.round(audio.duration);
        setLabelState("valid", file.name, `${dur} ثانية`);
    });
    audio.addEventListener("error", e => {
        console.warn("audio metadata error:", e);
        URL.revokeObjectURL(objUrl);
        setLabelState("valid", file.name, "");
    });
    audio.load();
});

window.idleLabel = document.documentElement.classList.contains("upload-ready") ? "ارفع صوتك لمدة 20 ثانية" : "ارفع ملفاً (يتطلب اشتراك)";

function updateSubscribeButton(user) {
    const html = document.documentElement;
    let shouldShow = false;
    if (user) {
        const hasActivePaidPlan = !!user.plan && user.plan !== "free" && user.remaining > 0;
        shouldShow = !hasActivePaidPlan;
    }
    html.classList.remove("sub-show", "sub-hide");
    html.classList.add(shouldShow ? "sub-show" : "sub-hide");
    try {
        localStorage.setItem("lt_sub", shouldShow ? "show" : "hide");
    } catch (e) {}
}

async function checkUserStatus() {
    const html = document.documentElement;
    try {
        const res = await fetch(`${CONFIG.API}/get_user_info`, {
            credentials: "include",
            headers: authHeaders()
        });
        const data = await res.json();
        if (data.status === "ok" && data.user) {
            html.classList.remove("auth-out");
            html.classList.add("auth-in");
            try {
                localStorage.setItem("lt_auth", "in");
            } catch (e) {}
            updateSubscribeButton(data.user);
            const canUpload = data.user.remaining > 0;
            window.idleLabel = canUpload ? "ارفع صوتك لمدة 20 ثانية" : "ارفع ملفاً (يتطلب اشتراك)";
            html.classList.remove("upload-ready", "upload-locked");
            html.classList.add(canUpload ? "upload-ready" : "upload-locked");
            try {
                localStorage.setItem("lt_upload", canUpload ? "ready" : "locked");
            } catch (e) {}
            const fileInput = document.getElementById("fileInput");
            if (!fileInput.files || !fileInput.files[0]) {
                document.getElementById("fileNameLabel").textContent = window.idleLabel;
            }
            return;
        }
    } catch (e) {}
    html.classList.remove("auth-in");
    html.classList.add("auth-out");
    try {
        localStorage.setItem("lt_auth", "out");
    } catch (e) {}
    updateSubscribeButton(null);
    html.classList.remove("upload-ready");
    html.classList.add("upload-locked");
    try {
        localStorage.setItem("lt_upload", "locked");
    } catch (e) {}
}

const BUSY_MESSAGE = "يوجد ضغط حاليًا على الخدمة، حاول لاحقًا من فضلك.";
const JOB_POLL_INTERVAL_MS = 3000;
let jobPollTimer = null;
let jobPollGeneration = 0;
let jobPollFailures = 0;
let lastSubmittedFile = null;

function stopJobPolling() {
    jobPollGeneration += 1;
    clearTimeout(jobPollTimer);
    jobPollTimer = null;
}

function startJobPolling(jobId) {
    stopJobPolling();
    jobPollFailures = 0;
    setBusy(true);
    view("load");
    checkJobStatus(jobId, jobPollGeneration);
}

async function readApiResponse(res) {
    let data;
    try { data = await res.json(); } catch (_) {}
    if (data && typeof data === "object" && typeof data.status === "string") return data;
    return {status: "error", message: [429, 502, 503, 504].includes(res.status)
        ? BUSY_MESSAGE : "تعذر الاتصال بالخادم، حاول مجددًا."};
}

function showRetryableError(message) {
    stopJobPolling();
    stopUploadStatusPolling();
    setBusy(false);
    clearScanState();
    const file = document.getElementById("fileInput").files[0] || lastSubmittedFile;
    if (file) {
        setLabelState("valid", file.name, "جاهز للمحاولة مجددًا");
        view("hero");
        const box = document.getElementById("fileValMsg");
        box.style.display = "flex";
        box.classList.add("invalid");
        document.getElementById("fileValText").textContent = message;
    } else {
        document.getElementById("errMsg").textContent = message;
        document.getElementById("btnSubscribeErr").style.display = "none";
        view("err");
    }
}

async function checkJobStatus(jobId, generation) {
    if (generation !== jobPollGeneration) return;
    try {
        const res = await fetch(`${CONFIG.API}/job_status/${encodeURIComponent(jobId)}`, {
            credentials: "include", headers: authHeaders(),
            cache: "no-store", signal: AbortSignal.timeout(15000)
        });
        const data = await readApiResponse(res);
        if (generation !== jobPollGeneration) return;
        if ([429, 502, 503, 504].includes(res.status)) throw new Error("Temporary status error");
        jobPollFailures = 0;
        if (res.ok && data.status === "processing") {
            const text = document.querySelector("#vLoad p");
            text.textContent = data.phase === "queued"
                ? `طلبك في قائمة الانتظار${data.queue_position ? "، ترتيبك: " + data.queue_position : ""}. ستبدأ المقارنة تلقائيًا.`
                : "جاري معالجة صوتك ومقارنته بأصوات القرّاء...";
            jobPollTimer = setTimeout(() => checkJobStatus(jobId, generation), JOB_POLL_INTERVAL_MS);
            return;
        }
        stopJobPolling();
        handleUploadResult(data);
    } catch (error) {
        if (generation !== jobPollGeneration) return;
        jobPollFailures += 1;
        if (jobPollFailures >= 6) {
            showRetryableError("تعذر متابعة النتيجة. أعد المحاولة بالملف نفسه؛ لن تُخصم مقارنة إضافية إذا كانت نتيجته محفوظة.");
            return;
        }
        jobPollTimer = setTimeout(() => checkJobStatus(jobId, generation), 5000);
    }
}

function retryComparison() {
    const file = document.getElementById("fileInput").files[0] || lastSubmittedFile;
    if (file) runAnalysis(file);
    else resetToUpload();
}

let ctrl = null, busy = false;

const SW_DB_NAME = "liketwin-sw";

const SW_DB_STORE = "uploads";

function swOpenDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(SW_DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(SW_DB_STORE)) {
                req.result.createObjectStore(SW_DB_STORE, {
                    keyPath: "id"
                });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function swGetUploadState(id) {
    const db = await swOpenDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(SW_DB_STORE, "readonly");
        const req = tx.objectStore(SW_DB_STORE).get(id);
        req.onsuccess = () => { const result = req.result || null; db.close(); resolve(result); };
        req.onerror = () => reject(req.error);
    });
}

async function swDeleteUploadState(id) {
    const db = await swOpenDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(SW_DB_STORE, "readwrite");
        tx.objectStore(SW_DB_STORE).delete(id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
    }).catch(() => {});
}

let swReadyPromise = "serviceWorker" in navigator ? navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).catch(err => {
    console.warn("[SW] تعذر تسجيل Service Worker، سيُستخدم الرفع المباشر كحل بديل:", err);
    return null;
}) : Promise.resolve(null);

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function(event) {
        const msg = event.data;
        if (!msg || !msg.uploadId) return;
        const st = loadScanState();
        if (!st || st.v !== "uploading" || st.uploadId !== msg.uploadId) return;
        if (msg.type === "upload-complete") {
            stopUploadStatusPolling();
            swDeleteUploadState(msg.uploadId);
            handleUploadResult(msg.data);
        } else if (msg.type === "upload-error") {
            stopUploadStatusPolling();
            swDeleteUploadState(msg.uploadId);
            handleUploadFailure(msg.error);
        }
    });
}

const UPLOAD_POLL_INTERVAL_MS = 1e3;

let uploadPollTimer = null;

function stopUploadStatusPolling() {
    if (uploadPollTimer) {
        clearInterval(uploadPollTimer);
        uploadPollTimer = null;
    }
}

function startUploadStatusPolling(uploadId) {
    stopUploadStatusPolling();
    checkUploadStatus(uploadId);
    uploadPollTimer = setInterval(() => checkUploadStatus(uploadId), UPLOAD_POLL_INTERVAL_MS);
}

async function checkUploadStatus(uploadId) {
    let rec;
    try {
        rec = await swGetUploadState(uploadId);
    } catch (e) {
        return;
    }
    const current = loadScanState();
    if (!current || current.v !== "uploading" || current.uploadId !== uploadId) return;
    if (!rec || rec.status === "uploading") {
        if (Date.now() - current.ts > 120000) {
            showRetryableError("تعذر تأكيد الرفع، أعد المحاولة بالملف نفسه.");
        }
        return;
    }
    stopUploadStatusPolling();
    await swDeleteUploadState(uploadId);
    if (rec.status === "done") {
        handleUploadResult(rec.data);
    } else if (rec.status === "error") {
        handleUploadFailure(rec.error);
    }
}

function handleUploadResult(data) {
    if (!data || typeof data !== "object") {
        handleUploadFailure();
        return;
    }
    setBusy(false);
    if (data.status === "processing" && data.job_id) {
        persistLoadingState(data.job_id);
        startJobPolling(data.job_id);
        return;
    }
    if (data.status !== "success") {
        const msg = data.message || "حدث خطأ غير متوقع";
        if (msg === BUSY_MESSAGE || /الخادم مشغول|طلبات كثيرة|هناك رفع جار/.test(msg)) {
            showRetryableError(msg);
            return;
        }
        const subMsgs = [ "يجب الاشتراك", "لا توجد خطة نشطة", "انتهت المحاولات" ];
        const showSub = subMsgs.includes(msg);
        document.getElementById("errMsg").textContent = msg;
        document.getElementById("btnSubscribeErr").style.display = showSub ? "inline-block" : "none";
        view("err");
        saveScanState({
            v: "err",
            ts: Date.now(),
            errMsg: msg,
            showSub: showSub
        });
        if (showSub) updateSubscribeButton({
            plan: null,
            remaining: 0
        });
        return;
    }
    const readers = data.top_readers || [];
    window.lastReaders = readers;
    document.getElementById("readersBody").innerHTML = readers.map(readerCard).join("");
    document.getElementById("readersCount").textContent = readers.length + " قارئ";
    document.getElementById("shareBody").innerHTML = buildSharePanel(readers);
    document.getElementById("accordionList").innerHTML = buildAccordionList(readers);
    document.getElementById("accordionCount").textContent = readers.length + " قارئ";
    showHeadShareButtons();
    view("res");
    saveScanState({
        v: "res",
        ts: Date.now(),
        readers: readers
    });
    warmUpResultAudios();
    if (typeof data.remaining === "number") {
        const currentPlanGuess = {
            plan: window.lastKnownPlan,
            remaining: data.remaining
        };
        updateSubscribeButton(currentPlanGuess);
    }
}

function handleUploadFailure() {
    showRetryableError("فشل الاتصال بالخادم، حاول مجددًا بالملف نفسه.");
}

document.getElementById("btnStop").onclick = () => {
    const st = loadScanState();
    if (st && st.v === "uploading" && st.uploadId && navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: "cancel-upload",
            uploadId: st.uploadId
        });
        swDeleteUploadState(st.uploadId);
    }
    if (st && st.jobId) {
        fetch(`${CONFIG.API}/cancel_comparison/${encodeURIComponent(st.jobId)}`, {
            method: "POST", credentials: "include", headers: authHeaders()
        }).catch(() => {});
    }
    if (ctrl) ctrl.abort();
    lastSubmittedFile = null;
    stopJobPolling();
    stopUploadStatusPolling();
    setBusy(false);
    document.getElementById("fileInput").value = "";
    setLabelState("idle", window.idleLabel);
    view("hero");
    clearScanState();
};

document.getElementById("btnCancelComparison").onclick = () => document.getElementById("btnStop").click();

function view(v) {
    document.getElementById("vHero").classList.toggle("off", v !== "hero");
    document.getElementById("vLoad").classList.toggle("on", v === "load");
    document.getElementById("vErr").classList.toggle("on", v === "err");
    document.getElementById("vRes").classList.toggle("on", v === "res");
    const fab = document.getElementById("fabNewScan");
    if (fab) fab.classList.toggle("show", v === "res" || v === "err");
}

function setBusy(on) {
    busy = on;
    const goBtn = document.getElementById("btnGo");
    const fileInput = document.getElementById("fileInput");
    fileInput.disabled = on;
    goBtn.disabled = on || !(fileInput.files[0] || lastSubmittedFile);
    goBtn.style.pointerEvents = on ? "none" : "";
    document.getElementById("btnStop").style.display = on ? "inline-block" : "none";
}

function aurl(u) {
    return u && u.startsWith("http") ? u : location.origin + u;
}

const SCAN_STATE_KEY = "lt_scan";

const SCAN_MAX_AGE_MS = 60 * 60 * 1e3;

function saveScanState(obj) {
    try {
        sessionStorage.setItem(SCAN_STATE_KEY, JSON.stringify(obj));
    } catch (e) {}
}

function loadScanState() {
    try {
        const raw = sessionStorage.getItem(SCAN_STATE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function clearScanState() {
    try {
        sessionStorage.removeItem(SCAN_STATE_KEY);
    } catch (e) {}
}

function persistLoadingState(jobId) {
    saveScanState({
        v: "load",
        ts: Date.now(),
        jobId: jobId
    });
}

function restoreScanState() {
    const st = loadScanState();
    if (!st) return;
    if (!st.ts || Date.now() - st.ts > SCAN_MAX_AGE_MS) {
        clearScanState();
        return;
    }
    if (st.v === "res" && Array.isArray(st.readers)) {
        window.lastReaders = st.readers;
        document.getElementById("readersBody").innerHTML = st.readers.map(readerCard).join("");
        document.getElementById("readersCount").textContent = st.readers.length + " قارئ";
        document.getElementById("shareBody").innerHTML = buildSharePanel(st.readers);
        document.getElementById("accordionList").innerHTML = buildAccordionList(st.readers);
        document.getElementById("accordionCount").textContent = st.readers.length + " قارئ";
        showHeadShareButtons();
        view("res");
        warmUpResultAudios();
        return;
    }
    if (st.v === "err") {
        document.getElementById("errMsg").textContent = st.errMsg || "حدث خطأ.";
        document.getElementById("btnSubscribeErr").style.display = st.showSub ? "inline-block" : "none";
        view("err");
        return;
    }
    if (st.v === "uploading" && st.uploadId) {
        setBusy(true);
        view("load");
        startUploadStatusPolling(st.uploadId);
        return;
    }
    if (st.v === "load") {
        if (st.jobId) {
            setBusy(true);
            view("load");
            startJobPolling(st.jobId);
        } else {
            clearScanState();
            document.getElementById("errMsg").textContent = "انتهت الجلسة أثناء التحليل، الرجاء رفع الملف والمحاولة مجدداً.";
            document.getElementById("btnSubscribeErr").style.display = "none";
            view("err");
        }
    }
}

function resetToUpload() {
    lastSubmittedFile = null;
    if (ctrl) {
        try {
            ctrl.abort();
        } catch (e) {}
    }
    stopJobPolling();
    stopUploadStatusPolling();
    setBusy(false);
    const fileInput = document.getElementById("fileInput");
    fileInput.value = "";
    setLabelState("idle", window.idleLabel);
    window.lastReaders = [];
    document.getElementById("readersBody").innerHTML = "";
    document.getElementById("shareBody").innerHTML = "";
    document.getElementById("readersCount").textContent = "";
    document.getElementById("accordionList").innerHTML = "";
    document.getElementById("accordionCount").textContent = "";
    document.getElementById("headCopyBtns").classList.remove("visible");
    document.getElementById("headCopyBtnsMobile").classList.remove("visible");
    closeShareModal();
    if (audioWarmObserver) {
        try {
            audioWarmObserver.disconnect();
        } catch (e) {}
        audioWarmObserver = null;
    }
    clearScanState();
    view("hero");
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function buildCopyText(readers) {
    const medals = [ "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟" ];
    const lines = readers.slice(0, 10).map((r, i) => `${medals[i]} ${r.name} — ${r.percent.toFixed(1)}%`);
    return `أقرب أصوات قرّاء يشبهون صوتي\n\n${lines.join("\n")}`;
}

function buildShareText(readers) {
    const top = readers[0];
    const others = readers.slice(1, 4).map(r => `▪ ${r.name} — ${r.percent.toFixed(1)}%`).join("\n");
    return `🎧 طلع أقرب قارئ يشبه صوتي هو ${top.name} بنسبة ${top.percent.toFixed(1)}% 😳\n\nوهذه باقي النتائج 👇\n\n${others}\n\nالموقع يحلل صوتك ويقارنه مع أكثر من 500 قارئ 🔥\n\nاكتشف القارئ الأقرب لك:\nhttps://liketwin.com`;
}

function buildSharePanel(readers) {
    const cards = readers.slice(0, 10).map((r, i) => `\n    <div class="share-reader-card">\n      <div class="share-rank">${i + 1}</div>\n      <div class="share-reader-info">\n        <div class="share-reader-name">${esc(r.name)}</div>\n        <div class="share-reader-sub"> تشابه في ${parseInt(r.matches) || 0} مقطع</div>\n      </div>\n      <div class="share-pct">${parseFloat(r.percent).toFixed(1)}%</div>\n    </div>\n  `).join("");
    return `<div class="share-panel">${cards}</div>`;
}

function showHeadShareButtons() {
    document.getElementById("headCopyBtns").classList.add("visible");
    const mobileBtns = document.getElementById("headCopyBtnsMobile");
    if (mobileBtns) mobileBtns.classList.add("visible");
}

function copyResult() {
    const text = buildCopyText(window.lastReaders || []);
    navigator.clipboard.writeText(text).then(() => {
        document.querySelectorAll(".head-btn.copy").forEach(btn => {
            btn.classList.add("copied");
            btn.innerHTML = "<span>✅</span><span>تم!</span>";
            setTimeout(() => {
                btn.classList.remove("copied");
                btn.innerHTML = '<span><i class="fa-regular fa-copy"></i></span><span>نسخ النتائج</span>';
            }, 2e3);
        });
    });
}

function openShareModal() {
    const readers = window.lastReaders || [];
    if (!readers.length) return;
    const text = buildShareText(readers);
    document.getElementById("modalShareText").textContent = text;
    const cpBtn = document.getElementById("modalCopyBtn");
    cpBtn.classList.remove("done");
    cpBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>نسخ النص`;
    document.getElementById("shareModal").classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeShareModal() {
    document.getElementById("shareModal").classList.remove("open");
    document.body.style.overflow = "";
}

function handleOverlayClick(e) {
    if (e.target === document.getElementById("shareModal")) closeShareModal();
}

document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeShareModal();
});

function copyModalText() {
    const text = document.getElementById("modalShareText").textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById("modalCopyBtn");
        btn.classList.add("done");
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>تم النسخ!`;
        setTimeout(() => {
            btn.classList.remove("done");
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>نسخ النص`;
        }, 2500);
    });
}

async function shareTo(platform) {
    const ALLOWED_PLATFORMS = [ "whatsapp", "facebook", "telegram", "twitter", "instagram", "tiktok" ];
    if (!ALLOWED_PLATFORMS.includes(platform)) return;
    const text = document.getElementById("modalShareText").textContent;
    const url = "https://liketwin.com";
    const enc = encodeURIComponent(text);
    await navigator.clipboard.writeText(text).catch(() => {});
    const links = {
        whatsapp: `https://wa.me/?text=${enc}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${enc}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${enc}`,
        twitter: `https://x.com/intent/tweet?text=${enc}`,
        instagram: null,
        tiktok: null
    };
    if (links[platform]) {
        window.open(links[platform], "_blank", "noopener,noreferrer,width=600,height=520");
    } else {
        showCopiedHint(platform);
    }
}

function showCopiedHint(platform) {
    const names = {
        instagram: "إنستغرام",
        tiktok: "تيك توك"
    };
    const footer = document.querySelector(".modal-footer");
    const original = footer.textContent;
    const platformLabel = names[platform] || "";
    footer.style.color = "#48bb78";
    footer.textContent = platformLabel ? `✅ تم نسخ النص — افتح ${platformLabel} والصقه` : "✅ تم نسخ النص";
    setTimeout(() => {
        footer.style.color = "";
        footer.textContent = original;
    }, 3e3);
}

function esc(str) {
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
}

function safeAudioUrl(u) {
    if (!u || typeof u !== "string") return "";
    if (u.includes("..")) return "";
    if (!/^\/audio\/[\w-]+\.(wav|mp3|m4a|mp4|aac|ogg|webm)$/i.test(u)) return "";
    return u;
}

function safeDownloadUrl(u) {
    if (!u || typeof u !== "string") return "";
    if (u.includes("..")) return "";
    if (!/^\/audio_download\/[\w-]+$/i.test(u)) return "";
    return u;
}

let audioWarmObserver = null;

function warmUpAudioEl(a) {
    if (!a || a.dataset.warmed === "1") return;
    const anyPlaying = document.querySelector("audio:not([paused])");
    if (anyPlaying && anyPlaying !== a) return;
    try {
        a.preload = "auto";
        a.load();
        a.dataset.warmed = "1";
    } catch (e) {}
}

function warmUpResultAudios() {
    requestAnimationFrame(() => {
        const audios = document.querySelectorAll("#readersBody audio, #accordionList audio");
        if (!audios.length) return;
        const readersAudios = document.querySelectorAll("#readersBody audio");
        const accordionAudios = document.querySelectorAll("#accordionList audio");
        readersAudios.forEach((a, i) => {
            if (i < 2) warmUpAudioEl(a);
        });
        accordionAudios.forEach((a, i) => {
            if (i < 2) warmUpAudioEl(a);
        });
        if (audioWarmObserver) audioWarmObserver.disconnect();
        if ("IntersectionObserver" in window) {
            audioWarmObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) warmUpAudioEl(entry.target);
                });
            }, {
                root: null,
                rootMargin: "150px",
                threshold: .1
            });
            audios.forEach(a => audioWarmObserver.observe(a));
        }
        audios.forEach(a => {
            a.addEventListener("pointerenter", () => warmUpAudioEl(a), {
                once: true
            });
        });
    });
}

function buildClipsHtml(item) {
    return (item.clips || []).map((c, i) => {
        const _cPct = parseFloat(c.percent);
        const clipPct = (isNaN(_cPct) ? 0 : Math.min(100, Math.max(0, _cPct))).toFixed(1);
        const relPath = safeAudioUrl(c.audio_url);
        const audioSrc = relPath ? `${CONFIG.API}${relPath}` : "";
        const dlPath = safeDownloadUrl(c.download_url);
        const dlSrc = dlPath ? `${CONFIG.API}${dlPath}` : "";
        return `\n    <div class="clip-box">\n      <div class="clip-label">\n        <span>مقطع ${i + 1}</span>\n        <span class="clip-label-right">\n          <span class="clip-pct">${clipPct}%</span>\n          ${dlSrc ? `<a class="clip-download-btn" href="${dlSrc.replace(/"/g, "")}" download title="تحميل المقطع"><i class="fa-solid fa-download"></i></a>` : ""}\n        </span>\n      </div>\n      ${audioSrc ? `\n      <div class="custom-player">\n        <button type="button" class="cp-play" aria-label="تشغيل"><i class="fa-solid fa-play"></i></button>\n        <div class="cp-track"><div class="cp-progress"></div><div class="cp-handle"></div></div>\n        <span class="cp-time">0:00</span>\n      </div>\n      <audio preload="none" style="display:none"><source src="${audioSrc.replace(/"/g, "")}" type="audio/wav"></audio>` : ""}\n    </div>`;
    }).join("");
}

function readerCard(item) {
    const name = esc(item.name);
    const _pct = parseFloat(item.percent);
    const percent = (isNaN(_pct) ? 0 : Math.min(100, Math.max(0, _pct))).toFixed(1);
    const matches = parseInt(item.matches) || 0;
    const clips = buildClipsHtml(item);
    return `\n    <div class="card">\n      <div class="card-top">\n        <span class="card-name">${name}</span>\n        <span class="badge g">${percent}%</span>\n      </div>\n      <div class="card-meta">ظهر في ${matches} مقطع</div>\n      <div class="bar"><div class="bar-fill g" style="width:${percent}%"></div></div>\n      <div class="reader-clips">${clips}</div>\n    </div>`;
}

function buildAccordionList(readers) {
    return (readers || []).map((item, i) => accordionCard(item, i)).join("");
}

function accordionCard(item, idx) {
    const name = esc(item.name);
    const _pct = parseFloat(item.percent);
    const percent = (isNaN(_pct) ? 0 : Math.min(100, Math.max(0, _pct))).toFixed(1);
    const matches = parseInt(item.matches) || 0;
    const clips = buildClipsHtml(item);
    return `\n    <div class="acc-card" id="accCard${idx}">\n      <button type="button" class="acc-header" data-lt-click="17" aria-expanded="false">\n        <span class="acc-rank">${idx + 1}</span>\n        <span class="acc-name">${name}</span>\n        <span class="acc-pct">${percent}%</span>\n        <span class="acc-chevron"><i class="fa-solid fa-chevron-down"></i></span>\n      </button>\n      <div class="acc-body">\n        <div class="acc-body-inner">\n          <div class="card-meta">ظهر في ${matches} مقطع</div>\n          <div class="bar"><div class="bar-fill g" style="width:${percent}%"></div></div>\n          <div class="reader-clips">${clips}</div>\n        </div>\n      </div>\n    </div>`;
}

function toggleAccordion(btn) {
    const card = btn.closest(".acc-card");
    if (!card) return;
    const body = card.querySelector(".acc-body");
    const isOpen = card.classList.contains("open");
    document.querySelectorAll(".acc-card.open").forEach(other => {
        if (other === card) return;
        other.classList.remove("open");
        const otherBtn = other.querySelector(".acc-header");
        if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
        const otherBody = other.querySelector(".acc-body");
        if (otherBody) otherBody.style.maxHeight = null;
        other.querySelectorAll("audio").forEach(a => {
            if (!a.paused) a.pause();
        });
    });
    if (isOpen) {
        card.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
        body.style.maxHeight = null;
    } else {
        card.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
        body.style.maxHeight = body.scrollHeight + "px";
    }
}

window.addEventListener("resize", function() {
    document.querySelectorAll(".acc-card.open").forEach(card => {
        const body = card.querySelector(".acc-body");
        if (body) body.style.maxHeight = body.scrollHeight + "px";
    });
});

function formatClipTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
}

document.addEventListener("click", function(e) {
    const playBtn = e.target.closest(".cp-play");
    if (playBtn) {
        const box = playBtn.closest(".clip-box");
        const audio = box && box.querySelector("audio");
        if (!audio) return;
        if (audio.paused) audio.play(); else audio.pause();
    }
});

let scrubTrack = null;

let scrubAudio = null;

let scrubWasPlaying = false;

function seekTrackTo(track, audio, clientX) {
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    const box = track.closest(".clip-box");
    const progress = track.querySelector(".cp-progress");
    const handle = track.querySelector(".cp-handle");
    const timeEl = box && box.querySelector(".cp-time");
    const pct = ratio * 100;
    if (progress) progress.style.width = pct + "%";
    if (handle) handle.style.left = pct + "%";
    if (timeEl) {
        timeEl.textContent = formatClipTime(audio.currentTime) + " / " + formatClipTime(audio.duration);
    }
}

document.addEventListener("pointerdown", function(e) {
    const track = e.target.closest(".cp-track");
    if (!track) return;
    const box = track.closest(".clip-box");
    const audio = box && box.querySelector("audio");
    if (!audio) return;
    scrubTrack = track;
    scrubAudio = audio;
    scrubWasPlaying = !audio.paused;
    if (scrubWasPlaying) audio.pause();
    track.classList.add("scrubbing");
    try {
        track.setPointerCapture(e.pointerId);
    } catch (err) {}
    seekTrackTo(track, audio, e.clientX);
    e.preventDefault();
});

document.addEventListener("pointermove", function(e) {
    if (!scrubTrack || !scrubAudio) return;
    seekTrackTo(scrubTrack, scrubAudio, e.clientX);
});

function finishScrub(e) {
    if (!scrubTrack) return;
    try {
        scrubTrack.releasePointerCapture(e.pointerId);
    } catch (err) {}
    scrubTrack.classList.remove("scrubbing");
    if (scrubWasPlaying && scrubAudio) {
        scrubAudio.play().catch(() => {});
    }
    scrubTrack = null;
    scrubAudio = null;
    scrubWasPlaying = false;
}

document.addEventListener("pointerup", finishScrub);

document.addEventListener("pointercancel", finishScrub);

document.addEventListener("play", function(e) {
    if (e.target.tagName !== "AUDIO") return;
    document.querySelectorAll("audio").forEach(function(a) {
        if (a !== e.target && !a.paused) a.pause();
    });
    const box = e.target.closest(".clip-box");
    const btn = box && box.querySelector(".cp-play");
    if (btn) btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    const track = box && box.querySelector(".cp-track");
    if (track) track.classList.add("is-playing");
}, true);

document.addEventListener("pause", function(e) {
    if (e.target.tagName !== "AUDIO") return;
    const box = e.target.closest(".clip-box");
    const btn = box && box.querySelector(".cp-play");
    if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i>';
}, true);

document.addEventListener("timeupdate", function(e) {
    if (e.target.tagName !== "AUDIO") return;
    const box = e.target.closest(".clip-box");
    if (!box) return;
    const audio = e.target;
    const track = box.querySelector(".cp-track");
    if (track && track === scrubTrack) return;
    const progress = box.querySelector(".cp-progress");
    const handle = box.querySelector(".cp-handle");
    const timeEl = box.querySelector(".cp-time");
    if (isFinite(audio.duration) && audio.duration > 0) {
        const pct = audio.currentTime / audio.duration * 100;
        if (progress) progress.style.width = pct + "%";
        if (handle) handle.style.left = pct + "%";
    }
    if (timeEl) {
        timeEl.textContent = formatClipTime(audio.currentTime) + (isFinite(audio.duration) ? " / " + formatClipTime(audio.duration) : "");
    }
    const accCard = box.closest(".acc-card.open");
    if (accCard) {
        const accBody = accCard.querySelector(".acc-body");
        if (accBody) accBody.style.maxHeight = accBody.scrollHeight + "px";
    }
}, true);

document.addEventListener("loadedmetadata", function(e) {
    if (e.target.tagName !== "AUDIO") return;
    const box = e.target.closest(".clip-box");
    const timeEl = box && box.querySelector(".cp-time");
    if (timeEl) timeEl.textContent = "0:00 / " + formatClipTime(e.target.duration);
}, true);

document.addEventListener("ended", function(e) {
    if (e.target.tagName !== "AUDIO") return;
    const box = e.target.closest(".clip-box");
    if (!box) return;
    const btn = box.querySelector(".cp-play");
    if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    const progress = box.querySelector(".cp-progress");
    const handle = box.querySelector(".cp-handle");
    if (progress) progress.style.width = "0%";
    if (handle) handle.style.left = "0%";
    const track = box.querySelector(".cp-track");
    if (track) track.classList.remove("is-playing");
}, true);

async function runAnalysis(file) {
    if (!file || busy) return;
    lastSubmittedFile = file;
    document.querySelector("#vLoad p").textContent = "جاري رفع الصوت وإرسال المقارنة...";
    setBusy(true);
    view("load");
    const uploadId = window.crypto && crypto.randomUUID ? crypto.randomUUID() : "u_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    saveScanState({
        v: "uploading",
        ts: Date.now(),
        uploadId: uploadId
    });
    const swReady = await Promise.race([
        swReadyPromise, new Promise(resolve => setTimeout(() => resolve(null), 3000))
    ]);
    if (!busy) return;
    if (swReady && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: "start-upload",
            uploadId: uploadId,
            apiBase: CONFIG.API,
            file: file
        });
        startUploadStatusPolling(uploadId);
        return;
    }
    clearScanState();
    await runAnalysisDirect(file);
}

async function runAnalysisDirect(file) {
    const uploadController = new AbortController;
    ctrl = uploadController;
    const fd = new FormData;
    fd.append("file", file);
    try {
        const res = await fetch(`${CONFIG.API}/compare_audio`, {
            method: "POST",
            body: fd,
            signal: uploadController.signal,
            credentials: "include",
            headers: authHeaders()
        });
        const data = await readApiResponse(res);
        if (ctrl === uploadController && !uploadController.signal.aborted) handleUploadResult(data);
    } catch (e) {
        if (ctrl !== uploadController) return;
        if (e.name !== "AbortError") {
            handleUploadFailure(e);
        } else {
            setBusy(false);
            clearScanState();
        }
    } finally {
        if (ctrl === uploadController) ctrl = null;
    }
}

document.getElementById("btnGo").onclick = () => {
    const file = document.getElementById("fileInput").files[0] || lastSubmittedFile;
    runAnalysis(file);
};

(function trackPlan() {
    const originalUpdate = updateSubscribeButton;
    window.updateSubscribeButton = function(user) {
        if (user && user.plan !== undefined) window.lastKnownPlan = user.plan;
        originalUpdate(user);
    };
})();

checkUserStatus();

restoreScanState();
