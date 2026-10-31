# Ciclo 15 — cinco prioridades de estabilização e encaixe das roupas

Data: 22/10/2026. Branch `feature/model-source-editor`, PR #5 draft, base `refactor/shared-character-core`; sem merge na `main`, sem alteração de dados pessoais, BATs, contratos IPC, formatos G-V5/JSON/SQLite ou exportador Video Studio.

## Prioridade crítica adicional — ajustes horizontais/verticais no Fabricador → Customizador

**Relato:** depois de editar posição X/Y e escala horizontal/vertical por peça no Roupas Dev, o personagem equipado pode aparecer no Customizador sem a calibração.

**Causa encontrada no código:** `mapWardrobeComponentToPose` usava `component.binding` sem reconciliá-lo com `component.x/y/width/height/rotation`. Assim, um binding salvo desatualizado prevalecia sobre o encaixe manual autorado. Ainda havia outro caminho para perpetuação: `WardrobeWorkspace.updateComponent` só recomputava o binding para certas modificações se o componente já tivesse binding; itens antigos sem binding podiam continuar assim após ajuste.

**Correção:** `src/shared/wardrobePose.ts` calcula o vínculo atual contra o osso de origem e confere centro X/Y, largura/altura normalizadas, rotação e geometria do osso. Se os valores salvos divergem, usa a projeção recalculada a partir do componente, sem editar o manifesto original. `WardrobeWorkspace.tsx` passa a renovar binding em qualquer edição com osso válido, inclusive em roupas legadas. Não inventa ligação quando o osso não existe.

**Regressões:** `tests/wardrobe-authoring-continuity.test.mjs` verifica offsets X/Y, scaleX/scaleY não uniformes e binding recente/desatualizado, na folha original e em pose escalada, sem alteração da fonte.

## 1. Windows Electron — mangas/salvar/fechar/reabrir

Fixture sintética com casaco, manga esquerda e direita de cores exclusivas, posições X/Y deliberadamente diferentes e dimensões horizontais/verticais não uniformes, manifestando binding real. O workflow `fabricator-real-ui-windows.yml` continua executando em dois processos Electron no mesmo sandbox.

**Lição importante ao revisar o artefato anterior do Ciclo 14:** os hashes dos 11 screenshots foram validados, mas algumas telas tinham *“Carregando área...”* e o Roupas Dev exibia nenhum conjunto aberto. SHA256 sozinho não é comprovação de conteúdo visual. Por isso a captura `visualUiCapture.ts` agora aguarda a carga real da UI, abre a roupa sintética na lista de conjuntos do Fabricador, exige três imagens, seleciona o personagem salvo pela UI e mede os pixels de cores esperadas no `img.customizer-wardrobe-overlay` para conferir o eixo X e Y. O relatório `wardrobe-pixels.json` registra centroides e contagens por peça; `review-real-ui-captures.cjs` o exige e rejeita hashes sem prova de composição. Novos testes rejeitam screenshot sem roupa e centroides invertidos. São dados sintéticos; fotos reais pessoais não são usadas.

**Limite:** o teste automatizado Windows não substitui instalar e testar na máquina do usuário; revisão humana de aparência continua requisito para aceite.

## 2. Escritas concorrentes, journal PNG e SQLite

`catalogPersistence.ts`: fila serial por pasta de conjunto para operações de salvar e recuperar journals, evitando que uma leitura de recuperação interprete uma transação ativa como queda. `recoverLegacyWardrobeManifest` e `commitWardrobeManifest` verificam existência do manifesto e backup antes do `rename` (o DomainFileSystem SQLite responde a arquivo ausente de modo diferente de `fs.promises`). `tests/fabricator-catalog-image-transaction.test.mjs` inclui escrita v1/v2 concorrente com recuperação.

`tests/sqlite-catalog-studio-continuity.test.mjs` testa DataPlatform + DomainFileSystem com domínios ativados, mangas isoladas e documentos Studio/Video Studio. No runner Windows, o `os.tmpdir()` do ambiente usa alias curto `RUNNER~1`, rejeitado pela verificação de caminho canônico da plataforma: o teste passou a usar um sandbox temporário dentro do workspace canônico, **sem relaxar a segurança do DataPlatform**.

## 3. Criação/importação/duplicação/autosave Studios

`electron/domains/studio/documentPersistence.ts` agora serializa `readStudio`, `writeStudio` e `removeStudio` por (workspace, ID), abrangendo chamadas IPC diretas além do autosave React. Em `StudioPage.tsx`, a geração da miniatura foi movida para **dentro** da fila de salvamento para impedir que um thumbnail antigo demorado termine depois do documento novo. `tests/studio-document-persistence.test.mjs` cobre corrida de dois writes e read, exclusão, além da separação entre Studio e Video Studio.

**Limite:** filas são intra-processo, não travas distribuídas entre processos Electron abertos simultaneamente; continuar usando journal por pasta para crash recovery.

## 4. Capturas, regressão visual, desempenho

`visualUiCapture.ts` aguarda visibilidade e ausência de placeholder, valida pixels das peças no Customizador, registra erros do DOM em caso de falha. `review-real-ui-captures.cjs` rejeita falta de comprovante e exige foto do Fabricador com conjunto aberto. Testes `fabricator-workspace-real-ui-review.test.mjs`, `fabricator-real-ui-review.test.mjs` atualizados. As medições de duração `timingsMs` feitas no Ciclo 14 continuam no artifact; não há baseline de pixels automaticamente aprovada. Revisão humana é separada.

## Gates de aceite

`npm run test:refactor`, `npm run audit:architecture`, `npm run typecheck`, `npm run build`, Core Ubuntu/Windows, Quality Linux e workflow Electron Windows de 11 PNGs; verificar **HEAD exato**. Não declarar a revisão concluída quando uma captura apenas tem hash ou se o job está pendente/vermelho.

## Preservação

Nenhuma operação de produção em perfis pessoais. Fabricador continua autoridade da geometria e imagens de roupa; Customizador armazena somente offsets próprios adicionais; Studio mantém seus snapshots; vídeo export continua sem alterações. Recuperação histórica de PNGs alterados requer backup confiável e aceite explícito, nunca reconstrução automática.
