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

    // 드래그 정렬 초기화
    initSortableRows();
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

function getCsrfToken() {
    const csrfInput = document.querySelector("[name=csrfmiddlewaretoken]");
    return csrfInput ? csrfInput.value : "";
}

// function initSortableRows() {
//     const tbody = document.querySelector("#manageItemsTable tbody");
//     if (!tbody || typeof Sortable === "undefined") return;

//     new Sortable(tbody, {
//         handle: "tr.sortable-row",
//         filter: "input, textarea, select, button, a",
//         preventOnFilter: true,
//         draggable: "tr.sortable-row",
//         animation: 150,
//         onMove: (evt) => {
//             const dragged = evt.dragged;
//             const related = evt.related;
//             if (!dragged || !related) return true;

//             const g1 = dragged.dataset.gibun || "";
//             const g2 = related.dataset.gibun || "";

//             if (!g2) return true;
//             return g1 === g2;
//         },
//         onEnd: (evt) => {
//             const dragged = evt.item;
//             if (!dragged) return;

//             const gibun = dragged.dataset.gibun || "";
//             if (!gibun) return;

//             const rows = Array.from(
//                 tbody.querySelectorAll("tr.sortable-row"),
//             ).filter((row) => row.dataset.gibun === gibun);

//             const orderedIds = rows
//                 .map((row) => row.dataset.itemId)
//                 .filter(Boolean);

//             if (orderedIds.length === 0) return;
//             if (typeof REORDER_ITEMS_URL === "undefined") return;

//             const csrf = getCsrfToken();
//             if (!csrf) return;

//             fetch(REORDER_ITEMS_URL, {
//                 method: "POST",
//                 credentials: "include",
//                 headers: {
//                     "Content-Type": "application/json",
//                     "X-CSRFToken": csrf,
//                 },
//                 body: JSON.stringify({
//                     gibun: gibun,
//                     ordered_ids: orderedIds,
//                 }),
//             }).catch((error) => {
//                 console.error("reorder failed", error);
//             });
//         },
//     });
// }

// function initSortableRows() {
//     const tbody = document.querySelector("#manageItemsTable tbody");
//     if (!tbody) return;

//     let draggedRow = null;
//     let draggedGibun = "";

//     const setRowDraggable = (row, value) => {
//         if (!row) return;
//         row.draggable = value;
//     };

//     tbody.addEventListener("pointerdown", (e) => {
//         const handle = e.target.closest(".drag-handle");
//         if (!handle) return;
//         const row = handle.closest("tr.sortable-row");
//         if (!row) return;
//         setRowDraggable(row, true);
//     });

//     tbody.addEventListener("pointerup", (e) => {
//         const row = e.target.closest("tr.sortable-row");
//         if (!row) return;
//         setRowDraggable(row, false);
//     });

//     tbody.addEventListener("dragstart", (e) => {
//         const handle = e.target.closest(".drag-handle");
//         if (!handle) {
//             e.preventDefault();
//             return;
//         }
//         const row = handle.closest("tr.sortable-row");
//         if (!row) return;

//         draggedRow = row;
//         draggedGibun = (row.dataset.gibun || "").trim();
//         row.classList.add("dragging");

//         if (e.dataTransfer) {
//             e.dataTransfer.effectAllowed = "move";
//             e.dataTransfer.setData("text/plain", row.dataset.itemId || "");
//         }
//     });

//     tbody.addEventListener("dragover", (e) => {
//         if (!draggedRow) return;
//         e.preventDefault();

//         const targetRow = e.target.closest("tr.sortable-row");
//         if (!targetRow || targetRow === draggedRow) return;

//         const targetGibun = (targetRow.dataset.gibun || "").trim();
//         if (draggedGibun && targetGibun && draggedGibun !== targetGibun) return;

//         const rect = targetRow.getBoundingClientRect();
//         const after = e.clientY - rect.top > rect.height / 2;

//         if (after) {
//             tbody.insertBefore(draggedRow, targetRow.nextSibling);
//         } else {
//             tbody.insertBefore(draggedRow, targetRow);
//         }
//     });

//     tbody.addEventListener("drop", (e) => {
//         if (!draggedRow) return;
//         e.preventDefault();
//         persistReorder(draggedGibun, tbody);
//     });

//     tbody.addEventListener("dragend", () => {
//         if (draggedRow) {
//             draggedRow.classList.remove("dragging");
//             setRowDraggable(draggedRow, false);
//         }
//         draggedRow = null;
//         draggedGibun = "";
//     });
// }

function initSortableRows() {
    const tbody = document.querySelector("#manageItemsTable tbody");
    if (!tbody) return;

    if (typeof Sortable === "undefined") {
        console.warn("SortableJS not loaded. Falling back to native drag.");
        initNativeDragRows(tbody);
        return;
    }

    // SortableJS 설정
    new Sortable(tbody, {
        handle: ".drag-handle", // 이 클래스를 가진 요소만 드래그 가능
        draggable: ".sortable-row", // 드래그 대상 행
        animation: 150, // 부드러운 이동 효과 (ms)
        ghostClass: "bg-light", // 드래그 중인 행의 임시 스타일
        filter: "input, textarea, select, button, a, label",
        preventOnFilter: false,
        multiDrag: true,
        selectedClass: "sortable-selected",
        multiDragKey: "ctrl",

        // 드래그가 끝났을 때 실행
        onEnd: function (evt) {
            const draggedRow = evt.item;
            const gibun = draggedRow.dataset.gibun;

            // 만약 다른 그룹(기번)으로 넘어갔다면 원복시키거나 경고 (선택 사항)
            // 여기서는 같은 그룹 내에서의 ID 순서를 서버로 보냅니다.
            persistReorder(gibun, tbody);
        },
    });
}

function initNativeDragRows(tbody) {
    let draggedRow = null;
    let draggedGibun = "";

    const setRowDraggable = (row, value) => {
        if (!row) return;
        row.draggable = value;
    };

    tbody.addEventListener("pointerdown", (e) => {
        const handle = e.target.closest(".drag-handle");
        if (!handle) return;
        const row = handle.closest("tr.sortable-row");
        if (!row) return;
        setRowDraggable(row, true);
    });

    tbody.addEventListener("pointerup", (e) => {
        const row = e.target.closest("tr.sortable-row");
        if (!row) return;
        setRowDraggable(row, false);
    });

    tbody.addEventListener("dragstart", (e) => {
        const handle = e.target.closest(".drag-handle");
        if (!handle) {
            e.preventDefault();
            return;
        }
        const row = handle.closest("tr.sortable-row");
        if (!row) return;

        draggedRow = row;
        draggedGibun = (row.dataset.gibun || "").trim();
        row.classList.add("dragging");

        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", row.dataset.itemId || "");
        }
    });

    tbody.addEventListener("dragover", (e) => {
        if (!draggedRow) return;
        e.preventDefault();

        const targetRow = e.target.closest("tr.sortable-row");
        if (!targetRow || targetRow === draggedRow) return;

        const targetGibun = (targetRow.dataset.gibun || "").trim();
        if (draggedGibun && targetGibun && draggedGibun !== targetGibun) return;

        const rect = targetRow.getBoundingClientRect();
        const after = e.clientY - rect.top > rect.height / 2;

        if (after) {
            tbody.insertBefore(draggedRow, targetRow.nextSibling);
        } else {
            tbody.insertBefore(draggedRow, targetRow);
        }
    });

    tbody.addEventListener("drop", (e) => {
        if (!draggedRow) return;
        e.preventDefault();
        persistReorder(draggedGibun, tbody);
    });

    tbody.addEventListener("dragend", () => {
        if (draggedRow) {
            draggedRow.classList.remove("dragging");
            setRowDraggable(draggedRow, false);
        }
        draggedRow = null;
        draggedGibun = "";
    });
}

function persistReorder(gibun, tbody) {
    if (!gibun || !tbody) return;

    const rows = Array.from(tbody.querySelectorAll("tr.sortable-row")).filter(
        (row) => (row.dataset.gibun || "").trim() === gibun,
    );

    const orderedIds = rows.map((row) => row.dataset.itemId).filter(Boolean);
    if (orderedIds.length === 0) return;
    if (typeof REORDER_ITEMS_URL === "undefined") return;

    const csrf = getCsrfToken();
    if (!csrf) return;

    fetch(REORDER_ITEMS_URL, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrf,
        },
        body: JSON.stringify({ gibun, ordered_ids: orderedIds }),
    }).catch((error) => console.error("reorder failed", error));
}
