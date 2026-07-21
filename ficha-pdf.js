/* ============================================================
   Geração da ficha oficial Mod. 012 (preenche o formulário + assina)
   Usa pdf-lib (PDFLib global) e o modelo embutido (MODELO_FICHA_DATAURL).
   ============================================================ */
'use strict';

const CB_COMUNICADO = { ENTRADA: 'Check Box1', SAIDA: 'Check Box2', FALTA: 'Check Box13' };
const CB_TIPO = {
  'Hora Extra': 'Check Box12',
  'Abono': 'Check Box122',
  'Recuperação': 'Check Box11',
  'Trabalho Externo': 'Check Box111',
  'Problemas no Relógio Ponto': 'Check Box10',
  'Particular': 'Check Box100',
  'Esquecimento do Registro do Ponto': 'Check Box133',
  'Outros': 'Check Box1336',
};

function _dataURLtoBytes(durl) {
  const bin = atob(durl.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/**
 * Gera o PDF da ficha Mod. 012 preenchida.
 * @param {object} d  { nome, secao, matricula, data, comunicado[], tipos[], entrada, saida, faltas, motivo, observacao }
 * @param {string} sigColaborador  data URL PNG (opcional)
 * @param {string} sigGestor       data URL PNG (opcional)
 * @returns {Promise<Uint8Array>}
 */
async function gerarFichaPDF(d, sigColaborador, sigGestor) {
  const { PDFDocument } = PDFLib;
  const tpl = _dataURLtoBytes(window.MODELO_FICHA_DATAURL);
  const pdf = await PDFDocument.load(tpl);
  const form = pdf.getForm();
  const setT = (n, v) => { try { form.getTextField(n).setText((v || '').toString()); } catch (e) { } };
  const chk = (n) => { try { form.getCheckBox(n).check(); } catch (e) { } };

  setT('Nome', d.nome); setT('Seção', d.secao); setT('Matrícula', d.matricula);
  setT('Data do Evento', d.data); setT('Entrada', d.entrada); setT('Saída', d.saida);
  setT('Observação', d.observacao); setT('Faltas nos dias', d.faltas); setT('Motivo da faltaatraso', d.motivo);
  (d.comunicado || []).forEach(c => CB_COMUNICADO[c] && chk(CB_COMUNICADO[c]));
  (d.tipos || []).forEach(t => CB_TIPO[t] && chk(CB_TIPO[t]));

  const page = pdf.getPages()[0];
  async function stamp(durl, centerX, baselineY) {
    if (!durl || !durl.startsWith('data:')) return;
    let img;
    try { img = await pdf.embedPng(_dataURLtoBytes(durl)); }
    catch (e) { try { img = await pdf.embedJpg(_dataURLtoBytes(durl)); } catch (_) { return; } }
    const w = 120, h = w * (img.height / img.width);
    page.drawImage(img, { x: centerX - w / 2, y: baselineY + 12, width: w, height: h });
  }
  await stamp(sigColaborador, 158, 232);  // campo COLABORADOR
  await stamp(sigGestor, 446, 232);        // campo COORDENADOR / GERENTE / DIRETORIA

  try { form.flatten(); } catch (e) { /* mantém preenchido mesmo se não achatar */ }
  return await pdf.save();
}

window.gerarFichaPDF = gerarFichaPDF;
