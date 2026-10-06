; Wallraven NSIS installer
Unicode true
CRCCheck force
SetCompressor lzma

!define APP_NAME       "WallRaven"
; Passed in by scripts/build-desktop.mjs as /DAPP_VERSION, read from
; electron/VERSION. The fallback keeps a hand-run makensis working, but
; the build is the source of truth so this file never needs editing for a
; release.
!ifndef APP_VERSION
  !define APP_VERSION  "0.0.0-dev"
!endif
!define APP_PUBLISHER  "WallRaven"
!define APP_EXE        "Wallraven.exe"
!define APP_REG_KEY    "Software\Wallraven"
!define UNINST_KEY     "Software\Microsoft\Windows\CurrentVersion\Uninstall\Wallraven"
!define RUN_KEY        "Software\Microsoft\Windows\CurrentVersion\Run"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
; Per-user install — no admin required, works cleanly with HKCU Run auto-start.
InstallDir "$LOCALAPPDATA\Programs\Wallraven"
InstallDirRegKey HKCU "${APP_REG_KEY}" "InstallDir"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show
BrandingText "WallRaven ${APP_VERSION}"

!include "MUI2.nsh"
!define MUI_ICON   "icon.ico"
!define MUI_UNICON "icon.ico"
; Raven artwork on the installer pages
!define MUI_WELCOMEFINISHPAGE_BITMAP   "${__FILEDIR__}\installer-sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${__FILEDIR__}\installer-sidebar.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH
!define MUI_UNWELCOMEFINISHPAGE_BITMAP_NOSTRETCH
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP    "${__FILEDIR__}\installer-header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP  "${__FILEDIR__}\installer-header.bmp"
!define MUI_HEADERIMAGE_BITMAP_NOSTRETCH
!define MUI_HEADERIMAGE_UNBITMAP_NOSTRETCH
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch WallRaven"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; File details on the installer itself. Without them the exe has no product,
; company or version in its properties, which is what a throwaway dropper looks
; like, and Defender's reputation model scores it accordingly. This does not
; replace signing; it removes one of the signals. VIProductVersion must be four
; numbers, so the build passes APP_VERSION_NUM (1.3.1-beta.2 becomes 1.3.1.2).
!ifndef APP_VERSION_NUM
  !define APP_VERSION_NUM "0.0.0.0"
!endif
VIProductVersion "${APP_VERSION_NUM}"
VIFileVersion "${APP_VERSION_NUM}"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright (c) WallRaven"
VIAddVersionKey "Comments" "Wallpaper manager for Wallhaven. https://wallraven.app"

Section "Install"
  SetOutPath "$INSTDIR"

  ; Kill any running instance so files aren't locked
  nsExec::Exec 'taskkill /F /IM ${APP_EXE}'

  ; Wipe old install (in case of upgrade)
  Delete "$INSTDIR\${APP_EXE}"
  RMDir /r "$INSTDIR\resources\app"
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"

  File /r "app\*.*"
  ; Stable icon file for shortcuts — survives the exe being replaced on
  ; upgrade, which is what used to leave pinned shortcuts showing a blank icon.
  File "icon.ico"

  ; Start Menu + Desktop shortcuts
  CreateDirectory "$SMPROGRAMS\Wallraven"
  CreateShortCut  "$SMPROGRAMS\Wallraven\Wallraven.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icon.ico" 0
  CreateShortCut  "$SMPROGRAMS\Wallraven\Uninstall Wallraven.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut  "$DESKTOP\Wallraven.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icon.ico" 0

  ; Auto-start on login (stable path in LocalAppData)
  WriteRegStr HKCU "${RUN_KEY}" "Wallraven" '"$INSTDIR\${APP_EXE}"'

  ; Uninstaller registration (Add/Remove Programs, per-user)
  WriteRegStr HKCU "${APP_REG_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${APP_REG_KEY}" "Version"    "${APP_VERSION}"

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon"     '"$INSTDIR\icon.ico"'
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Silent (auto-)update: relaunch WallRaven ourselves, since the finish page is skipped
  IfSilent 0 +2
    Exec '"$INSTDIR\${APP_EXE}"'
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM ${APP_EXE}'

  Delete "$SMPROGRAMS\Wallraven\Wallraven.lnk"
  Delete "$SMPROGRAMS\Wallraven\Uninstall Wallraven.lnk"
  RMDir  "$SMPROGRAMS\Wallraven"
  Delete "$DESKTOP\Wallraven.lnk"

  DeleteRegValue HKCU "${RUN_KEY}" "Wallraven"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "${APP_REG_KEY}"

  RMDir /r "$INSTDIR"
SectionEnd
