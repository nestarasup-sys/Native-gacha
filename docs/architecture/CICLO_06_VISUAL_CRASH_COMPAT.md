# Ciclo 06 — Regresso visual completo, catálogos, crash real e compatibilidade

Branch de desenvolvimento: `feature/model-source-editor`. Não há merge com `main` neste ciclo.

## 1. Fixture visual completa e screenshots
`scripts/fabricator/complete-character-fixture.cjs` produz, sem dados privados, um modelo com corpo e cabeça e arquivos reais PNG para pose, casaco, cabelo frente/atrás e olho. Os formatos são os mesmos do Fabricador. `tests/fabricator-complete-visual-fixture.test.mjs` verifica que o catálogo e os manifests continuam legíveis.

O runner `scripts/fabricator/capture-real-ui.cjs` aceita `--synthetic-complete` para carregar essa fixture na cópia isolada `out/dev-ai/runs/<uuid>/sandbox`. Captura oito seções reais do Fabricador e admite `--baseline=<diretório>` para comparar screenshots. Nunca escreve na biblioteca do usuário.

```powershell
npm install
npm run build
npm run test:fabricator:real-ui -- --synthetic-complete
# Inspecione as imagens produzidas; só depois promova para baseline
npm run test:fabricator:real-ui -- --synthetic-complete --baseline=C:\Fixtures\baselines
```

**Não confundir runner preparado com comparação visual aprovada:** o smoke de screenshots não é executado pelo CI normal (sem sessão gráfica/Electron). Baselines definitivas precisam de revisão humana no Windows. Os dados sintéticos não representam todas as variantes de rosto/cabelo.

## 2. Cache de imagens nas três bibliotecas
Além do catálogo de modelos, `electron/main.ts` usa um `VersionedAssetResolver` compartilhado para leituras de:
- Roupas DEV: PNGs de componentes.
- Cabelos DEV: frente/trás/franja e imagem-base.
- Rosto/Olhos DEV: folhas, recortes e componentes.

Chaves separam namespaces e IDs. Revisão por `updatedAt` do manifesto; writes invalidam a identidade em cache antes de substituir arquivos. Limite total de cache: 32 MiB. Sem alteração em disco ou migração.

## 3. Queda real de processo e restart SQLite
`scripts/fabricator/crash-model-source-sqlite.mjs` encerra imediatamente um processo-filho no checkpoint após a renomeação do slot oficial ou após promoção do staging.

`tests/model-source-process-crash.test.mjs` inicia um catálogo SQLite isolado, executa o processo-filho, reabre um catálogo novo e verifica preservação/restauração dos PNGs e `project.json`.

Foi identificada uma particularidade do DomainFileSystem: um diretório lógico vazio pode permanecer após renomeação. `modelSourceRecovery.ts` agora reconhece esse placeholder **somente** quando existe marcador transacional válido, não há arquivos no slot e existe backup completo. Não seleciona versões antigas arbitrariamente.

No Linux, sem `better-sqlite3` nativo, os cenários SQLite são marcados skipped; Windows CI com dependências nativas executa. O teste não mata o aplicativo de produção e não prova proteção contra perda física de energia.

## 4. Gates de formatos antigos e IPC tipado
`src/shared/fabricatorStorageCompatibility.ts` verifica schemas canônicos sem modificar documentos:
- aceita modelo legado sem ordem de camadas, roupas de primeira edição e estilos de cabelo sem categoria;
- recusa novas versões de esquema desconhecidas e coleções excessivas;
- integrado às leituras dos modelos, roupas, cabelo e rosto.

`src/shared/fabricatorIpcChannels.ts` passou de 21 para **35 canais compartilhados**, incluindo Roupas, Cabelo e Componentes Faciais em main/preload. Argumentos e retornos continuam derivados de `FabricatorDesktopApi`, sem alteração de nomes ou formato de mensagens.

## Política de compatibilidade
Poses DEV usa o **modelo montado**. Os outros editores DEV usam a referência de imagem original quando aplicável. Customizador e Studio continuam consumindo a biblioteca existente. Video Studio é permitido no futuro, mas não é prioridade. Nenhuma migração automática dos dados do G-V5 foi introduzida.

## Antes do merge
- CI Linux/Windows: testes, arquitetura, TypeScript, build no último commit.
- Windows: executar `npm run test:fabricator:real-ui -- --synthetic-complete` e aprovar PNGs/baselines.
- Confirmar dados reais com cópia do perfil, nunca testar alterações permanentes na biblioteca única.

## Próximas quatro prioridades
1. Automatizar screenshots da composição realmente renderizada de personagens com roupas/olhos/cabelos/expressões e fixar baselines por plataforma.
2. Reduzir o acoplamento de guarda e invalidação de caches ao `electron/main.ts`, movendo-os para serviços de domínio dedicados e medindo latência.
3. Tornar o protocolo de recuperação SQLite explícito por journal com verificação pós-commit e tolerância a reinicialização múltipla.
4. Expandir os testes de compatibilidade para Customizador e Studio e checar ligações de poses/roupas após mudança definitiva do Model Source.
