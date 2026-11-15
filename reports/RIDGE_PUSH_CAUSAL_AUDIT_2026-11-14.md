# Orogen V2 — origem da divergência dinâmica: empuxo das dorsais

Data: 2026-11-14. **Comparação controlada**: `audit/tectonic-baseline-20261114` (timestamps antigos) vs `audit/ocean-age-return-20261114` (timestamp preservado). O motor de `main` NÃO foi alterado.

## Experimentos concluídos

- [Polaridade e movimento #43656346934](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43656346934) — três históricos emparelhados até 120 Myr, amostras a cada 2 Myr.
- [Atribuição dos componentes das forças #43656510805](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43656510805) — três históricos até 50 Myr, com vetores e torques de forças por placa.
- [Ablação `ridgePush=0` #43656658258](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43656658258) — três históricos até 80 Myr, comando aplicado **a ambas as versões**, sem alterar qualquer código do motor ou os parâmetros globais.
- Todos os jobs foram concluídos com sucesso; os dados emparelhados estão preservados nos artefatos JSON.

### Primeira divergência observada por snapshot (Myr)

| Semente / malha | Idade diverge | Com ridge push: 1ª força | Com ridge push: 1ª mudança de movimento | Com ridge push: 1ª mudança de ownership | **Sem** ridge push: 1ª força | **Sem** ridge push: 1ª mudança de movimento | **Sem** ridge push: 1ª mudança de ownership |
|---|---:|---:|---:|---:|---:|---:|---:|
| 777 / 20.001 | 30 | **30 (ridge push)** | 30 | 38 | **38 (slab suction)** | 38 | 60 |
| 777 / 40.001 | 24 | **24 (ridge push)** | 24 | 32 | **32 (slab suction)** | 32 | 36 |
| 12345 / 20.001 | 14 | **20 (ridge push)** | 20 | 40 | **42 (slab suction)** | 42 | 46 |

Como o intervalo de captura é de 2 Myr, o instante real da primeira alteração está no intervalo entre o snapshot anterior e o indicado. Os hashes de `owner`, idade, limites, polaridade e velocidade são comparados **somente em resoluções idênticas**, entre a versão base e a candidata.

### Primeiro componente de força divergente em cada histórico normal

O mesmo componente aparece na primeira diferença nas três simulações: `ridge push` passa de **0 para 1 célula participante** em uma placa. Nenhum `slab pull`, `slab suction` ou outro componente aparece como primeira diferença:

- 777 / 20K em 30 Myr: placa 2 (ACDEFGHIJMN), torque ridge-push 0 → ~0.1486 (unidade interna).
- 777 / 40K em 24 Myr: mesma placa, torque 0 → ~0.1051.
- 12345 / 20K em 20 Myr: placa 0 (ABCFGHIJMN), torque 0 → ~0.0495.

As velocidades mudam levemente na mesma captura; a propriedade geográfica diverge mais tarde. Na primeira alteração dos votos de polaridade observada, o **sentido vencedor não se inverte** no par apresentado: muda a extensão de sua frente. A história ainda pode sofrer outras bifurcações posteriormente.

### Experimento sem empuxo

Ao definir `world.config.ridgePush=0` **em ambas as versões**, o primeiro desvio de força e velocidade é postergado para 38, 32 e 42 Myr, respectivamente. Seu tipo passa a ser `slab suction`. A primeira mudança de propriedade tectônica é postergada de 38→60, 32→36 e 40→46 Myr, respectivamente. A diferença de idade persiste desde 30, 24 e 14 Myr, confirmando que o experimento não "desfez" a correção de proveniência.

**Conclusão causal limitada:** o ridge push adicional é o primeiro *gatilho dinâmico* identificado nas três histórias, mas a evolução posterior também depende de outras forças. Desativar totalmente ridge push **não é uma solução geologicamente aprovada**.

## Mecanismo no código

`v2/js/tectonics/step/forces.js` emprega:
```js
const isYoung = (crust, cell) =>
    crust.formedAt[cell] >= 0 && time - crust.formedAt[cell] < config.ridgeMaxAgeMyr;
...
else if (oceanA && oceanB && isYoung(A, cellA) && isYoung(B, cellB)) {
    kind = RIDGE;
    size = -config.ridgePush;
}
```
O limiar corrente `ridgeMaxAgeMyr = 40`. A idade falsa `formedAt=-1` remove o contato da condição, mesmo quando a crosta foi criada há poucos milhões de anos. Preservar `formedAt` torna o contato elegível e altera o torque sem requerer mudança prévia da geometria ou das velocidades.

A regra é **binária** e considera contatos entre duas crostas jovens, não integra explicitamente o gradiente de potencial gravitacional da litosfera. Isto é uma simplificação relevante; não significa, por si só, um erro de implementação do gatilho específico.

## Referências físicas para a próxima revisão

1. *Assessing plate reconstruction models using plate driving force consistency tests*, Scientific Reports (2023), https://www.nature.com/articles/s41598-023-37117-w — ridge push associado ao espessamento térmico dependente da idade e ao gradiente do potencial gravitacional; abordagens distribuem as trações sobre a placa em vez de confinar uma força na dorsal.
2. *Changes in Plate Motions Caused by Increases in Gravitational Potential Energy of Mountain Belts*, G-Cubed (2022), https://doi.org/10.1029/2022GC010389 — explicita que "ridge push" deve ser pensado como força distribuída associada à estrutura de densidade da litosfera, que se estabelece ao longo do tempo.
3. W. Spence, *Slab pull and the seismotectonics of subducting lithosphere*, Reviews of Geophysics (1987), https://pubs.usgs.gov/publication/70014244 — importância relativa de slab pull.

Essas fontes fundamentam o desenho físico de um experimento alternativo, **não a adoção direta de uma fórmula específica neste motor**.

## Próximo ensaio proposto

1. Auditar **a localização e classificação cinemática** dos contatos jovens onde ridge push é aplicado: dorsais ativas, margens transformantes, convergentes e oceano passivo, para identificar condições em que a regra binária produz força artificial.
2. Ensaiar em ramificação separada uma força **suave e dependente do gradiente de idade/espessura e orientação**, usando comprimento/área em km, km² — sem depender da contagem de células; não desligar ridge push no produto.
3. Validar casos prescritos de rifting, dorsal e Laramide, rodar `check-scale`, `check-invariants`, `check-phase13`, e pares de histórias nas sete sementes anteriores. Avaliar impacto tanto em idade oceânica quanto em conectividade continental e geomorfologia.
4. **Não alterar o limiar `ridgeMaxAgeMyr`, tolerância de escala, ou regra de subducção só para obter PASS no teste.** Escolher alterações físicas justificadas e demonstrar ausência de regressões relevantes.

## Decisão

A correção do timestamp `giveToBackground` continua **isolada e correta quanto à proveniência**, porém **não aprovada para merge**: existem regressões geológicas de escala e topologia em histórias específicas. A presente investigação demonstra o gatilho inicial da divergência e dá uma direção concreta para desenvolver o modelo de forças sem restaurar a datação sabidamente incorreta.
