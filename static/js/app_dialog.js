document.addEventListener("DOMContentLoaded", () => {
    const dialog = document.getElementById("appDialog");
    const titleEl = document.getElementById("appDialogTitle");
    const messageEl = document.getElementById("appDialogMessage");
    const iconEl = document.getElementById("appDialogIcon");
    const cancelBtn = document.getElementById("appDialogCancel");
    const confirmBtn = document.getElementById("appDialogConfirm");

    if (!dialog || !titleEl || !messageEl || !iconEl || !cancelBtn || !confirmBtn) {
        return;
    }

    let resolveCurrent = null;
    let previousFocus = null;

    const iconClasses = {
        warning: "bi-exclamation-triangle-fill",
        danger: "bi-trash3-fill",
        success: "bi-check-circle-fill",
        info: "bi-info-circle-fill",
    };

    function finish(result) {
        if (dialog.hidden) return;
        dialog.hidden = true;
        document.body.classList.remove("app-dialog-open");
        previousFocus?.focus?.();
        const resolve = resolveCurrent;
        resolveCurrent = null;
        resolve?.(result);
    }

    function open({
        title = "확인",
        message = "",
        variant = "warning",
        confirmText = "확인",
        cancelText = "취소",
        showCancel = true,
    } = {}) {
        if (resolveCurrent) finish(false);

        previousFocus = document.activeElement;
        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        cancelBtn.hidden = !showCancel;

        dialog.className = `app-dialog is-${variant}`;
        iconEl.innerHTML = `<i class="bi ${iconClasses[variant] || iconClasses.warning}"></i>`;
        dialog.hidden = false;
        document.body.classList.add("app-dialog-open");

        return new Promise((resolve) => {
            resolveCurrent = resolve;
            window.requestAnimationFrame(() => confirmBtn.focus());
        });
    }

    window.AppDialog = {
        confirm(message, options = {}) {
            return open({ ...options, message, showCancel: true });
        },
        alert(message, options = {}) {
            return open({ ...options, message, showCancel: false });
        },
    };

    window.alert = (message) => {
        const text = String(message ?? "");
        const isError = /오류|실패|없습니다|찾을 수 없|입력해|선택해/.test(text);
        void window.AppDialog.alert(text, {
            title: isError ? "확인 필요" : "알림",
            variant: isError ? "danger" : "info",
        });
    };

    cancelBtn.addEventListener("click", () => finish(false));
    confirmBtn.addEventListener("click", () => finish(true));
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog && !cancelBtn.hidden) finish(false);
    });
    document.addEventListener("keydown", (event) => {
        if (dialog.hidden) return;
        if (event.key === "Escape" && !cancelBtn.hidden) finish(false);
    });

    document.addEventListener("submit", async (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        const submitter = event.submitter;
        const source = submitter?.dataset.appConfirm ? submitter : form;
        if (!source.dataset.appConfirm) return;
        if (form.dataset.appConfirmBypass === "true") {
            delete form.dataset.appConfirmBypass;
            return;
        }

        event.preventDefault();
        const confirmed = await window.AppDialog.confirm(source.dataset.appConfirm, {
            title: source.dataset.appConfirmTitle || "작업 확인",
            variant: source.dataset.appConfirmVariant || "warning",
            confirmText: source.dataset.appConfirmButton || "확인",
        });

        if (!confirmed) return;
        form.dataset.appConfirmBypass = "true";
        form.requestSubmit(submitter || undefined);
    });
});
