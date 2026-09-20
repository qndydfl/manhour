(function (root) {
    "use strict";

    /* =====================================================
       BASIC UTIL
       ===================================================== */

    function clean(value) {
        return String(value ?? "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizeLines(rawText) {
        return String(rawText ?? "")
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
    }

    /* =====================================================
       AIRBUS HEADER
       ===================================================== */

    function isAirbusTableHeader(line) {
        const value = clean(line)
            .toUpperCase()
            .replace(/[,\t]+/g, " ");

        const hasPanel = /\bPANEL\b/.test(value);

        const hasDesignation =
            /\bDESIGNATION\b/.test(value) || /\bDESCRIPTION\b/.test(value);

        const hasFin = /\bFIN\b/.test(value);

        const hasLocation =
            /\bLOCATION\b/.test(value) ||
            /\bC\/B\s*LOC'?\b/.test(value) ||
            /\bCB\s*LOC'?\b/.test(value) ||
            /\bLOC'?\b/.test(value);

        return hasPanel && hasDesignation && hasFin && hasLocation;
    }

    /* =====================================================
       AIRBUS MERGED HEADING
       ===================================================== */

    function isMergedHeadingLine(originalLine) {
        const raw = String(originalLine ?? "");

        /*
         * TAB 데이터는 제목행으로 보지 않습니다.
         *
         * DESCRIPTION 안에 쉼표가 있어도
         * 정상적인 4열 TAB 데이터일 수 있습니다.
         */
        if (raw.includes("\t")) {
            return false;
        }

        const line = clean(raw);

        /*
         * 원본 HEADER 제외
         */
        if (isAirbusTableHeader(line)) {
            return false;
        }

        /*
         * 쉼표가 없는 일반 문장은
         * 병합 제목으로 처리하지 않습니다.
         */
        if (!line.includes(",")) {
            return false;
        }

        const parts = line.split(",").map(clean).filter(Boolean);

        /*
         * 쉼표로 구분된 의미 있는 내용이
         * 2개 이상일 때 제목행으로 판단합니다.
         */
        return parts.length >= 2;
    }

    function makeMergedHeading(line) {
        return {
            cockpit: "",
            ee: "",
            etc: "",

            panel_loc: clean(line),

            cb_loc: "",
            fin: "",
            description: "",
            warning: "",

            /*
             * PANEL ~ DESCRIPTION
             *
             * panel_loc
             * cb_loc
             * fin
             * description
             *
             * 총 4칸 병합
             */
            _merges: [
                {
                    field: "panel_loc",
                    rows: 1,
                    cols: 4,
                },
            ],

            /*
             * 내부 파싱용 임시 Flag
             */
            _templateMergedHeading: true,
        };
    }

    /* =====================================================
       AIRBUS / GENERAL PARSER
       ===================================================== */

    function parseAirbus(rawText) {
        const lines = normalizeLines(rawText);

        const records = [];

        /* =================================================
           DESCRIPTION CONTINUATION
           ================================================= */

        function appendDescription(text) {
            if (!records.length) {
                return false;
            }

            const previous = records.at(-1);

            /*
             * 병합 제목행에는
             * DESCRIPTION을 붙이지 않습니다.
             */
            if (previous._templateMergedHeading) {
                return false;
            }

            const value = clean(text);

            if (!value) {
                return false;
            }

            previous.description = [clean(previous.description), value]
                .filter(Boolean)
                .join(" ");

            return true;
        }

        /* =================================================
           MERGED HEADING ADD
           ================================================= */

        function pushMergedHeading(line) {
            records.push(makeMergedHeading(line));
        }

        /* =================================================
           LINE PARSE
           ================================================= */

        lines.forEach((originalLine) => {
            /*
             * 비교용 문자열
             *
             * originalLine은 TAB 보존용으로
             * 별도로 계속 사용합니다.
             */
            const line = clean(originalLine);

            if (!line) {
                return;
            }

            /* =========================================
                   1. HEADER 제거
                   ========================================= */

            if (isAirbusTableHeader(originalLine)) {
                return;
            }

            /* =========================================
                   2. FOR FIN / ON A/C

                   작업 범위 제목은
                   PANEL ~ DESCRIPTION 병합
                   ========================================= */

            if (/^FOR\s+FIN\b/i.test(line) || /\bON\s+A\/C\b/i.test(line)) {
                pushMergedHeading(line);

                return;
            }

            /* =========================================
                   3. TAB DATA

                   가장 먼저 검사합니다.

                   DESCRIPTION 안에 쉼표가 있어도
                   정상 TAB 데이터일 수 있습니다.
                   ========================================= */

            if (originalLine.includes("\t")) {
                const columns = originalLine.split("\t").map(clean);

                /*
                 * TAB 형태 Header 재확인
                 */
                if (isAirbusTableHeader(columns.join(" "))) {
                    return;
                }

                const panel = columns[0] || "";

                const designation = columns[1] || "";

                const fin = columns[2] || "";

                const location = columns[3] || "";

                /* -------------------------------------
                       DESCRIPTION continuation

                       빈 PANEL
                       DESCRIPTION
                       빈 FIN
                       빈 LOCATION
                       ------------------------------------- */

                if (!panel && designation && !fin && !location) {
                    if (appendDescription(designation)) {
                        return;
                    }
                }

                records.push({
                    cockpit: "",
                    ee: "",
                    etc: "",

                    panel_loc: panel,

                    /*
                     * Airbus LOCATION
                     * → C/B LOC'
                     */
                    cb_loc: location,

                    fin,

                    /*
                     * Airbus DESIGNATION
                     * → DESCRIPTION
                     */
                    description: designation,

                    warning: "",
                });

                return;
            }

            /* =========================================
                   4. 일반 For ... 문장

                   FOR FIN은 위에서 이미 처리됨.
                   나머지는 이전 DESCRIPTION에 연결
                   ========================================= */

            if (/^for\b/i.test(line)) {
                if (appendDescription(line)) {
                    return;
                }
            }

            /* =========================================
                   5. 쉼표 제목행

                   ENGINE 1, LEFT SIDE, COMMON,

                   → PANEL ~ DESCRIPTION 병합
                   ========================================= */

            if (isMergedHeadingLine(originalLine)) {
                pushMergedHeading(line);

                return;
            }

            /* =========================================
                   6. 나머지 단독 문장

                   이전 DESCRIPTION 뒤에 연결
                   ========================================= */

            appendDescription(line);
        });

        /* =================================================
           내부 임시 Flag 제거
           ================================================= */

        return records.map((record) => {
            const { _templateMergedHeading, ...publicRecord } = record;

            return publicRecord;
        });
    }

    /* =====================================================
       BOEING
       ===================================================== */

    const BOEING_HEADER =
        /^Row\s*(?:,|\s+)\s*Col(?:umn)?\s*(?:,|\s+)\s*Number\s*(?:,|\s+)\s*Name$/i;

    /* =====================================================
       BOEING PANEL
       ===================================================== */

    function extractPanelCode(line) {
        const match = clean(line).match(/\bP\d+[A-Z]?\b/i);

        return match ? match[0].toUpperCase() : "";
    }

    /* =====================================================
       BOEING TOKEN CHECK
       ===================================================== */

    function isBoeingRowToken(value) {
        return (
            typeof value === "string" && /^[A-Z][A-Z0-9]*$/i.test(value.trim())
        );
    }

    function isBoeingColToken(value) {
        return typeof value === "string" && /^\d+$/.test(value.trim());
    }

    /*
     * Boeing Circuit Breaker Number
     *
     * 예:
     *
     * C27607
     * C27630
     *
     * 현재 C/B OPEN LIST에서는
     * 이 값을 FIN으로 사용하지 않습니다.
     *
     * Boeing 행을 구분하기 위한
     * 데이터로만 사용합니다.
     */
    function isBoeingNumberToken(value) {
        return (
            typeof value === "string" &&
            /^[A-Z]+\d+[A-Z0-9-]*$/i.test(value.trim())
        );
    }

    /* =====================================================
       BOEING MANUAL CSV
       ===================================================== */

    /*
     * 직접 입력 형식:
     *
     * PANEL,C/B LOC,FIN,DESCRIPTION
     *
     * 예:
     *
     * P210,K 5,,SLATS PRI DR CTRL 2
     * P210,K 8,,SLATS ELEC CTRL RLY PWR
     */
    function parseBoeingManualCsv(rawText) {
        const lines = normalizeLines(rawText);

        return lines.map((line, index) => {
            const columns = line.split(",").map((value) => value.trim());

            const [panel_loc, cb_loc, fin] = columns;

            /*
             * DESCRIPTION 안에 쉼표가
             * 있을 수 있으므로
             * 4열 이후는 다시 합칩니다.
             */
            const description = columns.slice(3).join(", ").trim();

            if (columns.length < 4 || !panel_loc || !cb_loc || !description) {
                throw new Error(
                    `${index + 1}번째 줄을 확인해 주세요. ` +
                        "PANEL, C/B LOC', FIN, DESCRIPTION 순서로 입력하세요. " +
                        "FIN이 없으면 쉼표 사이를 비워 주세요.",
                );
            }

            return {
                cockpit: "",
                ee: "",
                etc: "",

                panel_loc,
                cb_loc,
                fin,
                description,

                warning: "",
            };
        });
    }

    /* =====================================================
       BOEING AUTO DETECTION
       ===================================================== */

    function looksLikeBoeing(lines) {
        return lines.some((line) => BOEING_HEADER.test(clean(line)));
    }

    /* =====================================================
       BOEING SINGLE LINE
       ===================================================== */

    /*
     * 지원:
     *
     * K 5 C27607 SLATS PRI DR CTRL 2
     *
     * 또는
     *
     * K,5,C27607,SLATS PRI DR CTRL 2
     */

    function parseBoeingRowLine(line) {
        const raw = clean(line);

        if (!raw) {
            return null;
        }

        /*
         * AAR107...
         * AAR116...
         * AARALL
         *
         * C/B 데이터로 절대 처리하지 않음
         */
        if (/^AAR(?:\s|,|\d|ALL\b)/i.test(raw)) {
            return null;
        }

        if (raw.includes(",")) {
            const cells = raw.split(",").map((value) => clean(value));

            if (cells.length >= 4) {
                const row = cells[0];

                const col = cells[1];

                const number = cells[2];

                const description = cells.slice(3).join(" ").trim();

                if (
                    isBoeingRowToken(row) &&
                    isBoeingColToken(col) &&
                    isBoeingNumberToken(number) &&
                    description
                ) {
                    return {
                        row,
                        col,
                        number,
                        description,
                    };
                }
            }
        }

        const tokens = raw.split(/\s+/).filter(Boolean);

        if (tokens.length >= 4) {
            const row = tokens[0];

            const col = tokens[1];

            const number = tokens[2];

            const description = tokens.slice(3).join(" ").trim();

            if (
                isBoeingRowToken(row) &&
                isBoeingColToken(col) &&
                isBoeingNumberToken(number) &&
                description
            ) {
                return {
                    row,
                    col,
                    number,
                    description,
                };
            }
        }

        return null;
    }

    /* =====================================================
       BOEING TABLE PARSER
       ===================================================== */

    function parseBoeing(rawText) {
        const lines = String(rawText ?? "")
            .replace(/\r/g, "")
            .replace(/\u00a0/g, " ")
            .split("\n")
            .map((line) => clean(line))
            .filter(Boolean);

        const records = [];

        /* =====================================================
        AAR / EFFECTIVITY
        ===================================================== */

        function isEffectivityLine(line) {
            return /^AAR(?:\s|,|\d|ALL\b)/i.test(clean(line));
        }

        function normalizeEffectivity(line) {
            return clean(line)
                .replace(/^AAR(?=\d)/i, "AAR ")
                .replace(/^AARALL\b/i, "AAR ALL");
        }

        function makeEffectivityRecord(line) {
            return {
                cockpit: "",
                ee: "",
                etc: "",

                panel_loc: normalizeEffectivity(line),

                cb_loc: "",
                fin: "",
                description: "",
                warning: "",

                _merges: [
                    {
                        field: "panel_loc",
                        rows: 1,
                        cols: 4,
                    },
                ],
            };
        }

        /* =====================================================
        PANEL
        ===================================================== */

        function isPanelTitle(line) {
            const value = clean(line);

            return /\bPanel\b/i.test(value) && Boolean(extractPanelCode(value));
        }

        /* =====================================================
        C/B RECORD
        ===================================================== */

        function makeRecord(panel, row, col, description) {
            return {
                cockpit: "",
                ee: "",
                etc: "",

                panel_loc: panel,

                cb_loc: `${clean(row)} ${clean(col)}`,

                /*
                 * Boeing Number는
                 * 현재 FIN에 넣지 않습니다.
                 */
                fin: "",

                description: clean(description),

                warning: "",
            };
        }

        /* =====================================================
        PANEL BLOCK 분리
        ===================================================== */

        const blocks = [];

        let currentBlock = null;

        for (const line of lines) {
            if (isPanelTitle(line)) {
                if (currentBlock) {
                    blocks.push(currentBlock);
                }

                currentBlock = {
                    panel: extractPanelCode(line),

                    lines: [],
                };

                continue;
            }

            if (!currentBlock) {
                continue;
            }

            currentBlock.lines.push(line);
        }

        if (currentBlock) {
            blocks.push(currentBlock);
        }

        if (!blocks.length) {
            throw new Error("Boeing Panel 정보(P210 등)를 찾을 수 없습니다.");
        }

        /* =====================================================
        PANEL별 처리
        ===================================================== */

        for (const block of blocks) {
            const panel = block.panel;

            const blockLines = block.lines;

            /* =================================================
            HEADER 찾기
            ================================================= */

            const headerIndex = blockLines.findIndex((line) =>
                BOEING_HEADER.test(clean(line)),
            );

            if (headerIndex < 0) {
                continue;
            }

            const dataLines = blockLines.slice(headerIndex + 1);

            if (!dataLines.length) {
                continue;
            }

            /* =================================================
            AAR 존재 여부
            ================================================= */

            const hasEffectivity = dataLines.some((line) =>
                isEffectivityLine(line),
            );

            /* =================================================
            CASE 1
            AAR 없는 PANEL

            P210:

            K
            K
            5
            8
            C27607
            C27630
            DESCRIPTION 1
            DESCRIPTION 2
            ================================================= */

            if (!hasEffectivity) {
                /* =================================================
            1. 완전한 ROW-MAJOR

            K 5 C27607 DESCRIPTION
            ================================================= */

                const normalRecords = [];

                for (const line of dataLines) {
                    const parsed = parseBoeingRowLine(line);

                    if (!parsed) {
                        continue;
                    }

                    normalRecords.push(
                        makeRecord(
                            panel,
                            parsed.row,
                            parsed.col,
                            parsed.description,
                        ),
                    );
                }

                /*
                 * 모든 C/B가 한 줄 완성형인 경우만
                 * 여기서 바로 반환합니다.
                 *
                 * mixed 형식에서는 마지막 한 줄만
                 * parseBoeingRowLine()에 잡힐 수 있으므로
                 * normalRecords가 있다고 무조건 반환하면 안 됩니다.
                 */
                if (
                    normalRecords.length > 0 &&
                    normalRecords.length === dataLines.length
                ) {
                    records.push(...normalRecords);

                    continue;
                }

                /* =================================================
            2. TWO-LINE

            P
            23 C78605 L ENG T/R CTRL

            이 형식은 정확히 2줄일 때 처리
            ================================================= */

                if (
                    dataLines.length === 2 &&
                    isBoeingRowToken(dataLines[0]) &&
                    !isBoeingNumberToken(dataLines[0])
                ) {
                    const match = clean(dataLines[1]).match(
                        /^(\d+)\s+([A-Z]+\d+[A-Z0-9-]*)\s+(.+)$/i,
                    );

                    if (match) {
                        const col = clean(match[1]);

                        const number = clean(match[2]);

                        const description = clean(match[3]);

                        if (
                            isBoeingColToken(col) &&
                            isBoeingNumberToken(number) &&
                            description
                        ) {
                            records.push(
                                makeRecord(
                                    panel,
                                    dataLines[0],
                                    col,
                                    description,
                                ),
                            );

                            continue;
                        }
                    }
                }

                /* =================================================
            3. MIXED COLUMN-MAJOR

            지원 예 1:

            K
            K
            5
            8
            C27607
            C27630
            DESCRIPTION 1
            DESCRIPTION 2


            지원 예 2:

            A
            A
            E
            E
            1
            2
            1
            C74401
            C74407
            C74403
            DESCRIPTION 1
            DESCRIPTION 2
            DESCRIPTION 3
            14 C74405 DESCRIPTION 4

            두 번째 형식에서는 마지막 ROW(E)는
            ROW 영역에 있지만,

            COL + NUMBER + DESCRIPTION은
            마지막 줄에 같이 있습니다.
            ================================================= */

                /* -------------------------------------------------
            시작 부분의 ROW token을 모두 수집
            ------------------------------------------------- */

                const rows = [];

                let cursor = 0;

                while (
                    cursor < dataLines.length &&
                    isBoeingRowToken(dataLines[cursor]) &&
                    !isBoeingNumberToken(dataLines[cursor])
                ) {
                    rows.push(clean(dataLines[cursor]));

                    cursor += 1;
                }

                if (!rows.length) {
                    continue;
                }

                const rowCount = rows.length;

                /* -------------------------------------------------
            남은 데이터에서 마지막 Mixed Line 확인

            예:

            14 C74405 L ENG IGN 2

            여기에는 ROW는 없습니다.
            마지막 ROW(E)는 rows 배열에 이미 존재합니다.
            ------------------------------------------------- */

                let mixedTail = null;

                if (cursor < dataLines.length) {
                    const lastLine = clean(dataLines.at(-1));

                    const match = lastLine.match(
                        /^(\d+)\s+([A-Z]+\d+[A-Z0-9-]*)\s+(.+)$/i,
                    );

                    if (match) {
                        mixedTail = {
                            col: clean(match[1]),

                            number: clean(match[2]),

                            description: clean(match[3]),
                        };
                    }
                }

                /*
                 * Mixed Tail이 있으면
                 * 앞부분에는 rowCount - 1개의
                 * 완전한 column-major 데이터가 있어야 합니다.
                 *
                 * 마지막 ROW는 mixedTail과 결합합니다.
                 */
                const regularCount = mixedTail ? rowCount - 1 : rowCount;

                if (regularCount < 0) {
                    continue;
                }

                /* =================================================
            4. COL 추출
            ================================================= */

                const cols = [];

                for (let index = 0; index < regularCount; index += 1) {
                    if (cursor >= dataLines.length) {
                        break;
                    }

                    const value = clean(dataLines[cursor]);

                    if (!isBoeingColToken(value)) {
                        break;
                    }

                    cols.push(value);

                    cursor += 1;
                }

                if (cols.length !== regularCount) {
                    continue;
                }

                /* =================================================
            5. NUMBER 추출
            ================================================= */

                const numbers = [];

                for (let index = 0; index < regularCount; index += 1) {
                    if (cursor >= dataLines.length) {
                        break;
                    }

                    const value = clean(dataLines[cursor]);

                    if (!isBoeingNumberToken(value)) {
                        break;
                    }

                    numbers.push(value);

                    cursor += 1;
                }

                if (numbers.length !== regularCount) {
                    continue;
                }

                /* =================================================
            6. DESCRIPTION 추출
            ================================================= */

                const descriptions = [];

                /*
                 * Mixed Tail이 있으면 마지막 줄은 제외
                 */
                const descriptionEnd = mixedTail
                    ? dataLines.length - 1
                    : dataLines.length;

                while (cursor < descriptionEnd) {
                    descriptions.push(clean(dataLines[cursor]));

                    cursor += 1;
                }

                if (descriptions.length < regularCount) {
                    continue;
                }

                /* =================================================
            7. 일반 COLUMN-MAJOR 행 생성
            ================================================= */

                for (let index = 0; index < regularCount; index += 1) {
                    records.push(
                        makeRecord(
                            panel,
                            rows[index],
                            cols[index],
                            descriptions[index],
                        ),
                    );
                }

                /* =================================================
            8. 마지막 MIXED 행

            rows 마지막:
            E

            mixedTail:
            14 C74405 L ENG IGN 2

            →

            P11 | E 14 | | L ENG IGN 2
            ================================================= */

                if (mixedTail) {
                    records.push(
                        makeRecord(
                            panel,
                            rows[rowCount - 1],
                            mixedTail.col,
                            mixedTail.description,
                        ),
                    );
                }

                continue;
            }

            /* =================================================
            CASE 2
            AAR 있는 PANEL

            P200 / P310
            ================================================= */

            /*
             * AAR 기준으로 먼저 Group을 나눕니다.
             */
            const groups = [];

            let currentGroup = null;

            for (const line of dataLines) {
                if (isEffectivityLine(line)) {
                    if (currentGroup) {
                        groups.push(currentGroup);
                    }

                    currentGroup = {
                        effectivity: line,

                        lines: [],
                    };

                    continue;
                }

                if (!currentGroup) {
                    continue;
                }

                currentGroup.lines.push(line);
            }

            if (currentGroup) {
                groups.push(currentGroup);
            }

            if (!groups.length) {
                continue;
            }

            /* =================================================
            AAR GROUP에서

            ROW
            COL
            NUMBER

            만 먼저 추출합니다.

            DESCRIPTION은 나중에 별도로 배정합니다.
            ================================================= */

            const cbItems = [];

            const descriptionPool = [];

            for (
                let groupIndex = 0;
                groupIndex < groups.length;
                groupIndex += 1
            ) {
                const group = groups[groupIndex];

                const groupLines = group.lines;

                let row = "";
                let col = "";
                let number = "";

                let consumedCount = 0;

                /* =============================================
                형태 1

                B
                3
                C27300

                또는

                D
                8
                C27300
                ============================================= */

                if (
                    groupLines.length >= 3 &&
                    isBoeingRowToken(groupLines[0]) &&
                    isBoeingColToken(groupLines[1]) &&
                    isBoeingNumberToken(groupLines[2])
                ) {
                    row = clean(groupLines[0]);

                    col = clean(groupLines[1]);

                    number = clean(groupLines[2]);

                    consumedCount = 3;
                }

                /* =============================================
                형태 2

                G
                12 C27606 SLATS PRI DR CTRL 1

                P310 형태
                ============================================= */

                if (
                    !row &&
                    groupLines.length >= 2 &&
                    isBoeingRowToken(groupLines[0])
                ) {
                    const inlineMatch = clean(groupLines[1]).match(
                        /^(\d+)\s+([A-Z]+\d+[A-Z0-9-]*)\s+(.+)$/i,
                    );

                    if (inlineMatch) {
                        row = clean(groupLines[0]);

                        col = clean(inlineMatch[1]);

                        number = clean(inlineMatch[2]);

                        /*
                         * P310은 DESCRIPTION이
                         * 같은 줄에 들어 있습니다.
                         */
                        const inlineDescription = clean(inlineMatch[3]);

                        cbItems.push({
                            effectivity: group.effectivity,

                            row,
                            col,
                            number,

                            description: inlineDescription,
                        });

                        /*
                         * 나머지 Line이 있다면
                         * DESCRIPTION Pool에 보관
                         */
                        groupLines.slice(2).forEach((line) => {
                            const value = clean(line);

                            if (value) {
                                descriptionPool.push(value);
                            }
                        });

                        continue;
                    }
                }

                /* =============================================
                형태 3

                G 12 C27606 DESCRIPTION
                ============================================= */

                if (!row) {
                    const joined = groupLines.join(" ");

                    const inlineMatch = clean(joined).match(
                        /^([A-Z][A-Z0-9]*)\s+(\d+)\s+([A-Z]+\d+[A-Z0-9-]*)\s+(.+)$/i,
                    );

                    if (inlineMatch) {
                        cbItems.push({
                            effectivity: group.effectivity,

                            row: clean(inlineMatch[1]),

                            col: clean(inlineMatch[2]),

                            number: clean(inlineMatch[3]),

                            description: clean(inlineMatch[4]),
                        });

                        continue;
                    }
                }

                /* =============================================
                B / 3 / C27300 형태
                ============================================= */

                if (row && col && number) {
                    cbItems.push({
                        effectivity: group.effectivity,

                        row,
                        col,
                        number,

                        /*
                         * 아직 DESCRIPTION 없음
                         */
                        description: "",
                    });

                    /*
                     * Row / Col / Number 뒤의 모든 문자열은
                     * DESCRIPTION Pool로 보냅니다.
                     *
                     * P200 두 번째 Group:
                     *
                     * D
                     * 8
                     * C27300
                     * SLATS ELEC MOT PWR
                     * SLATS ELEC MOT PWR
                     *
                     * ↓
                     *
                     * Pool:
                     *
                     * [
                     *   "SLATS ELEC MOT PWR",
                     *   "SLATS ELEC MOT PWR"
                     * ]
                     */
                    groupLines.slice(consumedCount).forEach((line) => {
                        const value = clean(line);

                        if (value) {
                            descriptionPool.push(value);
                        }
                    });
                }
            }

            /* =================================================
            DESCRIPTION 배정

            DESCRIPTION이 비어 있는 C/B에
            Pool을 순서대로 하나씩 배정합니다.
            ================================================= */

            let descriptionIndex = 0;

            for (const item of cbItems) {
                /*
                 * P310처럼 이미 DESCRIPTION이 있으면
                 * 그대로 유지
                 */
                if (clean(item.description)) {
                    continue;
                }

                if (descriptionIndex < descriptionPool.length) {
                    item.description = clean(descriptionPool[descriptionIndex]);

                    descriptionIndex += 1;
                }
            }

            /* =================================================
            AAR + C/B 출력
            ================================================= */

            for (const item of cbItems) {
                /*
                 * AAR
                 *
                 * 4열 병합
                 */
                records.push(makeEffectivityRecord(item.effectivity));

                /*
                 * DESCRIPTION이 없으면
                 * 불완전한 데이터이므로 C/B는 생략
                 */
                if (!clean(item.description)) {
                    continue;
                }

                /*
                 * C/B
                 */
                records.push(
                    makeRecord(panel, item.row, item.col, item.description),
                );
            }
        }

        /* =====================================================
        FINAL
        ===================================================== */

        if (!records.length) {
            throw new Error(
                "붙여넣을 Boeing C/B 데이터 행을 찾을 수 없습니다.",
            );
        }

        return records;
    }

    /* =====================================================
       PUBLIC API
       ===================================================== */

    function parseClipboard(rawText, format = "auto") {
        const text = String(rawText ?? "");

        const lines = normalizeLines(text);

        if (!lines.length) {
            return [];
        }

        /* -------------------------------------------------
           BOEING MANUAL DIRECT INPUT
           ------------------------------------------------- */

        if (format === "boeing-manual") {
            return parseBoeingManualCsv(text);
        }

        /* -------------------------------------------------
           BOEING
           ------------------------------------------------- */

        if (format === "boeing") {
            return parseBoeing(text);
        }

        /* -------------------------------------------------
           AIRBUS / GENERAL
           ------------------------------------------------- */

        if (format === "airbus" || format === "general") {
            return parseAirbus(text);
        }

        /* -------------------------------------------------
           UNKNOWN FORMAT
           ------------------------------------------------- */

        if (format !== "auto") {
            throw new Error(`지원하지 않는 붙여넣기 형식입니다: ${format}`);
        }

        /* -------------------------------------------------
           AUTO DETECTION
           ------------------------------------------------- */

        if (looksLikeBoeing(lines)) {
            return parseBoeing(text);
        }

        return parseAirbus(text);
    }

    /* =====================================================
       BROWSER GLOBAL
       ===================================================== */

    /*
     * cb_open_list.js에서:
     *
     * window.parseCBClipboard(...)
     *
     * 형태로 호출할 수 있도록 등록합니다.
     */
    if (typeof window !== "undefined") {
        window.parseCBClipboard = parseClipboard;
    }

    /* =====================================================
       NODE / TEST
       ===================================================== */

    if (typeof module !== "undefined" && module.exports) {
        module.exports = parseClipboard;
    }
})(globalThis);
