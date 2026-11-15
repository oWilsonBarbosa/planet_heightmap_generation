# Integração experimental Orogen sobre v3.0.1 — 2026-11-15

**Não migrar o cânone e não fundir no main sem testes.**

Base v3.0.1: `ed466f9`; fork: `c10969c`; ancestral comum `7026cc6`. Os 51 arquivos do fork não sobrepostos foram transferidos anteriormente. A resolução tripla agora contempla:

- `v2/README.md`: conteúdos compatíveis combinados.
- `v2/js/finish/finish-config.js`: parâmetros de grandes lagos do v3 e os parâmetros de bacias fechadas do fork.
- `v2/js/finish/finish-hydro.js`: `flatKey` do v3 junto a bacias endorreicas, correções de roteamento e sazonalidade do fork.
- `v2/js/finish/finish.js`: novos dados de geologia, agricultura, detalhes e superfície do v3, mais opção `network` e drenagem do fork.
- `README.md`: mantida a documentação principal do v3 para evitar textos obsoletos; o histórico do fork permanece em `docs/`.

Foi feita apenas checagem **sintática estática** dos três arquivos JS alterados (V8 após retirada de linhas de import/export). Ainda faltam testes de importação, unidade, integração, determinismo, simulação completa, drenagem e validação física.

## Próximas verificações
1. Executar `node --test tests/river-transport.test.mjs tests/river-metrics.test.mjs`.
2. Verificar drenagem em `tuning/evolution/drainage.mjs` (160K e 640K), conservação de água, níveis, ausência de ciclos, salinas e tempo de viagem.
3. Gerar novamente o planeta `06cy8w6z6a89kow6psje93` com o worker atual e acabamento integrado.
4. Comparar Köppen, extremos do Ártico, bacias endorreicas, salinas e fundo marinho ao baseline `reports/generator-v3/` do repositório 0r063N.
5. Reescrever compatibilidade de exportação com as novas camadas tectônicas antes de qualquer migração.

`closedBasins` permanece false no FINISH padrão; os recursos endorreicos precisam ser habilitados explicitamente na geração que os utilizar. Nenhuma alteração foi feita nos dados canônicos de Orogen.
