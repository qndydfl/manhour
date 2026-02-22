document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // 1. Toast 알림 자동 실행 (공통)
    // ==========================================
    const toastEls = document.querySelectorAll(".toast");
    if (toastEls.length > 0 && window.bootstrap) {
        toastEls.forEach((toastEl) => {
            new bootstrap.Toast(toastEl, { delay: 3000 }).show();
        });
    }

    // ==========================================
    // 2. 실시간 시계 (Clock) - 대시보드 전용
    // ==========================================
    function updateClock() {
        const now = new Date();
        const timeEl = document.getElementById("digital-time");
        const dateEl = document.getElementById("digital-date");
        const weekdayEl = document.getElementById("digital-weekday");
        const utcEl = document.getElementById("digital-time-utc");
        const utcDateEl = document.getElementById("digital-date-utc");
        const utcWeekdayEl = document.getElementById("digital-weekday-utc");
        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString("en-US", {
                hour12: false,
            });
        }
        if (dateEl) {
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, "0");
            const dd = String(now.getDate()).padStart(2, "0");
            dateEl.textContent = `${yyyy}-${mm}-${dd}`;
        }
        if (weekdayEl) {
            weekdayEl.textContent = weekdays[now.getDay()];
        }
        if (utcEl) {
            const utcHour = String(now.getUTCHours()).padStart(2, "0");
            const utcMin = String(now.getUTCMinutes()).padStart(2, "0");
            utcEl.textContent = `${utcHour}:${utcMin}`;
        }
        if (utcDateEl) {
            const yyyy = now.getUTCFullYear();
            const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
            const dd = String(now.getUTCDate()).padStart(2, "0");
            utcDateEl.textContent = `${yyyy}-${mm}-${dd}`;
        }
        if (utcWeekdayEl) {
            utcWeekdayEl.textContent = weekdays[now.getUTCDay()];
        }
    }

    if (document.getElementById("digital-time")) {
        setInterval(updateClock, 1000);
        updateClock();
    }

    // ==========================================
    // 3. 숫자 카운팅 애니메이션
    // ==========================================
    function animateNumber(element) {
        if (!element) return;

        const target = parseInt(element.innerText, 10);
        if (Number.isNaN(target)) return;

        let current = 0;
        const duration = 1500;
        const stepTime = 20;
        const totalSteps = duration / stepTime;
        const increment = target / totalSteps;

        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                element.innerText = target;
                clearInterval(timer);
            } else {
                element.innerText = Math.floor(current);
            }
        }, stepTime);
    }

    const activeCountEl = document.querySelector(".active-count-num");
    const historyCountEl = document.querySelector(".history-count-num");
    if (activeCountEl) animateNumber(activeCountEl);
    if (historyCountEl) animateNumber(historyCountEl);

    // ==========================================
    // 4. 검색 및 필터링 (세션 리스트 페이지용)
    // ==========================================
    const searchInput = document.getElementById("sessionSearch");
    if (searchInput) {
        const clearBtn = document.getElementById("clearSearch");
        const filterBtns = document.querySelectorAll("[data-filter]");
        const sessionCols = document.querySelectorAll(".session-col");
        let currentFilter = "all";

        function filterSessions() {
            const query = searchInput.value.toLowerCase().trim();
            sessionCols.forEach((col) => {
                const shift = col.dataset.shift;
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
                filterBtns.forEach((b) =>
                    b.classList.remove("active", "btn-dark"),
                );
                btn.classList.add("active", "btn-dark");
                currentFilter = btn.dataset.filter;
                filterSessions();
            });
        });
    }

    // ==========================================
    // 5. YouTube 모달
    // ==========================================
    const modalEl = document.getElementById("videoModal");
    const frameEl = document.getElementById("youtubeFrame");
    const titleEl = document.getElementById("videoModalLabel");
    const openOnYoutubeEl = document.getElementById("openOnYoutube");

    if (modalEl && frameEl) {
        // 모달이 body 밖에 있으면(특정 레이아웃) body로 이동
        if (modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }

        const toEmbedUrl = (url) => {
            try {
                if (url.includes("/shorts/")) {
                    const id = url.split("/shorts/")[1].split(/[?&/]/)[0];
                    return `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&rel=0`;
                }

                if (url.includes("watch?v=")) {
                    const u = new URL(url);
                    const id = u.searchParams.get("v");
                    return `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&rel=0`;
                }

                if (url.includes("/embed/")) {
                    return url.includes("?")
                        ? `${url}&autoplay=1`
                        : `${url}?autoplay=1`;
                }

                if (url.includes("youtu.be/")) {
                    const id = url.split("youtu.be/")[1].split(/[?&/]/)[0];
                    return `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&rel=0`;
                }
            } catch (e) {}

            return url;
        };

        modalEl.addEventListener("show.bs.modal", (event) => {
            const btn = event.relatedTarget;
            const videoUrl = btn?.getAttribute("data-video-url");
            const videoTitle = btn?.getAttribute("data-video-title");
            if (!videoUrl) return;

            if (titleEl && videoTitle) {
                titleEl.textContent = videoTitle;
            }
            if (openOnYoutubeEl) {
                openOnYoutubeEl.href = videoUrl;
            }
            frameEl.src = toEmbedUrl(videoUrl);
        });

        modalEl.addEventListener("hidden.bs.modal", () => {
            frameEl.src = "";
            if (titleEl) titleEl.textContent = "Video";
            if (openOnYoutubeEl) openOnYoutubeEl.href = "#";
        });
    }

    // ==========================================
    // 6. 카드 안의 MP4 hover 플레이어
    // ==========================================
    const video = document.getElementById("hoverDanceVideo");
    if (video) {
        const wrapper = video.closest(".video-hover-wrapper");
        if (wrapper) {
            wrapper.addEventListener("mouseenter", () => {
                video.currentTime = 0;
                video.play();
            });

            wrapper.addEventListener("mouseleave", () => {
                video.pause();
                video.currentTime = 0;
            });
        }
    }

    // ==========================================
    // 7. macOS Dock 확대 효과
    // ==========================================
    const dock = document.querySelector(".dock-bar");
    const items = [...document.querySelectorAll(".dock-item")];

    if (dock && items.length) {
        dock.addEventListener("mousemove", (e) => {
            const rect = dock.getBoundingClientRect();
            const x = e.clientX - rect.left;

            items.forEach((el) => {
                const r = el.getBoundingClientRect();
                const cx = (r.left + r.right) / 2 - rect.left;
                const dist = Math.abs(x - cx);

                // 최대/크기 범위 조절
                const scale = Math.max(1, 1.6 - dist / 90);
                // 튀어오르는 정도 조절
                const lift = Math.max(0, 10 - dist / 7);

                el.style.transform = `translateY(${-lift}px) scale(${scale})`;
                el.style.zIndex = Math.round(scale * 10);
            });
        });

        dock.addEventListener("mouseleave", () => {
            items.forEach((el) => {
                el.style.transform = "scale(1) translateY(0)";
                el.style.zIndex = 1;
            });
        });
    }
});
