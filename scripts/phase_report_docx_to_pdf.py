from __future__ import annotations

import argparse
import re
import tempfile
from pathlib import Path

from docx import Document
from docx.table import Table as DocxTable
from docx.text.paragraph import Paragraph as DocxParagraph
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


NAVY = colors.HexColor("#172554")
BLUE = colors.HexColor("#1D4ED8")
LIGHT_BLUE = colors.HexColor("#EFF6FF")
LIGHT_GRAY = colors.HexColor("#F3F4F6")


def register_fonts() -> None:
    fonts = {
        "TimesNewRoman": "C:/Windows/Fonts/times.ttf",
        "TimesNewRoman-Bold": "C:/Windows/Fonts/timesbd.ttf",
        "TimesNewRoman-Italic": "C:/Windows/Fonts/timesi.ttf",
        "TimesNewRoman-BoldItalic": "C:/Windows/Fonts/timesbi.ttf",
    }
    for name, path in fonts.items():
        if Path(path).exists():
            pdfmetrics.registerFont(TTFont(name, path))
    pdfmetrics.registerFontFamily(
        "TimesNewRoman",
        normal="TimesNewRoman",
        bold="TimesNewRoman-Bold",
        italic="TimesNewRoman-Italic",
        boldItalic="TimesNewRoman-BoldItalic",
    )


def roman(number: int) -> str:
    values = ((1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"))
    out = []
    for value, symbol in values:
        while number >= value:
            out.append(symbol)
            number -= value
    return "".join(out)


class AcademicTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        self.body_start_page: int | None = None
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="academic")
        self.addPageTemplates(PageTemplate(id="all", frames=[frame], onPageEnd=self.draw_footer))

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            text = flowable.getPlainText().strip()
            if flowable.style.name == "Heading1Academic" and text.startswith("CHAPTER 1") and self.body_start_page is None:
                self.body_start_page = self.page

    def draw_footer(self, canvas, doc):
        page = canvas.getPageNumber()
        if page == 1:
            return
        canvas.saveState()
        canvas.setFont("TimesNewRoman", 9)
        if self.body_start_page is not None and page >= self.body_start_page:
            label = str(page - self.body_start_page + 1)
        else:
            label = roman(page - 1)
        canvas.drawCentredString(LETTER[0] / 2, 0.42 * inch, label)
        canvas.restoreState()


def styles():
    sample = getSampleStyleSheet()
    common = dict(fontName="TimesNewRoman", textColor=colors.black)
    return {
        "Normal": ParagraphStyle("NormalAcademic", parent=sample["BodyText"], fontSize=11.5, leading=17.25, alignment=TA_JUSTIFY, firstLineIndent=0.34 * inch, spaceAfter=6, **common),
        "Title": ParagraphStyle("TitleAcademic", parent=sample["Title"], fontName="TimesNewRoman-Bold", fontSize=18, leading=24, alignment=TA_CENTER, spaceBefore=18, spaceAfter=18, textColor=NAVY),
        "Cover Title": ParagraphStyle("CoverTitleAcademic", parent=sample["Title"], fontName="TimesNewRoman-Bold", fontSize=20, leading=27, alignment=TA_CENTER, spaceBefore=8, spaceAfter=18, textColor=NAVY),
        "Cover Meta": ParagraphStyle("CoverMetaAcademic", parent=sample["BodyText"], fontSize=12, leading=17, alignment=TA_CENTER, spaceAfter=8, **common),
        "Front Heading": ParagraphStyle("FrontHeadingAcademic", parent=sample["Heading1"], fontName="TimesNewRoman-Bold", fontSize=15, leading=20, alignment=TA_CENTER, spaceBefore=2, spaceAfter=18, textColor=colors.black),
        "Heading 1": ParagraphStyle("Heading1Academic", parent=sample["Heading1"], fontName="TimesNewRoman-Bold", fontSize=14, leading=20, alignment=TA_CENTER, spaceBefore=2, spaceAfter=14, keepWithNext=True, textColor=colors.black),
        "Heading 2": ParagraphStyle("Heading2Academic", parent=sample["Heading2"], fontName="TimesNewRoman-Bold", fontSize=11.5, leading=16, alignment=TA_LEFT, spaceBefore=11, spaceAfter=6, keepWithNext=True, textColor=colors.black),
        "Heading 3": ParagraphStyle("Heading3Academic", parent=sample["Heading3"], fontName="TimesNewRoman-Bold", fontSize=11.25, leading=15, alignment=TA_LEFT, spaceBefore=8, spaceAfter=5, keepWithNext=True, textColor=colors.black),
        "Caption Text": ParagraphStyle("CaptionAcademic", parent=sample["BodyText"], fontName="TimesNewRoman-Italic", fontSize=9.5, leading=12, alignment=TA_CENTER, spaceBefore=4, spaceAfter=6, keepWithNext=True, textColor=colors.black),
        "Contents Line": ParagraphStyle("ContentsAcademic", parent=sample["BodyText"], fontSize=10.2, leading=13.2, alignment=TA_LEFT, spaceAfter=3, **common),
        "List Bullet": ParagraphStyle("ListBulletAcademic", parent=sample["BodyText"], fontSize=10.8, leading=14.5, leftIndent=0.28 * inch, firstLineIndent=-0.16 * inch, bulletIndent=0.08 * inch, spaceAfter=3, **common),
        "List Number": ParagraphStyle("ListNumberAcademic", parent=sample["BodyText"], fontSize=10.8, leading=14.5, leftIndent=0.32 * inch, firstLineIndent=-0.2 * inch, spaceAfter=3, **common),
    }


def iter_block_items(document: Document):
    for child in document.element.body.iterchildren():
        if child.tag.endswith("}p"):
            yield DocxParagraph(child, document)
        elif child.tag.endswith("}tbl"):
            yield DocxTable(child, document)


def xml_page_break(paragraph: DocxParagraph) -> bool:
    return bool(paragraph._p.xpath('.//w:br[@w:type="page"]'))


def xml_section_break(paragraph: DocxParagraph) -> bool:
    return bool(paragraph._p.xpath("./w:pPr/w:sectPr"))


def escape_text(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return text.replace("\n", "<br/>")


def paragraph_alignment(paragraph: DocxParagraph, default: int) -> int:
    value = paragraph.alignment
    if value is None:
        return default
    name = str(value)
    if "CENTER" in name:
        return TA_CENTER
    if "JUSTIFY" in name:
        return TA_JUSTIFY
    return TA_LEFT


def image_flowables(paragraph: DocxParagraph, document: Document, temp_dir: Path):
    result = []
    for index, blip in enumerate(paragraph._p.xpath(".//a:blip")):
        rel_id = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
        if not rel_id or rel_id not in document.part.related_parts:
            continue
        part = document.part.related_parts[rel_id]
        suffix = Path(str(part.partname)).suffix or ".png"
        target = temp_dir / f"image-{abs(hash(rel_id))}-{index}{suffix}"
        target.write_bytes(part.blob)
        width = 6.35 * inch
        try:
            from PIL import Image as PILImage
            with PILImage.open(target) as img:
                ratio = img.height / max(img.width, 1)
            height = width * ratio
        except Exception:
            height = 3.6 * inch
        if height > 6.4 * inch:
            height = 6.4 * inch
            width = height / max(ratio, 0.01)
        result.append(Image(str(target), width=width, height=height, hAlign="CENTER"))
    return result


def table_widths(column_count: int):
    total = 6.6 * inch
    if column_count == 1:
        return [total]
    if column_count == 2:
        return [2.15 * inch, 4.45 * inch]
    if column_count == 3:
        return [1.45 * inch, 2.65 * inch, 2.5 * inch]
    if column_count == 4:
        return [total / 4] * 4
    if column_count == 5:
        return [1.65 * inch, 1.25 * inch, 1.2 * inch, 1.2 * inch, 1.3 * inch]
    return [total / column_count] * column_count


def table_flowable(table: DocxTable, paragraph_styles) -> Table:
    raw_rows = []
    tiny = ParagraphStyle("TableCell", parent=paragraph_styles["Normal"], fontName="TimesNewRoman", fontSize=7.7, leading=9.6, firstLineIndent=0, alignment=TA_LEFT, spaceAfter=0)
    tiny_head = ParagraphStyle("TableHead", parent=tiny, fontName="TimesNewRoman-Bold", textColor=colors.white, alignment=TA_CENTER)
    for row in table.rows:
        raw_values = []
        for cell in row.cells:
            text = " ".join(p.text.strip() for p in cell.paragraphs if p.text.strip())
            raw_values.append(text)
        raw_rows.append(raw_values)
    is_signature = len(raw_rows) == 1 and any("____" in value for value in raw_rows[0])
    is_code_block = len(raw_rows) == 1 and len(raw_rows[0]) == 1
    has_header = not is_signature and not is_code_block
    rows = []
    for row_index, raw_values in enumerate(raw_rows):
        cell_style = tiny_head if has_header and row_index == 0 else tiny
        rows.append([Paragraph(escape_text(text), cell_style) for text in raw_values])
    if not rows:
        rows = [[Paragraph("", tiny)]]
    flow = Table(rows, colWidths=table_widths(len(rows[0])), repeatRows=1 if has_header else 0, hAlign="CENTER")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if has_header:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#64748B")),
        ])
    elif is_code_block:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GRAY),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#64748B")),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.black),
        ])
    else:
        commands.extend([
            ("LINEABOVE", (0, 0), (-1, 0), 0, colors.white),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.black),
        ])
    for row_index in range(2, len(rows), 2):
        commands.append(("BACKGROUND", (0, row_index), (-1, row_index), LIGHT_GRAY))
    flow.setStyle(TableStyle(commands))
    return flow


def build_pdf(docx_path: Path, pdf_path: Path) -> None:
    register_fonts()
    document = Document(docx_path)
    paragraph_styles = styles()
    story = []
    list_number = 0
    with tempfile.TemporaryDirectory(prefix="learnpath-report-") as tmp:
        temp_dir = Path(tmp)
        pending_page_break = False
        for block in iter_block_items(document):
            if isinstance(block, DocxParagraph):
                if xml_section_break(block) and story and not isinstance(story[-1], PageBreak):
                    pending_page_break = True
                if xml_page_break(block):
                    if story and not isinstance(story[-1], PageBreak):
                        story.append(PageBreak())
                    pending_page_break = False
                images = image_flowables(block, document, temp_dir)
                if pending_page_break and (block.text.strip() or images):
                    if story and not isinstance(story[-1], PageBreak):
                        story.append(PageBreak())
                    pending_page_break = False
                story.extend(images)
                text = block.text.strip()
                if not text:
                    continue
                style_name = block.style.name if block.style else "Normal"
                chosen = paragraph_styles.get(style_name, paragraph_styles["Normal"])
                if style_name == "List Bullet":
                    story.append(Paragraph(escape_text(text), chosen, bulletText="•"))
                    continue
                if style_name == "List Number":
                    list_number += 1
                    story.append(Paragraph(escape_text(text), chosen, bulletText=f"{list_number}."))
                    continue
                if style_name not in ("List Number",):
                    list_number = 0
                if paragraph_alignment(block, chosen.alignment) != chosen.alignment:
                    chosen = ParagraphStyle(chosen.name + str(len(story)), parent=chosen, alignment=paragraph_alignment(block, chosen.alignment))
                story.append(Paragraph(escape_text(text), chosen))
            else:
                story.append(table_flowable(block, paragraph_styles))
                story.append(Spacer(1, 6))

        while story and isinstance(story[-1], PageBreak):
            story.pop()
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        report = AcademicTemplate(
            str(pdf_path),
            pagesize=LETTER,
            leftMargin=1.0 * inch,
            rightMargin=0.8 * inch,
            topMargin=0.78 * inch,
            bottomMargin=0.68 * inch,
            title="LearnPath Final Project Report",
            author="LearnPath Project Team",
            subject="Adaptive learning, knowledge graph, diagnostics, machine learning, and dynamic learning paths",
        )
        report.build(story)
    print(pdf_path.resolve())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("docx", type=Path)
    parser.add_argument("pdf", type=Path)
    args = parser.parse_args()
    build_pdf(args.docx.resolve(), args.pdf.resolve())


if __name__ == "__main__":
    main()
