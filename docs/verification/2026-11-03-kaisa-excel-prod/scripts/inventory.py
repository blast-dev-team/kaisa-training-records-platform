"""Inventory all KAISA xlsx files: sheets, dims, headers."""
import openpyxl, os, sys

BASE = "/Users/choegilang/Desktop/KAISA excel"
DEC = "/tmp/kaisa_verify/decrypted"

files = []
for fn in sorted(os.listdir(BASE)):
    if fn.endswith(".xlsx"):
        files.append(os.path.join(BASE, fn))
files.append(os.path.join(DEC, "20260903-계속교육과목등록.xlsx"))

for path in files:
    name = os.path.basename(path)
    print("=" * 80)
    print(f"FILE: {name}")
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            print(f"  SHEET: [{ws.title}] rows={ws.max_row} cols={ws.max_column}")
            it = ws.iter_rows(min_row=1, max_row=3, values_only=True)
            for i, row in enumerate(it, 1):
                cells = [str(c)[:22] if c is not None else "" for c in row[:14]]
                print(f"    H{i}: {cells}")
        wb.close()
    except Exception as e:
        print(f"  ERROR: {e}")
