# Estado das animações do Editor V6

Retomado em 26/10/2026 por solicitação do usuário. O WIP anterior foi integrado e validado. A descrição técnica atual está em [ANIMACOES.md](ANIMACOES.md).

## O que foi concluído

- Transições independentes por personagem nos 250 ms anteriores à próxima pose/expressão.
- Interpolação própria do V6, sem dependência dos componentes dos animadores Dev. Pivôs explícitos preservam a rotação das peças; ângulos seguem o caminho mais curto.
- Preparação serial em Chromium oculto, com preload de leitura restrito, cancelamento e validação. Atlas persistido, cache limitado e descarte de resultados antigos.
- Prévia, seek e exportação usam os mesmos recortes prontos, sem recompor o personagem a cada quadro.
- Controles de animação por faixa (◆/◇) e por bloco de destino no Inspector, com marcação visual na timeline.
- Fala ligada ao personagem abre a boca; pensamento não abre. Piscadas têm agenda determinística por personagem. `talk` e `blink` também são preparados nos quadros internos dos atlas de pose/expressão, sem render adicional durante Play.
- Limpeza de atlas inválidos; Play e exportação aguardam animações necessárias. Exportação também verifica pendências no main.
- Corrigida a causa das páginas vazias: o novo preload gerava um chunk compartilhado incompatível com require no sandbox. Os preloads voltaram a ser autocontidos, mantendo sandbox habilitado.
- Corrigido cache sobre objetos congelados pelo contextBridge. Os testes reais cobrem os preloads e o preparador completo.

## Verificações

- `npm run typecheck`
- `npm run test:editor-v6`: testes de precisão de quadros, estados finais, cache, invalidação, personagens independentes, JSON, blink/talk e pivôs. O teste de movimento também confirma `talk`/`blink` dentro de uma troca de pose.
- `npm run test:editor-v6:motion`: Chromium real, peças movendo sem fade, boca interpolada desde o catálogo, rig único para expressão, atlas limitado, descarte de canvases e controles reais da timeline.
- `npm run build`
- `npm run test:editor-v6:surface`: prévia/captura, painel de exportação e áudio.
- `npm run test:editor-v6:export`: MP4 real, duas partes, vídeo importado mudando quadro a quadro e atrás dos personagens, mixagem de áudio, recuperação, cancelamento, 1080p, preloads sandboxed, preparação real por IPC, bloqueio de animação pendente e emenda Turbo no meio de uma animação.

Os testes usam projetos sintéticos e perfis temporários. Não alteram os projetos reais do usuário.

## Limites e próximos trabalhos possíveis

- Conferir artisticamente poses reais com rotações grandes e roupas complexas. A interpolação respeita pivôs explícitos; não é um novo solver completo de cinemática inversa para qualquer rig.
- Imagens/seleções discretas trocam no meio da transição. Não há morph de pixels entre desenhos diferentes.
- As variações faciais são imagens preparadas, não deformação de boca contínua por fonema ou amplitude de voz. Isso corresponde ao contrato atual de pose estática e troca de imagem.
- Atlas tem orçamento de aproximadamente 8 MP por transição; fontes grandes podem ser reduzidas. Não há garantia universal de tempo de preparação em projetos grandes.
- Modelos com rigs ou dimensões incompatíveis geram erro; não exportar silenciosamente uma animação incompleta. Pode-se desativar a animação da faixa ou do bloco para usar corte.
- Não publicar no GitHub sem pedido. Sempre salvar commits locais.
- Modificação preexistente em `ABRIR_DESENVOLVIMENTO.bat` pertence a outro trabalho e deve permanecer fora do commit.
