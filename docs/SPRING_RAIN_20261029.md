# A chuva da primavera fria — 29/10/2026

Base: `8b97470`. Trata o item aberto "investigar os excessos de chuva e neve da primavera setentrional" do
[FORK_STATUS](FORK_STATUS.md). O clima é um só para Generate, Import e Evolution, então a correção vale para os três.

## O problema

Na Terra simulada (160K), as terras ao norte de 60° N (sem a Groenlândia) recebiam 750 mm por ano, contra 444 observados
(×1,69). De 70 a 80° N, ×2,66. O excesso fica de abril a julho (`diag-spring.mjs`):

| Chuva ÷ observada | Abr | Mai | Jun | Jul |
|---|---:|---:|---:|---:|
| 50–60° N | 1,82 | 1,97 | 1,53 | 1,07 |
| 60–70° N | 2,44 | 3,42 | 2,55 | 1,54 |
| 70–80° N | 4,13 | 6,39 | 7,06 | 4,33 |

## O que o balanço de água mostra

Decompondo o balanço do estágio de chuva (`rain.js`, grade de 3°, terras com ≥ 50 % de terra):

| Maio | Chuva simulada | Observada | Evaporação local | Entrada pelo transporte |
|---|---:|---:|---:|---:|
| 60–70° N | 110 mm | 33 mm | 81 mm | 29 mm |
| 70–80° N | 115 mm | 19 mm | 42 mm | 73 mm |

- **A chuva é limitada pela água que chega.** Mudar a eficiência das tempestades (`RAIN_STORM_RH`), a água do degelo
  que infiltra (`RAIN_MELT_SOAK`) ou o solo (`RAIN_SOIL_MM`) quase não muda a chuva de maio: com menos chuva por unidade
  de umidade, a coluna só fica mais úmida.
- **A evaporação da primavera** era a do verão: o estágio de chuva usa o albedo de terra nua assim que o ar passa de
  ~2 °C, e nada limita a evaporação enquanto o solo está congelado. Em maio, a 60–70° N, 81 mm de evaporação para 33 mm
  de chuva observada.
- **O transporte pelas tempestades** é muito forte nas altas latitudes, e com o pico na estação errada. A mistura
  turbulenta K = `RAIN_EDDY_DIFF` + σ·L² chega a 8–10 × 10⁶ m²/s de março a maio a 60–80° N (a faixa de `PARAM_PRIORS`
  fala em 1–3 × 10⁶). A taxa de Eady σ sai do gradiente de temperatura da superfície, que na primavera é forte por causa da
  linha da neve e do gelo marinho. Na Terra real as tempestades são mais fortes no inverno.

## Correção: o solo congelado evapora pouco

Em `rain.js`, a evaporação potencial da terra fica em `RAIN_FROZEN_EVAP` (0,2) do valor normal enquanto o solo está
congelado. A temperatura do solo é a do ar um mês antes. O valor vai ao normal entre `RAIN_THAW_FROM_C` (−2 °C) e
`RAIN_THAW_FULL_C` (+4 °C). São três parâmetros novos em `config.js`, com faixas em `PARAM_PRIORS`. Os valores saíram de
uma varredura de 0,1–0,5 e de três faixas de degelo, pelos três ensaios abaixo.

| Na Terra | Antes | Depois |
|---|---:|---:|
| `coupled-check --quick`: Köppen exato / próximo | 47,9 / 86,4 % | 48,7 / 86,5 % |
| … grupo principal | 78,9 % | 79,0 % |
| … Ásia / América do Norte / Europa, exato | 30,8 / 43,8 / 36,9 % | 33,0 / 44,7 / 36,7 % |
| … salvaguardas (temperatura, chuva, mar, pressão, vento) | 3,59 · 0,71 · 2,58 · 3,08 · 78,4 % | 3,60 · 0,71 · 2,57 · 3,08 · 78,4 % |
| `evaluate.mjs`: objetivo / exato / grupo principal | 0,7242 / 46,45 / 78,95 % | 0,7269 / 47,22 / 78,99 % |
| `diag-rain-bias.mjs`: todas as terras (erro log) | ×1,08 (0,576) | ×1,05 (0,563) |
| … terra fria −20…−10 °C / −10…0 °C | ×2,46 / ×1,44 | ×2,28 / ×1,33 |
| … Sibéria / interior do Canadá / do Alasca | ×1,81 / ×1,74 / ×1,57 | ×1,59 / ×1,63 / ×1,42 |
| … costas a barlavento (Noruega / Colúmbia Britânica) | ×0,62 / ×0,63 | ×0,59 / ×0,60 |
| `planets-dry.mjs`: parte árida dos planetas gerados | — | igual, a 1 ponto |

| Chuva ÷ observada, depois | Abr | Mai | Jun | Jul |
|---|---:|---:|---:|---:|
| 50–60° N | 1,48 | 1,61 | 1,36 | 1,07 |
| 60–70° N | 1,69 | 2,19 | 1,98 | 1,52 |
| 70–80° N | 3,38 | 4,84 | 5,87 | 4,06 |

**Rios da Terra** (`earth-rivers.mjs --climate sim`, 2,56M): a vazão dos rios frios (zona D) cai de ×0,92 para ×0,81 da
medida, e a nota do ano vai de −0,137 para −0,173 (pico a ±1 mês, zona D: 83 → 78 %). O modelo dos rios foi calibrado com
a chuva a mais; a evaporação que ele mesmo usa em terra fria (Budyko com PET de 300 + 55 mm/°C) precisa ser revista.

**No 0r063N** (`tools/climate/far-north.mjs` do 0r063N, 160K): a chuva das terras baixas cai cerca de 10 %, de 680 para
610 mm a 60–70° N e de 507 para 452 mm a 75–80° N (Terra observada: ≈ 480 e 280).

## Tentado e não adotado

- **Tempestades menores nas altas latitudes**, com o tamanho delas acompanhando o raio de deformação (L ∝ 1/f poleward
  de 45°, K × 0,5–0,6 a 65–75°): a Europa sobe de 36,9 para 41,6 % exato, mas a Ásia cai 1,6 e o `evaluate` cai para
  0,7208. Reduz a chuva de maio a 70–80° N de 115 para 90 mm.
- **K × 0,5 ou × 0,25 poleward de 60°**: reduz a primavera, mas seca o inverno, que já é seco demais (janeiro a 70–80° N:
  9 mm simulados contra 18 observados).
- **Amortecer o ciclo anual do gradiente de temperatura das tempestades** poleward de 45°: a chuva de julho sobe, porque o
  gradiente médio do ano a 50–60° N é forte.
- `RAIN_EDDY_LENGTH_KM` 700: a primavera melhora, mas o inverno seca (e em outra rodada custou 2 pontos de Köppen).

## O transporte das tempestades (segunda rodada)

Base: `1eeb1c3`. Terras ao norte de 60° N (sem a Groenlândia), Terra simulada (160K) ÷ observada: ×1,49 no ano; a 70–80° N,
×2,34, de 0,4 em janeiro a 5,6 em junho. Em julho, a 70–80° N, a chuva é de 152 mm (41 observados): a evaporação local dá
83 mm (a real fica perto de 45; a potencial do modelo, 104 mm, vem de um saldo de radiação de ~174 W/m² contra
~100–130 medidos), e o transporte, ~70 mm.

**Partes do transporte.** Só a mistura pelas tempestades (K = `RAIN_EDDY_DIFF` + σ·L²) pesa. O vento que carrega a coluna
(`RAIN_WIND_ROT` 0,6), a parte divergente (`RAIN_WIND_DIV_*`) e a mistura de fundo (`RAIN_EDDY_DIFF` 2 × 10⁵) mudam a
chuva do norte em 1 a 3 %. K chega a 9–10 × 10⁶ m²/s em março–maio a 60–70° N, como no inverno das médias latitudes.

**O gradiente de temperatura não é o culpado.** O gradiente zonal da Terra simulada a 60–70° N em maio é igual ao do ERA5
ou mais fraco (6,4–7,4 contra 8,2–9,5 K por 10°). O excesso vem de a mistura crescer com o gradiente da superfície, que no
Ártico é raso, no mesmo L das médias latitudes.

| Variante (Terra, 160K) | Norte de 60° / 70–80° N | Köppen exato / próximo | Europa / Ásia, exato | `evaluate` |
|---|---:|---:|---:|---:|
| base `1eeb1c3` | ×1,49 / ×2,34 | 48,7 / 86,5 % | 36,7 / 33,0 % | 0,7269 |
| L ∝ 1/f poleward de 45° (raio de deformação) | ×1,35 / ×1,86 | 48,4 / — | 41,3 / 30,9 % | 0,7220 |
| … poleward de 55° | ×1,48 / ×2,13 | 48,7 / — | 38,6 / 32,5 % | 0,7261 |
| sol através de mais ar (τ0 = 0,75 por massa de ar) | ×1,41 / ×2,19 | 48,5 / — | 35,5 / — | 0,7263 |
| L ∝ 1/f de 45° + τ0 = 0,7 | ×1,25 / ×1,70 | 48,3 / 86,4 % | 39,8 / 31,1 % | 0,7227 |
| `RAIN_EADY_SMOOTH_DEG` 12 / 16 | ×1,49 / ×2,29; ×1,49 / ×2,22 | 48,2; 48,0 % | 36,6; 36,9 % | — |
| ajuste com o termo de chuva fria (abaixo) | ×1,43 / ×2,22 | 48,8 / 86,6 % | 37,0 / 32,9 % | 0,7276 |
| só `RAIN_EDDY_DIFF` 4,25 × 10⁵ | ×1,47 / ×2,30 | 48,7 / 86,6 % | 36,1 / 33,1 % | 0,7271 |

- **Tempestades menores perto do polo** cortam a chuva da primavera, mas secam o inverno: a Sibéria central (65° N,
  100° E) passa de Dfc para Dwc (242 células, a maior perda da Ásia). O inverno das terras a 70–80° N já é seco demais.
- **Menos sol no chão nas altas latitudes** corta a evaporação do verão, mas também a da Europa no inverno e na
  primavera (a Europa perde 1,2 pontos sozinha).
- **O ajuste** (`coupled-check --tune` com `COLD_RAIN_WEIGHT=0.05`, os dois mecanismos acima como parâmetros, L,
  `RAIN_EDDY_DIFF` e as seis chaves de sempre) quase não sai do lugar: todo passo que cortava mais o transporte
  (`RAIN_EDDY_LENGTH_KM`, `RAIN_EDDY_DIFF` −) foi vetado por secar os planetas gerados, e o que passou (L ∝ 1/f com
  expoente 0,125, `RAIN_EDDY_DIFF` 4,25 × 10⁵, `TEMP_INVERSION_C` 8,75) muda a chuva do norte em 4 %. Não adotado: o ganho
  é pequeno, e `TEMP_INVERSION_C` menor aquece o inverno ártico, que já é quente demais (abaixo).

## A causa mais funda: o Ártico quente fora do verão

A temperatura das terras a 70–90° N (Terra simulada − ERA5, sem a Groenlândia) é boa no verão e quente demais no resto:

| °C | Jan | Mar | Abr | Mai | Jun | Jul | Set | Out | Nov | Dez |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 60–70° N | +0,6 | +3,5 | +1,4 | +0,2 | −1,3 | −1,1 | +2,7 | +5,0 | +3,6 | +1,8 |
| 70–80° N | +3,9 | +5,4 | +6,2 | +4,0 | +1,0 | −0,1 | +3,8 | +7,5 | +6,8 | +5,3 |

Nas estações (`diag-polar.mjs`), abril sai 8–13 °C quente demais em volta da baía de Hudson e no arquipélago canadense
(Cambridge Bay −7,4 contra −20,0; Baker Lake −3,9 contra −16,5; Iqaluit −3,6 contra −13,5), e outubro, 5–8 °C (Barrow
−0,3 contra −7,0). O mar Ártico fica coberto de gelo até julho (100 % a ≥ 75° N, contra 74 % observado) e perde tudo em
setembro (1 % contra 59 %; área de 0,1 contra 5,0 milhões de km² no OISST): o balanço de energia tira o albedo do gelo marinho do frio de
cada mês (`iceRamp`), então o mar aberto de agosto esquenta a 7–9 °C e só volta a congelar tarde.

O ar quente da primavera cabe mais água (+4–6 °C em março–maio a 70–80° N é +30–50 % de coluna saturada) e chove mais. O
outono quente enfraquece o gradiente em que as tempestades crescem (a 70° N em novembro, 1,8 K por 10° contra 6,6 no
ERA5), e o inverno fica seco: a 70–80° N, maio–julho ×4–6 e outubro–fevereiro ×0,4–0,8. Corrigir isso é no
estágio de temperatura (o gelo marinho que dura o verão e prende a superfície em 0 °C), não no transporte.

## O que falta

- O Ártico quente de outubro a abril e o gelo marinho de setembro, no balanço de energia (`temperature.js`).
- Depois, rever a mistura das tempestades nas altas latitudes (com o inverno menos seco, o L ∝ 1/f pode passar).
- A evaporação que os rios usam em terra fria (vazão da zona D ×0,81).

## Reprodução

```bash
node tuning/climate/diag-spring.mjs --n 160000
node tuning/climate/coupled-check.mjs --quick
node tuning/climate/evaluate.mjs
node tuning/climate/diag-rain-bias.mjs
node tuning/climate/planets-dry.mjs
node tuning/climate/coupled-check.mjs --quick --set RAIN_FROZEN_EVAP=1      # sem a correção
node tuning/water/earth-rivers.mjs --n 2560000 --climate sim
node tuning/climate/diag-polar.mjs --planets none                          # o Ártico: estações, gelo marinho
COLD_RAIN_WEIGHT=0.05 TUNE_KEYS=RAIN_EDDY_LENGTH_KM,RAIN_EDDY_DIFF,RAIN_COLUMN_LOCAL,RAIN_STABILITY,RAIN_STORM_RH,\
  RAIN_WIND_DIV_MOIST,RAIN_SOIL_MM,TEMP_INVERSION_C node tuning/climate/coupled-check.mjs --tune
```
