# Google Sheets — somente leitura

## Planilha oficial

[Abrir a planilha oficial](https://docs.google.com/spreadsheets/d/1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI)

ID: `1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI`.

A tela “Planilha” usa `GET /api/sheets/campaign`, permite escolher abas e mostra dados e correspondências com o Neon. A integração não altera células, abas, fórmulas ou permissões.

## Autenticação por ambiente

O leitor suporta duas formas de acesso no servidor:

1. **Planilha com acesso público por link:** configure `GOOGLE_SHEETS_API_KEY`, usando uma chave do Google Cloud restrita à Google Sheets API. A chave identifica o projeto que consome a API; o acesso à planilha continua dependendo das permissões de visualização definidas nela.
2. **Planilha privada:** configure `GOOGLE_SERVICE_ACCOUNT_JSON` e compartilhe a planilha com o `client_email` da conta de serviço como **Visualizador**.

Em desenvolvimento, se nenhuma dessas credenciais estiver configurada, o projeto usa `@replit/connectors-sdk` no Replit. O conector de sessão do Replit não é uma credencial automaticamente disponível numa Function da Vercel.

## Configurar chave da API para a planilha pública

1. No Google Cloud Console, selecione ou crie um projeto e ative a Google Sheets API.
2. Em **APIs e serviços → Credenciais**, crie uma chave de API.
3. Edite a chave e restrinja **Restrições de API** à **Google Sheets API**. Não a deixe irrestrita.
4. No projeto Vercel, adicione `GOOGLE_SHEETS_API_KEY` como variável sensível no ambiente **Production**. Não use prefixo `VITE_` nem exponha o valor ao frontend.
5. Confirme que a planilha segue acessível com permissão de visualização para qualquer pessoa com o link e faça um novo deploy.

A chave de API não concede permissão de escrita na planilha. O backend usa apenas requisições `GET`; não envie a chave em respostas ao navegador, logs, repositório ou documentação.

## Configurar conta de serviço para planilha privada

1. Crie ou selecione um projeto no Google Cloud e ative a Google Sheets API.
2. Crie uma conta de serviço e gere uma chave JSON.
3. Compartilhe a planilha com o `client_email` dessa conta como **Visualizador**.
4. Cadastre o JSON inteiro em `GOOGLE_SERVICE_ACCOUNT_JSON` como variável sensível no ambiente Vercel desejado.

Nunca comite a chave JSON. Se ela for exposta, revogue-a no Google Cloud e gere outra.

## Configuração da planilha

Configure `GOOGLE_SHEETS_SPREADSHEET_URL` com o link da planilha (ou `GOOGLE_SHEETS_SPREADSHEET_ID` com seu ID). O serviço valida a URL/ID antes de consultar a API.

## Comportamento técnico

- A ordem de autenticação em produção é: conta de serviço, chave de API e, sem nenhuma das duas, erro claro de configuração.
- Em desenvolvimento, se nenhuma credencial de servidor estiver definida, as chamadas seguem pelo conector Replit.
- Todas as chamadas de leitura à API Sheets são `GET`.
- Metadados são consultados antes dos valores para descobrir abas.
- O nome da aba selecionada é codificado antes de compor o caminho.
- Credenciais são usadas apenas no backend e nunca retornadas ao navegador.

## Teste manual

Depois de configurar a credencial adequada no Vercel:

```text
GET /api/sheets/campaign
GET /api/sheets/campaign?tab=LIDERANCAS
```

Confirme que a resposta contém `tabs`, `selectedTab`, `headers`, `rows` e `totalRows`, e que a planilha original permanece inalterada.

