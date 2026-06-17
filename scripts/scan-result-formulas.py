import re
import sys
import zipfile
from pathlib import Path

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")

XLSX = Path(__file__).resolve().parents[1] / "temp-gameplay.xlsx"
workbook = openpyxl.load_workbook(XLSX, data_only=False)
gameplay = workbook["Gameplay"]
calculator = workbook["calculator"]


def scan_sheet_xml(sheet_file, needles):
    data = zipfile.ZipFile(XLSX).read(sheet_file).decode("utf-8", "replace")
    print(f"\n=== {sheet_file} ===")
    for needle in needles:
        for match in re.finditer(re.escape(needle), data):
            start = max(0, match.start() - 100)
            snippet = data[start : match.start() + 500]
            if "<f" in snippet:
                print(f"\n[{needle}]")
                print(snippet.replace("&quot;", '"').replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))
                break


def print_cells(sheet, addresses):
    print(f"\n=== {sheet.title} cells ===")
    for address in addresses:
        value = sheet[address].value
        if value is not None:
            text = str(value)
            if len(text) > 500:
                text = text[:500] + "..."
            print(f"{address}: {text}")


needles = [
    "Gameplay!AX",
    "Gameplay!AY",
    "Gameplay!AZ",
    "Gameplay!BA",
    "BG22",
    "BE22",
    "ABS(",
    "Diff",
    "S$17",
    "U$17",
    "V$26",
    "INDEX(S",
    "XLOOKUP(AZ",
]

scan_sheet_xml("xl/worksheets/sheet2.xml", needles)
scan_sheet_xml("xl/worksheets/sheet5.xml", needles)

print_cells(gameplay, [
    "AX3", "AY3", "AZ3", "BA3",
    "AX4", "AY4", "AZ4", "BA4",
    "BG22", "BE22", "BE16", "BE17",
    "S16", "T16", "U16", "V16", "S17", "T17", "U17", "V17", "S18", "T18", "U18", "V18",
    "S67", "T67", "U67", "V67",
])

print_cells(calculator, [
    "Q26", "R26", "S26", "T26", "U26", "V26",
    "Q67", "R67", "S67", "T67", "U67", "V67",
    "AG16", "H75", "H76", "I75", "Z11", "Z12", "Z13",
])

# Dump calculator rows 60-75 columns Q-V
print("\n=== calculator Q60:V75 ===")
for row in range(60, 76):
    values = [calculator.cell(row, col).value for col in range(17, 23)]
    if any(value not in (None, "") for value in values):
        print(row, values)
