@echo off
setlocal
cd /d "%~dp0"
title WallRaven (running from source)

REM Runs the tray app straight from this folder, with no installer and no
REM build step. Double-click it. Everything below is a check, not a step to
REM take by hand.

where node >nul 2>&1
if errorlevel 1 goto nonode

if not exist "node_modules\electron" goto install
goto choose

:install
echo.
echo First run: downloading what the app needs to run.
echo This takes a few minutes and only happens once.
echo.
call npm install
if errorlevel 1 goto installfailed
goto choose

:choose
echo.
echo   1   Normal profile
echo       Uses your real settings, cache, history and playlists.
echo       Quit WallRaven from the system tray first, or this will just
echo       reopen the copy that is already running.
echo.
echo   2   Clean profile
echo       A throwaway profile with nothing in it. Runs happily alongside
echo       the installed copy. Its tray icon says "WallRaven (dev)".
echo.
set "pick="
set /p pick=Which one? [1] 
echo.
if "%pick%"=="2" goto clean
goto normal

:normal
call npm run app
goto done

:clean
call npm run app:clean
goto done

:nonode
echo.
echo Node.js is not installed on this PC, and the app needs it to run from
echo source. Install the LTS version from https://nodejs.org, then run this
echo again. Nothing else is needed.
echo.
pause
exit /b 1

:installfailed
echo.
echo The download failed, so the app was not started. The message above says
echo why. Nothing has been changed on this PC.
echo.
pause
exit /b 1

:done
echo.
echo WallRaven has closed. This window can be closed too.
pause
