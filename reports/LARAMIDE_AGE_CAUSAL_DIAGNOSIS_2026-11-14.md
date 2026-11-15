# Orogen V2 — diagnóstico causal da regressão de escala Laramide

Data: 2026-11-14. Histórico original: `audit/tectonic-baseline-20261114`. Histórico corrigido: `audit/ocean-age-return-20261114`. `main` não foi alterada.

## Experimento concluído

[GitHub Actions #43655924306](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43655924306) — dois jobs concluídos com sucesso. Artefatos `laramide-slab-age-40000` e `laramide-slab-age-80000`, contendo `baseline.json`, `candidate.json` e `comparison.json`.

Amostras de 2 em 2 milhões de anos; eventos registrados na precisão do passo interno. Semente fixa 12345; mesma história e resolução por comparação A/B. O instrumento `v2/tools/audit-slab-kinematics.mjs` não altera o motor.

### Resultados

| Métrica | Original 40K | Corrigido 40K | Original 80K | Corrigido 80K |
|---|---:|---:|---:|---:|
| Primeiro evento de flat slab (Myr) | 1.82 | 1.82 | 1.29 | 1.29 |
| Evento de retorno a slab steep (Myr) | 34.00 | 37.82 | 35.29 | 40.00 |
| Idade mediana de contatos começa a divergir (Myr) | — | 20 | — | 18 |
| Primeiro estado flatSlab diferente no quadro (Myr) | — | 34 | — | 36 |
| Área Laramide ao final (Mkm², pela cena) | 14.766 | 14.804 | 16.143 | 16.539 |

A fração de contatos elegíveis na primeira amostra divergente (observador aproximado, **não necessariamente idêntico ao conjunto `fed` de `classifyBoundaries`**) mudou de 0.284 para 0.567 no quadro 34 Myr de 40K e de 0.306 para 0.602 no quadro 34 Myr de 80K. A versão corrigida conserva uma grande parcela de crosta subductante classificada como jovem. O retorno a subducção íngreme ocorre mais tarde e a geometria da cordilheira continua a crescer.

### Mecanismo verificado

`v2/js/tectonics/step/boundaries.js` determina a idade da crosta da placa inferior em contato com a margem com `slabAge = time - formedAt`. Ela pode contribuir ao regime `flat` se `slabAge < flatSlabMaxAgeMyr` (35 Myr) e a margem superior avança acima de `flatSlabAdvanceCmYr` (2 cm/ano). O estado de slab segue a fração qualificada dos contatos e histerese (limiares 0.5 na entrada, 0.3 na saída); `flatSlabKm` controla extensão do cinturão de deformação. `beltShape` também usa diretamente a idade do slab para largura local de orogenia.

A alteração do timestamp de crosta recolhida por `giveToBackground` modifica exatamente essa entrada física, sem necessariamente alterar o proprietário/tipo de qualquer célula. No cenário Laramide, os hashes das células proprietárias e tipos permaneceram idênticos em todas as capturas comparadas, embora os hashes de timestamp divergissem desde 2 Myr e os de orogenia a partir de 34 ou 36 Myr.

Esse mecanismo explica qualitativamente **por que** a cordilheira cresceu mais; não demonstra que a forma corrigida é menos realista geologicamente. O limite de diferença relativa de 10% em 40K × 80K é um limiar de engenharia e acabou ultrapassado por cerca de 0.5 ponto percentual (10.5% em vez de 10%).

## Divergência continental separada

Conforme [#43655380010](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43655380010), a semente 777 da cena de ciclo continental diverge em proprietários de placas, tipos e geografia até o quadro de 40 Myr (primeira diferença em **(20,40] Myr**, não necessariamente exatamente em 40 Myr). Aos 1200 Myr há 11 placas ativas e 74.58% da crosta no maior bloco no original, contra 7 e 97.90% no corrigido. Isso **não é explicado diretamente** pelo cenário Laramide: a história tectônica global pode divergir por alterações de polaridade de subducção, forças e bifurcações posteriores. Requer análise própria.

## Decisão e próxima verificação

1. Preservar a correção de `formedAt` na ramificação experimental — o defeito de falsificação de idade está demonstrado.
2. Não alterar `flatSlabMaxAgeMyr` ou os limites de aprovação apenas para forçar o teste de 10%; isso confundiria a correção de proveniência e a calibração física.
3. Criar validação adicional em múltiplas resoluções e limiares físicos para o flat slab, com indicadores de **tempo de transição**, **extensão do cinturão** e **idade da crosta realmente subductante** em vez de um único limite de área em um instante.
4. Investigar separadamente as mudanças de polaridade e os episódios de reorganização de placas nas primeiras dezenas de Myr da cena `cycle`.
5. Manter `main` intocada até haver uma decisão de regressão documentada.

Status: os testes causais de Laramide foram concluídos; nenhuma nova mudança no motor foi aplicada nesta etapa.
