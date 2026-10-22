# Native Gacha — modernização do G-V5

Aplicativo desktop de produção de personagens e cenas, originalmente desenvolvido com Electron, React e TypeScript.

> **Estado do repositório:** configuração inicial de GitHub. O código-fonte completo **ainda precisa ser importado** do pacote de refatoração de 22/10/2026. Não confunda a presença deste README com uma versão compilável.

## Fluxo do produto

- **Fabricador DEV:** autoria de modelos, poses, rostos, cabelos, roupas e bibliotecas.
- **Customizador:** configura personagens individuais com base nas bibliotecas do Fabricador; não duplica a fonte de verdade.
- **Studio:** consome os personagens customizados e recursos publicados.
- **Roteiros / Base de Vídeos:** módulos de documentos, organização e persistência.
- **Video Studio:** congelado neste ciclo de modernização; nenhuma migração do motor de vídeo está planejada agora.

## Direção arquitetural

Manter o Electron e React inicialmente; organizar o aplicativo em um **monólito modular**:

```text
React (apresentação)
  -> preload / contratos IPC tipados
    -> serviços de aplicação
      -> regras de domínio / catálogos
      -> repositórios / SQLite / arquivos locais
```

Regras: preservar formatos de personagens e dados; evitar imports cruzados de componentes internos entre features; separar IPC de persistência; migrar módulos gradualmente e com testes.

## Importação do código-fonte

A origem é o arquivo `G-V5-evolucao-estrutural-2026-10-22.zip`, preparado a partir do G-V5 legado. SHA-256 previsto do pacote:

```text
e0c0f8f5c8013b9866b45ac395fa59a58c59046a3727bfa6ec16c215e1cfffcd
```

Extrair o conteúdo **na raiz** do clone, não enviar o ZIP como único arquivo. Nunca publicar `node_modules`, dados de usuário, arquivos `.env`, chaves ou perfis pessoais. Consulte `docs/IMPORTAR_ZIP.md` para comandos.

## Verificação após a importação

Requer Node.js **22.22.0 ou posterior na linha 22** e npm.

```bash
npm ci
npm run audit:architecture
npm run test:refactor
npm run typecheck
npm run build
```

Para validação final, executar o aplicativo Electron no Windows **usando perfil sintético isolado**, antes de abrir os dados reais. Os testes aprovados na etapa local foram apenas uma verificação parcial (24 casos de refatoração, auditoria sintática e de imports).

## Próximos passos

1. Importar o conteúdo do ZIP como arquivos normais e conferir `git status`.
2. Executar o fluxo de qualidade do GitHub Actions.
3. Congelar fixtures de dados de Fabricador → Customizador → Studio, incluindo save/reopen/backup.
4. Isolar o catálogo de Fabricador e os contratos compartilhados dos personagens.
5. Reduzir o acoplamento do `electron/main.ts` sem alterar o Video Studio.

**Atenção:** este repositório está público. Verifique licenças de imagens, código de terceiros e dados sensíveis antes de publicar o conteúdo completo.
