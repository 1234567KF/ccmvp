"""Extract Chinese text and write to markdown report."""
import os
import re
from bs4 import BeautifulSoup
from datetime import datetime

OUTPUT_DIR = os.path.join(os.getcwd(), "wecode", "admin")
H5_DIR = os.path.join(os.getcwd(), "wecode", "h5")
REPORT_DIR = os.path.join(os.getcwd(), "wecode")

def get_chinese_lines(html):
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "link", "meta", "noscript", "svg"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = []
    for line in text.split("\n"):
        line = line.strip()
        chinese = re.findall(r'[一-鿿]{2,}', line)
        if chinese:
            lines.append("".join(chinese))
    return lines, soup

# Collect all menu structures
html_files = sorted([f for f in os.listdir(OUTPUT_DIR) if f.endswith(".html")])

# Group files by type
menu_files = [f for f in html_files if "menu-" in f]
post_login = [f for f in html_files if "post-login" in f]
pre_login = [f for f in html_files if "pre-login" in f]

# Build menu hierarchy from first and last menu files
# The SPA loads all menu items in each page, but each click expands a section
# Let's diff consecutive menu files to find submenus

structures = {}
for fname in menu_files:
    with open(os.path.join(OUTPUT_DIR, fname), "r", encoding="utf-8", errors="replace") as f:
        html = f.read()
    lines, soup = get_chinese_lines(html)
    structures[fname] = lines

# Starting structure (menu-0, which is "首页")
base_menus = set()
if menu_files:
    with open(os.path.join(OUTPUT_DIR, menu_files[0]), "r", encoding="utf-8", errors="replace") as f:
        html = f.read()
    base_lines, _ = get_chinese_lines(html)
    base_menus = set(base_lines)

# Build menu hierarchy by finding new items in each subsequent file
menu_hierarchy = {}
prev_menus = set(base_menus)
for fname in menu_files:
    with open(os.path.join(OUTPUT_DIR, fname), "r", encoding="utf-8", errors="replace") as f:
        html = f.read()
    lines, _ = get_chinese_lines(html)
    current = set(lines)
    new_items = current - prev_menus
    if new_items:
        menu_hierarchy[fname] = new_items
    prev_menus = current

# H5 text
h5_lines = []
for fname in sorted(os.listdir(H5_DIR)):
    if fname.endswith(".html"):
        with open(os.path.join(H5_DIR, fname), "r", encoding="utf-8", errors="replace") as f:
            html = f.read()
        lines, _ = get_chinese_lines(html)
        h5_lines = lines

# Write full report
with open(os.path.join(REPORT_DIR, "00-system-analysis.md"), "w", encoding="utf-8") as report:
    report.write(f"""# 系统分析报告

**抓取时间**: {datetime.now().strftime('%Y-%m-%d %H:%M')}
**来源**: http://192.168.110.81:12501
**H5端**: http://192.168.110.81:8610

---

## 1. 系统概况

企业溯源管理平台（微科技），支持多租户（企业ID: 465945）。
技术栈：Ant Design (React) 前端，RESTful API 后端。

## 2. 登录流程

登录页需要企业ID + 账号 + 密码，点击登录后会触发**滑块验证**（"请完成安全验证"），验证通过后再进行密码验证。
初始登录成功（密码正确即进入），但存在验证码二次验证流程。

## 3. 菜单层级结构

""")

    # Write main menu items
    if base_menus:
        report.write("### 一级菜单\n\n")
        # Filter out single-character items and items that are clearly not menus
        main_menus = sorted([m for m in base_menus if len(m) >= 2 and m not in ["你好", "欢迎", "退出", "首页", "tester", "微信科技平台"]])
        # Actually let me just write all of them
        for m in sorted(base_menus, key=lambda x: list(base_menus).index(x) if x in base_menus else 999):
            report.write(f"- {m}\n")

    report.write("\n### 各菜单子功能\n\n")
    for fname, new_items in sorted(menu_hierarchy.items()):
        if new_items:
            report.write(f"**{fname}**:\n")
            for item in sorted(new_items, key=lambda x: list(new_items).index(x)):
                report.write(f"  - {item}\n")
            report.write("\n")

    report.write("""## 4. 关键功能模块

根据菜单结构，系统核心功能包括：

### 溯源管理（核心模块）
- 内部溯源/外部溯源
- 标识码管理、码值查询
- 外部标识码上传与管理
- 反码管理（防伪）

### 商品管理
- 品牌管理、产品分类
- 包装单位

### 资源管理
- 展示模板、资源模板库
- 资源绑定管理
- 数据采集中心（含图片）
- 落地页设置
- 资源操作日志

### 营销管理
- 智能化营销、智能化预警

### 其他模块
- 设备管理、经销商管理、仓库管理
- 应用管理
- 系统管理、用户管理

## 5. 动态码绑定流程分析

""")

    # H5 analysis
    report.write("### H5端扫码展示\n\n")
    if h5_lines:
        for l in h5_lines:
            report.write(f"- {l}\n")
    else:
        report.write("- 当前码值未绑定产品信息\n")

    report.write("""

### 绑码流程推测

```
溯源模板 (后台定义)
       ↓
资源绑定管理 (将模板绑定到具体产品)
       ↓
生成唯一标识码 (如: 19576491)
       ↓
印制QR码贴在产品或包装上
       ↓
用户扫码 → H5端展示绑定的溯源信息
```

当前状态：码值 `19576491` 已生成，但未绑定产品信息。
需要在后台「资源绑定管理」或「标识码管理」中完成绑定。

## 6. 文件清单

""")

    # File listing
    report.write("| 文件 | 类型 | 大小 |\n|------|------|------|\n")
    for fname in sorted(os.listdir(OUTPUT_DIR)):
        fp = os.path.join(OUTPUT_DIR, fname)
        sz = os.path.getsize(fp)
        ext = fname.split(".")[-1]
        report.write(f"| admin/{fname} | {ext} | {sz} |\n")
    for fname in sorted(os.listdir(H5_DIR)):
        fp = os.path.join(H5_DIR, fname)
        sz = os.path.getsize(fp)
        ext = fname.split(".")[-1]
        report.write(f"| h5/{fname} | {ext} | {sz} |\n")

    report.write("""
## 7. 下一步建议

1. **深入探查"溯源模板"模块** — 这是二维码绑定的核心，了解模板定义方式
2. **探查"资源绑定管理"** — 了解如何将模板绑定到具体产品
3. **探查"商品管理"** — 了解产品数据模型
4. **查看已绑定的码值** — 找一个已绑定的QR码，看H5端展示什么内容
5. **建议递归采集**每个功能页面的列表数据，了解数据字段结构
""")

print(f"Report written: wecode/00-system-analysis.md")
print(f"Admin HTML files: {len([f for f in os.listdir(OUTPUT_DIR) if f.endswith('.html')])}")
print(f"H5 HTML files: {len([f for f in os.listdir(H5_DIR) if f.endswith('.html')])}")
