# Editor V6 — Alternativas para o exportador 2026–2027 (pesquisa de 04/11/2026)

## Problema medido e restrição principal

Baseline da R09 no projeto `Editor V6 06`: **34,84 s quente**, com preparo de cabelo **18,31 s** e export principal **16,54 s**. Após reaproveitar sessão de bake: **34,33 s quente**, com preparo **18,23 s**, export principal **16,10 s**; melhor execução **34,15 s**. 1920×1080, 300 quadros, Preset 2, 2 workers Turbo, `h264_amf`, sem faixa de áudio/vídeo nesta cópia real.

A meta de **10–15 s** exige **duas frentes simultâneas**: eliminar/desacoplar o custo dos 11 bakes e produzir/encodar 300 quadros em menos de 15 s. Otimizar somente o compositor Chromium não basta.

## Ranking de opções (hipóteses, não benchmarks)

| Prioridade | Tecnologia / arquitetura | Potencial | Obstáculo | Teste decisivo |
| --- | --- | --- | --- | --- |
| P0 | Pré-bake verificável, indexado por revisão completa e preparado antecipadamente | Muito alto para reexport e possivelmente export frio com prewarm | Invalidação de Fabricador/Customizador e RAM/disco | O mesmo conjunto de dados deve gerar PNG/RGBA byte a byte equivalente; medir cache miss, hit e retenção |
| P0 | Compositor nativo de camadas estáticas e personagens com `sharp` (já é dependência do projeto) + física de cabelo determinística | Potencial para remover renderização React/Chromium por quadro | Composição RGBA, geometria de SVG, texto e bordas suavizadas, cabelo GPU | Spike **fora da produção** de 30/300 quadros, mesmas fontes, comparar RGBA depois da decodificação com tolerância acordada |
| P1 | Skia via `@napi-rs/canvas` (Node-API, MIT) | Canvas 2D nativo, paths/texto sem DOM; possível back-end de frame em worker | Adicionar binário e testar Electron/Windows, ABI/empacotamento, diferenças de rasterização/fontes | Rasterizar uma cena sintética com personagem, boca, texto e espelho; perf + paridade |
| P1 | `resvg-js` (Rust, MPL-2.0) para subconjunto de SVG | Bom para cenas vetoriais/textos estáticos; Node nativo e WASM | `foreignObject` e Canvas/WebGL dinâmicos do Editor não são drop-in em resvg | A/B num SVG **sem** `foreignObject`; confirmar pixels, tipografia e transparência |
| P1 | Electron Offscreen `paint` / GPU `useSharedTexture` + D3D11/FFmpeg | Potencial redução de readback GPU→CPU e cópias por quadro | Texture handle e release exigem ciclo de vida nativo, integração com encoder AMD/Windows, GPU driver | Spike isolado com 2×150 frames, sem alterar produção; nenhuma textura vazada ou corrompida |
| P2 | Vello CPU/GPU (Rust, Apache-2.0/MIT) | CPU SIMD e wgpu/WebGL2 para um motor próprio | Engenharia maior para todas as primitivas e compositor de cabelo, empacotamento | Só depois de protótipo Skia/sharp indicar limite |
| P2 | FFmpeg `filter_complex` com `overlay` e `amix` | Pode tirar overlay de vídeo/áudio do Chromium e usar filtros do encoder | Igualdade de alpha premultiplicado, timing e vídeos dinâmicos | Prova de 300 quadros com vídeos e áudio **reais**, comparação A/B |
| Evitar agora | Reescrever todo o editor em Rust/Canvas ou mudar a prévia para cabelo animado | Baixa relação prazo/risco | Regredir interação, compatibilidade e fluxos pessoais | Não implementar sem prova de necessidade |

## Leituras técnicas verificadas

- Electron [Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering/) e [webContents API](https://www.electronjs.org/docs/latest/api/web-contents): `capturePage` captura CPU; `paint` fornece dirty rect; `useSharedTexture` fornece texture handle GPU e requer release explícito.
- Electron [OSR native details](https://github.com/electron/electron/blob/main/shell/browser/osr/README.md) e [SharedTexture](https://www.electronjs.org/docs/latest/api/shared-texture): importação D3D11/NT HANDLE requer camada nativa e lifetime correto, não apenas uma flag em Electron.
- [sharp](https://sharp.pixelplumbing.com/): biblioteca já presente em `package.json` para raster e composições.
- [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas): Skia para Node-API, sem dependências de sistema, MIT.
- [resvg-js](https://github.com/thx/resvg-js): rasterizador SVG Rust/Node/WASM, MPL-2.0.
- [Vello](https://github.com/linebender/vello): projeto Rust com implementações CPU SIMD e GPU.
- FFmpeg [filter_complex e overlay](https://ffmpeg.org/ffmpeg.html) / [filtros overlay](https://ffmpeg.org/ffmpeg-filters.html): composições de streams, configuráveis para alpha e timing.

## Experimento de maior retorno: compositor híbrido em vez de navegador obrigatório

**Não remova Chromium da prévia/edição.** Separe apenas o *export* em etapas:

1. **Plano de frame puro**: `resolveEditorV6SceneAtFrame` + referências a assets/expressões/transições e valores da física. Não usar DOM.
2. **Prebake em background**: superfícies imutáveis por pose, expressão e revisões completas, com invalidação e limites de RAM/disco. Não persistir em documentos do usuário.
3. **Composição nativa de pixels**: fundo/color/PNG e personagens em buffers RGBA com `sharp` inicialmente; estudar `@napi-rs/canvas` para texto/vetores e deformação de cabelo. Ainda não substituir malha WebGL sem prova.
4. **Encode**: enviar um único fluxo rawvideo ordenado a FFmpeg/AMF; audio mixer e validação de saída continuam.
5. **Fallback completo**: qualquer cena não suportada usa o pipeline atual de Electron sem perder pixels, som, framerate ou projeto.

O primeiro spike deve usar 30 quadros representativos (incluindo boca, cabelo em movimento, pose, espelhamento e costura Turbo), depois 300 quadros com MP4. Comparar **hashes de decodificação** e não apenas hash do arquivo codificado. Só considerar ganho se a **mediana de 3 execuções quentes completas** melhorar com memória controlada e sem perda visual.

### Bloqueadores e não decisões

- O `resvg` sozinho não interpreta automaticamente o `foreignObject` que carrega as superfícies Canvas do cabelo no SVG; seria necessário achatá-las em RGBA.
- `@napi-rs/canvas` não executa React nem shader WebGL do cabelo; requer portar o compositor e um motor de malha correspondente.
- A integração GPU nativa no Windows pode ser mais cara do que aproveitar `sharp`/Skia. Não adicionar dependências pesadas ao produto antes do spike.
- O cache da Rodada 10 acelera só repetição **sem alterações**; não resolve primeiro export e não substitui cache persistente com chave de revisão.
- A fixture real do Codex **não tinha áudio/vídeo**; faça teste separado com assets reais antes de garantir fidelidade para casos multimídia.

## Proposta de sprints Codex após Rodadas 10 e 11

1. Medir reexportação interativa do mesmo projeto (cache miss/hit) com Preset 2, 300 frames; comparar hash de quadros e medir peak RSS. Não chamar a média quente do harness atual de 'hit' — ele bypassa o painel.
2. Fazer um spike independente **sem React nem Chromium** com `sharp` usando 30 quadros de uma cópia isolada (não alterar flags do exportador). Processar apenas geometria e imagens suportadas; emitir relatório por frame de diferenças RGBA.
3. Testar 2 caminhos de bake antecipado: atlas por revisão persistido em cache descartável e preparação em ociosidade; medir custo de cold miss, warm hit, invalidação, RAM e ganho ponta a ponta. Priorizar evitar os 11 bakes.
4. Validar áudio de arquivo real no intervalo com trilha, depois executar a matriz com vídeo embutido, onde custo de Chromium pode ser maior.
5. Considerar spike D3D11 se o A/B mostrar que composição nativa de pixels ainda gasta muito em cópias.

**Critério de aceite:** reprodutibilidade e fidelidade primeiro; meta de 15 s só depois de benchmark completo. Não publicar screenshots/media/dados do projeto real.

## Ferramenta executável da Rodada 11 — compositor nativo isolado

Foi incluído `scripts/editor-v6/spike-native-compositor.cjs`, executável com `npm run spike:editor-v6:native-composite -- --frames=300`. Por padrão ele gera um par **sintético** de camadas 1080p, mede tempo total/p50/p95 e RSS observado (não edita arquivos). Para testar camadas externas copiadas para um diretório isolado, utilize:

```powershell
node scripts/editor-v6/spike-native-compositor.cjs --background=C:\CAMINHO_ISOLADO\fundo.png --foreground=C:\CAMINHO_ISOLADO\personagens-alpha.png --reference=C:\CAMINHO_ISOLADO\composicao-electron.png --frames=30 --strict
```

A opção `--strict` exige **RGBA exatamente igual**. Para investigação inicial, execute sem `--strict` e confira `mismatchedPixels`, `maximumChannelDifference` e `meanAbsoluteChannelDifference`. O script lê PNGs, não os publica e não imprime caminhos privados. O teste automatizado `tests/editor-v6/nativeCompositorSpike.test.cjs` cobre parser/alpha e oito quadros sintéticos.

**Atenção:** o mesmo primeiro plano é repetido em cada ciclo; o número de FPS é do **blend nativo isolado**, não do MP4. O Codex deve depois exportar 30 pares **diferentes** de cenas reais e comparar o fluxo nativo completo com o renderer de referência. As saídas do spike não provam fidelidade de SVG, hair mesh, WebGL, sincronia, áudio nem encode.
