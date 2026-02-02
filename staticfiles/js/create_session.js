// static/js/create_session.js

document.addEventListener("DOMContentLoaded", function () {
    if (typeof CHECK_GIBUN_URL === "undefined") {
        console.error("❌ CHECK_GIBUN_URL 정의 안됨");
        return;
    }

    const gibunContainer = document.getElementById("gibunContainer");
    const gibunInput = document.getElementById("gibunInput");
    const realGibunField = document.getElementById("realGibunField");
    const gibunWarning = document.getElementById("gibunWarning");

    // 폼 요소
    const sessionInput = document.querySelector('input[name="session_name"]');
    const workerInput = document.querySelector('textarea[name="worker_names"]');
    const shiftInputs = document.querySelectorAll('input[name="shift_type"]');
    const submitBtn = document.getElementById("submitBtn");
    const reqText = document.getElementById("form_requirements");

    if (!gibunContainer || !gibunInput || !realGibunField) return;

    let gibunList = [];
    let isProcessing = false;

    // 1. 기번 입력 UX
    gibunContainer.addEventListener("click", (e) => {
        if (!e.target.closest(".bi-x")) gibunInput.focus();
    });

    gibunInput.addEventListener("blur", function () {
        if (this.value.trim() && !isProcessing) addGibunsFromText(this.value);
    });

    gibunInput.addEventListener("keydown", function (e) {
        if (e.isComposing) return; // ✅ 한글 조합 중이면 무시

        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (!isProcessing) addGibunsFromText(this.value);
        }

        if (
            e.key === "Backspace" &&
            this.value === "" &&
            gibunList.length > 0
        ) {
            removeGibun(gibunList.length - 1);
        }
    });

    // 태그 삭제 클릭
    gibunContainer.addEventListener("click", (e) => {
        const icon = e.target.closest("i[data-idx]");
        if (icon) removeGibun(Number(icon.dataset.idx));
    });

    // 2. 기번 추가 로직
    async function addGibunsFromText(text) {
        const raw = String(text || "").trim();
        if (!raw) return;
        // const tokens = raw
        //     .split(/[\s,]+/g)
        //     .map((t) => t.trim())
        //     .filter(Boolean);
        const tokens = raw
            .split(/[,]+/g)
            .map((t) => t.replace(/\s+/g, "").trim())
            .filter(Boolean);
        gibunInput.value = "";
        for (const t of tokens) await addGibun(t);
    }

    async function addGibun(text) {
        if (isProcessing) return;
        let cleanText = String(text).replace(/,/g, "").trim().toUpperCase();
        if (/^\d+$/.test(cleanText)) cleanText = "HL" + cleanText;
        if (gibunList.includes(cleanText)) return;

        isProcessing = true;
        gibunInput.disabled = true;

        try {
            const url = `${CHECK_GIBUN_URL}?gibun=${encodeURIComponent(cleanText)}`;
            const res = await fetch(url, {
                headers: { Accept: "application/json" },
            });

            const text = await res.text();
            let data = null;
            try {
                data = JSON.parse(text);
            } catch (parseErr) {
                console.error("[check_gibun] invalid JSON", text);
                throw new Error("invalid_json");
            }

            if (!res.ok) {
                console.error("[check_gibun] HTTP error", res.status, data);
                throw new Error(`http_${res.status}`);
            }

            if (data && data.exists) {
                gibunList.push(cleanText);
                updateRealField();
                renderTags();
                if (gibunWarning)
                    gibunWarning.style.setProperty(
                        "display",
                        "none",
                        "important",
                    );
            } else {
                showWarning(`'${cleanText}'는 등록되지 않은 기번입니다.`);
            }
        } catch (e) {
            console.error("[check_gibun] fetch failed", e);
            showWarning("서버 오류");
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
        gibunContainer
            .querySelectorAll(".badge[data-tag='gibun']")
            .forEach((tag) => tag.remove());
        gibunList.forEach((gibun, index) => {
            const badge = document.createElement("span");
            badge.className =
                "badge bg-primary d-flex align-items-center me-1 mb-1";
            badge.dataset.tag = "gibun";
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

    // 3. 유효성 검사 (단순 체크)
    function checkFormValidity() {
        if (!submitBtn) return;

        const isShiftSelected = Array.from(shiftInputs).some(
            (input) => input.checked,
        );

        const ok =
            sessionInput.value.trim() &&
            workerInput.value.trim() &&
            gibunList.length > 0 &&
            isShiftSelected;

        submitBtn.disabled = !ok;

        if (reqText) {
            if (ok) {
                reqText.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>준비 완료!`;
                reqText.classList.replace("text-danger", "text-success");
            } else {
                reqText.innerHTML = `<i class="bi bi-exclamation-circle me-1"></i>필수 항목을 입력해주세요.`;
                reqText.classList.replace("text-success", "text-danger");
            }
        }
    }

    if (sessionInput) sessionInput.addEventListener("input", checkFormValidity);
    if (workerInput) workerInput.addEventListener("input", checkFormValidity);
    shiftInputs.forEach((input) =>
        input.addEventListener("change", checkFormValidity),
    );
});
