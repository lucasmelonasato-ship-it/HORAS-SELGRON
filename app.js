/* ============================================================
   HORAS SELGRON — app (colaborador + gestor) sobre Supabase
   ============================================================ */
'use strict';

/* ---------- Configuração ---------- */
const SUPA_URL = 'https://xewxckloxgjrffxslasq.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhld3hja2xveGdqcmZmeHNsYXNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1ODYzMTMsImV4cCI6MjEwMDE2MjMxM30.ALcLipiKYTGkUeN70KEIPL5sAZuS6LvNYnr8C9Yko4E';
const DHO_EMAIL = 'jornadas@selgron.com.br';
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
const fsSafe = s => (s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  box.innerHTML = ''; data.forEach(f => box.appendChild(cardFicha(f, 'gestor')));
}
async function carregarAssinadas() {
  const box = $('#assinadasLista'); box.innerHTML = '<p class="mut">Carregando…</p>';
  const { data, error } = await sb.from('fichas').select('*').in('status', ['assinada', 'arquivada']).order('assinada_em', { ascending: false });
  if (error) { box.innerHTML = '<p class="mut">Erro: ' + esc(error.message) + '</p>'; return; }
  if (!data.length) { box.innerHTML = '<p class="empty">Nenhuma ficha assinada ainda.</p>'; return; }
  box.innerHTML = ''; data.forEach(f => box.appendChild(cardFicha(f, 'gestor')));
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
async function enviarDHO(f) {
  const bytes = await gerarFichaPDF(f, f.assinatura_colaborador, f.assinatura_gestor);
  const nome = nomeArquivo(f);
  const assunto = `Ficha Mod. 012 - ${f.nome} - ${normDate(f.data)}`;
  try {
    const file = new File([bytes], nome, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: assunto, text: assunto });
      return;
    }
  } catch (e) { /* cai no fallback */ }
  baixarBytes(bytes, nome);
  const body = encodeURIComponent(`Segue a ficha assinada de ${f.nome} (${normDate(f.data)}).\n\nO PDF foi baixado no aparelho — anexe-o a este e-mail.`);
  location.href = `mailto:${DHO_EMAIL}?subject=${encodeURIComponent(assunto)}&body=${body}`;
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
  const horas = calcHoras(f.entrada, f.saida);
  const tp = (f.tipos || []).map(t => `<span class="pill ${t === HORA_EXTRA ? 'he' : ''}">${esc(t)}</span>`).join(' ') || '';
  const heB = f.hora_extra ? '<span class="badge he">⚠ hora extra</span>' : '';
  card.innerHTML = `
    <div class="fcard-head">
      <div><div class="nm">${esc(f.nome || '')}</div>
      <div class="meta">${esc(normDate(f.data))} · ${esc((f.comunicado || []).join('/').replace('SAIDA', 'SAÍDA'))} ${f.entrada ? '· ent ' + esc(f.entrada) : ''} ${f.saida ? '· saí ' + esc(f.saida) : ''} ${horas != null ? '· ' + horas.toFixed(2) + 'h' : ''}</div></div>
      <div class="badges">${heB}</div>
    </div>
    ${tp ? `<div class="fcard-tipos">${tp}</div>` : ''}
    ${f.observacao ? `<div class="fcard-obs">${esc(f.observacao)}</div>` : ''}
    ${statusTrack(f)}
    <div class="fcard-actions"></div>`;
  const act = $('.fcard-actions', card);
  const addBtn = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = () => fn(b); act.appendChild(b); };
  if (contexto === 'gestor') {
    if (f.status === 'enviada') {
      addBtn(f.hora_extra ? '✍️ Revisar e assinar' : '✍️ Assinar', 'primary', () => assinarFicha(f, card));
      addBtn('👁 Ver PDF', 'ghost small', () => baixarFicha(f, false));
    } else if (f.status === 'assinada') {
      addBtn('📧 Enviar ao DHO', 'ok', async b => { b.disabled = true; await enviarDHO(f); await marcarDHO(f, card); });
      addBtn('⬇️ Baixar', 'ghost small', async () => { await baixarFicha(f, true); await marcarDHO(f, card); });
    } else { // arquivada — já foi ao DHO
      addBtn('⬇️ Baixar novamente', 'ghost small', () => baixarFicha(f, true));
      addBtn('📧 Reenviar ao DHO', 'ghost small', () => enviarDHO(f));
    }
  } else { // colaborador
    addBtn('⬇️ Baixar', 'ghost small', () => baixarFicha(f, f.status !== 'enviada'));
    addBtn('📄 Duplicar', 'ghost small', () => { $$('.subtabs[data-group=colab] .subtab')[0].click(); renderFormFicha(f); });
  }
  return card;
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
  $('#fSearch').addEventListener('input', renderTabelaPainel);
  initAuth();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
}
document.addEventListener('DOMContentLoaded', init);
