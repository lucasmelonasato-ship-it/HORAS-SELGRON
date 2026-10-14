/* ============================================================
   HORAS SELGRON — app (colaborador + gestor) sobre Supabase
   ============================================================ */
'use strict';

/* ---------- Configuração ---------- */
const APP_VERSION = '2026.10.14-2016';   // atualizado por tools/versao.sh a cada publicação (igual ao version.json)
const SUPA_URL = 'https://xewxckloxgjrffxslasq.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhld3hja2xveGdqcmZmeHNsYXNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODYzMTMsImV4cCI6MjEwMDE2MjMxM30.ALcLipiKYTGkUeN70KEIPL5sAZuS6LvNYnr8C9Yko4E';
const DHO_EMAIL = 'jornadas@selgron.com.br';                              // Recuperação e demais
const HE_EMAILS = 'raquel.l@selgron.com.br,portaria@selgron.com.br';      // Hora extra
const DOMINIO = '@selgron.com.br';

const sb = window.supabase.createClient(SUPA_URL, SUPA_ANON);

const TIPOS = ['Hora Extra', 'Recuperação', 'Abono', 'Trabalho Externo', 'Problemas no Relógio Ponto', 'Particular', 'Esquecimento do Registro do Ponto', 'Outros'];
const COMUNICADOS = ['ENTRADA', 'SAIDA', 'FALTA'];
const HORA_EXTRA = 'Hora Extra';

/* ---------- Estado ---------- */
let profile = null;   // { id, email, nome, matricula, secao, papel, assinatura }
let sigPads = {};

/* ---------- Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = s => (s ?? '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const firstName = n => (n || '').trim().split(/\s+/)[0].toUpperCase();

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3400);
  setTimeout(() => el.remove(), 3800);
}
function normDate(s) {
  if (!s) return '';
  const y2 = String(new Date().getFullYear()).slice(2);
  let m = String(s).match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);
  if (m) { let [, d, mo, y] = m; if (y.length === 4) y = y.slice(2); return `${d.padStart(2, '0')}.${mo.padStart(2, '0')}.${y.padStart(2, '0')}`; }
  m = String(s).match(/(\d{1,2})[.\/\-](\d{1,2})/);
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${y2}`;
  return String(s).trim();
}
function dateInputBR(v) { const m = (v || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : normDate(v); }
function calcHoras(e, s) {
  if (!e || !s) return null;
  const p = t => { const m = t.match(/(\d{1,2})[:h](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const a = p(e), b = p(s); if (a == null || b == null) return null;
  let d = b - a; if (d < 0) d += 1440; return Math.round(d / 60 * 100) / 100;
}
const fsSafe = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
function nomeArquivo(f) {
  const nome = (fsSafe(f.nome) || 'FICHA').toUpperCase();
  const data = normDate(f.data);
  const h = t => (t || '').replace(':', ' ');
  const partes = [];
  if (f.entrada) partes.push('ENTRADA ' + h(f.entrada));
  if (f.saida) partes.push('SAIDA ' + h(f.saida));
  let nom = `${nome} - Mod 012`;
  if (data) nom += ` - ${data}`;
  if (partes.length) nom += ` - ${partes.join(' - ')}`;
  return fsSafe(nom) + '.pdf';
}
function baixarBytes(bytes, nome) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- Assinatura (desenho na tela) ---------- */
function makeSigPad(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, r.width) * dpr; canvas.height = Math.max(1, r.height) * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#141444';
  let drawing = false, empty = true, last = null;
  const pos = e => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const down = e => { drawing = true; last = pos(e); e.preventDefault(); };
  const move = e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; empty = false; e.preventDefault(); };
  const up = () => { drawing = false; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up); canvas.addEventListener('pointerleave', up);
  return {
    clear() { const b = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, b.width, b.height); empty = true; },
    isEmpty() { return empty; },
    dataURL() { return empty ? '' : canvas.toDataURL('image/png'); },
    load(durl) { if (!durl) return; const im = new Image(); im.onload = () => { const b = canvas.getBoundingClientRect(); const w = Math.min(b.width, 260); ctx.drawImage(im, 6, 6, w, w * (im.height / im.width)); empty = false; }; im.src = durl; },
  };
}
function initSigPads() {
  ['obSig', 'cfSig'].forEach(id => { const c = $('#' + id); if (c && !sigPads[id]) sigPads[id] = makeSigPad(c); });
  $$('.sigclear').forEach(b => b.onclick = () => sigPads[b.dataset.clear] && sigPads[b.dataset.clear].clear());
}
function bindSigUpload(inputId, padId) {
  const inp = $('#' + inputId); if (!inp) return;
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { sigPads[padId].clear(); sigPads[padId].load(rd.result); }; rd.readAsDataURL(f); };
}

/* ---------- Navegação ---------- */
function showView(v) { $$('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v)); window.scrollTo(0, 0); }
function setupSubtabs() {
  $$('.subtab').forEach(t => t.onclick = () => {
    const group = t.closest('.subtabs').dataset.group;
    if (group === 'gestor') limparSelecao();
    $$(`.subtabs[data-group="${group}"] .subtab`).forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const parent = t.closest('.view');
    $$('.subview', parent).forEach(s => s.classList.remove('active'));
    $('#' + group + '-' + t.dataset.sub, parent).classList.add('active');
    if (t.dataset.sub === 'minhas') carregarMinhasFichas();
    if (t.dataset.sub === 'inbox') carregarInbox();
    if (t.dataset.sub === 'assinadas') carregarAssinadas();
    if (t.dataset.sub === 'painel') carregarPainel();
  });
}

/* ============================================================
   Autenticação
   ============================================================ */
async function initAuth() {
  try {
    sb.auth.onAuthStateChange((_event, session) => { if (session) aoLogar(session); });
    const { data } = await sb.auth.getSession();
    if (data && data.session) aoLogar(data.session);
    else showView('login');
  } catch (e) { console.warn('auth init', e); showView('login'); }
}
function traduzErro(m) {
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'Conta ainda não confirmada. Peça ao gestor para confirmar seu usuário.';
  return m;
}
async function fazerLogin() {
  const email = $('#loginEmail').value.trim().toLowerCase();
  const pass = $('#loginPass').value;
  if (!email || !pass) { toast('Preencha e-mail e senha.', 'err'); return; }
  $('#btnLogin').disabled = true; $('#loginMsg').textContent = 'Entrando…';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  $('#btnLogin').disabled = false; $('#loginMsg').textContent = '';
  if (error) { toast(traduzErro(error.message), 'err'); return; }
  // sucesso é tratado pelo onAuthStateChange
}
async function trocarSenha() {
  const p = $('#cfPass').value;
  if (!p || p.length < 6) { toast('A senha precisa ter no mínimo 6 caracteres.', 'err'); return; }
  const { error } = await sb.auth.updateUser({ password: p });
  if (error) { toast('Erro: ' + error.message, 'err'); return; }
  $('#cfPass').value = ''; toast('Senha alterada ✓', 'ok');
}
async function logout() { await sb.auth.signOut(); location.reload(); }

async function aoLogar(session) {
  const uid = session.user.id;
  let { data, error } = await sb.from('profiles').select('*').eq('id', uid).single();
  if (error && error.code !== 'PGRST116') { toast('Erro ao carregar perfil: ' + error.message, 'err'); }
  if (!data) { // fallback caso o gatilho não tenha criado
    await sb.from('profiles').insert({ id: uid, email: session.user.email }).select().single().then(r => data = r.data);
  }
  profile = data || { id: uid, email: session.user.email, papel: 'colaborador' };
  $('#hdrRight').hidden = false;
  $('#userChip').textContent = (profile.nome ? firstName(profile.nome) : profile.email) + (profile.papel === 'gestor' ? ' · Gestor' : '');
  if (!profile.nome || !profile.assinatura) { irOnboarding(); }
  else rotearPorPapel();
}
function rotearPorPapel() {
  if (profile.papel === 'gestor') { $('#hdrsub').textContent = 'Gestor'; showView('gestor'); carregarInbox(); }
  else { $('#hdrsub').textContent = 'Colaborador'; showView('colab'); renderFormFicha(); }
}

/* ============================================================
   Perfil / Onboarding
   ============================================================ */
function irOnboarding() {
  showView('onboarding'); initSigPads(); bindSigUpload('obSigFile', 'obSig');
  $('#obNome').value = profile.nome || ''; $('#obMat').value = profile.matricula || ''; $('#obSecao').value = profile.secao || 'SUPRIMENTOS';
  if (profile.assinatura) sigPads.obSig.load(profile.assinatura);
}
async function salvarPerfil(padId, nome, mat, secao, entaoRotear) {
  nome = (nome || '').trim().toUpperCase();
  const assinatura = sigPads[padId] && !sigPads[padId].isEmpty() ? sigPads[padId].dataURL() : (profile.assinatura || '');
  if (!nome) { toast('Preencha seu nome.', 'err'); return; }
  if (!assinatura) { toast('Desenhe ou envie sua assinatura.', 'err'); return; }
  const patch = { nome, matricula: (mat || '').trim(), secao: (secao || '').trim() || 'SUPRIMENTOS', assinatura };
  const { error } = await sb.from('profiles').update(patch).eq('id', profile.id);
  if (error) { toast('Erro ao salvar: ' + error.message, 'err'); return; }
  Object.assign(profile, patch);
  toast('Cadastro salvo ✓', 'ok');
  $('#userChip').textContent = firstName(profile.nome) + (profile.papel === 'gestor' ? ' · Gestor' : '');
  if (entaoRotear) rotearPorPapel();
}

/* ============================================================
   Colaborador — nova ficha
   ============================================================ */
let novaSel = { comunicado: [], tipos: [] };
function renderFormFicha(base) {
  novaSel = { comunicado: base ? [...(base.comunicado || [])] : [], tipos: base ? [...(base.tipos || [])] : [] };
  const f = $('#formFicha');
  f.innerHTML = `
    <p class="sub" style="margin-top:0">Olá, <b>${esc(firstName(profile.nome))}</b>. Preencha e envie — sua assinatura já entra na ficha.</p>
    <label class="lbl">Comunicado de</label>
    <div class="chips" id="chComunicado"></div>
    <label class="lbl">Tipo</label>
    <div class="chips" id="chTipos"></div>
    <div class="field"><label>Data do evento</label><input type="date" id="fData"></div>
    <div class="row2">
      <div class="field"><label>Entrada</label><input type="time" id="fEntrada" value="${esc(base?.entrada || '')}"></div>
      <div class="field"><label>Saída</label><input type="time" id="fSaida" value="${esc(base?.saida || '')}"></div>
    </div>
    <div class="horas-note" id="horasCalc"></div>
    <div class="field"><label>Observação</label><textarea id="fObs" rows="2" placeholder="Motivo / detalhe">${esc(base?.observacao || '')}</textarea></div>
    <div id="wrapFalta" hidden>
      <div class="field"><label>Falta(s) no(s) dia(s)</label><input id="fFaltas" value="${esc(base?.faltas || '')}"></div>
      <div class="field"><label>Motivo da falta/atraso</label><input id="fMotivo" value="${esc(base?.motivo || '')}"></div>
    </div>
    <div class="warn-note he" id="heNota" ${novaSel.tipos.includes(HORA_EXTRA) ? '' : 'hidden'}>⚠ Hora extra: o gestor vai revisar antes de aprovar.</div>
    <button class="btn primary block" id="btnEnviarFicha">📤 Enviar ficha para o gestor</button>
  `;
  const chC = $('#chComunicado');
  COMUNICADOS.forEach(c => { const el = chip(c === 'SAIDA' ? 'SAÍDA' : c, novaSel.comunicado.includes(c)); el.onclick = () => { toggle(novaSel.comunicado, c); el.classList.toggle('on'); $('#wrapFalta').hidden = !novaSel.comunicado.includes('FALTA'); }; chC.appendChild(el); });
  const chT = $('#chTipos');
  TIPOS.forEach(t => { const el = chip(t, novaSel.tipos.includes(t), t === HORA_EXTRA); el.onclick = () => { toggle(novaSel.tipos, t); el.classList.toggle('on'); $('#heNota').hidden = !novaSel.tipos.includes(HORA_EXTRA); }; chT.appendChild(el); });
  const upd = () => { const h = calcHoras($('#fEntrada').value, $('#fSaida').value); $('#horasCalc').textContent = h != null ? '⏱ Total: ' + h.toFixed(2) + ' h' : ''; };
  $('#fEntrada').oninput = upd; $('#fSaida').oninput = upd;
  $('#wrapFalta').hidden = !novaSel.comunicado.includes('FALTA');
  $('#btnEnviarFicha').onclick = enviarFicha;
}
function chip(txt, on, he) { const s = document.createElement('span'); s.className = 'chip' + (on ? ' on' : '') + (he ? ' he' : ''); s.textContent = txt; return s; }
function toggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

async function enviarFicha() {
  const data = dateInputBR($('#fData').value);
  if (!data) { toast('Escolha a data do evento.', 'err'); return; }
  if (!novaSel.comunicado.length) { toast('Marque Entrada, Saída ou Falta.', 'err'); return; }
  const ficha = {
    colaborador_id: profile.id, nome: profile.nome, secao: profile.secao, matricula: profile.matricula,
    data, comunicado: novaSel.comunicado, tipos: novaSel.tipos,
    entrada: $('#fEntrada').value, saida: $('#fSaida').value,
    faltas: $('#fFaltas') ? $('#fFaltas').value : '', motivo: $('#fMotivo') ? $('#fMotivo').value : '',
    observacao: $('#fObs').value, hora_extra: novaSel.tipos.includes(HORA_EXTRA),
    status: 'enviada', assinatura_colaborador: profile.assinatura,
  };
  $('#btnEnviarFicha').disabled = true;
  const { error } = await sb.from('fichas').insert(ficha);
  $('#btnEnviarFicha').disabled = false;
  if (error) { toast('Erro ao enviar: ' + error.message, 'err'); return; }
  toast('Ficha enviada ao gestor ✓', 'ok');
  renderFormFicha();
}

/* ---------- Minhas fichas (colaborador) ---------- */
async function carregarMinhasFichas() {
  const box = $('#minhasFichas'); box.innerHTML = '<p class="mut">Carregando…</p>';
  const { data, error } = await sb.from('fichas').select('*').eq('colaborador_id', profile.id).order('created_at', { ascending: false });
  if (error) { box.innerHTML = '<p class="mut">Erro: ' + esc(error.message) + '</p>'; return; }
  if (!data.length) { box.innerHTML = '<p class="empty">Você ainda não enviou fichas.</p>'; return; }
  box.innerHTML = '';
  data.forEach(f => box.appendChild(cardFicha(f, 'colab')));
}

/* ============================================================
   Gestor — caixa de entrada / assinar / painel
   ============================================================ */
async function carregarInbox() {
  const box = $('#inboxLista'); box.innerHTML = '<p class="mut">Carregando…</p>';
  const { data, error } = await sb.from('fichas').select('*').eq('status', 'enviada').order('created_at', { ascending: true });
  if (error) { box.innerHTML = '<p class="mut">Erro: ' + esc(error.message) + '</p>'; return; }
  $('#inboxCount').textContent = data.length || '';
  if (!data.length) { box.innerHTML = '<p class="empty">Nenhuma ficha pendente. 🎉</p>'; return; }
  data.forEach(f => fichasCache.set(f.id, f));
  box.innerHTML = ''; box.appendChild(linhaSelecionarTodas(data));
  data.forEach(f => box.appendChild(cardFicha(f, 'gestor')));
  atualizarBarraLote();
}
async function carregarAssinadas() {
  const box = $('#assinadasLista'); box.innerHTML = '<p class="mut">Carregando…</p>';
  const { data, error } = await sb.from('fichas').select('*').in('status', ['assinada', 'arquivada']).order('assinada_em', { ascending: false });
  if (error) { box.innerHTML = '<p class="mut">Erro: ' + esc(error.message) + '</p>'; return; }
  if (!data.length) { box.innerHTML = '<p class="empty">Nenhuma ficha assinada ainda.</p>'; return; }
  data.forEach(f => fichasCache.set(f.id, f));
  box.innerHTML = ''; box.appendChild(linhaSelecionarTodas(data, { label: 'Só as que faltam enviar ao DHO', filtro: f => f.status === 'assinada' }));
  data.forEach(f => box.appendChild(cardFicha(f, 'gestor')));
  atualizarBarraLote();
}

async function assinarFicha(f, cardEl) {
  if (!profile.assinatura) { toast('Cadastre sua assinatura em ⚙️ primeiro.', 'err'); return; }
  const patch = { status: 'assinada', assinatura_gestor: profile.assinatura, assinada_em: new Date().toISOString() };
  const { error } = await sb.from('fichas').update(patch).eq('id', f.id);
  if (error) { toast('Erro ao assinar: ' + error.message, 'err'); return; }
  Object.assign(f, patch);
  toast(`Ficha de ${firstName(f.nome)} assinada ✓`, 'ok');
  cardEl.replaceWith(cardFicha(f, 'gestor'));
  const c = $('#inboxCount'); const n = Math.max(0, (+c.textContent || 1) - 1); c.textContent = n || '';
}

async function baixarFicha(f, comGestor) {
  const bytes = await gerarFichaPDF(f, f.assinatura_colaborador, comGestor ? f.assinatura_gestor : '');
  baixarBytes(bytes, nomeArquivo(f));
  return bytes;
}
/* ---------- E-mail com destino por tipo ---------- */
const ehHoraExtra = f => !!f.hora_extra || (f.tipos || []).includes(HORA_EXTRA);
function dataBR(s) {
  const n = normDate(s); const m = n.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  return m ? `${m[1]}/${m[2]}/20${m[3]}` : n;
}
function montarEmail(f) {
  const he = ehHoraExtra(f);
  const nome = (f.nome || '').trim().toUpperCase();
  const data = dataBR(f.data);
  return {
    he,
    para: he ? HE_EMAILS : DHO_EMAIL,
    assunto: he ? `HORA EXTRA ${nome} - ${data}` : `FICHA 012 - ${nome} - ${data}`,
    corpo: `Segue a ficha Mod. 012${he ? ' de HORA EXTRA' : ''} de ${nome}, referente ao dia ${data}, assinada pelo colaborador e pelo gestor.`,
  };
}
// Celular pelo sistema (não pela tela de toque — notebooks com touch são computador)
function ehCelular() {
  const ua = navigator.userAgent || '';
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean' && navigator.userAgentData.mobile) return true;
  if (/iPhone|iPod|Android.*Mobile|Android/i.test(ua)) return true;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;   // iPad
  return false;
}
const ehComputador = () => !ehCelular();

async function enviarPorEmail(f) {
  const bytes = await gerarFichaPDF(f, f.assinatura_colaborador, f.assinatura_gestor);
  const m = montarEmail(f);
  if (ehComputador()) {   // PC: e-mail pronto (.eml) com o PDF já anexado → abre no Thunderbird/Outlook
    baixarEml(m, bytes, nomeArquivo(f));
    toast('E-mail pronto baixado. Abra o arquivo e use "Editar como nova mensagem" (Ctrl+E) → Enviar.', 'ok');
    return;
  }
  baixarBytes(bytes, nomeArquivo(f));   // celular: salva o PDF para anexar no Mail
  const url = `mailto:${m.para}?subject=${encodeURIComponent(m.assunto)}&body=${encodeURIComponent(m.corpo)}`;
  setTimeout(() => { location.href = url; }, 700);
}

/* ---------- .eml: rascunho de e-mail com anexo (abre no Thunderbird/Outlook) ---------- */
function _b64Utf8(s) { return btoa(unescape(encodeURIComponent(s))); }
function _b64Bytes(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
const _quebra76 = s => s.replace(/.{1,76}/g, '$&\r\n');
function montarEml(m, pdfBytes, nomePdf) {
  const b = 'selgron_' + Date.now().toString(36);
  const nomeEnc = `=?UTF-8?B?${_b64Utf8(nomePdf)}?=`;
  return [
    `To: ${m.para.split(',').join(', ')}`,
    `Subject: =?UTF-8?B?${_b64Utf8(m.assunto)}?=`,
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    _quebra76(_b64Utf8(m.corpo)),
    `--${b}`,
    `Content-Type: application/pdf; name="${nomeEnc}"`,
    `Content-Disposition: attachment; filename="${nomeEnc}"; filename*=UTF-8''${encodeURIComponent(nomePdf)}`,
    'Content-Transfer-Encoding: base64',
    '',
    _quebra76(_b64Bytes(pdfBytes)),
    `--${b}--`,
    '',
  ].join('\r\n');
}
function baixarEml(m, pdfBytes, nomePdf) {
  const blob = new Blob([montarEml(m, pdfBytes, nomePdf)], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nomePdf.replace(/\.pdf$/i, '') + '.eml';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- Trilho de status (📤 Enviada → ✍️ Assinada → 📧 No DHO) ---------- */
function statusStep(status) { return status === 'arquivada' ? 3 : status === 'assinada' ? 2 : 1; }
function statusTrack(f) {
  const s = statusStep(f.status);
  const step = (n, ic, label, final) => `<div class="tstep ${s >= n ? 'done' : ''}${final ? ' final' : ''}"><span class="ic">${ic}</span><span>${label}</span></div>`;
  const line = n => `<div class="tline ${s >= n ? 'done' : ''}"></div>`;
  return `<div class="track">${step(1, '📤', 'Enviada')}${line(2)}${step(2, '✍️', 'Assinada')}${line(3)}${step(3, '📧', 'No DHO', true)}</div>`;
}

/* ---------- Cartão de ficha ---------- */
function cardFicha(f, contexto) {  // contexto: 'gestor' | 'colab'
  const card = document.createElement('div');
  card.className = 'fcard' + (f.hora_extra ? ' he' : '') + (f.status === 'arquivada' ? ' done' : '');
  card.dataset.id = f.id;
  const selecionavel = contexto === 'gestor';
  if (selecionavel && selecao.has(f.id)) card.classList.add('selected');
  const horas = calcHoras(f.entrada, f.saida);
  const tp = (f.tipos || []).map(t => `<span class="pill ${t === HORA_EXTRA ? 'he' : ''}">${esc(t)}</span>`).join(' ') || '';
  const heB = f.hora_extra ? '<span class="badge he">⚠ hora extra</span>' : '';
  card.innerHTML = `
    <div class="fcard-head">
      ${selecionavel ? `<label class="selbox" title="Selecionar"><input type="checkbox" class="selchk" ${selecao.has(f.id) ? 'checked' : ''}></label>` : ''}
      <div class="fh-info"><div class="nm">${esc(f.nome || '')}</div>
      <div class="meta">${esc(normDate(f.data))} · ${esc((f.comunicado || []).join('/').replace('SAIDA', 'SAÍDA'))} ${f.entrada ? '· ent ' + esc(f.entrada) : ''} ${f.saida ? '· saí ' + esc(f.saida) : ''} ${horas != null ? '· ' + horas.toFixed(2) + 'h' : ''}</div></div>
      <div class="badges">${heB}</div>
    </div>
    ${tp ? `<div class="fcard-tipos">${tp}</div>` : ''}
    ${f.observacao ? `<div class="fcard-obs">${esc(f.observacao)}</div>` : ''}
    ${statusTrack(f)}
    <div class="fcard-actions"></div>`;
  if (selecionavel) $('.selchk', card).onchange = e => {
    if (e.target.checked) selecao.add(f.id); else selecao.delete(f.id);
    card.classList.toggle('selected', e.target.checked); atualizarBarraLote();
  };
  const act = $('.fcard-actions', card);
  const addBtn = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = () => fn(b); act.appendChild(b); };
  if (contexto === 'gestor') {
    if (f.status === 'enviada') {
      addBtn(f.hora_extra ? '✍️ Revisar e assinar' : '✍️ Assinar', 'primary', () => assinarFicha(f, card));
      addBtn('👁 Ver PDF', 'ghost small', () => baixarFicha(f, false));
    } else if (f.status === 'assinada') {
      const m = montarEmail(f);
      addBtn(m.he ? '📧 Enviar — Hora Extra' : '📧 Enviar — DHO', 'ok', async b => { b.disabled = true; await enviarPorEmail(f); await marcarDHO(f, card); });
      addBtn('⬇️ Só baixar', 'ghost small', async () => { await baixarFicha(f, true); await marcarDHO(f, card); });
      const dica = ehComputador() ? '<br><span class="mut">No PC: abra o arquivo baixado → <b>Ctrl+E</b> (Editar como nova mensagem) → Enviar. O PDF já vai anexado.</span>' : '';
      act.insertAdjacentHTML('beforebegin', `<div class="destino">Para: <b>${esc(m.para.replace(',', ', '))}</b><br>Assunto: <b>${esc(m.assunto)}</b>${dica}</div>`);
    } else { // arquivada — já enviada
      addBtn('📧 Reenviar', 'ghost small', () => enviarPorEmail(f));
      addBtn('⬇️ Baixar novamente', 'ghost small', () => baixarFicha(f, true));
    }
  } else { // colaborador
    addBtn('⬇️ Baixar', 'ghost small', () => baixarFicha(f, f.status !== 'enviada'));
    addBtn('📄 Duplicar', 'ghost small', () => { $$('.subtabs[data-group=colab] .subtab')[0].click(); renderFormFicha(f); });
  }
  return card;
}

/* ============================================================
   Seleção em lote (gestor): assinar / baixar várias de uma vez
   ============================================================ */
const selecao = new Set();       // ids marcados
const fichasCache = new Map();   // id → ficha carregada na tela

function linhaSelecionarTodas(fichas, extra) {
  const d = document.createElement('div'); d.className = 'selall'; d._fichas = fichas;
  d.innerHTML = `<label><input type="checkbox"> <span>Selecionar todas (${fichas.length})</span></label>`;
  const cb = $('input', d);
  const marcar = (lista, on) => {
    lista.forEach(f => on ? selecao.add(f.id) : selecao.delete(f.id));
    $$('.fcard', d.parentNode).forEach(c => { const ch = $('.selchk', c); const on2 = selecao.has(c.dataset.id); if (ch) ch.checked = on2; c.classList.toggle('selected', on2); });
    atualizarBarraLote();
  };
  cb.onchange = () => marcar(fichas, cb.checked);
  if (extra) {
    const alvo = fichas.filter(extra.filtro);
    if (alvo.length) {
      const b = document.createElement('button'); b.className = 'btn ghost small'; b.textContent = `${extra.label} (${alvo.length})`;
      b.onclick = () => { fichas.forEach(f => selecao.delete(f.id)); marcar(alvo, true); };
      d.appendChild(b);
    }
  }
  return d;
}
function selecionadas() { return [...selecao].map(id => fichasCache.get(id)).filter(Boolean); }
function limparSelecao() {
  selecao.clear();
  $$('.fcard.selected').forEach(c => c.classList.remove('selected'));
  $$('.selchk, .selall input').forEach(c => c.checked = false);
  atualizarBarraLote();
}
function atualizarBarraLote() {
  const bar = $('#loteBar'); if (!bar) return;
  const sel = selecionadas();
  const nAss = sel.filter(f => f.status === 'enviada').length;
  const nBai = sel.filter(f => f.status === 'assinada' || f.status === 'arquivada').length;
  bar.hidden = sel.length === 0;
  document.body.classList.toggle('com-lote', sel.length > 0);
  $('#loteN').textContent = `${sel.length} selecionada${sel.length > 1 ? 's' : ''}`;
  $('#btnLoteAssinar').textContent = `✍️ Assinar (${nAss})`; $('#btnLoteAssinar').disabled = !nAss;
  $('#btnLoteBaixar').textContent = `⬇️ PDFs (${nBai})`; $('#btnLoteBaixar').disabled = !nBai;
  $('#btnLoteEmail').hidden = !ehComputador();   // no celular o e-mail é um por vez (Mail)
  $('#btnLoteEmail').textContent = `📧 E-mails (${nBai})`; $('#btnLoteEmail').disabled = !nBai;
  $$('.selall').forEach(s => { const cb = $('input', s); cb.checked = s._fichas.length > 0 && s._fichas.every(f => selecao.has(f.id)); });
}
function trocarCard(f) {
  const el = document.querySelector(`.fcard[data-id="${f.id}"]`);
  if (el) el.replaceWith(cardFicha(f, 'gestor'));
}

async function assinarLote() {
  const alvo = selecionadas().filter(f => f.status === 'enviada');
  if (!alvo.length) return;
  if (!profile.assinatura) { toast('Cadastre sua assinatura em ⚙️ primeiro.', 'err'); return; }
  const he = alvo.filter(ehHoraExtra);
  let msg = `Assinar ${alvo.length} ficha${alvo.length > 1 ? 's' : ''} de uma vez?`;
  if (he.length) msg += `\n\n⚠ ${he.length} ${he.length > 1 ? 'são' : 'é'} de HORA EXTRA:\n` + he.map(f => `• ${f.nome} — ${dataBR(f.data)}`).join('\n');
  if (!confirm(msg)) return;
  const btn = $('#btnLoteAssinar'); btn.disabled = true; btn.textContent = 'Assinando…';
  const patch = { status: 'assinada', assinatura_gestor: profile.assinatura, assinada_em: new Date().toISOString() };
  const { error } = await sb.from('fichas').update(patch).in('id', alvo.map(f => f.id));
  if (error) { toast('Erro ao assinar: ' + error.message, 'err'); atualizarBarraLote(); return; }
  alvo.forEach(f => { Object.assign(f, patch); trocarCard(f); });
  const c = $('#inboxCount'); const n = Math.max(0, (+c.textContent || 0) - alvo.length); c.textContent = n || '';
  toast(`${alvo.length} ficha${alvo.length > 1 ? 's assinadas' : ' assinada'} ✓ — agora você pode baixá-las`, 'ok');
  atualizarBarraLote();
}

async function baixarLote() {
  const alvo = selecionadas().filter(f => f.status === 'assinada' || f.status === 'arquivada');
  if (!alvo.length) return;
  const btn = $('#btnLoteBaixar'); btn.disabled = true; btn.textContent = `Gerando ${alvo.length} PDF${alvo.length > 1 ? 's' : ''}…`;
  const arqs = [];
  for (const f of alvo) arqs.push({ f, nome: nomeArquivo(f), bytes: await gerarFichaPDF(f, f.assinatura_colaborador, f.assinatura_gestor) });
  let feito = true;
  const files = arqs.map(a => new File([a.bytes], a.nome, { type: 'application/pdf' }));
  if (ehCelular() && navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title: `Fichas Mod. 012 (${files.length})` }); }
    catch (e) { if (e.name === 'AbortError') feito = false; else await baixarEmSequencia(arqs); }
  } else if (arqs.length > 1) {
    baixarBlob(montarZip(arqs), `Fichas Mod 012 - ${arqs.length} PDFs - ${hojeBR()}.zip`);
  } else {
    await baixarEmSequencia(arqs);
  }
  if (feito) {
    const pend = alvo.filter(f => f.status === 'assinada');
    if (pend.length) {
      const { error } = await sb.from('fichas').update({ status: 'arquivada' }).in('id', pend.map(f => f.id));
      if (error) toast('PDFs baixados, mas houve erro ao registrar No DHO: ' + error.message, 'err');
      else pend.forEach(f => { f.status = 'arquivada'; trocarCard(f); });
    }
    toast(alvo.length > 1 && !ehCelular() ? `ZIP com ${alvo.length} PDFs baixado ✓` : `${alvo.length} PDF${alvo.length > 1 ? 's' : ''} ✓`, 'ok');
  }
  atualizarBarraLote();
}
/* ---------- ZIP simples (sem compressão) para baixar o lote num arquivo só ---------- */
const _crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function _crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = _crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function montarZip(arqs) {   // arqs: [{ nome, bytes: Uint8Array }]
  const enc = new TextEncoder(), partes = [], central = [], usados = new Set(); let off = 0;
  const d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const a of arqs) {
    let nome = a.nome, i = 2; while (usados.has(nome)) nome = a.nome.replace(/(\.\w+)$/, ` (${i++})$1`); usados.add(nome);
    const nm = enc.encode(nome), data = a.bytes, crc = _crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, tm, 2], [12, dt, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nm.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => n === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true));
    partes.push(new Uint8Array(lh.buffer), nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, tm, 2], [14, dt, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nm.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]]
      .forEach(([o, v, n]) => n === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true));
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const csz = central.reduce((s, x) => s + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, arqs.length, true); end.setUint16(10, arqs.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
  return new Blob([...partes, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 8000);
}
const hojeBR = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`; };

/* E-mails em lote (PC): um e-mail pronto (.eml) por ficha, com destino/assunto do tipo e o PDF anexado */
async function emailsLote() {
  const alvo = selecionadas().filter(f => f.status === 'assinada' || f.status === 'arquivada');
  if (!alvo.length) return;
  const he = alvo.filter(ehHoraExtra).length;
  if (!confirm(`Gerar ${alvo.length} e-mail${alvo.length > 1 ? 's' : ''} pronto${alvo.length > 1 ? 's' : ''} (1 por ficha, com o PDF anexado)?\n\n` +
    `• ${alvo.length - he} para jornadas@ (DHO)\n• ${he} de hora extra para raquel.l@ e portaria@`)) return;
  const btn = $('#btnLoteEmail'); btn.disabled = true; btn.textContent = `Gerando ${alvo.length}…`;
  const enc = new TextEncoder(), arqs = [];
  for (const f of alvo) {
    const bytes = await gerarFichaPDF(f, f.assinatura_colaborador, f.assinatura_gestor);
    const nome = nomeArquivo(f);
    arqs.push({ nome: nome.replace(/\.pdf$/i, '') + '.eml', bytes: enc.encode(montarEml(montarEmail(f), bytes, nome)) });
  }
  if (arqs.length === 1) baixarBlob(new Blob([arqs[0].bytes], { type: 'message/rfc822' }), arqs[0].nome);
  else baixarBlob(montarZip(arqs), `E-mails fichas - ${arqs.length} - ${hojeBR()}.zip`);
  const pend = alvo.filter(f => f.status === 'assinada');
  if (pend.length) {
    const { error } = await sb.from('fichas').update({ status: 'arquivada' }).in('id', pend.map(f => f.id));
    if (error) toast('E-mails gerados, mas houve erro ao registrar No DHO: ' + error.message, 'err');
    else pend.forEach(f => { f.status = 'arquivada'; trocarCard(f); });
  }
  toast(alvo.length > 1 ? `ZIP com ${alvo.length} e-mails baixado ✓ — abra o ZIP, dois cliques em cada e-mail → Ctrl+E → Enviar` : 'E-mail pronto baixado ✓ — abra → Ctrl+E → Enviar', 'ok');
  atualizarBarraLote();
}
async function baixarEmSequencia(arqs) {
  for (const a of arqs) { baixarBytes(a.bytes, a.nome); await new Promise(r => setTimeout(r, 450)); }
}

async function marcarDHO(f, cardEl) {
  if (f.status === 'arquivada') return;
  const { error } = await sb.from('fichas').update({ status: 'arquivada' }).eq('id', f.id);
  if (error) { toast('Erro ao registrar DHO: ' + error.message, 'err'); return; }
  f.status = 'arquivada';
  toast('Registrada como enviada ao DHO ✓', 'ok');
  if (cardEl) cardEl.replaceWith(cardFicha(f, 'gestor'));
}

/* ---------- Painel (gestor) ---------- */
let _painelDados = [];
async function carregarPainel() {
  const { data, error } = await sb.from('fichas').select('*').order('created_at', { ascending: false });
  if (error) { toast('Erro no painel: ' + error.message, 'err'); return; }
  _painelDados = data || [];
  renderPainel();
}
function renderPainel() {
  const recs = _painelDados;
  const pessoas = new Set(recs.map(r => firstName(r.nome)));
  const totalHoras = recs.reduce((s, r) => s + (calcHoras(r.entrada, r.saida) || 0), 0);
  const he = recs.filter(r => r.hora_extra).length;
  $('#kpis').innerHTML = `
    <div class="kpi"><div class="v">${recs.length}</div><div class="k">Fichas</div></div>
    <div class="kpi"><div class="v">${pessoas.size}</div><div class="k">Colaboradores</div></div>
    <div class="kpi"><div class="v">${totalHoras.toFixed(1)}h</div><div class="k">Horas</div></div>
    <div class="kpi he"><div class="v">${he}</div><div class="k">Hora extra</div></div>`;
  const byP = {};
  recs.forEach(r => { const k = firstName(r.nome) || '—'; byP[k] = (byP[k] || 0) + (calcHoras(r.entrada, r.saida) || 0); });
  const rows = Object.entries(byP).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...rows.map(r => r[1]));
  $('#barsPessoa').innerHTML = rows.map(([k, v]) => `<div class="bar-row"><div class="name">${esc(k)}</div><div class="bar-track"><div class="bar-fill" style="width:${(v / max * 100).toFixed(0)}%"></div></div><div class="val">${v.toFixed(1)}h</div></div>`).join('') || '<p class="mut">Sem dados.</p>';
  renderTabelaPainel();
}
function renderTabelaPainel() {
  const q = norm($('#fSearch').value);
  let recs = _painelDados;
  if (q) recs = recs.filter(r => norm(`${r.nome} ${r.data} ${(r.tipos || []).join(' ')} ${r.observacao}`).includes(q));
  $('#tblBody').innerHTML = recs.map(r => {
    const h = calcHoras(r.entrada, r.saida);
    const st = r.status === 'arquivada' ? '<span class="pill ok">📧 no DHO</span>' : r.status === 'assinada' ? '<span class="pill sign">✍️ assinada</span>' : '<span class="pill">📤 enviada</span>';
    return `<tr><td>${esc(normDate(r.data))}</td><td>${esc(r.nome || '')}</td><td>${esc((r.tipos || []).join(', '))}${r.hora_extra ? ' ⚠' : ''}</td><td>${esc(r.entrada || '')}</td><td>${esc(r.saida || '')}</td><td>${h != null ? h.toFixed(2) : '—'}</td><td>${st}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">Nada encontrado.</td></tr>';
}
function exportCsv() {
  const head = ['Data', 'Colaborador', 'Secao', 'Matricula', 'Tipos', 'HoraExtra', 'Entrada', 'Saida', 'Horas', 'Observacao', 'Status'];
  const rows = _painelDados.map(r => [normDate(r.data), r.nome, r.secao, r.matricula, (r.tipos || []).join(' | '), r.hora_extra ? 'SIM' : 'nao', r.entrada, r.saida, calcHoras(r.entrada, r.saida) ?? '', (r.observacao || '').replace(/\n/g, ' '), r.status]);
  const csv = [head, ...rows].map(row => row.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `horas-selgron-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ============================================================
   Config
   ============================================================ */
function irConfig() {
  showView('config'); initSigPads(); bindSigUpload('cfSigFile', 'cfSig');
  $('#cfNome').value = profile.nome || ''; $('#cfMat').value = profile.matricula || ''; $('#cfSecao').value = profile.secao || '';
  sigPads.cfSig.clear(); if (profile.assinatura) sigPads.cfSig.load(profile.assinatura);
}


/* ---------- Aviso de versão nova (sem depender de Ctrl+Shift+R) ---------- */
let _avisoVersao = false;
async function checarVersao() {
  if (_avisoVersao) return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j.v && j.v !== APP_VERSION) mostrarAvisoVersao();
  } catch (e) { /* offline: tenta depois */ }
}
function mostrarAvisoVersao() {
  _avisoVersao = true;
  const b = document.createElement('div'); b.className = 'novaversao';
  b.innerHTML = '<span>🔄 Tem uma <b>versão nova</b> do app.</span> <button class="btn primary small">Atualizar agora</button>';
  $('button', b).onclick = async () => {
    try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (e) { }
    location.reload();
  };
  document.body.appendChild(b);
}

/* ============================================================
   Init
   ============================================================ */
function init() {
  setupSubtabs();
  $('#btnLogin').onclick = fazerLogin;
  $('#loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') fazerLogin(); });
  $('#btnTrocarSenha').onclick = trocarSenha;
  $('#btnLogout').onclick = logout;
  $('#btnConfig').onclick = irConfig;
  $('#btnBack').onclick = rotearPorPapel;
  $('#btnSaveProfile').onclick = () => salvarPerfil('obSig', $('#obNome').value, $('#obMat').value, $('#obSecao').value, true);
  $('#btnSaveConfig').onclick = () => salvarPerfil('cfSig', $('#cfNome').value, $('#cfMat').value, $('#cfSecao').value, false);
  $('#btnCsv').onclick = exportCsv;
  $('#btnLoteAssinar').onclick = assinarLote;
  $('#btnLoteBaixar').onclick = baixarLote;
  $('#btnLoteEmail').onclick = emailsLote;
  $('#btnLoteLimpar').onclick = limparSelecao;
  $('#fSearch').addEventListener('input', renderTabelaPainel);
  initAuth();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  $$('.appver').forEach(e => e.textContent = 'Versão do app: ' + APP_VERSION);
  checarVersao();
  setInterval(checarVersao, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checarVersao(); });
}
document.addEventListener('DOMContentLoaded', init);
