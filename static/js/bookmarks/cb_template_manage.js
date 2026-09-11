document.addEventListener("DOMContentLoaded", () => {
    const manager = document.getElementById("cbTemplateManager");
    if (!manager) return;

    const select = document.getElementById("cbTemplateSelect");
    const aircraftFilter = document.getElementById("cbTemplateFilterAircraft");
    const aircraftManageSelect = document.getElementById(
        "cbAircraftManageSelect",
    );
    const aircraftCode = document.getElementById("cbAircraftCode");
    const aircraftStatus = document.getElementById("cbAircraftStatus");
    const name = document.getElementById("cbTemplateName");
    const pasteSource = document.getElementById("cbTemplatePasteSource");
    const pasteImportButton = document.getElementById("cbTemplatePasteImport");
    const rowsBody = document.getElementById("cbTemplateRows");
    const fields = document.getElementById("cbTemplateFields");
    const updateButton = document.getElementById("cbTemplateUpdate");
    const deleteButton = document.getElementById("cbTemplateDelete");
    const applyButton = document.getElementById("cbTemplateApply");
    const status = document.getElementById("cbTemplateStatus");
    const locationKeys = ["cockpit", "ee", "etc"];
    const keys = [
        ...locationKeys,
        "panel_loc",
        "cb_loc",
        "fin",
        "description",
        "warning",
    ];
    let templates = [];
    let selectedId = "";
    let previousAircraftFilter = aircraftFilter.value;
    let dirty = false;
    const csrfToken = manager.querySelector("[name=csrfmiddlewaretoken]").value;

    function showStatus(message = "", type = "") {
        status.textContent = message;
        status.className = "cb-template-status" + (type ? " is-" + type : "");
        if (message && type === "error") {
            void window.AppDialog.alert(message, {
                title: "확인 필요",
                variant: "warning",
            });
        }
    }

    function showAircraftStatus(message = "", type = "") {
        if (!aircraftStatus) return;
        aircraftStatus.textContent = message;
        aircraftStatus.className =
            "cb-aircraft-settings-status" + (type ? " is-" + type : "");
    }

    function replaceAircraftOptions(models, selectedCode) {
        aircraftFilter.replaceChildren(
            ...models.map((code) => new Option(code, code)),
        );
        const selected = models.includes(selectedCode)
            ? selectedCode
            : models[0] || "";
        aircraftFilter.value = selected;
        if (aircraftManageSelect) {
            aircraftManageSelect.replaceChildren(
                ...models.map((code) => new Option(code, code)),
            );
            aircraftManageSelect.value = selected;
        }
        if (aircraftCode) aircraftCode.value = selected;
        previousAircraftFilter = selected;
    }

    async function refreshAircraftModels(selectedCode) {
        const response = await fetch(manager.dataset.aircraftApiUrl);
        if (!response.ok || response.redirected)
            throw new Error("기종 목록을 불러오지 못했습니다.");
        const data = await response.json();
        replaceAircraftOptions(data.aircraft_models, selectedCode);
    }

    async function changeAircraft(action) {
        const oldCode = aircraftManageSelect.value;
        const newCode = aircraftCode.value.trim().toUpperCase();
        if (!newCode && action !== "delete") {
            showAircraftStatus("기종 이름을 입력해 주세요.", "error");
            aircraftCode.focus();
            return;
        }
        if (action === "delete") {
            const confirmed = await window.AppDialog.confirm(
                `${oldCode} 기종을 삭제하시겠습니까? 이 기종에 저장된 템플릿도 모두 삭제됩니다.`,
                {
                    title: "기종 삭제",
                    variant: "danger",
                    confirmText: "기종 삭제",
                },
            );
            if (!confirmed) return;
        } else if (action === "rename" && oldCode === newCode) {
            showAircraftStatus("변경할 기종 이름을 입력해 주세요.", "error");
            return;
        }
        try {
            const response = await fetch(manager.dataset.aircraftApiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify({
                    action,
                    old_code: oldCode,
                    code: newCode,
                    new_code: newCode,
                }),
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || "기종 변경에 실패했습니다.");
            const selectedCode = action === "delete" ? "" : data.code;
            await refreshAircraftModels(selectedCode);
            await refresh();
            showAircraftStatus(
                action === "create"
                    ? `${data.code} 기종을 추가했습니다.`
                    : action === "rename"
                        ? `${oldCode} 기종을 ${data.code}(으)로 변경했습니다.`
                        : `${oldCode} 기종과 관련 템플릿을 삭제했습니다.`,
                "success",
            );
        } catch (error) {
            showAircraftStatus(error.message, "error");
        }
    }

    function addRow(values = {}) {
        const row =
            document.createElement("tr");

        /*
        * =====================================================
        * DATA CELLS
        * =====================================================
        */
        keys.forEach((key) => {
            const cell =
                document.createElement("td");

            const input =
                document.createElement(
                    ["description", "warning"].includes(key)
                        ? "textarea"
                        : "input",
                );

            input.className =
                "form-control";

            input.dataset.field = key;

            input.value =
                values[key] || "";

            input.maxLength = 2000;

            input.setAttribute(
                "aria-label",
                key,
            );

            /*
            * COCKPIT / E/E / ETC
            */
            if (
                locationKeys.includes(key)
            ) {
                input.type = "checkbox";

                input.className =
                    "form-check-input cb-template-location-check";

                input.checked =
                    String(
                        values[key] || "",
                    ).toUpperCase() === "V";

                cell.className =
                    "text-center";
            }

            if (
                ["description", "warning"].includes(key)
            ) {
                input.rows = 1;
            }

            cell.append(input);

            row.append(cell);
        });

        /*
        * =====================================================
        * ACTION CELL
        * =====================================================
        */
        const actionCell =
            document.createElement("td");

        actionCell.className =
            "text-center cb-template-row-action-cell";

        const actionStack =
            document.createElement("div");

        actionStack.className =
            "cb-template-row-actions";

        /*
        * =====================================================
        * DRAG HANDLE
        * =====================================================
        */
        const moveHandle =
            document.createElement("button");

        moveHandle.type = "button";

        moveHandle.className =
            "cb-template-row-drag-handle";

        moveHandle.dataset.templateDragHandle =
            "true";

        moveHandle.title =
            "마우스로 잡고 위아래로 이동";

        moveHandle.setAttribute(
            "aria-label",
            "행 이동",
        );

        moveHandle.innerHTML = `
            <i class="bi bi-grip-vertical"></i>
            <span>이동</span>
        `;

        /*
        * 버튼 기본 click 동작 방지
        */
        moveHandle.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
                event.stopPropagation();
            },
        );

        /*
        * =====================================================
        * DELETE
        * =====================================================
        */
        const remove =
            document.createElement("button");

        remove.type = "button";

        remove.className =
            "btn btn-outline-danger btn-sm";

        remove.innerHTML =
            '<i class="bi bi-trash"></i>' +
            '<span class="visually-hidden">행 삭제</span>';

        remove.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
                event.stopPropagation();

                grid.removeRow(row);

                if (
                    !rowsBody.children.length
                ) {
                    addRow();
                }

                dirty = true;
            },
        );

        actionStack.append(
            moveHandle,
            remove,
        );

        actionCell.append(
            actionStack,
        );

        row.append(
            actionCell,
        );

        rowsBody.append(
            row,
        );

        return row;
}

    function rowIsEmpty(row) {
        return keys.every((key) => !readCell(row, key));
    }

    function applyRecordToRow(row, record) {
        keys.forEach((key) => {
            const input = row.querySelector('[data-field="' + key + '"]');
            if (!input) return;
            if (locationKeys.includes(key)) {
                input.checked = String(record[key] || "").toUpperCase() === "V";
            } else {
                input.value = record[key] || "";
            }
        });
    }


    function initTemplateRowDrag() {
        let draggedRow = null;
        let pointerId = null;
        let startY = 0;
        let dragging = false;

        const DRAG_THRESHOLD = 5;

        /* =====================================================
        POINTER DOWN
        ===================================================== */
        rowsBody.addEventListener(
            "pointerdown",
            (event) => {
                const handle =
                    event.target.closest(
                        "[data-template-drag-handle]",
                    );

                if (!handle) {
                    return;
                }

                const row = handle.closest("tr");

                if (!row) {
                    return;
                }

                /*
                * 마우스는 왼쪽 버튼만
                */
                if (
                    event.pointerType === "mouse" &&
                    event.button !== 0
                ) {
                    return;
                }

                /*
                * =================================================
                * 병합 상태 검사
                *
                * 중요:
                * initTemplateRowDrag() 시작 시 검사하지 않고
                * 실제 이동을 시작할 때마다 검사
                * =================================================
                */
                if (grid.merges().length) {
                    event.preventDefault();
                    event.stopPropagation();

                    void window.AppDialog.alert(
                        "셀 병합이 설정된 상태에서는 템플릿 행 순서를 변경할 수 없습니다.\n병합을 해제한 후 다시 시도해 주세요.",
                        {
                            title: "행 이동",
                            variant: "warning",
                        },
                    );

                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                draggedRow = row;
                pointerId = event.pointerId;
                startY = event.clientY;
                dragging = false;

                /*
                * 포인터가 버튼 밖으로 나가도
                * 이벤트 계속 수신
                */
                try {
                    handle.setPointerCapture(
                        event.pointerId,
                    );
                } catch (error) {
                    /*
                    * Pointer capture를 지원하지 않아도
                    * 기본 드래그는 계속 사용
                    */
                }
            },
        );

        /* =====================================================
        POINTER MOVE
        ===================================================== */
        rowsBody.addEventListener(
            "pointermove",
            (event) => {
                if (
                    !draggedRow ||
                    event.pointerId !== pointerId
                ) {
                    return;
                }

                const distance = Math.abs(
                    event.clientY - startY,
                );

                /*
                * 5px 미만이면 아직 클릭으로 판단
                */
                if (
                    !dragging &&
                    distance < DRAG_THRESHOLD
                ) {
                    return;
                }

                /*
                * 실제 드래그 시작
                */
                if (!dragging) {
                    dragging = true;

                    draggedRow.classList.add(
                        "cb-template-row-dragging",
                    );

                    document.body.classList.add(
                        "cb-row-drag-active",
                    );
                }

                event.preventDefault();

                /*
                * 현재 포인터 아래 행
                */
                const target = document
                    .elementFromPoint(
                        event.clientX,
                        event.clientY,
                    )
                    ?.closest(
                        "#cbTemplateRows > tr",
                    );

                if (
                    !target ||
                    target === draggedRow
                ) {
                    return;
                }

                const rect =
                    target.getBoundingClientRect();

                const after =
                    event.clientY >
                    rect.top +
                        rect.height / 2;

                /*
                * 아래쪽 절반 → 대상 아래로
                */
                if (after) {
                    if (
                        target.nextSibling !==
                        draggedRow
                    ) {
                        rowsBody.insertBefore(
                            draggedRow,
                            target.nextSibling,
                        );
                    }
                }

                /*
                * 위쪽 절반 → 대상 위로
                */
                else {
                    if (
                        target !==
                        draggedRow.nextSibling
                    ) {
                        rowsBody.insertBefore(
                            draggedRow,
                            target,
                        );
                    }
                }
            },
        );

        /* =====================================================
        DRAG FINISH
        ===================================================== */
        const finishDrag = (event) => {
            if (!draggedRow) {
                return;
            }

            if (
                event &&
                pointerId !== null &&
                event.pointerId !== pointerId
            ) {
                return;
            }

            if (dragging) {
                draggedRow.classList.remove(
                    "cb-template-row-dragging",
                );

                document.body.classList.remove(
                    "cb-row-drag-active",
                );

                /*
                * 저장 필요 상태
                */
                dirty = true;

                showStatus(
                    "템플릿 행 순서를 변경했습니다. 수정 내용 저장을 눌러 주세요.",
                    "success",
                );
            }

            draggedRow = null;
            pointerId = null;
            dragging = false;
        };

        rowsBody.addEventListener(
            "pointerup",
            finishDrag,
        );

        rowsBody.addEventListener(
            "pointercancel",
            finishDrag,
        );
    }


    function getPasteTargetRow() {
        const bounds = grid.bounds();
        return bounds ? rowsBody.children[bounds.top] || null : null;
    }

    function readCell(row, key) {
        const input = row.querySelector('[data-field="' + key + '"]');
        return locationKeys.includes(key)
            ? input.checked
                ? "V"
                : ""
            : input.value.trim();
    }

    function importPastedRows(text) {
        if (!text.trim()) {
            showStatus("붙여넣을 데이터를 입력해 주세요.", "error");
            return 0;
        }
        try {
            const isTableData =
                text.includes("\t") ||
                /Row\s+Col(?:umn)?\s+Number\s+Name/i.test(text);
            const records = window.parseCBClipboard(
                text,
                isTableData ? "auto" : "boeing-manual",
            );
            const targetRow = getPasteTargetRow();
            if (targetRow) {
                const targetIndex = Array.from(rowsBody.children).indexOf(
                    targetRow,
                );
                if (rowIsEmpty(targetRow)) {
                    applyRecordToRow(targetRow, records[0]);
                    if (records.length > 1) {
                        grid.insertRows(targetIndex + 1, records.length - 1);
                        records.slice(1).forEach((record, index) => {
                            applyRecordToRow(
                                rowsBody.children[targetIndex + 1 + index],
                                record,
                            );
                        });
                    }
                } else {
                    grid.insertRows(targetIndex, records.length);
                    records.forEach((record, index) => {
                        applyRecordToRow(
                            rowsBody.children[targetIndex + index],
                            record,
                        );
                    });
                }
            } else {
                if (
                    rowsBody.children.length === 1 &&
                    rowIsEmpty(rowsBody.firstElementChild)
                ) {
                    rowsBody.replaceChildren();
                }
                records.forEach((record) =>
                    addRow({
                        ...record,
                    }),
                );
            }
            dirty = true;
            showStatus(
                String(records.length) + "행을 템플릿 표에 불러왔습니다.",
                "success",
            );
            return records.length;
        } catch (error) {
            showStatus(error.message, "error");
            return 0;
        }
    }

    function showEditor(item) {
        name.value = item?.name || "";
        rowsBody.replaceChildren();
        (item?.rows?.length ? item.rows : [{}]).forEach(addRow);
        grid.importRows(item?.rows || []);
        selectedId = item ? String(item.id) : "";
        select.value = selectedId;
        updateButton.disabled = !selectedId;
        deleteButton.disabled = !selectedId;
        applyButton.disabled = !selectedId;
        dirty = false;
    }

    function readRows() {
        const elements =
            Array.from(rowsBody.children);

        /*
        * 현재 병합 정보
        */
        const merges =
            grid.merges();

        /*
        * =====================================================
        * 마지막 사용 행 계산
        *
        * 병합 영역까지는 행을 유지해야 합니다.
        * =====================================================
        */
        const mergeEnd = Math.max(
            0,
            ...merges.map(
                (merge) =>
                    Number(merge.r || 0) +
                    Number(merge.rows || 1),
            ),
        );

        /*
        * 마지막의 완전히 빈 행만 제거
        *
        * 병합 영역 안의 행은 제거하지 않습니다.
        */
        while (
            elements.length > mergeEnd &&
            rowIsEmpty(elements.at(-1))
        ) {
            elements.pop();
        }

        /*
        * 템플릿 데이터 생성
        */
        const rows = elements.map(
            (row) => ({
                ...Object.fromEntries(
                    keys.map((key) => [
                        key,
                        readCell(row, key),
                    ]),
                ),

                /*
                * 해당 행의 병합 정보 저장
                */
                _merges: grid.exportRow(row),
            }),
        );

        /*
        * 최소 한 행 필요
        */
        if (!rows.length) {
            throw new Error(
                "템플릿 데이터를 한 줄 이상 입력해 주세요.",
            );
        }

        /*
        * =====================================================
        * REQUIRED FIELD VALIDATION
        *
        * 일반 셀:
        * PANEL / C/B LOC' / DESCRIPTION 필수
        *
        * 병합으로 덮인 셀:
        * 별도 입력 불필요
        * =====================================================
        */

        const hasTemplateData = rows.some((row) =>
            keys.some((key) => Boolean(row[key])),
        );

        if (!hasTemplateData) {
            throw new Error(
                "템플릿 셀에 데이터를 한 개 이상 입력해 주세요.",
            );
        }

        return rows;
    }

    async function confirmDiscard() {
        if (!dirty) return true;
        return window.AppDialog.confirm(
            "저장하지 않은 편집 내용을 버리고 이동할까요?",
            { title: "편집 내용 확인" },
        );
    }

    async function refresh(preferredId = "") {
        fields.disabled = true;
        showStatus("템플릿을 불러오는 중입니다.");
        try {
            const response = await fetch(
                `${manager.dataset.apiUrl}?aircraft_model=${encodeURIComponent(aircraftFilter.value)}`,
            );
            if (!response.ok || response.redirected)
                throw new Error(
                    "템플릿을 불러오지 못했습니다. 로그인 상태를 확인해 주세요.",
                );
            const data = await response.json();
            templates = data.templates;
            select.replaceChildren(new Option("새 템플릿", ""));
            templates.forEach((item) =>
                select.add(
                    new Option(`${item.name} (${item.rows.length}행)`, item.id),
                ),
            );
            showEditor(
                templates.find(
                    (item) => String(item.id) === String(preferredId),
                ),
            );
            previousAircraftFilter = aircraftFilter.value;
            showStatus(
                templates.length
                    ? ""
                    : "이 기종에 저장된 템플릿이 없습니다. 새 템플릿을 만들어 주세요.",
            );
        } catch (error) {
            showStatus(error.message, "error");
        } finally {
            fields.disabled = false;
        }
    }

    async function deleteTemplate() {
        const item = templates.find(
            (template) => String(template.id) === selectedId,
        );
        if (!item || deleteButton.disabled) return;
        const confirmed = await window.AppDialog.confirm(
            `${item.aircraft_model} / ${item.name} 템플릿을 삭제하시겠습니까? 삭제하면 복구할 수 없습니다.${dirty ? " 저장하지 않은 편집 내용도 사라집니다." : ""}`,
            {
                title: "템플릿 삭제",
                variant: "danger",
                confirmText: "삭제",
                cancelText: "취소",
            },
        );
        if (!confirmed) return;
        deleteButton.disabled = true;
        fields.disabled = true;
        try {
            const response = await fetch(manager.dataset.apiUrl, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify({
                    id: item.id,
                    aircraft_model: item.aircraft_model,
                }),
            });
            if (response.redirected)
                throw new Error("로그인 상태를 확인해 주세요.");
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || "템플릿 삭제에 실패했습니다.");
            dirty = false;
            showEditor();
            await refresh();
            const message = `${data.name} 템플릿을 삭제했습니다.`;
            showStatus(message, "success");
            void window.AppDialog.alert(message, {
                title: "템플릿 삭제 완료",
                variant: "success",
            });
        } catch (error) {
            showStatus(error.message, "error");
        } finally {
            fields.disabled = false;
            deleteButton.disabled = !selectedId;
        }
    }

    async function saveTemplate(isUpdate) {
        if (isUpdate && !selectedId) return;
        let rows;
        try {
            if (!name.value.trim())
                throw new Error("템플릿 이름을 입력해 주세요.");
            rows = readRows();
        } catch (error) {
            showStatus(error.message, "error");
            return;
        }
        fields.disabled = true;
        const payload = {
            aircraft_model: aircraftFilter.value,
            name: name.value.trim(),
            rows,
        };
        if (isUpdate) {
            payload.id = Number(selectedId);
            payload.original_aircraft_model = aircraftFilter.value;
        }
        try {
            const response = await fetch(manager.dataset.apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify(payload),
            });
            if (response.redirected)
                throw new Error("로그인 상태를 확인해 주세요.");
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || "템플릿 저장에 실패했습니다.");
            dirty = false;
            await refresh(data.id);
            const message = `${data.name} 템플릿을 ${isUpdate ? "수정" : "생성"}했습니다.`;
            showStatus(message, "success");
            void window.AppDialog.alert(message, {
                title: isUpdate ? "템플릿 수정 완료" : "템플릿 저장 완료",
                variant: "success",
                confirmText: "확인",
            });
        } catch (error) {
            showStatus(error.message, "error");
        } finally {
            fields.disabled = false;
        }
    }

    fields.addEventListener("input", (event) => {
        if (event.target === name || rowsBody.contains(event.target))
            dirty = true;
    });
    aircraftFilter.addEventListener("change", async () => {
        if (!(await confirmDiscard())) {
            aircraftFilter.value = previousAircraftFilter;
            return;
        }
        if (aircraftManageSelect)
            aircraftManageSelect.value = aircraftFilter.value;
        if (aircraftCode) aircraftCode.value = aircraftFilter.value;
        await refresh();
    });
    select.addEventListener("change", async () => {
        const nextId = select.value;
        if (!(await confirmDiscard())) {
            select.value = selectedId;
            return;
        }
        showEditor(templates.find((item) => String(item.id) === nextId));
        showStatus("");
    });
    document
        .getElementById("cbTemplateNew")
        .addEventListener("click", async () => {
            if (await confirmDiscard()) {
                showEditor();
                showStatus("새 템플릿의 이름과 데이터를 입력해 주세요.");
                name.focus();
            }
        });
    document
        .getElementById("cbTemplateAddRow")
        .addEventListener("click", () => {
            addRow();
            dirty = true;
            rowsBody.lastElementChild.querySelector("input, textarea").focus();
        });
    pasteImportButton.addEventListener("click", () => {
        if (importPastedRows(pasteSource.value)) pasteSource.value = "";
    });
    if (aircraftManageSelect && aircraftCode) {
        aircraftManageSelect.addEventListener("change", () => {
            aircraftCode.value = aircraftManageSelect.value;
        });
        document
            .getElementById("cbAircraftAdd")
            .addEventListener("click", () => changeAircraft("create"));
        document
            .getElementById("cbAircraftRename")
            .addEventListener("click", () => changeAircraft("rename"));
        document
            .getElementById("cbAircraftDelete")
            .addEventListener("click", () => changeAircraft("delete"));
    }
    document
        .getElementById("cbTemplateSave")
        .addEventListener("click", () => saveTemplate(false));
    updateButton.addEventListener("click", () => saveTemplate(true));
    deleteButton.addEventListener("click", deleteTemplate);
    applyButton.addEventListener("click", () => {
        const item = templates.find(
            (template) => String(template.id) === selectedId,
        );
        if (!item) return;
        if (dirty) {
            showStatus(
                "수정한 내용을 먼저 저장한 후 C/B 문서에 적용해 주세요.",
                "error",
            );
            return;
        }
        sessionStorage.setItem(
            "cb_open_template_import_v1",
            JSON.stringify({
                aircraft_model: item.aircraft_model,
                name: item.name,
                rows: item.rows,
            }),
        );
        window.location.href = manager.dataset.workspaceUrl;
    });

    const grid = new window.CBGridEditor({
        body: rowsBody,
        fields: keys,
        toolbarHost: document.querySelector(
            ".cb-template-table-wrap",
        ),
        createRow: () => addRow(),
        changed: () => {
            dirty = true;
        },
    });

    /*
    * 마우스 행 이동
    */
    initTemplateRowDrag();

    showEditor();
    refresh();
});
