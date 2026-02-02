const tableBody = document.querySelector("#gridTable tbody");
const ROW_COUNT = 5;
const COL_COUNT = 5;

function initTable() {
    for (let i = 0; i < ROW_COUNT; i++) createRow();
}

function createRow() {
    const tr = document.createElement("tr");

    for (let j = 0; j < COL_COUNT; j++) {
        const td = document.createElement("td");
        const input = document.createElement("input");

        input.type = "text";
        input.className = "input-cell form-control form-control-sm text-center";
        input.placeholder = j === 0 ? "HLxxxx" : "-";

        if (j === 0) {
            input.inputMode = "numeric";
        }

        if (j === 2) {
            input.inputMode = "numeric";
            input.maxLength = 2;
        }

        input.addEventListener("paste", handlePaste);
        input.addEventListener("input", (e) => handleCellInput(e, j));

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
        input.value = normalizeOp(input.value);
    }
}

function normalizeGibun(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const upper = raw.toUpperCase();
    if (/^HL\d+$/.test(upper)) return upper;

    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly) {
        return `HL${digitsOnly}`;
    }

    return upper;
}

function normalizeOp(value) {
    const raw = String(value || "");
    const digits = raw.replace(/\D/g, "");
    return digits.slice(0, 2);
}

window.addRow = function () {
    createRow();
};

// ✅ “한 셀이라도 값이 있으면” 그 행 전체를(공란 포함) 입력되게
function handlePaste(e) {
    e.preventDefault();

    const clipboard = (e.clipboardData || window.clipboardData).getData("text");
    const lines = clipboard.split(/\r\n|\n|\r/);

    const currentInput = e.target;
    const currentCell = currentInput.parentElement;
    const currentRow = currentCell.parentElement;

    const startRowIndex = Array.from(tableBody.children).indexOf(currentRow);
    const startColIndex = Array.from(currentRow.children).indexOf(currentCell);

    lines.forEach((line, rIndex) => {
        // 줄 자체가 아예 없으면 스킵
        if (line == null) return;

        // ✅ 탭 split은 공란도 유지됨 (중요)
        const cols = line.split("\t");

        // ✅ “행 전체가 공란” 판정: 모든 칸이 trim() 했을 때 빈 문자열
        const hasAnyValue = cols.some((c) => String(c ?? "").trim() !== "");
        if (!hasAnyValue) return;

        // row 확보
        let targetRow = tableBody.children[startRowIndex + rIndex];
        if (!targetRow) {
            createRow();
            targetRow = tableBody.children[startRowIndex + rIndex];
        }
        if (!targetRow) return;

        // ✅ 5열 전체(공란 포함) 채움: cIndex는 0~(COL_COUNT-1)까지만
        for (let cIndex = 0; cIndex < COL_COUNT; cIndex++) {
            const targetCell = targetRow.children[startColIndex + cIndex];
            if (!targetCell) continue;

            const input = targetCell.querySelector("input");
            if (!input) continue;

            // cols에 없는 열은 "" 처리 (공란 유지)
            const v = cols[cIndex] != null ? String(cols[cIndex]) : "";
            input.value = v.trim();

            input.style.backgroundColor = "#e8f5e9";
            setTimeout(
                () => (input.style.backgroundColor = "transparent"),
                300,
            );
        }
    });
}

function getCsrfToken() {
    const csrfInput = document.querySelector("[name=csrfmiddlewaretoken]");
    return csrfInput ? csrfInput.value : "";
}

window.saveData = function () {
    if (typeof PASTE_DATA_POST_URL === "undefined") {
        alert(
            "PASTE_DATA_POST_URL이 정의되지 않았습니다. template의 script 블록을 확인하세요.",
        );
        return;
    }

    const data = [];
    const rows = tableBody.querySelectorAll("tr");

    rows.forEach((tr) => {
        const inputs = tr.querySelectorAll("input");
        if (inputs.length < 5) return;

        const gibun = inputs[0].value.trim();
        const wo = inputs[1].value.trim();
        const op = inputs[2].value.trim();
        const desc = inputs[3].value.trim();
        const mh = inputs[4].value.trim();

        // ✅ 완전 공란 행은 스킵
        if (!gibun && !wo && !op && !desc && !mh) return;

        // ✅ 기번은 최소한 있어야 저장(업무 기준)
        if (!gibun) return;

        data.push({
            gibun_code: gibun,
            work_order: wo,
            op: op,
            description: desc,
            default_mh: mh,
        });
    });

    if (data.length === 0) {
        alert("저장할 데이터가 없습니다.\n(기번이 있는 행만 저장됩니다)");
        return;
    }

    // ✅ WO+OP 중복 체크
    const pairMap = new Map();
    const duplicates = [];
    data.forEach((row, idx) => {
        const wo = (row.work_order || "").trim().toUpperCase();
        const op = (row.op || "").trim().toUpperCase();
        const key = `${wo}::${op}`;
        if (!wo || !op) return;

        if (pairMap.has(key)) {
            duplicates.push({
                key,
                firstRow: pairMap.get(key) + 1,
                dupRow: idx + 1,
            });
        } else {
            pairMap.set(key, idx);
        }
    });

    if (duplicates.length > 0) {
        const preview = duplicates
            .slice(0, 5)
            .map((d) => `WO+OP(${d.key}) 행 ${d.firstRow} ↔ ${d.dupRow}`)
            .join("\n");
        alert(
            `중복된 Work Order/OP 조합이 있습니다.\n중복 제거 후 다시 시도하세요.\n\n${preview}`,
        );
        return;
    }

    const csrf = getCsrfToken();
    if (!csrf) {
        alert("CSRF 토큰을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.");
        return;
    }

    if (!confirm(`총 ${data.length}건의 데이터를 저장하시겠습니까?`)) return;

    fetch(PASTE_DATA_POST_URL, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf,
        },
        body: JSON.stringify(data),
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
                    const data = await response.json();
                    message = data?.message || JSON.stringify(data);
                } catch (e) {
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
            alert("서버 오류:\n" + String(error.message).slice(0, 200));
        });
};

initTable();
