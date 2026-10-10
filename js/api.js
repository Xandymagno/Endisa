/**
 * ============================================
 *  API — COMUNICAÇÃO COM O APPS SCRIPT
 * ============================================
 *  Única camada que fala com o Web App.
 *  O resto do código chama as funções daqui.
 *
 *  🗓️ O período dos filtros é enviado à API, que filtra
 *  NO SERVIDOR e devolve apenas o intervalo escolhido.
 * ============================================
 */

// ⚠️ Substitua pela URL gerada na implantação do Apps Script
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw1aMVcpcLiU-ZYvbIiVhFezb7AHTp9l6S42H_oPNsJ1touoMHEgSf2CxWpQR8wJeGp/exec";

// ⚠️ O mesmo token definido no Code.gs
const API_TOKEN = "dash-2026-dineng";

/**
 * Função genérica para buscar dados do Apps Script.
 * @param {string} acao       - Nome da ação (ex.: "listar_produtividade")
 * @param {Object} parametros - Parâmetros extras na query string
 * @returns {Promise<Array>}  - Lista de registros (objetos)
 */
async function buscarDados(acao, parametros = {}) {
  const url = new URL(APP_SCRIPT_URL);
  url.searchParams.set("acao", acao);
  url.searchParams.set("token", API_TOKEN);
  Object.entries(parametros).forEach(([chave, valor]) => {
    url.searchParams.set(chave, valor);
  });

  try {
    const resposta = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow" // obrigatório: o Apps Script redireciona 2x
    });

    if (!resposta.ok) {
      throw new Error(`Erro HTTP ${resposta.status}`);
    }

    const dados = await resposta.json();
    if (!dados.success) {
      throw new Error(dados.error || "Erro desconhecido no servidor");
    }

    // 📦 Formato compacto novo (colunas + linhas):
    // remonta em objetos com nome de campo
    if (dados.colunas && dados.linhas) {
      return dados.linhas.map(function (linha) {
        const obj = {};
        dados.colunas.forEach(function (coluna, i) {
          obj[coluna] = linha[i];
        });
        return obj;
      });
    }

    // Compatibilidade: formato antigo (data: [...])
    return dados.data;
  } catch (erro) {
    console.error("[api.js] Falha ao buscar dados:", erro.message);
    throw erro;
  }
}

/**
 * Busca os registros de Produtividade (km por trecho),
 * enviando o período selecionado nos filtros de data.
 * A API filtra no servidor e devolve só o intervalo.
 * @returns {Promise<Array>} Lista de trechos executados no período
 */
function buscarDadosDashboard() {
  // 🗓️ Período selecionado nos filtros (aaaa-mm-dd)
  // const inicio = document.getElementById("filtro-inicio").value;
  // const fim = document.getElementById("filtro-fim").value;

  // const parametros = {};
  // if (inicio) parametros.data_inicio = inicio;
  // if (fim) parametros.data_fim = fim;

  return buscarDados("listar_produtividade");
}

/**
 * Busca os registros completos da aba GERAL.
 * @returns {Promise<Array<Object>>} Lista de registros da aba GERAL
 */
function buscarDadosGeral() {
  return buscarDados("listar_geral");
}

/**
 * Busca dados das abas de checklist na planilha APR.
 * @param {string} action - encarregados, checkDiario, checkSemanal ou justAusencia
 * @returns {Promise<Array<Object>>} Registros retornados pela aba solicitada
 */
async function buscarDadosChecklist(action) {
  const actionsPermitidas = ["encarregados", "checkDiario", "checkSemanal", "justAusencia"];
  if (!actionsPermitidas.includes(action)) {
    throw new Error("Ação de checklist inválida.");
  }

  const url = new URL(APP_SCRIPT_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", API_TOKEN);

  try {
    const resposta = await fetch(url.toString(), { method: "GET", redirect: "follow" });
    if (!resposta.ok) throw new Error("Erro HTTP " + resposta.status);

    const dados = await resposta.json();
    if (!dados.success) throw new Error(dados.error || "Erro ao consultar os dados de checklist.");
    if (!Array.isArray(dados.colunas) || !Array.isArray(dados.linhas)) {
      throw new Error("A API de checklist retornou um formato inesperado.");
    }

    return dados.linhas.map(function (linha) {
      const registro = {};
      dados.colunas.forEach(function (coluna, indice) {
        registro[coluna] = linha[indice] === undefined ? "" : linha[indice];
      });
      return registro;
    });
  } catch (erro) {
    console.error("[api.js] Falha ao buscar checklist " + action + ":", erro.message);
    throw erro;
  }
}

/**
 * Expõe as funções globalmente para app.js e charts.js
 */
window.API = {
  buscarDados,
  buscarDadosDashboard,
  buscarDadosGeral,
  buscarDadosChecklist
};