# Rodada 20 — Balanço único do cabelo POSTERIOR após troca de pose

**Branch:** Dev-V2. **Escopo:** somente MP4. **Não há loop nesse modo.**

## Identificação exata das cinco categorias do Fabricador

| Categoria UI | ID de personagem | Referência de origem |
| --- | --- | --- |
| Traseiro | `backHair` | `back` |
| **Posterior** | **`rearHair`** | **`front`** |
| Rabo de cavalo | `ponytail` | `back` |
| Franja frontal | `frontHair` | `fringe` |
| Ahoge | `ahoge` | `fringe` |

A implementação corrige também o botão anterior **Animar apenas o cabelo posterior**: antes ele habilitava `back`, que corresponde ao Traseiro, não ao Posterior. Agora habilita **somente `front`**. O modo de reação seleciona adicionalmente **somente peças cujo ID começa em `rearHair:`**, para não confundir categoria e lado.

## Como testar

1. Sincronizar `Dev-V2`, entrar em **Editor V6 → Exportar MP4 → Animação de cabelo**.
2. Habilitar animação, escolher um preset salvo e marcar **Balançar só o cabelo posterior após trocar de pose**.
3. O checkbox **Animar apenas o cabelo posterior** é ativado automaticamente e fica bloqueado enquanto a reação estiver ativa. O preset salvo não é modificado.
4. Exportar um trecho com poses diferentes. O cabelo Posterior fica imóvel antes e durante a transição (fora das mudanças da própria pose), faz um **único balanço suave de aproximadamente 1 s após o fim da transição**, indo e voltando à posição original, e para. Piscadas, boca ou mudanças só de expressão não disparam novo balanço.
5. Traseiro, franja, rabo de cavalo e ahoge continuam imóveis em relação à respectiva pose. Cabelo posterior e traseiro são peças diferentes no projeto.
6. Comparar exportações Turbo e modo seguro, observando o fim da pose e cortes de trabalhador. A prévia geral do Editor continua inalterada.

## Arquitetura e limitações

- `hairMotionPoseReactionEndFrames` usa os planos de motion de pose do projeto, filtrando mudança de `poseSlot`; eventos por personagem são ordenados e independentes. `hairMotionLatestPoseEnd` usa busca binária por frame absoluto.
- `sampleHairMotionPoseReaction` é função pura; não usa simulação contínua de vento ou loop. Gera 30 samples de uma senoide amortecida: deslocamentos zero em repouso, ida, volta e retorno. A reação não modifica a geometria/posição autoral da pose.
- Export worker usa `piece.id` = `rearHair:...`, não apenas o `side`. O preset da exportação só habilita `front`; a origem de cada peça é preservada. IPC e bundle validam que reação + loop não sejam usados simultaneamente.
- **Não elimina bakes de pose** e não prova aceleração de 34 s para 15 s. Não alterar resolução, áudio, cabelo estático, mouth/face ou encoder.
- Verificar no Windows 11 AMD com cópia de projeto pessoal segura. CI Windows Server testa contratos/offscreen sintético, sem alegar qualidade real da reação no personagem do usuário.
