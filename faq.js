(() => {
    "use strict";

    const trigger = document.getElementById("faqButton");
    const dialog = document.getElementById("faqDialog");
    const closeButton = document.getElementById("faqClose");
    const results = document.getElementById("vRes");
    if (!trigger || !dialog || !closeButton || !results || typeof dialog.showModal !== "function") return;

    function syncAvailability() {
        trigger.hidden = results.classList.contains("on");
        if (trigger.hidden && dialog.open) dialog.close();
    }

    trigger.addEventListener("click", () => {
        syncAvailability();
        if (trigger.hidden || dialog.open) return;
        dialog.showModal();
        trigger.setAttribute("aria-expanded", "true");
    });

    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
        trigger.setAttribute("aria-expanded", "false");
        if (!trigger.hidden) {
            trigger.focus({preventScroll: true});
        } else {
            const heading = Array.from(results.querySelectorAll("h2"))
                .find(element => element.getClientRects().length > 0);
            if (heading) {
                heading.tabIndex = -1;
                heading.focus({preventScroll: true});
            }
        }
    });

    function outsideDialog(event) {
        const rect = dialog.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom;
    }
    let startedOnBackdrop = false;
    dialog.addEventListener("pointerdown", event => {
        startedOnBackdrop = event.target === dialog && outsideDialog(event);
    });
    dialog.addEventListener("click", event => {
        if (startedOnBackdrop && event.target === dialog && outsideDialog(event)) dialog.close();
        startedOnBackdrop = false;
    });

    new MutationObserver(syncAvailability).observe(results, {
        attributes: true,
        attributeFilter: ["class"],
    });
    syncAvailability();
})();
