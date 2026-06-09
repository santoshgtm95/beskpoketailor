@echo off
setlocal enabledelayedexpansion

REM Siam Bespoke Tailor - Intelligent Launcher
REM Supports both bundled and system Node.js

cls
echo.
echo ========================================
echo Siam Bespoke Tailor Management
echo ========================================
echo.

REM Set the app directory to where the batch file is
set "APP_DIR=%~dp0"

REM If we are in a 'bin' subfolder (development), move up one
if exist "!APP_DIR!..\server.js" (
    set "APP_DIR=!APP_DIR!..\"
)

REM Try to find bundled Node.js first
if exist "!APP_DIR!node-portable\node.exe" (
    set "NODE_PATH=!APP_DIR!node-portable\node.exe"
    echo [OK] Using bundled Node.js
) else if exist "!APP_DIR!node\node.exe" (
    set "NODE_PATH=!APP_DIR!node\node.exe"
    echo [OK] Using bundled Node.js
) else (
    REM Fall back to system Node.js
    for /f "tokens=*" %%i in ('where node 2^>nul') do set "NODE_PATH=%%i"
    if "!NODE_PATH!"=="" (
        echo.
        echo ERROR: Node.js was not found on this computer.
        echo.
        echo Please install Node.js from: https://nodejs.org/
        echo or ensure you have the 'node-portable' folder in your app directory.
        echo.
        pause
        exit /b 1
    )
    echo [OK] Using system Node.js
)

echo.

REM Navigate to app directory
cd /d "!APP_DIR!"

REM Check if this is first run or if node_modules are missing
if not exist "node_modules\" (
    echo [INFO] node_modules folder is missing. Attempting setup...
    
    REM Check if we have write permissions
    echo > .test_perms 2>nul
    if !errorlevel! neq 0 (
        echo.
        echo ============================================================
        echo ERROR: NO WRITE PERMISSIONS
        echo ============================================================
        echo The application is installed in a protected folder:
        echo !APP_DIR!
        echo.
        echo Please Right-Click the shortcut and select:
        echo "RUN AS ADMINISTRATOR" to complete the first-time setup.
        echo ============================================================
        echo.
        pause
        exit /b 1
    )
    del .test_perms

    echo [INFO] Installing dependencies, please wait...
    
    REM Use npm from the bundled Node.js if available
    if exist "!APP_DIR!node-portable\npm.cmd" (
        call "!APP_DIR!node-portable\npm.cmd" install
    ) else (
        call npm install
    )
    
    if !errorlevel! neq 0 (
        echo.
        echo ERROR: Failed to install dependencies.
        echo Please check your internet connection or run as Administrator.
        echo.
        pause
        exit /b 1
    )
)

REM Start the application
echo [INFO] Starting application server...
echo [INFO] Opening browser at http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.
echo ========================================

set "NODE_ENV=production"
"!NODE_PATH!" server.js

pause
