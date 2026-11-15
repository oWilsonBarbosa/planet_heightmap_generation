# Diagnóstico causal de lago glacial — malhas 640K e 1,28M

Data: 2026-11-15. **Somente observação; nenhuma alteração nas regras de hidrologia.**

Origem: métodos de auditoria de soleiras, curvas área–cota–volume e balanços sazonais do projeto `expert-spoon/piloto_bacia_costeira/`, especialmente `revisar_soleiras.py`, `testar_retencao.py` e `balanco_sazonal.py`. Aqui foram implementadas curvas geométricas simplificadas até a soleira, **não** uma integração do simulador sazonal nem uma validação Fill–Spill–Merge completa.

## Experimento

- Mundo de regressão do Evolution, **semente 10673275**, não o atlas Orogen canônico.
- Coordenadas: **−76,1394°, 108,9841°**; círculo de raio 180 km; 640.001 e 1.280.001 células; mesma simulação tectônica e clima.
- `tuning/evolution/drainage.mjs --cells 640000,1280000 --glacial-site --lake-match`.
- O diagnóstico opcional em `finish.js` registra altitudes no entorno antes e depois de `lastIceAge`. O diagnóstico de `finish-hydro.js` observa a descoberta de cada depressão adjacente, classificação de origem, cotas, soleiras, volume geométrico, afluência, evaporação, critério `keepKm2`, incisão/saída e corpo efetivamente preservado.
- [Execução e log arquivado — GitHub Actions](https://github.com/oWilsonBarbosa/planet_heightmap_generation/actions/runs/43758596078). O job **falha no portão de convergência preexistente, 31/32 aprovados**, e não por falha na instrumentação.

## Controles ambientais

| Medida no círculo de 180 km | 640.001 | 1.280.001 |
|---|---:|---:|
| Células | 128 | 256 |
| Área aproximada, km² | 102.013 | 102.013 |
| Proporção glaciada | 100% | 100% |
| Altitude média antes da glaciação, km | 0,2697 | 0,2655 |
| Altitude média depois da glaciação, km | 0,1714 | 0,1670 |
| Precipitação média, mm/ano | 336,65 | 337,51 |
| Escoamento médio, mm/ano | 278,21 | 279,07 |
| PET média, mm/ano | 60 | 60 |
| Células de lago doce no recorte | 21 | 4 |

As diferenças no clima são pequenas. A perda lacustre não é explicada diretamente por chuva, escoamento ou evaporação. O cálculo de déficit evaporativo `max(0, 1.2 * PET − chuva)` foi **zero** nas grandes depressões rastreadas, então as condições hídricas sustentam o armazenamento. Os canais que atravessam as depressões e os critérios de retenção são determinantes.

## Principais depressões

### 640K — lago efetivamente preservado

- Hollow `823`: **16 células = 12.751,6 km²**, inteiramente glaciais, profundidade potencial **44,21 m**, fundo **101,32 m**, soleira **145,53 m**, exutório `629672`.
- Capacidade geométrica até a soleira **246,591 km³**. Curva volume aproximada: a 112,38 m, 27,524 km³ / 3.187,9 km²; a 123,43 m, 67,864 km³ / 4.781,9 km²; a 134,48 m, 140,405 km³ / 7.969,7 km²; e a 145,53 m, 246,591 km³ / 12.751,6 km².
- Vazão afluente **355,587 m³/s**, déficit evaporativo 0, área exigida `keepKm2 = 1.490,78 km²`, sem desfiladeiro cortando abaixo da superfície. Resultado: **16 células / 12.751,6 km² de lago doce**.

### 1,28M — drenagem e perda

- Uma grande depressão associada ao mesmo recorte, `hollow 912`, tem **338 células = 134.689 km²**, profundidade potencial **160,33 m** e soleira **109,28 m**, mas é interceptada por um canal inciso com cota de cruzamento **96,06 m**. A regra `drainedByGorge=true` drena-a integralmente; a afluência ~**21.261 m³/s** e o déficit evaporativo zero não são suficientes para impedir a drenagem pela conexão geométrica.
- Outra depressão `hollow 2424` (~231.123 km²) é classificada como lago inicialmente elegível; após decisões de corte e seleção da água conectada, preserva **zero células**, apesar de 10.143 m³/s de afluência, déficit evaporativo zero e critério mínimo de área ~7.962 km². Necessário rastrear por que o conjunto de `water` ficou vazio; o rótulo diagnóstico `other-or-retained` é genérico e **não constitui causa física**.
- Depressão local `hollow 942`, **2.789 km²**, profundidade **14,79 m**, não satisfaz a profundidade mínima de 15 m e sequer se torna candidata a lago.
- A área total de água doce no círculo de 180 km passa de **21 células ×796,97 km²** (~16.736 km²) para **4 ×398,49 km²** (~1.594 km²). Essas áreas incluem todos os corpos presentes no recorte, não são a área de um único lago.

## Interpretação provisória

**Dois mecanismos confirmados no diagnóstico:**

1. As depressões de mesma região têm profundidades, soleiras e conexões diferentes entre malhas; a incisão de desfiladeiros modifica sua retenção independentemente da chuva.
2. Alguns hollows da malha fina se tornam não elegíveis pela profundidade mínima de 15 m; outros elegíveis são cortados ou terminam sem células de água conectadas.

**Pendências para provar o mecanismo completo:** parear as mesmas depressões pelo perímetro/footprint, não só pelo recorte; rastrear `hollow 2424` imediatamente antes e depois de `cutPockets` e da seleção de água; comparar `F.lakeMinDepthM`, `F.breachKm`, `F.glacialBreachShare` e as regras de incisão sob ensaios A/B isolados. Não concluir que o limiar de 15 m esteja errado apenas porque uma depressão ficou 0,21 m abaixo dele.

**Importante:** áreas e volumes foram calculados sob hipótese de células com área média uniforme, com precisão insuficiente para inferir volumes reais de lagos tão extensos. Não migrar cânone, não alterar parâmetros padrão para obter aprovação do teste por construção.
