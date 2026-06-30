@echo off
REM Alternative installer creation using batch + zip
REM Creates a standalone installer without NSIS

setlocal enabledelayedexpansion

cls
echo.
echo ========================================
echo Bespoke Tailor - Portable Package Creator
echo ========================================
echo.

REM Ensure Node.js portable exists
if not exist "bin\node-portable\node.exe" (
    echo [INFO] Node.js portable not found. Running build.bat to set up environment...
    call build.bat
)

REM Set up staging directory
set "STAGING_DIR=dist\portable-staging"
if exist "!STAGING_DIR!" rmdir /s /q "!STAGING_DIR!"
mkdir "!STAGING_DIR!"

echo Copying application files to staging...
REM Copy files directly to the root of staging
copy "bin\beskpoke.bat" "!STAGING_DIR!\" >nul
copy "bin\README.txt" "!STAGING_DIR!\" >nul
copy "index.html" "!STAGING_DIR!\" >nul
copy "server.js" "!STAGING_DIR!\" >nul
copy "package.json" "!STAGING_DIR!\" >nul
if exist "logo.png" copy "logo.png" "!STAGING_DIR!\" >nul
if exist "logo.ico" copy "logo.ico" "!STAGING_DIR!\" >nul

echo Copying node-portable...
mkdir "!STAGING_DIR!\node-portable"
xcopy /e /y "bin\node-portable\*" "!STAGING_DIR!\node-portable\" >nul

echo Copying application directories...
mkdir "!STAGING_DIR!\js"
xcopy /e /y "js\*" "!STAGING_DIR!\js\" >nul

mkdir "!STAGING_DIR!\css"
xcopy /e /y "css\*" "!STAGING_DIR!\css\" >nul

mkdir "!STAGING_DIR!\views"
xcopy /e /y "views\*" "!STAGING_DIR!\views\" >nul

if exist "node_modules" (
    echo Copying node_modules, this may take a minute...
    mkdir "!STAGING_DIR!\node_modules"
    xcopy /e /y "node_modules\*" "!STAGING_DIR!\node_modules\" >nul
)

echo Creating portable zip package...
set "ZIP_FILE=dist\bespoke-tailor-portable.zip"
if exist "!ZIP_FILE!" del /f /q "!ZIP_FILE!"

REM Check if 7z is available
where 7z >nul 2>nul
if !errorlevel! equ 0 (
    echo [INFO] Using 7-Zip for fast compression...
    cd "!STAGING_DIR!"
    7z a -tzip -mx5 "..\..\!ZIP_FILE!" * >nul
    cd ..\..
    set "COMPRESS_OK=1"
    goto ZIP_DONE
)

REM Check if tar is available (built-in on Windows 10/11)
where tar >nul 2>nul
if !errorlevel! equ 0 (
    echo [INFO] Using tar for fast compression...
    cd "!STAGING_DIR!"
    tar -a -cf "..\..\!ZIP_FILE!" * >nul
    cd ..\..
    set "COMPRESS_OK=1"
    goto ZIP_DONE
)

REM Fallback to PowerShell
echo [INFO] Using PowerShell (this might take a few minutes)...
powershell -Command "Compress-Archive -Path '!STAGING_DIR!\*' -DestinationPath '!ZIP_FILE!' -Force"
if !errorlevel! equ 0 (
    set "COMPRESS_OK=1"
) else (
    set "COMPRESS_OK=0"
)

:ZIP_DONE
if "!COMPRESS_OK!"=="1" (
    echo.
    echo ========================================
    echo ✓ Portable Package Created Successfully!
    echo ========================================
    echo.
    echo File: !ZIP_FILE!
    echo.
    echo Distribution Instructions:
    echo 1. Extract the ZIP on the target PC
    echo 2. Double-click: beskpoke.bat
    echo.
) else (
    echo.
    echo ERROR: Failed to create package
    echo.
)

REM Clean up staging
if exist "!STAGING_DIR!" rmdir /s /q "!STAGING_DIR!"

pause
