/* Parse clipboard text before changing any worksheet cells. */
(function (root) {
    function parseClipboard(rawText, format = 'auto') {
        const lines = String(rawText || '').replace(/\r/g, '').split('\n')
            .filter((line) => line.trim());
        const header = /^Row\s+Col(?:umn)?\s+Number\s+Name$/i;
        const normalized = (line) => line.replace(/\u00a0/g, ' ').trim();
        const isBoeing = lines.some((line) => header.test(normalized(line)));

        if (format === 'boeing-manual') {
            return lines.map((line, index) => {
                const columns = line.split(',').map((value) => value.trim());
                const [panel_loc, cb_loc, fin] = columns;
                const description = columns.slice(3).join(', ').trim();
                if (columns.length < 4 || !panel_loc || !cb_loc || !description) {
                    throw new Error(`${index + 1}번째 줄을 확인해 주세요. PANEL, C/B LOC', FIN, DESCRIPTION 순서로 입력하세요. FIN이 없으면 쉼표 사이를 비워 주세요.`);
                }
                return { panel_loc, cb_loc, fin, description };
            });
        }

        if (!isBoeing) {
            return lines.map((line) => {
                const [panel_loc = '', description = '', fin = '', cb_loc = ''] = line.split('\t');
                return { panel_loc, description, fin, cb_loc };
            });
        }

        let panel = '';
        let hasHeader = false;
        const records = [];
        for (const rawLine of lines) {
            const line = normalized(rawLine);
            const panelTitle = line.match(/(?:^|[,\t])\s*(P\d+[A-Z]?)\s*$/i);
            if (panelTitle) {
                panel = panelTitle[1].toUpperCase();
                hasHeader = false;
                continue;
            }
            if (header.test(line)) {
                hasHeader = true;
                continue;
            }
            if (!panel || !hasHeader) {
                throw new Error('보잉 데이터는 패널 제목(P110 등)과 Row Col Number Name 헤더를 함께 복사해 주세요.');
            }
            const row = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
            if (!row) {
                throw new Error(`보잉 데이터 형식을 확인해 주세요: ${line}`);
            }
            records.push({ panel_loc: panel, cb_loc: `${row[1]} ${row[2]}`, fin: '', description: row[4] });
        }
        if (!records.length) throw new Error('붙여넣을 보잉 데이터 행이 없습니다.');
        return records;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = parseClipboard;
    else root.parseCBClipboard = parseClipboard;
})(globalThis);
