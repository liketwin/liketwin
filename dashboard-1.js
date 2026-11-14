const PLAN_DISPLAY = {
    free: {label: "المجاني", price: 0, comparisons: 5, cls: "starter"},
    starter: {
        label: "المبتدئ",
        price: 5,
        comparisons: 50,
        cls: "starter"
    },
    pro: {
        label: "الاحترافي",
        price: 12,
        comparisons: 150,
        cls: "pro"
    },
    advanced: {
        label: "المتقدم",
        price: 40,
        comparisons: 600,
        cls: "advanced"
    }
};

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

let _currentUser = null;

async function loadCurrentUser() {
    try {
        const res = await fetch(`${CONFIG.API}/get_user_info`, {
            credentials: "include"
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "ok" && data.user) {
            _currentUser = data.user;
        }
    } catch {
        _currentUser = null;
    }
}

function getUserId() {
    return _currentUser ? _currentUser.user_id : null;
}

function getUserEmail() {
    return _currentUser ? _currentUser.email : null;
}

function getUserName() {
    return _currentUser ? _currentUser.name || null : null;
}

function getDisplayLabel() {
    const email = getUserEmail();
    if (email) return email;
    const name = getUserName();
    return name ? name : "مستخدم Telegram";
}

function showToast(msg, isError = false) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.toggle("error", isError);
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3e3);
}

function show(id) {
    const el = document.getElementById(id);
    el.style.display = "flex";
    if (el.classList.contains("dashboard") || el.classList.contains("not-auth-screen") || el.classList.contains("loading-screen")) el.classList.add("visible");
}

function hide(id) {
    const el = document.getElementById(id);
    el.style.display = "none";
    el.classList.remove("visible");
}

async function fetchUserInfo() {
    const res = await fetch(`${CONFIG.API}/get_user_info`, {
        credentials: "include"
    });
    if (!res.ok) throw new Error("فشل جلب البيانات");
    return await res.json();
}

function renderDashboard(userData) {
    hide("loadingScreen");
    show("dashboard");
    const email = getUserEmail();
    const name = getUserName();
    const displayName = name ? name.split(" ")[0] : getDisplayLabel();
    const titleEl = document.getElementById("welcomeTitle");
    titleEl.textContent = "";
    const greetSpan = document.createTextNode("مرحباً، " + displayName + " ");
    const smileIcon = document.createElement("i");
    smileIcon.className = "fa-solid fa-face-smile";
    titleEl.appendChild(greetSpan);
    titleEl.appendChild(smileIcon);
    const emailSubRow = document.getElementById("emailSubRow");
    const planEmailRow = document.getElementById("planEmailRow");
    if (email) {
        emailSubRow.style.display = "";
        document.getElementById("emailDisplay").textContent = email;
        planEmailRow.style.display = "";
        document.getElementById("planEmail").textContent = email;
    } else {
        emailSubRow.style.display = "none";
        planEmailRow.style.display = "none";
    }
    const plan = userData?.plan;
    const remaining = userData?.remaining ?? 0;
    if (!plan || remaining === undefined || remaining === null) {
        document.getElementById("noPlanCard").style.display = "flex";
        document.getElementById("activePlanSection").style.display = "none";
        document.getElementById("statusPill").innerHTML = `<div class="status-pill inactive"><span class="pill-dot"></span>لا توجد خطة</div>`;
        return;
    }
    const SAFE_PLANS = Object.keys(PLAN_DISPLAY);
    const planMeta = PLAN_DISPLAY[plan] || {
        label: SAFE_PLANS.includes(plan) ? plan : "غير معروف",
        comparisons: 0,
        cls: "starter"
    };
    const total = userData?.total && userData.total > 0 ? userData.total : planMeta.comparisons;
    const used = Math.max(0, total - remaining);
    const usedPct = total > 0 ? Math.round(used / total * 100) : 0;
    let pillHtml = "";
    if (remaining <= 0) {
        pillHtml = `<div class="status-pill inactive"><span class="pill-dot"></span>نفدت المحاولات</div>`;
    } else if (remaining <= Math.ceil(total * .2)) {
        pillHtml = `<div class="status-pill low"><span class="pill-dot"></span>محاولات قليلة</div>`;
    } else {
        pillHtml = `<div class="status-pill active"><span class="pill-dot"></span>نشط</div>`;
    }
    document.getElementById("statusPill").innerHTML = pillHtml;
    const alertEl = document.getElementById("alertBanner");
    alertEl.textContent = "";
    if (remaining <= 0) {
        alertEl.style.display = "flex";
        alertEl.className = "alert-banner no-credits";
        const icon = document.createElement("span");
        icon.textContent = "⚠️";
        const txt = document.createTextNode(" نفدت جميع محاولاتك. ");
        const link = document.createElement("a");
        link.href = "/pricing";
        link.textContent = "جدّد اشتراكك";
        const end = document.createTextNode(" للاستمرار.");
        alertEl.append(icon, txt, link, end);
    } else if (remaining <= Math.ceil(total * .2)) {
        alertEl.style.display = "flex";
        alertEl.className = "alert-banner low-credits";
        const safeRemaining = parseInt(remaining) || 0;
        const icon = document.createElement("span");
        icon.textContent = "🔔";
        const pre = document.createTextNode(" تبقّى لك ");
        const strong = document.createElement("strong");
        strong.textContent = safeRemaining;
        const mid = document.createTextNode(" محاولة فقط. ");
        const link = document.createElement("a");
        link.href = "/pricing";
        link.textContent = "فكّر في ترقية خطتك";
        const dot = document.createTextNode(".");
        alertEl.append(icon, pre, strong, mid, link, dot);
    } else {
        alertEl.style.display = "none";
    }
    document.getElementById("statRemaining").textContent = remaining;
    document.getElementById("statUsed").textContent = used;
    document.getElementById("statTotal").textContent = total;
    document.getElementById("progressUsed").textContent = used;
    document.getElementById("progressTotal").textContent = total;
    setTimeout(() => {
        const bar = document.getElementById("progressBar");
        bar.style.width = usedPct + "%";
        if (usedPct >= 100) bar.classList.add("full-fill"); else if (usedPct >= 80) bar.classList.add("warn-fill");
    }, 150);
    const planBadge = document.getElementById("planName");
    const badgeSpan = document.createElement("span");
    badgeSpan.className = "plan-badge " + (planMeta.cls || "starter");
    badgeSpan.textContent = planMeta.label || "";
    planBadge.replaceChildren(badgeSpan);
    document.getElementById("planStatus").innerHTML = remaining > 0 ? `<span style="color:var(--success);font-weight:700;">✓ نشط</span>` : `<span style="color:var(--error);font-weight:700;">✗ منتهٍ</span>`;
    document.getElementById("planTotal").textContent = total + " مقارنة";
    document.getElementById("planUsed").textContent = used + " مقارنة";
    document.getElementById("planRemaining").textContent = remaining + " مقارنة";
    document.getElementById("activePlanSection").style.display = "flex";
    document.getElementById("noPlanCard").style.display = "none";
}

async function initDashboard() {
    await loadCurrentUser();
    const userId = getUserId();
    if (!userId) {
        hide("loadingScreen");
        show("notAuthScreen");
        return;
    }
    try {
        renderDashboard(_currentUser);
    } catch (err) {
        renderDashboard(null);
    }
}

async function handleLogout() {
    const response = await fetch(`${CONFIG.API}/auth/logout`, {
        method: "POST",
        credentials: "include"
    });
    if (!response.ok) { alert("تعذر تسجيل الخروج، حاول مجددًا"); return; }
    for (const key of ['lt_auth', 'lt_sub', 'lt_upload']) localStorage.removeItem(key);
    for (const key of ['lt_bearer', 'lt_scan']) sessionStorage.removeItem(key);
    indexedDB.deleteDatabase('liketwin-sw');
    window.location.href = "/";
}

initDashboard();
