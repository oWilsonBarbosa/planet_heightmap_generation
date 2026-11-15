# Orogen V2 — resultado da velocidade de maturação e auditoria dos fluxos de ARC

Data: **2026-11-15**. Estado: teste de velocidade **concluído**; instrumentação de fluxos iniciada em branch adicional. **Nenhum patch em `main`.**

## Reproduzibilidade

[GitHub Actions #43684803750](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43684803750): cinco jobs, todos concluídos com sucesso. Simulação `cycle` com semente 4242, GPE distribuído com coeficiente 2.0, 0–1200 Ma, registros aos 900/1000/1100/1200 Ma. O único parâmetro alterado no ensaio é `world.config.arcContinentKmPerMyr`, com valores 3, 6 ou 12. Resoluções solicitadas 20K e 40K equivalem a 20.001 e 40.001 células tectônicas.

### Resultado aos 1200 Ma

Todas as áreas em milhões de km²; `CONTINENT` inclui CONTINENT+CRATON; `ARC` inclui ARC de qualquer tipo, não necessariamente terra emersa.

| Malha | Velocidade de maturação (km/Ma) | CONTINENT+CRATON | ARC | CONTINENT+CRATON+ARC | Maior grupo ARC | Operações acumuladas de maturação |
|---|---:|---:|---:|---:|---:|---:|
| 20K | 3 | 203.68 | 43.07 | 246.76 | 28.18 | 1834 |
| 20K | 6 | 233.67 | 12.47 | 246.14 | 4.56 | 2082 |
| 20K | 12 | 205.80 | 4.97 | 210.77 | 0.41 | 2034 |
| 40K | 3 | 197.14 | 11.63 | 208.76 | 1.84 | 3332 |
| 40K | 6 | 181.11 | 12.70 | 193.81 | 1.84 | 3346 |

## Decisão

**Não aumentar a velocidade padrão de maturação com base nestas cinco histórias.**

1. Em 20K, dobrar a velocidade reduz a ARC em 30.60 Mkm² e aumenta os continentes em 29.99 Mkm²; o total de crosta não oceânica quase não muda (246.76→246.14 Mkm²). A melhoria aparente do estoque ARC é majoritariamente **reclassificação para crosta continental**, não redução de produção líquida de crosta.
2. Em 40K, dobrar a velocidade NÃO reduz o maior grupo ARC (1.84→1.84 Mkm²) e diminui o total não oceânico em 14.96 Mkm². A área continental cai 16.03 Mkm², embora tenha havido 14 operações de maturação adicionais: **efeitos históricos secundários** importam muito mais que a simples contabilização direta.
3. Em 20K, quadruplicar a velocidade reduz tanto ARC quanto a área total não oceânica (246.76→210.77 Mkm²), mas não de maneira monotônica em todos os indicadores: histórias e geometrias se reorganizam em resposta ao novo mosaico crustal.
4. O modelo não é de metamorfismo termodinâmico real; um avanço de 3–12 km/Ma representa uma regra heurística. Não inferir rapidez geológica real a partir de seu efeito em um único seed.
5. Os dados confirmam a necessidade de quantificar **fluxos reais** de ARC produzida e consumida, além de suas transformações de tipo.

## Nova auditoria de fluxo de crosta ARC

[Workflow de fluxo e invariantes #43685183404](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43685183404), na ramificação `audit/arc-crust-flux-ledger-20261115`, adiciona **apenas contadores diagnósticos** (nenhuma alteração em regras, probabilidades, idades ou forças):

- `arcBuiltCells`: conversões oceano→ARC por `buildArcs`, incluindo ampliação de arcos vulcânicos;
- `forearcBornCells`: conversões oceano→ARC por ilhas de antearco;
- `forearcMergedCells`: conversões ARC→CONTINENT de ilhas de antearco unidas ao continente;
- `arcMaturedCells`: conversões ARC→CONTINENT pela frente madura (contador existente);
- `arcSubductedCells`: remoções ARC por `gatherAndSubduct`;
- `arcErodedCells`: remoções ARC em margens erosivas;
- `arcScrapedMovedCells`: transferências ARC entre placas na raspagem (não são formação nova);
- `arcScrapedAbsorbedCells`: ARC absorvida sobre solo continental já existente ao ser raspada;
- `recycledCells`: perda de crosta de arco registrada pela reciclagem de pequenos terrenos (contador existente).

**Cuidado:** mesmo esses contadores não formam um orçamento de área completo: transferências, fusões e reamostragem de raster, escamas e colapso de arco podem preservar ou mudar o estoque sem passar pelos canais acima. São **operações de células nativas** por mecanismo e não devem ser somadas diretamente aos km² visíveis do globo. Os observadores distinguem explicitamente crosta nativa e crosta exposta.

A comparação executa em **paralelo** um `baseline` com o mesmo código anterior, outro com contadores e o **mesmo observador**, nas mesmas sementes e malhas:
- seed 4242 / GPE1 / 20K;
- seed 4242 / GPE2 / 20K;
- seed 4242 / GPE2 / 40K.

O workflow exige que as áreas ARC, CONTINENT, maior componente, idades elegíveis e operações de maturação/reciclagem sejam **exatamente idênticas** entre versões sem e com instrumentação, além de executar `check-invariants`. Uma diferença denuncia que a instrumentação modificou inadvertidamente a física ou a sequência de estados; então não é válida para inferência causal.

## Referências científicas

- Scholl e von Huene (2009), *Implications of estimated magmatic additions and recycling losses at the subduction zones of accretionary (non-collisional) and collisional (suturing) orogens*, https://doi.org/10.1144/SP318.4 — tanto produção como perdas na subducção condicionam o saldo crustal.
- Tetreault e Buiter (2014), *Future accreted terranes*, https://doi.org/10.5194/se-5-1243-2014 — arcos e platôs podem ser acrecionados ou subductados; contornos e condições reológicas importam.
- Buiter et al. (2012), *Geodynamic models of terrane accretion*, https://doi.org/10.1029/2012JB009316 — a acreção não é consequência inevitável da flutuabilidade.

## Fluxos já medidos, 900–1200 Ma, mesma semente 4242, 20K, velocidade 3 km/Ma

[GitHub Actions do livro-razão #43685183404](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43685183404), artefatos `arc-flux-gpe-1.0-20000` e `arc-flux-gpe-2.0-20000`: comparações emparelhadas concluídas com sucesso. O programa verificou **igualdade exata** de área ARC, continental, maior componente, idade elegível, alcançabilidade, maturação e reciclagem com e sem os novos contadores. A suíte `check-invariants.mjs` concluiu com **21/21 PASS**.

| Operações acumuladas entre os quadros de 900 e 1200 Ma | GPE 1.0 | GPE 2.0 |
|---|---:|---:|
| OCEAN→ARC por `buildArcs` | 631 | **855** |
| OCEAN→ARC por ilhas de antearco | 71 | 110 |
| ARC→CONTINENT por maturação | 543 | 655 |
| ARC→CONTINENT por união de ilhas de antearco | 63 | 93 |
| ARC absorvida sobre terra existente durante `scrapeArc` | **846** | 424 |
| ARC reciclada (`recycledCells`) | 222 | 205 |
| ARC perdida por erosão marginal | 15 | 28 |
| ARC removida pelo procedimento geral de subducção em `resolve` | 0 | 0 |
| ARC transferida na raspagem sem absorção (não é nascimento novo) | 306 | 236 |

No intervalo 900–1200 Ma, ARC **visível** na intensidade 1.0 cai de 24.56 para **9.03 Mkm²** (−15.53), enquanto na 2.0 sobe de 23.46 para **43.07 Mkm²** (+19.61). Aumento da produção de arco e **menor absorção durante o encontro com continentes** são dois sinais fortes. Contudo, o conjunto de fluxos monitorados NÃO fecha o estoque, em razão de fusões, reamostragem de raster, transformações não instrumentadas e projeção de área visível. Não é legítimo atribuir o resíduo a um único processo antes de medir esses caminhos.

A ausência de ARC no contador de `resolve` significa zero **naquele procedimento de remoção por sobreposição**, não inexistência de reciclagem por outros mecanismos (a tabela inclui `recycledCells` separadamente).

### Validação em 40K concluída

[Execução #43685183404](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43685183404): **todos os quatro jobs concluídos com sucesso**, incluindo a comparação de identidade física antes/depois dos contadores em 40K e os **21 testes de invariantes**. Artefato de 40K: `arc-flux-gpe-2.0-40000`.

| GPE 2.0, 900–1200 Ma | 20K (operações) | 40K (operações) | Escala física |
|---|---:|---:|---|
| OCEAN→ARC por `buildArcs` | 855 | 1082 | cada célula 20K ≈ 25.502 mil km²; 40K ≈ 12.751 mil km² |
| OCEAN→ARC por forearc | 110 | 262 | mesma malha nativa de cada run |
| ARC→CONTINENT por maturação | 655 | 1212 | mesma malha nativa de cada run |
| ARC absorvida em `scrapeArc` | 424 | 466 | mesma malha nativa de cada run |
| ARC reciclada | 205 | 294 | mesma malha nativa de cada run |
| ARC perdida na erosão marginal | 28 | 46 | mesma malha nativa de cada run |

O estoque ARC **visível** em GPE2/40K evoluiu de 14.23 Mkm² aos 900 Ma para **11.63 Mkm² aos 1200 Ma** (−2.60), e o maior grupo no quadro final tem apenas **1.84 Mkm²**. No correspondente GPE2/20K, ARC passa de 23.46 para **43.07 Mkm²** (+19.61), com maior grupo **28.18 Mkm²**. Esta diferença muito grande é uma **sensibilidade histórica e/ou geométrica à resolução**, não eliminada pela correção de idade oceânica.

Convertendo operações de produção de ARC vulcânica em área nominal de célula, GPE2 produziu ~**21.80 Mkm² em 20K** e ~**13.80 Mkm² em 40K** durante 900–1200 Ma. A diferença de área não prova isoladamente que a fórmula de `buildArcs` dependa erroneamente da resolução, pois as histórias de subducção, geometria e comprimento das zonas ativas também são diferentes. Exige-se um teste controlado de margens com a **mesma geometria física** nas duas malhas.

**Advertência de contabilidade:** a soma assinada das operações registradas não reproduz sozinha a variação de ARC visível (nem necessariamente a nativa), porque fusões de placas, reamostragem de raster, capturas e outras transformações não estão completamente instrumentadas. Os contadores ajudam a atribuir diferenças de mecanismos, mas **não são um orçamento geológico fechado de km²**.

**Próximo procedimento:** instrumentar `mergePlates` e `accreteTerrane` para diferenciar deslocamentos de ARC, absorção e variação de contagem por reamostragem, e elaborar um ensaio específico de `buildArcs` com margem prescrita em 20K/40K. Não alterar taxas físicas, idades nem a regra de GPE até localizar o processo dominante.

**Próxima hipótese operacional:** comparar alteração de estoque ARC durante as operações `mergePlates` e `accreteTerrane` com a incorporação e absorção por raspagem. Uma diferença de contagem de raster durante fusão não equivale automaticamente a criação física de nova crosta; precisa ser distinguida de sobreposições e das células ocultas do mapa mundial.

Nenhum parâmetro ou função foi modificado em `main`.
