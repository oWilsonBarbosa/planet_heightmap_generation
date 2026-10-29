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

## O que falta

O resto do excesso, em maio–julho a 70–80° N (×4–6), é o transporte das tempestades e a evaporação do verão. Precisa de
uma taxa de crescimento das tempestades que não venha só do gradiente da superfície, sem tirar a chuva de inverno das
médias latitudes, e de rever a evaporação potencial nas altas latitudes (nuvens baixas do verão ártico).

## Reprodução

```bash
node tuning/climate/diag-spring.mjs --n 160000
node tuning/climate/coupled-check.mjs --quick
node tuning/climate/evaluate.mjs
node tuning/climate/diag-rain-bias.mjs
node tuning/climate/planets-dry.mjs
node tuning/climate/coupled-check.mjs --quick --set RAIN_FROZEN_EVAP=1      # sem a correção
node tuning/water/earth-rivers.mjs --n 2560000 --climate sim
```
