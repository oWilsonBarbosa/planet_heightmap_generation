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

**Estado no primeiro registro:** o teste de velocidades foi concluído; a comparação do balanço ARC e seus testes de invariância estavam em andamento. Não atribuir ainda números aos fluxos não observados.
