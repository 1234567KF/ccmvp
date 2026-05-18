---
name: kf-markdown-to-docx
description: Convert Markdown files to high-quality DOCX documents using Pandoc with template-driven styling. Supports Mermaid diagram rendering (local CLI or online API fallback, including subgraph support), table formatting with template style detection, and Word template (.dotx/.docx) integration. Use when the user needs to export Markdown content to Word format, especially for technical documentation with flowcharts, tables, or formal delivery requirements.
---

# kf-markdown-to-docx — Markdown 转 DOCX

## Auto Setup (First Time)

Run the setup script to install all dependencies automatically:

`ash
python scripts/setup.py
`

This installs:
- Python packages: python-docx, pypandoc, requests
- Node.js package: @mermaid-js/mermaid-cli (local to skill, skips Puppeteer download)

**Prerequisites:**
- Python 3 with pip
- Node.js with npm (for local Mermaid rendering, optional but recommended)
- Google Chrome (for mermaid-cli rendering, optional but recommended)

## Quick Start

### One-Step Conversion (Recommended)

`ash
python scripts/convert_md_to_docx.py input.md template.docx output.docx
`

This script handles:
- Mermaid diagram rendering (local CLI primary, mermaid.ink API fallback)
- Template style application (Heading 1-4, etc.)
- Table border fixing
- Code block formatting
- Absolute image paths for reliable Pandoc embedding

## Full Pipeline

`ash
python scripts/convert_md_to_docx.py input.md template.docx output.docx
`

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Images not found | Script uses absolute paths; check file permissions |
| Mermaid CLI fails | Install Chrome; check PUPPETEER_EXECUTABLE_PATH |
| mermaid.ink fails | Check internet connection; script auto-fallbacks to CLI |
| npx not found | Install Node.js from https://nodejs.org/ |

## Cross-Environment Deployment

To deploy this skill to another environment:

1. Copy the entire kf-markdown-to-docx/ folder
2. Run python scripts/setup.py
3. Done!

The setup script auto-detects missing dependencies and installs them.