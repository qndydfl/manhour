function normalizeGibun(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";

    if (/^HL\d+$/.test(raw)) {
        return raw;
    }

    const digits = raw.replace(/\D+/g, "");
    if (digits) {
        return `HL${digits}`;
    }

    return raw;
}

function digitsOnly(value, maxLength = null) {
    const digits = String(value || "").replace(/\D+/g, "");
    return maxLength ? digits.slice(0, maxLength) : digits;
}

function decimalOnly(value) {
    const cleaned = String(value || "").replace(/[^\d.]+/g, "");
    const parts = cleaned.split(".");

    if (parts.length <= 1) {
        return cleaned;
    }

    return `${parts[0]}.${parts.slice(1).join("")}`;
}

function normalizeDecimalBlur(value) {
    const cleaned = decimalOnly(value).trim();

    if (!cleaned || cleaned === ".") {
        return "";
    }

    if (cleaned.startsWith(".")) {
        return `0${cleaned}`;
    }

    return cleaned;
}

document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".js-gibun-code").forEach(function (input) {
        input.addEventListener("input", function (event) {
            event.target.value = event.target.value.toUpperCase();
        });

        input.addEventListener("blur", function (event) {
            event.target.value = normalizeGibun(event.target.value);
        });
    });

    document.querySelectorAll(".js-numeric-only").forEach(function (input) {
        const maxLength = input.dataset.maxlength
            ? Number(input.dataset.maxlength)
            : 4;

        input.addEventListener("input", function (event) {
            event.target.value = digitsOnly(event.target.value, maxLength);
        });

        input.addEventListener("blur", function (event) {
            const onlyDigits = digitsOnly(event.target.value, maxLength);
            event.target.value = onlyDigits ? onlyDigits.padStart(4, "0") : "";
        });
    });

    document.querySelectorAll(".js-decimal-only").forEach(function (input) {
        input.addEventListener("input", function (event) {
            event.target.value = decimalOnly(event.target.value);
        });

        input.addEventListener("blur", function (event) {
            event.target.value = normalizeDecimalBlur(event.target.value);
        });
    });

    const selectAll = document.querySelector(".js-select-all");
    const rowCheckboxes = Array.from(document.querySelectorAll(".js-row-select"));
    const rows = Array.from(document.querySelectorAll(".js-master-data-row"));

    function syncRowHighlight() {
        rows.forEach(function (row) {
            const checkbox = row.querySelector(".js-row-select");
            if (!checkbox) return;

            row.classList.toggle("row-selected", checkbox.checked);
        });
    }

    function updateSelectAllState() {
        if (!selectAll) return;

        if (rowCheckboxes.length === 0) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
            syncRowHighlight();
            return;
        }

        const checkedCount = rowCheckboxes.filter(function (item) {
            return item.checked;
        }).length;

        selectAll.checked = checkedCount === rowCheckboxes.length;
        selectAll.indeterminate =
            checkedCount > 0 && checkedCount < rowCheckboxes.length;

        syncRowHighlight();
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

    rows.forEach(function (row) {
        const rowCheckbox = row.querySelector(".js-row-select");
        if (!rowCheckbox) return;

        row.querySelectorAll("input, textarea, select").forEach(function (field) {
            if (field === rowCheckbox) return;

            field.addEventListener("input", function () {
                rowCheckbox.checked = true;
                updateSelectAllState();
            });

            field.addEventListener("change", function () {
                rowCheckbox.checked = true;
                updateSelectAllState();
            });
        });
    });

    updateSelectAllState();
});