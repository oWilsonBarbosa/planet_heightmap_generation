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

## O que falta

- Maio a 70–80° N (+5,6 °C) e abril (+4,6): com o sol forte, o próprio mês sai quente demais para contar como neve. É
  o albedo da neve no balanço de energia: nas altas latitudes, a neve sazonal (0,45) quase não clareia o fundo (0,435
  a 75°). A neve da tundra mais clara já foi testada (relatório do gelo marinho) e esfriava o verão.
- Os mares nórdicos congelados no inverno, e com eles a Escandinávia fria demais.

## Reprodução

```bash
node tuning/climate/diag-sea-ice.mjs
node tuning/climate/diag-sea-ice.mjs --set TEMP_SNOW_SUN_CUT=0,RAIN_COLUMN_FREE_AIR=0     # sem a correção
node tuning/climate/coupled-check.mjs
node tuning/climate/evaluate.mjs
node tuning/climate/planets-dry.mjs
node tuning/climate/evolution-check.mjs
node tuning/water/earth-rivers.mjs --n 2560000 --climate sim
```
