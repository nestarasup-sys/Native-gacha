# Native Gacha: atualizacao segura de um clone Git antigo para Dev-v3.
# Este script nunca executa reset, clean, rebase, stash, push ou migracao de app-data.
param(
  [string]$RepositoryRoot = (Join-Path (Join-Path $PSScriptRoot '..') '..')
)
$ErrorActionPreference = 'Stop'
$branch = 'Dev-v3'

function GitChecked([string[]]$Arguments) {
  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw ("Comando Git falhou: git " + ($Arguments -join ' '))
  }
}
try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Instale o Git for Windows antes de atualizar.' }
  $folder = (Resolve-Path -LiteralPath $RepositoryRoot -ErrorAction Stop).Path
  Push-Location -LiteralPath $folder
  try {
    $gitRoot = (& git rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $gitRoot) { throw 'Esta pasta nao e um repositorio Git. Clone o projeto primeiro.' }
    $canonicalGitRoot = [IO.Path]::GetFullPath(([string]$gitRoot).Replace('/', '\')).TrimEnd('\')
    $canonicalFolder = [IO.Path]::GetFullPath($folder).TrimEnd('\')
    if ($canonicalFolder -ine $canonicalGitRoot) { throw 'Execute o BAT na raiz do clone; pasta diferente da raiz Git.' }

    $remote = (& git config --get remote.origin.url)
    if ($LASTEXITCODE -ne 0 -or -not $remote) { throw 'Remote origin ausente no clone.' }
    $remote = ([string]$remote).Trim()
    $validOrigin = $remote -match '^https://github\.com/nestarasup-sys/Native-gacha(?:\.git)?/?$' -or
      $remote -match '^git@github\.com:nestarasup-sys/Native-gacha(?:\.git)?$' -or
      $remote -match '^ssh://git@github\.com/nestarasup-sys/Native-gacha(?:\.git)?/?$'
    if (-not $validOrigin) {
      throw ("Origin diferente do repositorio esperado: " + $remote + ". Nenhuma alteracao executada.")
    }

    $dirty = @(& git status --porcelain --untracked-files=normal)
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel conferir o estado local do Git.' }
    if ($dirty.Count -gt 0) {
      Write-Host 'Alteracoes locais encontradas (apenas nomes Git, sem examinar dados privados):'
      & git status --short
      throw 'Pasta com arquivos modificados ou novos. Faca commit ou guarde uma copia antes de atualizar. Nada foi descartado.'
    }

    $current = (& git branch --show-current)
    if ($LASTEXITCODE -ne 0 -or -not $current) { throw 'HEAD destacado. Selecione uma branch antes de atualizar.' }
    Write-Host ("Branch local antes da atualizacao: " + ([string]$current).Trim())
    Write-Host ("Buscando somente origin/" + $branch + "...")
    GitChecked @('fetch', '--no-tags', 'origin', ('refs/heads/' + $branch + ':refs/remotes/origin/' + $branch))

    & git show-ref --verify --quiet ('refs/heads/' + $branch)
    $localExists = ($LASTEXITCODE -eq 0)
    if ($localExists) {
      Write-Host ("Selecionando a branch local " + $branch + "...")
      GitChecked @('switch', $branch)
    } else {
      Write-Host ("Criando a branch local " + $branch + " sem alterar a historica...")
      GitChecked @('switch', '--track', '-c', $branch, ('origin/' + $branch))
    }

    Write-Host 'Aplicando somente fast-forward; nenhum merge/rebase/reset automatico.'
    GitChecked @('merge', '--ff-only', ('origin/' + $branch))
    GitChecked @('branch', '--set-upstream-to', ('origin/' + $branch), $branch)
    $head = (& git rev-parse --short HEAD)
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao obter o HEAD atualizado.' }
    Write-Host ''
    Write-Host ("OK: " + $branch + " sincronizada com origin/" + $branch + ", commit " + ([string]$head).Trim())
    Write-Host 'Dev-V2, main, app-data e os projetos de usuario nao foram alterados.'
  } finally {
    Pop-Location
  }
} catch {
  Write-Host ''
  Write-Host ('ATUALIZACAO INTERROMPIDA: ' + $_.Exception.Message) -ForegroundColor Red
  Write-Host 'Nao foi usado reset --hard, clean, stash, rebase, force-push ou exclusao de dados.'
  exit 1
}
exit 0
