const CONFIG = Object.freeze({
    API: "https://api.liketwin.com"
});

try {
    if (typeof localStorage !== "undefined") localStorage.removeItem("liketwin_live_stats_creds");
} catch (_) {}
