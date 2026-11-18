# Execução 1.1 — 18/11/2026

## Estado recebido

- `975336ac` usa uma camada em trechos sem vídeo sobreposto.
- `1551cbf2` acrescenta resumo por tentativa, fases e diagnóstico de falhas por trecho.
- `45e009f0` reduz carregamento duplicado de imagens e mede prontidão do worker e espera descoberta no pipe.
- O usuário observou que exportações continuam próximas da duração do vídeo. Seu corte novo foi localizado e analisado em [Pesquisa 1.1](PESQUISA-1.1.md).

## Próxima execução autônoma

1. Confira se o relatório e os scripts de teste continuam correspondendo ao código da branch.
2. Use um cenário sintético curto com quadros únicos, personagem, boca, transição de expressão e vídeo sobreposto. Compare o caminho padrão com um candidato de sincronização da captura. Preserve validação do token e limite de retenção dos buffers.
3. Se captura não der um ganho consistente sem diferença visual, investigue as transições da preparação global. Use perfil de bake e fila por personagem. Se só houver dados somados, acrescente uma medição leve no relatório existente.
4. Se o problema se concentrar em prontidão, inspecione a montagem do renderer por fase. A leitura de 22,12 s depois da navegação cobre vários trechos. Verifique se a espera está em decodificação, montagem ou concorrência.
5. Implemente, rode os testes suficientes e documente o resultado, inclusive tentativa rejeitada. Faça commit local após cada mudança concluída. Prossiga sozinho pelas hipóteses que puder verificar.

## Restrições da entrega

- Use `Dev-V2` em `C:\TRABALHO 2\OUTROS\GACHA EM C++`. Preserve mudanças locais e dados do usuário.
- Compare exports com as mesmas opções. Uma diferença de encoder, FPS, animações ou escala invalida a atribuição de ganho.
- Nenhum reaproveitamento de resultados entre exports. No fluxo normal só permanecem MP4 e relatório. Em falha ou cancelamento, preserve o destino anterior e limpe os temporários do job.
- Preserve escala, recortes e altura nas transições, qualidade visual, áudio e emendas. O relatório aponta onde olhar, e as verificações visuais usam quadros decodificados ou fixtures.
- Use dados sintéticos para testes. Relatórios existentes podem ser lidos para diagnóstico sem alterar projetos. Não conte com novos exports manuais do usuário para avançar.

## Registro desta passagem

- Localizado e interpretado o relatório de 6.000 quadros. O trabalho ativo foi consolidado nesta pasta.
- As otimizações citadas acima já pertencem aos commits indicados. Esta passagem é de documentação e preparação da próxima rodada.
- Próxima nota de execução deve registrar hipótese, fixture, controles, números, decisão, testes e commit em um único lugar.
