function normalizeGibun(value) {
    const digits = String(value || "").replace(/\D+/g, "").slice(0, 4);

    if (!digits) return "";
    return `HL${digits}`;
}

function digitsOnly(value, maxLength = null) {
    const digits = String(value || "").replace(/\D+/g, "");
    return maxLength ? digits.slice(0, maxLength) : digits;
}

function normalizeOp(value) {
    const digits = digitsOnly(value, 4);
    return digits ? digits.padStart(4, "0") : "";
}

function normalizeWorkOrder(value) {
    return digitsOnly(value, 10);
}

document.addEventListener("DOMContentLoaded", function () {
    // -----------------------------
    // 기번: 숫자만 4자리 입력, blur 시 HL 붙이기
    // -----------------------------
    document.querySelectorAll(".js-gibun-code").forEach(function (input) {
        input.addEventListener("input", function (event) {
            event.target.value = digitsOnly(event.target.value, 4);
        });

        input.addEventListener("blur", function (event) {
            event.target.value = normalizeGibun(event.target.value);
        });
    });

    // -----------------------------
    // Work Order: 숫자만 10자리
    // -----------------------------
    document.querySelectorAll(".js-work-order").forEach(function (input) {
        input.addEventListener("input", function (event) {
            event.target.value = normalizeWorkOrder(event.target.value);
        });

        input.addEventListener("blur", function (event) {
            event.target.value = normalizeWorkOrder(event.target.value);
        });
    });

    // -----------------------------
    // OP: 숫자만 4자리, blur 시 4자리 0채움
    // 예: 10 -> 0010
    // -----------------------------
    document.querySelectorAll(".js-op-code").forEach(function (input) {
        input.addEventListener("input", function (event) {
            event.target.value = digitsOnly(event.target.value, 4);
        });

        input.addEventListener("blur", function (event) {
            event.target.value = normalizeOp(event.target.value);
        });
    });

    // -----------------------------
    // 체크박스 / 선택 관련
    // -----------------------------
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

    // -----------------------------
    // 수정 버튼 / form submit 직전에 최종 정규화
    // -----------------------------
    const form = document.querySelector("#masterDataEditForm");

    if (form) {
        form.addEventListener("submit", function () {
            document.querySelectorAll(".js-gibun-code").forEach(function (input) {
                input.value = normalizeGibun(input.value);
            });

            document.querySelectorAll(".js-work-order").forEach(function (input) {
                input.value = normalizeWorkOrder(input.value);
            });

            document.querySelectorAll(".js-op-code").forEach(function (input) {
                input.value = normalizeOp(input.value);
            });
        });
    }
});