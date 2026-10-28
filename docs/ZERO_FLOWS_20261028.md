# Rios com vazão zero e saídas de bacias fechadas — 28/10/2026

Base: `c4ea48d` (`integration/climate-hydrology`). Trata o item aberto do [FORK_STATUS](FORK_STATUS.md): "investigar
os casos de vazão zero, o RMS infinito e as divergências de saída das bacias". Os números agregados estão em
[validation/zero-flows-20261028.json](validation/zero-flows-20261028.json).

## O que eram os zeros

Os zeros da revisão (2 com clima observado e 7 com clima simulado, em 2.560.001 células) aparecem só com as regras do
**Generate** (`WATER`: bacias fechadas em terra). Com as regras do **Evolution** (`FINISH`, agora
`earth-rivers.mjs --evolution`) não há nenhum posto com vazão zero, em 640 mil nem em 2,56 milhões de células, nos dois
climas.

As novas opções `--trace` e `--from` do ensaio seguem o rio de cada posto da nascente até onde a água termina. Elas
mostraram que todos os zeros eram a **saída de uma bacia fechada**. A hidrologia dava à célula da borda, por onde a
bacia transbordaria, a área de drenagem da bacia inteira e vazão zero, e deixava essa célula drenando por cima da
borda. O pareamento escolhia essa célula porque a área conferia. Exemplos com clima simulado, em 640 mil células:

| Posto | Célula escolhida | O que drenava para ela pela rede |
|---|---|---|
| Jacuí (Passo do Raso) | 72.525 km², 0 m³/s | 1 região; a bacia termina numa salina a 34 km |
| Victoria (Coolibah) | 60.570 km², 0 m³/s | 1 região; a bacia alta termina num lago salgado a 71 km |
| Eufrates (Hindiya) | 200.838 km², 0 m³/s | 5 regiões; termina numa salina a 117 km |

O mesmo defeito atinge o `drainageArea_km2` e o `flowsTo` exportados e a textura de fluxo do Evolution (`log10` da
área). Uma nova verificação de rede no ensaio conta as regiões secas cuja área passa do dobro do que drena para elas
pela rede. Ela encontrou **283** regiões em 640 mil células e **735–771** em 2,56 milhões, todas com as regras do
Generate.

## Correção

Em `v2/js/finish/finish-hydro.js`, a saída de uma bacia cujos rios terminam nela (vazão de saída zero) passa a ser
terreno seco da bacia, como as demais células secas:
- mantém a própria água e a própria área;
- drena para dentro da bacia, até a água;
- na passada mensal e no tempo de viagem, segue esse caminho em vez de terminar.

As bacias que transbordam não mudam. Uma bacia terminal sem nenhuma célula de água não teria para onde drenar a
saída; essa saída fica sem redirecionar, só sem a área da bacia. O caso não ocorreu em nenhum ensaio: todas as 417 a
1.019 bacias terminais da Terra, em 640 mil e 2,56 milhões de células, e as 5 do mundo 754534770 têm água.

Novo teste em `tests/river-transport.test.mjs`, que falha no código anterior: a saída da bacia fechada drena para
dentro dela com a própria área, e a área de cada região seca é igual à soma do que drena para ela. Os 10 testes de
transporte e os 5 de métricas passam; `check-save.mjs` completo passa.

## Resultados no ensaio da Terra

| Regras | Células | Clima | Pareados | Zeros | Dentro de ×2 | RMS | Pontuação sazonal | Rede incoerente |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| Generate | 640 mil | observado | 123 → 121 | 2 → 0 | 78,9 → 80,2 % | ∞ → 1,86 | 0,247 → 0,249 | 283 → 0 |
| Generate | 640 mil | simulado | 118 → 116 | 3 → 0 | 50,8 → 51,7 % | ∞ → 3,35 | −0,156 → −0,134 | 283 → 0 |
| Generate | 2,56 mi | observado | 122 → 120 | 2 → 0 | 83,6 → 85,0 % | ∞ → 1,70 | 0,234 → 0,237 | 735 → 0 |
| Generate | 2,56 mi | simulado | 125 → 118 | 7 → 0 | 55,2 → 58,5 % | ∞ → 3,08 | −0,193 → −0,147 | 771 → 0 |
| Evolution | 640 mil e 2,56 mi | os dois | iguais | 0 | iguais | iguais | iguais | 0 |

Os rios dos demais postos não mudaram: as diferenças vêm só dos postos que eram pareados com a borda de uma bacia
fechada. Em 640 mil células com clima simulado, o Jacuí passou a ser pareado com o próprio rio (267 m³/s); os outros
ficaram sem pareamento. Isso é o resultado correto: com as regras do Generate, o modelo fecha a bacia deles antes do
posto, e não existe ali rio comparável. As porcentagens melhoram porque saíram da amostra os falsos zeros, não porque
os rios ficaram melhores.

## Por que essas bacias fecham, e o que sobra

- **Chuva do clima simulado.** Com as regras do Evolution, os mesmos rios correm, mas com pouca chuva sobre a bacia
  (simulada ÷ observada): Jacuí ×0,35 (138 m³/s contra 1.725 medidos; com a chuva observada, 1.567), Ashburton ×0,56,
  Mangoky ×0,58, Narmada ×0,72. Com as regras do Generate, essa falta de chuva fecha as bacias. É viés do clima, a tratar
  na revisão da chuva.
- **Mapa grosseiro da Terra** (pixels de 20 km, 8 bits). Planaltos planos viram depressões fechadas com as regras do
  Generate (a bacia alta do Victoria). O Eufrates, com qualquer regra, junta-se ao Tigre centenas de quilômetros acima
  da confluência real. A região perto de Hindiya com a área do Eufrates é um uádi seco da Arábia (269.776 km², 0,1 m³/s
  com clima observado). É um limite do pareamento por área, não do modelo; sem os contornos reais das bacias, não há
  como recusá-lo com segurança.
- **No Evolution**, a correção só age onde há bacias terminais: os restos de mar que os rios não enchem.
  - Mundo de teste de `regress.mjs` (10673275, 300 Myr, 250 mil células, sem lagos salgados): as 118 saídas ficaram
    idênticas.
  - 10673275 em 1.200 Myr (1 lago salgado, 1 salina): só muda a textura de fluxo.
  - 754534770 (20 % continental, 1.200 Myr, 640 mil células; 3 lagos salgados, 2 salinas): além dela, 2 trechos de rio
    (4 pontos) entram nas bacias pela borda.

  Terreno, lagos e clima ficam iguais.
- **0r063N.** O conjunto `orogen_regions_4e7c1b0` tem o defeito nas saídas das 111 bacias fechadas em terra:
  `drainageArea_km2` da bacia inteira, `discharge_m3s` 0 e `flowsTo` por cima da borda. Ele só some numa nova
  exportação com este código.

## Reprodução

```bash
node tests/river-transport.test.mjs
node tuning/water/earth-rivers.mjs --n 2560000 --json generate.json
node tuning/water/earth-rivers.mjs --n 2560000 --evolution --json evolution.json
node tuning/water/earth-rivers.mjs --n 640000 --trace low --from 38.9,39.0
node tuning/evolution/regress.mjs after.json --seed 754534770 --cont 20 --time 1200 --cells 640000
node v2/tools/check-save.mjs
```
