from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "LearnPath_IEEE_Submission_Manuscript.docx"
ASSET_DIR = ROOT / "docs" / "ieee-paper-assets"
EQUATION_DIR = ASSET_DIR / "equations"
MODEL_MANIFEST = ROOT / "services" / "ml" / "models" / "benefit-ranking-v2" / "manifest.json"

BLACK = "000000"
NAVY = "17365D"
MID_BLUE = "2F5597"
PALE_BLUE = "EAF1FB"
PALE_GRAY = "F5F6F8"
MID_GRAY = "D9D9D9"
WHITE = "FFFFFF"
TEAL = "0F766E"
AMBER = "B45309"
RED = "B91C1C"


def set_font(run, name: str = "Times New Roman", size: float | None = None, bold: bool | None = None,
             italic: bool | None = None, color: str = BLACK) -> None:
    run.font.name = name
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:hAnsi"), name)
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def style_document(doc: Document) -> None:
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Times New Roman"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
    normal.font.size = Pt(9.6)
    normal.font.color.rgb = RGBColor.from_string(BLACK)
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    normal.paragraph_format.line_spacing = 1.0
    normal.paragraph_format.space_after = Pt(2.2)
    normal.paragraph_format.first_line_indent = Inches(0.15)

    title = styles["Title"]
    title.font.name = "Times New Roman"
    title._element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
    title._element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
    title.font.size = Pt(20)
    title.font.bold = False
    title.font.color.rgb = RGBColor.from_string(BLACK)
    title.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(7)
    title.paragraph_format.first_line_indent = Inches(0)

    heading1 = styles["Heading 1"]
    heading1.font.name = "Times New Roman"
    heading1._element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
    heading1._element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
    heading1.font.size = Pt(10)
    heading1.font.bold = False
    heading1.font.color.rgb = RGBColor.from_string(BLACK)
    heading1.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    heading1.paragraph_format.space_before = Pt(6)
    heading1.paragraph_format.space_after = Pt(3)
    heading1.paragraph_format.keep_with_next = True
    heading1.paragraph_format.first_line_indent = Inches(0)

    heading2 = styles["Heading 2"]
    heading2.font.name = "Times New Roman"
    heading2._element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
    heading2._element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
    heading2.font.size = Pt(9.6)
    heading2.font.bold = False
    heading2.font.italic = True
    heading2.font.color.rgb = RGBColor.from_string(BLACK)
    heading2.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    heading2.paragraph_format.space_before = Pt(4)
    heading2.paragraph_format.space_after = Pt(2)
    heading2.paragraph_format.keep_with_next = True
    heading2.paragraph_format.first_line_indent = Inches(0)

    caption = styles["Caption"]
    caption.font.name = "Times New Roman"
    caption._element.rPr.rFonts.set(qn("w:ascii"), "Times New Roman")
    caption._element.rPr.rFonts.set(qn("w:hAnsi"), "Times New Roman")
    caption.font.size = Pt(8)
    caption.font.color.rgb = RGBColor.from_string(BLACK)
    caption.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_before = Pt(1)
    caption.paragraph_format.space_after = Pt(4)
    caption.paragraph_format.first_line_indent = Inches(0)


def configure_page(section) -> None:
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.62)
    section.bottom_margin = Inches(0.67)
    section.left_margin = Inches(0.67)
    section.right_margin = Inches(0.67)
    section.header_distance = Inches(0.2)
    section.footer_distance = Inches(0.25)


def set_columns(section, count: int, spacing_twips: int = 300) -> None:
    sect_pr = section._sectPr
    cols = sect_pr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        sect_pr.append(cols)
    cols.set(qn("w:num"), str(count))
    cols.set(qn("w:space"), str(spacing_twips))
    cols.set(qn("w:equalWidth"), "1")


def add_body(doc: Document, text: str, indent: bool = True, keep: bool = False):
    p = doc.add_paragraph()
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.line_spacing = 1.0
    p.paragraph_format.space_after = Pt(2.2)
    p.paragraph_format.first_line_indent = Inches(0.15 if indent else 0)
    p.paragraph_format.keep_together = keep
    set_font(p.add_run(text), size=9.6)
    return p


def add_lead_paragraph(doc: Document, label: str, text: str):
    p = doc.add_paragraph()
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p.paragraph_format.line_spacing = 1.0
    p.paragraph_format.space_after = Pt(2.2)
    p.paragraph_format.first_line_indent = Inches(0)
    set_font(p.add_run(label), size=9.6, bold=True)
    set_font(p.add_run(text), size=9.6)
    return p


def add_bullets(doc: Document, items: Iterable[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.left_indent = Inches(0.17)
        p.paragraph_format.first_line_indent = Inches(-0.12)
        p.paragraph_format.space_after = Pt(1.4)
        p.paragraph_format.line_spacing = 1.0
        set_font(p.add_run(item), size=9.3)


def set_cell_margins(cell, top=55, start=65, bottom=55, end=65) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def shade_cell(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color: str = MID_GRAY, size: str = "4") -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        node = borders.find(qn(f"w:{edge}"))
        if node is None:
            node = OxmlElement(f"w:{edge}")
            borders.append(node)
        node.set(qn("w:val"), "single")
        node.set(qn("w:sz"), size)
        node.set(qn("w:color"), color)


def set_repeat_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    marker = OxmlElement("w:tblHeader")
    marker.set(qn("w:val"), "true")
    tr_pr.append(marker)


def add_table(doc: Document, caption: str, headers: Sequence[str], rows: Sequence[Sequence[str]],
              widths: Sequence[float], font_size: float = 7.4) -> None:
    cap = doc.add_paragraph(style="Caption")
    cap.paragraph_format.keep_with_next = True
    set_font(cap.add_run(caption), size=8, bold=True)
    table = doc.add_table(rows=1, cols=len(headers))
    table.autofit = False
    table.alignment = 1
    set_repeat_header(table.rows[0])
    for col, header in enumerate(headers):
        cell = table.rows[0].cells[col]
        shade_cell(cell, NAVY)
        set_cell_border(cell)
        cell.width = Inches(widths[col])
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.first_line_indent = Inches(0)
        set_font(p.add_run(header), size=font_size, bold=True, color=WHITE)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    for row_idx, values in enumerate(rows):
        cells = table.add_row().cells
        for col, value in enumerate(values):
            cell = cells[col]
            cell.width = Inches(widths[col])
            shade_cell(cell, PALE_GRAY if row_idx % 2 else WHITE)
            set_cell_border(cell)
            cell.text = ""
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT if col == 0 else WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.first_line_indent = Inches(0)
            set_font(p.add_run(str(value)), size=font_size)
            set_cell_margins(cell)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(1)
    spacer.paragraph_format.first_line_indent = Inches(0)


def add_heading(doc: Document, text: str, level: int = 1) -> None:
    p = doc.add_heading(level=level)
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.first_line_indent = Inches(0)
    run = p.add_run(text)
    set_font(run, size=10 if level == 1 else 9.6, italic=level == 2)
    if level == 1:
        run.font.all_caps = True


def set_picture_alt(doc: Document, description: str) -> None:
    shape = doc.inline_shapes[-1]
    shape._inline.docPr.set("descr", description)
    shape._inline.docPr.set("title", description)


def add_figure(doc: Document, image_path: Path, caption: str, width: float) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(3)
    p.paragraph_format.space_after = Pt(1)
    p.paragraph_format.first_line_indent = Inches(0)
    p.add_run().add_picture(str(image_path), width=Inches(width))
    set_picture_alt(doc, caption)
    c = doc.add_paragraph(style="Caption")
    set_font(c.add_run(caption), size=8)


def add_equation(doc: Document, image_name: str, number: int, explanation: str, width: float = 3.05) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.first_line_indent = Inches(0)
    p.add_run().add_picture(str(EQUATION_DIR / image_name), width=Inches(width))
    set_picture_alt(doc, f"Equation {number} {explanation}")
    num = doc.add_paragraph()
    num.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    num.paragraph_format.space_before = Pt(0)
    num.paragraph_format.space_after = Pt(2)
    num.paragraph_format.first_line_indent = Inches(0)
    set_font(num.add_run(f"({number})"), size=8.5)


def pil_font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/timesbd.ttf" if bold else "C:/Windows/Fonts/times.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def rounded_box(draw, xy, fill, outline, title, lines, title_color="#000000"):
    draw.rounded_rectangle(xy, radius=18, fill=fill, outline=outline, width=4)
    x1, y1, x2, _ = xy
    draw.text((x1 + 18, y1 + 15), title, font=pil_font(28, True), fill=title_color)
    y = y1 + 55
    for line in lines:
        draw.text((x1 + 18, y), line, font=pil_font(20), fill="#334155")
        y += 29


def arrow(draw, start, end, color="#2F5597", width=5):
    draw.line((start, end), fill=color, width=width)
    x, y = end
    draw.polygon([(x, y), (x - 14, y - 9), (x - 14, y + 9)], fill=color)


def line_arrow(draw, start, end, color="#17365D", width=6, dashed=False, arrow_size=15):
    x1, y1 = start
    x2, y2 = end
    length = max(math.hypot(x2 - x1, y2 - y1), 1)
    if dashed:
        dash, gap = 22, 13
        distance = 0
        while distance < length - arrow_size:
            next_distance = min(distance + dash, length - arrow_size)
            sx = x1 + (x2 - x1) * distance / length
            sy = y1 + (y2 - y1) * distance / length
            ex = x1 + (x2 - x1) * next_distance / length
            ey = y1 + (y2 - y1) * next_distance / length
            draw.line((sx, sy, ex, ey), fill=color, width=width)
            distance += dash + gap
    else:
        ux = (x2 - x1) / length
        uy = (y2 - y1) / length
        draw.line((x1, y1, x2 - ux * arrow_size, y2 - uy * arrow_size), fill=color, width=width)
    angle = math.atan2(y2 - y1, x2 - x1)
    left = (x2 - arrow_size * math.cos(angle) + arrow_size * 0.62 * math.sin(angle),
            y2 - arrow_size * math.sin(angle) - arrow_size * 0.62 * math.cos(angle))
    right = (x2 - arrow_size * math.cos(angle) - arrow_size * 0.62 * math.sin(angle),
             y2 - arrow_size * math.sin(angle) + arrow_size * 0.62 * math.cos(angle))
    draw.polygon([(x2, y2), left, right], fill=color)


def flow_box(draw, xy, title, lines, accent=MID_BLUE, fill="FFFFFF", title_size=27, body_size=19,
             centered=False):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=16, fill=f"#{fill}", outline="#CBD5E1", width=3)
    draw.rounded_rectangle((x1, y1, x1 + 11, y2), radius=7, fill=f"#{accent}")
    title_font = pil_font(title_size, True)
    body_font = pil_font(body_size)
    if centered:
        title_width = draw.textbbox((0, 0), title, font=title_font)[2]
        draw.text(((x1 + x2 - title_width) / 2, y1 + 22), title, font=title_font, fill="#0F172A")
    else:
        draw.text((x1 + 28, y1 + 20), title, font=title_font, fill="#0F172A")
    y = y1 + 66
    for item in lines:
        draw.text((x1 + 28, y), item, font=body_font, fill="#475569")
        y += body_size + 11


def lane(draw, xy, label, fill):
    draw.rounded_rectangle(xy, radius=24, fill=fill, outline="#E2E8F0", width=2)
    draw.text((xy[0] + 22, xy[1] + 14), label, font=pil_font(23, True), fill="#334155")


def create_architecture_figure(path: Path) -> None:
    image = Image.new("RGB", (2400, 1350), "white")
    draw = ImageDraw.Draw(image)
    draw.text((55, 34), "LearnPath system architecture and adaptive decision loop", font=pil_font(46, True), fill="#0F172A")

    lane(draw, (55, 105, 2345, 390), "LEARNER EXPERIENCE", "#F8FAFC")
    lane(draw, (55, 430, 2345, 815), "AUTHORITATIVE APPLICATION DECISION BOUNDARY", "#F5F8FC")
    lane(draw, (55, 855, 2345, 1240), "DATA AND ADVISORY SERVICES", "#F8FAFC")

    # Top row runs from the generated path back to new assessed evidence.
    flow_box(draw, (120, 185, 630, 345), "Learning and assessment",
             ["Lessons, practice, quizzes", "Server scored observations"], accent=TEAL, fill="F0FDFA", title_size=30, body_size=21)
    flow_box(draw, (945, 185, 1455, 345), "Learner interface",
             ["Dashboard and Skill Passport", "Renders server decisions"], accent=MID_BLUE, fill="EFF6FF", title_size=30, body_size=21)
    flow_box(draw, (1770, 185, 2280, 345), "Personalized path",
             ["Recognized  current  next", "Upcoming  locked  explained"], accent=MID_BLUE, fill="EFF6FF", title_size=30, body_size=21)
    line_arrow(draw, (1770, 265), (1465, 265), color="#17365D", width=6)
    line_arrow(draw, (945, 265), (640, 265), color="#17365D", width=6)

    labels = [
        ("Diagnostic v5", ["Select evidence", "Stop by decision"]),
        ("Mastery and", ["confidence update", "Append evidence"]),
        ("Retention", ["Project recall", "Detect revision"]),
        ("Prerequisite", ["Required gate", "Unknown fails"]),
        ("Candidate set", ["Learn support", "revision pools"]),
        ("ML ranker", ["55 features", "Benefit score"]),
        ("Path engine", ["Order and version", "Store reasons"]),
    ]
    accents = [MID_BLUE, TEAL, TEAL, RED, AMBER, MID_BLUE, MID_BLUE]
    fills = ["EFF6FF", "F0FDFA", "F0FDFA", "FFF7ED", "FFF7ED", "EFF6FF", "EFF6FF"]
    x_positions = [82, 407, 732, 1057, 1382, 1707, 2032]
    for i, (title, lines) in enumerate(labels):
        x = x_positions[i]
        flow_box(draw, (x, 535, x + 285, 735), title, lines, accent=accents[i], fill=fills[i], title_size=24, body_size=18)
        if i < len(labels) - 1:
            line_arrow(draw, (x + 288, 635), (x_positions[i + 1] - 7, 635), color="#17365D", width=5, arrow_size=13)

    # Feedback closes the loop without crossing the decision pipeline.
    line_arrow(draw, (375, 345), (225, 525), color="#0F766E", width=7)
    draw.text((130, 392), "assessed evidence", font=pil_font(20, True), fill="#0F766E")
    line_arrow(draw, (2174, 525), (2025, 355), color="#17365D", width=7)
    draw.text((2035, 392), "new path version", font=pil_font(20, True), fill="#17365D")

    flow_box(draw, (120, 945, 900, 1165), "PostgreSQL authoritative state",
             ["Curriculum and prerequisite edges", "Global learner skill state and evidence", "Versioned candidates, paths, and feedback"],
             accent=NAVY, fill="FFFFFF", title_size=30, body_size=22)
    flow_box(draw, (1020, 945, 1600, 1165), "NetworkX graph analytics",
             ["DAG validation, layers, routes", "Centrality and counterfactual unlocks", "Read only with zero bonus fallback"],
             accent=AMBER, fill="FFFBEB", title_size=28, body_size=21)
    flow_box(draw, (1720, 945, 2280, 1165), "Model registry and inference",
             ["Checked Random Forest artifact", "Feature schema and checksum", "Stateless bounded probability API"],
             accent=MID_BLUE, fill="EFF6FF", title_size=28, body_size=21)

    line_arrow(draw, (510, 945), (550, 745), color="#17365D", width=6)
    line_arrow(draw, (1310, 945), (1200, 745), color="#B45309", width=6, dashed=True)
    line_arrow(draw, (2000, 945), (1850, 745), color="#2F5597", width=6, dashed=True)

    y = 1295
    draw.line((100, y, 210, y), fill="#17365D", width=6)
    draw.text((230, y - 17), "authoritative state or deterministic decision", font=pil_font(20), fill="#334155")
    for x in range(850, 960, 32):
        draw.line((x, y, x + 19, y), fill="#B45309", width=6)
    draw.text((980, y - 17), "advisory analytics or inference", font=pil_font(20), fill="#334155")
    draw.line((1580, y, 1690, y), fill="#0F766E", width=7)
    draw.text((1710, y - 17), "evidence feedback", font=pil_font(20), fill="#334155")
    image.save(path, dpi=(320, 320))


def create_diagnostic_figure(path: Path) -> None:
    image = Image.new("RGB", (1180, 1610), "white")
    draw = ImageDraw.Draw(image)
    draw.text((48, 30), "Evidence driven adaptive diagnostic", font=pil_font(43, True), fill="#0F172A")
    draw.text((50, 84), "Question selection and decision specific stopping", font=pil_font(30), fill="#475569")

    flow_box(draw, (170, 145, 1010, 285), "Initialize diagnostic context",
             ["Course goal  prior global knowledge  retention state"], accent=MID_BLUE, fill="EFF6FF", title_size=35, body_size=28)
    flow_box(draw, (170, 345, 1010, 515), "Select the highest value unasked item",
             ["Information  uncertainty  gateway impact  diversity", "Subtract exposure and topic switching penalties"],
             accent=MID_BLUE, fill="FFFFFF", title_size=35, body_size=28)
    flow_box(draw, (170, 575, 1010, 745), "Score and append evidence",
             ["Difficulty  discrimination  cognition  guessing", "Record misconception and before after skill state"],
             accent=TEAL, fill="F0FDFA", title_size=35, body_size=28)
    flow_box(draw, (170, 805, 1010, 975), "Update provisional decision state",
             ["PROBED  READY  MASTERED  GAP", "Mixed evidence remains NEEDS CONFIRMATION"],
             accent=TEAL, fill="F0FDFA", title_size=35, body_size=28)

    for y1, y2 in ((285, 345), (515, 575), (745, 805)):
        line_arrow(draw, (590, y1 + 5), (590, y2 - 5), color="#17365D", width=6)

    diamond = [(590, 1035), (930, 1160), (590, 1285), (250, 1160)]
    draw.polygon(diamond, fill="#FFF7ED", outline="#B45309")
    draw.line(diamond + [diamond[0]], fill="#B45309", width=5)
    decision = ["Enough coverage and evidence", "to change the path safely?"]
    for idx, item in enumerate(decision):
        w = draw.textbbox((0, 0), item, font=pil_font(31, True))[2]
        draw.text(((1180 - w) / 2, 1110 + idx * 43), item, font=pil_font(31, True), fill="#0F172A")
    line_arrow(draw, (590, 980), (590, 1030), color="#17365D", width=6)

    flow_box(draw, (535, 1360, 1080, 1515), "Finalize placement",
             ["Skill gaps  confidence intervals", "Eligible prerequisites and next action"],
             accent=MID_BLUE, fill="EFF6FF", title_size=33, body_size=27)
    line_arrow(draw, (720, 1280), (785, 1355), color="#17365D", width=6)
    draw.text((800, 1294), "yes", font=pil_font(28, True), fill="#17365D")

    # No branch loops back to the selector.
    draw.line((250, 1160, 95, 1160, 95, 430, 160, 430), fill="#B45309", width=6, joint="curve")
    line_arrow(draw, (95, 430), (160, 430), color="#B45309", width=6)
    draw.text((108, 1110), "no", font=pil_font(28, True), fill="#B45309")
    draw.text((115, 1065), "ask another item", font=pil_font(27), fill="#B45309")

    draw.rounded_rectangle((80, 1360, 470, 1515), radius=16, fill="#FFF1F2", outline="#FCA5A5", width=3)
    draw.text((108, 1382), "Safety invariant", font=pil_font(31, True), fill="#B91C1C")
    draw.text((108, 1434), "One response can only", font=pil_font(27, True), fill="#0F172A")
    draw.text((108, 1472), "create a PROBED state", font=pil_font(27, True), fill="#0F172A")
    image.save(path, dpi=(320, 320))


def create_graph_figure(path: Path) -> None:
    image = Image.new("RGB", (1180, 1630), "white")
    draw = ImageDraw.Draw(image)
    draw.text((48, 28), "Knowledge Graph v2", font=pil_font(44, True), fill="#0F172A")
    draw.text((50, 82), "Representative stored subgraph and decision boundary", font=pil_font(29), fill="#475569")

    node_font = pil_font(30, True)
    edge_font = pil_font(23)

    def graph_node(center, label, fill="EFF6FF", outline="#2F5597", width=245, height=76):
        x, y = center
        xy = (x - width // 2, y - height // 2, x + width // 2, y + height // 2)
        draw.rounded_rectangle(xy, radius=18, fill=f"#{fill}", outline=outline, width=4)
        tw = draw.textbbox((0, 0), label, font=node_font)[2]
        draw.text((x - tw / 2, y - 13), label, font=node_font, fill="#0F172A")

    nodes = {
        "Control Flow": (155, 245),
        "Functions": (155, 505),
        "Arrays": (465, 170),
        "Recursion": (465, 385),
        "Binary Trees": (785, 385),
        "DP Foundations": (785, 625),
        "Tree Traversal": (1030, 385),
    }

    def graph_edge(source, target, threshold, recommended=False, label_offset=(0, 0)):
        sx, sy = nodes[source]
        tx, ty = nodes[target]
        start = (sx + 125, sy) if tx > sx else (sx, sy + 38)
        end = (tx - 130, ty) if tx > sx else (tx, ty - 43)
        color = "#94A3B8" if recommended else "#17365D"
        line_arrow(draw, start, end, color=color, width=4, dashed=recommended, arrow_size=12)
        mx = (start[0] + end[0]) / 2 + label_offset[0]
        my = (start[1] + end[1]) / 2 + label_offset[1]
        draw.rounded_rectangle((mx - 31, my - 16, mx + 31, my + 14), radius=8, fill="#FFFFFF")
        draw.text((mx - 24, my - 13), threshold, font=edge_font, fill=color)

    graph_edge("Control Flow", "Functions", "0.60", recommended=True, label_offset=(34, 0))
    graph_edge("Control Flow", "Arrays", "0.60", label_offset=(-6, -20))
    graph_edge("Control Flow", "Recursion", "0.65", label_offset=(-6, 18))
    graph_edge("Functions", "Recursion", "0.70", label_offset=(-6, -20))
    graph_edge("Recursion", "Binary Trees", "0.70", label_offset=(0, -22))
    graph_edge("Binary Trees", "Tree Traversal", "0.70", label_offset=(0, -22))
    graph_edge("Recursion", "DP Foundations", "0.75", label_offset=(0, 20))

    for name, position in nodes.items():
        if name in ("Control Flow", "Functions"):
            graph_node(position, name, fill="F8FAFC", outline="#64748B")
        elif name in ("Tree Traversal", "DP Foundations"):
            graph_node(position, name, fill="FFF7ED", outline="#B45309")
        else:
            graph_node(position, name)

    draw.line((85, 790, 1095, 790), fill="#CBD5E1", width=3)
    draw.line((100, 835, 180, 835), fill="#17365D", width=5)
    draw.text((195, 820), "required edge and mastery threshold", font=pil_font(25), fill="#334155")
    for x in range(650, 730, 25):
        draw.line((x, 835, x + 15, 835), fill="#94A3B8", width=5)
    draw.text((745, 820), "recommended edge", font=pil_font(25), fill="#334155")

    flow_box(draw, (85, 915, 1095, 1075), "1  Deterministic prerequisite gate",
             ["PostgreSQL REQUIRED edges plus confidence adjusted mastery", "Unknown or insufficient evidence remains locked"],
             accent=RED, fill="FFF7ED", title_size=34, body_size=28)
    flow_box(draw, (85, 1130, 1095, 1290), "2  Read only structural enrichment",
             ["NetworkX computes layers  descendants  routes  centrality", "Gateway score cannot bypass a failed required edge"],
             accent=AMBER, fill="FFFBEB", title_size=34, body_size=28)
    flow_box(draw, (85, 1345, 1095, 1510), "3  Dependency safe ranking and path",
             ["Only eligible candidates reach the Random Forest", "Decision snapshots retain edges  thresholds  scores  reasons"],
             accent=MID_BLUE, fill="EFF6FF", title_size=34, body_size=28)
    line_arrow(draw, (590, 1078), (590, 1125), color="#17365D", width=6)
    line_arrow(draw, (590, 1293), (590, 1340), color="#17365D", width=6)
    image.save(path, dpi=(320, 320))


def create_metrics_figure(path: Path, manifest: dict) -> None:
    metrics = manifest["metrics"]["test"]
    order = ["random_forest", "gradient_boosting", "logistic_regression", "highest_skill_gap", "popularity"]
    labels = ["Random Forest", "Gradient Boosting", "Logistic Regression", "Skill gap baseline", "Popularity baseline"]
    colors = ["#2F5597", "#0F766E", "#6B7280", "#B45309", "#9CA3AF"]
    image = Image.new("RGB", (980, 1030), "white")
    draw = ImageDraw.Draw(image)
    draw.text((46, 28), "Held out ranking and discrimination metrics", font=pil_font(36, True), fill="#111827")
    chart_left, chart_right = 230, 925
    top = 130
    for tick in range(0, 11, 2):
        value = tick / 10
        x = chart_left + int(value * (chart_right - chart_left))
        draw.line((x, top, x, 890), fill="#E5E7EB", width=2)
        draw.text((x - 12, 900), f"{value:.1f}", font=pil_font(18), fill="#475569")
    groups = [("ROC AUC", "rocAuc", 0), ("NDCG at 5", "ndcgAt5", 350)]
    for group_name, key, offset in groups:
        y0 = top + offset
        draw.text((48, y0 - 38), group_name, font=pil_font(23, True), fill="#111827")
        for idx, model in enumerate(order):
            y = y0 + idx * 53
            value = float(metrics[model][key])
            draw.text((48, y + 8), labels[idx], font=pil_font(18), fill="#111827")
            draw.rounded_rectangle((chart_left, y + 7, chart_left + int(value * (chart_right - chart_left)), y + 36), radius=6, fill=colors[idx])
            draw.text((chart_left + int(value * (chart_right - chart_left)) + 8, y + 8), f"{value:.3f}", font=pil_font(18, True), fill="#111827")
    draw.text((48, 968), "Source  benefit ranking v2 manifest  learner disjoint test split", font=pil_font(18), fill="#475569")
    image.save(path)


def set_core_properties(doc: Document) -> None:
    props = doc.core_properties
    props.title = "LearnPath Evidence Driven Adaptive Learning with Prerequisite Aware Knowledge Graphs and Machine Learning Ranking"
    props.subject = "IEEE conference manuscript on evidence driven adaptive learning"
    props.author = "Anonymous Authors"
    props.keywords = "adaptive learning, knowledge graph, diagnostic assessment, mastery, retention, machine learning"
    props.comments = "Generated from the implemented LearnPath system and its measured verification artifacts"


def add_reference(doc: Document, number: int, text: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.19)
    p.paragraph_format.first_line_indent = Inches(-0.19)
    p.paragraph_format.space_after = Pt(1.5)
    p.paragraph_format.line_spacing = 1.0
    set_font(p.add_run(f"[{number}] "), size=8)
    set_font(p.add_run(text), size=8)


def build() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MODEL_MANIFEST.read_text(encoding="utf-8"))
    create_architecture_figure(ASSET_DIR / "system-architecture.png")
    create_diagnostic_figure(ASSET_DIR / "diagnostic-v5.png")
    create_graph_figure(ASSET_DIR / "knowledge-graph-v2.png")
    create_metrics_figure(ASSET_DIR / "model-metrics.png", manifest)

    doc = Document()
    style_document(doc)
    set_core_properties(doc)
    for section in doc.sections:
        configure_page(section)
        set_columns(section, 1)

    title = doc.add_paragraph(style="Title")
    title.add_run("LearnPath Evidence Driven Adaptive Learning with Prerequisite Aware Knowledge Graphs and Machine Learning Ranking")

    author = doc.add_paragraph()
    author.alignment = WD_ALIGN_PARAGRAPH.CENTER
    author.paragraph_format.first_line_indent = Inches(0)
    author.paragraph_format.space_after = Pt(1)
    set_font(author.add_run("Anonymous Authors"), size=11)
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.paragraph_format.first_line_indent = Inches(0)
    subtitle.paragraph_format.space_after = Pt(7)
    set_font(subtitle.add_run("Affiliations withheld for double blind submission"), size=9, italic=True)

    abstract = doc.add_paragraph()
    abstract.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    abstract.paragraph_format.first_line_indent = Inches(0)
    abstract.paragraph_format.left_indent = Inches(0.25)
    abstract.paragraph_format.right_indent = Inches(0.25)
    abstract.paragraph_format.space_after = Pt(3)
    set_font(abstract.add_run("Abstract  "), size=9, bold=True, italic=True)
    set_font(abstract.add_run(
        "Adaptive learning systems must estimate a learner's current knowledge, respect prerequisite dependencies, rank useful next skills, and revise the recommendation after new evidence. This paper presents LearnPath, an evidence-driven adaptive learning system that combines an append-only evidence ledger, a global learner-skill model, an adaptive diagnostic, a confidence-aware prerequisite graph, retention projection, and checked Random Forest inference. PostgreSQL and a TypeScript decision engine enforce required prerequisite gates; NetworkX supplies read-only structural analytics; and machine learning ranks only prerequisite-eligible candidates. The generated path distinguishes recognized, current, recommended, upcoming, and locked skills while preserving the evidence, graph, feature, and model versions used for each decision. Because longitudinal deployment data were unavailable, evaluation used a deterministic curriculum-grounded simulation of 1,000 learners and 20,000 interactions. On a learner-disjoint held-out set, the selected Random Forest achieved 0.801 ROC-AUC and 0.525 Precision at 5; its NDCG at 5 was 0.578, compared with 0.581 for the strongest skill-gap baseline. The results establish implementation feasibility and measurable predictive signal under simulation, but not real-world learning effectiveness. LearnPath's principal contribution is a dependency-safe and auditable architecture for combining educational constraints with data-driven ranking and dynamic path regeneration."
    ), size=9)

    terms = doc.add_paragraph()
    terms.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    terms.paragraph_format.first_line_indent = Inches(0)
    terms.paragraph_format.left_indent = Inches(0.25)
    terms.paragraph_format.right_indent = Inches(0.25)
    terms.paragraph_format.space_after = Pt(5)
    set_font(terms.add_run("Index Terms  "), size=9, bold=True, italic=True)
    set_font(terms.add_run(
        "adaptive learning, educational knowledge graph, computerized diagnostic assessment, mastery estimation, retention, learning-path recommendation, Random Forest, explainable decision support"
    ), size=9)

    add_figure(
        doc,
        ASSET_DIR / "system-architecture.png",
        "Fig. 1. LearnPath system architecture. Solid lines denote authoritative state and deterministic decisions; dashed lines denote advisory graph or model outputs; teal lines close the evidence feedback loop.",
        7.0,
    )

    body_section = doc.add_section(WD_SECTION.CONTINUOUS)
    configure_page(body_section)
    set_columns(body_section, 2, 300)

    add_heading(doc, "I INTRODUCTION")
    add_body(doc,
        "Online learning platforms often organize content as a fixed module sequence. That sequence is simple to administer, but it does not answer the learner's immediate question: what should I learn next, given what I already know, what I have forgotten, and what later topics depend on? A useful answer requires more than a course recommender. It requires a maintained learner model, evidence-aware diagnosis, prerequisite reasoning, candidate generation, benefit estimation, and a mechanism that revises the path after learning."
    )
    add_body(doc,
        "Knowledge tracing research models how proficiency changes through interaction. Bayesian Knowledge Tracing introduced a compact probabilistic account of latent skill acquisition [1], Performance Factors Analysis used prior successes and failures as predictors [2], and Deep Knowledge Tracing showed that recurrent networks can learn more complex interaction patterns [3]. These approaches motivate stateful learner modeling. LearnPath does not claim a calibrated latent-state model because the available evidence is not longitudinal or population representative. It therefore uses conservative, inspectable mastery and confidence updates while preserving the event history needed for future calibration."
    )
    add_body(doc,
        "Adaptive testing research also shows that question choice should depend on information value and uncertainty rather than a fixed questionnaire [4]. LearnPath adopts this principle as an engineering policy: it samples course regions, confirms uncertain evidence, and spends extra questions on gateway skills or contradictions. Its coefficients are declared policy priors, not validated psychometric constants. This distinction matters because a short diagnostic can inform placement without certifying mastery."
    )
    add_body(doc,
        "The system separates educational safety from prediction. Required prerequisite edges are enforced deterministically before any candidate reaches the Random Forest. NetworkX supplies structural measures such as topological layers, descendants, betweenness centrality, and counterfactual unlocks [5]. The model then estimates learning benefit only within the safe candidate set. This ordering prevents a high probability from recommending a skill whose foundations are missing."
    )
    add_lead_paragraph(doc, "Contributions  ", "This paper makes four engineering contributions:")
    add_bullets(doc, [
        "a global learner-skill state that is reused across independent course enrollments while course progress remains separate from demonstrated knowledge",
        "an evidence-driven diagnostic with explicit uncertainty, misconception evidence, decision-specific stopping, and a rule that one answer cannot establish mastery",
        "a hybrid knowledge-graph layer in which PostgreSQL and TypeScript enforce prerequisite safety while NetworkX adds bounded structural intelligence",
        "a versioned candidate-ranking and path-regeneration pipeline that records why a skill was recommended and how later assessed evidence changed the decision",
    ])
    add_body(doc,
        "We evaluate three questions: whether prerequisite safety is preserved when graph analytics and machine learning are combined; whether benefit ranking exhibits predictive signal against deterministic baselines; and whether evidence-to-path decisions are reproducible through versioned records. Model metrics come from synthetic interactions and learner-disjoint splits, while software claims come from automated and database-connected tests. Learning effectiveness remains a question for a prospective study with representative learners."
    )

    add_heading(doc, "II RELATED WORK")
    add_heading(doc, "A Learner Knowledge Modeling", 2)
    add_body(doc,
        "Bayesian Knowledge Tracing represents a knowledge component with interpretable probabilities for initial knowledge, learning, guessing, and slipping [1]. Performance Factors Analysis provides an alternative logistic formulation based on prior opportunities, successes, and failures [2]. Deep Knowledge Tracing replaces the hand-specified state transition with a recurrent neural network and demonstrated improved next-response prediction on several datasets [3]. LearnPath differs in purpose and evidence conditions. It does not estimate a single hidden ability from a long historical sequence; it maintains a global state per learner and skill with an explicit confidence and evidence-state label. The design sacrifices statistical sophistication for auditability until real longitudinal data is available."
    )
    add_heading(doc, "B Adaptive Assessment", 2)
    add_body(doc,
        "Computerized adaptive testing commonly selects items using information measures. Chang and Ying showed that global information can improve early-stage selection when the current ability estimate is unreliable [4]. LearnPath uses a related intuition but does not implement item-response-theory calibration. Its diagnostic selector combines item discrimination, guessing probability, knowledge uncertainty, prerequisite impact, retention risk, and cognitive diversity. The stopping decision is tied to downstream path decisions rather than a single population-comparable score."
    )
    add_heading(doc, "C Educational Graphs and Learning Paths", 2)
    add_body(doc,
        "Prerequisite relations support curriculum planning and intelligent tutoring. Liang et al. recovered concept prerequisites from university course dependencies and emphasized that prerequisite discovery is an important educational-data-mining problem [6]. Recent learning-path recommenders also combine graph representations with collaborative, sequential, or reinforcement-learning methods [7]. LearnPath focuses on a different systems question: how to prevent a statistical ranker from violating required dependencies while still using graph structure to explain leverage. The graph is expert-authored and database constrained; automatic edge discovery is left for future work."
    )
    add_heading(doc, "D Retention and Ranking", 2)
    add_body(doc,
        "Spaced-repetition research models recall as a function of elapsed time and prior practice. Half-life regression demonstrated that trainable forgetting models can outperform several recall-prediction baselines [8]. LearnPath uses a simpler configurable exponential projection because its dataset is too small to fit learner- or skill-specific decay parameters. For ranking, Random Forests offer nonlinear interactions and noise tolerance [9]. Ranking quality is measured with Precision at k and normalized discounted cumulative gain, which rewards relevant candidates near the top [10]."
    )

    add_heading(doc, "III SYSTEM MODEL AND ARCHITECTURE")
    add_heading(doc, "A Core Entities", 2)
    add_body(doc,
        "Let L be the set of learners, S the global skill set, C the course set, and E the directed prerequisite edges. LearnPath stores one learner-skill row for each observed pair in L by S. A course enrollment supplies context and module progress but does not own another mastery value. This rule enables cross-course reuse: if recursion is evidenced in one course, another course that references recursion reads the same mastery, confidence, and retention state."
    )
    add_body(doc,
        "Performance evidence is append-only. Each diagnostic answer, practice attempt, post-lesson assessment, quiz, or retention check stores source, score, correctness, difficulty, timing, attempt number, and state before and after the update. Resource completion is activity evidence, not knowledge evidence, and cannot change mastery. This prevents the common error of treating a watched lesson as proof that the learner can apply the skill."
    )
    add_table(doc, "TABLE I  IMPLEMENTATION BOUNDARIES", ["Layer", "Responsibility", "Technology"], [
        ("Learner interface", "Render decisions and collect actions", "React TypeScript Vite"),
        ("Application API", "Auth evidence mastery gates paths", "Express TypeScript"),
        ("Authoritative store", "Curriculum state evidence versions", "PostgreSQL"),
        ("Advisory intelligence", "Graph analytics and benefit inference", "FastAPI NetworkX scikit learn"),
    ], [0.75, 1.45, 1.05], 6.9)
    add_heading(doc, "B Decision Authority", 2)
    add_body(doc,
        "The browser never calculates mastery, confidence, eligibility, or ranking. The Express API validates context, updates state, enforces required prerequisites, creates candidate vectors, invokes the inference service, and persists path versions. PostgreSQL is authoritative for graph edges, learner knowledge, evidence, enrollments, and decisions. The Python service is stateless and read-only with respect to application data. It verifies the model checksum and 55-feature contract before serving probabilities."
    )
    add_body(doc,
        "This boundary produces a fail-closed system. If NetworkX is unavailable, the TypeScript prerequisite gate still returns a complete safety decision and omits only the structural bonus. If the model artifact or feature schema is incompatible, path generation fails explicitly rather than substituting an unversioned heuristic."
    )

    add_heading(doc, "IV EVIDENCE DRIVEN DIAGNOSTIC")
    add_figure(doc, ASSET_DIR / "diagnostic-v5.png", "Fig. 2. Diagnostic control flow. Question selection repeats until the current path decision has sufficient coverage and evidence.", 3.12)
    add_heading(doc, "A Question Selection", 2)
    add_body(doc,
        "Diagnostic v5 begins with anchor questions across high-impact course regions. After each response, the server recomputes a value for every unasked item. The value uses eight bounded components: information gain, current uncertainty, prerequisite-gateway importance, decision impact near a mastery threshold, course relevance, retention risk, evidence diversity, and misconception value. Exposure and topic-switch penalties control repetition. A verification boost is applied only when mixed evidence on an important skill must be resolved."
    )
    add_equation(doc, "question-value.png", 1, "Diagnostic question value")
    add_body(doc,
        "In (1), x sub k is a bounded component and alpha sub k is its declared weight. The current weights are 0.25 for information gain, 0.15 each for uncertainty, gateway importance, and decision impact, 0.10 for course relevance, 0.08 for retention risk, 0.07 for evidence diversity, and 0.05 for misconception value. These values make the policy inspectable. They should later be calibrated against diagnostic efficiency and downstream error on real learners."
    )
    add_body(doc,
        "Item information is approximated from discrimination and guessing metadata. Difficulty is matched to the current estimate, while cognitive diversity rewards a question that adds REMEMBER, UNDERSTAND, APPLY, or ANALYZE evidence not yet observed. The initial eight regions receive coverage priority. Later selections prefer confirmation or verification, so the diagnostic can detect the rare but important case in which a learner answers an advanced item correctly while failing a required foundation."
    )
    add_heading(doc, "B Evidence Strength and Per Skill Decisions", 2)
    add_body(doc,
        "Every answer receives an evidence-strength value rather than a uniform vote. A correct hard application item with high discrimination is stronger than an easy recall item with a high guessing probability. Selecting I am not sure reduces certainty without treating the answer as missing."
    )
    add_equation(doc, "evidence-strength.png", 2, "Answer evidence strength")
    add_body(doc,
        "The weighted diagnostic performance for a skill averages response values using at least 0.1 evidence weight per observation. A single observation is classified PROBED regardless of its score. MASTERED requires at least three observations, at least two cognitive levels, a correct APPLY or ANALYZE item, mastery of at least 0.80 or the course target if higher, and confidence of at least 0.70. READY requires two correct observations with mastery at least 0.65 and confidence at least 0.50. GAP requires two consistent negative observations and mastery below 0.50. Mixed evidence remains NEEDS CONFIRMATION."
    )
    add_table(doc, "TABLE II  DIAGNOSTIC CLASSIFICATION POLICY", ["Class", "Minimum evidence", "Interpretation"], [
        ("PROBED", "1 observation", "Initial signal only"),
        ("READY", "2 correct  M at least 0.65  C at least 0.50", "Can continue with caution"),
        ("MASTERED", "3 varied with applied success  M at least 0.80  C at least 0.70", "Strong diagnostic placement"),
        ("GAP", "2 negative  M below 0.50", "Repeated foundation weakness"),
        ("NEEDS CONFIRMATION", "Limited or mixed evidence", "No forced decision"),
    ], [0.83, 1.45, 0.98], 6.4)
    add_heading(doc, "C Evidence Sufficiency Stopping", 2)
    add_body(doc,
        "The assessment asks at least 12 questions when the bank permits. It normally stops between 16 and 22, and never exceeds 28. After each saved answer, the server checks whether at least 75 percent of course skill regions, and at least eight regions where available, have been sampled; whether the three gateways with the most dependents are resolved; and whether a high-impact contradiction remains. Positive gateway evidence must include an application or analysis observation before it can unlock a dependent skill. Two independent negative observations are sufficient to preserve a lock."
    )
    add_body(doc,
        "This stopping rule does not claim that 12 to 28 questions measure all knowledge. It claims only that the collected evidence is sufficient for the current path decision. Untested skills remain explicit. Confidence intervals widen when confidence is low or observations are sparse, and the learner can later strengthen the state through practice and assessment."
    )
    add_heading(doc, "D Misconception Evidence", 2)
    add_body(doc,
        "Incorrect distractors can map to misconception codes. The system appends a misconception-evidence event and updates a bounded learner-skill misconception state. The selector can then choose a follow-up item that discriminates the suspected pattern. The result page reports the pattern, its evidence count, and confidence instead of flattening every error into a low percentage."
    )

    add_heading(doc, "V GLOBAL MASTERY CONFIDENCE AND RETENTION")
    add_heading(doc, "A Central Mastery Update", 2)
    add_body(doc,
        "All assessed sources use one mastery service. For an existing state, the source weight is 0.40 for diagnostic, assessment, or module assessment; 0.30 for quiz; 0.25 for practice; and 0.35 for a retention check. Reliability scales that weight. A new skill starts directly from the bounded performance estimate because no earlier mastery exists."
    )
    add_equation(doc, "mastery-update.png", 3, "Evidence weighted mastery update")
    add_body(doc,
        "Equation (3) is an exponential moving update, not a psychometrically calibrated posterior. It has two useful engineering properties: each event has a bounded effect, and the stored before-and-after state explains the change. A row lock limits concurrent updates to the affected learner-skill pair."
    )
    add_heading(doc, "B Confidence and Evidence State", 2)
    add_body(doc,
        "Confidence is separate from mastery. It grows with evidence count, source diversity, independent sessions, average difficulty, consistency, and retention evidence. Diagnostic-only confidence is capped at 0.45 in the central evidence policy, even though the diagnostic result also reports its own within-session classification confidence. This prevents a one-session placement test from becoming VERIFIED knowledge."
    )
    add_body(doc,
        "Evidence states summarize defensibility. UNKNOWN means no performance evidence. ESTIMATED means evidence exists but remains sparse. ASSESSED requires at least five observations over two sessions with confidence of at least 0.45. VERIFIED requires at least 12 observations over four sessions, consistency of at least 0.70, confidence of at least 0.78, and either retention evidence or broad source and session diversity."
    )
    add_heading(doc, "C Retention Projection", 2)
    add_body(doc,
        "Mastery records demonstrated knowledge; retention projects its present accessibility. The latest immutable performance event anchors the elapsed time. Confidence and repeated evidence slow the decay rate. Passive lesson completion cannot move the anchor."
    )
    add_equation(doc, "retention.png", 4, "Confidence and repetition adjusted retention")
    add_body(doc,
        "The base daily decay parameter lambda zero is 0.025. A skill is STRONG when retention is at least 0.75, MODERATE from 0.50 to below 0.75, AT RISK from 0.30 to below 0.50, and CRITICAL below 0.30. Revision eligibility additionally requires previously demonstrated mastery above a configured floor. This prevents an ordinary knowledge gap from being mislabeled as forgetting. The function is intentionally presented as a configurable heuristic until real delayed-recall observations permit calibration [8]."
    )

    add_heading(doc, "VI KNOWLEDGE GRAPH AND CANDIDATE GENERATION")
    add_figure(doc, ASSET_DIR / "knowledge-graph-v2.png", "Fig. 3. Representative curriculum subgraph and decision boundary. Edge labels are required mastery thresholds; the dashed edge is advisory.", 3.12)
    add_heading(doc, "A Authoritative Prerequisite Gate", 2)
    add_body(doc,
        "The curriculum is a directed acyclic graph whose nodes are global skills and whose edges are REQUIRED or RECOMMENDED dependencies. Database constraints and cycle-prevention logic protect the required-edge graph. For a course analysis, the API loads course skills and recursively includes supporting prerequisite ancestors. An unknown mastery never satisfies a required edge. Recommended edges are advisory and cannot lock a skill."
    )
    add_equation(doc, "prerequisite-gate.png", 5, "Confidence adjusted prerequisite gate")
    add_body(doc,
        "In (5), M is observed mastery, C is confidence, and T is the edge-specific required threshold. The maximum confidence penalty is 0.10. For example, M equal to 0.73 and C equal to 0.40 produce effective mastery 0.67, so a threshold of 0.70 remains locked. This conservative buffer prevents a weakly supported estimate from opening an advanced branch."
    )
    add_heading(doc, "B NetworkX Structural Intelligence", 2)
    add_body(doc,
        "The API sends a request-scoped projection of the required-edge graph to NetworkX. The service validates acyclicity, computes topological generations, descendants, direct dependents, normalized betweenness centrality, shortest foundation routes, and the DAG longest path. A counterfactual unlock identifies a currently locked direct dependent that would become eligible if one selected prerequisite reached its threshold while every other required edge remained satisfied."
    )
    add_body(doc,
        "For each skill, the gateway score combines descendant ratio D, normalized betweenness B, and immediate counterfactual-unlock ratio U. The score describes structural leverage rather than predicted learning gain. If graph analytics fail, eligibility still works and the bonus becomes zero."
    )
    add_heading(doc, "C Candidate Pools", 2)
    add_body(doc,
        "Candidate generation is enrollment scoped. It begins with course skills and recursively adds supporting prerequisites. Each relevant skill belongs to exactly one pool: eligible learning, supporting prerequisite, retention revision, locked, or covered. Covered means global mastery meets the course target and revision is not due. Locked candidates carry exact failed edges and mastery shortfalls. Only the three eligible kinds move to feature construction and model inference."
    )

    add_heading(doc, "VII MACHINE LEARNING RANKING")
    add_heading(doc, "A Synthetic Research Boundary", 2)
    add_body(doc,
        "No suitable longitudinal learner dataset was available for the implemented curriculum. Evaluation therefore uses a deterministic, curriculum-grounded simulator with random seed 42. It generates 20,000 sequential interactions for 1,000 synthetic learners across beginner, intermediate, and advanced levels, fast and slow pace, and consistent and inconsistent performance. Noise mechanisms include guessing, disengagement, skipped content, difficulty mismatch, and inconsistent performance. The synthetic artifact is physically separate from PostgreSQL learner tables and is never imported into application evidence."
    )
    add_body(doc,
        "The benefit label is not sampled independently. A versioned formula combines mastery gain with weight 0.40, completion rate with 0.25, assessment improvement with 0.25, and normalized learner feedback with 0.10. A row is beneficial when the score is at least 0.27. The generated data has 7,091 positive and 12,909 negative labels. The manifest records checksums, distributions, modeled correlations, and validation gates."
    )
    add_heading(doc, "B Feature Contract and Leakage Control", 2)
    add_body(doc,
        "The feature entity is learner by eligible candidate skill. The frozen vector contains 55 numeric features across learner state, skill metadata, mastery, performance, retention, prerequisites, and prior interaction. Examples include current mastery, confidence, mastery gap, evidence strength, recent score, score trend, retention, revision due, satisfied prerequisite ratio, prerequisite readiness, prior completion, prior engagement, and candidate kind. Identifiers and the target label are metadata only."
    )
    add_body(doc,
        "Current completion, engagement, time spent, post-assessment, mastery gain, feedback, benefit score, and label are blocked from the current vector. Historical outcome-derived features are shifted by learner before aggregation so that an interaction cannot use its own result. The same validator enforces names, order, bounds, and finiteness in training and live inference. Unknown live values use explicit bounded imputations while learner-facing knowledge remains nullable."
    )
    add_heading(doc, "C Training and Model Selection", 2)
    add_body(doc,
        "Learners, rather than rows, are split with seed 42 into 700 training, 150 validation, and 150 test learners. The corresponding row counts are 14,000, 3,000, and 3,000. No learner appears in more than one split. Gradient Boosting, Random Forest, and Logistic Regression use the same feature matrix, while highest skill gap and curriculum popularity are deterministic baselines. Selection uses validation NDCG at 5, with ROC-AUC and F1 as tie breakers. Classification thresholds are chosen on validation data and applied unchanged to test data."
    )
    add_body(doc,
        "The selected Random Forest contains 220 trees, maximum depth 12, square-root feature sampling, class-balanced training, minimum leaf size 4, and seed 42. The checked artifact stores its SHA-256 checksum, feature version, library versions, split checksum, metrics, and feature importances. The runtime verifies these fields before deserialization and exposes a bounded batch probability endpoint."
    )
    add_equation(doc, "path-priority.png", 6, "Gateway and path priority")
    add_body(doc,
        "Equation (6) shows the final course priority. The Random Forest benefit probability remains the dominant term. Retention revision adds 0.08, and graph structure adds at most 0.06 times G. A locked skill never reaches this equation. The cap lets a gateway break a close decision without making centrality an alternative unlock path."
    )

    add_heading(doc, "VIII PERSONALIZED PATH AND DYNAMIC ADAPTATION")
    add_heading(doc, "A Path Construction", 2)
    add_body(doc,
        "A generated path is owned by one course enrollment. Covered skills are persisted as RECOGNIZED, an in-progress recently used skill may appear as CURRENT, the highest priority eligible skill becomes RECOMMENDED NEXT, remaining eligible skills become UPCOMING in score order, and prerequisite failures remain LOCKED. Each item stores decision-time mastery, confidence, retention, missing prerequisites, benefit probability, priority, graph metrics, reason codes, and model, feature, inference, and policy versions."
    )
    add_body(doc,
        "The learner interface makes this path the main course surface. Learn Next explains the number of eligible alternatives, predicted benefit, mastery gap or revision need, prerequisite status, and any bounded graph contribution. The prerequisite view exposes exact edges, thresholds, shortest foundation routes, bottlenecks, and counterfactual unlocks. The Skill Passport shows the same global knowledge reused across every course."
    )
    add_heading(doc, "B Multiple Course Coordination", 2)
    add_body(doc,
        "Independent course paths are not merged. A learner-level coordinator compares their fresh Learn Next items. Matching recommendations are grouped by global skill identity, so a foundation that advances two active courses receives a bounded cross-course bonus. The coordinator also applies at most 0.06 active-goal relevance. It cannot create a candidate, unlock a prerequisite, or overwrite a course path."
    )
    add_heading(doc, "C Evidence Triggered Regeneration", 2)
    add_body(doc,
        "New assessed evidence updates the global skill state and marks every current path for that learner stale in the same transaction. A stale path remains visible for audit but is excluded from cross-course coordination. Explicit regeneration reruns prerequisite analysis, candidate generation, feature construction, inference, and path ordering. The previous row becomes SUPERSEDED, the new version becomes ACTIVE, and a structured comparison records whether Learn Next changed and why."
    )
    add_body(doc,
        "This lifecycle makes the adaptive claim observable: assessment changed knowledge, the changed state invalidated an earlier recommendation, and regeneration either changed the next skill or retained it with updated evidence. Recommendation acceptance, lesson completion, and later assessment are linked to the frozen path version for observational evaluation."
    )

    add_heading(doc, "IX EVALUATION")
    add_heading(doc, "A Offline Model Results", 2)
    add_figure(doc, ASSET_DIR / "model-metrics.png", "Fig. 4. Held-out metrics from 150 synthetic test learners and 3,000 candidate rows.", 3.12)
    add_table(doc, "TABLE III  HELD OUT TEST METRICS", ["Method", "AUC", "P at 5", "NDCG at 5"], [
        ("Random Forest", "0.801", "0.525", "0.578"),
        ("Gradient Boosting", "0.804", "0.521", "0.590"),
        ("Logistic Regression", "0.802", "0.513", "0.580"),
        ("Highest Skill Gap", "0.731", "0.511", "0.581"),
        ("Popularity", "0.440", "0.284", "0.272"),
    ], [1.30, 0.60, 0.66, 0.70], 6.7)
    add_body(doc,
        "Random Forest was selected before opening the test set because it had the highest validation NDCG at 5, 0.581. On test, it achieved accuracy 0.717, F1 0.655, ROC-AUC 0.801, Precision at 5 of 0.525, and NDCG at 5 of 0.578. Its ROC-AUC exceeded the strongest deterministic baseline by 0.071, and Precision at 5 exceeded it by 0.015. However, test NDCG at 5 was 0.003 below the highest-skill-gap baseline and 0.011 below Gradient Boosting. This is evidence of predictive signal, not evidence that Random Forest is uniformly superior."
    )
    add_body(doc,
        "The most important Random Forest features were recent score 0.105, current mastery 0.074, mastery gap 0.073, skill average score 0.069, historical feedback 0.064, and score trend 0.052. These importances are global impurity-based summaries and should not be interpreted as causal effects or local explanations. A future real-data evaluation should add calibrated probabilities, confidence intervals, subgroup analysis, and local attributions such as SHAP [11]."
    )
    add_heading(doc, "B Diagnostic Demonstration", 2)
    add_body(doc,
        "Seeded learner profiles exercise clear, uncertain, and contradictory evidence. In a database audit of six completed diagnostic attempts, three stopped at 13 questions, while the remaining attempts stopped at 16, 17, and the 28-question maximum. The audit contained 100 answer-level evidence records with stored evidence strengths and state changes, 20 misconception events, and 100 question-selection decision records. These counts show that the stopping policy and audit trail execute at different lengths; they do not measure diagnostic validity."
    )
    add_heading(doc, "C Software Verification", 2)
    add_body(doc,
        "The API unit suite passed 107 tests across 26 files, the web suite passed 41 tests across 20 files, and the Python service passed 37 tests covering feature engineering, graph analytics, health checks, inference, synthetic generation, and training. A database-connected verification run additionally recorded 17 PostgreSQL integration tests and complete content coverage for all 36 active skills. Five seeded behavioral scenarios exercised cold-start diagnosis, uncertainty, stale-path regeneration, retention review, and cross-course knowledge reuse. These tests establish conformance to the implemented decision policies; they do not measure educational effectiveness."
    )
    add_table(doc, "TABLE IV  VERIFICATION EVIDENCE", ["Evidence", "Result", "What it supports"], [
        ("API unit tests", "107 passed", "Decision services and routes"),
        ("Web tests", "41 passed", "Client data and core components"),
        ("Python tests", "37 passed", "Graph model and data contracts"),
        ("PostgreSQL integration", "17 passed", "Transactional cross module behavior"),
        ("Content coverage", "36 of 36 skills", "Complete learn practice assess loop"),
        ("Behavioral scenarios", "5 seeded", "Distinct learner state transitions"),
    ], [1.02, 0.83, 1.40], 6.6)
    add_heading(doc, "D End to End Behavioral Validation", 2)
    add_body(doc,
        "The seeded scenarios include a learner with no evidence, an enrolled learner before diagnosis, a developing learner whose assessed performance makes a path stale, a cross-course learner with retention needs, and an advanced learner whose shared foundations are recognized while a specific sorting gap remains. The scenarios validate state transitions and knowledge reuse; they are software fixtures rather than research participants."
    )

    add_heading(doc, "X TRUSTWORTHINESS AND LIMITATIONS")
    add_heading(doc, "A Trust Mechanisms", 2)
    add_body(doc,
        "LearnPath does not rely on a single model score. Required prerequisites are deterministic and checked before inference, and unknown knowledge cannot satisfy a gate. Mastery is separated from confidence and course completion. Evidence is append-only, and each path stores its data and model context. Checksums and schema versions prevent silent model or feature drift. Failure modes are explicit, and small-sample governance withholds rates, calibration, drift conclusions, and retraining readiness until documented evidence thresholds are met."
    )
    add_body(doc,
        "Explanations are separated by audience. Learners see a concise reason tied to mastery gap, prerequisite readiness, retention, and predicted benefit. Researchers and system maintainers can inspect graph metrics, feature and model versions, decision-time snapshots, path history, and answer-level diagnostic selection records. This design follows the broader requirement that predictive systems make their basis inspectable [11] while avoiding the false precision of treating feature importance as a causal explanation."
    )
    add_heading(doc, "B Threats to Validity", 2)
    add_body(doc,
        "The strongest limitation is external validity. The ranking model was trained and tested on a simulator whose label is defined by a deterministic benefit formula. Performance therefore measures recovery of simulated benefit structure, not learner achievement in a real population. Public educational datasets such as EdNet contain large interaction histories [12], but their curricula and event semantics do not directly match LearnPath's prerequisite graph and benefit definition. Transfer evaluation would require a careful mapping rather than treating their logs as interchangeable."
    )
    add_body(doc,
        "Diagnostic thresholds, item metadata, evidence weights, and retention decay are policy parameters. They are transparent and tested but not calibrated against standardized assessments. The graph contains 36 active skills and expert-authored edges in a compact computing curriculum; missing or incorrect prerequisites can block or misorder paths. The one-number mastery state also cannot represent every misconception or context-dependent performance."
    )
    add_body(doc,
        "The offline test contains only 150 synthetic learners. The difference between Random Forest and the skill-gap baseline on NDCG at 5 is small and unfavorable on test, so model promotion should remain conditional. The system does not automatically retrain or promote a model. It also does not perform causal estimation; recommendation acceptance and later assessed gain are observational associations attached to immutable versions."
    )
    add_heading(doc, "C Required Real World Study", 2)
    add_body(doc,
        "A credible next study should enroll representative learners, obtain consent, pre-register outcomes, and compare at least the checked Random Forest policy, the highest-skill-gap baseline, and a dependency-valid nonpersonalized path. Primary outcomes should include post-assessment gain and delayed retention. Secondary outcomes should include time to mastery, path acceptance, diagnostic length, and learner-reported clarity. Learners must remain grouped across train, validation, and test, and analysis should report calibration and subgroup performance. A randomized or carefully controlled design is needed before attributing gains to the recommender."
    )

    add_heading(doc, "XI CONCLUSION")
    add_body(doc,
        "LearnPath implements the complete adaptive loop from learner evidence to dynamic path regeneration. Its central design choice is to use the right form of reasoning at each boundary: immutable evidence for audit, global skill state for cross-course reuse, deterministic graph gates for educational safety, NetworkX for structural leverage, Random Forest inference for benefit ranking, and versioned paths for visible adaptation."
    )
    add_body(doc,
        "The implemented system supports diagnosis, skill-gap detection, prerequisite explanations, retention review, multiple enrollments, machine-learning ranking, and before-and-after path changes using persisted application data. The selected model shows useful discrimination but does not outperform the strongest baseline on every ranking metric, and all training outcomes are synthetic. The present contribution is therefore an auditable, dependency-safe architecture together with an experimental protocol for replacing engineering priors with calibrated evidence from real learners."
    )

    add_heading(doc, "REFERENCES")
    references = [
        "A. T. Corbett and J. R. Anderson, \"Knowledge tracing: Modeling the acquisition of procedural knowledge,\" User Modeling and User-Adapted Interaction, vol. 4, no. 4, pp. 253-278, 1995, doi: 10.1007/BF01099821.",
        "P. I. Pavlik Jr., H. Cen, and K. R. Koedinger, \"Performance Factors Analysis: A new alternative to knowledge tracing,\" in Proc. 14th Int. Conf. Artificial Intelligence in Education, Brighton, U.K., 2009, pp. 531-538.",
        "C. Piech et al., \"Deep knowledge tracing,\" in Advances in Neural Information Processing Systems 28, 2015, pp. 505-513.",
        "H. H. Chang and Z. Ying, \"A global information approach to computerized adaptive testing,\" Applied Psychological Measurement, vol. 20, no. 3, pp. 213-229, 1996, doi: 10.1177/014662169602000303.",
        "A. A. Hagberg, D. A. Schult, and P. J. Swart, \"Exploring network structure, dynamics, and function using NetworkX,\" in Proc. 7th Python in Science Conf., Pasadena, CA, USA, 2008, pp. 11-16.",
        "C. Liang, J. Ye, Z. Wu, B. Pursel, and C. L. Giles, \"Recovering concept prerequisite relations from university course dependencies,\" in Proc. 31st AAAI Conf. Artificial Intelligence, 2017, doi: 10.1609/aaai.v31i1.10550.",
        "H. Ngo, K. Vo, and T. Nguyen, \"Personalized learning path recommendations: Fusing knowledge graph embedding, sequence mining, and collaborative filtering,\" in 2024 IEEE Int. Conf. Big Data, Washington, DC, USA, 2024, pp. 8145-8153, doi: 10.1109/BigData62323.2024.10825001.",
        "B. Settles and B. Meeder, \"A trainable spaced repetition model for language learning,\" in Proc. 54th Annual Meeting of the Association for Computational Linguistics, Berlin, Germany, 2016, pp. 1848-1858, doi: 10.18653/v1/P16-1174.",
        "L. Breiman, \"Random forests,\" Machine Learning, vol. 45, pp. 5-32, 2001, doi: 10.1023/A:1010933404324.",
        "K. Jarvelin and J. Kekalainen, \"Cumulated gain-based evaluation of information retrieval techniques,\" ACM Trans. Information Systems, vol. 20, no. 4, pp. 422-446, 2002, doi: 10.1145/582415.582418.",
        "S. M. Lundberg and S. I. Lee, \"A unified approach to interpreting model predictions,\" in Advances in Neural Information Processing Systems 30, 2017, pp. 4765-4774.",
        "Y. Choi et al., \"EdNet: A large-scale hierarchical dataset in education,\" in Artificial Intelligence in Education, I. I. Bittencourt et al., Eds. Cham, Switzerland: Springer, 2020, pp. 69-73, doi: 10.1007/978-3-030-52237-7_6.",
        "M. Mitchell et al., \"Model cards for model reporting,\" in Proc. Conf. Fairness, Accountability, and Transparency, Atlanta, GA, USA, 2019, pp. 220-229, doi: 10.1145/3287560.3287596.",
    ]
    for idx, reference in enumerate(references, start=1):
        add_reference(doc, idx, reference)

    for section in doc.sections:
        configure_page(section)
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build()
