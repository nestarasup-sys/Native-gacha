@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 (
  echo Nao foi possivel acessar a pasta do projeto.
  pause
  exit /b 1
)

rem A branch experimental ativa e Dev-v3. Nunca trocar silenciosamente.
where git >nul 2>&1
if errorlevel 1 (
  echo ERRO: Git for Windows nao foi encontrado.
  pause
  exit /b 1
)
for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "NATIVE_GACHA_BRANCH=%%B"
if not defined NATIVE_GACHA_BRANCH (
  echo ERRO: Nao foi possivel identificar a branch Git atual.
  pause
  exit /b 1
)
if /i not "%NATIVE_GACHA_BRANCH%"=="Dev-v3" (
  echo.
  echo Esta copia esta na branch "%NATIVE_GACHA_BRANCH%".
  echo Para usar a nova engine, atualize e selecione Dev-v3:
  echo   ATUALIZAR_DESENVOLVIMENTO.bat
  echo O aplicativo NAO vai mudar sua branch automaticamente.
  echo.
  pause
  exit /b 1
)
echo Branch ativa: Dev-v3
echo.

rem Native Gacha usa uma porta diferente do G-V5 legado (Vite: 5173).
set "NATIVE_GACHA_DEV_PORT=5188"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale Node.js 22.22.0 ou superior.
  pause
  exit /b 1
)
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 22) ? 0 : 1)" >nul 2>&1
if errorlevel 1 (
  echo Esta versao do Node.js nao e suportada. Instale Node.js 22.22.0 ou superior.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm nao foi encontrado. Reinstale o Node.js com npm.
  pause
  exit /b 1
)

rem Nao executar npm run dev: seu predev migra dados do perfil legado.
rem O helper faz npm ci SOMENTE quando o lockfile/runtime mudou.
if not exist "scripts\windows\ensure-dev-deps.cjs" (
  echo ERRO: Helper de dependencias Dev-v3 ausente nesta copia.
  echo Execute ATUALIZAR_DESENVOLVIMENTO.bat primeiro.
  pause
  exit /b 1
)
node "scripts\windows\ensure-dev-deps.cjs"
if errorlevel 1 (
  echo ERRO: Nao foi possivel sincronizar dependencias da Dev-v3.
  echo Confira o npm e o log acima. Nenhum dado de app-data foi alterado.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo ERRO: Electron nao instalado corretamente.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\electron-vite.cmd" (
  echo ERRO: Electron-Vite ausente apos atualizar dependencias.
  pause
  exit /b 1
)

rem Preview de videos e exportacao precisam de um par FFmpeg + FFprobe.
rem Nao baixar nada se o usuario ja definiu os DOIS executaveis por ambiente.
if defined GACHA_FFMPEG_PATH if defined GACHA_FFPROBE_PATH goto :video_tools_ready
if exist "resources\video-tools\ffmpeg.exe" if exist "resources\video-tools\ffprobe.exe" goto :video_tools_ready
echo.
echo FFmpeg/FFprobe ainda nao foram preparados para o Video Studio.
echo Um pacote LGPL fixado em resources/video-tools.manifest.json sera baixado
echo e verificado por SHA-256 antes da instalacao (somente nesta pasta).
echo.
choice /c SN /n /m "Deseja preparar as ferramentas agora? [S/N] "
if errorlevel 2 goto :video_tools_skip
where powershell >nul 2>&1
if errorlevel 1 (
  echo ERRO: PowerShell do Windows nao foi localizado.
  goto :video_tools_skip
)
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\video-studio\prepare-ffmpeg-lgpl.ps1"
if errorlevel 1 (
  echo AVISO: Nao foi possivel preparar FFmpeg/FFprobe.
  echo Os videos originais ainda poderao ser visualizados, mas a
  echo geracao de proxies e exportacao podem ficar indisponiveis.
  goto :video_tools_skip
)
:video_tools_ready
echo FFmpeg/FFprobe configurados para o Video Studio.
goto :video_tools_done
:video_tools_skip
echo Para instalar depois, rode:
echo powershell -NoProfile -ExecutionPolicy Bypass -File scripts\video-studio\prepare-ffmpeg-lgpl.ps1
:video_tools_done
echo.

rem Config temporaria em node_modules (ignorada pelo Git); nao muda electron.vite.config.ts.
set "DEV_CONFIG=node_modules\.cache\native-gacha-dev-%RANDOM%-%RANDOM%.mts"
if not exist "node_modules\.cache" mkdir "node_modules\.cache"
if errorlevel 1 (
  echo Nao foi possivel preparar a configuracao temporaria.
  pause
  exit /b 1
)
> "%DEV_CONFIG%" echo import baseConfig from '../../electron.vite.config.ts'
>> "%DEV_CONFIG%" echo export default { ...baseConfig, renderer: { ...baseConfig.renderer, server: { host: '127.0.0.1', port: %NATIVE_GACHA_DEV_PORT%, strictPort: true } } }
if errorlevel 1 (
  echo Falha ao escrever a configuracao temporaria.
  del /q "%DEV_CONFIG%" >nul 2>&1
  pause
  exit /b 1
)

echo Iniciando Native Gacha Dev-v3 em modo de desenvolvimento...
echo Servidor exclusivo: http://127.0.0.1:%NATIVE_GACHA_DEV_PORT%
echo O G-V5 legado pode continuar usando localhost:5173.
echo.
echo Este atalho NAO executa o predev de migracao do perfil legado.
echo Os dados deste repositorio permanecem na pasta local app-data.
echo Feche esta janela para encerrar o modo de desenvolvimento.
echo.
rem Evitar npm run dev: seu predev migra dados do G-V5 antigo.
call "node_modules\.bin\electron-vite.cmd" dev --watch --config "%DEV_CONFIG%"
set "devExitCode=%ERRORLEVEL%"
del /q "%DEV_CONFIG%" >nul 2>&1

if not "%devExitCode%"=="0" (
  echo.
  echo O modo de desenvolvimento foi encerrado com erro %devExitCode%.
  echo Confira se a porta %NATIVE_GACHA_DEV_PORT% ja esta em uso.
  pause
)

exit /b %devExitCode%
