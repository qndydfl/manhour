const tableBody = document.querySelector("#gridTable tbody");
const ROW_COUNT = 5;
const COL_COUNT = 5;
let suspendedPasteModalInstance = null;

const COLUMN_PLACEHOLDERS = [
    "HLxxxx",
    "Work Order",
    "0010",
    "Description",
    "0.0",
];

function ensureMinimumRows(count = ROW_COUNT) {
    if (!tableBody) return;
    while (tableBody.children.length < count) {
        createRow();
    }
}

function initTable() {
    ensureMinimumRows();
}

function createInputByColumn(colIndex) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "input-cell form-control form-control-sm text-center";
    input.placeholder = COLUMN_PLACEHOLDERS[colIndex] || "-";
    input.autocomplete = "off";
    input.spellcheck = false;

    if (colIndex === 0) {
        // 기번: 숫자 4자리만 입력, 저장 시 HL 붙임
        input.inputMode = "numeric";
        input.maxLength = 4;
    }

    if (colIndex === 1) {
        // Work Order: 숫자 10자리까지
        input.inputMode = "numeric";
        input.maxLength = 10;
    }

    if (colIndex === 2) {
        // OP: 숫자 4자리까지 입력, blur 시 4자리 보정
        input.inputMode = "numeric";
        input.maxLength = 4;
        input.addEventListener("blur", function (e) {
            e.target.value = normalizeOp(e.target.value);
        });
    }

    if (colIndex === 4) {
        // M/H: 소수 입력 허용
        input.inputMode = "decimal";
    }

    input.addEventListener("paste", handlePaste);
    input.addEventListener("input", (e) => handleCellInput(e, colIndex));

    return input;
}

function createRow() {
    const tr = document.createElement("tr");

    for (let j = 0; j < COL_COUNT; j++) {
        const td = document.createElement("td");
        const input = createInputByColumn(j);
        td.appendChild(input);
        tr.appendChild(td);
    }

    tableBody.appendChild(tr);
}

function handleCellInput(e, colIndex) {
    const input = e.target;
    if (!input) return;

    if (colIndex === 0) {
        input.value = normalizeGibunRaw(input.value);
    } else if (colIndex === 1) {
        input.value = normalizeWoRaw(input.value);
    } else if (colIndex === 2) {
        input.value = normalizeOpRaw(input.value);
    } else if (colIndex === 4) {
        input.value = normalizeMhRaw(input.value);
    }
}

function normalizeGibunRaw(value) {
    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 4);
}

function formatGibunForSave(value) {
    const digits = normalizeGibunRaw(value);
    return digits ? `HL${digits}` : "";
}

function normalizeWoRaw(value) {
    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 10);
}

function normalizeOpRaw(value) {
    return String(value || "")
        .replace(/\D/g, "")
        .slice(0, 4);
}

function normalizeOp(value) {
    const digits = String(value || "")
        .replace(/\D/g, "")
        .slice(0, 4);
    return digits ? digits.padStart(4, "0") : "";
}

function normalizeMhRaw(value) {
    const raw = String(value || "").replace(/[^0-9.]/g, "");
    const parts = raw.split(".");

    if (parts.length <= 1) return raw;
    return `${parts[0]}.${parts.slice(1).join("")}`;
}

function flashInput(input) {
    if (!input) return;
    input.classList.add("paste-highlight");
    setTimeout(() => {
        input.classList.remove("paste-highlight");
    }, 300);
}

window.addRow = function () {
    createRow();
};

function ensureRow(rowIndex) {
    while (tableBody.children.length <= rowIndex) {
        createRow();
    }
    return tableBody.children[rowIndex];
}

function setInputValueByColumn(input, colIndex, value) {
    const text = String(value ?? "").trim();

    if (colIndex === 0) {
        input.value = normalizeGibunRaw(text);
    } else if (colIndex === 1) {
        input.value = normalizeWoRaw(text);
    } else if (colIndex === 2) {
        input.value = normalizeOp(text);
    } else if (colIndex === 4) {
        input.value = normalizeMhRaw(text);
    } else {
        input.value = text;
    }
}

function handlePaste(e) {
    e.preventDefault();

    const clipboard = (e.clipboardData || window.clipboardData).getData("text");
    if (!clipboard) return;

    const lines = clipboard.replace(/\r/g, "").split("\n");

    const currentInput = e.target;
    const currentCell = currentInput.closest("td");
    const currentRow = currentInput.closest("tr");

    if (!currentCell || !currentRow) return;

    const startRowIndex = Array.from(tableBody.children).indexOf(currentRow);
    const startColIndex = Array.from(currentRow.children).indexOf(currentCell);

    lines.forEach((line, rIndex) => {
        if (line == null) return;

        const cols = line.split("\t");
        const hasAnyValue = cols.some((c) => String(c ?? "").trim() !== "");
        if (!hasAnyValue) return;

        const targetRow = ensureRow(startRowIndex + rIndex);
        if (!targetRow) return;

        for (let cIndex = 0; cIndex < cols.length; cIndex++) {
            const absoluteColIndex = startColIndex + cIndex;
            if (absoluteColIndex >= COL_COUNT) break;

            const targetCell = targetRow.children[absoluteColIndex];
            if (!targetCell) continue;

            const input = targetCell.querySelector("input");
            if (!input) continue;

            setInputValueByColumn(input, absoluteColIndex, cols[cIndex]);
            flashInput(input);
        }
    });
}

function getCsrfToken() {
    const csrfInput = document.querySelector("[name=csrfmiddlewaretoken]");
    return csrfInput ? csrfInput.value : "";
}

function collectRowData() {
    const data = [];
    const rows = tableBody.querySelectorAll("tr");

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const tr = rows[rowIndex];
        const inputs = tr.querySelectorAll("input");
        if (inputs.length < COL_COUNT) continue;

        const gibunRaw = normalizeGibunRaw(inputs[0].value);
        const gibun = formatGibunForSave(inputs[0].value);
        const wo = normalizeWoRaw(inputs[1].value);
        const op = normalizeOp(inputs[2].value);
        const desc = inputs[3].value.trim();
        const mh = normalizeMhRaw(inputs[4].value.trim());

        const values = [gibunRaw, wo, op, desc, mh];
        const filledCount = values.filter(
            (v) => String(v || "").trim() !== "",
        ).length;

        // 완전 공란 행 스킵
        if (filledCount === 0) continue;

        // 기번 일부만 입력한 경우 경고
        if (gibunRaw && gibunRaw.length !== 4) {
            void showCustomMessageDialog({
                title: "입력값 확인",
                message: `${rowIndex + 1}행 기번은 숫자 4자리를 입력해야 합니다.`,
                variant: "danger",
            });
            return null;
        }

        // 최소 3개 열 + 기번 필수
        if (filledCount < 3 || !gibun) continue;

        data.push({
            row_number: rowIndex + 1,
            gibun_code: gibun,
            work_order: wo,
            op: op,
            description: desc,
            default_mh: mh,
        });
    }

    return data;
}

function findDuplicates(data) {
    const pairMap = new Map();
    const duplicates = [];

    data.forEach((row) => {
        const gibun = (row.gibun_code || "").trim().toUpperCase();
        const wo = (row.work_order || "").trim().toUpperCase();
        const op = (row.op || "").trim().toUpperCase();

        if (!gibun || !wo || !op) return;

        const key = `${gibun}::${wo}::${op}`;

        if (pairMap.has(key)) {
            duplicates.push({
                key,
                firstRow: pairMap.get(key),
                dupRow: row.row_number,
            });
        } else {
            pairMap.set(key, row.row_number);
        }
    });

    return duplicates;
}

function showCustomConfirmDialog({
    title,
    message,
    items = [],
    confirmText,
    variant = "danger",
    showCancel = true,
}) {
    const dialog = document.getElementById("duplicateDataConfirmDialog");
    const cardEl = dialog?.querySelector(".duplicate-confirm-card");
    const titleEl = document.getElementById("duplicateConfirmTitle");
    const messageEl = document.getElementById("duplicateConfirmMessage");
    const iconEl = document.getElementById("customConfirmIcon");
    const listWrapEl = document.getElementById("duplicateConfirmListWrap");
    const listEl = document.getElementById("duplicateConfirmList");
    const cancelBtn = document.getElementById("duplicateConfirmCancelBtn");
    const proceedBtn = document.getElementById("duplicateConfirmProceedBtn");

    if (
        !dialog ||
        !cardEl ||
        !titleEl ||
        !messageEl ||
        !iconEl ||
        !listWrapEl ||
        !listEl ||
        !cancelBtn ||
        !proceedBtn
    ) {
        if (!window.AppDialog) return Promise.resolve(false);

        if (showCancel) {
            return window.AppDialog.confirm(message, {
                title,
                variant,
                confirmText,
            });
        }

        return window.AppDialog.alert(message, {
            title,
            variant,
            confirmText,
        }).then(() => true);
    }

    const pasteModalEl = document.getElementById("pasteDataModal");
    const pasteModalIsOpen = Boolean(
        pasteModalEl?.classList.contains("show") && window.bootstrap?.Modal,
    );
    let pasteModalHidden = Promise.resolve();

    if (pasteModalIsOpen) {
        suspendedPasteModalInstance =
            window.bootstrap.Modal.getOrCreateInstance(pasteModalEl);
        pasteModalHidden = new Promise((resolve) => {
            pasteModalEl.addEventListener("hidden.bs.modal", resolve, {
                once: true,
            });
        });
        suspendedPasteModalInstance.hide();
    }

    const isDanger = variant === "danger";
    const isSuccess = variant === "success";
    cardEl.classList.toggle("duplicate-confirm-card-danger", isDanger);
    cardEl.classList.toggle(
        "duplicate-confirm-card-primary",
        !isDanger && !isSuccess,
    );
    cardEl.classList.toggle("duplicate-confirm-card-success", isSuccess);
    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.classList.toggle("duplicate-confirm-icon-danger", isDanger);
    iconEl.classList.toggle(
        "duplicate-confirm-icon-primary",
        !isDanger && !isSuccess,
    );
    iconEl.classList.toggle("duplicate-confirm-icon-success", isSuccess);
    iconEl.innerHTML = isDanger
        ? '<i class="bi bi-exclamation-triangle-fill"></i>'
        : isSuccess
          ? '<i class="bi bi-check-circle-fill"></i>'
          : '<i class="bi bi-database-check"></i>';
    proceedBtn.classList.toggle("btn-danger", isDanger);
    proceedBtn.classList.toggle("btn-primary", !isDanger && !isSuccess);
    proceedBtn.classList.toggle("btn-success", isSuccess);
    proceedBtn.innerHTML = isDanger
        ? `<i class="bi bi-check-lg me-1"></i>${confirmText}`
        : isSuccess
          ? `<i class="bi bi-check-lg me-1"></i>${confirmText}`
          : `<i class="bi bi-save me-1"></i>${confirmText}`;
    cancelBtn.classList.toggle("d-none", !showCancel);
    listWrapEl.classList.toggle("d-none", items.length === 0);
    listEl.replaceChildren();

    items.slice(0, 10).forEach((item) => {
        const listItem = document.createElement("li");
        listItem.textContent = item;
        listEl.appendChild(listItem);
    });

    return new Promise((resolve) => {
        const finish = async (confirmed) => {
            dialog.classList.add("d-none");
            document.removeEventListener("keydown", handleKeydown);
            dialog.onclick = null;
            cancelBtn.onclick = null;
            proceedBtn.onclick = null;

            await pasteModalHidden;
            if (
                suspendedPasteModalInstance &&
                (!confirmed || !showCancel)
            ) {
                suspendedPasteModalInstance.show();
                suspendedPasteModalInstance = null;
            }
            document.body.classList.remove("paste-dialog-open");
            resolve(confirmed);
        };

        const handleKeydown = (event) => {
            if (event.key === "Escape") finish(false);
        };

        cancelBtn.onclick = () => finish(false);
        proceedBtn.onclick = () => finish(true);
        dialog.onclick = (event) => {
            if (event.target === dialog) finish(false);
        };
        document.addEventListener("keydown", handleKeydown);

        document.body.classList.add("paste-dialog-open");
        dialog.classList.remove("d-none");
        proceedBtn.focus();
    });
}

function showDuplicateConfirmDialog(message, duplicateItems) {
    return showCustomConfirmDialog({
        title: "중복 데이터 확인",
        message,
        items: duplicateItems,
        confirmText: "그래도 등록",
        variant: "danger",
    });
}

function showDuplicateBlockedDialog(message, duplicateItems) {
    return showCustomConfirmDialog({
        title: "중복 데이터 확인",
        message,
        items: duplicateItems,
        confirmText: "확인",
        variant: "danger",
        showCancel: false,
    });
}

function showSaveConfirmDialog(itemCount) {
    return showCustomConfirmDialog({
        title: "데이터 저장 확인",
        message: `총 ${itemCount}건의 데이터를 저장하시겠습니까?`,
        confirmText: "저장",
        variant: "primary",
    });
}

function showCustomMessageDialog({ title, message, variant = "danger" }) {
    return showCustomConfirmDialog({
        title,
        message,
        confirmText: "확인",
        variant,
        showCancel: false,
    });
}

window.saveData = async function () {
    if (typeof PASTE_DATA_POST_URL === "undefined") {
        await showCustomMessageDialog({
            title: "설정 오류",
            message:
                "저장 주소가 설정되지 않았습니다. 화면을 새로고침한 후 다시 시도하세요.",
            variant: "danger",
        });
        return;
    }

    const data = collectRowData();
    if (data === null) return;

    if (data.length === 0) {
        await showCustomMessageDialog({
            title: "저장할 데이터 없음",
            message:
                "저장할 데이터가 없습니다.\n각 행에 최소 3개 열과 기번 4자리를 입력해 주세요.",
            variant: "danger",
        });
        return;
    }

    const duplicates = findDuplicates(data);
    let duplicateConfirmed = false;
    if (duplicates.length > 0) {
        if (!window.PASTE_DATA_ALLOW_DUPLICATES) {
            await showDuplicateBlockedDialog(
                "중복된 기번, WO, OP 조합이 있습니다. 중복을 제거한 후 다시 시도하세요.",
                duplicates.slice(0, 10).map((duplicate) =>
                    duplicate.key.replaceAll("::", " / "),
                ),
            );
            return;
        }

        duplicateConfirmed = await showDuplicateConfirmDialog(
            "입력한 데이터 안에 같은 기번, WO, OP가 있습니다. 그래도 등록하시겠습니까?",
            duplicates.slice(0, 10).map((duplicate) =>
                duplicate.key.replaceAll("::", " / "),
            ),
        );
        if (!duplicateConfirmed) return;
    }

    const csrf = getCsrfToken();
    if (!csrf) {
        await showCustomMessageDialog({
            title: "보안 정보 오류",
            message: "보안 정보를 찾을 수 없습니다. 새로고침 후 다시 시도하세요.",
            variant: "danger",
        });
        return;
    }

    const payload = data.map(({ row_number, ...rest }) => rest);

    if (!duplicateConfirmed) {
        const saveConfirmed = await showSaveConfirmDialog(payload.length);
        if (!saveConfirmed) return;
    }

    async function submitData(allowDuplicates) {
        const response = await fetch(PASTE_DATA_POST_URL, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrf,
                ...(allowDuplicates
                    ? { "X-Allow-Duplicates": "true" }
                    : {}),
            },
            body: JSON.stringify(payload),
        });

        if (response.redirected) {
            await showCustomMessageDialog({
                title: "로그인 필요",
                message: "로그인이 필요합니다. 로그인 페이지로 이동합니다.",
                variant: "danger",
            });
            window.location.href = response.url;
            return null;
        }

        if (!response.ok) {
            let result = null;

            try {
                result = await response.json();
            } catch (err) {
                throw new Error(await response.text());
            }

            if (response.status === 409 && result?.duplicates?.length) {
                if (
                    window.PASTE_DATA_ALLOW_DUPLICATES &&
                    !allowDuplicates
                ) {
                    const confirmed = await showDuplicateConfirmDialog(
                        result.message,
                        result.duplicates,
                    );
                    if (!confirmed) return null;
                    return submitData(true);
                }

                await showDuplicateBlockedDialog(
                    result.message,
                    result.duplicates,
                );
                return null;
            }

            throw new Error(
                result?.message ||
                    JSON.stringify(result) ||
                    "요청 처리 중 오류가 발생했습니다.",
            );
        }

        return response.json();
    }

    try {
        const result = await submitData(duplicateConfirmed);
        if (!result) return;

        if (result.status === "success") {
            if (typeof MASTER_DATA_LIST_URL !== "undefined") {
                window.location.href = MASTER_DATA_LIST_URL;
            }
        } else {
            await showCustomMessageDialog({
                title: "저장 실패",
                message: result.message || "데이터를 저장하지 못했습니다.",
                variant: "danger",
            });
        }
    } catch (error) {
        console.error(error);
        await showCustomMessageDialog({
            title: "서버 오류",
            message: String(error.message).slice(0, 500),
            variant: "danger",
        });
    }
};

initTable();

const pasteModal = document.getElementById("pasteDataModal");
if (pasteModal) {
    pasteModal.addEventListener("shown.bs.modal", () => {
        ensureMinimumRows();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const confirmDialog = document.getElementById(
        "duplicateDataConfirmDialog",
    );
    if (confirmDialog) document.body.appendChild(confirmDialog);
});
