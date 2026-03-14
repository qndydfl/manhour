document.addEventListener("DOMContentLoaded", function () {
    const indirectModalEl = document.getElementById("indirectModal");
    const frameEl = document.getElementById("indirectFrame");
    const nameEl = document.getElementById("modalWorkerName");

    if (!indirectModalEl || !frameEl || !nameEl) {
        console.warn("간비 수정 모달 요소가 페이지에 없습니다.");
        return;
    }

    indirectModalEl.addEventListener("hidden.bs.modal", function () {
        frameEl.src = "";

        if (window.__indirectSaved) {
            window.__indirectSaved = false;
            window.location.reload();
        }
    });

    window.openIndirectModal = function (sessionId, workerId, workerName) {
        if (!window.bootstrap || !bootstrap.Modal) {
            console.error("Bootstrap Modal이 로드되지 않았습니다.");
            return;
        }

        nameEl.textContent = workerName || "작업자";

        const url = `/session/${sessionId}/worker/${workerId}/indirect/?_=${Date.now()}`;
        frameEl.src = url;

        let modalInstance = bootstrap.Modal.getInstance(indirectModalEl);
        if (!modalInstance) {
            modalInstance = new bootstrap.Modal(indirectModalEl);
        }

        modalInstance.show();
    };
});