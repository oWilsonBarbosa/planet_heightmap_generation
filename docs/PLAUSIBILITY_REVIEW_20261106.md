# O que impede a plausibilidade dos mundos — revisão de 06/11/2026

Base: `7e8189c`. O objetivo do projeto (CLAUDE.md): o World Orogen é arte conceitual de planetas, não um simulador.
O mundo precisa passar no teste do olhar, e a ordem de desempate é:

1. apelo artístico;
2. facilidade e rapidez;
3. plausibilidade científica.

As últimas rodadas (inverno e primavera do Ártico, gelo marinho, nordeste da Ásia) mediram a Terra. Esta revisão olha
os mundos que o site faz, no Generate e no Evolution. A Terra observada serve de imagem do que é crível, não de gabarito
célula a célula.

## Como foi medido

- **Mapas de Köppen:** `render-koppen-maps.mjs --tag review-1106 --tests`. Cobre a Terra simulada e a observada, 11
  mundos (7 do Generate, 4 do Evolution) e 3 continentes sintéticos.
- **`glance-check.mjs` (novo):** o que se vê em cada mapa.
  - Quanto da terra é árido.
  - Se o equador é floresta.
  - Se o deserto subtropical dá lugar a uma costa leste úmida.
  - Se as costas oeste a 30–45° são mediterrâneas.
  - Costa é a terra a até 300 km do mar daquele lado, com pelo menos 800 km de terra do outro lado, ao longo do paralelo.
- **`diag-rain-seasons.mjs` (novo):**
  - a chuva de inverno e de verão na Terra, onde as estações decidem a classe;
  - a terra equatorial por distância do mar;
  - quantas costas têm montanhas por perto.
- **Duas provas à parte:** os mundos do Generate refeitos com alturas da Terra (`js/earth-relief.js`), e a hipsometria
  de cada mundo.

## O que se vê

| % das terras sem gelo | Terra observada | Terra simulada | Generate, sementes 2, 6 e 10 | Evolution, 4 mundos |
|---|---:|---:|---:|---:|
| árido (B) | 31 | 29 | 36–41 | 35–46 |
| floresta tropical (Af, Am) a menos de 10° do equador | 51 | 47 | 17–28 | 22–42 |
| árido a menos de 10° do equador | 8 | 3 | 8–23 | 7–19 |
| subtrópicos (15–35°), árido na costa oeste | 77 | 69 | 79–85 | 77–87 |
| … na costa leste | 32 | 30 | 37–61 | 41–53 |
| … no interior | 63 | 65 | 80–86 | 67–96 |
| latitudes médias (35–60°), árido na costa leste | 6 | 5 | 16–24 | 9–23 |
| … costa oeste marítima (Cfb, Cfc, Csb, Csc) | 47 | 44 | 38–55 | 48–60 |
| mediterrâneo (Cs) nas costas oeste a 30–45° | 43 | 27 | 10–24 | 1–9 |
| classes polares (ET, EF) abaixo de 60°, % de todas as terras | 3 | 3 | 4–8 | 5–6 |

Nos extremos, o continente único do Generate (semente 4) tem 65 % das terras áridas, e 70 % da terra equatorial é
árida. O supercontinente sintético tem 76 % árido, e 85 % do equador é árido.

Em ordem do que mais se vê:

1. **Mundos bege.** Há desertos e estepes demais, e o equador quase não tem floresta.
   - Na vista de satélite:
     - savana (Aw) é verde-amarelada;
     - estepe quente (BSh) é dourada;
     - deserto (BWh) é cor de areia;
     - a floresta (Af) é esmeralda.
   - O planeta sai mais bege que a Terra.
   - Um continente grande ganha um deserto no equador, coisa que a Terra não tem.
2. **Climas em faixas horizontais.** Na Terra, a mesma latitude tem deserto a oeste e floresta úmida a leste:
   - Saara e sul da China;
   - Atacama e sul do Brasil;
   - oeste e leste da Austrália.

   Nos mundos, o deserto subtropical atravessa o continente de costa a costa, e a costa leste das latitudes médias sai
   estepe.
3. **Sem mediterrâneo.** As costas oeste a 30–45° quase nunca são Cs, um dos climas mais reconhecíveis da Terra.
4. **Cordilheiras em volta de tudo.**

   | Costas com terra ≥ 2 km a menos de ≈ 300 km | |
   |---|---:|
   | Terra | 8 % |
   | Generate | 35–41 % |
   | Evolution | 44–57 % |

   Com ≥ 1 km: Terra 36 %; Generate 50–60 %; Evolution 78–84 %.
   - No Generate, uma região é mar se a sua placa é oceânica (`js/elevation.js`). Toda costa é então uma borda de
     placa, e onde as placas convergem nasce uma cordilheira costeira.
   - Na Terra, a maioria das costas fica no meio de uma placa: são margens passivas, como as do Atlântico, com
     planícies costeiras.
   - Isso se vê no relevo, com uma muralha na borda de cada continente, e no clima, com sombra de chuva no interior.
5. **O heightmap do Generate.** Os heightmaps exportados usam a curva de alturas do site (`elevToHeightKm`):

   | | Generate | Terra (ETOPO 2022) |
   |---|---:|---:|
   | mediana das terras | 70–76 m | 442 m |
   | três quartos das terras abaixo de | 0,40–0,50 km | 1,08 km |
   | 1 % mais alto acima de | 4,9–6,0 km | 4,7 km |
   | mediana do mar | 2,3–2,45 km | 4,1 km |

   - O resultado são planícies rasas, picos abruptos e mar raso, o que aparece quando o heightmap é aberto num programa 3D.
   - O Evolution já tem alturas como as da Terra: mediana de 0,57–0,61 km, mar com 4,9–5,0 km.

## Por quê

### 1. A chuva segue o sol demais

Na Terra simulada, a chuva de verão está certa, mas a de inverno e a da estação seca dos trópicos ficam muito abaixo da
observada (mm/mês, simulado / observado):

| | inverno | verão | mês mais seco |
|---|---:|---:|---:|
| sudeste dos EUA | 27 / 117 | 113 / 130 | 17 / 86 |
| sul do Brasil e Uruguai | 21 / 108 | 121 / 155 | 16 / 98 |
| sudeste da China | 16 / 66 | 286 / 227 | 11 / 52 |
| leste da Austrália | 17 / 41 | 103 / 95 | 13 / 38 |
| Chile central | 50 / 129 | 40 / 12 | 17 / 9 |
| sudoeste da Austrália | 42 / 88 | 39 / 16 | 21 / 15 |
| Cabo | 45 / 56 | 72 / 17 | 31 / 17 |
| Bornéu e Sumatra (inverno = dez–fev, verão = jun–ago) | 152 / 301 | 54 / 189 | 27 / 177 |
| bacia do Congo | 79 / 124 | 104 / 109 | 61 / 93 |

- **Na Terra a classe se salva por pouco.** O sudeste dos EUA continua Cfa porque o mês mais seco (17 mm) ainda passa
  de um décimo do mais chuvoso.
- **Nos mundos o mesmo viés vira a classe:**
  - Cf → Cw ou estepe nas costas leste;
  - Af → Aw no equador;
  - Cs → Cf ou estepe nas costas oeste, com o verão chuvoso demais e o inverno seco demais.
- **O continente sintético das latitudes médias mostra o mesmo, sem montanhas e sem Terra.** Uma América do Norte plana:
  - tem Cs em 65 % da costa oeste a 30–45°;
  - mas o lado leste sai Cw (16 % das terras) e Dw (13 %) onde se esperaria Cfa e Dfa, com inverno úmido.

**O que falta no modelo:**

- **As tempestades de inverno onde a Terra as tem.**
  - A mistura das tempestades é a mesma ao longo de cada paralelo (K = σ_Eady·L² por linha de latitude), e a frente
    polar dá só 10 mm/mês (`RAIN_FRONT_MM`).
  - Na Terra, os ciclones de inverno se concentram nas costas leste e no oeste dos oceanos, sobre as correntes quentes,
    onde o contraste terra–mar é maior. É deles a chuva de inverno da Flórida, do sul da China e de Buenos Aires.
  - Nas costas oeste a 30–45°, o oeste de inverno é fraco: a alta dos Açores em janeiro tem 1008 hPa, contra 1023
    observados (`plans/FORK_HANDOFF.md`, item 4).
- **A memória da umidade do solo nos trópicos.**
  - A evaporação das terras usa a chuva do próprio mês.
  - A floresta real continua evaporando, na estação seca, a água guardada no solo, e essa água volta a chover.

### 2. Os continentes murados

O equador por distância do mar mostra a sombra de chuva das cordilheiras costeiras (chuva em mm/ano; meses com ≥ 60 mm):

| terra a menos de 12° do equador | 0–300 km | 300–800 km | 800–1.500 km | 1.500–2.500 km |
|---|---:|---:|---:|---:|
| Terra (altura a 300–800 km: 0,64 km) | 2.384 · 9,1 | 1.304 · 7,9 | 1.555 · 8,8 | 1.597 · 8,4 |
| continente tropical sintético, plano | 2.453 · 9,4 | 1.336 · 8,2 | 1.521 · 8,1 | 1.625 · 7,9 |
| Generate, sementes 2, 6 e 10 (altura a 300–800 km: 0,85–1,24 km) | 2.538–2.732 · 6,9–9,5 | 888–1.163 · 4,7–7,0 | 1.069–1.264 · 5,9–7,0 | 1.079–1.178 · 6,3–6,4 |
| Evolution, sementes 12345 e 202 (altura a 300–800 km: 0,91–1,17 km) | 2.264–2.418 · 7,9–8,5 | 854–1.118 · 5,4–7,2 | 1.098–1.472 · 7,1–8,4 | 1.024–1.721 · 6,4–9,2 |

- O continente plano guarda a chuva da Terra no interior. Os continentes murados perdem de um quinto a um terço dela, e
  de um a três meses úmidos.
- `tuning/climate/README.md` já atribuía a aridez dos mundos às muralhas (antes, 38–43 % contra 31 %). Este é o primeiro
  número que separa o efeito delas do efeito das estações.
- **Um supercontinente é outro caso.** O interior a mais de 2.500 km do mar recebe 187–412 mm por ano, quase sem mês
  úmido. O interior da Pangeia era árido, com megamonções nas bordas (Kutzbach e Gallimore 1989). Ainda assim, um
  deserto que cobre o equador não passa no teste do olhar.

### 3. O ajuste olha a Terra

- A Terra simulada acerta quase todas as linhas da tabela, e os mundos não.
- A geografia da Terra esconde parte dos vieses: os trópicos são picotados (a Indonésia), e quase nenhuma costa é
  murada.
- A única salvaguarda dos mundos no ajuste (`coupled-check --tune`, `planets-dry.mjs`) é a parte árida: no máximo um
  ponto a mais por planeta. Nada empurra os mundos para os padrões da Terra.
- **Não é a curva de alturas.** Com as alturas da Terra, que mantêm a ordem das regiões e portanto as muralhas:

  | Generate, sementes 2 / 6 / 10 | curva do site | alturas da Terra |
  |---|---:|---:|
  | árido | 36 / 40 / 41 % | 33 / 33 / 40 % |
  | floresta no equador | 28 / 21 / 17 % | 29 / 22 / 15 % |

## O que pouco importa para o teste do olhar

Estes problemas são reais, mas não se veem num mapa:

- a primavera do Ártico (abril e maio a 70–80° N, +4,6 / +5,6 °C);
- o verão frio do nordeste da Ásia (−1,3 a −2,7 °C);
- o gelo dos mares nórdicos no inverno;
- os décimos de hPa da pressão;
- a nota dos rios do Generate, que só existem na exportação.

As últimas seis rodadas renderam, somadas, 0,8 ponto de Köppen na Terra (48,7 → 49,5 %), e três delas nenhum. O ganho por
rodada está acabando.

Já está bom e deve ser protegido:

- o mapa da Terra simulada (49,5 % exato, 86,6 % próximo);
- os cinturões polares e boreais;
- as costas oeste marítimas dos mundos (38–60 %, contra 47 %);
- o clima em ≈ 5 s a 160 mil regiões.

## O que fazer, por ganho visual e custo

1. **Pôr o teste do olhar no ajuste.** Custo baixo; não troca nenhuma das sete forças.
   - O que medir: `glance-check.mjs` nos mundos gerados, com a Terra observada como alvo, nas linhas que mais
     enganam: floresta no equador, costa leste árida e Cs nas costas oeste.
   - Para que serve: sem isso, cada conserto do clima é julgado só pela Terra, onde os vieses se escondem.
   - Custo: ~1,5 min por rodada.
2. **As tempestades de inverno onde a Terra as tem.** Custo médio; risco médio.
   - **A mudança:**
     - o σ_Eady das tempestades local em longitude, a partir do gradiente de temperatura do lugar, que no inverno é
       máximo nas costas leste e sobre as correntes quentes;
     - altas subtropicais de inverno mais fortes, o caminho que o item 4 do handoff já sugere.
   - **O que se espera:** Cf no lugar de Cw nas costas leste, inverno chuvoso no mediterrâneo, costas a barlavento
     mais úmidas.
   - **Tradeoffs:**
     - mais profundidade de clima;
     - nenhuma mudança de interface;
     - tempo desprezível (um campo 2D a mais).
   - **Risco:** as tentativas anteriores de mexer no transporte das tempestades secaram os planetas ou o inverno. Por
     isso o item 1 vem antes.
3. **A memória da umidade do solo nos trópicos.** Custo pequeno a médio.
   - A mudança: a evaporação das terras tira água do balde do solo (já existe), não só da chuva do mês.
   - O que se espera: Aw → Am/Af perto do equador; estação seca mais curta em Bornéu, no Congo e na Amazônia.
   - Risco: interiores frios mais úmidos; a reciclagem já é forte demais na primavera do nordeste da Ásia.
4. **Alturas da Terra no heightmap exportado.** Custo pequeno.
   - A mudança: uma opção no painel Export que aplica `earthLikeHeights`, o mesmo usado na exportação do 0r063N.
   - Tempo: uma ordenação, menos de 1 s a 2,5 milhões de regiões.
   - Tradeoffs:
     - a geração não muda;
     - um controle a mais, com 44 px no celular;
     - o README ganha a opção; o código do planeta não muda, porque não é um slider.
   - **Decisão do dono:** opção ou padrão.
5. **Margens passivas no Generate.** Custo alto, e mexe em terreno e placas.
   - A mudança: tirar a muralha das costas que não ficam onde placas convergem, ou deixar parte das costas no meio de
     uma placa continental.
   - O que se espera: o maior ganho isolado de plausibilidade no relevo e no clima do interior.
   - **Tradeoff:** toca a estética do terreno e a edição de placas, duas das sete forças. Precisa da aprovação do dono
     e de comparação visual antes e depois.
6. **Pausar o ajuste fino da Terra polar** (itens 10 e 16–17 do handoff) até que 1–3 andem.

Feitos 2 e 3, o supercontinente deve ser medido de novo. Se o equador ainda for deserto, decidir se um piso de chuva
equatorial vale a física.

## Reprodução

```bash
node tuning/climate/render-koppen-maps.mjs --tag review-1106 --tests
node tuning/climate/glance-check.mjs --tag review-1106
node tuning/climate/diag-rain-seasons.mjs --planets gen-2,gen-6,gen-10,gen-1c,evo-12345,evo-202,test-tropical,test-supercontinent
```
