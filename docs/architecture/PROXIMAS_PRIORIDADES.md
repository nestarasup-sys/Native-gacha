# Próximas prioridades — Native Gacha

## Estado

O G-V5 funciona e deve permanecer utilizável enquanto a estrutura é reorganizada. **Não reescrever do zero. Não iniciar migrações dos formatos de dados nem alterar o Video Studio agora.**

## Entregas prioritárias

1. **Importação e CI:** importar fontes do ZIP para a raiz do repositório, verificar licenças/segredos e validar instalação, arquitetura, testes e build.
2. **Contrato do personagem:** desenhar um mapa de dados Fabricador DEV → Customizador → Studio, com tipos estáveis, herança, referências e versionamento; escrever fixtures sintéticas de leitura/gravação.
3. **Persistência confiável:** cobrir listas, backup, gravação atômica e recuperação, sem regravar silenciosamente materiais nem perder dados legados.
4. **Separação do Fabricador DEV:** transformar catálogos de cabelo/roupas/rosto/pose em serviços e domínios independentes da interface; não copiar catálogos para o Customizador.
5. **Customizador:** manter apenas variações individuais (escolhas, transformações, offsets, sobreposições), consumindo a biblioteca compartilhada por contratos.
6. **Studio principal:** consumir snapshots de personagem sem editar as bibliotecas nem depender diretamente de componentes internos do Fabricador ou Customizador.
7. **main.ts e IPC:** mover gradualmente os handlers restantes para módulos pequenos; manter nomes dos canais existentes até os consumidores terem sido migrados.
8. **Qualidade e manutenção:** adicionar testes de fluxo completo, logs de erros, auditoria de dependências, revisão de imports e relatórios de perfis isolados.

## Gates antes de aceitar cada refatoração

- Projeto do legado abre e salva sem migração involuntária.
- Importação de personagens antigos e recuperação de backup preservadas.
- Nenhum import novo entre interfaces internas de features.
- Sem quebra de IPC/preload e testes atuais continuam passando.
- Validar operação real no Windows com perfil sintético antes dos dados pessoais.
- Toda mudança de contrato de dados requer versão, conversor reversível e fixtures.

## Fora do escopo

O motor de vídeo e Video Studio permanecem congelados. Tauri/Avalonia não são prioridade: a arquitetura modular deve tornar essas decisões possíveis posteriormente, se justificadas.
