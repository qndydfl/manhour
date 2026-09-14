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
         * TAB 데이터는 절대 제목행으로 보지 않습니다.
         *
         * DESCRIPTION에 쉼표가 들어 있어도
         * 정상 4열 TAB 데이터이기 때문입니다.
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
         * 쉼표가 없으면 일반 단독 문장
         */
        if (!line.includes(",")) {
            return false;
        }

        const parts = line.split(",").map(clean).filter(Boolean);

        /*
         * 쉼표로 구분된 의미 있는 내용이
         * 두 개 이상일 때 제목행으로 판단
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
             * TABLE_FIELDS 기준:
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
             * 내부 파싱용 임시 flag
             *
             * 최종 반환 전에 제거합니다.
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
             * 제목 병합행에는 DESCRIPTION을
             * 붙이지 않습니다.
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

            /* =============================================
                   1. HEADER 제거
                   ============================================= */

            if (isAirbusTableHeader(originalLine)) {
                return;
            }

            /* =============================================
                   2. FOR FIN / ON A/C

                   작업 범위 제목은
                   PANEL ~ DESCRIPTION 병합
                   ============================================= */

            if (/^FOR\s+FIN\b/i.test(line) || /\bON\s+A\/C\b/i.test(line)) {
                pushMergedHeading(line);

                return;
            }

            /* =============================================
                   3. TAB DATA

                   가장 먼저 검사합니다.

                   이유:
                   DESCRIPTION 안에 쉼표가 있어도
                   정상 TAB 데이터일 수 있기 때문입니다.
                   ============================================= */

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

                /* -----------------------------------------
                       DESCRIPTION continuation

                       예:

                       [빈 PANEL]
                       Additional description
                       [빈 FIN]
                       [빈 LOCATION]
                       ----------------------------------------- */

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

                    fin: fin,

                    /*
                     * Airbus DESIGNATION
                     * → DESCRIPTION
                     */
                    description: designation,

                    warning: "",
                });

                return;
            }

            /* =============================================
                   4. 일반 For ... 문장

                   FOR FIN은 위에서 이미 처리됨.

                   그 외 For... 문장은
                   이전 DESCRIPTION에 연결
                   ============================================= */

            if (/^for\b/i.test(line)) {
                if (appendDescription(line)) {
                    return;
                }
            }

            /* =============================================
                   5. 쉼표 제목행

                   예:

                   ENGINE 1, LEFT SIDE, COMMON,

                   → PANEL ~ DESCRIPTION 한 행 병합
                   ============================================= */

            if (isMergedHeadingLine(originalLine)) {
                pushMergedHeading(line);

                return;
            }

            /* =============================================
                   6. 나머지 단독 문장

                   이전 DESCRIPTION 뒤에 연결
                   ============================================= */

            appendDescription(line);
        });

        /* =================================================
           내부 임시 flag 제거
           ================================================= */

        return records.map((record) => {
            const { _templateMergedHeading, ...publicRecord } = record;

            return publicRecord;
        });
    }

    /* =====================================================
       BOEING
       ===================================================== */

    const BOEING_HEADER = /^Row\s+Col(?:umn)?\s+Number\s+Name$/i;

    /* =====================================================
       BOEING MANUAL CSV

       입력:

       PANEL,C/B LOC,FIN,DESCRIPTION
       ===================================================== */

    function parseBoeingManualCsv(rawText) {
        const lines = normalizeLines(rawText);

        return lines.map((line, index) => {
            const columns = line.split(",").map((value) => value.trim());

            const [panel_loc, cb_loc, fin] = columns;

            /*
             * DESCRIPTION 안에 쉼표가
             * 있을 수 있으므로 4열 이후는
             * 다시 합칩니다.
             */
            const description = columns.slice(3).join(", ").trim();

            if (columns.length < 4 || !panel_loc || !cb_loc || !description) {
                throw new Error(
                    `${index + 1}번째 줄을 확인해 주세요. PANEL, C/B LOC', FIN, DESCRIPTION 순서로 입력하세요. FIN이 없으면 쉼표 사이를 비워 주세요.`,
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
       BOEING TABLE PARSER

       예:

       P110
       Row Col Number Name
       A 1 101 CABIN LIGHT
       A 2 102 GALLEY POWER
       ===================================================== */

    function parseBoeing(rawText) {
        const lines = normalizeLines(rawText);

        let panel = "";

        let hasHeader = false;

        const records = [];

        for (const rawLine of lines) {
            const line = clean(rawLine);

            /* =============================================
               PANEL TITLE

               P110
               P11A
               ============================================= */

            const panelTitle = line.match(/(?:^|[,\t])\s*(P\d+[A-Z]?)\s*$/i);

            if (panelTitle) {
                panel = panelTitle[1].toUpperCase();

                hasHeader = false;

                continue;
            }

            /* =============================================
               HEADER

               Row Col Number Name
               Row Column Number Name
               ============================================= */

            if (BOEING_HEADER.test(line)) {
                hasHeader = true;

                continue;
            }

            /* =============================================
               PANEL / HEADER 필수
               ============================================= */

            if (!panel || !hasHeader) {
                throw new Error(
                    "보잉 데이터는 패널 제목(P110 등)과 Row Col Number Name 헤더를 함께 복사해 주세요.",
                );
            }

            /* =============================================
               DATA

               Row Col Number Name
               ============================================= */

            const row = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);

            if (!row) {
                throw new Error(`보잉 데이터 형식을 확인해 주세요: ${line}`);
            }

            records.push({
                cockpit: "",
                ee: "",
                etc: "",

                panel_loc: panel,

                /*
                 * Row + Col
                 * → C/B LOC'
                 */
                cb_loc: `${row[1]} ${row[2]}`,

                fin: "",

                /*
                 * Number는 현재 C/B 문서에서
                 * 별도 저장하지 않고
                 * Name을 DESCRIPTION으로 사용
                 */
                description: row[4],

                warning: "",
            });
        }

        if (!records.length) {
            throw new Error("붙여넣을 보잉 데이터 행이 없습니다.");
        }

        return records;
    }

    /* =====================================================
       PUBLIC API
       ===================================================== */

    function parseClipboard(rawText, format = "auto") {
        const text = String(rawText ?? "");

        const lines = normalizeLines(text);

        /*
         * 빈 값
         */
        if (!lines.length) {
            return [];
        }

        /* =================================================
           직접 FORMAT 지정
           ================================================= */

        if (format === "boeing-manual") {
            return parseBoeingManualCsv(text);
        }

        if (format === "boeing") {
            return parseBoeing(text);
        }

        if (format === "airbus" || format === "general") {
            return parseAirbus(text);
        }

        if (format !== "auto") {
            throw new Error(`지원하지 않는 붙여넣기 형식입니다: ${format}`);
        }

        /* =================================================
           AUTO DETECT

           Boeing Header가 존재하면 Boeing,
           아니면 Airbus/General
           ================================================= */

        if (looksLikeBoeing(lines)) {
            return parseBoeing(text);
        }

        return parseAirbus(text);
    }

    /* =====================================================
       BROWSER GLOBAL
       ===================================================== */

    root.parseCBClipboard = parseClipboard;

    /* =====================================================
       NODE / TEST
       ===================================================== */

    if (typeof module !== "undefined" && module.exports) {
        module.exports = parseClipboard;
    }
})(globalThis);
