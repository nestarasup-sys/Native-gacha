# Ciclo estrutural 05 — telas reais, resolver versionado, falhas e IPC tipado

Branch exclusiva de trabalho: `feature/model-source-editor`. Dependência de PR #4 para o merge posterior.

## As quatro prioridades atendidas

**1 — Capturas reais do Fabricador no Electron (runner opt-in)**

- `electron/domains/fabricator/visualUiCapture.ts` navega a interface REAL de `#/fabricador-dev`: Modelos, Poses, Roupas, Olhos, Rosto, Expressões, Cabelos e Animador DEV; produz PNGs e um manifesto.
- `scripts/fabricator/capture-real-ui.cjs` executa a aplicação compilada com `GACHA_DEV_AI_TEST=1` e perfil `out/dev-ai/runs/<uuid>/sandbox`. Não acessa o perfil normal.
- O teste pode receber um diretório de fixture do Fabricador por `--fixture=<diretório>` para testar dados copiados; a origem não é alterada.
- `--baseline=<diretório>` ativa comparação dos PNGs; tolerância de 8 por canal e máximo de 1% dos pixels da tela diferentes.
- O script exige Electron instalado, build completo e ambiente gráfico. **Não roda na CI padrão e não foi executado remotamente neste ciclo**. Uma captura sem personagens configurados prova somente os layouts e navegação; validação de desenhos exige fixture de personagem.

```powershell
npm install
npm run build
npm run test:fabricator:real-ui
# Opcional: fixture fabricator/ local copiada para sandbox
npm run test:fabricator:real-ui -- --fixture=C:\\Fixtures\\fabricator
# Opcional: screenshots baseline
npm run test:fabricator:real-ui -- --baseline=C:\\Fixtures\\baselines
```

**2 — Resolver compartilhado de assets versionados**

- `electron/domains/fabricator/versionedAssetResolver.ts` dá um contrato por namespace: `model`, `wardrobe`, `hair`, `face`, `expression`, `pose`, `animator`.
- Cache LRU de 32 MiB, carregamento single-flight, cópia defensiva por consumidor, invalidação por namespace e identidade.
- `FabricatorModelCatalog` reutiliza o resolvedor para folha original, recortes e bases de chroma, com chave de versão `sourceFile + updatedAt`.
- Módulos de roupas/cabelo/rosto ainda podem adotar o novo resolvedor gradualmente; **não foi alterada a persistência** dos catálogos especializados.
- Testes de concorrência, revisão de fonte, isolamento de namespaces, limite de memória e retry.

**3 — Falhas de gravação no modo arquivo e SQLite**

- `tests/model-source-fault-injection.test.mjs` injeta erro ao gravar o PNG, renomear o slot, promover o staging e executar rollback. Verifica que o manifesto não fica parcialmente publicado.
- Uma falha de promoção seguida de falha de rollback restaura o backup transacional pelo `recoverModelSourceSlot`.
- Teste do `DomainFileSystem` com `fabricator.models` em estado `active`, incluindo rollback injetado. **Esse teste só executa se better-sqlite3 nativo estiver instalado**; `npm ci --ignore-scripts` pode deixá-lo como skipped.

**4 — Contratos IPC tipados**

- `src/shared/fabricatorIpcChannels.ts` define um mapa de 21 canais de catálogo, Model Source, Poses e Animador.
- `createFabricatorInvoker` permite ao preload invocar canais com argumentos e retorno derivados de `FabricatorDesktopApi`.
- Os registradores IPC do Electron compartilham os nomes do mesmo mapa.
- O payload legado de publicação do Model Source continua um único objeto tipado em `FabricatorModelSourcePublishRequest` — sem mudar a serialização.
- Testes verificam nomes únicos, argumentos e integração entre preload e registradores.

## O que não muda

- **Poses DEV usa o modelo MONTADO**, não a imagem desmontada.
- Customizador e Studio continuam lendo personagens baseados nas poses salvas.
- Video Studio pode ser trabalhado em ciclos futuros, mas não foi prioridade.
- As alterações permanecem isoladas na branch de desenvolvimento, sem migração de schemas.

## Antes de integrar

- CI Linux + Windows verde no último SHA;
- rodar `npm run test:fabricator:real-ui` no Windows e revisar capturas;
- testar a sequência de falhas no SQLite com dependências nativas instaladas;
- executar com um modelo de teste, incluindo roupas e expressão, evitando tocar nos perfis de produção.

## Próximas quatro prioridades recomendadas

1. Instrumentar screenshots dos desenhos reais (com fixtures reprodutíveis de personagem, roupas, cabelo, face e pose) e aprovar baselines por plataforma.
2. Adotar o resolver versionado também nos catálogos de cabelos, roupas e componentes faciais, eliminando caches locais duplicados após medição.
3. Implementar journal de publicação/recuperação com testes de queda de processo real e integridade SQLite por múltiplos ciclos.
4. Introduzir verificação automatizada de compatibilidade dos schemas legados, migrando gradualmente canais Fabricador restantes para contratos IPC tipados.
