# Fork de World Orogen: o que mudou e onde continuar

> Registro histórico da linha `ccr-85cb1372-invlm5`. Para o estado atual da integração com o main, consulte [docs/FORK_STATUS.md](../docs/FORK_STATUS.md). Os resultados abaixo descrevem suas versões originais e não são novas medições da candidata integrada.

Documento de passagem entre sessões. Resume as inovações e correções deste fork em relação ao World Orogen original,
como verificá-las e o que ficou em aberto. Os detalhes de cada mudança estão na mensagem do commit indicado.

## Estado

- **Repositório:** `oWilsonBarbosa/planet_heightmap_generation`, branch **`ccr-85cb1372-invlm5`**.
  - Parte do original no commit `47edc28` (2026-10-19).
  - Nada foi mesclado na `main` do fork e nenhum pull request foi aberto.
- **Repositório irmão:** `oWilsonBarbosa/0r063N`, mesmo branch.
  - Contém o conjunto de dados do planeta `06cy8w6z6a89kow6psje93` (semente 10673275, 2.560.001 regiões), gerado por
    este fork no commit `86b28ec` (2026-10-29): a integração com o `main` do original (`7026cc6`, com o clima polar
    do PR #74 dele), a viagem dos rios pela rede final a 45 km/dia, as saídas das bacias fechadas, as correções do
    ensaio de drenagem, mantos de gelo só em terra e, só nessa exportação, começados só em terra alta (o extremo norte
    em tundra). Os conjuntos anteriores ficam no histórico de lá.
  - O `HANDOFF.md` de lá descreve os dados, as ferramentas e o mapa de rios publicado.
- **Para retomar numa nova sessão:**
  - `git fetch origin ccr-85cb1372-invlm5 && git checkout -B <branch da sessão> origin/ccr-85cb1372-invlm5`.
  - Depois, `npm install --no-save netcdfjs pngjs delaunator` (só para as ferramentas de `tuning/`).

## O que muda em cada modo

| Mudança | Generate (site) | Import (site) | Evolution (site) | Exportação (0r063N) |
|---|---|---|---|---|
| Correções de chuva (`64b4e16`, `fb173ae`) | sim | sim | sim (o clima é compartilhado) | sim |
| Neve no chão na primavera (item 15) | sim | sim | sim (o clima é compartilhado) | sim |
| Teto do suprimento de chuva do ar (`e97dc88`) | não (desligado) | não | não | sim (`EARTH_RELIEF_CLIMATE`) |
| Alturas como as da Terra (`59f4740`) | não | não | não | sim |
| Rios e lagos do Generate (`js/water-new.js`) | não (sem tela) | não | não | sim |
| Gargantas e ano dos rios calibrado (`FINISH`, item 14) | — | — | **sim** (desde 2026-10-25) | sim |
| Mares interiores de qualquer tamanho, bacias fechadas (`WATER`) | — | — | **não** | sim |

O Evolution deste fork difere do original pelo clima e, desde 2026-10-25, pelos rios: a correção das gargantas e o
ano dos rios calibrado estão em `FINISH` (`v2/js/finish/finish-config.js`), que o Evolution e o Generate usam. Os
mares interiores de qualquer tamanho e as bacias fechadas ficam desligados em `FINISH` e são ligados só em `WATER`
(`js/water-new.js`). O teste `tuning/evolution/` mostra o que cada mudança faz no Evolution.

## Inovações e correções

### Clima (`v2/js/climate/`, todos os modos)

1. **`64b4e16`: chuva orográfica limitada; calotas de gelo não drenam a umidade em volta.**
   - **Problema:** maciços altos e frios chegavam a dezenas de metros de chuva por ano (72.913 mm/ano no planeta).
   - **Correção:**
     - sobre calota de gelo, a coluna de ar segura a água como o ar livre acima da inversão (`RAIN_COLUMN_LAPSE_MAX`
       6,5 K/km);
     - uma célula recebe no máximo 3× a sua chuva pelo relevo (`RAIN_OROG_MULT_MAX`);
     - o fator de altura de cada região fica limitado a ×/÷ 1,5 (`RAIN_CELL_FACTOR_MAX`).
   - **Resultado na Terra:**
     - Köppen contra Beck: 46,6 → 46,8 % de acerto exato;
     - erro da chuva nas terras: 0,574 → 0,563;
     - terras a 3–4 km: chuva ×1,91 → ×1,38 da observada;
     - Groenlândia: ×3,0 → ×1,82.
2. **`fb173ae`: o degelo sobre solo congelado escorre em boa parte.**
   - **Mudança:** `RAIN_MELT_SOAK` 0,5 (faixa 0,2–1). Antes, toda a neve derretida infiltrava, evaporava e voltava a
     chover.
   - **Também no commit:**
     - `RAIN_EADY_SMOOTH_DEG` virou parâmetro (8°, sem mudança de valor);
     - diagnóstico novo `tuning/climate/diag-rain-bias.mjs` (vieses de chuva por altura, temperatura, estação, costas
       a barlavento e sotavento e oceanos).
   - **Resultado:**
     - Köppen: 46,8/86,0 → 46,8/86,1 %;
     - Kottek: 0,7162 → 0,7188;
     - erro da chuva: 0,563 → 0,558;
     - área Dw: ×2,41 → ×2,31.
   - **Ganho pequeno.** O resto do viés e as tentativas rejeitadas estão em "Em aberto".
3. **`e97dc88`: teto do suprimento de água do ar** (`RAIN_SUPPLY_START_MM`, `RAIN_SUPPLY_MAX_MM`).
   - Desligado por padrão: o terreno do Evolution responde a qualquer mudança de chuva.
   - `js/earth-relief.js` `EARTH_RELIEF_CLIMATE` liga o teto para planetas com alturas da Terra.
15. **2026-10-25: neve no chão na primavera** (`temperature.js`; `TEMP_SNOW_MELT_MM` 90, `TEMP_SNOW_COVER_MM` 60,
    `TEMP_SNOW_ALBEDO` 0,45).
    - **Problema** (diagnóstico novo `tuning/climate/diag-spring.mjs`):
      - as terras frias (Köppen D e E de Beck) ficavam 4–7 °C quentes demais de fevereiro a maio;
      - a cobertura de neve saía só da temperatura do mês (0 a −10 °C);
      - o albedo da neve sazonal (0,325) era menor que o de fundo nas latitudes altas (0,41 a 65° N);
      - a neve sumia um mês ou mais antes em 42 % das terras entre 60 e 70° N, e a cheia dos rios frios vinha cedo.
    - **Correção:** na passada final da temperatura (já com a chuva), um balanço de neve no chão.
      - O que cai abaixo de 0 °C se acumula e derrete a 90 mm por °C e por mês.
      - O derretimento tira do ar o calor latente de fusão, que a neve devolve ao se formar.
      - O chão fica branco conforme a neve acumulada (1 − e^(−água/60 mm)), com albedo 0,45. A cobertura pela
        temperatura (0,325) segue nas passadas sem chuva.
    - **Resultado na Terra:**
      - Köppen contra Beck 46,8/86,1 → 47,1/86,1 %; continentes iguais 43,7 → 44,3 %;
      - Kottek 0,7188 → 0,7196;
      - erro da temperatura das terras 3,75 → 3,72 °C;
      - 60–70° N, março a maio: +6,7/+5,7/+3,3 → +5,6/+4,2/+1,7 °C; neve que some cedo 42 → 32 %;
      - 50–60° N: +3,2/+2,6/+2,7 → +1,6/+0,2/+0,4 °C;
      - rios com o clima simulado (2,56M): nota anual −0,179 → −0,163; o pico dos rios frios adiantado 0,27 → 0,10 mês;
      - nenhum planeta gerado ficou mais seco.
    - **No 0r063N** (`orogen_regions_4e7c1b0`): as terras 0,2 °C mais frias no ano (0,06–0,45 °C em nove décimos
      delas); Köppen igual em 96,7 % das terras; a floresta subártica (Dfc) de 4,6 para 5,3 %.
    - **Custo:**
      - uns 100 ms num clima de ~6,5 s (160K);
      - a Ásia perde 0,6 ponto de acerto exato: os subtrópicos, já frios demais, esfriam 0,3–0,8 °C pelo norte mais frio
        e pela neve de primavera nas montanhas;
      - a cheia dos rios frios continua achatada (20 % com estação de cheia, contra 51 %).
    - **Testado e rejeitado:**
      - só a neve mais clara, pela cobertura da temperatura (0,45–0,55): piora a Ásia (Cw → Dw no norte da China, de
        inverno seco);
      - albedo 0,48–0,55 com a neve acumulada: verões frios demais a 60–70° N;
      - só o calor latente: quase nenhum efeito na primavera.
16. **`869f9b0`, `46c7ae2` (2026-10-29): o gelo de verão de um mar polar fechado** (`temperature.js`;
    `TEMP_SEA_ICE_PIN` 20 W/m²/K, `TEMP_SEA_ICE_PACK_ALBEDO` 0,6; `docs/ARCTIC_SEA_ICE_20261029.md`).
    - **Problema:** o gelo marinho do balanço de energia saía só do frio de cada mês; o Ártico escurecia acima de 0 °C,
      esquentava a 7 °C em setembro e perdia todo o gelo (2 % a ≥ 80° N, contra 83 %), e o outono ficava 4–7 °C quente.
    - **Correção:** onde o mar polar é cercado de terra (`enclosedPolarSea`), o gelo que dura o verão segura o ar perto de
      0 °C (o calor do derretimento volta quando o mar congela; a média do ano não muda) e continua claro.
    - **Resultado na Terra:** gelo de setembro a ≥ 80° N 0,79 (OISST 0,83); outubro–dezembro a 70–80° N 2–3 °C menos
      quentes; Köppen 48,7/86,5 → 49,3/86,6 %; Kottek 0,7269 → 0,7298; temperatura das terras 3,60 → 3,53 °C; planetas
      gerados +0,12 ponto de aridez.
    - **Custo:** ≈ 0,2 s num clima de 4,7 s; a Europa perde 2,5 pontos exatos (verões secos demais na Escandinávia e na
      Irlanda); os rios com o clima simulado, nota −0,173 → −0,211 (o México e o Sahel mais secos), o pico dos rios
      frios no mês certo 78 → 88 %.

### Relevo

4. **`59f4740` e `ac299ae`: alturas como as da Terra** (`js/earth-relief.js` `earthLikeHeights`).
   - **Problema:** a curva do site (`elevToHeightKm`) deixa metade das terras abaixo de 28 m e o mar com 2,3 km.
   - **Correção:** cada região mantém sua posição na ordem do planeta e recebe a altura que a Terra tem na mesma
     posição (hipsometria do ETOPO 2022: `tuning/relief/`).
   - **Resultado:** terras com mediana de 442 m, mar com 3,7 km.
   - Só na exportação. As páginas não usam.

### Rios e lagos do Generate (`js/water-new.js`, a hidrologia do Evolution rodando num planeta V1)

5. **`bf30e2e`, `7fbe294`, `f0dd9cf`: o adaptador `runNewWater`.**
   - Roda `v2/js/finish/finish-hydro.js` num planeta do Generate e devolve rios (polilinhas), lagos, vazões, áreas
     de drenagem e a rede (`recv`).
   - A água fica onde o site desenha.
   - Um mar interior que os rios enchem transborda até o mar; um que não enchem termina os rios num lago salgado.
6. **`e33c478`:**
   - evaporação potencial mês a mês (rios frios estavam ~20 % cheios demais);
   - lagos fechados salobros em clima úmido;
   - leitos de lago preenchidos por sedimento (`seaFillKm`: profundidade d → 1 km × tanh(d / 1 km)).
7. **`4cdac70`, `27b3658`: o ano dos rios calibrado contra vazões medidas.**
   - **Teste novo:** `tuning/water/earth-rivers.mjs`, com 130 estações de Dai & Trenberth na Terra real.
   - **Parâmetros:** `baseflowShare` 0,7, `baseflowMonths` 3, `lakeRegulationDry` 0.
   - **Resultado com o clima observado:** correlação mensal 0,82 → 0,86; pico a ±1 mês do medido 76 → 83 %.
8. **`a16f3ad`: distritos de lagos da última era glacial.**
   - O `lastIceAge` do Evolution passa a moldar o terreno antes dos rios: vales em U, depressões escavadas, morenas.
   - No planeta, os lagos em terra foram de 15 para cerca de 130.
9. **`0a4c6da`, `86c0164`: tempo de viagem da água.**
   - Cada mês chega a cada ponto do rio com atraso, a 40 km/dia (`riverSpeedKmDay`).
   - O atraso se espalha como uma cascata de Nash com a média e a variância das distâncias percorridas.
   - **Resultado:** grandes bacias adiantadas 0,79 → 0,07 mês; correlação 0,86 → 0,89; pico certo 83 → 87 %.
10. **`c665a83`: sem lago ao longo de garganta** (`drainBelowFloor`).
    - Uma bacia que uma garganta vinda de montante drena abaixo do fundo não vira lago.
    - Havia um "lago" de 54.600 km² sobre um cânion.
11. **`b5a8f04`: nível de equilíbrio dos lagos fechados** (`balanceLevel`).
    - Um lago sem saída encolhe até a entrada de água igualar a evaporação.
    - A água continua desenhada como no site; o nível de equilíbrio vai à parte.
12. **`9a6c9ab`: mar interior é lago de qualquer tamanho** (`seaRemnantAnySize`).
    - **Problema:** o mínimo de lago (300 km², 2 células, 15 m) fazia rios terminarem em poças. Eram 83 de 189 lagos
      "fechados"; um deles recebia 37.000 m³/s.
    - O mesmo defeito na Terra deixava o Ob e o Paraná terminando no estuário.
13. **`4186f55`: bacias fechadas em terra** (`closedBasins`, `closedBasinPluvial` 2).
    - Uma bacia que os rios não enchem, nem com o dobro da água, termina os rios num lago salgado no equilíbrio ou
      numa salina.
    - **Na Terra real** (clima observado, 2,56M):
      - drenagem fechada 2,9 → 18,8 % (Terra ≈ 18–20 %; 17,5 % a 640K);
      - fecham Tarim, Balkhash, Eyre (como salina), Grande Bacia, Grande Lago Salgado, Sistão, Mar Morto e Urmia;
      - a nota anual dos rios fica igual (0,252) e melhora com o clima simulado (−0,231 → −0,179).
    - **Calibração do fator:** 1 fecha 23,9 %, inclusive o Níger e o Narmada, que de fato chegam ao mar.

### Evolution

14. **2026-10-25: o Evolution adota a correção das gargantas e o ano dos rios calibrado** (escolha do dono).
    - `FINISH` passa a ter `drainBelowFloor` (item 10) e o ano dos rios dos itens 7 e 9: `baseflowShare` 0,7,
      `baseflowMonths` 3, `lakeRegulationDry` 0, `riverSpeedKmDay` 40.
    - `WATER` fica só com `seaRemnantAnySize` e `closedBasins`, e sai idêntico: o Generate e o 0r063N não mudam.
    - **No mundo da semente 10673275:**
      - lagos doces 121 → 100 a 250K, 1.319 → 1.302 a 2,5M e 1.125 → 1.114 a 10M (os lagos falsos são sobretudo das
        malhas grossas);
      - rios com estação de cheia 47 → 30 % a 2,5M e 46 → 31 % a 10M; permanentes 45 → 68 % e 45 → 66 %.
    - **Custo** (sem navegador, 4 núcleos): a 2,5M (padrão da página), 92 contra 91 s e a mesma memória; a 10M, 316
      contra 341 s e 3,95 contra 3,93 GB no pico.
    - Com as cinco constantes nos valores antigos (`--set`), o Evolution volta a ser idêntico ao original (116 de 116).
    - **Ficaram de fora** as bacias fechadas (contrariam a regra do autor de que todo rio termina no mar) e os mares
      interiores de qualquer tamanho (sem efeito no Evolution).

### Ferramentas de verificação

- `tuning/water/earth-rivers.mjs`:
  - rios da Terra real contra 130 estações;
  - fração de terras com drenagem fechada contra a da Terra;
  - quais das 15 bacias fechadas conhecidas fecham;
  - o tamanho do pico e a parcela de rios com estação de cheia, simulada e medida, por zona climática.
  - Opções: `--n 2560000 --list`, `--set chave=valor`, `--tune` (com `--climate sim`, contra o clima simulado).
- `tuning/climate/diag-rain-bias.mjs`: vieses de chuva na Terra contra Beck e GPCP.
- `tuning/relief/`: hipsometria da Terra (ETOPO 2022).
- `tuning/evolution/regress.mjs`: prova que uma mudança no código compartilhado deixa o Evolution idêntico (116 saídas
  com hash), ou mostra o que muda; `--set chave=valor` liga uma constante de `FINISH` e cada rodada imprime lagos e
  regimes.

## Números de referência atuais (Terra real, 2,56M regiões)

- **Clima** (`46c7ae2`, Terra a 160K):
  - Köppen contra Beck: 49,3 % exato, 86,6 % próximo (continentes iguais 45,1 / 85,8 %);
  - Kottek: 0,7298;
  - erro da temperatura das terras 3,53 °C; da chuva (log) 0,71 por continente (`coupled-check`);
  - gelo marinho em setembro a ≥ 80° N 0,79 (OISST 0,83); chuva das terras ao norte de 55° N ×1,36 a de Beck.
- **Rios, clima observado** (122 estações):
  - nota anual 0,252;
  - escoamento dentro de ×2 em 84 % (×0,91);
  - correlação 0,90; pico ±1 mês 88 %.
- **Rios, clima simulado** (116 estações, `46c7ae2`): nota anual −0,211; dentro de ×2 em 55 %; correlação 0,67.
- **Estação de cheia** (pico ≥ 2,5× a média), simulada contra medida:
  - clima observado: 36 contra 39 % das estações; nos climas frios (zona D), 24 contra 51 %;
  - clima simulado: 34 contra 37 %; frios 20 contra 51 %, temperados 42 contra 8 %, secos 50 contra 20 %.
- **Drenagem fechada:** 18,8 % das terras com o clima observado, 18,9 % com o simulado.

## Em aberto e próximos passos

1. **Regras novas no Evolution: decidido em 2026-10-25** (item 14).
   - Ligadas: gargantas e ano dos rios. Só no Generate: bacias fechadas e mares interiores de qualquer tamanho.
   - O que cada regra fazia, medido no mundo da semente 10673275 a 640K, uma de cada vez, antes da escolha:
     - `drainBelowFloor`: 386 → 355 lagos doces, área de lagos 1,02 → 0,86 % das terras; somem os "lagos" enfileirados
       ao longo de gargantas; 284 regiões rebaixadas (média 42 m); Köppen igual.
     - `seaRemnantAnySize`: nenhum efeito (o Evolution já trata restos de mar abaixo de 5.000 km² como terra).
     - `closedBasins`: 17 lagos salgados (77 mil km²) e 159 salinas (128 mil km²); 1.102 regiões ficam até 1,4 km mais
       altas (bordas de bacia que deixam de ser cortadas); contraria a regra do autor original.
     - Ano dos rios do Generate (`baseflowShare` 0,7, `baseflowMonths` 3, `riverSpeedKmDay` 40, `lakeRegulationDry` 0):
       regime muda em 32 % dos pontos de rio (permanentes 38 → 64 %, com cheia 54 → 34 %). Na Terra com o clima
       simulado (640K), nota −0,549 → −0,144, mas faltam cheias nos rios frios (ver item 8).
   - Para medir outra regra: `node tuning/evolution/regress.mjs <saída.json> --set closedBasins=true` (qualquer
     constante de `FINISH`), `--compare` contra uma rodada sem ela (`tuning/evolution/README.md`).
2. **Publicar o fork no navegador.** O dono decidiu não publicar por enquanto (2026-10-25).
   - É um site estático e já roda igual ao original: testado localmente, Evolution e Generate sem erros. Para usar no
     computador: `npx serve` dentro da pasta do fork.
   - Para o GitHub Pages:
     - remover o `CNAME` (aponta para orogen.studio);
     - trocar os links do topo, que partem da raiz (`href="/evolution"` em `index.html`, `import.html`,
       `evolution.html`, `studio.html`, `404.html`), por links relativos.
   - Cloudflare Pages e Netlify servem na raiz: lá só o `CNAME` precisa sair.
3. **Rios no navegador.** Rios e lagos do Generate, alturas da Terra e era glacial existem só na exportação. Mostrá-los
   no site exige uma tela nova no Generate.
4. **Vieses de chuva restantes** (medidos com `diag-rain-bias.mjs`):
   - **Rotas de tempestade no mar:** recebem 0,4–0,85 da chuva real. A mistura das tempestades (K até 9e6 m²/s) leva
     a água para o norte: Ártico ×1,4, terras a 60–80° N ×1,4–1,9.
   - **Costas a barlavento** (Noruega, Escócia, Colúmbia Britânica): ×0,45–0,66. O oeste de inverno da circulação é
     fraco: alta dos Açores a 1008 hPa contra 1023 observados em janeiro.
   - **Verão dos interiores frios:** ×2,8.
   - **Tentativas rejeitadas:**
     - `RAIN_EDDY_LENGTH_KM` 700: Köppen −2;
     - `RAIN_COLUMN_LOCAL` 0,5 ou convecção só acima de 10–20 °C: Köppen −1,4, ou planetas secos além do limite;
     - temperatura ar-mar: subtrópicos ×8,9;
     - elevação por tempestades: sem efeito.
   - **Caminho sugerido:** refazer a circulação (altas subtropicais e ventos de oeste). Afeta todos os modos.
5. **Calotas de gelo (EF) no planeta:** 4,5 % das terras, contra ≈ 1,5 % na Terra. É efeito das alturas da Terra
   aplicadas às cordilheiras do planeta em 40–65°.
6. **Teste das bacias fechadas na Terra.** O mapa grosseiro (pixels de 20 km, 8 bits) fecha bacias que os rios
   atravessam por gargantas menores que uma célula: o Colorado (EUA) e partes do Indo.
7. **Pull request para o original:** não feito. Os commits estão separados por tema e podem ser escolhidos um a um.
8. **Cheias dos rios frios.** Estação de cheia em 20–24 % dos rios frios da Terra, contra 51 % medidos.
   - A cheia de degelo vem no mês certo com o clima observado (98 % a ±1 mês), mas achatada.
   - Com o clima simulado ela vinha cedo (80 %, adiantada 0,27 mês). Com a neve no chão (item 15) adianta só 0,10
     mês (83 %), mas segue achatada.
   - **Testado sem sucesso** (`tuning/water/README.md`): fluxo de base 0,6–0,65; degelo infiltrando menos que a chuva
     (0,7–0,9); velocidade do degelo 60–400 mm/°C por mês. O degelo a 0,85 acerta as cheias com o clima observado
     (49 %, nota 0,252 → 0,270), mas piora com o simulado, também depois do item 15 (−0,163 → −0,187).
   - **O que falta na primavera simulada:** a 60–80° N, março e abril seguem 4–6 °C quentes, e o inverno dos interiores
     também (Iacútia +11–13 °C, Quebec +9–11 °C): o inverno "sem núcleo" dos continentes frios não fica frio o
     bastante. A chuva de abril a junho nas terras frias também sai ×2–5 (`diag-spring.mjs`).

9. **Verões frios demais no extremo norte do 0r063N** (2026-10-29), com o clima polar do original (PR #74:
   `TEMP_POLAR_SUMMER_DAMP` 0,5, a circulação de revolvimento entregando o calor antes do mar polar).
   - De 70 a 75° N o mês mais quente cai de 5,1 para 0,9 °C em média; de 75 a 80° N, de −0,7 para −6,9 °C. Calotas
     (EF) em 46 % e 82 % dessas terras, inclusive em terras baixas (1,15 % das terras é EF abaixo de 500 m).
   - Na Terra, as terras baixas nessas latitudes têm julho de +1 a +8 °C e tundra fora das calotas; lá o PR #74
     melhorou o Ártico (Köppen exato de 66,5° N para cima 22 → 40 %). O extremo norte do planeta é um continente
     largo, não ilhas e costas.
   - O gelo marinho ficou mais plausível: o mar polar já não abre no verão.
   - **Investigado em 29/10** (`docs/ARCTIC_20261029.md`):
     - um defeito: células só de mar formavam manto de gelo, com domo de 1,5 km e ar 12 °C frio demais sobre o mar
       congelado e na costa ao lado. Corrigido em `temperature.js`, com `CIRC_HADLEY_SCALE` 1,44 → 1,47;
     - o resto é histerese: o modelo começa com gelo acima de ≈ 62° e mantém os mantos que se sustentam; ao lado de um
       mar congelado, a terra baixa mantém. Começar com gelo só em terra alta resolveria o 0r063N, mas tira o gelo de
       continentes polares como a Antártida (planeta de teste evo-101). **Decidido:** só na exportação com alturas da
       Terra (`TEMP_ICE_START_KM` 0,6 em `EARTH_RELIEF_CLIMATE`); um critério geral fica em aberto.
10. **O extremo norte fora do verão** (2026-10-29, item 16): a primavera a 70–80° N segue 5–7 °C quente (o estágio de
    chuva toma a água da coluna pelo ar junto ao chão; uma inversão de primavera sobre a neve consertaria a temperatura,
    mas sem isso custa 1 ponto de Köppen), e os mares nórdicos congelam no inverno (Tromsø −21 °C em janeiro, real −6).

## Regras de trabalho

Do `CLAUDE.md` e desta sessão:

- **Depois de mudar o clima**, nenhum destes pode piorar:
  - `node tuning/climate/evaluate.mjs`;
  - `node tuning/climate/coupled-check.mjs --quick`;
  - `node tuning/climate/planets-dry.mjs` (fração árida dos planetas gerados).
- **Depois de mudar `v2/js/finish/`:** `tuning/evolution/regress.mjs` (Evolution idêntico, a menos que a mudança seja
  intencional).
- **Depois de mudar os rios:** `node tuning/water/earth-rivers.mjs --n 2560000`.
- **Invariância de escala:**
  - limiares em unidades físicas;
  - contagens de células escaladas pela resolução;
  - conferir a 640K e a 2,56M.
- **Parâmetros novos de clima** vão em `v2/js/climate/config.js`, com faixa em `PARAM_PRIORS`.
- **Commits:** `git -c user.name=Claude -c user.email=wilson.luxfert@gmail.com`, sem identificador de modelo, com os
  trailers `Co-Authored-By` e `Claude-Session`. Push só no branch da sessão.
- **No ambiente de nuvem:**
  - o `fetch` do Node precisa de `NODE_USE_ENV_PROXY=1`;
  - nunca usar `pkill` com um padrão que case com a própria linha de comando.
