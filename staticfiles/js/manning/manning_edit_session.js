document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("editSessionForm");
    const regInput =
        document.querySelector("input[name='aircraft_reg']") ||
        document.querySelector("#id_aircraft_reg");
    const templateArea = document.getElementById("template-selection-area");
    const templateErrorMessage = document.getElementById(
        "templateErrorMessage",
    );
    const templateRadios = document.querySelectorAll(
        'input[name="area_template"]',
    );
    const templateLabels = document.querySelectorAll(".template-card");

    const clearTemplateError = () => {
        if (templateArea) {
            templateArea.classList.remove("template-required-active");
        }
        if (templateErrorMessage) {
            templateErrorMessage.classList.add("d-none");
        }
    };

    templateLabels.forEach((label) => {
        label.addEventListener("click", () => {
            const targetId = label.getAttribute("for");
            const radio = targetId ? document.getElementById(targetId) : null;
            if (!radio) {
                return;
            }
            radio.checked = true;
            radio.dispatchEvent(new Event("change", { bubbles: true }));
        });
    });

    templateRadios.forEach((radio) => {
        radio.addEventListener("change", clearTemplateError);
    });

    if (form) {
        form.addEventListener("submit", (event) => {
            const hasTemplateOptions = templateRadios.length > 0;
            const selectedTemplate = document.querySelector(
                'input[name="area_template"]:checked',
            );

            if (hasTemplateOptions && !selectedTemplate) {
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
