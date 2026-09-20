@echo off
REM Native production starter for Next.js (NSSM / Task Scheduler).
REM Working directory must be the repo root.
cd /d "%~dp0..\.."
for /f "usebackq eol=# tokens=1,* delims==" %%A in (`findstr /v /r /c:"^#" /c:"^$" .env.production`) do (
  if not "%%A"=="" set "%%A=%%B"
)
set NODE_ENV=production
if "%HOSTNAME%"=="" set HOSTNAME=127.0.0.1
if "%PORT%"=="" set PORT=3000
"C:\Program Files\nodejs\npx.cmd" next start -p %PORT% -H %HOSTNAME%
