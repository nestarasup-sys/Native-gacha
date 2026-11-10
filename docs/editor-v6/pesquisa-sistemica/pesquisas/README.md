# Trilhas de pesquisa por subsistema — situação real

**06/11/2026:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md) cobre arquitetura; estudos do **Grupo A** 02–05, 09–11, 13, 15–21 foram aprofundados com code paths, funções, documentação oficial, hipóteses, riscos e protocolos de experimento. **NENHUM desses estudos executou benchmark no Windows.**

**Abertos:** [06 Fabricador](06-FABRICADOR-MODELOS-POSES-ROUPAS.md), [07 Customizador](07-CUSTOMIZADOR-PERSONAGENS-E-REUSO.md), [08 Studio/Roteiros](08-STUDIO-ROTEIROS-BIBLIOTECAS.md), [12 Windows/AMD](12-WINDOWS-AMD-AMF-DIRECT3D.md) e [14 Motores alternativos](14-MOTORES-ALTERNATIVOS.md). São roteiros técnicos preparados, não estudos aprofundados.

O [índice central](../README.md) é a fonte canônica de status e links para os **26 estudos**. A [Pesquisa 23](23-PERFIL-ALVO-30S.md) registra o alvo de 30 segundos; a [Pesquisa 24](24-AMF-E-SUPERFICIES-GPU.md), AMF/Shared Texture; a [Pesquisa 25](25-CAPTURA-CAMADAS-LACUNAS-VIDEO.md), captura dinâmica em lacunas de vídeo; e a [Pesquisa 26](26-VIDEO-COMPOSITOR-EM-PASSAGEM-UNICA.md), composição de vídeo em passagem única. Não duplicar o mesmo tema em novos documentos sem necessidade; atualizar a trilha existente ou criar ADR/experimento, se for outra forma de artefato.

## Protocolo de pesquisa

1. Confirmar `git status`, branch e HEAD no checkout usado; ler `AGENTS.md` e dependências reais.
2. Percorrer cadeia funcional completa: **UI → estado → preload/IPC → serviço → arquivo/banco → consumidores → exportação**, quando aplicável.
3. Registrar funções/arquivos de código, fontes oficiais com data, versão relevante, limitações e hipóteses falsificáveis.
4. Se a hipótese envolve tempo, usar cópia autorizada, cenário controlado e relatório de ponta a ponta; marcar **NÃO MEDIDO** até execução.
5. Confrontar custos de qualidade, drivers Windows, uso de memória, backup/recovery e segurança entre módulos.
6. Atualizar [Matriz](../MATRIZ_DE_OPORTUNIDADES.md), [Plano](../PLANO_EXECUTAVEL.md), [Progresso](../PROGRESSO_E_RESULTADOS.md) e [Fontes](../evidencias/FONTES-OFICIAIS.md).

**Critério:** `PESQUISADA` não significa `VALIDADA` em runtime e `MEDIDA` exige dados e ambiente. Não chamar um URL listado de fonte consultada até realmente abrir/confrontar o conteúdo.

[Modelo reutilizável](MODELO_PESQUISA.md).
