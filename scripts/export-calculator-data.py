"""Export calculator static tables and sample computed ranges to JSON."""
import json
import openpyxl
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "temp-gameplay.xlsx"
OUT = ROOT / "calculator-tables.json"


def cell_value(sheet, row, col):
    value = sheet.cell(row, col).value
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    calc = wb["calculator"]

    rating_headers = [cell_value(calc, 25, col) for col in range(4, 15)]
    result_codes = [
        cell_value(calc, row, 1)
        for row in range(26, 38)
        if cell_value(calc, row, 1)
    ]
    rating_matrix = [
        [cell_value(calc, row, col) for col in range(4, 15)]
        for row in range(26, 38)
    ]

    hl_lookup = []
    for row in range(11, 21):
        code = cell_value(calc, row, 1)
        if not code:
            continue
        hl_lookup.append(
            {
                "code": code,
                "batterKey": cell_value(calc, row, 2),
                "pitcherKey": cell_value(calc, row, 3),
            }
        )

    pitcher_ratings = {}
    batter_ratings = {}
    for col in range(25, 29):
        pitcher_key = cell_value(calc, 2, col)
        if pitcher_key:
            pitcher_ratings[pitcher_key] = cell_value(calc, 3, col)
    for col in range(25, 29):
        batter_key = cell_value(calc, 5, col)
        if batter_key:
            batter_ratings[batter_key] = cell_value(calc, 6, col)

    modifiers = []
    for row in range(40, 51):
        code = cell_value(calc, row, 1)
        if code:
            modifiers.append({"code": code, "value": cell_value(calc, row, 9) or 0})

    go_rates = []
    for row in range(62, 72):
        code = cell_value(calc, row, 1)
        rate = cell_value(calc, row, 10)
        if code:
            go_rates.append({"code": code, "rate": rate or 0})

    payload = {
        "constants": {
            "C74": cell_value(calc, 74, 3),
            "C75": cell_value(calc, 75, 3),
            "C76": cell_value(calc, 76, 3),
            "C77": cell_value(calc, 77, 3),
            "C80": cell_value(calc, 80, 3),
            "C81": cell_value(calc, 81, 3),
            "C82": cell_value(calc, 82, 3),
            "N9": cell_value(calc, 9, 14),
            "U37": cell_value(calc, 37, 21),
            "V21": cell_value(calc, 21, 22),
            "W21": cell_value(calc, 21, 23),
        },
        "ratingHeaders": rating_headers,
        "resultCodes": result_codes,
        "ratingMatrix": rating_matrix,
        "hlLookup": hl_lookup,
        "pitcherRatingTable": pitcher_ratings,
        "batterRatingTable": batter_ratings,
        "modifiers": modifiers,
        "goRates": go_rates,
        "baseRangeCodes": ["HR", "3B", "2B", "1B", "IF1B", "BB", "FO", "PO", "K", "GO", "LO"],
        "hlCodeMap": {
            "Hit": "1B",
            "HR": "HR",
            "3B": "3B",
            "2B": "2B",
            "IF1B": "IF1B",
            "BB": "BB",
            "FO": "FO",
            "PO": "PO",
            "K": "K",
        },
    }

    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
