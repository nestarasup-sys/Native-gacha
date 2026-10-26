# Editor V6: arquitetura e integração

## Estado atual

O Editor V6 é uma área React/TypeScript executada pelo Chromium do Electron. O Electron main expõe uma API própria pelo preload e persiste cada projeto sob `userData/studios/Editor V6/editorV6-<id>`. Cenas e assets do V6 não são documentos do Studio.

O V6 consulta APIs já existentes do Customizer e Fabricator para escolher personagens, poses, rosto e expressões. Essas chamadas servem como catálogos de origem. Ao inserir um personagem, a composição e o PNG usados na cena ficam salvos no documento do V6; o editor não grava de volta nessas bibliotecas.

A timeline inicial tem faixas de personagem, fala, pensamento, imagem, vídeo e áudio. Blocos de personagem/imagem/texto apontam para camadas da cena; arrastar move o bloco, a alça lateral ajusta a duração e o playhead controla quando cada camada aparece na prévia. Faixas de vídeo e áudio já podem ser organizadas como blocos, mas ainda não importam nem decodificam esses tipos de mídia.

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

## Próxima fatia: vídeo e áudio

O formato já representa FPS, duração, faixas e blocos. O próximo passo é ligar importação de mídia às faixas de vídeo/áudio e renderizar blocos de personagem como imagens paradas com transições faciais/pose. O Electron main deve abrir o diálogo de destino e executar FFmpeg como subprocesso, com progresso, cancelamento e temporários isolados do Studio. Vídeos e áudios importados devem ser copiados para a pasta do projeto. A exportação MP4 em 1080p/30 FPS ainda precisa ser construída; incluir o binário FFmpeg no pacote, sozinho, não implementa essa experiência.
