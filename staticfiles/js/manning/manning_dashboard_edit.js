document.addEventListener("DOMContentLoaded", () => {
    const addAreaModal = document.getElementById("addAreaModal");
    const addAreaConfirmBtn = document.getElementById("addAreaConfirmBtn");
    const newAreaNameInput = document.getElementById("newAreaNameInput");
    const newAreaPositionInput = document.getElementById(
        "newAreaPositionInput",
    );
    const newAreaWorkersInput = document.getElementById("newAreaWorkersInput");
    const newAreaContainer = document.getElementById("newAreaContainer");
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
    const workerDataEl = document.getElementById("manhourWorkers");
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

    let workerNames = workerDataEl ? JSON.parse(workerDataEl.textContent) : [];
    let workerText = workerNames.join(", ");
    const allowedWorkerSet = new Set(
        workerNames.map((name) => normalizeName(name)),
    );

    function normalizeName(name) {
        return name.trim().toLowerCase();
    }

    function updateWorkerCount() {
        if (workerCountEl) {
            workerCountEl.textContent = String(workerNames.length);
        }
    }

    function rebuildWorkerText() {
        workerText = workerNames.join(", ");
    }

    function removeWorker(name) {
        workerNames = workerNames.filter((item) => item !== name);
        rebuildWorkerText();
        updateWorkerCount();
        updateWorkerUsage();
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
            messageTitle.textContent = title;
        }
        if (messageText) {
            messageText.textContent = message;
        }
        if (messageList) {
            messageList.innerHTML = "";
            (items || []).forEach((item) => {
                const li = document.createElement("li");
                li.textContent = item;
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
                formDuplicateMessage.textContent =
                    "작업자 이름이 중복되었습니다. 중복된 구역을 수정해주세요.";
                formDuplicateMessage.classList.remove("d-none");
            } else {
                formDuplicateMessage.textContent = "";
                formDuplicateMessage.classList.add("d-none");
            }
        }

        if (workerUsageMessage) {
            if (duplicateCount > 0) {
                workerUsageMessage.textContent =
                    "중복된 이름이 있습니다. 수정해주세요.";
                workerUsageMessage.classList.remove("d-none");
            } else {
                workerUsageMessage.textContent = "";
                workerUsageMessage.classList.add("d-none");
            }
        }

        void invalidNames;
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

    function addNewRow(values = {}) {
        if (!newAreaTemplate || !newAreaContainer) {
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

        newAreaContainer.appendChild(fragment);

        bindDropTargets();
        updateWorkerUsage();
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
        deleteSelectedWorkersBtn.addEventListener("click", () => {
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
        formEl.addEventListener("submit", (event) => {
            const invalidNames = getInvalidNames();
            if (invalidNames.length > 0) {
                event.preventDefault();
                updateWorkerUsage();
                openMessageModal({
                    title: "작업자 입력 오류",
                    message:
                        "작업자 명단에 이름이 없습니다. 확인해주세요.",
                    items: invalidNames.slice(0, 10),
                });
            }
        });
    }

    updateWorkerCount();
    updateWorkerUsage();
    initWorkerDragAndDrop();
});
