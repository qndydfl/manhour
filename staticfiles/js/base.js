/**
 * base.js
 * 모든 페이지에 공통으로 적용되는 스크립트
 */

document.addEventListener("DOMContentLoaded", function () {
    const body = document.body;
    const settingsDefaults = {
        sidebarPosition: "left",
        navbarTogglePosition: "left",
    };

    const readSetting = (key) =>
        sessionStorage.getItem(key) || settingsDefaults[key];

    const applySidebarPosition = (position) => {
        body.classList.toggle("sidebar-right", position === "right");
    };

    const applyNavbarTogglePosition = (position) => {
        body.classList.toggle("navbar-toggle-right", position === "right");
    };

    const applySetting = (key, value) => {
        if (key === "sidebarPosition") {
            applySidebarPosition(value);
            return;
        }

        if (key === "navbarTogglePosition") {
            applyNavbarTogglePosition(value);
        }
    };

    const applyStoredSettings = () => {
        Object.keys(settingsDefaults).forEach((key) => {
            applySetting(key, readSetting(key));
        });
    };

    applyStoredSettings();

    body.classList.remove("sidebar-open");
    body.classList.add("sidebar-ready");

    const settingsInputs = document.querySelectorAll("[data-setting]");
    if (settingsInputs.length > 0) {
        settingsInputs.forEach((input) => {
            const key = input.dataset.setting;
            const value = readSetting(key);

            if (input.type === "radio") {
                input.checked = input.value === value;
            }

            input.addEventListener("change", () => {
                sessionStorage.setItem(key, input.value);
                applySetting(key, input.value);
            });
        });
    }
    // ==========================================
    // 1. AOS (Animate On Scroll) 초기화
    // ==========================================
    if (typeof AOS !== "undefined") {
        AOS.init({
            duration: 800,
            once: true,
            offset: 30,
            easing: "ease-out-cubic",
        });
    }

    // ==========================================
    // 2. Bootstrap 요소 활성화 (Tooltip & Toast)
    // ==========================================
    if (typeof bootstrap !== "undefined") {
        // Tooltip
        const tooltips = document.querySelectorAll(
            '[data-bs-toggle="tooltip"]',
        );
        [...tooltips].map((el) => new bootstrap.Tooltip(el));

        // Toast (자동 실행)
        const toasts = document.querySelectorAll(".toast");
        [...toasts].map((el) =>
            new bootstrap.Toast(el, { delay: 3000 }).show(),
        );
    }

    // ==========================================
    // 3. 숫자 카운팅 애니메이션 (Global Counter)
    // ==========================================
    // 클래스가 .count-up 인 요소의 텍스트를 숫자로 올려줌
    const countElements = document.querySelectorAll(".count-up");

    if (countElements.length > 0) {
        countElements.forEach((el) => {
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
    const navbar = document.querySelector(".navbar");
    window.addEventListener("scroll", () => {
        if (window.scrollY > 10) {
            navbar.classList.add("shadow-sm");
            navbar.style.background = "rgba(30, 41, 59, 0.95)"; // 스크롤 시 더 진하게
        } else {
            navbar.style.background = "rgba(30, 41, 59, 0.8)";
        }
    });

    // ==========================================
    // 5. Sidebar Toggle (Mobile)
    // ==========================================
    const sidebarToggles = document.querySelectorAll(".js-sidebar-toggle");
    if (sidebarToggles.length > 0) {
        const openSidebar = () => {
            body.classList.add("sidebar-open");
        };
        const closeSidebar = () => {
            body.classList.remove("sidebar-open");
        };

        sidebarToggles.forEach((toggle) => {
            toggle.addEventListener("click", () => {
                const action = toggle.dataset.sidebarAction || "toggle";
                if (action === "close") {
                    closeSidebar();
                    return;
                }

                if (body.classList.contains("sidebar-open")) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            });
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeSidebar();
            }
        });

        document.querySelectorAll(".app-sidebar a").forEach((link) => {
            link.addEventListener("click", () => {
                if (window.matchMedia("(max-width: 991.98px)").matches) {
                    closeSidebar();
                }
            });
        });
    }
});
