document.addEventListener("DOMContentLoaded", () => {
    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            window.location.reload();
        }
    });

    const isTouchDevice =
        window.matchMedia("(hover: none), (pointer: coarse)").matches;

    function safeText(el, value) {
        if (el) el.textContent = value;
    }

    const toastEls = document.querySelectorAll(".toast");
    if (toastEls.length > 0 && window.bootstrap) {
        toastEls.forEach((toastEl) => {
            const toast = bootstrap.Toast.getOrCreateInstance(toastEl, {
                delay: 3000,
            });
            toast.show();
        });
    }

    const timeEl = document.getElementById("digital-time");
    const dateEl = document.getElementById("digital-date");
    const weekdayEl = document.getElementById("digital-weekday");
    const utcEl = document.getElementById("digital-time-utc");
    const utcDateEl = document.getElementById("digital-date-utc");
    const utcWeekdayEl = document.getElementById("digital-weekday-utc");

    function formatDateParts(date, useUTC = false) {
        const year = useUTC ? date.getUTCFullYear() : date.getFullYear();
        const month = String(
            (useUTC ? date.getUTCMonth() : date.getMonth()) + 1,
        ).padStart(2, "0");
        const day = String(
            useUTC ? date.getUTCDate() : date.getDate(),
        ).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function updateClock() {
        const now = new Date();
        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        safeText(
            timeEl,
            now.toLocaleTimeString("en-US", {
                hour12: false,
            }),
        );

        safeText(dateEl, formatDateParts(now, false));
        safeText(weekdayEl, weekdays[now.getDay()]);

        const utcHour = String(now.getUTCHours()).padStart(2, "0");
        const utcMin = String(now.getUTCMinutes()).padStart(2, "0");
        safeText(utcEl, `${utcHour}:${utcMin}`);

        safeText(utcDateEl, formatDateParts(now, true));
        safeText(utcWeekdayEl, weekdays[now.getUTCDay()]);
    }

    let clockTimer = null;
    if (timeEl || utcEl) {
        updateClock();
        clockTimer = window.setInterval(updateClock, 1000);
    }

    function animateNumber(element, duration = 1500) {
        if (!element || element.dataset.countAnimated === "true") return;

        const target = Number.parseInt(element.textContent, 10);
        if (Number.isNaN(target)) return;

        element.dataset.countAnimated = "true";

        if (target === 0) {
            element.textContent = "0";
            return;
        }

        const start = performance.now();

        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(target * eased);

            element.textContent = String(current);

            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                element.textContent = String(target);
            }
        }

        window.requestAnimationFrame(step);
    }

    animateNumber(document.querySelector(".active-count-num"));
    animateNumber(document.querySelector(".history-count-num"));

    const searchInput = document.getElementById("sessionSearch");
    if (searchInput) {
        const clearBtn = document.getElementById("clearSearch");
        const filterBtns = document.querySelectorAll("[data-filter]");
        const sessionCols = document.querySelectorAll(".session-col");
        let currentFilter = "all";

        function filterSessions() {
            const query = searchInput.value.toLowerCase().trim();

            sessionCols.forEach((col) => {
                const shift = col.dataset.shift || "";
                const name = (col.dataset.name || "").toLowerCase();

                const matchesSearch = name.includes(query);
                const matchesFilter =
                    currentFilter === "all" || shift === currentFilter;

                col.style.display =
                    matchesSearch && matchesFilter ? "" : "none";
            });
        }

        searchInput.addEventListener("input", filterSessions);

        if (clearBtn) {
            clearBtn.addEventListener("click", () => {
                searchInput.value = "";
                filterSessions();
                searchInput.focus();
            });
        }

        filterBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                filterBtns.forEach((b) => {
                    b.classList.remove("active", "btn-dark");
                });

                btn.classList.add("active", "btn-dark");
                currentFilter = btn.dataset.filter || "all";
                filterSessions();
            });
        });
    }

    const modalEl = document.getElementById("videoModal");
    const frameEl = document.getElementById("youtubeFrame");
    const titleEl = document.getElementById("videoModalLabel");
    const openOnYoutubeEl = document.getElementById("openOnYoutube");

    function toEmbedUrl(url) {
        try {
            const parsed = new URL(url);

            if (
                parsed.hostname.includes("youtube.com") &&
                parsed.pathname.startsWith("/shorts/")
            ) {
                const id = parsed.pathname.split("/shorts/")[1]?.split("/")[0];
                return id
                    ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&rel=0`
                    : url;
            }

            if (parsed.hostname.includes("youtube.com")) {
                if (parsed.pathname === "/watch") {
                    const id = parsed.searchParams.get("v");
                    return id
                        ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&rel=0`
                        : url;
                }

                if (parsed.pathname.startsWith("/embed/")) {
                    parsed.searchParams.set("autoplay", "1");
                    return parsed.toString();
                }
            }

            if (parsed.hostname.includes("youtu.be")) {
                const id = parsed.pathname.replace("/", "").split("/")[0];
                return id
                    ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&rel=0`
                    : url;
            }
        } catch (error) {
            console.warn("Invalid YouTube URL:", url, error);
        }

        return url;
    }

    if (modalEl && frameEl && window.bootstrap) {
        if (modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }

        modalEl.addEventListener("show.bs.modal", (event) => {
            const trigger = event.relatedTarget;
            const videoUrl = trigger?.getAttribute("data-video-url");
            const videoTitle = trigger?.getAttribute("data-video-title");

            if (!videoUrl) return;

            safeText(titleEl, videoTitle || "Video");

            if (openOnYoutubeEl) {
                openOnYoutubeEl.href = videoUrl;
            }

            frameEl.src = toEmbedUrl(videoUrl);
        });

        modalEl.addEventListener("hidden.bs.modal", () => {
            frameEl.src = "";
            safeText(titleEl, "Video");

            if (openOnYoutubeEl) {
                openOnYoutubeEl.href = "#";
            }
        });
    }

    const hoverVideo = document.getElementById("hoverDanceVideo");
    if (hoverVideo && !isTouchDevice) {
        const wrapper = hoverVideo.closest(".video-hover-wrapper");

        if (wrapper) {
            wrapper.addEventListener("mouseenter", () => {
                hoverVideo.currentTime = 0;
                hoverVideo.play().catch(() => {
                });
            });

            wrapper.addEventListener("mouseleave", () => {
                hoverVideo.pause();
                hoverVideo.currentTime = 0;
            });
        }
    }

    const dock = document.querySelector(".dock-bar");
    const dockItems = [...document.querySelectorAll(".dock-item")];

    if (dock && dockItems.length && !isTouchDevice) {
        dock.addEventListener("mousemove", (event) => {
            const dockRect = dock.getBoundingClientRect();
            const pointerX = event.clientX - dockRect.left;

            dockItems.forEach((item) => {
                const itemRect = item.getBoundingClientRect();
                const centerX = (itemRect.left + itemRect.right) / 2 - dockRect.left;
                const distance = Math.abs(pointerX - centerX);

                const scale = Math.max(1, 1.6 - distance / 90);
                const lift = Math.max(0, 10 - distance / 7);

                item.style.transform = `translateY(${-lift}px) scale(${scale})`;
                item.style.zIndex = String(Math.round(scale * 10));
            });
        });

        dock.addEventListener("mouseleave", () => {
            dockItems.forEach((item) => {
                item.style.transform = "";
                item.style.zIndex = "";
            });
        });
    }

    const masterDataBadgeEl = document.getElementById("masterDataBadge");
    const masterDataCountUrl =
        window.INDEX_PAGE?.masterDataCountUrl || "/api/master-data-count/";

    async function refreshMasterDataBadge() {
        if (!masterDataBadgeEl) return;

        try {
            const response = await fetch(masterDataCountUrl, {
                method: "GET",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                },
                credentials: "same-origin",
                cache: "no-store",
            });

            if (!response.ok) return;

            const data = await response.json();
            const count = Number(data.count || 0);

            if (count > 0) {
                masterDataBadgeEl.textContent = String(count);
                masterDataBadgeEl.classList.remove("d-none");
            } else {
                masterDataBadgeEl.textContent = "";
                masterDataBadgeEl.classList.add("d-none");
            }
        } catch (error) {
            console.error("Master Data badge refresh failed:", error);
        }
    }

    let badgeTimer = null;
    if (masterDataBadgeEl) {
        refreshMasterDataBadge();
        badgeTimer = window.setInterval(refreshMasterDataBadge, 10000);
    }

    window.addEventListener("beforeunload", () => {
        if (clockTimer) window.clearInterval(clockTimer);
        if (badgeTimer) window.clearInterval(badgeTimer);
    });
});