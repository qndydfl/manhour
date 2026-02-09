/**
 * base.js
 * 모든 페이지에 공통으로 적용되는 스크립트
 */

document.addEventListener("DOMContentLoaded", function() {

    // ==========================================
    // 1. AOS (Animate On Scroll) 초기화
    // ==========================================
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 800,
            once: true,
            offset: 30,
            easing: 'ease-out-cubic'
        });
    }

    // ==========================================
    // 2. Bootstrap 요소 활성화 (Tooltip & Toast)
    // ==========================================
    if (typeof bootstrap !== 'undefined') {
        // Tooltip
        const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        [...tooltips].map(el => new bootstrap.Tooltip(el));

        // Toast (자동 실행)
        const toasts = document.querySelectorAll('.toast');
        [...toasts].map(el => new bootstrap.Toast(el, { delay: 3000 }).show());
    }

    // ==========================================
    // 3. 숫자 카운팅 애니메이션 (Global Counter)
    // ==========================================
    // 클래스가 .count-up 인 요소의 텍스트를 숫자로 올려줌
    const countElements = document.querySelectorAll('.count-up');
    
    if (countElements.length > 0) {
        countElements.forEach(el => {
            const target = parseInt(el.innerText) || 0;
            let current = 0;
            const duration = 1500;
            const stepTime = 20;
            const increment = target / (duration / stepTime);

            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    el.innerText = target.toLocaleString(); // 콤마 추가 (예: 1,000)
                    clearInterval(timer);
                } else {
                    el.innerText = Math.floor(current).toLocaleString();
                }
            }, stepTime);
        });
    }

    // ==========================================
    // 4. 네비게이션 바 스크롤 효과
    // ==========================================
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
            navbar.classList.add('shadow-sm');
            navbar.style.background = "rgba(30, 41, 59, 0.95)"; // 스크롤 시 더 진하게
        } else {
            navbar.style.background = "rgba(30, 41, 59, 0.8)";
        }
    });

});