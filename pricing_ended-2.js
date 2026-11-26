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

let paypalSdkPromise = null;
let paypalButtonsInstance = null;
let paypalCardFieldsInstance = null;
let paypalRenderSequence = 0;

function paypalMessage(message, success = false) {
    const errorEl = document.getElementById("paypalError");
    const successEl = document.getElementById("paypalSuccess");
    if (errorEl) { errorEl.textContent = success ? "" : message; errorEl.classList.toggle("visible", !success && !!message); }
    if (successEl) successEl.classList.toggle("visible", success);
}

function paypalCardFieldsNote(message, visible = true) {
    const note = document.getElementById("paypalCardFieldsNote");
    if (!note) return;
    note.textContent = message;
    note.classList.toggle("visible", visible && !!message);
}

async function loadPayPalSdk() {
    if (paypalSdkPromise) return paypalSdkPromise;
    paypalSdkPromise = (async () => {
        const configResponse = await fetch(`${CONFIG.API}/api/payments/paypal/config`, { credentials: "include", cache: "no-store" });
        const config = await configResponse.json();
        if (!configResponse.ok || !config.enabled || !config.client_id) throw new Error("الدفع الإلكتروني غير مهيأ بعد. أضف بيانات PayPal إلى الخادم أولاً.");

        let clientToken = null;
        try {
            const tokenResponse = await fetch(`${CONFIG.API}/api/payments/paypal/client-token`, { credentials: "include", cache: "no-store" });
            const tokenData = await tokenResponse.json();
            if (tokenResponse.ok && tokenData.status === "ok" && tokenData.client_token) clientToken = tokenData.client_token;
            else paypalCardFieldsNote(tokenData.message || "حقول البطاقة المباشرة غير متاحة لهذا الحساب حالياً. يمكنك الدفع عبر PayPal.");
        } catch (_) {
            paypalCardFieldsNote("تعذر تجهيز حقول البطاقة. يمكنك الدفع عبر PayPal أو استخدام واتساب.");
        }

        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            const params = new URLSearchParams({
                "client-id": config.client_id,
                currency: "USD",
                intent: "capture",
                components: clientToken ? "buttons,card-fields" : "buttons",
                "enable-funding": "card"
            });
            script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
            if (clientToken) script.setAttribute("data-client-token", clientToken);
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error("تعذر تحميل بوابة PayPal. تحقق من اتصالك ثم حاول مجدداً."));
            document.head.appendChild(script);
        });
        if (!window.paypal) throw new Error("تعذر تشغيل بوابة PayPal حالياً.");
        return { sdk: window.paypal, cardFieldsEnabled: !!clientToken && typeof window.paypal.CardFields === "function" };
    })().catch(error => { paypalSdkPromise = null; throw error; });
    return paypalSdkPromise;
}

async function createPayPalOrder(fundingSource) {
    const response = await fetch(`${CONFIG.API}/api/payments/paypal/create-order`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: selectedPlanKey, funding_source: fundingSource })
    });
    const data = await response.json().catch(() => ({}));
    const validation = Array.isArray(data.detail)
        ? data.detail.map(item => item && item.msg).filter(Boolean).join("، ")
        : (typeof data.detail === "string" ? data.detail : "");
    if (!response.ok || data.status !== "ok" || !data.orderID) {
        throw new Error(data.message || validation || "تعذر إنشاء طلب الدفع.");
    }
    return data.orderID;
}

async function paypalOrderCompleted(orderId) {
    try {
        const response = await fetch(`${CONFIG.API}/api/payments/paypal/order-status/${encodeURIComponent(orderId)}`, {
            credentials: "include", cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.status === "ok" && data.completed === true) return true;
        if (response.ok && data.payment_status === "DECLINED") return false;
    } catch (_) {}
    return null;
}

async function waitForPayPalCompletion(orderId) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const state = await paypalOrderCompleted(orderId);
        if (state !== null) return state;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return null;
}

async function monitorPayPalCompletion(orderId) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const state = await paypalOrderCompleted(orderId);
        if (state === true) {
            paypalMessage("", true);
            showToast("تم الدفع وتفعيل خطتك بنجاح.", false, 5000);
            const manualBtn = document.getElementById("btnSubmit");
            if (manualBtn) manualBtn.disabled = true;
            await loadCurrentUser();
            return;
        }
        if (state === false) {
            paypalMessage("رفض PayPal عملية الدفع؛ لم يتم تفعيل الخطة. تحقق من وسيلة الدفع ثم حاول مجدداً.");
            return;
        }
    }
}

async function completePayPalOrder(data) {
    const orderId = data && (data.orderID || data.orderId);
    if (!orderId) throw new Error("لم يصل رقم طلب الدفع.");
    const response = await fetch(`${CONFIG.API}/api/payments/paypal/capture-order/${encodeURIComponent(orderId)}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== "ok" || result.completed !== true) {
        const completed = await waitForPayPalCompletion(orderId);
        if (completed === false) {
            paypalMessage("رفض PayPal عملية الدفع؛ لم يتم تفعيل الخطة. تحقق من وسيلة الدفع ثم حاول مجدداً.");
            return;
        }
        if (completed !== true) {
            paypalMessage(`قد يكون PayPal قد استلم الدفع، وما زلنا نتحقق منه. لا تُعد الدفع الآن. رقم الطلب: ${orderId}`, false);
            void monitorPayPalCompletion(orderId);
            return;
        }
    }
    paypalMessage("", true);
    showToast("تم الدفع وتفعيل خطتك بنجاح.", false, 5000);
    const manualBtn = document.getElementById("btnSubmit");
    if (manualBtn) manualBtn.disabled = true;
    await loadCurrentUser();
}

async function renderPayPalButtons() {
    const target = document.getElementById("paypalButtons");
    if (!target || !getUserId() || selectedPlanKey === "free") return;
    const sequence = ++paypalRenderSequence;
    paypalMessage("");
    paypalCardFieldsNote("جارٍ تجهيز حقول البطاقة الآمنة من PayPal…");
    try {
        const loaded = await loadPayPalSdk();
        const sdk = loaded.sdk;
        if (sequence !== paypalRenderSequence) return;
        if (paypalButtonsInstance) { try { await paypalButtonsInstance.close(); } catch (_) {} paypalButtonsInstance = null; }
        target.replaceChildren();
        let paypalButtonEligible = false;
        paypalButtonsInstance = sdk.Buttons({
            style: { layout: "vertical", shape: "rect", label: "paypal", height: 48 },
            createOrder: () => createPayPalOrder("paypal"),
            onApprove: completePayPalOrder,
            onCancel: () => paypalMessage("أُلغيت عملية الدفع. لم يتم تفعيل الخطة."),
            onError: error => paypalMessage(error && error.message ? error.message : "تعذر إكمال الدفع. لم يتم تفعيل الخطة.")
        });
        paypalButtonEligible = await paypalButtonsInstance.isEligible();
        if (paypalButtonEligible) await paypalButtonsInstance.render(target);

        const cardForm = document.getElementById("paypalCardForm");
        const cardSubmit = document.getElementById("paypalCardSubmit");
        const cardFieldsMarkupReady = !!(cardForm && cardSubmit
            && document.getElementById("paypalCardName")
            && document.getElementById("paypalCardNumber")
            && document.getElementById("paypalCardExpiry")
            && document.getElementById("paypalCardCvv"));
        if (loaded.cardFieldsEnabled && cardFieldsMarkupReady) {
            paypalCardFieldsInstance = sdk.CardFields({
                createOrder: () => createPayPalOrder("card"),
                onApprove: completePayPalOrder,
                onError: error => paypalMessage(error && error.message ? error.message : "تعذر إتمام الدفع بالبطاقة.")
            });
            if (paypalCardFieldsInstance.isEligible()) {
                const style = { input: { "font-size": "16px", "font-family": "Tajawal, sans-serif", color: "#e8eefc" }, ".invalid": { color: "#ff8b8b" } };
                await Promise.all([
                    paypalCardFieldsInstance.NameField({ style }).render("#paypalCardName"),
                    paypalCardFieldsInstance.NumberField({ style }).render("#paypalCardNumber"),
                    paypalCardFieldsInstance.ExpiryField({ style }).render("#paypalCardExpiry"),
                    paypalCardFieldsInstance.CVVField({ style }).render("#paypalCardCvv")
                ]);
                if (sequence !== paypalRenderSequence) return;
                cardForm.classList.add("visible");
                paypalCardFieldsNote("بيانات البطاقة تُدخل في حقول PayPal الآمنة.", true);
                cardSubmit.onclick = async () => {
                    cardSubmit.disabled = true;
                    paypalMessage("");
                    try { await paypalCardFieldsInstance.submit(); }
                    catch (error) { paypalMessage(error && error.message ? error.message : "تحقق من بيانات البطاقة ثم حاول مجدداً."); }
                    finally { cardSubmit.disabled = false; }
                };
            } else {
                if (cardForm) cardForm.classList.remove("visible");
                paypalCardFieldsNote("حقول البطاقة المباشرة غير متاحة لهذا الحساب أو البلد. يمكنك تجربة زر PayPal.");
            }
        } else {
            if (cardForm) cardForm.classList.remove("visible");
            paypalCardFieldsNote(loaded.cardFieldsEnabled
                ? "تعذر عرض حقول البطاقة في هذه الصفحة. يمكنك الدفع عبر زر PayPal أو واتساب."
                : "لم تُفعّل حقول البطاقة لهذا التطبيق بعد. يمكنك الدفع عبر PayPal أو واتساب.");
        }
        if (!paypalButtonEligible && !(cardForm && cardForm.classList.contains("visible"))) {
            paypalMessage("خيارات الدفع المباشر غير متاحة لهذا الحساب حالياً. يمكنك استخدام واتساب.");
        }
    } catch (error) {
        if (sequence === paypalRenderSequence) {
            paypalCardFieldsNote("", false);
            paypalMessage(error.message || "تعذر تحميل الدفع الإلكتروني.");
        }
    }
}

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
    if (activeState) activeState.classList.add("hidden");
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
    } else {
        document.getElementById("sectionNotAuth").style.display = "none";
        document.getElementById("sectionBeforeSubmit").style.display = "flex";
        document.getElementById("userBadge").style.display = "inline-flex";
        document.getElementById("badgeEmail").textContent = getDisplayLabel();
        document.getElementById("summaryEmail").textContent = getDisplayLabel();
    }
    updateSummary();
    if (userId) renderPayPalButtons();
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
        renderPayPalButtons();
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
        btn.innerHTML = on ? '<span><i class="fa-solid fa-spinner fa-spin"></i></span> جارٍ إنشاء الطلب...' : '<span><i class="fa-brands fa-whatsapp"></i></span> متابعة الدفع اليدوي عبر واتساب';
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
    return;
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
    return;
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
    paypalMessage("");
    updateSummary();
    if (userId) renderPayPalButtons();
}

void initPage().then(() => window.setupDirectCheckout?.({
    userId: getUserId(),
    getPlan: () => selectedPlanKey,
    onComplete: loadCurrentUser
}));
