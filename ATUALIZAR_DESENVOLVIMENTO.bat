@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" >nul 2>&1
if errorlevel 1 (
  echo ERRO: Nao foi possivel abrir a pasta do projeto.
  pause
  exit /b 1
)
echo ================================================
echo     NATIVE GACHA - ATUALIZAR CLONE DEV-V3
echo ================================================
echo.
echo Atualiza somente a branch Dev-v3 do GitHub.
echo Nao apaga alteracoes locais, dados ou projetos.
echo.
if not exist "scripts\windows\atualizar-dev-v3.ps1" (
  echo ERRO: O atualizador novo ainda nao existe nesta versao local.
  echo Veja o procedimento "PRIMEIRA ATUALIZACAO" em:
  echo https://github.com/nestarasup-sys/Native-gacha/blob/Dev-v3/docs/editor-v6/engine-v3/CLONE-LOCAL-DEV-V3.md
  goto :failed
)
where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo ERRO: PowerShell do Windows nao foi encontrado.
  goto :failed
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\atualizar-dev-v3.ps1" -RepositoryRoot "%~dp0"
set "RESULTADO=%ERRORLEVEL%"
if not "%RESULTADO%"=="0" goto :failed
echo.
echo A branch Dev-v3 esta atualizada.
echo Para iniciar o app use ABRIR_DESENVOLVIMENTO.bat.
echo Na primeira abertura o npm podera sincronizar as dependencias.
echo.
popd
pause
exit /b 0
:failed
echo.
echo Atualizacao nao concluida. Confira o erro acima.
echo Nenhum reset, limpeza ou descarte automatico foi realizado.
popd
pause
exit /b 1
