# Editor V6 — estado da continuação

Data do checkpoint: 13/11/2026, BRT

- **Repositório:** `C:\TRABALHO 2\OUTROS\GACHA EM C++`
- **Branch:** `Dev-V2`
- **Base desta retomada:** `b16faabf Fix Editor V6 checkpoint formatting`
- **Estado Git antes desta continuação:** branch local estava 67 commits à frente de `origin/Dev-V2`; este trabalho será commitado localmente depois das verificações, deixando-a 68 commits à frente. Nada será enviado ao GitHub.
- **Continuação mais recente:** evitar Promises e suspensão de frame quando todas as imagens SVG já estão carregadas.

## O que estava sendo feito

Continuação da refatoração e da otimização do Editor V6, priorizando o custo por quadro sem mudar resolução, qualidade, ciclos de pintura, regras de cancelamento ou formato dos projetos. Foram preservados os dados locais e usados apenas testes sintéticos; o projeto pessoal de 12 minutos e `app-data` não foram abertos nem usados como fixture.

Nesta última alteração, o caminho que gera as chaves de reaproveitamento de quadro repetia `JSON.stringify` dos mesmos elementos visuais estáticos em todos os frames. Agora `editorV6VisualKeys` e `editorV6CompleteVisualKeys` recebem uma cache opcional por referência. O renderizador cria uma `WeakMap` por exportação e reutiliza a serialização de snapshots imutáveis que reaparecem. Elementos novos de movimento ou boca mantêm suas chaves próprias. As chamadas sem cache continuam com o contrato anterior.

O benchmark sintético comparou a criação dessas chaves em 1.800 quadros por rodada, 80 elementos estáveis e cinco rodadas: mediana de **55,35 ms sem cache** contra **7,31 ms com cache** (86,8% menos nesta operação isolada). Isso não mede nem prevê a duração do MP4 completo.

Na continuação seguinte, também eliminei a criação de um novo objeto para o fundo padrão a cada quadro. O resolver agora conserva o snapshot padrão por referência de documento e verifica seus campos para perceber alterações até se o mesmo objeto for modificado. A serialização de fundos persistentes também é reutilizada pela cache fraca do renderizador. O benchmark atualizado (mesma fixture, cinco rodadas) marcou medianas de **54,33 ms sem cache** e **6,66 ms com cache**; continua medindo só a construção de chaves.

Na última etapa, o readiness SVG não cria mais uma Promise resolvida por imagem nem suspende o renderizador quando `onLoad` já confirmou todas as fontes atuais. O worker percorre o `NodeList` diretamente e aguarda somente imagens ainda pendentes. Um microbenchmark com dez imagens prontas em cada um dos 5.700 quadros ficou em mediana **12,51 ms no caminho com Promises** contra **3,01 ms sem Promises pendentes**. É o custo isolado do readiness; não estima o tempo do MP4.

## O que melhorou nesta linha de trabalho

As otimizações de cabelo e exportação documentadas em `PLANO_ACELERACAO_EXPORT.md` e `REESTRUTURACAO.md` reduzem trabalho repetido por quadro: preparo da física do cabelo, correspondência e interpolação das mechas, trajetória da cabeça, mapas de personagens, cópias da cena, consultas a assets, leituras faciais e geração das chaves visuais. A resolução dos frames, a composição e as regras visuais foram preservadas.

Benchmarks anteriores também mostraram ganhos isolados nas operações medidas: preparação de cabelo (mediana 47,16 ms → 18,63 ms em 50.000 chamadas), pares de mechas (44,79 ms → 25,72 ms em 20.000 interpolações) e trajetória (17,38 ms → 2,42 ms em 100.000 pontos). Nenhum desses números equivale à velocidade do vídeo final.

## Verificações concluídas nesta retomada

- Testes focados de prontidão SVG e renderizador: **8 testes aprovados**.
- `npm run test:editor-v6`: **179 arquivos aprovados, 1 ignorado; 803 testes aprovados, 1 ignorado**. O perfil sintético incluído também passou (23 verificações).
- `npm run typecheck`: passou.
- `npm run audit:architecture`: passou; 878 arquivos TS/TSX, sem erros de sintaxe, imports ausentes ou violações de fronteira.
- `npm run test:editor-v6:export`: build e harness Electron integrado passaram. Cobriu 81 quadros (78 reutilizados), áudio contínuo na emenda, fallback, cancelamento preservando o destino anterior, movimento na emenda turbo, Full HD e preloads sandbox. A fixture sintética de boca percorreu 301 quadros; o pico de RSS reportado do processo principal foi **168.554.496 bytes**. O harness removeu os próprios temporários.
- Microbenchmarks das chaves visuais: a rodada anterior teve mediana 55,35 ms sem cache e 7,31 ms com cache; a rodada após incluir os fundos, 54,33 ms e 6,66 ms. Ambos são isolados da exportação MP4.
- `git diff --check`: passou antes do commit local.

## O que permanece sem comprovação

- **Exportação longa real:** `PLANO_ACELERACAO_EXPORT.md` contém comparações históricas do projeto de 5.700 quadros/190 s, inclusive cache aquecido, workers e preparo de boca. Não houve nesta continuação um A/B da nova série de commits nesses dados, nem foi reproduzido especificamente o projeto de 12 minutos/473 transições. Os microbenchmarks desta retomada isolam operações JavaScript.
- **Crash `-36861` / Crashpad:** o harness sintético passou, mas não reproduz o encerramento do projeto longo e não explica a desconexão do Crashpad.
- **Memória do sistema inteiro:** o RSS registrado é apenas do processo principal; não representa memória combinada de renderer, GPU e FFmpeg.
- **Layout manual:** esta retomada não abriu o app para conferir visualmente a interface. Build e testes não substituem essa checagem.
- **Captura e pintura:** medições anteriores rejeitaram remover esperas de pintura ou trocar `capturePage()` por bitmap antecipado porque os quadros divergiam visualmente. Preservar essas proteções até uma nova prova de paridade.
- **Harness de flip individual:** há registro histórico de falha ocasional de fixture estática em torno de 2,2–2,3 px para limite de 2 px. A tolerância não foi relaxada; o harness integrado de exportação passou nesta retomada, mas não substitui uma fixture específica de cabelo.

## Estado de uso

**O app permanece utilizável para continuar editando e desenvolvendo** segundo os gates automatizados desta retomada: suíte, typecheck, auditoria, build e harness Electron passaram. Não há evidência de regressão causada por esta alteração.

Isso não garante o cenário do projeto longo, a duração total do export, a ausência do `-36861` nem a experiência visual manual, pois esses pontos não foram reproduzidos nesta rodada.

## Próximos passos ao retomar

1. Permanecer na `Dev-V2`; não trocar para a branch Lab nem sincronizar com GitHub sem pedido.
2. Priorizar o caminho de renderização por quadro: o perfil histórico aponta 88,9 s acumulados de round-trip, 57,4 s de escrita FFmpeg, 48,1 s de desenho IPC, 39,4 s de captura e 24,7 s de espera RAF em um export aquecido; são contadores sobrepostos, não somáveis.
3. Quando houver condição de medir sem interferência, comparar a mesma exportação longa com parâmetros e máquina iguais, registrando duração, RSS dos processos e logs do Electron/FFmpeg. Usar projeto pessoal somente quando necessário e sem modificar seus dados.
4. Investigar o `-36861` a partir de logs e perfis de processo; o harness curto não é evidência suficiente para atribuir causa.
5. Repetir o teste específico de transições/flip e fazer inspeção visual no app quando a sessão permitir.
6. Para cada alteração: revisão do diff, teste focado, suíte V6, typecheck, auditoria, build, checkpoint atualizado e commit local. Não fazer push sem solicitação.

## Arquivos locais preservados

Continuam fora do Git, sem alteração ou inclusão nos commits desta tarefa:

- `.codex-editor-v6-thumbnail-diagnostic.html`
- `codex-editor-v6-thumbnail-diagnostic.html`
- `public/`
- `src/renderer/public/codex-editor-v6-thumbnail-diagnostic.html`

Nenhum conteúdo de `app-data` ou mídia pessoal foi aberto, alterado ou incluído.
