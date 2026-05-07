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

    window.addEventListener("beforeunload", () => {
        if (clockTimer) window.clearInterval(clockTimer);
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
    // if (sidebar && sidebarBackdrop && window.innerWidth <= 991) {
    //     sidebar.classList.add("mobile-open");
    //     sidebarBackdrop.classList.add("show");
    // }

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
    if (!workStatusCanvas || !window.Chart) return;

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
                    maintainAspectRatio: false,
                    cutout: "80%", // ← 도넛 더 키워서 여백 줄임
                    layout: {
                        padding: {
                            top: 5,
                            bottom: 5,
                        },
                    },
                    plugins: {
                        legend: {
                            position: "bottom",
                            align: "center",
                            labels: {
                                boxWidth: 10,
                                boxHeight: 10,
                                padding: 12,
                                usePointStyle: true,
                                font: {
                                    size: 11,
                                },
                            },
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

    setInterval(loadDashboardCounts, 10000);
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

                const selectedStation = metarStations[activeIndex];
                const selectedAirport = selectedStation?.icao || "RKSI";

                window.SELECTED_AIRPORT = selectedAirport;

                renderTabs(metarStations);
                renderMetar(metarStations);

                window.dispatchEvent(
                    new CustomEvent("airportChanged", {
                        detail: {
                            airport: selectedAirport,
                        },
                    }),
                );
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
        const windDir = Number(
            station.wind_dir ??
                station.wind_degrees ??
                station.wind_direction ??
                station.wind?.degrees,
        );

        const windSpeed = Number(
            station.wind_speed ??
                station.wind_speed_kt ??
                station.wind_speed_kts ??
                station.wind?.speed_kts ??
                station.wind?.speed,
        );

        const windGust = Number(
            station.wind_gust ?? station.wind_gust_kt ?? station.wind?.gust_kts,
        );

        let wind = "-";

        if (Number.isFinite(windDir) && Number.isFinite(windSpeed)) {
            wind = `${windDir}° / ${windSpeed}kt`;

            if (Number.isFinite(windGust)) {
                wind += ` G${windGust}kt`;
            }
        } else if (station.raw_text) {
            const match = station.raw_text.match(
                /\b(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT\b/,
            );

            if (match) {
                const dir = match[1] === "VRB" ? "VRB" : `${match[1]}°`;
                const speed = `${Number(match[2])}kt`;
                const gust = match[3] ? ` ${match[3]}kt` : "";

                wind = `${dir} / ${speed}${gust}`;
            }
        } else {
            wind = "-";
        }
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

            const selectedStation = metarStations[activeIndex];
            window.SELECTED_AIRPORT = selectedStation?.icao || "RKSI";
            window.dispatchEvent(
                new CustomEvent("airportChanged", {
                    detail: {
                        airport: window.SELECTED_AIRPORT,
                    },
                }),
            );

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

// --- 정비 예보 (Maintenance Forecast) 섹션 ---
document.addEventListener("DOMContentLoaded", function () {
    const forecastCanvas = document.getElementById("forecastChart");
    const bestWorkTimeEl = document.getElementById("bestWorkTime");
    const limitWorkTimeEl = document.getElementById("limitWorkTime");
    const forecastCityEl = document.getElementById("forecastCity");

    if (!forecastCanvas) {
        console.warn("forecastChart canvas가 없습니다.");
        return;
    }

    if (!window.Chart) {
        console.error("Chart.js가 로드되지 않았습니다.");
        if (bestWorkTimeEl) bestWorkTimeEl.textContent = "차트 로드 실패";
        if (limitWorkTimeEl) limitWorkTimeEl.textContent = "Chart.js 확인";
        return;
    }

    let forecastChart = null;

    function setForecastStatus(bestText, limitText) {
        if (bestWorkTimeEl) bestWorkTimeEl.textContent = bestText;
        if (limitWorkTimeEl) limitWorkTimeEl.textContent = limitText;
    }

    function toNumberArray(arr) {
        if (!Array.isArray(arr)) return [];

        return arr.map((value) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : 0;
        });
    }

    function initForecastChart() {
        const ctx = forecastCanvas.getContext("2d");

        forecastChart = new Chart(ctx, {
            data: {
                labels: [],
                datasets: [
                    {
                        type: "line",
                        label: "풍속 (kt)",
                        data: [],
                        borderColor: "#0d6efd",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 3,
                        yAxisID: "y-wind",
                    },

                    {
                        type: "line",
                        label: "돌풍 (Gust)",
                        data: [],
                        borderColor: "#dc3545",
                        backgroundColor: "transparent",
                        borderDash: [5, 5],
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 2,
                        yAxisID: "y-wind",
                    },

                    {
                        type: "bar",
                        label: "강수확률 (%)",
                        data: [],
                        backgroundColor: "rgba(13, 202, 240, 0.25)",
                        borderRadius: 5,
                        yAxisID: "y-rain",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: "index",
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: false,
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const label = context.dataset.label || "";
                                const value = context.parsed.y;

                                if (context.dataset.label.includes("풍속")) {
                                    return `${label}: ${value}kt`;
                                }

                                if (context.dataset.label.includes("돌풍")) {
                                    return `${label}: ${value}kt`;
                                }

                                if (context.dataset.label.includes("강수")) {
                                    return `${label}: ${value}%`;
                                }
                            },
                        },
                    },
                },
                scales: {
                    "y-wind": {
                        position: "left",
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: "kts",
                            font: { size: 10 },
                        },
                    },
                    "y-rain": {
                        position: "right",
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            display: false,
                        },
                        title: {
                            display: true,
                            text: "%",
                            font: { size: 10 },
                        },
                    },
                    x: {
                        grid: {
                            display: false,
                        },
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8,
                        },
                    },
                },
            },
        });
    }

    function updateForecastUI(payload) {
        if (!payload || typeof payload !== "object") {
            setForecastStatus("데이터 없음", "데이터 없음");
            return;
        }

        const labels = Array.isArray(payload.hours) ? payload.hours : [];
        const windData = toNumberArray(payload.wind_speeds);
        const gustData = toNumberArray(payload.wind_gusts);
        const rainData = toNumberArray(payload.rain_probs);
        const visibilityData = toNumberArray(payload.visibility);
        const cloudData = toNumberArray(payload.cloud_cover);

        if (forecastCityEl) {
            forecastCityEl.textContent = payload.city || "Incheon";
        }

        if (!labels.length || !windData.length || !rainData.length) {
            setForecastStatus("데이터 없음", "데이터 없음");

            forecastChart.data.labels = [];
            forecastChart.data.datasets[0].data = [];
            forecastChart.data.datasets[1].data = [];
            forecastChart.data.datasets[2].data = [];
            forecastChart.update();
            return;
        }

        const dataLength = Math.min(
            labels.length,
            windData.length,
            gustData.length,
            rainData.length,
            visibilityData.length,
            cloudData.length,
        );

        const safeLabels = labels.slice(0, dataLength);
        const safeWindData = windData.slice(0, dataLength);
        const safeGustData = gustData.slice(0, dataLength);
        const safeRainData = rainData.slice(0, dataLength);
        const safeVisibilityData = visibilityData.slice(0, dataLength);
        const safeCloudData = cloudData.slice(0, dataLength);

        forecastChart.data.labels = safeLabels;
        forecastChart.data.datasets[0].data = safeWindData;
        forecastChart.data.datasets[1].data = safeGustData;
        forecastChart.data.datasets[2].data = safeRainData;
        forecastChart.update();

        let bestTime = "No Slot";
        let limitTime = "Stable";

        // 최적 작업 시간:
        // 풍속 20kt 미만 + 강수확률 20% 미만
        for (let i = 0; i < dataLength; i++) {
            const wind = safeWindData[i];
            const gust = safeGustData[i];
            const rain = safeRainData[i];
            const visibility = safeVisibilityData[i];

            if (wind < 18 && gust < 25 && rain < 30 && visibility > 3000) {
                bestTime = safeLabels[i];
                break;
            }
        }

        // 작업 제한 주의:
        // 풍속 25kt 이상 또는 강수확률 60% 초과
        for (let i = 0; i < dataLength; i++) {
            const wind = safeWindData[i];
            const gust = safeGustData[i];
            const rain = safeRainData[i];
            const visibility = safeVisibilityData[i];

            if (wind >= 25 || gust >= 35 || rain > 60 || visibility < 1500) {
                limitTime = safeLabels[i];
                break;
            }
        }

        setForecastStatus(bestTime, limitTime);
    }

    async function loadForecastData() {
        const baseUrl = window.INDEX_PAGE?.weatherForecastUrl;
        const airport = window.SELECTED_AIRPORT || "RKSI";

        const url = `${baseUrl}?airport=${encodeURIComponent(airport)}`;

        if (!url) {
            console.warn("weatherForecastUrl이 설정되지 않았습니다.");
            setForecastStatus("URL 없음", "API 확인");
            return;
        }

        try {
            setForecastStatus("데이터 분석 중", "확인 중");

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                },
                credentials: "same-origin",
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error(`Forecast API Error: HTTP ${response.status}`);
            }

            const payload = await response.json();
            updateForecastUI(payload);
        } catch (error) {
            console.error("Forecast fetch failed:", error);
            setForecastStatus("로드 실패", "API 확인");
        }
    }

    initForecastChart();
    loadForecastData();

    window.addEventListener("airportChanged", function () {
        loadForecastData();
    });

    window.setInterval(loadForecastData, 30 * 60 * 1000);
});
