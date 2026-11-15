# Diagnóstico causal de lago glacial — malhas 640K e 1,28M

Data: 2026-11-15. **Somente observação; nenhuma alteração nas regras de hidrologia.**

Origem: métodos de auditoria de soleiras, curvas área–cota–volume e balanços sazonais do projeto `expert-spoon/piloto_bacia_costeira/`, especialmente `revisar_soleiras.py`, `testar_retencao.py` e `balanco_sazonal.py`. Aqui foram implementadas curvas geométricas simplificadas até a soleira, **não** uma integração do simulador sazonal nem uma validação Fill–Spill–Merge completa.

## Experimento

- Mundo de regressão do Evolution, **semente 10673275**, não o atlas Orogen canônico.
- Coordenadas: **−76,1394°, 108,9841°**; círculo de raio 180 km; 640.001 e 1.280.001 células; mesma simulação tectônica e clima.
- `tuning/evolution/drainage.mjs --cells 640000,1280000 --glacial-site --lake-match`.
- O diagnóstico opcional em `finish.js` registra altitudes no entorno antes e depois de `lastIceAge`. O diagnóstico de `finish-hydro.js` observa a descoberta de cada depressão adjacente, classificação de origem, cotas, soleiras, volume geométrico, afluência, evaporação, critério `keepKm2`, incisão/saída e corpo efetivamente preservado.
- [Execução e log arquivado — GitHub Actions](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43758596078). O job **falha no portão de convergência preexistente, 31/32 aprovados**, e não por falha na instrumentação.

## Controles ambientais

| Medida no círculo de 180 km | 640.001 | 1.280.001 |
|---|---:|---:|
| Células | 128 | 256 |
| Área aproximada, km² | 102.013 | 102.013 |
| Proporção glaciada | 100% | 100% |
| Altitude média antes da glaciação, km | 0,2697 | 0,2655 |
| Altitude média depois da glaciação, km | 0,1714 | 0,1670 |
| Precipitação média, mm/ano | 336,65 | 337,51 |
| Escoamento médio, mm/ano | 278,21 | 279,07 |
| PET média, mm/ano | 60 | 60 |
| Células de lago doce no recorte | 21 | 4 |

As diferenças no clima são pequenas. A perda lacustre não é explicada diretamente por chuva, escoamento ou evaporação. O cálculo de déficit evaporativo `max(0, 1.2 * PET − chuva)` foi **zero** nas grandes depressões rastreadas, então as condições hídricas sustentam o armazenamento. Os canais que atravessam as depressões e os critérios de retenção são determinantes.

## Principais depressões

### 640K — lago efetivamente preservado

- Hollow `823`: **16 células = 12.751,6 km²**, inteiramente glaciais, profundidade potencial **44,21 m**, fundo **101,32 m**, soleira **145,53 m**, exutório `629672`.
- Capacidade geométrica até a soleira **246,591 km³**. Curva volume aproximada: a 112,38 m, 27,524 km³ / 3.187,9 km²; a 123,43 m, 67,864 km³ / 4.781,9 km²; a 134,48 m, 140,405 km³ / 7.969,7 km²; e a 145,53 m, 246,591 km³ / 12.751,6 km².
- Vazão afluente **355,587 m³/s**, déficit evaporativo 0, área exigida `keepKm2 = 1.490,78 km²`, sem desfiladeiro cortando abaixo da superfície. Resultado: **16 células / 12.751,6 km² de lago doce**.

### 1,28M — drenagem e perda

- Uma grande depressão associada ao mesmo recorte, `hollow 912`, tem **338 células = 134.689 km²**, profundidade potencial **160,33 m** e soleira **109,28 m**, mas é interceptada por um canal inciso com cota de cruzamento **96,06 m**. A regra `drainedByGorge=true` drena-a integralmente; a afluência ~**21.261 m³/s** e o déficit evaporativo zero não são suficientes para impedir a drenagem pela conexão geométrica.
- Outra depressão `hollow 2424` (~231.123 km²) é classificada como lago inicialmente elegível; após decisões de corte e seleção da água conectada, preserva **zero células**, apesar de 10.143 m³/s de afluência, déficit evaporativo zero e critério mínimo de área ~7.962 km². Necessário rastrear por que o conjunto de `water` ficou vazio; o rótulo diagnóstico `other-or-retained` é genérico e **não constitui causa física**.
- Depressão local `hollow 942`, **2.789 km²**, profundidade **14,79 m**, não satisfaz a profundidade mínima de 15 m e sequer se torna candidata a lago.
- A área total de água doce no círculo de 180 km passa de **21 células ×796,97 km²** (~16.736 km²) para **4 ×398,49 km²** (~1.594 km²). Essas áreas incluem todos os corpos presentes no recorte, não são a área de um único lago.

## Interpretação provisória

**Dois mecanismos confirmados no diagnóstico:**

1. As depressões de mesma região têm profundidades, soleiras e conexões diferentes entre malhas; a incisão de desfiladeiros modifica sua retenção independentemente da chuva.
2. Alguns hollows da malha fina se tornam não elegíveis pela profundidade mínima de 15 m; outros elegíveis são cortados ou terminam sem células de água conectadas.

**Pendências para provar o mecanismo completo:** parear as mesmas depressões pelo perímetro/footprint, não só pelo recorte; rastrear `hollow 2424` imediatamente antes e depois de `cutPockets` e da seleção de água; comparar `F.lakeMinDepthM`, `F.breachKm`, `F.glacialBreachShare` e as regras de incisão sob ensaios A/B isolados. Não concluir que o limiar de 15 m esteja errado apenas porque uma depressão ficou 0,21 m abaixo dele.

**Importante:** áreas e volumes foram calculados sob hipótese de células com área média uniforme, com precisão insuficiente para inferir volumes reais de lagos tão extensos. Não migrar cânone, não alterar parâmetros padrão para obter aprovação do teste por construção.


## Sensibilidade controlada à abertura de desfiladeiros glaciais

Execução: [Actions 43758947660](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43758947660). Mesma semente, terreno, método de análise, resoluções e critérios; apenas `F.glacialBreachShare` varia. As execuções terminam com falha do workflow quando uma condição física preexistente não passa.

| Participação do corte glacial | Lagos grandes, terra 640K → 1,28M | Resultado da auditoria | Água doce no recorte de 180 km |
|---|---|---|---|
| Padrão **0,5** | **0,44% → 0,28%** (144→77) | 31/32; falha convergência | 21→4 células |
| Reduzida **0,1** | **0,62% → 0,36%** (183→96) | 31/32; falha convergência | 21→4 células |
| Desativada **0** | **1,32% → 0,86%** (242→148) | 30/32; falhas convergência **e exutório** | 21→6 células |

A configuração `0` permite que o grande `hollow 2424` da malha 1,28M (231.123 km², ~65 m de profundidade, vazão 10.143 m³/s) **retenha água em 580 células**, como suspeitado. Com `0,1` e `0,5`, esse corpo fica seco; no padrão, a abertura do desfiladeiro tem amplitude potencial de até `0,6 km × 0,5 = 300 m`, muito superior à profundidade da depressão. Portanto o parâmetro de corte controla fortemente a retenção desse corpo.

**Porém isso não explica sozinho o lago escolhido para o ensaio:** o `hollow 2424` tem **apenas duas células dentro do recorte**, e o grande `hollow 912` tem 32 células dentro do recorte e continua inteiramente drenado por um desfiladeiro preexistente mesmo com `glacialBreachShare=0`. Isso separa pelo menos duas causas: corte através de uma depressão antes da decisão final sobre lagos, e abertura de saída causada pelo próprio mecanismo de brecha glacial.

A desativação **piora a validação geomorfológica**, produzindo um lago doce adicional com exutório inacessível. Todos os três cenários continuam reprovando a convergência de lagos grandes; não são propostas de calibração aceitáveis.

**Próximo ensaio rigoroso:** rastrear a conectividade e a incisão `cutAt` da depressão 912 desde a escultura do terreno, comparar soleira e rio cruzando a bacia na mesma geografia, e construir um critério geométrico e físico para persistência de um lago. Testar com dados independentes, verificar cota do exutório e evitar limiares artificialmente escolhidos para que a auditoria passe. Os números de corpos e áreas acima não são um estado aprovado de Orogen.



## Proveniência geomorfológica dos cortes que drenam a depressão 912

[Código de rastreamento `b544b95`](https://github.com/oWilsonBarbosa/planet_heightmap_generation/commit/b544b95225403a39d0fa42354507da069eb3cab2);
[execução no Actions 43762680343](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43762680343). Semente Evolution `10673275`, 1.280.001 células, **não** atlas canônico.

O último rastreio do `cutAt` fornece por célula valor, etapa, depressão de origem e relevo anterior ao corte. A depressão `912` tem soleira `109,28 m`, porém apresenta duas incisões de **hollows vizinhos**, ambas inferiores à soleira:

| Célula cortada | Coordenadas | Cota antes → depois | Fonte | Motivo registrado |
|---|---|---|---|---|
| `1264061` | −77,18069°, 121,62257° | 112,05 → **96,06 m** | Hollow `973` | `cause=4`: corte para drenar outro lago |
| `1264849` | −77,48956°, 117,69208° | 118,02 → **100,91 m** | Hollow `2424` | `cause=5`: brecha glacial |

Os dois cortes estão fora da `912`. O código de decisão percorre cada célula de `912` e seus vizinhos externos: se qualquer `cutAt` é mais baixo do que `h.level−0.01 km`, `drainedByGorge` fica verdadeiro. O menor nível, **96,06 m**, é o de uma ação sobre o hollow `973`, portanto a drenagem de `912` não se resolve somente reduzindo `glacialBreachShare` — conforme já demonstrado pelos testes `0.5/0.1/0`.

**Causalidade demonstrada:** os cortes foram introduzidos pela hidrologia de hollows distintos. **Ainda não demonstrado:** se existe caminho contínuo e abaixo do nível do lago conectando cada canal à depressão `912`, ou se a adjacência por célula indica conexão espúria após os cortes; a geomorfologia da saída requer teste de conectividade. Não se deve eliminar cortes vizinhos apenas porque possuem origem diferente.

**Próximo portão técnico:** construir teste observacional que percorra o grafo até o oceano e avalie a soleira efetiva entre o corpo lacustre candidato e os trechos incisos. Comparar malha 640K e 1,28M em unidades físicas, sem forçar conservação artificial de lagos.

**Contribuição para outros projetos:** [E2-OG1 no catálogo compartilhado expert-spoon](https://github.com/oWilsonBarbosa/expert-spoon/blob/main/biblioteca_tecnica/casos/orogen_lagos_glaciais_v3_20261115.md) contém a lição transferível e as evidências reproduzíveis.
