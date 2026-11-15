# Orogen — validação headless do gerador v3.0.1 + fork (15/11/2026)

Status: **integração funcional no fluxo Generate → Finish; cânone NÃO migrado.**

Planeta: `06cy8w6z6a89kow6psje93`. O script `tuning/orogen/smoke.mjs` executa o worker real do Generate e o `finishPlanet` do Evolution com a malha entregue pelo worker. O perfil `closed-basins` liga `closedBasins: true` e `seaRemnantAnySize: true` só no Generate; `v3` mantém os padrões. Testes de integração executados no GitHub Actions Node 22.

## Resultados observados

| Células | Perfil | Lagos doces | Lagos salgados | Salinas | Fração para bacias fechadas | Água em lagos / terra | Pontos de rio | Balanço hídrico | Pico km | Terra % |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 40.001 | v3 | 1 | 0 | 1 | 0,0044% | 0,096% | 11.017 | ~100% | 5,87 | 18,21 |
| 40.001 | closed-basins | 2 | 0 | 1 | 0,0044% | 0,110% | 11.014 | ~100% | 5,87 | 18,21 |
| 160.001 | v3 | 14 | 0 | 1 | 0,0168% | 0,365% | 36.835 | ~100% | 7,18 | 18,47 |
| 160.001 | closed-basins | 14 | 12 | 28 | 0,8481% | 0,589% | 36.690 | ~100% | 7,18 | 18,47 |
| 640.001 | v3 | 103 | 0 | 1 | 0,0136% | 0,567% | 96.086 | ~100% | 7,37 | 18,48 |
| 640.001 | closed-basins | 102 | 23 | 18 | 0,5994% | 0,634% | 95.816 | ~100% | 7,37 | 18,48 |
| 2.560.001 | closed-basins | 275 | 22 | 23 | 1,2328% | 0,819% | 158.240 | ~100% | 8,11 | 18,42 |

Os números de lagos e salinas são os **corpos relatados em `stats.water`**, não o número de células. Na resolução integral, 1.099 células têm água salgada e 66 células são marcadas como salina. Áreas de corpos devem ser auditadas antes da migração. A área continental, o relevo máximo e o clima em alta latitude são principalmente determinados pelo novo motor tectônico e não pela opção de bacias fechadas.

### Invariantes e observações

- Todos os cenários acima concluíram com sucesso e produziram geologia e agricultura, sem `NaN` nem infinito nas alturas e vazões fluviais amostradas.
- A soma `toSeaShare + toBasinsShare + lostShare` esteve dentro de um erro de ordem `10⁻⁸` a `10⁻⁷` de 1. Este é um balanço **global**, não uma prova de conectividade ou níveis de cada lago.
- Na resolução integral, a fração de calota de gelo sobre a terra ao norte de 60° N foi **37,04%**, contra **7,4% no cânone** da auditoria anterior. O problema do Ártico continua.
- Os 22 lagos salgados e as 23 salinas do cenário integral não reproduzem o cânone (3 lagos salgados e 91 salinas em terra no conjunto anterior). **Não inferir regressão nem melhoria física apenas da contagem**: a topografia e as bacias são diferentes.
- A diferença entre 160K e 640K no número de salinas (28 → 18) pede verificação de convergência e conectividade. A linha integral indica 23 salinas.
- A resolução integral fez Generate em 31,94 s, Finish em 44,49 s e RSS de ~2.323 MB no runner. Não demonstra comportamento equivalente em navegador móvel.
- O teste de 2.560.001 células foi feito apenas em `closed-basins`, não no perfil v3. Comparações A/B nesta resolução ainda faltam.

## Evidências

- [40K, perfis v3 e closed-basins](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43749884165).
- [160K, perfis v3 e closed-basins](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750005131).
- [640K, dois perfis; 2.56M, closed-basins](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750125147).
- [Baseline e auditoria do cânone](https://github.com/oWilsonBarbosa/0r063N/blob/ccr-3c4ab8a1-olrlvi/reports/generator-v3/README.md).
- Testes de unidade: `.github/workflows/orogen-hydrology-checks.yml`; scripts em `tuning/orogen/`.

## Portões ainda abertos

1. Rodar `tuning/evolution/drainage.mjs` em 160K/640K (integridade do grafo, cotas, lagos, exutórios, escala); o smoke atual não substitui esse teste.
2. Gerar 2.56M também no perfil v3 para comparação controlada, com mesmos parâmetros.
3. Auditar salinas, alturas dos lagos, salinidade e distribuição nas bacias dos quatro continentes; revisar o norte gelado e a hipsometria marinha.
4. Adaptar o exportador de 0r063N ao novo worker e confirmar os mapas e gazetteers; comparar com as 2.560.001 regiões canônicas.
5. Manter o PR em rascunho e os dois `main` inalterados até a decisão de migração.
