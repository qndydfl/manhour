document.addEventListener("DOMContentLoaded", function () {
    // ------------------------------------------------------------
    // 1. 초기화 및 요소 확인
    // ------------------------------------------------------------
    if (typeof CHECK_GIBUN_URL === "undefined") {
        console.error("❌ CHECK_GIBUN_URL이 정의되지 않았습니다.");
        return;
    }

    const gibunContainer = document.getElementById("gibunContainer");
    const gibunInput = document.getElementById("gibunInput");
    const realGibunField = document.getElementById("realGibunField");
    const gibunWarning = document.getElementById("gibunWarning");
    const sessionInput = document.querySelector('input[name="session_name"]');
    const workerInput = document.querySelector('textarea[name="worker_names"]');
    const submitBtn = document.getElementById("submitBtn");
    const reqText = document.getElementById("form_requirements");

    if (!gibunContainer || !gibunInput || !realGibunField) {
        console.error("❌ 필수 요소(gibunContainer 등)가 누락되었습니다.");
        return;
    }

    let gibunList = [];
    let isProcessing = false;

    // ------------------------------------------------------------
    // 2. UI/UX: 포커스 효과 및 클릭 이벤트 (통합됨)
    // ------------------------------------------------------------
    
    // 컨테이너 클릭 시 입력창 포커스
    gibunContainer.addEventListener("click", (e) => {
        // X 버튼 클릭이 아닐 때만 포커스 이동
        if (!e.target.closest(".bi-x")) {
            gibunInput.focus();
        }
    });

    // 입력창 포커스 시: 스타일(링) 추가
    gibunInput.addEventListener("focus", () => {
        gibunContainer.classList.add("border-primary", "ring-focus");
    });

    // 입력창 블러 시: 스타일 제거 & 텍스트 처리
    gibunInput.addEventListener("blur", function () {
        gibunContainer.classList.remove("border-primary", "ring-focus");
        if (this.value.trim() && !isProcessing) {
            addGibunsFromText(this.value);
        }
    });

    // X 버튼 클릭 (태그 삭제) - 이벤트 위임
    gibunContainer.addEventListener("click", (e) => {
        const icon = e.target.closest("i[data-idx]");
        if (!icon) return;
        const idx = Number(icon.dataset.idx);
        if (!Number.isNaN(idx)) removeGibun(idx);
    });

    // ------------------------------------------------------------
    // 3. 기번 입력 및 태그 처리 로직
    // ------------------------------------------------------------
    gibunInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (!isProcessing) addGibunsFromText(this.value);
            return;
        }
        if (e.key === " ") {
            e.preventDefault(); // 스페이스바도 입력 트리거로 사용
            if (!isProcessing) addGibunsFromText(this.value);
            return;
        }
        if (e.key === "Backspace" && this.value === "" && gibunList.length > 0) {
            removeGibun(gibunList.length - 1);
        }
    });

    async function addGibunsFromText(text) {
        const raw = String(text || "").trim();
        if (!raw) return;

        // 콤마/공백/줄바꿈 분리
        const tokens = raw.split(/[\s,]+/g).map((t) => t.trim()).filter(Boolean);
        gibunInput.value = "";

        for (const t of tokens) {
            await addGibun(t);
        }
    }

    async function addGibun(text) {
        if (isProcessing) return;

        let cleanText = String(text || "").replace(/,/g, "").trim().toUpperCase();
        if (!cleanText) return;

        // 숫자만 있으면 앞에 'HL' 자동 추가
        if (/^\d+$/.test(cleanText)) cleanText = "HL" + cleanText;

        if (gibunList.includes(cleanText)) return;

        isProcessing = true;
        gibunInput.disabled = true;

        try {
            const url = `${CHECK_GIBUN_URL}?gibun=${encodeURIComponent(cleanText)}`;
            const response = await fetch(url, {
                headers: { Accept: "application/json" },
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data && data.exists) {
                gibunList.push(cleanText);
                updateRealField();
                renderTags();
                if (gibunWarning) gibunWarning.style.setProperty("display", "none", "important");
            } else {
                showWarning(`'${cleanText}'는 등록되지 않은 기번입니다.`);
            }
        } catch (error) {
            console.error("검증 실패:", error);
            showWarning("서버 통신 오류가 발생했습니다.");
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
        // 기존 태그 삭제 (input 제외)
        gibunContainer.querySelectorAll(".badge[data-tag='gibun']").forEach((tag) => tag.remove());

        gibunList.forEach((gibun, index) => {
            const badge = document.createElement("span");
            badge.className = "badge bg-primary d-flex align-items-center me-1 mb-1";
            badge.dataset.tag = "gibun";
            badge.style.fontSize = "0.9rem";
            badge.style.padding = "8px 12px";
            badge.innerHTML = `${gibun} <i class="bi bi-x ms-2" style="cursor:pointer;" data-idx="${index}"></i>`;
            gibunContainer.insertBefore(badge, gibunInput);
        });
    }

    function updateRealField() {
        realGibunField.value = gibunList.join(",");
        checkFormValidity();
    }

    function showWarning(msg) {
        if (gibunWarning) {
            gibunWarning.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> ${msg}`;
            gibunWarning.style.setProperty("display", "flex", "important");
            setTimeout(() => {
                gibunWarning.style.setProperty("display", "none", "important");
            }, 3000);
        }
    }

    // ------------------------------------------------------------
    // 4. 유효성 검사 (Form Validation)
    // ------------------------------------------------------------
    function checkFormValidity() {
        if (!submitBtn) return;

        const isSessionFilled = sessionInput && sessionInput.value.trim() !== "";
        const isWorkerFilled = workerInput && workerInput.value.trim() !== "";
        const isGibunFilled = gibunList.length > 0;

        if (isSessionFilled && isWorkerFilled && isGibunFilled) {
            submitBtn.disabled = false;
            if (reqText) {
                reqText.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>모든 준비가 완료되었습니다!`;
                reqText.classList.remove("text-danger");
                reqText.classList.add("text-success");
            }
        } else {
            submitBtn.disabled = true;
            if (reqText) {
                reqText.innerHTML = `<i class="bi bi-exclamation-circle me-1"></i>세션 이름, 작업자, 항공기 기번은 필수입니다.`;
                reqText.classList.remove("text-success");
                reqText.classList.add("text-danger");
            }
        }
    }

    // 입력 이벤트 리스너 연결
    if (sessionInput) sessionInput.addEventListener("input", checkFormValidity);
    if (workerInput) workerInput.addEventListener("input", checkFormValidity);

    // 초기 검사 실행
    checkFormValidity();
});

// ------------------------------------------------------------
// 5. 전역 함수: 세션 슬롯 선택 (HTML onclick에서 호출됨)
// ------------------------------------------------------------
window.selectSession = function(slotName, btnElement) {
    const input = document.querySelector('input[name="session_name"]');
    if (!input) return;

    // 값 입력
    input.value = slotName;
    
    // 버튼 스타일 변경
    document.querySelectorAll('.slot-btn').forEach(btn => {
        btn.classList.remove('active-slot');
        // 기존 클래스 복구 (선택 해제 시)
        if (!btn.disabled) {
            btn.classList.add('bg-white');
        }
    });

    // 선택된 버튼 스타일 적용
    btnElement.classList.remove('bg-white');
    btnElement.classList.add('active-slot');

    // 유효성 검사 트리거
    input.dispatchEvent(new Event('input'));
};