const referencePattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const walletBodyLimit = 256;
const upstreamRoute = "https://api.liketwin.com/api/payments/direct/solana-pay/";

function reject(status, detail, extraHeaders = {}) {
    return Response.json({detail}, {
        status,
        headers: {"Cache-Control": "no-store", ...extraHeaders},
    });
}

async function readAccount(request) {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const data = new Uint8Array(walletBodyLimit);
    let length = 0;
    try {
        for (;;) {
            const {done, value} = await reader.read();
            if (done) break;
            if (length + value.byteLength > walletBodyLimit) {
                await reader.cancel();
                return null;
            }
            data.set(value, length);
            length += value.byteLength;
        }
        const payload = JSON.parse(new TextDecoder().decode(data.subarray(0, length)));
        const account = payload?.account;
        return typeof account === "string" && referencePattern.test(account) &&
            Object.keys(payload).length === 1 ? account : null;
    } catch (_) {
        return null;
    } finally {
        reader.releaseLock();
    }
}

export async function onRequest({request, params}) {
    const {method} = request;
    if (method !== "GET" && method !== "POST") {
        return reject(405, "Method not allowed.", {"Allow": "GET, POST"});
    }
    const {reference} = params;
    if (typeof reference !== "string" || !referencePattern.test(reference)) {
        return reject(404, "الفاتورة غير موجودة.");
    }

    const headers = new Headers({"Accept": "application/json"});
    const options = {method, headers, redirect: "error", signal: AbortSignal.timeout(25000)};
    if (method === "POST") {
        if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
            return reject(415, "Expected an application/json request.");
        }
        const account = await readAccount(request);
        if (!account) return reject(400, "عنوان المحفظة غير صالح.");
        headers.set("Content-Type", "application/json");
        options.body = JSON.stringify({account});
    }

    try {
        const response = await fetch(upstreamRoute + reference, options);
        if (!response.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
            return reject(502, "تعذر الاتصال بخدمة الدفع.");
        }
        const resultHeaders = new Headers({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        });
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) resultHeaders.set("Retry-After", retryAfter);
        return new Response(response.body, {status: response.status, headers: resultHeaders});
    } catch (_) {
        return reject(502, "تعذر الاتصال بخدمة الدفع.");
    }
}
