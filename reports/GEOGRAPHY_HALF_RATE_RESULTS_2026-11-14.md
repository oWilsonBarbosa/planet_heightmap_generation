# Orogen Evolution — calibração de meia taxa e validação

**Data:** 2026-11-14. **Escopo:** simulação tectônica V2 (`cycle`), 20.001 células, 1.200 Myr, sementes 12345, 4242, 31337; treze quadros por semente. Código principal e `main` permanecem inalterados.

**Fonte dos dados:** [GitHub Actions #43647683459](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43647683459); artefatos `geography-dose-arcHalf`, `geography-dose-islesHalf`, `geography-dose-bothHalf`. Controle: [#43645710542](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43645710542). Todos os três ensaios de meia taxa concluídos com sucesso.

## Resultados: ganho percentual absoluto de crosta continental

Em pontos percentuais da área total do planeta, de 0 a 1200 Myr:

| Seed | Controle | `arcHalf` | `islesHalf` | `bothHalf` |
|---|---:|---:|---:|---:|
| 12345 | +10,79 | +2,77 | +7,52 | +6,87 |
| 4242 | +10,25 | +10,81 | +10,09 | +4,71 |
| 31337 | +13,45 | +12,94 | +11,23 | +6,69 |
| **Média** | **+11,50** | **+8,84** | **+9,62** | **+6,09** |

O fator combinado diminui o ganho médio em 5,41 pontos percentuais, **47,0%** frente ao controle. O comportamento isolado não é monotônico por seed: em 4242, `arcHalf` produz mais crosta continental que o controle. Trata-se de um sistema histórico não linear; não interpretar essas comparações como coeficientes físicos universais.

## Efeitos colaterais ao final do experimento

| Cenário | Crosta de arco média (% da superfície) | Idade oceânica média ao final (Myr, média das 3 sementes) | Fração média do maior bloco na crosta continental (%) |
|---|---:|---:|---:|
| Controle | 2,54 | 129,72 | 42,73 |
| `arcHalf` | 5,60 | 103,23 | 47,80 |
| `islesHalf` | 2,35 | 104,03 | 60,64 |
| `bothHalf` | 5,32 | 94,53 | 45,66 |

Os percentuais de arco são de **crosta ARC**, não de ilhas emersas. No experimento `bothHalf`, o estoque de arcos aumenta frente ao controle, mas permanece bem abaixo do caso extremo de desligamento completo da maturação (~14,14%). A idade oceânica melhora no conjunto das três sementes, porém não prova equilíbrio de produção/consumo oceânico porque cada configuração gera história diferente.

## Decisão provisória

**Selecionar `bothHalf` apenas como candidato para validação**, não como calibração padrão. Parâmetros efetivos nos mundos-teste:

- `arcContinentKmPerMyr`: 3 → 1,5;
- `marginIsleRatePerMyr`: 0,6 → 0,3;
- `marginIsleGrowKmPerMyr`: 10 → 5;
- `marginIsleCoastShare`: 0,2 sem alteração; o avanço costeiro diminui na mesma proporção da velocidade de crescimento.

## Próxima experiência já configurada

[Workflow de validação #43648107974](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43648107974), independente do `main`, três jobs:

1. Repetir `bothHalf` em 40K nas sementes antigas 12345, 4242 e 31337 e comparar com controle 40K já concluído.
2. Controle 20K nas novas sementes 777, 2026, 8765 e 31415.
3. `bothHalf` 20K nas mesmas quatro sementes, comparação pareada.

**Limites de aceitação propostos:** redução do ganho médio sem acréscimo sistemático da crosta de arco exagerada; não agravar a distribuição da idade oceânica; estabilidade aproximada da tendência entre resoluções, reconhecendo trajetórias tectônicas não lineares; regressões funcionais inexistentes; verificar depois os relevos/contornos em cartas comparativas. A definição de limites de crescimento continental é uma escolha de modelo que requer justificativa científica, não uma constante terrestre única.

**Estado no momento do registro:** três testes de dose concluídos, workflow de validação disparado, ainda sem resultados dos quatro seeds novos ou do candidato em 40K. Não aplicar correção ao padrão antes da validação.
