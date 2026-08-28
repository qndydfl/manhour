document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("createSessionForm") ||
        document.getElementById("editSessionForm");
    const workPackageSelect = document.getElementById("id_work_package_name");
    const blockCheckField = document.getElementById("blockCheckField");
    const blockCheckSelect = document.getElementById("id_block_check");
    const templateOptions = Array.from(
        document.querySelectorAll(".template-option[data-work-packages]"),
    );
    const templateError = document.getElementById("templateErrorMessage");
    const emptyMessage = document.getElementById(
        "noTemplatesForWorkPackage",
    );

    if (!workPackageSelect) return;

    const normalize = (value) => String(value || "").trim().toLowerCase();
    const normalizeKey = (value) => normalize(value).replace(/[^a-z0-9]/g, "");
    let engineChangeDefaultApplied = false;
    let previousBlockCheckValue = "";

    function updateBlockCheckVisibility() {
        const isEngineChange =
            normalizeKey(workPackageSelect.value) === "enginechange";

        blockCheckField?.classList.toggle("d-none", isEngineChange);
        if (!blockCheckSelect) return;

        blockCheckSelect.required = !isEngineChange;
        if (isEngineChange) {
            if (!engineChangeDefaultApplied) {
                previousBlockCheckValue = blockCheckSelect.value;
            }
            blockCheckSelect.value = "1A";
            engineChangeDefaultApplied = true;
        } else if (engineChangeDefaultApplied) {
            blockCheckSelect.value = previousBlockCheckValue;
            engineChangeDefaultApplied = false;
        }
    }

    function filterTemplates() {
        const selectedPackage = normalize(workPackageSelect.value);
        let visibleCount = 0;

        templateOptions.forEach((option) => {
            const packages = String(option.dataset.workPackages || "")
                .split("|")
                .map(normalize)
                .filter(Boolean);
            const isVisible = Boolean(
                selectedPackage && packages.includes(selectedPackage),
            );
            const radio = option.querySelector(".template-radio");

            option.classList.toggle("d-none", !isVisible);
            if (radio) {
                radio.disabled = !isVisible;
                if (!isVisible) radio.checked = false;
            }
            if (isVisible) visibleCount += 1;
        });

        emptyMessage?.classList.toggle(
            "d-none",
            !selectedPackage || visibleCount > 0,
        );
        templateError?.classList.add("d-none");
    }

    workPackageSelect.addEventListener("change", filterTemplates);
    workPackageSelect.addEventListener("change", updateBlockCheckVisibility);

    form?.addEventListener("submit", (event) => {
        const selectedTemplate = document.querySelector(
            ".template-radio:not(:disabled):checked",
        );
        if (!selectedTemplate) {
            event.preventDefault();
            templateError?.classList.remove("d-none");
            document.getElementById("template-selection-area")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
        }
    });

    document
        .querySelector(".manning-message-area")
        ?.classList.add("manning-form-floating-message");

    updateBlockCheckVisibility();
    filterTemplates();
});
