# Relatório de evolução estrutural — G-V5 (segunda rodada)

**Data:** 2026-10-22  
**Entrada:** G-V5-refatoracao-inicial-2026-10-22(1).zip  
**Tipo:** refatoração incremental sobre a rodada anterior, sem migrações de formato ou banco.  
**Prioridade:** Fabricador DEV → Customizador → Studio Principal. Video Studio congelado.

## Resultado executado

| Frente | Implementação |
|---|---|
| Customizador backend | Separação real em `validation`, `compatibility`, `repository`, `service`, `ipc` e `starterCharacters` |
| Integração | Substituídos 4 handlers de personagem do `electron/main.ts` pelo módulo independente, mesmos nomes de canais e dados |
| Dados dos personagens | Mantidos `customizer/characters/characters.json`, defaults de 10 personagens, `.tmp/.backup`, recuperação e fila |
| Fabricador DEV | Extração da consulta de slots e carga de modelo para `modelCatalog.ts` + `modelIpc.ts`; outros handlers do Fabricador permanecem |
| Regras de rig | `modelRig.ts` e `wardrobePose.ts` promovidos a `src/shared`; caminhos antigos fornecem reexports |
| Utilidades do renderer | Hook de fundo e máscara de olho promovidos a `ui/hooks` e `ui/image`, sem alterar implementação |
| Acoplamento | Customizador → Fabricador: **5 → 1** imports runtime; baseline reduzida para impedir regressão |
| Flush de dados | `app:flush-pending-writes` passa a aguardar também Customizador, roupas, faces, animador, presets e guias; backup anterior já aguardava essas filas |
| Escopo preservado | Video Studio, motor/exportação, IPC de vídeo, migrações de banco e formatos persistidos **não alterados** |

`electron/main.ts`: aproximadamente **3.617 linhas na entrada original do legado** e **3.146 linhas nesta entrega**; redução também inclui a primeira rodada já recebida no ZIP de entrada. Não interpretar contagem de linhas como prova de qualidade isoladamente.

## Validações realizadas

- `npm run test:refactor`: **24/24 testes aprovados**, incluindo os testes da rodada anterior.
- `npm run audit:architecture`: **155 arquivos TS/TSX**, nenhum erro de sintaxe; **18 imports runtime** entre features e **nenhuma nova dependência proibida**. Antes desta rodada havia 22 imports runtime.
- `node scripts/audit-wardrobe-flow.mjs`: passou no ambiente temporário com TypeScript local disponível, incluindo **72 casos** de ajuste entre poses.
- `node --test tests/architecture-audit.test.cjs`: **2/2** testes passaram; `main.ts` dentro do novo orçamento.
- Outros testes legados selecionados podem ser executados sem iniciar o Electron.

## Limitações e pontos de atenção

- **Não existe verificação de equivalência funcional completa sem executar o app.** Não executar diretamente sobre o perfil real do usuário.
- `npm ci --offline --ignore-scripts` falhou por falta de tarballs no cache. Outra tentativa de `npm ci --ignore-scripts` encontrou falha interna do npm (`Exit handler never called`); dependências completas não puderam ser instaladas.
- Node disponível: **22.16.0**. O `react-router@8.4.0` declarado no package.json requer **Node >=22.22.0**. Por isso, `typecheck`, build e smoke Electron/Windows continuam **pendentes**.
- A normalização das roupas antigas em `compatibility.ts` ocorre em memória durante a leitura e é compatível com o fluxo da primeira rodada; o formato no disco só se altera quando o usuário salva normalmente, como no legado.
- Os reexports de compatibilidade podem ser removidos depois de confirmar que nenhum teste, script, import dinâmico ou consumidor externo depende dos caminhos antigos.
- O check de imports não cobre comportamento funcional em execução, mesmo quando a sintaxe está correta.

## Sequência sugerida no ambiente de desenvolvimento

```bash
# Recomendado: Node >= 22.22.0, Windows com ambiente Electron/FFmpeg normal
npm ci
npm run audit:architecture
npm run test:refactor
node scripts/audit-wardrobe-flow.mjs
npm test
npm run typecheck
npm run build
npm run dev
```

Antes de importar uma biblioteca pessoal: realizar backup verificável, abrir um perfil sintético isolado, testar Fabricador → Customizador → Studio, salvar, reiniciar, restaurar e conferir se os dados são idênticos.

Consulte [ADR-002-fluxo-personagens.md](../../architecture/ADR-002-fluxo-personagens.md) para entender propriedade dos dados e próximos domínios.
