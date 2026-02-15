function normalizeGibun(value) {
    const trimmed = value.trim().toUpperCase();
    if (/^\d+$/.test(trimmed)) {
        return `HL${trimmed}`;
    }
    return trimmed;
}

function digitsOnly(value) {
    return value.replace(/\D+/g, "");
}

function decimalOnly(value) {
    const cleaned = value.replace(/[^\d.]+/g, "");
    const parts = cleaned.split(".");
    if (parts.length <= 2) {
        return cleaned;
    }
    return `${parts[0]}.${parts.slice(1).join("")}`;
}

document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".js-gibun-code").forEach(function (input) {
        input.addEventListener("blur", function (event) {
            event.target.value = normalizeGibun(event.target.value);
        });
    });

    document.querySelectorAll(".js-numeric-only").forEach(function (input) {
        input.addEventListener("input", function (event) {
            event.target.value = digitsOnly(event.target.value);
        });
    });

    document.querySelectorAll(".js-decimal-only").forEach(function (input) {
        input.addEventListener("input", function (event) {
            event.target.value = decimalOnly(event.target.value);
        });
    });
});
