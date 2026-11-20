# Este atalho historico foi usado para o primeiro upload da base na branch main.
# Ele NAO serve para atualizar um clone local e foi desativado para proteger
# Main/Dev-V2/Dev-v3 de publicacoes acidentais.
$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host 'PUBLICAR_NO_GITHUB.ps1 foi desativado por seguranca.' -ForegroundColor Yellow
Write-Host 'Para TRAZER atualizacoes GitHub -> computador, use ATUALIZAR_DESENVOLVIMENTO.bat.'
Write-Host 'Para enviar commits locais, use um fluxo Git explicito e revise a branch de destino.'
Write-Host 'Nenhum push, copia, exclusao ou alteracao foi executado.'
exit 1
