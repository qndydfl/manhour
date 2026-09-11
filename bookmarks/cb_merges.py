TEMPLATE_FIELDS = ("cockpit", "ee", "etc", "panel_loc", "cb_loc", "fin", "description")


def clean_template_merges(rows):
    """Validate rectangular ranges and return metadata plus covered cells."""
    result = [[] for _ in rows]
    occupied = set()
    covered = set()
    for row_index, row in enumerate(rows):
        merges = row.get("_merges", [])
        if not isinstance(merges, list) or len(merges) > len(TEMPLATE_FIELDS):
            raise ValueError
        for merge in merges:
            if not isinstance(merge, dict) or merge.get("field") not in TEMPLATE_FIELDS:
                raise ValueError
            column = TEMPLATE_FIELDS.index(merge["field"])
            height, width = merge.get("rows"), merge.get("cols")
            if type(height) is not int or type(width) is not int:
                raise ValueError
            if height < 1 or width < 1 or height * width < 2 or row_index + height > len(rows) or column + width > len(TEMPLATE_FIELDS):
                raise ValueError
            for r in range(row_index, row_index + height):
                for c in range(column, column + width):
                    if (r, c) in occupied:
                        raise ValueError
                    occupied.add((r, c))
                    if (r, c) != (row_index, column):
                        covered.add((r, TEMPLATE_FIELDS[c]))
            result[row_index].append({"field": merge["field"], "rows": height, "cols": width})
    return result, covered
