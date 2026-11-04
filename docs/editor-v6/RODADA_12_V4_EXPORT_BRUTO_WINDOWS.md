# Editor V6 — Rodada 12 · Remoção do cache de reexportação e testes Windows

**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Base:** cf26d19ab10e117a54ba569d7e5580a069af9808

## Decisão de produto explícita

O usuário rejeitou a estratégia da Rodada 10, que apenas evitava repetir o preparo quando a cena e o preset eram idênticos. A partir desta rodada o foco é **tempo bruto da primeira exportação**, independentemente de cache quente.

### Mudanças de código

- `EditorV6ExportPanel.tsx`: chama novamente `prepareEditorV6HairMotionBundle` diretamente em todo export; remove todos os listeners, estado e dependência do cache R10.
- O módulo de cache e o teste exclusivo de reuso idêntico foram apagados da árvore atual; o documento da R10 fica marcado como histórico.
- A configuração `editor-v6-parity.yml` usa **apenas** runners Windows x64 para gates, Vitest, build e provas MP4. Não há job Linux.

### Windows 11 vs GitHub Actions

O runner GitHub hospedado `windows-2025` é **Windows Server 2025 x64**, não Windows 11. Há runner Windows 11 ARM64 (`windows-11-arm`), mas ele não equivale ao Windows 11 **x64 com GPU AMD AMF** usado pelo usuário. Não rotular o Server como Windows 11 nem substituir validação local.

**Aceite obrigatório no Codex local:** Windows 11 x64, hardware real, Preset 2, 1920x1080, 300 quadros, `h264_amf`, três execuções e hashes RGBA/MP4 de referência. A CI hospedada só demonstra regressões funcionais em Windows x64.

### Baseline real anterior (inalterada até novo benchmark)

- Primeira execução fria: 53,47 s, preparo 19,26 s, export 34,21 s.
- Média quente: 34,33 s, preparo 18,23 s, export 16,10 s.
- Melhor completa: 34,15 s. Nenhuma aceleração desta rodada é alegada antes de medição no projeto real.

Veja também `RODADA_13_V4_BAKE_BRUTO_ENDPOINTS.md` para a próxima otimização de renders redundantes dos bakes.
