"""Extract text from saved HTML files (correctly)."""
import os
import json
from bs4 import BeautifulSoup
from datetime import datetime
import re

OUTPUT_DIR = os.path.join(os.getcwd(), "wecode", "admin")
H5_DIR = os.path.join(os.getcwd(), "wecode", "h5")
SUMMARY_DIR = os.path.join(os.getcwd(), "wecode")

def extract_visible_text(html):
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "link", "meta", "noscript", "svg"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    return lines, soup

# Process post-login HTML to get menu structure
post_login_html = None
for f in os.listdir(OUTPUT_DIR):
    if "post-login" in f and f.endswith(".html"):
        with open(os.path.join(OUTPUT_DIR, f), "r", encoding="utf-8", errors="replace") as fp:
            post_login_html = fp.read()
        break

if post_login_html:
    lines, soup = extract_visible_text(post_login_html)
    print(f"=== POST-LOGIN PAGE ({len(lines)} lines) ===")
    for l in lines[:80]:
        print(f"  {l}")

    # Find all links
    print(f"\n=== ALL LINKS ===")
    links = soup.find_all("a")
    for a in links:
        href = a.get("href", "")
        text = a.get_text(strip=True)
        if text and href:
            print(f"  {text[:40]:40s} → {href[:60]}")

    # Find all buttons/clickable items
    print(f"\n=== ALL BUTTONS & CLICKABLE ===")
    for btn in soup.find_all(["button", "span", "div"]):
        cls = " ".join(btn.get("class", []))
        if "menu" in cls.lower() or "Menu" in cls:
            text = btn.get_text(strip=True)
            if text:
                print(f"  [{cls[:30]}] {text[:40]}")

    # Look for Ant Design menu structure
    print(f"\n=== ANT MENU ITEMS ===")
    for item in soup.select("[class*='ant-menu-item'], [class*='ant-menu-submenu'], [class*='menu-item'], [class*='submenu']"):
        text = item.get_text(strip=True)
        classes = " ".join(item.get("class", []))
        if text:
            print(f"  [{classes[:40]}] {text[:50]}")

# Process each menu HTML to see content
print(f"\n=== MENU PAGE CONTENTS ===")
html_files = sorted([f for f in os.listdir(OUTPUT_DIR) if f.endswith(".html") and "menu" in f])
for fname in html_files:
    with open(os.path.join(OUTPUT_DIR, fname), "r", encoding="utf-8", errors="replace") as fp:
        html = fp.read()
    lines, soup = extract_visible_text(html)

    # Get unique lines that weren't in post-login (actual content)
    content_lines = [l for l in lines if l not in [
        "首页", "系统管理", "用户管理", "退出"
    ]]

    print(f"\n--- {fname[:40]} ({len(content_lines)} content lines) ---")
    for l in content_lines[:25]:
        print(f"  {l}")

# H5 page
print(f"\n=== H5 PAGE ===")
for f in os.listdir(H5_DIR):
    if f.endswith(".html"):
        with open(os.path.join(H5_DIR, f), "r", encoding="utf-8", errors="replace") as fp:
            html = fp.read()
        lines, soup = extract_visible_text(html)
        print(f"\n{h5_file}:")
        for l in lines[:30]:
            print(f"  {l}")

print("\n=== Analysis complete ===")
