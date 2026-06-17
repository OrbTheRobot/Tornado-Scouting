import re
import sys
import zipfile
from pathlib import Path

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")

XLSX = Path(__file__).resolve().parents[1] / "temp-gameplay.xlsx"
TARGETS = [
    "S16", "T16", "U16", "V16", "S17", "T17", "U17", "V17", "U18", "V18",
    "AZ3", "AZ4", "BA3", "BA4", "AX3", "AY3", "AX4", "AY4",
]


def extract_from_xml():
    formulas = {}
    with zipfile.ZipFile(XLSX) as archive:
        for name in sorted(archive.namelist()):
            if not name.startswith("xl/worksheets/") or not name.endswith(".xml"):
                continue

            data = archive.read(name).decode("utf-8", "replace")
            if "calculator!$Q$26" not in data and "AZ4" not in data:
                continue

            print(f"\nWorksheet XML: {name}")
            for target in TARGETS:
                marker = f'r="{target}"'
                index = data.find(marker)
                if index == -1:
                    continue

                snippet = data[index:index + 2000]
                match = re.search(r"<f[^>]*>(.*?)</f>", snippet, re.S)
                if match:
                    formulas[target] = match.group(1)
                    print(f"{target}: {match.group(1)}")

    return formulas


def extract_from_openpyxl():
    workbook = openpyxl.load_workbook(XLSX, data_only=False)
    gameplay = workbook["Gameplay"]
    calculator = workbook["calculator"]

    print("\n=== Gameplay key cells (openpyxl) ===")
    for target in TARGETS:
        print(f"{target}: {gameplay[target].value}")

    print("\n=== calculator Q26:V45 ===")
    for row in range(26, 46):
        values = [calculator.cell(row, column).value for column in range(17, 23)]
        if any(value not in (None, "") for value in values):
            print(f"row {row}: {values}")


def dump_gameplay_cells():
    with zipfile.ZipFile(XLSX) as archive:
        data = archive.read("xl/worksheets/sheet2.xml").decode("utf-8", "replace")

    for cell in ["AZ2", "BA2", "AX3", "AY3", "AZ3", "BA3", "AX4", "AY4", "AZ4", "BA4"]:
        marker = f'r="{cell}"'
        index = data.find(marker)
        print(f"\n=== {cell} ===")
        if index == -1:
            print("missing")
            continue
        print(data[index:index + 3500])


if __name__ == "__main__":
    extract_from_openpyxl()
    extract_from_xml()
    dump_gameplay_cells()
