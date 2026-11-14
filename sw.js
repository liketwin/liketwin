importScripts("config.js");

const DB_NAME = "liketwin-sw";

const DB_STORE = "uploads";

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(DB_STORE)) {
                req.result.createObjectStore(DB_STORE, {
                    keyPath: "id"
                });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveUploadState(id, state) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put({
            id: id,
            ...state,
            ts: Date.now()
        });
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => reject(tx.error);
    });
}

async function deleteUploadState(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(id);
        tx.oncomplete = () => {
            db.close();
            resolve();
        };
        tx.onerror = () => reject(tx.error);
    });
}

self.addEventListener("install", event => {
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

async function notifyClients(msg) {
    try {
        const list = await self.clients.matchAll({
            includeUncontrolled: true
        });
        list.forEach(c => c.postMessage(msg));
    } catch (e) {}
}

const activeControllers = new Map;

async function doUpload(uploadId, apiBase, file) {
    const ctrl = new AbortController;
    activeControllers.set(uploadId, ctrl);
    try {
        await saveUploadState(uploadId, {status: "uploading"});
        const fd = new FormData;
        fd.append("file", file);
        const headers = {};
        const res = await fetch(`${apiBase}/compare_audio`, {
            method: "POST",
            body: fd,
            credentials: "include",
            headers: headers,
            signal: ctrl.signal
        });
        const data = await res.json();
        await saveUploadState(uploadId, {
            status: "done",
            data: data
        });
        await notifyClients({
            type: "upload-complete",
            uploadId: uploadId,
            data: data
        });
    } catch (err) {
        if (err && err.name === "AbortError") {
            await deleteUploadState(uploadId);
        } else {
            await saveUploadState(uploadId, {
                status: "error",
                error: String(err && err.message || err)
            });
            await notifyClients({
                type: "upload-error",
                uploadId: uploadId,
                error: String(err && err.message || err)
            });
        }
    } finally {
        activeControllers.delete(uploadId);
    }
}

self.addEventListener("message", event => {
    const msg = event.data;
    if (!msg || !msg.type || !event.source || new URL(event.source.url).origin !== self.location.origin) return;
    if (msg.type === "start-upload") {
        const {uploadId, apiBase, file} = msg;
        if (!event.source || new URL(event.source.url).origin !== self.location.origin) return;
        if (apiBase !== CONFIG.API || typeof uploadId !== "string" || uploadId.length > 100 || !(file instanceof Blob) || file.size > 20 * 1024 * 1024) return;
        if (activeControllers.has(uploadId)) return;
        if (activeControllers.size >= 2) {
            event.waitUntil((async () => {
                const data = {status: 'error', message: 'هناك رفع جارٍ، حاول بعد قليل'};
                await saveUploadState(uploadId, {status: 'done', data});
                await notifyClients({type: 'upload-complete', uploadId, data});
            })());
            return;
        }
        event.waitUntil(doUpload(uploadId, apiBase, file));
        return;
    }
    if (msg.type === "cancel-upload") {
        const c = activeControllers.get(msg.uploadId);
        if (c) c.abort();
        return;
    }
});
