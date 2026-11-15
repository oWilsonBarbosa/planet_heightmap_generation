# Orogen V2 — calibração de GPE encerrada: cinco intensidades e cartografia de arcos

**Data:** 2026-11-15. **Decisão:** encerrar por ora a busca unidimensional por um coeficiente de empuxo; **não incorporar nenhum candidato à `main`**.

## Ensaios concluídos

- [Intensidades 0,5 e 2,0 — Actions #43679068995](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43679068995).
- [Intensidade 1,0 — Actions #43661647583](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43661647583).
- [Intensidades 1,25 e 1,50 — Actions #43680224665](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43680224665), quatro jobs concluídos com sucesso.
- Três sementes constantes (12345, 777, 4242); duas malhas de simulação (20.001/40.001 células); 1.200 Ma de história; leituras a cada 100 Ma; `ridgeGpeAgeScaleMyr=80`. Total de **30 histórias completas** entre as cinco intensidades.
- O empuxo binário anterior, com a correção de `formedAt`, é controle separado e **não equivale à intensidade GPE zero**.

## Balanço continental: variação da fração da superfície global (pontos percentuais)

| Fator de força | Crescimento médio 20K | Crescimento médio 40K | Diferença 20K − 40K |
|---|---:|---:|---:|
| 0,50 | +12,01 | +6,67 | +5,35 |
| 1,00 | +9,14 | +5,45 | +3,68 |
| 1,25 | +10,37 | +7,33 | +3,03 |
| 1,50 | +9,74 | +4,46 | +5,28 |
| 2,00 | +7,22 | +5,07 | +2,15 |

A menor diferença de médias (2,00) **não** equivale à melhor convergência física. Os resultados individuais não são monotônicos com a intensidade. Três sementes são insuficientes para estabelecer calibração probabilística robusta.

## Idade do oceano e maior componente de ARC

| Força | Idade oceânica média 20K / 40K (Ma) | Maior grupo de crosta ARC em qualquer seed, 20K / 40K (milhões km²) |
|---|---|---|
| 0,50 | 103,3 / 114,9 | 3,14 / 4,64 |
| 1,00 | **90,1 / 94,5** | 3,21 / 8,14 |
| 1,25 | **110,1 / 100,4** | 9,49 / 4,42 |
| 1,50 | 98,2 / 102,0 | **20,02** / 3,97 |
| 2,00 | 88,0 / 104,4 | **28,18** / 4,58 |

Idade oceânica é média simples entre seeds, não média ponderada por área. Grupo de ARC conecta **células classificadas como ARC**, não necessariamente ilhas emersas nem apenas arcos oceânicos distantes de continentes.

**Conclusão de calibração:** a intensidade 1,0 permanece a melhor **referência comparativa provisória** dentre as cinco, pois combina idade oceânica relativamente menor e reduz o risco de grandes grupos de ARC nos casos 20K. Não é solução definitiva: sua suíte Fase 13 atende somente 15/20 critérios; a invariância de escala do cenário Laramide permanece 6/7; um grupo de ARC em 40K ainda chega a 8,14 milhões km². Nenhuma outra intensidade melhora simultaneamente os indicadores relevantes. **Não promover 1,0 à `main`.**

## Problema localizado: ARC gigante na semente 4242

[Mapas diagnósticos reais do mesh — Actions #43680525139](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43680525139), resoluções 20K, intensidade 1,0 e 2,0, tempos 900/1000/1100/1200 Ma. SVGs produzidos diretamente das células de `TectonicFrame`: bege CONTINENT/CRATON, amarelo ARC de grupos menores, vermelho **maior componente conexo ARC**, azul oceano. Projeção equiretangular apenas para diagnóstico — a linha costeira do terreno refinado não foi produzida.

| Tempo (Ma) | Maior grupo ARC, força 1,0 (Mkm²) | Maior grupo ARC, força 2,0 (Mkm²) | Área do maior grupo distante >1500 km do continente, força 2,0 (Mkm²) |
|---|---:|---:|---:|
| 900 | 11,58 | 9,59 | 6,30 |
| 1000 | 5,38 | 16,42 | 8,98 |
| 1100 | 2,52 | 26,98 | 8,72 |
| 1200 | **1,20** | **28,18** | **2,96** |

Em 1200 Ma, **aproximadamente 89,5% do maior agrupamento ARC (intensidade 2,0)** encontra-se a menos de 1500 km da crosta continental segundo distância aproximada de passos da malha. A anomalia deixa de ser majoritariamente **remota em oceano aberto**; o mapa mostra ARC em grandes faixas próximas a massas continentais. Isto não comprova que a área seja formada por *fore-arc islands* ou que esteja emersa. O mesmo agrupamento pode conter crosta ARC oceânica, terrenos ligados a margens e ilhas de antearco.

Os registros acumulados de `arcMaturedCells` e `recycledArcCells` do caso 4242/20K em 1200 Ma são semelhantes entre força 1,0 (1824 e 697) e 2,0 (1834 e 710), embora o estoque visível de ARC passe de 1,77% para **8,44%** da superfície. Isso exclui usar esses dois contadores isoladamente como balanço líquido completo e favorece investigar a **produção/transferência de crosta ARC, sua geometria e o seu tempo de residência**.

## Próxima etapa já instrumentada

`v2/tools/audit-arc-clusters.mjs` foi ampliado para discriminar o atributo `CrustFlag.MARGIN_ISLE` dentro do maior componente ARC, idade mediana de seus elementos, número de placas que contribuem ao grupo e seus terrenos identificados. O observador NÃO modifica o motor. O [workflow de nova medição #43680772889](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43680772889) foi iniciado para força 1,0 e 2,0 na mesma semente 4242. **Resultados dessa nova classificação ainda não estavam disponíveis no momento inicial do registro**.

Critérios: medir quanto do grupo grande vem de ilhas de antearco, quanto de ARC oceânica, quantas placas/terrenos contribuem, conexão com costa e duração do estoque. Somente depois propor alterações em produção, maturação, acreção, colisão ou reciclagem de arcos. Evitar correção por simples corte artificial de área.

## Resultado e decisões preservadas

1. A data de formação de crosta devolvida ao oceano passivo **não deve ser falsificada** para recuperar resultados históricos.
2. A fórmula GPE distribuída foi validada apenas numericamente em campo sintético, não como modelo tectônico definitivo.
3. Nenhum fator de intensidade entre 0,5 e 2,0 atende todos os critérios observados; **suspender o ajuste de força única por enquanto**.
4. Direcionar a próxima correção científica à **proveniência e persistência dos agrupamentos de ARC**, mantendo a auditoria de formação do relevo e da área continental.
5. Preservar `main` e comparar sempre com o histórico de idade oceânica correta.

Arquivos pertinentes: `v2/tools/audit-arc-clusters.mjs`, `v2/tools/audit-geography.mjs`, `reports/GPE_STRENGTH_SENSITIVITY_2026-11-15.md` e `reports/DISTRIBUTED_RIDGE_FULL_VALIDATION_2026-11-15.md`.
