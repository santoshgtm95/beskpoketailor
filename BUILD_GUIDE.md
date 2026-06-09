# Bespoke Tailor Shop - Windows Installer Setup Guide

## Overview

This guide explains how to create a standalone Windows installer for the Bespoke Tailor Shop Management application. Users can install and run the app without needing Node.js or npm.

## Prerequisites for Building the Installer

### 1. Node.js and npm

- Download and install from: https://nodejs.org/ (LTS recommended)
- Verify installation: `node --version` and `npm --version`

### 2. NSIS (Nullsoft Scriptable Install System)

- Download from: https://nsis.sourceforge.io/
- Choose "Latest stable release"
- Run the installer and install to default location (C:\Program Files (x86)\NSIS\)
- NSIS is FREE and only needed for building

## Building the Installer

### Quick Build (Recommended)

```batch
build.bat
```

This script will:

1. Install/update npm dependencies
2. Build a standalone executable (no Node.js needed)
3. Create the Windows installer with desktop icon

### Manual Build Steps

```bash
# Install dependencies
npm install

# Build standalone executable
npm run build:exe

# Create installer (requires NSIS installed)
npm run build:installer
```

## Output Files

After building:

- **Standalone Executable**: `bin/beskpoke.exe` (can be run directly)
- **Installer**: `dist/bespoke-tailor-setup.exe` (recommended for distribution)

## Distribution to Other PCs

### Option 1: Using the Installer (Recommended)

1. Give `dist/bespoke-tailor-setup.exe` to users
2. Users run the installer
3. Desktop shortcut is created automatically
4. Click shortcut to start the app
5. Browser opens automatically at http://localhost:3000

### Option 2: Using Standalone Executable

1. Give `bin/beskpoke.exe` to users
2. Users can run directly or create their own shortcut
3. Browser opens automatically

## How It Works

### Standalone Executable

- Uses `pkg` to bundle Node.js runtime with your app
- Creates a single .exe file (~50-100MB depending on modules)
- App opens browser automatically when run

### Installer

- Uses NSIS to create professional Windows installer
- Copies files to `C:\Program Files\BespokeTailor\`
- Creates desktop shortcut automatically
- Adds entry to Windows "Add/Remove Programs"
- Includes uninstall functionality

## Requirements for End Users

**NONE!** Users don't need:

- Node.js
- npm
- Administrator rights (for running, but admin needed for install)
- Command line knowledge

Users just need:

- Windows 7 or later (64-bit)
- A web browser (any modern browser works)

## Port Configuration

The app runs on port 3000 by default. To change:

**Before building**, edit `server.js`:

```javascript
const PORT = process.env.PORT || 3000; // Change 3000 to desired port
```

## Troubleshooting

### "makensis is not recognized"

- NSIS not installed or not in PATH
- Solution: Install NSIS from https://nsis.sourceforge.io/
- Then add to PATH or reinstall with "Add to PATH" option

### "pkg is not installed"

- Run: `npm install --save-dev pkg`

### Executable is large (100+ MB)

- This is normal - it includes Node.js runtime
- pkg compresses it with Brotli, but it's still substantial
- You can strip debug symbols if needed (advanced)

### Desktop shortcut not working

- Verify installation completed successfully
- Check `C:\Program Files\BespokeTailor\` exists
- Try reinstalling

## Advanced Customization

### Change Application Name

Edit `installer.nsi`:

```nsi
Name "Your New App Name"
```

### Change Installation Directory

Edit `installer.nsi`:

```nsi
InstallDir "$PROGRAMFILES\YourFolderName"
```

### Add Custom Icon

1. Create a .ico file
2. Add to project root
3. Edit `installer.nsi`:

```nsi
CreateShortCut "$DESKTOP\Your App.lnk" "$INSTDIR\beskpoke.exe" "" "$INSTDIR\icon.ico"
```

### Change Startup Port

Edit `server.js` - change the PORT constant

## File Structure

```
project/
├── build.bat              # Build script
├── installer.nsi          # NSIS installer script
├── package.json           # Updated with build scripts
├── server.js              # Modified to auto-open browser
├── index.html
├── css/
├── js/
├── views/
├── bin/                   # Generated on build
│   └── beskpoke.exe
└── dist/                  # Generated on build
    └── bespoke-tailor-setup.exe
```

## Security Notes

- The app runs on localhost (127.0.0.1) - not accessible from network
- Database file (beskpoke.db) is stored in installation directory
- File uploads go to the uploads/ folder
- All data stays on user's computer

## Next Steps

1. Run `build.bat`
2. Wait for build to complete
3. Find `dist/bespoke-tailor-setup.exe`
4. Test on another Windows PC
5. Distribute to users

## Support

For issues with:

- **Building**: Check that Node.js and NSIS are installed
- **Running**: Ensure port 3000 is not already in use
- **Database**: Check that the app has write permissions in its folder
