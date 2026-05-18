"""Extract structured text from saved HTML pages and write analysis."""
import os
import json
from bs4 import BeautifulSoup
from datetime import datetime

OUTPUT_DIR = os.path.join(os.getcwd(), "wecode", "admin")
H5_DIR = os.path.join(os.getcwd(), "wecode", "h5")

def extract_text_from_html(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        html = f.read()
    soup = BeautifulSoup(html, "html.parser")

    # Remove scripts and styles
    for tag in soup(["script", "style", "link", "meta", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)
    return text, soup

def analyze_menu_structure():
    """Analyze the saved menu pages to understand system structure."""
    files = sorted([f for f in os.listdir(OUTPUT_DIR) if f.endswith(".txt")])

    pages = []
    for fname in files:
        filepath = os.path.join(OUTPUT_DIR, fname)
        text, soup = extract_text_from_html(filepath)

        # Extract key elements
        title = ""
        title_tag = soup.find("title")
        if title_tag:
            title = title_tag.get_text(strip=True)

        # Find all buttons
        buttons = []
        for btn in soup.find_all(["button", "a"]):
            btn_text = btn.get_text(strip=True)
            if btn_text and len(btn_text) < 60:
                buttons.append(btn_text)

        # Find all input labels
        labels = []
        for label in soup.find_all("label"):
            lbl_text = label.get_text(strip=True)
            if lbl_text:
                labels.append(lbl_text)

        # Find table headers
        table_headers = []
        for th in soup.find_all("th"):
            h = th.get_text(strip=True)
            if h:
                table_headers.append(h)

        pages.append({
            "file": fname,
            "title": title,
            "text_length": len(text),
            "buttons": list(set(buttons))[:30],
            "labels": list(set(labels))[:20],
            "table_headers": list(set(table_headers))[:20],
            "text": text,
        })

    return pages

def extract_menu_names():
    """Extract actual Chinese menu names from the post-login page."""
    files = sorted([f for f in os.listdir(OUTPUT_DIR) if f.endswith(".txt")])
    post_login = [f for f in files if "post-login" in f]
    if post_login:
        filepath = os.path.join(OUTPUT_DIR, post_login[0])
        text, soup = extract_text_from_html(filepath)

        # Find menu items - Ant Design uses .ant-menu-item
        menu_items = soup.select(".ant-menu-item, .ant-menu-submenu-title")
        menus = []
        for item in menu_items:
            menus.append(item.get_text(strip=True))

        # Also look for sidebar links
        sidebar_links = soup.select(".ant-layout-sider a, .ant-menu a, .ant-menu-item")
        links = []
        for link in sidebar_links:
            links.append(link.get_text(strip=True))

        return menus, links, text

    return [], [], ""

# Run analysis
print("=== Analyzing menu structure ===")
menus, links, page_text = extract_menu_names()
print(f"\nMenu items ({len(menus)}):")
for i, m in enumerate(menus):
    print(f"  {i+1}. {m}")

print(f"\nSidebar links ({len(links)}):")
seen = set()
for l in links:
    if l and l not in seen:
        print(f"  - {l}")
        seen.add(l)

# Full analysis
pages = analyze_menu_structure()
print(f"\n=== Page Analysis: {len(pages)} files ===")
for p in pages:
    print(f"\n--- {p['file']} ---")
    print(f"  Title: {p['title']}")
    print(f"  Text length: {p['text_length']}")
    if p['labels']:
        print(f"  Labels: {p['labels'][:10]}")
    if p['table_headers']:
        print(f"  Table headers: {p['table_headers'][:10]}")
    if p['buttons']:
        print(f"  Buttons: {p['buttons'][:10]}")

# Write summary
print("\n=== Writing summary ===")
with open(os.path.join(os.getcwd(), "wecode", "00-system-analysis.md"), "w", encoding="utf-8") as f:
    f.write(f"""# 系统分析报告

**抓取时间**: {datetime.now().strftime('%Y-%m-%d %H:%M')}
**来源**: http://192.168.110.81:12501
**H5端**: http://192.168.110.81:8610

---

## 1. 系统概况

溯源管理系统，登录后可访问 14 个核心功能模块。
技术栈：Ant Design (React) 前端。

## 2. 菜单结构

| # | 菜单名称 | 说明 |
|---|---------|------|
""")
    for i, m in enumerate(menus):
        if m:
            f.write(f"| {i+1} | {m} | 待探查 |\n")

    f.write(f"""
## 3. H5 端分析

当前 QR 码唯一值: **19576491**
状态: **未绑定产品信息**

这意味着该溯源码已生成但尚未关联到具体产品。需要后台的 "溯源模板" 功能来绑定。

## 4. 抓取文件清单

| 文件 | 大小(bytes) |
|------|------------|
""")
    for fname in sorted(os.listdir(OUTPUT_DIR)):
        fp = os.path.join(OUTPUT_DIR, fname)
        if os.path.isfile(fp):
            f.write(f"| {fname} | {os.path.getsize(fp)} |\n")

    for fname in sorted(os.listdir(H5_DIR)):
        fp = os.path.join(H5_DIR, fname)
        if os.path.isfile(fp):
            f.write(f"| h5/{fname} | {os.path.getsize(fp)} |\n")

    f.write(f"""
## 5. 下一步建议

1. 深入探查"溯源码管理"/"溯源模板"模块——这是二维码绑定的核心
2. 探查"商品管理"——了解产品数据结构
3. H5 端需要知道不同的溯源码值对应什么展示内容
4. 递归采集每个菜单的子页面和列表数据
""")

print("\n=== Done! ===")
