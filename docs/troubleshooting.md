# Troubleshooting

## Build Vite reclama de PORT ou BASE_PATH

Use a configuração desta branch, que fornece defaults. Em Vercel, confirme que o projeto está usando a raiz do repositório e o `vercel.json`.

## `/api` retorna 404

Confirme que `api/index.mjs` existe na raiz, que o deploy foi feito a partir da raiz e que a regra `/api/:path*` aparece antes do fallback `/index.html`.

## Login retorna erro de banco

Verifique `DATABASE_URL`, SSL da connection string Neon, branch `production` e se o schema/seed foram aplicados. Não copie a string para logs ou issues.

## Planilha retorna 502

Verifique:

1. `GOOGLE_SHEETS_SPREADSHEET_URL` aponta para o ID oficial.
2. `GOOGLE_SERVICE_ACCOUNT_JSON` é JSON válido.
3. A API Sheets está habilitada no Google Cloud.
4. A planilha foi compartilhada com o `client_email` como Visualizador.
5. O deploy foi refeito após salvar variáveis.

O endpoint não usa o plugin de sessão do assistente no Vercel.

## Planilha abre, mas não há correspondências

A correspondência usa aba e linha de origem do banco. Verifique se o Neon tem seed compatível com a versão da planilha e se o registro não está marcado com `needsReview`.

## Teste não inicia no Windows

Consulte [Testes](testing.md). Instale com `--ignore-scripts` apenas quando o shell não tiver `sh` e prefira executar os testes em CI Linux para uma validação completa.
