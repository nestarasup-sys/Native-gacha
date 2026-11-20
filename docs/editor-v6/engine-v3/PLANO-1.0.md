---
id: V6-ENGINE-PLAN-1.0
tipo: plano
status: direcao-acordada
branch: Dev-v3
atualizado: 2026-11-20
proximo: PLANO-1.1.md
---

# Plano 1.0 — Missão, limites e arquitetura de destino

## 1. Decisão central [DEC-001]

**Manter o Editor V6 como produto de autoria e criar um motor próprio de exportação offline.**
Não criar Editor V7; não tentar executar a animação completa em tempo real na prévia.
A arquitetura interna de animação, cabelo, timeline e render pode ser substituída quando for melhor.
O resultado visual, a experiência de edição e a integridade dos projetos são os contratos.

Esta série é um plano revisável, não um registro de algo já implementado. Ver [ESTADO.md](ESTADO.md).

## 2. Comportamento obrigatório do produto

- **Prévia rápida:** exibir cena editável, poses estáticas nos blocos, cortes, imagens, textos, fundos, mídia original quando aplicável e **somente piscadas** como animação automática do personagem. Sem simulação de cabelo, ciclo de boca ou interpolação animada de pose/expressão em playback.
- **Exportação:** executar todas as animações habilitadas no perfil escolhido: pose, expressão, piscada, boca, cabelo, vídeos e áudio. Não retirar qualidade nem efeitos para ganhar velocidade.
- Prévia não é oráculo de pixels para animações que não exibe. O **MP4 de referência existente** e fixtures de regras autorais servem de comparação.
- Não criar render de trechos completos como função de prévia por padrão. O usuário rejeitou essa direção.
- O editor continua utilizável sem o novo motor pronto. Nenhuma migração de projeto é forçada só por abrir a aplicação.

## 3. Por que a intervenção é estrutural

O V6 atual tem um resolvedor comum de estado (`src/shared/editorV6TimelineScene.ts`), mas:
- a prévia passa por React/SVG, vídeo HTML e composição facial assíncrona;
- o export acrescenta preparação de boca/cabelo e compõe frames em worker;
- o caminho padrão depende de pintar/capturar frames no Chromium/Electron, transportar BGRA e codificar no FFmpeg;
- custo de preparação e de quadros é alto, e os submotores acumulam decisões em pontos distintos.

**Hipótese a testar:** separar avaliação de cena, simulação, desenho e encoding tornará mudanças de animação mais isoladas e permitirá remover readback de Chromium por frame. Não é fato que um backend alternativo será mais veloz.

## 4. Responsabilidades propostas

```text
Editor V6 (UI, timeline, projeto, undo/redo, preview leve)
  | documento persistido; opções de export; IDs das fontes
  v
Adaptador V6 -> IR versionado [VALIDA, NÃO ALTERA PROJETO]
  | timeline normalizada + referências a assets + parâmetros
  v
Engine Core (sem React, DOM, Electron, FFmpeg, filesystem)
  | resolução de eventos, amostras de animação, ordem de camadas
  | pré-processamento opcional e determinístico por job
  v
FramePlan(frame, fps, resolução) -> comandos/recursos visuais
  | frame isolado e buscável, sem dependência do playback da UI
  v
Compositor offline (backend intercambiável, com uma implementação real)
  | pixels RGBA/BGRA ou stream de camadas com contrato explícito
  v
Compositor de mídia + FFmpeg (vídeo, áudio, encode, junção)
  | H.264/AAC e outras opções já suportadas
  v
Validador -> publicação atômica do MP4 e relatório
```

No futuro, o adaptador pode ler um schema de projeto evoluído. O **IR não é o formato salvo**.
Não é obrigatório que cada frame crie um objeto enorme; plans podem referenciar dados imutáveis por ID.

## 5. Limites de propriedade

| Dono | Responsabilidade | Não deve fazer |
| --- | --- | --- |
| Editor V6 | autoria, timeline, persistência, preview leve | simular cabelo ou compor frames pesados |
| Adaptador | validar e traduzir o projeto V6 para IR | mudar silenciosamente projeto/asset |
| Engine Core | tempo, estado, pose, expressão, eventos, determinismo | importar React/Electron, ler disco, chamar FFmpeg |
| Backends de animação | produzir geometria/amostras e caches por job | decidir duração/clips fora do core |
| Compositor | ordem visual, transformações, alpha e pixels | interpretar JSON do projeto e editar timeline |
| Pipeline de mídia | integrar vídeo, áudio, timestamps e encoding | inventar regras de personagem |
| Infraestrutura | recursos, isolamento de jobs, IPC, cancelamento e publicação | tornar o core dependente de infraestrutura |

As interfaces devem nascer de **uma fatia vertical funcionando**, não de uma hierarquia genérica de classes.

## 6. Escolha de tecnologia (aberta até teste)

- **Candidatos:** Sharp/libvips já presente no projeto; Skia via binding adequado; compositor 2D nativo mínimo sobre biblioteca madura; ou combinação com FFmpeg para camadas/mídia.
- Reutilizar FFmpeg para codec/mux. Não escrever codec, rasterizador completo, sistema de fontes ou toolkit gráfico do zero.
- Considerar suporte real a máscaras, atlas, recortes, gradientes, transformações, transparência, texto, imagens grandes e interoperabilidade em Windows x64.
- Avaliar instalação/distribuição, licenças, peso, atualização, crashes, isolamento de memória, suporte a threads e perfis de render.
- A existência de código experimental C++ ou de uma proposta V7 **não** os torna base obrigatória. V7 fica fora do escopo.
- Escolher backend só após comparação controlada descrita em [PLANO-1.1.md](PLANO-1.1.md) e [PLANO-1.3.md](PLANO-1.3.md).

## 7. Invariantes que não podem se perder [INV]

- [INV-01] Projetos existentes abrem sem sobrescrita, perdas de IDs, mudanças silenciosas de fonte ou invalidação irreversível.
- [INV-02] Export respeita blocos, posição, escala, ordem Z, cortes e os efeitos autorizados.
- [INV-03] Um frame/timestamp/seed/asset fixos produzem estado de animação determinístico, mesmo em export particionado ou com seek.
- [INV-04] MP4 tem a duração, número de quadros, resolução, codec, áudio e sincronismo esperados.
- [INV-05] Falha/cancelamento não substituem vídeo final válido nem deixam processo de export órfão.
- [INV-06] A UI não espera o novo motor para arrastar, selecionar e navegar.
- [INV-07] Dados reais e mídias pessoais não são usados como fixtures destrutivas.

## 8. Metas e não-metas

**Meta funcional:** exportação completa fiel e sustentável; ampliar efeitos futuros sem espalhar regras.
**Meta de performance:** testar viabilidade de até **90 s clique -> MP4 validado** no corte conhecido de 200 s.
**Referência histórica (não benchmark novo):** 163,760 s, 6.000 quadros 1080p/30, CPU OpenH264, 4 workers, áudio e animações.
**Não-meta:** fazer todo efeito animar na prévia, lançar V7, prometer 90 s sem medir ou reescrever o editor inteiro antes de exportar um frame.

## 9. Critério de sucesso da iniciativa

O motor novo só vira padrão quando cumpre os gates de fidelidade, dados, crash/cancelamento e distribuição;
depois deve demonstrar benefício mensurável de desempenho ou manutenção que justifique substituir o pipeline.
Se um backend falhar, substituí-lo. Se o IR estiver inadequado, revisá-lo. **Não proteger uma decisão só porque já foi codificada.**

**Continua:** [Plano 1.1 — execução e gates](PLANO-1.1.md).
