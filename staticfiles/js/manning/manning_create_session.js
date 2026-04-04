document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("createSessionForm");
    const aircraftInput = document.querySelector('input[name="aircraft_reg"]');
    const blockCheckSelect = document.querySelector('select[name="block_check"]');
    const shiftSelect = document.querySelector('select[name="shift_type"]');
    const templateRadios = document.querySelectorAll('input[name="area_template"]');
    const templateArea = document.getElementById("template-selection-area");
    const templateErrorMessage = document.getElementById("templateErrorMessage");
    const shiftHelpMessage = document.getElementById("shiftHelpMessage");
    const activeShiftDataEl = document.getElementById("activeShiftCombos");

    let activeShiftCombos = [];

    if (activeShiftDataEl) {
        try {
            activeShiftCombos = JSON.parse(activeShiftDataEl.textContent || "[]");
        } catch (error) {
            console.error("activeShiftCombos JSON parsing error:", error);
            activeShiftCombos = [];
        }
    }

    function normalizeAircraft(value) {
        return String(value || "").trim().toUpperCase();
    }

    function formatAircraftInput(value) {
        const raw = String(value || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");

        const digits = raw.replace(/^HL/, "").replace(/\D/g, "").slice(0, 4);
        return digits ? `HL${digits}` : "";
    }

    function clearTemplateError() {
        if (templateArea) {
            templateArea.classList.remove("template-required-active");
        }
        if (templateErrorMessage) {
            templateErrorMessage.classList.add("d-none");
        }
    }

    function resetShiftOptions() {
        if (!shiftSelect) return;

        Array.from(shiftSelect.options).forEach((option) => {
            option.disabled = false;
        });

        shiftSelect.value = "";
    }

    function updateShiftHelpMessage(disabledShiftValues) {
        if (!shiftHelpMessage) return;

        if (!disabledShiftValues.length) {
            shiftHelpMessage.classList.add("d-none");
            shiftHelpMessage.textContent = "";
            return;
        }

        shiftHelpMessage.textContent =
            `이미 사용 중인 Shift: ${disabledShiftValues.join(", ")}. 다른 Shift를 선택해주세요.`;
        shiftHelpMessage.classList.remove("d-none");
    }

    function updateShiftAvailability() {
        if (!shiftSelect || !blockCheckSelect || !aircraftInput) {
            return;
        }

        const aircraftReg = normalizeAircraft(aircraftInput.value);
        const blockCheck = String(blockCheckSelect.value || "").trim();

        const hasRequiredInfo = aircraftReg && blockCheck;

        shiftSelect.disabled = !hasRequiredInfo;

        if (!hasRequiredInfo) {
            resetShiftOptions();
            updateShiftHelpMessage([]);
            return;
        }

        const disabledShiftSet = new Set(
            activeShiftCombos
                .filter((item) => {
                    return (
                        normalizeAircraft(item.aircraft_reg) === aircraftReg &&
                        String(item.block_check || "").trim() === blockCheck
                    );
                })
                .map((item) => String(item.shift_type || "").trim())
                .filter(Boolean)
        );

        const disabledShiftValues = [];
        let selectedDisabled = false;

        Array.from(shiftSelect.options).forEach((option) => {
            if (!option.value) {
                option.disabled = false;
                return;
            }

            const shouldDisable = disabledShiftSet.has(option.value);
            option.disabled = shouldDisable;

            if (shouldDisable) {
                disabledShiftValues.push(option.value);
            }

            if (shouldDisable && option.selected) {
                selectedDisabled = true;
            }
        });

        if (selectedDisabled) {
            shiftSelect.value = "";
        }

        updateShiftHelpMessage(disabledShiftValues);
    }

    if (blockCheckSelect) {
        blockCheckSelect.required = true;
        blockCheckSelect.addEventListener("change", updateShiftAvailability);
    }

    if (shiftSelect) {
        shiftSelect.required = true;
    }

    if (aircraftInput) {
        aircraftInput.addEventListener("input", (event) => {
            const start = event.target.selectionStart;
            const beforeLength = event.target.value.length;

            event.target.value = formatAircraftInput(event.target.value);

            const afterLength = event.target.value.length;
            const diff = afterLength - beforeLength;
            const newPos = Math.max(0, (start || 0) + diff);

            try {
                event.target.setSelectionRange(newPos, newPos);
            } catch (e) {
                // 일부 환경에서는 setSelectionRange 실패 가능
            }

            updateShiftAvailability();
        });

        aircraftInput.addEventListener("blur", (event) => {
            event.target.value = formatAircraftInput(event.target.value);
            updateShiftAvailability();
        });

        aircraftInput.value = formatAircraftInput(aircraftInput.value || "");
    }

    templateRadios.forEach((radio) => {
        radio.addEventListener("change", clearTemplateError);
    });

    if (form) {
        form.addEventListener("submit", function (event) {
            const selectedTemplate = document.querySelector(
                'input[name="area_template"]:checked'
            );

            let hasError = false;

            if (!selectedTemplate) {
                hasError = true;

                if (templateArea) {
                    templateArea.classList.remove("template-required-active");
                    void templateArea.offsetWidth;
                    templateArea.classList.add("template-required-active");
                }

                if (templateErrorMessage) {
                    templateErrorMessage.classList.remove("d-none");
                }
            } else {
                clearTemplateError();
            }

            if (shiftSelect && !shiftSelect.disabled && !shiftSelect.value) {
                hasError = true;
                shiftSelect.focus();
            }

            if (hasError) {
                event.preventDefault();
            }
        });
    }

    updateShiftAvailability();
});
