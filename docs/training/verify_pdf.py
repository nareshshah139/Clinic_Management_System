"""Checks the built guide: A4 pages, only the intended fonts embedded, no blank page, every lesson present,
no unresolved {{tokens}}, and no leftover test names. Sets the PDF title, author and subject."""
import re
import sys
from pathlib import Path

import pdfplumber
from pypdf import PdfReader, PdfWriter

PDF = Path(__file__).with_name("clinic-workflows-guide.pdf")
ALLOWED_FONTS = ("Inter-Regular", "Inter-Bold", "Inter-ExtraBold", "JetBrainsMono-Regular")
LESSON_TITLES = [
    "Read the doctor's day",
    "Book a returning patient",
    "Add a new patient while booking",
    "Open today's patient in one click",
    "Let the footer tell you what is missing",
    "Fill the prescription from a template",
    "Saving the prescription sends it",
    "Complete the visit",
    "Book the follow-up from the chart",
]
FORBIDDEN = re.compile(r"Poteto|UXF|UXW|\{\{|undefined|NaN")

problems = []
reader = PdfReader(str(PDF))
fonts = set()
for page in reader.pages:
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - 595.3) > 2 or abs(h - 841.9) > 2:
        problems.append(f"page size {w:.1f}x{h:.1f} pt is not A4")
    for f in (page.get("/Resources") or {}).get("/Font", {}).values():
        fonts.add(str(f.get_object().get("/BaseFont")).split("+")[-1])
unexpected = sorted(f for f in fonts if f not in ALLOWED_FONTS)
if unexpected:
    problems.append(f"unexpected fonts embedded: {unexpected}")

with pdfplumber.open(str(PDF)) as pdf:
    texts = [p.extract_text() or "" for p in pdf.pages]
for i, t in enumerate(texts, 1):
    if len(t.strip()) < 80:
        problems.append(f"page {i} is nearly blank")
    for m in FORBIDDEN.finditer(t):
        problems.append(f"page {i} contains {m.group(0)!r}")
full = "\n".join(texts)
for title in LESSON_TITLES:
    if title not in full:
        problems.append(f"lesson missing: {title}")

writer = PdfWriter(clone_from=reader)
writer.add_metadata({
    "/Title": "Clinic workflows guide: booking, consulting and pharmacy hand-off",
    "/Author": "ClinicMS training",
    "/Subject": "Training guide for reception and doctors",
})
with open(PDF, "wb") as out:
    writer.write(out)

print(f"{len(reader.pages)} pages, fonts {sorted(fonts)}, {PDF.stat().st_size // 1024} KB")
if problems:
    print("PROBLEMS\n" + "\n".join(problems))
    sys.exit(1)
print("pdf checks passed")
