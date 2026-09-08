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

test('Incomplete Boeing input fails before returning partial records', () => {
    assert.throws(() => parse('Row Col Number Name\nP 23 C78605 L ENG T/R CTRL'));
    assert.throws(() => parse('Panel, P110\nRow Col Number Name\nP 23 C1 NAME\nINVALID'));
    assert.deepEqual(parse(''), []);
});
