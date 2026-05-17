#!/usr/bin/env pwsh
<#
.SYNOPSIS
    AI编程智驾 — 环境检测脚本
.DESCRIPTION
    检测 Node.js 18+、Git、Python、以及可选全局工具的安装状态。
#>

$ErrorActionPreference = "Continue"

Write-Host "=== AI编程智驾 环境检测 ===" -ForegroundColor Cyan
Write-Host ""

# ─── 必需依赖 ──────────────────────────────────────────────────────────
Write-Host "【必需依赖】" -ForegroundColor Yellow

$required = @(
    @{ Name = "Node.js";  Cmd = "node";    MinVer = "18.0.0"; GetVer = { node --version }; Install = "winget install OpenJS.NodeJS.LTS" }
    @{ Name = "Git";      Cmd = "git";     MinVer = "2.0.0";  GetVer = { git --version };    Install = "winget install Git.Git" }
)

$allOk = $true
foreach ($dep in $required) {
    $cmd = Get-Command $dep.Cmd -ErrorAction SilentlyContinue
    if ($cmd) {
        $ver = & $dep.GetVer
        Write-Host "  [✓] $($dep.Name) $ver" -ForegroundColor Green
    } else {
        Write-Host "  [✗] $($dep.Name) 未安装 — 请运行: $($dep.Install)" -ForegroundColor Red
        $allOk = $false
    }
}

# ─── 可选依赖 ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "【可选依赖】" -ForegroundColor Yellow

$optional = @(
    @{ Name = "Python 3"; Cmd = "python";  Install = "winget install Python.Python.3.11" }
    @{ Name = "lean-ctx"; Cmd = "lean-ctx"; Install = "npm install -g lean-ctx" }
    @{ Name = "OpenCLI";  Cmd = "opencli";  Install = "npm install -g @jackwener/opencli" }
    @{ Name = "Playwright"; Cmd = "npx";    Install = "npm install -g playwright" }
)

foreach ($dep in $optional) {
    $cmd = Get-Command $dep.Cmd -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host "  [✓] $($dep.Name)" -ForegroundColor Green
    } else {
        Write-Host "  [ ] $($dep.Name) 未安装 — 如需使用请运行: $($dep.Install)" -ForegroundColor Yellow
    }
}

# ─── 总结 ──────────────────────────────────────────────────────────────
Write-Host ""
if ($allOk) {
    Write-Host "=== 环境检测通过 ===" -ForegroundColor Green
    exit 0
} else {
    Write-Host "=== 环境检测未通过 ===" -ForegroundColor Red
    Write-Host "请先安装标记为 [✗] 的必需依赖。" -ForegroundColor White
    exit 1
}
