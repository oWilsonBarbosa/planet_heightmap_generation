# Orogen V2 — memória temporal da subducção na ampliação de arcos

**Data:** 2026-11-15. **Estado:** hipótese experimental, não aprovada. A linha de produto `main` permanece intacta.

## Motivação

[Auditoria anterior da origem de ARC](https://github.com/oWilsonBarbosa/planet_heightmap_generation/blob/audit/arc-reconstruction-provenance-20261115/reports/ARC_RECONSTRUCTION_PROVENANCE_2026-11-15.md): a ampliação de arcos com uma marca de fossa antiga, mas sem `OVERRIDING` no instante atual, contribuiu para grandes áreas ARC, sobretudo na seed 4242/20K. A restrição estritamente instantânea reduziu o agrupamento anômalo, mas **piorou o crescimento continental em outras sementes** e fez a suíte Phase 13 passar de 15/20 para apenas **12/20**. Não é uma correção geral.

Um contato tectônico pode oscilar de classificação entre passos, particularmente numa malha grossa, sem que a história geológica deixe de ser contínua. A pergunta é se uma curta persistência da atividade da subducção estabiliza a formação de arcos sem permitir seu crescimento indefinido.

## Regra experimental

`v2/js/tectonics/step/arc-activity.js` mantém, por **instância de mundo, id da placa e índice de célula nativa**, o instante da última classificação `OVERRIDING`. Uma célula com `TRENCH` pode ampliar um arco preexistente se:
1. o limite ainda for `OVERRIDING`, ou
2. houve uma classificação `OVERRIDING` naquela célula da mesma placa há não mais do que **W Myr**, onde W = 0, 15 ou 30 no ensaio.

O nascimento inicial de arco continua requerendo `OVERRIDING` atual. O modelo não muda a taxa de maturação, GPE nem a forma de fechamento dos mares. O caso W=0 reproduz a restrição instantânea anterior e permite comparação causal. A memória não atravessa automaticamente fusões de placa: essa limitação está registrada como parte da hipótese, não é um mecanismo geológico validado.

O estado usa `WeakMap` por mundo para evitar vazamento entre sementes ou cenários; testes verificam isolamentos por mundo/placa/célula e expiração temporal.

## Simulações executadas

[GitHub Actions #43707304121](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43707304121): seis histórias `cycle` para seed 4242, GPE distribuído 2.0, idade oceânica corrigida, maturação ARC 3 km/Myr, 1.200 Ma, 20K/40K células, janelas W=0/15/30. Quadros aos 900, 1000, 1100, 1200 Ma; cada job armazena CSV/JSON. Também foram iniciados `check-invariants` e `check-phase13` com W=15 e GPE default 1.0.

### Quadro final aos 1200 Ma (milhões km²)

| Memória W | ARC 20K | ARC 40K | Maior grupo ARC 20K | Maior grupo ARC 40K | Continental 20K | Continental 40K |
|---:|---:|---:|---:|---:|---:|---:|
| 0 Myr | **8.47** | 10.29 | 2.24 | 1.21 | 200.06 | 180.80 |
| 15 Myr | 11.40 | **10.07** | 4.90 | 1.39 | 199.53 | 179.49 |
| 30 Myr | **16.12** | 17.39 | 2.55 | **11.94** | 193.41 | 182.87 |

A janela de 30 Ma provoca **grande agrupamento em 40K** em seed 4242, que o modo de zero memória não produz. O regime de 15 Ma mantém ARC total parecida entre malhas, mas diverge no tamanho do maior grupo. A área continental permanece sensível à malha em todos os casos.

### Novos arcos por persistência, operações cumulativas a 1200 Ma

| Memória | 20K nascimentos com `OVERRIDING` recente mas não atual | 40K |
|---:|---:|---:|
| 0 | 0 | 0 |
| 15 | 242 | 580 |
| 30 | 297 | 650 |

São **operações**, não km² independentes; a mesma célula pode mudar de contexto tectônico e a evolução completa difere entre versões. O código também preserva o contador `arcWidenedAtNonOverridingCells`; neste experimento esses nascimentos são precisamente aqueles autorizados pela memória recente.

## Critérios e decisão

- **Não promover nenhuma janela de memória** a parâmetros padrão a partir de uma única seed. W=30 piora o maior agrupamento 40K, apesar de melhorar outros números.
- Exigir o resultado real de `check-invariants` e da suíte `check-phase13` antes de aceitar até mesmo a formulação como candidata.
- A semente 4242 é usada para investigação do defeito; é **dado de desenvolvimento**. O último ajuste deve ser avaliado também nas sementes 12345 e 777, e numa seed reservada (31337) sem calibrar a janela por ela.
- Não relaxar invariantes para permitir uma aparência geográfica melhor.
- Confrontar os dados do motor com mapas reais de célula, sem confundir `ARC` com terra emersa ou atividade vulcânica demonstrada.

## Coordenação com expert-spoon

Os métodos de verificação independentes do mundo (isolamento por região, SHA-256, conservação, comparação entre malhas, holdout de blocos e RMSE) foram propostos no [PR #3 do expert-spoon](https://github.com/oWilsonBarbosa/expert-spoon/pull/3), integrados ao módulo `shared_cartography` usado nas outras sessões. Dados e resultados específicos do ensaio de arcologia tectônica permanecem **nesta ramificação do gerador** e foram catalogados separadamente em `studies/world-orogen-v2/planetary/arc-audit/` no branch de integração do `expert-spoon`. As regras da V2 não são parâmetros aprovados do módulo compartilhado.
