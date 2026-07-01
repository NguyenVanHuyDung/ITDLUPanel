#!/usr/bin/env python3
"""
ITDLUPanel Slides PDF Generator - Enhanced Version
Converts Markdown slides to PDF using WeasyPrint with professional styling
"""

import markdown
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration
import os

# Professional CSS styling for slides
SLIDE_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@page {
    size: A4 landscape;
    margin: 0;
    @bottom-center {
        content: counter(page);
        font-size: 10pt;
        color: #64748B;
    }
}

* {
    box-sizing: border-box;
}

body {
    font-family: 'Inter', 'DejaVu Sans', Arial, sans-serif;
    font-size: 12pt;
    line-height: 1.5;
    margin: 0;
    padding: 0;
    color: #1A1A2E;
}

.slide {
    page-break-after: always;
    width: 100%;
    height: 100vh;
    padding: 50px 60px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%);
    color: white;
    position: relative;
}

.slide::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 8px;
    background: linear-gradient(90deg, #0288D1, #2E7D32, #1565C0);
}

.slide.light {
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    color: #1A1A2E;
}

.slide.light::before {
    background: linear-gradient(90deg, #1565C0, #0288D1);
}

.slide.dark {
    background: linear-gradient(135deg, #1B2A4A 0%, #0f172a 100%);
}

.slide h1 {
    font-size: 36pt;
    font-weight: 700;
    margin: 0 0 25px 0;
    text-align: center;
    color: inherit;
    line-height: 1.2;
}

.slide h2 {
    font-size: 28pt;
    font-weight: 600;
    margin: 0 0 30px 0;
    text-align: center;
    color: inherit;
    border-bottom: 3px solid rgba(255,255,255,0.3);
    padding-bottom: 15px;
}

.light .slide h2 {
    border-bottom-color: rgba(21, 101, 192, 0.3);
}

.slide h3 {
    font-size: 18pt;
    font-weight: 600;
    margin: 20px 0 15px 0;
    color: #0288D1;
}

.light .slide h3 {
    color: #1565C0;
}

.slide p {
    font-size: 14pt;
    margin: 12px 0;
    color: inherit;
}

.slide ul, .slide ol {
    font-size: 14pt;
    margin: 15px 0;
    padding-left: 35px;
}

.slide li {
    margin: 10px 0;
    padding-left: 8px;
}

.slide ul li::marker {
    color: #0288D1;
}

.slide table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
    font-size: 11pt;
    border-radius: 8px;
    overflow: hidden;
}

.slide th, .slide td {
    border: none;
    padding: 12px 15px;
    text-align: left;
}

.light .slide th, .light .slide td {
    border: 1px solid #e2e8f0;
}

.slide th {
    background: rgba(0,0,0,0.3);
    font-weight: 600;
    color: white;
}

.light .slide th {
    background: #1565C0;
    color: white;
}

.slide td {
    background: rgba(255,255,255,0.1);
}

.light .slide td {
    background: white;
}

.slide tr:nth-child(even) td {
    background: rgba(255,255,255,0.05);
}

.light .slide tr:nth-child(even) td {
    background: #f8fafc;
}

.slide code {
    font-family: 'JetBrains Mono', 'DejaVu Sans Mono', monospace;
    background: rgba(0,0,0,0.2);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10pt;
}

.light .slide code {
    background: #e2e8f0;
    color: #1565C0;
}

.slide pre {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 20px;
    border-radius: 8px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'JetBrains Mono', 'DejaVu Sans Mono', monospace;
    font-size: 10pt;
    line-height: 1.6;
    margin: 15px 0;
}

.light .slide pre {
    background: #1e1e1e;
    color: #d4d4d4;
}

.slide blockquote {
    border-left: 4px solid #0288D1;
    padding-left: 20px;
    margin: 20px 0;
    font-style: italic;
    background: rgba(255,255,255,0.1);
    padding: 15px 20px;
    border-radius: 0 8px 8px 0;
}

.light .slide blockquote {
    background: white;
    border-left-color: #1565C0;
}

.slide .highlight-box {
    background: rgba(255,255,255,0.15);
    padding: 25px;
    border-radius: 12px;
    margin: 20px 0;
    border: 1px solid rgba(255,255,255,0.2);
}

.light .slide .highlight-box {
    background: white;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}

.slide .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin: 20px 0;
}

.slide .grid-item {
    background: rgba(255,255,255,0.1);
    padding: 20px;
    border-radius: 10px;
    text-align: center;
    transition: transform 0.2s;
}

.light .slide .grid-item {
    background: white;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.slide .logo {
    font-size: 52pt;
    font-weight: 700;
    text-align: center;
    margin-bottom: 25px;
    color: white;
}

.slide .footer {
    margin-top: auto;
    padding-top: 20px;
    text-align: center;
    font-size: 11pt;
    opacity: 0.9;
    border-top: 1px solid rgba(255,255,255,0.2);
}

.light .slide .footer {
    border-top-color: #e2e8f0;
    color: #64748B;
}

.slide .title-slide {
    justify-content: center;
    align-items: center;
    text-align: center;
}

.slide .title-slide h1 {
    font-size: 44pt;
    margin-bottom: 15px;
}

.slide .title-slide p {
    font-size: 18pt;
    opacity: 0.9;
}

/* Badges */
.slide strong {
    color: #0288D1;
}

.light .slide strong {
    color: #1565C0;
}

/* Emoji styling */
.slide img {
    max-width: 100%;
    height: auto;
}

/* Checkbox styling */
.slide input[type="checkbox"] {
    margin-right: 10px;
}
"""

def markdown_to_html(md_content):
    """Convert markdown to HTML with extensions"""
    return markdown.markdown(
        md_content,
        extensions=['tables', 'fenced_code', 'codehilite', 'nl2br']
    )

def process_slides(content):
    """Split content into individual slides and wrap each in HTML"""
    slides_html = []
    parts = content.split('\n---\n')
    
    # Color schemes for different slide types
    schemes = ['slide', 'slide light', 'slide dark']
    
    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue
        
        # Convert markdown to HTML
        part_html = markdown.markdown(
            part,
            extensions=['tables', 'fenced_code', 'codehilite', 'nl2br']
        )
        
        # Detect slide type
        is_title = '## Slide 1:' in part or (part.startswith('# ITDLUPanel') and i == 0)
        
        # Alternate color schemes (excluding title slide)
        if is_title:
            slide_class = "slide"
        else:
            scheme_idx = (i - 1) % len(schemes)
            slide_class = schemes[scheme_idx]
        
        # Add title class if it's a title slide
        if is_title and i == 0:
            slide_html = f'<div class="slide title-slide">{part_html}</div>'
        else:
            slide_html = f'<div class="{slide_class}">{part_html}</div>'
        
        slides_html.append(slide_html)
    
    return '\n'.join(slides_html)

def create_full_html(slides_content):
    """Create full HTML document with slides"""
    slides_html = process_slides(slides_content)
    
    html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ITDLUPanel - Bảng Điều Khiển Quản Lý Máy Chủ Linux</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
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
    
    # Configure font
    font_config = FontConfiguration()
    
    print(f"Generating PDF: {pdf_path}")
    HTML(string=html_content).write_pdf(pdf_path, font_config=font_config)
    
    print(f"PDF generated successfully: {pdf_path}")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    md_path = os.path.join(script_dir, "01-introduction.md")
    pdf_path = os.path.join(script_dir, "01-introduction.pdf")
    
    generate_pdf(md_path, pdf_path)
