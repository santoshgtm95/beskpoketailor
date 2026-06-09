@echo off
setlocal enabledelayedexpansion

REM Bespoke Tailor Shop - Advanced Build Script
REM This script creates a completely standalone installation package

set NODE_VERSION=v20.11.1
set NODE_ZIP_URL=https://nodejs.org/dist/%NODE_VERSION%/node-%NODE_VERSION%-win-x64.zip
set NODE_PORTABLE_DIR=bin\node-portable

cls
echo.
echo ========================================
echo Bespoke Tailor - Complete Build Script
echo ========================================
echo.

REM Step 1: Check if bin and dist directories exist
if not exist "bin" mkdir bin
if not exist "dist" mkdir dist

REM Step 2: Install npm dependencies (needed for building)
echo Step 1: Checking dependencies...
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo ERROR: Failed to install npm dependencies
        pause
        exit /b 1
    )
)

REM Step 3: Create the batch launcher
echo Step 2: Creating application launcher...
node scripts/build-exe.js
if !errorlevel! neq 0 (
    echo ERROR: Failed to create launcher
    pause
    exit /b 1
)

REM Step 4: Optional - Download and bundle Node.js portable
echo.
echo Step 3: Node.js bundling option...
echo.
echo The installer CAN bundle Node.js portable so users don't need it installed.
echo This makes the installer larger but completely standalone.
echo.
set /p BUNDLE_NODE="Bundle Node.js portable with installer? (y/n): "
if /i "!BUNDLE_NODE!"=="y" (
    echo.
    echo Downloading Node.js %NODE_VERSION%...
    echo This may take a few minutes...
    echo.
    
    if not exist "!NODE_PORTABLE_DIR!" (
        mkdir "!NODE_PORTABLE_DIR!"
    )
    
    powershell -Command "[System.Net.ServicePointManager]::SecurityProtocol = 3072; (New-Object System.Net.WebClient).DownloadFile('!NODE_ZIP_URL!', 'bin\node-portable.zip')" 2>nul
    
    if !errorlevel! neq 0 (
        echo Using curl instead...
        curl -L -o bin\node-portable.zip !NODE_ZIP_URL!
    )
    
    if !errorlevel! equ 0 (
        echo Extracting Node.js...
        powershell -Command "Expand-Archive -Path 'bin\node-portable.zip' -DestinationPath 'bin\node-portable' -Force"
        
        REM Rename the extracted folder
        cd bin\node-portable
        for /d %%D in (node-*) do (
            REM Move contents up one level
            for /r "%%D" %%F in (*) do (
                if not exist "%%~pF.." mkdir "%%~pF.."
            )
            cd ..
            move "%%D\*" .
            rmdir "%%D"
            cd node-portable
        )
        cd ..\..
        
        del bin\node-portable.zip
        echo ✓ Node.js bundled successfully!
    ) else (
        echo WARNING: Failed to download Node.js
        echo Continuing without bundled Node.js...
    )
) else (
    echo Skipping Node.js bundling.
)

REM Step 5: Create the installer
echo.
echo Step 4: Creating Windows installer...
where makensis >nul 2>nul
if !errorlevel! equ 0 (
    call npm run build:installer
    if !errorlevel! equ 0 (
        echo.
        echo ========================================
        echo SUCCESS! Build Complete
        echo ========================================
        echo.
        if exist "!NODE_PORTABLE_DIR!" (
            echo Installer created: dist\bespoke-tailor-setup.exe
            echo Size: Standalone (includes Node.js - no installation required)
        ) else (
            echo Installer created: dist\bespoke-tailor-setup.exe
            echo Note: Requires Node.js to be installed on target PC
        )
        echo.
    ) else (
        echo ERROR: Failed to create installer
    )
) else (
    echo WARNING: NSIS not installed. Skipping installer creation.
    echo.
    echo Installed files ready at: bin\
    echo To create installer, install NSIS from: https://nsis.sourceforge.io/
)

echo.
pause
