# Fork de World Orogen: o que mudou e onde continuar

Documento de passagem entre sessões. Resume as inovações e correções deste fork em relação ao World Orogen original,
como verificá-las e o que ficou em aberto. Os detalhes de cada mudança estão na mensagem do commit indicado.

## Estado

- **Repositório:** `oWilsonBarbosa/planet_heightmap_generation`, branch **`ccr-85cb1372-invlm5`**.
  - Parte do original no commit `47edc28` (2026-10-19).
  - Nada foi mesclado na `main` do fork e nenhum pull request foi aberto.
- **Repositório irmão:** `oWilsonBarbosa/0r063N`, mesmo branch.
  - Contém o conjunto de dados do planeta `06cy8w6z6a89kow6psje93` (semente 10673275, 2.560.001 regiões), gerado por
    este fork no commit `4186f55`.
  - O `HANDOFF.md` de lá descreve os dados, as ferramentas e o mapa de rios publicado.
- **Para retomar numa nova sessão:**
  - `git fetch origin ccr-85cb1372-invlm5 && git checkout -B <branch da sessão> origin/ccr-85cb1372-invlm5`.
  - Depois, `npm install --no-save netcdfjs pngjs delaunator` (só para as ferramentas de `tuning/`).

## O que muda em cada modo

| Mudança | Generate (site) | Import (site) | Evolution (site) | Exportação (0r063N) |
|---|---|---|---|---|
| Correções de chuva (`64b4e16`, `fb173ae`) | sim | sim | sim (o clima é compartilhado) | sim |
| Teto do suprimento de chuva do ar (`e97dc88`) | não (desligado) | não | não | sim (`EARTH_RELIEF_CLIMATE`) |
| Alturas como as da Terra (`59f4740`) | não | não | não | sim |
| Rios e lagos do Generate (`js/water-new.js`) | não (sem tela) | não | não | sim |
| Regras novas da hidrologia (`FINISH`) | — | — | **desligadas** | ligadas (`WATER`) |

O Evolution deste fork difere do original só pelo clima. As regras de hidrologia novas ficam desligadas em `FINISH`
(`v2/js/finish/finish-config.js`) e são ligadas em `WATER` (`js/water-new.js`). O teste `tuning/evolution/` confirma
que elas não mexem no Evolution.

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

### Ferramentas de verificação

- `tuning/water/earth-rivers.mjs`:
  - rios da Terra real contra 130 estações;
  - fração de terras com drenagem fechada contra a da Terra;
  - quais das 15 bacias fechadas conhecidas fecham.
  - Opções: `--n 2560000 --list`, `--set chave=valor`, `--tune`.
- `tuning/climate/diag-rain-bias.mjs`: vieses de chuva na Terra contra Beck e GPCP.
- `tuning/relief/`: hipsometria da Terra (ETOPO 2022).
- `tuning/evolution/regress.mjs`: prova que uma mudança no código compartilhado deixa o Evolution idêntico (116 saídas
  com hash).

## Números de referência atuais (Terra real, 2,56M regiões)

- **Clima:**
  - Köppen contra Beck: 46,8 % exato, 86,1 % próximo;
  - Kottek: 0,7188;
  - erro da chuva nas terras (log): 0,558.
- **Rios, clima observado** (122 estações):
  - nota anual 0,252;
  - escoamento dentro de ×2 em 84 % (×0,91);
  - correlação 0,90; pico ±1 mês 88 %.
- **Rios, clima simulado** (126 estações): nota anual −0,179; dentro de ×2 em 53 %.
- **Drenagem fechada:** 18,8 % das terras com o clima observado, 19,5 % com o simulado.

## Em aberto e próximos passos

1. **Ligar regras novas no Evolution?** Decisão pendente do dono.
   - Regras candidatas: `drainBelowFloor` (afeta 29 dos 99 lagos doces da semente 10673275 a 250K),
     `seaRemnantAnySize`, `closedBasins` e `riverSpeedKmDay`.
   - Cada uma é uma linha em `FINISH`.
   - Medir com `tuning/evolution/regress.mjs` e olhar o mundo do Evolution.
2. **Publicar o fork no navegador.**
   - É um site estático e já roda igual ao original: testado localmente, Evolution e Generate sem erros.
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
