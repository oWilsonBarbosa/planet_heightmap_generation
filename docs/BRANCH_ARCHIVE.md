# Branches arquivados em 26/10/2026

O repositório passou de nove para três branches remotos ativos:

- `main`: referência atual do projeto original, preservada em `7026cc6`.
- `integration/climate-hydrology`: candidata do PR #2, ainda em rascunho.
- `feat/world-atlas-poc`: Atlas opcional do PR #1, atualizado para Generate.

Os seis nomes abaixo foram retirados da lista de branches. Seus commits continuam
acessíveis pelas tags indicadas. Apenas ccr está integralmente incorporado à
candidata de integração; os demais foram arquivados como experimentos ou registros,
sem merge em massa e sem declaração de que o main já contém suas funcionalidades.

| Branch retirado | Commit preservado | Motivo |
|---|---|---|
| `audit/geography-baseline-20261023` | `2555d52` | Relatório de 54 linhas copiado integralmente para o catálogo de pesquisa; não contém funcionalidade. |
| `ccr-85cb1372-invlm5` | `a66a5b4` | Todos os commits incorporados à candidata do PR #2; sua aprovação continua pendente. |
| `chatgpt/regenerate-cc2662b4` | `4936796` | Reprodução histórica do Generate 10673275; ferramentas preservadas para consulta e portabilidade seletiva. |
| `claude/affectionate-brahmagupta-f8xp05` | `6de9489` | Experimento de teto de umidade no clima antigo; preservar ideias sem transportar o cache Python gerado. |
| `claude/orogen-map-generation-fmg-udqzoj` | `3b13df2` | Experimentos do clima antigo, correntes e invariância de escala; consultar sem substituir o motor atual. |
| `claude/simulate-time-in-cells-zgwcbn` | `70077db` | Almanac experimental; possível trabalho futuro, distinto do Evolution atual. |

## Referências de recuperação

- `snapshot/2026-10-26/audit/geography-baseline-20261023` → `2555d52a2fea12295663bc518eb5cef795e61abd`
- `snapshot/2026-10-26/ccr-85cb1372-invlm5` → `a66a5b4324a359c980831bf6853141724221f902`
- `snapshot/2026-10-26/chatgpt/regenerate-cc2662b4` → `4936796af9324bc7aa83a331d966c2ef48dbf65b`
- `snapshot/2026-10-26/claude/affectionate-brahmagupta-f8xp05` → `6de94891d8e950447d5bb5204dd521657eaaca66`
- `snapshot/2026-10-26/claude/orogen-map-generation-fmg-udqzoj` → `3b13df29ddd99762e8b78733b04f9d4a044a77ff`
- `snapshot/2026-10-26/claude/simulate-time-in-cells-zgwcbn` → `70077db72b619d6d7175975895b4b53798f2b3c2`

Em um clone do repositório, substitua os nomes do exemplo pelo branch desejado:

```sh
git fetch origin --tags
git switch -c nome-do-branch snapshot/2026-10-26/nome-do-branch
```

Para republicar o branch, execute `git push origin nome-do-branch`.

## Verificação realizada

Antes da retirada, cada tag remota foi comparada com a ponta exata de seu branch.
Uma cópia completa dos seis históricos foi restaurada em um repositório temporário;
os seis commits e árvores foram conferidos, e `git fsck` passou. O bundle e o
relatório inicial foram entregues no catálogo de pesquisa, junto às instruções de
recuperação sem rede.

A exclusão dos seis nomes foi atômica, com verificação dos hashes esperados.
Depois dela, a lista remota continha exatamente os três branches ativos, e todas
as tags anteriores permaneciam intactas. Nenhum merge em main foi realizado;
os arquivos originais da pesquisa e o checkout histórico também foram preservados.

Arquivar permite retomar uma ideia pela tag, sem manter um branch ativo para cada
experimento. A revisão de clima/água e a avaliação do Atlas continuam registradas
em [FORK_STATUS.md](FORK_STATUS.md).
