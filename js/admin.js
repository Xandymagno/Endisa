/**
 * ADMIN — GESTÃO DE USUÁRIOS (só nível "adm")
 * Consulta, adição e edição via API.
 */

const formAdmin   = document.getElementById("form-usuario");
const campoModo   = document.getElementById("modo");
const fUsuario    = document.getElementById("f-usuario");
const fSenha      = document.getElementById("f-senha");
const fPolo       = document.getElementById("f-polo");
const fNivel      = document.getElementById("f-nivel");
const fAtivo      = document.getElementById("f-ativo");
const corpoTabela = document.getElementById("corpo-tabela");
const msgAdmin    = document.getElementById("admin-msg");
const btnCancelar = document.getElementById("btn-cancelar");
const btnSair     = document.getElementById("btn-sair");
const tituloForm  = document.getElementById("titulo-form");
const dicaSenha   = document.getElementById("dica-senha");

function mostrarMsg(texto, erro) {
  msgAdmin.textContent = texto;
  msgAdmin.className = erro ? "erro" : "ok";
}

/** Confirma acesso e carrega a tabela.
 *  ⚠️ TEMPORÁRIO: sem exigência de admin (modo aberto).
 *  Depois de cadastrar o admin, restaurar o bloco original. */
(async function iniciarAdmin() {
  const usuario = LoginAPI.usuarioLogado();

  // Não é admin → manda pro dashboard
  if (!usuario || String(usuario.nivel).toLowerCase() !== "adm") {
    window.location.replace("dashboard.html");
    return;
  }

  document.getElementById("admin-nome").textContent = usuario.usuario;
  carregarUsuarios();
})();

/** Consulta: lista os usuários na tabela */
async function carregarUsuarios() {
  corpoTabela.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
  try {
    const resposta = await LoginAPI.chamar({
      acao:  campoModo.value + "_usuario",
      token: sessionStorage.getItem("sess_token"),
    });
    if (!resposta.ok) throw new Error(resposta.erro);

    corpoTabela.innerHTML = "";
    resposta.usuarios.forEach(function (u) {
      const linha = document.createElement("tr");
      linha.innerHTML =
        "<td>" + u.usuario + "</td>" +
        "<td>" + u.polo + "</td>" +
        "<td>" + u.nivel + "</td>" +
        "<td>" + (u.ativo === "SIM" ? "✅" : "❌") + "</td>" +
        "<td>" + (u.temSenha ? "configurada" : "⚠️ pendente") + "</td>" +
        '<td><button type="button" class="btn-editar">Editar</button></td>';
      linha.querySelector(".btn-editar").addEventListener("click", function () {
        preencherFormulario(u);
      });
      corpoTabela.appendChild(linha);
    });
  } catch (falha) {
    corpoTabela.innerHTML = '<tr><td colspan="6">' + falha.message + "</td></tr>";
  }
}

/** Clique em Editar → modo edição */
function preencherFormulario(u) {
  campoModo.value = "editar";
  tituloForm.textContent = "Editar usuário";
  fUsuario.value = u.usuario;
  fUsuario.readOnly = true; // o nome é a chave, não muda
  fSenha.value = "";
  dicaSenha.textContent = "(deixe vazio para manter a atual)";
  fPolo.value = u.polo;
  fNivel.value = u.nivel;
  fAtivo.value = u.ativo;
  btnCancelar.classList.remove("oculto");
  msgAdmin.className = "oculto";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Cancelar → volta pro modo adicionar */
btnCancelar.addEventListener("click", function () {
  campoModo.value = "adicionar";
  tituloForm.textContent = "Adicionar usuário";
  formAdmin.reset();
  fUsuario.readOnly = false;
  dicaSenha.textContent = "";
  btnCancelar.classList.add("oculto");
  msgAdmin.className = "oculto";
});

/** Salvar → chama adicionar_usuario ou editar_usuario */
formAdmin.addEventListener("submit", async function (e) {
  e.preventDefault();

  const parametros = {
    acao:  campoModo.value + "_usuario",
    token: sessionStorage.getItem("sess_token") || "", // opcional no modo aberto
    novo_usuario: fUsuario.value.trim(),
    senha:  fSenha.value,
    polo:   fPolo.value.trim(),
    nivel:  fNivel.value,
    ativo:  fAtivo.value
  };

  // No modo edição, o campo usuário se chama "usuario"
  if (campoModo.value === "editar") {
    parametros.usuario = fUsuario.value.trim();
    delete parametros.novo_usuario;
    if (!parametros.senha) delete parametros.senha; // sem senha nova = mantém
  }

  try {
    const resposta = await LoginAPI.chamar(parametros);
    if (!resposta.ok) throw new Error(resposta.erro);

    mostrarMsg("✅ " + resposta.msg, false);
    btnCancelar.click(); // reseta o formulário
    carregarUsuarios();
  } catch (falha) {
    mostrarMsg(falha.message, true);
  }
});

/** Sair */
btnSair.addEventListener("click", function () {
  LoginAPI.sair();
});