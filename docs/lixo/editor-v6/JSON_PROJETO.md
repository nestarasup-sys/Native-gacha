# JSON de roteiro do Editor V6

Na lista de projetos, use **Exportar projeto em JSON** no cartão para criar um arquivo `NYMI_EDITOR_V6_REACT_V1`, com `cast`, `videos`, `lines` e `beats` em texto. Edite ou amplie o arquivo fora do app e selecione-o no botão existente **Importar JSON**. A importação cria um projeto novo.

Os tempos são em segundos. Elenco e mídia apontam para os IDs das bibliotecas do aplicativo. As imagens dos personagens e os vídeos não são incorporados. Preserve esses IDs e mantenha disponíveis os personagens, poses, expressões e vídeos referenciados na instalação de destino.

O formato de roteiro não representa todos os recursos de um projeto V6. O exportador informa quando encontra conteúdo conhecido que não pode ser preservado, como áudio separado, objetos, vídeos locais e certas transformações. Mesmo sem aviso, valide a reimportação antes de apagar ou substituir o original: o importador reconstrói as imagens e pode alterar detalhes visuais. JSONs completos `NYMI_EDITOR_V6_PROJECT_V1` criados pela versão anterior continuam importáveis.
