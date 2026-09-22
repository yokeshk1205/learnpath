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
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}


CSS = """
@page { size: Letter; margin: 0.62in 0.72in; }
* { box-sizing: border-box; }
body { margin: 0; color: #111827; font-family: Aptos, 'Segoe UI', Arial, sans-serif; font-size: 9.2pt; line-height: 1.08; }
h1, h2, h3 { color: #111827; margin: 8pt 0 4pt; break-after: avoid-page; }
h1 { font-size: 21pt; } h2 { font-size: 14pt; } h3 { font-size: 11pt; }
p { margin: 0 0 5pt; orphans: 2; widows: 2; }
.title { font-size: 34pt; font-weight: 700; line-height: 1.05; }
.list { padding-left: 15pt; }
.page-break { break-before: page; height: 0; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0 0 6pt; font-size: 8.2pt; break-inside: auto; }
tr { break-inside: avoid; }
td { border: 0.6pt solid #cbd5e1; padding: 4.5pt 5.5pt; vertical-align: middle; overflow-wrap: anywhere; }
img { display: block; max-width: 100%; max-height: 7.4in; object-fit: contain; margin: 5pt auto 3pt; }
header { position: fixed; top: -0.35in; right: 0; font-size: 7.5pt; font-weight: 700; color: #475569; }
footer { position: fixed; bottom: -0.35in; left: 0; right: 0; text-align: center; font-size: 7.5pt; color: #475569; }
"""


def qname(prefix: str, local: str) -> str:
    return f"{{{NS[prefix]}}}{local}"


def paragraph_html(node, rels: dict[str, str], media_dir: Path) -> str:
    brs = node.xpath(".//w:br[@w:type='page']", namespaces=NS)
    style_nodes = node.xpath("./w:pPr/w:pStyle/@w:val", namespaces=NS)
    style = style_nodes[0] if style_nodes else ""
    is_list = bool(node.xpath("./w:pPr/w:numPr", namespaces=NS))
    texts = node.xpath(".//w:t/text()", namespaces=NS)
    text_value = "".join(texts)
    images = []
    for blip in node.xpath(".//a:blip", namespaces=NS):
        rid = blip.get(qname("r", "embed"))
        target = rels.get(rid)
        if target:
            name = Path(target).name
            extents = blip.xpath("ancestor::w:drawing[1]//wp:extent/@cx", namespaces=NS)
            width = f"{int(extents[0]) / 914400:.3f}in" if extents else "100%"
            images.append(f'<img src="media/{html.escape(name)}" style="width:{width}" alt="Embedded report figure">')
    parts = []
    if brs:
        parts.append('<div class="page-break"></div>')
    if images:
        parts.extend(images)
    if not text_value.strip():
        return "".join(parts)
    safe = html.escape(text_value).replace("\n", "<br>")
    if style == "Title":
        parts.append(f'<p class="title">{safe}</p>')
    elif style == "Heading1":
        parts.append(f"<h1>{safe}</h1>")
    elif style == "Heading2":
        parts.append(f"<h2>{safe}</h2>")
    elif style == "Heading3":
        parts.append(f"<h3>{safe}</h3>")
    elif is_list:
        parts.append(f'<p class="list">• {safe}</p>')
    else:
        parts.append(f"<p>{safe}</p>")
    return "".join(parts)


def table_html(node) -> str:
    rows_html = []
    for row in node.xpath("./w:tr", namespaces=NS):
        cells_html = []
        for cell in row.xpath("./w:tc", namespaces=NS):
            text_value = " ".join(t.strip() for t in cell.xpath(".//w:t/text()", namespaces=NS) if t.strip())
            fills = cell.xpath("./w:tcPr/w:shd/@w:fill", namespaces=NS)
            style = f' style="background:#{fills[0]}"' if fills else ""
            cells_html.append(f"<td{style}>{html.escape(text_value)}</td>")
        rows_html.append("<tr>" + "".join(cells_html) + "</tr>")
    return "<table>" + "".join(rows_html) + "</table>"


def build_preview(docx_path: Path, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    media_dir = output_dir / "media"
    media_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(docx_path) as archive:
        document_xml = etree.fromstring(archive.read("word/document.xml"))
        rels_xml = etree.fromstring(archive.read("word/_rels/document.xml.rels"))
        rels = {
            item.get("Id"): item.get("Target")
            for item in rels_xml
            if item.get("Target", "").startswith("media/")
        }
        for target in rels.values():
            name = Path(target).name
            with archive.open(f"word/{target}") as source, (media_dir / name).open("wb") as dest:
                shutil.copyfileobj(source, dest)

    body = document_xml.find(qname("w", "body"))
    rendered = []
    for child in body:
        if child.tag == qname("w", "p"):
            rendered.append(paragraph_html(child, rels, media_dir))
        elif child.tag == qname("w", "tbl"):
            rendered.append(table_html(child))
    output = output_dir / "preview.html"
    output.write_text(
        "<!doctype html><html><head><meta charset='utf-8'><style>" + CSS + "</style></head><body>"
        "<header>LEARNPATH | TECHNICAL PROJECT REPORT</header>"
        "<footer>LearnPath • Panel evaluation edition</footer>"
        + "".join(rendered)
        + "</body></html>",
        encoding="utf-8",
    )
    print(output)
    return output


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: docx_preview_html.py INPUT.docx OUTPUT_DIR")
    build_preview(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
