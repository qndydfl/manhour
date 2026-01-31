// manage_items.js

document.addEventListener("DOMContentLoaded", () => {
    console.log("[manage_items] script loaded");

    // 1. 기존 체크 상태 동기화
    document.querySelectorAll(".delete-trigger").forEach((chk) => {
        syncDeleteState(chk);
    });

    // 2. 고정 배정 전체 삭제 버튼 이벤트 설정
    const clearBtn = document.getElementById("btn-clear-assigned");
    if (clearBtn) {
        clearBtn.onclick = function() {
            clearAllAssignedText();
        };
    }
});

// 고정 배정(이름) 전체 삭제 함수
function clearAllAssignedText() {
    if (!confirm("고정 배정(이름) 입력을 모두 비우시겠습니까?")) return false;

    // js-assigned-text 클래스를 가진 모든 input 선택
    const inputs = document.querySelectorAll(".js-assigned-text");
    let clearedCount = 0;

    if (inputs.length === 0) {
        alert("삭제할 입력칸을 찾을 수 없습니다.");
        return false;
    }

    inputs.forEach((el) => {
        if (el.value.trim() !== "") {
            el.value = ""; // 값 비우기
            clearedCount += 1;
            
            // 변경 이벤트 강제 발생 (Django formset 등에서 인지하도록)
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }
    });

    alert(`고정 배정 ${clearedCount}건을 비웠습니다. 아래 [저장 및 재배정]을 눌러 반영하세요.`);
    return true;
}

// 나머지 함수들 (기존과 동일)
window.toggleDeleteRow = function (chk) {
    syncDeleteState(chk);
};

window.toggleGroupDelete = function (groupChk) {
    const gibun = (groupChk.dataset.gibun || "").trim();
    const checked = groupChk.checked;
    if (!gibun) return;

    document.querySelectorAll(`.item-chk-${CSS.escape(gibun)}`).forEach((chk) => {
        chk.checked = checked;
        syncDeleteState(chk);
    });
};

function syncDeleteState(chk) {
    const row = chk.closest("tr");
    if (!row) return;
    const realDelete = row.querySelector('input[type="checkbox"][name$="-DELETE"]');
    if (realDelete) realDelete.checked = chk.checked;

    row.classList.toggle("table-danger", chk.checked);
    row.classList.toggle("text-decoration-line-through", chk.checked);
    row.classList.toggle("text-muted", chk.checked);
}



// document.addEventListener("DOMContentLoaded", () => {
//     console.log("[manage_items] script loaded");
//     // 페이지 로드 시: 기존 체크 상태에 맞춰 UI/hidden DELETE 동기화
//     document.querySelectorAll(".delete-trigger").forEach((chk) => {
//         syncDeleteState(chk);
//     });

//     const clearBtn = document.getElementById("btn-clear-assigned");
//     const clearModalEl = document.getElementById("clearAssignedModal");
//     const clearModal =
//         clearModalEl && window.bootstrap
//             ? new window.bootstrap.Modal(clearModalEl)
//             : null;

//     if (clearBtn) {
//         clearBtn.addEventListener("click", () => {
//             const cleared = clearAllAssignedText();
//             if (cleared && clearModal) clearModal.show();
//         });
//     }
// });

// // 개별 삭제 체크박스 onchange="toggleDeleteRow(this)" 로 연결
// window.toggleDeleteRow = function (chk) {
//     syncDeleteState(chk);
// };

// // 그룹 삭제 스위치 onclick="toggleGroupDelete(this)" 로 연결
// window.toggleGroupDelete = function (groupChk) {
//     const gibun = (groupChk.dataset.gibun || "").trim();
//     const checked = groupChk.checked;

//     if (!gibun) return;

//     document
//         .querySelectorAll(`.item-chk-${CSS.escape(gibun)}`)
//         .forEach((chk) => {
//             chk.checked = checked;
//             syncDeleteState(chk);
//         });
// };

// // 고정 배정(이름) 전체 삭제
// window.clearAllAssignedText = function () {
//     if (!confirm("고정 배정(이름) 입력을 모두 비우시겠습니까?")) return false;

//     // ✅ assigned_text 입력칸만 정확히 선택
//     const inputs = document.querySelectorAll(".js-assigned-text");

//     if (!inputs.length) {
//         alert(
//             "고정 배정 입력칸을 찾지 못했습니다. (js-assigned-text 클래스 확인)",
//         );
//         return false;
//     }

//     let clearedCount = 0;

//     inputs.forEach((el) => {
//         if (el.value.trim() !== "") {
//             el.value = "";
//             clearedCount += 1;

//             // ✅ 일부 브라우저/라이브러리에서 값 변경 감지가 필요할 때
//             el.dispatchEvent(new Event("input", { bubbles: true }));
//             el.dispatchEvent(new Event("change", { bubbles: true }));
//         }
//     });

//     alert(
//         `고정 배정 ${clearedCount}건을 비웠습니다. 아래 [저장 및 재배정]을 눌러 반영하세요.`,
//     );
//     return true;
// };

// function syncDeleteState(chk) {
//     const row = chk.closest("tr");
//     if (!row) return;

//     // formset의 실제 DELETE 필드(숨겨둔 것) 찾기
//     const realDelete = row.querySelector(
//         'input[type="checkbox"][name$="-DELETE"]',
//     );
//     if (realDelete) realDelete.checked = chk.checked;

//     // 시각 효과
//     row.classList.toggle("table-danger", chk.checked);
//     row.classList.toggle("text-decoration-line-through", chk.checked);
//     row.classList.toggle("text-muted", chk.checked);
// }
