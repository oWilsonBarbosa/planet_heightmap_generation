# Orogen V2 — protocolo de transferência entre os laboratórios

Data: 2026-11-15. Versão: 1.0. Tipo: **proposta de validação**, não resultado experimental.
Branch: `audit/arc-reconstruction-provenance-20261115`. `main` não alterada.

## Mundos e conjuntos de dados: não misturar

| Origem | Natureza dos dados | Transferível? |
|---|---|---|
| `planet_heightmap_generation`, `v2` Evolution | Simulação dinâmica de placas, crosta, oceanos, arcos e elevação | **Motor em teste**; seeds e malhas da própria V2 |
| `0r063N`, exportação `c10969c` | Mundo específico de 2.560.001 regiões, exportado do *fork* anterior do World Orogen, seed 10673275 | **Métodos** de auditoria, histórico de proveniência e relatórios, NÃO tratar sua geografia como alvo da V2 |
| `0r063N`, reconstrução de 750 Ma | História interpretativa/autorada que satisfaz critérios geológicos para um estado presente | **Critérios e formato de comparação**, NÃO usar como ground truth cinemático |
| `expert-spoon` | Piloto fictício de relevo/hidrologia; B02/B13 no experimento de Pangeia +150 Ma | **Controle de cenários, limites, conservação, sensibilidade**; não transportar cotas, rios ou tectônica |
| Orogen Science `002H-7`, `002H-8`, bacia `54757` | Experimentos sobre a geometria nativa dessa bacia, difusão/incisão e identificabilidade | **Teste de ganho fora da amostra e identificabilidade**; resultados da bacia não calibram a V2 |

## Evidências externas reutilizáveis

1. `0r063N/reports/audit/README.md`: 69 testes entre campos, 15 alertas, 9 causas; distinção fundamental entre nomes de variáveis, mecanismo real e visualização. Exemplos: `isCoastal` não é a costa visível; `foldRidge` foi interpretado incorretamente como rifte em estudos regionais. Aplicação: não usar simplesmente `type=ARC` ou `TRENCH` como prova de vulcanismo ativo.
2. `0r063N/reports/tectonics/variants/COMPARACAO.md`: duas histórias testadas no mesmo pipeline. A sobreposição de blocos continentais caiu de 18,5% para 1,3% em um cenário alternativo; outras métricas também foram examinadas. Aplicação: a aceitação de mudança na V2 exige topologia, velocidades, ciclo, sobreposição, orçamento crustal e mapas em conjunto.
3. `0r063N/tools/tectonics-pipeline/scripts/60_validate.py` e `99_compare_histories.py`: padrão de validação quantitativa com fontes e relatórios separados; história autorada NÃO é verdade observada.
4. `expert-spoon/piloto_bacia_costeira`: recortes e condições de contorno, ensaios A/B, conservação, registro explícito de parâmetros, sensibilidade de depressões e soleiras. Aplicação: geometria artificialmente conectada e dependência de malha devem ser tratadas como hipóteses a testar com mapas e estatísticas.
5. Orogen Science `002H-7`: experimento com 19 alternativas em 195 células nativas da bacia 54757; RMSE fora da amostra 164,42 → 163,23 m (~0,7%). O avanço não foi significativo. `002H-8`: 216 combinações e hipóteses de elevação incapazes de diferenciar histórias por deslocamento vertical. Aplicação: **não declarar GPE/ARC corrigido pelo simples aumento de uma métrica**.
6. `0r063N/tools/export/verify.mjs`: manifestos de integridade e exportações imutáveis por commit; `MIGRATION_c10969c.md` registra mudanças e efeitos sobre todos os produtos derivados. Aplicação: registrar `branch`, `commit`, seed, malha, período, indicadores e arquivos antes de mudar motores ou reexportar um mundo canônico.

## Protocolo proposto para a próxima decisão de ARC

### P0 — Contrato semântico por processo (crítico)

Separar, ao menos na auditoria, os seguintes estados e fluxos:
- `ARC_MAGMATIC_NEW`: `OCEAN→ARC` pelo `buildArcs` com limite de subducção comprovado.
- `ARC_WIDEN_EXISTING`: ampliação de arco previamente formado, com registro do status ativo/inativo do contato.
- `ARC_RELOCATED`: arco copiado durante transferências de terrenos entre placas; não é nascimento novo.
- `ARC_RASTER_FILL`: réplica de crosta `ARC` produzida em `closeSeasBetween` ou no preenchimento de buracos de `mergePlates`; não é acresção magmática.
- `ARC_MATURED`, `ARC_RECYCLED`, `ARC_ERODED`, `ARC_SUBDUCTED`: destinos com definições explícitas.
- `ARC_VISIBLE`: classe superficial resultante. Não confundir tipo ARC, crosta vulcânica, arco ativo e ilha emersa.

Cada evento deve informar id de placa, id de terreno, tempo, idade original, área nominal de célula e se representa transferência, mudança de classificação ou geração física. Não duplicar contagens quando uma célula muda de placa várias vezes.

### P1 — Orçamento físico e validação por escala

Em cada checkpoint de 100 Ma, medir ao menos:
- estoque `ARC` único na malha mundial e estoque nativo por placa; seus valores não são somáveis sem descontar sobreposições;
- áreas `CONTINENT+CRATON`, `ARC`, `OCEAN` e total crustal;
- fluxos separados de nascimento, transferência, absorção, maturação, reciclagem e preenchimento numérico;
- residuais de balanço **com unidades de km²** após correção de mascaramento e colisão; se não fechar, explicitar o termo desconhecido e **não forçar um zero artificial**;
- áreas de maior bloco ARC, arcos remotos, supercontinentes e mares interiores;
- idade média oceânica e porcentagem de oceano >200 Ma;
- controle de tolerância temporal e espacial (20K/40K/80K) com geometria prescrita além de históricos livres.

### P2 — Experimentos identificáveis e validação fora da amostra

- Ajustar hipótese somente nas sementes **12345, 777, 4242** e preservar pelo menos **31337** e outras novas sementes como validação nunca usada para escolher o ajuste.
- Usar resolução 20K para rastrear mecanismos, e 40K + 80K para testar se a conclusão persiste em unidades físicas.
- Comparar 3 alternativas isoladas: (A) manter a via de ampliação `ARC` original; (B) bloquear ampliação sem atividade `OVERRIDING`; (C) exigir persistência de atividade `OVERRIDING` durante janela temporal definida e testar duração sem sobreajustar. Hipótese C **ainda não foi implementada**.
- Separar a hipótese de preenchimento sedimentar do campo temporal `formedAt`: preservar a data da cópia **isoladamente foi reprovado** por falha de sobreposição continental (1892 km > limite 500 km).
- Exigir melhoria no conjunto de métricas, não apenas no maior agrupamento ARC. Registrar pior seed além da média.
- Para componentes geográficos, usar interseção sobre união (IoU/Jaccard) e componentes conectados para comparar placas, continentes e agrupamentos em mesma grade física.

### P3 — Critérios de bloqueio

- Falha nova de invariantes ou crescimento de overlap acima do limite declarado.
- Dependência de resolução sem explicação ou resultados opostos entre 20K e 40K.
- Troca de classe `ARC→CONTINENT` usada para ocultar crescimento crustal sem mecanismo geológico.
- "Correção" baseada somente na semente anômala 4242.
- Alterar o planeta canônico exportado no `0r063N` ou misturar sua história autorada com a origem física da V2.
- Gerar mapas de detalhe que aparentem geologia observada onde só há interpolação.

## Histórico de auditorias a preservar

- [Balanço e GPE](https://github.com/oWilsonBarbosa/planet_heightmap_generation/blob/audit/arc-crust-flux-ledger-20261115/reports/ARC_MATURATION_SPEED_AND_FLUX_2026-11-15.md)
- [Reconstrução de crosta ARC, hipótese de subducção ativa e idade de cópias](https://github.com/oWilsonBarbosa/planet_heightmap_generation/blob/audit/arc-reconstruction-provenance-20261115/reports/ARC_RECONSTRUCTION_PROVENANCE_2026-11-15.md)
- [Orogen 0r063N: auditoria de campos](https://github.com/oWilsonBarbosa/0r063N/blob/main/reports/audit/README.md)
- [Orogen 0r063N: duas histórias](https://github.com/oWilsonBarbosa/0r063N/blob/main/reports/tectonics/variants/COMPARACAO.md)
- [expert-spoon: piloto de cartografia](https://github.com/oWilsonBarbosa/expert-spoon/blob/main/README.md)

**Decisão:** material transferível = procedimentos, nomenclatura de proveniência, invariantes e métodos de comparação; não transferir dados terrestres, topográficos, tectônicos ou cronológicos entre mundos.
