const pageHandlers = {
    0: function(event) {
        if (event.key === "Enter") doLogin();
    },
    1: function(event) {
        doLogin();
    },
    2: function(event) {
        setView("orders");
    },
    3: function(event) {
        setView("users");
    },
    4: function(event) {
        window.open("/", "_blank");
    },
    5: function(event) {
        window.open("/pricing", "_blank");
    },
    6: function(event) {
        window.open("/dashboard", "_blank");
    },
    7: function(event) {
        logOut();
    },
    8: function(event) {
        applyOrderFilters();
    },
    9: function(event) {
        applyOrderFilters();
    },
    10: function(event) {
        applyOrderFilters();
    },
    11: function(event) {
        loadOrders();
    },
    12: function(event) {
        exportOrdersCSV();
    },
    13: function(event) {
        applyUserFilters();
    },
    14: function(event) {
        applyUserFilters();
    },
    15: function(event) {
        applyUserFilters();
    },
    16: function(event) {
        loadUsers();
    },
    17: function(event) {
        exportUsersCSV();
    },
    18: function(event) {
        closeOrderModal(event);
    },
    19: function(event) {
        event.stopPropagation();
    },
    20: function(event) {
        closeOrderModal();
    },
    21: function(event) {
        closeUserModal(event);
    },
    22: function(event) {
        event.stopPropagation();
    },
    23: function(event) {
        closeUserModal();
    },
    24: function(event) {
        saveUserPlan();
    },
    25: function(event) {
        adjustCredits(-10);
    },
    26: function(event) {
        adjustCredits(-1);
    },
    27: function(event) {
        adjustCredits(1);
    },
    28: function(event) {
        adjustCredits(10);
    },
    29: function(event) {
        saveUserCredits();
    },
    30: function(event) {
        resetUser();
    }
};

document.addEventListener("keydown", function(event) {
    let node = event.target;
    while (node && node !== document) {
        if (node.hasAttribute && node.hasAttribute("data-lt-keydown")) {
            const fn = pageHandlers[node.getAttribute("data-lt-keydown")];
            if (fn) {
                if (fn.call(node, event) === false) event.preventDefault();
            }
            if (event.cancelBubble) break;
        }
        node = node.parentElement;
    }
});

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

document.addEventListener("input", function(event) {
    let node = event.target;
    while (node && node !== document) {
        if (node.hasAttribute && node.hasAttribute("data-lt-input")) {
            const fn = pageHandlers[node.getAttribute("data-lt-input")];
            if (fn) {
                if (fn.call(node, event) === false) event.preventDefault();
            }
            if (event.cancelBubble) break;
        }
        node = node.parentElement;
    }
});

document.addEventListener("change", function(event) {
    let node = event.target;
    while (node && node !== document) {
        if (node.hasAttribute && node.hasAttribute("data-lt-change")) {
            const fn = pageHandlers[node.getAttribute("data-lt-change")];
            if (fn) {
                if (fn.call(node, event) === false) event.preventDefault();
            }
            if (event.cancelBubble) break;
        }
        node = node.parentElement;
    }
});
