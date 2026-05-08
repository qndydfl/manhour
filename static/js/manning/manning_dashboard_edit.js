document.addEventListener("DOMContentLoaded", () => {
    const addAreaModal = document.getElementById("addAreaModal");
    const addAreaRowBtn = document.getElementById("addAreaRowBtn");
    const addAreaConfirmBtn = document.getElementById("addAreaConfirmBtn");
    const newAreaNameInput = document.getElementById("newAreaNameInput");
    const newAreaPositionInput = document.getElementById(
        "newAreaPositionInput",
    );
    const newAreaWorkersInput = document.getElementById("newAreaWorkersInput");

    const areaGroups = Array.from(document.querySelectorAll(".area-group"));
    const newAreaTemplate = document.getElementById("newAreaTemplate");
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
    const workerTrashZone = document.getElementById("workerTrashZone");
    const workerDataEl = document.getElementById("manhourWorkers");
    const defaultWorkerDataEl = document.getElementById("defaultWorkerNames");
    const workerCountEl = document.getElementById("workerCount");
    const workerUsageMessage = document.getElementById("workerUsageMessage");

    const messageModal = document.getElementById("workerMessageModal");
    const messageTitle = document.getElementById("workerMessageTitle");
    const messageText = document.getElementById("workerMessageText");
    const messageList = document.getElementById("workerMessageList");
    const messageClose = document.getElementById("workerMessageClose");
    const messageOk = document.getElementById("workerMessageOk");
    const bottomActionBar = document.querySelector(".bottom-action-bar");

    const MOBILE_MEDIA_QUERY = "(max-width: 991.98px)";
    const areaSortables = [];

    const isTouchDevice = () =>
        window.matchMedia?.("(pointer: coarse)").matches ||
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0;

    const isMobileDevice = () =>
        (window.matchMedia && window.matchMedia(MOBILE_MEDIA_QUERY).matches) ||
        isTouchDevice();

    if (!workerDataEl || !workerCountEl) {
        return;
    }

    const parsedWorkerNames = workerDataEl
        ? JSON.parse(workerDataEl.textContent)
        : [];
    let workerNames = Array.isArray(parsedWorkerNames) ? parsedWorkerNames : [];

    const parsedDefaultWorkerNames = defaultWorkerDataEl
        ? JSON.parse(defaultWorkerDataEl.textContent)
        : null;
    const defaultWorkerNames = Array.isArray(parsedDefaultWorkerNames)
        ? parsedDefaultWorkerNames
        : [...workerNames];

    let allowedWorkerSet = new Set();
    let lastDuplicateNames = [];
    let modalConfirmAction = null;
    const modalDefaultOkText = messageOk
        ? messageOk.textContent || "확인"
        : "확인";
    let allowDuplicateSubmit = false;

    function syncWorkerPanelWidth() {
        const width = workerPanel
            ? Math.ceil(workerPanel.getBoundingClientRect().width)
            : 0;
        document.body.style.setProperty("--worker-panel-width", `${width}px`);
    }

    function syncBottomBarHeight() {
        const height = bottomActionBar
            ? Math.ceil(bottomActionBar.getBoundingClientRect().height)
            : 0;
        document.body.style.setProperty(
            "--dashboard-bottom-bar-height",
            `${height}px`,
        );
    }

    syncWorkerPanelWidth();
    syncBottomBarHeight();
    window.addEventListener("resize", syncWorkerPanelWidth);
    window.addEventListener("resize", syncBottomBarHeight);

    function normalizeName(name) {
        return String(name || "")
            .trim()
            .toLowerCase();
    }

    function splitWorkerNames(value) {
        return String(value || "")
            .replace(/\r/g, "")
            .replace(/\n/g, ",")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    function updateWorkerCount() {
        if (workerCountEl) {
            workerCountEl.textContent = String(workerNames.length);
        }
    }

    function rebuildAllowedSet() {
        allowedWorkerSet = new Set(
            workerNames.map((name) => normalizeName(name)),
        );
    }

    function setWorkerNames(newNames) {
        workerNames = newNames;
        rebuildAllowedSet();
        updateWorkerCount();
    }

    function getWorkerFields() {
        return Array.from(
            document.querySelectorAll(
                "textarea[name='area_workers'], textarea[name='new_area_workers']",
            ),
        );
    }

    function collectInputNames() {
        const inputs = getWorkerFields();
        const names = [];

        inputs.forEach((field) => {
            if (field.disabled) return;
            splitWorkerNames(field.value).forEach((item) => names.push(item));
        });

        return names;
    }

    function getInvalidNames() {
        const invalid = new Set();

        collectInputNames().forEach((name) => {
            const key = normalizeName(name);
            if (!key) return;
            if (!allowedWorkerSet.has(key)) {
                invalid.add(name.trim());
            }
        });

        return Array.from(invalid);
    }

    function getDuplicateNamesFromList(names) {
        const counts = new Map();
        const displayNameMap = new Map();

        names.forEach((name) => {
            const key = normalizeName(name);
            if (!key) return;

            counts.set(key, (counts.get(key) || 0) + 1);
            if (!displayNameMap.has(key)) {
                displayNameMap.set(key, name.trim());
            }
        });

        return Array.from(counts.entries())
            .filter(([, count]) => count > 1)
            .map(([key]) => displayNameMap.get(key) || key);
    }

    function getDuplicateNamesWithModalInput(modalWorkersValue) {
        const allNames = [
            ...collectInputNames(),
            ...splitWorkerNames(modalWorkersValue),
        ];
        return getDuplicateNamesFromList(allNames);
    }

    function openMessageModal({
        title,
        message,
        items,
        confirmText,
        onConfirm,
    }) {
        if (!messageModal) return;

        if (addAreaModal && addAreaModal.classList.contains("show")) {
            const modal = window.bootstrap?.Modal.getInstance(addAreaModal);
            modal?.hide();
        }

        if (messageTitle) messageTitle.textContent = title;
        if (messageText) messageText.innerHTML = message;

        if (messageList) {
            messageList.innerHTML = "";
            (items || []).forEach((item) => {
                const li = document.createElement("li");
                li.textContent = item;
                messageList.appendChild(li);
            });
        }

        modalConfirmAction = typeof onConfirm === "function" ? onConfirm : null;

        if (messageOk) {
            messageOk.textContent = confirmText || modalDefaultOkText;
            if (modalConfirmAction) {
                messageOk.classList.add("btn-danger");
            } else {
                messageOk.classList.remove("btn-danger");
            }
        }

        messageModal.classList.remove("d-none");
    }

    function closeMessageModal() {
        if (messageModal) {
            messageModal.classList.add("d-none");
        }
        modalConfirmAction = null;
        if (messageOk) {
            messageOk.textContent = modalDefaultOkText;
            messageOk.classList.remove("btn-danger");
        }
    }

    function updateWorkerUsage() {
        const counts = new Map();
        const displayNameMap = new Map();

        collectInputNames().forEach((name) => {
            const key = normalizeName(name);
            if (!key) return;

            if (!displayNameMap.has(key)) {
                displayNameMap.set(key, name.trim());
            }
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        lastDuplicateNames = Array.from(counts.entries())
            .filter(([, count]) => count > 1)
            .map(([key]) => displayNameMap.get(key) || key);

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

        getWorkerFields().forEach((field) => {
            if (field.disabled) {
                field.classList.remove("worker-duplicate-input");
                field.classList.remove("is-invalid");
                return;
            }

            const fieldNames = splitWorkerNames(field.value);

            const fieldHasDuplicate = fieldNames.some(
                (name) => (counts.get(normalizeName(name)) || 0) > 1,
            );

            if (fieldHasDuplicate) {
                field.classList.add("worker-duplicate-input");
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

        if (workerUsageMessage) {
            if (duplicateCount > 0) {
                workerUsageMessage.textContent = "중복된 이름이 있습니다.";
                workerUsageMessage.classList.remove("d-none");
            } else {
                workerUsageMessage.textContent = "";
                workerUsageMessage.classList.add("d-none");
            }
        }
    }

    function parseWorkerEditorText(text) {
        const normalized = String(text || "")
            .replace(/\r/g, "")
            .replace(/,/g, "\n");

        const raw = normalized
            .split("\n")
            .map((name) => name.trim())
            .filter(Boolean);

        const seen = new Set();
        const cleaned = [];

        raw.forEach((name) => {
            const key = normalizeName(name);
            if (!key || seen.has(key)) return;
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
            bindFormControlGuards();
            bindRowTouchGuards();
            updateWorkerUsage();
            return true;
        } catch (error) {
            alert(`작업자 명단 저장에 실패했습니다.\n${error.message}`);
            return false;
        }
    }

    function appendWorkerName(target, workerName) {
        const currentValue = target.value.trim();
        const workers = currentValue ? splitWorkerNames(currentValue) : [];

        if (!workers.includes(workerName)) {
            workers.push(workerName);
        }

        target.value = workers.join(", ");
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function removeWorker(name) {
        setWorkerNames(workerNames.filter((item) => item !== name));
        updateWorkerUsage();
    }

    function buildWorkerRow(name) {
        const col = document.createElement("div");
        col.className = "col-12 col-md-6 col-lg-4";

        const row = document.createElement("div");
        row.className =
            "worker-item d-flex align-items-center gap-2 border rounded-4 px-3 py-1 bg-light";
        row.setAttribute("data-worker-name", name);
        row.setAttribute("draggable", isMobileDevice() ? "false" : "true");

        const checkbox = document.createElement("input");
        checkbox.className = "form-check-input worker-select";
        checkbox.type = "checkbox";

        const label = document.createElement("div");
        label.className = "flex-grow-1 text-truncate";
        label.textContent = name;

        const usedBadge = document.createElement("span");
        usedBadge.className =
            "badge bg-success-subtle text-success worker-status d-none";
        usedBadge.textContent = "사용중";

        const dupBadge = document.createElement("span");
        dupBadge.className =
            "badge bg-danger-subtle text-danger worker-dup-status d-none";
        dupBadge.textContent = "중복";

        row.appendChild(checkbox);
        row.appendChild(label);
        row.appendChild(usedBadge);
        row.appendChild(dupBadge);
        col.appendChild(row);

        return col;
    }

    function rebuildWorkerList() {
        if (!workerListPanel) return;

        workerListPanel.innerHTML = "";

        if (!workerNames.length) {
            const empty = document.createElement("div");
            empty.className = "text-center text-muted py-4";
            empty.textContent = "등록된 작업자가 없습니다.";
            workerListPanel.appendChild(empty);
            return;
        }

        workerNames.forEach((name) => {
            workerListPanel.appendChild(buildWorkerRow(name));
        });
    }

    function bindDropTargets() {
        const dropTargets = document.querySelectorAll(".worker-drop-target");

        dropTargets.forEach((target) => {
            if (target.dataset.dropBound === "true") return;

            target.addEventListener("dragover", (e) => {
                if (isMobileDevice()) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                target.classList.add("drop-active");
            });

            target.addEventListener("dragleave", () => {
                target.classList.remove("drop-active");
            });

            target.addEventListener("drop", (e) => {
                if (isMobileDevice()) return;

                e.preventDefault();
                target.classList.remove("drop-active");

                const workerName = e.dataTransfer.getData("text/plain").trim();
                if (!workerName) return;

                appendWorkerName(target, workerName);
                bindAutoResizeTextareas();
            });

            target.dataset.dropBound = "true";
        });
    }

    function bindTrashDropZone() {
        if (!workerTrashZone) return;
        if (workerTrashZone.dataset.dropBound === "true") return;

        workerTrashZone.addEventListener("dragover", (event) => {
            if (isMobileDevice()) return;
            event.preventDefault();
            workerTrashZone.classList.add("is-active");
        });

        workerTrashZone.addEventListener("dragleave", () => {
            workerTrashZone.classList.remove("is-active");
        });

        workerTrashZone.addEventListener("drop", async (event) => {
            if (isMobileDevice()) return;

            event.preventDefault();
            workerTrashZone.classList.remove("is-active");

            const workerName = event.dataTransfer.getData("text/plain").trim();
            if (!workerName) return;

            removeWorker(workerName);
            rebuildWorkerList();
            initWorkerDragAndDrop();
            bindFormControlGuards();
            bindRowTouchGuards();
            updateWorkerUsage();
            await saveWorkerDirectory(workerNames);
        });

        workerTrashZone.dataset.dropBound = "true";
    }

    function initWorkerDragAndDrop() {
        const workerItems = document.querySelectorAll(".worker-item");

        workerItems.forEach((item) => {
            if (isMobileDevice()) {
                item.setAttribute("draggable", "false");
                return;
            }

            item.setAttribute("draggable", "true");

            if (item.dataset.dragBound === "true") return;

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
        bindTrashDropZone();
    }

    function getAreaGroup(position) {
        return areaGroups.find((group) => group.dataset.position === position);
    }

    function syncRowPosition(row, position) {
        if (!row) return;

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
        if (!targetGroup) return;

        const headerRow = targetGroup.querySelector(".area-group-header");
        if (headerRow && headerRow.nextSibling) {
            targetGroup.insertBefore(row, headerRow.nextSibling);
        } else {
            targetGroup.appendChild(row);
        }

        syncRowPosition(row, position);
        syncAreaOrders();
        bindAutoResizeTextareas();
        bindFormControlGuards();
        bindRowTouchGuards();
    }

    function addNewRow(values = {}) {
        if (!newAreaTemplate) return;

        const fragment = newAreaTemplate.content.cloneNode(true);
        const row = fragment.querySelector("tr");
        const deleteCheckbox = row.querySelector(".new-area-remove");

        if (deleteCheckbox) {
            deleteCheckbox.addEventListener("change", () => {
                const shouldDisable = deleteCheckbox.checked;
                row.classList.toggle("is-deleted", shouldDisable);

                row.querySelectorAll("input, select, textarea").forEach(
                    (el) => {
                        if (el === deleteCheckbox) return;
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
            "textarea[name='new_area_workers']",
        );
        if (workersInput && values.workers) {
            workersInput.value = values.workers;
        }

        const positionValue = values.position || positionInput?.value || "LEFT";
        const targetGroup = getAreaGroup(positionValue);
        if (!targetGroup) return;

        const headerRow = targetGroup.querySelector(".area-group-header");
        if (headerRow && headerRow.nextSibling) {
            targetGroup.insertBefore(row, headerRow.nextSibling);
        } else {
            targetGroup.appendChild(row);
        }

        syncRowPosition(row, positionValue);
        syncAreaOrders();
        bindDropTargets();
        bindAutoResizeTextareas();
        bindFormControlGuards();
        bindRowTouchGuards();
        updateWorkerUsage();
    }

    function destroyAreaSortables() {
        while (areaSortables.length) {
            const sortable = areaSortables.pop();
            try {
                sortable.destroy();
            } catch (error) {
                // noop
            }
        }
    }

    function initAreaSortable() {
        destroyAreaSortables();

        if (isMobileDevice()) {
            document
                .querySelectorAll(".area-row, .new-area-row")
                .forEach((row) => {
                    row.setAttribute("draggable", "false");
                });
            return;
        }

        if (typeof Sortable === "undefined") return;

        areaGroups.forEach((group) => {
            const sortable = new Sortable(group, {
                group: "areas",
                draggable: "tr.area-row",
                filter: ".area-group-header, input, textarea, select, option, button, a, label",
                preventOnFilter: false,
                animation: 150,
                onAdd: (event) => {
                    syncRowPosition(event.item, group.dataset.position);
                    syncAreaOrders();
                    bindAutoResizeTextareas();
                },
                onUpdate: () => {
                    syncAreaOrders();
                },
                onEnd: () => {
                    syncAreaOrders();
                },
            });

            areaSortables.push(sortable);
        });
    }

    function stopRowDragFromControl(event) {
        if (!isMobileDevice()) return;
        event.stopPropagation();
    }

    function bindFormControlGuards() {
        const controls = document.querySelectorAll(`
            .area-row input,
            .area-row textarea,
            .area-row select,
            .new-area-row input,
            .new-area-row textarea,
            .new-area-row select
        `);

        controls.forEach((el) => {
            if (el.dataset.mobileGuardBound === "true") return;

            el.addEventListener("touchstart", stopRowDragFromControl, {
                passive: true,
            });
            el.addEventListener("pointerdown", stopRowDragFromControl);
            el.addEventListener("mousedown", stopRowDragFromControl);
            el.addEventListener("dragstart", (event) => {
                if (isMobileDevice()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            });

            el.dataset.mobileGuardBound = "true";
        });
    }

    function bindRowTouchGuards() {
        const rows = document.querySelectorAll(".area-row, .new-area-row");

        rows.forEach((row) => {
            if (row.dataset.rowTouchGuardBound === "true") return;

            row.addEventListener(
                "touchstart",
                (event) => {
                    if (isMobileDevice()) {
                        event.stopPropagation();
                    }
                },
                { passive: true },
            );

            row.addEventListener("pointerdown", (event) => {
                if (isMobileDevice()) {
                    event.stopPropagation();
                }
            });

            row.addEventListener("dragstart", (event) => {
                if (isMobileDevice()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            });

            row.dataset.rowTouchGuardBound = "true";
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

    function handleViewportChange() {
        initAreaSortable();
        initWorkerDragAndDrop();
        bindFormControlGuards();
        bindRowTouchGuards();
    }

    if (addAreaModal && addAreaRowBtn && window.bootstrap?.Modal) {
        const addAreaModalInstance = new window.bootstrap.Modal(addAreaModal);

        const showAddAreaModal = () => {
            if (addAreaModal.parentElement !== document.body) {
                document.body.appendChild(addAreaModal);
            }
            addAreaModalInstance.show();
        };

        addAreaRowBtn.addEventListener("click", (event) => {
            event.preventDefault();

            if (workerPanel?.classList.contains("show")) {
                const offcanvasInstance =
                    window.bootstrap?.Offcanvas?.getOrCreateInstance(
                        workerPanel,
                    );

                if (offcanvasInstance) {
                    workerPanel.addEventListener(
                        "hidden.bs.offcanvas",
                        showAddAreaModal,
                        { once: true },
                    );
                    offcanvasInstance.hide();
                    return;
                }
            }

            showAddAreaModal();
        });
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

            const modalWorkers = splitWorkerNames(workersValue);

            const invalidNames = modalWorkers.filter(
                (name) => !allowedWorkerSet.has(normalizeName(name)),
            );

            if (invalidNames.length > 0) {
                openMessageModal({
                    title: "작업자 입력 오류",
                    message:
                        "작업자 명단에 없는 이름이 있습니다. 확인해주세요.<br><span class='text-danger fw-bold mb-4'>세션에서 추가해 주세요.</span>",
                    items: [...new Set(invalidNames)].slice(0, 10),
                });
                return;
            }

            const duplicateNames =
                getDuplicateNamesWithModalInput(workersValue);
            if (duplicateNames.length > 0) {
                openMessageModal({
                    title: "중복 작업자 오류",
                    message:
                        "중복된 작업자 이름이 있습니다. 그래도 추가하시겠습니까?",
                    items: duplicateNames.slice(0, 10),
                    onConfirm: () => {
                        addNewRow({
                            name: nameValue,
                            position: positionValue,
                            workers: workersValue,
                        });

                        if (newAreaNameInput) newAreaNameInput.value = "";
                        if (newAreaPositionInput)
                            newAreaPositionInput.value = "LEFT";
                        if (newAreaWorkersInput) newAreaWorkersInput.value = "";

                        if (addAreaModal && window.bootstrap?.Modal) {
                            const modal =
                                window.bootstrap.Modal.getOrCreateInstance(
                                    addAreaModal,
                                );
                            modal.hide();
                        }

                        updateWorkerUsage();
                    },
                });
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

            updateWorkerUsage();
        });
    }

    function addWorkerName(name) {
        const trimmed = String(name || "").trim();
        if (!trimmed) return;

        const normalized = normalizeName(trimmed);
        if (allowedWorkerSet.has(normalized)) return;

        const nextNames = [...workerNames, trimmed].sort((a, b) =>
            a.localeCompare(b, "ko", { sensitivity: "base" }),
        );

        setWorkerNames(nextNames);
        rebuildWorkerList();
        initWorkerDragAndDrop();
        bindFormControlGuards();
        bindRowTouchGuards();
        updateWorkerUsage();
    }

    async function addWorkerAndSave() {
        if (!addWorkerNameInput) return;

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
        });
    }

    if (cancelWorkerEditorBtn && workerEditor) {
        cancelWorkerEditorBtn.addEventListener("click", () => {
            workerEditor.classList.add("d-none");
        });
    }

    if (saveWorkerEditorBtn && workerEditorInput) {
        saveWorkerEditorBtn.addEventListener("click", async () => {
            const updatedNames = parseWorkerEditorText(
                workerEditorInput.value,
            ).sort((a, b) => a.localeCompare(b, "ko", { sensitivity: "base" }));
            const previousNames = [...workerNames];

            setWorkerNames(updatedNames);
            rebuildWorkerList();
            initWorkerDragAndDrop();
            bindFormControlGuards();
            bindRowTouchGuards();
            updateWorkerUsage();

            const saved = await saveWorkerDirectory(updatedNames);
            if (!saved) {
                setWorkerNames(previousNames);
                rebuildWorkerList();
                initWorkerDragAndDrop();
                bindFormControlGuards();
                bindRowTouchGuards();
                updateWorkerUsage();
                return;
            }

            if (workerEditor) {
                workerEditor.classList.add("d-none");
            }
        });
    }

    if (clearAssignedBtn) {
        clearAssignedBtn.addEventListener("click", () => {
            document
                .querySelectorAll(
                    "textarea[name='area_workers'], textarea[name='new_area_workers'], textarea#newAreaWorkersInput",
                )
                .forEach((field) => {
                    field.value = "";
                });

            bindAutoResizeTextareas();
            updateWorkerUsage();
        });
    }

    if (selectAllWorkersBtn && workerListPanel) {
        selectAllWorkersBtn.addEventListener("click", () => {
            const checkboxes =
                workerListPanel.querySelectorAll(".worker-select");
            if (!checkboxes.length) return;

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
            bindFormControlGuards();
            bindRowTouchGuards();
            updateWorkerUsage();
            await saveWorkerDirectory(workerNames);
        });
    }

    document.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        if (
            target.matches("textarea[name='area_workers']") ||
            target.matches("textarea[name='new_area_workers']")
        ) {
            updateWorkerUsage();
        }

        if (target.matches("textarea.auto-resize")) {
            bindAutoResizeTextareas();
        }
    });

    if (workerPanel) {
        workerPanel.addEventListener("shown.bs.offcanvas", () => {
            syncWorkerPanelWidth();
            document.body.classList.add("worker-panel-open");
        });

        workerPanel.addEventListener("hidden.bs.offcanvas", () => {
            document.body.classList.remove("worker-panel-open");
        });
    }

    if (messageClose) {
        messageClose.addEventListener("click", closeMessageModal);
    }

    if (messageOk) {
        messageOk.addEventListener("click", () => {
            if (modalConfirmAction) {
                const action = modalConfirmAction;
                closeMessageModal();
                action();
                return;
            }
            closeMessageModal();
        });
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
            if (!(target instanceof HTMLElement)) return;

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

            if (allowDuplicateSubmit) {
                allowDuplicateSubmit = false;
                return;
            }

            const invalidNames = getInvalidNames();
            if (invalidNames.length > 0) {
                event.preventDefault();
                updateWorkerUsage();
                openMessageModal({
                    title: "작업자 입력 오류",
                    message:
                        "작업자 명단에 이름이 없습니다. 확인해주세요<br><span class='text-danger fw-bold'>세션에서 추가해 주세요.</span>",
                    items: invalidNames.slice(0, 10),
                });
                return;
            }

            const duplicateExists = document.querySelector(
                ".worker-duplicate-input",
            );
            if (duplicateExists) {
                event.preventDefault();
                updateWorkerUsage();
                openMessageModal({
                    title: "중복 작업자 오류",
                    message:
                        "중복된 작업자 이름이 있습니다. 그래도 저장하시겠습니까?",
                    items: lastDuplicateNames.slice(0, 10),
                    onConfirm: () => {
                        allowDuplicateSubmit = true;
                        if (typeof formEl.requestSubmit === "function") {
                            formEl.requestSubmit();
                        } else {
                            formEl.submit();
                        }
                    },
                });
            }
        });
    }

    if (window.matchMedia) {
        const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", handleViewportChange);
        } else if (typeof mediaQuery.addListener === "function") {
            mediaQuery.addListener(handleViewportChange);
        }
    }

    updateWorkerCount();
    rebuildAllowedSet();
    rebuildWorkerList();
    updateWorkerUsage();
    initWorkerDragAndDrop();
    initAreaSortable();
    syncAreaOrders();
    bindAutoResizeTextareas();
    bindFormControlGuards();
    bindRowTouchGuards();
});
