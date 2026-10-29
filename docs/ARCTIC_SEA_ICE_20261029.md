# O gelo marinho do Ártico e o Ártico quente fora do verão — 29/10/2026

Base: `9b5e4c6`. Segue o [relatório da chuva da primavera](SPRING_RAIN_20261029.md), que achou a causa mais funda do
excesso de chuva no extremo norte na temperatura: as terras a 70–90° N 4–8 °C quentes demais de outubro a abril, e o
mar Ártico sem gelo em setembro. O clima é um só para Generate, Import e Evolution.

## O problema

Na Terra simulada (160K), o mar a ≥ 80° N esquentava a 7 °C ao nível do mar em setembro e perdia todo o gelo (2 % de
cobertura contra 83 % no OISST; área de 0,1 contra 5,0 milhões de km² no hemisfério). O balanço de energia tomava o gelo
marinho só do frio de cada mês: assim que o mês passava de 0 °C, o gelo escurecia, o mar absorvia o sol do verão e o
outono ficava quente. No balanço do mar a ≥ 75° N, o modelo absorvia 92 W/m² de sol (ERBE/CERES: 70–80), com albedo
0,49 nas horas de sol (≈ 0,55–0,6 real); o transporte de calor que chega (102 W/m²) estava certo.

O próprio código já tinha a espessura do gelo (graus-dia, que dura o verão onde o inverno é longo), mas só para o
desenho e para o estágio de chuva: usá-la no balanço de energia fazia "o gelo do verão esfriar os mares em volta e
avançar a borda do inverno".

## A correção: o gelo de verão de um mar polar fechado

Em `temperature.js`, onde o mar polar é cercado de terra (`enclosedPolarSea`: o polo no mar, ≥ 80° com mais de 30–70 %
de mar, e um anel de terra, 60–80° com mais de 25–50 % de terra), o gelo que o orçamento de espessura mantém no verão:

- **segura o ar perto de 0 °C** (`TEMP_SEA_ICE_PIN`, 20 W/m²/K): o derretimento gasta o calor do verão —
  −PIN × cobertura × graus acima de 0 — e o mar devolve esse calor quando volta a congelar, na proporção do crescimento
  do gelo. O ano de cada célula fecha: muda a estação, não a média;
- **continua claro** (`TEMP_SEA_ICE_PACK_ALBEDO`, 0,6 do brilho do gelo de inverno; as poças de degelo o escurecem).

Em volta de um continente polar, ou num oceano polar aberto, o gelo deriva para águas mais quentes e derrete todo verão
(o da Antártida é de inverno), e fica como antes. Dois parâmetros novos em `config.js`, com faixas em `PARAM_PRIORS`.

| Na Terra (160K) | Antes | Depois |
|---|---:|---:|
| gelo em setembro a ≥ 80° N, simulado / OISST | 0,02 / 0,83 | 0,79 / 0,83 |
| … a 70–80° N | 0,00 / 0,21 | 0,39 / 0,21 |
| terras a 70–80° N, simulado − ERA5: out / nov / dez / jan | +5,5 / +6,4 / +4,6 / +3,7 °C | +2,5 / +3,4 / +2,6 / +3,0 °C |
| terras a 50–60° N, média quadrática dos meses | 2,48 °C | 1,92 °C |
| `coupled-check`: Köppen exato / próximo | 48,7 / 86,5 % | 49,3 / 86,6 % |
| … continentes iguais | 45,0 / 85,9 % | 45,1 / 85,8 % |
| … Ásia / América do Norte / África, exato | 33,0 / 44,7 / 59,5 % | 35,0 / 45,6 / 60,0 % |
| … Europa, exato / próximo | 36,7 / 89,3 % | 34,2 / 88,5 % |
| … salvaguardas: temperatura, chuva, mar, pressão, vento | 3,60 · 0,71 · 2,57 · 3,08 · 78,4 % | 3,53 · 0,71 · 2,55 · 3,08 · 78,5 % |
| … 640K / 2,5M | — | 50,1 / 49,8 % (sem deriva) |
| `evaluate.mjs`: objetivo / exato | 0,7269 / 47,22 % | 0,7298 / 48,19 % |
| chuva das terras ao norte de 55° N ÷ Beck | ×1,33 | ×1,36 |
| planetas gerados: parte árida, média / pior planeta | — | +0,12 / +0,52 ponto (chuva −0,2 %) |
| tempo do clima a 160K (mediana de 5, alternando) | 4,70 s | 4,89 s |
| rios com o clima simulado (2,56M): nota do ano | −0,173 | −0,211 |
| … rios frios (zona D): vazão ÷ medida, pico a ±1 mês | ×0,81, 78 % | ×0,84, 88 % |

Nos rios, a nota cai pela borda norte dos trópicos, mais seca (Grijalva ×1,05 → ×0,88, Pánuco ×0,51 → ×0,45 da vazão
medida; Gâmbia −8 %): o norte mais frio empurra um pouco a chuva tropical para o sul. Os rios árticos ganham 7–16 %
(Kem, Kuskokwim, Amguema). Na Europa, a Escandinávia e a Irlanda ficam com verões secos demais (Dfc → Dsc, Cfb → Csb). Os ganhos estão nas
florestas boreais da Rússia, da Sibéria e do Canadá: Dfb → Dfc, com verões mais frescos. O teste do Evolution que falha
("o interior do supercontinente é mais seco que a costa", árido 37 contra 39 %) já falhava antes, com os mesmos números.

O orçamento de espessura dentro do balanço de energia usa a temperatura do próprio mar de cada célula, sem a média
regional (`TEMP_SEA_ICE_SPREAD_KM`, que o gelo desenhado mantém); com ela o gelo de setembro a ≥ 80° N dava 0,83 e a
suavização custava ~0,4 s por clima. Esse orçamento agora suaviza os harmônicos do ano em vez de cada mês: o mesmo
resultado, mais rápido.

## Tentado e não adotado

- **O gelo de verão claro em qualquer mar polar** (a ideia que o código já descartava): o gelo cresce na borda do
  inverno (66–75° N, 0,97–1,0 de cobertura contra 0,6) e a Europa perde 1,5–3,5 pontos.
- **O calor latente pelo próprio orçamento de graus-dia**: ~10 W/m² por °C, fraco demais para segurar o ar; o gelo
  ainda some em agosto.
- **A primeira forma de segurar o ar a 0 °C** também prendia a média do ano: com quatro rodadas, ela ficava perto do
  primeiro palpite, mais frio. Parecia ótimo (Köppen 50,2 %, setembro 0,80), mas era um artefato: os planetas
  esfriavam (o planeta-oceano 2 °C) e secavam até 7 pontos. Com 8 rodadas, o resultado mudava. Agora só as estações
  passam pela forma semi-implícita.
- **Sem a regra do mar fechado**, mesmo convergido: o gelo de verão em volta da Antártida cresce (fevereiro a 70–80° S:
  0,99 contra 0,38) e os planetas secam 1,2 ponto em média (o planeta-oceano 2,3).
- **A camada de mistura do mar mais funda nas altas latitudes** (150 m): o mar oscila menos, mas congela o ano todo.
- **O calor do oceano isolado sob o gelo** e entregue à água aberta mais próxima: quase nada muda — o oceano entrega só
  ~11–13 W/m² ao Ártico central, e no verão esse calor volta à própria água aberta.
- **A neve da tundra mais clara** (0,6, além da linha das árvores): conserta a primavera, mas a neve dura até junho,
  os verões esfriam 4–6 °C, a chuva do norte sobe para ×1,9 (gradiente mais forte, mais tempestades) e o Köppen cai 1
  ponto.
- **A inversão térmica da primavera sobre a neve da tundra** (a neve reflete o sol, o chão continua frio): a 70–80° N
  março passa de +6,7 para +0,8 °C, mas o Köppen cai 1 ponto (América do Norte −4) — o estágio de chuva toma a
  temperatura junto ao chão para a água da coluna, e a primavera mais fria seca o inverno do Canadá e da Sibéria
  (Dfc → Dwc). A coluna deveria ler o ar acima da inversão.

## O que falta

- A primavera do extremo norte: a 70–80° N, março a maio ainda 5–7 °C quentes. Primeiro fazer o estágio de chuva ler a
  coluna acima da inversão; depois, a inversão da primavera sobre a neve.
- Os mares nórdicos no inverno: o mar da Noruega com 0,7 de gelo em março (real 0), Barents 1,0 (real 0,3). O mar
  simulado oscila demais (Barents de −15 °C em março a 10 °C em setembro; real +1 e +5), e Tromsø fica a −21 °C em
  janeiro (real −6).
- A chuva do extremo norte continua ×1,5 a observada.

## Reprodução

```bash
node tuning/climate/diag-sea-ice.mjs
node tuning/climate/diag-sea-ice.mjs --set TEMP_SEA_ICE_PIN=0,TEMP_SEA_ICE_PACK_ALBEDO=0    # sem a correção
node tuning/climate/coupled-check.mjs
node tuning/climate/evaluate.mjs
node tuning/climate/planets-dry.mjs
node tuning/climate/evolution-check.mjs
node tuning/water/earth-rivers.mjs --n 2560000 --climate sim
```
