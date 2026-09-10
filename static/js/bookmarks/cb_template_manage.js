document.addEventListener('DOMContentLoaded', () => {
    const manager = document.getElementById('cbTemplateManager');
    if (!manager) return;

    const select = document.getElementById('cbTemplateSelect');
    const aircraftFilter = document.getElementById('cbTemplateFilterAircraft');
    const aircraftManageSelect = document.getElementById('cbAircraftManageSelect');
    const aircraftCode = document.getElementById('cbAircraftCode');
    const aircraftStatus = document.getElementById('cbAircraftStatus');
    const name = document.getElementById('cbTemplateName');
    const pasteSource = document.getElementById('cbTemplatePasteSource');
    const pasteImportButton = document.getElementById('cbTemplatePasteImport');
    const rowsBody = document.getElementById('cbTemplateRows');
    const fields = document.getElementById('cbTemplateFields');
    const updateButton = document.getElementById('cbTemplateUpdate');
    const applyButton = document.getElementById('cbTemplateApply');
    const status = document.getElementById('cbTemplateStatus');
    const keys = ['panel_loc', 'cb_loc', 'fin', 'description'];
    let templates = [];
    let selectedId = '';
    let previousAircraftFilter = aircraftFilter.value;
    let dirty = false;
    const csrfToken = manager.querySelector('[name=csrfmiddlewaretoken]').value;

    function showStatus(message = '', type = '') {
        status.textContent = message;
        status.className = 'cb-template-status' + (type ? ' is-' + type : '');
    }

    function showAircraftStatus(message = '', type = '') {
        if (!aircraftStatus) return;
        aircraftStatus.textContent = message;
        aircraftStatus.className = 'cb-aircraft-settings-status' + (type ? ' is-' + type : '');
    }

    function replaceAircraftOptions(models, selectedCode) {
        aircraftFilter.replaceChildren(...models.map((code) => new Option(code, code)));
        const selected = models.includes(selectedCode) ? selectedCode : models[0] || '';
        aircraftFilter.value = selected;
        if (aircraftManageSelect) {
            aircraftManageSelect.replaceChildren(...models.map((code) => new Option(code, code)));
            aircraftManageSelect.value = selected;
        }
        if (aircraftCode) aircraftCode.value = selected;
        previousAircraftFilter = selected;
    }

    async function refreshAircraftModels(selectedCode) {
        const response = await fetch(manager.dataset.aircraftApiUrl);
        if (!response.ok || response.redirected) throw new Error('기종 목록을 불러오지 못했습니다.');
        const data = await response.json();
        replaceAircraftOptions(data.aircraft_models, selectedCode);
    }

    async function changeAircraft(action) {
        const oldCode = aircraftManageSelect.value;
        const newCode = aircraftCode.value.trim().toUpperCase();
        if (!newCode && action !== 'delete') {
            showAircraftStatus('기종 이름을 입력해 주세요.', 'error');
            aircraftCode.focus();
            return;
        }
        if (action === 'delete') {
            const confirmed = await window.AppDialog.confirm(
                `${oldCode} 기종을 삭제하시겠습니까? 이 기종에 저장된 템플릿도 모두 삭제됩니다.`,
                { title: '기종 삭제', variant: 'danger', confirmText: '기종 삭제' },
            );
            if (!confirmed) return;
        } else if (action === 'rename' && oldCode === newCode) {
            showAircraftStatus('변경할 기종 이름을 입력해 주세요.', 'error');
            return;
        }
        try {
            const response = await fetch(manager.dataset.aircraftApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify({ action, old_code: oldCode, code: newCode, new_code: newCode }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '기종 변경에 실패했습니다.');
            const selectedCode = action === 'delete' ? '' : data.code;
            await refreshAircraftModels(selectedCode);
            await refresh();
            showAircraftStatus(
                action === 'create' ? `${data.code} 기종을 추가했습니다.`
                    : action === 'rename' ? `${oldCode} 기종을 ${data.code}(으)로 변경했습니다.`
                        : `${oldCode} 기종과 관련 템플릿을 삭제했습니다.`,
                'success',
            );
        } catch (error) {
            showAircraftStatus(error.message, 'error');
        }
    }

    function addRow(values = {}) {
        const row = document.createElement('tr');
        keys.forEach((key) => {
            const cell = document.createElement('td');
            const input = document.createElement(key === 'description' ? 'textarea' : 'input');
            input.className = 'form-control';
            input.dataset.field = key;
            input.value = values[key] || '';
            input.maxLength = 2000;
            input.setAttribute('aria-label', key);
            if (key === 'description') input.rows = 1;
            cell.append(input);
            row.append(cell);
        });
        const actionCell = document.createElement('td');
        actionCell.className = 'text-center';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-outline-danger btn-sm';
        remove.innerHTML = '<i class="bi bi-trash"></i><span class="visually-hidden">행 삭제</span>';
        remove.addEventListener('click', () => {
            row.remove();
            if (!rowsBody.children.length) addRow();
            dirty = true;
        });
        actionCell.append(remove);
        row.append(actionCell);
        rowsBody.append(row);
    }

    function rowIsEmpty(row) {
        return keys.every((key) => !row.querySelector('[data-field="' + key + '"]').value.trim());
    }

    function importPastedRows(text) {
        if (!text.trim()) {
            showStatus('붙여넣을 데이터를 입력해 주세요.', 'error');
            return 0;
        }
        try {
            const isTableData = text.includes('\t') || /Row\s+Col(?:umn)?\s+Number\s+Name/i.test(text);
            const records = window.parseCBClipboard(text, isTableData ? 'auto' : 'boeing-manual');
            if (rowsBody.children.length === 1 && rowIsEmpty(rowsBody.firstElementChild)) {
                rowsBody.replaceChildren();
            }
            records.forEach((record) => addRow({
                ...record,
            }));
            dirty = true;
            showStatus(String(records.length) + '행을 템플릿 표에 불러왔습니다.', 'success');
            return records.length;
        } catch (error) {
            showStatus(error.message, 'error');
            return 0;
        }
    }

    function showEditor(item) {
        name.value = item?.name || '';
        rowsBody.replaceChildren();
        (item?.rows?.length ? item.rows : [{}]).forEach(addRow);
        selectedId = item ? String(item.id) : '';
        select.value = selectedId;
        updateButton.disabled = !selectedId;
        applyButton.disabled = !selectedId;
        dirty = false;
    }

    function readRows() {
        const rows = Array.from(rowsBody.children).map((row) => Object.fromEntries(
            keys.map((key) => [key, row.querySelector(`[data-field="${key}"]`).value.trim()]),
        )).filter((row) => Object.values(row).some(Boolean));
        if (!rows.length || rows.some((row) => !row.panel_loc || !row.cb_loc || !row.description)) {
            throw new Error("PANEL, C/B LOC', DESCRIPTION을 입력해 주세요. FIN은 비워둘 수 있습니다.");
        }
        return rows;
    }

    async function confirmDiscard() {
        if (!dirty) return true;
        return window.AppDialog.confirm('저장하지 않은 편집 내용을 버리고 이동할까요?', { title: '편집 내용 확인' });
    }

    async function refresh(preferredId = '') {
        fields.disabled = true;
        showStatus('템플릿을 불러오는 중입니다.');
        try {
            const response = await fetch(`${manager.dataset.apiUrl}?aircraft_model=${encodeURIComponent(aircraftFilter.value)}`);
            if (!response.ok || response.redirected) throw new Error('템플릿을 불러오지 못했습니다. 로그인 상태를 확인해 주세요.');
            const data = await response.json();
            templates = data.templates;
            select.replaceChildren(new Option('새 템플릿', ''));
            templates.forEach((item) => select.add(new Option(`${item.name} (${item.rows.length}행)`, item.id)));
            showEditor(templates.find((item) => String(item.id) === String(preferredId)));
            previousAircraftFilter = aircraftFilter.value;
            showStatus(templates.length ? '' : '이 기종에 저장된 템플릿이 없습니다. 새 템플릿을 만들어 주세요.');
        } catch (error) {
            showStatus(error.message, 'error');
        } finally {
            fields.disabled = false;
        }
    }

    async function saveTemplate(isUpdate) {
        if (isUpdate && !selectedId) return;
        let rows;
        try {
            if (!name.value.trim()) throw new Error('템플릿 이름을 입력해 주세요.');
            rows = readRows();
        } catch (error) {
            showStatus(error.message, 'error');
            return;
        }
        fields.disabled = true;
        const payload = { aircraft_model: aircraftFilter.value, name: name.value.trim(), rows };
        if (isUpdate) {
            payload.id = Number(selectedId);
            payload.original_aircraft_model = aircraftFilter.value;
        }
        try {
            const response = await fetch(manager.dataset.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                body: JSON.stringify(payload),
            });
            if (response.redirected) throw new Error('로그인 상태를 확인해 주세요.');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '템플릿 저장에 실패했습니다.');
            dirty = false;
            await refresh(data.id);
            showStatus(`${data.name} 템플릿을 ${isUpdate ? '수정' : '생성'}했습니다.`, 'success');
        } catch (error) {
            showStatus(error.message, 'error');
        } finally {
            fields.disabled = false;
        }
    }

    fields.addEventListener('input', (event) => {
        if (event.target === name || rowsBody.contains(event.target)) dirty = true;
    });
    aircraftFilter.addEventListener('change', async () => {
        if (!await confirmDiscard()) {
            aircraftFilter.value = previousAircraftFilter;
            return;
        }
        if (aircraftManageSelect) aircraftManageSelect.value = aircraftFilter.value;
        if (aircraftCode) aircraftCode.value = aircraftFilter.value;
        await refresh();
    });
    select.addEventListener('change', async () => {
        const nextId = select.value;
        if (!await confirmDiscard()) {
            select.value = selectedId;
            return;
        }
        showEditor(templates.find((item) => String(item.id) === nextId));
        showStatus('');
    });
    document.getElementById('cbTemplateNew').addEventListener('click', async () => {
        if (await confirmDiscard()) {
            showEditor();
            showStatus('새 템플릿의 이름과 데이터를 입력해 주세요.');
            name.focus();
        }
    });
    document.getElementById('cbTemplateAddRow').addEventListener('click', () => {
        addRow();
        dirty = true;
        rowsBody.lastElementChild.querySelector('input, textarea').focus();
    });
    pasteSource.addEventListener('paste', (event) => {
        const text = event.clipboardData.getData('text/plain');
        if (!text.trim()) return;
        event.preventDefault();
        if (importPastedRows(text)) pasteSource.value = '';
    });
    pasteImportButton.addEventListener('click', () => {
        if (importPastedRows(pasteSource.value)) pasteSource.value = '';
    });
    if (aircraftManageSelect && aircraftCode) {
        aircraftManageSelect.addEventListener('change', () => {
            aircraftCode.value = aircraftManageSelect.value;
        });
        document.getElementById('cbAircraftAdd').addEventListener('click', () => changeAircraft('create'));
        document.getElementById('cbAircraftRename').addEventListener('click', () => changeAircraft('rename'));
        document.getElementById('cbAircraftDelete').addEventListener('click', () => changeAircraft('delete'));
    }
    document.getElementById('cbTemplateSave').addEventListener('click', () => saveTemplate(false));
    updateButton.addEventListener('click', () => saveTemplate(true));
    applyButton.addEventListener('click', () => {
        const item = templates.find((template) => String(template.id) === selectedId);
        if (!item) return;
        if (dirty) {
            showStatus('수정한 내용을 먼저 저장한 후 C/B 문서에 적용해 주세요.', 'error');
            return;
        }
        sessionStorage.setItem('cb_open_template_import_v1', JSON.stringify({
            aircraft_model: item.aircraft_model,
            name: item.name,
            rows: item.rows,
        }));
        window.location.href = manager.dataset.workspaceUrl;
    });

    showEditor();
    refresh();
});
