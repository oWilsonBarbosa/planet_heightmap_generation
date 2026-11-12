# As frentes de inverno das costas leste — 09/11/2026

Base: `a946eba`. Primeira parte do item 2 da [revisão de plausibilidade](PLAUSIBILITY_REVIEW_20261106.md): as
tempestades de inverno onde a Terra as tem. O clima é um só para Generate, Import e Evolution.

## O problema

Na Terra simulada, o inverno das costas leste subtropicais recebia um quarto da chuva observada. Nos mundos gerados, o
mesmo viés fazia três coisas:

- trocava Cf (inverno úmido) por Cw (inverno seco) ou estepe;
- levava o deserto subtropical até a costa leste;
- deixava a costa leste das latitudes médias árida.

A causa está no estágio de chuva, não na água que o ar carrega. Valores médios do mês-âncora de inverno, no sudeste dos
EUA:

| | terra | mar a leste |
|---|---:|---:|
| chuva | 19 mm/mês (Beck: 117) | 120 mm/mês |
| umidade relativa da coluna | 0,53 | 0,48 |
| taxa de chuva | 0,72 | 6,78 |

- **A água está lá:** a umidade da coluna sobre a terra é a mesma do mar ao lado.
- **A taxa é que cai:** a terra no inverno é mais fria que a sua região, e o estágio de chuva conta esse ar como
  estável, o que corta a chuva quase pela metade a cada poucos graus.
- **Na Terra real** essa chuva vem de frentes. O ciclone ergue o ar quente e úmido do seu setor quente por cima do ar
  frio da superfície, e a chuva cai de cima da camada estável. É a chuva de inverno da Flórida, do sul da China e de
  Buenos Aires, ao longo das correntes quentes (Golfo do México e do Golfo, Kuroshio, do Brasil, do leste da
  Austrália).

## A correção: frentes sobre o ar frio (`rain.js`)

Onde o ar de superfície é mais frio que a sua região e há um contraste forte de temperatura por perto, as frentes somam
à taxa de chuva das tempestades, por cima da estabilidade:

```
taxa = tempestades × (estabilidade + frente × (1 − convecção do sol) × borda) × convecção da terra
frente = RAIN_FRONT_RATE × min(1, σ_local / 1 dia⁻¹) × frio × e^(−excesso de pressão / RAIN_FRONT_RATE_HPA)
```

- **σ_local:** a taxa de Eady do lugar, pela mesma fórmula das tempestades, a partir do gradiente da temperatura de
  superfície suavizado em `RAIN_FRONT_SMOOTH_KM` (600 km). As tempestades usam a média de cada paralelo.
- **frio:** o quanto o ar é mais frio que a sua região, cheio a partir de 2 K.
- **Só na estação fria:** nada onde o sol move a convecção.
- **Só na borda do ar frio:** some no ar abaixo de −5 °C, a zero a −15 °C. Dentro de uma massa de ar ártica, a frente
  está muito ao sul. Sem isso, a chuva das terras a 55–65° N subia de ×1,29 para ×1,39 em janeiro.
- **Some sob as altas** (e-folding de 2 hPa acima da média da latitude): a alta siberiana mantém o inverno do nordeste
  da China seco.
- **A frente soma à taxa e não ao levantamento**, então segue a mesma lei íngreme da umidade da coluna: ar seco, de
  deserto ou da monção de inverno, quase não responde.

Três parâmetros novos em `config.js`, com faixas em `PARAM_PRIORS`:

| parâmetro | valor | faixa |
|---|---:|---|
| `RAIN_FRONT_RATE` | 2 | 0–4 |
| `RAIN_FRONT_SMOOTH_KM` | 600 | 400–1.000 |
| `RAIN_FRONT_RATE_HPA` | 2 | 1–4 |

Com `RAIN_FRONT_RATE` 0, o clima é idêntico ao de antes (`hash-climate.mjs`). O tempo não muda.

## Resultados

### Na Terra (160 mil regiões)

| | antes | depois |
|---|---:|---:|
| `coupled-check`: Köppen exato / próximo | 49,5 / 86,6 % | 50,2 / 86,8 % |
| … continentes iguais | 45,6 / 85,9 % | 46,6 / 86,2 % |
| … América do Norte / do Sul, exato | 46,1 / 40,6 % | 47,3 / 43,9 % |
| … Europa / Austrália, exato | 36,5 / 55,5 % | 37,3 / 56,6 % |
| … África / Ásia, exato | 59,9 / 34,8 % | 59,9 / 34,6 % |
| … Cw, área ÷ real | ×1,69 | ×1,54 |
| … Dw, área ÷ real | ×1,41 | ×1,35 |
| … Cs, área ÷ real | ×0,68 | ×0,67 |
| … salvaguardas: temperatura, chuva, mar, pressão, vento | 3,51 · 0,70 · 2,55 · 3,08 · 78,5 % | 3,51 · 0,69 · 2,55 · 3,08 · 78,5 % |
| … 640K / 2,5M | 50,1 / 49,8 % | 50,9 / 50,6 % (deriva 1,0–1,1 %) |
| `evaluate.mjs` (Kottek): objetivo / exato | 0,7300 / 48,38 % | 0,7311 / 48,97 % |
| … Cfa, F1 | 0,385 | 0,550 |
| chuva das terras ao norte de 55° N ÷ Beck (erro mensal) | ×1,32 (0,56) | ×1,34 (0,56) |
| rios com o clima simulado (2,56M): nota do ano | −0,211 | −0,213 |
| erro de aparência da Terra (`lib/glance.mjs`) | 4,4 pt | 5,1 pt |

Chuva de inverno, simulado / Beck (mm/mês):

| | antes | depois |
|---|---:|---:|
| sudeste dos EUA | 27 / 117 | 50 / 117 |
| leste da Austrália | 17 / 41 | 30 / 41 |
| sul do Brasil e Uruguai | 21 / 108 | 30 / 108 |
| sudeste da China | 16 / 66 | 17 / 66 |

Os verões e os trópicos não mudam.

### Nos mundos gerados

| | antes | depois |
|---|---:|---:|
| erro de aparência médio (Generate e Evolution) | 18,5 pt | 17,3 pt |

- Nenhum mundo ficou mais árido. A maioria perdeu um ponto de aridez:
  - semente 2: 36 → 35 %;
  - semente 5 com muita terra: 39 → 37 %;
  - Evolution 202: 46 → 45 %.
- O ganho está nas costas leste.

## O custo, e por que foi adotado

**A aparência da Terra piora 0,7 ponto, acima da salvaguarda de 0,5 que o ajuste usa.**

- A costa leste subtropical árida vai de 30 para 29 % (real 32 %) e a das latitudes médias de 5 para 4 % (real 6 %).
- As costas que mudam erradas são semiáridas de verdade:
  - o nordeste do México;
  - Queensland entre 20 e 25° S;
  - a cabeceira do Golfo Pérsico.
- Nas classes, a frente ganha 688 células de Köppen exato na Terra e perde 389 (de 47.454; +0,63 ponto).
  - Perde: desertos que viram estepe (BWh → BSh, −91), o inverno seco do nordeste da Ásia (Dwb → Dfb, −43; o
    nordeste da China e a Coreia, −41 no saldo) e o centro da Austrália (−25).
  - Ganha: Cwa → Cfa (+165), BSh → Cfa (+91) e Cwb → Cfb (+44), no sul do Brasil e Uruguai (+187), no sudeste dos EUA
    (+62) e no leste da Austrália (+47).

**Foi adotada porque passa nas duas checagens que o CLAUDE.md exige.** O `coupled-check` e a avaliação Kottek melhoram,
os mundos melhoram, e nenhuma salvaguarda dos estágios piora. A salvaguarda da aparência é deste fork e mais grosseira:
mede cinco linhas agregadas.

## Tentado e não adotado

| tentativa | o que deu errado |
|---|---|
| **A frente só tirando a estabilidade** (`stable^(1 − φ)`) | Pouco efeito: sudeste dos EUA 19 → 35 mm |
| **A frente como levantamento** (λ·W, com a lei suave da umidade, como a chuva orográfica) | Molha os desertos no inverno (centro da Austrália, Arábia, BWh → BSh) e, sem a restrição à estação fria, os verões das costas oeste (Califórnia 14 → 22 mm, real 6); Kottek 0,7300 → 0,7292 |
| **Desvanecimento sob as altas de 4 hPa** | O nordeste da Ásia perde o inverno seco (Dwb → Dfb, −117 células) |
| **Só a componente meridional do gradiente** | Igual ou pior |
| **Só o excesso de σ_local sobre a média do paralelo** | Perde quase todo o ganho |
| **`RAIN_FRONT_RATE` 3** | Kottek 0,7304, pior que com 2 |

## O que falta

1. **O mediterrâneo dos mundos.** Nas costas oeste a 30–45°, a pressão em relação à média do paralelo fica assim:

   | | verão | inverno |
   |---|---:|---:|
   | mundos | −1,2 a −2,2 hPa | +1,7 a +3,7 hPa |
   | Terra | −0,1 hPa | +0,3 hPa |
   | continente plano de teste | −0,1 hPa | +2,7 hPa |

   A baixa térmica do continente chega ao litoral no verão: um padrão de monção que molha o verão. As costas oeste dos
   mundos saem Cfb e Cfa onde a Terra tem Csa e Csb, e no continente plano o Cs aparece (Csb em 57 %). É a segunda
   parte do item 2: a circulação.
2. **As costas leste ainda secas no inverno:** o sudeste dos EUA com 50 contra 117 mm, o sul do Brasil 30 contra 108, o
   sudeste da China 17 contra 66.

## Segunda parte: a circulação e o mediterrâneo (não adotada)

### O que se mediu

Costas oeste a 30–45° (no máximo 300 km do mar a oeste, pelo menos 800 km de terra a leste):

| | Terra | mundos (sementes 2, 6, 10, Evolution 202) | continente plano de teste |
|---|---:|---:|---:|
| verões secos (Cs) | 27 % | 16–23 % | 73 % |
| pressão na costa contra a média do paralelo, verão | −0,1 hPa | −1,2 a −2,2 hPa | −0,1 hPa |
| … no mar a oeste | +1,7 hPa | −0,8 a +0,8 hPa | +1,9 hPa |
| vento para a costa, verão | −0,2 m/s | 1,0–1,4 m/s | 2,4 m/s |
| água no solo, verão | 6 | 10–13 | 4 |

Nos mundos falta a alta oceânica de verão ao lado da costa. Na latitude do continente quase tudo é mar, e o mar fica
na média do paralelo. O continente, bem mais quente que essa média, puxa a baixa térmica até o litoral, e o verão se
sustenta pela reciclagem (evaporação maior que a chuva).

### O que não era a causa

- **A pressão em si:** sem as baixas térmicas (`CIRC_THERMAL_HPA_PER_K` 0), a costa fica neutra, mas os verões ficam
  mais chuvosos.
- **As alturas da Terra:** com elas, as costas oeste quase não mudam.
- **O aquecimento das muralhas costeiras** (o lapso que leva a temperatura ao nível do mar a 3 °C/km): também não; o
  mundo de costa baixa (semente 10) é o de baixa costeira mais funda.
- **A alta oceânica no valor da literatura** (`CIRC_OCEAN_HIGH_HPA` 8): piora a costa.

### O que se tentou: a subsidência monção-deserto (Rodwell e Hoskins 1996)

A baixa térmica de verão de um continente força ar descendo a oeste dela, sobre o mar: as altas do leste dos oceanos.
O modelo responde ao calor só com a baixa, simétrica. Agora há `CIRC_DESCENT_HPA_PER_K` e `CIRC_DESCENT_SHIFT_DEG`
(desligado; com 0 a circulação é idêntica): o mar a oeste fica mais alto por grau de calor da terra 25° a leste, na
faixa das altas subtropicais.

| | sem | 2 hPa/K, só sobre o mar |
|---|---:|---:|
| Köppen da Terra, exato / próximo | 50,2 / 86,8 % | 50,8 / 86,9 % |
| … continentes | 46,6 / 86,2 % | 47,2 / 86,2 % |
| Kottek | 0,7311 | 0,7312 |
| Cw, área ÷ real | ×1,54 | ×1,40 |
| **Cs na Terra: acerto / área** | **23,8 % / ×0,67** | **17,9 % / ×0,58** |
| verão da Califórnia / Chile central (real 6 / 13 mm) | 14 / 44 | 20 / 50 |
| erro de aparência: Terra / mundos | 5,1 / 17,3 pt | 4,8 / 16,8 pt |
| Cs nas costas oeste dos mundos (Terra observada 43 %) | 1–46 % | 1–46 %, a maioria +2 a +7 |

- **Sobre a terra também**, a alta caía na costa leste do continente vizinho através de um oceano estreito. As costas
  leste secavam, os mundos ficavam mais áridos (semente 6, +2 pontos) e o Kottek caía para 0,7283–0,7306.
- **Só sobre o mar**, quase tudo melhora, menos o alvo. O mediterrâneo da Terra piora: a alta mais forte empurra mais ar
  marinho para a costa, e o estágio de chuva deixa esse ar chover sob a subsidência.

**Não adotada.** O mediterrâneo precisa do estágio de chuva: a camada marinha sob a inversão de subsidência não chove,
por úmida que esteja junto ao chão. Com isso no lugar, a subsidência pode valer a pena (ela fica disponível para o
ajuste).

## Reprodução

```bash
node tuning/climate/coupled-check.mjs                 # --set RAIN_FRONT_RATE=0 para o antes
node tuning/climate/evaluate.mjs
node tuning/climate/planets-dry.mjs
node tuning/climate/diag-rain-seasons.mjs --planets none
node tuning/climate/evolution-check.mjs
node tuning/water/earth-rivers.mjs --n 2560000 --climate sim
node tuning/climate/hash-climate.mjs                  # com RAIN_FRONT_RATE 0, igual ao de antes
node tuning/climate/coupled-check.mjs --quick --set CIRC_DESCENT_HPA_PER_K=2   # a subsidência monção-deserto
```
