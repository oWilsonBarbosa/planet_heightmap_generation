# Orogen V2 — validação ampliada e decisão sobre ajuste de meia taxa

Data: 2026-11-14. **Status:** candidato de calibração NÃO aprovado para `main`. Esta auditoria mede crosta tipada no mesh tectônico, não relevo emerso. A implementação do gerador é preservada. Todos os números abaixo foram extraídos de CSVs gerados pelo GitHub Actions, com pares semente + resolução idênticos.

## Reprodutibilidade

- [Run #43648107974](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43648107974), concluído com sucesso: controle e `bothHalf` para 4 novas sementes no mesh 20K; `bothHalf` para sementes originais no 40K.
- [Run #43645710542](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43645710542), concluído com sucesso: controle para 3 sementes no 20K e 40K.
- [Run #43647683459](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43647683459), concluído com sucesso: `bothHalf` e doses alternativas em 20K para 3 sementes.
- Base do gerador: `7026cc6526fa637611d05804a4cec8eed04de017`. Somente configuração por mundo, scripts e workflows da ramificação de auditoria foram alterados; parâmetros do `main` não foram modificados.

`bothHalf` define `arcContinentKmPerMyr = 1.5` (original 3), `marginIsleRatePerMyr = 0.3` (original 0.6), `marginIsleGrowKmPerMyr = 5` (original 10), `marginIsleCoastShare = 0.2` inalterado. Interpretação: alterações mudam toda a história, não apenas um número ao final.

## Sete sementes a ~20K células: crescimento 0–1200 Myr

| Semente | CONTINENT+CRATON controle (p.p.) | Ajuste (p.p.) | Todo não oceânico controle (p.p.) | Ajuste (p.p.) |
|---|---:|---:|---:|---:|
| 12345 | +10.79 | +6.87 | +12.87 | +10.36 |
| 4242 | +10.25 | +4.71 | +14.29 | +9.57 |
| 31337 | +13.45 | +6.69 | +14.97 | +14.31 |
| 777 | +11.87 | +3.26 | +15.45 | +7.55 |
| 2026 | +9.72 | +6.15 | +15.56 | +10.03 |
| 8765 | +7.22 | +6.53 | +12.11 | +10.93 |
| 31415 | +6.61 | +6.45 | +10.26 | +10.75 |
| **Média** | **+9.99** | **+5.81** | **+13.64** | **+10.50** |

Crosta não oceânica = CONTINENT + CRATON + ARC. A taxa de redução relativa do ganho é **41,8% para continental** e **23,0% para não oceânica**; diferenciar cuidadosamente os dois números. No caso 31415, toda crosta não oceânica cresce *mais* no ajuste (+0,49 p.p.).

O ajuste aumenta em 20K a proporção média de ARC ao final, de 3,65% para 4,69% da superfície. Parte da melhora em CONTINENT é **reclassificação retardada**, não redução de criação de crosta.

## Três sementes a ~40K células

| Semente | Continental controle → ajuste (ganho p.p.) | Não oceânico controle → ajuste (ganho p.p.) | Idade média oceânica controle → ajuste (Myr) | Maior bloco continental controle → ajuste (% da crosta continental) |
|---|---|---|---|---|
| 12345 | +9.50 → +7.85 | +11.58 → +9.59 | 219.8 → 189.9 | 84.5 → 89.3 |
| 4242 | +7.23 → +3.74 | +11.91 → +7.69 | 99.1 → 149.4 | 65.3 → 59.2 |
| 31337 | +12.24 → +1.92 | +16.05 → +5.24 | 100.8 → 168.5 | 96.4 → 47.2 |
| **Média** | **+9.66 → +4.50** | **+13.18 → +7.51** | **139.9 → 169.3** | **82.1 → 65.2** |

**Conflito importante:** em 20K, o ajuste reduz a idade oceânica média ao final (três seeds: 129,7 → 94,5 Myr), enquanto em 40K a aumenta (139,9 → 169,3 Myr). Isso é forte sinal de insuficiência de convergência de resultados ou mudanças qualitativas na história tectônica em resposta à malha. A diferença de resposta não prova isoladamente um bug numérico, porque o modelo inclui mecanismos históricos de bifurcação e aleatoriedade.

### Crosta oceânica herdada do início da simulação

O campo `formedAt<0` identifica crosta pré-existente. Em 40K, aos 1200 Myr:

| Semente | % do oceano com `formedAt<0` controle → ajuste | % com idade >200 Myr controle → ajuste |
|---|---|---|
| 12345 | 10.35 → 7.85 | 23.94 → 19.93 |
| 4242 | 2.27 → 2.92 | 9.59 → 18.79 |
| 31337 | 1.53 → 5.37 | 11.62 → 21.86 |

Apenas a fração por denominador oceânico não basta para aferir 'reaparecimento' de crosta antiga; o total de oceano muda. Exige-se medir a área absoluta pré-existente, a idade média do material preexistente e do pós-início em separado, bem como a distribuição etária. A hipótese de visibilidade de crosta antiga por mudança de sobreposição entre placas ainda **não foi verificada**.

## Referência científica e interpretação

Seton et al. (2020), *A Global Data Set of Present-Day Oceanic Crustal Age and Seafloor Spreading Parameters*, Geochemistry, Geophysics, Geosystems, DOI [10.1029/2020GC009214](https://doi.org/10.1029/2020GC009214), estimam média terrestre de **64,2 Myr**. Não é lei universal para planetas imaginários ou todos os tempos geológicos; é uma referência de calibração da distribuição de idades. Exceções terrestres de crosta oceânica antiga existem: Granot (2016), *Palaeozoic oceanic crust preserved beneath the eastern Mediterranean*, [Nature Geoscience](https://www.nature.com/articles/ngeo2784), descreve crosta da ordem de 340 Myr. No caso do simulador, frações **extensas** de oceano excepcionalmente antigo demandam explicação geodinâmica.

## Decisão e próximo ensaio

1. **NÃO incorporar `bothHalf` ao `main` nesta fase.** Melhora a área continental, mas o balanço de crosta total e a idade oceânica ainda falham em estabilidade entre casos.
2. Separar métricas da crosta oceânica **herdada** (`formedAt < 0`) da **formada dentro da simulação** (`formedAt >= 0`) e medir sua área absoluta em todos os quadros, inclusive surgimento tardio.
3. Repetir casos 20K e 40K com um novo conjunto de métricas de idade **sem alterar os processos do motor**.
4. Confrontar transições do estado tectônico, mapas e arcos em eventos de mudança abrupta; não impor um teto arbitrário de idade, pois esconderia falhas de reciclagem/subducção.
5. Depois verificar condições de aceitação para área e crosta total, idade do assoalho e consistência de organização de grandes massas em várias malhas; só então experimentar correção causal específica.

Relatórios anteriores: `reports/GEOGRAPHY_ABLATION_FINDINGS_2026-11-14.md`, `reports/GEOGRAPHY_HALF_RATE_RESULTS_2026-11-14.md`. Esta revisão completa a avaliação dos experimentos solicitados sem atribuir aos testes uma precisão que não oferecem.
