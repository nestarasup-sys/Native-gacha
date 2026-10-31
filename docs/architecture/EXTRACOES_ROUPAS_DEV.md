# Extrações em Roupas DEV — rodada estrutural

## Situação

A área `WardrobeWorkspace.tsx` misturava manipulação de imagem, importações com worker, seleção de poses e renderização. A auditoria arquitetural exige no máximo 630 linhas para esta tela; não alteramos esse limite.

## Mudanças

- `wardrobeImportOperations.ts`: orquestra importação de folha, grade de tronco e grades de manga/calça. Mantém a mesma identidade e ordem dos componentes, tratamento de erro, cancelamento de worker e conteúdo das imagens.
- `wardrobeSleeveCut.ts`: recorte raster de manga/calça em pares. Mantém ID da parte superior e aloca ID apenas para a parte inferior; preserva a decisão de vínculo por osso e transformação.
- `wardrobePoseActions.ts`: seleção e carregamento de poses apenas para prévia, sem gravar a pose.
- `wardrobeWorkspaceModel.ts`: mapeamento de camadas, serialização do modelo e sugestão de osso sem dependência da tela.

## Contratos preservados

Nenhum canal IPC, formato JSON, esquema SQLite, ID já persistido, caminho de perfil, backup ou comportamento de exclusão foi alterado. A tela continua sendo dona do draft e do salvamento; os módulos extraídos se limitam a operações da própria feature. Todas as imagens são publicadas por `wardrobeSaveAssets`.

## Validação

Executar `npm run audit:architecture`, `node --test tests/architecture-audit.test.cjs`, `npm run test:refactor`, `npm run typecheck` e `npm run build`. Testar visualmente no Windows com perfil sintético, especialmente recorte espelhado, testes de poses e restauração após deformação. Não tratar ausência de falhas de compilação como aceite visual.
