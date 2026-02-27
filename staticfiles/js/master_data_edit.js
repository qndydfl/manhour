function normalizeGibun(value) {
    const trimmed = value.trim().toUpperCase();
    if (/^\d+$/.test(trimmed)) {
        return `HL${trimmed}`;
    }
    return trimmed;
}

function digitsOnly(value) {
    return value.replace(/\D+/g, "");
}

function decimalOnly(value) {
    const cleaned = value.replace(/[^\d.]+/g, "");
    const parts = cleaned.split(".");
    if (parts.length <= 2) {
        return cleaned;
    }
    return `${parts[0]}.${parts.slice(1).join("")}`;
}

document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".js-gibun-code").forEach(function (input) {
        input.addEventListener("blur", function (event) {
            event.target.value = normalizeGibun(event.target.value);
        });
    });

    document.querySelectorAll(".js-numeric-only").forEach(function (input) {
        input.addEventListener("input", function (event) {
            event.target.value = digitsOnly(event.target.value);
        });
    });

    document.querySelectorAll(".js-decimal-only").forEach(function (input) {
        input.addEventListener("input", function (event) {
            event.target.value = decimalOnly(event.target.value);
        });
    });

    const selectAll = document.querySelector(".js-select-all");
    const rowCheckboxes = Array.from(
        document.querySelectorAll(".js-row-select"),
    );

    function updateSelectAllState() {
        if (!selectAll) {
            return;
        }
        if (rowCheckboxes.length === 0) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
            return;
        }
        const checkedCount = rowCheckboxes.filter(
            (item) => item.checked,
        ).length;
        selectAll.checked = checkedCount === rowCheckboxes.length;
        selectAll.indeterminate =
            checkedCount > 0 && checkedCount < rowCheckboxes.length;
    }

    if (selectAll) {
        selectAll.addEventListener("change", function (event) {
            rowCheckboxes.forEach(function (checkbox) {
                checkbox.checked = event.target.checked;
            });
            updateSelectAllState();
        });
    }

    rowCheckboxes.forEach(function (checkbox) {
        checkbox.addEventListener("change", updateSelectAllState);
    });

    document.querySelectorAll(".js-master-data-row").forEach(function (row) {
        const rowCheckbox = row.querySelector(".js-row-select");
        if (!rowCheckbox) {
            return;
        }
        row.querySelectorAll("input, textarea, select").forEach(
            function (field) {
                field.addEventListener("input", function () {
                    if (field === rowCheckbox) {
                        return;
                    }
                    rowCheckbox.checked = true;
                    updateSelectAllState();
                });
            },
        );
    });

    updateSelectAllState();
});
