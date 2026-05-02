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
                masterDataBadgeEl.style.display = "";
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

// 사이드 바
document.addEventListener("DOMContentLoaded", function () {
    const sidebar = document.getElementById("dashboardSidebar");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebarToggleIcon = document.getElementById("sidebarToggleIcon");
    const mobileSidebarToggle = document.getElementById("mobileSidebarToggle");
    const sidebarBackdrop = document.getElementById("sidebarBackdrop");

    // 아이콘 업데이트 함수 (중복 방지)
    function updateToggleIcon() {
        if (sidebar.classList.contains("collapsed")) {
            sidebarToggleIcon.className = "bi bi-chevron-right";
        } else {
            sidebarToggleIcon.className = "bi bi-chevron-left";
        }
    }

    // 1. 초기 상태 설정: 페이지 로드 시 아이콘 상태 확인
    if (sidebar && sidebarToggleIcon) {
        updateToggleIcon();
    }

    // 초기 로드 시 모바일에서는 사이드바를 열어둔다.
    if (sidebar && sidebarBackdrop && window.innerWidth <= 991) {
        sidebar.classList.add("mobile-open");
        sidebarBackdrop.classList.add("show");
    }

    // 2. 데스크톱 토글 버튼 클릭
    sidebarToggle?.addEventListener("click", function () {
        sidebar.classList.toggle("collapsed");
        updateToggleIcon(); // 함수 호출로 간결하게 관리
    });

    // 3. 모바일 토글 버튼 클릭
    mobileSidebarToggle?.addEventListener("click", function () {
        sidebar.classList.add("mobile-open");
        sidebarBackdrop?.classList.add("show");
    });

    // 4. 모바일 백드롭(배경) 클릭 시 닫기
    sidebarBackdrop?.addEventListener("click", function () {
        sidebar.classList.remove("mobile-open");
        sidebarBackdrop.classList.remove("show");
    });
});

// 추가
document.addEventListener("DOMContentLoaded", function () {
    const workStatusCanvas = document.getElementById("workStatusChart");

    let workStatusChart = null;

    const initialData = {
        activeCount: window.INDEX_PAGE?.activeCount || 0,
        historyCount: window.INDEX_PAGE?.historyCount || 0,
        masterDataCount: window.INDEX_PAGE?.masterDataCount || 0,
    };

    function createCharts(data) {
        if (workStatusCanvas) {
            workStatusChart = new Chart(workStatusCanvas.getContext("2d"), {
                type: "doughnut",
                data: {
                    labels: ["Active", "History", "Master Data"],
                    datasets: [
                        {
                            data: [
                                data.activeCount,
                                data.historyCount,
                                data.masterDataCount,
                            ],
                            backgroundColor: ["#0d6efd", "#198754", "#ffc107"],
                            borderWidth: 0,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    cutout: "68%",
                    plugins: {
                        legend: {
                            position: "bottom",
                        },
                    },
                },
            });
        }
    }

    function updateCharts(data) {
        if (workStatusChart) {
            workStatusChart.data.datasets[0].data = [
                data.activeCount,
                data.historyCount,
                data.masterDataCount,
            ];
            workStatusChart.update();
        }
    }

    async function loadDashboardCounts() {
        const url = window.INDEX_PAGE?.dashboardCountsUrl;

        if (!url) return;

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error("Dashboard API Error");
            }

            const result = await response.json();

            const data = {
                activeCount: result.active_count || 0,
                historyCount: result.history_count || 0,
                masterDataCount: result.master_data_count || 0,
            };

            updateCharts(data);
            updateDashboardNumbers(data);
        } catch (error) {
            console.error("대시보드 데이터 로드 실패:", error);
        }
    }

    function updateDashboardNumbers(data) {
        const activeEl = document.querySelector(".active-count-num");
        const historyEl = document.querySelector(".history-count-num");
        const masterBadgeEls = document.querySelectorAll("#masterDataBadge");

        document.querySelectorAll(".today-work-num").forEach((el) => {
            el.textContent = data.activeCount;
        });

        if (activeEl) activeEl.textContent = data.activeCount;
        if (historyEl) historyEl.textContent = data.historyCount;

        masterBadgeEls.forEach((badge) => {
            badge.textContent = data.masterDataCount;

            if (data.masterDataCount > 0) {
                badge.classList.remove("d-none");
            } else {
                badge.classList.add("d-none");
            }
        });
    }

    createCharts(initialData);

    loadDashboardCounts();

    setInterval(loadDashboardCounts, 30000);
});

// 환율/유가 차트
document.addEventListener("DOMContentLoaded", function () {
    const canvas = document.getElementById("financialLiveChart");

    if (!canvas) {
        console.warn("financialLiveChart canvas가 없습니다.");
        return;
    }

    if (!window.Chart) {
        console.error("Chart.js가 로드되지 않았습니다.");
        return;
    }

    const rateEl = document.getElementById("current-exchange-rate");
    const changeEl = document.getElementById("exchange-rate-change");
    const changeValueEl = document.getElementById("exchange-rate-change-value");
    const changePercentEl = document.getElementById("exchange-rate-change-percent");
    const wtiEl = document.getElementById("wti-price");
    const jetFuelEl = document.getElementById("jet-fuel-price");

    const ctx = canvas.getContext("2d");

    const chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: "환율 추이",
                    data: [],
                    borderColor: "#dc3545",
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                    },
                },
                y: {
                    display: true,
                    position: "right",
                    grid: {
                        color: "#f1f1f1",
                    },
                },
            },
        },
    });

    function formatNumber(value, digits = 2) {
        const numberValue = Number(value);

        if (value === null || value === undefined || Number.isNaN(numberValue)) {
            return "-";
        }

        return numberValue.toLocaleString("en-US", {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });
    }

    function setChangeDisplay(change, percent) {
        if (!changeEl || !changeValueEl) return;

        const iconEl = changeEl.querySelector("i");
        const changeNumber = Number(change);
        const percentNumber = Number(percent);

        if (change === null || change === undefined || Number.isNaN(changeNumber)) {
            changeEl.classList.remove("text-danger", "text-success");
            changeEl.classList.add("text-muted");
            changeValueEl.textContent = "-";

            if (changePercentEl) {
                changePercentEl.textContent = "-";
            }

            if (iconEl) {
                iconEl.className = "bi bi-dash";
            }

            return;
        }

        const isUp = changeNumber >= 0;

        changeEl.classList.remove("text-muted");
        changeEl.classList.toggle("text-danger", isUp);
        changeEl.classList.toggle("text-success", !isUp);

        if (iconEl) {
            iconEl.className = isUp
                ? "bi bi-caret-up-fill"
                : "bi bi-caret-down-fill";
        }

        changeValueEl.textContent = formatNumber(Math.abs(changeNumber), 2);

        if (changePercentEl) {
            if (percent === null || percent === undefined || Number.isNaN(percentNumber)) {
                changePercentEl.textContent = "-";
            } else {
                changePercentEl.textContent = `${formatNumber(Math.abs(percentNumber), 2)}%`;
            }
        }
    }

    function applyFinancialData(payload) {
        const exchange = payload?.exchange_rate || {};
        const wti = payload?.wti || {};
        const jetFuel = payload?.jet_fuel || {};
        const series = payload?.series || {};

        if (rateEl) {
            rateEl.textContent = formatNumber(exchange.value, 2);
        }

        setChangeDisplay(exchange.change, exchange.change_percent);

        if (wtiEl) {
            wtiEl.textContent =
                wti.value === null || wti.value === undefined
                    ? "-"
                    : `$${formatNumber(wti.value, 2)}`;
        }

        if (jetFuelEl) {
            jetFuelEl.textContent =
                jetFuel.value === null || jetFuel.value === undefined
                    ? "-"
                    : `$${formatNumber(jetFuel.value, 2)}`;
        }

        const labels = Array.isArray(series.labels) ? series.labels : [];
        const values = Array.isArray(series.values) ? series.values.map(Number) : [];

        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.update();
    }

    async function loadFinancialIndicators() {
        const url = window.INDEX_PAGE?.financialIndicatorsUrl;

        if (!url) {
            console.warn("financialIndicatorsUrl이 없습니다.");
            return;
        }

        try {
            const response = await fetch(url, {
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

            const payload = await response.json();
            console.log("Financial payload:", payload);

            applyFinancialData(payload);
        } catch (error) {
            console.error("Financial indicators fetch failed:", error);
        }
    }

    loadFinancialIndicators();
    window.setInterval(loadFinancialIndicators, 15 * 60 * 1000);
});


// METAR (CheckWX)
document.addEventListener("DOMContentLoaded", function () {
    const panel = document.getElementById("metarPanel");
    if (!panel) return;

    const tabsEl = document.getElementById("metarTabs");
    const stationEl = document.getElementById("metarStation");
    const updatedEl = document.getElementById("metarUpdated");
    const tempEl = document.getElementById("metarTemp");
    const windEl = document.getElementById("metarWind");
    const visibilityEl = document.getElementById("metarVisibility");
    const pressureEl = document.getElementById("metarPressure");
    const rawEl = document.getElementById("metarRaw");

    let metarStations = [];
    let activeIndex = 0;

    function formatVisibility(meters) {
        if (meters === null || meters === undefined) return "-";
        if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
        return `${meters}m`;
    }

    function renderTabs(stations) {
        if (!tabsEl) return;

        if (!Array.isArray(stations) || stations.length === 0) {
            tabsEl.innerHTML = "";
            return;
        }

        tabsEl.innerHTML = stations
            .map((station, index) => {
                const label = station.icao || "-";
                const isActive = index === activeIndex;
                return `
                    <button
                        type="button"
                        class="btn btn-sm ${isActive ? "btn-light" : "btn-outline-light"}"
                        data-metar-index="${index}"
                    >
                        ${label}
                    </button>
                `;
            })
            .join("");

        tabsEl.querySelectorAll("button[data-metar-index]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const nextIndex = Number(btn.dataset.metarIndex);
                if (Number.isNaN(nextIndex)) return;
                activeIndex = nextIndex;
                renderTabs(metarStations);
                renderMetar(metarStations);
            });
        });
    }

    function renderMetar(stations) {
        if (!Array.isArray(stations) || stations.length === 0) {
            if (stationEl) stationEl.textContent = "-";
            if (updatedEl) updatedEl.textContent = "Updated: -";
            if (tempEl) tempEl.textContent = "-";
            if (windEl) windEl.textContent = "-";
            if (visibilityEl) visibilityEl.textContent = "-";
            if (pressureEl) pressureEl.textContent = "-";
            if (rawEl) rawEl.textContent = "-";
            return;
        }

        const station = stations[activeIndex] || stations[0];
        const title = station.station || station.icao || "-";
        const icao = station.icao ? `(${station.icao})` : "";
        const temp =
            station.temp_c === null || station.temp_c === undefined
                ? "-"
                : `${station.temp_c}°C`;
        const windDir = Number(station.wind_dir);
        const windSpeed = Number(station.wind_speed);
        const wind =
            Number.isFinite(windDir) && Number.isFinite(windSpeed)
                ? `${windDir}° / ${windSpeed}kt`
                : "-";
        const vis = formatVisibility(station.visibility);
        const pressure =
            station.pressure_hpa === null || station.pressure_hpa === undefined
                ? "-"
                : `${station.pressure_hpa}hPa`;
        const updated = station.observed
            ? `Updated: ${station.observed}`
            : "Updated: -";

        if (stationEl) stationEl.textContent = `${title} ${icao}`.trim();
        if (updatedEl) updatedEl.textContent = updated;
        if (tempEl) tempEl.textContent = temp;
        if (windEl) windEl.textContent = wind;
        if (visibilityEl) visibilityEl.textContent = vis;
        if (pressureEl) pressureEl.textContent = pressure;
        if (rawEl) rawEl.textContent = station.raw_text || "-";
    }

    async function loadMetar() {
        const url = window.INDEX_PAGE?.checkwxMetarUrl;
        if (!url) return;

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "same-origin",
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const payload = await response.json();
            metarStations = payload?.stations || [];
            if (activeIndex >= metarStations.length) activeIndex = 0;
            renderTabs(metarStations);
            renderMetar(metarStations);
        } catch (error) {
            console.error("CheckWX METAR fetch failed:", error);
            renderTabs([]);
            if (stationEl) stationEl.textContent = "-";
            if (updatedEl) updatedEl.textContent = "Updated: -";
            if (tempEl) tempEl.textContent = "-";
            if (windEl) windEl.textContent = "-";
            if (visibilityEl) visibilityEl.textContent = "-";
            if (pressureEl) pressureEl.textContent = "-";
            if (rawEl) rawEl.textContent = "-";
        }
    }

    loadMetar();
    window.setInterval(loadMetar, 10 * 60 * 1000);
});
