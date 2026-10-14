/* js/sidebar.js — monta o sidebar em todas as páginas + comportamento */
(function () {
  const PAGINA_ATUAL = location.pathname.split("/").pop() || "dashboard.html";

  const LINKS = [
    { href: "dashboard.html", icone: "📊", texto: "Dashboard" },
    { href: "os.html",        icone: "📋", texto: "OS", niveis: ["adm", "cliente"] },
    { href: "check-list.html", icone: "✅", texto: "Check-list", niveis: ["adm", "cliente"] },
    { href: "apr.html",       icone: "📝", texto: "APR", niveis: ["adm", "cliente"] },
    { href: "admin.html",     icone: "👥", texto: "Usuários", niveis: ["adm"] }
    // ← adicione novos itens aqui conforme o menu cresce
  ];

  const usuario = LoginAPI.usuarioLogado();
  const nivelUsuario = usuario ? String(usuario.nivel || "").trim().toLowerCase() : "";
  const inicial = usuario ? String(usuario.usuario).charAt(0).toUpperCase() : "—";

  const links = LINKS
    .filter(function (link) {
      return !link.niveis || link.niveis.includes(nivelUsuario);
    })
    .map(function (l) {
      const ativo = l.href === PAGINA_ATUAL ? " ativo" : "";
      return '<a href="' + l.href + '" class="sidebar-link' + ativo + '" data-titulo="' + l.texto + '">' +
             '<span class="sidebar-icone">' + l.icone + '</span>' +
             '<span class="sidebar-texto">' + l.texto + '</span></a>';
    })
    .join("");

  const html =
    '<aside class="sidebar" id="sidebar">' +
      '<div class="sidebar-marca">' +
        '<img src="assets/img/logo_nome.png" alt="ENDISA" class="sidebar-logo">' +
        '<button type="button" class="sidebar-toggle" id="btn-toggle">«</button>' +
      '</div>' +
      '<nav class="sidebar-nav">' + links + '</nav>' +
      '<div class="sidebar-rodape">' +
        '<div class="sidebar-usuario">' +
          '<div class="sidebar-avatar">' + inicial + '</div>' +
          '<div class="sidebar-nome">' + (usuario ? usuario.usuario : "—") + '</div>' +
        '</div>' +
        '<button type="button" class="sidebar-sair" id="btn-sair">Sair</button>' +
      '</div>' +
    '</aside>' +
    '<div class="sidebar-fundo" id="sidebar-fundo"></div>';

  document.body.insertAdjacentHTML("afterbegin", html);

  // ---------- Comportamento (agora os elementos EXISTEM) ----------

  // Recolher / expandir — UMA classe no body controla tudo
  const btnToggle = document.getElementById("btn-toggle");
  btnToggle.addEventListener("click", function () {
    document.body.classList.toggle("sidebar-recolhida");
    btnToggle.title = document.body.classList.contains("sidebar-recolhida")
      ? "Expandir menu" : "Recolher menu";
  });

  // Gaveta no mobile — o ☰ fica no cabeçalho de cada página
  const sidebar = document.getElementById("sidebar");
  const fundo   = document.getElementById("sidebar-fundo");
  const btnMenu = document.getElementById("btn-menu");

  function fechar() {
    sidebar.classList.remove("aberta");
    fundo.classList.remove("aberto");
  }

  if (btnMenu) {
    btnMenu.addEventListener("click", function () {
      sidebar.classList.toggle("aberta");
      fundo.classList.toggle("aberto");
    });
  }
  fundo.addEventListener("click", fechar);

  // Fechar a gaveta ao navegar
  document.querySelectorAll(".sidebar-link").forEach(function (link) {
    link.addEventListener("click", fechar);
  });

  // Sair
  document.getElementById("btn-sair").addEventListener("click", function () {
    LoginAPI.sair();
  });
})();