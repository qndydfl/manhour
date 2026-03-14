document.addEventListener("DOMContentLoaded", () => {
    const manualModal = document.getElementById("manualInputModal");
    const modalBody = document.getElementById("modal-rows-body");
    const workerSelect = document.getElementById("modal-worker-select");
    const applyAllCheckbox = document.getElementById("apply-all-workers");

    const addRowBtn = document.getElementById("btn-add-row");
    const saveBtn = document.getElementById("btn-save-manual");
    const resetUiBtn = document.getElementById("btn-reset-ui");
    const resetDbBtn = document.getElementById("btn-reset-db");

    const duplicateModalEl = document.getElementById("duplicateTimeModal");
    const duplicateModalMsgEl = document.getElementById("duplicateTimeModalMessage");

    const duplicateModal =
        duplicateModalEl && window.bootstrap
            ? new window.bootstrap.Modal(duplicateModalEl)
            : null;

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

    if (!manualModal || !modalBody || !workerSelect) {
        console.warn("[manual_modal] required elements missing");
        return;
    }

    const SESSION_ID = window.SESSION_ID;
    const ALL_WORKER_IDS = Array.isArray(window.ALL_WORKER_IDS) ? window.ALL_WORKER_IDS : [];
    const SERVER_DATA = Array.isArray(window.SERVER_DATA) ? window.SERVER_DATA : [];
    const SAVE_URL = window.SAVE_URL;
    const MANUAL_RESET_URL = window.MANUAL_RESET_URL;
    const SHIFT_TYPE = String(window.SHIFT_TYPE || "DAY").toUpperCase();

    const DEFAULT_ROWS = 5;
    const DEFAULT_ROW_VALUES =
        SHIFT_TYPE === "NIGHT"
            ? { code: "0", start: "0100", end: "0200" }
            : { code: "0", start: "1200", end: "1300" };

    const getStorageKey = (workerId) =>
        `manning_input_personal_${String(SESSION_ID)}_${workerId || ""}`;

    const getTargetWorkerId = () =>
        applyAllCheckbox && applyAllCheckbox.checked ? "all" : workerSelect.value;

    const getActiveStorageKey = () => getStorageKey(getTargetWorkerId());

    function getCookie(name) {
        let cookieValue = null;

        if (document.cookie && document.cookie !== "") {
            const cookies = document.cookie.split(";");

            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();

                if (cookie.substring(0, name.length + 1) === name + "=") {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }

        return cookieValue;
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
                    value="${nextCode}"
                    placeholder=""
                    inputmode="numeric"
                >
            </td>
            <td>
                <input
                    type="text"
                    class="form-control form-control-sm text-center input-start"
                    maxlength="4"
                    value="${cleanStart}"
                    placeholder=""
                    inputmode="numeric"
                >
            </td>
            <td>
                <input
                    type="text"
                    class="form-control form-control-sm text-center input-end"
                    maxlength="4"
                    value="${cleanEnd}"
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

        tr.querySelectorAll("input").forEach((input) => {
            input.classList.add("modal-input");

            input.addEventListener("input", (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, "");
                saveToStorage();
            });

            input.addEventListener("paste", handleModalPaste);
        });

        const delBtn = tr.querySelector(".btn-del-row");
        if (delBtn) {
            delBtn.addEventListener("click", () => {
                tr.remove();
                saveToStorage();
            });
        }
    }

    function saveToStorage(isAutoDefaults = false) {
        const storageKey = getActiveStorageKey();
        const rows = [];

        modalBody.querySelectorAll("tr").forEach((tr) => {
            rows.push({
                code: tr.querySelector(".input-code")?.value || "",
                start: tr.querySelector(".input-start")?.value || "",
                end: tr.querySelector(".input-end")?.value || "",
            });
        });

        localStorage.setItem(
            storageKey,
            JSON.stringify({
                workerId: getTargetWorkerId(),
                rows,
                autoDefaults: isAutoDefaults,
            })
        );
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

    function loadFromStorageOrServer() {
        let data = {};

        if (window.CURRENT_WORKER_ID && !(applyAllCheckbox && applyAllCheckbox.checked)) {
            workerSelect.value = window.CURRENT_WORKER_ID;
        }

        try {
            data = JSON.parse(localStorage.getItem(getActiveStorageKey()) || "{}");
        } catch (e) {
            console.warn("localStorage parse error:", e);
        }

        modalBody.innerHTML = "";

        let rowsData = [];

        if (data.autoDefaults !== true && Array.isArray(data.rows) && data.rows.length) {
            rowsData = data.rows;
        } else if (SERVER_DATA.length) {
            rowsData = SERVER_DATA;
        }

        if (rowsData.length) {
            rowsData.forEach((r) => {
                const normalized = normalizeRowData(r);
                createRow(normalized.code, normalized.start, normalized.end);
            });

            if (rowsData.length < DEFAULT_ROWS) {
                Array.from({ length: DEFAULT_ROWS - rowsData.length }, () => createRow());
            }

            saveToStorage(false);
        } else {
            Array.from({ length: DEFAULT_ROWS }, (_, idx) =>
                createRow("", "", "", idx === 0)
            );
            saveToStorage(true);
        }
    }

    function handleModalPaste(e) {
        // 확장용 placeholder
        // 현재는 기본 paste 유지
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

    function closeParentModalIfNeeded() {
        if (window.parent && window.parent !== window) {
            try {
                window.parent.__indirectSaved = true;

                const parentModalEl = window.parent.document.getElementById("indirectModal");
                if (parentModalEl && window.parent.bootstrap) {
                    let parentModal =
                        window.parent.bootstrap.Modal.getInstance(parentModalEl);

                    if (!parentModal) {
                        parentModal = new window.parent.bootstrap.Modal(parentModalEl);
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

    function handleSaveManual() {
        const selectedValue = getTargetWorkerId();

        if (!selectedValue) {
            alert("작업자를 선택해주세요.");
            return;
        }

        if (!SAVE_URL) {
            alert("SAVE_URL이 설정되지 않았습니다.");
            return;
        }

        const assignments = [];
        let hasError = false;
        const seenStarts = new Map();
        const seenEnds = new Map();
        const intervals = [];

        modalBody.querySelectorAll("tr").forEach((tr, idx) => {
            if (hasError) return;

            const sStr = tr.querySelector(".input-start")?.value.trim() || "";
            const cStr = tr.querySelector(".input-code")?.value.trim() || "";
            const eStr = tr.querySelector(".input-end")?.value.trim() || "";

            if (!sStr && !cStr && !eStr) {
                return;
            }

            if (!sStr || !eStr || cStr === "") {
                alert(`${idx + 1}번째 줄: 내용(0 포함)과 시간을 모두 입력해야 합니다.`);
                hasError = true;
                return;
            }

            if (SHIFT_TYPE === "DAY") {
                if (parseInt(sStr, 10) >= 2000) {
                    showDuplicateModal(
                        `${idx + 1}번째 줄: 주간은 20:00 이후 시작할 수 없습니다. (입력: ${sStr})`
                    );
                    hasError = true;
                    return;
                }
            } else if (SHIFT_TYPE === "NIGHT") {
                const sVal = parseInt(sStr, 10);
                if (sVal >= 800 && sVal < 2000) {
                    showDuplicateModal(
                        `${idx + 1}번째 줄: 야간은 08:00~20:00 사이에 시작할 수 없습니다. (입력: ${sStr})`
                    );
                    hasError = true;
                    return;
                }
            }

            if (sStr === eStr) {
                showDuplicateModal(
                    `${idx + 1}번째 줄: 시작/종료 시간이 같습니다. (${sStr})`
                );
                hasError = true;
                return;
            }

            if (seenStarts.has(sStr)) {
                showDuplicateModal(
                    `${idx + 1}번째 줄: 시작 시간이 중복됩니다. (${sStr})\n중복된 줄: ${seenStarts.get(sStr)}번째 줄`
                );
                hasError = true;
                return;
            }

            if (seenEnds.has(eStr)) {
                showDuplicateModal(
                    `${idx + 1}번째 줄: 종료 시간이 중복됩니다. (${eStr})\n중복된 줄: ${seenEnds.get(eStr)}번째 줄`
                );
                hasError = true;
                return;
            }

            seenStarts.set(sStr, idx + 1);
            seenEnds.set(eStr, idx + 1);

            let sMin = timeToMinutes(sStr);
            let eMin = timeToMinutes(eStr);

            if (sMin === null || eMin === null) {
                alert(`${idx + 1}번째 줄: 시간 형식이 올바르지 않습니다.`);
                hasError = true;
                return;
            }

            if (eMin <= sMin) {
                eMin += 1440;
            }

            for (const existing of intervals) {
                if (sMin < existing.end && eMin > existing.start) {
                    showDuplicateModal(
                        `${idx + 1}번째 줄: 시간대가 겹칩니다. (${sStr}-${eStr})\n겹치는 줄: ${existing.row}번째 줄`
                    );
                    hasError = true;
                    return;
                }
            }

            intervals.push({ start: sMin, end: eMin, row: idx + 1 });

            const pushOne = (wid) => {
                assignments.push({
                    worker_id: parseInt(wid, 10),
                    code: cStr,
                    start_min: sMin,
                    end_min: eMin,
                });
            };

            if (selectedValue === "all") {
                if (ALL_WORKER_IDS.length) {
                    ALL_WORKER_IDS.forEach((workerId) => pushOne(workerId));
                } else {
                    for (let i = 0; i < workerSelect.options.length; i++) {
                        const optVal = workerSelect.options[i].value;
                        if (optVal) {
                            pushOne(optVal);
                        }
                    }
                }
            } else {
                pushOne(selectedValue);
            }
        });

        if (hasError) return;

        if (!assignments.length) {
            const msg =
                selectedValue === "all"
                    ? "입력한 간비가 없습니다. 전체 작업자의 기존 간비를 삭제할까요?"
                    : "입력한 간비가 없습니다. 선택한 작업자의 기존 간비를 삭제할까요?";

            if (!confirm(msg)) return;
            resetDB({ skipConfirm: true });
            return;
        }

        if (selectedValue === "all") {
            if (!confirm("모든 작업자에게 동일하게 적용하시겠습니까?")) {
                return;
            }
        }

        fetch(SAVE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCookie("csrftoken"),
            },
            credentials: "same-origin",
            body: JSON.stringify({
                assignments,
                apply_all: selectedValue === "all",
            }),
        })
            .then(async (r) => {
                const j = await r.json().catch(() => ({}));
                if (!r.ok) {
                    throw new Error(j.message || `HTTP ${r.status}`);
                }
                return j;
            })
            .then((data) => {
                if (data.status !== "success") {
                    throw new Error(data.message || "save failed");
                }

                alert("저장되었습니다.");
                localStorage.removeItem(getActiveStorageKey());

                if (closeParentModalIfNeeded()) {
                    return;
                }

                location.reload();
            })
            .catch((err) => {
                console.error(err);
                alert("서버 통신 오류: " + err.message);
            });
    }

    function resetUI() {
        if (!confirm("입력 중인 내용(로컬 저장 포함)을 모두 지우고 초기화할까요?")) {
            return;
        }

        localStorage.removeItem(getActiveStorageKey());
        modalBody.innerHTML = "";

        Array.from({ length: DEFAULT_ROWS }, (_, idx) =>
            createRow("", "", "", idx === 0)
        );

        saveToStorage(true);
    }

    function resetDB(options = {}) {
        const { skipConfirm = false } = options;
        const selectedValue = getTargetWorkerId();

        if (!selectedValue) {
            alert("리셋할 작업자를 선택해주세요.");
            return;
        }

        if (!MANUAL_RESET_URL) {
            alert("MANUAL_RESET_URL이 설정되지 않았습니다.");
            return;
        }

        const msg =
            selectedValue === "all"
                ? "전체 작업자의 수동입력(간비)을 모두 삭제할까요?"
                : "선택한 작업자의 수동입력(간비)을 모두 삭제할까요?";

        if (!skipConfirm && !confirm(msg)) {
            return;
        }

        fetch(MANUAL_RESET_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCookie("csrftoken"),
            },
            credentials: "same-origin",
            body: JSON.stringify({ worker_id: selectedValue }),
        })
            .then(async (r) => {
                const j = await r.json().catch(() => ({}));
                if (!r.ok) {
                    throw new Error(j.message || `HTTP ${r.status}`);
                }
                return j;
            })
            .then((data) => {
                if (data.status !== "success") {
                    throw new Error(data.message || "reset failed");
                }

                localStorage.removeItem(getActiveStorageKey());
                modalBody.innerHTML = "";

                Array.from({ length: DEFAULT_ROWS }, (_, idx) =>
                    createRow("", "", "", idx === 0)
                );

                saveToStorage(true);

                alert("DB 리셋 완료!");

                if (closeParentModalIfNeeded()) {
                    return;
                }

                location.reload();
            })
            .catch((err) => {
                console.error(err);
                alert("서버 통신 오류: " + err.message);
            });
    }

    function syncWorkerSelectState() {
        const isApplyAll = applyAllCheckbox && applyAllCheckbox.checked;

        workerSelect.disabled = !!isApplyAll;
        workerSelect.classList.toggle("d-none", !!isApplyAll);

        if (!isApplyAll && !workerSelect.value) {
            if (window.CURRENT_WORKER_ID) {
                workerSelect.value = window.CURRENT_WORKER_ID;
            } else if (workerSelect.options.length > 1) {
                workerSelect.selectedIndex = 1;
            }
        }
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
            saveToStorage();
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

    if (workerSelect) {
        workerSelect.addEventListener("change", () => {
            loadFromStorageOrServer();
            saveToStorage();
        });
    }

    if (resetUiBtn) {
        resetUiBtn.addEventListener("click", resetUI);
    }

    if (resetDbBtn) {
        resetDbBtn.addEventListener("click", resetDB);
    }

    console.log("[manual_modal] bind ok", {
        resetUiBtn: !!resetUiBtn,
        resetDbBtn: !!resetDbBtn,
        SAVE_URL,
        MANUAL_RESET_URL,
        SESSION_ID,
    });
});