# Rodada 24 — Reuso de superfícies faciais idênticas

**Data:** 04/11/2026 · **Branch:** `Dev-V2` · **Escopo:** preparação de cabelo para MP4, sem alterações de interface ou de renderização normal.

## Problema e correção

Na montagem das camadas de uma mesma pose, vários alvos de PNG podem ter IDs distintos e **os mesmos parâmetros visuais de rosto**. Antes, o renderizador sem cabelo pintava e serializava outro Canvas facial para cada um desses alvos.

Agora a preparação mantém uma tabela **local ao grupo personagem + pose** que registra apenas o ID de um PNG facial já serializado, usando uma chave com:

- aparência facial e componentes selecionados;
- transformações e efeitos faciais;
- modo facial exato (`idle`, `blink`, `talk`, `talk-blink`);
- tratamento de boca isolada para exportação.

Se a chave for idêntica, o rosto não é pintado nem codificado novamente: o próximo rig aponta para o mesmo PNG imutável. Não se guarda um Canvas mutável, não se mistura poses e não se reutilizam imagens entre exportações. As dimensões e as camadas estáticas são as do mesmo renderer/pose já preparado.

O cálculo de recorte `measureFaceModeCrop` e a geometria normal continuam no caminho anterior. Mudanças de expressão, olhos, boca, efeitos e proporções continuam disparando o preparo correspondente.

## Testes e limites

`tests/editor-v6/hairPreparationReuse.test.ts` cobre a assinatura idêntica e as diferenças de modo, boca, aparência, efeitos e transformações. A CI Windows também executa contratos de TypeScript, build e testes de MP4 offscreen, porém os testes unitários não substituem comparação de um projeto pessoal real.

**Ganho esperado:** menos chamadas de pintura facial e `canvas.toDataURL('image/png')` quando o mesmo rosto é repetido numa pose. Se todos os alvos forem visivelmente diferentes, não há economia nessa etapa. Não há medição de segundos reais nesta rodada.

## Aferição no Windows 11

Na primeira exportação com projeto/preset real isolados, registrar os estágios `renderHairlessFaceTarget`, `serializeFaceSurface`, `measureFaceModeCrop` e o total de preparação, comparando com a mesma configuração de R22. Fazer 300 quadros 1920×1080/30fps, primeiro export sem reuso anterior, e verificar qualidade, mouth/eyes, roupas, alpha, cabelo posterior e Turbo.
