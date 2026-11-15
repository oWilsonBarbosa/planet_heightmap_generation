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
| 2.560.001 | v3 | 275 | 1 | 0 | 0,0106% | 0,573% | 159.149 | ~100% | 8,11 | 18,42 |
| 2.560.001 | closed-basins | 275 | 22 | 23 | 1,2328% | 0,819% | 158.240 | ~100% | 8,11 | 18,42 |

Os números de lagos e salinas são os **corpos relatados em `stats.water`**, não o número de células. Na resolução integral, 1.099 células têm água salgada e 66 células são marcadas como salina. Áreas de corpos devem ser auditadas antes da migração. A área continental, o relevo máximo e o clima em alta latitude são principalmente determinados pelo novo motor tectônico e não pela opção de bacias fechadas.

### Invariantes e observações

- Todos os cenários acima concluíram com sucesso e produziram geologia e agricultura, sem `NaN` nem infinito nas alturas e vazões fluviais amostradas.
- A soma `toSeaShare + toBasinsShare + lostShare` esteve dentro de um erro de ordem `10⁻⁸` a `10⁻⁷` de 1. Este é um balanço **global**, não uma prova de conectividade ou níveis de cada lago.
- Na resolução integral, a fração de calota de gelo sobre a terra ao norte de 60° N foi **37,04%**, contra **7,4% no cânone** da auditoria anterior. O problema do Ártico continua.
- Os 22 lagos salgados e as 23 salinas do cenário integral não reproduzem o cânone (3 lagos salgados e 91 salinas em terra no conjunto anterior). **Não inferir regressão nem melhoria física apenas da contagem**: a topografia e as bacias são diferentes.
- A diferença entre 160K e 640K no número de salinas (28 → 18) pede verificação de convergência e conectividade. A linha integral indica 23 salinas.
- A resolução integral fez Generate em 31,94 s, Finish em 44,49 s e RSS de ~2.323 MB no runner. Não demonstra comportamento equivalente em navegador móvel.
- Ambos os perfis foram executados em 2.560.001 células. O perfil v3 padrão apresentou 1 lago salgado e nenhuma salina; o perfil experimental apresentou 22 lagos salgados e 23 salinas. A mudança é hidrológica, não uma recuperação do cânone antigo.

## Evidências

- [40K, perfis v3 e closed-basins](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43749884165).
- [160K, perfis v3 e closed-basins](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750005131).
- [640K, dois perfis; 2.56M, closed-basins](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750125147).
- [Controle integral v3 e auditoria do Evolution (3 verificações reprovadas)](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750436871).
- [Baseline e auditoria do cânone](https://github.com/oWilsonBarbosa/0r063N/blob/ccr-3c4ab8a1-olrlvi/reports/generator-v3/README.md).
- Testes de unidade: `.github/workflows/orogen-hydrology-checks.yml`; scripts em `tuning/orogen/`.

## Controle do fork anterior `c10969c`

Execução: [GitHub Actions — baseline fork original](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750723918), com a mesma semente de regressão do Evolution (10673275), resoluções 160K/640K, sem alteração do código do fork.

- **Fork original:** 31 de 32 verificações aprovadas. Uma falha de convergência de regimes fluviais (permanentes estáveis 67,7% → 73,1%; estação de cheia 31,2% → 25,6%; diferença acima de 5 pontos).
- **Integração com v3.0.1:** 29 de 32 aprovadas. A convergência dos regimes passou, mas apareceram **três falhas que não ocorrem no mesmo teste do fork original**: subida de rio de 107 m a 160K, um exutório de lago inalcançável a 640K, e convergência ruim dos lagos grandes (0,27% → 0,05% da área terrestre).
- O fork original usa superfície/geologia anteriores e tinha 43/339 lagos doces a 160K/640K, enquanto o integrado tem 69/309. Portanto, o controle demonstra a mudança do comportamento e a localização dos portões reprovados, **não isola sozinho se a origem é o relevo, o algoritmo ou a interação entre eles**.

**Resultado de revisão:** o merge não deve ser promovido. Diagnosticar com IDs e coordenadas dos trechos de subida e do lago inacessível; repetir os testes com os mesmos terrenos de entrada, se possível, para atribuir a causa. Não flexibilizar os limiares só para passar os testes.

## Portões ainda abertos

1. **Evolution drainage: 3 de 32 verificações falharam** no cenário de regressão (semente 10673275): a 160K, 2 trechos de rios sobem até **107 m** (acima do máximo 100 m); a 640K, 1 lago de água doce tem saída inalcançável pelas células de lago; entre 160K e 640K, a proporção de lagos >12.752 km² muda **0,27% → 0,05%** (11 → 5), fora da tolerância de 30%. Os demais 29 checks passaram. **Não declarar aprovação física da hidrologia.**
2. Comparar a versão integrada com o fork antigo na **mesma semente do Evolution** para distinguir regressão de diferenças herdadas e da nova geomorfologia. O relatório histórico `docs/DRAINAGE_20261029.md` já apontava sensibilidade de grandes lagos à resolução e poços residuais, mas não garante que estas falhas específicas fossem pré-existentes.
3. Auditar salinas, altura dos lagos, salinidade e distribuição nos quatro continentes; revisar o norte gelado e a hipsometria marinha.
4. Adaptar o exportador de 0r063N ao novo worker e confirmar mapas e gazetteers; comparar com as 2.560.001 regiões canônicas.
5. Manter PR em rascunho e ambos os `main` inalterados até a decisão de migração.
