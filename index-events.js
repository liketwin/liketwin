const pageHandlers = {
    0: function(event) {
        toggleMobileMenu();
    },
    1: function(event) {
        toggleAuthExtra();
    },
    2: function(event) {
        retryComparison();
    },
    3: function(event) {
        copyResult();
    },
    4: function(event) {
        openShareModal();
    },
    5: function(event) {
        copyResult();
    },
    6: function(event) {
        openShareModal();
    },
    7: function(event) {
        resetToUpload();
    },
    8: function(event) {
        handleOverlayClick(event);
    },
    9: function(event) {
        closeShareModal();
    },
    10: function(event) {
        copyModalText();
    },
    11: function(event) {
        shareTo("whatsapp");
    },
    12: function(event) {
        shareTo("facebook");
    },
    13: function(event) {
        shareTo("telegram");
    },
    14: function(event) {
        shareTo("twitter");
    },
    15: function(event) {
        shareTo("instagram");
    },
    16: function(event) {
        shareTo("tiktok");
    },
    17: function(event) {
        toggleAccordion(this);
    }
};

document.addEventListener("click", function(event) {
    let node = event.target;
    while (node && node !== document) {
        if (node.hasAttribute && node.hasAttribute("data-lt-click")) {
            const fn = pageHandlers[node.getAttribute("data-lt-click")];
            if (fn) {
                if (fn.call(node, event) === false) event.preventDefault();
            }
            if (event.cancelBubble) break;
        }
        node = node.parentElement;
    }
});
