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
 * Busca dados das abas de checklist e APR na planilha APR.
 * @param {string} action - Nome da aba autorizada na API
 * @returns {Promise<Array<Object>>} Registros retornados pela aba solicitada
 */
async function consultarAbaChecklist(action) {
  const actionsPermitidas = ["encarregados", "checkDiario", "checkSemanal", "justAusencia", "listar_apr"];
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
    return dados;
  } catch (erro) {
    console.error("[api.js] Falha ao buscar checklist " + action + ":", erro.message);
    throw erro;
  }
}

function mapearLinhasChecklist(dados) {
  return dados.linhas.map(function (linha) {
    const registro = {};
    dados.colunas.forEach(function (coluna, indice) {
      registro[coluna] = linha[indice] === undefined ? "" : linha[indice];
    });
    return registro;
  });
}

async function buscarDadosChecklist(action) {
  return mapearLinhasChecklist(await consultarAbaChecklist(action));
}

async function buscarDadosAPR() {
  const dados = await consultarAbaChecklist("listar_apr");
  return {
    colunas: dados.colunas,
    registros: mapearLinhasChecklist(dados)
  };
}

/**
 * Busca a lista de motivos configurados na aba CONFIG_AUSENCIA.
 * @returns {Promise<string[]>} Motivos disponíveis
 */
async function buscarMotivosAusenciaChecklist() {
  const url = new URL(APP_SCRIPT_URL);
  url.searchParams.set("action", "motivosAusencia");
  url.searchParams.set("token", API_TOKEN);

  try {
    const resposta = await fetch(url.toString(), { method: "GET", redirect: "follow" });
    if (!resposta.ok) throw new Error("Erro HTTP " + resposta.status);
    const dados = await resposta.json();
    if (!dados.success) throw new Error(dados.error || "Erro ao consultar os motivos de ausência.");
    if (!Array.isArray(dados.motivos)) throw new Error("A API retornou uma lista de motivos inválida.");
    return dados.motivos;
  } catch (erro) {
    console.error("[api.js] Falha ao buscar motivos de ausência:", erro.message);
    throw erro;
  }
}

/**
 * Lista justificativas cadastradas para permitir sua remoção.
 * @returns {Promise<Object[]>} Justificativas cadastradas
 */
async function listarJustificativasChecklist() {
  const url = new URL(APP_SCRIPT_URL);
  url.searchParams.set("action", "listarJustificativas");
  url.searchParams.set("token", API_TOKEN);

  try {
    const resposta = await fetch(url.toString(), { method: "GET", redirect: "follow" });
    if (!resposta.ok) throw new Error("Erro HTTP " + resposta.status);
    const dados = await resposta.json();
    if (!dados.success) throw new Error(dados.error || "Erro ao consultar as justificativas.");
    if (!Array.isArray(dados.justificativas)) {
      throw new Error("A API retornou uma lista de justificativas inválida.");
    }
    return dados.justificativas;
  } catch (erro) {
    console.error("[api.js] Falha ao listar justificativas:", erro.message);
    throw erro;
  }
}

/**
 * Exclui uma justificativa pelo identificador persistido.
 * @param {string} id
 * @returns {Promise<Object>} Resultado da exclusão
 */
async function excluirJustificativaChecklist(id) {
  const parametros = new URLSearchParams({
    action: "excluir_justificativa",
    token: API_TOKEN,
    id: id
  });
  try {
    const resposta = await fetch(APP_SCRIPT_URL, {
      method: "POST",
      body: parametros,
      redirect: "follow"
    });
    if (!resposta.ok) throw new Error("Erro HTTP " + resposta.status);
    const dados = await resposta.json();
    if (!dados.success) throw new Error(dados.error || "Erro ao excluir a justificativa.");
    return dados;
  } catch (erro) {
    console.error("[api.js] Falha ao excluir justificativa:", erro.message);
    throw erro;
  }
}

/**
 * Registra uma justificativa global na aba JUST_AUSENCIA.
 * @param {{dataInicio: string, dataFim: string, motivo: string}} justificativa
 * @returns {Promise<Object>} Resultado do cadastro
 */
async function cadastrarJustificativaChecklist(justificativa) {
  const parametros = new URLSearchParams({
    action: "cadastrar_justificativa",
    token: API_TOKEN,
    data_inicio: justificativa.dataInicio,
    data_fim: justificativa.dataFim,
    justificativa: justificativa.motivo,
    escopo: justificativa.escopo,
    colaboradores: JSON.stringify(justificativa.colaboradores),
    aplicacao: justificativa.aplicacao,
    quantidade_apr: justificativa.quantidadeApr || ""
  });

  try {
    const resposta = await fetch(APP_SCRIPT_URL, {
      method: "POST",
      body: parametros,
      redirect: "follow"
    });
    if (!resposta.ok) throw new Error("Erro HTTP " + resposta.status);

    const dados = await resposta.json();
    if (!dados.success) throw new Error(dados.error || "Erro ao cadastrar a justificativa.");
    return dados;
  } catch (erro) {
    console.error("[api.js] Falha ao cadastrar justificativa:", erro.message);
    throw erro;
  }
}

/**
 * Cadastra um novo motivo na aba CONFIG_AUSENCIA.
 * @param {string} motivo
 * @returns {Promise<Object>} Resultado do cadastro
 */
async function cadastrarMotivoAusenciaChecklist(motivo) {
  const parametros = new URLSearchParams({
    action: "cadastrar_motivo_ausencia",
    token: API_TOKEN,
    motivo: motivo
  });

  try {
    const resposta = await fetch(APP_SCRIPT_URL, {
      method: "POST",
      body: parametros,
      redirect: "follow"
    });
    if (!resposta.ok) throw new Error("Erro HTTP " + resposta.status);

    const dados = await resposta.json();
    if (!dados.success) throw new Error(dados.error || "Erro ao cadastrar o motivo.");
    return dados;
  } catch (erro) {
    console.error("[api.js] Falha ao cadastrar motivo:", erro.message);
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
  buscarDadosChecklist,
  buscarDadosAPR,
  buscarMotivosAusenciaChecklist,
  cadastrarJustificativaChecklist,
  cadastrarMotivoAusenciaChecklist,
  listarJustificativasChecklist,
  excluirJustificativaChecklist
};