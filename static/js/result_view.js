document.addEventListener("DOMContentLoaded", () => {
    initTableSearch();
    initTooltips();
});

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
