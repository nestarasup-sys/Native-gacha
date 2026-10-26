# Mapa do app atual

## Produto e tecnologia

Native Gacha é um app desktop local, atualmente Electron 44 + React 19 + TypeScript 5.9, com processo principal Node, preload/IPC, persistência SQLite e filesystem. As regras de domínio, formatos persistidos e relações entre bibliotecas/personagens também são parte do produto.

## Diretórios

| Caminho | Conteúdo / papel |
|---|---|
| `electron/main.ts`, `electron/preload.ts` | Inicialização desktop, superfície segura e comunicação renderer/main |
| `electron/domains/` | Casos de uso, validação, repositórios e persistência por domínio |
| `electron/data*.cjs`, `electron/domainFileSystem.cjs` | Dados locais, migração, backups e filesystem virtualizado |
| `src/shared/` | Tipos, regras puras, modelos persistidos e contratos entre camadas |
| `src/renderer/src/features/` | Interfaces dos módulos |
| `src/renderer/src/characters/` | Resolução, composição e cache de imagens dos personagens |
| `tests/` | Regressões, fixtures, persistência, recuperação, limites IPC e geometria |
| `docs/architecture/` | ADRs, contratos, evidências e histórico de refatoração |

## Fluxos-chave

```text
Fabricador (catálogos) -> Customizador (personagens/overrides) -> Studio Principal (cenas)
                                         └──────────────────────> Roteiros (exports)
Base de Vídeos -> biblioteca compartilhada de mídia usada por Roteiros e recursos compatíveis
```

Fabricador cria e mantém a fonte de modelos/poses/roupas/cabelo/rosto. Customizador guarda escolhas e ajustes de cada personagem. Studio e Roteiros consomem personagens sem modificar o catálogo-fonte. Consulte `docs/architecture/ADR-002-fluxo-personagens.md` e `docs/architecture/CHARACTER_PRODUCTION_CONTRACT.md`.

## Como localizar comportamento

- Comece pela UI em `src/renderer/src/features/<modulo>`.
- Siga chamadas `window.desktop` tipadas em `src/renderer/src/desktop.d.ts` e implementadas no preload.
- Localize canais compartilhados em `src/shared/*IpcChannels.ts`.
- Encontre handler/serviço em `electron/domains/<modulo>` ou `electron/main.ts` para caminhos ainda não extraídos.
- Localize modelo persistido e validação em `src/shared/` e nos arquivos `validation.ts`.
- Procure testes relacionados ao fluxo em `tests/`.

Este mapa descreve o snapshot atual, sem histórico Git e sem dados locais ignorados. O commit do pacote está em `LEIA-PRIMEIRO.md`.
