# Ciclo estrutural 04 — previews, screenshot Electron, IPC, recuperação

Branch de trabalho: `feature/model-source-editor`. Não alterar `main` fora de PR. Video Studio pode ser modificado no futuro, porém não faz parte destas prioridades.

## 1. Previews com o Model Source original

O adaptador `projectForOriginalPreview` em `src/shared/fabricatorModelViews.ts` projeta as dimensões e coordenadas da folha (preferindo `sourceTransform`) sem gravar dados e sem modificar a montagem persistida.

- Olhos, Rosto, Cabeças Extras, Cabelos, Expressões e Animador de Rosto recebem a imagem-base no estado de referência.
- Roupas DEV usa a fonte original em sua referência; pose de teste continua independente e não é reescrita.
- Animador DEV usa a base original quando não há pose selecionada; ao escolher personagem/pose, a pose existente é a origem da animação, sem reescrevê-la.
- **Poses DEV permanece exceção**, usando a montagem do Modelos DEV.
- Os conteúdos de arquivos de biblioteca não são migrados automaticamente.

A publicação emite um evento por slot; `useModelSourceRefresh` aceita apenas um carregamento cujo `sourceAssetName` coincide com a versão publicada e cuja requisição é a última. Isso evita sobrescrever previews com resposta antiga.

## 2. Smoke visual real do Electron

`npm run test:fabricator:electron-visual` abre Chromium real do Electron, desenha dois modelos sintéticos em Canvas, captura **dois PNGs** em diretório temporário e compara buffers RGBA com o pixel oracle. Precisa da instalação nativa do Electron na máquina e **não integra ainda a CI automatizada**.

Este smoke verifica o motor gráfico real, mas não é captura visual integral das telas Fabricador/Customizador/Studio. Para aprovação visual completa, testar o aplicativo Windows com um modelo real e capturas estáveis de folha, cabeça, chroma, roupas e expressões.

## 3. Canais IPC de Poses e Animador

`electron/domains/fabricator/poseIpc.ts` e `animatorIpc.ts` isolam respectivamente 9 e 8 canais, preservando autorização `assertTrustedSender`, filas de gravação, validações de slot, migração legada e os mesmos JSON/PNG. O `electron/main.ts` apenas injeta as dependências e centraliza o estado da fila.

Testes registram handlers em transporte simulado, verificando canal estável, rejeição de origem não autorizada e manutenção da fila.

## 4. Recuperação do Model Source

`modelSourceRecovery.ts` procura restauração somente quando o slot oficial está ausente e somente de backups completos.

Antes da troca de diretórios, `modelSource.ts` escreve o marcador `.model-source-pending-<slot>.json` com o nome do backup anterior ao commit; a publicação remove o marcador quando consegue concluir. Quando há vários backups, o recuperador usa apenas o nome validado do marcador e rejeita recuperação ambígua.

- Não sobrescreve um slot oficial, mesmo que o manifesto existente esteja defeituoso.
- Não remove backups; um operador pode recuperá-los manualmente.
- Nunca confia em caminhos do marcador (somente nomes de backup do slot com UUID válido).
- Usa o DomainFileSystem injetado; não modifica arquivos fora da biblioteca.
- O catálogo e a publicação fazem a verificação antes da leitura ou da gravação.

### Limites conhecidos

Não substitui um protocolo de transação atômica verdadeira para o sistema de arquivos/SQLite. Ainda é necessário um teste de interrupção forçada do processo em Windows, com biblioteca de teste, incluindo múltiplas edições e volta da energia.

## Testes

```bash
npm ci
npm run audit:architecture
npm run test:refactor
npm run test:geometry
npm run typecheck
npm run build
# Smoke opcional: requer executável Electron instalado e uma sessão gráfica
npm run test:fabricator:electron-visual
```

## Próximas quatro prioridades após esta etapa

1. Capturar screenshots **das telas reais** do Fabricador em Electron e comparar com arquivos dourados por modelo/pose.
2. Separar editores DEV por componente e adotar carregamento versionado de assets em cache compartilhado.
3. Implementar testes de queda/crash durante cada estágio do commit para os perfis arquivo/SQLite.
4. Consolidar contratos tipados dos IPCs no preload e regras de migração de formatos, com gate de compatibilidade de versões.
