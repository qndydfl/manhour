// ----------------------------------------------------------------
// 1. 설정 및 유틸리티
// ----------------------------------------------------------------
const STORAGE_KEY = "manning_input_personal_" + SESSION_ID;

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === name + "=") {
                cookieValue = decodeURIComponent(
                    cookie.substring(name.length + 1)
                );
                break;
            }
        }
    }
    return cookieValue;
}

function timeToMinutes(timeStr) {
    if (!timeStr || timeStr.length !== 4) return null;
    const h = parseInt(timeStr.substr(0, 2), 10);
    const m = parseInt(timeStr.substr(2, 2), 10);
    if (isNaN(h) || isNaN(m)) return null;
    if (h === 24 && m === 0) return 1440;
    if (h < 0 || h > 47 || m < 0 || m > 59) return null; // 야간 대비
    return h * 60 + m;
}

// ----------------------------------------------------------------
// 2. DOM 로드 후 초기화 (이벤트는 여기서만 1회 등록)
// ----------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
    const manualModal = document.getElementById("manualInputModal");
    const addRowBtn = document.getElementById("btn-add-row");
    const saveBtn = document.getElementById("btn-save-manual");
    const workerSelect = document.getElementById("modal-worker-select");
    const modalBody = document.getElementById("modal-rows-body");

    // 안전: 요소 없으면 중단
    if (!manualModal || !modalBody || !workerSelect) return;

    manualModal.addEventListener("show.bs.modal", loadFromStorage);

    if (addRowBtn) {
        addRowBtn.addEventListener("click", function () {
            createRow();
            saveToStorage();
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", handleSaveManual);
    }

    // worker 선택 change 리스너는 여기서 딱 1번만
    workerSelect.addEventListener("change", saveToStorage);
});

// ----------------------------------------------------------------
// 3. 모달 행 관리 & 스마트 붙여넣기
// ----------------------------------------------------------------
const modalBody = document.getElementById("modal-rows-body");
const workerSelect = document.getElementById("modal-worker-select");

function createRow(start = "", code = "", end = "") {
    const tr = document.createElement("tr");

    // 시간 값 정제 (콜론 제거)
    const cleanStart = start ? start.replace(/:/g, '') : '';
    const cleanEnd = end ? end.replace(/:/g, '') : '';

    tr.innerHTML = `
    <td>
      <input type="text" class="form-control form-control-sm text-center input-start"
        maxlength="4" value="${cleanStart}" placeholder="0000"
        inputmode="numeric"
        oninput="this.value = this.value.replace(/[^0-9]/g, '')">
    </td>
    <td>
      <input type="text" class="form-control form-control-sm input-code text-center"
        maxlength="20" value="${code}" placeholder="내용">
    </td>
    <td>
      <input type="text" class="form-control form-control-sm text-center input-end"
        maxlength="4" value="${cleanEnd}" placeholder="0000"
        inputmode="numeric"
        oninput="this.value = this.value.replace(/[^0-9]/g, '')">
    </td>
    <td>
      <button type="button" class="btn btn-sm btn-outline-danger border-0 py-0" onclick="deleteRow(this)">
        <i class="bi bi-x-lg"></i>
      </button>
    </td>
  `;

    modalBody.appendChild(tr);

    // 입력 변경 시 자동 저장 및 [스마트 붙여넣기 연결]
    tr.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", saveToStorage);
        // ★ 붙여넣기 이벤트 리스너 추가
        input.addEventListener("paste", handleModalPaste);
    });
}

// [추가] 스마트 붙여넣기 핸들러 (2400 -> 0000 변환 포함)
function handleModalPaste(e) {
    e.preventDefault();
    const clipboardData = (e.clipboardData || window.clipboardData).getData('text');

    // 줄바꿈으로 행 분리
    const lines = clipboardData.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);

    // 현재 붙여넣기 한 위치 찾기
    const currentInput = e.target;
    const currentTr = currentInput.closest('tr');
    const tbody = document.getElementById('modal-rows-body');
    const allRows = Array.from(tbody.children);
    const startIndex = allRows.indexOf(currentTr);

    lines.forEach((line, i) => {
        line = line.trim();
        let code = "", start = "", end = "";

        // 1. 뭉친 데이터 패턴 매칭 (예: 100220:0020:30)
        const match = line.match(/^(.+?)(\d{1,2}:\d{2})\s*(\d{1,2}:\d{2})$/);

        if (match) {
            code = match[1].trim();
            start = match[2].trim();
            end = match[3].trim();
        } else {
            // 2. 탭으로 구분된 일반 엑셀 데이터
            const parts = line.split(/\t/);
            // [내용, 시작, 종료] 순서 가정
            if (parts.length >= 3) {
                code = parts[0];
                start = parts[1];
                end = parts[2];
            } else {
                code = line;
            }
        }

        // [핵심 기능] 시간 정제 및 2400 -> 0000 변환
        let cleanStart = start.replace(/:/g, '');
        let cleanEnd = end.replace(/:/g, '');

        if (cleanStart === '2400') cleanStart = '0000';
        if (cleanEnd === '2400') cleanEnd = '0000';

        // 들어갈 행 찾기 (없으면 생성)
        let targetTr = allRows[startIndex + i];
        if (!targetTr) {
            createRow();
            targetTr = document.getElementById('modal-rows-body').lastElementChild;
        }

        // 값 채워넣기
        if (targetTr) {
            targetTr.querySelector('.input-code').value = code;
            targetTr.querySelector('.input-start').value = cleanStart;
            targetTr.querySelector('.input-end').value = cleanEnd;
        }
    });

    // 붙여넣기 완료 후 로컬 스토리지 저장
    saveToStorage();
}


window.deleteRow = function (btn) {
    const row = btn.closest("tr");
    if (row) row.remove();
    saveToStorage();
};

function loadFromStorage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    let data = {};
    if (saved) {
        try {
            data = JSON.parse(saved);
        } catch (e) {}
    }

    // 작업자 선택
    if (data.workerId) workerSelect.value = data.workerId;
    else if (typeof CURRENT_WORKER_ID !== "undefined" && CURRENT_WORKER_ID)
        workerSelect.value = CURRENT_WORKER_ID;

    modalBody.innerHTML = "";

    // 우선순위: LocalStorage > ServerData > 기본 1줄
    let rowsData = [];
    if (data.rows && data.rows.length > 0) rowsData = data.rows;
    else if (typeof SERVER_DATA !== "undefined" && SERVER_DATA.length > 0)
        rowsData = SERVER_DATA;

    if (rowsData.length > 0)
        rowsData.forEach((r) => createRow(r.start, r.code, r.end));
    else createRow(); // 기본 1줄

    saveToStorage(); // 열 때 한번 정리 저장
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

    const data = { workerId: workerSelect.value, rows };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ----------------------------------------------------------------
// 4. 서버 저장 (AJAX)
// ----------------------------------------------------------------
function handleSaveManual() {
    const selectedValue = workerSelect.value;
    if (!selectedValue) {
        alert("작업자를 선택해주세요.");
        return;
    }

    const assignments = [];
    let hasError = false;

    modalBody.querySelectorAll("tr").forEach((tr, index) => {
        const sStr = tr.querySelector(".input-start").value.trim();
        const cStr = tr.querySelector(".input-code").value.trim();
        const eStr = tr.querySelector(".input-end").value.trim();

        if (!sStr && !cStr && !eStr) return; // 빈 줄 무시

        // [중요] '0'도 유효한 내용이므로 cStr === "" 만 체크 (0은 통과)
        if (!sStr || !eStr || cStr === "") {
            alert(`${index + 1}번째 줄: 내용(0 포함)과 시간을 모두 입력해야 합니다.`);
            hasError = true;
            return;
        }

        let sMin = timeToMinutes(sStr);
        let eMin = timeToMinutes(eStr);

        if (sMin === null || eMin === null) {
            alert(`${index + 1}번째 줄: 시간 형식이 올바르지 않습니다.`);
            hasError = true;
            return;
        }

        // ✅ 야간 보정: 종료가 시작보다 이르면 다음날로
        if (eMin <= sMin) eMin += 1440;

        if (selectedValue === "all") {
            for (let i = 0; i < workerSelect.options.length; i++) {
                const optVal = workerSelect.options[i].value;
                if (optVal && optVal !== "all") {
                    assignments.push({
                        worker_id: parseInt(optVal, 10),
                        code: cStr,
                        start_min: sMin,
                        end_min: eMin,
                    });
                }
            }
        } else {
            assignments.push({
                worker_id: parseInt(selectedValue, 10),
                code: cStr,
                start_min: sMin,
                end_min: eMin,
            });
        }
    });

    if (hasError) return;
    if (assignments.length === 0) {
        alert("저장할 데이터가 없습니다.");
        return;
    }
    
    // 전체 작업자 선택 시 확인 메시지
    if (selectedValue === "all") {
         if(!confirm("모든 작업자에게 동일하게 적용하시겠습니까?")) return;
    }

    fetch(SAVE_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ assignments }),
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.status === "success") {
                alert("저장되었습니다.");
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            } else {
                alert("오류 발생: " + (data.message || ""));
            }
        })
        .catch((err) => {
            alert("서버 통신 오류");
            console.error(err);
        });
}