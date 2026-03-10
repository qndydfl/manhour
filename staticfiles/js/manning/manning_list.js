document.addEventListener("DOMContentLoaded", () => {
    const regInput = document.querySelector(
        "#createSessionModal input[name='aircraft_reg']",
    );
    if (!regInput || regInput.disabled) {
        return;
    }

    const formatReg = (value) => {
        const raw = String(value || "")
            .trim()
            .toUpperCase();
        if (!raw) {
            return "HL";
        }
        if (raw.startsWith("HL")) {
            const rest = raw.slice(2).replace(/\s+/g, "");
            return `HL${rest}`;
        }
        if (/^\d+$/.test(raw)) {
            return `HL${raw}`;
        }
        return raw;
    };

    regInput.value = formatReg(regInput.value || "HL");

    regInput.addEventListener("input", () => {
        const formatted = formatReg(regInput.value);
        regInput.value = formatted;
    });

    regInput.addEventListener("blur", () => {
        regInput.value = formatReg(regInput.value);
    });
});
