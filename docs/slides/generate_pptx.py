#!/usr/bin/env python3
"""
ITDLUPanel Slides PPTX Generator
Converts Markdown slides to PowerPoint using python-pptx
"""

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import re
import os

# Color scheme
PRIMARY_COLOR = RGBColor(0x15, 0x65, 0xC0)  # #1565C0
SECONDARY_COLOR = RGBColor(0x2E, 0x7D, 0x32)  # #2E7D32
ACCENT_COLOR = RGBColor(0x02, 0x88, 0xD1)  # #0288D1
DARK_COLOR = RGBColor(0x1B, 0x2A, 0x4A)  # #1B2A4A
LIGHT_COLOR = RGBColor(0xF5, 0xF7, 0xFA)  # #F5F7FA
WHITE_COLOR = RGBColor(0xFF, 0xFF, 0xFF)
TEXT_COLOR = RGBColor(0x1A, 0x1A, 0x2E)  # #1A1A2E
TEXT_SECONDARY = RGBColor(0x64, 0x74, 0x8B)  # #64748B

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
    in_code_block = False
    
    for line in lines:
        # Skip markdown headers for content (we extract them)
        if line.startswith('# '):
            if not title:
                title = line[2:].strip()
        else:
            content_lines.append(line)
    
    return title, '\n'.join(content_lines)

def add_title_slide(prs, title, subtitle=""):
    """Add a title slide"""
    slide_layout = prs.slide_layouts[6]  # Blank layout
    slide = prs.slides.add_slide(slide_layout)
    
    # Background shape
    bg_shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0),
        prs.slide_width, prs.slide_height
    )
    bg_shape.fill.solid()
    bg_shape.fill.fore_color.rgb = PRIMARY_COLOR
    bg_shape.line.fill.background()
    
    # Title
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(2.5), Inches(9), Inches(1.5))
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(44)
    p.font.bold = True
    p.font.color.rgb = WHITE_COLOR
    p.alignment = PP_ALIGN.CENTER
    
    # Subtitle
    if subtitle:
        sub_box = slide.shapes.add_textbox(Inches(0.5), Inches(4.2), Inches(9), Inches(1))
        tf = sub_box.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = subtitle
        p.font.size = Pt(24)
        p.font.color.rgb = WHITE_COLOR
        p.alignment = PP_ALIGN.CENTER
    
    return slide

def add_content_slide(prs, title, content):
    """Add a content slide with title and bullet points"""
    slide_layout = prs.slide_layouts[6]  # Blank layout
    slide = prs.slides.add_slide(slide_layout)
    
    # Header bar
    header = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0),
        prs.slide_width, Inches(1.2)
    )
    header.fill.solid()
    header.fill.fore_color.rgb = PRIMARY_COLOR
    header.line.fill.background()
    
    # Title in header
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.7))
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(28)
    p.font.bold = True
    p.font.color.rgb = WHITE_COLOR
    
    # Content area
    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(9), Inches(5.5))
    tf = content_box.text_frame
    tf.word_wrap = True
    
    lines = content.split('\n')
    first_para = True
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Code block
        if line.startswith('```'):
            continue
        
        # Heading 2
        if line.startswith('## '):
            heading_text = line[3:].strip()
            if first_para:
                p = tf.paragraphs[0]
                first_para = False
            else:
                p = tf.add_paragraph()
            p.text = heading_text
            p.font.size = Pt(20)
            p.font.bold = True
            p.font.color.rgb = PRIMARY_COLOR
            p.space_before = Pt(16)
            p.space_after = Pt(8)
        
        # Heading 3
        elif line.startswith('### '):
            heading_text = line[4:].strip()
            p = tf.add_paragraph()
            p.text = heading_text
            p.font.size = Pt(16)
            p.font.bold = True
            p.font.color.rgb = ACCENT_COLOR
            p.space_before = Pt(12)
            p.space_after = Pt(4)
        
        # Bullet point
        elif line.startswith('- ') or line.startswith('* '):
            text = line[2:].strip()
            p = tf.add_paragraph()
            p.text = "• " + text
            p.font.size = Pt(14)
            p.font.color.rgb = TEXT_COLOR
            p.level = 0
            p.space_before = Pt(4)
        
        # Sub bullet
        elif line.startswith('  - ') or line.startswith('    - '):
            text = line[5:].strip()
            p = tf.add_paragraph()
            p.text = "  ◦ " + text
            p.font.size = Pt(12)
            p.font.color.rgb = TEXT_SECONDARY
            p.level = 1
            p.space_before = Pt(2)
        
        # Checkbox
        elif line.startswith('- [ ] ') or line.startswith('- [x] '):
            text = line[6:].strip()
            prefix = "☐ " if line.startswith('- [ ]') else "☑ "
            p = tf.add_paragraph()
            p.text = prefix + text
            p.font.size = Pt(14)
            p.font.color.rgb = TEXT_COLOR
            p.space_before = Pt(4)
        
        # Regular text
        else:
            # Remove markdown formatting
            text = re.sub(r'\*\*([^*]+)\*\*', r'\1', line)  # Bold
            text = re.sub(r'\*([^*]+)\*', r'\1', text)  # Italic
            text = re.sub(r'`([^`]+)`', r'\1', text)  # Inline code
            
            p = tf.add_paragraph()
            p.text = text
            p.font.size = Pt(14)
            p.font.color.rgb = TEXT_COLOR
            p.space_before = Pt(4)
    
    return slide

def add_table_slide(prs, title, table_content):
    """Add a slide with table"""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)
    
    # Header bar
    header = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0),
        prs.slide_width, Inches(1.2)
    )
    header.fill.solid()
    header.fill.fore_color.rgb = PRIMARY_COLOR
    header.line.fill.background()
    
    # Title
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.7))
    tf = title_box.text_frame
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(28)
    p.font.bold = True
    p.font.color.rgb = WHITE_COLOR
    
    # Parse table
    lines = table_content.strip().split('\n')
    table_data = []
    headers = []
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        
        if line.startswith('|'):
            # Parse table row
            cells = [c.strip() for c in line.split('|')[1:-1]]
            if i == 0 or (i > 0 and '---' not in line):
                if '---' not in line:
                    if not headers:
                        headers = cells
                    else:
                        table_data.append(cells)
    
    if table_data:
        rows = len(table_data) + 1
        cols = len(headers) if headers else 3
        
        # Limit columns for readability
        cols = min(cols, 5)
        
        table = slide.shapes.add_table(rows, cols, Inches(0.5), Inches(1.6), 
                                        Inches(9), Inches(4)).table
        
        # Header row
        for j, header_text in enumerate(headers[:cols]):
            cell = table.cell(0, j)
            cell.text = header_text
            cell.fill.solid()
            cell.fill.fore_color.rgb = DARK_COLOR
            para = cell.text_frame.paragraphs[0]
            para.font.size = Pt(12)
            para.font.bold = True
            para.font.color.rgb = WHITE_COLOR
            para.alignment = PP_ALIGN.CENTER
        
        # Data rows
        for i, row in enumerate(table_data[:rows-1]):
            for j, cell_text in enumerate(row[:cols]):
                cell = table.cell(i+1, j)
                cell.text = cell_text
                para = cell.text_frame.paragraphs[0]
                para.font.size = Pt(11)
                para.font.color.rgb = TEXT_COLOR
                # Alternate row colors
                if i % 2 == 0:
                    cell.fill.solid()
                    cell.fill.fore_color.rgb = RGBColor(0xF5, 0xF7, 0xFA)
    
    return slide

def add_code_slide(prs, title, code_content):
    """Add a slide with code block"""
    slide_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(slide_layout)
    
    # Header bar
    header = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0), Inches(0),
        prs.slide_width, Inches(1.2)
    )
    header.fill.solid()
    header.fill.fore_color.rgb = DARK_COLOR
    header.line.fill.background()
    
    # Title
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.7))
    tf = title_box.text_frame
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(28)
    p.font.bold = True
    p.font.color.rgb = WHITE_COLOR
    
    # Code block background
    code_bg = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches(0.5), Inches(1.5),
        Inches(9), Inches(5)
    )
    code_bg.fill.solid()
    code_bg.fill.fore_color.rgb = RGBColor(0x1E, 0x1E, 0x1E)
    code_bg.line.fill.background()
    
    # Code text
    code_box = slide.shapes.add_textbox(Inches(0.7), Inches(1.7), Inches(8.6), Inches(4.6))
    tf = code_box.text_frame
    tf.word_wrap = True
    
    lines = code_content.strip().split('\n')
    for i, line in enumerate(lines):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = line
        p.font.size = Pt(11)
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
        print(f"Processing slide {i+1}...")
        
        title, content = extract_title_and_content(slide_md)
        
        if not title and not content:
            continue
        
        # Determine slide type
        if not title or ('Slide' in title and i > 0 and i < len(slides)-1):
            # Content slide
            if '```' in content:
                add_code_slide(prs, title or "Code", content)
            elif content.startswith('|') or '|' in content[:200]:
                add_table_slide(prs, title, content)
            else:
                add_content_slide(prs, title, content)
        else:
            # Check if it's a title slide (short content)
            content_lines = [l for l in content.split('\n') if l.strip() and not l.strip().startswith('#')]
            if len(content_lines) <= 2 and title:
                add_title_slide(prs, title, '\n'.join(content_lines))
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
