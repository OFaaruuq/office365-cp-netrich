@echo off
REM Native production starter for NestJS CSP API (NSSM / Task Scheduler).
cd /d "%~dp0..\..\backend"
for /f "usebackq eol=# tokens=1,* delims==" %%A in (`findstr /v /r /c:"^#" /c:"^$" .env`) do (
  if not "%%A"=="" set "%%A=%%B"
)
set NODE_ENV=production
if "%PORT%"=="" set PORT=8080
"C:\Program Files\nodejs\npx.cmd" tsx apps/api/src/main.ts
