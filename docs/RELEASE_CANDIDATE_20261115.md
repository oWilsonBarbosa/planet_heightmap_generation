# Candidata de integração v3.0.1 + fork (15/11/2026)

**Somente preparação. Nenhum merge ou release realizado.** Base: `ccr-3c4ab8a1-olrlvi` no commit `51f784f8ffcb8eb47fbfccf798f4f7f7a3ef7482`. `main` original: `ed466f9db71292e912d8d0160e689a67a994f2d9`. Comparação: 61 commits, 59 caminhos, 0 commits de atraso.

**Escopo:** integração do fork à versão 3 do gerador. Generate e Import fornecem `closedBasins:true` via `v2/js/present/knobs.js`. Evolution conserva `FINISH.closedBasins=false`; soleiras/estreitos e `seaRemnantAnySize` não são alterados. Os PRs experimentais #2 e #3 ficam de fora. A geração nova não substitui o atlas canônico antigo de `0r063N`.

**Portões CI:** Node 22; sintaxe, contrato Generate/Import, rios, sementes/códigos, 292 verificações completas de Generate, leitura/salvamento e fixtures históricos. A regressão de drenagem do Evolution continua com **uma falha científica conhecida de convergência de grandes lagos** (31/32); não aceitar outras falhas nem interpretar exceção como validação física.

**Portões manuais antes da publicação:** smoke test no navegador de Generate, Import, Evolution e tela What's New; testar código de planeta antigo e arquivo salvo anterior, inclusive em mobile. Verificar versão anterior preservada em `/v/2.3/`. Escolher versão/tag e revisar as notas finais. Não afirmar que esses testes foram feitos antes de observá-los.

**Autorizações distintas:** após os testes e revisão, solicitar aprovação explícita para o merge no `main`; somente depois, solicitar aprovação específica da release. O workflow de produção `.github/workflows/deploy.yml` publica o site mediante `release.published`.

**Reversibilidade:** preservar o SHA anterior do `main` e as tags já publicadas; não regravar arquivos canônicos nem tags de versões antigas. O problema do gelo ártico e a estabilidade lacustre permanecem pesquisa independente.

**Notificação a usuários recorrentes:** o identificador local da janela What's New no Generate passou de `7` para `8`, para que a nova nota seja exibida também a quem já viu a versão anterior. Sem alterações nas regras físicas ou no formato de arquivo.
