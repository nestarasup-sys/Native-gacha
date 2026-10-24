# G-V5: EditorCore com Undo/Redo e revisão de sprite GPU
**Data:** 23/10/2026. **Alvo:** Windows. **Branch:** feature/model-source-editor.

Esta etapa introduz histórico de documento v1 com limite de 64 checkpoints, Undo/Redo na rota reconstruída, reset ao abrir/criar/fechar/salvar cópia e controle de bloqueio de faixa. A recriação do SceneEvaluator após edição agora preserva o playhead absoluto. Não há gravação sobre o documento original.

O cache WebGL2 invalida a textura quando um objeto-fonte muda sob o mesmo ID lógico, mantendo corpo/cabelo estáveis quando só um olho muda. Um teste com mock WebGL2 protege uploads e liberação de recursos.

**Legado preservado por dependência:** a folha VideoStudioEditor.css ainda alimenta VideoPreviewOraclePage.tsx. Também ficam os componentes e módulos consumidos por exportação, testes e oráculos. Não foram excluídos recursos de usuário.

**Validação pendente:** golden normal/PT de Chromium em Windows, compilador real de sprites do catálogo Gacha, decodificadores supervisionados, áudio/PTS completos, export próprio e stress de 4 personagens. Os novos testes de histórico/GPU são contratos unitários e não provam desempenho visual ou VRAM. Consulte a CI pelo SHA final antes de atribuir sucesso.
