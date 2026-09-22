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
            { panel_loc: "AAR ALL", cb_loc: "", description: "", merged: true },
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
            ["AAR ALL", "", "", true],
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
            ["AAR ALL", "", "", true],
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
