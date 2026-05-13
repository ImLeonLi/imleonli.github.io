@echo off
chcp 65001 >nul 2>&1
title Jekyll Dev Server

echo ============================================
echo   Jekyll Chirpy - 一键启动
echo ============================================
echo.

cd /d "D:\Project\ImLeonLi.github.io"
if errorlevel 1 (
    echo [错误] 无法进入项目目录！
    pause
    exit /b 1
)

echo 正在启动 Jekyll 开发服务器...
echo 本地预览: http://127.0.0.1:4110
echo 按 Ctrl+C 停止服务器
echo.

start http://127.0.0.1:4110

call bundle exec jekyll serve --watch --livereload --port 4110

if errorlevel 1 (
    echo.
    echo ============================================
    echo   [错误] Jekyll 启动失败！请查看上方报错信息。
    echo ============================================
)

echo.
pause
