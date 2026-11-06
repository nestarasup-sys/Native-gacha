@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 exit /b 1
for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "NATIVE_GACHA_BRANCH=%%B"
if /i not "%NATIVE_GACHA_BRANCH%"=="refactor/editor-v6-cold-lab" (
  echo Branch incorreta para o laboratorio: %NATIVE_GACHA_BRANCH%
  exit /b 1
)
set "NATIVE_GACHA_DEV_PORT=5199"
where node >nul 2>&1 || (echo Node.js nao encontrado.& exit /b 1)
where npm >nul 2>&1 || (echo npm nao encontrado.& exit /b 1)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=22)?0:1)" >nul 2>&1 || (echo Node.js 22.22.0 ou superior e necessario.& exit /b 1)
if not exist "node_modules\.bin\electron-vite.cmd" (
  echo Instalando dependencias isoladas do laboratorio...
  call npm ci
  if errorlevel 1 exit /b 1
)
if exist "resources\video-tools\ffmpeg.exe" if exist "resources\video-tools\ffprobe.exe" goto :probe_tools
if defined GACHA_FFMPEG_PATH if defined GACHA_FFPROBE_PATH goto :probe_tools
echo FFmpeg e ffprobe precisam estar na pasta resources\video-tools ou configurados por ambiente.
exit /b 1
:probe_tools
set "DEV_CONFIG=node_modules\.cache\native-gacha-lab-%RANDOM%-%RANDOM%.mts"
if not exist "node_modules\.cache" mkdir "node_modules\.cache"
> "%DEV_CONFIG%" echo import baseConfig from '../../electron.vite.config.ts'
>> "%DEV_CONFIG%" echo export default { ...baseConfig, renderer: { ...baseConfig.renderer, server: { host: '127.0.0.1', port: %NATIVE_GACHA_DEV_PORT%, strictPort: true } } }
if errorlevel 1 exit /b 1
echo Laboratorio Native Gacha - porta 5199 - dados isolados em %CD%\app-data
echo Branch: %NATIVE_GACHA_BRANCH%
call "node_modules\.bin\electron-vite.cmd" dev --watch --config "%DEV_CONFIG%"
set "DEV_EXIT=%ERRORLEVEL%"
del /q "%DEV_CONFIG%" >nul 2>&1
exit /b %DEV_EXIT%
