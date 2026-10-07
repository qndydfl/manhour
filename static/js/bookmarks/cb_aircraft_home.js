(function () {
    "use strict";

    const list = document.getElementById("cbAircraftTemplateList");
    const search = document.getElementById("cbTemplateSearch");
    const clearButton = document.getElementById("cbTemplateSearchClear");
    const sort = document.getElementById("cbTemplateSort");
    const resultCount = document.getElementById("cbTemplateResultCount");
    const noResults = document.getElementById("cbTemplateNoResults");
    const panel = document.getElementById("cbAircraftTemplates");

    if (!list || !search || !sort) return;

    const rows = Array.from(list.querySelectorAll(".cb-aircraft-template-row"));
    const koreanOrder = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

    function normalized(value) {
        return String(value || "").trim().toLocaleLowerCase("ko");
    }

    function compareRows(first, second) {
        const mode = sort.value;
        if (mode === "name-asc") {
            return koreanOrder.compare(first.dataset.templateName, second.dataset.templateName);
        }
        if (mode === "rows-desc") {
            return Number(second.dataset.templateRows) - Number(first.dataset.templateRows);
        }
        return Number(second.dataset.templateUpdated) - Number(first.dataset.templateUpdated);
    }

    function updateListHeight() {
        const visibleRows = rows.filter(function (row) { return !row.hidden; });
        list.classList.toggle("is-scrollable", visibleRows.length > 10);

        if (visibleRows.length <= 10) {
            list.style.removeProperty("--cb-template-list-height");
            list.scrollTop = 0;
            return;
        }

        const firstRowTop = visibleRows[0].offsetTop;
        const tenthRow = visibleRows[9];
        const tenRowsHeight = tenthRow.offsetTop + tenthRow.offsetHeight - firstRowTop;
        if (tenRowsHeight > 0) {
            list.style.setProperty("--cb-template-list-height", tenRowsHeight + "px");
        }
    }

    function updateList() {
        const query = normalized(search.value);
        let visibleCount = 0;

        rows.sort(compareRows).forEach(function (row) {
            const isVisible = !query || normalized(row.dataset.templateName).includes(query);
            row.hidden = !isVisible;
            if (isVisible) visibleCount += 1;
            list.appendChild(row);
        });

        clearButton.hidden = !search.value;
        resultCount.textContent = query
            ? "검색 결과 " + visibleCount + "개"
            : "총 " + visibleCount + "개";
        noResults.hidden = visibleCount !== 0;
        list.hidden = visibleCount === 0;

        window.requestAnimationFrame(updateListHeight);
    }

    search.addEventListener("input", updateList);
    sort.addEventListener("change", updateList);
    clearButton.addEventListener("click", function () {
        search.value = "";
        search.focus();
        updateList();
    });
    window.addEventListener("resize", updateListHeight);
    if (panel) {
        panel.addEventListener("shown.bs.collapse", updateListHeight);
    }

    updateList();
})();
