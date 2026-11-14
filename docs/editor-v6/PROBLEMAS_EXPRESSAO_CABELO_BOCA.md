# Editor V6 — Problemas de expressão, cabelo e boca

Estado: **correção estrutural da boca implementada na branch Plano B, aguardando validação real; expressão e reações de cabelo ainda pendentes**. Os três sintomas foram relatados em projeto longo; um projeto curto pode não reproduzi-los. As hipóteses abaixo não substituem uma reprodução com os quadros e dados da cena afetada.

## 1. Personagem muda de altura durante troca de expressão

**Sintoma:** ao trocar de expressão, a altura total do personagem aumenta ligeiramente por um instante e volta ao normal.

**Investigação:** comparar a escala, o recorte e a posição do personagem antes, durante e depois da transição. Examinar `faceRenderGeometry` em `src/renderer/src/characters/characterGeometry.ts`, sua aplicação em `src/renderer/src/features/editorV6/editorV6CharacterAppearanceCommands.ts` e a interpolação em `src/renderer/src/features/editorV6/motion/motionFrameGeometry.ts`. Uma divergência entre recortes ou pontos de referência é hipótese, ainda não causa comprovada.

**Aceite:** nos casos reproduzidos, a expressão muda sem salto involuntário de escala ou posição; conferir também poses, espelhamento, rotação e preview versus exportação.

## 2. Cabelo não reage em algumas trocas de pose

**Sintoma:** em certas trocas de pose do projeto longo, a reação de cabelo não aparece na exportação.

**Comportamento desejado:** a reação começa **depois do fim da transição de pose**, como ocorre atualmente nos casos corretos. Não alterar esse momento para durante a transição.

**Investigação:** rastrear a identificação de cada troca e o quadro final em `src/renderer/src/features/editorV6/exportHairMotionPlanIndex.ts`, a seleção de assets para cada trecho em `electron/domains/editorV6/exportWorkerPayload.ts` e o cálculo da reação em `src/renderer/src/features/editorV6/exportHairPieceMotionState.ts` e `src/shared/hairMotionEngine.ts`. Verificar também o que acontece nas bordas de partes e diante de cache e estados de pose. A causa das ausências ainda não foi comprovada.

**Aceite:** a reação aparece após cada troca aplicável, inclusive próximo a emendas de exportação, sem vento contínuo nem alteração nas trocas em que a animação está desativada.

## 3. Exportação falha: boca isolada fora do recorte corporal

**Sintoma:** com animações habilitadas, o projeto de seis minutos falhou tanto com CPU como com AMF: `A boca isolada ficou fora do recorte corporal usado pelo personagem.` A falha ocorreu durante a renderização, antes da finalização.

**Evidência:** `src/renderer/src/features/editorV6/motion/motionMouthlessBaseAssets.ts` calcula o recorte das bases; `src/renderer/src/features/editorV6/motion/motionStaticMouthBake.ts` prepara as amostras da boca; `src/renderer/src/features/editorV6/motion/motionIsolatedMouthAtlas.ts` valida se elas cabem no recorte. Uma hipótese consistente com o código é que uma amostra ampliada ultrapasse o recorte calculado anteriormente. O relatório não identificou a geometria específica que causou a falha, portanto a hipótese precisa de confirmação.

**Implementado (branch Plano B):** a preparação agora renderiza primeiro as amostras da boca ampliada, calcula a união dos recortes e só então recorta as bases `talk` e `talk-blink` usando o mesmo `facePatchSourceCrop`. Evita eliminar a validação do atlas ou deslocar silenciosamente o patch. Testes unitários cobrem a expansão do recorte, mas **o projeto real de seis minutos com CPU e AMF ainda precisa confirmar o resultado**. Também falta verificar os consumidores de `facePatchSourceCrop` na composição de cabelo.

**Aceite:** exportar o trecho que falha com boca animada, CPU e AMF, confirmando visualmente a posição da boca e a integridade do arquivo. Repetir no projeto longo completo após validar o trecho.

## Validação conjunta

- Preservar os dados do projeto e usar uma cópia isolada para reprodução.
- Comparar quadros consecutivos em trocas de expressão e pose, inclusive emendas entre partes.
- Conferir boca, cabelo, tamanho e posição do personagem no preview e no vídeo.
- Testar com as caixas de desativação desligadas e ligadas, sem afetar o comportamento não relacionado.
- Registrar encoder, configuração, contagem de quadros, áudio e resultados; distinguir observação real de hipótese.
