@echo off
REM ============================================================
REM BOS System 生产环境启动脚本
REM 双击即可启动
REM ============================================================

cd /d "%~dp0"

echo ========================================
echo   BOS System 生产环境启动中...
echo ========================================
echo.

REM 设置生产环境
set NODE_ENV=production

REM 启动服务
node --experimental-strip-types server.js

echo.
echo 服务已停止，按任意键退出...
pause >nul
