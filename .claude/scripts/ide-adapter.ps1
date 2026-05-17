#!/usr/bin/env pwsh
<#
.SYNOPSIS
    IDE 目录名变量替换器
.DESCRIPTION
    将通用适配产物中的 {IDE_ROOT} 和 {IDE_CONFIG} 变量替换为实际 IDE 的目录名。
    通常在 install.ps1 内部调用，也可单独使用。
.PARAMETER IDE
    目标 IDE：qoder / trae / cursor / windsurf
.PARAMETER SourceDir
    通用适配产物目录
.PARAMETER TargetDir
    目标项目目录
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("qoder", "trae", "cursor", "windsurf")]
    [string]$IDE,

    [string]$SourceDir = (Get-Location),
    [string]$TargetDir = (Get-Location)
)

$ErrorActionPreference = "Stop"

$IDE_MAP = @{
    qoder    = @{ Root = ".qoder"; Config = "qoder.md" }
    trae     = @{ Root = ".trae";  Config = "rules/project_rules.md" }
    cursor   = @{ Root = ".cursor"; Config = ".cursorrules" }
    windsurf = @{ Root = ".windsurf"; Config = ".windsurfrules" }
}

$cfg = $IDE_MAP[$IDE]

Write-Host "=== IDE 变量替换 ===" -ForegroundColor Cyan
Write-Host "IDE      : $IDE" -ForegroundColor White
Write-Host "IDE_ROOT : $($cfg.Root)" -ForegroundColor White
Write-Host "IDE_CFG  : $($cfg.Config)" -ForegroundColor White
Write-Host ""

# 递归替换所有文件中的变量
$files = Get-ChildItem -Path $SourceDir -Recurse -File | Where-Object {
    $_.Extension -in @(".md", ".json", ".cjs", ".js", ".ps1", ".sh", ".template")
}

$count = 0
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -match "\{IDE_ROOT\}|\{IDE_CONFIG\}") {
        $newContent = $content -replace "\{IDE_ROOT\}", $cfg.Root -replace "\{IDE_CONFIG\}", $cfg.Config
        Set-Content -Path $f.FullName -Value $newContent -Encoding UTF8 -NoNewline
        $count++
        Write-Host "  [✓] $($f.FullName.Replace($SourceDir, '.'))" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "共替换 $count 个文件" -ForegroundColor Cyan
