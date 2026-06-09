# Bespoke Tailor Shop - Application Launcher

## Quick Start

### Option 1: Run Directly (Windows)
Double-click: `beskpoke.bat`

The application will:
1. Check for bundled Node.js (if available)
2. Fall back to system Node.js if not bundled
3. Install dependencies on first run
4. Open in your default browser

### Option 2: Create a Shortcut
Right-click `beskpoke.bat` → Send to → Desktop (create shortcut)

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
- Database file: `beskpoke.db` in installation folder
- Uploads: `uploads` folder
- All data stays on your computer
