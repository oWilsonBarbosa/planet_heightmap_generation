# Auditoria V2 — resultados quantitativos preliminares

Data: 2026-11-14. Projeto: `planet_heightmap_generation`. Branch isolada: `audit/tectonic-baseline-20261114`.

## Evidência reproduzível

[Execução GitHub Actions #43623801251](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43623801251): sucesso em 2026-11-14, com artefato `geography-audit-20k` (CSV + JSON; 39 quadros, 13 por semente). Simulador derivado de `main` em `7026cc6526fa637611d05804a4cec8eed04de017`, com instrumentação isolada. Malha entregue por `labMesh(20000)` produziu **20.001 células**, não precisamente 20.000.

Configuração: cena `cycle`, sementes 12345, 4242 e 31337, evolução 0–1200 Myr, captura a cada 100 Myr, motor tectônico sem alterações.

| Semente | Crosta continental inicial | Crosta continental final | Variação (p.p.) | Variação relativa | Maior placa máxima (t>0) | Média idade oceânica final (Myr) | Maior grupo de crosta de arco (Mkm²) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 12345 | 29,00% | 39,79% | +10,79 | +37,2% | 41,53% | 147,4 | 9,16 |
| 4242 | 29,00% | 39,25% | +10,25 | +35,3% | 33,36% | 136,8 | 13,52 |
| 31337 | 29,00% | 42,45% | +13,45 | +46,4% | 53,32% | 104,9 | 7,88 |

Os valores são de crosta continental do modelo (**CONTINENT** + **CRATON**), não terra emersa; crosta de arco (**ARC**) é medida à parte. Maior grupo de arco = componente conectado de *células de crosta de arco*, não tamanho de um arquipélago emerso. Frações derivadas da malha de resolução tectônica, não do refinamento cartográfico. Não usar a compactação de perímetro calculada em malha coarse para afirmar precisão litorânea.

### Constatações

1. **Prioridade alta: ganho persistente de crosta continental.** Ocorre nas três histórias; ganhos relativos de ~35–46% em 1,2 Gyr. Excede a meta interna de variação de área continental de ±20% registrada em `v2/tools/check-phase13.mjs`, mas atenção: a meta do check inclui definições e outros testes que não são idênticos ao indicador aqui calculado. Registrar a diferença e comparar métodos antes de declarar falha formal da suite.
2. **Idade oceânica elevada em alguns finais.** Médias 104,9–147,4 Myr; variam no tempo, com picos iniciais distorcidos pelo fundo oceânico herdado do estado inicial. Não basta comparar uma única idade média de um quadro à idade média atual da Terra.
3. **Concentração de placas: não dominante neste conjunto.** Maior placa registrada depois do início: 33–53% da área de células planetárias. O caso mais extremo está na semente 31337 aos 800 Myr. Não extrapolar esses máximos para outras resoluções.
4. **Arcos: agrupamentos de crosta de arco chegam a 13,52 Mkm².** Exigem classificação adicional: crosta submarina, acreção ao continente ou ilhas realmente emersas.
5. **Ciclo continental:** há registros de reunião/agrupamento em ~700–800 Myr, mas a máquina de estados do ciclo e blocos de crosta conectados devem ser confrontados, pois não são indicadores equivalentes.

### Hipóteses causais (não confirmadas)

- `v2/js/tectonics/step/arc-maturation.js`: converte crosta `ARC` em `CONTINENT` após idade mínima e contato, um anel por vez; contador `world.budget.arcMaturedCells`.
- `v2/js/tectonics/step/margin-isles.js`: transforma crosta oceânica em arco junto a margens ativas, e ilhas aderidas podem virar continente.
- `v2/js/tectonics/step/collision.js`: o underthrusting remove crosta continental; `world.budget.underthrustCells`.
- `v2/js/tectonics/step/margin-isles.js`: margens erosivas convertem crosta não-cratônica em oceânica; `world.budget.erodedCells`.

O padrão líquido positivo não identifica sozinho a parcela causal de cada processo. A instrumentação da próxima rodada adiciona contadores acumulados de maturação de arcos, erosão marginal, consumo por underthrusting e reciclagem de arcos ao CSV. Esses contadores são operações de células na grade das placas e NÃO representam diretamente km² de crosta únicos; comparar taxas, diferenças e a área observada com cuidado.

## Próximo ensaio iniciado

Repetir as mesmas três sementes e 1200 Myr em 20K **e 40K**, coletar a série dos quatro contadores causais, comparar ganho continental entre resoluções e testar correlação com maturação de arcos. Antes de qualquer ajuste paramétrico, verificar se a semelhança entre resultados se mantém em resolução maior, e usar um ensaio A/B com mecanismos isolados para avaliar causalidade.

## Decisão

Manter o motor V2 inalterado. Primeiro confirmar balanço tectônico e sensibilidade à resolução; depois experimentar um ajuste mínimo na branch de auditoria, condicionado à evidência, com comparação antes/depois.
