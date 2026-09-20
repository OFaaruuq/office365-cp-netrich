@echo off
REM Native production starter for BullMQ worker (NSSM / Task Scheduler).
cd /d "%~dp0..\..\backend"
for /f "usebackq eol=# tokens=1,* delims==" %%A in (`findstr /v /r /c:"^#" /c:"^$" .env`) do (
  if not "%%A"=="" set "%%A=%%B"
)
set NODE_ENV=production
"C:\Program Files\nodejs\npx.cmd" tsx apps/worker/src/main.ts
