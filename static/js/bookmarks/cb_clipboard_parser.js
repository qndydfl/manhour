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
    AIRBUS VERTICAL TABLE
    ===================================================== */

    function parseVerticalAirbusTable(rawText) {
        const rawLines = String(rawText ?? "")
            .replace(/\r\n?/g, "\n")
            .split("\n");

        const headerIndexes = [];

        for (let index = 0; index < rawLines.length; index += 1) {
            if (!clean(rawLines[index])) {
                continue;
            }

            headerIndexes.push(index);

            if (headerIndexes.length === 4) {
                break;
            }
        }

        const headers = headerIndexes.map((index) =>
            clean(rawLines[index]).toUpperCase(),
        );

        const matches =
            headers.length === 4 &&
            headers[0] === "PANEL" &&
            ["DESIGNATION", "DESCRIPTION"].includes(headers[1]) &&
            headers[2] === "FIN" &&
            ["LOCATION", "C/B LOC'", "C/B LOC", "CB LOC'", "CB LOC"].includes(
                headers[3],
            );

        if (!matches) {
            return null;
        }

        const values = rawLines
            .slice(headerIndexes[3] + 1)
            .map((value) => clean(value));

        while (values.length && !values[values.length - 1]) {
            values.pop();
        }

        const records = [];

        for (let index = 0; index < values.length; index += 4) {
            const [panel, designation, fin, location] = values.slice(
                index,
                index + 4,
            );

            if (![panel, designation, fin, location].some(Boolean)) {
                continue;
            }

            records.push({
                cockpit: "",
                ee: "",
                etc: "",

                panel_loc: panel || "",
                cb_loc: location || "",
                fin: fin || "",
                description: designation || "",

                warning: "",
            });
        }

        return records;
    }

    /* =====================================================
    AIRBUS MERGED HEADING
    ===================================================== */

    function isMergedHeadingLine(originalLine) {
        const raw = String(originalLine ?? "");

        /*
         * TAB 데이터는 제목행으로
         * 처리하지 않습니다.
         */
        if (raw.includes("\t")) {
            return false;
        }

        const line = clean(raw);

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
             * PANEL
             * C/B LOC'
             * FIN
             * DESCRIPTION
             *
             * 4칸 병합
             */
            _merges: [
                {
                    field: "panel_loc",
                    rows: 1,
                    cols: 4,
                },
            ],

            _templateMergedHeading: true,
        };
    }

    /* =====================================================
    AIRBUS / GENERAL PARSER
    ===================================================== */

    function parseAirbus(rawText) {
        const lines = normalizeLines(rawText);

        const records = [];

        /* =============================================
        DESCRIPTION CONTINUATION
        ============================================= */

        function appendDescription(text) {
            if (!records.length) {
                return false;
            }

            const previous = records[records.length - 1];

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

        function pushMergedHeading(line) {
            records.push(makeMergedHeading(line));
        }

        lines.forEach((originalLine) => {
            const line = clean(originalLine);

            if (!line) {
                return;
            }

            /* -----------------------------
            HEADER
            ----------------------------- */

            if (isAirbusTableHeader(originalLine)) {
                return;
            }

            /* -----------------------------
            FOR FIN / ON A/C
            ----------------------------- */

            if (/^FOR\s+FIN\b/i.test(line) || /\bON\s+A\/C\b/i.test(line)) {
                pushMergedHeading(line);

                return;
            }

            /* -----------------------------
            TAB DATA
            ----------------------------- */

            if (originalLine.includes("\t")) {
                const columns = originalLine.split("\t").map(clean);

                if (isAirbusTableHeader(columns.join(" "))) {
                    return;
                }

                const panel = columns[0] || "";

                const designation = columns[1] || "";

                const fin = columns[2] || "";

                const location = columns[3] || "";

                /*
                 * DESCRIPTION continuation
                 */
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
                    cb_loc: location,
                    fin,
                    description: designation,

                    warning: "",
                });

                return;
            }

            /* -----------------------------
            일반 FOR 문장
            ----------------------------- */

            if (/^for\b/i.test(line)) {
                if (appendDescription(line)) {
                    return;
                }
            }

            /* -----------------------------
            쉼표 제목행
            ----------------------------- */

            if (isMergedHeadingLine(originalLine)) {
                pushMergedHeading(line);

                return;
            }

            /* -----------------------------
            DESCRIPTION continuation
            ----------------------------- */

            appendDescription(line);
        });

        /*
         * 내부 flag 제거
         */
        return records.map((record) => {
            const { _templateMergedHeading, ...publicRecord } = record;

            return publicRecord;
        });
    }

    /* =====================================================
    BOEING — SEMANTIC PDF PARSER V2

    목적:
    Boeing PDF Clipboard가 화면과 다른 순서로 복사되어도

    PANEL
    ROW
    COL
    NUMBER
    DESCRIPTION
    AAR

    의미를 먼저 추출한 뒤 최종적으로:

    PANEL | C/B LOC' | FIN | DESCRIPTION

    형태로 복원합니다.

    Boeing Number는 행 복원에만 사용하고
    최종 OPEN LIST에는 저장하지 않습니다.
    ===================================================== */

    const BOEING_HEADER =
        /^Row\s*(?:,|\s+)\s*Col(?:umn)?\s*(?:,|\s+)\s*Number\s*(?:,|\s+)\s*Name$/i;

    /* =====================================================
    PANEL
    ===================================================== */

    function extractPanelCode(line) {
        const match = clean(line).match(
            /\bP\d+[A-Z]?\b/i,
        );

        return match
            ? match[0].toUpperCase()
            : "";
    }

    function isBoeingPanelTitle(line) {
        const value = clean(line);

        return (
            /panel/i.test(value) &&
            Boolean(
                extractPanelCode(value),
            )
        );
    }

    /* =====================================================
    BASIC TOKEN
    ===================================================== */

    function isBoeingNumberToken(value) {
        return /^[A-Z]+\d+[A-Z0-9-]*$/i.test(
            clean(value),
        );
    }

    function isBoeingRowToken(value) {
        const token = clean(value);

        if (!token) {
            return false;
        }

        /*
         * C28001 같은 Number가
         * ROW로 오인되지 않도록 제외
         */
        if (
            isBoeingNumberToken(token)
        ) {
            return false;
        }

        /*
         * 일반 Boeing Row:
         *
         * A
         * B
         * C
         * ...
         * AA
         * AB
         *
         * 필요하면 향후 확장 가능
         */
        return /^[A-Z]{1,2}$/i.test(
            token,
        );
    }

    function isBoeingColToken(value) {
        return /^\d+$/.test(
            clean(value),
        );
    }

    /* =====================================================
    AAR
    ===================================================== */

    function isBoeingEffectivity(value) {
        return /^AAR/i.test(
            clean(value),
        );
    }

    function normalizeBoeingEffectivity(value) {
        const raw = clean(value);

        if (
            !isBoeingEffectivity(raw)
        ) {
            return raw;
        }

        const body = raw
            .replace(/^AAR/i, "")
            .trim();

        return body
            ? `AAR ${body}`
            : "AAR";
    }

    /* =====================================================
    PDF NOISE
    ===================================================== */

    function isBoeingNoiseLine(value) {
        const line = clean(value);

        if (!line) {
            return true;
        }

        /*
        * Boeing PDF 문서 구조
        */
        if (/^SUBTASK\b/i.test(line)) {
            return true;
        }

        if (/^TASK\b/i.test(line)) {
            return true;
        }

        if (/^WARNING\b/i.test(line)) {
            return true;
        }

        if (/^CAUTION\b/i.test(line)) {
            return true;
        }

        if (/^NOTE\b/i.test(line)) {
            return true;
        }

        if (/^EFFECTIVITY\b/i.test(line)) {
            return true;
        }

        if (/^\([A-Z0-9]+\)$/i.test(line)) {
            return true;
        }

        return false;
    }

    /* =====================================================
    OUTPUT RECORD
    ===================================================== */

    function makeBoeingRecord(
        panel,
        row,
        col,
        description,
    ) {
        return {
            cockpit: "",
            ee: "",
            etc: "",

            panel_loc:
                clean(panel),

            cb_loc:
                `${clean(row)} ${clean(col)}`.trim(),

            /*
             * Boeing Number는
             * FIN으로 사용하지 않음
             */
            "fin(비고)": "",

            description:
                clean(description),

            warning: "",
        };
    }

    function makeBoeingEffectivityRecord(
        value,
    ) {
        return {
            cockpit: "",
            ee: "",
            etc: "",

            panel_loc:
                normalizeBoeingEffectivity(
                    value,
                ),

            cb_loc: "",
            "fin(비고)": "",
            description: "",
            warning: "",

            /*
             * PANEL ~ DESCRIPTION
             * 4열 병합
             */
            _merges: [
                {
                    field:
                        "panel_loc",

                    rows: 1,
                    cols: 4,
                },
            ],
        };
    }

    /* =====================================================
    COMPLETE ROW
    ===================================================== */

    /*
     * 예:
     *
     * A 5 C28001 L ENGINE FUEL SPAR VALVE
     *
     * A,5,C28001,L ENGINE FUEL SPAR VALVE
     */

    function parseBoeingCompleteRow(line) {
        const value = clean(line);

        if (
            !value ||
            isBoeingEffectivity(value) ||
            isBoeingNoiseLine(value)
        ) {
            return null;
        }

        const match = value.match(
            /^([A-Z]{1,2})[\s,]+(\d+)[\s,]+([A-Z]+\d+[A-Z0-9-]*)[\s,]+(.+)$/i,
        );

        if (!match) {
            return null;
        }

        return {
            row:
                clean(match[1]),

            col:
                clean(match[2]),

            number:
                clean(match[3]),

            description:
                clean(match[4]),
        };
    }

    /* =====================================================
    PACKED COL + NUMBER + DESCRIPTION
    ===================================================== */

    /*
     * 예:
     *
     * 18 C28001 L ENGINE FUEL SPAR VALVE
     */

    function parseBoeingPackedTail(line) {
        const value = clean(line);

        const match = value.match(
            /^(\d+)\s+([A-Z]+\d+[A-Z0-9-]*)\s+(.+)$/i,
        );

        if (!match) {
            return null;
        }

        return {
            col:
                clean(match[1]),

            number:
                clean(match[2]),

            description:
                clean(match[3]),
        };
    }

    /* =====================================================
    PANEL BLOCK
    ===================================================== */

    function splitBoeingPanelBlocks(lines) {
        const blocks = [];

        let current = null;

        for (const line of lines) {
            if (
                isBoeingPanelTitle(line)
            ) {
                if (current) {
                    blocks.push(
                        current,
                    );
                }

                current = {
                    panel:
                        extractPanelCode(
                            line,
                        ),

                    lines: [],
                };

                continue;
            }

            if (current) {
                current.lines.push(
                    line,
                );
            }
        }

        if (current) {
            blocks.push(
                current,
            );
        }

        return blocks;
    }

    /* =====================================================
    TOKEN COLLECTION
    ===================================================== */

    function collectBoeingTokens(lines) {
        const tokens = [];

        for (const originalLine of lines) {
            const line = clean(
                originalLine,
            );

            if (!line) {
                continue;
            }

            /*
             * Header 제외
             */
            if (
                BOEING_HEADER.test(line)
            ) {
                continue;
            }

            /*
             * SUBTASK / WARNING / NOTE...
             */
            if (
                isBoeingNoiseLine(line)
            ) {
                continue;
            }

            /* =========================================
            AAR
            ========================================= */

            if (
                isBoeingEffectivity(line)
            ) {
                tokens.push({
                    type:
                        "effectivity",

                    value:
                        normalizeBoeingEffectivity(
                            line,
                        ),
                });

                continue;
            }

            /* =========================================
            COMPLETE ROW
            ========================================= */

            const complete =
                parseBoeingCompleteRow(
                    line,
                );

            if (complete) {
                tokens.push({
                    type:
                        "complete",

                    ...complete,
                });

                continue;
            }

            /* =========================================
            COL + NUMBER + DESCRIPTION
            ========================================= */

            const packed =
                parseBoeingPackedTail(
                    line,
                );

            if (packed) {
                tokens.push({
                    type:
                        "packed",

                    ...packed,
                });

                continue;
            }

            /* =========================================
            ROW
            ========================================= */

            if (
                isBoeingRowToken(line)
            ) {
                tokens.push({
                    type:
                        "row",

                    value:
                        line,
                });

                continue;
            }

            /* =========================================
            COL
            ========================================= */

            if (
                isBoeingColToken(line)
            ) {
                tokens.push({
                    type:
                        "col",

                    value:
                        line,
                });

                continue;
            }

            /* =========================================
            NUMBER
            ========================================= */

            if (
                isBoeingNumberToken(line)
            ) {
                tokens.push({
                    type:
                        "number",

                    value:
                        line,
                });

                continue;
            }

            /* =========================================
            DESCRIPTION
            ========================================= */

            tokens.push({
                type:
                    "description",

                value:
                    line,
            });
        }

        return tokens;
    }

    /* =====================================================
    SEMANTIC ROW RECONSTRUCTION
    ===================================================== */

    function reconstructBoeingRows(
        panel,
        tokens,
    ) {
        /*
         * 이미 완전한 행이 포함되어 있고
         * 다른 조각들과 섞여 있을 수도 있으므로
         * 먼저 각 의미별 queue를 만듭니다.
         */

        const effectivities = [];

        const rows = [];

        const cols = [];

        const numbers = [];

        const descriptions = [];

        const completeRows = [];

        /*
         * packed는
         *
         * COL
         * NUMBER
         * DESCRIPTION
         *
         * 세 값을 동시에 공급합니다.
         */
        const packedRows = [];

        for (const token of tokens) {
            switch (token.type) {
                case "effectivity":
                    effectivities.push(
                        token.value,
                    );
                    break;

                case "row":
                    rows.push(
                        token.value,
                    );
                    break;

                case "col":
                    cols.push(
                        token.value,
                    );
                    break;

                case "number":
                    numbers.push(
                        token.value,
                    );
                    break;

                case "description":
                    descriptions.push(
                        token.value,
                    );
                    break;

                case "packed":
                    packedRows.push({
                        col:
                            token.col,

                        number:
                            token.number,

                        description:
                            token.description,
                    });
                    break;

                case "complete":
                    completeRows.push({
                        row:
                            token.row,

                        col:
                            token.col,

                        number:
                            token.number,

                        description:
                            token.description,
                    });
                    break;

                default:
                    break;
            }
        }

        const effectivityTargetCount = completeRows.length + rows.length;
        const canAttachEffectivity =
            effectivityTargetCount > 0 &&
            effectivities.length === effectivityTargetCount;
        const effectivityGroups = Array.from(
            { length: rows.length },
            () => [],
        );
        let pendingEffectivities = [];
        let effectivityRowIndex = -1;
        let completedTailCount = 0;

        tokens.forEach((token, index) => {
            if (token.type === "effectivity") {
                const nextToken = tokens[index + 1];
                if (
                    nextToken?.type === "row" ||
                    effectivityRowIndex < 0 ||
                    completedTailCount > effectivityRowIndex
                ) {
                    pendingEffectivities.push(token.value);
                } else {
                    effectivityGroups[effectivityRowIndex]?.push(token.value);
                }
                return;
            }

            if (token.type === "row") {
                effectivityRowIndex += 1;
                effectivityGroups[effectivityRowIndex]?.push(
                    ...pendingEffectivities,
                );
                pendingEffectivities = [];
                return;
            }

            if (token.type === "packed" || token.type === "description") {
                completedTailCount += 1;
            }
        });

        /* =================================================
        CASE A
        모든 C/B가 complete row
        ================================================= */

        if (
            completeRows.length &&
            rows.length === 0 &&
            cols.length === 0 &&
            numbers.length === 0 &&
            descriptions.length === 0 &&
            packedRows.length === 0
        ) {
            const records = [];

            for (
                let index = 0;
                index <
                completeRows.length;
                index += 1
            ) {
                if (
                    canAttachEffectivity &&
                    effectivities[index]
                ) {
                    records.push(
                        makeBoeingEffectivityRecord(
                            effectivities[index],
                        ),
                    );
                }

                const item =
                    completeRows[index];

                records.push(
                    makeBoeingRecord(
                        panel,
                        item.row,
                        item.col,
                        item.description,
                    ),
                );
            }

            return records;
        }

        /* =================================================
        일반 복원용 배열
        ================================================= */

        const finalRows = [];

        /*
         * complete row도 하나의 완성된
         * C/B로 보관
         */
        for (
            const item of completeRows
        ) {
            finalRows.push({
                row:
                    item.row,

                col:
                    item.col,

                number:
                    item.number,

                description:
                    item.description,
            });
        }

        /* =================================================
        ROW 수
        ================================================= */

        const expectedCount =
            rows.length;
                
        /*
         * ROW가 없는데 complete row만 있었다면
         * 위에서 이미 처리됨.
         */
        if (
            expectedCount === 0
        ) {
            if (
                finalRows.length
            ) {
                return finalRows.map(
                    (item, index) => {
                        const result = [];

                        if (
                            canAttachEffectivity &&
                            effectivities[index]
                        ) {
                            result.push(
                                makeBoeingEffectivityRecord(
                                    effectivities[index],
                                ),
                            );
                        }

                        result.push(
                            makeBoeingRecord(
                                panel,
                                item.row,
                                item.col,
                                item.description,
                            ),
                        );

                        return result;
                    },
                ).flat();
            }

            return null;
        }

        /* =================================================
        COL / NUMBER / DESCRIPTION를
        하나의 tail 배열로 복원
        ================================================= */

        const tails = [];

        /*
         * 먼저 일반 분리형:
         *
         * COL
         * NUMBER
         * DESCRIPTION
         */
        const separatedCount =
            Math.min(
                cols.length,
                numbers.length,
                descriptions.length,
            );

        for (
            let index = 0;
            index <
            separatedCount;
            index += 1
        ) {
            tails.push({
                col:
                    cols[index],

                number:
                    numbers[index],

                description:
                    descriptions[index],
            });
        }

        /*
         * packed:
         *
         * 18 C28001 DESCRIPTION
         */
        for (
            const packed of
                packedRows
        ) {
            tails.push({
                col:
                    packed.col,

                number:
                    packed.number,

                description:
                    packed.description,
            });
        }

        /* =================================================
        특별 복원
        ================================================= */

        /*
         * 이번 P11 예제:
         *
         * ROW:
         * A
         * A
         * B
         *
         * 분리 tail:
         * 5 / C28001 / DESCRIPTION
         *
         * packed:
         * 18 C28001 DESCRIPTION
         *
         * 남은 분리 tail:
         * 4 / C76601 / DESCRIPTION
         *
         * 단순 separatedCount 계산만으로는
         * 순서를 잃을 수 있습니다.
         *
         * 따라서 아래에서 원본 token 순서를 다시 사용해
         * tail들을 복원합니다.
         */

        const semanticTails = [];

        let pendingCol = "";
        let pendingNumber = "";

        for (const token of tokens) {
            /*
             * 이미 complete는 별도 처리
             */
            if (
                token.type ===
                "complete"
            ) {
                continue;
            }

            /*
             * ROW / AAR은 tail 구성에서 제외
             */
            if (
                token.type === "row" ||
                token.type ===
                    "effectivity"
            ) {
                continue;
            }

            /*
             * PACKED
             */
            if (
                token.type ===
                "packed"
            ) {
                /*
                 * 기존에 완성되지 않은
                 * COL/NUMBER가 없다면
                 * 그대로 완성 tail
                 */
                if (
                    !pendingCol &&
                    !pendingNumber
                ) {
                    semanticTails.push({
                        col:
                            token.col,

                        number:
                            token.number,

                        description:
                            token.description,
                    });

                    continue;
                }
            }

            /*
             * COL
             */
            if (
                token.type === "col"
            ) {
                /*
                 * 이전 COL이 남아 있다면
                 * 구조가 불명확
                 */
                if (pendingCol) {
                    return null;
                }

                pendingCol =
                    token.value;

                continue;
            }

            /*
             * NUMBER
             */
            if (
                token.type ===
                "number"
            ) {
                if (
                    !pendingCol ||
                    pendingNumber
                ) {
                    return null;
                }

                pendingNumber =
                    token.value;

                continue;
            }

            /*
             * DESCRIPTION
             */
            if (
                token.type ===
                "description"
            ) {
                if (
                    pendingCol
                ) {
                    semanticTails.push({
                        col:
                            pendingCol,

                        number:
                            pendingNumber,

                        description:
                            token.value,
                    });

                    pendingCol = "";
                    pendingNumber = "";

                    continue;
                }
            }
        }

        /*
         * 마지막에 미완성 값이 남으면
         * 정상 복원 실패
         */
        if (
            pendingCol ||
            pendingNumber
        ) {
            return null;
        }

        /* =================================================
        semanticTails가 충분하면 우선 사용
        ================================================= */

        let resolvedTails =
            semanticTails;

        /*
         * semantic parser가 PDF column-major 때문에
         * 실패할 경우 기존 의미별 배열을 fallback으로 사용
         */
        if (
            resolvedTails.length !==
            expectedCount
        ) {
            /*
             * packed + separated 전체 수가
             * ROW 수와 정확히 맞는 경우에만 허용
             */
            if (
                tails.length ===
                expectedCount
            ) {
                resolvedTails =
                    tails;
            } else {
                return null;
            }
        }

        /* =================================================
        ROW + TAIL
        ================================================= */

        const reconstructed = [];

        for (
            let index = 0;
            index <
            expectedCount;
            index += 1
        ) {
            reconstructed.push({
                row:
                    rows[index],

                col:
                    resolvedTails[
                        index
                    ].col,

                number:
                    resolvedTails[
                        index
                    ].number,

                description:
                    resolvedTails[
                        index
                    ].description,
            });
        }

        /* =================================================
        AAR + C/B OUTPUT
        ================================================= */

        const records = [];

        for (
            let index = 0;
            index <
            reconstructed.length;
            index += 1
        ) {
            /*
             * AAR가 C/B 수와 동일하게
             * 검출되었다면 index 기준 연결
             */
            const rowEffectivities = effectivityGroups[index] || [];
            rowEffectivities.forEach((effectivity) => {
                records.push(makeBoeingEffectivityRecord(effectivity));
            });

            const item =
                reconstructed[
                    index
                ];

            records.push(
                makeBoeingRecord(
                    panel,
                    item.row,
                    item.col,
                    item.description,
                ),
            );
        }

        return records;
    }

    /* =====================================================
    COLUMN-MAJOR FALLBACK
    ===================================================== */

    /*
     * 기존에 확인했던:
     *
     * K
     * K
     * 5
     * 8
     * C27607
     * C27630
     * DESC1
     * DESC2
     *
     * 같은 완전 column-major를 위한 fallback입니다.
     */

    function parseBoeingColumnMajorFallback(
        panel,
        lines,
    ) {
        const values = lines
            .map(clean)
            .filter(Boolean)
            .filter(
                (line) =>
                    !BOEING_HEADER.test(
                        line,
                    ),
            )
            .filter(
                (line) =>
                    !isBoeingNoiseLine(
                        line,
                    ),
            );

        /*
         * AAR가 있는 복잡한 경우는
         * semantic parser에 맡김
         */
        if (
            values.some(
                isBoeingEffectivity,
            )
        ) {
            return null;
        }

        let cursor = 0;

        const rows = [];

        while (
            cursor <
                values.length &&
            isBoeingRowToken(
                values[cursor],
            )
        ) {
            rows.push(
                values[cursor],
            );

            cursor += 1;
        }

        if (!rows.length) {
            return null;
        }

        const rowCount =
            rows.length;

        /*
         * MIXED LAST ROW:
         *
         * 14 C74405 L ENG IGN 2
         */
        let mixedTail = null;

        const last =
            values[
                values.length - 1
            ];

        const packedLast =
            parseBoeingPackedTail(
                last,
            );

        if (packedLast) {
            mixedTail =
                packedLast;
        }

        const regularCount =
            mixedTail
                ? rowCount - 1
                : rowCount;

        if (
            regularCount < 0
        ) {
            return null;
        }

        const cols = [];

        for (
            let index = 0;
            index <
            regularCount;
            index += 1
        ) {
            const value =
                values[cursor];

            if (
                !isBoeingColToken(
                    value,
                )
            ) {
                return null;
            }

            cols.push(
                value,
            );

            cursor += 1;
        }

        const numbers = [];

        for (
            let index = 0;
            index <
            regularCount;
            index += 1
        ) {
            const value =
                values[cursor];

            if (
                !isBoeingNumberToken(
                    value,
                )
            ) {
                return null;
            }

            numbers.push(
                value,
            );

            cursor += 1;
        }

        const descriptionEnd =
            mixedTail
                ? values.length - 1
                : values.length;

        const descriptions =
            values.slice(
                cursor,
                descriptionEnd,
            );

        if (
            descriptions.length !==
            regularCount
        ) {
            return null;
        }

        const records = [];

        for (
            let index = 0;
            index <
            regularCount;
            index += 1
        ) {
            records.push(
                makeBoeingRecord(
                    panel,
                    rows[index],
                    cols[index],
                    descriptions[
                        index
                    ],
                ),
            );
        }

        if (mixedTail) {
            records.push(
                makeBoeingRecord(
                    panel,

                    rows[
                        rowCount - 1
                    ],

                    mixedTail.col,

                    mixedTail.description,
                ),
            );
        }

        return records.length
            ? records
            : null;
    }

    /* =====================================================
    PANEL PARSER
    ===================================================== */

    function parseBoeingPanel(
        panel,
        blockLines,
    ) {
        /*
         * Header 제거
         */
        const headerIndex =
            blockLines.findIndex(
                (line) =>
                    BOEING_HEADER.test(
                        clean(line),
                    ),
            );

        let dataLines =
            headerIndex >= 0
                ? blockLines.slice(
                    headerIndex + 1,
                )
                : [...blockLines];

        /*
         * 기본 정리
         */
        dataLines = dataLines
            .map(clean)
            .filter(Boolean);

        if (!dataLines.length) {
            return [];
        }

        /* =============================================
        1. SEMANTIC TOKEN PARSER
        ============================================= */

        const tokens =
            collectBoeingTokens(
                dataLines,
            );

        const semantic =
            reconstructBoeingRows(
                panel,
                tokens,
            );

        if (
            semantic &&
            semantic.length
        ) {
            return semantic;
        }

        /* =============================================
        2. COLUMN-MAJOR FALLBACK
        ============================================= */

        const columnMajor =
            parseBoeingColumnMajorFallback(
                panel,
                dataLines,
            );

        if (
            columnMajor &&
            columnMajor.length
        ) {
            return columnMajor;
        }

        /*
         * 잘못된 데이터 자동 입력 방지
         */
        const rowCount =
            tokens.filter(
                (token) =>
                    token.type ===
                    "row",
            ).length;

        const colCount =
            tokens.filter(
                (token) =>
                    token.type ===
                        "col" ||
                    token.type ===
                        "packed" ||
                    token.type ===
                        "complete",
            ).length;

        const descriptionCount =
            tokens.filter(
                (token) =>
                    token.type ===
                        "description" ||
                    token.type ===
                        "packed" ||
                    token.type ===
                        "complete",
            ).length;

        throw new Error(
            `${panel} Boeing PDF 표를 완전히 복원하지 못했습니다. ` +
                `ROW ${rowCount}개 / ` +
                `COL ${colCount}개 / ` +
                `DESCRIPTION ${descriptionCount}개를 확인했습니다.`,
        );
    }

    /* =====================================================
    BOEING MAIN
    ===================================================== */

    function parseBoeing(rawText) {
        const lines =
            normalizeLines(
                rawText,
            );

        const blocks =
            splitBoeingPanelBlocks(
                lines,
            );

        if (!blocks.length) {
            throw new Error(
                "Boeing PANEL 정보(P11, P110, P210 등)를 찾을 수 없습니다.",
            );
        }

        const records = [];

        for (
            const block of blocks
        ) {
            const parsed =
                parseBoeingPanel(
                    block.panel,
                    block.lines,
                );

            records.push(
                ...parsed,
            );
        }

        if (!records.length) {
            throw new Error(
                "붙여넣을 Boeing C/B 데이터를 찾을 수 없습니다.",
            );
        }

        return records;
    }

    /* =====================================================
    BOEING MANUAL CSV
    ===================================================== */

    function parseBoeingManualCsv(
        rawText,
    ) {
        const lines =
            normalizeLines(
                rawText,
            );

        return lines.map(
            (line, index) => {
                const columns =
                    line
                        .split(",")
                        .map(clean);

                const [
                    panel_loc,
                    cb_loc,
                    fin,
                ] = columns;

                const description =
                    columns
                        .slice(3)
                        .join(", ")
                        .trim();

                if (
                    columns.length < 4 ||
                    !panel_loc ||
                    !cb_loc ||
                    !description
                ) {
                    throw new Error(
                        `${index + 1}번째 줄을 확인해 주세요. ` +
                            "PANEL, C/B LOC', FIN, DESCRIPTION 순서로 입력하세요.",
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
            },
        );
    }

    /* =====================================================
    BOEING AUTO DETECTION
    ===================================================== */

    function looksLikeBoeing(lines) {
        return lines.some(
            (line) =>
                BOEING_HEADER.test(
                    clean(line),
                ) ||
                isBoeingPanelTitle(
                    line,
                ),
        );
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

        /* =============================================
        AIRBUS VERTICAL
        ============================================= */

        const verticalAirbusRecords = parseVerticalAirbusTable(text);

        if (verticalAirbusRecords) {
            return verticalAirbusRecords;
        }

        /* =============================================
        BOEING MANUAL
        ============================================= */

        if (format === "boeing-manual") {
            return parseBoeingManualCsv(text);
        }

        /* =============================================
        BOEING
        ============================================= */

        if (format === "boeing") {
            return parseBoeing(text);
        }

        /* =============================================
        AIRBUS
        ============================================= */

        if (format === "airbus" || format === "general") {
            return parseAirbus(text);
        }

        /* =============================================
        UNKNOWN FORMAT
        ============================================= */

        if (format !== "auto") {
            throw new Error(`지원하지 않는 붙여넣기 형식입니다: ${format}`);
        }

        /* =============================================
        AUTO DETECTION
        ============================================= */

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
     * 형태로 호출
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
