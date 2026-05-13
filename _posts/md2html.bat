@echo off
chcp 65001 >nul 2>&1

if "%~1"=="" (
    echo 用法: md2html.bat 文件名.md
    echo 示例: md2html.bat 2026-05-12-coefficient-matrix-and-augmented-matrix.md
    pause
    exit /b 1
)

cd /d "%~dp0"

echo 正在转换 %~nx1 （公式渲染为 SVG）...
node "..\tools\md2html\md2html.js" "%~nx1"

if errorlevel 1 (
    echo [错误] 转换失败！
    pause
    exit /b 1
)

echo 正在用浏览器打开...
start "" "%~n1.html"
pause
