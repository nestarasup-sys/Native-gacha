# Registro de importação e publicação

Este documento guarda a proveniência da importação original do código G-V5 e as precauções para auditar arquivos de origem. Ele não descreve o estado atual das branches ou do fluxo de desenvolvimento.

## Origem histórica

- Arquivo: `G-V5-evolucao-estrutural-2026-10-22.zip`
- SHA-256 registrado: `e0c0f8f5c8013b9866b45ac395fa59a58c59046a3727bfa6ec16c215e1cfffcd`
- O arquivo original não estava disponível nesta revisão, então não foi possível comprovar bit a bit a correspondência com o código versionado.

O comando `npm run audit:gv5-import` verifica em modo somente leitura os arquivos rastreados e possíveis arquivos privados versionados. Se o ZIP original for fornecido, confira primeiro seu hash e compare o conteúdo sem sobrescrever o checkout ativo. Um hash válido confirma a identidade do arquivo, mas não prova que o conteúdo do Git corresponde integralmente a ele.

## Publicação segura

Antes de publicar código, confira `git ls-files` e `git status --short`. Não inclua perfis reais, credenciais, tokens, arquivos `.env`, bancos SQLite, backups, mídia ou imagens pessoais. Se material privado já tiver sido publicado, remover o arquivo do commit mais recente não apaga seu histórico remoto; trate a exposição e revogue credenciais afetadas.

Push, merge e force push devem ocorrer somente quando solicitados explicitamente.
