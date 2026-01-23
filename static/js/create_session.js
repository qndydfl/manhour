// ----------------------------------------------------------------
// 1. DOM 로드 후 실행 (안전장치)
// ----------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
    
    // HTML에서 선언한 변수가 잘 넘어왔는지 확인 (디버깅용)
    if (typeof CHECK_GIBUN_URL === 'undefined') {
        console.error("❌ CHECK_GIBUN_URL이 정의되지 않았습니다. HTML 파일을 확인하세요.");
        return;
    }

    const gibunContainer = document.getElementById("gibunContainer");
    const gibunInput = document.getElementById("gibunInput");
    const realGibunField = document.getElementById("realGibunField");
    const gibunWarning = document.getElementById("gibunWarning");

    // 요소가 없으면 중단
    if (!gibunContainer || !gibunInput) return;

    let gibunList = [];
    let isProcessing = false;

    // ----------------------------------------------------------------
    // 2. 이벤트 리스너 연결
    // ----------------------------------------------------------------
    
    // 컨테이너 클릭 시 입력창 포커스
    gibunContainer.addEventListener("click", (e) => {
        if (e.target === gibunContainer || e.target === gibunInput) {
            gibunInput.focus();
        }
    });

    // 키보드 입력 이벤트
    gibunInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === "," || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            if (!isProcessing) {
                addGibun(this.value);
            }
        }
        if (e.key === "Backspace" && this.value === "" && gibunList.length > 0) {
            removeGibun(gibunList.length - 1);
        }
    });

    // 포커스 잃었을 때 저장
    gibunInput.addEventListener("blur", function () {
        if (this.value.trim() && !isProcessing) {
            addGibun(this.value);
        }
    });

    // ----------------------------------------------------------------
    // 3. 기번 추가 및 서버 검증 로직
    // ----------------------------------------------------------------
    async function addGibun(text) {
        if (isProcessing) return;

        let cleanText = text.replace(/,/g, "").trim().toUpperCase();
        if (!cleanText) return;

        if (/^\d+$/.test(cleanText)) {
            cleanText = "HL" + cleanText;
        }

        if (gibunList.includes(cleanText)) {
            gibunInput.value = "";
            return;
        }

        isProcessing = true;
        gibunInput.disabled = true;

        try {
            // HTML에서 선언된 전역 변수 CHECK_GIBUN_URL 사용
            const response = await fetch(`${CHECK_GIBUN_URL}?gibun=${cleanText}`);
            const data = await response.json();

            if (data.exists) {
                if (!gibunList.includes(cleanText)) {
                    gibunList.push(cleanText);
                    updateRealField();
                    renderTags();
                }
                if (gibunWarning) gibunWarning.style.display = "none";
                gibunInput.value = "";
            } else {
                if (gibunWarning) {
                    gibunWarning.innerHTML = `
                        <i class="bi bi-exclamation-triangle-fill"></i> '${cleanText}'는 등록되지 않은 기번입니다. 
                        홈페이지에서 데이터 등록 확인해주세요.
                    `;
                    gibunWarning.style.display = "block";
                    setTimeout(() => {
                        gibunWarning.style.display = "none";
                    }, 3000);
                }
                gibunInput.focus();
            }
        } catch (error) {
            console.error("검증 실패:", error);
            alert("서버 통신 오류가 발생했습니다.");
        } finally {
            isProcessing = false;
            gibunInput.disabled = false;
            gibunInput.focus();
        }
    }

    function removeGibun(index) {
        gibunList.splice(index, 1);
        updateRealField();
        renderTags();
    }

    function renderTags() {
        const currentTags = gibunContainer.querySelectorAll(".badge");
        currentTags.forEach((tag) => tag.remove());

        gibunList.forEach((gibun, index) => {
            const badge = document.createElement("span");
            badge.className = "badge bg-primary d-flex align-items-center me-1 mb-1";
            badge.style.fontSize = "0.9rem";
            badge.style.padding = "8px 12px";
            badge.innerHTML = `
                ${gibun}
                <i class="bi bi-x ms-2" style="cursor: pointer;" data-idx="${index}"></i>
            `;
            // X 버튼 이벤트 (동적 요소라 이벤트 위임 또는 직접 연결)
            badge.querySelector('i').onclick = () => removeGibun(index);
            
            gibunContainer.insertBefore(badge, gibunInput);
        });
    }

    function updateRealField() {
        if (realGibunField) {
            realGibunField.value = gibunList.join(",");
            // 폼 유효성 검사 함수 호출 (존재할 경우)
            if (typeof checkFormValidity === 'function') {
                checkFormValidity();
            }
        }
    }

    // 폼 유효성 검사 함수 (JS 파일 내부용)
    function checkFormValidity() {
        // 1. 각 입력 요소 가져오기
        const sessionInput = document.querySelector('input[name="session_name"]');
        const workerInput = document.querySelector('textarea[name="worker_names"]'); // 작업자 명단 (textarea라고 가정)
        
        // 2. 값 존재 여부 확인
        const isSessionFilled = sessionInput && sessionInput.value.trim() !== "";
        const isWorkerFilled = workerInput && workerInput.value.trim() !== "";
        const isGibunFilled = gibunList.length > 0; // 기번 리스트가 비어있지 않은지

        const submitBtn = document.getElementById("submitBtn");
        const req = document.getElementById("form_requirements");

        if (submitBtn) {
            // [조건] 세션이름, 작업자명단, 기번 3가지가 모두 있어야 버튼 활성화
            if (isSessionFilled && isWorkerFilled && isGibunFilled) {
                submitBtn.disabled = false;
                if (req) {
                    req.innerText = ""; // 메시지 클리어
                    req.classList.remove("text-danger");
                }
            } else {
                submitBtn.disabled = true;
                if (req) {
                    // [요청하신 문구 적용]
                    req.innerText = "필수: 작업자 명단, 항공기 기번 입력 필수 입니다.";
                    req.classList.add("text-danger");
                }
            }
        }
    }

    // [중요] 초기 실행 및 이벤트 리스너 연결
    // 세션 이름 입력 시 검사
    const sessionInput = document.querySelector('input[name="session_name"]');
    if (sessionInput) {
        sessionInput.addEventListener("input", checkFormValidity);
    }

    // [추가] 작업자 명단 입력 시 검사 (실시간 반영을 위해 추가)
    const workerInput = document.querySelector('textarea[name="worker_names"]');
    if (workerInput) {
        workerInput.addEventListener("input", checkFormValidity);
    }

    // 페이지 로드 시 한 번 실행
    checkFormValidity();
});