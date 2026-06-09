# Quick Start - Build & Distribute

## For Developers (Building the Installer)

### Step 1: Install Prerequisites

1. **Node.js LTS** - https://nodejs.org/
2. **NSIS** - https://nsis.sourceforge.io/ (FREE)

### Step 2: Build

```bash
# Run from project folder
build.bat
```

Wait for build to complete. You'll see:

- ✓ Executable created: `bin/beskpoke.exe`
- ✓ Installer created: `dist/bespoke-tailor-setup.exe`

### Step 3: Test

```bash
# Test standalone executable
bin/beskpoke.exe

# Or test the installer
dist/bespoke-tailor-setup.exe
```

### Step 4: Distribute

Share `dist/bespoke-tailor-setup.exe` with users

---

## For End Users (Installing)

### Installation

1. Download `bespoke-tailor-setup.exe`
2. Double-click to run installer
3. Click "Install"
4. Click "Finish"

### Using the App

- Desktop shortcut is created automatically
- Double-click "Bespoke Tailor" on desktop
- Browser opens automatically
- Use as normal

### Uninstalling

- Go to Windows Settings → Apps & Features
- Find "Bespoke Tailor Shop Management"
- Click "Uninstall"
- Or use Start Menu → Bespoke Tailor → Uninstall

---

## File Sizes

- **Standalone EXE**: ~70-100 MB
- **Installer**: ~50-80 MB (compressed)

Both are normal sizes as they include Node.js runtime.

---

## What's Different From npm?

### Before (Development)

```bash
npm install
npm start
# Had to have Node.js installed
```

### After (Production - Installer)

```
Double-click installer
Double-click desktop shortcut
# No Node.js needed!
```

---

## Key Features

✓ **No Node.js required** - Everything bundled  
✓ **No npm install needed** - Ready to use  
✓ **Desktop icon** - One-click launch  
✓ **Auto browser** - Opens automatically  
✓ **Professional installer** - Like commercial software  
✓ **Easy uninstall** - Uses Windows native uninstall  
✓ **Data stays local** - All on user's computer

---

## Troubleshooting

| Issue                 | Solution                                      |
| --------------------- | --------------------------------------------- |
| App doesn't start     | Check port 3000 is not in use, run as admin   |
| Desktop icon missing  | Reinstall with admin rights                   |
| Can't build installer | Install NSIS, add to PATH, restart terminal   |
| Large file size       | Normal - includes Node.js runtime             |
| Browser doesn't open  | Check firewall, manually go to localhost:3000 |

---

## More Info

See `BUILD_GUIDE.md` for detailed technical documentation.
