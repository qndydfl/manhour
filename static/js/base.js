/**
 * base.js
 * 모든 페이지에 공통으로 적용되는 스크립트
 */

document.addEventListener("DOMContentLoaded", function() {

    // ==========================================
    // 1. AOS (Animate On Scroll) 초기화
    // ==========================================
    // 라이브러리가 로드되었는지 확인 후 실행
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,    // 애니메이션 지속 시간 (ms)
            once: true,       // 스크롤 내릴 때 한 번만 실행
            offset: 30,       // 화면 하단에서 30px 올라왔을 때 실행
            easing: 'ease-out-cubic' // 부드러운 감속 효과
        });
    }

    // ==========================================
    // 2. Bootstrap Tooltip 활성화 (전역)
    // ==========================================
    // data-bs-toggle="tooltip" 속성이 있는 모든 요소를 찾아서 활성화
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    if (typeof bootstrap !== 'undefined' && tooltipTriggerList.length > 0) {
        tooltipTriggerList.map(function (tooltipEl) {
            return new bootstrap.Tooltip(tooltipEl);
        });
    }

    // ==========================================
    // 3. Bootstrap Toast 자동 표시 (전역)
    // ==========================================
    // 어느 페이지든 메시지가 넘어오면 띄워줍니다.
    var toastElList = [].slice.call(document.querySelectorAll('.toast'));
    if (typeof bootstrap !== 'undefined' && toastElList.length > 0) {
        toastElList.map(function (toastEl) {
            // delay: 3000 (3초 후 사라짐)
            return new bootstrap.Toast(toastEl, { delay: 3000 }).show();
        });
    }

});