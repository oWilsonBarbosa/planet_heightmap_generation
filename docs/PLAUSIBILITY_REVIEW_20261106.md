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

## Item 1 feito (09/11): o teste do olhar no ajuste

### O que mudou

- **`tuning/climate/lib/glance.mjs`:** o teste do olhar, medido nas classes de cada célula ou num PNG.
  - **O erro de aparência** é a distância média, em pontos, ao mapa observado da Terra medido do mesmo jeito, em cinco
    linhas:
    1. a parte árida;
    2. a floresta no equador;
    3. a costa leste subtropical árida;
    4. a costa leste das latitudes médias árida;
    5. o Cs nas costas oeste a 30–45°.
  - Cada linha pesa pela terra que cobre.
  - **O alvo da parte árida** é a aridez observada da Terra nas latitudes onde fica a terra do mundo: um mundo com mais
    terra subtropical deve ser mais árido.
- **`coupled-check.mjs`:**
  - imprime a linha de aparência da Terra em toda rodada (a Terra simulada tem erro de 4,4 pontos);
  - no `--tune`, recusa um passo que piore em mais de 0,5 ponto o erro médio dos mundos (Generate e Evolution) ou o da
    própria Terra;
  - `GLANCE_WEIGHT=…` põe o erro dos mundos no objetivo. Cada tentativa passa a rodar os mundos, com cerca de 10× o
    custo.
- **`planets-dry.mjs`:** mostra a aparência e o erro de cada mundo. No começo, o erro dos mundos vai de 12 a 34 pontos
  (média 18,5).
- **`probe-planets.mjs`:** mostra o efeito de cada parâmetro no erro de aparência da Terra e dos mundos.
- **`glance-check.mjs` e `render-koppen-maps.mjs`:** passam a usar a mesma biblioteca. Os PNGs saem idênticos byte a
  byte.

### O que os parâmetros atuais conseguem

**Sondagem dos 67 parâmetros de chuva e circulação, um por vez, a ±¼ da faixa.** Mundos: sementes 2, 6 e 10 e Evolution
202.

- Nenhum parâmetro tira mais de 4,1 dos 18,9 pontos.
- Os que mais tiram molham tudo, e deixam pior a aparência da própria Terra:

  | parâmetro | mundos | Terra | Köppen da Terra (continentes) |
  |---|---:|---:|---:|
  | `RAIN_SURFACE_RH` | −4,1 pt | +2,6 pt | −1,1 |
  | `RAIN_EVAP_COEFF` | −3,6 pt | +1,8 pt | −0,8 |
  | `CIRC_OCEAN_HIGH_HPA` | −2,9 pt | +1,1 pt | −0,4 |

- Só dois melhoram os dois lados:

  | parâmetro | mundos | Terra | Köppen da Terra (continentes) |
  |---|---:|---:|---:|
  | `RAIN_SOIL_MM` 87,5 → 150 (o valor da literatura) | −1,1 pt | −0,2 pt | −0,1 |
  | `CIRC_TURN_OCEAN_DEG` 12,5 → 10 | −1,3 pt | −1,2 pt | −0,4 |

**Ajuste 1, com `GLANCE_WEIGHT=1` e sem a salvaguarda da aparência da Terra** (seis parâmetros, 11 mundos):

| | antes | depois |
|---|---:|---:|
| erro de aparência dos mundos | 18,4 pt | 13,1 pt |
| Köppen da Terra, exato / próximo | 49,5 / 86,6 % | 49,9 / 86,9 % |
| erro de aparência da Terra | 4,4 pt | 5,4 pt |
| floresta no equador da Terra (real 52 %) | 47 % | 58 % |
| chuva do extremo norte | ×1,32 | ×1,40 |
| vento dentro de 45° | 78,5 % | 76,9 % |
| Cw, área ÷ real | ×1,69 | ×1,72 |
| Dw, área ÷ real | ×1,41 | ×1,52 |

- O ajuste levou as sombras de chuva ao mínimo da faixa (`RAIN_LEE_PER_KM` 1 → 0,3) e a chuva de frente a 22,5 mm/mês.
- Ele "conserta" as muralhas do terreno apagando a sombra de chuva, justamente onde a Terra já é úmida demais (a
  Patagônia a sotavento chove ×2,15).
- Daí veio a salvaguarda da aparência da Terra.

**Ajuste 2, com a aparência da Terra protegida, sem as sombras de chuva e com a chuva do extremo norte no objetivo
(`COLD_RAIN_WEIGHT=1`):**

| | antes | depois |
|---|---:|---:|
| erro de aparência dos mundos | 18,4 pt | 15,4 pt |
| erro de aparência da Terra | 4,4 pt | 4,9 pt |
| Köppen da Terra, exato / próximo | 49,5 / 86,6 % | 49,1 / 86,3 % |
| … continentes | 45,6 / 85,9 % | 45,4 / 85,7 % |
| pressão | 3,08 hPa | 3,15 hPa |
| Cw, área ÷ real | ×1,69 | ×1,80 |

- Valores encontrados:
  - `RAIN_SOIL_MM` 150;
  - `CIRC_MONSOON_HPA_PER_K` 1,38;
  - `RAIN_FRONT_MM` 19,4;
  - `RAIN_STORM_RH` 0,326.
- Os mundos ganham 3 pontos, mas a Terra perde. O CLAUDE.md não deixa o `coupled-check` regredir, então nada foi
  adotado.
- Com `GLANCE_WEIGHT=1`, 1 ponto de aparência dos mundos vale tanto quanto meio ponto do Köppen próximo da Terra. Um
  peso menor faz o ajuste trocar menos.

### Conclusão

O teste do olhar agora está no ajuste e impede que um conserto do clima piore os mundos sem ninguém ver. Os parâmetros
de hoje, porém, só ganham alguns pontos e quase sempre molhando tudo. Os padrões que enganam o olho precisam dos itens
2 e 3:

- o inverno seco das costas leste;
- a falta de mediterrâneo;
- a estação seca do equador.

Nenhum valor padrão mudou.

## Item 2, primeira parte (09/11): as frentes de inverno

Ver [`WINTER_FRONTS_20261109.md`](WINTER_FRONTS_20261109.md).

| | antes | depois |
|---|---:|---:|
| Köppen da Terra, exato | 49,5 % | 50,2 % |
| Kottek | 0,7300 | 0,7311 |
| erro de aparência dos mundos | 18,5 pt | 17,3 pt |
| erro de aparência da Terra | 4,4 pt | 5,1 pt |

Falta o mediterrâneo dos mundos: a baixa térmica do verão chega às costas oeste. É a segunda parte (a circulação).

## Reprodução

```bash
node tuning/climate/render-koppen-maps.mjs --tag review-1106 --tests
node tuning/climate/glance-check.mjs --tag review-1106
node tuning/climate/diag-rain-seasons.mjs --planets gen-2,gen-6,gen-10,gen-1c,evo-12345,evo-202,test-tropical,test-supercontinent
```

## Item 2, segunda parte, e item 3 (09–12/11): não adotados

### A circulação e o mediterrâneo

Ver [`WINTER_FRONTS_20261109.md`](WINTER_FRONTS_20261109.md), "Segunda parte".

- **O que falta nos mundos:** a alta oceânica de verão ao lado das costas oeste a 30–45°. A latitude é quase toda mar,
  então o mar fica na média do paralelo, e a baixa térmica do continente chega ao litoral.
- **O que se tentou:** a subsidência monção-deserto (`CIRC_DESCENT_HPA_PER_K`).
  - Sobe o Köppen da Terra (50,2 → 50,8 %) e melhora a aparência dos mundos (17,3 → 16,8 pontos).
  - Mas molha os verões dos mediterrâneos da Terra (acerto de Cs 23,8 → 17,9 %).
- **Ficou desligada.** O mediterrâneo pede que o estágio de chuva não deixe a camada marinha chover sob a inversão de
  subsidência.

### Item 3: a umidade do solo nos trópicos

`RAIN_ROOT_MAX_MM` (desligado): onde o ano é quente (18–22 °C), a zona das raízes guarda também o déficit da estação
seca, até esse tanto a mais (Gao et al. 2014).

| `RAIN_ROOT_MAX_MM` | Köppen da Terra | Kottek | aparência: Terra / mundos |
|---|---:|---:|---:|
| 0 (padrão) | 50,2 % | 0,7311 | 5,1 / 17,3 pt |
| 100 | 49,7 % | 0,7301 | 4,1 / 16,1 pt |
| 300 | 49,4 % | 0,7263 | 5,4 / 15,2 pt |
| 300, só onde chove o bastante para floresta (1.300–2.000 mm/ano; Hirota et al. 2011) | 49,7 % | 0,7272 | 4,3 / 16,8 pt |

Com 300 mm, nos mundos:

- a floresta no equador sobe: semente 2, 28 → 42 %; semente 10, 17 → 26 %; Evolution 12345, 41 → 54 %;
- a terra equatorial do interior ganha 100–160 mm por ano e meio mês úmido.

Na Terra:

- **Ganha:** a estação seca do Congo, com o mês mais seco 61 → 94 mm (real 93); a Amazônia oeste, 113 → 138 mm (real
  157); a Indonésia.
- **Perde mais do que ganha:** a água evaporada na estação seca chove no mesmo lugar e no mesmo mês, e as monções e
  savanas perdem a estação seca.
  - Aw → Am, real Aw: −448 células, quase todas no cerrado brasileiro.
  - Am → Af, real Am: −242.
  - BWh → BSh: −179.
  - O acerto de Am cai de 30 para 22–25 %.
- Na Terra real, essa água sai com o vento, e a subsidência da estação seca não a deixa chover.

**Não adotado**, porque as duas checagens do CLAUDE.md regridem em todas as doses.

### O que os itens 2 e 3 ensinaram

As duas mudanças que fariam os mundos parecerem a Terra (a subsidência, as raízes) esbarram no mesmo limite do estágio
de chuva: a água que chega ou que evapora chove ali mesmo, no mesmo mês, sem respeitar a inversão de subsidência.

- Nas costas oeste no verão, isso apaga o mediterrâneo.
- Nos trópicos na estação seca, apaga a savana.

O próximo passo de clima seria uma inversão de subsidência que tampa a chuva, onde o ar desce (sob as altas e a oeste
das baixas térmicas), qualquer que seja a umidade junto ao chão. Então ligar a subsidência e as raízes juntas.

O resto da distância dos mundos à Terra está no terreno: as muralhas costeiras (item 5 da lista).

