const fs = require("fs");
const path = require("path");

const binDir = path.join(__dirname, "..", "bin");

// Create bin directory if it doesn't exist
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
  console.log("Created bin directory");
}

// Create a smart batch launcher that uses bundled Node.js if available
const launcherContent = `@echo off
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
if exist "!APP_DIR!..\\server.js" (
    set "APP_DIR=!APP_DIR!..\\"
)

REM Try to find bundled Node.js first
if exist "!APP_DIR!node-portable\\node.exe" (
    set "NODE_PATH=!APP_DIR!node-portable\\node.exe"
    echo [OK] Using bundled Node.js
) else if exist "!APP_DIR!node\\node.exe" (
    set "NODE_PATH=!APP_DIR!node\\node.exe"
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
if not exist "node_modules\\" (
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
    if exist "!APP_DIR!node-portable\\npm.cmd" (
        call "!APP_DIR!node-portable\\npm.cmd" install
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
`;

const launcherPath = path.join(binDir, "beskpoke.bat");
fs.writeFileSync(launcherPath, launcherContent);
console.log("✓ Created launcher: bin/beskpoke.bat");

// Also create a simple README for the bin folder
const readmeContent = `# Bespoke Tailor Shop - Application Launcher

## Quick Start

### Option 1: Run Directly (Windows)
Double-click: \`beskpoke.bat\`

The application will:
1. Check for bundled Node.js (if available)
2. Fall back to system Node.js if not bundled
3. Install dependencies on first run
4. Open in your default browser

### Option 2: Create a Shortcut
Right-click \`beskpoke.bat\` → Send to → Desktop (create shortcut)

## Requirements

**If you have the installer version:**
- No additional software needed
- Everything is bundled

**If you have the portable version:**
- Node.js must be installed (download from https://nodejs.org/)
- LTS version recommended

## Troubleshooting

### "Node.js not found"
- Install from https://nodejs.org/ (choose LTS)
- Then try again

### App starts but browser doesn't open
- Open browser manually
- Go to: http://localhost:3000

### Dependencies installation fails
- Check your internet connection
- Try running again
- If still fails, check the console error messages

## Data Location
- Database file: \`beskpoke.db\` in installation folder
- Uploads: \`uploads\` folder
- All data stays on your computer
`;

const readmePath = path.join(binDir, "README.txt");
fs.writeFileSync(readmePath, readmeContent);
console.log("✓ Created README: bin/README.txt");

console.log("");
console.log("========================================");
console.log("✓ Build Files Created");
console.log("========================================");
console.log("");
console.log("Created files:");
console.log("  ✓ bin/beskpoke.bat - Main launcher");
console.log("  ✓ bin/README.txt - Instructions");
console.log("");
console.log("Next steps:");
console.log("  1. Option A: Run 'build-advanced.bat' for Node.js bundling");
console.log("  2. Option B: Run 'npm run build:installer' for installer");
console.log("");
