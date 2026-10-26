# Revisão de clima, rios e organização — 26/10/2026

Revisão do PR #2 em `7bab00e`, com código físico idêntico a `1e56993`, contra main `7026cc6`. A organização e a preservação dos históricos foram conferidas. A integração física continua sem aprovação para merge: esta revisão identifica quatro pontos a corrigir antes de calibrar parâmetros.

Atualização posterior: os quatro itens desta revisão foram endereçados nas [primeiras correções](FIXES_CLIMATE_RIVERS_20261026.md), com testes e resultados antes/depois. Este documento preserva o diagnóstico da base revisada; a calibração e a aprovação da integração continuam pendentes.

## R1 — P1: os momentos do tempo de viagem usam uma ordem anterior à rede final

Local: `v2/js/finish/finish-hydro.js`, linhas 649–657; redirecionamento anterior em 475–515.

As células secas de uma bacia têm seus receptores redirecionados em uma ordem local (`h.dryOrder`). A nova passagem de tempo de viagem percorre somente `order`, a ordem do priority flood original. Em parte das arestas, o receptor já foi processado quando recebe novos momentos: a contribuição chega, mas não segue integralmente a jusante nessa passagem. A própria passagem mensal possui um tratamento de `dryOrder`; a nova passagem de momentos não o reproduz.

Reprodução na Terra, 640.001 células, clima observado e flags hidrológicas do Evolution (`closedBasins=false,seaRemnantAnySize=false`), pela adaptação Generate: nas duas chamadas de hidrologia foram identificadas **4.404 e 4.378 transferências com vazão positiva para receptores já processados**. Com as regras Generate, a inspeção de topologia encontrou 5.364 e 5.286 arestas contra a ordem original.

Isso compromete o cálculo da fase e da dispersão dos hidrogramas. Não demonstra uma perda correspondente de vazão anual: a passagem de momentos é usada para atrasos sazonais. A soma de vazões transferidas por múltiplas arestas não deve ser interpretada como água global perdida.

Correção necessária: calcular os momentos na ordem da rede efetivamente usada, incluindo as bacias redirecionadas e o tratamento de lagos; testar cadeias, confluências, bacias e fechamento dos pesos antes da recalibração de velocidade.

## R2 — P2: distâncias não acompanham os receptores redirecionados

Local: `v2/js/finish/finish-hydro.js`, linha 656. As distâncias são criadas em 160–173; os receptores mudam em 509.

`stepKm[c]` guarda a distância até o receptor inicial. Depois da mudança de `recv[c]`, essa distância não é atualizada. O novo tempo de viagem usa o par receptor final/distância antiga. A distância também já era usada por partes do código anterior: é uma limitação herdada que passou a afetar a funcionalidade de transporte integrada.

Na mesma reprodução com flags do Evolution, **11.400 e 11.338 arestas** tinham diferença superior a um metro entre `stepKm` e a distância geométrica ao receptor atual; o maior erro foi aproximadamente **53,8 km**. Com regras Generate, foram 12.318 e 12.160, máximo de 53,5 km. As contagens são por chamada, não devem ser somadas como células distintas.

Correção necessária: manter receptor e comprimento consistentes a cada redirecionamento; tratar explicitamente conexões agregadas de lagos. Verificar também o efeito sobre as perdas no leito, sem atribuir ao merge todos os problemas herdados.

## R3 — P2: o resumo sazonal omite que a amostra é menor

Local: `tuning/water/earth-rivers.mjs`, linhas 149–170.

A reprodução em 2.560.001 células confirmou os resultados anteriores, mas revelou os denominadores que o resumo não informa:

| Clima | Postos com correspondência geométrica | Séries sazonais usadas | Vazão anual simulada zero |
|---|---:|---:|---:|
| Observado | 122 | 120 | 2 |
| Simulado | 125 | 117 | 7 |

São 219 postos elegíveis antes do pareamento geométrico; os demais ficam fora do ensaio por falta de correspondência da bacia no mapa. Com clima simulado, os zeros incluem Narmada, Karun, Senegal, Eufrates, Mangoky, Victoria e Ashburton. A causa de cada zero ainda precisa ser diagnosticada: clima, perdas, fechamento de bacia ou pareamento podem contribuir.

As porcentagens anuais de 84% e 55% dentro de fator dois **incluem** esses zeros e não foram invalidadas. Já a correlação, o mês de pico e a pontuação sazonal usam uma amostra menor. O RMS logarítmico infinito é consequência matemática de um quociente zero; substituí-lo por um número finito esconderia o problema.

Correção necessária: informar os denominadores por métrica, os motivos de exclusão e os casos de vazão zero; comparar um conjunto comum de postos quando a pergunta exigir comparação direta entre climas ou versões.

## R4 — P2: a mediana descarta penalidades infinitas produzidas pela própria pontuação

Local: `tuning/water/earth-rivers.mjs`, linhas 161–165.

Uma série mensal constante e positiva tem coeficiente de variação zero. Isso produz `−Infinity` na penalidade `r − |ln(range)| − 0,5|ln(low)|`. A mediana filtra valores não finitos, removendo justamente esse resultado ruim.

Reprodução com as funções extraídas do arquivo, sem alteração: um caso perfeito pontua **1**; dois casos de série plana mais esse caso perfeito continuam pontuando **1**; apenas um caso plano produz `NaN`. Isso pode favorecer combinações ruins na busca de parâmetros. Não houve termos sazonais não finitos nos dois ensaios terrestres atuais; portanto esse caso não explica os escores já publicados.

Correção necessária: separar dados inválidos de penalidades válidas, estabelecer o tratamento explícito de séries constantes e testar a comparação usada pelo ajuste. Não mascarar os casos com um filtro genérico.

## O que passou e o que não muda

- A API do GitHub confirmou somente três branches ativos e todas as tags anteriores. O bundle dos seis históricos continua completo e verificável. Main permanece em `7026cc6`; o planeta 241024 continua na referência preservada.
- Os três conflitos da integração conservaram as mudanças relevantes das duas linhas: o parâmetro polar do main, a neve do fork, os limites de chuva e `orographicK` sazonal. Não foi encontrado descarte dessas alterações nos conflitos examinados.
- A reprodução dos rios em 2,56 milhões de células confirmou os resultados agregados registrados. Os quatro achados afetam sua interpretação e a próxima rodada de correções.
- Foi executado **`coupled-check.mjs` completo** no main e na candidata, incluindo 640 mil/2,5 milhões de células e os planetas sintéticos. As portas de clima, temperatura e estabilidade de proporções de classes passaram em ambos. A maior diferença de proporções de classes entre resoluções foi **1,22% no main** e **1,20% na candidata**, abaixo do limite de 2% do programa.
- Isso fecha a verificação de resolução que havia ficado sem avaliação no modo `--quick`. Não prova invariância de cada célula ou rede de drenagem, nem remove as regressões regionais/de grupos climáticos já registradas.
- Nenhum arquivo do motor foi alterado nesta revisão. As sondas usaram cópias temporárias dos módulos, acrescentando somente diagnósticos. Os testes anteriores de salvamento e seeds não foram repetidos sem mudança de código.

## Ordem recomendada para as correções

1. Corrigir a medição: denominadores, zeros, séries constantes e relatórios por posto. Preservar os resultados atuais como referência anterior às correções.
2. Corrigir ordem e distâncias do transporte, com exemplos pequenos verificáveis e regressão dos hidrogramas. Validar as regras Generate e Evolution separadamente.
3. Isolar as causas das regressões climáticas: neve/albedo, limites orográficos e reciclagem de degelo, uma alteração por vez; avaliar regiões e estações, além do escore global.
4. Repetir Earth-match, comparação acoplada, aridez e hidrologia; ampliar os ensaios de drenagem no Evolution para incluir conectividade, cotas e saídas de bacia. Os testes anteriores de finitude e fechamento global não verificavam esses pontos.
5. Manter o PR #2 em rascunho até essa revisão das correções. A referência histórica do 241024 permanece separada.

Evidências estruturadas: [climate-river-review-20261026.json](validation/climate-river-review-20261026.json). Os logs e as sondas desta rodada acompanham o pacote de revisão da pesquisa. Os números de roteamento são de 640.001 células; os números de cobertura dos postos são de 2.560.001 células. O ensaio com flags do Evolution usa geometria Generate, não é uma validação completa do modo Evolution.
