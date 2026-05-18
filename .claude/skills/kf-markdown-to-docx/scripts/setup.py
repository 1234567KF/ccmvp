#!/usr/bin/env python3
import subprocess
import sys
import os
import shutil
from pathlib import Path

def run_cmd(cmd, check=True, shell=None, **kwargs):
    print(f"  > {cmd}")
    if shell is None and sys.platform == "win32":
        shell = True
    result = subprocess.run(cmd, capture_output=True, text=True, shell=shell, **kwargs)
    if result.stdout:
        print(result.stdout.strip())
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}")
    return result

def check_python_package(import_name):
    try:
        __import__(import_name)
        return True
    except ImportError:
        return False

def install_python_packages():
    packages = [
        ("python-docx", "docx"),
        ("pypandoc", "pypandoc"),
        ("requests", "requests"),
        ("pypandoc_binary", "pypandoc"),
    ]
    to_install = [p for p, i in packages if not check_python_package(i)]
    if to_install:
        print(f"[1/3] Installing Python packages: {to_install}")
        run_cmd([sys.executable, "-m", "pip", "install"] + to_install)
    else:
        print("[1/3] Python packages already installed")

def check_nodejs():
    return shutil.which("node") is not None and shutil.which("npm") is not None

def install_mermaid_cli():
    skill_dir = Path(__file__).parent.parent
    mmdc = skill_dir / "node_modules" / ".bin" / "mmdc.cmd"
    if sys.platform == "win32" and mmdc.exists():
        print("[3/3] mermaid-cli already installed")
        return True
    print("[3/3] Installing mermaid-cli...")
    env = os.environ.copy()
    env["PUPPETEER_SKIP_DOWNLOAD"] = "true"
    try:
        run_cmd("npm install @mermaid-js/mermaid-cli --save-exact", cwd=str(skill_dir), env=env)
        return True
    except Exception as e:
        print(f"  Warning: {e}")
        return False

def main():
    print("=" * 60)
    print("kf-markdown-to-docx Skill Setup")
    print("=" * 60)
    install_python_packages()
    if check_nodejs():
        print("[2/3] Node.js found")
        install_mermaid_cli()
    else:
        print("[2/3] Node.js not found. Install from https://nodejs.org/")
    print("Setup complete!")

if __name__ == "__main__":
    main()

