// static/js/indirect_modal.js
document.addEventListener("DOMContentLoaded", function () {
    const indirectModalEl = document.getElementById("indirectModal");

    if (indirectModalEl) {
        indirectModalEl.addEventListener("hidden.bs.modal", function () {
            const frameEl = document.getElementById("indirectFrame");
            if (frameEl) frameEl.src = "";

            // 저장했을 때만 새로고침(권장)
            if (window.__indirectSaved) {
                window.__indirectSaved = false;
                location.reload();
            }
        });
    }

    window.openIndirectModal = function (sessionId, workerId, workerName) {
        const nameEl = document.getElementById("modalWorkerName");
        const frameEl = document.getElementById("indirectFrame");
        const modalEl = document.getElementById("indirectModal");

        if (!nameEl || !frameEl || !modalEl) {
            console.error(
                "❌ 모달 관련 HTML 요소를 찾을 수 없습니다. ID를 확인하세요.",
            );
            return;
        }
        if (!window.bootstrap || !bootstrap.Modal) {
            console.error("❌ Bootstrap Modal이 로드되지 않았습니다.");
            return;
        }

        nameEl.textContent = workerName;

        // URL (캐시 방지 파라미터 포함)
        const url = `/session/${sessionId}/worker/${workerId}/indirect/?_=${Date.now()}`;
        frameEl.src = url;

        let myModal = bootstrap.Modal.getInstance(modalEl);
        if (!myModal) myModal = new bootstrap.Modal(modalEl);
        myModal.show();
    };
});
