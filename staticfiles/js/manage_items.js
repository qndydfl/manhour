document.addEventListener("DOMContentLoaded", () => {
    // 페이지 로드 시: 기존 체크 상태에 맞춰 UI/hidden DELETE 동기화
    document.querySelectorAll(".delete-trigger").forEach((chk) => {
        syncDeleteState(chk);
    });
});

// 개별 삭제 체크박스 onchange="toggleDeleteRow(this)" 로 연결
window.toggleDeleteRow = function (chk) {
    syncDeleteState(chk);
};

// 그룹 삭제 스위치 onclick="toggleGroupDelete(this)" 로 연결
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

    // formset의 실제 DELETE 필드(숨겨둔 것) 찾기
    const realDelete = row.querySelector(
        'input[type="checkbox"][name$="-DELETE"]',
    );
    if (realDelete) realDelete.checked = chk.checked;

    // 시각 효과
    row.classList.toggle("table-danger", chk.checked);
    row.classList.toggle("text-decoration-line-through", chk.checked);
    row.classList.toggle("text-muted", chk.checked);
}
