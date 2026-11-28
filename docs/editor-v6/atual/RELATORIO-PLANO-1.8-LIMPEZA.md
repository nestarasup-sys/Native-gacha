# Plano 1.8 — triagem reversível de resíduos

**Estado:** inventário preliminar; nada foi movido nem apagado. Escopo desta leitura: `out/editor-v6-stress/runs`.

## Critérios

- Preservar qualquer MP4, dump, JSON de validação, comparação de qualidade, captura ou log referenciado por documentação/relatório.
- Candidatos só serão movidos no encerramento para `pasta do lixo/Editor V6 sobras/Plano 1.8`, em operação reversível, com SHA-256, caminho original e destino registrados.
- Não mover pelo nome/extensão, não deduplicar conteúdo nem tratar pasta ignorada pelo Git como descartável.

## Candidatos preliminares

| Origem | Conteúdo / SHA-256 | Evidência e decisão |
|---|---|---|
| `runs/plan18-render-workers4-phase2-40s-20261125/` | Só `.v6-benchmark-run.json`; `AFC270E1403EBDE6EFBFEBFB7B4910AD0CFEED3C3E98780AAD85C68C8DAAEC11` | Tentativa inválida, sem relatório/MP4 nem referência. Candidato ao arquivo local. |
| `runs/plan18-workers2-batch300-A1-20261125/` | Só `benchmark.log` com erro `EEXIST`; `ED6C9AE2817E1FAF9818E3D148CCD0855686A79FA1B9BF90E50D1ADE79BD15CC` | Colisão ao criar pasta; não houve export. Candidato ao arquivo local. |
| `runs/round13-d3-40-A1/` | Só marcador; `40550A06BCD013470D3A79515ED59AECD44950209F1A1924F509606A6AFE83C7` | A tentativa A1 sem resultado foi substituída pela série `40r2`; sem referência própria encontrada. Candidato ao arquivo local. |
| `runs/round14-d0-run1/` | Só marcador; `54409930933435F80FAB1D6C16C3A62ADB57B6447C46E1ACB38538D9F26B6683` | A captura válida e documentada é `round14-d0-run1-w2`; sem referência própria encontrada. Candidato ao arquivo local. |
| `runs/round17-c-40s-A1/` | Só marcador; `453266251EC3841B4F845791418B94290FDA738262F8288D521997CF6868EED6` | Tentativa substituída por `round17-c-40s-A1-retry1`, com relatórios; sem referência própria encontrada. Candidato ao arquivo local. |
| `runs/round14-d2-40s-series/` | Diretório vazio | A série referenciada está em `round14-d2-40s-series-05`; sem conteúdo ou referência própria. Candidato ao arquivo local. |
| `runs/plan18-frame-overlap-on-40s-20261126/` | Só `.v6-benchmark-run.json`, 105 B; `0cd253cf39f06358bf91b521e547fa426367930c3f43c6d4bba92555b9b1e9f5` | Harness interrompido por `EADDRINUSE` antes do export; sem arquivos do app. Candidato ao arquivo local. |

## Evidências preservadas

- `round13-c2-capture/` e `round13-c2-capture-console.log` permanecem juntos: o log explica a falha e os relatórios apontam para o resultado posterior `round13-c2-capture-3`.
- `round13-c2-no-video/A1-worker-1.mp4` é `retainedQualityReference` do relatório 1.3; manter.
- Os `result.json` de `round14-f1-cfr`/`round14-f1-nut` e o `encoder-comparison.json` de `round14-c2-active-amf-01` são resultados citados nos relatórios; manter.
- Séries válidas, MP4s, dumps com hashes, relatórios, screenshots do Plano 1.8 e os 12 documentos locais não rastreados da pasta ativa ficam no lugar.
- `out/editor-v6-envio-atual/` é um pacote de handoff pedido para análise externa; não é sobras de benchmark. Preservar os dois arquivos ZIP: `EDITOR-V6-ATUAL-COPIA-INTEGRAL.zip` (3.817.832 B, SHA-256 `5AEAC61A79E64F9E195B9968BD54AED85493C9F9537753C39F4C1A3D434CC279`) e `EDITOR-V6-PACOTE-ANALISE-1.7.zip` (31.539.568 B, SHA-256 `0FE0C3665E81E84A1B1E2FDE5840AA97B0715547DD10BD907A2B213262F7C852`). Os sete Markdown consolidados e o script de montagem também ficam preservados.
- Integridade dos ZIPs conferida sem extração: o integral contém 81 entradas e o pacote 1.7 contém 2.169; `ZipFile.testzip()` retornou `None` para ambos.

## Próxima ação

Fechar primeiro a revisão de código/UX e a validação do Plano 1.8. No encerramento, repetir a busca de referências, confirmar os hashes, criar um manifesto de movimentos e só então arquivar os sete candidatos. Até lá, não realizar nenhuma movimentação.

## Item histórico ausente

O ZIP `docs-lixo-archive-proposal-2026-11-21.zip`, esperado com SHA-256 `B9A5D49F9447C46FC86CAD297F89718FF6B8D95F39D539D5B6A629EB9224CC2F`, não foi localizado em `out/editor-v6-stress/runs`, `runs-local-backup-2026-11-24`, `pasta do lixo` nem na cópia de preservação conhecida em D:. O registro e a referência quebrada foram corrigidos no README e na Execução 1.2; nenhum arquivo foi fabricado. As 123 fontes haviam sido removidas após validação do ZIP, portanto a recuperação depende de outra cópia externa que ainda não foi identificada.
