# Horas SELGRON — fichas Mod. 012 (colaborador + gestor)

App web instalável (PWA) para o time de Suprimentos preencher, assinar e aprovar
as fichas de horas **Mod. 012**. Roda no navegador do celular ou do computador.

## Papéis
- **Colaborador:** faz login, preenche a ficha, assina (assinatura desenhada na tela)
  e **envia** ao gestor. Acompanha as próprias fichas e horas; duplica uma anterior
  para ajustar em segundos.
- **Gestor:** recebe as fichas na **caixa de entrada**, revisa (hora extra sinalizada),
  **assina** (entra a 2ª assinatura) e **envia ao DHO** (e-mail). Tem o painel de horas.

## Como funciona (privacidade)
- Frontend estático (GitHub Pages). Backend no **Supabase** (banco + login + regras
  de acesso RLS). Cada colaborador vê só as próprias fichas; o gestor vê as do time.
- O PDF oficial é gerado **no navegador** (pdf-lib) a partir do modelo Mod. 012,
  com as duas assinaturas — nada de PDF trafega por servidor de terceiros além do
  Supabase do próprio time.

## Configuração do backend (uma vez)
1. Criar projeto no Supabase.
2. Rodar `docs/supabase-setup.sql` no **SQL Editor** (cria tabelas + RLS + gatilhos).
3. **Authentication → Providers → Email**: habilitado (login por link mágico).
4. **Authentication → URL Configuration**: `Site URL` e `Redirect URLs` = a URL do app.
5. Após o 1º login do gestor: `update public.profiles set papel='gestor' where email='...';`

A URL e a chave `anon` (pública) do projeto ficam em `app.js` (`SUPA_URL`, `SUPA_ANON`).

## Estrutura
```
index.html            Interface (login, colaborador, gestor, config)
app.js                Lógica + Supabase
ficha-pdf.js          Gera a ficha Mod. 012 preenchida + assinaturas
assets/modelo-ficha.js  Modelo oficial embutido
vendor/               pdf-lib + supabase-js (offline)
manifest.webmanifest, sw.js   PWA (instalável, funciona offline no que dá)
docs/supabase-setup.sql       Script do banco
```
