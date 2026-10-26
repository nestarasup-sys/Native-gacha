# Editor V6: arquitetura e integração

## Estado atual

O Editor V6 é uma área React/TypeScript executada pelo Chromium do Electron. O Electron main expõe uma API própria pelo preload e persiste cada projeto sob `userData/studios/Editor V6/editorV6-<id>`. Cenas e assets do V6 não são documentos do Studio.

O V6 consulta APIs já existentes do Customizer e Fabricator para escolher personagens, poses, rosto e expressões. Essas chamadas servem como catálogos de origem. Ao inserir um personagem, a composição e o PNG usados na cena ficam salvos no documento do V6; o editor não grava de volta nessas bibliotecas. Não há timeline de vídeo nem exportação MP4 no V6 atual.

## Base iniciada nesta etapa

- **Electron + Chromium:** janela, isolamento, preload e APIs IPC continuam no shell existente do app.
- **React + TypeScript + Vite:** interface do V6 e compilação continuam no renderer atual.
- **Zustand + Immer:** `editorV6Store.ts` passa a guardar os projetos carregados e o histórico por projeto, sem reutilizar o estado do Studio.
- **Zod:** `editorV6Schema.ts` valida projetos e referências de assets na fronteira de persistência do Electron main.
- **Vitest:** `vitest.editor-v6.config.ts` e `npm run test:editor-v6` isolam testes do V6.
- **Electron Builder:** `npm run package:win:portable` gera um executável portátil Windows x64 e inclui FFmpeg/FFprobe de `resources/video-tools` junto à licença e metadados da build.

O empacotador foi configurado e chegou a preparar a pasta do aplicativo com os binários. A geração do executável único foi interrompida a pedido para não gastar tempo compactando centenas de megabytes. O primeiro arranque do pacote ainda precisa ser validado, inclusive a inicialização dos dados de perfil em instalação limpa.

## Limites de integração

O V6 pode ler bibliotecas de personagens e presets para importar conteúdo, mas só deve alterar os documentos sob seu próprio diretório e usar canais com prefixo `editor-v6:`. Estado de edição, histórico, fila de salvamento, validação, exportação e preferências novas devem permanecer no domínio do Editor V6.

React, Electron, Chromium, Vite, o design system e APIs de leitura dos catálogos são infraestrutura do aplicativo. Compartilhar essas peças não compartilha os documentos de cena. Mudanças em Customizer/Fabricator não devem sincronizar cenas existentes sem uma ação explícita de atualização/importação.

## Próxima fatia: vídeo

Antes de exportar, o formato do projeto precisa representar duração, FPS, dimensões, faixas e clipes. A UI deve produzir frames em um processo controlado, enquanto o Electron main abre o diálogo de destino e executa FFmpeg como subprocesso com progresso, cancelamento e limpeza de temporários. Vídeo e áudio importados devem ser copiados para a pasta do projeto. A montagem da timeline e a exportação MP4 1080p/30 FPS são o próximo trabalho funcional; adicionar FFmpeg ao executável portátil, sozinho, não implementa essa experiência.
