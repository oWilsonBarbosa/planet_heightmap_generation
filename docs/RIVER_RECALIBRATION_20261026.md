# Recalibração sazonal dos rios — 26/10/2026

A candidata `integration/climate-hydrology` passa a usar **45 km/dia** no transporte sazonal dos rios, em lugar de 40 km/dia, após a correção do percurso na rede final. É uma mudança de calibração em `FINISH.riverSpeedKmDay`, compartilhada por Evolution e Generate/Import. Equivale a aproximadamente 0,52 m/s, antes 0,46 m/s: uma velocidade efetiva agregada, não uma velocidade local prevista para cada rio.

A pontuação global melhora com clima observado e simulado, em duas resoluções. Os resultados dos postos reservados são mistos; correlações e alguns grupos também pioram. Por isso, esta etapa encerra o primeiro ajuste de sazonalidade, **não a validação física dos rios nem a revisão do PR #2**, que continua em rascunho.

## Base e método

Base corrigida: `f6fe5726ebae8b6ff0f6ffc8e7a4125b0f809953`. A comparação mantém a mesma métrica corrigida, fonte de observações, postos e malha em cada resolução. Nenhum arquivo de clima foi alterado nesta rodada.

Dos 925 postos da fonte Dai/Trenberth, 219 satisfazem os filtros de elegibilidade. A associação à rede mantém os critérios publicados: até 100 km do posto e área de drenagem dentro de um fator 1,5. O conjunto efetivamente pareado varia com a resolução e o clima; comparações antes/depois dentro de cada ensaio usam exatamente os mesmos postos. A maior resolução não constitui outra série temporal de observações.

Antes da busca, reservou-se o quarto dos postos elegíveis cujo `gaugeIndex % 4 == 0`. Os demais serviram à seleção pela média das pontuações sazonais dos dois climas, com as penalidades por vazão zero preservadas. O índice identifica o posto dentro do conjunto elegível, não uma célula da malha. Essa divisão determinística não estratifica regiões ou bacias. Os programas também imprimem resultados globais; trata-se de uma calibração exploratória com parcela reservada, não de um experimento cego.

Busca em 640.001 células, com 33 perfis distintos e 76 execuções, contando repetições e os dois climas:

1. Velocidades 25, 40, 50, 60, 80 e 100 km/dia.
2. Velocidades 40, 50, 60 e 80, combinadas a fração subterrânea 0,60/0,65/0,70 e armazenamento 2,5/3 meses. Nenhum novo perfil satisfez conjuntamente as salvaguardas dos dois climas: reduzir armazenamento ajudava um lado e prejudicava o outro.
3. Refinamento das velocidades em 40, 42,5, 45, 55, 65, 70, 75 e 90. O perfil 45/0,70/3 foi o único novo perfil que passou todas as salvaguardas no conjunto de seleção. A velocidade 50 tinha média conjunta maior, mas piorava a pontuação individual com clima observado e foi rejeitada.

A média da pontuação de seleção subiu de 0,060523 para 0,063739. Depois, confirmou-se o perfil fixado em 2.560.001 células e no código com o novo padrão. Não se reajustou o perfil a partir dos resultados reservados.

As salvaguardas operacionais exigiram: pontuação de cada clima sem queda; acerto do pico com tolerância máxima de um posto a menos; módulo da fase média das grandes bacias sem piora além de um mês dividido pelo número dessas bacias; correlação mediana fria sem queda superior a 0,01; acerto de pico e erro da frequência de cheias frias sem piora superior a um posto. Cobertura mensal, vazões anuais, pareamento e contagens de zeros deveriam permanecer iguais. As salvaguardas passaram nos dois climas e resoluções. Esses limites permitem pequenas regressões e não equivalem a uma ausência geral de regressão.

## Resultados pareados

Pontuação sazonal: mediana superior de `r − |ln(range)| − 0,5 |ln(low)|`; maior é melhor. Ela não mede erro de vazão anual. As penalidades infinitas individuais por zeros continuam na amostra, mesmo quando a mediana é finita.

| Em 2.560.001 células | Clima observado, 40 → 45 | Clima simulado, 40 → 45 |
|---|---:|---:|
| Postos anuais / sazonais | 122 / 120, iguais | 125 / 117, iguais |
| Pontuação sazonal global | 0,218 → 0,234 | −0,263 → −0,193 |
| Correlação mediana global | 0,895 → 0,892 | 0,695 → 0,690 |
| Pico a até um mês do observado | 105/120 → 105/120 | 74/117 → 75/117 |
| Atraso médio das grandes bacias, meses | 0,69 → 0,62 | 0,46 → 0,31 |
| Correlação mediana fria, grupo D, 41 postos | 0,834 → 0,852 | 0,774 → 0,767 |
| Pico a até um mês, grupo D | 40/41 → 40/41 | 33/41 → 34/41 |
| Cheias sazonais no grupo D, observado 21/41 | 8/41 → 9/41 | 10/41 → 10/41 |

Grandes bacias: área observada de pelo menos 500.000 km², 13 séries com fase nos dois climas. A fase melhora, mas a pontuação desse subconjunto com clima simulado **cai de −0,026 para −0,047**. O menor atraso médio pode esconder erros de sinais opostos; não substitui uma análise de cada bacia.

Em 640.001 células, a pontuação global passa de 0,246035 para 0,247137 com clima observado, e de −0,159097 para −0,155549 com clima simulado. O acerto dos picos muda de 104/119 para 103/119 e de 68/113 para 70/113. A correlação fria cai de 0,884 para 0,877 e de 0,781 para 0,776; permanece dentro da tolerância definida. O atraso das grandes bacias cai de 0,36 para 0,29 mês e de 0,45 para 0,09 mês.

### Parcela reservada

Em 2.560.001 células há 34 séries sazonais reservadas em cada clima:

| Medida | Clima observado, 40 → 45 | Clima simulado, 40 → 45 |
|---|---:|---:|
| Pontuação | 0,107 → 0,128 | −0,271 → −0,288 |
| Correlação mediana | 0,865 → 0,856 | 0,677 → 0,704 |
| Pico a até um mês | 29/34 → 29/34 | 21/34 → 21/34 |

Há melhora de pontuação com observações, mas piora com clima simulado. Em 640.001 células, a pontuação reservada observada permanece 0,329025 (29 séries); a simulada muda de −0,302780 para −0,302133 (27 séries). Não se declara ganho uniforme nem validação independente concluída. A análise dos outros três quartos é apenas sensibilidade: eles participaram da seleção.

As vazões anuais e os postos pareados ficaram exatamente iguais. Em 2.560.001 células, 83,6% dos postos estão dentro de um fator dois com clima observado, e 55,2% com clima simulado. Persistem dois e sete postos com vazão anual zero; o RMS multiplicativo continua infinito nesses conjuntos. A calibração de velocidade não resolve esses casos.

## Clima: problema separado ainda aberto

Executou-se `tuning/climate/diag-spring.mjs --n 160000`, sem mudar seus parâmetros. Entre 60–70°N, a chuva simulada é aproximadamente 2,44 vezes a observada em abril e 3,42 vezes em maio; a acumulação máxima de neve é 440 mm contra 293 mm. Entre 70–80°N, a chuva chega a 4,11 vezes em abril e 6,36 em maio, e a neve a 746 mm contra 396 mm. Março/abril também são mais quentes. São médias por faixa, não descrições de cada local.

Esse diagnóstico explica por que trocar apenas parâmetros hidrológicos não resolve a sazonalidade fria. Chuva, armazenamento de neve e degelo devem ser investigados juntos antes de outra alteração climática. Mantiveram-se `baseflowShare=0.7`, `baseflowMonths=3`, `snowMeltMmPerC=90`, `monthEvapShare=0.8`, `lakeRegulation=0.6`, `lakeRegulationDry=0` e `floodRatio=2.5`.

## Verificações de código e preservação

- 14 testes passaram: cinco de métricas e nove de transporte, incluindo redirecionamento real, confluências, lagos, ciclos, subdivisão e conservação do volume sob atraso.
- O padrão 45 produziu exatamente as mesmas constantes, postos, vazões mensais e resumos que a execução de confirmação com `--set riverSpeedKmDay=45` em 640.001 células.
- O quadro histórico 241024/1.200 Myr passou nos seis testes de integridade em 40.001 e 160.001 células. Comparado à base corrigida, só mudaram `rivers.regime`, `rivers.floodFrom`, `rivers.floodTo` e `rivers.farFed`; terreno, geometria, vazões anuais e clima mantiveram seus hashes.
- O cenário adicional 754534770 passou nos cinco testes em 640.001 células sobre o mesmo quadro de 80.001 células tectônicas, 20% continental inicial, 1.200 Myr, sem término automático. Só mudaram os mesmos quatro arrays sazonais. Ele continua sendo um teste adicional.
- `check-save.mjs` completo passou: ida e volta, migrações e arquivo histórico com 31 quadros e 84 mapas renderizados. Nenhum layout, unidade ou enumeração do arquivo mudou; não houve mudança da versão do formato.

A referência original 241024/`47edc28`, seu acabamento de 10.000.001 células e seus relatórios não foram regravados. Os ensaios usam saídas separadas. Não foi executada uma nova geração em 10 milhões de células, nem uma avaliação de desempenho móvel. Não houve nova execução de Kottek/coupled/aridez: o código e os parâmetros climáticos não mudaram; seus resultados anteriores continuam identificados como anteriores.

## Reprodução e próximos passos

```bash
node tests/river-metrics.test.mjs
node tests/river-transport.test.mjs
node tuning/water/earth-rivers.mjs --n 640000 --set riverSpeedKmDay=40 --json before-640k.json
node tuning/water/earth-rivers.mjs --n 640000 --json after-640k.json
node tuning/water/earth-rivers.mjs --n 2560000 --set riverSpeedKmDay=40 --json before-2560k.json
node tuning/water/earth-rivers.mjs --n 2560000 --json after-2560k.json
node tuning/climate/diag-spring.mjs --n 160000
node v2/tools/check-save.mjs --sim 5000 --len 60 --cells 40000 --width 256
```

As dependências de desenvolvimento e a obtenção das referências estão em [tuning/water/README.md](../tuning/water/README.md). O relatório agregado, incluindo critérios e regressões, está em [validation/river-recalibration-20261026.json](validation/river-recalibration-20261026.json). A entrega privada contém buscas completas, postos, hashes, logs e scripts de comparação.

Faltam investigar os zeros e exutórios, explicar/corrigir as perdas regionais do clima e da parcela reservada, ampliar a validação da drenagem e medir convergência/desempenho. A próxima rodada deve formular hipóteses sobre esses erros antes de procurar mais constantes. Não houve merge em `main`, alteração de controles, dependências de produção, tutorial ou metadados públicos do site.
