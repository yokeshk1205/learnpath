from __future__ import annotations

import html
import shutil
import sys
import zipfile
from pathlib import Path

from lxml import etree


NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
}

CSS = """
@page { size: Letter; margin: 0.62in 0.67in 0.67in; @bottom-center { content: counter(page); font: 8pt 'Times New Roman'; } }
* { box-sizing: border-box; }
body { margin: 0; color: #000; font-family: 'Times New Roman', serif; font-size: 9.6pt; line-height: 1.0; }
.front { width: 100%; }
.columns { column-count: 2; column-gap: 0.208in; column-fill: balance; }
h1 { font-size: 10pt; font-weight: 400; text-align: center; margin: 6pt 0 3pt; break-after: avoid; }
h2 { font-size: 9.6pt; font-weight: 400; font-style: italic; margin: 4pt 0 2pt; break-after: avoid; }
p { margin: 0 0 2.2pt; text-align: justify; text-indent: 0.15in; orphans: 2; widows: 2; }
.title { font-size: 20pt; line-height: 1.05; text-align: center; text-indent: 0; margin: 0 0 7pt; }
.center { text-align: center; text-indent: 0; }
.caption { font-size: 8pt; text-align: center; text-indent: 0; margin: 1pt 0 4pt; break-before: avoid; }
.list { margin: 0 0 1.4pt 0.17in; text-indent: -0.12in; font-size: 9.3pt; }
.section-break { height: 0; margin: 0; padding: 0; }
img { display: block; max-width: 100%; height: auto; object-fit: contain; margin: 3pt auto 1pt; break-inside: avoid; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0 0 3pt; font-size: 6.8pt; break-inside: avoid; }
tr { break-inside: avoid; }
td { border: 0.5pt solid #d9d9d9; padding: 3pt 3.5pt; vertical-align: middle; overflow-wrap: anywhere; }
"""


def qn(prefix: str, local: str) -> str:
    return f"{{{NS[prefix]}}}{local}"


def paragraph_html(node, rels: dict[str, str]) -> str:
    style_nodes = node.xpath("./w:pPr/w:pStyle/@w:val", namespaces=NS)
    style = style_nodes[0] if style_nodes else ""
    align_nodes = node.xpath("./w:pPr/w:jc/@w:val", namespaces=NS)
    align = align_nodes[0] if align_nodes else ""
    is_list = bool(node.xpath("./w:pPr/w:numPr", namespaces=NS))
    text_value = "".join(node.xpath(".//w:t/text()", namespaces=NS))
    images = []
    for blip in node.xpath(".//a:blip", namespaces=NS):
        target = rels.get(blip.get(qn("r", "embed")))
        if target:
            name = Path(target).name
            extents = blip.xpath("ancestor::w:drawing[1]//wp:extent/@cx", namespaces=NS)
            width = f"{int(extents[0]) / 914400:.3f}in" if extents else "100%"
            images.append(f'<img src="media/{html.escape(name)}" style="width:{width}" alt="Embedded paper figure">')
    parts = list(images)
    if text_value.strip():
        safe = html.escape(text_value)
        if style == "Title":
            parts.append(f'<p class="title">{safe}</p>')
        elif style == "Heading1":
            parts.append(f"<h1>{safe}</h1>")
        elif style == "Heading2":
            parts.append(f"<h2>{safe}</h2>")
        elif style == "Caption":
            parts.append(f'<p class="caption">{safe}</p>')
        elif is_list:
            parts.append(f'<p class="list">&#8226; {safe}</p>')
        elif align == "center":
            parts.append(f'<p class="center">{safe}</p>')
        else:
            parts.append(f"<p>{safe}</p>")
    return "".join(parts)


def table_html(node) -> str:
    rows = []
    for row in node.xpath("./w:tr", namespaces=NS):
        cells = []
        for cell in row.xpath("./w:tc", namespaces=NS):
            text = " ".join(value.strip() for value in cell.xpath(".//w:t/text()", namespaces=NS) if value.strip())
            fills = cell.xpath("./w:tcPr/w:shd/@w:fill", namespaces=NS)
            style = f' style="background:#{fills[0]}"' if fills else ""
            cells.append(f"<td{style}>{html.escape(text)}</td>")
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return "<table>" + "".join(rows) + "</table>"


def build(docx: Path, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    media_dir = output_dir / "media"
    media_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(docx) as archive:
        xml = etree.fromstring(archive.read("word/document.xml"))
        rel_xml = etree.fromstring(archive.read("word/_rels/document.xml.rels"))
        rels = {item.get("Id"): item.get("Target") for item in rel_xml if item.get("Target", "").startswith("media/")}
        for target in rels.values():
            with archive.open(f"word/{target}") as source, (media_dir / Path(target).name).open("wb") as destination:
                shutil.copyfileobj(source, destination)
    body = xml.find(qn("w", "body"))
    rendered = ["<div class='front'>"]
    in_columns = False
    for child in body:
        if child.tag == qn("w", "p"):
            rendered.append(paragraph_html(child, rels))
            if child.xpath("./w:pPr/w:sectPr", namespaces=NS) and not in_columns:
                rendered.append("</div><div class='columns'>")
                in_columns = True
        elif child.tag == qn("w", "tbl"):
            rendered.append(table_html(child))
    rendered.append("</div>")
    out = output_dir / "preview.html"
    out.write_text("<!doctype html><html><head><meta charset='utf-8'><style>" + CSS + "</style></head><body>" + "".join(rendered) + "</body></html>", encoding="utf-8")
    print(out)
    return out


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: ieee_docx_preview_html.py INPUT.docx OUTPUT_DIR")
    build(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
