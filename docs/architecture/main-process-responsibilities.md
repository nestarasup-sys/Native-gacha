# Mapa do processo principal (`electron/main.ts`)

## Escopo observado

- Arquivo atual: 2.627 linhas depois da rodada de formatação; entrada da aplicação e montagem de dependências de domínio.
- Imports e serviços de domínio: linhas 1–179.
- Diagnósticos e estado do processo: linhas 180–348.
- Registro dos domínios Fabricador, Studio e Editor V6: função `registerFabricatorHandlers`, linhas 623–1.210.
- Registro dos domínios Editor V6/V7 e início da aplicação: linhas 1.315 em diante; export V6 começa em 1.526.
- Eventos de `activate`, janelas fechadas e encerramento: linhas 2.576–2.626.
- O wrapper `createMeasuredIpcMain` mantém os mesmos canais e drena handlers pendentes durante saída (`electron/application/measuredIpcMain.ts:1–44`).

## Responsabilidades que se misturam

1. Bootstrap Electron e sequenciamento de startup/shutdown.
2. Composição de serviços/repositorios e configuração de caminhos.
3. Registro de IPC de múltiplos domínios.
4. Coordenação de exportações e workers V6/V7.
5. Captura de erros, diagnóstico de processos e ferramentas de estresse/teste.

## Riscos com evidência

- Muitos imports e estados de serviços globais tornam a ordem de inicialização difícil de revisar (`main.ts:180–348`, `623–1.210`).
- Mover handlers sem preservar `assertTrustedSender`, `createMeasuredIpcMain`, canais existentes e `dispose/drain` pode abrir a superfície IPC ou interromper cancelamentos.
- O encerramento depende de aguardar gravações, exportações e janelas de worker (`main.ts:2.586–2.626`).
- Experimentos de export estão no mesmo processo de bootstrap e aumentam custo de leitura; movê-los muda fluxos de teste, não só estética.

## Extração proposta por risco/benefício

1. **Baixo:** extrair registro de diagnósticos/test harness para `electron/application/diagnosticsBootstrap.ts`; passar dependências explícitas.
2. **Baixo:** extrair criação/encerramento da janela principal para `electron/application/mainWindow.ts`, preservando callbacks de segurança e navegação.
3. **Médio:** mover o registro de cada domínio restante para `electron/application/registerIpc.ts`; reaproveitar registrars já existentes em `electron/domains/*`.
4. **Médio:** agrupar recursos de export no `editorV6ExportService` existente e manter propriedade do job/cache em `domains/editorV6`.
5. **Alto:** alterar inicialização do catálogo ou shutdown só com testes de ordem, falha parcial e cancelamento.

Não recomendo reescrever o arquivo em uma única mudança. Nenhum contrato IPC ou startup foi alterado nesta investigação.
