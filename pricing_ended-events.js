const pageHandlers = {
    0: function(event) {
        selectPlan(this);
    },
    1: function(event) {
        selectPlan(this);
    },
    2: function(event) {
        selectPlan(this);
    },
    3: function(event) {
        handleSubmit();
    },
    4: function(event) {
        copyOrderId();
    },
    5: function(event) {
        resetForm();
    },
    6: function(event) {
        resetForm();
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
