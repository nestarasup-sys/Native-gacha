---
id: V6-ENGINE-LOCAL-CLONE
tipo: guia-operacional
status: ativo
branch: Dev-v3
atualizado: 2026-11-20
---

# Atualizar ou abrir um clone antigo do Native Gacha no Windows

**Objetivo:** trazer o código da `Dev-v3` do GitHub para uma pasta local que ainda
usa um commit antigo. Esta ação atualiza **código Git**, não projetos pessoais.
Não transfere automaticamente `app-data`, bibliotecas privadas nem arquivos ignorados.

## Escolha o cenário

### A) Você está copiando uma pasta antiga já clonada (contém `.git`)

1. **Guarde a pasta original inteira** como cópia de segurança. Abra a **cópia**, nunca a original.
2. Feche Electron/Native Gacha nas duas pastas.
3. Não execute os BATs **antigos** antes da primeira atualização: os scripts antigos
   ainda podem forçar a `Dev-V2`. Um BAT antigo não se substitui sozinho.
4. Abra o terminal PowerShell **na pasta raiz da cópia**, onde ficam `package.json` e `.git`.
5. Confira o remoto e as alterações:

```powershell
git rev-parse --show-toplevel
git remote -v
git status --short
```

Se aparecerem arquivos modificados ou não rastreados, **interrompa aqui**.
Salve as alterações com commit ou copie os arquivos importantes para uma pasta
segura; não execute `git reset --hard`, `git clean` nem `git stash` automaticamente.

6. Com o estado Git limpo e `origin` apontando para
   `https://github.com/nestarasup-sys/Native-gacha.git`, execute:

```powershell
git fetch origin refs/heads/Dev-v3:refs/remotes/origin/Dev-v3
git switch --track -c Dev-v3 origin/Dev-v3
```

Se a branch local `Dev-v3` **já existir**, use em vez do segundo comando:

```powershell
git switch Dev-v3
git merge --ff-only origin/Dev-v3
git branch --set-upstream-to=origin/Dev-v3 Dev-v3
```

Esses comandos **não reescrevem** a `Dev-V2` e não apagam o histórico.
Se `--ff-only` recusar, existe divergência: pare e analise os commits locais.

7. Agora os novos atalhos já estão na sua cópia:

```text
ATUALIZAR_DESENVOLVIMENTO.bat  -> traz as próximas alterações da Dev-v3
ABRIR_DESENVOLVIMENTO.bat      -> abre a Dev-v3 e prepara dependências
```

### B) Você quer uma pasta nova, sem aproveitar o clone anterior

Abra PowerShell no **diretório que receberá a pasta** e execute:

```powershell
git clone --branch Dev-v3 --single-branch https://github.com/nestarasup-sys/Native-gacha.git Native-gacha-Dev-v3
cd .\Native-gacha-Dev-v3
```

Depois abra `ABRIR_DESENVOLVIMENTO.bat`. Projetos pessoais da outra pasta
não são copiados; mantenha-os preservados no local original.

## Nas próximas atualizações

1. Feche o aplicativo.
2. Dê duplo clique em `ATUALIZAR_DESENVOLVIMENTO.bat` na cópia Dev-v3.
3. O script valida a raiz Git, a URL de `origin` e se há modificações locais.
4. Faz fetch apenas da `Dev-v3` e aplica **fast-forward**. Não executa reset,
   clean, stash, rebase, force-push, cópia de dados nem atualização de outras branches.
5. Abra `ABRIR_DESENVOLVIMENTO.bat`. Se o lockfile/ABI Node mudou,
   `scripts/windows/ensure-dev-deps.cjs` executará `npm ci` **somente em node_modules**.
6. O atalho de abertura continua evitando `npm run dev`, porque `predev`
   dispara a migração histórica de perfil G-V5. Usa `electron-vite dev` diretamente.

## Pré-requisitos

- Windows, Git for Windows e PowerShell.
- Node.js **22.22.0 ou mais recente** e npm instalados.
- Internet para a primeira atualização, `npm ci`, Electron e FFmpeg (quando faltarem).
- `resources/video-tools/` e `app-data/` são ignorados pelo Git e não são
  substituídos por esses comandos. Preserve backups verificáveis dos projetos.

## O que fazer se falhar

| Mensagem | Ação segura |
| --- | --- |
| Pasta com alterações locais | Faça commit/backup e tente de novo; nada será descartado |
| Origin diferente | Revise `git remote -v` e confirme a origem antes de alterar |
| Branch antiga no ABRIR | Execute o ATUALIZAR; em BAT antigo, faça o bootstrap manual acima |
| Branch local divergiu | Não faça reset; revise `git log --oneline --graph --all -15` |
| npm ci falhou | Revise Node, acesso à internet e dependências nativas; `app-data` não foi migrado |
| FFmpeg ausente | O ABRIR oferece a instalação de ferramentas verificadas pelo manifesto |

**Não use `PUBLICAR_NO_GITHUB.ps1` para atualização local.** Esse script legado
foi desativado: fazia um upload inicial para `main`, operação diferente de atualizar
o clone. Para receber atualizações, use o BAT acima.

## O que está no clone

- **Dev-v3**: experiência com engine offline do **Editor V6**; o V7 fica fora.
- **Dev-V2**: base anterior preservada, não recebe essas alterações.
- Os projetos pessoais, o histórico e as bibliotecas locais não são parte do código
  da engine e jamais devem ser enviados a um repositório público por acidente.

Voltar ao [índice da engine V6](README.md).
