# Zona de guerra — R35: indicadores do reuso real de rigs

O relatório original mostra 21 bakes e nenhum atlas já pronto; a métrica antiga `motionPreparation.reused` contabilizava atlas reaproveitados, **não** reconstruções internas de personagem que poderiam ter sido evitadas.

Agora `metrics.reusedRigs` é um contador opcional no resultado de cada bake (0–100, compatível com registros antigos). `prepareExportMotions` agrega `preparedRigs` e `reusedRigs` no bloco `motionPreparation` gravado no JSON. Só conta hits exatos do renderer na sessão, não recolorações faciais.

No relatório novo, comparar `motionPreparation.preparedRigs` e `motionPreparation.reusedRigs` com `motionPreparation.requestMilliseconds` e `phaseMilliseconds.motionPreparation`. Muitos hits de rigs **não garantem** menor tempo de exportação, mas mostram se a arquitetura da guerra está funcionando no projeto real.

Segurança: Zod valida os números, entradas anteriores sem esse campo continuam válidas, o RGBA/atlas não muda por esses contadores e os dados não incluem nomes, IDs ou caminhos privados.