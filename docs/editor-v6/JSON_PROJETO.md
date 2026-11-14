# JSON de projeto do Editor V6

Na lista de projetos, use o botão **Exportar projeto em JSON** no cartão do projeto. Para trazer o arquivo de volta, use **Importar JSON**, selecione o arquivo e confirme. A importação cria um projeto com novo ID, sem substituir o original. O importador de roteiro `NYMI_EDITOR_V6_REACT_V1` continua disponível no mesmo botão.

O arquivo de projeto usa `format: "NYMI_EDITOR_V6_PROJECT_V1"`. Em `project` ficam o documento, os elementos e a timeline. O tempo da timeline usa quadros a 30 fps; as trilhas estão em `project.timeline.tracks` e os blocos em `blocks`. Os IDs dos elementos, assets, personagens e blocos são vínculos entre os dados: mantenha-os consistentes ao editar ou acrescentar conteúdo. O aplicativo valida o documento ao importar e informa se há dados inválidos.

Imagens locais do projeto ficam no documento; arquivos de mídia locais aparecem em `files` como base64. Preserve essas entradas ao editar a timeline. Personagens, poses e mídias de bibliotecas compartilhadas continuam vinculados pelos IDs existentes no aplicativo; eles não são recriados no JSON. Portanto, esses itens precisam estar disponíveis na instalação onde o projeto for importado.

O JSON é formatado para leitura, mas projetos com mídia podem produzir arquivos grandes e consumir memória durante exportação e importação. Trabalhe sobre uma cópia do JSON e mantenha o arquivo original até verificar o projeto importado.
