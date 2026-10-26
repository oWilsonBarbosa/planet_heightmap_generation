# Primeiras correções de rios — 26/10/2026

Base: `69b0bd0`, incluindo o main atual do autor `7026cc6`. Esta rodada implementa os quatro itens da revisão: R3/R4 nas medições e R1/R2 no transporte. O código climático e os parâmetros de calibração permanecem iguais. O PR #2 continua em rascunho: corrigir os erros de percurso não garante melhora de todos os indicadores terrestres.

## Feito

- [x] Separadas métricas puras em `tuning/water/lib/metrics.mjs` e adicionados cinco testes.
- [x] Relatórios anuais e sazonais informam suas amostras, zeros, dados inválidos, séries indisponíveis e denominadores de pico/fase. Séries constantes não recebem um mês de pico fictício.
- [x] O ensaio aceita `--json report.json`, com postos pareados e rejeitados, motivos, parâmetros, dados mensais e hash da fonte. Isso permite comparar conjuntos comuns de postos.
- [x] Séries constantes e vazões anuais/mensais zero mantêm suas penalidades `−Infinity`; saídas inválidas produzem resultado inválido, ordenado por último. O RMS infinito dos zeros não foi ocultado. A mediana superior histórica e o piso do indicador de vazão mínima foram mantidos.
- [x] Corrigido também o uso de `floodRatio` no ensaio: o valor efetivo de cada configuração é usado, em vez de sempre usar o padrão.
- [x] O novo módulo `v2/js/finish/river-travel.js` propaga os momentos na ordem topológica da rede efetiva após os redirecionamentos; ciclos não retornam resultados parciais. Áreas molhadas de lagos alimentam um exutório ou terminam; a fração passada é aplicada uma vez no exutório. A suavização mensal dos reservatórios continua separada.
- [x] Distâncias geométricas acompanham os receptores redirecionados. Elas também corrigem as perdas mensais no leito. Conexões agregadas dos lagos têm comprimento explícito; as distâncias da rede são expostas somente no diagnóstico opcional.
- [x] Nove testes de transporte verificam confluência, trajetos redirecionados, perdas em exutório, lago terminal, mais de 255 entradas, conservação sob atraso, subdivisão de um percurso e um exemplo completo de bacia que muda seu trajeto.
- [x] Execuções terrestres em 640.001 e 2.560.001 células e modos `--list`/`--tune`/`--json` concluídos. O teste do ajuste verificou dois limiares de cheia, 2 e 3.
- [x] Execuções do quadro histórico de Evolution 241024 passaram em 40.001 e 160.001 células. Só mudaram os arrays de regime e meses de cheia; alturas, água, vazões anuais, cores e camadas climáticas comparadas mantiveram seus hashes. Repetição em 40.001 células preservou 26 hashes.
- [x] Suíte completa de salvamento passou, incluindo o fixture histórico com 31 quadros e 84 mapas. As unidades, enumerações e layouts de arquivos não mudaram; não foi necessário alterar versões do formato.

## Resultado terrestre — comparação com a mesma métrica corrigida

| Clima | Postos anuais / séries sazonais | Correlação antes → depois | Pico ±1 mês antes → depois | Pontuação v2 antes → depois |
|---|---:|---:|---:|---:|
| Observado | 122 / 120 | 0.901 → 0.895 | 87.5% → 87.5% | 0.233 → 0.218 |
| Simulado | 125 / 117 | 0.703 → 0.695 | 65.8% → 63.2% | -0.218 → -0.263 |

As vazões anuais de todos os postos pareados permaneceram idênticas, assim como seus pareamentos e os percentuais dentro de fator dois: 83,6% com clima observado e 55,2% com clima simulado. Persistem dois e sete postos com vazão zero, respectivamente. Um posto adicional de vazão positiva não dispõe de série na rede desenhada: é informado como indisponível, sem inventar meses ou escondê-lo do relatório.

A nova pontuação também inclui os zeros que antes ficavam fora da avaliação sazonal. Antes de modificar o transporte, isso já mudou o escore de 0,252 para 0,233 com clima observado e de −0,140 para −0,218 com clima simulado. A tabela acima usa a **mesma métrica v2 nos dois lados**, isolando a mudança do percurso. Não se deve comparar seu depois diretamente aos números antigos do escore v1.

O transporte corrigido mudou os atrasos e a dispersão das cheias; alguns indicadores pioraram. A velocidade de 40 km/dia havia sido ajustada com o percurso anterior e ainda não foi recalibrada. As pontuações piores estão registradas, e não substituídas por uma alegação de melhora geral.

## Cenário adicional enviado pelo usuário

Seed **754534770**, crosta continental inicial 20%, 1.200 Myr, término `none`, simulação com **80,001 células** e terreno com **640,001 células**. Foram comparados o original `7026cc6`, a candidata anterior `69b0bd0` e a corrigida sobre o mesmo quadro tectônico. Todos os cinco checks passaram em cada variante. Entre a candidata anterior e a corrigida, mudaram: rivers.regime, rivers.floodFrom, rivers.floodTo, rivers.farFed. Este cenário é um teste adicional e não substitui o estudo 241024. O acabamento do original e o do fork apresentam diferenças herdadas anteriores a estas correções, inclusive em terreno e clima; suas saídas não devem ser tratadas como o mesmo conjunto de dados apenas por compartilharem a seed.

## Falta e limites

- [ ] Recalibrar e validar a sazonalidade sobre o percurso corrigido, incluindo grandes bacias e climas frios; os zeros e os exutórios terrestres divergentes precisam de diagnóstico próprio.
- [ ] Isolar as regressões climáticas regionais por neve/albedo, chuva orográfica e reciclagem de degelo. O código climático não foi modificado nesta rodada, por isso a comparação climática completa anterior permanece a referência, sem reivindicar uma nova correção do clima.
- [ ] Ampliar testes do Evolution para conectividade, cotas, exutórios e escala da rede, além das verificações de finitude e fechamento global.
- [ ] Medir convergência/desempenho em 10 milhões de células e dispositivos móveis. O percurso é O(N), com espaço adicional de 4 bytes por célula do mesh e 4 bytes por célula terrestre ativa. Não foi medida a memória total de um navegador nesta rodada.
- [ ] Revalidar interpretações geográficas/biológicas quando houver uma base física aprovada. Os dados originais de 241024 continuam preservados e as hipóteses antigas não foram declaradas revalidadas.

README e documentação de desenvolvimento foram atualizados. Não há controles novos, nova dependência nem alteração de tutorial/SEO/What's New nesta correção interna. As evidências agregadas estão em [validation/river-fixes-20261026.json](validation/river-fixes-20261026.json). Os logs e relatórios por posto acompanham a entrega de pesquisa; dados particulares do planeta não foram incluídos no código público.
