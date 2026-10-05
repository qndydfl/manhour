document.addEventListener("DOMContentLoaded", () => {
    const topbar = document.querySelector(".manning-topbar");
    const sidebar = document.getElementById("manningSidebar");
    const sidebarToggle = document.getElementById("manningSidebarToggle");

    if (topbar) {
        const syncTopbarHeight = () => {
            const height = Math.ceil(topbar.getBoundingClientRect().height);
            document.documentElement.style.setProperty(
                "--manning-topbar-height",
                `${height}px`,
            );
        };

        syncTopbarHeight();
        new ResizeObserver(syncTopbarHeight).observe(topbar);
    }

    if (sidebarToggle && sidebar) {
        const overlay = document.getElementById("manningSidebarOverlay");

        const setSidebarOpen = (isOpen) => {
            sidebar.classList.toggle("is-open", isOpen);
            document.body.classList.toggle("manning-sidebar-open", isOpen);
            sidebarToggle.setAttribute("aria-expanded", String(isOpen));
        };

        sidebarToggle.addEventListener("click", () => {
            setSidebarOpen(!sidebar.classList.contains("is-open"));
        });

        overlay?.addEventListener("click", () => setSidebarOpen(false));

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") setSidebarOpen(false);
        });
    }

    const dateTarget = document.getElementById("manningCurrentDate");
    if (dateTarget) {
        dateTarget.textContent = new Intl.DateTimeFormat("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            weekday: "short",
        }).format(new Date());
    }

    document.querySelectorAll("[data-auto-submit]").forEach((control) => {
        control.addEventListener("change", () => control.form?.submit());
    });

    const mobileViewport = window.matchMedia("(max-width: 700px)");
    const mobileFolds = document.querySelectorAll("[data-mobile-fold]");

    mobileFolds.forEach((fold, index) => {
        const hasVisibleError = fold.querySelector(
            ".manning-form-error:not(.d-none), .manning-form-alert:not(.d-none), .alert-danger:not(.d-none)",
        );
        let isOpen =
            fold.dataset.mobileFoldOpen === "true" || Boolean(hasVisibleError);
        const title = fold.dataset.mobileFoldTitle || "상세 내용";
        const toggleButton = document.createElement("button");
        const toggleCopy = document.createElement("span");
        const toggleIcon = document.createElement("i");
        const toggleTitle = document.createElement("strong");
        const toggleState = document.createElement("small");
        const contentId = fold.id || `mobile-fold-${index + 1}`;

        toggleButton.type = "button";
        toggleButton.className = "mobile-fold-toggle";
        toggleButton.setAttribute("aria-controls", contentId);
        toggleCopy.className = "mobile-fold-toggle-copy";
        toggleIcon.className = "bi bi-chevron-down";
        toggleTitle.textContent = title;
        toggleState.textContent = "펼쳐보기";
        toggleCopy.append(toggleIcon, toggleTitle);
        toggleButton.append(toggleCopy, toggleState);

        fold.id = contentId;
        fold.insertBefore(toggleButton, fold.firstChild);

        const syncFold = () => {
            const isMobile = mobileViewport.matches;
            fold.classList.toggle("is-mobile-fold", isMobile);
            fold.classList.toggle(
                "is-mobile-collapsed",
                isMobile && !isOpen,
            );
            toggleButton.hidden = !isMobile;
            toggleButton.setAttribute(
                "aria-expanded",
                String(!isMobile || isOpen),
            );
            toggleState.textContent = isOpen ? "접기" : "펼쳐보기";
        };

        toggleButton.addEventListener("click", () => {
            isOpen = !isOpen;
            syncFold();
        });

        mobileViewport.addEventListener("change", syncFold);
        syncFold();
    });
});
