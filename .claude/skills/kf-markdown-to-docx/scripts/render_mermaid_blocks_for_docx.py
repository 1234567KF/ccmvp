#!/usr/bin/env python3
"""
Render Mermaid code blocks in Markdown to PNG images for DOCX conversion.

Usage:
    python render_mermaid_blocks_for_docx.py input.md

This will:
1. Find all ```mermaid blocks in the Markdown
2. Render each to PNG using mermaid-cli
3. Replace code blocks with image references
4. Create a backup of the original file
"""

import re
import os
import sys
import subprocess
import hashlib
from pathlib import Path


def render_mermaid_diagram(mermaid_code, output_path):
    """Render a single mermaid diagram to PNG."""
    # Write mermaid code to temp file
    temp_mmd = output_path.with_suffix('.mmd')
    temp_mmd.write_text(mermaid_code, encoding='utf-8')
    
    # Render using mermaid-cli
    try:
        subprocess.run(
            ['npx', '@mermaid-js/mermaid-cli', 'mmdc', '-i', str(temp_mmd), '-o', str(output_path)],
            check=True,
            capture_output=True,
            text=True
        )
        temp_mmd.unlink()
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error rendering diagram: {e}")
        print(f"stderr: {e.stderr}")
        return False
    except FileNotFoundError:
        print("Error: npx not found. Please install Node.js.")
        return False


def process_markdown_file(md_path):
    """Process a Markdown file to render Mermaid diagrams."""
    md_path = Path(md_path)
    if not md_path.exists():
        print(f"Error: File not found: {md_path}")
        return False
    
    # Create output directory for images
    images_dir = md_path.parent / 'mermaid-images'
    images_dir.mkdir(exist_ok=True)
    
    # Read markdown content
    content = md_path.read_text(encoding='utf-8')
    
    # Find all mermaid code blocks
    mermaid_pattern = r'```mermaid\n(.*?)\n```'
    matches = list(re.finditer(mermaid_pattern, content, re.DOTALL))
    
    if not matches:
        print("No Mermaid diagrams found.")
        return True
    
    print(f"Found {len(matches)} Mermaid diagram(s)")
    
    # Process each diagram
    replacements = []
    for i, match in enumerate(matches):
        mermaid_code = match.group(1)
        
        # Generate unique filename based on content hash
        content_hash = hashlib.md5(mermaid_code.encode()).hexdigest()[:8]
        image_name = f'diagram_{i+1}_{content_hash}.png'
        image_path = images_dir / image_name
        
        # Render diagram
        print(f"Rendering diagram {i+1}/{len(matches)}...")
        if render_mermaid_diagram(mermaid_code, image_path):
            # Create replacement text (image reference)
            rel_path = image_path.relative_to(md_path.parent)
            replacement = f'![Mermaid Diagram {i+1}]({rel_path})'
            replacements.append((match.start(), match.end(), replacement))
            print(f"  Saved: {image_path}")
        else:
            print(f"  Failed to render diagram {i+1}")
    
    # Apply replacements in reverse order to maintain positions
    new_content = content
    for start, end, replacement in reversed(replacements):
        new_content = new_content[:start] + replacement + new_content[end:]
    
    # Backup original file
    backup_path = md_path.with_suffix('.md.backup')
    md_path.rename(backup_path)
    print(f"Backup created: {backup_path}")
    
    # Write modified content
    md_path.write_text(new_content, encoding='utf-8')
    print(f"Updated: {md_path}")
    
    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python render_mermaid_blocks_for_docx.py <input.md>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    success = process_markdown_file(input_file)
    sys.exit(0 if success else 1)
