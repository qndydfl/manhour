const test = require('node:test');
const assert = require('node:assert/strict');
const parse = require('../static/js/bookmarks/cb_clipboard.js');

test('Manual Boeing comma input preserves blank FIN and description commas', () => {
    assert.deepEqual(parse('P110, P 23, , L ENG T/R CTRL\nP210, A 1, , CONTROL, LEFT', 'boeing-manual'), [
        { panel_loc: 'P110', cb_loc: 'P 23', fin: '', description: 'L ENG T/R CTRL' },
        { panel_loc: 'P210', cb_loc: 'A 1', fin: '', description: 'CONTROL, LEFT' },
    ]);
    assert.throws(() => parse('P110, P 23, NAME', 'boeing-manual'));
    assert.throws(() => parse('P110, P 23, , NAME\nP210, , , NAME', 'boeing-manual'));
});

test('Boeing plain text maps panel, Row/Col and Name without Number', () => {
    assert.deepEqual(parse('Left Power Management Panel, P110\nRow Col Number Name\nP 23 C78605 L ENG T/R CTRL '), [
        { panel_loc: 'P110', cb_loc: 'P 23', fin: '', description: 'L ENG T/R CTRL' },
    ]);
});

test('Boeing tab-separated multiple rows and panels', () => {
    const rows = parse('Left Panel, P110\r\nRow\tCol\tNumber\tName\r\nP\t23\tC78605\tL ENG T/R CTRL\r\nQ\t24\tC12\tSECOND ITEM\r\nRight Panel, P210\r\nRow Col Number Name\r\nA 1 C13 THIRD ITEM');
    assert.equal(rows.length, 3);
    assert.equal(rows[1].panel_loc, 'P110');
    assert.equal(rows[1].cb_loc, 'Q 24');
    assert.equal(rows[2].panel_loc, 'P210');
    assert.equal(rows[2].description, 'THIRD ITEM');
});

test('Airbus mapping and blank first field are preserved', () => {
    assert.deepEqual(parse('121VU\tLIGHT\t1XA\tSSPC 1\n\tOTHER\t2XA\tA 1'), [
        { panel_loc: '121VU', description: 'LIGHT', fin: '1XA', cb_loc: 'SSPC 1' },
        { panel_loc: '', description: 'OTHER', fin: '2XA', cb_loc: 'A 1' },
    ]);
});

test('Airbus table header is skipped and FOR FIN title becomes a merged row', () => {
    assert.deepEqual(parse(
        'PANEL\tDESIGNATION\tFIN\tLOCATION\nFOR FIN 4000EM1(ENGINE-1)\t\t\t\n2500VU\tLP VLV MOT1 ENG 1\t1QG1\t0744\nSEPDC2\tLP VLV MOT2 ENG 1\t800QG1\tSSPC',
    ), [
        { panel_loc: 'FOR FIN 4000EM1(ENGINE-1)', description: '', fin: '', cb_loc: '', warning: '', _merges: [{ field: 'panel_loc', rows: 1, cols: 4 }] },
        { panel_loc: '2500VU', description: 'LP VLV MOT1 ENG 1', fin: '1QG1', cb_loc: '0744' },
        { panel_loc: 'SEPDC2', description: 'LP VLV MOT2 ENG 1', fin: '800QG1', cb_loc: 'SSPC' },
    ]);
});

test('Airbus ON A/C heading with commas becomes one merged title row', () => {
    assert.deepEqual(parse(
        '** ON A/C FSN 801-803, 851-900, 951-952\n49VU\tCOM/CVR/SPLY\t23RK\tE14\n49VU\tCOM/CVR/CTL\t26RK\tE13\n** ON A/C FSN 801-900, 951-999\n49VU\tENGINE/1 AND 2/IGN/SYS A\t1JH\tA03',
    ), [
        { panel_loc: '** ON A/C FSN 801-803, 851-900, 951-952', description: '', fin: '', cb_loc: '', warning: '', _merges: [{ field: 'panel_loc', rows: 1, cols: 4 }] },
        { panel_loc: '49VU', description: 'COM/CVR/SPLY', fin: '23RK', cb_loc: 'E14' },
        { panel_loc: '49VU', description: 'COM/CVR/CTL', fin: '26RK', cb_loc: 'E13' },
        { panel_loc: '** ON A/C FSN 801-900, 951-999', description: '', fin: '', cb_loc: '', warning: '', _merges: [{ field: 'panel_loc', rows: 1, cols: 4 }] },
        { panel_loc: '49VU', description: 'ENGINE/1 AND 2/IGN/SYS A', fin: '1JH', cb_loc: 'A03' },
    ]);
});

test('Incomplete Boeing input fails before returning partial records', () => {
    assert.throws(() => parse('Row Col Number Name\nP 23 C78605 L ENG T/R CTRL'));
    assert.throws(() => parse('Panel, P110\nRow Col Number Name\nP 23 C1 NAME\nINVALID'));
    assert.deepEqual(parse(''), []);
});
