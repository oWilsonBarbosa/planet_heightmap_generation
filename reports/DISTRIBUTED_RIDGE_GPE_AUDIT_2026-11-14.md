# Orogen Evolution — aproximação distribuída do empuxo das dorsais

Data do experimento: 2026-11-14 (Brasil). Código de produto `main` preservado. Ramificação **experimental**: `audit/distributed-ridge-gpe-20261114`, derivada de `audit/ocean-age-return-20261114` (que preserva `formedAt` ao devolver crosta ao oceano passivo).

## Por que realizar o teste

Os experimentos anteriores demonstraram que o erro `formedAt = Math.min(original,-1)` convertia artificialmente crosta jovem em crosta anterior à história. A correção modifica decisões de força e de formação de relevo, mas preserva a origem física da crosta. O primeiro gatilho de divergência nas sementes 777 e 12345 estava na condição antiga de `ridge push`: dois contatos oceânicos jovens (idade menor que 40 Ma) acionavam uma força de contorno binária, geralmente na interface com a placa passiva de fundo.

O [experimento de exclusão do oceano passivo](https://github.com/oWilsonBarbosa/planet_heightmap_generation/blob/audit/ridge-background-exclusion-20261114/reports/PASSIVE_RIDGE_PUSH_TRIPLE_2026-11-14.md) adia a divergência, mas não entrega melhora geológica robusta: não é uma correção aprovada.

## Justificativa geodinâmica

Ridge push deriva da estrutura gravitacional e térmica da litosfera oceânica, não apenas de dois fragmentos jovens que se tocam. A formulação em gradientes espaciais de energia potencial gravitacional (GPE) é fisicamente mais apropriada, quando se dispõe de grades de idade oceânica, do que tratar a força exclusivamente como impulso linear na dorsal.

- Clennett et al., *Assessing plate reconstruction models using plate driving force consistency tests* (2023), Scientific Reports, https://doi.org/10.1038/s41598-023-37117-w — compara aproximações na dorsal com trações distribuídas baseadas em GPE.
- Richards et al., *Reassessing the Thermal Structure of Oceanic Lithosphere With Revised Global Inventories of Basement Depths and Heat Flow Measurements* (2018), JGR Solid Earth, https://doi.org/10.1029/2018JB015998 — ressalta limites do modelo simples de resfriamento de meio-espaço para litosfera antiga.

Estas referências respaldam **a direção** do experimento, **não** garantem os números ou a fórmula proxy definidos aqui.

## Implementação experimentada

Arquivo: `v2/js/tectonics/step/ridge-gpe.js` (módulo novo), integrado em `v2/js/tectonics/step/forces.js` e ativado apenas nessa branch por `ridgePushMode='distributed-age-gradient'`.

Função proxy para idade oceânica `a` em Ma:
```
u(a) = max(a,0) / (max(a,0) + tau)
tau = 80 Ma (a calibrar)
```
`u` cresce continuamente de zero para um sem um limiar abrupto de 40 Ma. A força aproximada é proporcional a `+∇u` (voltada ao lado mais antigo; o gradiente real de potencial energético no sentido oposto) e integrada na **área de crosta oceânica de cada placa móvel**.

- A inclinação é estimada por diferenças entre células oceânicas vizinhas da mesma placa, usando coordenadas tangenciais à esfera e distância física `edgeKm`.
- O cálculo usa `cellAreaKm2` e coeficiente por 100 km para normalização física de escala.
- A placa passiva e as células provisórias são excluídas como fontes de torque; fronteiras móveis/passivas deixam de introduzir impulso *apenas por compartilharem uma aresta*.
- A contribuição continua identificada como `ridge push` no monitor de forças, mas `cells[RIDGE]` passa a contar **células de área**, não células de fronteira. Não comparar estes contadores diretamente às versões anteriores.
- O modo antigo continua disponível por configuração; a força nova é uma proxy simplificada, não resolve espessura térmica, densidades, coluna isostática, compensação basal ou reologia.
- O gradiente local pode ser ruidoso perto de interfaces, ilhas e pequenas placas: as suítes de escala e as simulações completas devem avaliar isso.

## Testes já concluídos

1. [Piloto de 120 Ma #43661482890](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43661482890), concluído com sucesso para sementes 777/20K, 777/40K, 12345/20K. A implementação produz histórias válidas, mas elas divergem cedo do modelo anterior (forças aos 6–8 Ma), como esperado quando se substitui o conceito da força.
2. [Teste sintético de escala #43661753365](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43661753365), aprovado. Mesmo campo de idade sobre uma região oceânica de ~91 milhões km²:
   - Torque resultante: 1,928 (10K), 2,001 (20K), 1,884 (40K), unidades internas;
   - Discrepância do **módulo do torque resultante** entre 20K e 40K: **5,84%**, dentro do limite de triagem de 20%;
   - O teste também aprova idade uniforme sem força, crescimento contínuo da função potencial, ausência de torque na placa passiva, `strength=0` e torque finito na direção do gradiente.
3. No piloto com semente 12345 em 20K, t=80 Ma, o torque absoluto acumulado do empuxo antigo foi ~23,03 contra ~5,26 na formulação distribuída (unidades internas). O modo distribuído participa de milhares de células, porém sua força média por célula é muito menor. **Contagem de células não equivale a intensidade**.

## Validação em andamento

[Comparação completa #43661647583](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43661647583) executa as suítes `check-invariants`, `check-scale` e `check-phase13` em baseline (idade corrigida, empuxo antigo) e candidata, bem como histórias de 1200 Ma em 20K (quatro sementes) e 40K (três sementes). Logs e séries serão arquivados com códigos de saída reais das suítes: os jobs de comparação podem retornar sucesso **mesmo se uma suite falhar**, pois os erros são intencionalmente gravados.

**Aviso:** o cenário Laramide na `check-scale` é cinematizado com movimento prescrito; a falha pré-existente de ~10,5% na área da cordilheira não deve ser atribuída ao novo empuxo nem considerada corrigida apenas por essa mudança.

## Critérios de decisão

- Manter o erro de `formedAt` corrigido, sem restaurar idades falsas para recuperar histórias antigas.
- Comparar área e idade oceânica, crescimento de CONTINENT + CRATON + ARC, número e distribuição de placas, conectividade continental, blocos ilhados, áreas de arco e dispersão entre sementes.
- Se uma força distribuída apresentar melhor desempenho físico, realizar sensibilidade dos parâmetros `ridgeGpeStrength` e `ridgeGpeAgeScaleMyr` com controles de seed e resolução antes de alterar `main`.
- Rejeitar qualquer ajuste que apenas reproduza o modelo antigo, aumente supercontinentes compactados irreais, ou viole invariantes sem justificativa.
- O teste sintético é condição necessária, não suficiente; cartografia dos resultados ainda está pendente.

**Situação:** hipótese implementada e instrumentada, testes unitários e triagem de escala aprovados, validação geológica completa ainda em execução no momento inicial deste registro. Nenhum commit foi mesclado à `main`.

## Detalhamento do piloto (120 Myr, dados confirmados)

As histórias comparadas usam a correção de `formedAt` em ambas as versões, e diferem **somente** pela formulação do empuxo das dorsais. Registros de `v2/tools/audit-cycle-polarity.mjs`, na resolução de 2 Myr.

| Caso | Primeiro quadro com força divergente | Primeiro quadro com propriedade de célula divergente | Placas ao final: empuxo anterior → GPE distribuída |
|---|---:|---:|---:|
| 12345, 20K | 8 Myr | 12 Myr | 7 → 6 |
| 777, 20K | 8 Myr | 20 Myr | 5 → 5 |
| 777, 40K | 6 Myr | 16 Myr | 6 → 5 |

Empuxo das dorsais, soma dos **módulos do torque por placa**, nas unidades internas do modelo, ao t=80 Myr:

| Caso | Versão antiga com idade corrigida | GPE distribuída |
|---|---:|---:|
| 12345, 20K | 23,03 | 5,26 |
| 777, 20K | 23,05 | 5,71 |
| 777, 40K | 22,32 | 7,85 |

A distribuição nova não deve ser considerada "mais física" somente porque tem mais células ativas; o torque integrado é diferente. O parâmetro de escala de GPE ainda requer calibração. A divergência histórica logo no começo é natural ao substituir uma força binária por campo distribuído, não evidência automática de regressão.

**Verificação da suíte de escala já obtida na comparação completa:** versão com `formedAt` corrigido e versão distribuída apresentaram **6/7** aprovações, ambas com a mesma falha herdada de extensão Laramide: 14,80 Mkm² em 40K, 16,54 em 80K (diferença 10,5% > tolerância de 10%). O modo de GPE não alterou esse teste kinemático prescrito. As demais suítes e longas histórias devem ser consultadas nos seus logs antes de concluir melhoria global.
