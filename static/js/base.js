document.addEventListener("DOMContentLoaded", function () {
    const body = document.body;

    const settingsDefaults = {
        sidebarPosition: body.dataset.sidebarPosition || "left",
        navbarTogglePosition: body.dataset.navbarTogglePosition || "left",
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
            const storedValue = sessionStorage.getItem(key) || settingsDefaults[key];
            applySetting(key, storedValue);
        });
    };

    applyStoredSettings();

    body.classList.add("sidebar-ready");
    // 기본 닫힘이면 유지
    body.classList.remove("sidebar-open");
    // 기본 열림 원하면 위 줄 지우고 아래 사용
    // body.classList.add("sidebar-open");

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

    if (typeof AOS !== "undefined") {
        AOS.init({
            duration: 800,
            once: true,
            offset: 30,
            easing: "ease-out-cubic",
        });
    }

    if (typeof bootstrap !== "undefined") {
        const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        [...tooltips].forEach((el) => new bootstrap.Tooltip(el));

        const toasts = document.querySelectorAll(".toast");
        [...toasts].forEach((el) =>
            new bootstrap.Toast(el, { delay: 3000 }).show(),
        );
    }

    const countElements = document.querySelectorAll(".count-up");
    if (countElements.length > 0) {
        countElements.forEach((el) => {
            const target = parseInt(el.innerText, 10) || 0;
            let current = 0;
            const duration = 1500;
            const stepTime = 20;
            const increment = target / (duration / stepTime);

            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    el.innerText = target.toLocaleString();
                    clearInterval(timer);
                } else {
                    el.innerText = Math.floor(current).toLocaleString();
                }
            }, stepTime);
        });
    }

    const navbar = document.querySelector(".navbar, .app-navbar, .ios-topbar");
    if (navbar) {
        window.addEventListener("scroll", () => {
            if (window.scrollY > 10) {
                navbar.classList.add("shadow-sm");
                navbar.style.background = "rgba(30, 41, 59, 0.95)";
            } else {
                navbar.classList.remove("shadow-sm");
                navbar.style.background = "rgba(30, 41, 59, 0.8)";
            }
        });
    }

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
