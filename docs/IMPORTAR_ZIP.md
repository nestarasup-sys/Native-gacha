# Importação original G-V5 — auditoria e continuidade (issue #1)

O repositório **já contém arquivos-fonte Git versionados** na branch de desenvolvimento
`feature/model-source-editor`, com Electron, React/TypeScript, lockfile, testes e documentação.
A antiga instrução de importar novamente o ZIP e executar `git push origin main` está **obsoleta e perigosa**: NÃO execute nem sobreponha arquivos existentes.

## Origem original (ainda precisa de comprovação independente)

- Arquivo histórico: `G-V5-evolucao-estrutural-2026-10-22.zip`
- SHA-256 original esperado: `e0c0f8f5c8013b9866b45ac395fa59a58c59046a3727bfa6ec16c215e1cfffcd`
- **O ZIP original não foi fornecido junto com o repositório nem está disponível nesta revisão.** Não é possível comprovar bit a bit sua correspondência retroativa com as fontes já importadas, nem declarar a revisão de licenças concluída automaticamente.
- O comando `npm run audit:gv5-import` confere **somente leitura** as fontes rastreadas e possíveis arquivos privados versionados. O relatório identifica explicitamente `originalZipNotAvailable: true`.
- Quando o usuário disponibilizar o ZIP legítimo fora do repositório, executar localmente no Windows:
  ```powershell
  Get-FileHash -Algorithm SHA256 -LiteralPath "C:\\CAMINHO\\G-V5-evolucao-estrutural-2026-10-22.zip"
  npm run audit:gv5-import -- "C:\\CAMINHO\\G-V5-evolucao-estrutural-2026-10-22.zip"
  ```
  Exigir `fullyVerified: true`, além de revisar manualmente que o conteúdo do ZIP corresponde ao inventário pretendido. **Hash válido do ZIP não prova que todos os bytes presentes no Git são os mesmos do ZIP**; a comparação de conteúdo completo exige uma cópia original verificável e uma revisão de diffs. Nunca sobrescrever o checkout ativo para fazer essa comparação.

## Segurança da publicação

1. O GitHub é **público**. Antes de publicar, verifique licenças e direitos sobre **todo** código/asset; um script não consegue atestar titularidade.
2. Execute `npm run audit:gv5-import` e revise `git ls-files` e `git status --short`, em especial perfis reais, credenciais, tokens, `.env`, `node_modules`, bancos SQLite, backups e PNGs pessoais.
3. Caso encontre qualquer material privado já publicado, interrompa novos pushes e trate a exposição com revogação de credenciais e revisão do histórico; excluir só o arquivo da ponta do Git não elimina uma exposição anterior.
4. **Nunca** executar `git push origin main`, merge, force push ou checkout destrutivo sem autorização explícita.

## Validação da implementação atual (Windows)

A branch `feature/model-source-editor` usa PR #5 em rascunho com base em `refactor/shared-character-core`, sem merge na `main`.

```powershell
npm ci
npm run audit:architecture
npm run audit:gv5-import
npm run test:refactor
npm run typecheck
npm run build
```

Conferir o workflow **Core architecture validation — Windows** e **Fabricator — Electron gráfico Windows** no *mesmo commit* da branch, usando apenas perfil e imagens sintéticas. Os testes não validam a instalação real de cada usuário nem substituem uma inspeção estética manual. Nenhuma operação de auditoria altera JSON, SQLite, PNG, projetos ou imagens do usuário.
