import re
import sys
import zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

XLSX = Path(__file__).resolve().parents[1] / "temp-gameplay.xlsx"
data = zipfile.ZipFile(XLSX).read("xl/worksheets/sheet2.xml").decode("utf-8", "replace")

patterns = [
    "ABS(",
    "S$17",
    "S17:V",
    "INDEX(",
    "XLOOKUP(",
    "FILTER(",
    "QUERY(",
    "calculator!",
    "AZ4",
    "BA4",
    "BG22",
    "AA16",
    "DUMMYFUNCTION",
]

for pattern in patterns:
    matches = list(re.finditer(re.escape(pattern), data))
    print(f"{pattern}: {len(matches)}")
    if matches:
        start = max(0, matches[0].start() - 80)
        print(data[start:matches[0].start() + 400])
        print("---")

# Pull every unique DUMMYFUNCTION payload mentioning S17 or ABS or Result
payloads = set(re.findall(r'DUMMYFUNCTION\(&quot;(.*?)&quot;\)', data))
interesting = [p for p in payloads if any(k in p for k in ["ABS", "S17", "S$17", "AZ4", "BA4", "AX4", "AY4", "Diff", "Result", "QUERY(calculator"])]
print(f"\nInteresting DUMMYFUNCTION payloads: {len(interesting)}")
for payload in sorted(interesting)[:40]:
    print("\n---")
    print(payload.replace("&quot;", '"').replace("&amp;", "&")[:800])
