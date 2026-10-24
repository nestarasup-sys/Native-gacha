# Ciclo 11 — fecho das pendências arquiteturais do Ciclo 10

Data: 2026-10-22.
Branch: `feature/model-source-editor`; PR #5 draft → `refactor/shared-character-core`.
**Não fundir na main sem autorização.** BATs de desenvolvimento, perfis de usuários, contratos IPC e diretórios JSON/SQLite permanecem inalterados.

## A. Persistência de documentos Studio fora do Electron Main

Novo `electron/domains/studio/documentPersistence.ts`, criado por `createStudioDocumentPersistence(deps)`. Agora concentra:
- Normalização legada do formato `studio.json` em leitura;
- `readStudio`: reidratação dos PNGs externos pelo manifest e quadros `@video-frame:SHA256` com cache verificado;
- `writeStudio`: gravação de assets e snapshots, quadros de vídeo por hash, manifesto temporário publicado por `publishJsonManifest`, card leve do Video Studio após commit;
- `removeStudio`: valida UUID e confinamento ao diretório do workspace, incluindo verificação da biblioteca para Video Studio antes da exclusão.

`electron/main.ts` injeta `DomainFileSystem`, paths originais, normalizador de imagens, validadores existentes, biblioteca de vídeo e gerador do card. Mantém as filas serializadas, os mesmos canais IPC e as filas de flush/backup. `libraryIndex.ts` continua responsável pela enumeração.

**Cautela:** promoção de manifesto é segura após falha no rename, mas operações multi-asset não equivalem a uma transação distribuída SQLite+PNG. Falhas abruptas entre a gravação de PNGs e a promoção podem manter um PNG recém-escrito com manifesto anterior. Não afirmar atomicidade total de todas as mídias legadas.

Teste: `tests/studio-document-persistence.test.mjs` com projeto sintético, PNG real em disco, hash SHA256, reabertura, frame externalizado, dois projetos independentes, falha de rename, limpeza de temporário, remoção protegida e diferença entre Studio e Video Studio.

## B. Estado de Customizador e Studio separado por responsabilidade

Customizador:
- `useCustomizerCharacterRoster.ts`: elenco e seleção persistida, já criado no Ciclo 10;
- `useCustomizerModelBrowserState.ts`: pesquisa, seleção, categorias, páginas e thumbnails dos modelos/poses;
- `useCustomizerAssetLibraryState.ts`: estado de bibliotecas de roupas, face, cabelos, efeitos e caches de catálogos sem acesso direto a arquivos.

Studio:
- `useStudioInspectorState.ts`: inspector, coleções/presets, poses e rosto, guardando ref de aba por personagem;
- `src/shared/studioSceneModel.ts`: snapshots e cálculos puros de cena já criados no Ciclo 10.

Os hooks usam React, mas não conhecem Electron/arquivos/SQLite diretamente. A orquestração de edição que ainda depende de callbacks e referências da página permanece em `CustomizerPage.tsx` / `StudioPage.tsx`; não foi feita uma reescrita visual arriscada.

`scripts/architecture/performance-audit.cjs` reduz os limites: Main 2600 linhas, Customizador 2930, Studio 1645. Linhas são limites anti-regressão, não uma métrica única de qualidade.

## C. Exercício gráfico do Electron real no Windows

`.github/workflows/fabricator-real-ui-windows.yml` roda também em `pull_request` destinado à base `refactor/shared-character-core` e usa Windows com instalação integral do Electron em perfil **sintético**.

O runner testa:
1. Captura real de oito seções do Fabricador DEV, checando se cada botão de seção está ativo;
2. Navegação para o **Customizador**, aguardando montar o elenco, captura PNG;
3. Navegação para o **Studio Principal**, clique em **Criar**, aguarda card e clica para **abrir a cena** antes da captura;
4. `review-real-ui-captures.cjs --with-workspaces`: verifica os dez PNGs, manifestos, dimensões e SHA256;
5. Publica screenshots por 14 dias como artefato, sem abrir ou alterar biblioteca do usuário.

`tests/fabricator-workspace-real-ui-review.test.mjs` exercita adulteração de imagem e manifesto com PNGs artificiais; **não é evidência de uma tela Electron renderizada**. O workflow real é a evidência gráfica automatizada. Aprovação humana das dez imagens e comparação contra baseline aceita permanecem uma decisão explícita separada: hash e teste de montagem não certificam a estética.

## Portões de aceite

- `npm run audit:architecture`
- `npm run test:refactor` incluindo `tests/studio-document-persistence.test.mjs`, `tests/fabricator-workspace-real-ui-review.test.mjs`, `tests/cycle11-pending-boundaries.test.mjs`
- `npm run typecheck` e `npm run build`, Linux/Windows.
- Workflow dedicado `Fabricator - screenshots reais Windows` completado e artefato com dez PNGs disponível.

As funções de banco G-V5, backups, perfis e Video Studio (motor de exportação) não são substituídas. O E2E gráfico de ponta a ponta com ajustes manuais no personagem real não é coberto por este smoke; o teste usa um perfil sintético e captura criação de cena real.
