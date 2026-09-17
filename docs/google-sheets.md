# Google Sheets — somente leitura

## Planilha oficial

[Abrir a planilha oficial](https://docs.google.com/spreadsheets/d/1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI)

ID: `1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI`.

A tela “Planilha” usa `GET /api/sheets/campaign`, permite escolher abas e mostra dados e correspondências com o Neon. A integração não altera células, abas, fórmulas ou permissões.

## Por que não usar o plugin no deploy

O plugin/connector de Google Sheets disponível no ambiente de desenvolvimento está desabilitado pelo administrador. Além disso, um plugin de sessão do assistente não é uma credencial disponível para uma Function Vercel. Por isso, o runtime publicado usa a Google Sheets API nativa com conta de serviço e o escopo `spreadsheets.readonly`.

## Configuração no Google Cloud

1. Crie ou selecione um projeto no Google Cloud.
2. Ative a Google Sheets API.
3. Crie uma service account.
4. Gere uma chave JSON uma única vez e guarde-a em local seguro.
5. Compartilhe a planilha com o `client_email` da service account como **Visualizador**.
6. Cadastre o conteúdo JSON em `GOOGLE_SERVICE_ACCOUNT_JSON` no Vercel como segredo.
7. Cadastre a URL em `GOOGLE_SHEETS_SPREADSHEET_URL`.

Não cole a chave JSON em issues, commits, documentação ou mensagens. Se uma chave for exposta, revogue-a no Google Cloud e gere outra.

## Comportamento técnico

- A URL ou ID é validado antes da consulta.
- O token OAuth é criado com JWT assinado pela chave privada e mantido em cache curto no processo da Function.
- Todas as chamadas à API Sheets são `GET`.
- Metadados são consultados antes dos valores para descobrir abas.
- O nome da aba vem de query string apenas para seleção; não existe escrita dinâmica.
- A API nunca retorna credenciais ao navegador.

## Teste manual

Depois de configurar banco, usuário e segredo Google:

```text
GET /api/sheets/campaign
GET /api/sheets/campaign?tab=LIDERANCAS
```

Confirme que a resposta contém `tabs`, `selectedTab`, `headers`, `rows` e `totalRows`, e que a planilha original permanece inalterada.
