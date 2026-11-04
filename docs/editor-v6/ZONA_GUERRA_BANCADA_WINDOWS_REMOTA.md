# Zona de Guerra — bancada Windows remota (R36/R37)

## Objetivo
Executar testes sintéticos de renderização e exportação sem usar dados privados ou exigir o PC pessoal. Workflow: `.github/workflows/zona-guerra-export-lab.yml`. Somente a branch experimental é alvo do gatilho automático; `Dev-V2` permanece intocada.

## Como usar
1. GitHub > Actions > **Zona de Guerra - Windows export lab** > Run workflow.
2. Escolher `dev-v2-zona-de-guerra` e 1, 2 ou 3 rodadas. Push de arquivos relevantes na branch também dispara automaticamente 2 rodadas.
3. Abrir o run e baixar o artifact `zona-guerra-lab-<run_id>`: `summary.json`, logs por rodada e os JSONs/arquivos sintéticos produzidos no diretório isolado.

Cada rodada executa (a) teste de motion no Electron, (b) serviço de motion com rigs, (c) paridade de MP4 Turbo real usando FFmpeg verificado. O job falha se qualquer teste falhar. Medições em `summary.json` são durações dos comandos, **não** benchmark equivalente aos 309 quadros reais.

## Limitações e critérios de promoção
- Runner Windows Server 2025 x64, não Windows 11 com GPU/driver local; resultados não comprovam desempenho local nem AMD AMF.
- Fixtures sintéticas não substituem uma inspeção visual humana e testes com projeto real.
- Não incluir perfis, imagens de personagens pessoais, vídeos privados, SQLite, tokens ou paths pessoais nos artifacts.
- R37 (compositor por peças) permanece experimental e desligado até haver teste A/B de pixels RGBA, camadas (posterior/traseira), pivôs, boca, olhos, cabelo, roupas, flipX, 7 amostras, MP4 e cancelamento.
- Exigir pelo menos três execuções comparáveis e verificação de memória antes de propor promoção para `Dev-V2`.
- A CI existente `editor-v6-parity.yml` continua cobrindo os contratos amplos e não é substituída por esta bancada.
