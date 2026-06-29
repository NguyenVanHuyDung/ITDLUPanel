#!/usr/bin/env python3
"""
ITDLUPanel Slides PDF Generator
Converts Markdown slides to PDF using WeasyPrint
"""

import markdown
from weasyprint import HTML, CSS
import os

# Slide template with professional styling
SLIDE_CSS = """
@page {
    size: A4 landscape;
    margin: 0;
}

body {
    font-family: 'DejaVu Sans', Arial, sans-serif;
    font-size: 14pt;
    line-height: 1.6;
    margin: 0;
    padding: 0;
}

.slide {
    page-break-after: always;
    width: 100%;
    height: 100vh;
    padding: 40px 50px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.slide.light {
    background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    color: #1a1a2e;
}

h1 {
    font-size: 32pt;
    font-weight: bold;
    margin: 0 0 20px 0;
    text-align: center;
    color: inherit;
}

h2 {
    font-size: 26pt;
    font-weight: bold;
    margin: 0 0 30px 0;
    text-align: center;
    color: inherit;
}

h3 {
    font-size: 20pt;
    font-weight: bold;
    margin: 15px 0;
}

p {
    font-size: 16pt;
    margin: 10px 0;
}

ul, ol {
    font-size: 14pt;
    margin: 10px 0;
    padding-left: 30px;
}

li {
    margin: 8px 0;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 15px 0;
    font-size: 12pt;
}

th, td {
    border: 1px solid rgba(255,255,255,0.3);
    padding: 8px 12px;
    text-align: left;
}

.light th, .light td {
    border: 1px solid rgba(0,0,0,0.2);
}

th {
    background: rgba(0,0,0,0.2);
    font-weight: bold;
}

code, pre {
    font-family: 'DejaVu Sans Mono', monospace;
    background: rgba(0,0,0,0.2);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11pt;
}

pre {
    padding: 15px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
}

blockquote {
    border-left: 4px solid rgba(255,255,255,0.5);
    padding-left: 20px;
    margin: 15px 0;
    font-style: italic;
}

.center {
    text-align: center;
}

.highlight-box {
    background: rgba(255,255,255,0.15);
    padding: 20px;
    border-radius: 10px;
    margin: 15px 0;
}

.light .highlight-box {
    background: rgba(255,255,255,0.8);
    color: #1a1a2e;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin: 15px 0;
}

.grid-item {
    background: rgba(255,255,255,0.1);
    padding: 15px;
    border-radius: 8px;
    text-align: center;
}

.light .grid-item {
    background: rgba(255,255,255,0.6);
}

.logo {
    font-size: 48pt;
    font-weight: bold;
    text-align: center;
    margin-bottom: 20px;
}

.footer {
    margin-top: auto;
    text-align: center;
    font-size: 10pt;
    opacity: 0.8;
}
"""

def markdown_to_html(md_content):
    """Convert markdown to HTML"""
    html = markdown.markdown(
        md_content,
        extensions=['tables', 'fenced_code', 'codehilite']
    )
    return html

def process_slides(content):
    """Split content into individual slides and wrap each in HTML"""
    slides_html = []
    parts = content.split('\n---\n')
    
    for i, part in enumerate(parts):
        # Convert markdown to HTML
        part_html = markdown.markdown(
            part.strip(),
            extensions=['tables', 'fenced_code', 'codehilite']
        )
        
        # Wrap in slide div
        # Alternate between gradient styles
        slide_class = "slide" if i % 2 == 0 else "slide light"
        
        slides_html.append(f'<div class="{slide_class}">{part_html}</div>')
    
    return '\n'.join(slides_html)

def create_full_html(slides_content):
    """Create full HTML document with slides"""
    slides_html = process_slides(slides_content)
    
    html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ITDLUPanel - Giới Thiệu</title>
    <style>
        {SLIDE_CSS}
    </style>
</head>
<body>
{slides_html}
</body>
</html>"""
    return html

def generate_pdf(md_path, pdf_path):
    """Generate PDF from markdown file"""
    print(f"Reading markdown from: {md_path}")
    
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
    
    print("Converting to HTML...")
    html_content = create_full_html(md_content)
    
    print(f"Generating PDF: {pdf_path}")
    HTML(string=html_content).write_pdf(pdf_path)
    
    print(f"PDF generated successfully: {pdf_path}")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    md_path = os.path.join(script_dir, "01-introduction.md")
    pdf_path = os.path.join(script_dir, "01-introduction.pdf")
    
    generate_pdf(md_path, pdf_path)
