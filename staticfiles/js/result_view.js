document.addEventListener("DOMContentLoaded", () => {
    initReassignSuccessModal();
    initTableSearch();
    initTooltips();
});

function initReassignSuccessModal() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reassigned") !== "1") return;

    const el = document.getElementById("reassignSuccessModal");
    if (!el || !window.bootstrap) return;

    const moveFocusOutside = () => {
        const active = document.activeElement;
        if (active && el.contains(active)) {
            active.blur();
        }

        const focusable = Array.from(
            document.querySelectorAll(
                'a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
            ),
        ).find((node) => !el.contains(node) && !node.hasAttribute("disabled"));

        if (focusable) {
            focusable.focus();
        }
    };

    el.addEventListener("hide.bs.modal", moveFocusOutside);
    el.addEventListener("hidden.bs.modal", moveFocusOutside);

    const modal = window.bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
}

function initTableSearch() {
    const input = document.getElementById("tableSearch");
    if (!input) return;

    const rows = document.querySelectorAll(".table-custom tbody tr");

    input.addEventListener("input", () => {
        const keyword = input.value.trim().toLowerCase();

        rows.forEach((row) => {
            const text = row.innerText.toLowerCase();
            row.style.display = text.includes(keyword) ? "" : "none";
        });
    });
}

function initTooltips() {
    if (!window.bootstrap) return;

    const tooltipTriggerList = document.querySelectorAll(
        '[data-bs-toggle="tooltip"]',
    );

    tooltipTriggerList.forEach((el) => {
        new window.bootstrap.Tooltip(el);
    });
}
