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
        clearBtn.onclick = function () {
            clearAllAssignedText();
        };
    }

    // 3. 고정 배정(이름) 5명씩 줄바꿈 + 줄 수 자동 조정
    document.querySelectorAll(".js-assigned-text").forEach((el) => {
        formatAssignedText(el);
        // 레이아웃 계산 후 높이 재적용
        requestAnimationFrame(() => autosizeTextarea(el));
        el.addEventListener("input", () => autosizeTextarea(el)); // 입력 중 높이만
        el.addEventListener("paste", () =>
            setTimeout(() => {
                // 붙여넣기 후 반영
                formatAssignedText(el);
            }, 0),
        );
        el.addEventListener("blur", () => formatAssignedText(el)); // 포커스 아웃 시 5명 줄바꿈 정리
    });

    // 폰트/레이아웃 로딩 완료 후 높이 재계산
    requestAnimationFrame(refreshAssignedTextLayout);
});

window.addEventListener("load", () => {
    refreshAssignedTextLayout();
});

window.addEventListener("pageshow", () => {
    refreshAssignedTextLayout();
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

    alert(
        `고정 배정 ${clearedCount}건을 비웠습니다. 아래 [저장 및 재배정]을 눌러 반영하세요.`,
    );
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

    document
        .querySelectorAll(`.item-chk-${CSS.escape(gibun)}`)
        .forEach((chk) => {
            chk.checked = checked;
            syncDeleteState(chk);
        });
};

function syncDeleteState(chk) {
    const row = chk.closest("tr");
    if (!row) return;
    const realDelete = row.querySelector(
        'input[type="checkbox"][name$="-DELETE"]',
    );
    if (realDelete) realDelete.checked = chk.checked;

    row.classList.toggle("table-danger", chk.checked);
    row.classList.toggle("text-decoration-line-through", chk.checked);
    row.classList.toggle("text-muted", chk.checked);
}

function formatAssignedText(el) {
    if (!el) return;

    const raw = (el.value || "").trim();

    if (!raw) {
        if (el.tagName === "TEXTAREA") {
            el.value = "";
            autosizeTextarea(el);
        }
        return;
    }

    const names = raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

    const lines = [];
    for (let i = 0; i < names.length; i += 5) {
        lines.push(names.slice(i, i + 5).join(", "));
    }

    const formatted = lines.join("\n");
    if (el.value !== formatted) el.value = formatted;

    // ✅ rows 쓰지 말고, 픽셀 높이를 내용에 맞춤
    autosizeTextarea(el);
}

function autosizeTextarea(el) {
    if (!el || el.tagName !== "TEXTAREA") return;

    // 먼저 높이를 초기화해야 줄 수가 줄어들 때도 같이 줄어듦
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
}

function refreshAssignedTextLayout() {
    document.querySelectorAll(".js-assigned-text").forEach((el) => {
        formatAssignedText(el);
        autosizeTextarea(el);
    });
}
