let ADMIN_AUTHENTICATED = false;

const PHONE = "212603074384";

const PAGE_SIZE = 15;

const PLAN_DATA = {
    free: {
        label: "المجاني",
        comparisons: 5,
        cls: "plan-starter"
    },
    starter: {
        label: "المبتدئ",
        comparisons: 50,
        cls: "plan-starter"
    },
    pro: {
        label: "الاحترافي",
        comparisons: 150,
        cls: "plan-pro"
    },
    advanced: {
        label: "المتقدم",
        comparisons: 600,
        cls: "plan-advanced"
    }
};

async function adminRequest(path, body) {
    const res = await fetch(CONFIG.API + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "include",
        headers: body === undefined ? {} : {
            "Content-Type": "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || data.status !== "ok") {
        if (res.status === 403 && path !== "/admin/login") showLogin();
        throw new Error(data.message || "تعذر إتمام الطلب");
    }
    return data;
}

function showLogin() {
    ADMIN_AUTHENTICATED = false;
    allOrders = [];
    allUsers = [];
    filteredOrders = [];
    filteredUsers = [];
    document.getElementById("ordersTableBody").replaceChildren();
    document.getElementById("usersTableBody").replaceChildren();
    closeOrderModal();
    closeUserModal();
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("pwdInput").value = "";
}

let allOrders = [], filteredOrders = [], ordersPage = 1;

let allUsers = [], filteredUsers = [], usersPage = 1;

let currentEditUser = null;

async function doLogin() {
    const input = document.getElementById("pwdInput");
    const token = input.value;
    if (!token) return;
    input.value = "";
    try {
        await adminRequest("/admin/login", {
            token: token
        });
        ADMIN_AUTHENTICATED = true;
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("loginErr").classList.remove("show");
        await Promise.all([ loadOrders(), loadUsers() ]);
    } catch (error) {
        document.getElementById("loginErr").textContent = error.message;
        document.getElementById("loginErr").classList.add("show");
    }
}

async function logOut() {
    try {
        await adminRequest("/admin/logout", {});
        showLogin();
    } catch (error) {
        showToast(error.message, true);
    }
}

function setView(v) {
    document.querySelectorAll(".view-section").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".sb-item").forEach(s => s.classList.remove("active"));
    document.getElementById("view" + v.charAt(0).toUpperCase() + v.slice(1)).classList.add("active");
    document.getElementById("nav" + v.charAt(0).toUpperCase() + v.slice(1)).classList.add("active");
    const titles = {
        orders: "الطلبات",
        users: "لوحات المستخدمين"
    };
    document.getElementById("topbarTitle").textContent = titles[v] || v;
}

async function loadOrders() {
    try {
        const data = await adminRequest("/admin_orders");
        allOrders = data.orders || [];
        updateOrderStats();
        applyOrderFilters();
        updatePendingBadge();
    } catch (error) {
        showToast(error.message, true);
    }
}

function updateOrderStats() {
    const paid = allOrders.filter(o => o.status === "paid");
    const revenue = paid.reduce((s, o) => s + (o.price || 0), 0);
    document.getElementById("statTotal").textContent = allOrders.length;
    document.getElementById("statPaid").textContent = paid.length;
    document.getElementById("statPending").textContent = allOrders.filter(o => o.status === "pending").length;
    document.getElementById("statCancelled").textContent = allOrders.filter(o => o.status === "cancelled").length;
    document.getElementById("statRevenue").textContent = `الإيرادات: ${revenue.toFixed(1)} $`;
}

function updatePendingBadge() {
    const n = allOrders.filter(o => o.status === "pending").length;
    const b = document.getElementById("pendingBadge");
    if (n > 0) {
        b.textContent = n;
        b.style.display = "";
    } else {
        b.style.display = "none";
    }
}

function applyOrderFilters() {
    const q = document.getElementById("searchOrders").value.trim().toLowerCase();
    const s = document.getElementById("filterStatus").value;
    const p = document.getElementById("filterPlan").value;
    filteredOrders = allOrders.filter(o => (!q || o.id.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || (o.account_email || o.email || "").toLowerCase().includes(q)) && (!s || o.status === s) && (!p || o.plan === p));
    ordersPage = 1;
    renderOrdersTable();
}

function renderOrdersTable() {
    const tbody = document.getElementById("ordersTableBody");
    const total = filteredOrders.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (ordersPage > pages) ordersPage = pages;
    const slice = filteredOrders.slice((ordersPage - 1) * PAGE_SIZE, ordersPage * PAGE_SIZE);
    document.getElementById("ordersCountBadge").textContent = `${total} طلب`;
    if (!slice.length) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">لا توجد طلبات</div></div></td></tr>`;
    } else {
        tbody.innerHTML = slice.map((o, rowIndex) => `\n      <tr>\n        <td><span class="order-id-cell">${esc(o.id)}</span></td>\n        <td><span class="name-cell">${esc(o.name)}</span></td>\n        <td><span class="email-cell">${esc(o.account_email || o.email || "")}</span></td>\n        <td>${planBadge(o.plan, o.label)}</td>\n        <td><span class="price-cell">${Number(o.price)} $</span></td>\n        <td>${statusBadge(o.status)}</td>\n        <td><span class="date-cell">${fmtDate(o.created_at)}</span></td>\n        <td><div class="actions">\n          <button class="btn-action btn-view" data-order-action="view" data-row="${rowIndex}">عرض</button>\n          ${o.status === "pending" ? `<button class="btn-action btn-paid" data-order-action="paid" data-row="${rowIndex}">✓ مدفوع</button>` : ""}\n          ${o.status !== "cancelled" ? `<button class="btn-action btn-cancel" data-order-action="cancelled" data-row="${rowIndex}">إلغاء</button>` : ""}\n          <button class="btn-action btn-wa-small" data-order-action="wa" data-row="${rowIndex}">واتساب</button>\n        </div></td>\n      </tr>`).join("");
    }
    renderPagination("orders", total, pages, ordersPage, p => {
        ordersPage = p;
        renderOrdersTable();
    });
}

async function loadUsers() {
    try {
        const data = await adminRequest("/admin_users");
        allUsers = data.users || [];
        updateUserStats();
        applyUserFilters();
    } catch (error) {
        showToast(error.message, true);
    }
}

function updateUserStats() {
    const total = allUsers.filter(u => u.plan).length;
    const totalRemaining = allUsers.reduce((s, u) => s + (u.remaining || 0), 0);
    const empty = allUsers.filter(u => u.plan && u.remaining === 0).length;
    let totalUsed = 0;
    allUsers.forEach(u => {
        const ttl = u.total || 0;
        totalUsed += Math.max(0, ttl - (u.remaining || 0));
    });
    document.getElementById("uStatTotal").textContent = total;
    document.getElementById("uStatRemaining").textContent = totalRemaining;
    document.getElementById("uStatUsed").textContent = totalUsed;
    document.getElementById("uStatEmpty").textContent = empty;
}

function applyUserFilters() {
    const q = document.getElementById("searchUsers").value.trim().toLowerCase();
    const p = document.getElementById("filterUserPlan").value;
    const cr = document.getElementById("filterUserCredits").value;
    filteredUsers = allUsers.filter(u => {
        const email = (u.account_email || u.email || "").toLowerCase();
        if (q && !email.includes(q)) return false;
        if (p === "none" && u.plan) return false;
        if (p && p !== "none" && u.plan !== p) return false;
        if (cr) {
            const total = u.total || 0;
            const pct = total > 0 ? u.remaining / total * 100 : 0;
            if (cr === "empty" && u.remaining !== 0) return false;
            if (cr === "low" && (u.remaining === 0 || pct >= 20)) return false;
            if (cr === "ok" && pct < 20) return false;
        }
        return true;
    });
    usersPage = 1;
    renderUsersTable();
}

function renderUsersTable() {
    const tbody = document.getElementById("usersTableBody");
    const total = filteredUsers.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (usersPage > pages) usersPage = pages;
    const slice = filteredUsers.slice((usersPage - 1) * PAGE_SIZE, usersPage * PAGE_SIZE);
    document.getElementById("usersCountBadge").textContent = `${total} مستخدم`;
    if (!slice.length) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">لا يوجد مستخدمون</div></div></td></tr>`;
    } else {
        tbody.innerHTML = slice.map((u, rowIndex) => {
            const pd = PLAN_DATA[u.plan];
            const ttl = u.total || 0;
            const used = Math.max(0, (u.total || 0) - (u.remaining || 0));
            const rem = u.remaining || 0;
            const pct = ttl > 0 ? Math.round(rem / ttl * 100) : 0;
            const barCls = rem === 0 ? "empty" : pct < 20 ? "low" : "";
            const numCls = rem === 0 ? "empty" : pct < 20 ? "low" : "good";
            return `<tr>\n        <td><span class="email-cell">${esc(u.account_email || u.email || "")}</span></td>\n        <td>${u.plan ? planBadge(u.plan, pd ? pd.label : u.plan) : '<span class="plan-badge plan-none">بدون خطة</span>'}</td>\n        <td style="color:var(--gold2);font-weight:700;">${ttl || "—"}</td>\n        <td style="color:var(--warn);font-weight:700;">${pd ? used : "—"}</td>\n        <td class="credits-num ${numCls}" style="font-size:0.88rem;">${pd ? rem : "—"}</td>\n        <td>\n          ${pd ? `<div class="credits-cell">\n            <div class="credits-bar"><div class="credits-fill ${barCls}" style="width:${pct}%"></div></div>\n            <span class="credits-num ${numCls}" style="font-size:0.78rem;">${pct}%</span>\n          </div>` : "—"}\n        </td>\n        <td><div class="actions">\n          <button class="btn-action btn-edit-user" data-user-action="edit" data-row="${rowIndex}">⚙️ تعديل</button>\n          <button class="btn-action btn-add-credits" data-user-action="add" data-row="${rowIndex}">+10</button>\n          ${rem === 0 && u.plan ? `<button class="btn-action btn-reset-user" data-user-action="reset" data-row="${rowIndex}">إعادة تعيين</button>` : ""}\n        </div></td>\n      </tr>`;
        }).join("");
    }
    renderPagination("users", total, pages, usersPage, p => {
        usersPage = p;
        renderUsersTable();
    });
}

function openUserModal(u) {
    currentEditUser = u;
    const ttl = u.total || 0;
    const rem = u.remaining || 0;
    const used = Math.max(0, ttl - rem);
    const pct = ttl > 0 ? Math.round(used / ttl * 100) : 0;
    const barCls = rem === 0 ? "empty" : pct >= 80 ? "low" : "";
    document.getElementById("uModalEmail").textContent = u.account_email || u.email || u.user_id;
    document.getElementById("uMiniTotal").textContent = ttl || "—";
    document.getElementById("uMiniUsed").textContent = used || "—";
    document.getElementById("uMiniRemaining").textContent = rem;
    document.getElementById("uMiniProgressFill").style.width = pct + "%";
    document.getElementById("uMiniProgressFill").className = "mini-progress-fill" + (barCls ? " " + barCls : "");
    document.getElementById("uMiniPctLabel").textContent = pct + "% مستهلك";
    document.getElementById("uMiniRemLabel").textContent = rem + " متبقٍ";
    document.getElementById("uEditPlan").value = u.plan || "";
    document.getElementById("uEditCredits").value = rem;
    document.getElementById("uCurrentCreditsHint").textContent = rem;
    document.getElementById("userModal").classList.add("open");
}

function closeUserModal(e) {
    if (e && e.target !== document.getElementById("userModal")) return;
    document.getElementById("userModal").classList.remove("open");
    currentEditUser = null;
}

function adjustCredits(delta) {
    const inp = document.getElementById("uEditCredits");
    inp.value = Math.max(0, parseInt(inp.value || 0) + delta);
}

async function updateUser(user, changes) {
    try {
        const data = await adminRequest("/admin_update_user", {
            user_id: user.user_id,
            ...changes
        });
        Object.assign(user, {
            plan: data.plan,
            remaining: data.remaining,
            total: data.total
        });
        await loadUsers();
        if (currentEditUser?.user_id === user.user_id) openUserModal(user);
        showToast("تم تحديث المستخدم");
        return true;
    } catch (error) {
        showToast(error.message, true);
        return false;
    }
}

async function saveUserPlan() {
    if (!currentEditUser) return;
    const plan = document.getElementById("uEditPlan").value;
    if (!PLAN_DATA[plan]) return showToast("اختر خطة أولاً", true);
    await updateUser(currentEditUser, {
        plan: plan,
        remaining: PLAN_DATA[plan].comparisons,
        mode: "add"
    });
}

async function saveUserCredits() {
    if (!currentEditUser) return;
    const remaining = Number(document.getElementById("uEditCredits").value);
    if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > 1e6) return showToast("أدخل رصيدًا صحيحًا", true);
    if (!currentEditUser.plan) return showToast("اختر خطة أولاً", true);
    await updateUser(currentEditUser, {
        plan: currentEditUser.plan,
        remaining: remaining,
        mode: "set"
    });
}

async function resetUser() {
    if (!currentEditUser || !confirm("إلغاء الخطة وحذف الرصيد المتبقي لهذا المستخدم؟")) return;
    if (await resetUserById(currentEditUser.user_id)) closeUserModal();
}

async function resetUserById(user_id) {
    try {
        await adminRequest("/admin_reset_user", {
            user_id: user_id
        });
        await loadUsers();
        showToast("تمت إعادة تعيين المستخدم");
        return true;
    } catch (error) {
        showToast(error.message, true);
        return false;
    }
}

async function quickAddCredits(user, amount) {
    if (!user.plan) return showToast("اختر خطة لهذا المستخدم أولاً", true);
    await updateUser(user, {
        plan: user.plan,
        remaining: amount,
        mode: "add"
    });
}

document.getElementById("ordersTableBody").addEventListener("click", event => {
    const button = event.target.closest("[data-order-action]");
    if (!button) return;
    const order = filteredOrders[(ordersPage - 1) * PAGE_SIZE + Number(button.dataset.row)];
    if (!order) return;
    switch (button.dataset.orderAction) {
      case "view":
        openOrderModal(order);
        break;

      case "paid":
        markPaid(order.id);
        break;

      case "cancelled":
        markCancelled(order.id);
        break;

      case "wa":
        sendWa(order);
        break;
    }
});

document.getElementById("usersTableBody").addEventListener("click", event => {
    const button = event.target.closest("[data-user-action]");
    if (!button) return;
    const user = filteredUsers[(usersPage - 1) * PAGE_SIZE + Number(button.dataset.row)];
    if (!user) return;
    switch (button.dataset.userAction) {
      case "edit":
        openUserModal(user);
        break;

      case "add":
        quickAddCredits(user, 10);
        break;

      case "reset":
        if (confirm("إعادة تعيين هذا المستخدم؟")) resetUserById(user.user_id);
        break;
    }
});

function openOrderModal(o) {
    document.getElementById("orderModalRows").innerHTML = `\n    <div class="modal-row"><span class="modal-row-label">رقم الطلب</span><span class="modal-row-val" style="font-family:monospace;color:var(--accent2)">${esc(o.id)}</span></div>\n    <div class="modal-row"><span class="modal-row-label">الاسم</span><span class="modal-row-val">${esc(o.name)}</span></div>\n    <div class="modal-row"><span class="modal-row-label">البريد</span><span class="modal-row-val" style="direction:ltr;unicode-bidi:plaintext">${esc(o.account_email || o.email || "")}</span></div>\n    <div class="modal-row"><span class="modal-row-label">الخطة</span>${planBadge(o.plan, o.label)}</div>\n    <div class="modal-row"><span class="modal-row-label">المبلغ</span><span class="modal-row-val" style="color:var(--success)">${Number(o.price)} $</span></div>\n    <div class="modal-row"><span class="modal-row-label">المقارنات</span><span class="modal-row-val">${Number(o.comparisons)} مقارنة</span></div>\n    <div class="modal-row"><span class="modal-row-label">الحالة</span>${statusBadge(o.status)}</div>\n    <div class="modal-row"><span class="modal-row-label">التاريخ</span><span class="modal-row-val" style="font-size:0.82rem">${fmtDate(o.created_at)}</span></div>\n  `;
    const acts = document.getElementById("orderModalActions");
    acts.innerHTML = "";
    if (o.status === "pending") {
        const b = document.createElement("button");
        b.className = "btn-modal btn-modal-paid";
        b.textContent = "✓ تأكيد الدفع";
        b.onclick = () => markPaid(o.id);
        acts.appendChild(b);
    }
    const bWa = document.createElement("button");
    bWa.className = "btn-modal btn-modal-wa";
    bWa.textContent = "💬 واتساب";
    bWa.onclick = () => sendWa(o);
    acts.appendChild(bWa);
    if (o.status !== "cancelled") {
        const bC = document.createElement("button");
        bC.className = "btn-modal btn-modal-cancel";
        bC.textContent = "إلغاء الطلب";
        bC.onclick = () => {
            if (confirm("إلغاء هذا الطلب؟")) markCancelled(o.id);
        };
        acts.appendChild(bC);
    }
    document.getElementById("orderModal").classList.add("open");
}

function closeOrderModal(e) {
    if (e && e.target !== document.getElementById("orderModal")) return;
    document.getElementById("orderModal").classList.remove("open");
}

async function updateOrderStatus(id, status) {
    try {
        await adminRequest("/admin_update_order", {
            order_id: id,
            status: status
        });
        await Promise.all([ loadOrders(), loadUsers() ]);
        closeOrderModal();
        showToast("تم تحديث حالة الطلب");
    } catch (error) {
        showToast(error.message, true);
    }
}

function markPaid(id) {
    updateOrderStatus(id, "paid");
}

function markCancelled(id) {
    updateOrderStatus(id, "cancelled");
}

function planBadge(plan, label) {
    const cls = PLAN_DATA[plan]?.cls || "plan-starter";
    const lbl = label || PLAN_DATA[plan]?.label || plan;
    return `<span class="plan-badge ${cls}">${esc(lbl)}</span>`;
}

function statusBadge(s) {
    if (s === "paid") return `<span class="badge badge-paid"><span class="badge-dot"></span>مدفوع</span>`;
    if (s === "cancelled") return `<span class="badge badge-cancelled"><span class="badge-dot"></span>ملغى</span>`;
    return `<span class="badge badge-pending"><span class="badge-dot"></span>معلق</span>`;
}

function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric"
    }) + " " + d.toLocaleTimeString("ar-EG", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function sendWa(o) {
    const msg = encodeURIComponent(`السلام عليكم ${o.name}،\nطلبكم رقم ${esc(o.id)} قيد المعالجة.\nالخطة: ${o.label} — ${Number(o.price)} $ — ${Number(o.comparisons)} مقارنة\nيرجى إكمال عملية الدفع. شكراً.`);
    window.open(`https://wa.me/${PHONE}?text=${msg}`, "_blank");
}

function renderPagination(id, total, pages, current, onPage) {
    const infoEl = document.getElementById(id + "PageInfo");
    const btnsEl = document.getElementById(id + "PageBtns");
    const start = (current - 1) * PAGE_SIZE + 1;
    const end = Math.min(current * PAGE_SIZE, total);
    infoEl.textContent = total ? `${start}–${end} من ${total}` : "0 نتيجة";
    btnsEl.innerHTML = "";
    const prev = document.createElement("button");
    prev.className = "btn-page";
    prev.textContent = "→";
    prev.disabled = current === 1;
    prev.onclick = () => onPage(current - 1);
    btnsEl.appendChild(prev);
    let s = Math.max(1, current - 2), e = Math.min(pages, s + 4);
    if (e - s < 4) s = Math.max(1, e - 4);
    for (let p = s; p <= e; p++) {
        const b = document.createElement("button");
        b.className = "btn-page" + (p === current ? " active" : "");
        b.textContent = p;
        b.onclick = (() => {
            const pp = p;
            return () => onPage(pp);
        })();
        btnsEl.appendChild(b);
    }
    const next = document.createElement("button");
    next.className = "btn-page";
    next.textContent = "←";
    next.disabled = current === pages;
    next.onclick = () => onPage(current + 1);
    btnsEl.appendChild(next);
}

function exportOrdersCSV() {
    const h = [ "رقم الطلب", "الاسم", "البريد", "الخطة", "المبلغ", "المقارنات", "الحالة", "التاريخ" ];
    const rows = filteredOrders.map(o => [ o.id, o.name, o.account_email || o.email || "", o.label, o.price, o.comparisons, o.status, o.created_at ? new Date(o.created_at).toLocaleString("ar-EG") : "" ]);
    dlCSV([ h, ...rows ], `orders_${(new Date).toISOString().slice(0, 10)}.csv`);
    showToast("📥 تم تصدير الطلبات");
}

function exportUsersCSV() {
    const h = [ "البريد", "الخطة", "الإجمالي", "المستهلك", "المتبقي" ];
    const rows = filteredUsers.map(u => {
        const ttl = u.total || 0;
        const pd = PLAN_DATA[u.plan];
        return [ u.account_email || u.email || u.user_id, pd ? pd.label : "—", ttl, Math.max(0, ttl - (u.remaining || 0)), u.remaining || 0 ];
    });
    dlCSV([ h, ...rows ], `users_${(new Date).toISOString().slice(0, 10)}.csv`);
    showToast("📥 تم تصدير المستخدمين");
}

function csvCell(value) {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
    return text.replace(/"/g, '""');
}

function dlCSV(rows, fname) {
    const csv = "\ufeff" + rows.map(r => r.map(c => `"${csvCell(c)}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(new Blob([ csv ], {
            type: "text/csv;charset=utf-8"
        })),
        download: fname
    });
    a.click();
}

function showToast(msg, isError = false, type = "") {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast" + (isError ? " error" : type === "info" ? " info" : "");
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3e3);
}

setInterval(() => {
    if (document.getElementById("loginScreen").style.display === "none") {
        loadOrders();
        loadUsers();
    }
}, 6e4);
