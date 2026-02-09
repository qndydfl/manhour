document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // 1. Toast 알림 자동 실행 (공통)
    // ==========================================
    const toastEls = document.querySelectorAll(".toast");
    if (toastEls.length > 0 && window.bootstrap) {
        toastEls.forEach(toastEl => {
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
        const utcEl = document.getElementById("digital-time-utc");

        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString("en-US", { hour12: false });
        }
        if (dateEl) {
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, "0");
            const dd = String(now.getDate()).padStart(2, "0");
            dateEl.textContent = `${yyyy}-${mm}-${dd}`;
        }
        if (utcEl) {
            const utcHour = String(now.getUTCHours()).padStart(2, "0");
            const utcMin = String(now.getUTCMinutes()).padStart(2, "0");
            utcEl.textContent = `${utcHour}:${utcMin}`;
        }
    }

    if (document.getElementById("digital-time")) {
        setInterval(updateClock, 1000);
        updateClock();
    }

    // ==========================================
    // 3. 숫자 카운팅 애니메이션 (새로 추가된 솔루션)
    // ==========================================
    function animateNumber(element) {
        if (!element) return;
        
        const target = parseInt(element.innerText); // 현재 HTML에 적힌 숫자를 목표값으로 설정
        let current = 0;
        const duration = 1500; // 1.5초 동안 애니메이션
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

    // 대시보드의 숫자들을 찾아서 애니메이션 적용
    const activeCountEl = document.querySelector('.active-count-num');
    const historyCountEl = document.querySelector('.history-count-num');
    
    if (activeCountEl) animateNumber(activeCountEl);
    if (historyCountEl) animateNumber(historyCountEl);


    // ==========================================
    // 4. 검색 및 필터링 (세션 리스트 페이지용)
    // ==========================================
    // 대시보드(index)에는 검색창이 없으므로, 요소 존재 여부를 먼저 확인합니다.
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
                const name = col.dataset.name.toLowerCase();
                const matchesSearch = name.includes(query);
                const matchesFilter = currentFilter === "all" || shift === currentFilter;
                col.style.display = (matchesSearch && matchesFilter) ? "" : "none";
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
                filterBtns.forEach((b) => b.classList.remove("active", "btn-dark"));
                btn.classList.add("active", "btn-dark");
                currentFilter = btn.dataset.filter;
                filterSessions();
            });
        });
    }
});



// document.addEventListener("DOMContentLoaded", () => {
//     // ==========================================
//     // 1. Toast 알림 자동 실행
//     // ==========================================
//     // HTML에 .toast 클래스가 있으면 자동으로 띄움 (없으면 무시됨)
//     const toastEls = document.querySelectorAll(".toast");
//     if (toastEls.length > 0 && window.bootstrap) {
//         toastEls.forEach(function (toastEl) {
//             const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
//             toast.show();
//         });
//     }

//     // ==========================================
//     // 2. 실시간 시계 (Clock)
//     // ==========================================
//     function updateClock() {
//         const now = new Date();

//         // 1) Local Time
//         const timeEl = document.getElementById("digital-time");
//         const dateEl = document.getElementById("digital-date");

//         if (timeEl) {
//             timeEl.textContent = now.toLocaleTimeString("en-US", {
//                 hour12: false,
//             });
//         }
//         if (dateEl) {
//             const yyyy = now.getFullYear();
//             const mm = String(now.getMonth() + 1).padStart(2, "0");
//             const dd = String(now.getDate()).padStart(2, "0");
//             dateEl.textContent = `${yyyy}-${mm}-${dd}`;
//         }

//         // 2) UTC Time
//         const utcEl = document.getElementById("digital-time-utc");
//         if (utcEl) {
//             const utcHour = String(now.getUTCHours()).padStart(2, "0");
//             const utcMin = String(now.getUTCMinutes()).padStart(2, "0");
//             utcEl.textContent = `${utcHour}:${utcMin}`;
//         }
//     }

//     // 요소가 있을 때만 시계 실행
//     if (document.getElementById("digital-time")) {
//         setInterval(updateClock, 1000);
//         updateClock(); // 즉시 1회 실행
//     }

//     // ==========================================
//     // 3. 검색 및 필터링 (Search & Filter)
//     // ==========================================
//     const searchInput = document.getElementById("sessionSearch");
//     const clearBtn = document.getElementById("clearSearch");
//     const filterBtns = document.querySelectorAll("[data-filter]");
//     const sessionCols = document.querySelectorAll(".session-col");

//     // 검색창이 존재하는 페이지에서만 실행 (오류 방지)
//     if (searchInput) {
//         let currentFilter = "all";

//         // 필터링 로직 함수
//         function filterSessions() {
//             const query = searchInput.value.toLowerCase().trim();

//             sessionCols.forEach((col) => {
//                 const shift = col.dataset.shift; // data-shift 속성값
//                 const name = col.dataset.name; // data-name 속성값

//                 const matchesSearch = name.includes(query);
//                 const matchesFilter =
//                     currentFilter === "all" || shift === currentFilter;

//                 // 검색어와 필터 모두 만족하면 보이기
//                 if (matchesSearch && matchesFilter) {
//                     col.style.display = ""; // 원래 display 속성으로 복구 (보임)
//                 } else {
//                     col.style.display = "none"; // 숨김
//                 }
//             });
//         }

//         // [이벤트] 검색어 입력 시
//         searchInput.addEventListener("input", filterSessions);

//         // [이벤트] 초기화 버튼 클릭 시
//         if (clearBtn) {
//             clearBtn.addEventListener("click", () => {
//                 searchInput.value = "";
//                 filterSessions();
//                 searchInput.focus();
//             });
//         }

//         // [이벤트] 주간/야간/전체 버튼 클릭 시
//         filterBtns.forEach((btn) => {
//             btn.addEventListener("click", () => {
//                 // 1. 모든 버튼 스타일 초기화 (비활성 상태로)
//                 filterBtns.forEach((b) => {
//                     b.classList.remove("active", "btn-dark");
//                     if (b.classList.contains("btn-sm")) {
//                         b.classList.add("btn-outline-secondary");
//                     }
//                 });

//                 // 2. 클릭한 버튼 스타일 활성화
//                 btn.classList.remove("btn-outline-secondary");
//                 btn.classList.add("active", "btn-dark");

//                 // 3. 필터 적용
//                 currentFilter = btn.dataset.filter;
//                 filterSessions();
//             });
//         });
//     }
// });
