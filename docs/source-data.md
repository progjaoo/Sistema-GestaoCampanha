# Dados de origem

## Arquivos

O workbook estruturado fica em `attached_assets/` e os CSVs usados pelo seed ficam em `lib/db/seed-data/`. O seed espera os conjuntos de regiões, cidades, deputados federais, articuladores, coordenadores e lideranças, além das inconsistências para revisão.

## Entidades normalizadas

| Fonte                | Tabela/área   |
| -------------------- | ------------- |
| `REGIOES`            | regiões       |
| `CIDADES`            | cidades       |
| `DEPUTADOS_FEDERAIS` | deputados     |
| `ARTICULADORES`      | articuladores |
| `COORDENADORES`      | coordenadores |
| `LIDERANCAS`         | lideranças    |
| `QA_INCONSISTENCIAS` | revisão       |

## Regras de qualidade

- Preserve a linha original e a aba de origem.
- Use `needsReview` para registros marcados como `REVISAR`.
- Não transforme ausência em dado inventado; “Sem identificação” é apenas uma apresentação controlada quando prevista.
- Valide códigos, relações territoriais, telefone e duplicidades antes de alterar o seed.

## Relação com a tela Planilha

A leitura online não substitui o seed do banco. Ela serve para exibir a fonte atual e cruzar linhas com os registros normalizados. Alterações na planilha devem ser tratadas como nova fonte de dados e avaliadas antes de novo seed.
