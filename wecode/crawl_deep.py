"""Deep recursive crawl: expand every submenu, click every menu item, capture every page."""
import asyncio, json, os
from playwright.async_api import async_playwright
from datetime import datetime
from bs4 import BeautifulSoup

BASE_URL = "http://192.168.110.81:12501"
LOGIN_URL = BASE_URL + "/user/login"
OUTPUT_DIR = os.path.join(os.getcwd(), "wecode", "deep")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SAVED_URLS = set()

def ts():
    return datetime.now().strftime("%Y%m%d_%H%M%S")

async def save_page(page, label):
    html = await page.content()
    url = page.url
    key = f"{url}|{label}"
    if key in SAVED_URLS:
        return html
    SAVED_URLS.add(key)
    timestamp = ts()
    fpath = os.path.join(OUTPUT_DIR, f"{timestamp}-{label}.html")
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(html)
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "link", "meta", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    tpath = os.path.join(OUTPUT_DIR, f"{timestamp}-{label}.txt")
    with open(tpath, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  >> Saved {label} ({len(html)}b)")
    return html

async def extract_page_info(page, soup=None):
    if soup is None:
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")
    tables = soup.select("table, .ant-table, .el-table")
    headers = []
    for t in tables[:5]:
        for th in t.select("th"):
            h = th.get_text(strip=True)
            if h and h not in headers:
                headers.append(h)
    form_items = []
    for label in soup.select("label, .ant-form-item-label label"):
        text = label.get_text(strip=True)
        if text and len(text) < 50:
            form_items.append(text)
    buttons = []
    for btn in soup.select("button, .ant-btn, [role='button']"):
        text = btn.get_text(strip=True)
        if text and len(text) < 40:
            buttons.append(text)
    return {"headers": headers[:30], "form_fields": form_items[:20], "buttons": list(set(buttons))[:15]}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080}, locale="zh-CN")
        page = await context.new_page()

        # === LOGIN ===
        print("=== Login ===")
        await page.goto(LOGIN_URL, wait_until="networkidle", timeout=30000)
        await asyncio.sleep(2)
        await page.fill("#tenantCode", "465945")
        await page.fill("#username", "18888888888")
        nl = await page.query_selector("text=普通登录")
        if nl and await nl.is_visible():
            await nl.click()
            await asyncio.sleep(1)
        await page.fill("#password, [type=password]", "112233WD")
        lb = await page.query_selector(".login-button")
        if lb:
            await lb.click()
        else:
            await page.keyboard.press("Enter")
        await asyncio.sleep(3)
        try:
            await page.wait_for_load_state("networkidle", timeout=10000)
        except:
            pass
        await asyncio.sleep(2)
        print(f"URL: {page.url}")
        await save_page(page, "00-logged-in")

        # === Discover all submenus ===
        print("\n=== Discovering submenus ===")
        all_submenus = await page.query_selector_all(".ant-menu-submenu")
        print(f"Found {len(all_submenus)} submenus")

        menu_map = []
        for sm in all_submenus:
            try:
                tel = await sm.query_selector(".ant-menu-submenu-title")
                if not tel:
                    continue
                ttext = await tel.inner_text()
                tclean = ttext.strip()[:30]
                await tel.click()
                await asyncio.sleep(0.8)
                children = await sm.query_selector_all(":scope > .ant-menu-sub > .ant-menu-item, :scope > .ant-menu-sub > .ant-menu-submenu")
                ctexts = []
                for ci in children:
                    ct = await ci.inner_text()
                    ctexts.append(ct.strip()[:30])
                menu_map.append({"title": tclean, "el": sm, "title_el": tel, "children": children, "ctexts": ctexts})
                print(f"  [{len(menu_map)-1}] {tclean}: {ctexts}")
            except Exception as e:
                print(f"  [ERR]: {e}")

        # === Crawl each submenu's children ===
        print("\n=== Deep crawl ===")
        for idx, info in enumerate(menu_map):
            print(f"\n--- {idx}: {info['title']} ---")
            try:
                await info["title_el"].click()
                await asyncio.sleep(0.8)
            except:
                pass

            if info["children"]:
                for ci in info["children"]:
                    try:
                        ci_text = await ci.inner_text()
                        ci_label = ci_text.strip()[:30].replace("/", "-").replace("\\", "-")
                        cls = await ci.get_attribute("class") or ""
                        print(f"  Click: {ci_label} [{cls[:30]}]")

                        # Check if this is a sub-submenu
                        if "submenu" in cls:
                            sub_tel = await ci.query_selector(".ant-menu-submenu-title")
                            if sub_tel:
                                await sub_tel.click()
                                await asyncio.sleep(0.8)
                                grandchildren = await ci.query_selector_all(":scope > .ant-menu-sub > .ant-menu-item")
                                for gc in grandchildren:
                                    gc_text = await gc.inner_text()
                                    gc_label = gc_text.strip()[:30].replace("/", "-")
                                    print(f"    Sub-click: {gc_label}")
                                    await gc.click()
                                    await asyncio.sleep(2)
                                    try:
                                        await page.wait_for_load_state("networkidle", timeout=10000)
                                    except:
                                        pass
                                    await asyncio.sleep(1)
                                    await save_page(page, f"m{idx}-{ci_label}-{gc_label}")
                        else:
                            await ci.click()
                            await asyncio.sleep(2)
                            try:
                                await page.wait_for_load_state("networkidle", timeout=10000)
                            except:
                                pass
                            await asyncio.sleep(1)
                            await save_page(page, f"m{idx}-{ci_label}")

                        # Extract page info
                        html = await page.content()
                        soup = BeautifulSoup(html, "html.parser")
                        info_data = await extract_page_info(page, soup)
                        if info_data["headers"]:
                            print(f"    H: {info_data['headers'][:8]}")
                        if info_data["form_fields"]:
                            print(f"    F: {info_data['form_fields'][:6]}")
                        if info_data["buttons"]:
                            print(f"    B: {info_data['buttons'][:6]}")
                    except Exception as e:
                        print(f"    [ERR]: {e}")
            else:
                try:
                    await info["title_el"].click()
                    await asyncio.sleep(2)
                    try:
                        await page.wait_for_load_state("networkidle", timeout=10000)
                    except:
                        pass
                    await asyncio.sleep(1)
                    await save_page(page, f"m{idx}-{info['title']}")
                except Exception as e:
                    print(f"    [ERR leaf]: {e}")

        # === Summary ===
        summary = {
            "crawl_time": ts(), "total_submenus": len(menu_map), "saved": len(SAVED_URLS),
            "structure": {m["title"]: m["ctexts"] for m in menu_map},
        }
        with open(os.path.join(OUTPUT_DIR, "crawl-summary.json"), "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"\n=== Done: {len(SAVED_URLS)} pages saved ===")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
