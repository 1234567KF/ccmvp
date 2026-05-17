# lean-ctx 安装指南

## 前置条件

- Node.js >= 18
- 网络可访问 GitHub Releases (下载二进制)

## 安装方法

### 方法 1: npm (推荐)

```powershell
npm install -g lean-ctx-bin

# 验证
lean-ctx --version

# 初始化 shell hooks + Claude Code hooks
lean-ctx init
lean-ctx init --agent claude
```

> 注意：npm 包名为 `lean-ctx-bin`，安装后提供 `lean-ctx` 命令。

### 方法 2: 手动下载

如果网络限制导致 npm 安装失败，手动下载二进制：

```powershell
# 下载最新 Windows 二进制
$url = "https://github.com/garrytan/lean-ctx/releases/latest/download/lean-ctx-x86_64-pc-windows-msvc.zip"
$out = "$env:TEMP\lean-ctx.zip"
Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
Expand-Archive -Path $out -DestinationPath $env:TEMP\lean-ctx -Force

# 安装到用户目录
$binDir = "$env:USERPROFILE\.local\bin"
if (!(Test-Path $binDir)) { New-Item -ItemType Directory -Force -Path $binDir }
Move-Item "$env:TEMP\lean-ctx\lean-ctx.exe" "$binDir\lean-ctx.exe" -Force

# 添加到 PATH
[Environment]::SetEnvironmentVariable("Path", "$env:PATH;$binDir", "User")

# 初始化
& "$binDir\lean-ctx.exe" init
& "$binDir\lean-ctx.exe" init --agent claude
```

### 方法 3: Cargo (Rust 源码编译)

```bash
cargo install lean-ctx
lean-ctx init
lean-ctx init --agent claude
```

## 验证安装

```powershell
lean-ctx --version       # 应显示版本号
lean-ctx ctx_overview    # 显示项目统计
```

## Hook 配置（Claude Code）

安装和初始化后，以下 hooks 会添加到 `settings.json`：

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "command": "lean-ctx hook rewrite" }] },
      { "matcher": "Read|Grep|Glob|View", "hooks": [{ "command": "lean-ctx hook redirect" }] }
    ]
  }
}
```

## 卸载

```powershell
npm uninstall -g lean-ctx-bin
# 或如果手动安装
Remove-Item "$env:USERPROFILE\.local\bin\lean-ctx.exe" -Force
```
