# Auditoria V2 — comparação 20K × 40K e testes causais

Data: 2026-11-14. Branch: `audit/tectonic-baseline-20261114`. **Não alterar o motor principal antes dos resultados causais.**

## Experimento concluído

[Execução GitHub Actions #43645710542](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43645710542): concluída com sucesso. CSV/JSON para simulação tectônica `cycle`, sementes 12345/4242/31337, malhas solicitadas 20K e 40K (**20.001 e 40.001 células reais**), tempo 0–1200 Myr, amostras a cada 100 Myr. A execução de 40K não é mapa refinado a 10M: o número representa a malha tectônica de simulação. A série mede crosta, não terra emersa.

### Resultados finais (1200 Myr)

| Seed | Crosta continental 20K→40K (% superfície) | Maior bloco continental 20K→40K (% da crosta continental) | Idade oceânica 20K→40K (Myr) | Maior placa 20K→40K (% superfície) |
|---|---|---|---|---|
| 12345 | 39,79 → 38,50 | 36,89 → 84,52 | 147,43 → 219,81 | 21,66 → 43,05 |
| 4242 | 39,25 → 36,23 | 59,47 → 65,32 | 136,82 → 99,11 | 33,36 → 29,31 |
| 31337 | 42,45 → 41,24 | 31,82 → 96,44 | 104,90 → 100,80 | 22,59 → 37,16 |

O estado final de dois runs é topologicamente muito diferente, embora as frações globais de crosta continental permaneçam relativamente próximas. Em Seed 31337 há 6 blocos de crosta >1 Mkm² aos 1200 Myr em 20K e somente 2 em 40K. A medida de participação do bloco inclui conectividade por qualquer célula de crosta (inclusive istmos de uma célula); validar com largura mínima antes de classificar supercontinentes físicos.

### Contadores cumulativos aos 1200 Myr

| Seed | Malha | Maturação ARC→CONTINENT (células) | Margem erodida (células) | Underthrust (células) | Arco reciclado (células) |
|---|---:|---:|---:|---:|---:|
| 12345 | 20.001 | 1781 | 503 | 2162 | 528 |
| 12345 | 40.001 | 3077 | 945 | 2987 | 1344 |
| 4242 | 20.001 | 1643 | 393 | 1564 | 653 |
| 4242 | 40.001 | 2944 | 762 | 2854 | 1341 |
| 31337 | 20.001 | 1707 | 438 | 1242 | 662 |
| 31337 | 40.001 | 3737 | 812 | 3240 | 1778 |

*Contadores de operações por célula local da malha das placas: não somar diretamente ao número de células continentais globalmente visíveis nem interpretar como balanço exato de km². Uma parcela das operações sobrepõe-se a outras, e crosta pode ser ocultada por sobreposição entre placas.*

A maturação de arcos corresponde a operações acumuladas equivalentes a ~7,4–9,3 pontos percentuais de células da malha, ao passo que os ganhos continentais líquidos observados são ~7,2–13,5 pontos percentuais. Essa comparação indica materialidade potencial; **não comprova causalidade**.

## Achados

1. **Ganho continental:** em 20K (+10,25 a +13,45 p.p. do globo) e 40K (+7,23 a +12,24 p.p.), a crosta continental aumenta persistentemente, merecendo exame da acreção e de sua compensação.
2. **Convergência com resolução:** medidas médias de área são mais robustas que topologia, mas o final continental diverge substancialmente em determinadas sementes; investigar tanto sensibilidade histórica/caótica quanto eventuais dependências artificiais do tamanho das células.
3. **Idade oceânica:** o final 40K da semente 12345 tem média 219,81 Myr e 23,94% do oceano acima de 200 Myr, enquanto seu 20K atinge 147,43 Myr e 19,91% acima de 200 Myr; é forte sinal para revisar a formação/consumo de placas oceânicas em histórias longas.
4. **Método:** o maior bloco de crosta conectado não é sempre igual ao indicador de supercontinente do motor (`f.cycle.share`), pois critérios e classificações diferem. Não tratar diferença como erro sem auditar seus denominadores e regras.

## Testes A/B iniciados

[Execução de ablação](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43647016031): comparar a base 20K com duas intervenções isoladas via parâmetros da própria instância do mundo, antes de começar a evolução:

- `--ablate=arcMaturation` define `arcContinentKmPerMyr=0`, preservando formação de arcos, reciclagem e margens.
- `--ablate=marginIsles` define `marginIsleRatePerMyr=0`, `marginIsleGrowKmPerMyr=0` e `marginIsleCoastShare=0`, preservando as demais regras.

As ablações não são iguais a uma contabilidade direta do mecanismo: desligá-lo altera a história subsequente e outras taxas. Sua interpretação requer confrontar todo o percurso e os três seeds. **Resultados das ablações ainda não foram observados ao redigir este relatório.**

## Próximos critérios

- Medir a diferença de crescimento de crosta entre ablação e controle em cada seed; não aceitar correção só porque um run diminui de área.
- Registrar impacto nas outras métricas: número de placas, arcos, oceanos, número de blocos, eventos e tempo de simulação.
- Se o desvio topológico continuar, instrumentar largura de gargalos continentais e divergência a cada 100 Myr; ampliar sementes antes de recalibrar.
- Só depois ensaiar um parâmetro menor / regra alternativa e comparar com os testes tectônicos existentes.

### Arquivos

- `v2/tools/audit-geography.mjs` — métricas e ablações;
- `.github/workflows/geography-audit.yml` — baseline 20K/40K;
- `.github/workflows/geography-ablation.yml` — teste causal separado.
