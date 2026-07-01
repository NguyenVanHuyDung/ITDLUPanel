#!/usr/bin/env python3
"""
ITDLUPanel Slides PPTX Generator - Enhanced Version
Converts Markdown slides to PowerPoint with professional layout
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from pptx.oxml import parse_xml
import re
import os

# Color scheme - Professional ITDLU Panel colors
PRIMARY_COLOR = RGBColor(0x15, 0x65, 0xC0)  # #1565C0 - ITDLU Blue
SECONDARY_COLOR = RGBColor(0x2E, 0x7D, 0x32)  # #2E7D32 - Green
ACCENT_COLOR = RGBColor(0x02, 0x88, 0xD1)  # #0288D1 - Light Blue
DARK_COLOR = RGBColor(0x1B, 0x2A, 0x4A)  # #1B2A4A - Dark Navy
LIGHT_COLOR = RGBColor(0xF5, 0xF7, 0xFA)  # #F5F7FA - Light Gray
WHITE_COLOR = RGBColor(0xFF, 0xFF, 0xFF)
TEXT_COLOR = RGBColor(0x1A, 0x1A, 0x2E)  # #1A1A2E
TEXT_SECONDARY = RGBColor(0x64, 0x74, 0x8B)  # #64748B
CODE_BG = RGBColor(0x2D, 0x2D, 0x2D)  # Dark code background
SUCCESS_COLOR = RGBColor(0x22, 0xC5, 0x5E)  # Green for checkmarks
WARNING_COLOR = RGBColor(0xFF, 0xA5, 0x00)  # Orange warning
ERROR_COLOR = RGBColor(0xEF, 0x44, 0x44)  # Red error

def parse_markdown_slides(content):
    """Parse markdown content into individual slides"""
    slides = []
    parts = content.split('\n---\n')
    for part in parts:
        part = part.strip()
        if part:
            slides.append(part)
    return slides

def extract_title_and_content(slide_md):
    """Extract title and content from slide markdown"""
    lines = slide_md.split('\n')
    title = ""
    content_lines = []
    
    for line in lines:
        if line.startswith('# '):
            if not title:
                title = line[2:].strip()
        else:
            content_lines.append(line)
    
    return title, '\n'.join(content_lines)

def clean_text(text):
    """Remove markdown formatting"""
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'#\w+\s*', '', text)  # Remove emoji prefixes
    return text.strip()

def add_title_slide(prs, title, subtitle=""):
    """Add a professional title slide with gradient effect"""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)
    
    # Background gradient simulation with shapes
    bg = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0),
        prs.slide_width, prs.slide_height
    )
    bg.fill.solid()
    bg.fill.fore_color.rgb = PRIMARY_COLOR
    bg.line.fill.background()
    
    # Accent bar at bottom
    accent = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(6.8),
        prs.slide_width, Inches(0.7)
    )
    accent.fill.solid()
    accent.fill.fore_color.rgb = DARK_COLOR
    accent.line.fill.background()
    
    # Decorative element
    deco = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(2.2),
        Inches(0.3), Inches(1.5)
    )
    deco.fill.solid()
    deco.fill.fore_color.rgb = ACCENT_COLOR
    deco.line.fill.background()
    
    # Title
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(2), Inches(9), Inches(1.5))
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(42)
    p.font.bold = True
    p.font.color.rgb = WHITE_COLOR
    p.alignment = PP_ALIGN.CENTER
    
    # Subtitle
    if subtitle:
        sub_box = slide.shapes.add_textbox(Inches(0.5), Inches(3.8), Inches(9), Inches(1.5))
        tf = sub_box.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = subtitle
        p.font.size = Pt(22)
        p.font.color.rgb = RGBColor(0xCC, 0xDD, 0xFF)
        p.alignment = PP_ALIGN.CENTER
    
    # Footer
    footer = slide.shapes.add_textbox(Inches(0.5), Inches(6.9), Inches(9), Inches(0.5))
    tf = footer.text_frame
    p = tf.paragraphs[0]
    p.text = "Đại học Đà Lạt | © 2026"
    p.font.size = Pt(14)
    p.font.color.rgb = WHITE_COLOR
    p.alignment = PP_ALIGN.CENTER
    
    return slide

def add_content_slide(prs, title, content):
    """Add a content slide with professional layout"""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)
    
    # Header bar
    header = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0),
        prs.slide_width, Inches(1.1)
    )
    header.fill.solid()
    header.fill.fore_color.rgb = PRIMARY_COLOR
    header.line.fill.background()
    
    # Title in header
    title_box = slide.shapes.add_textbox(Inches(0.4), Inches(0.25), Inches(9.2), Inches(0.7))
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = WHITE_COLOR
    
    # Content area with sections
    lines = content.split('\n')
    
    # Parse into sections
    sections = []
    current_section = {"title": None, "items": [], "type": "bullet"}
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Code block marker
        if line.startswith('```'):
            continue
        
        # Section heading (###)
        if line.startswith('### '):
            if current_section["items"] or current_section["title"]:
                sections.append(current_section)
            current_section = {"title": clean_text(line[4:]), "items": [], "type": "bullet"}
        
        # Subsection (code block content)
        elif line.startswith('```'):
            current_section["type"] = "code"
        
        # Bullet point
        elif line.startswith('- ') or line.startswith('* '):
            text = clean_text(line[2:])
            if text:
                current_section["items"].append(text)
        
        # Sub bullet
        elif line.startswith('  - ') or line.startswith('    - '):
            text = clean_text(line[5:])
            if text:
                current_section["items"].append({"indent": 1, "text": text})
        
        # Checkbox
        elif line.startswith('- [ ] ') or line.startswith('- [x] '):
            is_checked = line.startswith('- [x]')
            text = clean_text(line[6:])
            if text:
                current_section["items"].append({"checked": is_checked, "text": text})
        
        # Regular paragraph
        else:
            text = clean_text(line)
            if text:
                current_section["items"].append(text)
    
    if current_section["items"] or current_section["title"]:
        sections.append(current_section)
    
    # Render content
    y_pos = Inches(1.35)
    max_height = Inches(5.8)
    
    for section in sections[:6]:  # Limit sections
        if y_pos > max_height:
            break
            
        if section["title"]:
            # Section title
            title_shape = slide.shapes.add_textbox(Inches(0.4), y_pos, Inches(9.2), Inches(0.4))
            tf = title_shape.text_frame
            p = tf.paragraphs[0]
            p.text = section["title"]
            p.font.size = Pt(16)
            p.font.bold = True
            p.font.color.rgb = ACCENT_COLOR
            y_pos += Inches(0.4)
        
        if section["type"] == "code":
            continue
        
        # Render items
        for item in section["items"][:8]:
            if y_pos > max_height:
                break
                
            if isinstance(item, dict):
                if "indent" in item:
                    # Sub bullet
                    text_shape = slide.shapes.add_textbox(Inches(0.9), y_pos, Inches(8.6), Inches(0.3))
                    tf = text_shape.text_frame
                    p = tf.paragraphs[0]
                    p.text = "    ◦ " + item["text"]
                    p.font.size = Pt(12)
                    p.font.color.rgb = TEXT_SECONDARY
                elif "checked" in item:
                    # Checkbox
                    text_shape = slide.shapes.add_textbox(Inches(0.5), y_pos, Inches(9), Inches(0.3))
                    tf = text_shape.text_frame
                    p = tf.paragraphs[0]
                    p.text = ("☑ " if item["checked"] else "☐ ") + item["text"]
                    p.font.size = Pt(13)
                    p.font.color.rgb = SUCCESS_COLOR if item["checked"] else TEXT_COLOR
            else:
                # Regular bullet
                text_shape = slide.shapes.add_textbox(Inches(0.5), y_pos, Inches(9), Inches(0.3))
                tf = text_shape.text_frame
                p = tf.paragraphs[0]
                p.text = "• " + item
                p.font.size = Pt(13)
                p.font.color.rgb = TEXT_COLOR
            
            y_pos += Inches(0.32)
        
        y_pos += Inches(0.15)
    
    return slide

def add_table_slide(prs, title, content):
    """Add a slide with professional table"""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)
    
    # Header bar
    header = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0),
        prs.slide_width, Inches(1.1)
    )
    header.fill.solid()
    header.fill.fore_color.rgb = PRIMARY_COLOR
    header.line.fill.background()
    
    # Title
    title_box = slide.shapes.add_textbox(Inches(0.4), Inches(0.25), Inches(9.2), Inches(0.7))
    tf = title_box.text_frame
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = WHITE_COLOR
    
    # Parse table
    lines = content.strip().split('\n')
    table_data = []
    headers = []
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('```'):
            continue
        
        if line.startswith('|'):
            cells = [c.strip() for c in line.split('|')[1:-1]]
            if '---' not in line:
                if not headers:
                    headers = cells
                else:
                    table_data.append(cells)
    
    if table_data and headers:
        rows = min(len(table_data) + 1, 12)
        cols = min(len(headers), 4)
        
        table = slide.shapes.add_table(
            rows, cols, 
            Inches(0.4), Inches(1.4), 
            Inches(9.2), Inches(4.5)
        ).table
        
        # Style header
        for j, header_text in enumerate(headers[:cols]):
            cell = table.cell(0, j)
            cell.text = clean_text(header_text)
            cell.fill.solid()
            cell.fill.fore_color.rgb = DARK_COLOR
            para = cell.text_frame.paragraphs[0]
            para.font.size = Pt(12)
            para.font.bold = True
            para.font.color.rgb = WHITE_COLOR
            para.alignment = PP_ALIGN.CENTER
            cell.text_frame.paragraphs[0].space_before = Pt(6)
            cell.text_frame.paragraphs[0].space_after = Pt(6)
        
        # Style data rows
        for i, row in enumerate(table_data[:rows-1]):
            for j, cell_text in enumerate(row[:cols]):
                cell = table.cell(i+1, j)
                cell.text = clean_text(cell_text)
                para = cell.text_frame.paragraphs[0]
                para.font.size = Pt(11)
                para.font.color.rgb = TEXT_COLOR
                para.space_before = Pt(4)
                para.space_after = Pt(4)
                
                # Alternating row colors
                if i % 2 == 0:
                    cell.fill.solid()
                    cell.fill.fore_color.rgb = LIGHT_COLOR
                else:
                    cell.fill.solid()
                    cell.fill.fore_color.rgb = WHITE_COLOR
    
    return slide

def add_code_slide(prs, title, code_content):
    """Add a slide with code block"""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)
    
    # Header bar (dark theme for code)
    header = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0),
        prs.slide_width, Inches(1.1)
    )
    header.fill.solid()
    header.fill.fore_color.rgb = DARK_COLOR
    header.line.fill.background()
    
    # Title
    title_box = slide.shapes.add_textbox(Inches(0.4), Inches(0.25), Inches(9.2), Inches(0.7))
    tf = title_box.text_frame
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = WHITE_COLOR
    
    # Code background
    code_bg = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches(0.3), Inches(1.3),
        Inches(9.4), Inches(5.4)
    )
    code_bg.fill.solid()
    code_bg.fill.fore_color.rgb = CODE_BG
    code_bg.line.fill.background()
    
    # Code text
    code_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(9), Inches(5))
    tf = code_box.text_frame
    tf.word_wrap = True
    
    # Parse code content
    code_lines = []
    in_code = False
    for line in code_content.split('\n'):
        if line.strip().startswith('```'):
            in_code = not in_code
            continue
        if in_code:
            code_lines.append(line)
    
    for i, line in enumerate(code_lines[:30]):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = line
        p.font.size = Pt(10)
        p.font.name = 'Courier New'
        p.font.color.rgb = RGBColor(0xD4, 0xD4, 0xD4)
    
    return slide

def generate_pptx(md_path, pptx_path):
    """Generate PPTX from markdown file"""
    print(f"Reading markdown from: {md_path}")
    
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
    
    # Create presentation
    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7.5)
    
    slides = parse_markdown_slides(md_content)
    print(f"Found {len(slides)} slides")
    
    for i, slide_md in enumerate(slides):
        print(f"Processing slide {i+1}/{len(slides)}...")
        
        title, content = extract_title_and_content(slide_md)
        
        if not title and not content:
            continue
        
        # Determine slide type
        content_lines = [l for l in content.split('\n') if l.strip() and not l.strip().startswith('#')]
        
        # Title slide detection
        if len(content_lines) <= 2 and title and i == 0:
            add_title_slide(prs, title, content)
        elif '```' in content or content.startswith('```'):
            add_code_slide(prs, title or "Code", content)
        elif content.strip().startswith('|') and '|' in content:
            add_table_slide(prs, title, content)
        else:
            add_content_slide(prs, title, content)
    
    print(f"Saving PPTX: {pptx_path}")
    prs.save(pptx_path)
    print(f"PPTX generated successfully: {pptx_path}")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    md_path = os.path.join(script_dir, "01-introduction.md")
    pptx_path = os.path.join(script_dir, "01-introduction.pptx")
    
    generate_pptx(md_path, pptx_path)
