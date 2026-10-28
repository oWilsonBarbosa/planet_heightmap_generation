# Estado do fork e da integração

Referências conferidas em 26/10/2026. Este documento registra o que foi feito e o que falta. `plans/FORK_HANDOFF.md` preserva o histórico anterior de clima e água.

## Branches ativos

| Linha | Referência | Papel e estado |
|---|---|---|
| `main` | `7026cc6` | Acompanha o projeto original; permanece inalterado. |
| `integration/climate-hydrology` | main + `a66a5b4`, PR #2 | Candidata separada; testes concluídos nesta rodada, revisão dos resultados aberta. |
| `feat/world-atlas-poc` | `729f25f`, PR #1 | Atlas atualizado para Generate; preserva Studio e motor físico. Ainda não conectado ao Evolution. |

Em 26/10/2026, os outros seis branches foram retirados após a verificação das tags
e de uma cópia completa de recuperação. O inventário, os motivos e os comandos
para recriá-los estão em [BRANCH_ARCHIVE.md](BRANCH_ARCHIVE.md).

A referência de pesquisa `47edc28` continua na tag
`baseline/evolution-241024-1200myr-47edc28`. Arquivar experimentos não equivale a
incorporar suas funcionalidades ao main.

## Feito nesta integração

- [x] Comparados o main e a origem do fork, com base comum `47edc28`.
- [x] Preservadas as atualizações de interface, projeções, exportação, seeds e salvamento do main.
- [x] Incorporados os módulos e ferramentas de clima e água de ccr em uma candidata separada.
- [x] Resolvidos os três conflitos em README, configuração climática e chuva: atenuação polar e largura de Hadley do upstream, parâmetros de neve do fork, fator orográfico sazonal e teto opcional de chuva. O teto continua desligado nos padrões.
- [x] Teste de seeds e sintaxe dos 15 módulos JavaScript modificados passaram.
- [x] Execução de acabamento passou em 40.001 e 160.001 células sobre cópia de um frame histórico. Repetição em 40.001 células produziu 26 arrays idênticos por SHA-256.
- [x] Suíte completa `check-save.mjs` passou, incluindo codec, salvamento/leitura, migrações e fixture histórico com 31 frames e 84 mapas renderizados.
- [x] Earth-match Kottek, comparação acoplada Beck e teste de aridez foram executados no main e na candidata com os mesmos dados observados. O teste de rios foi executado contra observações em 2.560.001 células.
- [x] README atualizado; nenhum controle novo nesta integração; tutorial, metadados e formatos de salvamento preservados.
- [x] PR #1 atualizado separadamente: Studio preservado, Atlas em Generate, cinco testes Node e verificação HTTP desktop/móvel passaram. Seleção em quatro projeções e mudança de meridiano verificadas. Detalhes em seu relatório de arquitetura.

Os testes de acabamento verificam finitude, formas dos arrays, regimes, níveis de água e fechamento das frações anuais de runoff. Não demonstram correção física completa da drenagem. As saídas históricas originais não foram regravadas.

## O que os resultados mostram

Valores agregados e referências exatas: [climate-hydrology-20261026.json](validation/climate-hydrology-20261026.json). A comparação climática foi feita sobre `1e56993`. O código climático permanece igual; as primeiras correções posteriores da hidrologia e suas medições estão registradas no relatório de correções abaixo.

| Medida | Main | Candidata |
|---|---:|---:|
| Objetivo Kottek, 40 mil células | 0,723466 | 0,724838 |
| Acerto exato Kottek | 46,35% | 46,74% |
| Acerto de grupos principais Kottek | 79,16% | 78,79% |
| Acerto exato Beck, 160 mil células | 47,51% | 47,91% |
| Acerto de grupos principais Beck | 79,13% | 78,76% |
| Acerto exato na Ásia, Beck | 30,78% | 30,55% |

As portas internas de `coupled-check` passaram nas duas versões, mas não verificam todas as regressões entre elas; `noDrift` ficou sem avaliação na execução rápida. A revisão posterior executou a versão completa no main e na candidata, e ambos passaram no limite de 2% de diferença das proporções de classes entre resoluções. O acerto próximo da América do Norte também caiu, de 87,46% para 87,25%. Portanto, houve ganhos globais e perdas regionais/de grupos, e não se declara ausência geral de regressão.

Nos 14 mundos de teste, nenhum ficou mais árido na precisão impressa pelo programa. As porcentagens são arredondadas ao inteiro, o que não demonstra igualdade ou melhora abaixo de um ponto percentual.

Nos rios, 84% dos 122 postos comparáveis ficaram dentro de um fator dois com clima observado; com clima simulado, foram 55% de 125 postos. A estatística RMS resultou em `Infinity` em alguns casos de vazão zero; os exutórios de várias bacias terrestres também divergem. O main não contém esse módulo de rios, portanto esse ensaio não é uma comparação direta entre os dois branches.

## Revisão antes das correções

A [revisão de 26/10/2026](REVIEW_CLIMATE_RIVERS_20261026.md) confirmou a preservação dos históricos e identificou quatro pontos no transporte e na medição dos rios. Os números e limites estão em [validation/climate-river-review-20261026.json](validation/climate-river-review-20261026.json). As sondas não alteraram o motor.

## Primeiras correções

Os quatro itens R1–R4 da revisão foram endereçados em código e testes. O [relatório de correções](FIXES_CLIMATE_RIVERS_20261026.md) separa os resultados das métricas e do transporte, inclusive os indicadores sazonais que pioraram. As [evidências agregadas](validation/river-fixes-20261026.json) incluem 14 testes, regressões do Evolution, salvamento e o cenário adicional da seed 754534770. Esse cenário não substitui o estudo 241024.

## Recalibração sazonal

O [primeiro ajuste após a correção do percurso](RIVER_RECALIBRATION_20261026.md) adotou 45 km/dia, mantendo os demais parâmetros. Em 2.560.001 células, a pontuação global passou de 0,218 para 0,234 com clima observado e de −0,263 para −0,193 com clima simulado. As vazões anuais ficaram iguais. A parcela reservada teve resultados mistos: sua pontuação simulada caiu de −0,271 para −0,288. As salvaguardas operacionais passaram, mas não há melhora uniforme nem validação física concluída. Os [resultados agregados](validation/river-recalibration-20261026.json) incluem as perdas, os 14 testes, salvamento e regressões dos dois cenários.

## Falta antes de aprovar o PR #2

- [x] Corrigir a ordem de propagação dos momentos de viagem após redirecionamentos de bacias.
- [x] Atualizar os comprimentos associados aos receptores redirecionados.
- [x] Exibir amostras sazonais, zeros e exclusões por métrica; tratar explicitamente penalidades de séries constantes no ajuste.

- [x] Concluir a primeira recalibração sazonal com percurso corrigido: busca em 640 mil e confirmação em 2,56 milhões, incluindo grandes bacias e regiões frias.
- [ ] Explicar e tratar as perdas na parcela reservada; investigar os excessos de chuva e neve da primavera setentrional antes de outra calibração climática.
- [ ] Analisar as perdas em grupos climáticos e nas regiões identificadas; corrigir ou justificar os compromissos antes de declarar a candidata pronta.
- [x] Investigar os casos de vazão zero, o RMS infinito e as divergências de saída das bacias. Os zeros eram saídas de
  bacias fechadas (regras do Generate) com a área da bacia inteira e nenhuma água; corrigidas em `finish-hydro.js`. Com
  as regras do Evolution não havia zeros. O que resta é a chuva do clima simulado e o mapa grosseiro da Terra
  ([relatório de 28/10](ZERO_FLOWS_20261028.md)).
- [ ] Decidir a integração após essa revisão. O PR #2 permanece em rascunho; nenhum merge automático foi feito.

## Organização e pesquisa que continuam abertas

- [x] Reduzidos nove branches remotos para três; seis históricos preservados por tags e bundle de recuperação testado. Relatório inicial de auditoria reunido no catálogo.
- [ ] Consultar e portar seletivamente ideias dos experimentos arquivados quando houver uma necessidade concreta; não exigem branches ativos permanentes.
- [ ] Avaliar convergência e desempenho do Atlas antes de ampliar seu uso; sua conexão ao Evolution é uma etapa futura.
- [ ] Retomar a investigação física sobre a referência histórica preservada. Os testes desta integração não resolvem retroativamente problemas de drenagem de arquivos já salvos.

Uma seed não identifica sozinha um resultado: registrar modo, parâmetros, época, resolução e commit. O estudo Evolution baseado em `47edc28` e os conjuntos Generate antigos são referências distintas. Relatórios, mapas e matrizes da pesquisa permanecem fora do código distribuído; o catálogo é mantido separadamente.
