import re
import sys
import zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

XLSX = Path(__file__).resolve().parents[1] / "temp-gameplay.xlsx"

with zipfile.ZipFile(XLSX) as archive:
    workbook = archive.read("xl/workbook.xml").decode("utf-8")
    rels = archive.read("xl/_rels/workbook.xml.rels").decode("utf-8")

    sheet_map = {}
    for match in re.finditer(r'<sheet[^>]+name="([^"]+)"[^>]+r:id="([^"]+)"', workbook):
        sheet_map[match.group(1)] = match.group(2)

    rel_map = {}
    for match in re.finditer(r'Id="([^"]+)"[^>]+Target="([^"]+)"', rels):
        rel_map[match.group(1)] = match.group(2)

    targets = {
        name: rel_map[rid].replace("worksheets/", "xl/worksheets/")
        for name, rid in sheet_map.items()
        if rid in rel_map
    }

    for sheet_name in ["Gameplay", "calculator"]:
        xml_path = targets[sheet_name]
        data = archive.read(xml_path).decode("utf-8")
        print(f"\n# {sheet_name} -> {xml_path}")

        if sheet_name == "Gameplay":
            for needle in ["calculator!AA19", "calculator!AA20", "calculator!AA17", "calculator!AA18", "BG22"]:
                print(f"\nReferences to {needle}: {data.count(needle)}")
                index = data.find(needle)
                while index != -1:
                    snippet = data[max(0, index - 120) : index + 180]
                    formula_match = re.search(r"<f[^>]*>(.*?)</f>", snippet, re.S)
                    if formula_match:
                        formula = (
                            formula_match.group(1)
                            .replace("&quot;", '"')
                            .replace("&amp;", "&")
                            .replace("&lt;", "<")
                            .replace("&gt;", ">")
                        )
                        print(f"  ...{formula[-180:]}")
                    index = data.find(needle, index + 1)

        for cell in ["S16", "S17", "T17", "U17", "V17", "U18", "V18", "AZ4", "BA4", "BG22", "AA19", "AA20", "AA17", "AA18", "AC19", "AG2", "AG3", "CC7", "CC8", "AX3", "AY3", "AZ3", "BA3"]:
            marker = f'r="{cell}"'
            index = data.find(marker)
            if index == -1:
                print(f"{cell}: missing")
                continue

            snippet = data[index : index + 2500]
            formula_match = re.search(r"<f[^>]*>(.*?)</f>", snippet, re.S)
            if formula_match:
                formula = (
                    formula_match.group(1)
                    .replace("&quot;", '"')
                    .replace("&amp;", "&")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                )
                print(f"{cell}: {formula}")
            else:
                print(f"{cell}: no formula in snippet")
