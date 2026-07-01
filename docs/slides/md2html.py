#!/usr/bin/env python3
"""Convert markdown slides to HTML with presentation styling."""

import markdown
import os

def convert_to_html(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Custom extensions for better formatting
    html_content = markdown.markdown(
        content,
        extensions=['tables', 'fenced_code', 'codehilite', 'toc']
    )
    
    # HTML template
    html_template = f'''<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ITDLUPanel v2 - Technical Deep Dive</title>
    <style>
        :root {{
            --primary: #1565C0;
            --secondary: #2E7D32;
            --accent: #0288D1;
            --dark: #1B2A4A;
            --bg: #F5F7FA;
            --surface: #FFFFFF;
            --text: #1A1A2E;
            --text-muted: #64748B;
        }}
        
        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}
        
        body {{
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            padding: 40px 20px;
        }}
        
        .slide {{
            max-width: 1200px;
            margin: 0 auto 60px;
            background: var(--surface);
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            overflow: hidden;
            page-break-after: always;
        }}
        
        .slide-header {{
            background: linear-gradient(135deg, var(--primary), var(--accent));
            color: white;
            padding: 32px 40px;
        }}
        
        .slide-number {{
            font-size: 14px;
            opacity: 0.8;
            margin-bottom: 8px;
        }}
        
        .slide-title {{
            font-size: 32px;
            font-weight: 700;
        }}
        
        .slide-content {{
            padding: 32px 40px;
        }}
        
        h1 {{
            font-size: 28px;
            color: var(--primary);
            margin: 24px 0 16px;
            border-bottom: 3px solid var(--primary);
            padding-bottom: 8px;
        }}
        
        h2 {{
            font-size: 22px;
            color: var(--dark);
            margin: 20px 0 12px;
        }}
        
        h3 {{
            font-size: 18px;
            color: var(--text);
            margin: 16px 0 8px;
        }}
        
        p {{
            margin: 12px 0;
        }}
        
        pre {{
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 13px;
            line-height: 1.5;
            margin: 16px 0;
        }}
        
        code {{
            background: #f0f0f0;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 14px;
        }}
        
        pre code {{
            background: none;
            padding: 0;
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 14px;
        }}
        
        th {{
            background: var(--primary);
            color: white;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
        }}
        
        td {{
            padding: 10px 16px;
            border-bottom: 1px solid #e0e0e0;
        }}
        
        tr:nth-child(even) {{
            background: #f8f9fa;
        }}
        
        ul, ol {{
            margin: 12px 0 12px 24px;
        }}
        
        li {{
            margin: 6px 0;
        }}
        
        hr {{
            border: none;
            border-top: 2px solid #e0e0e0;
            margin: 24px 0;
        }}
        
        blockquote {{
            border-left: 4px solid var(--primary);
            padding-left: 16px;
            color: var(--text-muted);
            font-style: italic;
            margin: 16px 0;
        }}
        
        @media print {{
            body {{
                padding: 0;
            }}
            .slide {{
                box-shadow: none;
                border: 1px solid #ddd;
                margin: 0;
                page-break-after: always;
            }}
        }}
        
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin: 16px 0;
        }}
        
        .card {{
            background: #f8f9fa;
            border-radius: 8px;
            padding: 16px;
            border-left: 4px solid var(--primary);
        }}
        
        .badge {{
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }}
        
        .badge-success {{ background: #E6F7E9; color: #52C41A; }}
        .badge-warning {{ background: #FFF1F0; color: #FAAD14; }}
        .badge-error {{ background: #FFF1F0; color: #FF4D4F; }}
    </style>
</head>
<body>
{html_content}
</body>
</html>'''
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_template)
    
    print(f"HTML created: {output_file}")

if __name__ == '__main__':
    input_file = '/root/ITDLUPanel/docs/slides/02-technical-deep-dive.md'
    output_file = '/root/ITDLUPanel/docs/slides/02-technical-deep-dive.html'
    convert_to_html(input_file, output_file)
