# Orogen Evolution V2 — origem numérica da crosta de arco

**Data:** 2026-11-15. **Estado:** instrumentação concluída e validada; duas hipóteses de alteração física isoladas em branches distintas; `main` inalterada.

## Fontes reproduzíveis

- [Reconstrução e proveniência #43685990957](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43685990957): duas versões idênticas salvo pelos contadores, simulação `cycle` seed 4242, GPE1/20K, GPE2/20K e GPE2/40K. Três comparações deram **identidade exata** em todos os indicadores físicos selecionados; a suíte de invariantes passou **21/21**.
- [Produção prescrita nas três malhas #43686066584](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43686066584): cena de expansão de asas de trincheira `wings`, seed 12345, movimento 3.4 cm/ano prescrito, `NO_RIFTS`, 110 Ma, 20K/40K/80K.
- [Guarda experimental de subducção ativa #43686182316](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43686182316): controle vs apenas adição de `BoundaryKind.OVERRIDING` à ampliação de arcos preexistentes, sem alterar `main`. Comparações na cena prescrita e em histórias `cycle` da semente 4242.
- [Experimento separado de idade na cópia de ARC #43686325376](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43686325376): controle vs preservação do timestamp de origem somente ao copiar `ARC` no preenchimento de mares.
- [Regressões e três sementes adicionais #43686456049](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43686456049): `check-invariants`, `check-scale`, `check-phase13` e três sementes em 20K/40K, versão de guarda.

## Por que o saldo `ARC` não se explicava apenas por magmatismo e maturação

`mergePlates` reconstrói o raster na placa superior, faz **inverse warp**, copia a placa inferior, preenche lacunas do raster e fecha mares estreitos copiando o tipo da terra mais próxima; se o doador for `ARC`, novos pixels no raster podem ser `ARC` sem novo evento de vulcanismo.

`accreteTerrane` move terreno entre placas, podendo absorver parte do solo da placa doadora, e chama `closeSeasBetween`, que pode copiar `ARC` da margem quando fecha um mar. O processo também redefine `formedAt = time` mesmo que a célula seja cópia de uma `ARC` antiga. Isso pode adiar o critério de idade da maturação `ARC`→CONTINENT em pelo menos parte do estoque. Contudo, mudar essa data afeta trajetórias inteiras e não garante mudança monotônica do estoque.

`buildArcs` exige `OVERRIDING` explicitamente ao fundar o **primeiro** fragmento ARC, mas na ramificação original a via de **ampliação do arco preexistente** não verifica explicitamente essa condição, confiando na marca `TRENCH`. A auditoria prova que essa via foi acionada em limites **não classificados como OVERRIDING**.

## Balanço da reconstrução: contagens acumuladas até 1200 Ma (células de raster)

| Indicador | GPE1 / 20K | GPE2 / 20K | GPE2 / 40K |
|---|---:|---:|---:|
| Saldo de `ARC` em fusões (`mergePlates`) | +406 | +479 | +603 |
| Contribuição de preencher lacunas nessas fusões | +204 | +226 | +315 |
| Contribuição de fechar mares nessas fusões | +196 | +254 | +240 |
| Saldo por fechamento de mares em `accreteTerrane` | **+1544** | **+1906** | **+1617** |
| Ampliar arco em limite não `OVERRIDING` | **445** | **529** | **752** |

A soma das quatro parcelas da fusão (warp, overlay, lacunas, mares) coincide exatamente com o saldo de cada grupo. A quantidade de operações acumuladas **não é área de superfície planetária independente**, pois uma célula pode participar de vários episódios e a malha projetada pode se sobrepor. Uma cópia de ARC em costa sedimentar tampouco prova que material vulcânico novo tenha surgido. Com a malha nominal, o saldo de cópias por fechamento de mares em acreção representa cerca de **48,6 milhões km² de eventos raster em 20K** versus **20,6 milhões km² em 40K** no caso GPE2; essa comparação **não mede área final nem demonstra erro algébrico de escala**, porque a história das placas é distinta.

## Produção vulcânica em uma margem com movimento prescrito (110 Ma)

| Indicador | 20K | 40K | 80K |
|---|---:|---:|---:|
| Área ARC no quadro global (Mkm²) | 2.1167 | 1.3516 | 1.3262 |
| Operações de nascimento ARC | 84 | 110 | 207 |
| Nascimentos pela via de ampliação sem `OVERRIDING` | 10 | 10 | 36 |

Em 20K, a área ARC é **~56.6% maior** que em 40K; já a diferença 40K/80K é **~1.9%**. A cena não é uma simulação do globo inteiro, mas controla movimento e escala física e demonstra que a implementação ainda pode ter viés de malha grosseira.

## Experimento 1 — exigir `OVERRIDING` para ampliar arcos

Branch: `audit/arc-active-trench-gate-20261115`. Alteração de uma condição em `buildArcs`, sem outros ajustes. A condição eliminou os nascimentos da via não ativa nos três ensaios de margem prescrita. Não houve melhora monotônica das áreas de 20K, 40K e 80K no experimento de 110 Ma.

Na história global GPE2/4242/20K aos 1200 Ma:

| Medida | Controle | Exigência de margem ativa |
|---|---:|---:|
| ARC global visível (Mkm²) | 43.07 | **8.47** |
| Maior agrupamento ARC (Mkm²) | 28.18 | **2.24** |
| CONTINENT+CRATON (Mkm²) | 203.68 | 200.06 |
| Nascimentos ARC acumulados (células) | 3393 | 2721 |
| Nascimentos por margem não ativa (células) | 529 | 0 |

A mudança reduz o maior grupo em **~92%** e ARC total em **~80%** nessa história, sem só reclassificar tudo como CONTINENT. Contudo, as mudanças de dinâmica posteriores podem ser grandes, e as restantes sementes e resoluções ainda precisam ser aprovadas. **Não é correção aprovada**.

## Experimento 2 — preservar a idade de `ARC` copiada ao fechar mares

Branch: `audit/arc-seafill-age-provenance-20261115`. Somente para células do tipo ARC copiadas em `closeSeasBetween`, deixa o timestamp herdado do doador em vez de forçá-lo para `world.time`. A via para CRATON/CONTINENT permanece como antes.

Na história GPE2/4242/20K, o maior agrupamento ARC em 1200 Ma cai **28.18→11.20 Mkm²**, e ARC total **43.07→27.34 Mkm²**. **Não é resposta monotônica ao longo do tempo:** no instante 1000 Ma o maior agrupamento cresce de 16.42 (controle) para **31.01 Mkm²** (idade preservada). O experimento demonstra real sensibilidade à data de proveniência, mas não autoriza promoção imediata da regra.

## Próximas decisões

1. Avaliar os resultados **40K** das duas hipóteses e os três seeds das regressões, já submetidos à CI.
2. Exigir que nenhuma solução aumente sistematicamente crescimento continental, idade oceânica velha, placas gigantes, supercontinentes compactos ou arcos em mares remotos.
3. Manter separados os problemas de **produção vulcânica e classificação ativa** (`buildArcs`) de **clone de raster e inventário sedimentar** (`mergePlates`/`accreteTerrane`). Quando o simulador copia tipo ARC para preencher um mar, isso não equivale a gerar vulcanismo de arco. No futuro, representar corretamente depósitos/sedimentos da sutura pode exigir outro registro geológico em vez da classe ARC.
4. Não mover os branches experimentais para `main` sem provas quantitativas e revisão cartográfica.

**Status de coleta:** neste arquivo foram registrados resultados já observados e seus links. Os testes 40K adicionais e o conjunto de regressões estavam em execução na primeira gravação.
