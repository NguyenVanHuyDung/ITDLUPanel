#!/usr/bin/env python3
"""Merge two slide markdown files into a single document."""

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def create_combined_doc(v1_content, v2_content, output_path):
    """Create combined document with both versions."""
    
    combined = f'''# ITDLUPanel - Presentation Documentation

**Đại học Đà Lạt | © 2026**

---

# PHẦN 1: GIỚI THIỆU CHUNG (v1.0)

---

{v1_content}

---

# PHẦN 2: PHÂN TÍCH KỸ THUẬT CHI TIẾT (v2.0)

---

{v2_content}

---

*Document generated: {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
'''
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(combined)
    
    print(f"Combined document created: {output_path}")

if __name__ == '__main__':
    v1_path = '/root/ITDLUPanel/docs/slides/01-introduction.md'
    v2_path = '/root/ITDLUPanel/docs/slides/02-technical-deep-dive.md'
    output_path = '/root/ITDLUPanel/docs/slides/ITDLUPanel-Presentation-Combined.md'
    
    v1 = read_file(v1_path)
    v2 = read_file(v2_path)
    
    create_combined_doc(v1, v2, output_path)
    
    # Count slides
    v1_slides = v1.count('\n---\n') + 1
    v2_slides = v2.count('\n---\n') + 1
    print(f"Total: {v1_slides} slides (v1) + {v2_slides} slides (v2) = {v1_slides + v2_slides} slides")
