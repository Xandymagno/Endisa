/**
 * LOGIN — LÓGICA DA TELA (usa LoginAPI)
 */
const form         = document.getElementById("form-login");
const campoUsuario = document.getElementById("campo-usuario");
const campoSenha   = document.getElementById("campo-senha");
const btnEntrar    = document.getElementById("btn-entrar");
const btnOlho      = document.getElementById("btn-olho");
const msgErro      = document.getElementById("login-erro");
const msgSucesso   = document.getElementById("login-sucesso");

// Já está logado? Vai direto pro dashboard
if (sessionStorage.getItem("sess_token")) {
  window.location.href = "dashboard.html";
}

// Olho da senha
btnOlho.addEventListener("click", function () {
  const oculta = campoSenha.type === "password";
  campoSenha.type = oculta ? "text" : "password";
  btnOlho.classList.toggle("ativo", oculta);
  btnOlho.title = oculta ? "Ocultar senha" : "Mostrar senha";
});

function mostrarMensagem(elemento, texto) {
  msgErro.classList.add("oculto");
  msgSucesso.classList.add("oculto");
  elemento.textContent = texto;
  elemento.classList.remove("oculto");
}

function botaoCarregando(carregando) {
  btnEntrar.disabled = carregando;
  btnEntrar.innerHTML = carregando
    ? '<span class="spinner"></span> Entrando...'
    : "Entrar";
}

form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const usuario = campoUsuario.value.trim();
  const senha   = campoSenha.value;

  if (!usuario || !senha) {
    mostrarMensagem(msgErro, "Informe usuário e senha.");
    return;
  }

  botaoCarregando(true);

  try {
    await LoginAPI.entrar(usuario, senha);
    mostrarMensagem(msgSucesso, "Login realizado! Carregando dashboard...");
    window.location.href = "dashboard.html";
  } catch (falha) {
    botaoCarregando(false);
    mostrarMensagem(msgErro, falha.message);
  }
});

// Sessão válida? → dashboard. Token morto? → limpa e fica no login.
LoginAPI.redirecionarSeLogado();