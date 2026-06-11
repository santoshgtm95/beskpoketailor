; Bespoke Tailor Shop Management System Installer
; NSIS Script for Windows Installer Creation

!include "MUI2.nsh"
!include "x64.nsh"

; Name and file
Name "Bespoke Tailor Shop Management"
OutFile "dist/siam-bespoke-setup.exe"

; Default installation folder - Using C:\TailorShop to avoid Program Files permission issues
InstallDir "C:\SiamBespoke"

; Request admin privileges for installation
RequestExecutionLevel admin

; MUI Settings
!define MUI_ICON "logo.ico"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Language
!insertmacro MUI_LANGUAGE "English"

; Installer sections
Section "Install"
  SetOutPath "$INSTDIR"
  
  ; Copy the batch launcher
  File "bin\beskpoke.bat"
  
  ; Create necessary directories
  CreateDirectory "$INSTDIR\css"
  CreateDirectory "$INSTDIR\js"
  CreateDirectory "$INSTDIR\views"
  CreateDirectory "$INSTDIR\uploads"
  CreateDirectory "$INSTDIR\node_modules"
  
  ; Copy application files
  SetOutPath "$INSTDIR\css"
  File /r "css\*.*"
  
  SetOutPath "$INSTDIR\js"
  File /r "js\*.*"
  
  SetOutPath "$INSTDIR\views"
  File /r "views\*.*"
  
  SetOutPath "$INSTDIR"
  File "index.html"
  File "server.js"
  File "package.json"
  
  ; Copy pre-installed node_modules
  SetOutPath "$INSTDIR\node_modules"
  File /r "node_modules\*.*"
  
  ; Check if bundled Node.js exists and copy it
  IfFileExists "bin\node-portable\*.*" HasNodePortable NoNodePortable
  
  HasNodePortable:
    SetOutPath "$INSTDIR\node-portable"
    File /r "bin\node-portable\*.*"
    GoTo DoneNode
  
  NoNodePortable:
    ; No bundled Node.js - user must have it installed
  
  DoneNode:
  
  ; Set icon OutPath
  SetOutPath "$INSTDIR"
  File "logo.ico"

  ; Create Desktop shortcut pointing to batch file
  CreateShortCut "$DESKTOP\Siam Bespoke Tailor.lnk" "$INSTDIR\beskpoke.bat" "" "$INSTDIR\logo.ico" 0
  
  ; Create Start Menu folder and shortcuts
  CreateDirectory "$SMPROGRAMS\Siam Bespoke Tailor"
  CreateShortCut "$SMPROGRAMS\Siam Bespoke Tailor\Siam Bespoke Tailor.lnk" "$INSTDIR\beskpoke.bat" "" "$INSTDIR\logo.ico" 0
  CreateShortCut "$SMPROGRAMS\Siam Bespoke Tailor\Uninstall.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0
  
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  ; Register uninstaller in Windows
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SiamBespokeTailor" "DisplayName" "Siam Bespoke Tailor"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SiamBespokeTailor" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\SiamBespokeTailor" "DisplayIcon" "$INSTDIR\logo.ico"
  
SectionEnd

; Uninstaller section
Section "Uninstall"
  ; Remove files
  Delete "$INSTDIR\beskpoke.bat"
  Delete "$INSTDIR\index.html"
  Delete "$INSTDIR\server.js"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\uninstall.exe"
  Delete "$INSTDIR\beskpoke.db"
  
  ; Remove directories
  RMDir /r "$INSTDIR\css"
  RMDir /r "$INSTDIR\js"
  RMDir /r "$INSTDIR\views"
  RMDir /r "$INSTDIR\uploads"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\node-portable"
  RMDir "$INSTDIR"
  
  ; Remove shortcuts
  Delete "$DESKTOP\Bespoke Tailor.lnk"
  Delete "$SMPROGRAMS\Bespoke Tailor\Bespoke Tailor.lnk"
  Delete "$SMPROGRAMS\Bespoke Tailor\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Bespoke Tailor"
  
  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BespokeTailor"
SectionEnd
