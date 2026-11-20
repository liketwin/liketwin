const PHONE = "2120603074384";

const PLAN_DISPLAY = {
    starter: {
        label: "المبتدئ",
        price: 5,
        comparisons: 50
    },
    pro: {
        label: "الاحترافي",
        price: 12,
        comparisons: 150
    },
    advanced: {
        label: "المتقدم",
        price: 40,
        comparisons: 600
    },
    free: {
        label: "المجاني",
        price: 0,
        comparisons: 5
    }
};

const RATE_LIMIT_MESSAGE = "وصلنا طلبك! تواصل معنا الآن لتأكيد الدفع وإتمام الطلب";

let selectedPlanKey = "starter";

let currentOrderId = null;

let payMode = "paid";

let freeActivated = false;

document.getElementById("btnGoogleLoginNotAuth").href = `${CONFIG.API}/auth/google`;

document.getElementById("btnGithubLoginNotAuth").href = `${CONFIG.API}/auth/github`;

document.getElementById("btnGoogleLoginFree").href = `${CONFIG.API}/auth/google`;

document.getElementById("btnGithubLoginFree").href = `${CONFIG.API}/auth/github`;

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

function bindTelegramLoginButton(id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", function() {
        if (window.Telegram && window.Telegram.Login) {
            window.Telegram.Login.auth({
                bot_id: TELEGRAM_BOT_ID,
                request_access: "write"
            }, handleTelegramAuth);
        } else {
            console.warn("سكربت Telegram Login لم يكتمل تحميله بعد، حاول مجدداً بعد لحظة");
        }
    });
}

bindTelegramLoginButton("btnTelegramLoginNotAuth");

bindTelegramLoginButton("btnTelegramLoginFree");

let _currentUser = null;

async function loadCurrentUser() {
    try {
        const res = await fetch(`${CONFIG.API}/get_user_info`, {
            credentials: "include"
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "ok" && data.user) {
            _currentUser = {
                user_id: data.user.user_id,
                email: data.user.email,
                name: data.user.name || ""
            };
        }
    } catch {
        _currentUser = null;
    }
}

function getUserEmail() {
    return _currentUser ? _currentUser.email : null;
}

function getUserId() {
    return _currentUser ? _currentUser.user_id : null;
}

function getUserName() {
    return _currentUser ? _currentUser.name : null;
}

function getDisplayLabel() {
    const email = getUserEmail();
    if (email) return email;
    const name = getUserName();
    return name ? name : "مستخدم Telegram";
}

function getToken() {
    return null;
}

function scrollToPaySection() {
    setTimeout(() => {
        const el = document.getElementById("paySection");
        el.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
        setTimeout(() => window.scrollBy({
            top: 120,
            behavior: "smooth"
        }), 400);
    }, 80);
}

function setFreeBtnActivated() {
    freeActivated = true;
    const freeBtn = document.getElementById("free-plan-btn");
    if (!freeBtn) return;
    freeBtn.classList.add("activated");
    freeBtn.innerHTML = '<span class="check-icon"><i class="fa-solid fa-check"></i></span> تم التفعيل';
    freeBtn.onclick = null;
}

function activateSoldOutUI() {
    const card = document.getElementById("freePlanCard");
    const activeState = document.getElementById("activeFreeState");
    const soldOutState = document.getElementById("soldOutState");
    card.classList.add("sold-out");
    activeState.classList.add("hidden");
    soldOutState.classList.add("visible");
}

function hideAllSections() {
    document.getElementById("sectionNotAuth").classList.remove("visible");
    document.getElementById("sectionNotAuth").style.display = "";
    document.getElementById("sectionBeforeSubmit").classList.remove("hidden");
    document.getElementById("sectionBeforeSubmit").style.display = "none";
    document.getElementById("sectionOrderCreated").classList.remove("visible");
    document.getElementById("sectionFreeAuth").classList.remove("visible");
    document.getElementById("sectionFreeSuccess").classList.remove("visible");
}

function getFreePlanCacheKey(userId) {
    return `lt_free_plan_active:${userId}`;
}

function markFreePlanActiveLocally(userId) {
    try {
        localStorage.setItem(getFreePlanCacheKey(userId), "1");
    } catch (e) {}
}

function isFreePlanActiveLocally(userId) {
    try {
        return localStorage.getItem(getFreePlanCacheKey(userId)) === "1";
    } catch (e) {
        return false;
    }
}

function revealFreeBtn() {
    const btn = document.getElementById("free-plan-btn");
    if (btn) btn.classList.remove("pending-check");
}

async function checkOwnFreePlanStatus(userId) {
    const controller = new AbortController;
    const timeoutId = setTimeout(() => controller.abort(), 8e3);
    try {
        const res = await fetch(`${CONFIG.API}/check_free_plan`, {
            credentials: "include",
            signal: controller.signal
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "ok" && data.active) {
            setFreeBtnActivated();
            markFreePlanActiveLocally(userId);
        }
    } catch {} finally {
        clearTimeout(timeoutId);
        revealFreeBtn();
    }
}

async function initPage() {
    await loadCurrentUser();
    const userId = getUserId();
    if (!userId) {
        document.getElementById("sectionNotAuth").classList.add("visible");
        document.getElementById("userBadge").style.display = "none";
        revealFreeBtn();
    } else {
        document.getElementById("sectionNotAuth").style.display = "none";
        document.getElementById("sectionBeforeSubmit").style.display = "flex";
        document.getElementById("userBadge").style.display = "inline-flex";
        document.getElementById("badgeEmail").textContent = getDisplayLabel();
        document.getElementById("summaryEmail").textContent = getDisplayLabel();
        if (isFreePlanActiveLocally(userId)) {
            setFreeBtnActivated();
            revealFreeBtn();
            checkOwnFreePlanStatus(userId);
        } else {
            checkOwnFreePlanStatus(userId);
        }
    }
    updateSummary();
}

function selectPlan(el) {
    payMode = "paid";
    document.querySelectorAll(".plan").forEach(p => p.classList.remove("selected"));
    el.classList.add("selected");
    selectedPlanKey = el.dataset.plan;
    updateSummary();
    const userId = getUserId();
    hideAllSections();
    if (!userId) {
        document.getElementById("sectionNotAuth").classList.add("visible");
    } else {
        document.getElementById("sectionBeforeSubmit").style.display = "flex";
    }
}

function updateSummary() {
    const d = PLAN_DISPLAY[selectedPlanKey];
    if (!d) return;
    document.getElementById("summaryPlan").textContent = `${d.label} — ${d.comparisons} مقارنة`;
    document.getElementById("summaryTotal").textContent = `${d.price} $`;
}

function setLoading(on) {
    document.getElementById("loadingOverlay").classList.toggle("visible", on);
    const btn = document.getElementById("btnSubmit");
    if (btn) {
        btn.disabled = on;
        btn.innerHTML = on ? '<span><i class="fa-solid fa-spinner fa-spin"></i></span> جارٍ الإرسال...' : '<span><i class="fa-solid fa-paper-plane"></i></span> إرسال طلب الاشتراك';
    }
}

function showToast(msg, isError = false, duration = 2800) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.toggle("error", isError);
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), duration);
}

function handleFreeStart() {
    if (freeActivated) return;
    payMode = "free";
    document.querySelectorAll(".plan").forEach(p => p.classList.remove("selected"));
    const userId = getUserId();
    hideAllSections();
    if (!userId) {
        document.getElementById("sectionFreeAuth").classList.add("visible");
        scrollToPaySection();
        return;
    }
    submitFreeOrder();
}

async function submitFreeOrder() {
    document.getElementById("loadingOverlay").classList.add("visible");
    try {
        const name = getUserName();
        const res = await fetch(`${CONFIG.API}/create_order`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: name || getDisplayLabel(),
                plan: "free"
            })
        });
        const data = await res.json();
        if (res.status === 403 && data.message === "انتهت العروض المجانية") {
            activateSoldOutUI();
            hideAllSections();
            const userId = getUserId();
            if (!userId) {
                document.getElementById("sectionNotAuth").classList.add("visible");
            } else {
                document.getElementById("sectionBeforeSubmit").style.display = "flex";
            }
            scrollToPaySection();
            return;
        }
        if (data.status !== "ok") {
            throw new Error(data.message || "خطأ غير معروف");
        }
        document.getElementById("sectionFreeSuccess").classList.add("visible");
        setFreeBtnActivated();
        markFreePlanActiveLocally(getUserId());
        showToast("تم تفعيل خطتك المجانية!");
        scrollToPaySection();
    } catch (err) {
        const isRateLimitMsg = err.message === RATE_LIMIT_MESSAGE;
        showToast(err.message, !isRateLimitMsg, 4e3);
        document.getElementById("sectionFreeAuth").classList.add("visible");
        scrollToPaySection();
    } finally {
        document.getElementById("loadingOverlay").classList.remove("visible");
    }
}

async function handleSubmit() {
    const userId = getUserId();
    const name = getUserName();
    if (!userId) {
        showToast("⚠️ يجب تسجيل الدخول أولاً", true, 4e3);
        return;
    }
    setLoading(true);
    try {
        const res = await fetch(`${CONFIG.API}/create_order`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: name || getDisplayLabel(),
                plan: selectedPlanKey
            })
        });
        const data = await res.json();
        if (data.status !== "ok") {
            throw new Error(data.message || "خطأ غير معروف");
        }
        showOrderCreated({
            email: getDisplayLabel(),
            order_id: data.order_id,
            label: data.label,
            price: data.price,
            comparisons: data.comparisons
        });
    } catch (err) {
        const isRateLimitMsg = err.message === RATE_LIMIT_MESSAGE;
        showToast(err.message, !isRateLimitMsg, 4e3);
    } finally {
        setLoading(false);
    }
}

function showOrderCreated(order) {
    currentOrderId = order.order_id;
    document.getElementById("sectionBeforeSubmit").classList.add("hidden");
    document.getElementById("sectionOrderCreated").classList.add("visible");
    scrollToPaySection();
    const hasEmail = !!getUserEmail();
    const idLabel = hasEmail ? "البريد الإلكتروني" : "الاسم";
    const msgLabel = hasEmail ? "الإيميل" : "الاسم";
    document.getElementById("confirmedEmailLabel").textContent = idLabel;
    document.getElementById("msgEmailLabel").textContent = msgLabel;
    document.getElementById("confirmedPlan").textContent = `${order.label} — ${order.comparisons} مقارنة`;
    document.getElementById("confirmedEmail").textContent = order.email;
    document.getElementById("confirmedTotal").textContent = `${order.price} $`;
    document.getElementById("orderIdDisplay").textContent = order.order_id;
    document.getElementById("stepPlanLabel").textContent = order.label;
    document.getElementById("msgPlan").textContent = order.label;
    document.getElementById("msgPrice").textContent = `${order.price} $`;
    document.getElementById("msgComparisons").textContent = order.comparisons;
    document.getElementById("msgEmail").textContent = order.email;
    document.getElementById("msgOrderId").textContent = order.order_id;
    const msg = encodeURIComponent(`السلام عليكم،\nأريد الاشتراك في خطة ${order.label}\nالمبلغ: ${order.price} $ — ${order.comparisons} مقارنة صوتية\n${msgLabel}: ${order.email}\nرقم الطلب: ${order.order_id}`);
    document.getElementById("btnWhatsApp").href = `https://wa.me/${PHONE}?text=${msg}`;
    showToast("✅ تم إنشاء طلبك بنجاح!");
}

function copyOrderId() {
    if (!currentOrderId) return;
    navigator.clipboard.writeText(currentOrderId).then(() => showToast("✅ تم نسخ رقم الطلب"));
}

function resetForm() {
    payMode = "paid";
    setLoading(false);
    currentOrderId = null;
    hideAllSections();
    const userId = getUserId();
    if (!userId) {
        document.getElementById("sectionNotAuth").classList.add("visible");
    } else {
        document.getElementById("sectionBeforeSubmit").style.display = "flex";
    }
    document.querySelectorAll(".plan").forEach(p => p.classList.remove("selected"));
    const starterCard = document.querySelector('.plan[data-plan="starter"]');
    if (starterCard) starterCard.classList.add("selected");
    selectedPlanKey = "starter";
    updateSummary();
}

initPage();
