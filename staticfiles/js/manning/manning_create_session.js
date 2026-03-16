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

    const activeShiftCombos = activeShiftDataEl
        ? JSON.parse(activeShiftDataEl.textContent)
        : [];

    function normalizeAircraft(value) {
        return String(value || "").trim().toUpperCase();
    }

    function formatAircraftInput(value) {
        const digits = String(value || "")
            .replace(/\D/g, "")
            .slice(0, 4);

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

    function updateShiftAvailability() {
        if (!shiftSelect || !blockCheckSelect || !aircraftInput) {
            return;
        }

        const aircraftReg = normalizeAircraft(aircraftInput.value);
        const blockCheck = String(blockCheckSelect.value || "").trim();

        const disabledShiftSet = new Set(
            activeShiftCombos
                .filter((item) => {
                    return (
                        normalizeAircraft(item.aircraft_reg) === aircraftReg &&
                        String(item.block_check || "").trim() === blockCheck
                    );
                })
                .map((item) => String(item.shift_type || "").trim())
        );

        let selectedDisabled = false;
        let disabledCount = 0;

        Array.from(shiftSelect.options).forEach((option) => {
            if (!option.value) {
                option.disabled = false;
                return;
            }

            option.disabled = disabledShiftSet.has(option.value);

            if (option.disabled) {
                disabledCount += 1;
            }

            if (option.disabled && option.selected) {
                selectedDisabled = true;
                option.selected = false;
            }
        });

        if (selectedDisabled) {
            shiftSelect.value = "";
        }

        if (shiftHelpMessage) {
            if (disabledCount > 0) {
                shiftHelpMessage.classList.remove("d-none");
            } else {
                shiftHelpMessage.classList.add("d-none");
            }
        }
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
            const formatted = formatAircraftInput(event.target.value);
            event.target.value = formatted;
            updateShiftAvailability();
        });

        aircraftInput.addEventListener("blur", (event) => {
            event.target.value = formatAircraftInput(event.target.value);
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

            if (!selectedTemplate) {
                event.preventDefault();

                if (templateArea) {
                    templateArea.classList.remove("template-required-active");
                    void templateArea.offsetWidth;
                    templateArea.classList.add("template-required-active");
                }

                if (templateErrorMessage) {
                    templateErrorMessage.classList.remove("d-none");
                }
            }
        });
    }

    updateShiftAvailability();
});