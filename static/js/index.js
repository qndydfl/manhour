document.addEventListener("DOMContentLoaded", () => {
    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            window.location.reload();
        }
    });

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

    // 자동 갱신 - 마스터 데이터 배지
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

    // 자동 갱신 - 대시보드 작업 세션 카운트 / 히스토리 카운트
    const activeCountEl = document.querySelector(".active-count-num");
    const historyCountEl = document.querySelector(".history-count-num");

    const dashboardCountsUrl =
        window.INDEX_PAGE?.dashboardCountsUrl || "/api/dashboard-counts/";

    async function refreshDashboardCounts() {
        try {
            const response = await fetch(dashboardCountsUrl, {
                method: "GET",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                },
                credentials: "same-origin",
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (activeCountEl) {
                activeCountEl.textContent = String(data.active_count ?? 0);
            }

            if (historyCountEl) {
                historyCountEl.textContent = String(data.history_count ?? 0);
            }
        } catch (error) {
            console.error("Dashboard counts refresh failed:", error);
        }
    }

    let dashboardTimer = null;
    if (activeCountEl || historyCountEl) {
        refreshDashboardCounts();
        dashboardTimer = window.setInterval(refreshDashboardCounts, 10000);
    }

    window.addEventListener("beforeunload", () => {
        if (clockTimer) window.clearInterval(clockTimer);
        if (badgeTimer) window.clearInterval(badgeTimer);
        if (dashboardTimer) window.clearInterval(dashboardTimer);
    });
});

// 이미지 파일
document.querySelectorAll(".images-hover-wrapper").forEach((wrapper) => {
    const img = wrapper.querySelector(".index-hero-image");
    let currentY = 0;
    let isHover = false;

    wrapper.addEventListener("mouseenter", () => {
        isHover = true;
    });

    wrapper.addEventListener("mouseleave", () => {
        isHover = false;
        currentY = 0;
        img.style.transform = "translateY(0)";
    });

    wrapper.addEventListener(
        "wheel",
        (e) => {
            if (!isHover) return;

            const imgHeight = img.offsetHeight;
            const wrapperHeight = wrapper.offsetHeight;
            const maxMove = Math.max(imgHeight - wrapperHeight, 0);

            if (maxMove <= 0) return;

            e.preventDefault();

            currentY += e.deltaY * 0.4;

            if (currentY < 0) currentY = 0;
            if (currentY > maxMove) currentY = maxMove;

            img.style.transform = `translateY(-${currentY}px)`;
        },
        { passive: false },
    );
});



// document.addEventListener("DOMContentLoaded", () => {
//     window.addEventListener("pageshow", (event) => {
//         if (event.persisted) {
//             window.location.reload();
//         }
//     });

//     function safeText(el, value) {
//         if (el) el.textContent = value;
//     }

//     const toastEls = document.querySelectorAll(".toast");
//     if (toastEls.length > 0 && window.bootstrap) {
//         toastEls.forEach((toastEl) => {
//             const toast = bootstrap.Toast.getOrCreateInstance(toastEl, {
//                 delay: 3000,
//             });
//             toast.show();
//         });
//     }

//     const timeEl = document.getElementById("digital-time");
//     const dateEl = document.getElementById("digital-date");
//     const weekdayEl = document.getElementById("digital-weekday");
//     const utcEl = document.getElementById("digital-time-utc");
//     const utcDateEl = document.getElementById("digital-date-utc");
//     const utcWeekdayEl = document.getElementById("digital-weekday-utc");

//     function formatDateParts(date, useUTC = false) {
//         const year = useUTC ? date.getUTCFullYear() : date.getFullYear();
//         const month = String(
//             (useUTC ? date.getUTCMonth() : date.getMonth()) + 1,
//         ).padStart(2, "0");
//         const day = String(
//             useUTC ? date.getUTCDate() : date.getDate(),
//         ).padStart(2, "0");

//         return `${year}-${month}-${day}`;
//     }

//     function updateClock() {
//         const now = new Date();
//         const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

//         safeText(
//             timeEl,
//             now.toLocaleTimeString("en-US", {
//                 hour12: false,
//             }),
//         );

//         safeText(dateEl, formatDateParts(now, false));
//         safeText(weekdayEl, weekdays[now.getDay()]);

//         const utcHour = String(now.getUTCHours()).padStart(2, "0");
//         const utcMin = String(now.getUTCMinutes()).padStart(2, "0");
//         safeText(utcEl, `${utcHour}:${utcMin}`);

//         safeText(utcDateEl, formatDateParts(now, true));
//         safeText(utcWeekdayEl, weekdays[now.getUTCDay()]);
//     }

//     let clockTimer = null;
//     if (timeEl || utcEl) {
//         updateClock();
//         clockTimer = window.setInterval(updateClock, 1000);
//     }

//     function animateNumber(element, duration = 1500) {
//         if (!element || element.dataset.countAnimated === "true") return;

//         const target = Number.parseInt(element.textContent, 10);
//         if (Number.isNaN(target)) return;

//         element.dataset.countAnimated = "true";

//         if (target === 0) {
//             element.textContent = "0";
//             return;
//         }

//         const start = performance.now();

//         function step(now) {
//             const progress = Math.min((now - start) / duration, 1);
//             const eased = 1 - Math.pow(1 - progress, 3);
//             const current = Math.round(target * eased);

//             element.textContent = String(current);

//             if (progress < 1) {
//                 window.requestAnimationFrame(step);
//             } else {
//                 element.textContent = String(target);
//             }
//         }

//         window.requestAnimationFrame(step);
//     }

//     animateNumber(document.querySelector(".active-count-num"));
//     animateNumber(document.querySelector(".history-count-num"));

//     const modalEl = document.getElementById("videoModal");
//     const frameEl = document.getElementById("youtubeFrame");
//     const titleEl = document.getElementById("videoModalLabel");
//     const openOnYoutubeEl = document.getElementById("openOnYoutube");

//     function toEmbedUrl(url) {
//         try {
//             const parsed = new URL(url);

//             if (
//                 parsed.hostname.includes("youtube.com") &&
//                 parsed.pathname.startsWith("/shorts/")
//             ) {
//                 const id = parsed.pathname.split("/shorts/")[1]?.split("/")[0];
//                 return id
//                     ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&rel=0`
//                     : url;
//             }

//             if (parsed.hostname.includes("youtube.com")) {
//                 if (parsed.pathname === "/watch") {
//                     const id = parsed.searchParams.get("v");
//                     return id
//                         ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&rel=0`
//                         : url;
//                 }

//                 if (parsed.pathname.startsWith("/embed/")) {
//                     parsed.searchParams.set("autoplay", "1");
//                     return parsed.toString();
//                 }
//             }

//             if (parsed.hostname.includes("youtu.be")) {
//                 const id = parsed.pathname.replace("/", "").split("/")[0];
//                 return id
//                     ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&rel=0`
//                     : url;
//             }
//         } catch (error) {
//             console.warn("Invalid YouTube URL:", url, error);
//         }

//         return url;
//     }

//     if (modalEl && frameEl && window.bootstrap) {
//         if (modalEl.parentElement !== document.body) {
//             document.body.appendChild(modalEl);
//         }

//         modalEl.addEventListener("show.bs.modal", (event) => {
//             const trigger = event.relatedTarget;
//             const videoUrl = trigger?.getAttribute("data-video-url");
//             const videoTitle = trigger?.getAttribute("data-video-title");

//             if (!videoUrl) return;

//             safeText(titleEl, videoTitle || "Video");

//             if (openOnYoutubeEl) {
//                 openOnYoutubeEl.href = videoUrl;
//             }

//             frameEl.src = toEmbedUrl(videoUrl);
//         });

//         modalEl.addEventListener("hidden.bs.modal", () => {
//             frameEl.src = "";
//             safeText(titleEl, "Video");

//             if (openOnYoutubeEl) {
//                 openOnYoutubeEl.href = "#";
//             }
//         });
//     }

//     // 자동 갱신 - 마스터 데이터 배지
//     const masterDataBadgeEl = document.getElementById("masterDataBadge");
//     const masterDataCountUrl =
//         window.INDEX_PAGE?.masterDataCountUrl || "/api/master-data-count/";

//     async function refreshMasterDataBadge() {
//         if (!masterDataBadgeEl) return;

//         try {
//             const response = await fetch(masterDataCountUrl, {
//                 method: "GET",
//                 headers: {
//                     "X-Requested-With": "XMLHttpRequest",
//                 },
//                 credentials: "same-origin",
//                 cache: "no-store",
//             });

//             if (!response.ok) return;

//             const data = await response.json();
//             const count = Number(data.count || 0);

//             if (count > 0) {
//                 masterDataBadgeEl.textContent = String(count);
//                 masterDataBadgeEl.classList.remove("d-none");
//             } else {
//                 masterDataBadgeEl.textContent = "";
//                 masterDataBadgeEl.classList.add("d-none");
//             }
//         } catch (error) {
//             console.error("Master Data badge refresh failed:", error);
//         }
//     }

//     let badgeTimer = null;
//     if (masterDataBadgeEl) {
//         refreshMasterDataBadge();
//         badgeTimer = window.setInterval(refreshMasterDataBadge, 10000);
//     }

//     window.addEventListener("beforeunload", () => {
//         if (clockTimer) window.clearInterval(clockTimer);
//         if (badgeTimer) window.clearInterval(badgeTimer);
//     });

//     // 자동 갱신 - 대시보드 작업 세션 카운트 / 대시보드 히스토리 카운트
//     const activeCountEl = document.querySelector(".active-count-num");
//     const historyCountEl = document.querySelector(".history-count-num");

//     const dashboardCountsUrl =
//         window.INDEX_PAGE?.dashboardCountsUrl || "/api/dashboard-counts/";

//     async function refreshDashboardCounts() {
//         try {
//             const response = await fetch(dashboardCountsUrl, {
//                 method: "GET",
//                 headers: {
//                     "X-Requested-With": "XMLHttpRequest",
//                 },
//                 credentials: "same-origin",
//                 cache: "no-store",
//             });

//             if (!response.ok) {
//                 throw new Error(`HTTP ${response.status}`);
//             }

//             const data = await response.json();

//             if (activeCountEl) {
//                 activeCountEl.textContent = String(data.active_count ?? 0);
//             }

//             if (historyCountEl) {
//                 historyCountEl.textContent = String(data.history_count ?? 0);
//             }
//         } catch (error) {
//             console.error("Dashboard counts refresh failed:", error);
//         }

//         window.addEventListener("beforeunload", () => {
//             if (clockTimer) window.clearInterval(clockTimer);
//             if (badgeTimer) window.clearInterval(badgeTimer);
//             if (dashboardTimer) window.clearInterval(dashboardTimer);
//         });
//     }

//     let dashboardTimer = null;
//     if (activeCountEl || historyCountEl) {
//         refreshDashboardCounts();
//         dashboardTimer = window.setInterval(refreshDashboardCounts, 10000);
//     }
// });

// // 이미지 파일
// document.querySelectorAll(".images-hover-wrapper").forEach((wrapper) => {
//     const img = wrapper.querySelector(".index-hero-image");
//     let currentY = 0;
//     let isHover = false;

//     wrapper.addEventListener("mouseenter", () => {
//         isHover = true;
//     });

//     wrapper.addEventListener("mouseleave", () => {
//         isHover = false;
//         currentY = 0;
//         img.style.transform = "translateY(0)";
//     });

//     wrapper.addEventListener(
//         "wheel",
//         (e) => {
//             if (!isHover) return;

//             const imgHeight = img.offsetHeight;
//             const wrapperHeight = wrapper.offsetHeight;
//             const maxMove = Math.max(imgHeight - wrapperHeight, 0);

//             if (maxMove <= 0) return;

//             e.preventDefault();

//             currentY += e.deltaY * 0.4;

//             if (currentY < 0) currentY = 0;
//             if (currentY > maxMove) currentY = maxMove;

//             img.style.transform = `translateY(-${currentY}px)`;
//         },
//         { passive: false },
//     );
// });
