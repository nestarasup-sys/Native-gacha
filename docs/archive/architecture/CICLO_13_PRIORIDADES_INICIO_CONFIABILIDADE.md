# Ciclo 13 — prioridades de confiabilidade, começo do trabalho

Data: 2026-10-22. Branch de trabalho `feature/model-source-editor`. PR #5 permanece **draft** sobre `refactor/shared-character-core`. Nenhuma alteração/merge em `main`, formatos legados, BATs ou dados pessoais.

## Cinco prioridades, por risco

1. **Gravação segura de catálogos (P0)** — preservar os PNGs antigos diante de manifestos inconsistentes, escritas interrompidas, falhas de permissão e atualizações parciais. Início concluído neste ciclo: pré-validação de PNGs ausentes antes de qualquer escrita, aplicável a Roupas Dev, rosto e cabelo; testes para ausência de peça e erro EACCES. **Ainda pendente:** protocolo completo de staged writes/rollback para falha durante a escrita de múltiplas imagens ou queda de energia, compatível com DomainFileSystem/SQLite/sidecars paint.
2. **Diagnóstico e restauração assistida, nunca silenciosa (P0/P1)** — descobrir assets idênticos, ausentes e inválidos com hashes, preservando fontes antigas. Início: `scripts/diagnostics/audit-hair-face-images.cjs` para bibliotecas de rosto/cabelo; complemento ao `audit-wardrobe-images.cjs` do incidente anterior. A ferramenta é **somente leitura**. **Pendente:** comparação com backups reais somente depois de uma cópia segura e aprovação explícita; não inferir automaticamente que peças com hash igual são corrupção.
3. **Aceite gráfico de composição pixel a pixel (P1)** — testar Roupas Dev → equipar por componente → troca de pose → Studio → salvar/reabrir, com PNG de cada peça distinto, diferença de pixels comprovada e screenshots revisadas. O Ciclo 12 passou com 11 screenshots reais e verificação de bytes/IDs, mas isso não comprova todas as diferenças visuais na composição de usuário.
4. **Semântica uniforme de componentes por lado (P1)** — extrair seleção, replace/remove, paleta, visibilidade, ajuste e layer order para regras puras compartilhadas, com testes de esquerda/direita e legado `componentId` ausente. Manter autoridade Fabricador para assets fonte; Customizador e Studio guardam apenas overrides.
5. **Observabilidade e prevenção de regressões horizontal (P2)** — diagnósticos por workspace/perfil, métricas de cache sem dados pessoais, audit de fronteiras, orçamentos de páginas e IPC. Não alterar motor de exportação Video Studio sem golden/fixtures específicos.

## Etapa já implementada

`electron/domains/fabricator/catalogPersistence.ts` agora valida **todos os IDs de arquivos não enviados** com `access` **antes** de invocar `writeImage`. Se o manifesto referencia uma imagem ausente ou o arquivo não pode ser acessado, a operação falha sem iniciar a gravação dos outros PNGs. A checagem completa pós-gravação e a promoção do manifesto continuam existentes. Protege os mesmos catálogos publicados por `catalogPersistence`, com Directory/DomainFileSystem injetados e sem alterações de path/manifesto.

**Limite do trabalho inicial:** esta pré-validação não é uma transação atômica de todos os PNGs. Uma falha durante a escrita após o preflight ainda exige estratégia própria de rollback/journal. Não chamar esta etapa de solução total da prioridade 1.

`tests/fabricator-catalog-persistence.test.mjs` ganhou cenários `wardrobe.json`, `hair-style.json` e `face.json` com um PNG existente e outro ausente; comprova que `writeImage` não é chamado e que manifesto/PNG antigo não mudam; também falha simulada EACCES sem tocar no primeiro asset.

`scripts/diagnostics/audit-hair-face-images.cjs` detecta de forma read-only:
- cabelo workspace (`hair.json`) e biblioteca (`hair-style.json`): frente, trás, franja e fonte quando indicada;
- rosto legado (`face.json`): `sheet-*.png` e peças;
- rostos modernos (`item.json`): folha da categoria e peças por ID.

Lista hashes SHA-256, imagens com header inválido, arquivos ausentes e arquivos byte-identical; rejeita IDs de arquivo suspeitos. Complementa a auditoria de roupas do incidente. A função não acessa nomes de perfis automaticamente nem grava alterações. Sintaxe:

```powershell
node scripts/diagnostics/audit-hair-face-images.cjs "CAMINHO_DA_PASTA_COM_HAIR_OU_FACE_JSON"
node scripts/diagnostics/audit-wardrobe-images.cjs "CAMINHO_DA_PASTA_SET-DE-ROUPA"
```

`tests/fabricator-hair-face-integrity.test.mjs` verifica quatro arquivos distintos de cabelo, dois olhos idênticos, falta de olho e rejeição de ID/path inseguro, sem alteração dos arquivos.

## Aceite deste primeiro incremento

- Gates do PR: `npm run audit:architecture`, `npm run test:refactor`, `npm run typecheck` e `npm run build` em Ubuntu/Windows.
- CI gráfica Windows continua rodando após alterações na branch; se falhar, diferenciar erro do fixture e regressão real.
- Nenhum reparo automático em userData. Restaurar arquivos apenas mediante backup confiável, cópia prévia e consentimento do proprietário.
