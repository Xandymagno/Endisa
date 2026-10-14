/**
 * Protege páginas autenticadas e restringe telas por nível de acesso.
 */
(async function protegerPagina() {
  const pagina = window.location.pathname.split("/").pop().toLowerCase();
  if (LoginAPI._estaNoLogin()) return;

  document.documentElement.style.visibility = "hidden";
  const valida = await LoginAPI.protegerPagina();
  if (!valida) return;

  const usuario = LoginAPI.usuarioLogado();
  const nivel = usuario ? String(usuario.nivel || "").trim().toLowerCase() : "";
  const telasClienteAdm = ["os.html", "check-list.html", "apr.html"];
  if (telasClienteAdm.includes(pagina) && !["cliente", "adm"].includes(nivel)) {
    window.location.replace("dashboard.html");
    return;
  }

  document.documentElement.style.visibility = "";
})();