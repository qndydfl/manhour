document.addEventListener("DOMContentLoaded", () => {
    const indexElement = (attribute, value, legacySelector) =>
        document.querySelector(`[data-index-${attribute}="${value}"]`) ||
        document.querySelector(legacySelector);

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

    const timeEl = indexElement("clock", "local-time", "#digital-time");
    const dateEl = indexElement("clock", "local-date", "#digital-date");
    const weekdayEl = indexElement("clock", "local-weekday", "#digital-weekday");
    const utcEl = indexElement("clock", "utc-time", "#digital-time-utc");
    const utcDateEl = indexElement("clock", "utc-date", "#digital-date-utc");
    const utcWeekdayEl = indexElement("clock", "utc-weekday", "#digital-weekday-utc");
    const clockHands = {
        localHour: document.querySelector('[data-clock-hand="local-hour"]'),
        localMinute: document.querySelector('[data-clock-hand="local-minute"]'),
        localSecond: document.querySelector('[data-clock-hand="local-second"]'),
        utcHour: document.querySelector('[data-clock-hand="utc-hour"]'),
        utcMinute: document.querySelector('[data-clock-hand="utc-minute"]'),
        utcSecond: document.querySelector('[data-clock-hand="utc-second"]'),
    };

    function setClockHand(element, degrees) {
        element?.style.setProperty("--clock-rotation", `${degrees}deg`);
    }

    function updateAnalogClock(now) {
        const localSeconds = now.getSeconds();
        const localMinutes = now.getMinutes();
        const localHours = now.getHours();
        const utcSeconds = now.getUTCSeconds();
        const utcMinutes = now.getUTCMinutes();
        const utcHours = now.getUTCHours();

        setClockHand(
            clockHands.localHour,
            ((localHours % 12) + localMinutes / 60 + localSeconds / 3600) * 30,
        );
        setClockHand(
            clockHands.localMinute,
            (localMinutes + localSeconds / 60) * 6,
        );
        setClockHand(clockHands.localSecond, localSeconds * 6);

        setClockHand(
            clockHands.utcHour,
            ((utcHours % 12) + utcMinutes / 60 + utcSeconds / 3600) * 30,
        );
        setClockHand(
            clockHands.utcMinute,
            (utcMinutes + utcSeconds / 60) * 6,
        );
        setClockHand(clockHands.utcSecond, utcSeconds * 6);
    }

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

        updateAnalogClock(now);

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

    animateNumber(indexElement("count", "active", ".active-count-num"));
    animateNumber(indexElement("count", "history", ".history-count-num"));

    window.addEventListener("beforeunload", () => {
        if (clockTimer) window.clearInterval(clockTimer);
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const countElement = (name, legacySelector) =>
        document.querySelector(`[data-index-count="${name}"]`) ||
        document.querySelector(legacySelector);

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
        const activeEl = countElement("active", ".active-count-num");
        const historyEl = countElement("history", ".history-count-num");
        const masterDataEl = countElement("master", ".master-data-count-num");
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
    const metarElement = (name, legacyId) =>
        document.querySelector(`[data-index-metar="${name}"]`) ||
        document.getElementById(legacyId);

    const panel = metarElement("panel", "metarPanel");
    if (!panel) return;

    const tabsEl = metarElement("tabs", "metarTabs");
    const stationEl = metarElement("station", "metarStation");
    const updatedEl = metarElement("updated", "metarUpdated");
    const tempEl = metarElement("temp", "metarTemp");
    const windEl = metarElement("wind", "metarWind");
    const visibilityEl = metarElement("visibility", "metarVisibility");
    const pressureEl = metarElement("pressure", "metarPressure");
    const categoryEl = metarElement("category", "metarCategory");
    const rawEl = metarElement("raw", "metarRaw");
    const dewpointEl = metarElement("dewpoint");
    const humidityEl = metarElement("humidity");
    const conditionEl = metarElement("condition");
    const conditionNoteEl = metarElement("condition-note");
    const summaryStationEl = metarElement("summary-station");
    const summaryTempEl = metarElement("summary-temp");
    const summaryWindEl = metarElement("summary-wind");
    const summaryCategoryEl = metarElement("summary-category");

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
                        class="btn btn-sm ${isActive ? "active" : ""}"
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
            if (categoryEl) {
                categoryEl.textContent = "--";
                delete categoryEl.dataset.category;
            }
            if (rawEl) rawEl.textContent = "-";
            if (dewpointEl) dewpointEl.textContent = "-";
            if (humidityEl) humidityEl.textContent = "-";
            if (conditionEl) conditionEl.textContent = "-";
            if (conditionNoteEl) conditionNoteEl.textContent = "기상 정보 없음";
            if (summaryStationEl) summaryStationEl.textContent = "AIRPORT";
            if (summaryTempEl) summaryTempEl.textContent = "--";
            if (summaryWindEl) summaryWindEl.textContent = "Unavailable";
            if (summaryCategoryEl) {
                summaryCategoryEl.textContent = "--";
                delete summaryCategoryEl.dataset.category;
            }
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

        let updated = "Updated: -";
        if (station.observed) {
            const observedAt = new Date(station.observed);
            updated = Number.isNaN(observedAt.getTime())
                ? `Updated: ${station.observed}`
                : `Updated ${observedAt.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "UTC",
                  })} UTC`;
        }

        const category = station.flight_category || "--";
        const dewpoint =
            station.dewpoint_c === null || station.dewpoint_c === undefined
                ? "-"
                : `${station.dewpoint_c}°C`;
        const humidity =
            station.humidity === null || station.humidity === undefined
                ? "-"
                : `${Math.round(Number(station.humidity))}%`;
        const condition = station.condition || "-";
        const conditionCode = condition.split(/\s+/)[0].toUpperCase();
        const conditionNotes = {
            CAVOK: "시정 양호 · 중요 기상 없음",
            FEW: "구름 적음",
            SCT: "구름 다소",
            BKN: "구름 많음",
            OVC: "흐림",
            VV: "수직 시정",
            SKC: "맑음",
            CLR: "맑음",
            NSC: "중요한 구름 없음",
            NCD: "구름 관측 없음",
        };
        const conditionNote =
            condition === "-"
                ? "기상 정보 없음"
                : conditionNotes[conditionCode] || "현재 기상 상태";

        if (stationEl) stationEl.textContent = `${title} ${icao}`.trim();
        if (updatedEl) updatedEl.textContent = updated;
        if (tempEl) tempEl.textContent = temp;
        if (windEl) windEl.textContent = wind;
        if (visibilityEl) visibilityEl.textContent = vis;
        if (pressureEl) pressureEl.textContent = pressure;
        if (categoryEl) {
            categoryEl.textContent = category;
            if (category === "--") delete categoryEl.dataset.category;
            else categoryEl.dataset.category = category;
        }
        if (rawEl) rawEl.textContent = station.raw_text || "-";
        if (dewpointEl) dewpointEl.textContent = dewpoint;
        if (humidityEl) humidityEl.textContent = humidity;
        if (conditionEl) conditionEl.textContent = condition;
        if (conditionNoteEl) conditionNoteEl.textContent = conditionNote;
        if (summaryStationEl) summaryStationEl.textContent = station.icao || "AIRPORT";
        if (summaryTempEl) summaryTempEl.textContent = temp;
        if (summaryWindEl) summaryWindEl.textContent = wind;
        if (summaryCategoryEl) {
            summaryCategoryEl.textContent = category;
            if (category === "--") delete summaryCategoryEl.dataset.category;
            else summaryCategoryEl.dataset.category = category;
        }

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
            if (categoryEl) {
                categoryEl.textContent = "--";
                delete categoryEl.dataset.category;
            }
            if (rawEl) rawEl.textContent = "-";
            if (dewpointEl) dewpointEl.textContent = "-";
            if (humidityEl) humidityEl.textContent = "-";
            if (conditionEl) conditionEl.textContent = "-";
            if (conditionNoteEl) conditionNoteEl.textContent = "기상 정보 없음";
            if (summaryStationEl) summaryStationEl.textContent = "AIRPORT";
            if (summaryTempEl) summaryTempEl.textContent = "--";
            if (summaryWindEl) summaryWindEl.textContent = "Unavailable";
            if (summaryCategoryEl) {
                summaryCategoryEl.textContent = "--";
                delete summaryCategoryEl.dataset.category;
            }
        }
    }

    loadMetar();
    window.setInterval(loadMetar, 10 * 60 * 1000);
});
