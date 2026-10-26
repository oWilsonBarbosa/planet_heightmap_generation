# Estado do fork e da integração

Referências conferidas em 26/10/2026. Este documento é o ponto de entrada para o trabalho do fork; `plans/FORK_HANDOFF.md` preserva o histórico anterior de clima e água.

## Papéis das linhas de trabalho

| Linha | Referência | Papel e estado |
|---|---|---|
| `main` | `7026cc6` | Acompanha o projeto original. Não é alterado por esta proposta. |
| `integration/climate-hydrology` | main + `a66a5b4` | Candidata à integração de clima, neve e hidrologia; revisão e validação ainda abertas. |
| `ccr-85cb1372-invlm5` | `a66a5b4` | Trabalho de origem preservado; seus commits são incorporados pela proposta de integração. |
| `feat/world-atlas-poc` | `502a4c9`, PR #1 | Protótipo de atlas. Portar a seleção e os controles para a interface atual em trabalho separado. |
| `chatgpt/regenerate-cc2662b4` | `4936796` | Reprodução e diagnósticos de uma base Generate antiga. Manter a versão identificada. |
| `audit/geography-baseline-20261023` | `2555d52` | Registro histórico da auditoria inicial. |
| `claude/affectionate-brahmagupta-f8xp05` | `6de9489` | Experimentos do clima antigo; revisão seletiva pendente. Não transportar seu cache Python. |
| `claude/orogen-map-generation-fmg-udqzoj` | `3b13df2` | Experimentos antigos de clima e interface; revisão seletiva pendente. |
| `claude/simulate-time-in-cells-zgwcbn` | `70077db` | Protótipo de Almanac; avaliar separadamente do Evolution atual. |

As referências acima são versões identificáveis, não indicações de que todos os experimentos devam ser mesclados. Nenhum branch histórico é apagado nesta proposta.

## Feito nesta integração

- [x] Comparados o main atual e a linha de origem do fork, com base comum `47edc28`.
- [x] Preservadas as atualizações de interface, projeções, exportação, seeds e salvamento presentes no main.
- [x] Incorporados os módulos e ferramentas de clima e água de `ccr` em uma candidata separada.
- [x] Resolvidos conflitos em README, parâmetros climáticos e chuva. Mantidos a atenuação polar e a largura de Hadley do upstream, os novos parâmetros de neve do fork, o fator orográfico sazonal (`orographicK`) e o teto opcional de chuva.
- [x] Mantido o teto opcional de chuva desligado nos padrões do site, conforme a linha de origem.
- [x] Teste existente de seeds passou.
- [x] Módulos JavaScript modificados passaram na checagem de sintaxe.
- [x] Verificações de execução passaram em 40.001 e 160.001 células de acabamento, usando uma cópia de um frame histórico. As saídas históricas originais não foram regravadas.
- [x] Repetição em 40.001 células produziu arrays idênticos por SHA-256.
- [x] Codec, salvamento/leitura de um planeta novo e migrações sintéticas passaram na parte executável de `check-save.mjs`.
- [x] Avaliados README, tutorial e metadados: README atualizado; nenhum controle ou fluxo de UI novo nesta integração; tutorial e SEO mantidos.

As verificações de execução incluem terreno finito, coordenadas e vazões de rios finitas, comprimentos dos arrays, códigos de regime, clima terrestre e níveis de lago finitos e fechamento das frações anuais de runoff. Não demonstram ausência de todos os problemas físicos de drenagem.

## Falta antes de aprovar o merge

- [ ] Executar `node tuning/climate/evaluate.mjs` no main e na candidata, com o arquivo de referência Köppen disponível, e comparar os resultados.
- [ ] Executar `node tuning/climate/coupled-check.mjs --quick` com as referências observadas da Terra e verificar não regressão.
- [ ] Executar `node tuning/climate/planets-dry.mjs` com as mesmas referências e verificar não regressão.
- [ ] Disponibilizar o fixture binário `v2/tools/fixtures/saves/format1-frame1-finish1-codec1.orogen` e concluir `node v2/tools/check-save.mjs`. A execução local terminou com duas falhas pela ausência desse fixture; a suíte completa não foi declarada aprovada.
- [ ] Repetir a avaliação de vazões terrestres (`tuning/water/earth-rivers.mjs`) com os dados observados pertinentes.
- [ ] Decidir a integração após essas comparações. Esta candidata é um rascunho, sem merge automático.

Os dados observados não estavam disponíveis no ambiente desta rodada. O transporte Git falhou; os arquivos de texto foram obtidos pelo conector GitHub e verificados contra seus hashes Git. O conector não forneceu o fixture binário. Esse arquivo existente foi preservado na árvore proposta, sem substituição ou remoção.

## Depois da integração física

- [ ] Portar o atlas do PR #1 de `index.html` para o Generate atual (`generate.html`), preservar o Studio na página inicial e repetir seleção, sincronização 2D/3D e testes de toque.
- [ ] Revisar os experimentos antigos, preservar os resultados úteis e decidir seu arquivamento após haver uma referência de recuperação.

## Proveniência e pesquisa

Uma seed não identifica sozinha um resultado: registrar modo de geração, parâmetros, época, resolução e commit. O estudo Evolution baseado em `47edc28` e os conjuntos Generate antigos são referências distintas; mudanças nesta candidata não alteram retroativamente arquivos já salvos.

Relatórios particulares, mapas e matrizes permanecem fora do código distribuído, conforme `.gitignore`. Seu catálogo e o registro de execução são mantidos separadamente. Esta proposta publica o código e o estado técnico de integração, sem incorporar os dados particulares da pesquisa.
