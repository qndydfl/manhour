const tableBody = document.querySelector("#gridTable tbody");
const ROW_COUNT = 5;
const COL_COUNT = 5;

const COLUMN_PLACEHOLDERS = [
    "HLxxxx",
    "Work Order",
    "0001",
    "Description",
    "0.0",
];

function initTable() {
    if (!tableBody) return;
    for (let i = 0; i < ROW_COUNT; i++) {
        createRow();
    }
}

function createInputByColumn(colIndex) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "input-cell form-control form-control-sm text-center";
    input.placeholder = COLUMN_PLACEHOLDERS[colIndex] || "-";
    input.autocomplete = "off";
    input.spellcheck = false;

    if (colIndex === 0) {
        input.style.textTransform = "uppercase";
    }

    if (colIndex === 2) {
        input.inputMode = "numeric";
        input.maxLength = 4;
        input.addEventListener("blur", handleOpBlur);
    }

    if (colIndex === 4) {
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
        input.value = normalizeGibun(input.value);
    } else if (colIndex === 2) {
        input.value = normalizeOpRaw(input.value);
    } else if (colIndex === 4) {
        input.value = normalizeMhRaw(input.value);
    }
}

function normalizeGibun(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";

    if (/^HL\d+$/.test(raw)) return raw;

    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly) {
        return `HL${digitsOnly}`;
    }

    return raw;
}

function normalizeOp(value) {
    const raw = String(value || "");
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return digits.slice(0, 4).padStart(4, "0");
}

function normalizeOpRaw(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 4);
}

function normalizeMhRaw(value) {
    const raw = String(value || "").replace(/[^0-9.]/g, "");

    // 소수점 2개 이상 방지
    const parts = raw.split(".");
    if (parts.length <= 1) return raw;

    return `${parts[0]}.${parts.slice(1).join("")}`;
}

function handleOpBlur(e) {
    const input = e.target;
    if (!input) return;
    input.value = normalizeOp(input.value);
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
        input.value = normalizeGibun(text);
    } else if (colIndex === 2) {
        input.value = normalizeOpRaw(text);
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

        // 행 전체가 비어 있으면 skip
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

    rows.forEach((tr, rowIndex) => {
        const inputs = tr.querySelectorAll("input");
        if (inputs.length < COL_COUNT) return;

        const gibun = normalizeGibun(inputs[0].value);
        const wo = inputs[1].value.trim();
        const op = normalizeOp(inputs[2].value);
        const desc = inputs[3].value.trim();
        const mh = normalizeMhRaw(inputs[4].value.trim());

        const values = [gibun, wo, op, desc, mh];
        const filledCount = values.filter((v) => String(v || "").trim() !== "").length;

        // 완전 공란 행 스킵
        if (filledCount === 0) return;

        // 최소 3개 열 + 기번 필수
        if (filledCount < 3 || !gibun) return;

        data.push({
            row_number: rowIndex + 1,
            gibun_code: gibun,
            work_order: wo,
            op: op,
            description: desc,
            default_mh: mh,
        });
    });

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

window.saveData = function () {
    if (typeof PASTE_DATA_POST_URL === "undefined") {
        alert("PASTE_DATA_POST_URL이 정의되지 않았습니다. template의 script 블록을 확인하세요.");
        return;
    }

    const data = collectRowData();

    if (data.length === 0) {
        alert("저장할 데이터가 없습니다.\n(각 행에 최소 3개 열 입력 + 기번 필요)");
        return;
    }

    const duplicates = findDuplicates(data);
    if (duplicates.length > 0) {
        const preview = duplicates
            .slice(0, 5)
            .map((d) => `기번+WO+OP(${d.key}) : ${d.firstRow}행 ↔ ${d.dupRow}행`)
            .join("\n");

        alert(
            `중복된 기번/Work Order/OP 조합이 있습니다.\n중복 제거 후 다시 시도하세요.\n\n${preview}`
        );
        return;
    }

    const csrf = getCsrfToken();
    if (!csrf) {
        alert("CSRF 토큰을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.");
        return;
    }

    const payload = data.map(({ row_number, ...rest }) => rest);

    if (!confirm(`총 ${payload.length}건의 데이터를 저장하시겠습니까?`)) return;

    fetch(PASTE_DATA_POST_URL, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf,
        },
        body: JSON.stringify(payload),
    })
        .then(async (response) => {
            if (response.redirected) {
                alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
                window.location.href = response.url;
                return null;
            }

            if (!response.ok) {
                let message = "";

                try {
                    const result = await response.json();

                    if (response.status === 409 && result?.duplicates?.length) {
                        const preview = result.duplicates
                            .slice(0, 10)
                            .map((key) => `- ${key}`)
                            .join("\n");
                        message = `${result.message}\n\n${preview}`;
                    } else {
                        message = result?.message || JSON.stringify(result);
                    }
                } catch (err) {
                    message = await response.text();
                }

                throw new Error(message || "요청 처리 중 오류가 발생했습니다.");
            }

            return response.json();
        })
        .then((result) => {
            if (!result) return;

            if (result.status === "success") {
                alert(`성공! ${result.count}건의 데이터가 저장되었습니다.`);
                if (typeof MASTER_DATA_LIST_URL !== "undefined") {
                    window.location.href = MASTER_DATA_LIST_URL;
                }
            } else {
                alert("저장 실패: " + (result.message || ""));
            }
        })
        .catch((error) => {
            console.error(error);
            alert("서버 오류:\n" + String(error.message).slice(0, 500));
        });
};

initTable();