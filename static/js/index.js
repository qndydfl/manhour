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

    const mobileWorkspaceQuery = window.matchMedia("(max-width: 700px)");
    const mobileWorkspaces = document.querySelectorAll("[data-mobile-workspace]");

    function setWorkspaceExpanded(workspace, isExpanded) {
        workspace.classList.toggle("is-mobile-expanded", isExpanded);
        workspace.setAttribute("aria-expanded", String(isExpanded));
    }

    function syncMobileWorkspaces() {
        mobileWorkspaces.forEach((workspace) => {
            if (mobileWorkspaceQuery.matches) {
                setWorkspaceExpanded(workspace, false);
            } else {
                workspace.classList.remove("is-mobile-expanded");
                workspace.removeAttribute("aria-expanded");
            }
        });
    }

    mobileWorkspaces.forEach((workspace) => {
        workspace.addEventListener("click", (event) => {
            if (!mobileWorkspaceQuery.matches) return;

            const isExpanded = workspace.classList.contains("is-mobile-expanded");
            const toggleHeader = event.target.closest(".portal-workspace-top");

            if (isExpanded && !toggleHeader) return;

            event.preventDefault();

            mobileWorkspaces.forEach((otherWorkspace) => {
                if (otherWorkspace !== workspace) {
                    setWorkspaceExpanded(otherWorkspace, false);
                }
            });

            setWorkspaceExpanded(workspace, !isExpanded);
        });
    });

    mobileWorkspaceQuery.addEventListener("change", syncMobileWorkspaces);
    syncMobileWorkspaces();

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

    window.addEventListener("beforeunload", () => {
        if (clockTimer) window.clearInterval(clockTimer);
    });
});

document.addEventListener("DOMContentLoaded", function () {
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

            updateDashboardNumbers(data);
        } catch (error) {
            console.error("대시보드 데이터 로드 실패:", error);
        }
    }

    function updateDashboardNumbers(data) {
        const activeEl = document.querySelector(".active-count-num");
        const historyEl = document.querySelector(".history-count-num");
        const masterDataEl = document.querySelector(".master-data-count-num");
        const masterBadgeEls = document.querySelectorAll("#masterDataBadge");

        if (activeEl) activeEl.textContent = data.activeCount;
        if (historyEl) historyEl.textContent = data.historyCount;
        if (masterDataEl) masterDataEl.textContent = data.masterDataCount;

        masterBadgeEls.forEach((badge) => {
            badge.textContent = data.masterDataCount;

            if (data.masterDataCount > 0) {
                badge.classList.remove("d-none");
            } else {
                badge.classList.add("d-none");
            }
        });
    }

    loadDashboardCounts();

    setInterval(loadDashboardCounts, 10000);
});

// METAR (CheckWX)
document.addEventListener("DOMContentLoaded", function () {
    const panel = document.getElementById("metarPanel");
    if (!panel) return;
    if (window.matchMedia("(max-width: 700px)").matches) return;

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

            if (activeIndex >= metarStations.length) {
                activeIndex = 0;
            }

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
