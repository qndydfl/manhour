// Shared row insertion and reversible rectangular cell merging for C/B tables.
window.CBGridEditor = class {
    constructor({ body, fields, toolbarHost, createRow, changed }) {
        Object.assign(this, { body, fields, createRow, changed });
        this.active = null;
        this.rangeEnd = null;
        this.selecting = false;
        this.toolbar = document.createElement("div");
        this.toolbar.className = "cb-grid-toolbar";
        this.toolbar.innerHTML =
            '<span class="cb-grid-status" aria-live="polite">셀을 클릭하여 행을 선택하세요.</span>';
        const button = (label, action) => {
            const el = document.createElement("button");
            el.type = "button";
            el.className = "btn btn-outline-secondary btn-sm";
            el.textContent = label;
            el.addEventListener("click", action);
            this.toolbar.append(el);
            return el;
        };
        button("선택 행 위에 추가", () => this.insert(false));
        button("선택 행 아래에 추가", () => this.insert(true));
        this.selectButton = button("병합 범위 선택", () => {
            this.selecting = !this.selecting;
            this.active = null;
            this.rangeEnd = null;
            this.selectButton.setAttribute(
                "aria-pressed",
                String(this.selecting),
            );
            this.paint();
        });
        this.selectButton.setAttribute("aria-pressed", "false");
        button("셀 병합", () => this.merge());
        button("병합 해제", () => this.unmerge());
        const hint = document.createElement("small");
        hint.textContent =
            "범위 선택 후 시작·끝 셀을 클릭하세요. 병합하면 왼쪽 위 셀만 표시되며, 해제하면 원래 내용이 복원됩니다.";
        this.toolbar.append(hint);
        toolbarHost.before(this.toolbar);
        const topbar = document.querySelector(
            ".cb-open-topbar, .assignment-topbar",
        );
        const updateStickyOffset = () => {
            const offset = topbar
                ? Math.max(0, topbar.getBoundingClientRect().bottom)
                : 0;
            this.toolbar.style.setProperty(
                "--cb-grid-sticky-top",
                `${offset}px`,
            );
        };
        if (topbar) {
            this.topbarObserver = new ResizeObserver(updateStickyOffset);
            this.topbarObserver.observe(topbar);
        }
        this.toolbarObserver = new ResizeObserver(updateStickyOffset);
        this.toolbarObserver.observe(this.toolbar);
        window.addEventListener("resize", updateStickyOffset);
        window.addEventListener("scroll", updateStickyOffset, {
            passive: true,
        });
        updateStickyOffset();
        body.addEventListener(
            "click",
            (event) => {
                const td = event.target.closest("td");
                const editor = td?.querySelector("[data-field]");
                if (!editor || !this.fields.includes(editor.dataset.field))
                    return;
                if (this.selecting || event.shiftKey) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
                if (
                    (this.selecting || event.shiftKey) &&
                    this.active &&
                    !this.rangeEnd
                )
                    this.rangeEnd = td;
                else {
                    this.active = td;
                    this.rangeEnd = null;
                }
                this.paint();
            },
            true,
        );
    }
    rows() {
        return Array.from(this.body.children);
    }
    cell(row, field) {
        return row
            ?.querySelector('[data-field="' + field + '"]')
            ?.closest("td");
    }
    position(td) {
        return {
            r: this.rows().indexOf(td?.parentElement),
            c: this.fields.indexOf(
                td?.querySelector("[data-field]")?.dataset.field,
            ),
        };
    }
    bounds() {
        if (!this.active || !this.body.contains(this.active)) return null;
        const a = this.position(this.active),
            b = this.position(this.rangeEnd || this.active);
        return {
            top: Math.min(a.r, b.r),
            left: Math.min(a.c, b.c),
            bottom: Math.max(
                a.r + this.active.rowSpan - 1,
                b.r + (this.rangeEnd || this.active).rowSpan - 1,
            ),
            right: Math.max(
                a.c + this.active.colSpan - 1,
                b.c + (this.rangeEnd || this.active).colSpan - 1,
            ),
        };
    }
    paint() {
        this.body
            .querySelectorAll(".cb-grid-selected")
            .forEach((td) => td.classList.remove("cb-grid-selected"));
        const bounds = this.bounds();
        if (bounds)
            this.rows().forEach((row, r) =>
                this.fields.forEach((field, c) => {
                    if (
                        r >= bounds.top &&
                        r <= bounds.bottom &&
                        c >= bounds.left &&
                        c <= bounds.right
                    )
                        this.cell(row, field)?.classList.add(
                            "cb-grid-selected",
                        );
                }),
            );
        this.toolbar.querySelector(".cb-grid-status").textContent = bounds
            ? `${bounds.top + 1}~${bounds.bottom + 1}행 선택`
            : this.selecting
              ? "병합할 시작 셀과 끝 셀을 클릭하세요."
              : "셀을 클릭하여 행을 선택하세요.";
    }
    notify(message) {
        void window.AppDialog.alert(message, {
            title: "표 편집",
            variant: "info",
        });
    }
    merges() {
        return this.rows().flatMap((row, r) =>
            this.fields.flatMap((field, c) => {
                const td = this.cell(row, field);
                return td &&
                    !td.classList.contains("cb-grid-covered") &&
                    (td.rowSpan > 1 || td.colSpan > 1)
                    ? [{ r, c, rows: td.rowSpan, cols: td.colSpan }]
                    : [];
            }),
        );
    }
    apply(merges) {
        const rows = this.rows();
        rows.forEach((row) =>
            this.fields.forEach((field) => {
                const td = this.cell(row, field);
                td.rowSpan = 1;
                td.colSpan = 1;
                td.classList.remove("cb-grid-covered");
            }),
        );
        const occupied = new Set();
        for (const m of merges) {
            if (
                ![m.r, m.c, m.rows, m.cols].every(Number.isInteger) ||
                m.r < 0 ||
                m.c < 0 ||
                m.rows < 1 ||
                m.cols < 1 ||
                m.r + m.rows > rows.length ||
                m.c + m.cols > this.fields.length
            )
                continue;
            const points = [];
            for (let r = m.r; r < m.r + m.rows; r++)
                for (let c = m.c; c < m.c + m.cols; c++) points.push([r, c]);
            if (points.some(([r, c]) => occupied.has(`${r}:${c}`))) continue;
            points.forEach(([r, c]) => {
                occupied.add(`${r}:${c}`);
                if (r !== m.r || c !== m.c)
                    this.cell(rows[r], this.fields[c]).classList.add(
                        "cb-grid-covered",
                    );
            });
            const td = this.cell(rows[m.r], this.fields[m.c]);
            td.rowSpan = m.rows;
            td.colSpan = m.cols;
        }
        this.paint();
    }
    exportRow(row) {
        return this.fields.flatMap((field) => {
            const td = this.cell(row, field);
            return td &&
                !td.classList.contains("cb-grid-covered") &&
                (td.rowSpan > 1 || td.colSpan > 1)
                ? [{ field, rows: td.rowSpan, cols: td.colSpan }]
                : [];
        });
    }
    importRows(records, start = 0) {
        const merges = this.merges().filter(
            (m) => m.r + m.rows <= start || m.r >= start + records.length,
        );
        records.forEach((record, i) =>
            (record._merges || []).forEach((m) =>
                merges.push({
                    r: start + i,
                    c: this.fields.indexOf(m.field),
                    rows: m.rows,
                    cols: m.cols,
                }),
            ),
        );
        this.apply(merges);
    }
    async merge() {
        const b = this.bounds();
        if (!b || (b.top === b.bottom && b.left === b.right))
            return this.notify("인접한 셀을 두 개 이상 선택해 주세요.");
        const intersects = (m) =>
            m.r <= b.bottom &&
            m.r + m.rows > b.top &&
            m.c <= b.right &&
            m.c + m.cols > b.left;
        const old = this.merges();
        if (
            old.some(
                (m) =>
                    intersects(m) &&
                    (m.r < b.top ||
                        m.c < b.left ||
                        m.r + m.rows - 1 > b.bottom ||
                        m.c + m.cols - 1 > b.right),
            )
        )
            return this.notify("기존 병합 셀 전체를 포함하여 선택해 주세요.");
        const confirmed = await window.AppDialog.confirm(
            "선택한 셀을 병합할까요? 왼쪽 위 셀의 내용이 표시됩니다. 나머지 내용은 보관되며 병합 해제 시 다시 나타납니다.",
            { title: "셀 병합", confirmText: "병합" },
        );
        if (!confirmed) return;
        this.apply([
            ...old.filter((m) => !intersects(m)),
            {
                r: b.top,
                c: b.left,
                rows: b.bottom - b.top + 1,
                cols: b.right - b.left + 1,
            },
        ]);
        this.selecting = false;
        this.selectButton.setAttribute("aria-pressed", "false");
        this.changed();
    }
    unmerge() {
        const b = this.bounds();
        if (!b) return this.notify("병합된 셀을 먼저 선택해 주세요.");
        this.apply(
            this.merges().filter(
                (m) =>
                    !(
                        m.r <= b.bottom &&
                        m.r + m.rows > b.top &&
                        m.c <= b.right &&
                        m.c + m.cols > b.left
                    ),
            ),
        );
        this.rangeEnd = null;
        this.paint();
        this.changed();
    }
    insert(after) {
        const b = this.bounds();
        if (!b)
            return this.notify("행을 추가할 위치의 셀을 먼저 클릭해 주세요.");
        const index = after ? b.bottom + 1 : b.top;
        const merges = this.merges().map((m) => ({
            ...m,
            r: m.r >= index ? m.r + 1 : m.r,
            rows: m.r < index && m.r + m.rows > index ? m.rows + 1 : m.rows,
        }));
        const row = this.createRow();
        this.body.insertBefore(row, this.body.children[index] || null);
        this.active = this.cell(row, this.fields[0]);
        this.rangeEnd = null;
        this.apply(merges);
        this.changed();
        this.active.querySelector("[data-field]")?.focus();
    }
    removeRow(row) {
        const index = this.rows().indexOf(row);
        const merges = this.merges()
            .map((m) => ({
                ...m,
                r: m.r > index ? m.r - 1 : m.r,
                rows:
                    m.r <= index && m.r + m.rows > index ? m.rows - 1 : m.rows,
            }))
            .filter((m) => m.rows > 0);
        row.remove();
        this.active = null;
        this.rangeEnd = null;
        this.apply(merges);
    }
};
