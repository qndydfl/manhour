// ----------------------------------------------------------------
// 1. 설정 및 유틸리티
// ----------------------------------------------------------------
const STORAGE_KEY = 'manning_input_personal_' + SESSION_ID;

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
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
    return h * 60 + m;
}

// DOM이 로드된 후 실행되도록 이벤트 리스너 추가 (안전장치)
document.addEventListener('DOMContentLoaded', function() {
    const manualModal = document.getElementById('manualInputModal');
    if (manualModal) {
        manualModal.addEventListener('show.bs.modal', function () {
            loadFromStorage();
        });
    }

    const addRowBtn = document.getElementById('btn-add-row');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', function() {
            createRow();
            saveToStorage();
        });
    }
    
    // 저장 버튼 이벤트 리스너도 여기서 연결
    const saveBtn = document.getElementById('btn-save-manual');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSaveManual);
    }
});

// ----------------------------------------------------------------
// 2. 모달 초기화 및 동적 행 관리
// ----------------------------------------------------------------
const modalBody = document.getElementById('modal-rows-body');
const workerSelect = document.getElementById('modal-worker-select');

document.getElementById('manualInputModal').addEventListener('show.bs.modal', function () {
    loadFromStorage();
});

// 행 추가 버튼 이벤트
document.getElementById('btn-add-row').addEventListener('click', function() {
    createRow();
    saveToStorage();
});

// 행 생성 함수
function createRow(start = '', code = '', end = '') {
    const tr = document.createElement('tr');

    // [핵심 1] 모든 인풋 필드에 숫자만 입력되도록 처리 (oninput)
    tr.innerHTML = `
        <td>
            <input type="text" class="form-control form-control-sm text-center input-start"
                maxlength="4" value="${start}"
                oninput="this.value = this.value.replace(/[^0-9]/g, '')">
        </td>
        <td>
            <input type="text" class="form-control form-control-sm input-code text-center"
                value="${code}"
                oninput="this.value = this.value.replace(/[^0-9]/g, '')">
        </td>
        <td>
            <input type="text" class="form-control form-control-sm text-center input-end"
                maxlength="4" value="${end}"
                oninput="this.value = this.value.replace(/[^0-9]/g, '')">
        </td>
        <td>
            <button type="button" class="btn btn-sm btn-danger py-0" onclick="deleteRow(this)">✕</button>
        </td>
    `;
    modalBody.appendChild(tr);

    const inputs = tr.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', saveToStorage);
    });
}

window.deleteRow = function(btn) {
    const row = btn.closest('tr');
    row.remove();
    saveToStorage();
};

function loadFromStorage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    let data = {};

    // 1. 임시 저장된 내용이 있는지 확인
    if (saved) {
        try { data = JSON.parse(saved); } catch (e) {}
    }

    // 2. 작업자 선택 (기존 로직)
    if (data.workerId) {
        workerSelect.value = data.workerId;
    } else if (CURRENT_WORKER_ID) {
        workerSelect.value = CURRENT_WORKER_ID;
    }

    modalBody.innerHTML = '';

    // 3. [수정됨] 데이터 로드 우선순위: LocalStorage > ServerData > 빈칸
    let rowsData = [];

    if (data.rows && data.rows.length > 0) {
        // A. 임시 저장된 작성 중인 데이터가 있으면 그걸 먼저 보여줌
        rowsData = data.rows;
    } else if (SERVER_DATA.length > 0) {
        // B. 임시 저장이 없으면, 서버에 저장된 기존 데이터를 보여줌 (수정 모드)
        rowsData = SERVER_DATA;
    }

    // 4. 행 생성
    if (rowsData.length > 0) {
        rowsData.forEach(r => createRow(r.start, r.code, r.end));
    } else {
        // 데이터가 하나도 없으면 기본 5줄 생성
        for (let i = 0; i < 5; i++) createRow();
    }

    workerSelect.addEventListener('change', saveToStorage);
}

function saveToStorage() {
    const rows = [];
    const trs = modalBody.querySelectorAll('tr');
    trs.forEach(tr => {
        rows.push({
            start: tr.querySelector('.input-start').value,
            code: tr.querySelector('.input-code').value,
            end: tr.querySelector('.input-end').value
        });
    });
    const data = { workerId: workerSelect.value, rows: rows };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ----------------------------------------------------------------
// 3. 서버 저장 (AJAX) - '0' 입력 시 제외 처리
// ----------------------------------------------------------------
document.getElementById('btn-save-manual').addEventListener('click', function() {
    const selectedValue = workerSelect.value;
    if (!selectedValue) {
        alert("작업자를 선택해주세요.");
        return;
    }

    const assignments = [];
    const trs = modalBody.querySelectorAll('tr');
    let hasError = false;

    trs.forEach((tr, index) => {
        const sStr = tr.querySelector('.input-start').value.trim();
        const cStr = tr.querySelector('.input-code').value.trim();
        const eStr = tr.querySelector('.input-end').value.trim();

        if (!sStr && !cStr && !eStr) return; // 빈 줄 무시

        // [삭제됨] if (cStr === '0') return;  <-- 이 줄을 지웠습니다! (0도 저장되도록)

        if (!sStr || !eStr || !cStr) {
            alert(`${index + 1}번째 줄: 내용을 모두 입력해야 합니다.`);
            hasError = true;
            return;
        }

        // ... (이후 시간 변환 및 검증 로직은 기존과 동일) ...

        const sMin = timeToMinutes(sStr);
        const eMin = timeToMinutes(eStr);

        if (sMin === null || eMin === null) {
            alert(`${index + 1}번째 줄: 시간 형식이 올바르지 않습니다.`);
            hasError = true;
            return;
        }

        // 데이터 담기 (동일함)
        if (selectedValue === 'all') {
            for (let i = 0; i < workerSelect.options.length; i++) {
                const optVal = workerSelect.options[i].value;
                if (optVal && optVal !== 'all') {
                    assignments.push({
                        worker_id: parseInt(optVal),
                        code: cStr,
                        start_min: sMin,
                        end_min: eMin
                    });
                }
            }
        } else {
            assignments.push({
                worker_id: parseInt(selectedValue),
                code: cStr,
                start_min: sMin,
                end_min: eMin
            });
        }
    });

    if (hasError) return;
    if (assignments.length === 0) {
        alert("저장할 데이터가 없습니다.");
        return;
    }

    // ... (fetch 전송 부분 동일) ...
    fetch(SAVE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ assignments: assignments })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            alert('저장되었습니다.');
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        } else {
            alert('오류 발생: ' + data.message);
        }
    })
    .catch(err => {
        alert('서버 통신 오류');
        console.error(err);
    });
});