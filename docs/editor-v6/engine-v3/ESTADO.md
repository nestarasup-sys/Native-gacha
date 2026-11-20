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
- Esta pasta contém **planejamento**, não implementação concluída da engine.
- Trabalhos anteriores já commitados na `Dev-v3`: isolamentos de cache por projeto, regra temporal de vídeo, testes e CI focado. Eles não constituem a nova engine.
- Não há validação executada dos novos gates F0–F8 registrada aqui. Não inferir sucesso de commits sem logs de teste.

## Quadro de gates

| Fase/gate | Status | Evidência exigida para concluir |
| --- | --- | --- |
| F0 / G0 | PENDENTE | mapa, fixtures, golden e baseline medido |
| F1 / G1 | PENDENTE | frame/trecho offline sem captura Chromium, perfil e teste |
| F2 / G2 | PENDENTE | IR versionado e resolver determinístico |
| F3 / G3 | PENDENTE | poses/expressões corretas em PNGs comparáveis |
| F4 / G4 | PENDENTE | boca/cabelo completos + A/B H0–H4 |
| F5 / G5 | PENDENTE | vídeo/áudio/MP4 fim a fim com validação |
| F6 / G6 | PENDENTE | benchmark justo e memória controlada |
| F7 / G7 | PENDENTE | integração do export V6 e rollback |
| F8 / G8 | PENDENTE | remoção segura de legado e gates finais |

## Próxima tarefa concreta [NEXT-001]

**Executar F0/G0, não começar uma refatoração ampla.**

1. Confirmar `Dev-v3`, HEAD e estado local; ler `AGENTS.md` e [Plano 1.1/F0](PLANO-1.1.md).
2. Inventariar fluxo de export e preparar **matriz FIX-01..FIX-12**, escolhendo primeiro as menores fixtures sintéticas.
3. Rodar typecheck, auditoria e testes atuais pertinentes; registrar comandos, revisão e resultado.
4. Obter um baseline reproduzível do caminho antigo em fixture e identificar o primeiro frame/trecho golden.
5. Fechar G0 com links para artefatos e limite conhecido; abrir F1 com hipótese e critério de descarte.

Se não for possível executar Windows/Electron/FFmpeg, registrar `BLOQUEADO` com o motivo e produzir apenas inventário, fixture/testes estáticos; **não marcar gate validado**.

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
