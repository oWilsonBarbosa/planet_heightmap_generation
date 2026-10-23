# Orogen Evolution — auditoria geográfica inicial (2026-10-23)

## Escopo e reprodução

Baseline: `main` em `47edc28acc17719b6bed03e211d20eb87441c2be` (merge V2 tectonics, 2026-10-19). Este documento separa *resultados anteriormente registrados*, *hipóteses* e *ensaios a executar*. Nenhum teste ou planeta novo foi executado nesta etapa: o ambiente de análise não conseguiu clonar o repositório; a inspeção foi efetuada pela API do GitHub.

Preservar o `main` e não alterar parâmetros geológicos antes de medir.

## Evidência de base (não são novos resultados)

Fonte: `plans/V2_REALISM_PASS_PLAN.md`, seção **Impact log**, do conjunto de testes de 18 de outubro (seed 12345/777/4242; 40K sim; 1200 Myr, salvo indicação). O relatório registra:
- maior placa: 41–76% da superfície em várias histórias;
- placas >=1%: >=6, com excessos temporários de concentração;
- crescimento de terra em 1200 Myr: +5,7 a +9,4 pontos percentuais (faixa entre cenários);
- novo supercontinente entre 620–870 Myr, com um caso tardio;
- idade média oceânica: 104→91 Myr em uma história específica, 20K/seed 4242, contra referência terrestre aproximada de 64 Myr;
- arcos em oceano aberto ainda excessivos em alguns cenários;
- `check-phase13`: algumas metas declaradamente ainda não satisfeitas.

O documento registra que mudanças posteriores removeram ruído isotrópico das montanhas, ajustaram litoral jovem e transportaram geometria das faixas montanhosas por kernels. Essas melhorias requerem medição independente.

## Diagnóstico técnico inicial

Há testes de ciclo e de plausibilidade no código, mas o `check-phase13.mjs` mede principalmente crusta continental conectada, arcos, áreas e tempos de reagrupamento; não qualifica suficientemente costas nem a morfologia de cada bloco continental. As funções `shapeOf` e `comps` trabalham no mesh simulado: costa sinuosa refinada pode exigir dados do terreno sintetizado.

Problemas a investigar, em ordem: (1) concentração extrema de placas; (2) ganho continental e balanço crosta/emergência; (3) margens conjugadas após rifting; (4) supercontinentes com pescoços e mares aprisionados; (5) ilhas de arco muito extensas; (6) cadeias e bacias geomorfologicamente coerentes.

## Protocolo de avaliação

**A. Fixar 12 histórias** — sementes 12345, 4242, 31337 em 20K, 40K, 80K e 160K células tectônicas; 0–1200 Myr; registrar a cada 100 Myr e eventos. Não misturar diferenças de resolução com variabilidade por seed.

**B. Métricas por quadro** — fração de superfície de crosta continental, fração de terra emersa, contagem de placas >=1%, área da maior placa, idade do fundo oceânico (média e >200 Myr), total e maior arco oceânico, número/área dos blocos continentais conectados, área de mares internos, alongamento e compactação. Empregar métricas de km e km², não contagem bruta de células.

**C. Geometria de continentes** — por bloco acima de um limiar fixo (km²), calcular área, perímetro costeiro, compacidade 4πA/P² (com cautela para costas fractais e dependência da resolução), alcance latitudinal, alongamento principal, área de ilhas e gargalos. Reamostrar o perímetro num comprimento fixo (por exemplo 100 km) antes de comparar entre resoluções e com a Terra. Diferenciar "bloco de crosta continental" de "terra acima do nível do mar".

**D. Auditoria visual cega** — para os mesmos frames e sementes, salvar mapa global, placas, idade oceânica, relevo sombreado e hidrografia. Verificar manualmente continuidade de cristas, morfologia dos rifts e costas conjugadas, coerência das cordilheiras, localização de forelands, nível de recorte costeiro e ilhas de arco.

**E. Comparação com a Terra** — referência, não função objetivo única: contagem/área de placas, idade oceânica, frações hipsométricas e estatísticas de distribuição dos blocos continentais. Não forçar área de cada continente, posição de oceanos, velocidades ou tempo exato de montagem do supercontinente.

**F. Critérios de regressão** — manter deterministicidade por seed/código, continuidade dos litorais durante rotação, ausência de NaN, preservação de feições na mudança de resolução, performance e memória. Rodar `node v2/tools/check-invariants.mjs`, `node v2/tools/check-scale.mjs`, `node v2/tools/check-phase13.mjs`, e demais check scripts pertinentes.

## Registro de execução

- [x] Branch isolada de auditoria.
- [x] Inspeção dos arquivos `v2/js/tectonics/config.js`, `v2/js/terrain/synthesize.js`, `v2/tools/check-phase13.mjs` e relatórios.
- [ ] Executar suites Node em checkout de `main`.
- [ ] Gerar 12 séries e CSV de métricas.
- [ ] Gerar pranchas cartográficas.
- [ ] Classificar problemas por gravidade/frequência e definir primeiro ajuste.
- [ ] Implementar e medir mudanças uma por vez, com comparações antes/depois.

## Decisão atual

**Não retocar parâmetros ou acrescentar ruído costeiro antes dos testes.** Ruído não corrige a gênese de massas continentais ou comportamento do ciclo tectônico. A primeira alteração, quando justificada por medidas, deve atuar na variável causal e usar testes de não regressão.
