document.addEventListener("DOMContentLoaded", () => {
    const regInput =
        document.querySelector("input[name='aircraft_reg']") ||
        document.querySelector("#id_aircraft_reg");

    if (!regInput || regInput.disabled) {
        return;
    }

    const formatReg = (value) => {
        const raw = String(value || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "");

        if (!raw) {
            return "HL";
        }

        if (raw.startsWith("HL")) {
            return `HL${raw.slice(2)}`;
        }

        if (/^\d+$/.test(raw)) {
            return `HL${raw}`;
        }

        return raw;
    };

    regInput.addEventListener("blur", () => {
        regInput.value = formatReg(regInput.value);
    });
});