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

`v2/tools/audit-arc-clusters.mjs` foi ampliado para discriminar o atributo `CrustFlag.MARGIN_ISLE` dentro do maior componente ARC, idade mediana de seus elementos, número de placas que contribuem ao grupo e seus terrenos identificados. O observador NÃO modifica o motor. A [nova classificação por flags de crosta — Actions #43680772889](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43680772889) foi **concluída com sucesso** em dois jobs. O observador verifica o bit `CrustFlag.MARGIN_ISLE`, a placa responsável e a idade mediana do maior agrupamento ARC.

Critérios: medir quanto do grupo grande vem de ilhas de antearco, quanto de ARC oceânica, quantas placas/terrenos contribuem, conexão com costa e duração do estoque. Somente depois propor alterações em produção, maturação, acreção, colisão ou reciclagem de arcos. Evitar correção por simples corte artificial de área.

## Resultado e decisões preservadas

1. A data de formação de crosta devolvida ao oceano passivo **não deve ser falsificada** para recuperar resultados históricos.
2. A fórmula GPE distribuída foi validada apenas numericamente em campo sintético, não como modelo tectônico definitivo.
3. Nenhum fator de intensidade entre 0,5 e 2,0 atende todos os critérios observados; **suspender o ajuste de força única por enquanto**.
4. Direcionar a próxima correção científica à **proveniência e persistência dos agrupamentos de ARC**, mantendo a auditoria de formação do relevo e da área continental.
5. Preservar `main` e comparar sempre com o histórico de idade oceânica correta.

Arquivos pertinentes: `v2/tools/audit-arc-clusters.mjs`, `v2/tools/audit-geography.mjs`, `reports/GPE_STRENGTH_SENSITIVITY_2026-11-15.md` e `reports/DISTRIBUTED_RIDGE_FULL_VALIDATION_2026-11-15.md`.


## Classificação confirmada: formação do agrupamento gigante (seed 4242, 20K)

A segunda medição separa **ARC marcada como ilha de antearco costeiro** (`CrustFlag.MARGIN_ISLE`) da restante crosta do tipo ARC. Um agrupamento ARC pode tocar continentes ou estar próximo deles sem se converter automaticamente em continente; o teste de maturação depende também de idade, pertencimento à placa e adjacência no raster da própria placa.

| Tempo (Ma) | Maior grupo ARC no teste GPE 2,0 (Mkm²) | Porção sinalizada como MARGIN_ISLE no maior grupo (Mkm²) | Número de placas no grupo | Idade mediana da crosta do grupo (Ma) |
|---|---:|---:|---:|---:|
| 900 | 9,59 | 0 | 1 | 248 |
| 1000 | 16,42 | 0 | 1 | 168 |
| 1100 | 26,98 | 0 | 3 | 164 |
| 1200 | **28,18** | **0,05** | 3 | **220** |

No último quadro, a maior placa contribui **27,03 Mkm²** dos 28,18 Mkm² conectados (**95,9%**); outras placas contribuem ~1,15 Mkm². Em contraste, no quadro GPE 1,0 o grupo maior tem **1,20 Mkm²** de ARC, dos quais **0,05 Mkm²** marcados como MARGIN_ISLE, e a idade mediana do grupo é **112 Ma**.

**Conclusão sustentada:** a anomalia gigante não foi causada principalmente pela formação de ilhas de antearco. Trata-se de ARC não marcada como antearco, acumulada/conectada ao longo de um histórico de reorganização de placas, com crosta relativamente antiga. A classificação de proximidade continental sozinha não distingue crosta de arco oceânica, fragmentos de terreno acrecionados ou crosta adjacente a continente em outra placa.

Dentre os terrenos tectônicos no grupo ao final estão os IDs 63 (~8,14 Mkm²), 45 (~5,99 Mkm²), 29 (~2,07 Mkm²) e 82 (~1,73 Mkm²). O maior grupo é **multiterreno**, embora quase inteiramente hospedado por uma única placa naquele instante.

### Investigação seguinte

Antes de alterar o gerador, medir para as células ARC com mais de 100 Ma:
- fração adjacente a crosta CONTINENT/CRATON **na mesma placa e na mesma malha de placa**, distinguindo os contatos apenas geográficos;
- largura e conectividade dos grupos de ARC, crescimento por criação versus acreção de terrenos, e episódios de perda por reciclagem;
- distribuição de idades ARC por grupo e participação de subducção/colisão nos últimos 300 Myr;
- presença efetiva de terra emersa nos mapas finais de terreno, que ainda não foi medida.

O objetivo é verificar se o grande estoque de ARC antigo é uma falha de **maturação/reciclagem** ou uma consequência de **formação e soldagem de terrenos** antes de ajustar parâmetros. A hipótese não deve ser confundida com a origem da crosta de antearco costeiro.

**Decisão adicional:** manter força 1,0 como controle experimental; direcionar a próxima auditoria à conservação e destino da crosta ARC. Evitar calibrar mais intensidades sem novos critérios geológicos.
