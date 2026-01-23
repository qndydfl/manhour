// document.addEventListener("DOMContentLoaded", function () {
//     // 초기 로딩 시 이미 삭제 체크된 항목 스타일 적용
//     document.querySelectorAll(".delete-trigger").forEach((chk) => {
//         const row = chk.closest("tr");
//         const realDelete = row.querySelector(
//             'input[type="checkbox"][name$="-DELETE"]',
//         );
//         if (realDelete && realDelete.checked) {
//             chk.checked = true;
//             toggleDelete(chk);
//         }
//     });
// });

// // 1. 개별 삭제 토글 함수
// function toggleDelete(checkbox) {
//     const row = checkbox.closest("tr");
//     const realDeleteInput = row.querySelector(
//         'input[type="checkbox"][name$="-DELETE"]',
//     );

//     if (realDeleteInput) {
//         // 실제 Django 폼 필드와 동기화
//         realDeleteInput.checked = checkbox.checked;

//         // 스타일 적용
//         if (checkbox.checked) {
//             row.classList.add("row-deleted");
//             // 체크박스 제외한 인풋 비활성화
//             row.querySelectorAll(
//                 "input:not(.delete-trigger), textarea",
//             ).forEach((i) => (i.readOnly = true));
//         } else {
//             row.classList.remove("row-deleted");
//             row.querySelectorAll(
//                 "input:not(.delete-trigger), textarea",
//             ).forEach((i) => (i.readOnly = false));
//         }
//     }
// }

// // 2. 그룹 삭제 토글 함수 (수정됨: data-gibun 속성 사용)
// function toggleGroupDelete(groupCheckbox) {
//     const gibun = groupCheckbox.getAttribute("data-gibun");

//     // 해당 기번을 가진 모든 개별 체크박스 선택 (속성 선택자 사용)
//     // 공백이 포함된 기번("HL 7777")도 안전하게 선택됨
//     const targets = document.querySelectorAll(
//         `.delete-trigger[data-gibun="${CSS.escape(gibun)}"]`,
//     );

//     targets.forEach((chk) => {
//         chk.checked = groupCheckbox.checked;
//         toggleDelete(chk); // 스타일 적용 트리거
//     });
// }

// static/js/manage_items.js

document.addEventListener("DOMContentLoaded", function () {
    // 1. 초기 로딩 시: 이미 삭제 체크된 항목(서버에서 넘어온 상태) 스타일 적용
    document.querySelectorAll(".delete-trigger").forEach((chk) => {
        const row = chk.closest("tr");
        if (!row) return;

        // Django formset의 실제 DELETE 체크박스 찾기
        const realDelete = row.querySelector('input[type="checkbox"][name$="-DELETE"]');
        
        if (realDelete && realDelete.checked) {
            chk.checked = true;
            // 스타일 적용 함수 호출
            window.toggleDelete(chk);
        }
    });
});

/**
 * 2. 개별 삭제 토글 함수
 * HTML에서 onclick="toggleDelete(this)" 로 호출
 */
window.toggleDelete = function(checkbox) {
    const row = checkbox.closest("tr");
    if (!row) return;

    const realDeleteInput = row.querySelector('input[type="checkbox"][name$="-DELETE"]');

    if (realDeleteInput) {
        // 실제 Django 폼 필드와 동기화
        realDeleteInput.checked = checkbox.checked;

        // 스타일 및 활성/비활성 처리
        const inputs = row.querySelectorAll("input:not(.delete-trigger), textarea, select");

        if (checkbox.checked) {
            // 삭제 상태: 취소선 스타일 추가 & 입력 비활성화
            row.classList.add("row-deleted");
            inputs.forEach((i) => {
                i.readOnly = true;
                // select나 checkbox/radio는 readOnly가 안먹히므로 disabled 처리 필요할 수 있음
                if(i.tagName === 'SELECT' || i.type === 'checkbox' || i.type === 'radio') {
                    i.disabled = true; 
                }
            });
        } else {
            // 복구 상태: 스타일 제거 & 입력 활성화
            row.classList.remove("row-deleted");
            inputs.forEach((i) => {
                i.readOnly = false;
                if(i.tagName === 'SELECT' || i.type === 'checkbox' || i.type === 'radio') {
                    i.disabled = false;
                }
            });
        }
    }
};

/**
 * 3. 그룹 삭제 토글 함수
 * HTML에서 onclick="toggleGroupDelete(this)" 로 호출
 */
window.toggleGroupDelete = function(groupCheckbox) {
    const gibun = groupCheckbox.getAttribute("data-gibun");
    if (!gibun) return;

    // 해당 기번을 가진 모든 개별 체크박스 선택 (특수문자 처리 포함)
    const targets = document.querySelectorAll(
        `.delete-trigger[data-gibun="${CSS.escape(gibun)}"]`
    );

    targets.forEach((chk) => {
        // 이미 상태가 같으면 불필요한 연산 방지
        if (chk.checked !== groupCheckbox.checked) {
            chk.checked = groupCheckbox.checked;
            window.toggleDelete(chk); // 개별 함수 재사용
        }
    });
};