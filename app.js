/* ============================================================
   Assinador de Fichas Mod. 012 — SELGRON
   Tudo roda no navegador. Nenhum arquivo sai do computador.
   ============================================================ */
'use strict';

/* ---------- pdf.js worker (com fallback p/ funcionar via file://) ---------- */
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
} catch (e) { /* ignore */ }

const { PDFDocument } = PDFLib;

/* ---------- Constantes ---------- */
const TIPO_LABELS = [
  { nome: 'Hora Extra', token: 'hora extra' },
  { nome: 'Abono', token: 'abono' },
  { nome: 'Recuperação', token: 'recupera' },
  { nome: 'Trabalho Externo', token: 'trabalho externo' },
  { nome: 'Problemas no Relógio Ponto', token: 'problemas' },
  { nome: 'Particular', token: 'particular' },
  { nome: 'Esquecimento do Registro do Ponto', token: 'esquecimento' },
  { nome: 'Outros', token: 'outros' },
];
const HORA_EXTRA = 'Hora Extra';
const DETECT_SCALE = 2.2;
const LS_DB = 'horas_selgron_db_v1';
const LS_SIG = 'horas_selgron_sig_v1';

/* ---------- Estado ---------- */
let fichas = [];           // fichas carregadas p/ assinar
let signatureDataUrl = localStorage.getItem(LS_SIG) || window.DEFAULT_SIGNATURE_DATAURL || '';
let sigDims = null;        // {w,h} px da assinatura
const temAssinatura = () => !!(signatureDataUrl && signatureDataUrl.startsWith('data:'));

/* ============================================================
   Utilidades
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const esc = s => (s ?? '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

function calcHoras(entrada, saida) {
  if (!entrada || !saida) return null;
  const p = t => { const m = t.match(/(\d{1,2})[:h](\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const a = p(entrada), b = p(saida);
  if (a == null || b == null) return null;
  let d = b - a; if (d < 0) d += 1440;
  return Math.round(d / 60 * 100) / 100;
}
const firstName = n => (n || '').trim().split(/\s+/)[0].toUpperCase();

// "nome" que na verdade veio do nome do arquivo e não é uma pessoa
function ehNomeLixo(n) {
  const x = norm(n).replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!x) return true;
  if (/^(mod|for|ficha|documento|doc|scan|digitalizar|img|image|imagem|foto|whatsapp|arquivo|pdf|comunicado)\b/.test(x)) return true;
  if (x.replace(/[^a-z]/g, '').length < 3) return true; // sem letras suficientes
  return false;
}

// Padroniza qualquer data para dd.mm.aa (dia.mês.ano com 2 dígitos).
// Quando a ficha não traz o ano, assume o ano atual.
function normDate(s) {
  if (!s) return '';
  const anoAtual = String(new Date().getFullYear()).slice(2);
  let m = String(s).match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);
  if (m) { let [, d, mo, y] = m; if (y.length === 4) y = y.slice(2); return `${d.padStart(2, '0')}.${mo.padStart(2, '0')}.${y.padStart(2, '0')}`; }
  m = String(s).match(/(\d{1,2})[.\/\-](\d{1,2})/); // sem ano -> usa o ano atual
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${anoAtual}`;
  return String(s).trim();
}

function dataURLtoBytes(durl) {
  const b64 = durl.split(',')[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/* ============================================================
   Parser de nome de arquivo (fonte confiável p/ este time)
   ex.: "JAIR - RECUPERACAO - Mod. 012 06-07-2026 - entrada 06 37"
   ============================================================ */
const TIPO_KEYWORDS = [
  ['hora extra', 'Hora Extra'],
  ['recupera', 'Recuperação'],
  ['trabalho externo', 'Trabalho Externo'], ['curso', 'Trabalho Externo'], ['externo', 'Trabalho Externo'],
  ['abono', 'Abono'],
  ['particular', 'Particular'],
  ['esquecimento', 'Esquecimento do Registro do Ponto'],
  ['problema ponto', 'Problemas no Relógio Ponto'], ['problemas', 'Problemas no Relógio Ponto'],
  ['ajustes', 'Outros'], ['temporaria', 'Outros'], ['entrada pos', 'Outros'],
];
function parseFilename(fn) {
  const base = fn.replace(/\.pdf$/i, '').replace(/#U([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const n = norm(base);
  const nome = base.split(/\s+-\s+/)[0].trim();
  const tipos = [];
  for (const [kw, cat] of TIPO_KEYWORDS) if (n.includes(kw) && !tipos.includes(cat)) tipos.push(cat);
  const falta = /\bfalta\b/.test(n);
  let data = '';
  let m = base.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (m) { let [_, d, mo, y] = m; if (y.length === 2) y = '20' + y; data = `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${y}`; }
  else { m = base.match(/\b(\d{1,2})[.](\d{1,2})\b/); if (m) data = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/2026`; }
  let entrada = '', saida = '';
  const re = /(entrada|saida|sa[íi]da)\s*(\d{1,2})\s*[:h ]\s*(\d{2})/gi;
  let t;
  while ((t = re.exec(base))) {
    const val = `${t[2].padStart(2, '0')}:${t[3]}`;
    if (norm(t[1]).startsWith('entrada') && !entrada) entrada = val;
    else if (norm(t[1]).startsWith('saida') && !saida) saida = val;
  }
  return { nome, tipos, falta, data, entrada, saida };
}

/* ============================================================
   Parser de PDF (texto + detecção de checkbox por pixel)
   ============================================================ */
async function parsePdf(bytes, filename) {
  const fnData = parseFilename(filename);
  const result = {
    nome: '', secao: '', matricula: '', data: '', entrada: '', saida: '',
    observacao: '', tipos: [], comunicado: [], horaExtra: false,
    canvas: null, pageW: 0, pageH: 0, sigBox: null, rotation: 0, garbled: false,
  };

  let doc, page, viewport, canvas;
  try {
    doc = await pdfjsLib.getDocument({ data: bytes.slice(0), verbosity: 0 }).promise;
    page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    result.pageW = v1.width; result.pageH = v1.height; result.rotation = v1.rotation || 0;
    viewport = page.getViewport({ scale: DETECT_SCALE });
    canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    result.canvas = canvas;
  } catch (e) {
    console.warn('render falhou', e);
  }

  // --- rótulos do modelo (texto do formulário) p/ mapear checkboxes e achar COORDENADOR ---
  let items = [];
  try {
    const tc = await page.getTextContent();
    items = tc.items.filter(i => i.str && i.str.trim())
      .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: i.height || Math.abs(i.transform[3]) || 8 }));
  } catch (e) { /* garbled */ }

  // --- campos de formulário (AcroForm) — fonte exata dos dados ---
  let anns = [];
  try { anns = await page.getAnnotations(); } catch (e) { /* sem anotações */ }
  const fields = anns.filter(a => a.fieldName);
  const isCheck = a => norm(a.fieldName).includes('check') || ['sim', 'off', 'on', 'yes', 'no'].includes(norm(a.fieldValue));
  const val = pred => { const f = fields.find(a => !isCheck(a) && pred(norm(a.fieldName))); return f ? (f.fieldValue || '').toString().trim() : ''; };
  const timeFmt = v => { const m = (v || '').match(/(\d{1,2})[:h.\s]+(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : (v || '').trim(); };

  const hasForm = fields.some(a => ['nome', 'data', 'colaborad', 'funcion', 'matr', 'observ'].some(k => norm(a.fieldName).includes(k)));
  result.hasForm = hasForm;
  result.garbled = !hasForm;

  if (hasForm) {
    result.nome = val(n => n === 'nome' || n.startsWith('nome') || n.includes('colaborad') || n.includes('funcion'));
    result.secao = val(n => n.startsWith('sec') || n.includes('seçao'));
    const matr = val(n => n.includes('matr'));
    result.matricula = (matr.match(/\d+/) || [matr])[0] || '';
    result.data = val(n => n.includes('data'));
    result.entrada = timeFmt(val(n => n === 'entrada'));
    result.saida = timeFmt(val(n => n.includes('said') || n.includes('saída')));
    result.observacao = val(n => n.includes('observ'));

    // mapeia cada checkbox marcado ao rótulo de tipo mais próximo à sua direita
    const boxes = fields.filter(isCheck).map(a => ({
      cx: (a.rect[0] + a.rect[2]) / 2, cy: (a.rect[1] + a.rect[3]) / 2,
      on: !['off', 'no', ''].includes(norm(a.fieldValue)),
    }));
    for (const t of TIPO_LABELS) {
      const lab = items.find(i => norm(i.str).includes(t.token));
      if (!lab) continue;
      const labY = lab.y + (lab.h || 8) * 0.4;
      let best = null, bd = 1e9;
      for (const b of boxes) {
        if (b.cx < lab.x && Math.abs(b.cy - labY) < 9) { const d = lab.x - b.cx; if (d < 60 && d < bd) { bd = d; best = b; } }
      }
      if (best && best.on) result.tipos.push(t.nome);
    }
  } else {
    result.tipos = fnData.tipos.slice();
  }

  // Hora Extra: marca se QUALQUER sinal indicar (lado seguro)
  const heText = norm(result.observacao).includes('hora extra');
  result.horaExtra = result.tipos.includes(HORA_EXTRA) || fnData.tipos.includes(HORA_EXTRA) || heText;
  if (result.horaExtra && !result.tipos.includes(HORA_EXTRA)) result.tipos.push(HORA_EXTRA);

  // completar campos com o nome do arquivo quando faltarem
  if (!result.nome) result.nome = fnData.nome;
  if (!result.data) result.data = fnData.data;
  if (!result.entrada) result.entrada = fnData.entrada;
  if (!result.saida) result.saida = fnData.saida;
  if (!result.secao) result.secao = 'SUPRIMENTOS';
  result.data = normDate(result.data);            // sempre dd.mm.aa
  result.nome = (result.nome || '').toUpperCase(); // nome sempre em MAIÚSCULAS (padrão único)

  // descarta "nome" que na verdade é lixo do nome do arquivo (Mod. 012, Ficha, Documento…)
  if (ehNomeLixo(result.nome)) result.nome = '';
  // fichas escaneadas/achatadas (sem formulário) tentam OCR sobre a imagem
  result.needsOcr = !hasForm && !!result.canvas;
  // marca fichas que o app não conseguiu ler (precisam de preenchimento manual)
  result.precisaRevisar = !result.nome || !result.data;

  // --- posição da assinatura (campo COORDENADOR) ---
  result.sigBox = computeSigBox(items, result.pageW, result.pageH, items.length > 0);

  return result;
}

function computeSigBox(items, pageW, pageH, readable) {
  const sigW = Math.min(132, pageW * 0.17);
  const ratio = sigDims ? sigDims.h / sigDims.w : (58 / 241);
  const sigH = sigW * ratio;
  let centerX = pageW * 0.72;
  let bottomY = pageH * 0.42; // origem inferior-esquerda (PDF)
  if (readable) {
    const lab = items.find(i => norm(i.str).includes('coordenador'));
    if (lab) { centerX = lab.x + lab.w / 2; bottomY = lab.y + 15; }
  }
  const leftPt = centerX - sigW / 2;
  const topPt = pageH - (bottomY + sigH); // origem superior-esquerda (p/ overlay)
  return { leftPt, topPt, wPt: sigW, hPt: sigH };
}

/* ============================================================
   OCR — lê fichas escaneadas/achatadas (roda no modo servidor)
   ============================================================ */
let _ocrWorker = null;
async function getOcr() {
  if (_ocrWorker) return _ocrWorker;
  if (typeof Tesseract === 'undefined') throw new Error('OCR indisponível');
  const base = new URL('vendor/tesseract/', location.href).href;
  _ocrWorker = await Tesseract.createWorker('por', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    langPath: base + 'lang/',
    gzip: true,
  });
  return _ocrWorker;
}

async function ocrExtract(canvas) {
  const w = await getOcr();
  const { data } = await w.recognize(canvas);
  const text = data.text || '';
  const words = (data.words || []).map(x => ({ t: x.text, y: (x.bbox.y0 + x.bbox.y1) / 2, x0: x.bbox.x0, x1: x.bbox.x1 }));
  const lineRightOf = tok => {
    const lab = words.find(w => norm(w.t).includes(tok));
    if (!lab) return '';
    return words.filter(w => Math.abs(w.y - lab.y) < 12 && w.x0 >= lab.x1 - 2)
      .sort((a, b) => a.x0 - b.x0).map(w => w.t).join(' ');
  };
  let nome = lineRightOf('nome').replace(/[^A-Za-zÀ-ÿ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const dm = text.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  const data_ = dm ? dm[0] : '';
  const timeOn = tok => { const m = lineRightOf(tok).match(/(\d{1,2})\s*[:h.]?\s*(\d{2})\b/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
  const obs = lineRightOf('observ').replace(/[|\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return { nome, data: data_, entrada: timeOn('entrada'), saida: timeOn('sa'), obs, text };
}

// Processa a fila de OCR depois que os cartões já apareceram
function ocrDisponivel() { return typeof Tesseract !== 'undefined' && location.protocol !== 'file:'; }

async function runOcrQueue() {
  const pend = fichas.filter(f => f.needsOcr && !f.ocrDone && !f.signed);
  if (!pend.length) return;
  if (!ocrDisponivel()) { pend.forEach(f => f.ocrDone = true); renderCards(); return; }
  for (const f of pend) {
    f.ocrRunning = true; renderCards();
    try {
      const r = await ocrExtract(f.canvas);
      // nome: aceita o do OCR se for melhor (nome atual é lixo/vazio, ou o do OCR começa com o mesmo 1º nome)
      const bomOcrNome = r.nome && !ehNomeLixo(r.nome) && r.nome.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 4 &&
        (!f.nome || ehNomeLixo(f.nome) || norm(r.nome).startsWith(norm(firstName(f.nome))));
      if (bomOcrNome) f.nome = r.nome.toUpperCase();
      if (!f.data && r.data) f.data = normDate(r.data);
      if (!f.entrada && r.entrada) f.entrada = r.entrada;
      if (!f.saida && r.saida) f.saida = r.saida;
      if (!f.observacao && r.obs) f.observacao = r.obs;
      if (/hora\s*extra/.test(norm(r.text))) { f.horaExtra = true; if (!f.tipos.includes(HORA_EXTRA)) f.tipos.push(HORA_EXTRA); }
    } catch (e) { console.warn('OCR falhou', e); }
    f.ocrRunning = false; f.ocrDone = true;
    f.precisaRevisar = !(f.nome && f.nome.trim()) || !(f.data && f.data.trim());
    renderCards();
  }
}

/* ============================================================
   Carregamento de arquivos
   ============================================================ */
function setupDropzone() {
  const dz = $('#dropzone'), input = $('#fileInput');
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
}

async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => /pdf$/i.test(f.name));
  if (!files.length) { toast('Selecione arquivos PDF.', 'err'); return; }
  toast(`Lendo ${files.length} ficha(s)…`);
  await ensureSigDims();
  for (const f of files) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const parsed = await parsePdf(bytes, f.name);
      fichas.push({ id: 'f' + Date.now() + Math.random().toString(36).slice(2, 6), filename: f.name, bytes, ...parsed, signed: false });
    } catch (e) {
      console.error(e); toast(`Erro ao ler ${f.name}`, 'err');
    }
  }
  renderCards();
  // fichas escaneadas: tenta ler o conteúdo por OCR (roda no modo servidor)
  const comOcr = fichas.some(f => f.needsOcr && !f.ocrDone);
  if (comOcr && ocrDisponivel()) { toast('Lendo ficha(s) escaneada(s) com OCR…'); runOcrQueue(); }
  else if (comOcr) { toast('Ficha escaneada: preencha Nome e Data (ou use o modo servidor p/ leitura automática).'); runOcrQueue(); }
}

/* ============================================================
   Cartões de ficha
   ============================================================ */
function renderCards() {
  const wrap = $('#cards');
  wrap.innerHTML = '';
  const pend = fichas.filter(f => !f.signed).length;
  $('#bulkbar').hidden = fichas.length === 0;
  $('#fichaCount').textContent = `${fichas.length} ficha(s) · ${pend} pendente(s)`;
  const semHE = fichas.filter(f => !f.signed && !f.horaExtra).length;
  $('#btnSignAll').disabled = semHE === 0;
  $('#btnSignAll').textContent = `✍️ Assinar todas sem hora extra (${semHE})`;

  for (const f of fichas) wrap.appendChild(buildCard(f));
}

function buildCard(f) {
  const card = document.createElement('div');
  const revisar = !f.signed && f.precisaRevisar;
  card.className = 'card' + (f.horaExtra ? ' he' : '') + (f.signed ? ' signed' : '') + (revisar ? ' revisar' : '');
  const badge = f.signed
    ? '<span class="badge ok">✓ ASSINADA</span>'
    : (f.ocrRunning ? '<span class="badge rev">⏳ LENDO (OCR)…</span>'
      : (revisar ? '<span class="badge rev">✎ PREENCHER</span>'
        : (f.horaExtra ? '<span class="badge he">⚠ HORA EXTRA</span>' : '<span class="badge norm">Pode aprovar</span>')));

  card.innerHTML = `
    <div class="card-head">
      <div style="flex:1">
        <div class="nm">${esc(f.nome || '(sem nome — preencha abaixo)')}</div>
        <div class="meta">${esc(f.data || 's/ data')} · ${esc(f.secao || '')} ${f.matricula ? '· mat. ' + esc(f.matricula) : ''}</div>
      </div>
      ${badge}
    </div>
    <div class="preview-wrap"></div>
    ${revisar ? '<div class="warn-note rev">✎ Não consegui ler este arquivo (ficha escaneada/achatada). Confira a imagem acima e preencha <b>Nome</b> e <b>Data</b> antes de assinar.</div>' : ''}
    ${f.horaExtra && !f.signed ? '<div class="warn-note">⚠ Contém hora extra — não é aprovada automaticamente. Revise e, se estiver correta, assine manualmente.</div>' : ''}
    <div class="fields">
      <div class="field"><label>Nome</label><input data-k="nome" value="${esc(f.nome)}" ${!f.nome ? 'data-need="1"' : ''}></div>
      <div class="field"><label>Data</label><input data-k="data" value="${esc(f.data)}" ${!f.data ? 'data-need="1"' : ''}></div>
      <div class="field"><label>Seção</label><input data-k="secao" value="${esc(f.secao)}"></div>
      <div class="field"><label>Matrícula</label><input data-k="matricula" value="${esc(f.matricula)}"></div>
      <div class="field"><label>Entrada</label><input data-k="entrada" value="${esc(f.entrada)}"></div>
      <div class="field"><label>Saída</label><input data-k="saida" value="${esc(f.saida)}"></div>
      <div class="field full"><label>Observação</label><textarea data-k="observacao">${esc(f.observacao)}</textarea></div>
    </div>
    <div class="tipos"></div>
    <div class="savename">💾 Salvar como: <span class="fn"></span></div>
    <div class="card-actions"></div>
  `;

  // preview + assinatura arrastável
  const pw = card.querySelector('.preview-wrap');
  if (f.canvas) {
    const c = f.canvas; c.className = 'preview';
    pw.appendChild(c);
    if (!f.signed) setupSigDrag(pw, f, c);
    else { const done = document.createElement('div'); done.className = 'sig-hint'; done.textContent = 'assinada'; pw.appendChild(done); }
  }

  // chips de tipo
  const tp = card.querySelector('.tipos');
  for (const t of TIPO_LABELS) {
    const on = f.tipos.includes(t.nome);
    const chip = document.createElement('span');
    chip.className = 'chip' + (on ? ' on' : '') + (t.nome === HORA_EXTRA ? ' he' : '');
    chip.textContent = t.nome;
    chip.onclick = () => {
      if (f.signed) return;
      const idx = f.tipos.indexOf(t.nome);
      if (idx >= 0) f.tipos.splice(idx, 1); else f.tipos.push(t.nome);
      f.horaExtra = f.tipos.includes(HORA_EXTRA);
      renderCards();
    };
    tp.appendChild(chip);
  }

  // nome do arquivo que será salvo (atualiza ao vivo)
  const fnEl = card.querySelector('.savename .fn');
  const updateFn = () => { if (fnEl) fnEl.textContent = signedFilename(f); };
  updateFn();

  // inputs -> estado
  card.querySelectorAll('[data-k]').forEach(inp => {
    inp.addEventListener('input', () => {
      f[inp.dataset.k] = inp.value;
      if (inp.value.trim()) inp.removeAttribute('data-need');
      // recomputa se ainda precisa revisar (nome + data preenchidos)
      const antes = f.precisaRevisar;
      f.precisaRevisar = !(f.nome && f.nome.trim()) || !(f.data && f.data.trim());
      updateFn();
      if (antes !== f.precisaRevisar) renderCards();
    });
  });

  // ações
  const act = card.querySelector('.card-actions');
  if (f.signed) {
    const b = document.createElement('button'); b.className = 'btn ok'; b.textContent = '⬇️ Baixar novamente';
    b.onclick = () => downloadSigned(f); act.appendChild(b);
    const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Remover';
    r.onclick = () => { fichas = fichas.filter(x => x !== f); renderCards(); }; act.appendChild(r);
  } else {
    const b = document.createElement('button');
    b.className = 'btn ' + (f.horaExtra ? 'primary' : 'ok');
    b.textContent = f.horaExtra ? '✍️ Revisar e assinar mesmo assim' : '✍️ Assinar e baixar';
    b.onclick = () => signFicha(f);
    act.appendChild(b);
    const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Remover';
    r.onclick = () => { fichas = fichas.filter(x => x !== f); renderCards(); }; act.appendChild(r);
  }
  return card;
}

/* Assinatura arrastável sobre o preview */
function setupSigDrag(pw, f, canvas) {
  const box = f.sigBox; if (!box) return;
  const drag = document.createElement('div');
  drag.className = 'sig-drag';
  const img = document.createElement('img'); img.src = signatureDataUrl; drag.appendChild(img);
  const hint = document.createElement('div'); hint.className = 'sig-hint'; hint.textContent = '↔ arraste a assinatura para ajustar';
  pw.appendChild(drag); pw.appendChild(hint);

  function place() {
    const scale = canvas.clientWidth / f.pageW;
    drag.style.left = (box.leftPt * scale) + 'px';
    drag.style.top = (box.topPt * scale) + 'px';
    drag.style.width = (box.wPt * scale) + 'px';
    drag.style.height = (box.hPt * scale) + 'px';
  }
  place();
  window.addEventListener('resize', place);

  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  const down = e => {
    dragging = true; drag.classList.add('dragging');
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY; ox = box.leftPt; oy = box.topPt;
    e.preventDefault();
  };
  const move = e => {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    const scale = canvas.clientWidth / f.pageW;
    box.leftPt = ox + (p.clientX - sx) / scale;
    box.topPt = oy + (p.clientY - sy) / scale;
    place();
  };
  const up = () => { dragging = false; drag.classList.remove('dragging'); };
  drag.addEventListener('mousedown', down); drag.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('mousemove', move); window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', up); window.addEventListener('touchend', up);
}

/* ============================================================
   Assinatura do PDF (pdf-lib)
   ============================================================ */
async function ensureSigDims() {
  if (sigDims) return;
  await new Promise(res => {
    const im = new Image();
    im.onload = () => { sigDims = { w: im.naturalWidth, h: im.naturalHeight }; res(); };
    im.onerror = () => { sigDims = { w: 241, h: 58 }; res(); };
    im.src = signatureDataUrl;
  });
}

async function makeSignedPdf(f) {
  const pdf = await PDFDocument.load(f.bytes.slice(0));
  const page = pdf.getPages()[0];
  const sigBytes = dataURLtoBytes(signatureDataUrl);
  let img;
  try { img = await pdf.embedPng(sigBytes); }
  catch (e) { img = await pdf.embedJpg(sigBytes); }
  const { width: pw, height: ph } = page.getSize();
  const b = f.sigBox;
  const x = b.leftPt;
  const y = ph - (b.topPt + b.hPt);   // topo-esquerda -> base-esquerda
  page.drawImage(img, { x, y, width: b.wPt, height: b.hPt });
  return await pdf.save();
}

// remove caracteres que o sistema de arquivos não aceita ( / \ : * ? " < > | )
function fsSafe(s) { return (s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim(); }

// Nome no padrão: NOME - Mod 012 - dd.mm.aa - ENTRADA HH MM - SAIDA HH MM.pdf
function signedFilename(f) {
  const doArquivo = fsSafe((f.filename || '').replace(/\.pdf$/i, '').split(/\s+-\s+/)[0]);
  const nome = (fsSafe(f.nome) || doArquivo || 'FICHA').toUpperCase();
  const data = normDate(f.data);
  const horas = t => (t || '').replace(':', ' ');
  const partes = [];
  if (f.entrada) partes.push('ENTRADA ' + horas(f.entrada));
  if (f.saida) partes.push('SAIDA ' + horas(f.saida));
  let nom = `${nome} - Mod 012`;
  if (data) nom += ` - ${data}`;
  if (partes.length) nom += ` - ${partes.join(' - ')}`;
  return fsSafe(nom) + '.pdf';
}

async function downloadSigned(f) {
  const out = f.signedBytes || await makeSignedPdf(f);
  const blob = new Blob([out], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = signedFilename(f);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function faltaPreencher(f) { return !(f.nome && f.nome.trim()) || !(f.data && f.data.trim()); }

async function signFicha(f) {
  if (!temAssinatura()) { toast('Adicione a sua assinatura em Configurações antes de assinar.', 'err'); irParaConfig(); return; }
  if (faltaPreencher(f)) {
    toast('Preencha o Nome e a Data antes de assinar esta ficha.', 'err');
    const inp = document.querySelector('.card.revisar [data-need]');
    if (inp) inp.focus();
    return;
  }
  try {
    f.signedBytes = await makeSignedPdf(f);
    f.signed = true;
    await downloadSigned(f);
    addToDb(f);
    renderCards();
    renderPainel();
    toast(`Ficha de ${firstName(f.nome)} assinada e baixada ✓`, 'ok');
  } catch (e) {
    console.error(e); toast('Erro ao assinar: ' + e.message, 'err');
  }
}

async function signAllNoHE() {
  if (!temAssinatura()) { toast('Adicione a sua assinatura em Configurações antes de assinar.', 'err'); irParaConfig(); return; }
  const alvo = fichas.filter(f => !f.signed && !f.horaExtra && !faltaPreencher(f));
  const pulados = fichas.filter(f => !f.signed && !f.horaExtra && faltaPreencher(f)).length;
  if (!alvo.length) { toast(pulados ? 'Preencha Nome e Data das fichas destacadas.' : 'Nada para assinar.', 'err'); return; }
  for (const f of alvo) {
    try { f.signedBytes = await makeSignedPdf(f); f.signed = true; addToDb(f); await downloadSigned(f); }
    catch (e) { console.error(e); toast('Erro em ' + f.filename, 'err'); }
  }
  renderCards(); renderPainel();
  toast(`${alvo.length} ficha(s) assinadas e baixadas ✓` + (pulados ? ` · ${pulados} pulada(s) por falta de dados` : ''), 'ok');
}

/* ============================================================
   Base de dados (localStorage + seed)
   ============================================================ */
function loadDb() {
  try { return JSON.parse(localStorage.getItem(LS_DB) || '[]'); } catch (e) { return []; }
}
function saveDb(arr) { localStorage.setItem(LS_DB, JSON.stringify(arr)); }
function addToDb(f) {
  const db = loadDb();
  db.push({
    id: f.id, nome: (f.nome || '').toUpperCase(), secao: f.secao, matricula: f.matricula,
    data: f.data, entrada: f.entrada, saida: f.saida, horas: calcHoras(f.entrada, f.saida),
    tipos: f.tipos.slice(), hora_extra: f.horaExtra, observacao: f.observacao,
    arquivo: signedFilename(f), origem: 'assinada-app', assinada: true,
    assinada_em: new Date().toISOString(),
  });
  saveDb(db);
}
function allRecords() {
  const seed = (window.HISTORICO_SEED || []).map(r => ({ ...r }));
  return seed.concat(loadDb());
}

/* ============================================================
   Painel
   ============================================================ */
let painelSort = { key: 'data', dir: -1 };
function renderPainel() {
  const recs = allRecords();
  // KPIs
  const pessoas = new Set(recs.map(r => firstName(r.nome)));
  const totalHoras = recs.reduce((s, r) => s + (r.horas || 0), 0);
  const he = recs.filter(r => r.hora_extra).length;
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="v">${recs.length}</div><div class="k">Fichas registradas</div></div>
    <div class="kpi"><div class="v">${pessoas.size}</div><div class="k">Colaboradores</div></div>
    <div class="kpi"><div class="v">${totalHoras.toFixed(1)}h</div><div class="k">Horas contabilizadas</div></div>
    <div class="kpi he"><div class="v">${he}</div><div class="k">Fichas com hora extra</div></div>
  `;

  // barras por pessoa (horas; se sem horas, conta fichas)
  const byP = {};
  for (const r of recs) { const k = firstName(r.nome) || '—'; byP[k] = byP[k] || { horas: 0, n: 0 }; byP[k].horas += (r.horas || 0); byP[k].n++; }
  const pRows = Object.entries(byP).sort((a, b) => (b[1].horas - a[1].horas) || (b[1].n - a[1].n));
  const maxH = Math.max(1, ...pRows.map(r => r[1].horas || r[1].n));
  $('#barsPessoa').innerHTML = pRows.map(([k, v]) => {
    const val = v.horas > 0 ? v.horas : v.n;
    const label = v.horas > 0 ? `${v.horas.toFixed(1)}h` : `${v.n} ficha(s)`;
    return `<div class="bar-row"><div class="name">${esc(k)}</div><div class="bar-track"><div class="bar-fill" style="width:${(val / maxH * 100).toFixed(1)}%"></div></div><div class="val">${label}</div></div>`;
  }).join('');

  // barras por tipo
  const byT = {};
  for (const r of recs) for (const t of (r.tipos && r.tipos.length ? r.tipos : ['(sem tipo)'])) byT[t] = (byT[t] || 0) + 1;
  const tRows = Object.entries(byT).sort((a, b) => b[1] - a[1]);
  const maxT = Math.max(1, ...tRows.map(r => r[1]));
  $('#barsTipo').innerHTML = tRows.map(([k, v]) =>
    `<div class="bar-row"><div class="name">${esc(k)}</div><div class="bar-track"><div class="bar-fill" style="width:${(v / maxT * 100).toFixed(1)}%"></div></div><div class="val">${v}</div></div>`
  ).join('');

  // filtros
  const selP = $('#fPessoa'), selT = $('#fTipo');
  const curP = selP.value, curT = selT.value;
  selP.innerHTML = '<option value="">Todos os colaboradores</option>' + [...pessoas].sort().map(p => `<option ${p === curP ? 'selected' : ''}>${esc(p)}</option>`).join('');
  const tipos = [...new Set(recs.flatMap(r => r.tipos || []))].sort();
  selT.innerHTML = '<option value="">Todos os tipos</option>' + tipos.map(t => `<option ${t === curT ? 'selected' : ''}>${esc(t)}</option>`).join('');

  renderTable();
}

function filteredRecords() {
  let recs = allRecords();
  const q = norm($('#fSearch').value);
  const p = $('#fPessoa').value, t = $('#fTipo').value, he = $('#fHE').value;
  if (q) recs = recs.filter(r => norm(`${r.nome} ${r.data} ${r.secao} ${r.observacao} ${(r.tipos || []).join(' ')}`).includes(q));
  if (p) recs = recs.filter(r => firstName(r.nome) === p);
  if (t) recs = recs.filter(r => (r.tipos || []).includes(t));
  if (he === '1') recs = recs.filter(r => r.hora_extra);
  if (he === '0') recs = recs.filter(r => !r.hora_extra);
  return recs;
}

function sortKey(r, k) {
  if (k === 'data') { const m = (r.data || '').match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/); if (!m) return 0; let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return +`${y}${mo.padStart(2, '0')}${d.padStart(2, '0')}`; }
  if (k === 'horas') return r.horas || 0;
  if (k === 'tipo') return (r.tipos || []).join(',');
  return norm(r[k] || '');
}
function renderTable() {
  let recs = filteredRecords();
  recs.sort((a, b) => { const ka = sortKey(a, painelSort.key), kb = sortKey(b, painelSort.key); return (ka < kb ? -1 : ka > kb ? 1 : 0) * painelSort.dir; });
  $('#tblBody').innerHTML = recs.map(r => {
    const tp = (r.tipos || []).map(t => `<span class="pill ${t === HORA_EXTRA ? 'he' : ''}">${esc(t)}</span>`).join(' ') || '<span class="pill">—</span>';
    const orig = r.origem === 'assinada-app' ? '<span class="pill">assinada aqui</span>' : '<span class="pill hist">histórico</span>';
    return `<tr>
      <td>${esc(normDate(r.data) || '—')}</td>
      <td>${esc(r.nome || '—')}</td>
      <td>${esc(r.secao || '')}</td>
      <td>${tp}</td>
      <td>${esc(r.entrada || '')}</td>
      <td>${esc(r.saida || '')}</td>
      <td>${r.horas != null ? r.horas.toFixed(2) + 'h' : '—'}</td>
      <td class="obs">${esc(r.observacao || '')}</td>
      <td>${orig}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="empty">Nenhum registro encontrado.</td></tr>';
}

function exportCsv() {
  const recs = filteredRecords();
  const head = ['Data', 'Colaborador', 'Secao', 'Matricula', 'Tipos', 'HoraExtra', 'Entrada', 'Saida', 'Horas', 'Observacao', 'Origem'];
  const rows = recs.map(r => [normDate(r.data), r.nome, r.secao, r.matricula, (r.tipos || []).join(' | '), r.hora_extra ? 'SIM' : 'nao', r.entrada, r.saida, r.horas ?? '', (r.observacao || '').replace(/\n/g, ' '), r.origem]);
  const csv = [head, ...rows].map(row => row.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `horas-selgron-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ============================================================
   Configurações
   ============================================================ */
function atualizaSigPreview() {
  const img = $('#sigPreview');
  if (temAssinatura()) { img.src = signatureDataUrl; img.style.display = ''; }
  else { img.removeAttribute('src'); img.style.display = 'none'; }
}
function setupConfig() {
  atualizaSigPreview();
  $('#btnSigUpload').onclick = () => $('#sigInput').click();
  $('#sigInput').onchange = () => {
    const file = $('#sigInput').files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => { signatureDataUrl = rd.result; localStorage.setItem(LS_SIG, signatureDataUrl); sigDims = null; atualizaSigPreview(); ensureSigDims(); toast('Assinatura salva ✓', 'ok'); renderCards(); };
    rd.readAsDataURL(file);
  };
  $('#btnSigReset').onclick = () => { signatureDataUrl = ''; localStorage.removeItem(LS_SIG); sigDims = null; atualizaSigPreview(); toast('Assinatura removida'); renderCards(); };

  $('#btnExportDb').onclick = () => {
    const blob = new Blob([JSON.stringify(loadDb(), null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'base-fichas-assinadas.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  $('#btnImportDb').onclick = () => $('#dbInput').click();
  $('#dbInput').onchange = () => {
    const file = $('#dbInput').files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => { try { const arr = JSON.parse(rd.result); if (!Array.isArray(arr)) throw 0; const db = loadDb().concat(arr); saveDb(db); renderPainel(); toast(`${arr.length} registro(s) importados ✓`, 'ok'); } catch (e) { toast('JSON inválido', 'err'); } };
    rd.readAsText(file);
  };
  $('#btnResetDb').onclick = () => { if (confirm('Apagar toda a base de horas deste navegador? (Faça um Exportar antes se quiser backup.)')) { localStorage.removeItem(LS_DB); renderPainel(); toast('Base apagada deste navegador'); } };
}

/* ============================================================
   Navegação + init
   ============================================================ */
function mostraView(nome) {
  $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === nome));
  $$('.view').forEach(x => x.classList.remove('active'));
  $('#view-' + nome).classList.add('active');
  if (nome === 'painel') renderPainel();
}
function setupTabs() { $$('.tab').forEach(t => t.onclick = () => mostraView(t.dataset.view)); }
function irParaConfig() { mostraView('config'); }

function init() {
  setupTabs();
  setupDropzone();
  setupConfig();
  ensureSigDims();
  $('#btnClear').onclick = () => { fichas = []; renderCards(); };
  $('#btnSignAll').onclick = signAllNoHE;
  $('#btnCsv').onclick = exportCsv;
  ['#fSearch', '#fPessoa', '#fTipo', '#fHE'].forEach(s => $(s).addEventListener('input', renderTable));
  $$('#tbl th[data-sort]').forEach(th => th.onclick = () => {
    const k = th.dataset.sort;
    painelSort.dir = (painelSort.key === k) ? -painelSort.dir : 1;
    painelSort.key = k; renderTable();
  });
  renderPainel();
  // primeiro uso: sem assinatura carregada → orienta a configurar
  if (!temAssinatura()) {
    const b = $('#firstRun');
    if (b) b.hidden = false;
  }
}
document.addEventListener('DOMContentLoaded', init);
