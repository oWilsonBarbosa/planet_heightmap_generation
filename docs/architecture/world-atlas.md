# Atlas — decisão de arquitetura (Fases 0–1)

## Auditoria e decisão anterior à implementação

Orogen usa módulos ES, Three 0.160, Delaunator 5, workers e nenhum build obrigatório.
`curData.r_xyz` é a fonte efetivamente usada pela renderização: latitude = asin(y),
longitude = atan2(x,z). Não inferir coordenadas pelo gerador Fibonacci isolado.
Elevação é normalizada: converter por `elevToHeightKm`. Temperaturas sazonais
usam -45 + 90 × valor. Chuva é normalizada p95; não equivale a mm/ano.
Köppen está em debugLayers.koppen. Clima pode estar ausente ou ser recalculado.
Não havia suíte geral de testes nem package.json; tuning/climate é específico ao motor.
Licença do projeto: GPL-3.0; nenhum PDF será incorporado.

Escolha: H3 JS 4.3.0, distribuído localmente com licença Apache-2.0 preservada.
Custo: aproximadamente 458 KiB de JS sem compressão; carregamento dinâmico somente
quando o atlas é ativado. Sem framework ou mudança do pipeline físico.
H3 fornece identidade, áreas esféricas e topologia verificáveis, incluindo 12 pentágonos.
Uma grade icosaédrica própria permitiria estilo/escala sob medida, mas exigiria validar
projeções, topologia e identidade. Índices Voronoi variam com Detail e foram descartados.

## Contrato do protótipo

IDs `h3:<index>` e versão atlas-h3-v1 independem de Detail e da semente.
H3 resolução 1: 842 células, aresta média ~483 km; diâmetro de referência ~966 km.
Resolução 3: aresta média ~69 km; diâmetro ~138 km. Não são os 800/160 km exatos.
Área calculada na esfera de raio 6371.007 km; tamanho planetário configurável fica pendente.
Refinamento exibe somente o disco de raio 2 da célula selecionada (até 19 células).
A localização selecionada é lat/lon, sem ajustá-la ao centro; mudar nível recalcula o ID
nessa posição. H3 tem ancestralidade lógica, mas fronteiras não são aninhadas exatamente.

Agregação: 25 pontos determinísticos uniformes na área em latitude/seno(latitude),
filtrados pelo ID da célula, com busca do ponto físico mais próximo por produto escalar.
Centro é fallback quando a amostragem não encontra pontos. Média de altitude física,
fração de terra, média das temperaturas sazonais e índice médio de chuva; Köppen modal.
Registrar quantidade de amostras e resolução física. Valores não são precisão local nova.
O painel regional mantém também o agregado global da posição, com o mesmo método,
independentemente do nível exibido (tolerância entre níveis: zero para esse agregado).
Diferenças após Detail são exibidas como deltas; não há tolerância científica universal.
Sem cache permanente: trabalho limitado à seleção atual, no máximo 26 buscas por agregado.

## Verificação planejada

Testes Node: identidade, determinismo, 12 pentágonos, vizinhança recíproca, cobertura,
áreas, polos, antimeridiano, projeção e agregação. Teste navegador desktop/móvel:
gerar planeta, selecionar, alternar projeção, refinar, mover meridiano e mudar Detail.
Medir geração, tempo de seleção e memória quando a plataforma disponibilizar.
Não adicionar persistência/edições nem regras dos livros nesta fase.

## Relatório de execução — 2026-10-18

Base auditada: `cc2662b` em main. Branch: `feat/world-atlas-poc`.
Detail mínimo real no código é **5.000 + ponto de fechamento**, apesar de comentários
antigos citarem 2.000. Nenhum módulo do motor foi modificado.

- `node tests/world-atlas.test.mjs`: 3 testes passaram. Cobertura de 842 células,
  reciprocidade de todos os vizinhos globais, 12 pentágonos, soma das áreas esféricas,
  polos/seam, ida e volta vetor/coordenada e agregação determinística.
- Chromium headless com SwiftShader: geração completa com clima; grade ligada sem
  alteração dos arrays físicos; clique/toque; manutenção de ID e texto ao mudar para
  mapa; nível regional com referência global idêntica; rebuild com mesma semente
  de 5.001 para 31.001 regiões conservando ID e mostrando deltas; sem erro JS.
- Desktop 1280×800, execução final: carregamento + geração inicial ~4,31 s
  (inclui dependências e polling de 1 s; não é tempo isolado do worker).
  Inspeção global 14,7 ms, regional 9,5 ms; regional após Detail 18,2 ms.
  Heap JS observado após rebuild ~111 MiB; não inclui toda a memória GPU/workers.
  Nesta amostra, altitude regional mudou +1321 m após Detail; isso é variação dos
  campos gerados/amostrados, não falha de identidade. Não esconder diferenças.
- Emulação móvel 390×844 com toque: geração, seleção, troca de projeção e refinamento
  verificados; execução final 5,01 s de carregamento + geração, seleção global
  10,1 ms e regional 8,0 ms; heap após rebuild ~138 MiB. Sem overflow horizontal.
  Não representa desempenho de um telefone físico e não houve throttling de CPU.

### Reproduzir

1. `python -m http.server 8000` na raiz; abrir http://localhost:8000/generate.html.
2. Gerar planeta, abrir Atlas do mundo, ativar e selecionar posição. Alternar View
   e Escala cartográfica. Regenerar com a mesma semente e Detail diferente.
3. `node tests/world-atlas.test.mjs`.
4. Com Python Playwright e Chromium instalados: `python tests/atlas-browser.py`;
   repetir com `ATLAS_MOBILE=1`. `CHROMIUM_PATH` permite selecionar o executável.
   O teste usa Detail mínimo por interceptação da página, sem alterar o default real.
   Artefatos de tela ficam em /tmp. No ambiente de execução havia problema de CA
   no Chromium para os CDNs existentes; somente o teste usou
   `ATLAS_IGNORE_HTTPS_ERRORS=1`. A aplicação e os comandos de download preservam TLS.

### Limitações e próximos critérios

Amostragem é uma quadratura pequena, aproximada; sobretudo células polares precisam
validação adicional de convergência da área amostrada. Os 25 candidatos não são uma
integração exata do polígono. Comparar 5×5 com quadraturas maiores antes de usar para
estatísticas quantitativas. Área H3 é confiável na esfera assumida; agregados são proxy.
Seleção percorre N regiões por amostra: custo O(25N), até duas agregações por seleção.
Não foi medido em 2,5 milhões de regiões. Um índice espacial/worker será necessário
antes de ampliar esse uso; atlas desligado não executa buscas nem carrega H3.
Testes geográficos de bordas são matemáticos; não houve automação de cliques em todos
os vértices de projeção, exportações de alta resolução ou todos os fluxos de edição.
O teste não compara a geração atual com uma execução anterior da versão original;
verifica que ligar a grade não altera os campos. Não houve mudança de física/clima,
portanto o tuning Earth-match não foi executado. Nenhum ganho de precisão local,
persistência, edição de atlas ou conteúdo das fases seguintes é reivindicado.


## Atualização para o main — 2026-10-26

Base atual: `7026cc6`; o PR #1 incorpora esse main por merge, preservando o histórico
`502a4c9` do protótipo. `index.html` permanece idêntico ao main, com o Studio como
página inicial. O atlas está em **Generate** (`generate.html`); não está conectado ao
Evolution nem abre os arquivos particulares de pesquisa.

A montagem do painel acompanha a nova barra lateral. As linhas 2D passam pelo
pipeline de projeção do main; o clique usa sua inversa `mapLonLatAt`, incluindo o
meridiano central. Ctrl e Cmd continuam disponíveis para os controles de edição.
Nenhum arquivo do motor físico ou de `v2/js` difere do main nesta proposta.

Para o clima atual, o agregado lê `climate.cells.t.year` em graus Celsius e converte
`climate.cells.p.year`, média mensal de precipitação, para mm/ano multiplicando por 12.
Valores oceânicos NaN não entram na média continental; o painel informa a quantidade
de amostras válidas. O formato legado continua identificado como índice normalizado.
Essas médias aproximadas não são estimativas independentes do simulador.

Verificações executadas:

- Cinco testes Node passaram, incluindo as verificações anteriores de identidade,
  área e vizinhança e os novos contratos de unidades climáticas e ausência de clima
  continental em células oceânicas.
- Chromium por HTTP, desktop 1280×800 e emulação móvel 390×844: página inicial Studio,
  geração, grade opcional, clique/toque no globo, refinamento e Detail 5.001 → 31.001.
  A ativação do atlas preservou os arrays de elevação e clima observados pelo teste.
  Os IDs persistiram após a mudança de Detail; os valores físicos mudaram e seus
  deltas permaneceram visíveis.
- Cliques em equiretangular, Robinson, Mercator e Mollweide mantiveram o mesmo ID
  geográfico. Mollweide também foi testada com meridiano central em 35°.
- Sem erros JavaScript ou overflow horizontal nas duas execuções. Capturas finais
  foram inspecionadas; logs estão em `docs/validation/atlas-20261026-*.json`.
- Desktop: carregamento + geração inicial 16,26 s; agregados global/regional em
  0,7/1,4 ms e regional após Detail em 29,7 ms; heap observado ~103,5 MiB.
- Emulação móvel: carregamento + geração inicial 14,30 s; agregados em 1,5/1,7 ms
  e regional após Detail em 13,9 ms; heap ~141,4 MiB.

As execuções usaram mundos Generate com a seed inicial aleatória registrada nos
logs; cada rebuild preservou sua seed. Os tempos incluem rede, renderização e
polling, não são uma comparação controlada com 18/10. Emulação não mede um telefone
físico, e heap JS não representa toda a memória do processo, dos workers ou da GPU.
O teste por HTTP usou a exceção de CA já descrita apenas no navegador de teste.

Continuam pendentes a convergência da quadratura de 25 candidatos, o desempenho
em milhões de regiões, os eventos de todas as dez projeções e a conexão ao Evolution.
As limitações O(25N), raio terrestre fixo e ausência de persistência/edição permanecem.
Não foi necessário executar Earth-match nesta portabilidade: o motor físico é o
mesmo do main; as verificações climáticas da outra proposta pertencem ao PR #2.
