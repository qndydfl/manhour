// Run with node --test; CB_PLAYWRIGHT_PATH may point to an installed Playwright.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.CB_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');

async function fixture(browser, name, templates = []) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        window.AppDialog = { confirm: async () => true, alert: async message => { window.lastAlert = message; } };
    });
    let saved;
    await page.route('http://cb.test/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/static/')) {
            const filename = path.join(root, url.pathname.slice(1));
            return route.fulfill({ body: fs.readFileSync(filename), contentType: filename.endsWith('.css') ? 'text/css' : 'text/javascript' });
        }
        if (url.pathname === '/api/templates') {
            if (route.request().method() === 'POST') {
                saved = route.request().postDataJSON();
                templates = [{ ...saved, id: 1 }];
                return route.fulfill({ json: { id: 1, name: saved.name } });
            }
            return route.fulfill({ json: { templates } });
        }
        if (url.pathname === '/api/aircraft') return route.fulfill({ json: { aircraft_models: ['B777'] } });
        let html = fs.readFileSync(path.join(root, 'templates/bookmarks', name + '.html'), 'utf8');
        html = html.replace(/{%\s*static\s+'([^']+)'\s*%}/g, '/static/$1')
            .replace(/{%\s*url\s+'bookmarks:cb_templates'\s*%}/g, '/api/templates')
            .replace(/{%\s*url\s+'bookmarks:cb_aircraft_models'\s*%}/g, '/api/aircraft')
            .replace(/{%\s*csrf_token\s*%}/g, '<input name="csrfmiddlewaretoken" value="test" type="hidden">')
            .replace(/{{\s*aircraft_model\s*}}/g, 'B777')
            .replace(/{{[^}]*}}/g, '').replace(/{%[\s\S]*?%}/g, '');
        await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>' });
    });
    await page.goto('http://cb.test/');
    await page.waitForSelector('.cb-grid-toolbar');
    return { page, errors, saved: () => saved };
}

test('template middle insertion, reversible merges and saved merge metadata', async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const record = i => ({ panel_loc: 'P11', cb_loc: 'A' + i, fin: '', description: 'ITEM ' + i });
        const { page, errors, saved } = await fixture(browser, 'cb_template_manage', [{ id: 1, name: 'Test', aircraft_model: 'B777', rows: [record(1), record(2)] }]);
        await page.selectOption('#cbTemplateSelect', '1');
        await page.locator('#cbTemplateRows [data-field="panel_loc"]').first().click();
        await page.getByRole('button', { name: '선택 행 아래에 추가', exact: true }).click();
        assert.equal(await page.locator('#cbTemplateRows tr').count(), 3);
        assert.equal(await page.locator('#cbTemplateRows [data-field="cb_loc"]').nth(2).inputValue(), 'A2');
        await page.evaluate(() => { window.lastAlert = ''; });
        await page.click('#cbTemplateUpdate');
        await page.waitForFunction(() => window.lastAlert?.includes('수정했습니다'));
        assert.equal(saved().rows.length, 3);
        assert.equal(saved().rows[1].panel_loc, '');
        await page.locator('#cbTemplateRows [data-field="cb_loc"]').nth(1).fill('NEW');
        await page.locator('#cbTemplateRows [data-field="description"]').nth(1).fill('NEW ITEM');
        await page.locator('#cbTemplateRows [data-field="warning"]').nth(1).fill('CHECK BEFORE WORK');
        await page.getByRole('button', { name: '병합 범위 선택', exact: true }).click();
        await page.locator('#cbTemplateRows [data-field="panel_loc"]').nth(0).click();
        await page.locator('#cbTemplateRows [data-field="panel_loc"]').nth(1).click();
        await page.getByRole('button', { name: '셀 병합', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#cbTemplateRows [data-field="panel_loc"]').closest('td').rowSpan === 2);
        await page.click('#cbTemplateUpdate');
        await page.waitForTimeout(750);
        assert.match(await page.evaluate(() => window.lastAlert || document.querySelector('#cbTemplateStatus').textContent), /수정했습니다/);
        assert.deepEqual(saved().rows[0]._merges, [{ field: 'panel_loc', rows: 2, cols: 1 }]);
        assert.equal(await page.locator('#cbTemplateRows td.cb-grid-covered').count(), 1);
        await page.locator('#cbTemplateRows [data-field="panel_loc"]').first().click();
        await page.getByRole('button', { name: '병합 해제', exact: true }).click();
        assert.equal(await page.locator('#cbTemplateRows td.cb-grid-covered').count(), 0);
        assert.equal(await page.locator('#cbTemplateRows [data-field="cb_loc"]').nth(2).inputValue(), 'A2');
        await page.locator('#cbTemplateRows [data-field="panel_loc"]').nth(1).fill('P12');
        await page.getByRole('button', { name: '병합 범위 선택', exact: true }).click();
        await page.locator('#cbTemplateRows [data-field="fin"]').first().click();
        await page.locator('#cbTemplateRows [data-field="description"]').first().click();
        await page.getByRole('button', { name: '셀 병합', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#cbTemplateRows [data-field="fin"]').closest('td').colSpan === 2);
        await page.locator('#cbTemplateRows [data-field="fin"]').first().fill('MERGED TEXT');
        await page.click('#cbTemplateUpdate');
        await page.waitForTimeout(750);
        assert.match(await page.evaluate(() => window.lastAlert || document.querySelector('#cbTemplateStatus').textContent), /수정했습니다/);
        assert.deepEqual(saved().rows[0]._merges, [{ field: 'fin', rows: 1, cols: 2 }]);
        assert.equal(saved().rows[0].fin, 'MERGED TEXT');
        assert.equal(saved().rows[1].warning, 'CHECK BEFORE WORK');
        await page.getByRole('button', { name: '병합 해제', exact: true }).click();
        assert.equal(await page.locator('#cbTemplateRows [data-field="description"]').first().inputValue(), 'ITEM 1');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});

test('document merges survive reload and print without empty continuation pages', async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const { page, errors } = await fixture(browser, 'cb_open_list');
        await page.selectOption('#cbOpenAircraftModel', 'B777');
        await page.fill('#cbOpenGibun', '7700');
        const cells = field => page.locator('#cbOpenListBody [data-field="' + field + '"]');
        await cells('description').nth(0).fill('FIRST');
        await cells('description').nth(1).fill('SECOND');
        await page.getByRole('button', { name: '병합 범위 선택', exact: true }).click();
        await cells('description').nth(0).click();
        await cells('description').nth(1).click();
        await page.getByRole('button', { name: '셀 병합', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#cbOpenListBody [data-field="description"]').closest('td').rowSpan === 2);
        await page.reload();
        await page.waitForSelector('.cb-grid-toolbar');
        assert.equal(await cells('description').nth(0).evaluate(el => el.closest('td').rowSpan), 2);
        await cells('panel_loc').nth(2).click();
        await page.getByRole('button', { name: '선택 행 위에 추가', exact: true }).click();
        assert.equal(await page.locator('#cbOpenListBody tr').count(), 17);
        await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
        await page.emulateMedia({ media: 'print' });
        assert.equal(await page.locator('.cb-print-page').count(), 1);
        assert.equal(await page.locator('.cb-print-page [data-field="description"]').first().evaluate(el => el.closest('td').rowSpan), 2);
        assert.ok(await page.locator('.cb-print-page [data-field="description"]').first().isVisible());
        const fits = await page.locator('.cb-print-page').evaluate(p => p.querySelector('.cb-open-sheet-footer').getBoundingClientRect().bottom <= p.getBoundingClientRect().bottom + 1);
        assert.ok(fits);
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
        await page.emulateMedia({ media: 'screen' });
        await cells('description').nth(8).fill('LAST');
        await page.evaluate(() => {
            document.querySelectorAll('#cbOpenListBody tr').forEach(row => { row.style.height = '90px'; });
            window.dispatchEvent(new Event('beforeprint'));
        });
        await page.emulateMedia({ media: 'print' });
        assert.ok(await page.locator('.cb-print-page').count() > 1);
        const printState = await page.locator('.cb-print-page').evaluateAll(pages => pages.map(p => ({
            fits: p.querySelector('.cb-open-sheet-footer').getBoundingClientRect().bottom <= p.getBoundingClientRect().bottom + 1,
            text: p.innerText,
            hasOrphan: [...p.querySelectorAll('td.cb-grid-covered')].some(td => td.cellIndex === 7 && !p.querySelector('td[rowspan="2"]')),
        })));
        assert.ok(printState.every(p => p.fits && !p.hasOrphan));
        assert.ok(printState.at(-1).text.includes('LAST'));
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});

test('editing toolbar sticks below the header on both pages and screen sizes', async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const name of ['cb_open_list', 'cb_template_manage']) {
            const { page, errors } = await fixture(browser, name);
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'static/css/result_view.css'), 'utf8') });
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'static/css/mobile.css'), 'utf8') });
            await page.evaluate(name => {
                document.body.className = 'assignment-console-body ' + (name === 'cb_open_list' ? 'cb-open-body' : 'cb-template-manage-body');
            }, name);
            for (const width of [1280, 390]) {
                await page.setViewportSize({ width, height: 800 });
                await page.evaluate(() => {
                    document.querySelector('.cb-open-sheet-stage, .cb-template-table-wrap').style.height = '2400px';
                    window.scrollTo(0, 0);
                });
                await page.locator('.cb-grid-toolbar').evaluate(el => {
                    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + 250);
                });
                try { await page.waitForFunction(() => {
                    const toolbar = document.querySelector('.cb-grid-toolbar').getBoundingClientRect();
                    const header = document.querySelector('.cb-open-topbar, .assignment-topbar').getBoundingClientRect();
                    return Math.abs(toolbar.top - header.bottom) < 2;
                }, null, { timeout: 3000 }); } catch (error) {
                    const metrics = await page.evaluate(() => {
                        const toolbar = document.querySelector('.cb-grid-toolbar');
                        const anchor = document.querySelector('.cb-grid-toolbar-anchor');
                        const header = document.querySelector('.cb-open-topbar, .assignment-topbar');
                        return { scrollY, toolbar: toolbar.getBoundingClientRect().toJSON(), anchor: anchor.getBoundingClientRect().toJSON(), header: header.getBoundingClientRect().toJSON(), className: toolbar.className, position: getComputedStyle(toolbar).position };
                    });
                    throw new Error(name + '/' + width + ': ' + JSON.stringify(metrics));
                }
            }
            assert.deepEqual(errors, []);
            await page.close();
        }
    } finally { await browser.close(); }
});
