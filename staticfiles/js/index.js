document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // 1. Toast 알림 자동 실행
    // ==========================================
    // HTML에 .toast 클래스가 있으면 자동으로 띄움 (없으면 무시됨)
    const toastEls = document.querySelectorAll(".toast");
    if (toastEls.length > 0 && window.bootstrap) {
        toastEls.forEach(function (toastEl) {
            const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
            toast.show();
        });
    }

    // ==========================================
    // 2. 실시간 시계 (Clock)
    // ==========================================
    function updateClock() {
        const now = new Date();

        // 1) Local Time
        const timeEl = document.getElementById("digital-time");
        const dateEl = document.getElementById("digital-date");

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

        // 2) UTC Time
        const utcEl = document.getElementById("digital-time-utc");
        if (utcEl) {
            const utcHour = String(now.getUTCHours()).padStart(2, "0");
            const utcMin = String(now.getUTCMinutes()).padStart(2, "0");
            utcEl.textContent = `${utcHour}:${utcMin}`;
        }
    }

    // 요소가 있을 때만 시계 실행
    if (document.getElementById("digital-time")) {
        setInterval(updateClock, 1000);
        updateClock(); // 즉시 1회 실행
    }

    // ==========================================
    // 3. 검색 및 필터링 (Search & Filter)
    // ==========================================
    const searchInput = document.getElementById("sessionSearch");
    const clearBtn = document.getElementById("clearSearch");
    const filterBtns = document.querySelectorAll("[data-filter]");
    const sessionCols = document.querySelectorAll(".session-col");

    // 검색창이 존재하는 페이지에서만 실행 (오류 방지)
    if (searchInput) {
        let currentFilter = "all";

        // 필터링 로직 함수
        function filterSessions() {
            const query = searchInput.value.toLowerCase().trim();

            sessionCols.forEach((col) => {
                const shift = col.dataset.shift; // data-shift 속성값
                const name = col.dataset.name; // data-name 속성값

                const matchesSearch = name.includes(query);
                const matchesFilter =
                    currentFilter === "all" || shift === currentFilter;

                // 검색어와 필터 모두 만족하면 보이기
                if (matchesSearch && matchesFilter) {
                    col.style.display = ""; // 원래 display 속성으로 복구 (보임)
                } else {
                    col.style.display = "none"; // 숨김
                }
            });
        }

        // [이벤트] 검색어 입력 시
        searchInput.addEventListener("input", filterSessions);

        // [이벤트] 초기화 버튼 클릭 시
        if (clearBtn) {
            clearBtn.addEventListener("click", () => {
                searchInput.value = "";
                filterSessions();
                searchInput.focus();
            });
        }

        // [이벤트] 주간/야간/전체 버튼 클릭 시
        filterBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                // 1. 모든 버튼 스타일 초기화 (비활성 상태로)
                filterBtns.forEach((b) => {
                    b.classList.remove("active", "btn-dark");
                    if (b.classList.contains("btn-sm")) {
                        b.classList.add("btn-outline-secondary");
                    }
                });

                // 2. 클릭한 버튼 스타일 활성화
                btn.classList.remove("btn-outline-secondary");
                btn.classList.add("active", "btn-dark");

                // 3. 필터 적용
                currentFilter = btn.dataset.filter;
                filterSessions();
            });
        });
    }
});
