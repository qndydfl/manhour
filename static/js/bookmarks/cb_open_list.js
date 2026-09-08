// =========================================================
// BOOKMARKS — C/B OPEN LIST
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
    /* =====================================================
       ELEMENTS
       ===================================================== */

    const table = document.getElementById("cbOpenListTable");

    const tableBody = document.getElementById("cbOpenListBody");

    const sheet = document.getElementById("cbOpenSheet");

    const pasteSource = document.getElementById("cbOpenListPasteSource");

    /*
     * 핵심 요소가 없으면
     * 페이지 JS 실행 중단
     */
    if (!table || !tableBody || !sheet || !pasteSource) {
        return;
    }

    /* =====================================================
       DOCUMENT INFORMATION
       ===================================================== */

    const aircraftModelSelect = document.getElementById("cbOpenAircraftModel");

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

    const saveButton = document.getElementById("cbOpenListSave");

    const clearButton = document.getElementById("cbOpenListClear");

    const fitA4Button = document.getElementById("cbOpenListFitA4");

    const previewButton = document.getElementById("cbOpenListPreview");

    const printButton = document.getElementById("cbOpenListPrint");

    const settingsButton = document.getElementById("cbOpenListSettings");

    const settingsSaveButton = document.getElementById("cbOpenSettingsSave");

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

    const DEFAULT_ROWS = 12;

    const STORAGE_KEY = "cb_open_list_workspace_v1";

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

        cockpit: 42,

        ee: 38,

        etc: 38,

        "panel-loc": 82,

        "cb-loc": 115,

        fin: 65,

        description: 150,

        warning: 205,

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

        "cb-loc": 70,

        fin: 48,

        description: 90,

        warning: 110,

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

        col.style.width = `${nextWidth}px`;

        col.dataset.width = String(Math.round(nextWidth));

        syncColumnInput(key, nextWidth);
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

    /* =====================================================
       DOCUMENT HEADER
       ===================================================== */

    function updateHeader() {
        const aircraft = cleanText(aircraftModelSelect?.value);

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
        return Object.fromEntries(Array.from(document.querySelectorAll('[data-document-font]'),
            (input) => [input.dataset.documentFont, input.value]));
    }

    function updateDocumentFonts() {
        document.querySelectorAll('[data-document-font]').forEach((input) => {
            const size = Math.max(8, Math.min(32, Number(input.value) || Number(input.defaultValue)));
            sheet.style.setProperty(`--cb-document-${input.dataset.documentFont}-font`, `${size}px`);
            const output = document.querySelector(`[data-document-font-value="${input.dataset.documentFont}"]`);
            if (output) output.textContent = `${size}px`;
        });
    }

    function restoreDocumentFonts(saved = {}) {
        document.querySelectorAll('[data-document-font]').forEach((input) => {
            input.value = saved?.[input.dataset.documentFont] || input.defaultValue;
        });
        updateDocumentFonts();
    }

    document.querySelectorAll('[data-document-font]').forEach((input) => {
        input.addEventListener('input', updateDocumentFonts);
    });

    function updateTableSizing() {
        updateDocumentFonts();
        const headerFont = Number(headerFontInput?.value || 12);

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

        /*
         * NO
         */
        const noCell = document.createElement("td");

        noCell.className = "cb-open-number-cell";

        noCell.textContent = number;

        row.appendChild(noCell);

        /*
         * editable cells
         */
        TABLE_FIELDS.forEach((field) => {
            const td = document.createElement("td");

            const editor = createCellEditor(field);

            td.appendChild(editor);

            row.appendChild(td);
        });

        /*
         * 마지막 CONFIRM 셀에
         * 행 높이 조절 handle
         */
        const lastCell = row.lastElementChild;

        if (lastCell) {
            const handle = document.createElement("span");

            handle.className = "cb-open-row-resizer";

            lastCell.appendChild(handle);

            bindRowResize(row, handle);
        }

        return row;
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

            if (numberCell) {
                numberCell.textContent = index + 1;
            }
        });
    }

    function clearTable() {
        tableBody.innerHTML = "";

        selectedEditor = null;

        ensureRows(DEFAULT_ROWS);
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

    function applyClipboardText(rawText, startRow = 0) {
        const text = String(rawText || "")
            .replace(/\r/g, "")
            .trim();

        if (!text) {
            return;
        }

        const lines = text.split("\n").filter((line) => line.trim() !== "");

        /*
         * 붙여넣을 데이터보다
         * 현재 행이 부족하면 자동 생성
         */
        ensureRows(startRow + lines.length);

        lines.forEach((line, lineIndex) => {
            const columns = line.split("\t");

            const row = tableBody.children[startRow + lineIndex];

            if (!row) {
                return;
            }

            /*
             * =========================================
             * 붙여넣기 데이터 매핑
             *
             * 1열 → PANEL
             * 2열 → DESCRIPTION
             * 3열 → FIN
             * 4열 → C/B LOC'
             * =========================================
             */
            PASTE_TARGETS.forEach((field, columnIndex) => {
                setCellValue(row, field, columns[columnIndex] || "");
            });

            /*
             * =========================================
             * SSPC 자동 판별
             * =========================================
             *
             * C/B LOC' 값에
             * SSPC가 포함되어 있으면
             *
             * etc = V
             *
             * SSPC가 없으면
             * etc = 빈칸
             */
            const cbLocValue = cleanText(columns[3] || "");

            const isSSPC = cbLocValue.toUpperCase().includes("SSPC");

            setCellValue(row, "etc", isSSPC ? "V" : "");
        });
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

            input.addEventListener("change", () => {
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
        const targetWidth = 1060;

        if (totalWidth <= targetWidth) {
            return;
        }

        const ratio = targetWidth / totalWidth;

        keys.forEach((key) => {
            const current = getColumnWidth(key);

            setColumnWidth(key, current * ratio, false);
        });
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
                headerFont: headerFontInput?.value || "12",

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
                headerFont: headerFontInput?.value || "12",

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

    function saveWorkspace() {
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

            showSaveMessage("저장되었습니다.");

            return true;
        } catch (error) {
            console.error("C/B OPEN LIST 저장 실패", error);

            alert("저장 중 오류가 발생했습니다.");

            return false;
        }
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

        /*
         * =========================================
         * FOOTER
         * =========================================
         */

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

        /*
         * =========================================
         * TABLE SETTINGS
         * =========================================
         */

        restoreDocumentFonts(data.documentFonts);
        if (data.tableSettings) {
            if (headerFontInput) {
                headerFontInput.value = data.tableSettings.headerFont || "12";
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

        /*
         * =========================================
         * COLUMN WIDTH
         * =========================================
         */

        if (data.columnWidths) {
            Object.entries(data.columnWidths).forEach(([key, width]) => {
                setColumnWidth(key, Number(width), false);
            });
        }

        /*
         * =========================================
         * TABLE ROW
         * =========================================
         */

        tableBody.innerHTML = "";

        selectedEditor = null;

        if (Array.isArray(data.rows) && data.rows.length > 0) {
            data.rows.forEach((savedRow, index) => {
                const row = createRow(index + 1);

                /*
                 * 저장된 행 높이
                 */
                if (savedRow.height) {
                    row.style.height = savedRow.height;
                }

                /*
                 * =================================
                 * CELL DATA
                 * =================================
                 */

                if (savedRow.cells) {
                    Object.entries(savedRow.cells).forEach(
                        ([field, cellData]) => {
                            const editor = row.querySelector(
                                `[data-field="${field}"]`,
                            );

                            if (!editor) {
                                return;
                            }

                            /*
                             * 과거 저장 버전 호환
                             *
                             * 과거에는
                             * cellData가 문자열일 수 있음
                             */
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

        updateRowNumbers();

        updateHeader();

        updateFooter();

        updateTableSizing();

        return true;
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

        const icon = document.createElement("i");

        icon.className = "bi bi-check-circle-fill";

        const text = document.createElement("span");

        text.textContent = message;

        toast.appendChild(icon);

        toast.appendChild(text);

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("is-visible");
        });

        setTimeout(() => {
            toast.classList.remove("is-visible");

            setTimeout(() => {
                toast.remove();
            }, 200);
        }, 1800);
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
            headerFontInput.value = "12";
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
        aircraftModelSelect.addEventListener("change", updateHeader);
    }

    if (gibunInput) {
        gibunInput.addEventListener("input", updateHeader);
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
       EVENTS — ADD ROW
       ===================================================== */

    if (addRowButton) {
        addRowButton.addEventListener("click", () => {
            ensureRows(tableBody.children.length + 1);
        });
    }

    /* =====================================================
       EVENTS — SAVE
       ===================================================== */

    if (saveButton) {
        saveButton.addEventListener("click", saveWorkspace);
    }

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

    if (fitA4Button) {
        fitA4Button.addEventListener("click", fitTableToA4);
    }

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
        fitTableToA4();
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

    pasteSource.addEventListener("paste", (event) => {
        /*
         * =========================================
         * 기종 / 기번 검사
         * =========================================
         *
         * 표 데이터 붙여넣기는
         * 기종 / 기번 입력 후 가능
         */
        if (!validateRequiredDocumentInfo()) {
            event.preventDefault();

            pasteSource.value = "";

            return;
        }

        /*
         * 브라우저 기본 붙여넣기 방지
         */
        event.preventDefault();

        const text = event.clipboardData.getData("text/plain");

        if (!cleanText(text)) {
            return;
        }

        /*
         * =========================================
         * 기존 데이터 다음 행부터 추가
         * =========================================
         */
        const startRow = getNextPasteRowIndex();

        applyClipboardText(text, startRow);

        /*
         * 붙여넣기 입력창은
         * 다시 비워둠
         */
        pasteSource.value = "";
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

    /*
     * Header drag resize
     */
    initColumnResize();

    /*
     * 저장된 작업 자동 복원
     */
    const restored = restoreWorkspace();

    /*
     * 저장 데이터가 없는 경우
     */
    if (!restored) {
        clearTable();

        updateHeader();

        updateFooter();

        updateTableSizing();
    }
});
