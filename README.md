# Assinador de Fichas · Mod. 012 · SELGRON

Ferramenta para **assinar em lote as fichas de horas (Mod. 012)** que o time envia
e manter um **painel com todas as horas** por pessoa, por dia e por tipo.

Tudo roda **dentro do navegador, no seu computador**. Nenhum arquivo é enviado para a
internet — os dados dos colaboradores nunca saem da sua máquina.

---

## Como usar (sem instalar nada)

1. **Abra o arquivo `index.html`** (dê dois cliques nele, abre no navegador).
   > Se as pré-visualizações não aparecerem no seu navegador, use o modo servidor
   > abaixo — mas na maioria dos casos o duplo-clique já funciona.
2. Aba **“Assinar fichas”** → arraste os PDFs que o time mandou (pode vários de uma vez).
3. Para cada ficha o sistema mostra:
   - Nome, data, seção, matrícula, entrada/saída, observação e o **tipo** (Recuperação, etc.);
   - a **imagem da ficha** para você conferir;
   - um selo: **“Pode aprovar”** (verde) ou **“⚠ HORA EXTRA”** (laranja).
4. **Assinar:**
   - **Uma ficha:** botão **“Assinar e baixar”** — a assinatura é carimbada no campo
     *COORDENADOR / GERENTE / DIRETORIA* e o PDF assinado é baixado, pronto para o DHO.
   - **Tudo de uma vez:** botão **“Assinar todas sem hora extra”** — assina e baixa todas
     as fichas que **não** têm hora extra. As de hora extra ficam de fora para você revisar.
5. A assinatura aparece já posicionada sobre a imagem — se precisar, **arraste** para ajustar
   antes de assinar.

> **Regra de segurança:** fichas com **hora extra nunca são aprovadas automaticamente**.
> Elas são sempre destacadas e exigem que você clique para assinar manualmente.

### Painel de horas

Aba **“Painel de horas”**: mostra todas as fichas já registradas — o **histórico
pré-carregado** (maio até 10/07/2026) **mais** tudo que você assinar aqui.

- Totais: nº de fichas, colaboradores, horas contabilizadas e fichas com hora extra;
- Barras de **horas por colaborador** e **registros por tipo**;
- Tabela com **busca e filtros** (por pessoa, tipo, hora extra) e ordenação por coluna;
- **Exportar CSV** para abrir no Excel.

### Configurações

- **Trocar a assinatura** (envie um PNG com fundo transparente) ou restaurar a padrão.
- **Exportar / importar / apagar** a base de fichas assinadas neste navegador.

---

## Fichas escaneadas / achatadas (leitura por OCR)

A maioria das fichas Mod. 012 são **formulários preenchíveis** e o app lê tudo
sozinho. Algumas, porém, vêm **escaneadas ou "achatadas"** (os dados viram imagem).
Nesses casos o app usa **OCR** (lê o texto da imagem) para preencher o **nome** e a
**data** automaticamente — você só confere.

> **Importante:** o OCR só funciona no **modo servidor** (abaixo). Abrindo por
> duplo-clique (`file://`), o navegador bloqueia o OCR; aí essas fichas aparecem
> com o selo **“✎ PREENCHER”** para você digitar Nome e Data à mão.
> As fichas de formulário normais funcionam dos dois jeitos.

## Modo servidor (recomendado — habilita o OCR)

Rode um servidor local simples dentro desta pasta e abra no navegador:

```bash
python3 -m http.server 8000
```

E abra <http://localhost:8000>. Nada é enviado para a internet — o servidor é só local.

---

## Como funciona (resumo técnico)

- As fichas Mod. 012 são **PDFs de formulário (AcroForm)**. O app lê os campos
  diretamente (`Nome`, `Data`, `Entrada`, `Saída`, `Observação` e os checkboxes),
  então os dados são **exatos**, sem “adivinhar”.
- Para fichas antigas **achatadas/escaneadas** (sem campos de formulário), o app usa o
  **nome do arquivo** como reserva (ex.: `JAIR - RECUPERACAO - Mod. 012 06-07-2026 - entrada 06 37`).
- A assinatura é carimbada com **pdf-lib**; a leitura/pré-visualização usa **pdf.js**.
  Ambas as bibliotecas ficam locais na pasta `vendor/` (funciona **offline**).
- A base assinada fica salva no navegador (`localStorage`). Use *Exportar base* para backup.

## Estrutura

```
index.html            Interface
app.js                Lógica (ler PDF, assinar, painel)
styles.css            Estilo
vendor/               pdf.js, pdf-lib e Tesseract/OCR (tudo offline)
assets/assinatura.js  Assinatura padrão (Lucas Melo Nasato) embutida
data/historico.js     Base histórica pré-carregada (fichas de maio a 10/07/2026)
data/historico.json   Mesma base em JSON (para consulta/importação)
```
