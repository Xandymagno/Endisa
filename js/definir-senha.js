/* ============================================================
   DEFINIR SENHA — DASHBOARD ENDISA
   Grava a nova senha na planilha através do MESMO endpoint
   usado pelo admin.js (LoginAPI.chamar → Apps Script → Sheets).
   ============================================================ */

// ⬇️ Cole aqui a ação exata do admin.js (texto entre aspas no chamar()
//    quando ele salva o usuário). Ex.: const ACAO_FIXA = 'salvar_usuario';
const ACAO_FIXA = '';

// Candidatas em ordem: criar/cadastrar primeiro, depois editar
const ACOES_CANDIDATAS = [
  'cadastrar_usuario', 'salvar_usuario', 'adicionar_usuario',
  'criar_usuario', 'salvarUsuario', 'addUsuario',
  'editar_usuario', 'atualizar_usuario', 'salvar_usuario_editado'
];

const form = document.getElementById('form-definir-senha');
const msgErro = document.getElementById('msg-erro');
const msgSucesso = document.getElementById('msg-sucesso');
const btnSalvar = document.getElementById('btn-salvar');

function mostrarMsg(el, texto) {
  msgErro.hidden = true;
  msgSucesso.hidden = true;
  el.textContent = texto;
  el.hidden = false;
}

function aplicarHashSeHouver(senha) {
  for (const nome of ['hashSenha', 'criptografarSenha', 'gerarHash', 'sha256', 'hash']) {
    if (typeof window[nome] === 'function') return window[nome](senha);
  }
  return senha; // sem hash no front → o Apps Script pode aplicar
}

// Tenta as ações uma a uma; para na primeira que o backend aceitar
async tentarGravar = async (payload) => {
  const lista = ACAO_FIXA ? [ACAO_FIXA] : ACOES_CANDIDATAS;
  const erros = [];
  for (const acao of lista) {
    try {
      console.log('📤 Tentando ação:', acao);
      const resp = await LoginAPI.chamar(acao, payload);
      console.log('✅ Sucesso com:', acao, resp);
      return resp;
    } catch (e) {
      console.log('⚠️ Falhou:', acao, '→', e.message || e);
      erros.push(acao);
    }
  }
  throw new Error('Nenhuma ação foi aceita pelo endpoint. Tentadas: ' + erros.join(', '));
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgErro.hidden = true;
  msgSucesso.hidden = true;

  const usuario = document.getElementById('campo-usuario').value.trim();
  const senha = document.getElementById('campo-senha').value;
  const senha2 = document.getElementById('campo-senha2').value;

  if (!usuario) return mostrarMsg(msgErro, 'Informe o usuário.');
  if (senha.length < 4) return mostrarMsg(msgErro, 'A senha deve ter pelo menos 4 caracteres.');
  if (senha !== senha2) return mostrarMsg(msgErro, 'As senhas não conferem.');

  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  const payload = {
    usuario: usuario,
    senha: aplicarHashSeHouver(senha),
    ativo: 'SIM'
  };
  console.log('📤 Payload:', payload);

  try {
    await tentarGravar(payload);

    mostrarMsg(msgSucesso, 'Senha definida com sucesso! Voltando ao login...');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);

  } catch (erro) {
    console.error('❌ Erro ao salvar senha:', erro);
    mostrarMsg(msgErro, 'Erro ao salvar: ' + (erro.message || 'tente novamente.'));
    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar senha';
  }
});