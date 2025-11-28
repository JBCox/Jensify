@echo off
REM Smart Chrome Dev Launcher
REM Only launches if a dev server is running on common ports

REM Check common dev ports: 3000, 4000, 4200, 5000
set "DEV_URL="

netstat -an | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 set "DEV_URL=http://localhost:3000"

netstat -an | findstr ":4000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 set "DEV_URL=http://localhost:4000"

netstat -an | findstr ":4200 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 set "DEV_URL=http://localhost:4200"

netstat -an | findstr ":5000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 set "DEV_URL=http://localhost:5000"

REM Exit silently if no dev server is running
if "%DEV_URL%"=="" (
    exit /b 0
)

REM Launch Chrome with DevTools debugging and no prompts
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --disable-save-password-bubble ^
  --disable-infobars ^
  --disable-notifications ^
  --disable-popup-blocking ^
  --password-store=basic ^
  --no-default-browser-check ^
  --disable-component-update ^
  --disable-background-networking ^
  --disable-sync ^
  --user-data-dir="C:\Jensify\ChromeDevProfile" ^
  %DEV_URL%
