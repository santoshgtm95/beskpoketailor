@echo off
REM Bespoke Tailor Shop - Build Script for Windows Installer
REM This script builds the standalone installer

setlocal enabledelayedexpansion

echo.
echo ========================================
echo Siam Bespoke Tailor - Installer Builder
echo ========================================
echo.

REM Check if bin directory exists
if not exist "bin" (
    mkdir bin
    echo Created bin directory
)

REM Check if dist directory exists
if not exist "dist" (
    mkdir dist
    echo Created dist directory
)

REM Install dependencies if needed
echo Checking dependencies...
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo ERROR: Failed to install npm dependencies
        pause
        exit /b 1
    )
)

REM Create the executable batch wrapper
echo Creating executable wrapper...
node scripts/build-exe.js
if !errorlevel! neq 0 (
    echo ERROR: Failed to create executable
    pause
    exit /b 1
)

REM Check if NSIS is installed
set MAKENSIS="C:\Program Files (x86)\NSIS\makensis.exe"
if not exist !MAKENSIS! (
    where makensis >nul 2>nul
    if !errorlevel! equ 0 set MAKENSIS=makensis
)

if exist !MAKENSIS! (
    echo.
    echo Building Windows installer with NSIS...
    !MAKENSIS! installer.nsi
    
    if !errorlevel! equ 0 (
        echo.
        echo ========================================
        echo SUCCESS! Installer created:
        echo dist\siam-bespoke-setup.exe
        echo ========================================
        echo.
    ) else (
        echo ERROR: Failed to create installer
        pause
        exit /b 1
    )
) else (
    echo.
    echo WARNING: NSIS is not installed
    echo Standalone batch executable is ready at: bin\beskpoke.bat
    echo.
    echo To create a professional Windows installer:
    echo 1. Download NSIS from: https://nsis.sourceforge.io/
    echo 2. Install NSIS
    echo 3. Run this script again
    echo.
)

echo.
pause

