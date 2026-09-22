// =========================================================
// BOOKMARKS — C/B OPEN LIST
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
    const table = document.getElementById("cbOpenListTable");
    const tableBody = document.getElementById("cbOpenListBody");
    const sheet = document.getElementById("cbOpenSheet");
    const pasteSource = document.getElementById("cbOpenListPasteSource");

    if (!table || !tableBody || !sheet) {
        return;
    }

    /* =====================================================
    DOCUMENT INFORMATION
    ===================================================== */

    const aircraftModelSelect = document.getElementById("cbOpenAircraftModel");
    const aircraftBackLink = document.getElementById("cbOpenAircraftBack");

    const documentBar = document.querySelector(".cb-open-document-bar");

    const gibunInput = document.getElementById("cbOpenGibun");

    const headerTitleInput = document.getElementById("cbOpenHeaderTitle");

    /*
     * 실제 A4 문서 헤더
     */
    const sheetPrefix = document.getElementById("cbOpenSheetPrefix");

    const sheetGibun = document.getElementById("cbOpenSheetGibun");

    const sheetTitle = document.getElementById("cbOpenSheetTitleText");

    const sheetModel = document.getElementById("cbOpenSheetModel");

    /* =====================================================
    TABLE SETTINGS
    ===================================================== */

    /*
     * 헤더 글자 크기
     */
    const headerFontInput = document.getElementById("cbOpenTableHeaderFont");

    const headerFontValue = document.getElementById(
        "cbOpenTableHeaderFontValue",
    );

    /*
     * 전체 본문 글자 크기
     */
    const bodyFontInput = document.getElementById("cbOpenTableBodyFont");

    const bodyFontValue = document.getElementById("cbOpenTableBodyFontValue");

    /*
     * 헤더 여백
     */
    const headerPaddingInput = document.getElementById(
        "cbOpenTableHeaderPadding",
    );

    const headerPaddingValue = document.getElementById(
        "cbOpenTableHeaderPaddingValue",
    );

    /*
     * 기본 행 높이
     */
    const rowHeightInput = document.getElementById("cbOpenTableRowHeight");

    const rowHeightValue = document.getElementById("cbOpenTableRowHeightValue");

    /* =====================================================
    DOCUMENT FOOTER SETTINGS
    ===================================================== */

    const issueDateInput = document.getElementById("cbOpenIssueDate");

    const companyNameInput = document.getElementById("cbOpenCompanyName");

    const documentNumberInput = document.getElementById("cbOpenDocumentNumber");

    /*
     * 실제 A4 Footer
     */
    const footerIssueDate = document.getElementById("cbOpenFooterIssueDate");

    const footerCompany = document.getElementById("cbOpenFooterCompany");

    const footerDocumentNumber = document.getElementById(
        "cbOpenFooterDocumentNumber",
    );

    /* =====================================================
    BUTTONS
    ===================================================== */

    const addRowButton = document.getElementById("cbOpenListAddRow");

    const deleteSelectedButton = document.getElementById(
        "cbOpenDeleteSelected",
    );

    const saveButton = document.getElementById("cbOpenListSave");

    const templateSaveButton = document.getElementById("cbOpenTemplateSave");
    const templateSaveDialog = document.getElementById(
        "cbOpenTemplateSaveDialog",
    );
    const templateNameInput = document.getElementById("cbOpenTemplateName");
    const templateSaveConfirm = document.getElementById(
        "cbOpenTemplateSaveConfirm",
    );
    const templateSaveCancel = document.getElementById(
        "cbOpenTemplateSaveCancel",
    );
    const templateSaveStatus = document.getElementById(
        "cbOpenTemplateSaveStatus",
    );
    const templateAircraftLabel = document.getElementById(
        "cbOpenTemplateAircraftLabel",
    );
    const managedTemplateUpdate = document.getElementById(
        "cbOpenManagedTemplateUpdate",
    );
    const managedTemplateDelete = document.getElementById(
        "cbOpenManagedTemplateDelete",
    );
    const managedTemplateName = document.getElementById(
        "cbManagedTemplateName",
    );
    const managedTemplateConfig = document.getElementById(
        "cbManagedTemplateConfig",
    );
    let managedTemplateData = null;
    try {
        const dataElement = document.getElementById("cbManagedTemplateData");
        managedTemplateData = dataElement
            ? JSON.parse(dataElement.textContent)
            : null;
    } catch (_error) {
        managedTemplateData = null;
    }

    const clearButton = document.getElementById("cbOpenListClear");

    const previewButton = document.getElementById("cbOpenListPreview");

    const printButton = document.getElementById("cbOpenListPrint");

    const settingsButton = document.getElementById("cbOpenListSettings");

    const settingsSaveButton = document.getElementById("cbOpenSettingsSave");

    const gridToolsToggle = document.getElementById("cbOpenGridToolsToggle");
    const rowFilterPanelToggle = document.getElementById(
        "cbOpenRowFilterPanelToggle",
    );

    const rowFilter = document.getElementById("cbOpenRowFilter");
    const rowFilterStatus = document.getElementById("cbOpenRowFilterStatus");
    const rowFilterSearch = document.getElementById("cbOpenRowFilterSearch");
    const rowFilterList = document.getElementById("cbOpenRowFilterList");
    const rowFilterAll = document.getElementById("cbOpenRowFilterAll");
    const rowFilterNone = document.getElementById("cbOpenRowFilterNone");
    const rowFilterToggle = document.getElementById("cbOpenRowFilterToggle");
    const rowFilterFrom = document.getElementById("cbOpenRowFilterFrom");
    const rowFilterTo = document.getElementById("cbOpenRowFilterTo");
    const rowFilterLogic = document.getElementById("cbOpenRowFilterLogic");
    const rowFilterApply = document.getElementById("cbOpenRowFilterApply");

    /* =====================================================
    CELL SETTINGS
    ===================================================== */

    const fontDownButton = document.getElementById("cbOpenCellFontDown");

    const fontUpButton = document.getElementById("cbOpenCellFontUp");

    const fontResetButton = document.getElementById("cbOpenCellFontReset");

    const rowResetButton = document.getElementById("cbOpenRowHeightReset");

    /* =====================================================
    COLUMN SETTINGS
    ===================================================== */

    const columnResetButton = document.getElementById("cbOpenColumnWidthReset");

    const columnInputs = Array.from(
        document.querySelectorAll("[data-col-width-input]"),
    );

    /* =====================================================
    CONSTANTS
    ===================================================== */

    const DEFAULT_ROWS = 16;

    const STORAGE_KEY = "cb_open_list_workspace_v1";

    const SAVED_DOCUMENTS_KEY = "cb_open_list_saved_documents_v1";

    /*
     * 기본 Footer 값
     */
    const DEFAULT_ISSUE_DATE = "2026.01.05";

    const DEFAULT_COMPANY_NAME = "ASIANA AIRLINES";

    const DEFAULT_DOCUMENT_NUMBER = "AAR-MX-817-04";

    /*
     * 실제 editable field
     */
    const TABLE_FIELDS = [
        "cockpit",

        "ee",

        "etc",

        "panel_loc",

        "cb_loc",

        "fin",

        "description",

        "warning",

        "open_date",

        "open_shop",

        "open_mech",

        "close_date",

        "close_mech",

        "confirm",
    ];

    /*
     * Clipboard 자동 매핑
     *
     * 복사 데이터:
     *
     * 1열 → PANEL
     * 2열 → DESCRIPTION
     * 3열 → FIN
     * 4열 → C/B LOC'
     */
    const PASTE_TARGETS = ["panel_loc", "description", "fin", "cb_loc"];

    /*
     * 기본 열 너비
     */
    const DEFAULT_COLUMN_WIDTHS = {
        no: 38,

        cockpit: 38,

        ee: 38,

        etc: 38,

        "panel-loc": 60,

        "cb-loc": 55,

        fin: 60,

        description: 170,

        warning: 160,

        "open-date": 67,

        "open-shop": 67,

        "open-mech": 67,

        "close-date": 67,

        "close-mech": 67,

        confirm: 72,
    };

    /*
     * 최소 열 너비
     */
    const MIN_COLUMN_WIDTHS = {
        no: 26,

        cockpit: 30,

        ee: 28,

        etc: 28,

        "panel-loc": 55,

        "cb-loc": 55,

        fin: 55,

        description: 160,

        warning: 160,

        "open-date": 50,

        "open-shop": 50,

        "open-mech": 50,

        "close-date": 50,

        "close-mech": 50,

        confirm: 52,
    };

    /* =====================================================
    STATE
    ===================================================== */

    let selectedEditor = null;

    let previewMode = false;

    let sheetScaleFrame = 0;

    let printMode = false;

    let rowFilterPanelVisible = false;

    /* =====================================================
    UTIL
    ===================================================== */

    function cleanText(value) {
        return String(value ?? "")
            .replace(/\u00a0/g, " ")
            .trim();
    }

    /*
     * =============================================
     * 기종 / 기번 필수 검사
     * =============================================
     *
     * 주의:
     *
     * 이 함수는
     * 1. 문서 저장
     * 2. 표 데이터 붙여넣기
     *
     * 에서 사용합니다.
     *
     * "설정 저장"에서는 사용하지 않습니다.
     */
    function validateRequiredDocumentInfo() {
        const aircraft = cleanText(aircraftModelSelect?.value);

        const gibun = cleanText(gibunInput?.value);

        if (!aircraft) {
            alert("기종을 선택해 주세요.");

            aircraftModelSelect?.focus();

            return false;
        }

        if (!gibun) {
            alert("기번을 입력해 주세요.");

            gibunInput?.focus();

            return false;
        }

        return true;
    }

    /* =====================================================
    COLUMN UTIL
    ===================================================== */

    function getColumnElement(key) {
        return table.querySelector(`col[data-col="${key}"]`);
    }

    function getColumnWidth(key) {
        const col = getColumnElement(key);

        if (!col) {
            return 0;
        }

        const storedWidth = Number(col.dataset.width);

        if (Number.isFinite(storedWidth) && storedWidth > 0) {
            return storedWidth;
        }

        return DEFAULT_COLUMN_WIDTHS[key] || 60;
    }

    function applyColumnWidthRatios() {
        const keys = Object.keys(DEFAULT_COLUMN_WIDTHS);
        const totalWidth = keys.reduce(
            (sum, key) => sum + getColumnWidth(key),
            0,
        );

        if (!totalWidth) return;

        keys.forEach((key) => {
            const col = getColumnElement(key);
            if (!col) return;
            col.style.width = `${(getColumnWidth(key) / totalWidth) * 100}%`;
        });
    }

    function setColumnWidth(key, width, enforceMin = true) {
        const col = getColumnElement(key);

        if (!col) {
            return;
        }

        let nextWidth = Number(width);

        if (!Number.isFinite(nextWidth)) {
            return;
        }

        const minWidth = MIN_COLUMN_WIDTHS[key] || 25;

        if (enforceMin) {
            nextWidth = Math.max(minWidth, nextWidth);
        } else {
            nextWidth = Math.max(18, nextWidth);
        }

        col.dataset.width = String(Math.round(nextWidth));

        applyColumnWidthRatios();

        syncColumnInput(key, nextWidth);

        scheduleSheetScale();
    }

    function syncColumnInput(key, width) {
        const input = columnInputs.find(
            (item) => item.dataset.colWidthInput === key,
        );

        if (!input) {
            return;
        }

        input.value = String(Math.round(width));
    }

    function applyDefaultColumnWidths() {
        Object.entries(DEFAULT_COLUMN_WIDTHS).forEach(([key, width]) => {
            setColumnWidth(key, width);
        });
    }

    function applySavedDisplaySettings(data) {
        if (!data) {
            return;
        }

        /* =====================================================
        TABLE SETTINGS
        ===================================================== */

        if (data.tableSettings) {
            if (headerFontInput) {
                headerFontInput.value = data.tableSettings.headerFont || "13";
            }

            if (bodyFontInput) {
                bodyFontInput.value = data.tableSettings.bodyFont || "12";
            }

            if (headerPaddingInput) {
                headerPaddingInput.value =
                    data.tableSettings.headerPadding || "5";
            }

            if (rowHeightInput) {
                rowHeightInput.value = data.tableSettings.rowHeight || "34";
            }
        }

        /* =====================================================
        DOCUMENT FONT SETTINGS
        ===================================================== */

        if (data.documentFonts) {
            restoreDocumentFonts(data.documentFonts);
        }

        /* =====================================================
        COLUMN WIDTHS
        ===================================================== */

        if (data.columnWidths) {
            Object.entries(data.columnWidths).forEach(([key, width]) => {
                setColumnWidth(key, Number(width), true);
            });
        }

        updateTableSizing();

        scheduleSheetScale();
    }

    /* =====================================================
    DOCUMENT HEADER
    ===================================================== */

    function updateHeader() {
        const aircraft = cleanText(aircraftModelSelect?.value);

        if (aircraftBackLink) {
            const libraryUrl = aircraftBackLink.dataset.libraryUrl || "/";
            const aircraftUrlTemplate =
                aircraftBackLink.dataset.aircraftUrlTemplate || "";
            aircraftBackLink.href =
                aircraft && aircraftUrlTemplate
                    ? aircraftUrlTemplate.replace(
                          "__AIRCRAFT__",
                          encodeURIComponent(aircraft),
                      )
                    : libraryUrl;
            aircraftBackLink.title = aircraft
                ? `${aircraft} C/B 메뉴로 돌아가기`
                : "기종 목록으로 돌아가기";
        }

        let gibun = cleanText(gibunInput?.value);

        /*
         * 기번은 숫자만,
         * 최대 4자리
         */
        gibun = gibun.replace(/\D/g, "").slice(0, 4);

        if (gibunInput) {
            gibunInput.value = gibun;
        }

        const title =
            cleanText(headerTitleInput?.value) || "CIRCUIT BREAKER OPEN LIST";

        if (sheetPrefix) {
            sheetPrefix.textContent = "HL";
        }

        if (sheetGibun) {
            sheetGibun.textContent = gibun || "____";
        }

        if (sheetTitle) {
            sheetTitle.textContent = title;
        }

        if (sheetModel) {
            sheetModel.textContent = aircraft ? `(${aircraft})` : "()";
        }
    }

    /* =====================================================
    DOCUMENT FOOTER
    ===================================================== */

    function updateFooter() {
        const issueDate =
            cleanText(issueDateInput?.value) || DEFAULT_ISSUE_DATE;

        const companyName =
            cleanText(companyNameInput?.value) || DEFAULT_COMPANY_NAME;

        const documentNumber =
            cleanText(documentNumberInput?.value) || DEFAULT_DOCUMENT_NUMBER;

        /*
         * 설정 input 값 정리
         */
        if (issueDateInput) {
            issueDateInput.value = issueDate;
        }

        if (companyNameInput) {
            companyNameInput.value = companyName;
        }

        if (documentNumberInput) {
            documentNumberInput.value = documentNumber;
        }

        /*
         * 실제 Footer 출력
         */
        if (footerIssueDate) {
            footerIssueDate.textContent = `제정 : ${issueDate}`;
        }

        if (footerCompany) {
            footerCompany.textContent = companyName;
        }

        if (footerDocumentNumber) {
            footerDocumentNumber.textContent = documentNumber;
        }
    }

    /* =====================================================
    HEADER DIRECT EDIT
    ===================================================== */

    function bindEditableHeader(element) {
        if (!element) {
            return;
        }

        /*
         * HTML 서식 제거하고
         * 순수 텍스트만 붙여넣기
         */
        element.addEventListener("paste", (event) => {
            event.preventDefault();

            const text = event.clipboardData
                .getData("text/plain")
                .replace(/\r?\n/g, " ");

            insertPlainText(text);
        });

        /*
         * Header는 Enter 방지
         */
        element.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();

                element.blur();
            }
        });
    }

    /* =====================================================
    PLAIN TEXT INSERT
    ===================================================== */

    function insertPlainText(text) {
        /*
         * Chromium / Edge
         */
        if (
            document.queryCommandSupported &&
            document.queryCommandSupported("insertText")
        ) {
            document.execCommand("insertText", false, text);

            return;
        }

        /*
         * fallback
         */
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0) {
            return;
        }

        const range = selection.getRangeAt(0);

        range.deleteContents();

        const textNode = document.createTextNode(text);

        range.insertNode(textNode);

        range.setStartAfter(textNode);

        range.collapse(true);

        selection.removeAllRanges();

        selection.addRange(range);
    }

    /* =====================================================
    TABLE SIZE
    ===================================================== */

    function collectDocumentFonts() {
        return Object.fromEntries(
            Array.from(
                document.querySelectorAll("[data-document-font]"),
                (input) => [input.dataset.documentFont, input.value],
            ),
        );
    }

    function updateDocumentFonts() {
        document.querySelectorAll("[data-document-font]").forEach((input) => {
            const size = Math.max(
                8,
                Math.min(32, Number(input.value) || Number(input.defaultValue)),
            );
            sheet.style.setProperty(
                `--cb-document-${input.dataset.documentFont}-font`,
                `${size}px`,
            );
            const output = document.querySelector(
                `[data-document-font-value="${input.dataset.documentFont}"]`,
            );
            if (output) output.textContent = `${size}px`;
        });
    }

    function restoreDocumentFonts(saved = {}) {
        document.querySelectorAll("[data-document-font]").forEach((input) => {
            input.value =
                saved?.[input.dataset.documentFont] || input.defaultValue;
        });
        updateDocumentFonts();
    }

    document.querySelectorAll("[data-document-font]").forEach((input) => {
        input.addEventListener("input", updateDocumentFonts);
    });

    function updateTableSizing() {
        updateDocumentFonts();
        const headerFont = Number(headerFontInput?.value || 13);

        const bodyFont = Number(bodyFontInput?.value || 12);

        const headerPadding = Number(headerPaddingInput?.value || 5);

        const rowHeight = Number(rowHeightInput?.value || 34);

        /*
         * CSS Variable 설정
         */
        sheet.style.setProperty("--cb-header-font", `${headerFont}px`);

        sheet.style.setProperty("--cb-body-font", `${bodyFont}px`);

        sheet.style.setProperty("--cb-header-padding", `${headerPadding}px`);

        sheet.style.setProperty("--cb-row-height", `${rowHeight}px`);

        /*
         * 표시 값
         */
        if (headerFontValue) {
            headerFontValue.textContent = `${headerFont}px`;
        }

        if (bodyFontValue) {
            bodyFontValue.textContent = `${bodyFont}px`;
        }

        if (headerPaddingValue) {
            headerPaddingValue.textContent = `${headerPadding}px`;
        }

        if (rowHeightValue) {
            rowHeightValue.textContent = `${rowHeight}px`;
        }
    }

    /* =====================================================
    CELL SELECT
    ===================================================== */

    function selectEditor(editor) {
        table
            .querySelectorAll(".cb-open-cell-editor.is-selected")
            .forEach((item) => {
                item.classList.remove("is-selected");
            });

        selectedEditor = editor;

        if (selectedEditor) {
            selectedEditor.classList.add("is-selected");
        }
    }

    /* =====================================================
    CREATE CELL
    ===================================================== */

    function createCellEditor(field) {
        const editor = document.createElement("div");

        editor.className = "cb-open-cell-editor";

        /*
         * Chromium / Edge
         */
        try {
            editor.contentEditable = "plaintext-only";
        } catch {
            editor.contentEditable = "true";
        }

        editor.spellcheck = false;

        editor.dataset.field = field;

        /*
         * 긴 문자열
         */
        if (field === "description" || field === "warning") {
            editor.classList.add("is-long-text");
        }

        /*
         * 셀 선택
         */
        editor.addEventListener("focus", () => {
            selectEditor(editor);
        });

        editor.addEventListener("mousedown", () => {
            selectEditor(editor);
        });

        if (field === "panel_loc" || field === "cb_loc") {
            editor.addEventListener("input", () => {
                const row = editor.closest("tr");
                if (row) updateAutomaticLocationMarks(row);
            });
        }

        editor.addEventListener("input", () => {
            refreshDuplicateRows();
        });

        /*
         * 일반 셀 붙여넣기
         */
        editor.addEventListener("paste", (event) => {
            const text = event.clipboardData.getData("text/plain");

            /*
             * TAB이 있으면
             * 전체 행 매핑 기능으로 넘김
             */
            if (text.includes("\t")) {
                return;
            }

            event.preventDefault();

            insertPlainText(text);
        });

        return editor;
    }

    /* =====================================================
    CREATE ROW
    ===================================================== */

    function createRow(number) {
        const row = document.createElement("tr");

        /* =====================================================
        NO
        - 클릭: 삭제할 행 선택/해제
        - 드래그: 행 이동
        ===================================================== */

        const noCell = document.createElement("td");

        noCell.className = "cb-open-number-cell";
        noCell.textContent = String(number);
        noCell.dataset.rowNumber = String(number);

        /*
         * 번호 자체를 드래그 핸들로 사용
         */
        noCell.dataset.rowDragHandle = "true";

        noCell.title = `${number}번 행 - 클릭하여 선택 / 위아래로 드래그하여 이동`;

        noCell.setAttribute("draggable", "false");

        /*
         * 클릭 → 삭제 대상 선택
         *
         * 실제 드래그가 끝난 직후 발생하는 click은 무시합니다.
         */
        noCell.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (row.dataset.justDragged === "true") {
                row.dataset.justDragged = "false";
                return;
            }

            row.classList.toggle("cb-open-row-selected");

            updateBulkSelectionState();
        });

        row.appendChild(noCell);

        /* =====================================================
        EDITABLE CELLS
        ===================================================== */

        TABLE_FIELDS.forEach((field) => {
            const td = document.createElement("td");

            const editor = createCellEditor(field);

            td.appendChild(editor);

            row.appendChild(td);
        });

        /* =====================================================
        ROW HEIGHT HANDLE
        ===================================================== */

        const lastCell = row.lastElementChild;

        if (lastCell) {
            const handle = document.createElement("span");

            handle.className = "cb-open-row-resizer";

            lastCell.appendChild(handle);

            bindRowResize(row, handle);
        }

        return row;
    }

    function initRowDrag() {
        let draggedRow = null;
        let pointerId = null;
        let startY = 0;
        let dragging = false;

        const DRAG_THRESHOLD = 5;

        /* =====================================================
        POINTER DOWN
        ===================================================== */

        tableBody.addEventListener("pointerdown", (event) => {
            const handle = event.target.closest(
                '[data-row-drag-handle="true"]',
            );

            if (!handle) {
                return;
            }

            const row = handle.closest("tr");

            if (!row) {
                return;
            }

            /*
             * 마우스 왼쪽 버튼만
             */
            if (event.pointerType === "mouse" && event.button !== 0) {
                return;
            }

            /*
             * =============================================
             * 세로 병합이 있는 경우에만 이동 금지
             *
             * 가로 병합:
             * PANEL ~ DESCRIPTION
             * → 행 이동 가능
             *
             * 세로 병합:
             * 여러 행 연결
             * → 행 하나만 이동하면 병합이 깨질 수 있음
             * =============================================
             */
            const hasVerticalMerge = grid
                .merges()
                .some((merge) => merge.rows > 1);

            if (hasVerticalMerge) {
                event.preventDefault();
                event.stopPropagation();

                void window.AppDialog.alert(
                    "여러 행에 걸친 세로 병합이 있어 행을 이동할 수 없습니다.\n세로 병합을 해제한 후 다시 시도해 주세요.",
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

            try {
                handle.setPointerCapture(event.pointerId);
            } catch (_error) {
                // Pointer Capture 미지원 브라우저
            }
        });

        /* =====================================================
        POINTER MOVE
        ===================================================== */

        tableBody.addEventListener("pointermove", (event) => {
            if (!draggedRow || event.pointerId !== pointerId) {
                return;
            }

            const distance = Math.abs(event.clientY - startY);

            /*
             * 클릭과 드래그 구분
             */
            if (!dragging && distance < DRAG_THRESHOLD) {
                return;
            }

            /*
             * 실제 이동 시작
             */
            if (!dragging) {
                dragging = true;

                draggedRow.classList.add("cb-open-row-dragging");

                document.body.classList.add("cb-row-drag-active");
            }

            event.preventDefault();

            /*
             * 현재 마우스 아래 행
             */
            const target = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest("#cbOpenListBody > tr");

            if (!target || target === draggedRow) {
                return;
            }

            const rect = target.getBoundingClientRect();

            const after = event.clientY > rect.top + rect.height / 2;

            /*
             * 대상 아래쪽으로 이동
             */
            if (after) {
                if (target.nextSibling !== draggedRow) {
                    rowsBodyInsertAfter(draggedRow, target);
                }
            } else {
                /*
                 * 대상 위쪽으로 이동
                 */
                if (target !== draggedRow.nextSibling) {
                    tableBody.insertBefore(draggedRow, target);
                }
            }
        });

        /* =====================================================
        DRAG FINISH
        ===================================================== */

        const finishDrag = (event) => {
            if (!draggedRow) {
                return;
            }

            if (event && pointerId !== null && event.pointerId !== pointerId) {
                return;
            }

            if (dragging) {
                draggedRow.classList.remove("cb-open-row-dragging");

                draggedRow.dataset.justDragged = "true";

                document.body.classList.remove("cb-row-drag-active");

                updateRowNumbers();

                refreshAutomaticLocationMarks();

                rebuildRowFilter();

                updateTableSizing();

                scheduleSheetScale();

                saveWorkspace();

                showSaveMessage("행 순서를 변경했습니다.");
            }

            draggedRow = null;

            pointerId = null;

            dragging = false;
        };

        tableBody.addEventListener("pointerup", finishDrag);

        tableBody.addEventListener("pointercancel", finishDrag);

        /*
         * insertAfter helper
         */
        function rowsBodyInsertAfter(row, target) {
            tableBody.insertBefore(row, target.nextSibling);
        }
    }

    /* =====================================================
    ROW BULK SELECTION
    ===================================================== */

    function selectedRows() {
        return Array.from(
            tableBody.querySelectorAll("tr.cb-open-row-selected"),
        );
    }

    function updateBulkSelectionState() {
        if (!deleteSelectedButton) {
            return;
        }

        const count = selectedRows().length;

        deleteSelectedButton.disabled = count === 0;

        deleteSelectedButton.innerHTML = count
            ? `<i class="bi bi-trash3"></i> 선택 삭제 (${count})`
            : '<i class="bi bi-trash3"></i> 선택 삭제';
    }

    /* =====================================================
    ROW MANAGEMENT
    ===================================================== */

    function ensureRows(count) {
        while (tableBody.children.length < count) {
            const number = tableBody.children.length + 1;

            tableBody.appendChild(createRow(number));
        }

        updateRowNumbers();
    }

    function updateRowNumbers() {
        Array.from(tableBody.children).forEach((row, index) => {
            const numberCell = row.querySelector(".cb-open-number-cell");

            if (!numberCell) {
                return;
            }

            const number = index + 1;

            numberCell.textContent = String(number);

            numberCell.dataset.rowNumber = String(number);

            numberCell.title = `${number}번 행 - 클릭하여 선택 / 위아래로 드래그하여 이동`;
        });
    }

    function clearTable() {
        tableBody.innerHTML = "";

        selectedEditor = null;

        ensureRows(DEFAULT_ROWS);
    }

    function updateAutomaticLocationMarks(row) {
        if (row.dataset.manualLocationMarks === "true") return;
        const panelValue = cleanText(
            row.querySelector('[data-field="panel_loc"]')?.innerText,
        ).toUpperCase();
        const cbLocValue = cleanText(
            row.querySelector('[data-field="cb_loc"]')?.innerText,
        ).toUpperCase();
        const aircraft = cleanText(aircraftModelSelect?.value).toUpperCase();
        const cockpit = row.querySelector('[data-field="cockpit"]');
        const ee = row.querySelector('[data-field="ee"]');
        const etc = row.querySelector('[data-field="etc"]');
        const isSSPC = cbLocValue.includes("SSPC");
        const isA350OrA380 = aircraft === "A350" || aircraft === "A380";
        const isBoeing = aircraft.startsWith("B");

        if (isBoeing) {
            if (cockpit) cockpit.textContent = panelValue === "P11" ? "V" : "";
            if (ee)
                ee.textContent = panelValue && panelValue !== "P11" ? "V" : "";
            if (etc) etc.textContent = "";
        } else {
            if (cockpit) cockpit.textContent = "";
            if (etc) etc.textContent = isSSPC ? "V" : "";
            if (ee) {
                ee.textContent =
                    isA350OrA380 && cbLocValue && !isSSPC ? "V" : "";
            }
        }
    }

    function refreshAutomaticLocationMarks() {
        Array.from(tableBody.children).forEach(updateAutomaticLocationMarks);
    }

    function rowHasData(row) {
        return Array.from(row.querySelectorAll(".cb-open-cell-editor")).some(
            (editor) => cleanText(editor.innerText) !== "",
        );
    }

    function importedRows() {
        return Array.from(tableBody.children).filter(
            (row) => row.dataset.filterLabel,
        );
    }

    function setImportedRowIncluded(row, included) {
        const rowIndex = Array.from(tableBody.children).indexOf(row);
        const linkedIndexes = new Set([rowIndex]);
        grid.merges()
            .filter(
                (merge) =>
                    merge.rows > 1 &&
                    rowIndex >= merge.r &&
                    rowIndex < merge.r + merge.rows,
            )
            .forEach((merge) => {
                for (
                    let index = merge.r;
                    index < merge.r + merge.rows;
                    index += 1
                )
                    linkedIndexes.add(index);
            });
        linkedIndexes.forEach((index) => {
            const linkedRow = tableBody.children[index];
            if (!linkedRow?.dataset.filterLabel) return;
            linkedRow.dataset.printIncluded = String(included);
            linkedRow.classList.toggle("cb-open-row-excluded", !included);
        });
    }

    function persistFilterState() {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(collectWorkspaceData()),
            );
        } catch (error) {
            console.warn("C/B 항목 필터 저장 실패", error);
        }
    }

    function rowSearchText(row) {
        return Array.from(row.querySelectorAll(".cb-open-cell-editor"))
            .map((editor) => cleanText(editor.innerText))
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
    }

    function isSectionHeading(row) {
        const rowIndex = Array.from(tableBody.children).indexOf(row);
        return grid
            .merges()
            .some((merge) => merge.r === rowIndex && merge.cols > 1);
    }

    function isForFinSectionHeading(row) {
        return (
            isSectionHeading(row) &&
            /(?:^|\s)FOR\s+FIN\b/i.test(rowSearchText(row))
        );
    }

    function commonRowIndexes(rows) {
        const firstSection = rows.findIndex(isForFinSectionHeading);
        if (firstSection <= 0) return new Set();
        return new Set(
            Array.from({ length: firstSection }, (_value, index) => index),
        );
    }

    function keywordMatches(rows, keyword) {
        const matches = new Set();
        rows.forEach((row, index) => {
            if (!rowSearchText(row).includes(keyword)) return;
            matches.add(index);
            if (!isForFinSectionHeading(row)) return;
            for (let next = index + 1; next < rows.length; next += 1) {
                if (isForFinSectionHeading(rows[next])) break;
                matches.add(next);
            }
        });
        return matches;
    }

    function applyAdvancedRowFilter() {
        const rows = importedRows();
        if (!rows.length) return;
        const from = Number.parseInt(rowFilterFrom?.value || "", 10);
        const to = Number.parseInt(rowFilterTo?.value || "", 10);
        const hasRange = Number.isFinite(from) || Number.isFinite(to);
        const rangeMatches = new Set();
        if (hasRange) {
            const first = Number.isFinite(from) ? Math.max(1, from) : 1;
            const last = Number.isFinite(to)
                ? Math.max(first, to)
                : rows.length;
            rows.forEach((_row, index) => {
                const number = index + 1;
                if (number >= first && number <= last) rangeMatches.add(index);
            });
        }
        const keywords = cleanText(rowFilterSearch?.value || "")
            .split(/[,\n]+/)
            .map((value) => cleanText(value).toLowerCase())
            .filter(Boolean);
        const conditions = [];
        if (hasRange) conditions.push(rangeMatches);
        keywords.forEach((keyword) =>
            conditions.push(keywordMatches(rows, keyword)),
        );
        const useAnd = rowFilterLogic?.value !== "or";
        const commonMatches = commonRowIndexes(rows);
        rows.forEach((row, index) => {
            const included =
                conditions.length === 0 ||
                commonMatches.has(index) ||
                (useAnd
                    ? conditions.every((matches) => matches.has(index))
                    : conditions.some((matches) => matches.has(index)));
            setImportedRowIncluded(row, included);
        });
        rebuildRowFilter();
        persistFilterState();
    }

    function updateRowFilterStatus() {
        if (!rowFilterStatus) return;
        const rows = importedRows();
        const selected = rows.filter(
            (row) => row.dataset.printIncluded !== "false",
        ).length;
        rowFilterStatus.textContent = `${rows.length}개 중 ${selected}개 항목이 문서와 인쇄에 표시됩니다.`;
    }

    function getRowFilterPanel() {
        if (!rowFilter || typeof bootstrap === "undefined") return null;
        return bootstrap.Offcanvas.getOrCreateInstance(rowFilter, {
            scroll: true,
            backdrop: false,
        });
    }

    function setRowFilterPanelVisible(visible) {
        const hasRows = importedRows().length > 0;
        rowFilterPanelVisible = Boolean(visible && hasRows);
        const panel = getRowFilterPanel();
        if (rowFilterPanelVisible) {
            rowFilter?.removeAttribute("hidden");
            if (panel) panel.show();
            else rowFilter?.classList.add("show");
        } else {
            if (panel) panel.hide();
            else {
                rowFilter?.classList.remove("show");
                if (rowFilter) rowFilter.hidden = true;
            }
        }
        if (rowFilterPanelToggle) {
            rowFilterPanelToggle.disabled = !hasRows;

            rowFilterPanelToggle.setAttribute(
                "aria-pressed",
                String(rowFilterPanelVisible),
            );

            // const label = rowFilterPanelToggle.querySelector("span");

            // if (label) {
            //     label.textContent = rowFilterPanelVisible
            //         ? " 문서 항목 필터 숨기기"
            //         : " 문서 항목 필터 표시";
            // }

            // const icon = rowFilterPanelToggle.querySelector("i");

            // if (icon) {
            //     icon.className = rowFilterPanelVisible
            //         ? "bi bi-eye-slash"
            //         : "bi bi-funnel";
            // }
        }
    }

    function rebuildRowFilter() {
        if (!rowFilter || !rowFilterList) return;
        const rows = importedRows();
        if (!rows.length) rowFilterPanelVisible = false;
        setRowFilterPanelVisible(rowFilterPanelVisible);
        rowFilterList.replaceChildren();
        rows.forEach((row, index) => {
            const label = document.createElement("label");
            label.className = "cb-open-row-filter-item";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = row.dataset.printIncluded !== "false";
            checkbox.dataset.filterIndex = String(index);
            const text = document.createElement("span");
            text.textContent = row.dataset.filterLabel;
            checkbox.addEventListener("change", () => {
                setImportedRowIncluded(row, checkbox.checked);
                rebuildRowFilter();
                persistFilterState();
            });
            label.append(checkbox, text);
            rowFilterList.appendChild(label);
        });
        updateRowFilterStatus();
    }

    function setAllImportedRows(included) {
        importedRows().forEach((row) => setImportedRowIncluded(row, included));
        rebuildRowFilter();
        persistFilterState();
    }

    async function deleteSelectedRows() {
        const rows = selectedRows();

        if (!rows.length) {
            return;
        }

        /*
         * 전체 행 삭제 시 최소 1행은 다시 생성합니다.
         */
        const confirmed = await window.AppDialog.confirm(
            `${rows.length}개의 선택한 행을 삭제하시겠습니까?`,
            {
                title: "선택 행 삭제",
                variant: "danger",
                confirmText: "삭제",
                cancelText: "취소",
            },
        );

        if (!confirmed) {
            return;
        }

        /*
         * 아래쪽 행부터 삭제
         *
         * 병합 및 행 번호 위치가 변경되므로
         * 역순 삭제가 안전합니다.
         */
        const orderedRows = rows
            .map((row) => ({
                row,
                index: Array.from(tableBody.children).indexOf(row),
            }))
            .sort((a, b) => b.index - a.index);

        orderedRows.forEach(({ row }) => {
            if (selectedEditor && row.contains(selectedEditor)) {
                selectedEditor = null;
            }

            grid.removeRow(row);
        });

        /*
         * 최소 한 행 유지
         */
        if (!tableBody.children.length) {
            ensureRows(1);
        }

        updateRowNumbers();

        refreshAutomaticLocationMarks();

        updateTableSizing();

        scheduleSheetScale();

        rebuildRowFilter();

        saveWorkspace();

        updateBulkSelectionState();

        showSaveMessage(`${rows.length}개의 행을 삭제했습니다.`);
    }

    /*
     * =============================================
     * 다음 붙여넣기 시작 행
     * =============================================
     *
     * 기존 데이터가 있는 마지막 행을 찾고
     * 그 다음 행부터 붙여넣습니다.
     */
    function getNextPasteRowIndex() {
        const rows = Array.from(tableBody.querySelectorAll("tr"));

        let lastUsedRowIndex = -1;

        rows.forEach((row, index) => {
            const editors = Array.from(
                row.querySelectorAll(".cb-open-cell-editor"),
            );

            const hasData = editors.some(
                (editor) => cleanText(editor.innerText) !== "",
            );

            if (hasData) {
                lastUsedRowIndex = index;
            }
        });

        return lastUsedRowIndex + 1;
    }

    function getPasteTargetRow() {
        const row = selectedEditor?.closest("tr");

        return row && tableBody.contains(row) ? row : null;
    }

    /* =====================================================
    ROW RESIZE
    ===================================================== */

    function bindRowResize(row, handle) {
        handle.addEventListener("pointerdown", (event) => {
            event.preventDefault();

            event.stopPropagation();

            const startY = event.clientY;

            const startHeight = row.getBoundingClientRect().height;

            handle.setPointerCapture(event.pointerId);

            const move = (moveEvent) => {
                const difference = moveEvent.clientY - startY;

                const nextHeight = Math.max(22, startHeight + difference);

                row.style.height = `${nextHeight}px`;
            };

            const finish = () => {
                handle.removeEventListener("pointermove", move);

                handle.removeEventListener("pointerup", finish);

                handle.removeEventListener("pointercancel", finish);
            };

            handle.addEventListener("pointermove", move);

            handle.addEventListener("pointerup", finish);

            handle.addEventListener("pointercancel", finish);
        });
    }

    /* =====================================================
    COLUMN RESIZE
    ===================================================== */

    function initColumnResize() {
        const handles = table.querySelectorAll(".cb-open-col-resizer");

        handles.forEach((handle) => {
            handle.addEventListener("pointerdown", (event) => {
                event.preventDefault();

                event.stopPropagation();

                const th = handle.closest("th[data-col-key]");

                if (!th) {
                    return;
                }

                const key = th.dataset.colKey;

                const startX = event.clientX;

                const startWidth = getColumnWidth(key);

                handle.setPointerCapture(event.pointerId);

                document.body.classList.add("cb-open-column-resizing");

                const move = (moveEvent) => {
                    const next = startWidth + moveEvent.clientX - startX;

                    setColumnWidth(key, next);
                };

                const finish = () => {
                    document.body.classList.remove("cb-open-column-resizing");

                    handle.removeEventListener("pointermove", move);

                    handle.removeEventListener("pointerup", finish);

                    handle.removeEventListener("pointercancel", finish);
                };

                handle.addEventListener("pointermove", move);

                handle.addEventListener("pointerup", finish);

                handle.addEventListener("pointercancel", finish);
            });
        });
    }

    /* =====================================================
    SET CELL VALUE
    ===================================================== */

    function setCellValue(row, field, value) {
        const editor = row.querySelector(`[data-field="${field}"]`);

        if (!editor) {
            return;
        }

        editor.textContent = cleanText(value);

        editor.classList.add("is-pasted");

        setTimeout(() => {
            editor.classList.remove("is-pasted");
        }, 300);
    }

    /* =====================================================
    CLIPBOARD AUTO MAP
    ===================================================== */

    function applyClipboardText(
        rawText,
        startRow = 0,
        format = "auto",
        targetRow = null,
    ) {
        let records;
        try {
            records = window.parseCBClipboard(rawText, format);
        } catch (error) {
            alert(error.message);
            return;
        }

        return applyCBRecords(records, startRow, targetRow);
    }

    function applyCBRecords(records, startRow, targetRow = null) {
        if (!records.length) {
            return 0;
        }

        const targetIndex = targetRow
            ? Array.from(tableBody.children).indexOf(targetRow)
            : -1;

        if (targetRow) {
            if (rowHasData(targetRow)) {
                grid.insertRows(targetIndex, records.length);
            } else if (records.length > 1) {
                grid.insertRows(targetIndex + 1, records.length - 1);
            }
        } else {
            /*
             * 붙여넣을 데이터보다
             * 현재 행이 부족하면 자동 생성
             */
            ensureRows(startRow + records.length);
        }

        records.forEach((record, lineIndex) => {
            const row = tableBody.children[startRow + lineIndex];

            if (!row) {
                return;
            }

            PASTE_TARGETS.forEach((field) => {
                setCellValue(row, field, record[field] || "");
            });
            if (Object.hasOwn(record, "warning")) {
                setCellValue(row, "warning", record.warning || "");
            }
            const locationFields = ["cockpit", "ee", "etc"];
            const hasLocationMarks = locationFields.some((field) =>
                Object.hasOwn(record, field),
            );
            row.dataset.manualLocationMarks = String(hasLocationMarks);
            if (hasLocationMarks) {
                locationFields.forEach((field) =>
                    setCellValue(row, field, record[field] || ""),
                );
            }
            updateAutomaticLocationMarks(row);

            const summary = [record.panel_loc, record.fin, record.description]
                .map(cleanText)
                .filter(Boolean)
                .join(" · ");

            row.dataset.filterLabel =
                summary || `${startRow + lineIndex + 1}번 항목`;

            row.dataset.printIncluded = "true";

            row.classList.remove("cb-open-row-excluded");
        });
        grid.importRows(records, startRow);

        updateRowNumbers();
        updateTableSizing();
        scheduleSheetScale();
        rebuildRowFilter();
        return records.length;
    }

    /* =====================================================
    SELECTED CELL FONT
    ===================================================== */

    function changeSelectedFont(amount) {
        if (!selectedEditor) {
            alert("먼저 표에서 수정할 셀을 선택하세요.");

            return;
        }

        const current =
            Number.parseFloat(getComputedStyle(selectedEditor).fontSize) || 10;

        const next = Math.max(7, Math.min(24, current + amount));

        selectedEditor.style.fontSize = `${next}px`;
    }

    function resetSelectedFont() {
        if (!selectedEditor) {
            alert("먼저 표에서 수정할 셀을 선택하세요.");

            return;
        }

        selectedEditor.style.removeProperty("font-size");
    }

    function resetSelectedRowHeight() {
        if (!selectedEditor) {
            alert("먼저 표에서 수정할 셀을 선택하세요.");

            return;
        }

        const row = selectedEditor.closest("tr");

        if (row) {
            row.style.removeProperty("height");
        }
    }

    /* =====================================================
       COLUMN INPUT
       ===================================================== */

    function initColumnInputs() {
        columnInputs.forEach((input) => {
            const key = input.dataset.colWidthInput;

            input.addEventListener("input", () => {
                setColumnWidth(key, Number(input.value));
            });
        });
    }

    /* =====================================================
       A4 AUTO FIT
       ===================================================== */

    function fitTableToA4() {
        const keys = Object.keys(DEFAULT_COLUMN_WIDTHS);

        const totalWidth = keys.reduce((sum, key) => {
            return sum + getColumnWidth(key);
        }, 0);

        /*
         * A4 landscape 기준
         */
        const targetWidth = 1000;

        if (totalWidth <= targetWidth) {
            return;
        }

        const ratio = targetWidth / totalWidth;

        keys.forEach((key) => {
            const current = getColumnWidth(key);

            setColumnWidth(key, current * ratio, false);
        });
    }

    function scaleSheetToViewport() {
        const stage = sheet.closest(".cb-open-sheet-stage");
        if (!stage) return;
        const stageStyle = window.getComputedStyle(stage);
        const stageRect = stage.getBoundingClientRect();
        const horizontalPadding =
            Number.parseFloat(stageStyle.paddingLeft) +
            Number.parseFloat(stageStyle.paddingRight);
        const viewportInset = Math.max(0, stageRect.left) * 2;
        const viewportWidth = Math.max(
            1,
            document.documentElement.clientWidth -
                viewportInset -
                horizontalPadding,
        );
        const availableWidth = Math.max(
            1,
            Math.min(stageRect.width - horizontalPadding, viewportWidth),
        );
        const naturalWidth = sheet.offsetWidth;
        const scale = Math.min(1, availableWidth / naturalWidth);
        sheet.style.zoom = String(scale);
    }

    function scheduleSheetScale() {
        if (printMode) return;
        window.cancelAnimationFrame(sheetScaleFrame);
        sheetScaleFrame = window.requestAnimationFrame(scaleSheetToViewport);
    }

    function removePrintPageFurniture() {
        document.querySelector(".cb-print-pages")?.remove();
    }

    function withPrintLayout(callback) {
        // beforeprint can fire before print media becomes active. Apply the same
        // rules synchronously while measuring, so hidden pages never measure 0px.
        const measurementStyle = document.createElement("style");
        const printRules = [];
        for (const stylesheet of document.styleSheets) {
            if (!stylesheet.href?.includes("/css/bookmarks/cb_open_list"))
                continue;
            for (const rule of stylesheet.cssRules) {
                if (
                    rule.type === CSSRule.MEDIA_RULE &&
                    rule.conditionText === "print"
                ) {
                    printRules.push(
                        ...Array.from(rule.cssRules, (child) => child.cssText),
                    );
                }
            }
        }
        measurementStyle.textContent = printRules.join("\n");
        document.head.appendChild(measurementStyle);
        try {
            callback();
        } finally {
            measurementStyle.remove();
        }
    }

    function createPrintPageFurniture() {
        removePrintPageFurniture();
        const sourceHeader = sheet.querySelector(".cb-open-sheet-header");
        const sourceFooter = sheet.querySelector(".cb-open-sheet-footer");
        if (!sourceHeader || !sourceFooter) return;
        const rowsPerPage = 16;
        const allRows = Array.from(tableBody.children);
        const includedEntries = allRows
            .map((row, originalIndex) => ({ row, originalIndex }))
            .filter(({ row }) => row.dataset.printIncluded !== "false");
        const originalToPrint = new Map(
            includedEntries.map(({ originalIndex }, index) => [
                originalIndex,
                index,
            ]),
        );
        const mergeRanges = grid
            .merges()
            .filter((merge) => {
                for (
                    let index = merge.r;
                    index < merge.r + merge.rows;
                    index += 1
                ) {
                    if (!originalToPrint.has(index)) return false;
                }
                return true;
            })
            .map((merge) => ({ ...merge, r: originalToPrint.get(merge.r) }));
        // Trailing form blanks must not create additional printed pages.
        // Interior blanks retain their position between actual records.
        let usedEnd = includedEntries.length;
        while (usedEnd && !rowHasData(includedEntries[usedEnd - 1].row))
            usedEnd -= 1;
        for (let i = 0; i < usedEnd; i++) {
            mergeRanges
                .filter((m) => m.r === i)
                .forEach((m) => {
                    usedEnd = Math.max(usedEnd, m.r + m.rows);
                });
        }
        const sourceRows = includedEntries
            .slice(0, usedEnd)
            .map(({ row }) => row);
        const pages = document.createElement("div");
        pages.className = "cb-print-pages";
        document.body.appendChild(pages);
        const customProperties = [
            "--cb-document-aircraft-font",
            "--cb-document-title-font",
            "--cb-document-model-font",
            "--cb-document-issue-font",
            "--cb-document-company-font",
            "--cb-document-number-font",
            "--cb-header-font",
            "--cb-body-font",
            "--cb-header-padding",
            "--cb-row-height",
        ];

        let sourceIndex = 0;
        do {
            const page = document.createElement("section");
            page.className = "cb-print-page";
            customProperties.forEach((property) => {
                page.style.setProperty(
                    property,
                    getComputedStyle(sheet).getPropertyValue(property),
                );
            });
            const header = sourceHeader.cloneNode(true);
            const printTable = table.cloneNode(true);
            printTable.removeAttribute("id");
            const printBody = printTable.querySelector("tbody");
            const footer = sourceFooter.cloneNode(true);
            printBody.replaceChildren();

            const pageNumber = document.createElement("span");
            pageNumber.className = "cb-print-page-number";
            pageNumber.innerHTML = "&nbsp;";
            (
                footer.querySelector(".cb-open-footer-right") || footer
            ).appendChild(pageNumber);

            [header, printTable, footer].forEach((element) => {
                element
                    .querySelectorAll("[id]")
                    .forEach((child) => child.removeAttribute("id"));
                element
                    .querySelectorAll("[contenteditable]")
                    .forEach((child) =>
                        child.removeAttribute("contenteditable"),
                    );
                element
                    .querySelectorAll(
                        ".cb-open-col-resizer, .cb-open-row-resizer",
                    )
                    .forEach((child) => child.remove());
            });
            page.append(header, printTable, footer);
            pages.appendChild(page);
            // Measure at the actual print width, reserving both document headers.
            const availableTableHeight = () =>
                page.getBoundingClientRect().height -
                header.getBoundingClientRect().height -
                parseFloat(getComputedStyle(header).marginBottom || 0) -
                footer.getBoundingClientRect().height -
                2;
            const fits = () =>
                printTable.getBoundingClientRect().height <=
                availableTableHeight();
            const appendRow = (row) => {
                row.querySelectorAll("[id]").forEach((child) =>
                    child.removeAttribute("id"),
                );
                row.querySelectorAll("[contenteditable]").forEach((child) =>
                    child.removeAttribute("contenteditable"),
                );
                row.querySelectorAll(
                    ".cb-open-col-resizer, .cb-open-row-resizer",
                ).forEach((child) => child.remove());
                const numberCell = row.querySelector(".cb-open-number-cell");
                if (numberCell)
                    numberCell.textContent = String(
                        printBody.children.length + 1,
                    );
                printBody.appendChild(row);
            };
            while (
                sourceIndex < sourceRows.length &&
                printBody.children.length < rowsPerPage
            ) {
                // Keep vertically merged rows together so no continuation loses
                // its anchor cell or shifts into the wrong column.
                let groupEnd = sourceIndex + 1;
                for (let i = sourceIndex; i < groupEnd; i++) {
                    mergeRanges
                        .filter((m) => m.r === i)
                        .forEach((m) => {
                            groupEnd = Math.max(groupEnd, m.r + m.rows);
                        });
                }
                const previousCount = printBody.children.length;
                if (
                    previousCount &&
                    previousCount + groupEnd - sourceIndex > rowsPerPage
                )
                    break;
                const group = sourceRows
                    .slice(sourceIndex, groupEnd)
                    .map((row) => row.cloneNode(true));
                group.forEach(appendRow);
                if (!fits() && previousCount) {
                    group.forEach((row) => row.remove());
                    break;
                }
                sourceIndex = groupEnd;
                if (!fits()) {
                    // An individual oversized row gets its own page, scaled to fit.
                    const available = availableTableHeight();
                    const actual = printTable.getBoundingClientRect().height;
                    if (available > 0 && actual > 0) {
                        printTable.style.zoom = String(
                            Math.min(1, available / actual),
                        );
                    }
                    break;
                }
            }
            // Keep the 16-row form when space permits; never push the footer out.
            if (!printTable.style.zoom) {
                while (printBody.children.length < rowsPerPage) {
                    const blank = createRow(printBody.children.length + 1);
                    appendRow(blank);
                    if (!fits()) {
                        blank.remove();
                        break;
                    }
                }
            }
        } while (sourceIndex < sourceRows.length);

        const printedPages = Array.from(
            pages.querySelectorAll(".cb-print-page"),
        );
        if (printedPages.length > 1) {
            printedPages.forEach((page, index) => {
                const pageNumber = page.querySelector(".cb-print-page-number");
                pageNumber.textContent = `${index + 1} / ${printedPages.length}`;
                pageNumber.setAttribute(
                    "aria-label",
                    `${printedPages.length}페이지 중 ${index + 1}페이지`,
                );
            });
        } else {
            printedPages[0]?.querySelector(".cb-print-page-number")?.remove();
        }
    }

    /* =====================================================
       PREVIEW
       ===================================================== */

    function setPreviewMode(enabled) {
        previewMode = enabled;

        document.body.classList.toggle("cb-open-preview-mode", enabled);

        if (previewButton) {
            previewButton.classList.toggle("is-active", enabled);

            const text = previewButton.querySelector("span");

            if (text) {
                text.textContent = enabled ? "미리보기 해제" : "A4 미리보기";
            }
        }

        if (enabled) {
            fitTableToA4();
            scheduleSheetScale();
        } else {
            scheduleSheetScale();
        }
    }

    /* =====================================================
       SETTINGS OFFCANVAS
       ===================================================== */

    function getSettingsPanel() {
        const element = document.getElementById("cbOpenSettingsPanel");

        if (!element || typeof bootstrap === "undefined") {
            return null;
        }

        return bootstrap.Offcanvas.getOrCreateInstance(element);
    }

    function openSettings() {
        const panel = getSettingsPanel();

        if (panel) {
            panel.show();
        }
    }

    function closeSettings() {
        const panel = getSettingsPanel();

        if (panel) {
            panel.hide();
        }
    }

    /* =====================================================
    COLLECT WORKSPACE DATA
    ===================================================== */

    function collectWorkspaceData() {
        /*
         * =========================================
         * ROW DATA
         * =========================================
         */

        const rows = Array.from(tableBody.querySelectorAll("tr")).map((row) => {
            const cells = {};

            row.querySelectorAll(".cb-open-cell-editor").forEach((editor) => {
                const field = editor.dataset.field;

                if (!field) {
                    return;
                }

                cells[field] = {
                    text: editor.innerText || "",

                    fontSize: editor.style.fontSize || "",
                };
            });

            return {
                height: row.style.height || "",
                manualLocationMarks: row.dataset.manualLocationMarks === "true",
                filterLabel: row.dataset.filterLabel || "",
                printIncluded: row.dataset.printIncluded !== "false",
                _merges: grid.exportRow(row),

                cells: cells,
            };
        });

        /*
         * =========================================
         * COLUMN WIDTH
         * =========================================
         */

        const columnWidths = {};

        Object.keys(DEFAULT_COLUMN_WIDTHS).forEach((key) => {
            columnWidths[key] = getColumnWidth(key);
        });

        /*
         * =========================================
         * 전체 workspace 데이터
         * =========================================
         */

        return {
            version: 2,
            documentFonts: collectDocumentFonts(),

            document: {
                aircraft: aircraftModelSelect?.value || "",

                gibun: gibunInput?.value || "",

                title: headerTitleInput?.value || "",
            },

            footer: {
                issueDate: issueDateInput?.value || DEFAULT_ISSUE_DATE,

                company: companyNameInput?.value || DEFAULT_COMPANY_NAME,

                documentNumber:
                    documentNumberInput?.value || DEFAULT_DOCUMENT_NUMBER,
            },

            tableSettings: {
                headerFont: headerFontInput?.value || "13",

                bodyFont: bodyFontInput?.value || "12",

                headerPadding: headerPaddingInput?.value || "5",

                rowHeight: rowHeightInput?.value || "34",
            },

            columnWidths: columnWidths,

            rows: rows,

            savedAt: new Date().toISOString(),
        };
    }

    /* =====================================================
       SAVE SETTINGS ONLY
       ===================================================== */

    function saveSettingsOnly() {
        try {
            /*
             * 기존 전체 저장값을 불러옵니다.
             *
             * 설정 저장을 눌렀다고 해서
             * 기존 표 내용 / 기종 / 기번 등을
             * 삭제하면 안 됩니다.
             */
            const raw = localStorage.getItem(STORAGE_KEY);

            let currentData = {};

            if (raw) {
                try {
                    currentData = JSON.parse(raw) || {};
                } catch (parseError) {
                    console.warn(
                        "기존 저장 데이터를 읽지 못했습니다.",
                        parseError,
                    );

                    currentData = {};
                }
            }

            /*
             * =========================================
             * TABLE SETTINGS
             * =========================================
             */

            currentData.tableSettings = {
                headerFont: headerFontInput?.value || "13",

                bodyFont: bodyFontInput?.value || "12",

                headerPadding: headerPaddingInput?.value || "5",

                rowHeight: rowHeightInput?.value || "34",
            };

            /*
             * =========================================
             * FOOTER SETTINGS
             * =========================================
             */

            currentData.footer = {
                issueDate: issueDateInput?.value || DEFAULT_ISSUE_DATE,

                company: companyNameInput?.value || DEFAULT_COMPANY_NAME,

                documentNumber:
                    documentNumberInput?.value || DEFAULT_DOCUMENT_NUMBER,
            };

            /*
             * =========================================
             * COLUMN WIDTH
             * =========================================
             */

            const columnWidths = {};

            Object.keys(DEFAULT_COLUMN_WIDTHS).forEach((key) => {
                columnWidths[key] = getColumnWidth(key);
            });

            currentData.columnWidths = columnWidths;
            currentData.documentFonts = collectDocumentFonts();

            currentData.settingsSavedAt = new Date().toISOString();

            /*
             * =========================================
             * localStorage 저장
             * =========================================
             */

            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));

            return true;
        } catch (error) {
            console.error("C/B OPEN LIST 설정 저장 실패", error);

            alert("설정 저장 중 오류가 발생했습니다.");

            return false;
        }
    }

    /* =====================================================
    SAVE WORKSPACE
    ===================================================== */

    function saveWorkspace(showMessage = true) {
        /*
         * 전체 문서 저장은
         * 기종 / 기번 필수
         */
        if (!validateRequiredDocumentInfo()) {
            return false;
        }

        try {
            const data = collectWorkspaceData();

            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

            if (showMessage) {
                showSaveMessage("저장되었습니다.");
            }

            return true;
        } catch (error) {
            console.error("C/B OPEN LIST 저장 실패", error);

            alert("저장 중 오류가 발생했습니다.");

            return false;
        }
    }

    function saveDocument() {
        /*
         * 기종 / 기번 필수
         */
        if (!validateRequiredDocumentInfo()) {
            return false;
        }

        try {
            const data = collectWorkspaceData();

            /*
             * 사용자 저장 여부 표시
             */
            data.savedAt = new Date().toISOString();

            /*
             * 저장 문서 ID
             */
            data.id =
                data.id ||
                `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            /*
             * 기존 저장 문서 목록
             */
            let documents = [];

            try {
                documents = JSON.parse(
                    localStorage.getItem(SAVED_DOCUMENTS_KEY) || "[]",
                );

                if (!Array.isArray(documents)) {
                    documents = [];
                }
            } catch (_error) {
                documents = [];
            }

            /*
             * 같은 기종·기번이면 기존 문서를 덮어씁니다.
             * 이전 버전의 ID 기반 저장 데이터도 계속 수정할 수 있도록
             * 같은 ID 비교는 기종·기번 비교의 보조 조건으로 사용합니다.
             */
            const documentAircraft = cleanText(
                data.document?.aircraft,
            ).toUpperCase();
            const documentGibun = cleanText(data.document?.gibun);
            const existingIndex = documents.findIndex((item) => {
                const itemAircraft = cleanText(
                    item?.document?.aircraft,
                ).toUpperCase();
                const itemGibun = cleanText(item?.document?.gibun);

                return (
                    (itemAircraft === documentAircraft &&
                        itemGibun === documentGibun) ||
                    item.id === data.id
                );
            });

            if (existingIndex >= 0) {
                data.id = documents[existingIndex].id || data.id;
                documents[existingIndex] = data;
            } else {
                documents.unshift(data);
            }

            localStorage.setItem(
                SAVED_DOCUMENTS_KEY,
                JSON.stringify(documents),
            );

            /*
             * 현재 작업 상태도 같이 저장
             */
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

            showSaveMessage(
                existingIndex >= 0
                    ? "같은 기종·기번의 문서를 덮어써 저장했습니다."
                    : "C/B 문서를 저장했습니다.",
            );

            return true;
        } catch (error) {
            console.error("C/B 문서 저장 실패", error);

            alert("C/B 문서 저장 중 오류가 발생했습니다.");

            return false;
        }
    }

    function collectTemplateRows() {
        const templateFields = [
            "cockpit",
            "ee",
            "etc",
            "panel_loc",
            "cb_loc",
            "fin",
            "description",
            "warning",
        ];
        const rows = Array.from(tableBody.querySelectorAll("tr")).map((row) => {
            const record = {};
            templateFields.forEach((field) => {
                const editor = row.querySelector(`[data-field="${field}"]`);
                record[field] = cleanText(editor?.innerText || "");
            });
            const merges = grid.exportRow(row).filter((merge) => {
                const start = templateFields.indexOf(merge.field);
                return (
                    start >= 0 && start + merge.cols <= templateFields.length
                );
            });
            if (merges.length) record._merges = merges;
            record.__covered = Boolean(row.querySelector("td.cb-grid-covered"));
            return record;
        });

        while (rows.length) {
            const last = rows[rows.length - 1];
            const hasData = templateFields.some((field) => last[field]);
            if (hasData || last._merges?.length || last.__covered) break;
            rows.pop();
        }
        rows.forEach((row) => delete row.__covered);
        return rows;
    }

    function closeTemplateSaveDialog() {
        if (!templateSaveDialog) return;
        templateSaveDialog.hidden = true;
        document.body.classList.remove("cb-template-save-dialog-open");
        templateSaveButton?.focus();
    }

    function openTemplateSaveDialog() {
        const aircraft = cleanText(aircraftModelSelect?.value);
        if (!aircraft) {
            showSaveMessage("먼저 기종을 선택해 주세요.");
            aircraftModelSelect?.focus();
            return;
        }
        if (
            !collectTemplateRows().some((row) =>
                [
                    "cockpit",
                    "ee",
                    "etc",
                    "panel_loc",
                    "cb_loc",
                    "fin",
                    "description",
                    "warning",
                ].some((field) => row[field]),
            )
        ) {
            showSaveMessage("템플릿으로 저장할 표 데이터를 입력해 주세요.");
            return;
        }
        templateAircraftLabel.textContent = aircraft;
        templateSaveStatus.textContent = "";
        if (!templateNameInput.value.trim()) {
            const gibun = cleanText(gibunInput?.value);
            templateNameInput.value = gibun
                ? `${aircraft} HL${gibun}`
                : aircraft;
        }
        templateSaveDialog.hidden = false;
        document.body.classList.add("cb-template-save-dialog-open");
        window.setTimeout(() => templateNameInput.focus(), 0);
    }

    async function saveAsAircraftTemplate() {
        const templateName = cleanText(templateNameInput?.value);
        if (!templateName) {
            templateSaveStatus.textContent = "템플릿 이름을 입력해 주세요.";
            templateNameInput?.focus();
            return;
        }
        const rows = collectTemplateRows();
        templateSaveConfirm.disabled = true;
        templateSaveStatus.textContent = "템플릿을 저장하고 있습니다.";
        try {
            const csrfToken =
                templateSaveDialog.querySelector("[name=csrfmiddlewaretoken]")
                    ?.value || "";
            const response = await fetch(templateSaveButton.dataset.apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify({
                    aircraft_model: aircraftModelSelect.value,
                    name: templateName,
                    rows,
                }),
            });
            const data = await response.json();
            if (!response.ok || response.redirected) {
                throw new Error(data.error || "템플릿을 저장하지 못했습니다.");
            }
            const url = new URL(
                templateSaveButton.dataset.homeUrl,
                window.location.origin,
            );
            window.location.assign(url.toString());
        } catch (error) {
            templateSaveStatus.textContent = error.message;
            templateSaveConfirm.disabled = false;
        }
    }

    function loadManagedTemplate() {
        if (!managedTemplateData) return;
        aircraftModelSelect.value = managedTemplateData.aircraft_model || "";
        managedTemplateName.value = managedTemplateData.name || "";
        clearTable();
        if (
            Array.isArray(managedTemplateData.rows) &&
            managedTemplateData.rows.length
        ) {
            applyCBRecords(managedTemplateData.rows, 0);
        }
        updateHeader();
        rebuildRowFilter();
        scheduleSheetScale();
    }

    async function saveManagedTemplate() {
        if (!managedTemplateData || !managedTemplateUpdate) return;
        const aircraft = cleanText(aircraftModelSelect?.value);
        const name = cleanText(managedTemplateName?.value);
        const rows = collectTemplateRows();
        if (!aircraft || !name) {
            showSaveMessage("기종과 템플릿 이름을 입력해 주세요.");
            return;
        }
        if (
            !rows.some((row) =>
                [
                    "cockpit",
                    "ee",
                    "etc",
                    "panel_loc",
                    "cb_loc",
                    "fin",
                    "description",
                    "warning",
                ].some((field) => row[field]),
            )
        ) {
            showSaveMessage("저장할 템플릿 데이터를 입력해 주세요.");
            return;
        }
        const payload = { aircraft_model: aircraft, name, rows };
        if (managedTemplateData.id) {
            payload.id = Number(managedTemplateData.id);
            payload.original_aircraft_model =
                managedTemplateData.aircraft_model;
        }
        managedTemplateUpdate.disabled = true;
        try {
            const csrfToken =
                templateSaveDialog.querySelector("[name=csrfmiddlewaretoken]")
                    ?.value || "";
            const response = await fetch(managedTemplateUpdate.dataset.apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok || response.redirected) {
                throw new Error(data.error || "템플릿을 저장하지 못했습니다.");
            }
            managedTemplateData = {
                id: data.id,
                aircraft_model: aircraft,
                name,
                rows,
            };
            managedTemplateDelete.disabled = false;
            managedTemplateUpdate.querySelector("span").textContent =
                "수정 내용 저장";
            const url = new URL(
                managedTemplateConfig.dataset.manageUrl,
                window.location.origin,
            );
            url.searchParams.set("aircraft_model", aircraft);
            url.searchParams.set("template_id", data.id);
            window.history.replaceState({}, "", url);
            showSaveMessage(`${name} 템플릿을 저장했습니다.`);
        } catch (error) {
            showSaveMessage(error.message);
        } finally {
            managedTemplateUpdate.disabled = false;
        }
    }

    async function deleteManagedTemplate() {
        if (!managedTemplateData?.id || !managedTemplateDelete) return;
        const confirmed = await window.AppDialog.confirm(
            `${managedTemplateData.name} 템플릿을 삭제하시겠습니까?`,
            {
                title: "템플릿 삭제",
                variant: "danger",
                confirmText: "삭제",
                cancelText: "취소",
            },
        );
        if (!confirmed) return;
        managedTemplateDelete.disabled = true;
        try {
            const csrfToken =
                templateSaveDialog.querySelector("[name=csrfmiddlewaretoken]")
                    ?.value || "";
            const response = await fetch(managedTemplateUpdate.dataset.apiUrl, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify({
                    id: Number(managedTemplateData.id),
                    aircraft_model: managedTemplateData.aircraft_model,
                }),
            });
            const data = await response.json();
            if (!response.ok || response.redirected) {
                throw new Error(data.error || "템플릿을 삭제하지 못했습니다.");
            }
            window.location.assign(managedTemplateConfig.dataset.libraryUrl);
        } catch (error) {
            managedTemplateDelete.disabled = false;
            showSaveMessage(error.message);
        }
    }

    function applyWorkspaceData(data) {
        /*
         * =========================================
         * DOCUMENT
         * =========================================
         */

        if (data.document) {
            if (aircraftModelSelect && data.document.aircraft) {
                aircraftModelSelect.value = data.document.aircraft;
            }

            if (gibunInput) {
                gibunInput.value = data.document.gibun || "";
            }

            if (headerTitleInput) {
                headerTitleInput.value =
                    data.document.title || "CIRCUIT BREAKER OPEN LIST";
            }
        }

        if (issueDateInput) {
            issueDateInput.value = data.footer?.issueDate || DEFAULT_ISSUE_DATE;
        }

        if (companyNameInput) {
            companyNameInput.value =
                data.footer?.company || DEFAULT_COMPANY_NAME;
        }

        if (documentNumberInput) {
            documentNumberInput.value =
                data.footer?.documentNumber || DEFAULT_DOCUMENT_NUMBER;
        }

        restoreDocumentFonts(data.documentFonts);
        if (data.tableSettings) {
            if (headerFontInput) {
                headerFontInput.value = data.tableSettings.headerFont || "13";
            }

            if (bodyFontInput) {
                bodyFontInput.value = data.tableSettings.bodyFont || "12";
            }

            if (headerPaddingInput) {
                headerPaddingInput.value =
                    data.tableSettings.headerPadding || "5";
            }

            if (rowHeightInput) {
                rowHeightInput.value = data.tableSettings.rowHeight || "34";
            }
        }

        if (data.columnWidths) {
            Object.entries(data.columnWidths).forEach(([key, width]) => {
                setColumnWidth(key, Number(width), true);
            });
        }

        tableBody.innerHTML = "";

        selectedEditor = null;

        if (Array.isArray(data.rows) && data.rows.length > 0) {
            data.rows.forEach((savedRow, index) => {
                const row = createRow(index + 1);
                row.dataset.manualLocationMarks = String(
                    savedRow.manualLocationMarks === true,
                );
                if (savedRow.filterLabel) {
                    row.dataset.filterLabel = savedRow.filterLabel;
                    row.dataset.printIncluded = String(
                        savedRow.printIncluded !== false,
                    );
                    row.classList.toggle(
                        "cb-open-row-excluded",
                        savedRow.printIncluded === false,
                    );
                }

                if (savedRow.height) {
                    row.style.height = savedRow.height;
                }

                if (savedRow.cells) {
                    Object.entries(savedRow.cells).forEach(
                        ([field, cellData]) => {
                            const editor = row.querySelector(
                                `[data-field="${field}"]`,
                            );

                            if (!editor) {
                                return;
                            }

                            if (typeof cellData === "string") {
                                editor.innerText = cellData;

                                return;
                            }

                            editor.innerText = cellData.text || "";

                            if (cellData.fontSize) {
                                editor.style.fontSize = cellData.fontSize;
                            }
                        },
                    );
                }

                tableBody.appendChild(row);
            });
        } else {
            ensureRows(DEFAULT_ROWS);
        }

        grid.importRows(data.rows || []);
        updateRowNumbers();
        updateHeader();
        updateFooter();
        updateTableSizing();
        rebuildRowFilter();
        return true;
    }

    /* =====================================================
       RESTORE WORKSPACE
       ===================================================== */

    function restoreWorkspace() {
        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) {
            return false;
        }

        let data;

        try {
            data = JSON.parse(raw);
        } catch (error) {
            console.error("저장 데이터 읽기 실패", error);

            return false;
        }

        return applyWorkspaceData(data);
    }

    function shouldForceNewWorkspace() {
        try {
            if (sessionStorage.getItem(FORCE_NEW_KEY) !== "1") {
                return false;
            }
            sessionStorage.removeItem(FORCE_NEW_KEY);
            return true;
        } catch (error) {
            console.warn("새 문서 시작 플래그를 읽지 못했습니다.", error);
            return false;
        }
    }

    /* =====================================================
       DELETE SAVE DATA
       ===================================================== */

    function deleteSavedWorkspace() {
        localStorage.removeItem(STORAGE_KEY);
    }

    /* =====================================================
       SAVE MESSAGE
       ===================================================== */

    function showSaveMessage(message) {
        const oldMessage = document.getElementById("cbOpenSaveMessage");

        if (oldMessage) {
            oldMessage.remove();
        }

        const toast = document.createElement("div");

        toast.id = "cbOpenSaveMessage";

        toast.className = "cb-open-save-message";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");

        const icon = document.createElement("i");

        icon.className = "bi bi-check-circle-fill";

        const text = document.createElement("span");

        text.textContent = message;

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "cb-open-save-message-close";
        closeButton.setAttribute("aria-label", "메시지 닫기");
        closeButton.innerHTML = '<i class="bi bi-x-lg"></i>';
        closeButton.addEventListener("click", () => toast.remove());

        toast.append(icon, text, closeButton);

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("is-visible");
        });

        setTimeout(() => {
            toast.classList.remove("is-visible");

            setTimeout(() => {
                toast.remove();
            }, 200);
        }, 4000);
    }

    /* =====================================================
       CONFIRM DIALOG
       ===================================================== */

    async function confirmClearWorkspace() {
        /*
         * 프로젝트 AppDialog가 있으면
         * 우선 사용
         */
        if (
            window.AppDialog &&
            typeof window.AppDialog.confirm === "function"
        ) {
            return await window.AppDialog.confirm(
                "작성한 내용과 저장된 내용을 모두 초기화할까요?",
                {
                    title: "작성 내용 초기화",

                    variant: "danger",

                    confirmText: "초기화",

                    cancelText: "취소",
                },
            );
        }

        /*
         * fallback
         */
        return window.confirm("작성한 내용과 저장된 내용을 모두 초기화할까요?");
    }

    /* =====================================================
       RESET WORKSPACE
       ===================================================== */

    function resetWorkspace() {
        /*
         * localStorage 삭제
         */
        deleteSavedWorkspace();

        /*
         * 기번 초기화
         */
        if (gibunInput) {
            gibunInput.value = "";
        }

        /*
         * 제목 초기화
         */
        if (headerTitleInput) {
            headerTitleInput.value = "CIRCUIT BREAKER OPEN LIST";
        }

        /*
         * Footer
         */
        if (issueDateInput) {
            issueDateInput.value = DEFAULT_ISSUE_DATE;
        }

        if (companyNameInput) {
            companyNameInput.value = DEFAULT_COMPANY_NAME;
        }

        if (documentNumberInput) {
            documentNumberInput.value = DEFAULT_DOCUMENT_NUMBER;
        }

        /*
         * 표 설정
         */
        if (headerFontInput) {
            headerFontInput.value = "13";
        }

        if (bodyFontInput) {
            bodyFontInput.value = "12";
        }
        restoreDocumentFonts();

        if (headerPaddingInput) {
            headerPaddingInput.value = "5";
        }

        if (rowHeightInput) {
            rowHeightInput.value = "34";
        }

        /*
         * 열 너비
         */
        applyDefaultColumnWidths();

        /*
         * 표 초기화
         */
        clearTable();

        /*
         * 화면 반영
         */
        updateHeader();

        updateFooter();

        updateTableSizing();

        showSaveMessage("초기화되었습니다.");
    }

    /* =====================================================
       EVENTS — DOCUMENT INFO
       ===================================================== */

    if (aircraftModelSelect) {
        aircraftModelSelect.addEventListener("change", () => {
            updateHeader();
            refreshAutomaticLocationMarks();
        });
    }

    function initSettingsAccordions() {
        const accordionTitles = new Set([
            "문서 상단 정보",
            "표 기본 설정",
            "선택한 셀",
            "문서 하단 정보",
        ]);
        const sections = Array.from(
            document.querySelectorAll(".cb-setting-section"),
        ).filter((section) =>
            accordionTitles.has(
                cleanText(section.querySelector("h6")?.textContent),
            ),
        );
        sections.forEach((section) => {
            const header = section.querySelector(
                ":scope > .cb-setting-section-header",
            );
            if (!header) return;
            section.classList.add("cb-setting-collapsible", "is-collapsed");
            header.setAttribute("role", "button");
            header.setAttribute("tabindex", "0");
            header.setAttribute("aria-expanded", "false");
            header.insertAdjacentHTML(
                "beforeend",
                '<i class="bi bi-chevron-down cb-setting-chevron" aria-hidden="true"></i>',
            );
            const toggle = () => {
                const willOpen = section.classList.contains("is-collapsed");
                sections.forEach((item) => {
                    item.classList.add("is-collapsed");
                    item.querySelector(
                        ":scope > .cb-setting-section-header",
                    )?.setAttribute("aria-expanded", "false");
                });
                if (willOpen) {
                    section.classList.remove("is-collapsed");
                    header.setAttribute("aria-expanded", "true");
                }
            };
            header.addEventListener("click", toggle);
            header.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle();
                }
            });
        });
    }

    if (gibunInput) {
        gibunInput.addEventListener("input", () => {
            updateHeader();
        });
    }

    if (headerTitleInput) {
        headerTitleInput.addEventListener("input", updateHeader);
    }

    /* =====================================================
       EVENTS — FOOTER
       ===================================================== */

    if (issueDateInput) {
        issueDateInput.addEventListener("input", updateFooter);
    }

    if (companyNameInput) {
        companyNameInput.addEventListener("input", updateFooter);
    }

    if (documentNumberInput) {
        documentNumberInput.addEventListener("input", updateFooter);
    }

    /* =====================================================
       EVENTS — TABLE SETTINGS
       ===================================================== */

    if (headerFontInput) {
        headerFontInput.addEventListener("input", updateTableSizing);
    }

    if (bodyFontInput) {
        bodyFontInput.addEventListener("input", updateTableSizing);
    }

    if (headerPaddingInput) {
        headerPaddingInput.addEventListener("input", updateTableSizing);
    }

    if (rowHeightInput) {
        rowHeightInput.addEventListener("input", updateTableSizing);
    }

    /* =====================================================
    EVENTS — ROW MANAGEMENT
    ===================================================== */

    if (addRowButton) {
        addRowButton.addEventListener("click", () => {
            const nextIndex = tableBody.children.length;

            grid.insertRows(nextIndex, 1);

            updateRowNumbers();

            updateTableSizing();

            scheduleSheetScale();

            saveWorkspace();

            const row = tableBody.lastElementChild;

            row?.querySelector(".cb-open-cell-editor")?.focus();

            showSaveMessage("새 행을 추가했습니다.");
        });
    }

    if (deleteSelectedButton) {
        deleteSelectedButton.addEventListener("click", deleteSelectedRows);
    }

    /* =====================================================
    EVENTS — SAVE
    ===================================================== */

    if (saveButton) {
        saveButton.addEventListener("click", saveDocument);
    }

    templateSaveButton?.addEventListener("click", openTemplateSaveDialog);
    templateSaveCancel?.addEventListener("click", closeTemplateSaveDialog);
    templateSaveConfirm?.addEventListener("click", saveAsAircraftTemplate);
    templateNameInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") saveAsAircraftTemplate();
    });
    templateSaveDialog?.addEventListener("click", (event) => {
        if (event.target === templateSaveDialog) closeTemplateSaveDialog();
    });
    managedTemplateUpdate?.addEventListener("click", saveManagedTemplate);
    managedTemplateDelete?.addEventListener("click", deleteManagedTemplate);
    document.addEventListener("keydown", (event) => {
        if (
            event.key === "Escape" &&
            templateSaveDialog &&
            !templateSaveDialog.hidden
        ) {
            closeTemplateSaveDialog();
        }
    });

    /* =====================================================
       EVENTS — SETTINGS SAVE
       ===================================================== */

    if (settingsSaveButton) {
        settingsSaveButton.addEventListener("click", () => {
            /*
             * 설정 저장은
             * 기종 / 기번 검사하지 않음
             */
            const saved = saveSettingsOnly();

            if (saved) {
                /*
                 * 변경된 설정을
                 * 화면에도 다시 반영
                 */
                updateTableSizing();

                updateFooter();

                showSaveMessage("설정이 저장되었습니다.");

                closeSettings();
            }
        });
    }

    /* =====================================================
       EVENTS — CLEAR
       ===================================================== */

    if (clearButton) {
        clearButton.addEventListener("click", async () => {
            const confirmed = await confirmClearWorkspace();

            if (!confirmed) {
                return;
            }

            resetWorkspace();
        });
    }

    /* =====================================================
       EVENTS — SETTINGS
       ===================================================== */

    if (settingsButton) {
        settingsButton.addEventListener("click", openSettings);
    }

    /* =====================================================
       EVENTS — FIT A4
       ===================================================== */

    /* =====================================================
       EVENTS — PREVIEW
       ===================================================== */

    if (previewButton) {
        previewButton.addEventListener("click", () => {
            setPreviewMode(!previewMode);
        });
    }

    /* =====================================================
       EVENTS — PRINT
       ===================================================== */

    if (printButton) {
        printButton.addEventListener("click", () => {
            fitTableToA4();

            window.print();
        });
    }

    /*
     * Ctrl + P 대응
     */
    window.addEventListener("beforeprint", () => {
        printMode = true;
        window.cancelAnimationFrame(sheetScaleFrame);
        sheet.style.removeProperty("zoom");
        fitTableToA4();
        withPrintLayout(createPrintPageFurniture);
    });

    window.addEventListener("afterprint", () => {
        removePrintPageFurniture();
        printMode = false;
        scheduleSheetScale();
    });

    window.addEventListener("resize", () => {
        scheduleSheetScale();
    });

    /* =====================================================
    EVENTS — CELL FONT
    ===================================================== */

    if (fontDownButton) {
        fontDownButton.addEventListener("click", () => {
            changeSelectedFont(-1);
        });
    }

    if (fontUpButton) {
        fontUpButton.addEventListener("click", () => {
            changeSelectedFont(1);
        });
    }

    if (fontResetButton) {
        fontResetButton.addEventListener("click", resetSelectedFont);
    }

    if (rowResetButton) {
        rowResetButton.addEventListener("click", resetSelectedRowHeight);
    }

    /* =====================================================
       EVENTS — COLUMN RESET
       ===================================================== */

    if (columnResetButton) {
        columnResetButton.addEventListener("click", () => {
            applyDefaultColumnWidths();

            showSaveMessage("열 너비가 기본값으로 복원되었습니다.");
        });
    }

    /* =====================================================
    PASTE SOURCE
    ===================================================== */

    /*
     * textarea에 붙여넣을 때는
     * 아무 작업도 하지 않습니다.
     *
     * Ctrl + V → textarea 안에만 데이터 표시
     * 입력 저장 클릭 → 실제 표에 반영
     */

    document
        .getElementById("cbOpenManualImport")
        ?.addEventListener("click", () => {
            /*
             * =========================================
             * 기종 / 기번 확인
             * =========================================
             */
            if (!validateRequiredDocumentInfo()) {
                return;
            }

            const text = pasteSource.value;

            /*
             * =========================================
             * 입력 데이터 확인
             * =========================================
             */
            if (!cleanText(text)) {
                alert("표 데이터를 먼저 붙여넣어 주세요.");
                pasteSource.focus();
                return;
            }

            /*
             * =========================================
             * Airbus / Boeing 데이터 자동 판별
             * =========================================
             *
             * TAB이 포함된 복사 표:
             *   Airbus 표 형식으로 자동 처리
             *
             * 쉼표 직접 입력:
             *   Boeing 수동 입력으로 처리
             */
            const isTableData =
                text.includes("\t") ||
                /Row\s+Col(?:umn)?\s+Number\s+Name/i.test(text);

            const mode = isTableData ? "auto" : "boeing-manual";

            /*
             * =========================================
             * 기존 데이터 다음 행부터 추가
             * =========================================
             */
            const targetRow = getPasteTargetRow();
            const startRow = targetRow
                ? Array.from(tableBody.children).indexOf(targetRow)
                : getNextPasteRowIndex();

            const count = applyClipboardText(text, startRow, mode, targetRow);

            /*
             * =========================================
             * 정상 입력 완료
             * =========================================
             */
            if (count) {
                pasteSource.value = "";

                saveWorkspace(false);

                pasteSource.focus();
            }
        });

    /* =====================================================
    TABLE DIRECT PASTE
    ===================================================== */

    tableBody.addEventListener("paste", (event) => {
        const editor = event.target.closest(".cb-open-cell-editor");

        const row = event.target.closest("tr");

        if (!editor || !row) {
            return;
        }

        const text = event.clipboardData.getData("text/plain");

        /*
         * 단일 셀 붙여넣기는
         * createCellEditor에서 처리
         */
        if (!text.includes("\t")) {
            return;
        }

        /*
         * 다중 열 붙여넣기이면
         * 기종 / 기번 검사
         */
        if (!validateRequiredDocumentInfo()) {
            event.preventDefault();

            return;
        }

        event.preventDefault();

        const rowIndex = Array.from(tableBody.children).indexOf(row);

        applyClipboardText(text, Math.max(rowIndex, 0));
    });

    /* =====================================================
       DIRECT HEADER EDIT
       ===================================================== */

    bindEditableHeader(sheetPrefix);

    bindEditableHeader(sheetGibun);

    bindEditableHeader(sheetTitle);

    bindEditableHeader(sheetModel);

    /* =====================================================
    INIT
    ===================================================== */

    /*
     * 기본 열 너비
     */
    applyDefaultColumnWidths();

    /*
     * 열 너비 input 이벤트
     */
    initColumnInputs();

    initSettingsAccordions();

    /*
     * Header drag resize
     */
    initColumnResize();

    /*
     * =====================================================
     * GRID EDITOR
     *
     * 행 이동 기능보다 먼저 생성되어야 합니다.
     * =====================================================
     */
    const grid = new window.CBGridEditor({
        body: tableBody,
        fields: TABLE_FIELDS,
        toolbarHost: document.querySelector(".cb-open-sheet-stage"),
        createRow: () => createRow(1),
        changed: () => {
            updateRowNumbers();
            refreshDuplicateRows();
            updateTableSizing();
            scheduleSheetScale();
            saveWorkspace();
        },
    });

    function duplicateRowKey(row) {
        if (!rowHasData(row) || isSectionHeading(row)) return "";
        return ["panel_loc", "cb_loc", "fin", "description", "warning"]
            .map((field) =>
                cleanText(
                    row.querySelector(`[data-field="${field}"]`)?.innerText,
                )
                    .replace(/\s+/g, " ")
                    .toUpperCase(),
            )
            .join("\u001f");
    }

    function refreshDuplicateRows(showNotice = false) {
        const rows = Array.from(tableBody.children);
        const groups = new Map();
        rows.forEach((row) => {
            row.classList.remove("cb-open-row-duplicate");
            const key = duplicateRowKey(row);
            if (!key) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        });
        const duplicateRows = [];
        groups.forEach((group) => {
            if (group.length < 2) return;
            group.forEach((row) => {
                row.classList.add("cb-open-row-duplicate");
                duplicateRows.push(row);
            });
        });
        if (showNotice && duplicateRows.length) {
            showSaveMessage(
                `기존 데이터와 겹치는 ${duplicateRows.length}개 행을 표시했습니다.`,
            );
        }
        return duplicateRows.length;
    }

    /*
     * 개별 행 드래그 이동
     */
    initRowDrag();

    function setGridToolsVisible(visible, moveToTools = false) {
        grid.toolbar.classList.toggle("is-user-hidden", !visible);
        grid.toolbarAnchor.classList.toggle("is-user-hidden", !visible);
        if (gridToolsToggle) {
            gridToolsToggle.setAttribute("aria-pressed", String(visible));
            const label = gridToolsToggle.querySelector("span");
            if (label)
                label.textContent = visible
                    ? "표 편집 도구 숨기기"
                    : "표 편집 도구 표시";
            const icon = gridToolsToggle.querySelector("i");
            if (icon)
                icon.className = visible ? "bi bi-eye-slash" : "bi bi-tools";
        }
        if (visible && moveToTools) {
            closeSettings();
            window.requestAnimationFrame(() =>
                grid.toolbar.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                }),
            );
        }
    }

    setGridToolsVisible(false);
    gridToolsToggle?.addEventListener("click", () => {
        const visible = grid.toolbar.classList.contains("is-user-hidden");
        setGridToolsVisible(visible, visible);
    });

    const urlParams = new URLSearchParams(window.location.search);

    const isNewDocument = urlParams.get("new") === "1";

    const isTemplateImport = urlParams.get("from_template") === "1";

    /*
     * =====================================================
     * TEMPLATE IMPORT
     *
     * 템플릿에서 C/B 문서로 들어온 경우
     * 이전 Workspace를 절대 복원하지 않습니다.
     * =====================================================
     */

    if (isTemplateImport) {
        /* =====================================================
        기존 사용자 표시 설정 보관
        ===================================================== */

        let savedDisplaySettings = null;

        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (raw) {
                const previousData = JSON.parse(raw);

                savedDisplaySettings = {
                    tableSettings: previousData.tableSettings || null,

                    columnWidths: previousData.columnWidths || null,

                    documentFonts: previousData.documentFonts || null,
                };
            }
        } catch (error) {
            console.warn("기존 C/B 표시 설정을 읽지 못했습니다.", error);
        }

        localStorage.removeItem(STORAGE_KEY);

        clearTable();

        if (rowFilterSearch) {
            rowFilterSearch.value = "";
        }

        if (rowFilterFrom) {
            rowFilterFrom.value = "";
        }

        if (rowFilterTo) {
            rowFilterTo.value = "";
        }

        if (rowFilterLogic) {
            rowFilterLogic.value = "and";
        }

        if (rowFilterList) {
            rowFilterList.replaceChildren();
        }

        if (rowFilter) {
            rowFilter.hidden = true;
        }

        if (savedDisplaySettings) {
            applySavedDisplaySettings(savedDisplaySettings);
        }

        updateHeader();

        updateFooter();

        updateTableSizing();

        importSelectedTemplate();
    } else if (isNewDocument) {
        /*
         * 이전 임시 작업 제거
         */
        localStorage.removeItem(STORAGE_KEY);

        /*
         * 표 초기화
         */
        clearTable();

        /*
         * 필터 초기화
         */
        if (rowFilterSearch) {
            rowFilterSearch.value = "";
        }

        if (rowFilterFrom) {
            rowFilterFrom.value = "";
        }

        if (rowFilterTo) {
            rowFilterTo.value = "";
        }

        if (rowFilterLogic) {
            rowFilterLogic.value = "and";
        }

        if (rowFilterList) {
            rowFilterList.replaceChildren();
        }

        if (rowFilter) {
            rowFilter.hidden = true;
        }

        updateHeader();

        updateFooter();

        updateTableSizing();
    } else {
        /*
         * =====================================================
         * NORMAL OPEN
         *
         * 일반적으로 C/B 문서 화면에 들어온 경우
         * 마지막 작업 상태를 복원합니다.
         * =====================================================
         */
        const restored = restoreWorkspace();

        /*
         * 복원할 데이터가 없는 경우
         */
        if (!restored) {
            clearTable();

            updateHeader();

            updateFooter();

            updateTableSizing();
        }
    }

    /*
     * =====================================================
     * FINAL REFRESH
     * =====================================================
     */

    if (managedTemplateData) {
        loadManagedTemplate();
    }

    refreshAutomaticLocationMarks();

    rebuildRowFilter();

    scheduleSheetScale();

    /* =====================================================
    TEMPLATE IMPORT
    ===================================================== */

    function importSelectedTemplate() {
        const storageKey = "cb_open_template_import_v1";

        let pending;

        try {
            pending = JSON.parse(sessionStorage.getItem(storageKey));
        } catch (_error) {
            sessionStorage.removeItem(storageKey);
            return;
        }

        if (!pending || !Array.isArray(pending.rows) || !pending.rows.length) {
            return;
        }

        sessionStorage.removeItem(storageKey);

        if (pending.aircraft_model && aircraftModelSelect) {
            aircraftModelSelect.value = pending.aircraft_model;

            updateHeader();
        }

        const targetRow = getPasteTargetRow();

        const startRow = targetRow
            ? Array.from(tableBody.children).indexOf(targetRow)
            : getNextPasteRowIndex();

        const added = applyCBRecords(pending.rows, startRow, targetRow);

        if (added) {
            pending.rows.slice(0, added).forEach((record, index) => {
                const row = tableBody.children[startRow + index];

                if (!row) {
                    return;
                }

                const summary = [
                    record.panel_loc,
                    record.fin,
                    record.description,
                ]
                    .map(cleanText)
                    .filter(Boolean)
                    .join(" · ");

                row.dataset.filterLabel =
                    summary || `${startRow + index + 1}번 항목`;

                row.dataset.printIncluded = "true";

                row.classList.remove("cb-open-row-excluded");
            });

            rebuildRowFilter();

            const duplicateCount = refreshDuplicateRows(true);

            saveWorkspace();

            if (!duplicateCount) {
                showSaveMessage(
                    `${pending.name || "기본"} 템플릿 ${added}행을 문서에 추가했습니다.`,
                );
            }
        }
    }

    /* =====================================================
    ROW FILTER EVENTS
    ===================================================== */

    rowFilterApply?.addEventListener("click", applyAdvancedRowFilter);

    rowFilterPanelToggle?.addEventListener("click", () =>
        setRowFilterPanelVisible(true),
    );

    rowFilter?.addEventListener("shown.bs.offcanvas", () => {
        rowFilterPanelVisible = true;

        rowFilterPanelToggle?.setAttribute("aria-pressed", "true");
    });

    rowFilter?.addEventListener("hidden.bs.offcanvas", () => {
        rowFilterPanelVisible = false;

        rowFilterPanelToggle?.setAttribute("aria-pressed", "false");

        rowFilter.hidden = true;
    });

    [rowFilterSearch, rowFilterFrom, rowFilterTo].forEach((control) =>
        control?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                applyAdvancedRowFilter();
            }
        }),
    );

    rowFilterAll?.addEventListener("click", () => setAllImportedRows(true));

    rowFilterNone?.addEventListener("click", () => setAllImportedRows(false));

    rowFilterToggle?.addEventListener("click", () => {
        if (!rowFilterList) {
            return;
        }

        const willOpen = rowFilterList.hidden;

        rowFilterList.hidden = !willOpen;

        rowFilterToggle.setAttribute("aria-expanded", String(willOpen));

        rowFilterToggle.innerHTML = willOpen
            ? '<i class="bi bi-chevron-up"></i> 개별 항목 닫기'
            : '<i class="bi bi-list-check"></i> 개별 항목 보기';
    });

    /* =====================================================
    DIRECT TEMPLATE IMPORT
    ===================================================== */

    async function importTemplateRows(template) {
        const rows = Array.isArray(template?.rows) ? template.rows : [];

        if (!rows.length) {
            await window.AppDialog.alert(
                "선택한 템플릿에 불러올 데이터가 없습니다.",
                {
                    title: "템플릿 가져오기",
                },
            );

            return;
        }

        const currentAircraft = cleanText(aircraftModelSelect?.value);

        /*
         * 현재 C/B 문서의 기종과
         * 템플릿 기종이 같은지 확인
         */
        if (
            template.aircraft_model &&
            currentAircraft &&
            template.aircraft_model !== currentAircraft
        ) {
            await window.AppDialog.alert(
                "현재 선택한 기종과 템플릿의 기종이 다릅니다.",
                {
                    title: "템플릿 가져오기",
                },
            );

            return;
        }

        const confirmed = await window.AppDialog.confirm(
            `'${template.name}' 템플릿을 C/B OPEN LIST에 추가하시겠습니까?`,
            {
                title: "템플릿 가져오기",
                confirmText: "가져오기",
            },
        );

        if (!confirmed) {
            return;
        }

        /*
         * 현재 선택된 입력 행이 있으면
         * 그 위치부터 Template을 입력합니다.
         *
         * 선택된 행이 없으면
         * 다음 빈 위치에 추가합니다.
         */
        const targetRow = getPasteTargetRow();

        const startRow = targetRow
            ? Array.from(tableBody.children).indexOf(targetRow)
            : getNextPasteRowIndex();

        /*
         * 기존 C/B 데이터 입력 엔진 사용
         *
         * - 일반 셀 데이터
         * - Location
         * - Warning
         * - Merge
         * - Row Number
         * - Table Size
         * - Filter
         *
         * 모두 기존 로직으로 처리합니다.
         */
        const added = applyCBRecords(rows, startRow, targetRow);

        if (!added) {
            return;
        }

        /*
         * Template에서 추가된 행을
         * 문서 필터 대상으로 등록
         */
        rows.slice(0, added).forEach((record, index) => {
            const row = tableBody.children[startRow + index];

            if (!row) {
                return;
            }

            const summary = [record.panel_loc, record.fin, record.description]
                .map(cleanText)
                .filter(Boolean)
                .join(" · ");

            row.dataset.filterLabel =
                summary || `${startRow + index + 1}번 항목`;

            row.dataset.printIncluded = "true";

            row.classList.remove("cb-open-row-excluded");
        });

        updateRowNumbers();

        updateTableSizing();

        scheduleSheetScale();

        rebuildRowFilter();

        const duplicateCount = refreshDuplicateRows(true);

        /*
         * 현재 브라우저 Workspace 저장
         */
        saveWorkspace();

        if (!duplicateCount) {
            showSaveMessage(
                `${template.name} 템플릿 ${added}행을 문서에 추가했습니다.`,
            );
        }
    }

    /* =====================================================
    TEMPLATE IMPORTER
    ===================================================== */

    function initTemplateImporter() {
        const config = document.getElementById("cbOpenListConfig");

        const select = document.getElementById("cbOpenTemplateSelect");

        const importButton = document.getElementById("cbOpenTemplateImportBtn");

        const status = document.getElementById("cbOpenTemplateImportStatus");

        /*
         * Template Import UI가 없는 페이지에서는
         * 아무 작업도 하지 않습니다.
         *
         * template_manage_mode 또는
         * from_template=1 등의 경우를 안전하게 처리합니다.
         */
        if (!config || !select || !importButton) {
            return;
        }

        const templateApi = config.dataset.templateApi;

        let templates = [];

        /* =================================================
        STATUS
        ================================================= */

        const setStatus = (message, isError = false) => {
            if (!status) {
                return;
            }

            status.textContent = message || "";

            status.classList.toggle("is-error", isError);
        };

        /* =================================================
        RESET TEMPLATE SELECT
        ================================================= */

        const resetTemplateSelect = (message = "템플릿을 선택하세요") => {
            templates = [];

            select.innerHTML = "";

            const option = document.createElement("option");

            option.value = "";
            option.textContent = message;

            select.appendChild(option);

            select.value = "";

            importButton.disabled = true;
        };

        /* =================================================
        LOAD TEMPLATES
        ================================================= */

        const loadTemplates = async () => {
            /*
             * HTML 렌더링 당시의
             * default_aircraft_model이 아니라
             * 현재 Select에서 선택된 기종을 사용합니다.
             */
            const aircraftModel = cleanText(
                aircraftModelSelect?.value || config.dataset.aircraftModel,
            );

            /*
             * 기종이 선택되지 않은 경우
             */
            if (!aircraftModel) {
                resetTemplateSelect("먼저 기종을 선택하세요");

                select.disabled = true;

                setStatus("기종을 선택하면 해당 기종의 템플릿을 불러옵니다.");

                return;
            }

            select.innerHTML = "";

            const loadingOption = document.createElement("option");

            loadingOption.value = "";

            loadingOption.textContent = "템플릿을 불러오는 중...";

            select.appendChild(loadingOption);

            select.disabled = true;

            importButton.disabled = true;

            setStatus(`${aircraftModel} 템플릿을 확인하는 중입니다.`);

            try {
                const url = new URL(templateApi, window.location.origin);

                url.searchParams.set("aircraft_model", aircraftModel);

                const response = await fetch(url.toString(), {
                    method: "GET",

                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                    },
                });

                /*
                 * 로그인 페이지 등으로
                 * Redirect 된 경우
                 */
                if (response.redirected) {
                    throw new Error("로그인 상태를 확인해 주세요.");
                }

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error || "템플릿을 불러올 수 없습니다.",
                    );
                }

                templates = Array.isArray(data.templates) ? data.templates : [];

                select.innerHTML = "";

                const defaultOption = document.createElement("option");

                defaultOption.value = "";

                defaultOption.textContent = "템플릿을 선택하세요";

                select.appendChild(defaultOption);

                templates.forEach((template) => {
                    const option = document.createElement("option");

                    option.value = String(template.id);

                    option.textContent = template.name;

                    select.appendChild(option);
                });

                select.disabled = false;

                /*
                 * 해당 기종에 Template 없음
                 */
                if (templates.length === 0) {
                    setStatus(`${aircraftModel}에 저장된 템플릿이 없습니다.`);

                    return;
                }

                setStatus(
                    `${aircraftModel} · ${templates.length}개의 템플릿을 불러왔습니다.`,
                );
            } catch (error) {
                templates = [];

                select.innerHTML = "";

                const errorOption = document.createElement("option");

                errorOption.value = "";

                errorOption.textContent = "템플릿을 불러올 수 없습니다";

                select.appendChild(errorOption);

                select.disabled = true;

                importButton.disabled = true;

                setStatus(
                    error.message || "템플릿을 불러올 수 없습니다.",
                    true,
                );
            }
        };

        /* =================================================
        TEMPLATE SELECT
        ================================================= */

        select.addEventListener("change", () => {
            importButton.disabled = !select.value;

            if (!select.value) {
                return;
            }

            const selectedTemplate = templates.find(
                (item) => String(item.id) === String(select.value),
            );

            if (selectedTemplate) {
                setStatus(`'${selectedTemplate.name}' 템플릿을 선택했습니다.`);
            }
        });

        /* =================================================
        IMPORT BUTTON
        ================================================= */

        importButton.addEventListener("click", async () => {
            const templateId = String(select.value || "");

            if (!templateId) {
                setStatus("불러올 템플릿을 선택해 주세요.", true);

                return;
            }

            const template = templates.find(
                (item) => String(item.id) === templateId,
            );

            if (!template) {
                setStatus("선택한 템플릿 정보를 찾을 수 없습니다.", true);

                return;
            }

            importButton.disabled = true;

            try {
                await importTemplateRows(template);

                setStatus(
                    `'${template.name}' 템플릿을 C/B OPEN LIST에 추가했습니다.`,
                );

                /*
                 * 가져온 후 Select 초기화
                 */
                select.value = "";
            } catch (error) {
                console.error("C/B 템플릿 가져오기 오류", error);

                setStatus(
                    error.message || "템플릿을 가져오지 못했습니다.",
                    true,
                );
            } finally {
                importButton.disabled = !select.value;
            }
        });

        /* =================================================
        AIRCRAFT CHANGE
        ================================================= */

        aircraftModelSelect?.addEventListener("change", () => {
            /*
             * 기존 기종의 Template 목록 제거
             */
            resetTemplateSelect();

            setStatus("");

            /*
             * 새 기종의 Template 목록 조회
             */
            void loadTemplates();
        });

        /* =================================================
        INITIAL LOAD
        ================================================= */

        void loadTemplates();
    }

    /* =====================================================
    READY
    ===================================================== */

    document.body.dataset.cbOpenReady = "true";

    /*
     * Template Manager에서
     * "C/B 문서에 적용"으로 넘어온 Template 처리
     */
    importSelectedTemplate();

    /*
     * Open List 오른쪽의
     * Template 가져오기 UI 초기화
     */
    initTemplateImporter();
});
