"""Second attempt: login with verification code handling."""
import asyncio
from playwright.async_api import async_playwright
import json, os
from datetime import datetime

BASE_URL = "http://192.168.110.81:12501"
LOGIN_URL = f"{BASE_URL}/user/login"
OUTPUT_DIR = os.path.join(os.getcwd(), "wecode")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "admin"), exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "admin", "pages"), exist_ok=True)

async def save_page(page, name):
    html = await page.content()
    text = await page.inner_text("body")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    with open(os.path.join(OUTPUT_DIR, "admin", f"{ts}-{name}.html"), "w", encoding="utf-8") as f:
        f.write(html)
    with open(os.path.join(OUTPUT_DIR, "admin", f"{ts}-{name}.txt"), "w", encoding="utf-8") as f:
        f.write(text)
    print(f">> Saved {name} ({len(html)} bytes)")
    return html, text

async def extract_page_info(page, context):
    """Extract structured info from current page."""
    info = {
        "url": page.url,
        "title": await page.title(),
        "inputs": [],
        "buttons": [],
        "links": [],
        "tables": [],
    }
    inputs = await page.query_selector_all("input, select, textarea")
    for inp in inputs:
        visible = await inp.is_visible()
        if visible:
            info["inputs"].append({
                "tag": await inp.evaluate("el => el.tagName"),
                "name": await inp.get_attribute("name") or "",
                "id": await inp.get_attribute("id") or "",
                "type": await inp.get_attribute("type") or "",
                "placeholder": await inp.get_attribute("placeholder") or "",
            })
    buttons = await page.query_selector_all("button, [role='button'], .ant-btn")
    for btn in buttons:
        visible = await btn.is_visible()
        if visible:
            info["buttons"].append({
                "text": (await btn.inner_text()).strip()[:50],
                "class": (await btn.get_attribute("class") or "")[:60],
            })
    links = await page.query_selector_all("a, [role='menuitem'], .ant-menu-item, .ant-menu-submenu-title")
    for link in links:
        visible = await link.is_visible()
        if visible:
            info["links"].append({
                "text": (await link.inner_text()).strip()[:50],
                "href": await link.get_attribute("href") or "",
            })
    tables = await page.query_selector_all("table, .ant-table, .el-table")
    info["tables_count"] = len(tables)
    return info

async def try_login_password(page, context):
    """Try normal password login flow."""
    print("\n=== Step: Password Login ===")
    await page.goto(LOGIN_URL, wait_until="networkidle", timeout=30000)
    await asyncio.sleep(2)

    # Fill enterprise ID
    tenant = await page.query_selector("#tenantCode")
    if tenant:
        await tenant.fill("465945")
        print(">> Enterprise ID filled")

    # Fill username
    username = await page.query_selector("#username")
    if username:
        await username.fill("18888888888")
        print(">> Username filled")

    # Click "普通登录" (normal login) link if visible
    normal_login = await page.query_selector("text=普通登录")
    if normal_login and await normal_login.is_visible():
        await normal_login.click()
        await asyncio.sleep(1)
        print(">> Clicked '普通登录'")

    # Fill password
    password = await page.query_selector("#password, [type=password]")
    if password:
        await password.fill("112233WD")
        print(">> Password filled")

    await save_page(page, "pre-login")

    # Click login button
    login_btn = await page.query_selector(".login-button")
    if login_btn:
        await login_btn.click()
        print(">> Login button clicked")
    else:
        await page.keyboard.press("Enter")
        print(">> Pressed Enter")

    await asyncio.sleep(3)
    try:
        await page.wait_for_load_state("networkidle", timeout=10000)
    except:
        pass
    await asyncio.sleep(2)

    # Check result
    await save_page(page, "post-login")
    info = await extract_page_info(page, context)
    print(f">> URL after login: {page.url}")
    print(f">> Buttons: {[b['text'] for b in info['buttons']]}")
    print(f">> Inputs: {[i['placeholder'] for i in info['inputs']]}")

    # Check if we got verification code input
    has_captcha = any("验证码" in i["placeholder"] or "code" in i["id"].lower() or "captcha" in i["id"].lower() for i in info["inputs"])
    print(f">> Has captcha input: {has_captcha}")

    # Check if login succeeded (URL changed)
    if page.url != LOGIN_URL:
        print(">> LOGIN SUCCESSFUL! URL changed.")
        return True
    else:
        print(">> Login may need verification code")
        return False

async def after_login_actions(page, context):
    """Browse the system after successful login."""
    print("\n=== Post-Login Exploration ===")
    await asyncio.sleep(2)

    # Get all visible navigation items
    info = await extract_page_info(page, context)
    print(f">> Page: {info['url']}")
    print(f">> All links ({len(info['links'])}):")
    for link in info["links"]:
        print(f"    {link['text']:45s} → {link['href']}")

    # Try to find the sidebar menu
    # Ant Design: .ant-menu, .ant-layout-sider
    menu_items = await page.query_selector_all(".ant-menu-item, .ant-menu-submenu-title")
    print(f"\n>> Menu items: {len(menu_items)}")
    for item in menu_items:
        text = await item.inner_text()
        print(f"    {text.strip()[:60]}")

    # If no menu, look for the sidebar
    sidebar = await page.query_selector(".ant-layout-sider")
    if not sidebar:
        print(">> No sidebar found, trying to expand menu...")
        # Maybe the menu is collapsed? Try toggling
        toggle = await page.query_selector(".ant-layout-sider-trigger, .ant-menu-inline-collapsed-tooltip")
        if toggle:
            await toggle.click()
            await asyncio.sleep(1)
            await save_page(page, "sidebar-expanded")

    # Try to find menu tree
    menu_tree = await page.query_selector_all(".ant-menu-item, .ant-menu-submenu")
    if menu_tree:
        print(f">> Menu tree found ({len(menu_tree)} items)")
        menu_data = []
        for item in menu_tree:
            text = await item.inner_text()
            cls = await item.get_attribute("class") or ""
            menu_data.append({"text": text.strip()[:60], "class": cls[:40]})

        # Write menu structure
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        with open(os.path.join(OUTPUT_DIR, "admin", f"{ts}-menu-structure.json"), "w", encoding="utf-8") as f:
            json.dump(menu_data, f, ensure_ascii=False, indent=2)
        print(f">> Menu structure saved to {ts}-menu-structure.json")

        # Try clicking each menu item
        for i, item in enumerate(menu_tree):
            try:
                visible = await item.is_visible()
                if not visible:
                    continue
                text = await item.inner_text()
                print(f"\n>> Clicking menu: {text.strip()[:50]}")
                await item.click()
                await asyncio.sleep(2)
                try:
                    await page.wait_for_load_state("networkidle", timeout=8000)
                except:
                    pass
                await asyncio.sleep(1)
                await save_page(page, f"menu-{i}-{text.strip()[:20]}")
            except Exception as e:
                print(f"    Error clicking: {e}")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="zh-CN"
        )
        page = await context.new_page()

        # First try password login
        success = await try_login_password(page, context)

        if success:
            await after_login_actions(page, context)
        else:
            # Login failed or needs verification code
            print("\n=== Login needs SMS verification code ===")
            await save_page(page, "needs-verification")

            # Try to get the captcha button clicked
            captcha_btn = await page.query_selector("text=获取验证码, button:has-text('获取验证码'), .send-code, #sendCode")
            if captcha_btn:
                print(">> Found verification code send button")
                # First ensure phone is filled
                phone = await page.query_selector("#username, [id*='phone'], [id*='mobile']")
                if phone:
                    await phone.fill("18888888888")
                await captcha_btn.click()
                print(">> Verification code requested - USER NEEDS TO CHECK PHONE")
                await save_page(page, "verification-code-sent")

        # Also fetch H5 page
        print("\n=== Fetching H5 QR Page ===")
        h5_page = await context.new_page()
        try:
            QR_URL = "http://192.168.110.81:8610?&e=1&a=ARZpA4wRW37ntYUg%2FsDJtA%3D%3D"
            await h5_page.goto(QR_URL, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)
            await save_page(h5_page, "h5-qr-page")
            h5_text = await h5_page.inner_text("body")
            print(f"\n--- H5 PAGE ---")
            print(h5_text[:3000])
            print("--- END ---")
        except Exception as e:
            print(f">> H5 error: {e}")
        finally:
            await h5_page.close()

        await browser.close()
        print("\n=== Done! ===")

if __name__ == "__main__":
    asyncio.run(main())
