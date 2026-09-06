document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       ELEMENTS
       ===================================================== */

    const table =
        document.getElementById("cbOpenListTable");

    const tableBody =
        document.getElementById("cbOpenListBody");

    const sheet =
        document.getElementById("cbOpenSheet");

    const pasteSource =
        document.getElementById("cbOpenListPasteSource");


    /* =====================================================
       DOCUMENT INFORMATION
       ===================================================== */

    const aircraftModelSelect =
        document.getElementById("cbOpenAircraftModel");

    const gibunInput =
        document.getElementById("cbOpenGibun");

    const headerTitleInput =
        document.getElementById("cbOpenHeaderTitle");


    const sheetPrefix =
        document.getElementById("cbOpenSheetPrefix");

    const sheetGibun =
        document.getElementById("cbOpenSheetGibun");

    const sheetTitle =
        document.getElementById("cbOpenSheetTitleText");

    const sheetModel =
        document.getElementById("cbOpenSheetModel");


    /* =====================================================
       TABLE SETTINGS
       ===================================================== */

    const headerFontInput =
        document.getElementById("cbOpenTableHeaderFont");

    const headerPaddingInput =
        document.getElementById("cbOpenTableHeaderPadding");

    const rowHeightInput =
        document.getElementById("cbOpenTableRowHeight");


    const headerFontValue =
        document.getElementById("cbOpenTableHeaderFontValue");

    const headerPaddingValue =
        document.getElementById("cbOpenTableHeaderPaddingValue");

    const rowHeightValue =
        document.getElementById("cbOpenTableRowHeightValue");


    /* =====================================================
       BUTTONS
       ===================================================== */

    const addRowButton =
        document.getElementById("cbOpenListAddRow");

    const saveButton =
        document.getElementById("cbOpenListSave");

    const clearButton =
        document.getElementById("cbOpenListClear");

    const fitA4Button =
        document.getElementById("cbOpenListFitA4");

    const previewButton =
        document.getElementById("cbOpenListPreview");

    const printButton =
        document.getElementById("cbOpenListPrint");

    const settingsButton =
        document.getElementById("cbOpenListSettings");


    /* =====================================================
       CELL SETTINGS
       ===================================================== */

    const fontDownButton =
        document.getElementById("cbOpenCellFontDown");

    const fontUpButton =
        document.getElementById("cbOpenCellFontUp");

    const fontResetButton =
        document.getElementById("cbOpenCellFontReset");

    const rowResetButton =
        document.getElementById("cbOpenRowHeightReset");


    /* =====================================================
       COLUMN SETTINGS
       ===================================================== */

    const columnResetButton =
        document.getElementById("cbOpenColumnWidthReset");

    const columnInputs =
        Array.from(
            document.querySelectorAll(
                "[data-col-width-input]"
            )
        );


    /*
     * 핵심 요소가 없으면 중단
     */
    if (
        !table ||
        !tableBody ||
        !sheet ||
        !pasteSource
    ) {
        return;
    }



    /* =====================================================
       CONSTANTS
       ===================================================== */

    const DEFAULT_ROWS = 12;


    /*
     * localStorage key
     */
    const STORAGE_KEY =
        "cb_open_list_workspace_v1";


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
    const PASTE_TARGETS = [

        "panel_loc",

        "description",

        "fin",

        "cb_loc",
    ];


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


    let selectedEditor = null;

    let previewMode = false;



    /* =====================================================
       UTIL
       ===================================================== */

    function cleanText(value) {

        return String(
            value ?? ""
        )
            .replace(/\u00a0/g, " ")
            .trim();
    }



    /* =====================================================
       COLUMN UTIL
       ===================================================== */

    function getColumnElement(key) {

        return table.querySelector(
            `col[data-col="${key}"]`
        );
    }



    function getColumnWidth(key) {

        const col =
            getColumnElement(key);


        if (!col) {
            return 0;
        }


        const storedWidth =
            Number(
                col.dataset.width
            );


        if (
            Number.isFinite(storedWidth) &&
            storedWidth > 0
        ) {

            return storedWidth;
        }


        return (
            DEFAULT_COLUMN_WIDTHS[key] ||
            60
        );
    }



    function setColumnWidth(
        key,
        width,
        enforceMin = true
    ) {

        const col =
            getColumnElement(key);


        if (!col) {
            return;
        }


        let nextWidth =
            Number(width);


        if (
            !Number.isFinite(nextWidth)
        ) {
            return;
        }


        const minWidth =
            MIN_COLUMN_WIDTHS[key] ||
            25;


        if (enforceMin) {

            nextWidth =
                Math.max(
                    minWidth,
                    nextWidth
                );

        } else {

            nextWidth =
                Math.max(
                    18,
                    nextWidth
                );
        }


        col.style.width =
            `${nextWidth}px`;


        col.dataset.width =
            String(
                Math.round(nextWidth)
            );


        syncColumnInput(
            key,
            nextWidth
        );
    }



    function syncColumnInput(
        key,
        width
    ) {

        const input =
            columnInputs.find(
                item =>
                    item.dataset.colWidthInput ===
                    key
            );


        if (!input) {
            return;
        }


        input.value =
            String(
                Math.round(width)
            );
    }



    function applyDefaultColumnWidths() {

        Object.entries(
            DEFAULT_COLUMN_WIDTHS
        ).forEach(
            ([key, width]) => {

                setColumnWidth(
                    key,
                    width
                );
            }
        );
    }



    /* =====================================================
       DOCUMENT HEADER
       ===================================================== */

    function updateHeader() {

        const aircraft =
            cleanText(
                aircraftModelSelect?.value
            ) || "A350";


        let gibun =
            cleanText(
                gibunInput?.value
            );


        gibun =
            gibun
                .replace(/\D/g, "")
                .slice(0, 4);


        if (gibunInput) {

            gibunInput.value =
                gibun;
        }


        const title =
            cleanText(
                headerTitleInput?.value
            ) ||
            "CIRCUIT BREAKER OPEN LIST";


        if (sheetPrefix) {

            sheetPrefix.textContent =
                "HL";
        }


        if (sheetGibun) {

            sheetGibun.textContent =
                gibun || "____";
        }


        if (sheetTitle) {

            sheetTitle.textContent =
                title;
        }


        if (sheetModel) {

            sheetModel.textContent =
                `(${aircraft})`;
        }
    }



    function bindEditableHeader(
        element
    ) {

        if (!element) {
            return;
        }


        /*
         * 서식 없는 텍스트 붙여넣기
         */
        element.addEventListener(
            "paste",
            event => {

                event.preventDefault();


                const text =
                    event.clipboardData
                        .getData("text/plain")
                        .replace(/\r?\n/g, " ");


                document.execCommand(
                    "insertText",
                    false,
                    text
                );
            }
        );


        /*
         * 제목 영역에서는 Enter 사용 안 함
         */
        element.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter"
                ) {

                    event.preventDefault();

                    element.blur();
                }
            }
        );
    }



    /* =====================================================
       TABLE SIZE
       ===================================================== */

    function updateTableSizing() {

        const headerFont =
            Number(
                headerFontInput?.value ||
                10
            );


        const headerPadding =
            Number(
                headerPaddingInput?.value ||
                5
            );


        const rowHeight =
            Number(
                rowHeightInput?.value ||
                34
            );


        sheet.style.setProperty(
            "--cb-header-font",
            `${headerFont}px`
        );


        sheet.style.setProperty(
            "--cb-header-padding",
            `${headerPadding}px`
        );


        sheet.style.setProperty(
            "--cb-row-height",
            `${rowHeight}px`
        );


        if (headerFontValue) {

            headerFontValue.textContent =
                `${headerFont}px`;
        }


        if (headerPaddingValue) {

            headerPaddingValue.textContent =
                `${headerPadding}px`;
        }


        if (rowHeightValue) {

            rowHeightValue.textContent =
                `${rowHeight}px`;
        }
    }



    /* =====================================================
       CELL SELECT
       ===================================================== */

    function selectEditor(editor) {

        table
            .querySelectorAll(
                ".cb-open-cell-editor.is-selected"
            )
            .forEach(
                item => {

                    item.classList.remove(
                        "is-selected"
                    );
                }
            );


        selectedEditor =
            editor;


        if (selectedEditor) {

            selectedEditor.classList.add(
                "is-selected"
            );
        }
    }



    /* =====================================================
       CREATE CELL
       ===================================================== */

    function createCellEditor(field) {

        const editor =
            document.createElement("div");


        editor.className =
            "cb-open-cell-editor";


        /*
         * Chromium / Edge
         * plain text contenteditable
         */
        try {

            editor.contentEditable =
                "plaintext-only";

        } catch {

            editor.contentEditable =
                "true";
        }


        editor.spellcheck =
            false;


        editor.dataset.field =
            field;


        /*
         * 긴 텍스트 열은 좌측 정렬
         */
        if (
            field === "description" ||
            field === "warning"
        ) {

            editor.classList.add(
                "is-long-text"
            );
        }


        editor.addEventListener(
            "focus",
            () => {

                selectEditor(editor);
            }
        );


        editor.addEventListener(
            "mousedown",
            () => {

                selectEditor(editor);
            }
        );


        /*
         * 단일 셀 일반 붙여넣기
         */
        editor.addEventListener(
            "paste",
            event => {

                const text =
                    event.clipboardData
                        .getData("text/plain");


                /*
                 * 여러 열이면
                 * tableBody 이벤트에서 처리
                 */
                if (
                    text.includes("\t")
                ) {

                    return;
                }


                event.preventDefault();


                document.execCommand(
                    "insertText",
                    false,
                    text
                );
            }
        );


        return editor;
    }



    /* =====================================================
       CREATE ROW
       ===================================================== */

    function createRow(number) {

        const row =
            document.createElement("tr");


        /*
         * NO
         */
        const noCell =
            document.createElement("td");


        noCell.className =
            "cb-open-number-cell";


        noCell.textContent =
            number;


        row.appendChild(
            noCell
        );


        /*
         * EDITABLE CELLS
         */
        TABLE_FIELDS.forEach(
            field => {

                const td =
                    document.createElement("td");


                const editor =
                    createCellEditor(
                        field
                    );


                td.appendChild(
                    editor
                );


                row.appendChild(
                    td
                );
            }
        );


        /*
         * 행 높이 조절 핸들
         */
        const lastCell =
            row.lastElementChild;


        if (lastCell) {

            const handle =
                document.createElement("span");


            handle.className =
                "cb-open-row-resizer";


            lastCell.appendChild(
                handle
            );


            bindRowResize(
                row,
                handle
            );
        }


        return row;
    }



    /* =====================================================
       ROW MANAGEMENT
       ===================================================== */

    function ensureRows(count) {

        while (
            tableBody.children.length <
            count
        ) {

            const number =
                tableBody.children.length +
                1;


            tableBody.appendChild(
                createRow(number)
            );
        }


        updateRowNumbers();
    }



    function updateRowNumbers() {

        Array.from(
            tableBody.children
        ).forEach(
            (row, index) => {

                const numberCell =
                    row.querySelector(
                        ".cb-open-number-cell"
                    );


                if (numberCell) {

                    numberCell.textContent =
                        index + 1;
                }
            }
        );
    }



    function clearTable() {

        tableBody.innerHTML =
            "";


        selectedEditor =
            null;


        ensureRows(
            DEFAULT_ROWS
        );
    }



    /* =====================================================
       ROW RESIZE
       ===================================================== */

    function bindRowResize(
        row,
        handle
    ) {

        handle.addEventListener(
            "pointerdown",
            event => {

                event.preventDefault();

                event.stopPropagation();


                const startY =
                    event.clientY;


                const startHeight =
                    row.getBoundingClientRect()
                        .height;


                handle.setPointerCapture(
                    event.pointerId
                );


                const move =
                    moveEvent => {

                        const difference =
                            moveEvent.clientY -
                            startY;


                        const nextHeight =
                            Math.max(
                                22,
                                startHeight +
                                difference
                            );


                        row.style.height =
                            `${nextHeight}px`;
                    };


                const finish =
                    () => {

                        handle.removeEventListener(
                            "pointermove",
                            move
                        );


                        handle.removeEventListener(
                            "pointerup",
                            finish
                        );


                        handle.removeEventListener(
                            "pointercancel",
                            finish
                        );
                    };


                handle.addEventListener(
                    "pointermove",
                    move
                );


                handle.addEventListener(
                    "pointerup",
                    finish
                );


                handle.addEventListener(
                    "pointercancel",
                    finish
                );
            }
        );
    }



    /* =====================================================
       COLUMN RESIZE
       ===================================================== */

    function initColumnResize() {

        const handles =
            table.querySelectorAll(
                ".cb-open-col-resizer"
            );


        handles.forEach(
            handle => {

                handle.addEventListener(
                    "pointerdown",
                    event => {

                        event.preventDefault();

                        event.stopPropagation();


                        const th =
                            handle.closest(
                                "th[data-col-key]"
                            );


                        if (!th) {
                            return;
                        }


                        const key =
                            th.dataset.colKey;


                        const startX =
                            event.clientX;


                        const startWidth =
                            getColumnWidth(key);


                        handle.setPointerCapture(
                            event.pointerId
                        );


                        document.body.classList.add(
                            "cb-open-column-resizing"
                        );


                        const move =
                            moveEvent => {

                                const next =
                                    startWidth +
                                    moveEvent.clientX -
                                    startX;


                                setColumnWidth(
                                    key,
                                    next
                                );
                            };


                        const finish =
                            () => {

                                document.body.classList.remove(
                                    "cb-open-column-resizing"
                                );


                                handle.removeEventListener(
                                    "pointermove",
                                    move
                                );


                                handle.removeEventListener(
                                    "pointerup",
                                    finish
                                );


                                handle.removeEventListener(
                                    "pointercancel",
                                    finish
                                );
                            };


                        handle.addEventListener(
                            "pointermove",
                            move
                        );


                        handle.addEventListener(
                            "pointerup",
                            finish
                        );


                        handle.addEventListener(
                            "pointercancel",
                            finish
                        );
                    }
                );
            }
        );
    }



    /* =====================================================
       SET CELL VALUE
       ===================================================== */

    function setCellValue(
        row,
        field,
        value
    ) {

        const editor =
            row.querySelector(
                `[data-field="${field}"]`
            );


        if (!editor) {
            return;
        }


        editor.textContent =
            cleanText(value);


        editor.classList.add(
            "is-pasted"
        );


        setTimeout(
            () => {

                editor.classList.remove(
                    "is-pasted"
                );

            },
            300
        );
    }



    /* =====================================================
       CLIPBOARD AUTO MAP
       ===================================================== */

    function applyClipboardText(
        rawText,
        startRow = 0
    ) {

        const text =
            String(
                rawText || ""
            )
                .replace(/\r/g, "")
                .trim();


        if (!text) {
            return;
        }


        const lines =
            text
                .split("\n")
                .filter(
                    line =>
                        line.trim() !== ""
                );


        ensureRows(
            startRow +
            lines.length
        );


        lines.forEach(
            (line, lineIndex) => {

                const columns =
                    line.split("\t");


                const row =
                    tableBody.children[
                        startRow +
                        lineIndex
                    ];


                if (!row) {
                    return;
                }


                PASTE_TARGETS.forEach(
                    (field, columnIndex) => {

                        setCellValue(
                            row,
                            field,
                            columns[
                                columnIndex
                            ] || ""
                        );
                    }
                );
            }
        );
    }



    /* =====================================================
       PASTE SOURCE
       ===================================================== */

    pasteSource.addEventListener(
        "paste",
        event => {

            event.preventDefault();


            const text =
                event.clipboardData
                    .getData("text/plain");


            applyClipboardText(
                text,
                0
            );


            pasteSource.value =
                "";
        }
    );



    /* =====================================================
       TABLE DIRECT PASTE
       ===================================================== */

    tableBody.addEventListener(
        "paste",
        event => {

            const editor =
                event.target.closest(
                    ".cb-open-cell-editor"
                );


            const row =
                event.target.closest("tr");


            if (
                !editor ||
                !row
            ) {
                return;
            }


            const text =
                event.clipboardData
                    .getData("text/plain");


            /*
             * 한 셀짜리 데이터는
             * createCellEditor에서 처리
             */
            if (
                !text.includes("\t")
            ) {

                return;
            }


            event.preventDefault();


            const rowIndex =
                Array.from(
                    tableBody.children
                ).indexOf(row);


            applyClipboardText(
                text,
                Math.max(
                    rowIndex,
                    0
                )
            );
        }
    );



    /* =====================================================
       SELECTED CELL FONT
       ===================================================== */

    function changeSelectedFont(amount) {

        if (!selectedEditor) {

            alert(
                "먼저 표에서 수정할 셀을 선택하세요."
            );

            return;
        }


        const current =
            Number.parseFloat(
                getComputedStyle(
                    selectedEditor
                ).fontSize
            ) || 10;


        const next =
            Math.max(
                7,
                Math.min(
                    24,
                    current + amount
                )
            );


        selectedEditor.style.fontSize =
            `${next}px`;
    }



    function resetSelectedFont() {

        if (!selectedEditor) {

            alert(
                "먼저 표에서 수정할 셀을 선택하세요."
            );

            return;
        }


        selectedEditor.style.removeProperty(
            "font-size"
        );
    }



    function resetSelectedRowHeight() {

        if (!selectedEditor) {

            alert(
                "먼저 표에서 수정할 셀을 선택하세요."
            );

            return;
        }


        const row =
            selectedEditor.closest("tr");


        if (row) {

            row.style.removeProperty(
                "height"
            );
        }
    }



    /* =====================================================
       COLUMN INPUT
       ===================================================== */

    function initColumnInputs() {

        columnInputs.forEach(
            input => {

                const key =
                    input.dataset.colWidthInput;


                input.addEventListener(
                    "change",
                    () => {

                        setColumnWidth(
                            key,
                            Number(
                                input.value
                            )
                        );
                    }
                );
            }
        );
    }



    /* =====================================================
       A4 AUTO FIT
       ===================================================== */

    function fitTableToA4() {

        const keys =
            Object.keys(
                DEFAULT_COLUMN_WIDTHS
            );


        const totalWidth =
            keys.reduce(
                (sum, key) => {

                    return (
                        sum +
                        getColumnWidth(key)
                    );

                },
                0
            );


        /*
         * A4 landscape 화면 기준
         */
        const targetWidth =
            1060;


        if (
            totalWidth <= targetWidth
        ) {
            return;
        }


        const ratio =
            targetWidth /
            totalWidth;


        keys.forEach(
            key => {

                const current =
                    getColumnWidth(key);


                setColumnWidth(
                    key,
                    current * ratio,
                    false
                );
            }
        );
    }



    /* =====================================================
       PREVIEW
       ===================================================== */

    function setPreviewMode(enabled) {

        previewMode =
            enabled;


        document.body.classList.toggle(
            "cb-open-preview-mode",
            enabled
        );


        if (previewButton) {

            previewButton.classList.toggle(
                "is-active",
                enabled
            );


            const text =
                previewButton.querySelector(
                    "span"
                );


            if (text) {

                text.textContent =
                    enabled
                        ? "미리보기 해제"
                        : "A4 미리보기";
            }
        }


        if (enabled) {

            fitTableToA4();
        }
    }



    /* =====================================================
       SETTINGS OFFCANVAS
       ===================================================== */

    function openSettings() {

        const element =
            document.getElementById(
                "cbOpenSettingsPanel"
            );


        if (!element) {
            return;
        }


        if (
            typeof bootstrap ===
            "undefined"
        ) {
            return;
        }


        const panel =
            bootstrap.Offcanvas
                .getOrCreateInstance(
                    element
                );


        panel.show();
    }



    /* =====================================================
       SAVE DATA
       ===================================================== */

    function collectWorkspaceData() {

        /*
         * ROW DATA
         */
        const rows =
            Array.from(
                tableBody.querySelectorAll(
                    "tr"
                )
            ).map(
                row => {

                    const cells = {};


                    row
                        .querySelectorAll(
                            ".cb-open-cell-editor"
                        )
                        .forEach(
                            editor => {

                                const field =
                                    editor.dataset.field;


                                if (!field) {
                                    return;
                                }


                                cells[field] = {

                                    text:
                                        editor.innerText ||
                                        "",

                                    fontSize:
                                        editor.style.fontSize ||
                                        "",
                                };
                            }
                        );


                    return {

                        height:
                            row.style.height ||
                            "",

                        cells:
                            cells,
                    };
                }
            );


        /*
         * COLUMN WIDTH
         */
        const columnWidths = {};


        Object.keys(
            DEFAULT_COLUMN_WIDTHS
        ).forEach(
            key => {

                columnWidths[key] =
                    getColumnWidth(key);
            }
        );


        return {

            version:
                1,


            document: {

                aircraft:
                    aircraftModelSelect?.value ||
                    "",

                gibun:
                    gibunInput?.value ||
                    "",

                title:
                    headerTitleInput?.value ||
                    "",
            },


            tableSettings: {

                headerFont:
                    headerFontInput?.value ||
                    "10",

                headerPadding:
                    headerPaddingInput?.value ||
                    "5",

                rowHeight:
                    rowHeightInput?.value ||
                    "34",
            },


            columnWidths:
                columnWidths,


            rows:
                rows,


            savedAt:
                new Date().toISOString(),
        };
    }



    /* =====================================================
       SAVE WORKSPACE
       ===================================================== */

    function saveWorkspace() {

        try {

            const data =
                collectWorkspaceData();


            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(data)
            );


            showSaveMessage(
                "저장되었습니다."
            );


        } catch (error) {

            console.error(
                "C/B OPEN LIST 저장 실패",
                error
            );


            alert(
                "저장 중 오류가 발생했습니다."
            );
        }
    }



    /* =====================================================
       RESTORE WORKSPACE
       ===================================================== */

    function restoreWorkspace() {

        const raw =
            localStorage.getItem(
                STORAGE_KEY
            );


        if (!raw) {

            return false;
        }


        let data;


        try {

            data =
                JSON.parse(raw);

        } catch (error) {

            console.error(
                "저장 데이터 읽기 실패",
                error
            );


            return false;
        }


        /*
         * DOCUMENT INFO
         */
        if (data.document) {

            if (
                aircraftModelSelect &&
                data.document.aircraft
            ) {

                aircraftModelSelect.value =
                    data.document.aircraft;
            }


            if (gibunInput) {

                gibunInput.value =
                    data.document.gibun ||
                    "";
            }


            if (headerTitleInput) {

                headerTitleInput.value =
                    data.document.title ||
                    "CIRCUIT BREAKER OPEN LIST";
            }
        }


        /*
         * TABLE SETTINGS
         */
        if (data.tableSettings) {

            if (headerFontInput) {

                headerFontInput.value =
                    data.tableSettings
                        .headerFont ||
                    "10";
            }


            if (headerPaddingInput) {

                headerPaddingInput.value =
                    data.tableSettings
                        .headerPadding ||
                    "5";
            }


            if (rowHeightInput) {

                rowHeightInput.value =
                    data.tableSettings
                        .rowHeight ||
                    "34";
            }
        }


        /*
         * COLUMN WIDTH
         */
        if (data.columnWidths) {

            Object.entries(
                data.columnWidths
            ).forEach(
                ([key, width]) => {

                    setColumnWidth(
                        key,
                        Number(width),
                        false
                    );
                }
            );
        }


        /*
         * TABLE ROW
         */
        tableBody.innerHTML =
            "";


        selectedEditor =
            null;


        if (
            Array.isArray(data.rows) &&
            data.rows.length > 0
        ) {

            data.rows.forEach(
                (savedRow, index) => {

                    const row =
                        createRow(
                            index + 1
                        );


                    /*
                     * 저장된 행 높이
                     */
                    if (
                        savedRow.height
                    ) {

                        row.style.height =
                            savedRow.height;
                    }


                    /*
                     * CELL DATA
                     */
                    if (
                        savedRow.cells
                    ) {

                        Object.entries(
                            savedRow.cells
                        ).forEach(
                            ([
                                field,
                                cellData
                            ]) => {

                                const editor =
                                    row.querySelector(
                                        `[data-field="${field}"]`
                                    );


                                if (!editor) {
                                    return;
                                }


                                /*
                                 * 예전 저장 방식 대응
                                 */
                                if (
                                    typeof cellData ===
                                    "string"
                                ) {

                                    editor.innerText =
                                        cellData;

                                    return;
                                }


                                editor.innerText =
                                    cellData.text ||
                                    "";


                                if (
                                    cellData.fontSize
                                ) {

                                    editor.style.fontSize =
                                        cellData.fontSize;
                                }
                            }
                        );
                    }


                    tableBody.appendChild(
                        row
                    );
                }
            );

        } else {

            ensureRows(
                DEFAULT_ROWS
            );
        }


        updateRowNumbers();

        updateHeader();

        updateTableSizing();


        return true;
    }



    /* =====================================================
       DELETE SAVE DATA
       ===================================================== */

    function deleteSavedWorkspace() {

        localStorage.removeItem(
            STORAGE_KEY
        );
    }



    /* =====================================================
       SAVE MESSAGE
       ===================================================== */

    function showSaveMessage(message) {

        const oldMessage =
            document.getElementById(
                "cbOpenSaveMessage"
            );


        if (oldMessage) {

            oldMessage.remove();
        }


        const toast =
            document.createElement("div");


        toast.id =
            "cbOpenSaveMessage";


        toast.className =
            "cb-open-save-message";


        const icon =
            document.createElement("i");


        icon.className =
            "bi bi-check-circle-fill";


        const text =
            document.createElement("span");


        text.textContent =
            message;


        toast.appendChild(
            icon
        );


        toast.appendChild(
            text
        );


        document.body.appendChild(
            toast
        );


        requestAnimationFrame(
            () => {

                toast.classList.add(
                    "is-visible"
                );
            }
        );


        setTimeout(
            () => {

                toast.classList.remove(
                    "is-visible"
                );


                setTimeout(
                    () => {

                        toast.remove();

                    },
                    200
                );

            },
            1800
        );
    }



    /* =====================================================
       EVENTS - DOCUMENT INFO
       ===================================================== */

    if (aircraftModelSelect) {

        aircraftModelSelect.addEventListener(
            "change",
            updateHeader
        );
    }



    if (gibunInput) {

        gibunInput.addEventListener(
            "input",
            updateHeader
        );
    }



    if (headerTitleInput) {

        headerTitleInput.addEventListener(
            "input",
            updateHeader
        );
    }



    /* =====================================================
       EVENTS - TABLE SETTINGS
       ===================================================== */

    if (headerFontInput) {

        headerFontInput.addEventListener(
            "input",
            updateTableSizing
        );
    }



    if (headerPaddingInput) {

        headerPaddingInput.addEventListener(
            "input",
            updateTableSizing
        );
    }



    if (rowHeightInput) {

        rowHeightInput.addEventListener(
            "input",
            updateTableSizing
        );
    }



    /* =====================================================
       EVENTS - ADD ROW
       ===================================================== */

    if (addRowButton) {

        addRowButton.addEventListener(
            "click",
            () => {

                ensureRows(
                    tableBody.children.length +
                    1
                );
            }
        );
    }



    /* =====================================================
       EVENTS - SAVE
       ===================================================== */

    if (saveButton) {

        saveButton.addEventListener(
            "click",
            saveWorkspace
        );
    }



    /* =====================================================
       EVENTS - CLEAR
       ===================================================== */

    if (clearButton) {

        clearButton.addEventListener(
            "click",
            () => {

                const confirmed =
                    confirm(
                        "작성한 내용과 저장된 내용을 모두 초기화할까요?"
                    );


                if (!confirmed) {
                    return;
                }


                /*
                 * localStorage 삭제
                 */
                deleteSavedWorkspace();


                /*
                 * 문서 정보 기본값
                 */
                if (gibunInput) {

                    gibunInput.value =
                        "";
                }


                if (headerTitleInput) {

                    headerTitleInput.value =
                        "CIRCUIT BREAKER OPEN LIST";
                }


                /*
                 * 표 설정 기본값
                 */
                if (headerFontInput) {

                    headerFontInput.value =
                        "10";
                }


                if (headerPaddingInput) {

                    headerPaddingInput.value =
                        "5";
                }


                if (rowHeightInput) {

                    rowHeightInput.value =
                        "34";
                }


                applyDefaultColumnWidths();

                clearTable();

                updateHeader();

                updateTableSizing();


                showSaveMessage(
                    "초기화되었습니다."
                );
            }
        );
    }



    /* =====================================================
       EVENTS - SETTINGS
       ===================================================== */

    if (settingsButton) {

        settingsButton.addEventListener(
            "click",
            openSettings
        );
    }



    /* =====================================================
       EVENTS - FIT A4
       ===================================================== */

    if (fitA4Button) {

        fitA4Button.addEventListener(
            "click",
            fitTableToA4
        );
    }



    /* =====================================================
       EVENTS - PREVIEW
       ===================================================== */

    if (previewButton) {

        previewButton.addEventListener(
            "click",
            () => {

                setPreviewMode(
                    !previewMode
                );
            }
        );
    }



    /* =====================================================
       EVENTS - PRINT
       ===================================================== */

    if (printButton) {

        printButton.addEventListener(
            "click",
            () => {

                fitTableToA4();

                window.print();
            }
        );
    }



    /*
     * 브라우저에서 직접 Ctrl + P를 눌러도
     * A4 맞춤
     */
    window.addEventListener(
        "beforeprint",
        () => {

            fitTableToA4();
        }
    );



    /* =====================================================
       EVENTS - CELL FONT
       ===================================================== */

    if (fontDownButton) {

        fontDownButton.addEventListener(
            "click",
            () => {

                changeSelectedFont(
                    -1
                );
            }
        );
    }



    if (fontUpButton) {

        fontUpButton.addEventListener(
            "click",
            () => {

                changeSelectedFont(
                    1
                );
            }
        );
    }



    if (fontResetButton) {

        fontResetButton.addEventListener(
            "click",
            resetSelectedFont
        );
    }



    if (rowResetButton) {

        rowResetButton.addEventListener(
            "click",
            resetSelectedRowHeight
        );
    }



    /* =====================================================
       EVENTS - COLUMN RESET
       ===================================================== */

    if (columnResetButton) {

        columnResetButton.addEventListener(
            "click",
            () => {

                applyDefaultColumnWidths();

                showSaveMessage(
                    "열 너비가 기본값으로 복원되었습니다."
                );
            }
        );
    }



    /* =====================================================
       HEADER DIRECT EDIT
       ===================================================== */

    bindEditableHeader(
        sheetPrefix
    );

    bindEditableHeader(
        sheetGibun
    );

    bindEditableHeader(
        sheetTitle
    );

    bindEditableHeader(
        sheetModel
    );



    /* =====================================================
       INIT
       ===================================================== */

    applyDefaultColumnWidths();

    initColumnInputs();

    initColumnResize();


    /*
     * 저장된 작업이 있으면 자동 복원
     */
    const restored =
        restoreWorkspace();


    /*
     * 저장 데이터가 없으면
     * 기본 화면 생성
     */
    if (!restored) {

        clearTable();

        updateHeader();

        updateTableSizing();
    }

});