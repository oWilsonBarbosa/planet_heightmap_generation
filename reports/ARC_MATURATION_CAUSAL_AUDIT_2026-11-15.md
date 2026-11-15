# Orogen V2 — destino de crosta ARC antiga e velocidade de maturação

Data: **2026-11-15**. **Ramo:** `audit/arc-maturation-front-20261115`. A versão **`main` permanece inalterada**.

## Teste concluído: conectividade efetiva dos arcos

[GitHub Actions #43684554879](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43684554879): dois ensaios concluídos com sucesso, semente `4242`, resolução tectônica `20.001` células, intensidade de GPE distribuída `1.0` ou `2.0`, 0–1200 Ma, quadros de 900/1000/1100/1200 Ma. Artefatos CSV/JSON `arc-fate-4242-gpe-1.0` e `arc-fate-4242-gpe-2.0`.

A medição combina dois níveis diferentes:
1. **Grupo ARC conectado no mapa do planeta** (vizinhos na malha `world`, mesmo atravessando fronteira entre placas).
2. **Elegibilidade de maturação em raster nativo da placa:** `CrustType.ARC` não sinalizada como `MARGIN_ISLE`, idade >= `arcContinentAgeMyr=100`, caminho até CONTINENT/CRATON formado por células elegíveis da **mesma** placa; o último algoritmo é uma **possibilidade** topológica de uma frente sequencial de maturação, não garantia de conversão no tempo disponível.

### Intensidade GPE 1.0 — grupo maior (milhões km²)

| Tempo Ma | Área do grupo ARC | ARC >=100 Ma | ARC antiga alcançável pela frente de maturação |
|---|---:|---:|---:|
| 900 | 11,58 | 7,01 | **0,03** |
| 1000 | 5,38 | 4,95 | **0,38** |
| 1100 | 2,52 | 1,76 | **1,76** |
| 1200 | 1,20 | 0,64 | **0,46** |

### Intensidade GPE 2.0 — grupo maior (milhões km²)

| Tempo Ma | Área do grupo ARC | ARC >=100 Ma | ARC antiga alcançável pela frente de maturação | ARC antiga adjacente ao continente da mesma placa |
|---|---:|---:|---:|---:|
| 900 | 9,59 | 7,98 | **7,45** | 0,20 |
| 1000 | 16,42 | 10,63 | **9,51** | 0,66 |
| 1100 | 26,98 | 19,36 | **17,47** | 1,61 |
| 1200 | **28,18** | **22,90** | **22,82** | **2,93** |

Aos 1200 Ma, **~99,7%** da crosta ARC antiga elegível do grupo gigante está *topologicamente* alcançável a partir de um continente na mesma placa. A existência do caminho não diz que a frente de maturação já teve tempo para atravessar a distância em questão.

A placa K (`id=99` no quadro final, GPE2) registra **39,38 Mkm² de crosta continental** e **28,56 Mkm² de ARC no raster**; 22,03 Mkm² da ARC têm idade >=100 Ma e são elegíveis, e **21,83 Mkm² são alcançáveis pelo continente dentro da placa**. O grupo maior no quadro global tem **27,03 Mkm²** ligados à própria placa K, 95,9% dos 28,18 Mkm². A marcação de ilha de antearco no grupo global é apenas 0,05 Mkm² (auditoria anterior).

### Distinção operacional importante

O mecanismo `step/arc-maturation.js` permite maturar apenas **um anel de células por incremento suficiente de `arcMatureKm`**, condicionado ao tempo geológico e à idade da crosta. O padrão `arcContinentKmPerMyr=3` acumula ~300 km por 100 Ma de tempo **quando** o processo opera; a taxa numérica não equivale diretamente a velocidade física de metamorfismo ou migração de margem continental.

O efeito de tempo/caminho compete com a produção de crosta ARC e com a reestruturação tectônica. No cenário GPE2, a área visível total ARC vai de **23,46 Mkm² aos 900 Ma** a **43,07 Mkm² aos 1200 Ma** (crescimento +19,61 Mkm²), apesar de maturação e reciclagem durante o período. O raster ARC total também cresce 22,62 → 42,97 Mkm², mostrando que não é apenas sobreposição visual.

Os contadores **acumulados** aos 1200 Ma para GPE2 são `arcMaturedCells=1834` e `recycledCells=710`; para GPE1, respectivamente 1824 e 697, embora o estoque final ARC visível seja 43,07 vs 9,03 Mkm². Contadores isolados não explicam o balanço completo. Eles não medem todas as operações de criação, acreção e transformação.

**Hipótese técnica agora plausível:** o controle de estoque ARC não tem resposta suficiente à produção e à concentração de terrenos de arco no caso GPE2. A maturação parece muito restrita a uma frente que avança gradualmente a partir da crosta continental. Não é correto concluir que todo ARC >100 Ma deva ser convertido: arcos oceânicos podem ser preservados e, quando colidem, tanto acrecionados como subductados, em proporções que dependem da geometria e da reologia.

## Fontes geológicas

- Scholl & von Huene (2009), *Implications of estimated magmatic additions and recycling losses at the subduction zones of accretionary (non-collisional) and collisional (suturing) orogens*, Geological Society of London Special Publications, https://doi.org/10.1144/SP318.4 — comparação entre adição crustal por magmatismo de arcos e reciclagem em zonas de subducção.
- Tetreault & Buiter (2014), *Future accreted terranes: a compilation of island arcs, oceanic plateaus, submarine ridges, seamounts, and continental fragments*, Solid Earth, https://doi.org/10.5194/se-5-1243-2014 — arcos e outros terrenos podem soldar-se a continentes ou ser subductados, com papel da estrutura da crosta e das zonas de fraqueza.
- Buiter et al. (2012), *Geodynamic models of terrane accretion: Testing the fate of island arcs, oceanic plateaus, and continental fragments in subduction zones*, https://doi.org/10.1029/2012JB009316 — não supor acreção inevitável só por flutuabilidade.

## Teste causal em andamento

[GitHub Actions #43684803750](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43684803750). **Cinco histórias** com GPE2 / semente 4242 / 0–1200 Ma, capturas aos 900/1000/1100/1200 Ma:

- 20K, frente de maturação **3, 6 e 12 km/Ma**;
- 40K, frente de maturação **3 e 6 km/Ma**.

O valor 3 é o controle físico original. A alteração afeta **somente `world.config.arcContinentKmPerMyr`**, instância por simulação, e não altera o motor nem seus padrões na `main`.

**Critérios de decisão:** verificar se aumentar o ritmo faz o agrupamento ARC diminuir, sem apenas deslocar o excesso para CONTINENT/CRATON e sem aumentar a divergência entre 20K e 40K. Se não houver melhora simultânea no estoque, na área continental e na topologia, não adotar uma velocidade maior; medir produção e reciclagem de ARC como fluxos antes de propor novas regras.

**Situação na criação deste documento:** teste de conectividade concluído; teste de velocidade em execução, sem resultado observado.
