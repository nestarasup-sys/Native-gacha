# Execute a partir do diretorio descompactado, com Git instalado e autenticado.
# Cria um clone limpo e envia o CODIGO (nao o ZIP) ao repositorio existente.
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$remote = 'https://github.com/nestarasup-sys/Native-gacha.git'
$repo = Join-Path (Split-Path -Parent $source) 'Native-gacha-publicacao'
if (Test-Path $repo) { throw "Pasta de destino ja existe: $repo. Nao apague dados automaticamente." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git nao instalado. Instale Git for Windows.' }
Write-Host 'ATENCAO: o repositorio e PUBLICO. Nao envie documentos privados, bancos de dados ou tokens.'
$answer = Read-Host 'Digite PUBLICAR para prosseguir'
if ($answer -cne 'PUBLICAR') { throw 'Cancelado pelo usuario.' }
& git clone $remote $repo
if ($LASTEXITCODE -ne 0) { throw 'Falha no clone/autenticacao do GitHub.' }
Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('.git', 'node_modules', 'out', 'dist', 'release', 'app-data') } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $repo -Recurse -Force
}
Push-Location $repo
try {
  & git add -A
  if ($LASTEXITCODE -ne 0) { throw 'Falha no git add.' }
  $files = & git diff --cached --name-only
  $suspect = @($files | Where-Object { $_ -match '(^|/)(\.env($|\.)|app-data/|node_modules/|.*\.(sqlite|db|key|pem)$)' })
  if ($suspect.Count -gt 0) { $suspect | Write-Warning; throw 'Encontrados arquivos potencialmente confidenciais no staging.' }
  if (-not $files) { Write-Host 'Nenhuma mudanca para publicar.'; exit 0 }
  & git commit -m 'feat: importar codigo G-V5 e base arquitetural Native Gacha'
  if ($LASTEXITCODE -ne 0) { throw 'Falha no commit (confira git config user.name/email).' }
  & git push origin main
  if ($LASTEXITCODE -ne 0) { throw 'Falha no push (confira credenciais/permissoes).' }
  Write-Host "Codigo enviado: https://github.com/nestarasup-sys/Native-gacha"
} finally { Pop-Location }
