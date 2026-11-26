(function() {
    const gate = document.getElementById("gate");
    const app = document.getElementById("app");
    const gateErr = document.getElementById("gateErr");
    const apiBaseInput = document.getElementById("apiBase");
    const tokenInput = document.getElementById("adminToken");
    const toast = document.getElementById("toast");
    let API_BASE = "";
    let TOKEN = "";
    let pollTimer = null;
    let missedTicks = 0;
    const STORAGE_KEY = "liketwin_live_stats_creds";
    function loadSaved() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (_) {}
        apiBaseInput.value = CONFIG.API;
        apiBaseInput.readOnly = true;
    }
    function clearCreds() {
        TOKEN = "";
        tokenInput.value = "";
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (_) {}
    }
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2600);
    }
    function fmtNum(n) {
        if (n === null || n === undefined) return "—";
        return Number(n).toLocaleString("en-US");
    }
    function windowCard(title, sub, data) {
        const total = data.total || 0;
        const success = data.success || 0;
        const failed = data.failed || 0;
        const successPct = total ? success / total * 100 : 0;
        const failedPct = total ? failed / total * 100 : 0;
        return `\n      <div class="window-card">\n        <div class="window-head">\n          <span class="window-title">${title}</span>\n          <span class="window-sub">${sub}</span>\n        </div>\n        <div class="window-total">${fmtNum(total)}</div>\n        <div class="bar">\n          <div class="bar-success" style="width:${successPct}%"></div>\n          <div class="bar-failed" style="width:${failedPct}%"></div>\n        </div>\n        <div class="stat-row"><span class="k">ناجح</span><span class="v ok">${fmtNum(success)}</span></div>\n        <div class="stat-row"><span class="k">فاشل</span><span class="v bad">${fmtNum(failed)}</span></div>\n        <div class="stat-row"><span class="k">متوسط الوقت</span><span class="v">${data.average_time_ms ? Number(data.average_time_ms) + " ms" : "—"}</span></div>\n      </div>\n    `;
    }
    function sysCard(label, value, pct, unit) {
        return `\n      <div class="sys-card">\n        <div class="sys-label">${label}</div>\n        <div class="sys-value">${Number(value)}${unit || ""}</div>\n        ${pct !== null ? `<div class="sys-track"><div class="sys-fill" style="width:${Math.min(100, pct)}%"></div></div>` : ""}\n      </div>\n    `;
    }
    function render(data) {
        document.getElementById("activeNum").textContent = fmtNum(data.active_analyses);
        document.getElementById("sonar").classList.toggle("active", (data.active_analyses || 0) > 0);
        const backendChip = document.getElementById("backendChip");
        backendChip.textContent = data.backend === "redis" ? "Redis" : "Memory";
        backendChip.classList.toggle("redis", data.backend === "redis");
        document.getElementById("windowGrid").innerHTML = windowCard("آخر دقيقة", "60s", data.last_minute || {}) + windowCard("آخر ساعة", "3600s", data.last_hour || {}) + windowCard("اليوم", "UTC", data.today || {});
        const sysGrid = document.getElementById("sysGrid");
        if (data.system) {
            const s = data.system;
            sysGrid.innerHTML = sysCard("CPU السيرفر", s.system_cpu_percent ?? "—", s.system_cpu_percent ?? null, "%") + sysCard("ذاكرة السيرفر", s.system_memory_percent ?? "—", s.system_memory_percent ?? null, "%") + sysCard("CPU العملية", s.process_cpu_percent ?? "—", s.process_cpu_percent ?? null, "%") + sysCard("ذاكرة العملية", s.process_memory_mb ?? "—", null, " MB");
        } else {
            sysGrid.innerHTML = `<div class="sys-empty">psutil غير مثبت على السيرفر — استهلاك النظام غير متاح</div>`;
        }
        document.getElementById("lastUpdate").textContent = "آخر تحديث: " + (new Date).toLocaleTimeString("ar-MA");
    }
    function setConnState(state) {
        const dot = document.getElementById("connDot");
        dot.classList.remove("live", "down");
        dot.classList.add(state);
    }
    async function poll() {
        try {
            const res = await fetch(API_BASE + "/admin/live_stats", {
                credentials: "include"
            });
            if (res.status === 403) {
                stopPolling();
                showAuthError("التوكن غير صحيح أو غير مصرح به");
                return;
            }
            if (!res.ok) {
                throw new Error("HTTP " + res.status);
            }
            const json = await res.json();
            if (json.status !== "ok") {
                throw new Error(json.message || "خطأ غير معروف");
            }
            missedTicks = 0;
            setConnState("live");
            render(json);
        } catch (e) {
            missedTicks += 1;
            if (missedTicks >= 2) {
                setConnState("down");
            }
            if (missedTicks === 3) {
                showToast("تعذر الاتصال بالخادم، جارٍ إعادة المحاولة");
            }
        }
    }
    function startPolling() {
        poll();
        pollTimer = setInterval(poll, 1500);
    }
    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }
    function showAuthError(msg) {
        app.classList.remove("show");
        gate.classList.remove("hidden");
        gateErr.textContent = msg;
        gateErr.classList.add("show");
        clearCreds();
    }
    async function connect() {
        const rawBase = apiBaseInput.value.trim().replace(/\/+$/, "");
        const rawToken = tokenInput.value.trim();
        if (!rawBase || !rawToken) {
            gateErr.textContent = "أدخل رمز الإدارة للمتابعة";
            gateErr.classList.add("show");
            return;
        }
        if (rawBase !== CONFIG.API) {
            gateErr.textContent = "عنوان الخادم غير مسموح";
            gateErr.classList.add("show");
            return;
        }
        API_BASE = rawBase;
        tokenInput.value = "";
        try {
            const response = await fetch(CONFIG.API + "/admin/login", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    token: rawToken
                })
            });
            if (!response.ok) throw new Error("تعذر تسجيل الدخول، تحقق من الرمز أو حاول لاحقًا");
        } catch (error) {
            gateErr.textContent = error.message;
            gateErr.classList.add("show");
            return;
        }
        gateErr.classList.remove("show");
        document.getElementById("apiLabel").textContent = API_BASE;
        gate.classList.add("hidden");
        app.classList.add("show");
        missedTicks = 0;
        startPolling();
    }
    document.getElementById("connectBtn").addEventListener("click", connect);
    [ apiBaseInput, tokenInput ].forEach(el => {
        el.addEventListener("keydown", e => {
            if (e.key === "Enter") connect();
        });
    });
    document.getElementById("logoutBtn").addEventListener("click", async () => {
        try {
            const response = await fetch(CONFIG.API + "/admin/logout", {
                method: "POST",
                credentials: "include"
            });
            if (!response.ok) throw new Error;
        } catch (_) {
            showToast("تعذر تسجيل الخروج، حاول مجددًا");
            return;
        }
        stopPolling();
        clearCreds();
        app.classList.remove("show");
        gate.classList.remove("hidden");
        gateErr.classList.remove("show");
    });
    loadSaved();
})();
