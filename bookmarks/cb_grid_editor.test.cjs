// Run with node --test; CB_PLAYWRIGHT_PATH may point to an installed Playwright.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.CB_PLAYWRIGHT_PATH || "playwright");
const root = path.resolve(__dirname, "..");

async function fixture(browser, name, templates = []) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
        window.AppDialog = {
            confirm: async () => true,
            alert: async (message) => {
                window.lastAlert = message;
            },
        };
    });
    let saved;
    await page.route("http://cb.test/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith("/static/")) {
            const filename = path.join(root, url.pathname.slice(1));
            return route.fulfill({
                body: fs.readFileSync(filename),
                contentType: filename.endsWith(".css")
                    ? "text/css"
                    : "text/javascript",
            });
        }
        if (url.pathname === "/api/templates") {
            if (route.request().method() === "POST") {
                saved = route.request().postDataJSON();
                templates = [{ ...saved, id: 1 }];
                return route.fulfill({ json: { id: 1, name: saved.name } });
            }
            return route.fulfill({ json: { templates } });
        }
        if (url.pathname === "/api/aircraft")
            return route.fulfill({ json: { aircraft_models: ["B777"] } });
        let html = fs.readFileSync(
            path.join(
                root,
                "templates/bookmarks",
                name === "cb_template_manage"
                    ? "cb_open_list.html"
                    : name + ".html",
            ),
            "utf8",
        );
        html = html
            .replace(/{%\s*static\s+'([^']+)'\s*%}/g, "/static/$1")
            .replace(
                /{%\s*url\s+'bookmarks:cb_templates'\s*%}/g,
                "/api/templates",
            )
            .replace(
                /{%\s*url\s+'bookmarks:cb_template_manage'\s*%}/g,
                "/manage",
            )
            .replace(/{%\s*url\s+'bookmarks:cb_home'\s*%}/g, "/")
            .replace(
                /{%\s*url\s+'bookmarks:cb_aircraft_models'\s*%}/g,
                "/api/aircraft",
            )
            .replace(
                /{%\s*csrf_token\s*%}/g,
                '<input name="csrfmiddlewaretoken" value="test" type="hidden">',
            )
            .replace(/{{\s*aircraft_model\s*}}/g, "B777")
            .replace(/{{[^}]*}}/g, "")
            .replace(/{%[\s\S]*?%}/g, "");
        if (name === "cb_template_manage") {
            const managed = templates[0] || {
                id: null,
                aircraft_model: "B777",
                name: "",
                rows: [],
            };
            html += `<script id="cbManagedTemplateData" type="application/json">${JSON.stringify(managed)}</script>`;
        }
        await route.fulfill({
            contentType: "text/html; charset=utf-8",
            body:
                '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
                html +
                "</body></html>",
        });
    });
    await page.goto("http://cb.test/");
    await page.waitForSelector(".cb-grid-toolbar", { state: "attached" });
    if (name === "cb_open_list" || name === "cb_template_manage")
        await page.waitForFunction(
            () => document.body.dataset.cbOpenReady === "true",
        );
    else
        await page.waitForFunction(
            () => document.querySelectorAll("tbody[id] > tr").length > 0,
        );
    return { page, errors, saved: () => saved };
}

test.skip("legacy standalone template editor interactions", async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        const record = (i) => ({
            panel_loc: "P11",
            cb_loc: "A" + i,
            fin: "",
            description: "ITEM " + i,
        });
        const { page, errors, saved } = await fixture(
            browser,
            "cb_template_manage",
            [
                {
                    id: 1,
                    name: "Test",
                    aircraft_model: "B777",
                    rows: [record(1), record(2)],
                },
            ],
        );
        assert.equal(await page.locator(".cb-grid-toolbar").isHidden(), true);
        await page.click("#cbTemplateGridToolsToggle");
        assert.equal(await page.locator(".cb-grid-toolbar").isVisible(), true);
        await page.locator("#cbTemplateSelect").evaluate((select) => {
            select.value = "1";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        assert.equal(
            await page.locator("#cbTemplatePageTitle").textContent(),
            "B777 · Test 수정 · 삭제",
        );
        assert.equal(
            await page.locator("#cbTemplateUpdate").isDisabled(),
            true,
        );
        await page
            .locator('#cbTemplateRows [data-field="panel_loc"]')
            .first()
            .click();
        await page
            .getByRole("button", { name: "선택 행 아래에 추가", exact: true })
            .click();
        assert.equal(await page.locator("#cbTemplateUpdate").isEnabled(), true);
        assert.equal(await page.locator("#cbTemplateRows tr").count(), 3);
        assert.equal(
            await page
                .locator('#cbTemplateRows [data-field="cb_loc"]')
                .nth(2)
                .inputValue(),
            "A2",
        );
        await page.evaluate(() => {
            window.lastAlert = "";
        });
        await page.click("#cbTemplateUpdate");
        await page.waitForFunction(() =>
            window.lastAlert?.includes("수정했습니다"),
        );
        assert.equal(
            await page.locator("#cbTemplateUpdate").isDisabled(),
            true,
        );
        assert.equal(saved().rows.length, 3);
        assert.equal(saved().rows[1].panel_loc, "");
        await page
            .locator('#cbTemplateRows [data-field="cb_loc"]')
            .nth(1)
            .fill("NEW");
        await page
            .locator('#cbTemplateRows [data-field="description"]')
            .nth(1)
            .fill("NEW ITEM");
        await page
            .locator('#cbTemplateRows [data-field="warning"]')
            .nth(1)
            .fill("CHECK BEFORE WORK");
        await page
            .getByRole("button", { name: "병합 범위 선택", exact: true })
            .click();
        await page
            .locator('#cbTemplateRows [data-field="panel_loc"]')
            .nth(0)
            .click();
        await page
            .locator('#cbTemplateRows [data-field="panel_loc"]')
            .nth(1)
            .click();
        await page
            .getByRole("button", { name: "셀 병합", exact: true })
            .click();
        await page.waitForFunction(
            () =>
                document
                    .querySelector('#cbTemplateRows [data-field="panel_loc"]')
                    .closest("td").rowSpan === 2,
        );
        await page.click("#cbTemplateUpdate");
        await page.waitForTimeout(750);
        assert.match(
            await page.evaluate(
                () =>
                    window.lastAlert ||
                    document.querySelector("#cbTemplateStatus").textContent,
            ),
            /수정했습니다/,
        );
        assert.deepEqual(saved().rows[0]._merges, [
            { field: "panel_loc", rows: 2, cols: 1 },
        ]);
        assert.equal(
            await page.locator("#cbTemplateRows td.cb-grid-covered").count(),
            1,
        );
        await page
            .locator('#cbTemplateRows [data-field="panel_loc"]')
            .first()
            .click();
        await page
            .getByRole("button", { name: "병합 해제", exact: true })
            .click();
        assert.equal(
            await page.locator("#cbTemplateRows td.cb-grid-covered").count(),
            0,
        );
        assert.equal(
            await page
                .locator('#cbTemplateRows [data-field="cb_loc"]')
                .nth(2)
                .inputValue(),
            "A2",
        );
        await page
            .locator('#cbTemplateRows [data-field="panel_loc"]')
            .nth(1)
            .fill("P12");
        await page
            .getByRole("button", { name: "병합 범위 선택", exact: true })
            .click();
        await page
            .locator('#cbTemplateRows [data-field="fin"]')
            .first()
            .click();
        await page
            .locator('#cbTemplateRows [data-field="description"]')
            .first()
            .click();
        await page
            .getByRole("button", { name: "셀 병합", exact: true })
            .click();
        await page.waitForFunction(
            () =>
                document
                    .querySelector('#cbTemplateRows [data-field="fin"]')
                    .closest("td").colSpan === 2,
        );
        await page
            .locator('#cbTemplateRows [data-field="fin"]')
            .first()
            .fill("MERGED TEXT");
        await page.click("#cbTemplateUpdate");
        await page.waitForTimeout(750);
        assert.match(
            await page.evaluate(
                () =>
                    window.lastAlert ||
                    document.querySelector("#cbTemplateStatus").textContent,
            ),
            /수정했습니다/,
        );
        assert.deepEqual(saved().rows[0]._merges, [
            { field: "fin", rows: 1, cols: 2 },
        ]);
        assert.equal(saved().rows[0].fin, "MERGED TEXT");
        assert.equal(saved().rows[1].warning, "CHECK BEFORE WORK");
        await page
            .getByRole("button", { name: "병합 해제", exact: true })
            .click();
        assert.equal(
            await page
                .locator('#cbTemplateRows [data-field="description"]')
                .first()
                .inputValue(),
            "ITEM 1",
        );
        await page.click("#cbTemplateNew");
        assert.equal(
            await page.locator("#cbTemplatePageTitle").textContent(),
            "B777 · 새 템플릿 생성",
        );
        await page.fill(
            "#cbTemplatePasteSource",
            "PANEL\tDESIGNATION\tFIN\tLOCATION\nFOR FIN 4000EM1(ENGINE-1)\t\t\t\n2500VU\tLP VLV MOT1 ENG 1\t1QG1\t0744\n** ON A/C FSN 801-803, 851-900, 951-952\n49VU\tCOM/CVR/SPLY\t23RK\tE14",
        );
        await page.click("#cbTemplatePasteImport");
        assert.equal(
            await page
                .locator('#cbTemplateRows [data-field="panel_loc"]')
                .first()
                .inputValue(),
            "FOR FIN 4000EM1(ENGINE-1)",
        );
        assert.equal(
            await page
                .locator('#cbTemplateRows [data-field="panel_loc"]')
                .first()
                .evaluate((el) => el.closest("td").colSpan),
            4,
        );
        assert.equal(
            await page
                .locator('#cbTemplateRows [data-field="description"]')
                .nth(1)
                .inputValue(),
            "LP VLV MOT1 ENG 1",
        );
        assert.equal(
            await page
                .locator('#cbTemplateRows [data-field="panel_loc"]')
                .nth(2)
                .inputValue(),
            "** ON A/C FSN 801-803, 851-900, 951-952",
        );
        assert.equal(
            await page
                .locator('#cbTemplateRows [data-field="panel_loc"]')
                .nth(2)
                .evaluate((el) => el.closest("td").colSpan),
            4,
        );
        assert.equal(
            await page
                .locator('#cbTemplateRows [data-field="description"]')
                .nth(3)
                .inputValue(),
            "COM/CVR/SPLY",
        );
        await page.locator(".cb-template-number-cell").nth(1).click();
        await page.locator(".cb-template-number-cell").nth(2).click();
        assert.match(
            await page.locator("#cbTemplateDeleteSelected").textContent(),
            /2/,
        );
        await page.click("#cbTemplateDeleteSelected");
        assert.equal(await page.locator("#cbTemplateRows tr").count(), 2);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});

test("managed template uses the document layout and saves edits", async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        const record = {
            panel_loc: "P11",
            cb_loc: "A1",
            fin: "1QG1",
            description: "TEST ITEM",
            cockpit: "V",
            ee: "",
            etc: "",
            warning: "",
        };
        const result = await fixture(browser, "cb_template_manage", [
            {
                id: 7,
                name: "Engine",
                aircraft_model: "B777",
                rows: [record],
            },
        ]);
        const { page, errors } = result;
        assert.equal(await page.locator(".cb-open-sheet").count(), 1);
        assert.equal(
            await page.locator("#cbOpenManagedTemplateUpdate").count(),
            1,
        );
        assert.equal(await page.locator("#cbOpenListPrint").count(), 1);
        assert.equal(
            await page.locator("#cbManagedTemplateName").inputValue(),
            "Engine",
        );
        assert.equal(
            await page
                .locator('#cbOpenListBody [data-field="description"]')
                .first()
                .textContent(),
            "TEST ITEM",
        );
        await page
            .locator('#cbOpenListBody [data-field="description"]')
            .first()
            .fill("UPDATED ITEM");
        await page.click("#cbOpenManagedTemplateUpdate");
        await page.waitForFunction(() =>
            document
                .querySelector("#cbOpenSaveMessage")
                ?.textContent.includes("저장했습니다"),
        );
        assert.equal(result.saved().id, 7);
        assert.equal(result.saved().rows[0].description, "UPDATED ITEM");
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});

test("template application lets the user filter rows shown on screen and in print", async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        const { page, errors } = await fixture(browser, "cb_open_list");
        await page.addInitScript(() => {
            sessionStorage.setItem(
                "cb_open_template_import_v1",
                JSON.stringify({
                    aircraft_model: "B777",
                    name: "Engine",
                    rows: [
                        {
                            panel_loc: "P6",
                            cb_loc: "A01",
                            fin: "COMMON",
                            description: "COMMON POWER",
                        },
                        {
                            panel_loc: "P11",
                            cb_loc: "",
                            fin: "",
                            description: "FOR FIN 4000EM1(ENGINE-1)",
                            _merges: [{ field: "panel_loc", rows: 1, cols: 4 }],
                        },
                        {
                            panel_loc: "2500VU",
                            cb_loc: "0744",
                            fin: "1QG1",
                            description: "LP VLV MOT1 ENG 1",
                        },
                        {
                            panel_loc: "SEPDC2",
                            cb_loc: "SSPC",
                            fin: "800QG1",
                            description: "LP VLV MOT2 ENG 1",
                        },
                        {
                            panel_loc: "FOR FIN 4000EM2(ENGINE-2)",
                            cb_loc: "",
                            fin: "",
                            description: "",
                            _merges: [{ field: "panel_loc", rows: 1, cols: 4 }],
                        },
                        {
                            panel_loc: "2501VU",
                            cb_loc: "0745",
                            fin: "2QG1",
                            description: "LP VLV MOT1 ENG 2",
                        },
                    ],
                }),
            );
        });
        await page.goto("http://cb.test/?from_template=1");
        await page.waitForTimeout(500);
        assert.deepEqual(errors, []);
        assert.equal(await page.locator("#cbOpenRowFilter").isHidden(), true);
        await page.click("#cbOpenRowFilterPanelToggle");
        await page.waitForSelector("#cbOpenRowFilter:not([hidden])");
        assert.equal(
            await page
                .locator("#cbOpenRowFilter")
                .getAttribute("data-bs-scroll"),
            "true",
        );
        assert.equal(
            await page
                .locator("#cbOpenRowFilter")
                .getAttribute("data-bs-backdrop"),
            "false",
        );
        assert.equal(
            await page
                .locator(".cb-open-row-filter-body")
                .evaluate((el) => getComputedStyle(el).overflowY),
            "auto",
        );
        assert.equal(
            await page.locator("#cbOpenRowFilterList").isHidden(),
            true,
        );
        await page.click("#cbOpenRowFilterToggle");
        assert.equal(
            await page.locator("#cbOpenRowFilterList").isVisible(),
            true,
        );
        assert.equal(
            await page.locator("#cbOpenRowFilterList input").count(),
            6,
        );
        assert.match(
            await page.locator("#cbOpenRowFilterStatus").textContent(),
            /6개 중 6개/,
        );
        assert.equal(
            await page
                .locator('#cbOpenListBody [data-field="panel_loc"]')
                .nth(1)
                .evaluate((el) => el.closest("td").colSpan),
            4,
        );
        assert.equal(
            await page
                .locator('#cbOpenListBody [data-field="warning"]')
                .first()
                .evaluate((el) =>
                    el.closest("td").classList.contains("cb-grid-covered"),
                ),
            false,
        );
        await page.locator("#cbOpenRowFilterList input").nth(1).uncheck();
        assert.match(
            await page.locator("#cbOpenRowFilterStatus").textContent(),
            /6개 중 5개/,
        );
        assert.equal(
            await page
                .locator("#cbOpenListBody tr.cb-open-row-excluded")
                .count(),
            1,
        );
        await page.fill("#cbOpenRowFilterSearch", "ENGINE-1");
        await page.click("#cbOpenRowFilterApply");
        assert.match(
            await page.locator("#cbOpenRowFilterStatus").textContent(),
            /6개 중 4개/,
        );
        assert.equal(
            await page
                .locator("#cbOpenListBody tr.cb-open-row-excluded")
                .count(),
            2,
        );
        await page.fill("#cbOpenRowFilterFrom", "2");
        await page.fill("#cbOpenRowFilterTo", "3");
        await page.click("#cbOpenRowFilterApply");
        assert.match(
            await page.locator("#cbOpenRowFilterStatus").textContent(),
            /6개 중 3개/,
        );
        await page.selectOption("#cbOpenRowFilterLogic", "or");
        await page.click("#cbOpenRowFilterApply");
        assert.match(
            await page.locator("#cbOpenRowFilterStatus").textContent(),
            /6개 중 4개/,
        );
        await page.evaluate(() =>
            window.dispatchEvent(new Event("beforeprint")),
        );
        const printText = await page.locator(".cb-print-pages").innerText();
        assert.ok(printText.includes("FOR FIN 4000EM1(ENGINE-1)"));
        assert.ok(printText.includes("COMMON POWER"));
        assert.ok(printText.includes("LP VLV MOT2 ENG 1"));
        assert.ok(printText.includes("LP VLV MOT1 ENG 1"));
        assert.ok(!printText.includes("FOR FIN 4000EM2(ENGINE-2)"));
        assert.ok(!printText.includes("LP VLV MOT1 ENG 2"));
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});

test("template import highlights rows that duplicate existing document data", async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        const duplicate = {
            panel_loc: "P11",
            cb_loc: "A01",
            fin: "1QG1",
            description: "LP VLV MOT1 ENG 1",
            warning: "",
        };
        const { page, errors } = await fixture(browser, "cb_open_list", [
            {
                id: 7,
                aircraft_model: "B777",
                name: "Engine",
                rows: [duplicate],
            },
        ]);

        for (const [field, value] of Object.entries(duplicate)) {
            await page
                .locator(`#cbOpenListBody [data-field="${field}"]`)
                .first()
                .fill(value);
        }

        await page.locator("#cbOpenAircraftModel").evaluate((select) => {
            if (![...select.options].some((option) => option.value === "B777")) {
                select.add(new Option("B777", "B777"));
            }
            select.value = "B777";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await page.waitForFunction(
            () => document.querySelector("#cbOpenTemplateSelect option[value='7']"),
        );
        await page.selectOption("#cbOpenTemplateSelect", "7");
        await page.click("#cbOpenTemplateImportBtn");

        await page.waitForFunction(
            () =>
                document.querySelectorAll(
                    "#cbOpenListBody tr.cb-open-row-duplicate",
                ).length === 2,
        );
        assert.match(
            await page.locator("#cbOpenSaveMessage").textContent(),
            /모든 값이 같은 중복 데이터 2개 행/,
        );

        await page
            .locator('#cbOpenListBody [data-field="open_shop"]')
            .nth(1)
            .fill("MCC");
        assert.equal(
            await page.locator("#cbOpenListBody tr.cb-open-row-duplicate").count(),
            0,
        );
        await page
            .locator('#cbOpenListBody [data-field="open_shop"]')
            .first()
            .fill("MCC");
        assert.equal(
            await page.locator("#cbOpenListBody tr.cb-open-row-duplicate").count(),
            2,
        );

        await page.evaluate(() =>
            window.dispatchEvent(new Event("beforeprint")),
        );
        assert.equal(
            await page.locator(".cb-print-page tr.cb-open-row-duplicate").count(),
            0,
        );

        await page
            .locator('#cbOpenListBody [data-field="fin"]')
            .nth(1)
            .fill("2QG1");
        assert.equal(
            await page.locator("#cbOpenListBody tr.cb-open-row-duplicate").count(),
            0,
        );
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});

test("open document can be saved as an aircraft template", async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        const result = await fixture(browser, "cb_open_list");
        const { page, errors } = result;
        await page.selectOption("#cbOpenAircraftModel", "B777");
        await page
            .locator('#cbOpenListBody [data-field="panel_loc"]')
            .first()
            .fill("P11");
        await page
            .locator('#cbOpenListBody [data-field="description"]')
            .first()
            .fill("TEST ITEM");
        await page.click("#cbOpenTemplateSave");
        assert.equal(
            await page.locator("#cbOpenTemplateSaveDialog").isVisible(),
            true,
        );
        await page.fill("#cbOpenTemplateName", "Line check");
        await page.click("#cbOpenTemplateSaveConfirm");
        await page.waitForURL("http://cb.test/");
        assert.equal(result.saved().aircraft_model, "B777");
        assert.equal(result.saved().name, "Line check");
        assert.equal(result.saved().rows[0].panel_loc, "P11");
        assert.equal(result.saved().rows[0].description, "TEST ITEM");
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});

test("document merges survive reload and print without empty continuation pages", async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        const { page, errors } = await fixture(browser, "cb_open_list");
        assert.equal(await page.locator(".cb-grid-toolbar").isHidden(), true);
        await page.click("#cbOpenGridToolsToggle");
        assert.equal(await page.locator(".cb-grid-toolbar").isVisible(), true);
        await page.selectOption("#cbOpenAircraftModel", "B777");
        await page.fill("#cbOpenGibun", "7700");
        const cells = (field) =>
            page.locator('#cbOpenListBody [data-field="' + field + '"]');
        await cells("description").nth(0).fill("FIRST");
        await cells("description").nth(1).fill("SECOND");
        await page
            .getByRole("button", { name: "병합 범위 선택", exact: true })
            .click();
        await cells("description").nth(0).click();
        await cells("description").nth(1).click();
        await page
            .getByRole("button", { name: "셀 병합", exact: true })
            .click();
        await page.waitForFunction(
            () =>
                document
                    .querySelector('#cbOpenListBody [data-field="description"]')
                    .closest("td").rowSpan === 2,
        );
        await page.reload();
        await page.waitForSelector(".cb-grid-toolbar", { state: "attached" });
        await page.click("#cbOpenGridToolsToggle");
        assert.equal(
            await cells("description")
                .nth(0)
                .evaluate((el) => el.closest("td").rowSpan),
            2,
        );
        await cells("panel_loc").nth(2).click();
        await page
            .getByRole("button", { name: "선택 행 위에 추가", exact: true })
            .click();
        assert.equal(await page.locator("#cbOpenListBody tr").count(), 17);
        await page.evaluate(() =>
            window.dispatchEvent(new Event("beforeprint")),
        );
        await page.emulateMedia({ media: "print" });
        assert.equal(await page.locator(".cb-print-page").count(), 1);
        assert.equal(
            await page
                .locator('.cb-print-page [data-field="description"]')
                .first()
                .evaluate((el) => el.closest("td").rowSpan),
            2,
        );
        assert.ok(
            await page
                .locator('.cb-print-page [data-field="description"]')
                .first()
                .isVisible(),
        );
        const fits = await page
            .locator(".cb-print-page")
            .evaluate(
                (p) =>
                    p
                        .querySelector(".cb-open-sheet-footer")
                        .getBoundingClientRect().bottom <=
                    p.getBoundingClientRect().bottom + 1,
            );
        assert.ok(fits);
        await page.evaluate(() =>
            window.dispatchEvent(new Event("afterprint")),
        );
        await page.emulateMedia({ media: "screen" });
        await cells("description").nth(8).fill("LAST");
        await page.evaluate(() => {
            document.querySelectorAll("#cbOpenListBody tr").forEach((row) => {
                row.style.height = "90px";
            });
            window.dispatchEvent(new Event("beforeprint"));
        });
        await page.emulateMedia({ media: "print" });
        const printedPageCount = await page.locator(".cb-print-page").count();
        assert.ok(printedPageCount > 1);
        assert.deepEqual(
            await page
                .locator(".cb-print-page-number")
                .allTextContents(),
            Array.from(
                { length: printedPageCount },
                (_, index) => `${index + 1} / ${printedPageCount}`,
            ),
        );
        const printState = await page
            .locator(".cb-print-page")
            .evaluateAll((pages) =>
                pages.map((p) => ({
                    fits:
                        p
                            .querySelector(".cb-open-sheet-footer")
                            .getBoundingClientRect().bottom <=
                        p.getBoundingClientRect().bottom + 1,
                    text: p.innerText,
                    hasOrphan: [
                        ...p.querySelectorAll("td.cb-grid-covered"),
                    ].some(
                        (td) =>
                            td.cellIndex === 7 &&
                            !p.querySelector('td[rowspan="2"]'),
                    ),
                })),
            );
        assert.ok(printState.every((p) => p.fits && !p.hasOrphan));
        assert.ok(printState.at(-1).text.includes("LAST"));
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});

test("editing toolbar sticks below the header on both pages and screen sizes", async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        for (const name of ["cb_open_list", "cb_template_manage"]) {
            const { page, errors } = await fixture(browser, name);
            await page.click("#cbOpenGridToolsToggle");
            await page.addStyleTag({
                content: fs.readFileSync(
                    path.join(root, "static/css/result_view.css"),
                    "utf8",
                ),
            });
            await page.addStyleTag({
                content: fs.readFileSync(
                    path.join(root, "static/css/mobile.css"),
                    "utf8",
                ),
            });
            await page.evaluate((name) => {
                document.body.className =
                    "assignment-console-body cb-open-body";
            }, name);
            for (const width of [1280, 390]) {
                await page.setViewportSize({ width, height: 800 });
                await page.evaluate(() => {
                    document.querySelector(
                        ".cb-open-sheet-stage, .cb-template-table-wrap",
                    ).style.height = "2400px";
                    window.scrollTo(0, 0);
                });
                await page.locator(".cb-grid-toolbar").evaluate((el) => {
                    window.scrollTo(
                        0,
                        el.getBoundingClientRect().top + window.scrollY + 250,
                    );
                });
                try {
                    await page.waitForFunction(
                        () => {
                            const toolbar = document
                                .querySelector(".cb-grid-toolbar")
                                .getBoundingClientRect();
                            const header = document
                                .querySelector(
                                    ".cb-open-topbar, .assignment-topbar",
                                )
                                .getBoundingClientRect();
                            const documentActions = document
                                .querySelector(".cb-open-table-heading")
                                ?.getBoundingClientRect();
                            const expectedTop = documentActions
                                ? header.bottom +
                                  documentActions.height +
                                  12
                                : header.bottom;
                            return (
                                (!documentActions ||
                                    Math.abs(
                                        documentActions.top -
                                            (header.bottom + 6),
                                    ) < 2) &&
                                Math.abs(toolbar.top - expectedTop) < 2
                            );
                        },
                        null,
                        { timeout: 3000 },
                    );
                } catch (error) {
                    const metrics = await page.evaluate(() => {
                        const toolbar =
                            document.querySelector(".cb-grid-toolbar");
                        const anchor = document.querySelector(
                            ".cb-grid-toolbar-anchor",
                        );
                        const header = document.querySelector(
                            ".cb-open-topbar, .assignment-topbar",
                        );
                        const documentActions = document.querySelector(
                            ".cb-open-table-heading",
                        );
                        return {
                            scrollY,
                            toolbar: toolbar.getBoundingClientRect().toJSON(),
                            anchor: anchor.getBoundingClientRect().toJSON(),
                            header: header.getBoundingClientRect().toJSON(),
                            documentActions:
                                documentActions?.getBoundingClientRect().toJSON(),
                            className: toolbar.className,
                            position: getComputedStyle(toolbar).position,
                        };
                    });
                    throw new Error(
                        name + "/" + width + ": " + JSON.stringify(metrics),
                    );
                }
            }
            assert.deepEqual(errors, []);
            await page.close();
        }
    } finally {
        await browser.close();
    }
});

test("vertical wheel over document tables scrolls the page instead of a nested area", async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        for (const name of ["cb_open_list", "cb_template_manage"]) {
            const { page, errors } = await fixture(browser, name);
            const host = page.locator(".cb-open-sheet-stage");
            await host.evaluate((element) => {
                element.style.height = "180px";
                element.style.overflowY = "auto";
                const spacer = document.createElement("div");
                spacer.style.height = "1200px";
                document.body.appendChild(spacer);
            });
            await host.hover();
            const before = await page.evaluate(() => window.scrollY);
            await page.mouse.wheel(0, 320);
            await page.waitForFunction(
                (value) => window.scrollY > value,
                before,
            );
            assert.equal(
                await host.evaluate((element) => element.scrollTop),
                0,
            );
            assert.deepEqual(errors, []);
            await page.close();
        }
    } finally {
        await browser.close();
    }
});

test("document tables fit their page without horizontal scrolling", async () => {
    const browser = await chromium.launch({
        channel: "msedge",
        headless: true,
    });
    try {
        for (const name of ["cb_open_list", "cb_template_manage"]) {
            const { page, errors } = await fixture(browser, name);
            await page.setViewportSize({ width: 390, height: 844 });
            const wrap = page.locator(".cb-open-table-wrap");
            const table = page.locator(".cb-open-table");
            assert.equal(
                await wrap.evaluate(
                    (element) => getComputedStyle(element).overflowX,
                ),
                "hidden",
            );
            const dimensions = await table.evaluate((element) => ({
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
            }));
            // Collapsed table borders can contribute a few device pixels without
            // creating a user-scrollable horizontal area.
            assert.equal(
                dimensions.scrollWidth <= dimensions.clientWidth + 8,
                true,
                `${name}: ${JSON.stringify(dimensions)}`,
            );
            if (name === "cb_open_list") {
                assert.equal(
                    await page
                        .locator('col[data-col="panel-loc"]')
                        .getAttribute("data-width"),
                    "60",
                );
                assert.equal(
                    await page
                        .locator('col[data-col="fin"]')
                        .getAttribute("data-width"),
                    "60",
                );
                await page
                    .locator('[data-col-width-input="description"]')
                    .evaluate((input) => {
                        input.value = "300";
                        input.dispatchEvent(
                            new Event("input", { bubbles: true }),
                        );
                    });
                await page
                    .locator('[data-col-width-input="panel-loc"]')
                    .evaluate((input) => {
                        input.value = "55";
                        input.dispatchEvent(
                            new Event("input", { bubbles: true }),
                        );
                    });
                await page.waitForTimeout(50);
                const descriptionWidth = Number.parseFloat(
                    await page
                        .locator('col[data-col="description"]')
                        .evaluate((element) => element.style.width),
                );
                const panelWidth = Number.parseFloat(
                    await page
                        .locator('col[data-col="panel-loc"]')
                        .evaluate((element) => element.style.width),
                );
                assert.ok(descriptionWidth / panelWidth > 5);
                const [stageBox, sheetBox] = await Promise.all([
                    page.locator(".cb-open-sheet-stage").boundingBox(),
                    page.locator(".cb-open-sheet").boundingBox(),
                ]);
                const zoom = await page
                    .locator(".cb-open-sheet")
                    .evaluate((element) => ({
                        inline: element.style.zoom,
                        computed: getComputedStyle(element).zoom,
                    }));
                assert.ok(
                    sheetBox.width <= stageBox.width + 1,
                    JSON.stringify({ stageBox, sheetBox, zoom }),
                );
            }
            assert.deepEqual(errors, []);
            await page.close();
        }
    } finally {
        await browser.close();
    }
});
