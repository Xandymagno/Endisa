/**
 * AUTH — PROTEGE O DASHBOARD (usa LoginAPI)
 */
const Sessao = LoginAPI.usuarioLogado();

(async function protegerPagina() {
  const valida = await LoginAPI.sessaoValida();
  if (!valida) LoginAPI.sair();
})();


/**
 * AUTH — protege o dashboard usando a LoginAPI
 */
LoginAPI.protegerPagina();