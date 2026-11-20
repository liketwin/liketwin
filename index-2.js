(function() {
    try {
        var cached = localStorage.getItem("lt_auth");
        document.documentElement.classList.add(cached === "in" ? "auth-in" : "auth-out");
    } catch (e) {
        document.documentElement.classList.add("auth-out");
    }
    try {
        var cachedSub = localStorage.getItem("lt_sub");
        document.documentElement.classList.add(cachedSub === "show" ? "sub-show" : "sub-hide");
    } catch (e) {
        document.documentElement.classList.add("sub-hide");
    }
    try {
        var cachedUpload = localStorage.getItem("lt_upload");
        document.documentElement.classList.add(cachedUpload === "ready" ? "upload-ready" : "upload-locked");
    } catch (e) {
        document.documentElement.classList.add("upload-locked");
    }
})();
