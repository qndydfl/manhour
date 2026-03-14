document.addEventListener("DOMContentLoaded", function () {
    const aircraftInput = document.querySelector('input[name="aircraft_reg"]');
    const blockCheckSelect = document.querySelector(
        'select[name="block_check"]',
    );
    const shiftSelect = document.querySelector('select[name="shift_type"]');
    const templateRadios = document.querySelectorAll(
        'input[name="area_template"]',
    );
    const activeShiftDataEl = document.getElementById("activeShiftCombos");
    const activeShiftCombos = activeShiftDataEl
        ? JSON.parse(activeShiftDataEl.textContent)
        : [];

    function normalizeAircraft(value) {
        return (value || "").trim().toUpperCase();
    }

    function formatAircraftInput(value) {
        const digits = String(value || "")
            .replace(/\D/g, "")
            .slice(0, 4);
        return `HL${digits}`;
    }

    function updateShiftAvailability() {
        if (!shiftSelect || !blockCheckSelect || !aircraftInput) {
            return;
        }

        const aircraftReg = normalizeAircraft(aircraftInput.value);
        const blockCheck = (blockCheckSelect.value || "").trim();

        const disabledShiftSet = new Set(
            activeShiftCombos
                .filter(
                    (item) =>
                        normalizeAircraft(item.aircraft_reg) === aircraftReg &&
                        String(item.block_check || "").trim() === blockCheck,
                )
                .map((item) => String(item.shift_type || "").trim()),
        );

        let selectedDisabled = false;
        Array.from(shiftSelect.options).forEach((option) => {
            if (!option.value) {
                option.disabled = false;
                return;
            }

            option.disabled = disabledShiftSet.has(option.value);
            if (option.disabled && option.selected) {
                selectedDisabled = true;
                option.selected = false;
            }
        });

        if (selectedDisabled) {
            shiftSelect.value = "";
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
        aircraftInput.value = formatAircraftInput(aircraftInput.value || "");
        aircraftInput.addEventListener("input", (event) => {
            const formatted = formatAircraftInput(event.target.value);
            event.target.value = formatted;
            updateShiftAvailability();
        });
        aircraftInput.addEventListener("blur", (event) => {
            event.target.value = formatAircraftInput(event.target.value);
        });
    }
    if (activeShiftDataEl) {
        templateRadios.forEach((radio) => {
            radio.required = true;
        });
    }

    updateShiftAvailability();
});
