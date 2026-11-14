const pageHandlers = {
    0: function(event) {
        handleLogout();
    },
    1: function(event) {
        handleLogout();
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
