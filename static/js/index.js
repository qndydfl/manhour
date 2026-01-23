
// // 빈 공간 클릭 시 해당 슬롯 이름 자동 입력 함수
// function setSessionName(name) {
//     const nameInput = document.querySelector(
//         '#createSessionModal input[name="name"]',
//     );
//     if (nameInput) {
//         nameInput.value = name;
//     }
// }

// document.addEventListener("DOMContentLoaded", function() {
//     // 빈 공간 클릭 시 해당 슬롯 이름 자동 입력 함수
//     // (create_session.js가 아니라 index.js에 필요한 기능이라면 유지)
//     window.setSessionName = function(name) {
//         const nameInput = document.querySelector('#createSessionModal input[name="name"]');
//         if (nameInput) {
//             nameInput.value = name;
//         }
//     };


// // 아날로그 + 디지털 시계 작동 스크립트
//     function setClock() {
//         const now = new Date();

//         // 1. 아날로그 바늘 각도 계산
//         const seconds = now.getSeconds();
//         const minutes = now.getMinutes();
//         const hours = now.getHours();

//         const secondsDegrees = (seconds / 60) * 360;
//         const minutesDegrees =
//             (minutes / 60) * 360 + (seconds / 60) * 6;
//         const hoursDegrees = (hours / 12) * 360 + (minutes / 60) * 30;

//         const secHand = document.getElementById("sec-hand");
//         const minHand = document.getElementById("min-hand");
//         const hourHand = document.getElementById("hour-hand");

//         if (secHand)
//             secHand.style.transform = `rotate(${secondsDegrees}deg)`;
//         if (minHand)
//             minHand.style.transform = `rotate(${minutesDegrees}deg)`;
//         if (hourHand)
//             hourHand.style.transform = `rotate(${hoursDegrees}deg)`;

//         // 2. 하단 디지털 텍스트 업데이트
//         const year = now.getFullYear();
//         const month = String(now.getMonth() + 1).padStart(2, "0");
//         const date = String(now.getDate()).padStart(2, "0");
//         const daysArr = ["일", "월", "화", "수", "목", "금", "토"];
//         const dayName = daysArr[now.getDay()];

//         const dDate = document.getElementById("digital-date");
//         if (dDate)
//             dDate.textContent = `${year}.${month}.${date} (${dayName})`;

//         let h = hours;
//         const ampm = h >= 12 ? "PM" : "AM";
//         h = h % 12;
//         h = h ? h : 12;
//         const m = String(minutes).padStart(2, "0");
//         const s = String(seconds).padStart(2, "0");

//         const dTime = document.getElementById("digital-time");
//         if (dTime) dTime.textContent = `${h}:${m}:${s} ${ampm}`;
//     }

//     setInterval(setClock, 1000);
//     setClock();
// });

// static/js/index.js

document.addEventListener("DOMContentLoaded", function() {
    
    // ----------------------------------------------------------------
    // 1. 슬롯 이름 자동 입력 함수
    // HTML 태그의 onclick="setSessionName(...)"에서 호출하려면 
    // window 객체(전역)에 등록해야 합니다.
    // ----------------------------------------------------------------
    window.setSessionName = function(name) {
        const nameInput = document.querySelector('#createSessionModal input[name="name"]');
        if (nameInput) {
            nameInput.value = name;
        }
    };

    // ----------------------------------------------------------------
    // 2. 아날로그 + 디지털 시계 작동 스크립트
    // ----------------------------------------------------------------
    function setClock() {
        const now = new Date();

        // --- A. 아날로그 바늘 각도 계산 ---
        const seconds = now.getSeconds();
        const minutes = now.getMinutes();
        const hours = now.getHours();

        const secondsDegrees = (seconds / 60) * 360;
        const minutesDegrees = (minutes / 60) * 360 + (seconds / 60) * 6;
        const hoursDegrees = (hours / 12) * 360 + (minutes / 60) * 30;

        const secHand = document.getElementById("sec-hand");
        const minHand = document.getElementById("min-hand");
        const hourHand = document.getElementById("hour-hand");

        if (secHand) secHand.style.transform = `rotate(${secondsDegrees}deg)`;
        if (minHand) minHand.style.transform = `rotate(${minutesDegrees}deg)`;
        if (hourHand) hourHand.style.transform = `rotate(${hoursDegrees}deg)`;

        // --- B. 하단 디지털 텍스트 업데이트 ---
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const date = String(now.getDate()).padStart(2, "0");
        const daysArr = ["일", "월", "화", "수", "목", "금", "토"];
        const dayName = daysArr[now.getDay()];

        const dDate = document.getElementById("digital-date");
        if (dDate) dDate.textContent = `${year}.${month}.${date} (${dayName})`;

        let h = hours;
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12;
        h = h ? h : 12;
        const m = String(minutes).padStart(2, "0");
        const s = String(seconds).padStart(2, "0");

        const dTime = document.getElementById("digital-time");
        if (dTime) dTime.textContent = `${h}:${m}:${s} ${ampm}`;
    }

    // --- C. 시계 시작 ---
    // 1초마다 갱신
    setInterval(setClock, 1000);
    // 로딩 즉시 한 번 실행 (깜빡임 방지)
    setClock();
});