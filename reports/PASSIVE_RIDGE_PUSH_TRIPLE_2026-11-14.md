# Orogen V2 — teste A/B/C: ridge push no oceano de fundo passivo

Data local: 2026-11-14. **Versão principal `main`: inalterada**.

## Escopo

A regra de `step/forces.js` produz forças `RIDGE` entre crostas oceânicas jovens. A correção anterior de `giveToBackground` evita converter crosta jovem devolvida ao oceano de fundo passivo em crosta falsamente anterior à simulação. A correção é necessária para a integridade de `formedAt`, mas desperta forças que o comportamento antigo ocultava.

[Auditoria de localização #43656943372](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43656943372): nos três primeiros contatos adicionais, o tipo de limite do motor é **RIDGE** e o outro lado é **a placa passiva de fundo**, com idades oceânicas de 0 a 6 Myr. Não foram transformantes ou zonas convergentes nos casos observados.

Esta branch `audit/ridge-background-exclusion-20261114` deriva de `audit/ocean-age-return-20261114` e altera **apenas** a condição de `RIDGE` em `forces.js` para ignorar contatos em que `plates[owner[across]].isBackground`. O restante das dorsais, o empuxo entre placas móveis e todos os timestamps corrigidos são preservados.

## Experimento triplo concluído

[GitHub Actions #43657124652](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43657124652), três jobs concluídos com sucesso, pares de histórias até 120 Myr, quadros a cada 2 Myr.

- **baseline**: versão antes da correção de `formedAt`;
- **agefix**: timestamps preservados, empuxo inalterado;
- **experiment**: timestamps preservados e contato `RIDGE` com placa de fundo excluído.

As três versões compartilham seeds, malhas, cenários, parâmetros gerais, observador e amostragens.

### Primeiro quadro com diferença frente ao baseline (Myr)

| Seed / malha | Alteração de idade agefix / experiment | Primeiro componente de força agefix / experiment | Primeira diferença no movimento agefix / experiment | Primeira diferença de `owner` agefix / experiment | Primeira diferença no número de placas agefix / experiment |
|---|---:|---:|---:|---:|---:|
| 777 / 20.001 | 30 / 30 | 30 / **38** | 30 / **38** | 38 / **50** | 116 / 116 |
| 777 / 40.001 | 24 / 24 | 24 / **32** | 24 / **32** | 32 / **36** | 112 / **108** |
| 12345 / 20.001 | 14 / 14 | 20 / **40** | 20 / **40** | 40 / **46** | sem diferença até 120 / **114** |

**Importante:** `primeiro quadro` significa que a mudança ocorreu desde o quadro anterior de 2 Myr, não necessariamente no instante indicado. As medições de área no planeta vêm de outra auditoria; aqui a finalidade é localizar o início da divergência dinâmica.

### Contato inicial verificado

Nos três instantes gatilho (30, 24, 20 Ma), o contador de ridge push era:
- baseline: **0** células;
- agefix: **1** célula;
- experiment: **0** células.

Nesse mesmo instante, `experiment` e `agefix` mantêm o mesmo hash dos tempos de formação e o mesmo `owner`. Portanto, a diferença da força deriva da condição isolada, não de uma inversão da correção temporal ou uma mudança já existente na distribuição continental.

### Interpretação

- O primeiro empuxo adicional causado pela preservação de `formedAt` vem da interface com **oceano passivo**.
- Excluir só esse componente atrasa a primeira diferença dinâmica, mas **não restaura a trajetória antiga**. Outros mecanismos, incluindo `slab suction`, continuam sensíveis à idade corrigida.
- O experimento não é consistentemente melhor em todos os indicadores: na semente 777/40K a divergência de contagem de placas frente ao baseline aparece **mais cedo** (108 contra 112 Ma); na 12345/20K surge divergência de contagem que não ocorria até 120 Ma. Não recomendar a restrição como padrão baseado no adiamento das primeiras mudanças.
- Um oceano de fundo passivo é uma construção numérica. Uma fronteira marcada `RIDGE` com esse reservatório não é automaticamente geologicamente inválida: o empuxo gravitacional decorre dos gradientes de espessura e potencial gravitacional da litosfera. A adequação do tratamento exige uma formulação física/geométrica melhor, não apenas desligar um limiar.

## Fontes físicas

- *Assessing plate reconstruction models using plate driving force consistency tests* (Scientific Reports, 2023): https://www.nature.com/articles/s41598-023-37117-w — ridge push como força associada ao gradiente de potencial gravitacional e espessamento térmico do assoalho.
- *Changes in Plate Motions Caused by Increases in Gravitational Potential Energy of Mountain Belts* (Geochemistry, Geophysics, Geosystems, 2022): https://doi.org/10.1029/2022GC010389 — a força costuma ser desenhada na dorsal, porém corresponde à estrutura de densidade da litosfera por toda a placa.
- *Slab pull and the seismotectonics of subducting lithosphere*, W. Spence (Reviews of Geophysics, 1987): https://pubs.usgs.gov/publication/70014244.

## Decisão

1. **Não mesclar** nem a restrição de empuxo do experimento nem a correção temporal à `main` nesta etapa.
2. A correção do timestamp permanece válida como integridade de dados, mas requer critérios de aceitação tectônica que não se limitem à reprodução da versão com datas falsas.
3. Em uma nova ramificação, testar uma formulação de empuxo baseada em **gradientes de potencial gravitacional/idade de litosfera**, com escalas espaciais em km e comportamento suave, sem um interruptor binário `idade<40` em cada contato.
4. **Antes de modificar a fórmula**, auditar quais feições distinguem uma dorsal dinâmica de um contato com o reservatório passivo e garantir que a regra não dependa da resolução bruta da malha.
5. Validar os cenários de dorsal, colisão, Laramide e supercontinente, incluindo `check-invariants`, `check-scale`, `check-phase13`, estatísticas de sete sementes e revisões cartográficas.

A distinção central é entre **corrigir proveniência de idade** (falha real) e **calibrar a física tectônica** (problema ainda aberto). Nenhum resultado da presente ablação valida uma nova configuração padrão.
