// function openIndirectModal(sessionId, workerId, workerName) {
//     // 모달 제목 설정
//     document.getElementById('modalWorkerName').textContent = workerName;
    
//     // 아이프레임 주소 설정
//     const url = `/session/${sessionId}/worker/${workerId}/indirect/`;
//     document.getElementById('indirectFrame').src = url;
    
//     // 모달 띄우기
//     const myModal = new bootstrap.Modal(document.getElementById('indirectModal'));
//     myModal.show();
// }

// // 모달이 닫힐 때 페이지 새로고침 (데이터 갱신 확인용)
// document.getElementById('indirectModal').addEventListener('hidden.bs.modal', function () {
//     location.reload();
// });

// static/js/indirect_modal.js

document.addEventListener("DOMContentLoaded", function () {
    
    // -------------------------------------------------------
    // 1. 모달 닫힘 감지 -> 페이지 새로고침 (데이터 갱신용)
    // -------------------------------------------------------
    const indirectModalEl = document.getElementById('indirectModal');
    
    if (indirectModalEl) {
        indirectModalEl.addEventListener('hidden.bs.modal', function () {
            // 모달 안의 iframe src를 초기화해주면 다음 열 때 잔상이 남지 않음 (선택사항)
            const frameEl = document.getElementById('indirectFrame');
            if(frameEl) frameEl.src = "";
            
            // 페이지 새로고침
            location.reload();
        });
    }

    // -------------------------------------------------------
    // 2. 모달 열기 함수 (전역 객체 window에 등록)
    // HTML onclick="openIndirectModal(...)" 에서 접근 가능하게 함
    // -------------------------------------------------------
    window.openIndirectModal = function(sessionId, workerId, workerName) {
        const nameEl = document.getElementById('modalWorkerName');
        const frameEl = document.getElementById('indirectFrame');
        const modalEl = document.getElementById('indirectModal');

        if (!nameEl || !frameEl || !modalEl) {
            console.error("❌ 모달 관련 HTML 요소를 찾을 수 없습니다. ID를 확인하세요.");
            return;
        }

        // 제목 설정
        nameEl.textContent = workerName;

        // 아이프레임 주소 설정
        // 주의: Django urls.py에 정의된 URL 패턴과 일치해야 합니다.
        const url = `/session/${sessionId}/worker/${workerId}/indirect/`;
        frameEl.src = url;

        // Bootstrap 5 모달 띄우기
        // (이미 인스턴스가 있다면 가져오고, 없으면 새로 생성)
        let myModal = bootstrap.Modal.getInstance(modalEl);
        if (!myModal) {
            myModal = new bootstrap.Modal(modalEl);
        }
        myModal.show();
    };
});