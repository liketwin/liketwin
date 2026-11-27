(() => {
    const chain = "solana:mainnet";
    const sendFeature = "solana:signAndSendTransaction";
    const solanaSignature = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
    const wallets = new Set();
    const mobile = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent) ||
        (/Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1);
    const statuses = {waiting:"بانتظار الدفع", completed:"تم تأكيد الدفع وتفعيل الخطة", expired:"انتهت صلاحية الفاتورة"};
    const explorers = {
        solana:"https://explorer.solana.com/tx/", bsc:"https://bscscan.com/tx/",
        opbnb:"https://opbnb.bscscan.com/tx/", polygon:"https://polygonscan.com/tx/",
        tron:"https://tronscan.org/#/transaction/", litecoin:"https://litecoinspace.org/tx/",
    };
    const walletEvent = "liketwin-phantom-ready";
    const registry = {
        register(...entries) {
            for (const entry of entries) wallets.add(entry);
            window.dispatchEvent(new Event(walletEvent));
            return () => {
                for (const entry of entries) wallets.delete(entry);
                window.dispatchEvent(new Event(walletEvent));
            };
        },
    };
    window.addEventListener("wallet-standard:register-wallet", ({detail}) => {
        if (typeof detail === "function") detail(registry);
    });
    window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", {detail:registry}));

    function phantom() {
        return [...wallets].find(wallet => /^phantom$/i.test(wallet.name) && wallet.chains?.includes(chain) &&
            wallet.features?.["standard:connect"] &&
            typeof wallet.features?.[sendFeature]?.signAndSendTransaction === "function" &&
            wallet.features[sendFeature].supportedTransactionVersions?.includes("legacy"));
    }

    function injectedPhantom() {
        const provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
        return typeof provider?.connect === "function" && typeof provider.signAndSendTransaction === "function" ? provider : null;
    }

    window.setupDirectCheckout = async ({userId, getPlan, onComplete}) => {
        const el = id => document.getElementById(id);
        const section = el("solanaCheckout");
        if (!section || !userId) return;
        const select = el("directAsset");
        const start = el("directStart");
        const recheck = el("directRecheck");
        const invoice = el("directInvoice");
        const qr = el("directPhoneCanvas");
        const choices = el("directPhantomPay");
        const walletButton = el("directPhantomSign");
        const app = el("directPhantomLink");
        const history = el("directPrevious");
        const message = el("solanaStatus");
        let configured = {};
        let order = null;
        let busy = false;
        let signing = false;
        let broadcastPending = false;
        let attempt = null;
        let qrUrl = "";
        let timer;
        let revision = 0;
        let plan = getPlan();

        async function request(path, data, signal) {
            const options = {credentials:"include", cache:"no-store", signal};
            if (data !== undefined) {
                options.method = "POST";
                options.headers = {"Content-Type":"application/json"};
                options.body = JSON.stringify(data);
            }
            const response = await fetch(CONFIG.API + "/api/payments/direct" + path, options);
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = typeof body.detail === "string" ? body.detail : body.detail?.message;
                throw new Error(detail || body.message || "تعذّر الاتصال بخدمة الدفع.");
            }
            return body;
        }

        function rememberAttempt(id, signature) {
            attempt = {signature, checks:0, nextCheck:0, checking:false};
            try {
                window.sessionStorage.setItem("liketwin-solana-attempt:" + id, signature);
            } catch (_) {
                // The current page can still track the transaction.
            }
            message.textContent = "استلمنا معرّف المعاملة من Phantom. جارٍ التحقق من وصول الدفعة…";
        }

        async function verifyAttempt(id) {
            const current = attempt;
            if (!current || order?.state === "completed" || current.checking ||
                current.checks >= 3 || Date.now() < current.nextCheck) return;
            current.checking = true;
            current.checks++;
            try {
                const result = await request("/orders/" + id + "/verify", {signature:current.signature}, AbortSignal.timeout(8000));
                if (current !== attempt || order?.state === "completed") return;
                if (result.completed) {
                    current.checks = 3;
                    message.textContent = "تم التحقق من الدفعة. جارٍ تحديث حالة الفاتورة…";
                } else {
                    message.textContent = "لم يتأكد وصول الدفعة بعد. يمكنك فتح رابط المعاملة لمتابعتها.";
                }
            } catch (_) {
                if (current === attempt && order?.state !== "completed") {
                    message.textContent = "تعذّر الاتصال بخدمة التحقق. يمكنك فتح رابط المعاملة لمتابعتها.";
                }
            } finally {
                current.checking = false;
                current.nextCheck = Date.now() + 8000;
            }
        }

        function render() {
            invoice.hidden = !order;
            select.disabled = busy || signing;
            start.disabled = busy || signing || !select.value;
            recheck.disabled = busy || signing;
            history.disabled = busy || signing;
            el("directReset").disabled = signing;
            if (!order) {
                choices.hidden = true;
                app.removeAttribute("href");
                return;
            }

            el("directOrderNumber").textContent = order.id.slice(0, 12).toUpperCase();
            el("directOrderAmount").textContent = order.amount + " " + order.label.split(" — ")[0];
            const state = el("directInvoiceState");
            state.textContent = order.state === "waiting" && (broadcastPending || attempt) ? "بانتظار تأكيد الدفع" : statuses[order.state];
            state.dataset.state = order.state;
            const expires = el("directExpires");
            expires.hidden = order.state !== "waiting";
            expires.textContent = "تنتهي الساعة " + new Intl.DateTimeFormat("ar", {
                hour:"2-digit", minute:"2-digit",
            }).format(new Date(order.expires_at));
            const tx = el("directTxLink");
            const signature = order.signature || attempt?.signature;
            tx.hidden = !signature || !explorers[order.network];
            if (!tx.hidden) tx.href = explorers[order.network] + encodeURIComponent(signature);

            const url = order.solana_pay_url;
            const canPay = order.state === "waiting" && !signing && !broadcastPending && !attempt && typeof url === "string" &&
                url.startsWith("solana:") && Date.parse(order.expires_at) > Date.now();
            choices.hidden = !canPay;
            walletButton.hidden = mobile || !canPay || !(phantom() || injectedPhantom());
            app.hidden = !mobile;
            if (canPay && mobile) app.href = url;
            else app.removeAttribute("href");
            if (canPay && qrUrl !== url) {
                qrUrl = url;
                qr.hidden = true;
                void import("./invoice-qr.js").then(({drawQr}) => {
                    if (qrUrl !== url || order?.solana_pay_url !== url) return;
                    drawQr(qr, url);
                    qr.hidden = false;
                }).catch(() => {
                    if (qrUrl === url) {
                        qrUrl = "";
                        message.textContent = "تعذّر عرض رمز QR. أعد فتح الفاتورة للمحاولة مجددًا.";
                    }
                });
            }
        }

        async function refreshHistory() {
            try {
                const {orders} = await request("/orders");
                history.replaceChildren(new Option("اختر فاتورة", ""));
                for (const item of orders) {
                    const summary = item.id.slice(0, 12).toUpperCase() + " · " + item.amount + " " + item.label;
                    history.add(new Option(summary, item.id));
                }
                el("directHistory").hidden = !orders.length;
            } catch (_) {}
        }

        async function checkAssets() {
            if (busy || signing) return;
            busy = true;
            render();
            try {
                const {assets} = await request("/solana-availability");
                const ready = Object.entries(configured).filter(([key]) => assets[key] === "available");
                const unavailable = Object.keys(configured).filter(key => assets[key] !== "available");
                const selected = select.value;
                select.replaceChildren(new Option("اختر العملة", ""));
                for (const [key, label] of ready) select.add(new Option(label.split(" — ")[0], key));
                if (ready.some(([key]) => key === selected)) select.value = selected;
                const availability = el("directUnavailable");
                availability.hidden = !unavailable.length;
                availability.textContent = unavailable.map(key => configured[key].split(" — ")[0]).join("، ") + " غير متاحة مؤقتًا.";
                recheck.hidden = !unavailable.length;
                message.textContent = "";
            } catch (error) {
                message.textContent = error.message;
                recheck.hidden = false;
            } finally {
                busy = false;
                render();
            }
        }

        function resetInvoice() {
            clearTimeout(timer);
            revision++;
            order = null;
            qrUrl = "";
            broadcastPending = false;
            attempt = null;
            const url = new URL(location.href);
            url.searchParams.delete("direct_order");
            window.history.replaceState(window.history.state, "", url);
            render();
        }

        async function refresh(id, version) {
            try {
                const state = order?.state;
                const value = await request("/orders/" + id);
                if (version !== revision) return;
                order = value;
                render();
                if (state !== "completed" && value.state === "completed") {
                    message.textContent = "";
                    void Promise.resolve().then(onComplete).catch(() => {});
                    void refreshHistory();
                }
            } catch (_) {
                // A transient error must not stop monitoring an existing invoice.
            } finally {
                if (version === revision && order?.state !== "completed") {
                    void verifyAttempt(id);
                    timer = setTimeout(() => void refresh(id, version), order?.state === "expired" ? 30000 : 8000);
                }
            }
        }

        function showOrder(value) {
            order = value;
            broadcastPending = false;
            qrUrl = "";
            const url = new URL(location.href);
            url.searchParams.set("direct_order", value.id);
            window.history.replaceState(window.history.state, "", url);
            const version = revision;
            if (value.state !== "completed") timer = setTimeout(() => void refresh(value.id, version), 3200);
            render();
        }

        async function changeOrder(path, data) {
            if (busy || signing || (data && !select.value)) return;
            resetInvoice();
            busy = true;
            message.textContent = "جارٍ تجهيز الفاتورة…";
            render();
            try {
                const value = await request(path, data);
                showOrder(value);
                let signature;
                try {
                    signature = window.sessionStorage.getItem("liketwin-solana-attempt:" + value.id);
                } catch (_) {}
                if (value.network === "solana" && value.state !== "completed" && signature && solanaSignature.test(signature)) {
                    rememberAttempt(value.id, signature);
                    void verifyAttempt(value.id);
                } else {
                    message.textContent = value.state === "waiting" && !value.solana_pay_url
                        ? "تتابع هذه الصفحة حالة دفعتك السابقة." : "";
                }
                if (data) void refreshHistory();
            } catch (error) {
                message.textContent = error.message;
                recheck.hidden = false;
            } finally {
                busy = false;
                render();
            }
        }

        async function signWithPhantom() {
            if (signing || broadcastPending || attempt || order?.state !== "waiting" ||
                !order.solana_pay_url || Date.parse(order.expires_at) <= Date.now()) return;
            const id = order.id;
            const standard = phantom();
            const injected = injectedPhantom();
            if (!standard && !injected) return;
            signing = true;
            let stage = "connect";
            message.textContent = "جارٍ ربط Phantom…";
            render();
            function waitForConfirmation(status) {
                broadcastPending = true;
                message.textContent = status;
                const current = revision;
                setTimeout(() => {
                    if (current !== revision || order?.state !== "waiting") return;
                    broadcastPending = false;
                    message.textContent = "إن سبق أن وافقت على التحويل، راجع حالته في Phantom قبل الدفع مرة أخرى.";
                    render();
                }, 120000);
            }
            try {
                const {encodeSignature, sendLegacy} = await import("./invoice-solana-send.js");
                let account;
                let address;
                if (standard) {
                    const {accounts} = await standard.features["standard:connect"].connect();
                    account = accounts.find(item => item.chains.includes(chain) && item.features?.includes(sendFeature));
                    address = account?.address;
                } else {
                    const {publicKey} = await injected.connect();
                    address = publicKey?.toString();
                }
                if (!address) throw new Error("اختر حساب Solana في Phantom.");
                if (order?.id !== id || order.state !== "waiting" || Date.parse(order.expires_at) <= Date.now()) return;

                stage = "prepare";
                message.textContent = "جارٍ تجهيز معاملة Solana…";
                const {transaction} = await request("/orders/" + id + "/transaction", {address});
                const bytes = Uint8Array.from(atob(transaction), char => char.charCodeAt(0));
                if (order?.id !== id || order.state !== "waiting" || Date.parse(order.expires_at) <= Date.now()) return;

                stage = "send";
                message.textContent = "راجع المبلغ في Phantom ثم وافق على الدفع.";
                let signature;
                if (standard) {
                    const [result] = await standard.features[sendFeature].signAndSendTransaction({
                        account, chain, transaction:bytes, options:{skipPreflight:false},
                    });
                    signature = encodeSignature(result?.signature);
                } else {
                    signature = await sendLegacy(injected, bytes);
                }
                if (typeof signature !== "string" || !solanaSignature.test(signature)) {
                    throw new Error("Phantom did not return a transaction signature");
                }
                rememberAttempt(id, signature);
                void verifyAttempt(id);
            } catch (error) {
                if (error?.code === 4001) {
                    message.textContent = "أُلغيت العملية في Phantom.";
                } else if (stage === "send") {
                    waitForConfirmation("تعذّر معرفة حالة الإرسال. راجع سجل Phantom قبل إعادة الدفع.");
                } else {
                    const description = stage === "prepare" ? "تعذّر تجهيز المعاملة" : "تعذّر ربط Phantom";
                    message.textContent = description + (error?.message ? " — " + error.message : ".");
                }
            } finally {
                signing = false;
                if (order?.state === "completed") message.textContent = "";
                render();
            }
        }

        select.addEventListener("change", () => {
            if (order) resetInvoice();
            message.textContent = "";
            render();
        });
        start.addEventListener("click", () => void changeOrder("/orders", {plan_id:getPlan(), asset:select.value, invoice_version:3}));
        recheck.addEventListener("click", () => void checkAssets());
        app.addEventListener("click", event => {
            if (!order || signing || broadcastPending || attempt || Date.parse(order.expires_at) <= Date.now()) {
                event.preventDefault();
                return;
            }
            if (phantom() || injectedPhantom()) {
                event.preventDefault();
                void signWithPhantom();
            }
        });
        walletButton.addEventListener("click", () => void signWithPhantom());
        el("directReset").addEventListener("click", () => {
            resetInvoice();
            message.textContent = "";
            select.focus();
        });
        history.addEventListener("change", () => {
            if (/^[0-9a-f]{32}$/.test(history.value)) void changeOrder("/orders/" + history.value);
        });
        window.addEventListener(walletEvent, render);
        window.addEventListener("load", render, {once:true});
        window.addEventListener("focus", render);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) render();
        });
        const summary = el("summaryPlan");
        if (summary) new MutationObserver(() => {
            if (plan === getPlan() || signing || busy) return;
            plan = getPlan();
            resetInvoice();
            message.textContent = "";
        }).observe(summary, {childList:true, characterData:true, subtree:true});

        try {
            const config = await request("/config");
            if (config.checkout_revision !== "phantom-solana-v1") return;
            configured = config.assets || {};
            section.hidden = false;
            if (Object.keys(configured).length) await checkAssets();
            else {
                el("directNewInvoice").hidden = true;
                message.textContent = "الدفع عبر Solana غير متاح مؤقتًا.";
            }
            void refreshHistory();
            const id = new URL(location.href).searchParams.get("direct_order");
            if (/^[0-9a-f]{32}$/.test(id || "")) await changeOrder("/orders/" + id);
        } catch (_) {}
    };
})();
