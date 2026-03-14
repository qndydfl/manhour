document.addEventListener("DOMContentLoaded", () => {
    const addAreaModal = document.getElementById("addAreaModal");
    const addAreaConfirmBtn = document.getElementById("addAreaConfirmBtn");
    const newAreaNameInput = document.getElementById("newAreaNameInput");
    const newAreaPositionInput = document.getElementById(
        "newAreaPositionInput",
    );
    const newAreaWorkersInput = document.getElementById("newAreaWorkersInput");
    const areaGroups = Array.from(document.querySelectorAll(".area-group"));
    const newAreaTemplate = document.getElementById("newAreaTemplate");
    const applyWorkersBtn = document.getElementById("applyWorkersBtn");
    const loadWorkersBtn = document.getElementById("loadWorkersBtn");
    const workerPanel = document.getElementById("loadWorkersPanel");
    const formEl = document.getElementById("areaEditForm");
    const workerListPanel = document.getElementById("workerListPanel");
    const clearAssignedBtn = document.getElementById("btn-clear-assigned");
    const selectAllWorkersBtn = document.getElementById("selectAllWorkersBtn");
    const deleteSelectedWorkersBtn = document.getElementById(
        "deleteSelectedWorkersBtn",
    );
    const toggleWorkerEditorBtn = document.getElementById(
        "toggleWorkerEditorBtn",
    );
    const workerEditor = document.getElementById("workerEditor");
    const workerEditorInput = document.getElementById("workerEditorInput");
    const saveWorkerEditorBtn = document.getElementById("saveWorkerEditorBtn");
    const loadDefaultWorkerEditorBtn = document.getElementById(
        "loadDefaultWorkerEditorBtn",
    );
    const addWorkerNameInput = document.getElementById("addWorkerNameInput");
    const addWorkerNameBtn = document.getElementById("addWorkerNameBtn");
    const cancelWorkerEditorBtn = document.getElementById(
        "cancelWorkerEditorBtn",
    );
    const workerDataEl = document.getElementById("manhourWorkers");
    const defaultWorkerDataEl = document.getElementById("defaultWorkerNames");
    const workerCountEl = document.getElementById("workerCount");
    const workerUsageMessage = document.getElementById("workerUsageMessage");
    const formDuplicateMessage = document.getElementById(
        "workerDuplicateMessage",
    );
    const messageModal = document.getElementById("workerMessageModal");
    const messageTitle = document.getElementById("workerMessageTitle");
    const messageText = document.getElementById("workerMessageText");
    const messageList = document.getElementById("workerMessageList");
    const messageClose = document.getElementById("workerMessageClose");
    const messageOk = document.getElementById("workerMessageOk");

    if (!workerDataEl || !workerCountEl) {
        return;
    }

    let workerNames = workerDataEl ? JSON.parse(workerDataEl.innerHTML) : [];
    const defaultWorkerNames = defaultWorkerDataEl
        ? JSON.parse(defaultWorkerDataEl.innerHTML)
        : [...workerNames];
    let workerText = workerNames.join(", ");
    let allowedWorkerSet = new Set();

    function normalizeName(name) {
        return name.trim().toLowerCase();
    }

    function updateWorkerCount() {
        if (workerCountEl) {
            workerCountEl.innerHTML = String(workerNames.length);
        }
    }

    function rebuildWorkerText() {
        workerText = workerNames.join(", ");
    }

    function rebuildAllowedSet() {
        allowedWorkerSet = new Set(
            workerNames.map((name) => normalizeName(name)),
        );
    }

    function setWorkerNames(newNames) {
        workerNames = newNames;
        rebuildWorkerText();
        rebuildAllowedSet();
        updateWorkerCount();
    }

    function removeWorker(name) {
        setWorkerNames(workerNames.filter((item) => item !== name));
        updateWorkerUsage();
    }

    function buildWorkerRow(name) {
        const col = document.createElement("div");
        col.className = "col-6";

        const row = document.createElement("div");
        row.className =
            "d-flex align-items-center gap-2 border rounded-3 px-3 bg-light worker-item";
        row.style.fontSize = "1rem";
        row.style.cursor = "grab";
        row.setAttribute("data-worker-name", name);
        row.setAttribute("draggable", "true");

        const checkbox = document.createElement("input");
        checkbox.className = "form-check-input worker-select";
        checkbox.type = "checkbox";

        const label = document.createElement("div");
        label.className = "flex-grow-1";
        label.innerHTML = name;

        const usedBadge = document.createElement("span");
        usedBadge.className =
            "badge bg-success-subtle text-success worker-status d-none";
        usedBadge.innerHTML = "사용중";

        const dupBadge = document.createElement("span");
        dupBadge.className =
            "badge bg-danger-subtle text-danger worker-dup-status d-none";
        dupBadge.innerHTML = "중복";

        row.appendChild(checkbox);
        row.appendChild(label);
        row.appendChild(usedBadge);
        row.appendChild(dupBadge);
        col.appendChild(row);

        return col;
    }

    function rebuildWorkerList() {
        if (!workerListPanel) {
            return;
        }

        workerListPanel.innerHTML = "";
        if (!workerNames.length) {
            const empty = document.createElement("div");
            empty.className = "text-center text-muted py-4";
            empty.innerHTML = "등록된 작업자가 없습니다.";
            workerListPanel.appendChild(empty);
            return;
        }

        workerNames.forEach((name) => {
            workerListPanel.appendChild(buildWorkerRow(name));
        });
    }

    function getWorkerFields() {
        return Array.from(
            document.querySelectorAll(
                "textarea[name='area_workers'], input[name='new_area_workers'], input#newAreaWorkersInput",
            ),
        );
    }

    function collectInputNames() {
        const inputs = getWorkerFields();
        const names = [];

        inputs.forEach((field) => {
            if (field.disabled) {
                return;
            }

            field.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .forEach((item) => names.push(item));
        });

        return names;
    }

    function getInvalidNames() {
        const invalid = new Set();
        collectInputNames().forEach((name) => {
            const key = normalizeName(name);
            if (!key) {
                return;
            }
            if (!allowedWorkerSet.has(key)) {
                invalid.add(name.trim());
            }
        });
        return Array.from(invalid);
    }

    function openMessageModal({ title, message, items }) {
        if (!messageModal) {
            return;
        }
        if (messageTitle) {
            messageTitle.innerHTML = title;
        }
        if (messageText) {
            messageText.innerHTML = message;
        }
        if (messageList) {
            messageList.innerHTML = "";
            (items || []).forEach((item) => {
                const li = document.createElement("li");
                li.innerHTML = item;
                messageList.appendChild(li);
            });
        }
        messageModal.classList.remove("d-none");
    }

    function closeMessageModal() {
        if (messageModal) {
            messageModal.classList.add("d-none");
        }
    }

    function updateWorkerUsage() {
        const counts = new Map();
        const invalidNames = new Set();

        collectInputNames().forEach((name) => {
            const key = normalizeName(name);
            if (!key) {
                return;
            }
            if (!allowedWorkerSet.has(key)) {
                invalidNames.add(name.trim());
            }
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        let duplicateCount = 0;

        if (workerListPanel) {
            workerListPanel
                .querySelectorAll("[data-worker-name]")
                .forEach((row) => {
                    const name = row.getAttribute("data-worker-name") || "";
                    const key = normalizeName(name);
                    const usedCount = counts.get(key) || 0;
                    const usedBadge = row.querySelector(".worker-status");
                    const dupBadge = row.querySelector(".worker-dup-status");

                    if (usedCount === 0) {
                        row.classList.remove("worker-duplicate");
                        usedBadge?.classList.add("d-none");
                        dupBadge?.classList.add("d-none");
                    } else if (usedCount === 1) {
                        row.classList.remove("worker-duplicate");
                        usedBadge?.classList.remove("d-none");
                        dupBadge?.classList.add("d-none");
                    } else {
                        row.classList.add("worker-duplicate");
                        usedBadge?.classList.add("d-none");
                        dupBadge?.classList.remove("d-none");
                        duplicateCount += 1;
                    }
                });
        }

        let hasDuplicates = false;

        getWorkerFields().forEach((field) => {
            if (field.disabled) {
                field.classList.remove("worker-duplicate-input");
                field.classList.remove("is-invalid");
                return;
            }

            const fieldNames = field.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);

            const fieldHasDuplicate = fieldNames.some(
                (name) => (counts.get(normalizeName(name)) || 0) > 1,
            );

            if (fieldHasDuplicate) {
                field.classList.add("worker-duplicate-input");
                hasDuplicates = true;
            } else {
                field.classList.remove("worker-duplicate-input");
            }

            const fieldHasInvalid = fieldNames.some(
                (name) => !allowedWorkerSet.has(normalizeName(name)),
            );
            if (fieldHasInvalid) {
                field.classList.add("is-invalid");
            } else {
                field.classList.remove("is-invalid");
            }
        });

        if (formDuplicateMessage) {
            if (hasDuplicates) {
                formDuplicateMessage.innerHTML =
                    "작업자 이름이 중복되었습니다. 중복된 구역을 수정해주세요.";
                formDuplicateMessage.classList.remove("d-none");
            } else {
                formDuplicateMessage.innerHTML = "";
                formDuplicateMessage.classList.add("d-none");
            }
        }

        if (workerUsageMessage) {
            if (duplicateCount > 0) {
                workerUsageMessage.innerHTML =
                    "중복된 이름이 있습니다. 수정해주세요.";
                workerUsageMessage.classList.remove("d-none");
            } else {
                workerUsageMessage.innerHTML = "";
                workerUsageMessage.classList.add("d-none");
            }
        }

        void invalidNames;
    }

    function parseWorkerEditorText(text) {
        const normalized = (text || "").replace(/\r/g, "").replace(/,/g, "\n");
        const raw = normalized
            .split("\n")
            .map((name) => name.trim())
            .filter(Boolean);

        const seen = new Set();
        const cleaned = [];
        raw.forEach((name) => {
            const key = normalizeName(name);
            if (!key || seen.has(key)) {
                return;
            }
            seen.add(key);
            cleaned.push(name);
        });

        return cleaned;
    }

    async function saveWorkerDirectory(updatedNames) {
        const config = window.MANNING_WORKER_DIR || {};
        if (!config.updateUrl) {
            alert("작업자 명단 저장 경로가 없습니다.");
            return false;
        }

        try {
            const response = await fetch(config.updateUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": config.csrfToken || "",
                },
                credentials: "same-origin",
                body: JSON.stringify({ worker_names: updatedNames }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `save failed (${response.status}): ${errorText}`,
                );
            }

            let payload = null;
            try {
                payload = await response.json();
            } catch (error) {
                throw new Error("invalid response");
            }

            if (!payload || payload.status !== "success") {
                throw new Error(payload?.message || "save failed");
            }

            const nextNames = Array.isArray(payload.worker_names)
                ? payload.worker_names
                : updatedNames;
            setWorkerNames(nextNames);
            rebuildWorkerList();
            initWorkerDragAndDrop();
            updateWorkerUsage();
            return true;
        } catch (error) {
            alert(`작업자 명단 저장에 실패했습니다.\n${error.message}`);
            return false;
        }
    }

    function appendWorkerName(target, workerName) {
        const currentValue = target.value.trim();

        let workers = currentValue
            ? currentValue
                  .split(",")
                  .map((name) => name.trim())
                  .filter(Boolean)
            : [];

        if (!workers.includes(workerName)) {
            workers.push(workerName);
        }

        target.value = workers.join(", ");
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function bindDropTargets() {
        const dropTargets = document.querySelectorAll(".worker-drop-target");

        dropTargets.forEach((target) => {
            if (target.dataset.dropBound === "true") {
                return;
            }

            target.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                target.classList.add("drop-active");
            });

            target.addEventListener("dragleave", () => {
                target.classList.remove("drop-active");
            });

            target.addEventListener("drop", (e) => {
                e.preventDefault();
                target.classList.remove("drop-active");

                const workerName = e.dataTransfer.getData("text/plain").trim();
                if (!workerName) {
                    return;
                }

                appendWorkerName(target, workerName);
            });

            target.dataset.dropBound = "true";
        });
    }

    function initWorkerDragAndDrop() {
        const workerItems = document.querySelectorAll(".worker-item");

        workerItems.forEach((item) => {
            if (item.dataset.dragBound === "true") {
                return;
            }

            item.addEventListener("dragstart", (e) => {
                const workerName = item.dataset.workerName || "";
                e.dataTransfer.setData("text/plain", workerName);
                e.dataTransfer.effectAllowed = "copy";
                item.classList.add("dragging");
            });

            item.addEventListener("dragend", () => {
                item.classList.remove("dragging");
            });

            item.dataset.dragBound = "true";
        });

        bindDropTargets();
    }

    function getAreaGroup(position) {
        return areaGroups.find((group) => group.dataset.position === position);
    }

    function syncRowPosition(row, position) {
        if (!row) {
            return;
        }
        row.dataset.position = position;
        const select = row.querySelector(
            "select[name='area_position'], select[name='new_area_position']",
        );
        if (select) {
            select.value = position;
        }
    }

    function syncAreaOrders() {
        areaGroups.forEach((group) => {
            let order = 0;
            group.querySelectorAll("tr.area-row").forEach((row) => {
                const orderInput = row.querySelector(".area-order");
                if (orderInput) {
                    orderInput.value = String(order);
                }
                syncRowPosition(row, group.dataset.position);
                order += 1;
            });
        });
    }

    function moveRowToGroup(row, position) {
        const targetGroup = getAreaGroup(position);
        if (!targetGroup) {
            return;
        }
        const headerRow = targetGroup.querySelector(".area-group-header");
        if (headerRow && headerRow.nextSibling) {
            targetGroup.insertBefore(row, headerRow.nextSibling);
        } else {
            targetGroup.appendChild(row);
        }
        syncRowPosition(row, position);
        syncAreaOrders();
    }

    function addNewRow(values = {}) {
        if (!newAreaTemplate) {
            return;
        }

        const fragment = newAreaTemplate.content.cloneNode(true);
        const row = fragment.querySelector("tr");
        const deleteCheckbox = row.querySelector(".new-area-remove");

        if (deleteCheckbox) {
            deleteCheckbox.addEventListener("change", () => {
                const shouldDisable = deleteCheckbox.checked;
                row.classList.toggle("is-deleted", shouldDisable);

                row.querySelectorAll("input, select, textarea").forEach(
                    (el) => {
                        if (el === deleteCheckbox) {
                            return;
                        }
                        el.disabled = shouldDisable;
                    },
                );

                updateWorkerUsage();
            });
        }

        const nameInput = row.querySelector("input[name='new_area_name']");
        if (nameInput && values.name) {
            nameInput.value = values.name;
        }

        const positionInput = row.querySelector(
            "select[name='new_area_position']",
        );
        if (positionInput && values.position) {
            positionInput.value = values.position;
        }

        const workersInput = row.querySelector(
            "input[name='new_area_workers']",
        );
        if (workersInput && values.workers) {
            workersInput.value = values.workers;
        }

        const positionValue = values.position || positionInput?.value || "LEFT";
        const targetGroup = getAreaGroup(positionValue);
        if (!targetGroup) {
            return;
        }
        const headerRow = targetGroup.querySelector(".area-group-header");
        if (headerRow && headerRow.nextSibling) {
            targetGroup.insertBefore(row, headerRow.nextSibling);
        } else {
            targetGroup.appendChild(row);
        }
        syncRowPosition(row, positionValue);
        syncAreaOrders();

        bindDropTargets();
        updateWorkerUsage();
    }

    function initAreaSortable() {
        if (typeof Sortable === "undefined") {
            return;
        }

        areaGroups.forEach((group) => {
            new Sortable(group, {
                group: "areas",
                draggable: "tr.area-row",
                filter: ".area-group-header",
                animation: 150,
                onAdd: (event) => {
                    syncRowPosition(event.item, group.dataset.position);
                    syncAreaOrders();
                },
                onUpdate: () => {
                    syncAreaOrders();
                },
                onEnd: () => {
                    syncAreaOrders();
                },
            });
        });
    }

    function fillWorkerNames() {
        if (!workerText) {
            alert("불러올 작업자 데이터가 없습니다.");
            return;
        }

        document
            .querySelectorAll("textarea[name='area_workers']")
            .forEach((field) => {
                field.value = workerText;
            });

        document
            .querySelectorAll("input[name='new_area_workers']")
            .forEach((field) => {
                field.value = workerText;
            });

        if (newAreaWorkersInput) {
            newAreaWorkersInput.value = workerText;
        }

        updateWorkerUsage();
    }

    if (addAreaConfirmBtn) {
        addAreaConfirmBtn.addEventListener("click", () => {
            const nameValue = (newAreaNameInput?.value || "").trim();
            const positionValue = newAreaPositionInput?.value || "LEFT";
            const workersValue = (newAreaWorkersInput?.value || "").trim();

            if (!nameValue) {
                alert("구역 이름을 입력해주세요.");
                newAreaNameInput?.focus();
                return;
            }

            addNewRow({
                name: nameValue,
                position: positionValue,
                workers: workersValue,
            });

            if (newAreaNameInput) newAreaNameInput.value = "";
            if (newAreaPositionInput) newAreaPositionInput.value = "LEFT";
            if (newAreaWorkersInput) newAreaWorkersInput.value = "";

            if (addAreaModal && window.bootstrap?.Modal) {
                const modal =
                    window.bootstrap.Modal.getOrCreateInstance(addAreaModal);
                modal.hide();
            }
        });
    }

    if (applyWorkersBtn) {
        applyWorkersBtn.addEventListener("click", fillWorkerNames);
    }

    function addWorkerName(name) {
        const trimmed = (name || "").trim();
        if (!trimmed) {
            return;
        }

        const normalized = normalizeName(trimmed);
        if (allowedWorkerSet.has(normalized)) {
            return;
        }

        const nextNames = [...workerNames, trimmed].sort((a, b) =>
            a.localeCompare(b, "ko", { sensitivity: "base" }),
        );
        setWorkerNames(nextNames);
        rebuildWorkerList();
        initWorkerDragAndDrop();
        updateWorkerUsage();
    }

    async function addWorkerAndSave() {
        if (!addWorkerNameInput) {
            return;
        }

        const name = addWorkerNameInput.value;
        addWorkerName(name);
        addWorkerNameInput.value = "";
        await saveWorkerDirectory(workerNames);
    }

    if (addWorkerNameBtn) {
        addWorkerNameBtn.addEventListener("click", async () => {
            await addWorkerAndSave();
        });
    }

    if (addWorkerNameInput) {
        addWorkerNameInput.addEventListener("keydown", async (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                await addWorkerAndSave();
            }
        });
    }

    if (toggleWorkerEditorBtn && workerEditor && workerEditorInput) {
        toggleWorkerEditorBtn.addEventListener("click", () => {
            workerEditorInput.value = workerNames.join("\n");
            workerEditor.classList.toggle("d-none");
        });
    }

    if (loadDefaultWorkerEditorBtn && workerEditorInput) {
        loadDefaultWorkerEditorBtn.addEventListener("click", () => {
            workerEditorInput.value = defaultWorkerNames.join("\n");
            setWorkerNames([...defaultWorkerNames]);
            rebuildWorkerList();
            initWorkerDragAndDrop();
            updateWorkerUsage();
        });
    }

    if (cancelWorkerEditorBtn && workerEditor) {
        cancelWorkerEditorBtn.addEventListener("click", () => {
            workerEditor.classList.add("d-none");
        });
    }

    if (saveWorkerEditorBtn && workerEditorInput) {
        saveWorkerEditorBtn.addEventListener("click", async () => {
            const updatedNames = parseWorkerEditorText(workerEditorInput.value);
            const previousNames = [...workerNames];
            setWorkerNames(updatedNames);
            rebuildWorkerList();
            initWorkerDragAndDrop();
            updateWorkerUsage();

            const saved = await saveWorkerDirectory(updatedNames);
            if (!saved) {
                setWorkerNames(previousNames);
                rebuildWorkerList();
                initWorkerDragAndDrop();
                updateWorkerUsage();
                return;
            }
            if (saved && workerEditor) {
                workerEditor.classList.add("d-none");
            }
        });
    }

    if (clearAssignedBtn) {
        clearAssignedBtn.addEventListener("click", () => {
            document
                .querySelectorAll(
                    "textarea[name='area_workers'], input[name='new_area_workers'], input#newAreaWorkersInput",
                )
                .forEach((field) => {
                    field.value = "";
                });

            updateWorkerUsage();
        });
    }

    if (workerListPanel) {
        workerListPanel.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            if (target.classList.contains("worker-remove")) {
                const row = target.closest("[data-worker-name]");
                const name = row?.getAttribute("data-worker-name");

                if (row && name) {
                    row.remove();
                    removeWorker(name);
                }
            }
        });
    }

    if (selectAllWorkersBtn && workerListPanel) {
        selectAllWorkersBtn.addEventListener("click", () => {
            const checkboxes =
                workerListPanel.querySelectorAll(".worker-select");
            if (!checkboxes.length) {
                return;
            }

            const allSelected = Array.from(checkboxes).every(
                (checkbox) => checkbox.checked,
            );

            checkboxes.forEach((checkbox) => {
                checkbox.checked = !allSelected;
            });
        });
    }

    if (deleteSelectedWorkersBtn && workerListPanel) {
        deleteSelectedWorkersBtn.addEventListener("click", async () => {
            workerListPanel
                .querySelectorAll(".worker-select:checked")
                .forEach((checkbox) => {
                    const row = checkbox.closest("[data-worker-name]");
                    const name = row?.getAttribute("data-worker-name");

                    if (row && name) {
                        row.remove();
                        removeWorker(name);
                    }
                });
            rebuildWorkerList();
            initWorkerDragAndDrop();
            updateWorkerUsage();
            await saveWorkerDirectory(workerNames);
        });
    }

    document.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (
            target.matches("textarea[name='area_workers']") ||
            target.matches("input[name='new_area_workers']") ||
            target.matches("#newAreaWorkersInput")
        ) {
            updateWorkerUsage();
        }
    });

    if (workerPanel) {
        workerPanel.addEventListener("shown.bs.offcanvas", () => {
            document.body.classList.add("worker-panel-open");
        });

        workerPanel.addEventListener("hidden.bs.offcanvas", () => {
            document.body.classList.remove("worker-panel-open");
        });
    }

    if (loadWorkersBtn) {
        loadWorkersBtn.addEventListener("click", () => {
            document.body.classList.add("worker-panel-open");
        });
    }

    if (messageClose) {
        messageClose.addEventListener("click", closeMessageModal);
    }

    if (messageOk) {
        messageOk.addEventListener("click", closeMessageModal);
    }

    if (messageModal) {
        messageModal.addEventListener("click", (event) => {
            if (event.target === messageModal) {
                closeMessageModal();
            }
        });
    }

    if (formEl) {
        formEl.addEventListener("change", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            if (
                target.matches("select[name='area_position']") ||
                target.matches("select[name='new_area_position']")
            ) {
                const row = target.closest("tr.area-row");
                if (row) {
                    moveRowToGroup(row, target.value);
                }
            }
        });
        formEl.addEventListener("submit", (event) => {
            syncAreaOrders();
            const invalidNames = getInvalidNames();
            if (invalidNames.length > 0) {
                event.preventDefault();
                updateWorkerUsage();
                openMessageModal({
                    title: "작업자 입력 오류",
                    message:
                        "작업자 명단에 이름이 없습니다. 확인해주세요" +
                        "<br>" +
                        "<span class='text-danger fw-bold'>세션에서 추가해 주세요.</span>",
                    items: invalidNames.slice(0, 10),
                });
            }
        });
    }

    function autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
    }

    function bindAutoResizeTextareas() {
        const textareas = document.querySelectorAll("textarea.auto-resize");

        textareas.forEach((textarea) => {
            if (textarea.dataset.resizeBound === "true") {
                autoResizeTextarea(textarea);
                return;
            }

            const resizeHandler = () => autoResizeTextarea(textarea);

            textarea.addEventListener("input", resizeHandler);
            textarea.addEventListener("change", resizeHandler);
            textarea.addEventListener("drop", () => {
                setTimeout(() => autoResizeTextarea(textarea), 0);
            });

            textarea.dataset.resizeBound = "true";
            autoResizeTextarea(textarea);
        });
    }

    updateWorkerCount();
    rebuildAllowedSet();
    rebuildWorkerList();
    updateWorkerUsage();
    initWorkerDragAndDrop();
    initAreaSortable();
    syncAreaOrders();
    bindAutoResizeTextareas();
});
