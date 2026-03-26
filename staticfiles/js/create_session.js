document.addEventListener("DOMContentLoaded", function () {
    if (typeof CHECK_GIBUN_URL === "undefined") {
        console.error("CHECK_GIBUN_URL 정의 안됨");
        return;
    }

    const form = document.getElementById("createSessionForm");
    const gibunContainer = document.getElementById("gibunContainer");
    const gibunInput = document.getElementById("gibunInput");
    const gibunError = document.getElementById("gibunError");
    const realGibunField = document.getElementById("realGibunField");
    const gibunWarning = document.getElementById("gibunWarning");

    const sessionInput = document.querySelector('input[name="session_name"]');
    const workerInput = document.querySelector('textarea[name="worker_names"]');
    const shiftInputs = document.querySelectorAll('input[name="shift_type"]');
    const submitBtn = document.getElementById("submitBtn");
    const reqText = document.getElementById("form_requirements");

    if (!gibunContainer || !gibunInput || !realGibunField) return;

    let gibunList = [];
    let isProcessing = false;
    let warningTimer = null;

    gibunContainer.addEventListener("click", (e) => {
        if (!e.target.closest(".remove-tag")) {
            gibunInput.focus();
        }
    });

    gibunInput.addEventListener("focus", () => {
        gibunContainer.classList.add("ring-focus");
    });

    gibunInput.addEventListener("blur", async function () {
        gibunContainer.classList.remove("ring-focus");

        const pending = this.value.trim();
        if (pending && !isProcessing) {
            await addGibunsFromText(pending);
        }
    });

    gibunInput.addEventListener("keydown", async function (e) {
        if (e.isComposing) return;

        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (!isProcessing && this.value.trim()) {
                await addGibunsFromText(this.value);
            }
        }

        if (
            e.key === "Backspace" &&
            this.value === "" &&
            gibunList.length > 0
        ) {
            removeGibun(gibunList.length - 1);
        }
    });

    gibunContainer.addEventListener("click", (e) => {
        const removeIcon = e.target.closest("[data-idx]");
        if (!removeIcon) return;

        const idx = Number(removeIcon.dataset.idx);
        if (!Number.isNaN(idx)) {
            removeGibun(idx);
        }
    });

    async function addGibunsFromText(text) {
        const raw = String(text || "").trim();
        if (!raw) return;

        const tokens = raw
            .split(/[,]+/g)
            .map((t) => t.replace(/\s+/g, "").trim())
            .filter(Boolean);

        gibunInput.value = "";

        for (const token of tokens) {
            await addGibun(token);
        }

        checkFormValidity();
    }

    async function addGibun(text) {
        if (isProcessing) return;

        let cleanText = String(text || "")
            .replace(/,/g, "")
            .replace(/\s+/g, "")
            .trim()
            .toUpperCase();

        if (!cleanText) return;

        if (/^\d+$/.test(cleanText)) {
            cleanText = "HL" + cleanText;
        }

        if (gibunList.includes(cleanText)) {
            return;
        }

        isProcessing = true;
        gibunInput.disabled = true;

        try {
            const url = `${CHECK_GIBUN_URL}?gibun=${encodeURIComponent(cleanText)}`;
            const res = await fetch(url, {
                headers: { Accept: "application/json" },
            });

            const rawText = await res.text();
            let data;

            try {
                data = JSON.parse(rawText);
            } catch (err) {
                console.error("[check_gibun] JSON 파싱 실패:", rawText);
                throw new Error("invalid_json");
            }

            if (!res.ok) {
                console.error("[check_gibun] HTTP 에러:", res.status, data);
                throw new Error(`http_${res.status}`);
            }

            if (data && data.exists) {
                gibunList.push(cleanText);
                updateRealField();
                renderTags();
                hideWarning();
            }
        } catch (err) {
            console.error("[check_gibun] 요청 실패:", err);
            hideWarning();
        } finally {
            isProcessing = false;
            gibunInput.disabled = false;
            gibunInput.focus();
        }
    }

    function removeGibun(index) {
        if (index < 0 || index >= gibunList.length) return;

        gibunList.splice(index, 1);
        updateRealField();
        renderTags();
        checkFormValidity();
    }

    function renderTags() {
        gibunContainer
            .querySelectorAll(".gibun-badge")
            .forEach((tag) => tag.remove());

        gibunList.forEach((gibun, index) => {
            const badge = document.createElement("span");
            badge.className = "gibun-badge";
            badge.innerHTML = `
                <span>${gibun}</span>
                <i class="bi bi-x remove-tag" data-idx="${index}" title="삭제"></i>
            `;
            gibunContainer.insertBefore(badge, gibunInput);
        });
    }

    gibunInput.addEventListener("input", function () {
        const value = this.value.trim();

        if (value === "") {
            gibunError.style.display = "none";
            return;
        }

        if (!/^\d+$/.test(value)) {
            gibunError.textContent = "숫자로 입력해 주세요";
            gibunError.style.display = "block";
        } else {
            gibunError.style.display = "none";
        }
    });

    function updateRealField() {
        realGibunField.value = gibunList.join(",");
    }

    function showWarning(message) {
        return;
    }

    function hideWarning() {
        if (!gibunWarning) return;
        gibunWarning.style.display = "none";
    }

    function checkFormValidity() {
        if (!submitBtn) return;

        const isShiftSelected = Array.from(shiftInputs).some(
            (input) => input.checked,
        );

        const isValid =
            !!sessionInput?.value.trim() &&
            !!workerInput?.value.trim() &&
            gibunList.length > 0 &&
            isShiftSelected;

        submitBtn.disabled = !isValid;

        if (reqText) {
            if (isValid) {
                reqText.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>준비 완료!`;
                reqText.classList.remove("text-danger");
                reqText.classList.add("text-success");
            } else {
                reqText.innerHTML = `<i class="bi bi-exclamation-circle me-1"></i>필수 항목을 모두 입력해주세요.`;
                reqText.classList.remove("text-success");
                reqText.classList.add("text-danger");
            }
        }
    }

    if (sessionInput) {
        sessionInput.addEventListener("input", checkFormValidity);
    }

    if (workerInput) {
        workerInput.addEventListener("input", checkFormValidity);
    }

    shiftInputs.forEach((input) => {
        input.addEventListener("change", checkFormValidity);
    });

    if (form) {
        form.addEventListener("submit", async function (e) {
            const pending = gibunInput.value.trim();

            if (pending && !isProcessing) {
                e.preventDefault();
                await addGibunsFromText(pending);

                if (!submitBtn.disabled) {
                    form.submit();
                }
                return;
            }

            checkFormValidity();

            if (submitBtn.disabled) {
                e.preventDefault();
            }
        });
    }

    // 최초 상태 체크
    checkFormValidity();
});
