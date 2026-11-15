# Orogen V2 — balanço da validação de GPE e sensibilidade à intensidade

**Data:** 2026-11-15. **Estado:** comparação completa concluída; testes de coeficiente iniciados; **nenhuma alteração em `main`**.

## Rastreabilidade

- [GitHub Actions #43661647583](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43661647583): concluído com sucesso **no nível da infraestrutura**. Conteúdo: 21 invariantes, 7 checks de escala, 20 checks Fase 13, 4 histórias em 20K, 3 em 40K, todas de 0–1200 Ma, base e alternativa. Os artefatos `ridge-gpe-1200myr-20k`, `ridge-gpe-1200myr-40k` e `ridge-gpe-regression-*.mjs` contêm CSV/JSON e logs/códigos de saída.
- Idade oceânica previamente corrigida (`giveToBackground` preserva `formedAt`) **em ambas as versões**; a diferença é exclusivamente a regra de empuxo.
- Base: `audit/ocean-age-return-20261114` (empuxo binário original, idade correta); alternativa: `audit/distributed-ridge-gpe-20261114`, proxy GPE suave e distribuída. A versão anterior com `formedAt` incorreto **não** é o controle aqui.
- Malha tectônica tem 20.001 ou 40.001 células, embora nomes abreviados indiquem 20K/40K.

## Suítes do motor

| Suite | Empuxo anterior com idade correta | GPE distribuída | Interpretação |
|---|---:|---:|---|
| `check-invariants.mjs` | 21/21 PASS (exit 0) | 21/21 PASS (exit 0) | Nenhuma nova falha entre invariantes examinados |
| `check-scale.mjs` | 6/7 PASS (exit 1) | 6/7 PASS (exit 1) | Mesma falha Laramide (14.80 vs 16.54 Mkm²; 10.5% > 10%) |
| `check-phase13.mjs` | **12/20** PASS (exit 1) | **15/20** PASS (exit 1) | Melhora 3 checks, porém cinco não satisfeitos |

A suíte `check-phase13` passou a satisfazer **janela de reunião continental (550–800 Ma)** (740/720/760), **planícies 30–45%** (33.0/36.0/38.5) e **maior placa <=60%** (52/55/45) nos três seeds testados. Esses resultados não aprovam todas as histórias.

Os cinco critérios restantes falham: (1) compactação do supercontinente (thinness 0.47/0.41/0.36; mínimo 0.5), (2) mar fechado <=3 Mkm² (seed 777: 3.7), (3) terra continental intocada até 600 Ma (seed 4242: 27% e 8.4 Mkm²), (4) arcos remotos e maiores componentes oceânicos excessivos (até 13.0 Mkm² longe de continentes), e (5) expansão continental/terra emersa em 1200 Ma; seed 777 ganha área continental em ~23% relativo e o indicador de terra emersa cresce até ~9 p.p. em algumas histórias.

**Importante:** o fato de o workflow estar verde é insuficiente: as suites `check-scale` e `check-phase13` retornam exit 1 em ambas as versões; os jobs arquivam esses exits sem falhar a infraestrutura.

## Histórias completas: ganho de crosta continental em pontos percentuais do globo

| Semente | 20K empuxo anterior | 20K GPE | 40K empuxo anterior | 40K GPE |
|---|---:|---:|---:|---:|
| 12345 | +10.05 | +9.88 | +9.65 | +4.88 |
| 777 | +8.45 | +10.02 | +10.38 | +6.74 |
| 4242 | +10.84 | +7.50 | +5.78 | +4.74 |
| 31337 | +9.94 | +12.01 | não medido | não medido |
| **Média disponível** | **+9.82** (4) | **+9.86** (4) | **+8.60** (3) | **+5.45** (3) |

Comparação justa entre 20K e 40K **apenas nas sementes comuns** 12345/777/4242:
- média GPE em 20K: +9.14 p.p.; 40K: +5.45 p.p.; **diferença +3.68 p.p.**;
- média do empuxo anterior em 20K: +9.78 p.p.; 40K: +8.60 p.p.; **diferença +1.18 p.p.**;
- as três sementes GPE têm expansão continental final maior em 20K que em 40K: diferenças +5.00, +3.28 e +2.77 p.p., respectivamente.

Essa divergência sistemática é motivo para investigar a **dependência da escala na história tectônica**, mas não prova um erro algébrico no cálculo da força: simulações complexas e bifurcações podem amplificar pequenas diferenças topológicas entre malhas. A triagem sintética com campo fixo teve diferença de apenas ~5.8% entre 20K e 40K no torque resultante; as histórias longas dependem também das regras e eventos de placas.

## Outros indicadores finais

| Medida (média de cenários) | 20K anterior | 20K GPE | 40K anterior | 40K GPE |
|---|---:|---:|---:|---:|
| Idade oceânica média ao final, Ma | 95.2 | 98.7 | 103.8 | 94.5 |
| Fração do oceano >200 Ma, % | 10.3 | 12.7 | 12.5 | 12.2 |
| Área com crosta `ARC`, % superfície | 2.09 | 2.82 | 2.33 | 3.11 |
| Maior placa no quadro final, % globo | 35.7 | 29.9 | 35.5 | 23.2 |
| Nº de placas ativas no quadro final | 8.25 | 11.50 | 10.33 | 11.67 |

Cautela: número de placas e área da maior placa acima são **somente aos 1200 Ma**, enquanto o check Fase 13 mede **máximos ou médias na trajetória inteira**. As médias acima usam 4 seeds em 20K e 3 seeds em 40K. Não interpretar a média de idade oceânica como substituta da distribuição completa de idades.

## Referências para o mecanismo

- *Assessing plate reconstruction models using plate driving force consistency tests* (2023), https://doi.org/10.1038/s41598-023-37117-w — recomenda modelar o empuxo/tração gravitacional pela variação espacial de GPE distribuída ao longo das placas.
- *Changes in Plate Motions Caused by Increases in Gravitational Potential Energy of Mountain Belts* (2022), https://doi.org/10.1029/2022GC010389 — forças gravitacionais da litosfera dependem da estrutura de densidade de toda a placa; a abordagem de linha de dorsal é uma representação simplificada.
- O proxy do código `u(age) = age/(age+80)` não constitui solução termomecânica calibrada, nem permite inferir forças em N/m² sem estrutura física vertical e densidade.

## Decisão: candidato interessante, porém ainda NÃO aceito

O modelo GPE melhora três checks do ciclo tectônico sem violar invariantes, mas:
1. **Não melhora o ganho continental médio em 20K.**
2. **Aumenta a diferença 20K–40K do crescimento continental médio nas três sementes comparáveis.**
3. Os ganhos em idade oceânica dependem do seed e da resolução.
4. A compactação continental, arcos remotos e crescimento de terra emersa continuam problemáticos.

**Não incorporar a `main` e não relaxar limiares.** Os resultados justificam uma calibração por sensibilidade e medição adicional de força, não uma troca definitiva da física.

## Próxima experiência iniciada

Branch **`audit/gpe-strength-sensitivity-20261115`**: apenas o observador `v2/tools/audit-geography.mjs` ganhou opções de parâmetros **por instância de mundo** (`--gpe-strength`, `--gpe-age-scale`). O default do algoritmo continua igual ao da branch GPE original.

[Workflow #43679068995](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43679068995) testa:
- intensidade do empuxo de **0.5** e **2.0** (a original é 1.0), sempre `ridgeGpeAgeScaleMyr=80`;
- malhas tectônicas 20K e 40K;
- seeds 12345, 777, 4242;
- tempo de 1200 Ma, capturas a cada 100 Ma;
- CSV e JSON por combinação, sem alterar o motor.

Critérios para avançar: ganho continental e idade oceânica mais estáveis entre resoluções (sem exigir trajetórias idênticas), não aumentar de forma sistemática grandes blocos continentais e arcos, preservar história/erupção/ciclo plausíveis. O próximo candidato escolhido deve ser reavaliado nas suites Fase 13 e escala e com mapas de relevo, e não apenas pelos números de área.

**Estado ao registrar:** a validação original foi concluída; a sensibilidade do coeficiente está em execução, sem resultados ainda.
