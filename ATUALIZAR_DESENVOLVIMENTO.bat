@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 (
  echo ERRO: Nao foi possivel abrir a pasta do projeto.
  goto :error
)

rem Branch oficial do desenvolvimento do Native Gacha.
set "DEV_BRANCH=feature/model-source-editor"

echo ================================================
echo   NATIVE GACHA - ATUALIZAR DESENVOLVIMENTO
echo ================================================
echo.
echo Repositorio: nestarasup-sys/Native-gacha
echo Branch: %DEV_BRANCH%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERRO: Git nao foi encontrado. Instale Git for Windows.
  goto :error
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo ERRO: Esta pasta nao e um clone Git.
  echo Faca o clone do repositorio antes de usar este BAT.
  goto :error
)

rem Evita atualizar o repositorio errado por engano.
git remote get-url origin 2>nul | findstr /i /c:"nestarasup-sys/Native-gacha" >nul
if errorlevel 1 (
  echo ERRO: O remote origin nao aponta para Native-gacha.
  goto :error
)

rem Nao descarta alteracoes locais, mesmo arquivos novos nao ignorados.
for /f "delims=" %%L in ('git status --porcelain --untracked-files=normal') do goto :dirty

echo Buscando atualizacoes da branch de desenvolvimento...
git fetch origin "refs/heads/%DEV_BRANCH%:refs/remotes/origin/%DEV_BRANCH%"
if errorlevel 1 (
  echo ERRO: Nao foi possivel consultar a branch no GitHub.
  goto :error
)

rem Troca de branch apenas com a pasta limpa.
git show-ref --quiet --verify "refs/heads/%DEV_BRANCH%"
if errorlevel 1 (
  echo Configurando a branch de desenvolvimento neste computador...
  git switch --track -c "%DEV_BRANCH%" "origin/%DEV_BRANCH%"
) else (
  git switch "%DEV_BRANCH%"
)
if errorlevel 1 (
  echo ERRO: Nao foi possivel selecionar a branch de desenvolvimento.
  goto :error
)

echo Atualizando sem rebase, reset ou sobrescrita forçada...
git pull --ff-only origin "%DEV_BRANCH%"
if errorlevel 1 (
  echo ERRO: A atualizacao nao pode ser feita com fast-forward.
  echo Seu historico local sera preservado. Resolva a divergencia manualmente.
  goto :error
)

echo.
echo Atualizacao concluida com sucesso.
echo Branch ativa:
git branch --show-current
echo.
echo Para iniciar o app, abra ABRIR_DESENVOLVIMENTO.bat.
echo Se package.json mudou, execute npm install antes de iniciar.
echo.
pause
exit /b 0

:dirty
echo ERRO: Existem arquivos modificados ou novos nesta pasta.
echo Nada foi alterado. Salve seu trabalho com commit ou stash primeiro.
goto :error

:error
echo.
echo Atualizacao interrompida. Nenhum reset ou exclusao foi executado.
echo.
pause
exit /b 1
