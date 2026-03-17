document.addEventListener("DOMContentLoaded", () => {
    console.log("[manage_items] script loaded");

    initPlanMhAdjust();
    initMasterItemsTab();
    initDeleteState();
    initAssignedText();
    initClearAssignedButton();
    initSortableRows();
});

window.addEventListener("load", refreshAssignedTextLayout);
window.addEventListener("pageshow", refreshAssignedTextLayout);

function initDeleteState() {
    document.querySelectorAll(".delete-trigger").forEach((chk) => {
        syncDeleteState(chk);
    });
}

function initClearAssignedButton() {
    const clearBtn = document.getElementById("btn-clear-assigned");
    if (!clearBtn) return;

    clearBtn.addEventListener("click", () => {
        clearAllAssignedText();
    });
}

function initAssignedText() {
    document.querySelectorAll(".js-assigned-text").forEach((el) => {
        formatAssignedText(el);

        requestAnimationFrame(() => autosizeTextarea(el));

        el.addEventListener("input", () => autosizeTextarea(el));
        el.addEventListener("paste", () =>
            setTimeout(() => {
                formatAssignedText(el);
            }, 0),
        );
        el.addEventListener("blur", () => formatAssignedText(el));
    });

    requestAnimationFrame(refreshAssignedTextLayout);
}

function initMasterItemsTab() {
    const tabButton = document.querySelector(
        '[data-bs-target="#masterItemsTab"]',
    );
    const tableBody = document.getElementById("masterItemsTableBody");
    const searchInput = document.getElementById("masterItemsSearch");
    const addBtn = document.getElementById("masterItemsAddBtn");
    const selectAll = document.getElementById("masterItemsSelectAll");

    if (!tabButton || !tableBody || !addBtn) return;

    let loaded = false;

    const renderRows = (items) => {
        tableBody.innerHTML = "";

        if (!items.length) {
            tableBody.innerHTML =
                '<tr><td colspan="6" class="text-center text-muted py-4">데이터가 없습니다.</td></tr>';
            return;
        }

        items.forEach((item) => {
            const tr = document.createElement("tr");
            tr.dataset.search =
                `${item.gibun || ""} ${item.work_order || ""} ${item.op || ""} ${item.description || ""}`.toLowerCase();

            tr.innerHTML = `
                <td><input type="checkbox" class="master-item-check" value="${item.id}"></td>
                <td>${escapeHtml(item.gibun || "")}</td>
                <td>${escapeHtml(item.work_order || "")}</td>
                <td>${escapeHtml(item.op || "")}</td>
                <td class="text-start">${escapeHtml(item.description || "")}</td>
                <td class="text-end">${Number(item.work_mh || 0).toFixed(1)}</td>
            `;

            tableBody.appendChild(tr);
        });
    };

    const loadItems = async () => {
        if (loaded) return;
        if (typeof MASTER_ITEMS_URL === "undefined") return;

        try {
            const res = await fetch(MASTER_ITEMS_URL, {
                credentials: "same-origin",
            });
            const data = await res.json();

            if (!res.ok || data.status !== "success") {
                throw new Error(data.message || "load failed");
            }

            renderRows(data.items || []);
            loaded = true;
        } catch (err) {
            console.error(err);
            tableBody.innerHTML =
                '<tr><td colspan="6" class="text-center text-danger py-4">불러오기 실패</td></tr>';
        }
    };

    tabButton.addEventListener("shown.bs.tab", loadItems);

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            const query = searchInput.value.trim().toLowerCase();

            tableBody.querySelectorAll("tr").forEach((row) => {
                const hay = row.dataset.search || "";
                row.style.display = hay.includes(query) ? "" : "none";
            });
        });
    }

    if (selectAll) {
        selectAll.addEventListener("change", () => {
            const checked = selectAll.checked;
            tableBody.querySelectorAll(".master-item-check").forEach((chk) => {
                chk.checked = checked;
            });
        });
    }

    addBtn.addEventListener("click", async () => {
        const checked = Array.from(tableBody.querySelectorAll("tr"))
            .filter((row) => row.style.display !== "none")
            .flatMap((row) => {
                const chk = row.querySelector(".master-item-check:checked");
                return chk ? [parseInt(chk.value, 10)] : [];
            });

        if (!checked.length) {
            alert("추가할 항목을 선택해주세요.");
            return;
        }

        if (typeof DUPLICATE_MASTER_ITEMS_URL === "undefined") return;

        try {
            const res = await fetch(DUPLICATE_MASTER_ITEMS_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCsrfToken(),
                },
                credentials: "same-origin",
                body: JSON.stringify({ item_ids: checked }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || data.status !== "success") {
                throw new Error(data.message || "duplicate failed");
            }

            alert(`선택한 ${data.count}건을 추가했습니다.`);
            location.reload();
        } catch (err) {
            console.error(err);
            alert("추가 실패: " + err.message);
        }
    });
}

function initPlanMhAdjust() {
    const select = document.querySelector(".mh-adjust-select");
    if (!select) return;

    const rows = Array.from(
        document.querySelectorAll("#manageItemsTable tbody tr.sortable-row"),
    );
    const planInputs = rows.map((row) => row.querySelector(".plan-mh-input"));
    const adjustedInputs = rows.map((row) =>
        row.querySelector(".adjusted-mh-input"),
    );
    const adjustedHiddenInputs = rows.map((row) =>
        row.querySelector(".adjusted-mh-hidden"),
    );

    const editedIds = new Set(
        (window.adjustedMhCustomIds || "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
    );

    const isNumericPercent = (value) => /^-?\d+(\.\d+)?$/.test(value);

    const normalizeNumber = (value) => {
        const parsed = parseFloat(String(value || "").trim());
        if (!Number.isFinite(parsed)) return "";
        return parsed.toFixed(1);
    };

    const syncAdjustedHidden = () => {
        adjustedInputs.forEach((input, idx) => {
            if (adjustedHiddenInputs[idx]) {
                adjustedHiddenInputs[idx].value = normalizeNumber(input.value);
            }
        });
    };

    const setAdjustedEditable = (isEditable) => {
        adjustedInputs.forEach((input) => {
            if (!input) return;

            input.readOnly = !isEditable;
            input.setAttribute("aria-readonly", (!isEditable).toString());
            input.style.pointerEvents = isEditable ? "auto" : "none";
            input.style.background = isEditable ? "#fff" : "#f8f9fa";
            input.tabIndex = isEditable ? 0 : -1;

            if (!isEditable) {
                input.classList.remove("adjusted-mh-custom");
                input.dataset.baseAdjusted = "";
            }
        });
    };

    const setCustomBaseline = () => {
        adjustedInputs.forEach((input) => {
            if (!input) return;
            input.dataset.baseAdjusted = normalizeNumber(input.value);
            input.classList.remove("adjusted-mh-custom");
        });
    };

    const refreshCustomHighlight = (input) => {
        const base = input.dataset.baseAdjusted || "";
        const current = normalizeNumber(input.value);
        const isEdited = current !== base;

        input.classList.toggle("adjusted-mh-custom", isEdited);

        const row = input.closest("tr");
        const itemId = row ? row.dataset.itemId : "";

        if (itemId) {
            if (isEdited) {
                editedIds.add(itemId);
            } else {
                editedIds.delete(itemId);
            }
        }

        syncAdjustedHidden();
    };

    const setBaseValue = (input) => {
        if (!input) return;
        const raw = (input.value || "").toString().trim();
        const parsed = parseFloat(raw);
        input.dataset.baseMh = Number.isFinite(parsed)
            ? parsed.toString()
            : "0";
    };

    planInputs.forEach((input) => {
        if (!input) return;
        setBaseValue(input);

        input.addEventListener("input", () => {
            setBaseValue(input);
            if (select.value === "custom") return;
            updateAdjustedAll(lastPercent);
        });
    });

    const form = document.getElementById("manage-form");
    if (form) {
        form.addEventListener("submit", function () {
            let percentField = form.querySelector('[name="mh_percent"]');
            if (!percentField) {
                percentField = document.createElement("input");
                percentField.type = "hidden";
                percentField.name = "mh_percent";
                form.appendChild(percentField);
            }
            percentField.value = select.value;

            let editedHidden = form.querySelector(
                'input[name="adjusted_mh_custom_ids"]',
            );
            if (!editedHidden) {
                editedHidden = document.createElement("input");
                editedHidden.type = "hidden";
                editedHidden.name = "adjusted_mh_custom_ids";
                form.appendChild(editedHidden);
            }
            editedHidden.value = Array.from(editedIds).join(",");

            syncAdjustedHidden();
        });
    }

    const lastPercentRaw =
        window.lastMhPercent !== undefined ? String(window.lastMhPercent) : "0";
    let lastPercent = isNumericPercent(lastPercentRaw)
        ? parseFloat(lastPercentRaw)
        : 0;

    const hasAdjustedValues = adjustedInputs.some(
        (input) => input && (input.value || "").trim() !== "",
    );

    if (lastPercentRaw === "custom" || (!lastPercentRaw && hasAdjustedValues)) {
        select.value = "custom";
        setAdjustedEditable(true);
        setCustomBaseline();

        adjustedInputs.forEach((input) => {
            if (!input) return;
            const row = input.closest("tr");
            const itemId = row ? row.dataset.itemId : "";

            if (itemId && (editedIds.has(itemId) || hasAdjustedValues)) {
                input.classList.add("adjusted-mh-custom");
            }
        });

        if (hasAdjustedValues) {
            adjustedInputs.forEach((input) => {
                if (!input) return;
                const row = input.closest("tr");
                const itemId = row ? row.dataset.itemId : "";
                if (itemId) editedIds.add(itemId);
            });
        }
    } else if (isNumericPercent(lastPercentRaw)) {
        if (select.value !== String(lastPercent)) {
            select.value = String(lastPercent);
        }
        setAdjustedEditable(false);
        updateAdjustedAll(lastPercent);
    }

    function updateAdjustedAll(percent) {
        const multiplier = 1 + percent / 100;

        planInputs.forEach((planInput, idx) => {
            if (!planInput || !adjustedInputs[idx]) return;

            const base = parseFloat(planInput.dataset.baseMh || "0");
            const adjusted = Math.round(base * multiplier * 10) / 10;

            adjustedInputs[idx].value =
                percent === 0 ? "" : adjusted.toFixed(1);
        });

        syncAdjustedHidden();
    }

    select.addEventListener("change", function () {
        if (this.value === "custom") {
            setAdjustedEditable(true);
            setCustomBaseline();

            adjustedInputs.forEach((input) => {
                if (!input) return;
                const row = input.closest("tr");
                const itemId = row ? row.dataset.itemId : "";
                if (itemId && editedIds.has(itemId)) {
                    input.classList.add("adjusted-mh-custom");
                }
            });

            syncAdjustedHidden();
            return;
        }

        const percent = parseFloat(this.value || "0");
        if (!Number.isFinite(percent)) return;

        lastPercent = percent;
        setAdjustedEditable(false);
        updateAdjustedAll(percent);
    });

    adjustedInputs.forEach((input) => {
        if (!input) return;

        input.addEventListener("input", () => {
            if (select.value !== "custom") return;
            refreshCustomHighlight(input);
        });

        input.addEventListener("blur", () => {
            if (select.value !== "custom") return;
            const normalized = normalizeNumber(input.value);
            input.value = normalized;
            refreshCustomHighlight(input);
        });
    });

    syncAdjustedHidden();
}

function clearAllAssignedText() {
    if (!confirm("고정 배정(이름) 입력을 모두 비우시겠습니까?")) return false;

    const inputs = document.querySelectorAll(".js-assigned-text");
    let clearedCount = 0;

    if (inputs.length === 0) {
        alert("삭제할 입력칸을 찾을 수 없습니다.");
        return false;
    }

    inputs.forEach((el) => {
        if (el.value.trim() !== "") {
            el.value = "";
            clearedCount += 1;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }
    });

    alert(
        `고정 배정 ${clearedCount}건을 비웠습니다. 아래 [저장 및 재배정]을 눌러 반영하세요.`,
    );
    return true;
}

window.toggleDeleteRow = function (chk) {
    syncDeleteState(chk);
};

window.toggleGroupDelete = function (groupChk) {
    const gibun = (groupChk.dataset.gibun || "").trim();
    const checked = groupChk.checked;
    if (!gibun) return;

    document.querySelectorAll(".delete-trigger").forEach((chk) => {
        if ((chk.dataset.gibun || "").trim() === gibun) {
            chk.checked = checked;
            syncDeleteState(chk);
        }
    });
};

function syncDeleteState(chk) {
    const row = chk.closest("tr");
    if (!row) return;

    const realDelete = row.querySelector(
        'input[type="checkbox"][name$="-DELETE"]',
    );
    if (realDelete) {
        realDelete.checked = chk.checked;
    }

    row.classList.toggle("deleted-row", chk.checked);
    row.classList.toggle("table-danger", chk.checked);
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
    if (el.value !== formatted) {
        el.value = formatted;
    }

    autosizeTextarea(el);
}

function autosizeTextarea(el) {
    if (!el || el.tagName !== "TEXTAREA") return;

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

function initSortableRows() {
    const tbody = document.querySelector("#manageItemsTable tbody");
    if (!tbody) return;

    if (typeof Sortable === "undefined") {
        console.warn("SortableJS not loaded. Falling back to native drag.");
        initNativeDragRows(tbody);
        return;
    }

    new Sortable(tbody, {
        handle: ".drag-handle",
        draggable: ".sortable-row",
        animation: 150,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
        filter: "input, textarea, select, button, a, label",
        preventOnFilter: false,

        onMove: function (evt) {
            const dragged = evt.dragged;
            const related = evt.related;
            if (!dragged || !related) return true;

            const fromGibun = (dragged.dataset.gibun || "").trim();
            const toGibun = (related.dataset.gibun || "").trim();

            return fromGibun === toGibun;
        },

        onEnd: function (evt) {
            const draggedRow = evt.item;
            const gibun = (draggedRow.dataset.gibun || "").trim();
            persistReorder(gibun, tbody);
            syncOrderingInputs(tbody);
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
        row.classList.add("sortable-drag");

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
        syncOrderingInputs(tbody);
    });

    tbody.addEventListener("dragend", () => {
        if (draggedRow) {
            draggedRow.classList.remove("sortable-drag");
            setRowDraggable(draggedRow, false);
        }
        draggedRow = null;
        draggedGibun = "";
    });
}

function syncOrderingInputs(tbody) {
    const rows = Array.from(tbody.querySelectorAll("tr.sortable-row"));
    rows.forEach((row, idx) => {
        const input = row.querySelector(".ordering-input");
        if (input) {
            input.value = idx + 1;
        }
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

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
