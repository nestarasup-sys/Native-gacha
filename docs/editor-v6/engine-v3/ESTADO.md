---
id: V6-ENGINE-STATE
tipo: checkpoint-vivo
status: ativo
branch: Dev-v3
atualizado: 2026-11-20
---

# Estado atual — único checkpoint de continuidade

## Resumo factual

- Branch de trabalho: **`Dev-v3`**, criada a partir da `Dev-V2`.
- Escopo acordado: **Editor V6 exclusivamente**; V7 não é parte desta iniciativa.
- Produto desejado: prévia leve com piscadas; animação completa **somente no export**.
- Meta de engenharia: engine offline independente da UI, com liberdade de substituir a renderização/animações atuais.
- Histórico reproduzível na Dev-V2: **163,760 s para export padrão de 200 s**; objetivo exploratório **<=90 s**.
- Além do plano, existe um **laboratório F1 de composição offline**, ainda não conectado à exportação V6 real.
- Trabalhos anteriores já commitados na `Dev-v3`: isolamentos de cache por projeto, regra temporal de vídeo, testes e CI focado. Eles não constituem a nova engine.
- O laboratório F1 executou testes locais e MP4 sintético no Linux; **nenhum gate completo foi validado**, nem existe benchmark comparável ao export padrão.

## Quadro de gates

| Fase/gate | Status | Evidência exigida para concluir |
| --- | --- | --- |
| F0 / G0 | EM_ANDAMENTO | inventário parcial e fixture inicial; falta golden real e baseline medido |
| F1 / G1 | EM_ANDAMENTO | smoke offline sintético passou; falta frame V6 real, paridade e Windows |
| F2 / G2 | PENDENTE | IR versionado e resolver determinístico |
| F3 / G3 | PENDENTE | poses/expressões corretas em PNGs comparáveis |
| F4 / G4 | PENDENTE | boca/cabelo completos + A/B H0–H4 |
| F5 / G5 | PENDENTE | vídeo/áudio/MP4 fim a fim com validação |
| F6 / G6 | PENDENTE | benchmark justo e memória controlada |
| F7 / G7 | PENDENTE | integração do export V6 e rollback |
| F8 / G8 | PENDENTE | remoção segura de legado e gates finais |

## Experimento inicial F1 — evidência limitada de 20/11/2026

- Código: `scripts/editor-v6/engine-v3/offlineCompositor.cjs` — consome o contrato existente `EditorV6NativeFramePlan` e desenha **RGBA** via Sharp, sem React/Electron/capturePage.
- Smoke: `scripts/editor-v6/engine-v3/smokeExport.cjs` — gera personagem/arte sintéticos, 150 quadros com mudanças e piscadas em 640×360/30, envia raw RGBA ao FFmpeg `libx264`, verifica MP4 com `ffprobe`.
- Testes locais Linux/Node 22, Sharp instalado: `node --test tests/editor-v6/engineV3OfflineCompositor.test.cjs` → **15/15 passando**. São testes pequenos de pixel/contrato, não golden de cena real.
- Smoke local: `node scripts/editor-v6/engine-v3/smokeExport.cjs --frames=150 --width=640 --height=360` → MP4 H.264 com **150 frames** confirmados no ffprobe; **2.783 ms** de parede nesta máquina, apenas referência do protótipo sintético (não velocidade projetada para 1080p/export real).
- Saída do laboratório fica em pasta temporária independente. Não lê nem grava projetos do usuário.
- Comparação: o C++ experimental anterior registrou **183,7 ms** medianos por round-trip Full HD contra **34,6 ms** no Chromium em fixture simples e falhou em projeto curto; não considerar esse C++ backend pronto. Ver `docs/lixo/editor-v6/RENDERIZADOR_NATIVO_CPP.md`.
- **Lacunas:** sem cabelo, boca real, texto, vídeo sobreposto ou áudio no protótipo; sem validação de Windows empacotado; sem golden/benchmark reproduzido; não promoveu `Sharp` como backend final.
- Nova verificação CI de Windows foi adicionada; resultado de CI precisa ser consultado no GitHub antes de ser declarado aprovado.

## Próxima tarefa concreta [NEXT-002]

**Conectar a fixture sintética V6 ao contrato de comandos do novo compositor, mantendo o export antigo intacto.**

1. Materializar um `EditorV6NativeFramePlan` de **uma cena V6 sintética real** (não apenas comandos manuais).
2. Confrontar quadro pixel a pixel com a saída antiga antes do codec; registrar diferenças de máscara, escala, flip, rotação, texto e alpha.
3. Medir cenário 1080p e memória/transferências e acrescentar fixture de assets grandes; **decidir continuar com Sharp ou testar outro backend**.
4. Fechar G0 somente com golden e baseline; fechar G1 somente após qualidade, protocolo e Windows. Até lá, ambos `EM_ANDAMENTO`.

## Bloqueios/hipóteses em aberto

- [RISCO] Nenhum backend gráfico novo foi escolhido ou validado.
- [RISCO] Cabelo pode dominar preparo, simulação, composição ou memória; distinguir com medição.
- [RISCO] Vídeos sobrepostos diferem potencialmente entre prévia e export; definir contrato autoral.
- [RISCO] O atual preview pode mostrar atlas de pose/face preparados; política-alvo é **só piscada** e ainda requer implementação/checagem.
- [RISCO] A autorização histórica para usar corte real refere-se ao escopo e cuidados do relatório antigo; usar cópia verificada, nunca original como alvo destrutivo.

## Atualização deste arquivo

Alterar só: status de gate, **próxima ação**, bloqueio e referências a testes/commits.
Manter este arquivo pequeno. Resultado detalhado fica em relatório ou teste versionado, não em diário de chat.
Ao validar um gate, informar data, commit, comando, saída relevante e localização do artefato.
