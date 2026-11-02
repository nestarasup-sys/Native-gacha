# Gênero do corpo de referência no Roupas DEV

Cada conjunto de roupa pode salvar `previewGender` (`female` ou `male`) no próprio manifesto `wardrobe.json`. O campo é opcional para manter compatibilidade com conjuntos antigos; quando ausente, a interface considera `female`.

A opção controla somente a imagem corporal usada como referência visual no Roupas DEV. Em `male`, a imagem do tronco é substituída pela cópia `maleTorso` salva no modelo; posição, dimensões e vínculos continuam usando o quadro original do tronco feminino, para manter o encaixe autorado estável. A prévia temporária de pose aplica a mesma substituição visual. Roupa, modelo-fonte, pose e composição do Customizador não são alterados por essa escolha.

O renderer grava a preferência junto com o conjunto por meio do contrato existente `saveWardrobeSet`. O processo principal aceita somente os valores conhecidos e preserva o campo no manifesto. A opção masculina fica indisponível se o modelo ainda não tiver um tronco masculino salvo.
