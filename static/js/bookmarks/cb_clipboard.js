/* Parse clipboard text before changing any worksheet cells. */
(function (root) {
    function parseClipboard(rawText, format = "auto") {
        const lines = String(rawText || "")
            .replace(/\r/g, "")
            .split("\n")
            .filter((line) => line.trim());
        const header =
            /^Row\s*(?:,|\s+)\s*Col(?:umn)?\s*(?:,|\s+)\s*Number\s*(?:,|\s+)\s*Name$/i;
        const normalized = (line) => line.replace(/\u00a0/g, " ").trim();
        const extractPanelCode = (line) => {
            const match = normalized(line).match(/\bP\d+[A-Z]?\b/i);
            return match ? match[0].toUpperCase() : "";
        };
        const isBoeingRowToken = (value) =>
            typeof value === "string" && /^[A-Z][A-Z0-9]*$/i.test(value.trim());
        const isBoeingColToken = (value) =>
            typeof value === "string" && /^\d+$/i.test(value.trim());
        const parseBoeingRowLine = (line) => {
            const raw = normalized(line);
            if (!raw) return null;
            if (raw.includes(",")) {
                const cells = raw
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean);
                if (cells.length >= 4) {
                    const [row, col, , ...rest] = cells;
                    const description = rest.join(" ").trim();
                    if (
                        isBoeingRowToken(row) &&
                        isBoeingColToken(col) &&
                        description
                    ) {
                        return {
                            row: row.trim(),
                            col: col.trim(),
                            description,
                        };
                    }
                }
            }
            const tokens = raw.split(/\s+/).filter(Boolean);
            if (tokens.length >= 4) {
                const [row, col, , ...rest] = tokens;
                const description = rest.join(" ").trim();
                if (
                    isBoeingRowToken(row) &&
                    isBoeingColToken(col) &&
                    description
                ) {
                    return { row: row.trim(), col: col.trim(), description };
                }
            }
            return null;
        };
        const isBoeing = lines.some((line) => header.test(normalized(line)));

        if (format === "boeing-manual") {
            return lines.map((line, index) => {
                const columns = line.split(",").map((value) => value.trim());
                const [panel_loc, cb_loc, fin] = columns;
                const description = columns.slice(3).join(", ").trim();
                if (
                    columns.length < 4 ||
                    !panel_loc ||
                    !cb_loc ||
                    !description
                ) {
                    throw new Error(
                        `${index + 1}번째 줄을 확인해 주세요. PANEL, C/B LOC', FIN, DESCRIPTION 순서로 입력하세요. FIN이 없으면 쉼표 사이를 비워 주세요.`,
                    );
                }
                return { panel_loc, cb_loc, fin, description };
            });
        }

        if (!isBoeing) {
            const airbusHeader =
                /^PANEL\s+(?:DESIGNATION|DESCRIPTION)\s+FIN\s+(?:LOCATION|C\/B\s+LOC'?)/i;
            return lines
                .filter(
                    (line) =>
                        !airbusHeader.test(
                            normalized(line).replace(/\t+/g, " "),
                        ),
                )
                .map((line) => {
                    const fullLine = normalized(line.replace(/\t+/g, " "));
                    // Airbus 작업 범위 제목은 쉼표를 포함해도 데이터 열로
                    // 나누지 않고 PANEL부터 DESCRIPTION까지 한 셀로 표시합니다.
                    if (/\bON\s+A\/C\b/i.test(fullLine)) {
                        return {
                            panel_loc: fullLine,
                            description: "",
                            fin: "",
                            cb_loc: "",
                            warning: "",
                            _merges: [{ field: "panel_loc", rows: 1, cols: 4 }],
                        };
                    }
                    const [
                        panel_loc = "",
                        description = "",
                        fin = "",
                        cb_loc = "",
                    ] = line.split("\t");
                    if (
                        /^FOR\s+FIN\b/i.test(panel_loc.trim()) &&
                        !description.trim() &&
                        !fin.trim() &&
                        !cb_loc.trim()
                    ) {
                        return {
                            panel_loc: panel_loc.trim(),
                            description: "",
                            fin: "",
                            cb_loc: "",
                            warning: "",
                            _merges: [{ field: "panel_loc", rows: 1, cols: 4 }],
                        };
                    }
                    return { panel_loc, description, fin, cb_loc };
                });
        }

        let panel = "";
        let hasHeader = false;
        const records = [];
        let pendingTokens = [];
        const flushPendingTokens = () => {
            if (pendingTokens.length < 4) return;
            const flattened = pendingTokens.flatMap((token) =>
                normalized(token).split(/\s+/).filter(Boolean),
            );
            const [row, col, , ...rest] = flattened;
            const description = rest.join(" ").trim();
            if (
                !isBoeingRowToken(row) ||
                !isBoeingColToken(col) ||
                !description
            ) {
                pendingTokens = [];
                return;
            }
            records.push({
                panel_loc: panel,
                cb_loc: `${row.trim()} ${col.trim()}`,
                fin: "",
                description,
            });
            pendingTokens = [];
        };
        for (const rawLine of lines) {
            const line = normalized(rawLine);
            const panelCode = extractPanelCode(line);
            if (panelCode) {
                const headerLike = /^(?:Row|Col|Number|Name)$/i.test(line);
                if (!headerLike && !header.test(line)) {
                    panel = panelCode;
                    hasHeader = false;
                    continue;
                }
            }
            if (header.test(line)) {
                hasHeader = true;
                continue;
            }
            if (!panel || !hasHeader) {
                const linePanel = extractPanelCode(line);
                if (linePanel) {
                    panel = linePanel;
                    hasHeader = false;
                    continue;
                }
                throw new Error(
                    "보잉 데이터는 패널 제목(P110 등)과 Row Col Number Name 헤더를 함께 복사해 주세요.",
                );
            }
            const parsedRow = parseBoeingRowLine(line);
            if (parsedRow) {
                flushPendingTokens();
                records.push({
                    panel_loc: panel,
                    cb_loc: `${parsedRow.row} ${parsedRow.col}`,
                    fin: "",
                    description: parsedRow.description,
                });
                continue;
            }
            pendingTokens.push(line);
            flushPendingTokens();
        }
        flushPendingTokens();
        if (!records.length)
            throw new Error("붙여넣을 보잉 데이터 행이 없습니다.");
        return records;
    }
    if (typeof module !== "undefined" && module.exports)
        module.exports = parseClipboard;
    else root.parseCBClipboard = parseClipboard;
})(globalThis);
