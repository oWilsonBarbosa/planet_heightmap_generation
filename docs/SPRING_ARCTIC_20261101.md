# A primavera do extremo norte — 01/11/2026

Base: `473b6fb`. Segue o [relatório do gelo marinho](ARCTIC_SEA_ICE_20261029.md): depois da correção do gelo de verão,
março a maio nas terras a 70–80° N continuavam 5–7 °C quentes (Cambridge Bay −6 °C em abril, real −20). O clima é um só
para Generate, Import e Evolution.

## Pistas em outros branches e repositórios

- **O original** (`raguilar011095/planet_heightmap_generation`): nenhum commit de clima depois do PR #78 (#74, a
  atenuação dos verões polares). O plano (`plans/CLIMATE_REBUILD_PLAN.md`) registra duas tentativas descartadas na
  inversão de inverno: uma faixa de "sol fraco" mais larga (S₀/6 … S₀/3) levava a memória do inverno até os
  subtrópicos (sul da China 5,4 contra 9,8 °C), e uma inversão mais forte para Yakutsk esfriava demais as costas das
  altas latitudes. Daí a regra abaixo: só sobre neve, só além da linha das árvores, sem mexer na faixa do sol.
- **Os branches arquivados do fork** (tags `snapshot/2026-10-26/…`): o `ccr` e o `audit` são o histórico de agora; o
  `orogen-map-generation` é do clima antigo (um fator de chuva fria). Nada sobre a primavera.
- **`Undiscovered_Worlds_Classic`**: o gelo marinho sai da temperatura do ano, e a chuva de inverno a sotavento de um
  mar com gelo sazonal é multiplicada por 0,05 (o mar congelado não dá umidade) — uma ideia para o inverno, não usada.
- **`tectonics.js`**: albedo fixo de neve (0,9), sem estações. **`mundus`**: a exportação antiga do planeta, sem
  algoritmos.

A pista que decidiu estava no próprio código: a circulação já lê o ar acima da inversão de inverno
(`circulation.js`), mas o estágio de chuva tomava a água da coluna pelo ar junto ao chão, inversão incluída. Por isso a
inversão de primavera, que consertava a temperatura, custava 1 ponto de Köppen: a primavera mais fria secava a coluna e
o inverno do Canadá e da Sibéria virava "seco" (Dfc → Dwc).

## A correção

- **A inversão de inverno dura a primavera sobre a neve** (`temperature.js`, `TEMP_SNOW_SUN_CUT` 0,8): sobre neve em
  terra aberta — além da linha das árvores (o mês mais quente do balanço de energia de 16 a 10 °C), onde nenhuma floresta
  a escurece — e sobre o gelo marinho, a escuridão da inversão conta só o sol que a neve deixa entrar. A neve é a que o
  inverno acumulou no chão (rala e esburacada num planalto seco como o Tibete, reflete menos); não vale sobre mantos de
  gelo, cujo frio junto à superfície já está no seu gradiente (`TEMP_ICE_LAPSE`).
- **A coluna da chuva lê o ar acima da inversão** (`rain.js`, `RAIN_COLUMN_FREE_AIR` 0,35): a água da coluna está quase
  toda acima da camada fria junto ao chão; a saturação vai 35 % do caminho até a do ar livre. A parte nova da inversão (a
  da primavera, `temperature.inversionSpring`) nunca conta para a coluna.

| Na Terra (160K) | Antes (`473b6fb`) | Depois |
|---|---:|---:|
| terras a 60–70° N, simulado − ERA5, média quadrática dos meses | 2,05 °C | 0,95 °C |
| … a 70–80° N | 3,98 °C | 2,98 °C |
| … a 50–60° N | 1,92 °C | 1,84 °C |
| 70–80° N, fevereiro / março / abril / maio | +4,9 / +6,5 / +7,2 / +5,7 °C | +2,4 / +2,5 / +4,6 / +5,6 °C |
| abril em Cambridge Bay / Iqaluit / Utqiaġvik (ERA5 −20 / −14 / −15) | −6 / −2 / −10 °C | −10 / −7 / −14 °C |
| `coupled-check`: Köppen exato / próximo | 49,3 / 86,6 % | 49,5 / 86,6 % |
| … continentes iguais | 45,1 / 85,8 % | 45,6 / 85,9 % |
| … América do Norte / Europa / Ásia, exato | 45,6 / 34,2 / 35,0 % | 46,1 / 36,5 / 34,8 % |
| … salvaguardas: temperatura, chuva | 3,53 °C, 0,71 | 3,51 °C, 0,70 |
| … 640K / 2,5M | 50,1 / 49,8 % | 50,3 / 50,0 % (sem deriva) |
| `evaluate.mjs`: objetivo | 0,7298 | 0,7300 |
| chuva das terras ao norte de 55° N ÷ Beck | ×1,36 | ×1,32 |
| … novembro–janeiro a 60–70° N | ×1,5–1,8 | ×1,3–1,4 |
| planetas gerados: parte árida, média | — | −0,14 ponto (chuva −0,2 %) |
| rios com o clima simulado (2,56M): nota do ano | −0,211 | −0,211 |

Por região, março a maio contra o ERA5 (média quadrática; só a inversão, medida com a coluna a 0,5): Ásia ao norte de 60° de 6,0 para 4,3 °C, América do Norte de
8,5 para 6,6 °C, a costa da Groenlândia de 8,0 para 6,4 °C; o Tibete e as Rochosas 0,2–0,3 °C piores. A Escandinávia
fica pior (abril em Tromsø −9 °C, real 0): ela já era fria demais, pelos mares nórdicos congelados no inverno.

## Tentado e não adotado

- **A coluna da chuva toda no ar livre** (o ajuste levou a 0,76, perto da literatura): Köppen 49,6 %, Europa 38,3 %,
  mas o `evaluate` cai de 0,7298 para 0,7274 — as classes de inverno seco do Leste da Ásia (Dwa, Dwb, Cwb) perdem: a
  umidade que a Sibéria deixa de "chover" no inverno chega à Manchúria. Parte da inversão do modelo representa o frio
  profundo do anticiclone siberiano, não só a camada junto ao chão.
- **A inversão de primavera vista pela coluna da chuva**: Köppen −1 ponto (o caso que motivou a busca).
- **Sobre toda neve, com a linha das árvores ou não**: a 50–70° N, fevereiro a abril 2 °C frios demais (a floresta
  boreal escurece a neve e aquece o ar).
- **Sobre os mantos de gelo**: a calota da Groenlândia 5,7 °C fria demais na primavera (já estava certa).
- **A quantidade de inversão pela neve acumulada** (em vez do frio do mês): o inverno a 70–80° N fica 8–9 °C quente,
  porque o modelo cobre pouco chão no começo do inverno ártico, onde neva pouco.

## O albedo da neve na tundra (02/11, desligado por padrão)

Abril e maio ficavam quentes porque, nas altas latitudes, a neve sazonal do balanço de energia (0,45) quase não
clareia o fundo (0,435 a 75°): em maio, a 75° N, o modelo absorvia ~70 W/m² a mais que sobre a tundra nevada real
(albedo no topo da atmosfera ≈ 0,6). Novo parâmetro `TEMP_SNOW_ALBEDO_OPEN`: em terra aberta além da linha das
árvores, a neve seca (abaixo de −5 °C) reflete esse valor e escurece até o da floresta ao se aproximar de 0 °C, quando
molha e derrete — por isso, ao contrário da neve da tundra mais clara do relatório anterior, o verão não esfria.

| Na Terra (160K) | Desligado | 0,5 | 0,6 |
|---|---:|---:|---:|
| terras a 70–80° N: abril / maio / junho / julho, simulado − ERA5 | +4,6 / +5,6 / +2,3 / −0,6 °C | +4,1 / +5,0 / +2,0 / −0,8 | +3,0 / +3,9 / +1,2 / −1,1 |
| … média quadrática dos meses: 50–60 / 60–70 / 70–80° N | 1,84 / 0,95 / 2,98 °C | 1,75 / 0,77 / 2,75 | 1,59 / 0,63 / 2,30 |
| `coupled-check --quick`: Köppen exato, continentes iguais | 49,5 %, 45,6 % | 49,7 %, 45,8 % | 49,9 %, 46,0 % |
| … Europa / América do Norte / Ásia | 36,5 / 46,1 / 34,8 % | 36,9 / 46,5 / 35,0 % | 38,2 / 46,8 / 35,1 % |
| `evaluate.mjs` | 0,7300 | 0,7291 | 0,7276 |
| planetas gerados: parte árida, média | 44,12 % | — | 43,99 % |

**Por que o `evaluate` cai.** Quase só pela classe Dwa (inverno seco, verão quente: o nordeste da China e a Coreia;
65 células na amostra), F1 0,317 → 0,227 a 0,6: o Ártico mais claro esfria a região ~0,3 °C o ano todo, e o verão dela
cruza os 22 °C (Dwa → Dwb). Mas esse verão já era frio demais antes (nordeste da China −1,3 °C em junho e julho, Coreia
−2,7 °C em julho, com invernos +4–5 °C quentes): é a sazonalidade fraca dos continentes, um viés anterior. Diminuir
`TEMP_LOCAL_K` (as estações próprias da terra) para dar mais estação ao interior derruba o `evaluate` (0,7232 a 9,
0,7166 a 7). Pela regra do projeto (nenhuma das duas checagens piora), o parâmetro fica desligado; ligar 0,6 é uma
escolha: o Ártico mais certo, o nordeste da Ásia um pouco mais frio.

## O verão frio do nordeste da Ásia (02/11)

Para ligar a neve da tundra sem perder o `evaluate`, primeiro o verão do nordeste da Ásia, que a neve empurrava para o
lado de lá dos 22 °C. Diagnóstico (Terra, 160K; simulado − ERA5 e chuva contra Beck):

| | abr | mai | jun | jul | jan |
|---|---:|---:|---:|---:|---:|
| nordeste da China, chuva simulada / Beck (mm) | 91 / 24 | 141 / 54 | 164 / 93 | 160 / 155 | 16 / 5 |
| … temperatura | +0,5 | −0,8 | −1,3 | −1,3 | +4,9 |
| … sem as nuvens da chuva | +2,4 | +2,0 | +2,2 | +2,2 | +5,7 |
| vento de sul no nordeste da China, simulado / NCEP (m/s) | 1,9 / 0,3 | 2,7 / 0,8 | 3,2 / 1,3 | 2,9 / 1,6 | — |
| Coreia, chuva simulada / Beck | 83 / 76 | 99 / 94 | 108 / 135 | 118 / 320 | 27 / 22 |
| Pacífico Noroeste a 30–40° N, mar simulado / OISST (°C) | 16,2 / 16,1 | 17,4 / 17,9 | 19,1 / 20,4 | 20,9 / 23,6 | 18,1 / 16,7 |

- **A monção chega dois meses cedo.** Em abril a circulação já tem a baixa térmica de verão sobre o continente
  (−3 a −4 hPa da média da latitude) onde o NCEP ainda tem o anticiclone da Mongólia (+5 a +7), e a baixa do Tibete fica
  funda demais em maio–julho (−14 a −23 contra −1 a −8). Os ventos de sul trazem o mar Amarelo a partir de abril.
- **A chuva da primavera é reciclada.** Em maio, 111 dos 136 mm vêm da evaporação local: o inverno úmido demais enche o
  solo, o sol forte evapora, a água chove ali mesmo. As nuvens dessa chuva tiram ~3,5 °C do verão.
- **O mar ao lado oscila pouco.** O Pacífico Noroeste tem um ciclo anual de 6,5 °C contra 10,7 (a camada de mistura
  de 50 m o ano todo): a Coreia e o Japão ficam frios no verão e quentes no inverno.

Tentado, sem ganho que valesse (`evaluate`, base 0,7300):

| | nordeste da China, julho | `evaluate` |
|---|---:|---:|
| parâmetros de chuva (solo, estabilidade, mistura de fundo, convecção, vento, frente polar, degelo) | −1,2 a −1,6 °C (a chuva quase não muda) | — |
| baixas térmicas mais fracas sobre terra amena (`CIRC_HEAT_LOW_MILD` 0,75 / 0,55) | −1,3 °C | 0,7295 / 0,7282 |
| a mistura das tempestades mais fraca no ar estável (novo fator de face no resolvedor) | −1,3 °C (janeiro 16 → 10 mm) | 0,7186–0,7237 |
| camada de mistura do mar mais rasa (40 / 32 m) | −0,6 / +0,1 °C | 0,7231 / 0,7140 |
| estações próprias da terra mais fortes (`TEMP_LOCAL_K` 9 / 7) | — | 0,7232 / 0,7166 |
| nuvens da chuva menos claras (`TEMP_CLOUD_ALBEDO` 0,22 / 0,24; valor da literatura 0,15) | −0,6 °C a 0,2 | 0,7299 / 0,7295 |

A raiz está na circulação de primavera do Leste da Ásia (o anticiclone da Mongólia é em boa parte dinâmico, e a
circulação do modelo só tem as altas e baixas da temperatura) e no ciclo anual do mar; cada mudança global que a ataca
piora outras regiões. **Uma combinação empata:** a neve da tundra a 0,5, as nuvens a 0,24 e a coluna da chuva a 0,25 —
`evaluate` 0,730026 contra 0,730038, Köppen igual (49,5 / 86,6 %), abril–maio a 70–80° N +4,1 / +5,0 °C (de +4,6 / +5,6),
60–70° N erro mensal 0,95 → 0,76 °C, planetas −0,04 ponto. Não está aplicada: à decisão.

## A circulação de primavera do Leste da Ásia (02/11)

O erro maior está sobre o oceano: em abril, a 45° N, o NCEP tem a pressão caindo para leste do continente ao Pacífico
(0, −2, −4, −3, −4 hPa da média da latitude a 110, 120, 130, 140 e 150° E — a baixa das Aleutas ainda se estende até o
Japão); o modelo tem o contrário (−3, −1, +1, +2, +2), e o vento sobre o nordeste da China vira de sul. Em julho, +6 hPa
a 150° E contra −3; em janeiro a baixa das Aleutas fica em −3 a −5 contra −10. A circulação põe a faixa de baixas
subpolares igual em toda a latitude (a 65° N) e as altas e baixas da temperatura; as baixas das Aleutas e da Islândia,
o rastro das tempestades sobre os oceanos, não estão nela.

Tentado (uma baixa subpolar sobre os oceanos, pela parte de mar acima da média da latitude × a depressão da faixa):

| | vento de sul no nordeste da China, abr / mai (NCEP 0,3 / 0,8) | pressão contra NCEP | vento a ±45° | Köppen exato | `evaluate` |
|---|---:|---:|---:|---:|---:|
| sem (atual) | 1,9 / 2,7 m/s | 3,08 hPa | 78,5 % | 49,5 % | 0,7300 |
| na faixa subpolar (65° N), ±15° | 1,7 / 2,6 | — | — | — | — |
| na faixa das tempestades, ±20°, força 1 / 1,5 | 0,5 / 1,3 (força 1,5) | 3,41 / 3,78 | 76,5 / 75,3 % | 49,3 / 48,8 % | 0,7213 / 0,7169 |
| … só sobre o oceano, a média da latitude devolvida | 2,2 / 2,9 | 3,27 | 76,9 % | 49,3 % | 0,7268 |

Na faixa das tempestades, o nordeste da China fica quase certo (a chuva de maio 141 → 96 mm, Beck 54; junho −1,3 →
−0,2 °C, o inverno mais frio pela monção de inverno mais forte), mas a pressão sobe demais sobre os continentes — o
anticiclone siberiano de janeiro +27 contra +17 a 45° N, a baixa de verão mais fraca — e o mundo todo perde. A pista do
calor que o oceano entrega (as baixas rio abaixo das correntes quentes) não serve: no modelo o Kuroshio entrega só
14–16 W/m² (o real, centenas no inverno), e a baixa sairia no Atlântico subpolar, não no Pacífico. A baixa das Aleutas
é em boa parte uma onda estacionária (o Tibete e as Rochosas, o Kuroshio), que a circulação do modelo não tem; seria
preciso uma componente de ondas estacionárias, um projeto à parte.

## O que falta

- Maio a 70–80° N (+5,6 °C) e abril (+4,6): o albedo da neve da tundra (acima; `TEMP_SNOW_ALBEDO_OPEN` desligado
  pela queda do `evaluate`), à espera de uma decisão ou de se consertar antes o verão frio do nordeste da Ásia.
- Os mares nórdicos congelados no inverno, e com eles a Escandinávia fria demais.

## Reprodução

```bash
node tuning/climate/diag-sea-ice.mjs
node tuning/climate/diag-sea-ice.mjs --set TEMP_SNOW_SUN_CUT=0,RAIN_COLUMN_FREE_AIR=0     # sem a correção
node tuning/climate/diag-sea-ice.mjs --set TEMP_SNOW_ALBEDO_OPEN=0.6                       # a neve da tundra mais clara
node tuning/climate/coupled-check.mjs
node tuning/climate/evaluate.mjs
node tuning/climate/planets-dry.mjs
node tuning/climate/evolution-check.mjs
node tuning/water/earth-rivers.mjs --n 2560000 --climate sim
```
