# EXP-003 — Cabelo posterior RGBA/ROI em reação de pose

**Status:** PROTOCOLO PREPARADO — NÃO EXECUTADO.  
**Dependências:** EXP-001 e inspeção das layers/máscaras de `editorV6HairMotionPreparation.ts`.

## Hipótese

A reação de pose posterior é calculável por quadro; após um evento de troca há aproximadamente 29 frames animados, não loop infinito. **Se** separarmos camadas do corpo/face e cabelo posterior, poderemos usar base estática + ROI RGBA de cabelo apenas no intervalo ativo, sem recompor personagem completo por quadro.

## Comparações obrigatórias

- Referência atual contra compositor ROI para frame de repouso, antes/durante/depois da transição e todos os 29 frames ativos.
- Falando, piscando, expressão alterada, duas poses, duas trocas muito próximas.
- Personagem espelhado, rotacionado, redimensionado; múltiplos personagens; duas lanes Turbo com reação cruzando a fronteira.
- Oclusão: cabelo posterior deve ficar **atrás da cabeça**, não colado por cima, e cabelo estático de base deve ser removido sem apagar acessórios/roupas.
- Alpha, premultiplicação, filtragem, shadow, anti-alias, crop e margem de malha, paridade sob fundos contrastantes.
- Tempo **preparo+render+FFmpeg** e picos de GPU/CPU/RAM, com e sem reuso, frio/quente.

## Variantes a testar

A. Textura/mesh WebGL sob demanda sem clip; B. Canvas ROI em buffer; C. Atlas RGBA pequeno por evento; D. Clip com alpha real **apenas se** custo de gerar/decodificar justificar. **Não** usar H.264 MP4 comum como contêiner de transparência.

**Gates:** qualidade de pixels, layer order, duração e memória intactas e redução no total do primeiro export. Se o bake da camada custar mais que o ganho em quadro, rejeitar variante.
