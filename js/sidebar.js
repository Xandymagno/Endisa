/**
 * SIDEBAR — navegação + acesso do usuário
 * Estado recolhido fica no <body>: sidebar e conteúdo andam juntos.
 */
(function () {
  const usuario = LoginAPI.usuarioLogado();
  const inicial = usuario ? usuario.usuario.charAt(0).toUpperCase() : "?";

  // Preenche o usuário na sidebar e no cabeçalho
  document.getElementById("sidebar-avatar").textContent = inicial;
  document.getElementById("sidebar-nome").textContent =
    usuario ? usuario.usuario : "—";
  document.getElementById("cabecalho-nome").textContent =
    usuario ? usuario.usuario : "—";
  document.getElementById("cabecalho-nivel").textContent =
    usuario ? usuario.nivel : "—";

  // Link "Usuários" só aparece para admin
  if (usuario && String(usuario.nivel).toLowerCase() === "adm") {
    document.getElementById("link-admin").hidden = false;
  }

  // Gaveta no mobile
  const sidebar = document.getElementById("sidebar");
  const fundo   = document.getElementById("sidebar-fundo");

  function fechar() {
    sidebar.classList.remove("aberta");
    fundo.classList.remove("aberto");
  }

  document.getElementById("btn-menu").addEventListener("click", function () {
    sidebar.classList.toggle("aberta");
    fundo.classList.toggle("aberto");
  });
  fundo.addEventListener("click", fechar);

  // Link ativo ao clicar
  document.querySelectorAll(".sidebar-link").forEach(function (link) {
    link.addEventListener("click", function () {
      document.querySelectorAll(".sidebar-link").forEach(function (l) {
        l.classList.remove("ativo");
      });
      link.classList.add("ativo");
      fechar();
    });
  });

  // Recolher / expandir — UMA classe no body controla tudo
  const btnToggle = document.getElementById("btn-toggle");
  if (btnToggle) {
    btnToggle.addEventListener("click", function () {
      document.body.classList.toggle("sidebar-recolhida");
      btnToggle.title = document.body.classList.contains("sidebar-recolhida")
        ? "Expandir menu" : "Recolher menu";
    });
  }

  // Sair (sidebar e cabeçalho)
  ["btn-sair-sidebar", "btn-sair-topo"].forEach(function (id) {
    const botao = document.getElementById(id);
    if (botao) botao.addEventListener("click", function () {
      LoginAPI.sair();
    });
  });
})();