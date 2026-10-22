# Importação do G-V5 no Native-gacha

Este repositório foi inicializado com arquivos de configuração. O código-fonte completo deverá ser importado como arquivos rastreados pelo Git, **não** como um único ZIP.

## Antes de importar

1. Confirme que você deseja publicar o código no repositório atual: ele está **público**.
2. Faça backup do pacote original e confira que os arquivos descompactados não contêm credenciais, perfis reais, dados pessoais nem material sem licença de redistribuição.
3. Use o arquivo `G-V5-evolucao-estrutural-2026-10-22.zip`, com SHA-256 `e0c0f8f5c8013b9866b45ac395fa59a58c59046a3727bfa6ec16c215e1cfffcd`.

## Windows (PowerShell)

Salve o ZIP numa pasta conhecida, abra o PowerShell e ajuste o caminho na primeira linha:

```powershell
$zip = "C:\\CAMINHO\\G-V5-evolucao-estrutural-2026-10-22.zip"
$workspace = Join-Path $HOME "Native-gacha"
$tmp = Join-Path $env:TEMP "native-gacha-import"
git clone https://github.com/nestarasup-sys/Native-gacha.git $workspace
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
Get-ChildItem -LiteralPath $tmp -Force | Where-Object { $_.Name -ne ".git" } | Copy-Item -Destination $workspace -Recurse -Force
Set-Location $workspace
git status --short
# Revise os arquivos que serão públicos antes de continuar:
git add .
git diff --cached --stat
git commit -m "feat: importa base G-V5 refatorada"
git push origin main
```

**Nota:** o pacote contém um `README.md` próprio, que substituirá o README inicial. Este guia permanecerá em `docs/IMPORTAR_ZIP.md`.

## Linux/macOS

```bash
git clone https://github.com/nestarasup-sys/Native-gacha.git
mkdir -p /tmp/native-gacha-import
unzip -q G-V5-evolucao-estrutural-2026-10-22.zip -d /tmp/native-gacha-import
cp -a /tmp/native-gacha-import/. Native-gacha/
cd Native-gacha
git status --short
git add .
git diff --cached --stat
git commit -m 'feat: importa base G-V5 refatorada'
git push origin main
```

## Depois de importar

- Instale Node 22.22+ (linha 22) e execute `npm ci`.
- Execute `npm run audit:architecture`, `npm run test:refactor`, `npm run typecheck` e `npm run build`.
- Verifique os resultados do workflow `Quality - core and architecture`.
- Faça smoke test manual no Windows em perfil de usuário sintético, sem usar dados reais.
- Para novas mudanças, trabalhe em branch `refactor/<modulo>` e abra PR para `main`.

**Não abra o aplicativo refatorado no seu perfil real enquanto não houver teste de compatibilidade e restauração de backup.**
