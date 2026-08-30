document.addEventListener("DOMContentLoaded", function () {
    const workerInputs = document.querySelectorAll(
        "[data-worker-duplicate-input]",
    );

    const splitNames = function (input) {
        const mode = input.dataset.workerDuplicateSeparators || "lines";
        const separator =
            mode === "create" ? /[,\t/;|\s]+/u : /[,\r\n]+/u;

        return input.value
            .split(separator)
            .map((name) => name.trim())
            .filter(Boolean);
    };

    const normalizeName = function (name) {
        return name.normalize("NFKC").toLocaleLowerCase();
    };

    workerInputs.forEach(function (input) {
        const warningId = input.dataset.workerDuplicateWarning;
        const warning = warningId ? document.getElementById(warningId) : null;
        const warningNames = warning?.querySelector(
            "[data-worker-duplicate-names]",
        );

        if (!warning || !warningNames) return;

        const updateWarning = function () {
            const firstNames = new Map();
            const duplicateKeys = new Set();

            splitNames(input).forEach(function (name) {
                const key = normalizeName(name);
                if (firstNames.has(key)) {
                    duplicateKeys.add(key);
                    return;
                }
                firstNames.set(key, name);
            });

            const duplicates = Array.from(duplicateKeys).map((key) =>
                firstNames.get(key),
            );

            warning.hidden = duplicates.length === 0;
            input.classList.toggle(
                "has-duplicate-worker-names",
                duplicates.length > 0,
            );
            warningNames.textContent = duplicates.join(", ");
        };

        input.addEventListener("input", updateWarning);
        updateWarning();
    });
});
