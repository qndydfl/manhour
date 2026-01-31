document.addEventListener("DOMContentLoaded", () => {
    const manualModal = document.getElementById("manualInputModal");
    const modalBody = document.getElementById("modal-rows-body");
    const workerSelect = document.getElementById("modal-worker-select");

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

    function showDuplicateModal(message) {
        if (duplicateModalMsgEl) duplicateModalMsgEl.textContent = message;
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

    // ✅ 전역 값들 (템플릿에서 window로 올렸기 때문에 안전)
    const SESSION_ID = window.SESSION_ID;
    const SERVER_DATA = Array.isArray(window.SERVER_DATA)
        ? window.SERVER_DATA
        : [];
    const SAVE_URL = window.SAVE_URL;
    const MANUAL_RESET_URL = window.MANUAL_RESET_URL;
    const SHIFT_TYPE = (window.SHIFT_TYPE || "DAY").toUpperCase();

    const DEFAULT_ROWS = 5;
    const STORAGE_KEY = "manning_input_personal_" + String(SESSION_ID);

    // -------------------------
    // CSRF
    // -------------------------
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== "") {
            const cookies = document.cookie.split(";");
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === name + "=") {
                    cookieValue = decodeURIComponent(
                        cookie.substring(name.length + 1),
                    );
                    break;
                }
            }
        }
        return cookieValue;
    }

    // -------------------------
    // Row UI
    // -------------------------
    function createRow(start = "", code = "", end = "") {
        const tr = document.createElement("tr");
        const cleanStart = start ? String(start).replace(/:/g, "") : "";
        const cleanEnd = end ? String(end).replace(/:/g, "") : "";

        tr.innerHTML = `
      <td>
        <input type="text" class="form-control form-control-sm text-center input-start"
          maxlength="4" value="${cleanStart}" placeholder="0000" inputmode="numeric"
          oninput="this.value=this.value.replace(/[^0-9]/g,'')">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm input-code text-center"
          maxlength="20" value="${code}" placeholder="내용">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm text-center input-end"
          maxlength="4" value="${cleanEnd}" placeholder="0000" inputmode="numeric"
          oninput="this.value=this.value.replace(/[^0-9]/g,'')">
      </td>
      <td>
        <button type="button" class="btn btn-sm btn-outline-danger border-0 py-0 btn-del-row">
          <i class="bi bi-x-lg"></i>
        </button>
      </td>
    `;

        modalBody.appendChild(tr);

        tr.querySelector(".btn-del-row").addEventListener("click", () => {
            tr.remove();
            saveToStorage();
        });

        tr.querySelectorAll("input").forEach((input) => {
            input.addEventListener("input", saveToStorage);
            input.addEventListener("paste", handleModalPaste);
        });
    }

    function saveToStorage() {
        const rows = [];
        modalBody.querySelectorAll("tr").forEach((tr) => {
            rows.push({
                start: tr.querySelector(".input-start")?.value || "",
                code: tr.querySelector(".input-code")?.value || "",
                end: tr.querySelector(".input-end")?.value || "",
            });
        });
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ workerId: workerSelect.value, rows }),
        );
    }

    function loadFromStorageOrServer() {
        let data = {};
        try {
            data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        } catch (e) {}

        // worker 선택 복원
        if (data.workerId) {
            workerSelect.value = data.workerId;
        } else if (window.CURRENT_WORKER_ID) {
            workerSelect.value = window.CURRENT_WORKER_ID;
        }

        modalBody.innerHTML = "";

        // 우선순위: 로컬 > 서버 > 기본
        let rowsData = [];
        if (Array.isArray(data.rows) && data.rows.length) rowsData = data.rows;
        else if (SERVER_DATA.length) rowsData = SERVER_DATA;

        if (rowsData.length) {
            rowsData.forEach((r) => createRow(r.start, r.code, r.end));
            if (rowsData.length < DEFAULT_ROWS) {
                Array.from({ length: DEFAULT_ROWS - rowsData.length }, () =>
                    createRow(),
                );
            }
        } else {
            Array.from({ length: DEFAULT_ROWS }, () => createRow());
        }

        saveToStorage();
    }

    // -------------------------
    // Smart paste (필요시 확장)
    // -------------------------
    function handleModalPaste(e) {
        // 기존 로직을 넣고 싶으면 여기에 붙이면 됨
        // 지금은 기본 paste 동작만 허용
    }

    // -------------------------
    // Time util
    // -------------------------
    function timeToMinutes(timeStr) {
        if (!timeStr || String(timeStr).length !== 4) return null;
        const h = parseInt(String(timeStr).substring(0, 2), 10);
        const m = parseInt(String(timeStr).substring(2, 4), 10);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        if (h === 24 && m === 0) return 1440;
        if (h < 0 || h > 47 || m < 0 || m > 59) return null;
        return h * 60 + m;
    }

    // -------------------------
    // Save
    // -------------------------
    function handleSaveManual() {
        const selectedValue = workerSelect.value;
        if (!selectedValue) return alert("작업자를 선택해주세요.");
        if (!SAVE_URL) return alert("SAVE_URL이 설정되지 않았습니다.");

        const assignments = [];
        let hasError = false;
        const seenStarts = new Map();
        const seenEnds = new Map();

        modalBody.querySelectorAll("tr").forEach((tr, idx) => {
            const sStr = tr.querySelector(".input-start").value.trim();
            const cStr = tr.querySelector(".input-code").value.trim();
            const eStr = tr.querySelector(".input-end").value.trim();

            if (!sStr && !cStr && !eStr) return;

            // 내용은 빈칸만 막고, '0'은 허용(원하면 여기서 제외 가능)
            if (!sStr || !eStr || cStr === "") {
                alert(
                    `${idx + 1}번째 줄: 내용(0 포함)과 시간을 모두 입력해야 합니다.`,
                );
                hasError = true;
                return;
            }

            if (SHIFT_TYPE === "DAY") {
                if (parseInt(sStr, 10) >= 2000) {
                    showDuplicateModal(
                        `${idx + 1}번째 줄: 주간은 20:00 이후 시작할 수 없습니다. (입력: ${sStr})`,
                    );
                    hasError = true;
                    return;
                }
            } else if (SHIFT_TYPE === "NIGHT") {
                const sVal = parseInt(sStr, 10);
                if (sVal >= 800 && sVal < 2000) {
                    showDuplicateModal(
                        `${idx + 1}번째 줄: 야간은 08:00~20:00 사이에 시작할 수 없습니다. (입력: ${sStr})`,
                    );
                    hasError = true;
                    return;
                }
            }

            if (sStr === eStr) {
                showDuplicateModal(
                    `${idx + 1}번째 줄: 시작/종료 시간이 같습니다. (${sStr})`,
                );
                hasError = true;
                return;
            }

            if (seenStarts.has(sStr)) {
                showDuplicateModal(
                    `${idx + 1}번째 줄: 시작 시간이 중복됩니다. (${sStr})\n중복된 줄: ${seenStarts.get(
                        sStr,
                    )}번째 줄`,
                );
                hasError = true;
                return;
            }

            if (seenEnds.has(eStr)) {
                showDuplicateModal(
                    `${idx + 1}번째 줄: 종료 시간이 중복됩니다. (${eStr})\n중복된 줄: ${seenEnds.get(
                        eStr,
                    )}번째 줄`,
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

            // 야간 보정
            if (eMin <= sMin) eMin += 1440;

            const pushOne = (wid) => {
                assignments.push({
                    worker_id: parseInt(wid, 10),
                    code: cStr, // ✅ 간비 입력 (서버에서 code로 처리)
                    start_min: sMin,
                    end_min: eMin,
                });
            };

            if (selectedValue === "all") {
                for (let i = 0; i < workerSelect.options.length; i++) {
                    const optVal = workerSelect.options[i].value;
                    if (optVal && optVal !== "all") pushOne(optVal);
                }
            } else {
                pushOne(selectedValue);
            }
        });

        if (hasError) return;
        if (!assignments.length) return alert("저장할 데이터가 없습니다.");

        if (selectedValue === "all") {
            if (!confirm("모든 작업자에게 동일하게 적용하시겠습니까?")) return;
        }

        fetch(SAVE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCookie("csrftoken"),
            },
            credentials: "same-origin", // ✅ 이거 꼭!
            body: JSON.stringify({ assignments }),
        })
            .then(async (r) => {
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
                return j;
            })
            .then((data) => {
                if (data.status !== "success")
                    throw new Error(data.message || "save failed");
                alert("저장되었습니다.");
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            })
            .catch((err) => {
                console.error(err);
                alert("서버 통신 오류: " + err.message);
            });
    }

    // -------------------------
    // Reset UI
    // -------------------------
    function resetUI() {
        if (
            !confirm(
                "입력 중인 내용(로컬 저장 포함)을 모두 지우고 초기화할까요?",
            )
        )
            return;
        localStorage.removeItem(STORAGE_KEY);
        modalBody.innerHTML = "";
        Array.from({ length: DEFAULT_ROWS }, () => createRow());
        saveToStorage();
    }

    // -------------------------
    // Reset DB
    // -------------------------
    function resetDB() {
        const selectedValue = workerSelect.value;
        if (!selectedValue) return alert("리셋할 작업자를 선택해주세요.");
        if (!MANUAL_RESET_URL)
            return alert("MANUAL_RESET_URL이 설정되지 않았습니다.");

        const msg =
            selectedValue === "all"
                ? "전체 작업자의 수동입력(간비)을 모두 삭제할까요?"
                : "선택한 작업자의 수동입력(간비)을 모두 삭제할까요?";

        if (!confirm(msg)) return;

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
                if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
                return j;
            })
            .then((data) => {
                if (data.status !== "success")
                    throw new Error(data.message || "reset failed");

                // 로컬/화면 즉시 초기화
                localStorage.removeItem(STORAGE_KEY);
                modalBody.innerHTML = "";
                Array.from({ length: DEFAULT_ROWS }, () => createRow());
                saveToStorage();

                alert("DB 리셋 완료!");
                location.reload();
            })
            .catch((err) => {
                console.error(err);
                alert("서버 통신 오류: " + err.message);
            });
    }

    // -------------------------
    // Event bindings (여기서 1회만)
    // -------------------------
    manualModal.addEventListener("show.bs.modal", loadFromStorageOrServer);

    if (addRowBtn)
        addRowBtn.addEventListener("click", () => {
            createRow();
            saveToStorage();
        });
    if (saveBtn) saveBtn.addEventListener("click", handleSaveManual);

    workerSelect.addEventListener("change", saveToStorage);

    if (resetUiBtn) resetUiBtn.addEventListener("click", resetUI);
    if (resetDbBtn) resetDbBtn.addEventListener("click", resetDB);

    // ✅ 디버깅용: 버튼이 잡혔는지 확인
    console.log("[manual_modal] bind ok", {
        resetUiBtn: !!resetUiBtn,
        resetDbBtn: !!resetDbBtn,
        SAVE_URL,
        MANUAL_RESET_URL,
        SESSION_ID,
    });
});
