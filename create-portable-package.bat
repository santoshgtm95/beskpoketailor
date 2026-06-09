@echo off
REM Alternative installer creation using batch + zip
REM Creates a standalone installer without NSIS

setlocal enabledelayedexpansion

cls
echo.
echo ========================================
echo Bespoke Tailor - Installer Package
echo ========================================
echo.

REM Check if 7z or tar available
where 7z >nul 2>nul
if !errorlevel! equ 0 (
    set ZIP_CMD=7z a -tzip
    goto CREATE_ZIP
)

where tar >nul 2>nul
if !errorlevel! equ 0 (
    set ZIP_CMD=tar -czf
    goto CREATE_ZIP
)

REM Fallback: Use PowerShell zip
powershell -Command "Compress-Archive -Path @('bin\beskpoke.bat','bin\node-portable','bin\README.txt','index.html','server.js','package.json','js','css','views') -DestinationPath 'dist\bespoke-tailor-portable.zip' -Force"

if !errorlevel! equ 0 (
    echo.
    echo ========================================
    echo ✓ Portable Package Created
    echo ========================================
    echo.
    echo File: dist\bespoke-tailor-portable.zip
    echo.
    echo Distribution Instructions:
    echo 1. Extract on target PC to any folder
    echo 2. Double-click: beskpoke.bat
    echo 3. App opens automatically
    echo.
) else (
    echo ERROR: Failed to create package
)

goto END

:CREATE_ZIP
echo Creating installer package...
%ZIP_CMD% dist\bespoke-tailor-portable.zip ^
    bin\beskpoke.bat ^
    bin\node-portable ^
    bin\README.txt ^
    index.html ^
    server.js ^
    package.json ^
    js ^
    css ^
    views

if !errorlevel! equ 0 (
    echo.
    echo ========================================
    echo ✓ Installer Package Created
    echo ========================================
    echo.
    echo File: dist\bespoke-tailor-portable.zip
    echo Size: Portable (includes everything)
    echo.
) else (
    echo ERROR: Failed to create package
)

:END
echo.
pause
