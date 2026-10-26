# Pacote de reconstrução do Native Gacha

Este pacote contém o código-fonte commitado do Native Gacha e documentação de contexto para uma IA ou equipe que vá avaliar uma reconstrução em C++ e tecnologias nativas.

- O snapshot de origem é o commit indicado no `README.md` deste diretório.
- O aplicativo existente é Electron + React + TypeScript. Ele ainda não foi reimplementado em C++.
- O **Editor Gacha é um produto novo planejado**, ainda não implementado neste snapshot. O documento `docs/gacha editor plano v1.md` registra o conceito e os requisitos já confirmados.
- O Studio Principal atual é um módulo separado e **não deve ser usado como modelo de timeline ou editor de vídeo** para o Editor Gacha.
- O arquivo ZIP não deve incluir `.git`, dependências instaladas, builds, binários FFmpeg nem `app-data`. `app-data` é perfil/runtime que pode conter personagens, projetos e mídia privada. Os testes usam fixtures sintéticas para explicar os contratos sem expor dados pessoais.

## Por onde começar

1. Leia `GUIA_RECONSTRUCAO_CPP.md` para arquitetura proposta, limites de escopo e roteiro de migração.
2. Leia `MAPA_DO_APP.md` para localizar módulos e fluxos funcionais.
3. Leia `README.md`, `docs/architecture/ADR-001-modular-electron.md`, `docs/architecture/ADR-002-fluxo-personagens.md` e `docs/architecture/CHARACTER_PRODUCTION_CONTRACT.md`.
4. Use o código e os testes como fonte dos contratos reais. Documentos `CICLO_*` são registros históricos e podem estar desatualizados em relação ao código atual.

O snapshot inclui código versionado, documentação, scripts, testes, configuração e lockfile. Para executar o app atual: Node.js 22.22+ e `npm ci`; os comandos estão em `README.md` e `package.json`. Isso serve para executar e comparar o app atual, não para compilar a futura versão C++.
