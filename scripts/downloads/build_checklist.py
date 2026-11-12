"""
Safety Index checklist builder.

One checklist JSON in -> a print-ready PDF and a formatted Excel workbook out.
Both files read from the same data, the same strings file (strings/<lang>.json)
and the same brand settings, so they always match.

Usage:
    python build_checklist.py checklist.json out_dir/
    python build_checklist.py checklist.json --pdf out/x.pdf --xlsx out/x.xlsx

Env: FONT_DIR overrides the Poppins folder (default: ./fonts next to this file).
"""
import json
import math
import os
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------- brand (shared)
BRAND = {
    "name": "SAFETY INDEX",
    "ink": "1F2933",       # body text
    "muted": "616E7C",     # labels, notes
    "band": "2F3E4E",      # section header bands
    "head": "E4E7EB",      # column headers / field labels
    "zebra": "F7F8FA",     # alternate rows
    "rule": "9AA5B1",      # borders
    "accent": "F2A900",    # safety amber, used sparingly
    "defect_fill": "FDE8E8",
    "defect_text": "9B1C1C",
}
FONT_DIR = os.environ.get("FONT_DIR") or str(HERE / "fonts")
SITE_HOST = "safetyindex.blog"
LANGS = ("en", "de", "fr")
LETTER_MARKETS = ("US", "CA")

REQUIRED = ["market", "doc_ref", "revision", "data_as_of", "title", "subtitle",
            "regulation_line", "info_fields", "instructions", "sections",
            "references", "page_url"]


class ChecklistError(ValueError):
    pass


def load_strings(lang):
    s = json.loads((HERE / "strings" / f"{lang}.json").read_text(encoding="utf-8"))
    st = s["status"]
    for v in (st["ok"], st["defect"], st["na"]):
        # these go into a list validation and COUNTIF criteria
        if re.search(r'[,"*?~]', v):
            raise ChecklistError(f"strings/{lang}.json: status value {v!r} may not contain , \" * ? ~")
    return s


def fmt(template, s, **kw):
    """Fill {ok}/{defect}/{na} plus any keyword placeholders."""
    return template.format(ok=s["status"]["ok"], defect=s["status"]["defect"],
                           na=s["status"]["na"], **kw)


def load(path):
    raw = Path(path).read_text(encoding="utf-8")
    if "conform.so" in raw.lower():
        raise ChecklistError(f"{path}: contains 'conform.so'; refusing to build")
    data = json.loads(raw)
    missing = [k for k in REQUIRED if not data.get(k)]
    if missing:
        raise ChecklistError(f"{path}: missing required field(s): {', '.join(missing)}")

    url = data["page_url"]
    if not re.fullmatch(r"https://safetyindex\.blog/[^\s\"<>]*", url):
        raise ChecklistError(f"{path}: page_url must be an https://{SITE_HOST}/... URL, got {url!r}")

    data["lang"] = data.get("lang", "en")
    if data["lang"] not in LANGS:
        raise ChecklistError(f"{path}: lang must be one of {LANGS}")
    data.setdefault("slug", Path(path).stem)
    data.setdefault("site", SITE_HOST)
    if data["site"] != SITE_HOST:
        raise ChecklistError(f"{path}: site must be {SITE_HOST}")
    expected_paper = "letter" if data["market"].upper() in LETTER_MARKETS else "a4"
    data.setdefault("paper", expected_paper)
    if data["paper"] != expected_paper:
        raise ChecklistError(f"{path}: paper must be {expected_paper!r} for market {data['market']}")
    data.setdefault("defect_log_rows", 3)

    s = load_strings(data["lang"])
    data["S"] = s
    data.setdefault("signoff", s["default_signoff"])
    data.setdefault("disclaimer", s["default_disclaimer"])
    data.setdefault("safe_question", s["safe_question"])

    # number every item once, so PDF and Excel use identical numbering
    n = 0
    for sec in data["sections"]:
        sec["numbered"] = []
        for item in sec["items"]:
            if not (isinstance(item, list) and len(item) in (2, 3) and all(isinstance(x, str) for x in item)):
                raise ChecklistError(f"{path}: item must be [name, check] or [name, check, clause]: {item!r}")
            n += 1
            name, check = item[0], item[1]
            clause = item[2] if len(item) == 3 and item[2].strip() else None
            sec["numbered"].append((n, name, check, clause))
    if n == 0:
        raise ChecklistError(f"{path}: no checklist items")
    data["item_count"] = n
    return data


def pdf_text(t):
    # Poppins has no U+202F (narrow no-break space); use a normal no-break space
    return str(t).replace(" ", " ")


def P(t):
    """Escape text for a reportlab Paragraph."""
    return escape(pdf_text(t))


# =================================================================== PDF
def build_pdf(d, out_path):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.fonts import addMapping
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.platypus import (Flowable, KeepTogether, Paragraph,
                                    SimpleDocTemplate, Spacer, Table,
                                    TableStyle)

    s = d["S"]
    result = {}
    for style, fname in [("", "Regular"), ("-Bold", "Bold"),
                         ("-Italic", "Italic"), ("-BoldItalic", "BoldItalic"),
                         ("-Medium", "Medium")]:
        pdfmetrics.registerFont(TTFont(f"Poppins{style}", f"{FONT_DIR}/Poppins-{fname}.ttf"))
    addMapping("Poppins", 0, 0, "Poppins")
    addMapping("Poppins", 1, 0, "Poppins-Bold")
    addMapping("Poppins", 0, 1, "Poppins-Italic")
    addMapping("Poppins", 1, 1, "Poppins-BoldItalic")

    c = {k: colors.HexColor("#" + v) for k, v in BRAND.items() if k != "name"}
    page = letter if d["paper"] == "letter" else A4
    margin = 0.5 * inch
    width = page[0] - 2 * margin

    def ps(name, size=8.5, font="Poppins", color="ink", lead=None, **kw):
        return ParagraphStyle(name, fontName=font, fontSize=size,
                              leading=lead or size * 1.3, textColor=c[color],
                              alignment=TA_LEFT, **kw)

    S = {
        "title": ps("title", 18, "Poppins-Bold", lead=22),
        "sub": ps("sub", 9.5, color="muted"),
        "tag": ps("tag", 7.5, "Poppins-Medium", color="ink"),
        "label": ps("label", 6.8, "Poppins-Medium", color="muted"),
        "body": ps("body", 8.2),
        "bold": ps("bold", 8.2, "Poppins-Medium"),
        "small": ps("small", 7, color="muted", lead=9.2),
        "band": ps("band", 8.6, "Poppins-Bold", color="ink"),
        "colhead": ps("colhead", 7.2, "Poppins-Bold"),
        "colhead_c": ps("colhead_c", 6.6, "Poppins-Bold", lead=7.6),
        "inst": ps("inst", 8, lead=11),
    }
    S["band"].textColor = colors.white
    S["colhead_c"].alignment = 1  # centred

    class Box(Flowable):
        """Empty tick box, centred in its cell."""
        def __init__(self, cell_w, size=9):
            super().__init__()
            self.cell_w, self.size = cell_w, size

        def wrap(self, *_):
            return self.cell_w, self.size

        def draw(self):
            self.canv.setStrokeColor(c["ink"])
            self.canv.setLineWidth(0.8)
            self.canv.rect((self.cell_w - self.size) / 2, 0, self.size, self.size)

    def fit(canv, text, font, size, max_w, min_size=5.5):
        while size > min_size and pdfmetrics.stringWidth(text, font, size) > max_w:
            size -= 0.2
        canv.setFont(font, size)

    # ---- page furniture, with "Page X of Y"
    class NumberedCanvas(rl_canvas.Canvas):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self._states = []

        def showPage(self):
            self._states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._states)
            result["pages"] = total
            for st in self._states:
                self.__dict__.update(st)
                self._furniture(total)
                super().showPage()
            super().save()

        def _furniture(self, total):
            W, H = page
            # amber strip + brand line
            self.setFillColor(c["accent"])
            self.rect(0, H - 6, W, 6, stroke=0, fill=1)
            self.setFillColor(c["ink"])
            self.setFont("Poppins-Bold", 8)
            self.drawString(margin, H - 0.33 * inch, BRAND["name"])
            self.setFont("Poppins", 7.5)
            self.setFillColor(c["muted"])
            self.drawRightString(W - margin, H - 0.33 * inch,
                                 pdf_text(f"{d['doc_ref']}  |  {d['revision']}  |  {d['market']}"))
            # footer: page URL + data date, disclaimer, page X of Y
            self.setStrokeColor(c["rule"])
            self.setLineWidth(0.5)
            self.line(margin, 0.5 * inch, W - margin, 0.5 * inch)
            page_lbl = pdf_text(s["page_x_of_y"].format(page=self._pageNumber, pages=total))
            self.setFont("Poppins", 6.8)
            right_w = pdfmetrics.stringWidth(page_lbl, "Poppins", 6.8) + 12
            self.drawRightString(W - margin, 0.36 * inch, page_lbl)
            line1 = pdf_text(f"{d['page_url']}   |   " + s["data_as_of"].format(date=d["data_as_of"]))
            fit(self, line1, "Poppins", 6.8, width - right_w)
            self.drawString(margin, 0.36 * inch, line1)
            fit(self, pdf_text(d["disclaimer"]), "Poppins", 6.8, width)
            self.drawString(margin, 0.24 * inch, pdf_text(d["disclaimer"]))

    story = []

    # ---- title block
    story += [
        Paragraph(P(d["title"]), S["title"]),
        Spacer(1, 2),
        Paragraph(P(d["subtitle"]), S["sub"]),
        Spacer(1, 6),
    ]
    tag = Table([[Paragraph(P(d["regulation_line"]), S["tag"])]],
                style=[("BACKGROUND", (0, 0), (-1, -1), c["head"]),
                       ("LEFTPADDING", (0, 0), (-1, -1), 6),
                       ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                       ("TOPPADDING", (0, 0), (-1, -1), 2),
                       ("BOTTOMPADDING", (0, 0), (-1, -1), 3)],
                hAlign="LEFT")
    story += [tag, Spacer(1, 10)]

    # ---- info fields: label sits top-left in each write-in cell
    rows = [[Paragraph(P(lbl.upper()), S["label"]) for lbl in pair]
            for pair in d["info_fields"]]
    info = Table(rows, colWidths=[width / 2] * 2, rowHeights=[26] * len(rows))
    info.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, c["rule"]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story += [info, Spacer(1, 10)]

    # ---- instructions panel with amber edge
    inst = [[Paragraph(f"<b>{P(s['before_you_start'])}</b>", S["bold"])]] + \
           [[Paragraph(f"{i}.&nbsp;&nbsp;{P(t)}", S["inst"])]
            for i, t in enumerate(d["instructions"], 1)]
    t = Table(inst, colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), c["zebra"]),
        ("LINEBEFORE", (0, 0), (0, -1), 3, c["accent"]),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
    ]))
    refs = Paragraph(f"<b>{P(s['legal_basis'])}</b> " + " ".join(P(r) for r in d["references"]),
                     S["small"])
    online = Paragraph(P(s["online_version"].split("{url}")[0]) +
                       f'<link href="{escape(d["page_url"])}">{P(d["page_url"])}</link>' +
                       P(s["online_version"].split("{url}")[1]), S["small"])
    story += [t, Spacer(1, 5), refs, Spacer(1, 2), online, Spacer(1, 10)]

    # ---- checklist sections
    box_w = 0.55 * inch
    cols = [0.32 * inch, 1.5 * inch, 2.55 * inch, box_w, box_w, box_w]
    cols.append(width - sum(cols))
    st_ = s["status"]
    heads = [Paragraph(P(s["col_no"]), S["colhead"]), Paragraph(P(s["col_item"]), S["colhead"]),
             Paragraph(P(s["col_check"]), S["colhead"]),
             Paragraph(P(st_["ok"]), S["colhead_c"]), Paragraph(P(st_["defect"]), S["colhead_c"]),
             Paragraph(P(st_["na"]), S["colhead_c"]), Paragraph(P(s["col_notes"]), S["colhead"])]
    clause_style = ps("clause", 6.6, color="muted", lead=8.2)

    for sec in d["sections"]:
        data = [[Paragraph(f"{P(s['section'])} {P(sec['code'])}&nbsp;&nbsp;|&nbsp;&nbsp;{P(sec['title'])}",
                           S["band"])] + [""] * 6,
                heads]
        for n, name, check, clause in sec["numbered"]:
            name_cell = Paragraph(P(name), S["bold"])
            if clause:
                name_cell = [name_cell, Paragraph(f"{P(s['clause_prefix'])} {P(clause)}", clause_style)]
            data.append([Paragraph(str(n), S["body"]), name_cell,
                         Paragraph(P(check), S["body"]),
                         Box(box_w), Box(box_w), Box(box_w), ""])
        style = [
            ("SPAN", (0, 0), (-1, 0)),
            ("BACKGROUND", (0, 0), (-1, 0), c["band"]),
            ("BACKGROUND", (0, 1), (-1, 1), c["head"]),
            ("GRID", (0, 1), (-1, -1), 0.5, c["rule"]),
            ("BOX", (0, 0), (-1, -1), 0.8, c["band"]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (3, 1), (5, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (3, 1), (5, 1), 1.5),
            ("RIGHTPADDING", (3, 1), (5, 1), 1.5),
            ("TOPPADDING", (0, 0), (-1, 0), 5),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ]
        for r in range(2, len(data)):
            if r % 2 == 1:
                style.append(("BACKGROUND", (0, r), (-1, r), c["zebra"]))
        tbl = Table(data, colWidths=cols, repeatRows=2)
        tbl.setStyle(TableStyle(style))
        story += [tbl, Spacer(1, 8)]

    # ---- defect log
    dl_cols = [0.75 * inch, 3.0 * inch, 1.5 * inch]
    dl_cols.append(width - sum(dl_cols))
    dl = [[Paragraph(P(s["defect_log"]), S["band"])] + [""] * 3,
          [Paragraph(P(h), S["colhead"]) for h in
           [s["dl_item"], s["dl_desc"], s["dl_reported"], s["dl_action"]]]]
    dl += [[""] * 4 for _ in range(d["defect_log_rows"])]
    dlt = Table(dl, colWidths=dl_cols,
                rowHeights=[None, None] + [20] * d["defect_log_rows"])
    dlt.setStyle(TableStyle([
        ("SPAN", (0, 0), (-1, 0)),
        ("BACKGROUND", (0, 0), (-1, 0), c["band"]),
        ("BACKGROUND", (0, 1), (-1, 1), c["head"]),
        ("GRID", (0, 1), (-1, -1), 0.5, c["rule"]),
        ("BOX", (0, 0), (-1, -1), 0.8, c["band"]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, 1), 5),
    ]))

    # ---- sign-off, with the out-of-service decision
    so = [[Paragraph(P(s["signoff"]), S["band"]), ""]]
    q_w = min(max(pdfmetrics.stringWidth(pdf_text(d["safe_question"].upper()), "Poppins-Medium", 6.8) + 12,
                  1.6 * inch), 2.6 * inch)
    yes_no = Table([[Paragraph(P(d["safe_question"].upper()), S["label"]),
                     Box(14), Paragraph(P(s["yes"]), S["body"]),
                     Box(14), Paragraph(P(s["no_tagged"]), S["body"])]],
                   colWidths=[q_w, 14, 0.5 * inch, 14, width - q_w - 28 - 0.5 * inch - 10],
                   hAlign="LEFT",
                   style=[("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                          ("LEFTPADDING", (0, 0), (-1, -1), 0),
                          ("LEFTPADDING", (2, 0), (2, 0), 4),
                          ("LEFTPADDING", (4, 0), (4, 0), 4),
                          ("TOPPADDING", (0, 0), (-1, -1), 0),
                          ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])
    so.append([yes_no, ""])
    so += [[Paragraph(P(a.upper()), S["label"]), Paragraph(P(b.upper()), S["label"])]
           for a, b in d["signoff"]]
    sot = Table(so, colWidths=[width * 0.65, width * 0.35],
                rowHeights=[None, 20] + [28] * len(d["signoff"]))
    sot.setStyle(TableStyle([
        ("SPAN", (0, 0), (-1, 0)),
        ("SPAN", (0, 1), (-1, 1)),
        ("BACKGROUND", (0, 0), (-1, 0), c["band"]),
        ("GRID", (0, 1), (-1, -1), 0.5, c["rule"]),
        ("BOX", (0, 0), (-1, -1), 0.8, c["band"]),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("VALIGN", (0, 1), (-1, 1), "MIDDLE"),
        ("VALIGN", (0, 2), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
    ]))

    story.append(KeepTogether([dlt, Spacer(1, 8), sot]))

    doc = SimpleDocTemplate(str(out_path), pagesize=page,
                            leftMargin=margin, rightMargin=margin,
                            topMargin=0.5 * inch, bottomMargin=0.6 * inch,
                            title=pdf_text(d["title"]), author=BRAND["name"].title(),
                            subject=pdf_text(d["regulation_line"]), lang=d["lang"])
    doc.build(story, canvasmaker=NumberedCanvas)
    return result["pages"]


# =================================================================== XLSX
def xq(t):
    """Quote a string literal for an Excel formula."""
    return '"' + str(t).replace('"', '""') + '"'


def hf(t):
    """Escape text for an Excel header/footer section."""
    return str(t).replace("&", "&&")


def build_xlsx(d, out_path):
    from openpyxl import Workbook
    from openpyxl.cell.rich_text import CellRichText, TextBlock
    from openpyxl.cell.text import InlineFont
    from openpyxl.formatting.rule import FormulaRule
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.worksheet.datavalidation import DataValidation

    s = d["S"]
    OK, DEFECT, NA = s["status"]["ok"], s["status"]["defect"], s["status"]["na"]
    FONT = "Tahoma"
    wb = Workbook()
    ws = wb.active
    ws.title = s["sheet_name"][:31]
    ws.sheet_view.showGridLines = False

    widths = {"A": 7, "B": 26, "C": 51, "D": 20, "E": 30}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w
    LAST = "E"

    def fill(hex_):
        return PatternFill("solid", start_color=hex_, end_color=hex_)

    thin = Side(style="thin", color=BRAND["rule"])
    grid = Border(left=thin, right=thin, top=thin, bottom=thin)
    f_body = Font(name=FONT, size=10, color=BRAND["ink"])
    f_bold = Font(name=FONT, size=10, bold=True, color=BRAND["ink"])
    f_label = Font(name=FONT, size=9, bold=True, color=BRAND["muted"])
    f_small = Font(name=FONT, size=8, italic=True, color=BRAND["muted"])
    wrap_top = Alignment(wrap_text=True, vertical="top")
    wrap_mid = Alignment(wrap_text=True, vertical="center")
    centre = Alignment(horizontal="center", vertical="center", wrap_text=True)

    def merged(row, text, font, first="A", last=LAST, align=wrap_mid, fill_=None, height=None, border=None):
        ws.merge_cells(f"{first}{row}:{last}{row}")
        cell = ws[f"{first}{row}"]
        cell.value, cell.font, cell.alignment = text, font, align
        cols = range(ord(first), ord(last) + 1)
        for col in cols:
            cl = ws[f"{chr(col)}{row}"]
            if fill_:
                cl.fill = fill_
            if border:
                cl.border = border
        if height:
            ws.row_dimensions[row].height = height
        return cell

    def lines_needed(text, col_width):
        # conservative: LibreOffice substitutes Tahoma with a wider font
        chars = max(col_width * 1.05, 1)
        return max(1, sum(math.ceil(max(len(p), 1) / chars) for p in str(text).split("\n")))

    def band(row, text):
        merged(row, text, Font(name=FONT, size=10, bold=True, color="FFFFFF"),
               fill_=fill(BRAND["band"]), height=22,
               align=Alignment(vertical="center", indent=1))

    def headers(row, labels, spans=None, centred=()):
        # spans: list of (first_col, last_col) per label
        spans = spans or [(chr(65 + i), chr(65 + i)) for i in range(len(labels))]
        for i, (label, (a, b)) in enumerate(zip(labels, spans)):
            if a != b:
                ws.merge_cells(f"{a}{row}:{b}{row}")
            for col in range(ord(a), ord(b) + 1):
                cl = ws[f"{chr(col)}{row}"]
                cl.fill, cl.border = fill(BRAND["head"]), grid
            cl = ws[f"{a}{row}"]
            cl.value, cl.font = label, Font(name=FONT, size=9, bold=True, color=BRAND["ink"])
            cl.alignment = centre if i in centred \
                else Alignment(wrap_text=True, vertical="center", indent=1)
        ws.row_dimensions[row].height = 20

    def label_value_row(row, left, right, height):
        ws.merge_cells(f"A{row}:B{row}")
        for col in "AB":
            ws[f"{col}{row}"].fill, ws[f"{col}{row}"].border = fill(BRAND["head"]), grid
        ws[f"A{row}"].value, ws[f"A{row}"].font = left, f_label
        ws[f"A{row}"].alignment = Alignment(vertical="center", indent=1, wrap_text=True)
        ws[f"C{row}"].border = grid
        ws[f"C{row}"].font = f_body
        ws[f"D{row}"].value, ws[f"D{row}"].font = right, f_label
        ws[f"D{row}"].fill, ws[f"D{row}"].border = fill(BRAND["head"]), grid
        ws[f"D{row}"].alignment = Alignment(wrap_text=True, vertical="center", indent=1)
        ws[f"E{row}"].border = grid
        ws[f"E{row}"].font = f_body
        ws.row_dimensions[row].height = height

    r = 1
    # ---- brand strip
    for col in "ABCDE":
        ws[f"{col}{r}"].fill = fill(BRAND["accent"])
    ws.row_dimensions[r].height = 5
    r += 1
    ws[f"A{r}"] = BRAND["name"]
    ws[f"A{r}"].font = Font(name=FONT, size=9, bold=True, color=BRAND["ink"])
    ws[f"E{r}"] = f"{d['doc_ref']}  |  {d['revision']}  |  {d['market']}"
    ws[f"E{r}"].font = Font(name=FONT, size=8, color=BRAND["muted"])
    ws[f"E{r}"].alignment = Alignment(horizontal="right")
    r += 1
    merged(r, d["title"], Font(name=FONT, size=16, bold=True, color=BRAND["ink"]),
           height=max(28, 24 * lines_needed(d["title"], sum(widths.values()) / 1.7)))
    r += 1
    sub = f"{d['subtitle']}   |   {d['regulation_line']}"
    merged(r, sub, Font(name=FONT, size=10, color=BRAND["muted"]),
           height=max(18, 14 * lines_needed(sub, sum(widths.values()) - 4)))
    r += 2

    # ---- info fields: label | value | label | value
    for left, right in d["info_fields"]:
        label_value_row(r, left, right, 30)
        r += 1
    r += 1

    # ---- instructions (amber left edge)
    amber_edge = Border(left=Side(style="thick", color=BRAND["accent"]))
    merged(r, s["before_you_start"], f_bold, fill_=fill(BRAND["zebra"]), height=20,
           align=Alignment(vertical="center", indent=1))
    ws[f"A{r}"].border = amber_edge
    r += 1
    for i, text in enumerate(d["instructions"], 1):
        h = 15 * lines_needed(text, sum(widths.values()) - 4) + 3
        merged(r, f"{i}.  {text}", f_body, fill_=fill(BRAND["zebra"]), height=h,
               align=Alignment(wrap_text=True, vertical="top", indent=1))
        ws[f"A{r}"].border = amber_edge
        r += 1
    hint = fmt(s["excel_hint"], s)
    merged(r, hint, f_small, fill_=fill(BRAND["zebra"]),
           height=13 * lines_needed(hint, (sum(widths.values()) - 4) * 1.15) + 5,
           align=Alignment(wrap_text=True, vertical="top", indent=1))
    ws[f"A{r}"].border = amber_edge
    r += 2

    # ---- summary (formulas filled in once we know the status range)
    band(r, s["summary"])
    r += 1
    summary_keys = ["sum_checked", "sum_ok", "sum_defects", "sum_na", "sum_safe"]
    summary_cells = {}
    for key in summary_keys:
        ws.merge_cells(f"A{r}:B{r}")
        for col in "AB":
            ws[f"{col}{r}"].fill, ws[f"{col}{r}"].border = fill(BRAND["head"]), grid
        ws[f"A{r}"].value, ws[f"A{r}"].font = s[key], f_label
        ws[f"A{r}"].alignment = Alignment(vertical="center", indent=1)
        ws[f"C{r}"].border = grid
        ws[f"C{r}"].font = f_bold
        ws[f"C{r}"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
        ws.row_dimensions[r].height = 18
        summary_cells[key] = f"C{r}"
        r += 1
    r += 1

    # ---- checklist sections
    status_cells = []
    block_starts = []          # rows that should not be split from what follows
    f_clause = InlineFont(rFont=FONT, sz=8, i=True, color=BRAND["muted"])
    f_name = InlineFont(rFont=FONT, sz=10, b=True, color=BRAND["ink"])
    for sec in d["sections"]:
        block_starts.append(r)
        band(r, f"{s['section']} {sec['code']}   |   {sec['title']}")
        r += 1
        headers(r, [s["col_no"], s["col_item"], s["col_check"], s["col_status"], s["col_notes"]],
                centred=(0, 3))
        r += 1
        for idx, (n, name, check, clause) in enumerate(sec["numbered"]):
            vals = [n, name, check, None, None]
            for col, v in zip("ABCDE", vals):
                cl = ws[f"{col}{r}"]
                cl.value, cl.border = v, grid
                cl.font = f_bold if col == "B" else f_body
                cl.alignment = centre if col in "AD" else Alignment(
                    wrap_text=True, vertical="center", indent=1)
                if idx % 2 == 1:
                    cl.fill = fill(BRAND["zebra"])
            name_lines = lines_needed(name, widths["B"] - 2)
            if clause:
                ws[f"B{r}"].value = CellRichText(
                    TextBlock(f_name, name),
                    TextBlock(f_clause, f"\n{s['clause_prefix']} {clause}"))
                name_lines += lines_needed(f"{s['clause_prefix']} {clause}", (widths["B"] - 2) * 1.2)
            ws.row_dimensions[r].height = max(
                lines_needed(check, widths["C"] - 2), name_lines) * 13 + 8
            status_cells.append(f"D{r}")
            r += 1
        r += 1

    # status drop-down + defect highlight
    first, last = status_cells[0], status_cells[-1]
    rng = f"$D${first[1:]}:$D${last[1:]}"
    dv = DataValidation(type="list", formula1='"' + ",".join([OK, DEFECT, NA]) + '"',
                        allow_blank=True, showErrorMessage=True,
                        errorTitle=s["col_status"][:32], error=fmt(s["dv_error"], s),
                        promptTitle=s["col_status"][:32], prompt=fmt(s["dv_prompt"], s),
                        showInputMessage=True)
    ws.add_data_validation(dv)
    for ref in status_cells:
        dv.add(ref)
    ws.conditional_formatting.add(
        f"{first}:{last}",
        FormulaRule(formula=[f'{first}={xq(DEFECT)}'],
                    fill=fill(BRAND["defect_fill"]),
                    font=Font(name=FONT, bold=True, color=BRAND["defect_text"])))

    total = d["item_count"]
    sc = summary_cells
    cnt = {k: f"COUNTIF({rng},{xq(v)})" for k, v in (("ok", OK), ("defect", DEFECT), ("na", NA))}
    checked = f'({cnt["ok"]}+{cnt["defect"]}+{cnt["na"]})'
    pre, post = s["checked_of"].split("{checked}")
    post = post.format(total=total)
    ws[sc["sum_checked"]] = "=" + "&".join(
        ([xq(pre)] if pre else []) + [checked] + ([xq(post)] if post else []))
    ws[sc["sum_ok"]] = "=" + cnt["ok"]
    ws[sc["sum_defects"]] = "=" + cnt["defect"]
    ws[sc["sum_na"]] = "=" + cnt["na"]
    ws[sc["sum_safe"]] = (
        f'=IF({cnt["defect"]}>0,{xq(s["result_no"])},'
        f'IF({checked}<{total},{xq(s["result_pending"])},{xq(s["result_yes"])}))')
    for key in ("sum_ok", "sum_defects", "sum_na"):
        ws[sc[key]].number_format = "0"
    safe = sc["sum_safe"]
    ws.conditional_formatting.add(
        safe, FormulaRule(formula=[f'{cnt["defect"]}>0'],
                          fill=fill(BRAND["defect_fill"]),
                          font=Font(name=FONT, bold=True, color=BRAND["defect_text"])))
    ws.merge_cells(f"{safe}:E{safe[1:]}")
    for col in "DE":
        ws[f"{col}{safe[1:]}"].border = grid

    # ---- defect log
    block_starts.append(r)
    band(r, s["defect_log"])
    r += 1
    headers(r, [s["dl_item"], s["dl_desc"], s["dl_reported"], s["dl_action"]],
            spans=[("A", "A"), ("B", "C"), ("D", "D"), ("E", "E")], centred=(0,))
    ws.row_dimensions[r].height = 26
    r += 1
    for _ in range(d["defect_log_rows"]):
        ws.merge_cells(f"B{r}:C{r}")
        for col in "ABCDE":
            ws[f"{col}{r}"].border = grid
            ws[f"{col}{r}"].font = f_body
            ws[f"{col}{r}"].alignment = wrap_top
        ws.row_dimensions[r].height = 24
        r += 1
    r += 1

    # ---- sign-off
    block_starts.append(r)
    band(r, s["signoff"])
    r += 1
    for left, right in d["signoff"]:
        label_value_row(r, left, right, 32)
        r += 1
    r += 1

    # ---- references, page URL, disclaimer (kept together on one page)
    refs_start = r
    merged(r, s["reference"], Font(name=FONT, size=8, bold=True, color=BRAND["muted"]), height=14)
    r += 1
    for ref in d["references"]:
        merged(r, ref, f_small, height=12 * lines_needed(ref, sum(widths.values()) * 1.15) + 3,
               align=wrap_top)
        r += 1
    online = s["online_version"].format(url=d["page_url"])
    cell = merged(r, online, f_small, height=14, align=wrap_top)
    cell.hyperlink = d["page_url"]
    cell.font = Font(name=FONT, size=8, italic=True, color=BRAND["muted"], underline="single")
    r += 1
    foot = f"{d['site']}   |   {s['data_as_of'].format(date=d['data_as_of'])}   |   {d['disclaimer']}"
    merged(r, foot, f_small, height=12 * lines_needed(foot, sum(widths.values()) * 1.15) + 3,
           align=wrap_top)
    last_row = r

    # ---- page breaks: set every break ourselves (Excel and LibreOffice then never break on
    # their own, so the estimate can't drift) and never leave a section band stranded at
    # the foot of a page. The estimate is deliberately conservative.
    from openpyxl.worksheet.pagebreak import Break
    paper_w, paper_h = (8.5, 11) if d["paper"] == "letter" else (8.27, 11.69)
    content_pt = sum(w * 7 + 5 for w in widths.values()) * 0.75   # column units -> px -> pt
    scale = min(1.0, (paper_w - 0.8) * 72 / content_pt)
    page_h = (paper_h - 1.1 - 0.45) * 72 / scale                  # margins, footer, headroom
    used = 0
    for row in range(1, last_row + 1):
        h = ws.row_dimensions[row].height or 15
        lead = h
        if row in block_starts or row == refs_start:
            end = last_row + 1 if row == refs_start else row + 5
            lead = sum((ws.row_dimensions[x].height or 15) for x in range(row, end))
        if used and used + lead > page_h:
            ws.row_breaks.append(Break(id=row - 1))
            used = 0
        used += h

    # ---- print setup
    ws.print_area = f"A1:{LAST}{last_row}"
    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER if d["paper"] == "letter" else ws.PAPERSIZE_A4
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top, ws.page_margins.bottom = 0.5, 0.6
    ws.oddFooter.left.text = hf(d["page_url"])
    ws.oddFooter.left.size = 8
    ws.oddFooter.center.text = hf(f"{d['doc_ref']} {d['revision']}")
    ws.oddFooter.center.size = 8
    ws.oddFooter.right.text = hf(s["page_x_of_y"]).replace("{page}", "&P").replace("{pages}", "&N")
    ws.oddFooter.right.size = 8

    wb.properties.title = d["title"]
    wb.properties.creator = BRAND["name"].title()
    wb.properties.language = d["lang"]
    wb.save(out_path)


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(description="Build a checklist PDF and Excel file from JSON.")
    ap.add_argument("src")
    ap.add_argument("out_dir", nargs="?")
    ap.add_argument("--pdf")
    ap.add_argument("--xlsx")
    ap.add_argument("--json-result", action="store_true",
                    help="print a JSON line with the item count and names (for the Node wrapper)")
    a = ap.parse_args(argv)
    try:
        data = load(a.src)
    except ChecklistError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if a.out_dir:
        out_dir = Path(a.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        pdf = Path(a.pdf) if a.pdf else out_dir / f"{data['slug']}.pdf"
        xlsx = Path(a.xlsx) if a.xlsx else out_dir / f"{data['slug']}.xlsx"
    elif a.pdf and a.xlsx:
        pdf, xlsx = Path(a.pdf), Path(a.xlsx)
    else:
        ap.error("give an out_dir or both --pdf and --xlsx")
    pdf.parent.mkdir(parents=True, exist_ok=True)
    xlsx.parent.mkdir(parents=True, exist_ok=True)
    pages = build_pdf(data, pdf)
    build_xlsx(data, xlsx)
    if a.json_result:
        print(json.dumps({"slug": data["slug"], "items": data["item_count"], "pages": pages, "pdf": str(pdf), "xlsx": str(xlsx)}))
    else:
        print("built", data["slug"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
