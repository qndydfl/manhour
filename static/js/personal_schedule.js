document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("personal-schedule-root");
    const copyBtn = document.getElementById("copy-schedule-btn");
    const manualModal = document.getElementById("manualInputModal");
    const modalBody = document.getElementById("modal-rows-body");
    const workerCheckboxArea = document.getElementById("worker-checkbox-area");
    const applyAllCheckbox = document.getElementById("apply-all-workers");

    const addRowBtn = document.getElementById("btn-add-row");
    const saveBtn = document.getElementById("btn-save-manual");
    const resetUiBtn = document.getElementById("btn-reset-ui");
    const resetDbBtn = document.getElementById("btn-reset-db");

    const duplicateModalEl = document.getElementById("duplicateTimeModal");
    const duplicateModalMsgEl = document.getElementById(
        "duplicateTimeModalMessage",
    );

    const duplicateModal =
        duplicateModalEl && window.bootstrap
            ? new window.bootstrap.Modal(duplicateModalEl)
            : null;

    if (!root) {
        console.warn("[personal_schedule] root element missing");
        return;
    }

    if (!manualModal || !modalBody || !workerCheckboxArea) {
        console.warn("[manual_modal] required elements missing");
        return;
    }

    const workerCheckboxList = [
        ...document.querySelectorAll(".worker-checkbox"),
    ];

    const SESSION_ID = root.dataset.sessionId || "";
    const ALL_WORKER_IDS = parseJsonValue(root.dataset.allWorkerIds, []);
    const SERVER_DATA = parseJsonValue(root.dataset.serverData, []);
    const SAVE_URL = root.dataset.saveUrl || "";
    const MANUAL_RESET_URL = root.dataset.manualResetUrl || "";
    const SHIFT_TYPE = String(root.dataset.shiftType || "DAY").toUpperCase();

    const DEFAULT_ROWS = 5;
    const DEFAULT_ROW_VALUES =
        SHIFT_TYPE === "NIGHT"
            ? { code: "0", start: "0100", end: "0200" }
            : { code: "0", start: "1200", end: "1300" };

    let saveTimer = null;

    function parseJsonValue(value, fallback) {
        if (!value) return fallback;
        try {
            return JSON.parse(value);
        } catch (err) {
            console.warn("JSON parse error:", err);
            return fallback;
        }
    }

    function workerCheckboxes() {
        return workerCheckboxList;
    }

    function isApplyAllSelected() {
        return !!(applyAllCheckbox && applyAllCheckbox.checked);
    }

    function showDuplicateModal(message) {
        if (duplicateModalMsgEl) {
            duplicateModalMsgEl.textContent = message;
        }

        if (duplicateModal) {
            duplicateModal.show();
        } else {
            alert(message);
        }
    }

    function getStorageKey(workerKey) {
        return `manning_input_personal_${String(SESSION_ID)}_${workerKey || ""}`;
    }

    function getSelectedWorkerIds() {
        return workerCheckboxes()
            .filter((cb) => cb.checked)
            .map((cb) => String(cb.value));
    }

    function getTargetWorkerKey() {
        if (isApplyAllSelected()) {
            return "all";
        }

        const ids = getSelectedWorkerIds();
        return ids.length ? ids.join("_") : "";
    }

    function getActiveStorageKey() {
        return getStorageKey(getTargetWorkerKey());
    }

    function getCookie(name) {
        let cookieValue = null;

        if (document.cookie && document.cookie !== "") {
            const cookies = document.cookie.split(";");

            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();

                if (cookie.substring(0, name.length + 1) === `${name}=`) {
                    cookieValue = decodeURIComponent(
                        cookie.substring(name.length + 1),
                    );
                    break;
                }
            }
        }

        return cookieValue;
    }

    function clearModalRows() {
        modalBody.innerHTML = "";
    }

    function getRowValues(tr) {
        return {
            code: tr.querySelector(".input-code")?.value.trim() || "",
            start: tr.querySelector(".input-start")?.value.trim() || "",
            end: tr.querySelector(".input-end")?.value.trim() || "",
        };
    }

    function saveToStorage(isAutoDefaults = false) {
        const storageKey = getActiveStorageKey();
        const rows = [];

        modalBody.querySelectorAll("tr").forEach((tr) => {
            rows.push(getRowValues(tr));
        });

        localStorage.setItem(
            storageKey,
            JSON.stringify({
                workerIds: isApplyAllSelected()
                    ? ["all"]
                    : getSelectedWorkerIds(),
                rows,
                autoDefaults: isAutoDefaults,
            }),
        );
    }

    function scheduleSaveToStorage(isAutoDefaults = false) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveToStorage(isAutoDefaults), 120);
    }

    function normalizeRowData(row) {
        if (!row) {
            return { code: "", start: "", end: "" };
        }

        if (Array.isArray(row)) {
            const [code, start, end] = row;
            return {
                code: code ?? "",
                start: start ?? "",
                end: end ?? "",
            };
        }

        return {
            code: row.code ?? "",
            start: row.start ?? "",
            end: row.end ?? "",
        };
    }

    function bindRowEvents(tr) {
        tr.querySelectorAll("input").forEach((input) => {
            input.classList.add("modal-input");

            input.addEventListener("input", (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, "");
                scheduleSaveToStorage();
            });

            input.addEventListener("paste", handleModalPaste);
        });

        const delBtn = tr.querySelector(".btn-del-row");
        if (delBtn) {
            delBtn.addEventListener("click", () => {
                tr.remove();
                scheduleSaveToStorage();
            });
        }
    }

    function createRow(code = "", start = "", end = "", useDefaults = false) {
        const shouldUseDefaults = useDefaults && !code && !start && !end;
        const nextCode = shouldUseDefaults ? DEFAULT_ROW_VALUES.code : code;
        const nextStart = shouldUseDefaults ? DEFAULT_ROW_VALUES.start : start;
        const nextEnd = shouldUseDefaults ? DEFAULT_ROW_VALUES.end : end;

        const tr = document.createElement("tr");
        const cleanStart = nextStart ? String(nextStart).replace(/:/g, "") : "";
        const cleanEnd = nextEnd ? String(nextEnd).replace(/:/g, "") : "";

        tr.innerHTML = `
            <td>
                <input
                    type="text"
                    class="form-control form-control-sm input-code text-center text-primary fw-bold"
                    maxlength="4"
                    value="${escapeHtml(nextCode)}"
                    placeholder=""
                    inputmode="numeric"
                >
            </td>
            <td>
                <input
                    type="text"
                    class="form-control form-control-sm text-center input-start"
                    maxlength="4"
                    value="${escapeHtml(cleanStart)}"
                    placeholder=""
                    inputmode="numeric"
                >
            </td>
            <td>
                <input
                    type="text"
                    class="form-control form-control-sm text-center input-end"
                    maxlength="4"
                    value="${escapeHtml(cleanEnd)}"
                    placeholder=""
                    inputmode="numeric"
                >
            </td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-danger border-0 py-0 btn-del-row">
                    <i class="bi bi-x-lg"></i>
                </button>
            </td>
        `;

        modalBody.appendChild(tr);
        bindRowEvents(tr);
        return tr;
    }

    function renderDefaultRows() {
        clearModalRows();

        Array.from({ length: DEFAULT_ROWS }, (_, idx) => {
            createRow("", "", "", idx === 0);
        });
    }

    function renderRows(rowsData = []) {
        clearModalRows();

        rowsData.forEach((row) => {
            const normalized = normalizeRowData(row);
            createRow(normalized.code, normalized.start, normalized.end);
        });

        if (rowsData.length < DEFAULT_ROWS) {
            Array.from({ length: DEFAULT_ROWS - rowsData.length }, () =>
                createRow(),
            );
        }
    }

    function setDefaultCheckedWorker() {
        if (isApplyAllSelected()) return;

        const currentId = String(root.dataset.currentWorkerId || "");

        workerCheckboxes().forEach((cb) => {
            cb.checked = currentId && cb.value === currentId;
        });

        if (!currentId) {
            const first = workerCheckboxes()[0];
            if (first) first.checked = true;
        }
    }

    function syncWorkerSelectState() {
        const isApplyAll = isApplyAllSelected();

        if (workerCheckboxArea) {
            workerCheckboxArea.classList.toggle("d-none", isApplyAll);
        }

        if (!isApplyAll) {
            const anyChecked = workerCheckboxes().some((cb) => cb.checked);
            if (!anyChecked) {
                setDefaultCheckedWorker();
            }
        }
    }

    function loadFromStorageOrServer() {
        if (!isApplyAllSelected()) {
            const anyChecked = workerCheckboxes().some((cb) => cb.checked);
            if (!anyChecked) {
                setDefaultCheckedWorker();
            }
        }

        let data = {};
        try {
            data = JSON.parse(
                localStorage.getItem(getActiveStorageKey()) || "{}",
            );
        } catch (e) {
            console.warn("localStorage parse error:", e);
        }

        let rowsData = [];

        if (
            data.autoDefaults !== true &&
            Array.isArray(data.rows) &&
            data.rows.length
        ) {
            rowsData = data.rows;
        } else if (SERVER_DATA.length) {
            rowsData = SERVER_DATA;
        }

        if (rowsData.length) {
            renderRows(rowsData);
            saveToStorage(false);
        } else {
            renderDefaultRows();
            saveToStorage(true);
        }
    }

    function handleModalPaste(e) {
        const text = e.clipboardData?.getData("text/plain");
        if (!text) return;

        const rows = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) =>
                line
                    .split("\t")
                    .map((cell) => cell.trim().replace(/[^0-9]/g, "")),
            )
            .filter((cols) => cols.length);

        if (!rows.length) return;

        e.preventDefault();

        const currentTr = e.target.closest("tr");
        if (!currentTr) return;

        const currentRows = [...modalBody.querySelectorAll("tr")];
        let startIndex = currentRows.indexOf(currentTr);

        if (startIndex < 0) {
            startIndex = 0;
        }

        while (modalBody.querySelectorAll("tr").length < startIndex + rows.length) {
            createRow();
        }

        const allRows = [...modalBody.querySelectorAll("tr")];

        rows.forEach((cols, rowOffset) => {
            const tr = allRows[startIndex + rowOffset];
            if (!tr) return;

            const codeInput = tr.querySelector(".input-code");
            const startInput = tr.querySelector(".input-start");
            const endInput = tr.querySelector(".input-end");

            if (codeInput && cols[0] !== undefined) codeInput.value = cols[0];
            if (startInput && cols[1] !== undefined) startInput.value = cols[1];
            if (endInput && cols[2] !== undefined) endInput.value = cols[2];
        });

        scheduleSaveToStorage();
    }

    function timeToMinutes(timeStr) {
        if (!timeStr || String(timeStr).length !== 4) {
            return null;
        }

        const h = parseInt(String(timeStr).substring(0, 2), 10);
        const m = parseInt(String(timeStr).substring(2, 4), 10);

        if (Number.isNaN(h) || Number.isNaN(m)) {
            return null;
        }

        if (h === 24 && m === 0) {
            return 1440;
        }

        if (h < 0 || h > 47 || m < 0 || m > 59) {
            return null;
        }

        return h * 60 + m;
    }

    function validateShiftStartTime(sStr, rowIndex) {
        if (SHIFT_TYPE === "DAY") {
            if (parseInt(sStr, 10) >= 2000) {
                return `${rowIndex}번째 줄: 주간은 20:00 이후 시작할 수 없습니다. (입력: ${sStr})`;
            }
        } else if (SHIFT_TYPE === "NIGHT") {
            const sVal = parseInt(sStr, 10);
            if (sVal >= 800 && sVal < 2000) {
                return `${rowIndex}번째 줄: 야간은 08:00~20:00 사이에 시작할 수 없습니다. (입력: ${sStr})`;
            }
        }

        return "";
    }

    function collectAssignments() {
        const selectedWorkerIds = getSelectedWorkerIds();
        const isApplyAll = isApplyAllSelected();

        if (!selectedWorkerIds.length && !isApplyAll) {
            throw new Error("작업자를 선택해주세요.");
        }

        const assignments = [];
        const seenStarts = new Map();
        const seenEnds = new Map();
        const intervals = [];

        const rows = [...modalBody.querySelectorAll("tr")];

        rows.forEach((tr, idx) => {
            const rowNo = idx + 1;
            const { code: cStr, start: sStr, end: eStr } = getRowValues(tr);

            if (!sStr && !cStr && !eStr) {
                return;
            }

            if (!sStr || !eStr || cStr === "") {
                throw new Error(
                    `${rowNo}번째 줄: 내용(0 포함)과 시간을 모두 입력해야 합니다.`,
                );
            }

            const shiftError = validateShiftStartTime(sStr, rowNo);
            if (shiftError) {
                throw new Error(shiftError);
            }

            if (sStr === eStr) {
                throw new Error(
                    `${rowNo}번째 줄: 시작/종료 시간이 같습니다. (${sStr})`,
                );
            }

            if (seenStarts.has(sStr)) {
                throw new Error(
                    `${rowNo}번째 줄: 시작 시간이 중복됩니다. (${sStr})\n중복된 줄: ${seenStarts.get(sStr)}번째 줄`,
                );
            }

            if (seenEnds.has(eStr)) {
                throw new Error(
                    `${rowNo}번째 줄: 종료 시간이 중복됩니다. (${eStr})\n중복된 줄: ${seenEnds.get(eStr)}번째 줄`,
                );
            }

            seenStarts.set(sStr, rowNo);
            seenEnds.set(eStr, rowNo);

            let sMin = timeToMinutes(sStr);
            let eMin = timeToMinutes(eStr);

            if (sMin === null || eMin === null) {
                throw new Error(`${rowNo}번째 줄: 시간 형식이 올바르지 않습니다.`);
            }

            if (eMin <= sMin) {
                eMin += 1440;
            }

            for (const existing of intervals) {
                if (sMin < existing.end && eMin > existing.start) {
                    throw new Error(
                        `${rowNo}번째 줄: 시간대가 겹칩니다. (${sStr}-${eStr})\n겹치는 줄: ${existing.row}번째 줄`,
                    );
                }
            }

            intervals.push({ start: sMin, end: eMin, row: rowNo });

            const pushOne = (wid) => {
                assignments.push({
                    worker_id: parseInt(wid, 10),
                    code: cStr,
                    start_min: sMin,
                    end_min: eMin,
                });
            };

            if (isApplyAll) {
                ALL_WORKER_IDS.forEach((workerId) => pushOne(workerId));
            } else {
                selectedWorkerIds.forEach((workerId) => pushOne(workerId));
            }
        });

        return {
            assignments,
            selectedWorkerIds,
            isApplyAll,
        };
    }

    function clearCurrentUiAndStorage() {
        localStorage.removeItem(getActiveStorageKey());
        renderDefaultRows();
        saveToStorage(true);
    }

    async function fetchJson(url, payload) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCookie("csrftoken"),
            },
            credentials: "same-origin",
            body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || `HTTP ${response.status}`);
        }

        if (data.status && data.status !== "success") {
            throw new Error(data.message || "요청 처리 실패");
        }

        return data;
    }

    function closeParentModalIfNeeded() {
        if (window.parent && window.parent !== window) {
            try {
                window.parent.__indirectSaved = true;

                const parentModalEl =
                    window.parent.document.getElementById("indirectModal");

                if (parentModalEl && window.parent.bootstrap) {
                    let parentModal =
                        window.parent.bootstrap.Modal.getInstance(
                            parentModalEl,
                        );

                    if (!parentModal) {
                        parentModal = new window.parent.bootstrap.Modal(
                            parentModalEl,
                        );
                    }

                    parentModal.hide();
                    return true;
                }
            } catch (e) {
                console.warn("부모 모달 닫기 실패:", e);
            }
        }

        return false;
    }

    function finishAfterServerSuccess(message) {
        alert(message);

        if (closeParentModalIfNeeded()) {
            return;
        }

        location.reload();
    }

    function resetUI() {
        if (
            !confirm(
                "입력 중인 내용(로컬 저장 포함)을 모두 지우고 초기화할까요?",
            )
        ) {
            return;
        }

        clearCurrentUiAndStorage();
    }

    async function resetDB(options = {}) {
        const { skipConfirm = false } = options;
        const selectedWorkerIds = getSelectedWorkerIds();
        const isApplyAll = isApplyAllSelected();

        if (!selectedWorkerIds.length && !isApplyAll) {
            alert("리셋할 작업자를 선택해주세요.");
            return;
        }

        if (!MANUAL_RESET_URL) {
            alert("MANUAL_RESET_URL이 설정되지 않았습니다.");
            return;
        }

        const msg = isApplyAll
            ? "전체 작업자의 수동입력(간비)을 모두 삭제할까요?"
            : "선택한 작업자의 수동입력(간비)을 모두 삭제할까요?";

        if (!skipConfirm && !confirm(msg)) {
            return;
        }

        try {
            await fetchJson(MANUAL_RESET_URL, {
                worker_ids: isApplyAll ? ["all"] : selectedWorkerIds,
                apply_all: isApplyAll,
            });

            clearCurrentUiAndStorage();
            finishAfterServerSuccess("DB 리셋 완료!");
        } catch (err) {
            console.error(err);
            alert("서버 통신 오류: " + err.message);
        }
    }

    async function handleSaveManual() {
        try {
            if (!SAVE_URL) {
                alert("SAVE_URL이 설정되지 않았습니다.");
                return;
            }

            const { assignments, selectedWorkerIds, isApplyAll } =
                collectAssignments();

            if (!assignments.length) {
                const msg = isApplyAll
                    ? "입력한 간비가 없습니다. 전체 작업자의 기존 간비를 삭제할까요?"
                    : "입력한 간비가 없습니다. 선택한 작업자의 기존 간비를 삭제할까요?";

                if (!confirm(msg)) return;
                await resetDB({ skipConfirm: true });
                return;
            }

            if (isApplyAll) {
                if (!confirm("모든 작업자에게 동일하게 적용하시겠습니까?")) {
                    return;
                }
            } else {
                if (!confirm("선택한 작업자들에게 적용하시겠습니까?")) {
                    return;
                }
            }

            await fetchJson(SAVE_URL, {
                assignments,
                apply_all: isApplyAll,
                worker_ids: isApplyAll ? ALL_WORKER_IDS : selectedWorkerIds,
            });

            localStorage.removeItem(getActiveStorageKey());
            finishAfterServerSuccess("저장되었습니다.");
        } catch (err) {
            console.error(err);

            const msg = String(err.message || "");

            if (
                msg.includes("중복") ||
                msg.includes("겹칩니다") ||
                msg.includes("시작/종료 시간이 같습니다") ||
                msg.includes("주간은") ||
                msg.includes("야간은")
            ) {
                showDuplicateModal(msg);
            } else {
                alert(msg || "저장 중 오류가 발생했습니다.");
            }
        }
    }

    async function copyTableToClipboard() {
        const table = document.getElementById("scheduleTable");

        if (!table) {
            alert("복사할 표를 찾을 수 없습니다.");
            return;
        }

        const rows = [...table.querySelectorAll("tr")].map((tr) =>
            [...tr.querySelectorAll("th, td")]
                .map((cell) => cell.innerText.replace(/\s+/g, " ").trim())
                .join("\t"),
        );

        const text = rows.join("\n");

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const temp = document.createElement("textarea");
                temp.value = text;
                temp.style.position = "fixed";
                temp.style.left = "-9999px";
                document.body.appendChild(temp);
                temp.focus();
                temp.select();
                document.execCommand("copy");
                document.body.removeChild(temp);
            }

            alert("📋 시간표가 복사되었습니다! 엑셀 등에 붙여넣기 하세요.");
        } catch (err) {
            console.error("복사 실패:", err);
            alert("복사에 실패했습니다.");
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    if (copyBtn) {
        copyBtn.addEventListener("click", copyTableToClipboard);
    }

    if (manualModal) {
        manualModal.addEventListener("show.bs.modal", () => {
            syncWorkerSelectState();
            loadFromStorageOrServer();
        });
    }

    if (addRowBtn) {
        addRowBtn.addEventListener("click", () => {
            createRow();
            scheduleSaveToStorage();
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", handleSaveManual);
    }

    if (applyAllCheckbox) {
        applyAllCheckbox.addEventListener("change", () => {
            syncWorkerSelectState();
            loadFromStorageOrServer();
        });
    }

    workerCheckboxes().forEach((cb) => {
        cb.addEventListener("change", () => {
            loadFromStorageOrServer();
            scheduleSaveToStorage();
        });
    });

    if (resetUiBtn) {
        resetUiBtn.addEventListener("click", resetUI);
    }

    if (resetDbBtn) {
        resetDbBtn.addEventListener("click", () => resetDB());
    }

    console.log("[manual_modal] bind ok", {
        resetUiBtn: !!resetUiBtn,
        resetDbBtn: !!resetDbBtn,
        SAVE_URL,
        MANUAL_RESET_URL,
        SESSION_ID,
    });
});
