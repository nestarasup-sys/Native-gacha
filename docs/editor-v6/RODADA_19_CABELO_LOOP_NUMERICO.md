# Rodada 19 — Cabelo em loop numérico (3/4 segundos) para MP4

**Estado:** modo experimental funcional no pipeline de exportação; física contínua tradicional permanece o padrão. **Não é cache de exportação.** O teste visual real ainda depende do Windows 11/AMD e de preset salvo na cópia isolada.

## Como experimentar

1. Atualize a `Dev-V2` e abra o **Editor V6**.
2. Abra **Exportar MP4** → **Animação de cabelo**, marque **Ativar animação de cabelo**.
3. Escolha um preset salvo válido; o **Preset 2** pode não existir na cópia segura usada pelo Codex na R17.
4. Em **Movimento do cabelo**, selecione **Loop experimental · 4 segundos** (ou **3 segundos**).
5. Exporte MP4 e observe vento, junção do ciclo, movimento de cabeça, troca de pose e espelhamento. Compare depois com **Física contínua (atual)**.

## Implementação

- `hairMotionEngine.ts`: o mesmo spring chain com prewarm gera 90/120 vetores `Float32Array` por peça. Tamanho típico de 4 s = **120 × 9 × 4 = 4320 bytes por peça**, sem atlas PNG de animação.
- `exportWorker.tsx`: cada worker calcula sua tabela de vento uma vez por peça, por **exportação**, amostra por `frame % cycleFrames` (frame absoluto) e mantém um pequeno impulso ligado ao delta local da cabeça. A pose/rig inteiro continua seguindo a timeline. Turbo não reinicia o ciclo na metade do vídeo.
- A transição final de 12 amostras retorna por smoothstep até o primeiro vetor: **não há salto de posição** do vento, mas a **velocidade/derivada pode não ser exatamente contínua**; verificar se o loop fica natural.
- `EditorV6ExportPanel.tsx` expõe a opção. `editorV6HairMotionPreparation.ts` inclui apenas o valor numérico no pacote. `editorV6HairMotion.ts` valida via Zod, `editorV6Export.ts` valida a duração/preset e `exportIpc.ts` rejeita pacote/opções discrepantes.
- Sem configuração `loopFrames`, o código da física contínua original permanece. Nenhuma modificação na prévia normal, Customizador, Fabricador, áudio ou encoder.

## Limites e validação

- O loop **não elimina os bakes de transição de pose**, nem a composição e captura de cada frame. Não declarar meta de 10–15 s atingida sem medição de MP4 bruto.
- Loop e física contínua são **movimentos diferentes por escolha do usuário**; comparar qualidade visual e estabilidade em personagens reais, principalmente boca/cabelo/flip.
- Testes unitários de 90/120 amostras, seam, determinismo e compatibilidade da física contínua em `hairMotionLoop.test.ts`. CI Windows existente executa TypeScript, Vitest e MP4 sintético. **Ela não compara o novo loop com referência visual artística real.**
- Benchmark verdadeiro deve usar somente cópia **verificada e isolada** de projeto/preset real, 300 frames a 30 FPS, 1920×1080, Turbo, `h264_amf`, sem reutilização de MP4 anterior. R17 não conseguiu preparar cabelo porque Preset 2 não estava na cópia: não fabricar um.
