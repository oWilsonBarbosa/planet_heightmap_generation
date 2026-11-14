# Orogen V2 — testes de mecanismos e decisão de calibração

Data: 2026-11-14. Fonte: [GitHub Actions #43647016031](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43647016031), artefatos `geography-ablation-arcMaturation` e `geography-ablation-marginIsles`, e [controle de 20K #43645710542](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43645710542).

**Ensaios executados:** 3 sementes (12345, 4242, 31337), `cycle`, malha tectônica 20.001 células, 0–1200 Myr com 13 instantes gravados por história. A única diferença entre grupos é o parâmetro de um mecanismo desligado ao início do run. `main` e o motor tectônico não foram modificados.

## Crosta continental: mudança percentual da superfície planetária de 0 a 1200 Myr

| Seed | Controle | Sem maturação de arcos | Sem crescimento de ilhas de margem |
|---|---:|---:|---:|
| 12345 | +10,794 p.p. | +3,365 p.p. | +5,980 p.p. |
| 4242 | +10,249 p.p. | +7,350 p.p. | +5,100 p.p. |
| 31337 | +13,454 p.p. | +4,400 p.p. | +6,255 p.p. |
| **Média** | **+11,499 p.p.** | **+5,038 p.p.** | **+5,778 p.p.** |

Comparações pareadas por seed: desligar maturação reduz o ganho médio em **6,461 p.p.**; desligar ilhas de margem reduz em **5,721 p.p.** Os efeitos **não são aditivos**: alterar um mecanismo muda a evolução posterior, a configuração de placas, colisões e os outros processos.

## Consequências colaterais observadas

| Medida média ao final (3 seeds) | Controle | Sem maturação | Sem ilhas |
|---|---:|---:|---:|
| Crosta de arco, % globo | 2,54 | 14,14 | 4,16 |
| Idade média crosta oceânica, Myr | 129,72 | 94,96 | 105,83 |
| Maior bloco, % crosta continental | 42,73 | 52,12 | 40,22 |

Eliminar maturação produz uma grande acumulação de crosta de arco, logo **desligá-la por completo não é uma solução geológica satisfatória**. Desligar ilhas também reduz a diversidade potencial de margens ativas. Redução da idade oceânica em runs ablacionados **não prova** que a subducção esteja corretamente modelada: a história tectônica mudou.

## Mecanismos concretos identificados

- `v2/js/tectonics/step/arc-maturation.js`: `arcContinentKmPerMyr = 3` e `arcContinentAgeMyr = 100`; transforma ARC conectado ao continente em CONTINENT em passos discretos; contador `arcMaturedCells`.
- `v2/js/tectonics/step/margin-isles.js`: `marginIsleRatePerMyr = 0.6`, `marginIsleGrowKmPerMyr = 10`, `marginIsleCoastShare = 0.2`; forma arcos marginais, converte os conectados em continente.
- Perdas compensatórias existentes: `marginErosionKmPerMyr = 2` em margens erosivas e `underthrustShare = 0.25`; sua frequência e área líquida não são equivalentes, necessariamente, às taxas brutas de acreção.

## Decisão experimental

**Não remover nenhum mecanismo nem modificar o padrão do gerador com apenas três sementes.**

Executar próximo teste de dose-resposta, com fatores de 50% dos parâmetros cinemáticos e de nascimento em 20K, para as mesmas três sementes:
1. `--dose=arcHalf`: `arcContinentKmPerMyr = 1.5`, mantendo os demais processos;
2. `--dose=islesHalf`: `marginIsleRatePerMyr = 0.3` e `marginIsleGrowKmPerMyr = 5` (`marginIsleCoastShare` inalterado);
3. `--dose=bothHalf`: aplicar os dois ajustes juntos.

Execução programada pelo [GitHub Actions #43647683459](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43647683459). **Os resultados não são antecipados neste relatório.** Compare o crescimento continental, o estoque de crosta ARC, idade oceânica, placas e blocos, e o tempo de cálculo antes de decidir por uma calibração final. Para validar generalização, repetir as configurações promissoras em 40K e um conjunto mais amplo de sementes. Os limites de ±20% e outros testes do próprio projeto são critérios de engenharia, não uma lei universal da geologia planetária.

## Status

- [x] Controle 20K (três sementes)
- [x] Controle 40K (mesmas sementes)
- [x] Duas ablações 20K concluídas
- [x] Recalibração intermediária isolada em parâmetros de instância (sem alteração global)
- [ ] Concluir e medir as três configurações de meia taxa
- [ ] Repetir o candidato a 40K e ampliar as sementes
- [ ] Verificar qualidade visual, relevos e outras funções antes de alterar o `main`
