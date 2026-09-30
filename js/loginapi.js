/**
 * ============================================
 *  LOGINAPI — CAMADA DE AUTENTICAÇÃO
 * ============================================
 *  Única camada que fala com o Apps Script
 *  para login e sessão.
 *
 *  🛡️ Proteção anti-loop:
 *  - sair() não redireciona se já está no login
 *  - redirecionarSeLogado() só manda pro dashboard
 *    com token VÁLIDO (token morto é limpo, não redireciona)
 *  - protegerPagina() nunca roda na página de login
 */

const LOGIN_API_URL = "https://script.google.com/macros/s/AKfycbwWAYk_B78JmGH8NW16XarOnRJkQ9PoNkpEI7-4PiMsvsskN6_iSiVOU0x0PXwsTuNHOA/exec";

const PAGINA_LOGIN     = "index.html";
const PAGINA_DASHBOARD = "dashboard.html";

const LoginAPI = {

  /**
   * Chama o Apps Script via POST
   * (usuário e senha nunca vão na URL)
   */


  chamar(parametros) {
    return this._chamar(parametros);
  },
  async _chamar(parametros) {
    const corpo = new URLSearchParams(parametros);
    const resposta = await fetch(LOGIN_API_URL, {
      method: "POST",
      body: corpo
    });
    if (!resposta.ok) throw new Error("Erro " + resposta.status + " na API.");
    return resposta.json();
  },

  /**
   * A página atual é o login?
   * Cobre também a raiz do site ("/")
   */
  _estaNoLogin() {
    const arquivo = window.location.pathname.split("/").pop().toLowerCase();
    return arquivo === "" || arquivo === "index.html";
  },

  /**
   * Faz login e guarda a sessão no navegador.
   * Retorna os dados da sessão em caso de sucesso.
   */
  async entrar(usuario, senha) {
    const dados = await this._chamar({
      acao:    "login",
      usuario: usuario,
      senha:   senha
    });

    if (!dados.ok) throw new Error(dados.erro || "Falha no login.");

    sessionStorage.setItem("sess_token",   dados.token);
    sessionStorage.setItem("sess_usuario", dados.sessao.usuario);
    sessionStorage.setItem("sess_nivel",   dados.sessao.nivel);
    sessionStorage.setItem("sess_polo",    dados.sessao.polo);

    return dados.sessao;
  },

  /**
   * Confere se a sessão atual ainda é válida.
   * Retorna true/false (nunca lança erro).
   */
  async sessaoValida() {
    const token = sessionStorage.getItem("sess_token");
    if (!token) return false;

    try {
      const dados = await this._chamar({
        acao:  "validar_sessao",
        token: token
      });
      return !!dados.ok;
    } catch (falha) {
      console.error("[loginapi.js] Falha ao validar sessão:", falha);
      return false;
    }
  },

  /**
   * 🏠 PARA A PÁGINA DE LOGIN (index.html)
   * Já tem sessão válida? → vai pro dashboard.
   * Token morto? → limpa e FICA no login (quebra o loop).
   */
  async redirecionarSeLogado() {
    if (!this._estaNoLogin()) return;
    if (!sessionStorage.getItem("sess_token")) return; // sem token: fica

    const valida = await this.sessaoValida();
    if (valida) {
      window.location.replace(PAGINA_DASHBOARD);
    } else {
      sessionStorage.clear();
    }
  },

  /**
   * 🔐 PARA O DASHBOARD (dashboard.html)
   * Exige sessão válida. Sem sessão → volta pro login
   * (uma vez só, pois sair() tem guarda anti-loop).
   */
  async protegerPagina() {
    if (this._estaNoLogin()) return true; // nunca protege o próprio login
    const valida = await this.sessaoValida();
    if (!valida) this.sair();
    return valida;
  },

  /**
   * Dados do usuário logado (ou null)
   */
  usuarioLogado() {
    if (!sessionStorage.getItem("sess_token")) return null;
    return {
      usuario: sessionStorage.getItem("sess_usuario"),
      nivel:   sessionStorage.getItem("sess_nivel"),
      polo:    sessionStorage.getItem("sess_polo")
    };
  },

  /**
   * Encerra a sessão e volta pro login.
   * Se já estiver no login, só limpa — sem redirecionar.
   */
  sair() {
    sessionStorage.clear();
    if (!this._estaNoLogin()) {
      window.location.replace(PAGINA_LOGIN);
    }
  }


};

window.LoginAPI = LoginAPI;