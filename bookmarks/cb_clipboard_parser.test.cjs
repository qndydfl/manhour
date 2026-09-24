const test = require("node:test");
const assert = require("node:assert/strict");
const parse = require("../static/js/bookmarks/cb_clipboard_parser.js");

test("vertical Airbus clipboard columns are grouped into document rows", () => {
    assert.deepEqual(
        parse(
            "PANEL\nDESIGNATION\nFIN\nLOCATION\n" +
                "CBP2\nC/B-LP V MOT1 ENG2\n3200QG\n6AA10\n" +
                "EPDC1\nC/B-LP V MOT2 ENG2\n3101QG\n1KC03",
            "boeing-manual",
        ),
        [
            {
                cockpit: "",
                ee: "",
                etc: "",
                panel_loc: "CBP2",
                cb_loc: "6AA10",
                fin: "3200QG",
                description: "C/B-LP V MOT1 ENG2",
                warning: "",
            },
            {
                cockpit: "",
                ee: "",
                etc: "",
                panel_loc: "EPDC1",
                cb_loc: "1KC03",
                fin: "3101QG",
                description: "C/B-LP V MOT2 ENG2",
                warning: "",
            },
        ],
    );
});

test("split Boeing rows allow a missing number and AAR between row and column", () => {
    const rows = parse(
        "Overhead Circuit Breaker Panel, P11\n" +
            "Row Col Number Name\n" +
            "AAR 122-124\n" +
            "A\n" +
            "5\n" +
            "L ENGINE FUELSPAR VALVE\n" +
            "AAR107, 116-121, 201, 202, 205-999\n" +
            "A\n" +
            "AARALL\n" +
            "18 C28001 L ENGINE FUEL SPAR VALVE",
    );

    assert.deepEqual(
        rows.map((row) => ({
            panel_loc: row.panel_loc,
            cb_loc: row.cb_loc,
            description: row.description,
            merged: Boolean(row._merges),
        })),
        [
            { panel_loc: "AAR 122-124", cb_loc: "", description: "", merged: true },
            { panel_loc: "P11", cb_loc: "A 5", description: "L ENGINE FUELSPAR VALVE", merged: false },
            { panel_loc: "AAR 107, 116-121, 201, 202, 205-999", cb_loc: "", description: "", merged: true },
            { panel_loc: "P11", cb_loc: "A 18", description: "L ENGINE FUEL SPAR VALVE", merged: false },
        ],
    );
});

test("Boeing AAR and row pairs map to following mixed column data", () => {
    const rows = parse(
        "Overhead Circuit Breaker Panel, P11\n" +
            "Row Col Number Name\n" +
            "AAR107, 116-121, 201, 202, 205-999\n" +
            "A\n" +
            "AARALL\n" +
            "B\n" +
            "18 C28001 L ENGINE FUEL SPAR VALVE\n" +
            "4\n" +
            "C76601\n" +
            "L ENG FUELVALVE",
    );

    assert.deepEqual(
        rows.map((row) => [
            row.panel_loc,
            row.cb_loc,
            row.description,
            Boolean(row._merges),
        ]),
        [
            ["AAR 107, 116-121, 201, 202, 205-999", "", "", true],
            ["P11", "A 18", "L ENGINE FUEL SPAR VALVE", false],
            ["P11", "B 4", "L ENG FUELVALVE", false],
        ],
    );
});

test("mixed Boeing copy styles in one panel are parsed by section", () => {
    const rows = parse(
        "Overhead Circuit Breaker Panel, P11\n" +
            "Row Col Number Name\n" +
            "AAR 122-124\n" +
            "A\n" +
            "5\n" +
            "C28001\n" +
            "L ENGINE FUELSPAR VALVE\n" +
            "AAR107, 116-121, 201, 202, 205-999\n" +
            "A\n" +
            "AARALL\n" +
            "B\n\n" +
            "18 C28001 L ENGINE FUEL SPAR VALVE\n" +
            "4\n" +
            "C76601\n" +
            "L ENG FUELVALVE",
    );

    assert.deepEqual(
        rows.map((row) => [
            row.panel_loc,
            row.cb_loc,
            row.description,
            Boolean(row._merges),
        ]),
        [
            ["AAR 122-124", "", "", true],
            ["P11", "A 5", "L ENGINE FUELSPAR VALVE", false],
            ["AAR 107, 116-121, 201, 202, 205-999", "", "", true],
            ["P11", "A 18", "L ENGINE FUEL SPAR VALVE", false],
            ["P11", "B 4", "L ENG FUELVALVE", false],
        ],
    );
});

test("Boeing dashed header and number-only panel are accepted", () => {
    const rows = parse(
        "Aft APU Equipment Control and Circuit Breaker Panel, P83\n" +
            "Row Col Number Name------\n" +
            "C08815\n" +
            "APU PRIME CONTROL\n" +
            "Main Power Distribution Panel, P6\n" +
            "Row Col Number Name\n" +
            "K\n" +
            "18 C08814 APUALT CONTROL",
    );

    assert.deepEqual(
        rows.map((row) => [row.panel_loc, row.cb_loc, row.description]),
        [
            ["P83", "", "APU PRIME CONTROL"],
            ["P6", "K 18", "APUALT CONTROL"],
        ],
    );
});

test("multiple Boeing panels support column-major and AAR grouped rows", () => {
    const rows = parse(
        "Right Power Management Panel, P210\n" +
            "Row Col Number Name\nK\nK\n5\n8\nC27607\nC27630\n" +
            "SLATS PRI DR CTRL2\nSLATS ELEC CTRLRLY PWR\n" +
            "Right Power Panel, P200\nRow Col Number Name\n" +
            "AAR107, 117-124\nB\n3\nC27300\n" +
            "AAR116, 201, 202, 205-999\nD\n8\nC27300\n" +
            "SLATS ELEC MOT PWR\nSLATS ELEC MOT PWR\n" +
            "Standby Power Management Panel, P310\nRow Col Number Name\n" +
            "AARALL\nG\n12 C27606 SLATS PRI DR CTRL 1",
    );

    assert.deepEqual(
        rows.map((row) => [
            row.panel_loc,
            row.cb_loc,
            row.description,
            Boolean(row._merges),
        ]),
        [
            ["P210", "K 5", "SLATS PRI DR CTRL2", false],
            ["P210", "K 8", "SLATS ELEC CTRLRLY PWR", false],
            ["AAR 107, 117-124", "", "", true],
            ["P200", "B 3", "SLATS ELEC MOT PWR", false],
            ["AAR 116, 201, 202, 205-999", "", "", true],
            ["P200", "D 8", "SLATS ELEC MOT PWR", false],
            ["P310", "G 12", "SLATS PRI DR CTRL 1", false],
        ],
    );
});

test("Boeing M-series equipment title is accepted as a panel", () => {
    const rows = parse(
        "Power Supply Assembly Left, M24101\n" +
            "Row Col Number Name\n" +
            "B\n" +
            "4\n" +
            "SUBTASK 27-62-03-860-004\n" +
            "WARNING\n" +
            "CBB4-L\n" +
            "AUTO SPDBRK(L,R)",
    );

    assert.deepEqual(
        rows.map((row) => [row.panel_loc, row.cb_loc, row.description]),
        [["M24101", "B 4", "AUTO SPDBRK(L,R)"]],
    );
});

test("Boeing number and description lines map to preceding column-major rows", () => {
    const rows = parse(
        "Left Power Management Panel, P110\n" +
            "Row Col Number Name\nK\n28 C27608 ACE-L2 PWR\n" +
            "Power Supply Assembly Center, M24301\n" +
            "Row Col Number Name\nA\nD\nD\nD\nD\n" +
            "1\n2\n4\n6\n8\n" +
            "CBA1-C ACE PWR\n" +
            "CBD2-C PFC LANE 1\n" +
            "CBD4-C PFC LANE 2\n" +
            "CBD6-C PFC LANE 3\n" +
            "CBD8-C PFC BAT INTLK",
    );

    assert.deepEqual(
        rows.map((row) => [row.panel_loc, row.cb_loc, row.description]),
        [
            ["P110", "K 28", "ACE-L2 PWR"],
            ["M24301", "A 1", "ACE PWR"],
            ["M24301", "D 2", "PFC LANE 1"],
            ["M24301", "D 4", "PFC LANE 2"],
            ["M24301", "D 6", "PFC LANE 3"],
            ["M24301", "D 8", "PFC BAT INTLK"],
        ],
    );
});
