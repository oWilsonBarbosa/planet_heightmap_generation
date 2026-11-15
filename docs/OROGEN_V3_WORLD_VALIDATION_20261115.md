# Orogen — validação headless do gerador v3.0.1 + fork (15/11/2026)

Status: **integração funcional no fluxo Generate → Finish; cânone NÃO migrado.**

Planeta: `06cy8w6z6a89kow6psje93`. O script `tuning/orogen/smoke.mjs` executa o worker real do Generate e o `finishPlanet` do Evolution com a malha entregue pelo worker. O perfil `closed-basins` liga `closedBasins: true` e `seaRemnantAnySize: true` só no Generate; `v3` mantém os padrões. Testes de integração executados no GitHub Actions Node 22.

## Resultados observados

| Células | Perfil | Lagos doces | Lagos salgados | Salinas | Fração para bacias fechadas | Água em lagos / terra | Pontos de rio | Balanço hídrico | Pico km | Terra % |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 40.001 | v3 | 1 | 0 | 1 | 0,0044% | 0,096% | 11.017 | ~100% | 5,87 | 18,21 |
| 40.001 | closed-basins | 2 | 0 | 1 | 0,0044% | 0,110% | 11.014 | ~100% | 5,87 | 18,21 |
| 160.001 | v3 | 14 | 0 | 1 | 0,0168% | 0,365% | 36.835 | ~100% | 7,18 | 18,47 |
| 160.001 | closed-basins | 14 | 12 | 28 | 0,8481% | 0,589% | 36.690 | ~100% | 7,18 | 18,47 |
| 640.001 | v3 | 103 | 0 | 1 | 0,0136% | 0,567% | 96.086 | ~100% | 7,37 | 18,48 |
| 640.001 | closed-basins | 102 | 23 | 18 | 0,5994% | 0,634% | 95.816 | ~100% | 7,37 | 18,48 |
| 2.560.001 | v3 | 275 | 1 | 0 | 0,0106% | 0,573% | 159.149 | ~100% | 8,11 | 18,42 |
| 2.560.001 | closed-basins | 275 | 22 | 23 | 1,2328% | 0,819% | 158.240 | ~100% | 8,11 | 18,42 |

Os números de lagos e salinas são os **corpos relatados em `stats.water`**, não o número de células. Na resolução integral, 1.099 células têm água salgada e 66 células são marcadas como salina. Áreas de corpos devem ser auditadas antes da migração. A área continental, o relevo máximo e o clima em alta latitude são principalmente determinados pelo novo motor tectônico e não pela opção de bacias fechadas.

### Invariantes e observações

- Todos os cenários acima concluíram com sucesso e produziram geologia e agricultura, sem `NaN` nem infinito nas alturas e vazões fluviais amostradas.
- A soma `toSeaShare + toBasinsShare + lostShare` esteve dentro de um erro de ordem `10⁻⁸` a `10⁻⁷` de 1. Este é um balanço **global**, não uma prova de conectividade ou níveis de cada lago.
- Na resolução integral, a fração de calota de gelo sobre a terra ao norte de 60° N foi **37,04%**, contra **7,4% no cânone** da auditoria anterior. O problema do Ártico continua.
- Os 22 lagos salgados e as 23 salinas do cenário integral não reproduzem o cânone (3 lagos salgados e 91 salinas em terra no conjunto anterior). **Não inferir regressão nem melhoria física apenas da contagem**: a topografia e as bacias são diferentes.
- A diferença entre 160K e 640K no número de salinas (28 → 18) pede verificação de convergência e conectividade. A linha integral indica 23 salinas.
- A resolução integral fez Generate em 31,94 s, Finish em 44,49 s e RSS de ~2.323 MB no runner. Não demonstra comportamento equivalente em navegador móvel.
- Ambos os perfis foram executados em 2.560.001 células. O perfil v3 padrão apresentou 1 lago salgado e nenhuma salina; o perfil experimental apresentou 22 lagos salgados e 23 salinas. A mudança é hidrológica, não uma recuperação do cânone antigo.

## Evidências

- [40K, perfis v3 e closed-basins](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43749884165).
- [160K, perfis v3 e closed-basins](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750005131).
- [640K, dois perfis; 2.56M, closed-basins](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750125147).
- [Controle integral v3 e auditoria do Evolution (3 verificações reprovadas)](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750436871).
- [Baseline e auditoria do cânone](https://github.com/oWilsonBarbosa/0r063N/blob/ccr-3c4ab8a1-olrlvi/reports/generator-v3/README.md).
- Testes de unidade: `.github/workflows/orogen-hydrology-checks.yml`; scripts em `tuning/orogen/`.

## Controle do fork anterior `c10969c`

Execução: [GitHub Actions — baseline fork original](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43750723918), com a mesma semente de regressão do Evolution (10673275), resoluções 160K/640K, sem alteração do código do fork.

- **Fork original:** 31 de 32 verificações aprovadas. Uma falha de convergência de regimes fluviais (permanentes estáveis 67,7% → 73,1%; estação de cheia 31,2% → 25,6%; diferença acima de 5 pontos).
- **Integração com v3.0.1:** 29 de 32 aprovadas. A convergência dos regimes passou, mas apareceram **três falhas que não ocorrem no mesmo teste do fork original**: subida de rio de 107 m a 160K, um exutório de lago inalcançável a 640K, e convergência ruim dos lagos grandes (0,27% → 0,05% da área terrestre).
- O fork original usa superfície/geologia anteriores e tinha 43/339 lagos doces a 160K/640K, enquanto o integrado tem 69/309. Portanto, o controle demonstra a mudança do comportamento e a localização dos portões reprovados, **não isola sozinho se a origem é o relevo, o algoritmo ou a interação entre eles**.

**Resultado de revisão:** o merge não deve ser promovido. Diagnosticar com IDs e coordenadas dos trechos de subida e do lago inacessível; repetir os testes com os mesmos terrenos de entrada, se possível, para atribuir a causa. Não flexibilizar os limiares só para passar os testes.

## Localização das anomalias — diagnóstico instrumentado

Código do diagnóstico: `tuning/evolution/drainage.mjs --cells 160000,640000 --diagnose`. Evidência executada em [Actions 43751694917](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43751694917); o job `evolution-drainage` registra `OROGEN_DRAINAGE_DIAG` por resolução. **Não são coordenadas de Orogen:** são posições do mundo de ensaio do Evolution, semente `10673275`, com relevo diferente do atlas canônico.

### Trechos de rios que sobem na malha de 160.000 células

| Célula de origem (lat, lon) | Origem m | Receptor (lat, lon) | Receptor m | Subida | Vazão |
|---|---:|---|---:|---:|---:|
| `60166` (14,24640° N, 132,08106° E) | 70,10 | `60543` (13,99479° N, 132,67905° E) | 177,25 | **107,15 m** | 4.094,665 m³/s |
| `19158` (49,51615° N, 106,26513° O) | 29,59 | `18925` (49,79667° N, 105,55921° O) | 123,69 | 94,10 m | 7.593,194 m³/s |

No primeiro caso, existem dois vizinhos a ~70,1 m (`59789`, `59933`), mais baixos do que o receptor indicado, mas isso **não prova** que a troca direta do receptor preserve uma rede acíclica. O mesmo ocorre no segundo caso (vizinhos `19535` e `19391`). Averiguar como a etapa de corte e preenchimento da bacia mantém receptores antigos ou produz redirecionamento insuficiente.

### Lago de água doce com exutório inacessível na malha de 640.000 células

- Corpo `266`: **3 células**, ~2.390,9 km², água a **139,00 m**; células `633044` (−77,98819°, 104,80826°), `632667` e `632434`.
- Exutório `633654` (−78,56063°, 104,34225°), terreno a **143,36 m** — **4,36 m acima da superfície do lago**; distante 64,5 km da célula de lago mais próxima.
- Vizinhos do exutório `633277` a **140,81 m**, `633798` a **139,00 m**; o receptor do exutório é `633798`. A verificação não achou caminho conectado ao exutório cujas cotas permaneçam abaixo da superfície (+1 m de tolerância).
- Necessário rastrear o desfiladeiro e a alteração de cota após o estabelecimento do lago; nenhuma redução artificial de cotas foi aplicada.

### Instabilidade de lagos grandes entre 160K e 640K

Limiar físico comparado pelo teste: lagos ≥ **12.752 km²**; a fração da terra ocupada cai de 0,27% (11 corpos) a 0,05% (5 corpos). O maior corpo detectado a 160K está perto de **15,109° N, 82,058° E**, tem **73 células = 232.715,5 km²**, superfície a **3 m**, saída `59663`. Não há corpo acima do limiar identificado na mesma região entre os três maiores lagos do diagnóstico a 640K; deve-se rastrear a origem desse corpo, que pode representar um remanescente marinho artificial em baixa resolução.

O controle do fork `c10969c` **não** apresenta os três erros nas mesmas verificações, mas sua geografia difere: nenhum deles deve ser atribuído exclusivamente ao algoritmo antes de separar efeitos de relevo, depressão fechada e discretização. Não reduzir os padrões de aprovação para ocultar falhas.

## 15/11/2026 — causalidade e correções testadas

**Correção experimental de rotas e saída de lagos:** commit `9a7791b`, ensaio de regressão [43753083825](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43753083825). A revisão conserva uma saída de desfiladeiro originalmente descendente mesmo quando o caminho cruza temporariamente outras células da mesma depressão; a reordenação global mantém a verificação de ciclos. Na atualização dos lagos, a altura real do exutório entra no cálculo do nível mínimo possível; quando há um corte lateral inferior, o lago é drenado, não mantido abaixo de sua saída. **31/32 verificações passaram**, contra 29/32 antes. As falhas de subida de 107 m e do exutório inacessível deixaram de ocorrer; resta somente a comparação da área de lagos grandes entre resoluções.

**Causa da maior divergência de grandes lagos:** ensaio [43753409586](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43753409586), diagnóstico `OROGEN_HYDRO_TRACE`.

- Em 160.001 células, a grande massa de água em 15,109° N, 82,058° E tem ~232.716 km² em lagos. É um `h.sea = true`, isto é, uma depressão marinha separada do oceano pela resolução da malha, não um lago continental independente. Seu fundo original aproxima-se de −973 m após preenchimento sedimentar; nível de água a +3 m.
- Em 640.001 células, o mesmo ponto é **oceano**, com −610,4 m e 242 células oceânicas dentro de 3° do centro da massa: o grande lago da malha grossa é uma **anomalia de conectividade marinha inter-resoluções**.
- Rastreio `OROGEN_STRAIT_TRACE` no ensaio [43753684401](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43753684401): à resolução 160K, a abertura entre esta depressão de 73 células e o oceano apresenta **soleira de 27,21 m**, **barreira de 126,48 km**, e pontuação de abertura `0,0057` (limiar `0,5`). Como a regra exige ambos os fatores suavizados, a passagem permanece fechada na malha grossa apesar da ligação oceânica na fina.
- Foi incorporada como **experimento opt-in, DESLIGADO por padrão** a opção `largeCoastalStraitReconnection: true` (commit `53ab3f3`), para testar a ligação de depressões marinhas ≥100.000 km² por barreiras ≤30 m e ≤160 km. Esses limiares são hipótese de teste, **não parâmetros físicos validados**. O pipeline padrão não muda. Antes de adotar a regra, é obrigatório comparar as demais depressões marítimas e o resultado das 32 verificações com o ensaio A/B.

Riscos remanescentes: a reconexão candidata pode eliminar mares interiores reais separados por baixas barreiras; a alteração precisa de comparação geográfica e hidrológica independente, não apenas de aprovação de um teste de escala.

## 15/11/2026 — controles adicionais de escala

A hipótese opt-in `largeCoastalStraitReconnection=true` foi executada, sem alterar o perfil padrão, no workflow [43754211835](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43754211835). Ela realmente retira a grande depressão marinha anômala da classe de lago na malha de 160K, mas a métrica de lagos grandes **continua reprovada**: cai de **0,27% → 0,12%** (160K) contra **0,05%** (640K); 31/32 verificações passam. A reconexão é uma correção parcial e **não será promovida a padrão** com base nesses resultados.

Novo controle sem mudar a geometria ou os limiares: [43754480772](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43754480772), `tuning/evolution/drainage.mjs --cells 640000,1280000`. Conclusão: **31/32**; estabilidade de grandes lagos **reprovada**, agora com limiar de 3.188 km²: **0,44% → 0,28%** da terra, **144 → 77** corpos acima do limiar. Os restantes 31 critérios de conectividade, vazão, cota e conservação passaram. Portanto a instabilidade não se limita à comparação de 160K com 640K.

**Estado de publicação:** a correção dos rios ascendentes e do exutório está operacional e validada na regressão; o experimento de conexão de estreitos permanece **desligado**; o problema da convergência de lagos demanda rastreamento individualizado de corpos entre resoluções e avaliação da produção lacustre por origem (tectônica, glacial, remanescente marinho). Não reduzir limiares nem declarar hidrologia aprovada. Nenhum cânone foi migrado.

## 15/11/2026 — correspondência geográfica dos lagos entre resoluções

**Metodologia:** `tuning/evolution/lib/lake-lineage.mjs`, com testes sintéticos em `tests/lake-lineage.test.mjs`. As células da malha fina são associadas ao centro da célula mais próxima da malha grossa. Cada corpo tem origem identificada a partir da depressão no próprio algoritmo (`marine`, `young-glacial`, `ancient-tectonic`, `other`), área, centroide, exutório, classificação ao refinar (lago, oceano ou terra seca), e até cinco correspondências. **Sobreposição aproximada, não geometria exata de polígonos; área não equivale a conservação da forma.** A saída adicional `lakeOrigin` é exclusivamente diagnóstica (`network=true`) e não afeta a geração normal.

Evidência: [comparação de linhagem individual, Actions 43755752195](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43755752195); o helper e os três testes sintéticos foram aprovados, mas os dois jobs permanecem em falha porque a antiga condição física de convergência dos grandes lagos ainda não passa.

### 160.001 → 640.001 células (lagos ≥12.752 km²)

| Origem | Corpos grossos | Área grossa km² | Área projetada em oceano km² | Área projetada em terra seca km² | Área ainda lacustre km² |
|---|---:|---:|---:|---:|---:|
| Remanescente marinho | 3 | 267.782 | **227.138** | 24.706 | 14.346 |
| Glacial recente | 7 | 143.455 | 0 | **117.952** | 19.127 |
| Antigo/tectônico | 1 | 15.939 | 0 | **15.143** | 0 |

A maior massa marinha da malha grossa (~232.716 km², 15,118° N / 82,060° E) vira **93,1% oceano** a 640K, confirmando a anomalia de conectividade costeira já identificada. O lago antigo/tectônico de ~15.939 km² próximo de 52,233° N / 3,771° E vira completamente terra seca. Lagos glaciais extensos nas altas latitudes sul também desaparecem ou se fragmentam na malha fina.

### 640.001 → 1.280.001 células (lagos ≥3.188 km²)

| Origem | Corpos grossos | Área grossa km² | Área projetada em oceano km² | Área projetada em terra seca km² | Área ainda lacustre km² |
|---|---:|---:|---:|---:|---:|
| Glacial recente | **141** | **666.271** | 5.977 | **542.342** | **115.561** |
| Remanescente marinho | 3 | 41.443 | 0 | 9.962 | 30.285 |

Os corpos do limiar passam de **144 a 77**. A perda glacial responde pela maior parte da redução, e não pela transformação em oceano: aproximadamente **81%** da superfície bruta dos grandes lagos glaciais da malha de 640K é classificada como **terra seca** na malha de 1,28M. A hipótese de estreitos costeiros pode corrigir o grande falso lago marinho, mas **não resolve** a sensibilidade lacustre glacial.

Exemplos rastreados: lago glacial da malha 640K próximo de −76,139° / 108,984° (12.752 km²) desaparece integralmente na malha 1,28M; outro em −85,651° / −69,952° (12.752 km²) conserva apenas ~39% como lago, dividido em múltiplos corpos de menor extensão. Lagos marinhos perto de −37,709° / 133,205° e 49,789° / 37,024° permanecem majoritariamente em água na resolução fina.

**Conclusão física:** há ao menos dois mecanismos diferentes: (1) falta de conectividade oceânica na malha grossa, que cria falso lago marinho; (2) forte sensibilidade de lagos glaciais ao refinamento, potencialmente ligada à discretização de depressões, critérios de preservação e dinâmica de drenagem. Não atribuir automaticamente a um único parâmetro. É necessária comparação das mesmas depressões glaciais desde o relevo anterior ao acabamento, incluindo cotas, área de bacia, vazão, evidência glacial, decisão de manter lago e abertura de desfiladeiro. Nenhum limiar foi relaxado.

## Portões ainda abertos

1. **Evolution drainage: 3 de 32 verificações falharam** no cenário de regressão (semente 10673275): a 160K, 2 trechos de rios sobem até **107 m** (acima do máximo 100 m); a 640K, 1 lago de água doce tem saída inalcançável pelas células de lago; entre 160K e 640K, a proporção de lagos >12.752 km² muda **0,27% → 0,05%** (11 → 5), fora da tolerância de 30%. Os demais 29 checks passaram. **Não declarar aprovação física da hidrologia.**
2. Comparar a versão integrada com o fork antigo na **mesma semente do Evolution** para distinguir regressão de diferenças herdadas e da nova geomorfologia. O relatório histórico `docs/DRAINAGE_20261029.md` já apontava sensibilidade de grandes lagos à resolução e poços residuais, mas não garante que estas falhas específicas fossem pré-existentes.
3. Auditar salinas, altura dos lagos, salinidade e distribuição nos quatro continentes; revisar o norte gelado e a hipsometria marinha.
4. Adaptar o exportador de 0r063N ao novo worker e confirmar mapas e gazetteers; comparar com as 2.560.001 regiões canônicas.
5. Manter PR em rascunho e ambos os `main` inalterados até a decisão de migração.
