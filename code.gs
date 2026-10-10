/**
 * ============================================
 *  API DO DASHBOARD — ROTEADOR DE AÇÕES
 * ============================================
 *  Uma única API atende todas as telas via parâmetro "acao".
 *  Acesso preservado às DUAS planilhas: Produtividade e APR.
 * ============================================
 */

// ⚠️ Troque pelo seu token secreto (o mesmo do api.js)
const TOKEN_SECRETO = "dash-2026-dineng";

// ID da planilha APR (usado pelas telas de APR)
const ID_PLANILHA = "1IiwWmy7Cn2ADIMxolYkCUyPN-9A8zlijdUq70tTzo7w";

// ID da planilha de Produtividade
const ID_PLANILHA_PROD = "1atnGPGCCPjCBWkP1jYWm5DV4z7jyQiOuNDgF_taLhbg";

// Aba geral da planilha de produtividade
const NOME_ABA_GERAL = "GERAL";

// Aba de produtividade (usada pela ação listar_produtividade)
const NOME_ABA_PROD = "Produtividade";

// Colunas que o dashboard de produtividade usa (9 de 32)
const COLUNAS_USADAS = [
  "DataInicio",
  "OS",
  "Polo",
  "Encarregado",
  "Equipe",
  "TipodaLimpeza",
  "EXTENSAO DO TRECHO",
  "Situação analise",
  "Exclusao"
];

function doGet(e) {
  const token = e.parameter.token;
  if (token !== TOKEN_SECRETO) {
    return responderJson({ success: false, error: "Token inválido" });
  }

  const acao = e.parameter.action || e.parameter.acao;

  // 🎯 ROTEADOR: cada tela pede sua ação
  switch (acao) {

    case "listar_produtividade":
      return responderJson({
        success: true,
        colunas: COLUNAS_USADAS,
        linhas: lerProdutividadeCompacta(
          e.parameter.data_inicio, // ex.: 2026-09-01
          e.parameter.data_fim     // ex.: 2026-09-30
        )
      });

    case "listar_geral":
      try {
        const dados = lerGeralCompacta();
        return responderJson({
          success: true,
          colunas: dados.colunas,
          linhas: dados.linhas
        });
      } catch (erro) {
        console.error("[listar_geral] Falha ao ler a aba GERAL:", erro);
        return responderJson({
          success: false,
          error: erro.message || "Não foi possível ler a aba GERAL"
        });
      }

    case "encarregados":
      return responderAbaChecklist("BANCO COLABORADOR");

    case "checkDiario":
      return responderAbaChecklist("CHECK-LIST DIÁRIO");

    case "checkSemanal":
      return responderAbaChecklist("CHECK-LIST SEMANAL");

    case "justAusencia":
      return responderAbaChecklist("JUST_AUSENCIA");

    case "listar_apr":
      // 📌 TELA APR: aqui entra a chamada das suas funções
      // existentes que usam ID_PLANILHA. Ex.:
      // return responderJson({ success: true, data: lerAPR() });
      return responderJson({ success: false, error: "Em construção" });

    case "ping":
      return responderJson({
        success: true,
        mensagem: "✅ Versão NOVA ativa — " + new Date().toLocaleString("pt-BR")
      });




    default:
      return responderJson({ success: false, error: "Ação não reconhecida" });
  }
}

/**
 * Responde com os dados exibidos de uma aba da planilha de APR/check-list.
 */
function responderAbaChecklist(nomeAba) {
  try {
    const ss = SpreadsheetApp.openById(ID_PLANILHA);
    const nomeNormalizado = normalizarNomeAba(nomeAba);
    const aba = ss.getSheets().find(function (planilha) {
      return normalizarNomeAba(planilha.getName()) === nomeNormalizado;
    });
    if (!aba) {
      const nomesDisponiveis = ss.getSheets().map(function (planilha) {
        return planilha.getName();
      });
      throw new Error(
        'A aba "' + nomeAba + '" não foi encontrada. Abas disponíveis: ' +
        nomesDisponiveis.join(", ")
      );
    }

    const ultimaLinha = aba.getLastRow();
    const ultimaColuna = aba.getLastColumn();
    if (!ultimaLinha || !ultimaColuna) {
      return responderJson({ success: true, colunas: [], linhas: [] });
    }

    const valores = aba.getRange(1, 1, ultimaLinha, ultimaColuna).getDisplayValues();
    const colunas = valores[0].map(function (coluna) { return coluna.trim(); });
    const linhas = valores.slice(1).filter(function (linha) {
      return linha.some(function (valor) { return valor !== ""; });
    });

    return responderJson({ success: true, colunas: colunas, linhas: linhas });
  } catch (erro) {
    console.error("[checklist] Falha ao ler a aba " + nomeAba + ":", erro);
    return responderJson({
      success: false,
      error: erro.message || 'Não foi possível ler a aba "' + nomeAba + '".'
    });
  }
}

/**
 * Compara nomes de abas ignorando acentos, espaços e pontuação.
 */
function normalizarNomeAba(nome) {
  return String(nome)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Lê todos os campos preenchidos da aba GERAL.
 * Usa os valores exibidos para preservar identificadores formatados,
 * como OS com zeros à esquerda, e datas conforme aparecem na planilha.
 */
function lerGeralCompacta() {
  const ss = SpreadsheetApp.openById(ID_PLANILHA_PROD);
  const aba = ss.getSheetByName(NOME_ABA_GERAL);

  if (!aba) {
    throw new Error('A aba "' + NOME_ABA_GERAL + '" não foi encontrada na planilha.');
  }

  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();
  if (ultimaLinha === 0 || ultimaColuna === 0) {
    return { colunas: [], linhas: [] };
  }

  const valores = aba.getRange(1, 1, ultimaLinha, ultimaColuna).getDisplayValues();
  const colunas = valores[0].map(function (coluna) {
    return coluna.trim();
  });

  const linhas = [];
  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];
    if (linha.every(function (valor) { return valor === ""; })) continue;
    linhas.push(linha);
  }

  return { colunas: colunas, linhas: linhas };
}

/**
 * Lê a aba de produtividade uma única vez, aplica o filtro
 * de período no servidor e monta linhas compactas.
 */
function lerProdutividadeCompacta(dataInicio, dataFim) {
  const ss = SpreadsheetApp.openById(ID_PLANILHA_PROD);
  const aba = ss.getSheetByName(NOME_ABA_PROD);

  const valores = aba.getDataRange().getValues();
  const cabecalho = valores[0];

  const indices = COLUNAS_USADAS.map(function (col) {
    return cabecalho.indexOf(col);
  });

  const limiteInicio = dataInicio ? new Date(dataInicio + "T00:00:00") : null;
  const limiteFim = dataFim ? new Date(dataFim + "T23:59:59") : null;

  const linhas = [];
  for (let i = 1; i < valores.length; i++) {
    const linha = valores[i];

    // 🗓️ FILTRO DE PERÍODO NO SERVIDOR — a linha descartada
    // nem entra na resposta
    if (limiteInicio || limiteFim) {
      const dataLancamento = converterData(linha[indices[0]]);
      if (!dataLancamento) continue;
      if (limiteInicio && dataLancamento < limiteInicio) continue;
      if (limiteFim && dataLancamento > limiteFim) continue;
    }

    const compacta = [];
    for (let j = 0; j < indices.length; j++) {
      compacta.push(indices[j] === -1 ? "" : linha[indices[j]]);
    }
    linhas.push(compacta);
  }

  return linhas;
}

/**
 * Converte o valor da célula em Date confiável
 * (Date do Sheets ou texto "dd/mm/aaaa")
 */
function converterData(valor) {
  if (valor instanceof Date) return valor;
  if (!valor) return null;

  const texto = String(valor).trim();
  const partes = texto.slice(0, 10).split("/");
  if (partes.length === 3) {
    return new Date(partes[2], partes[1] - 1, partes[0]);
  }
  const d = new Date(texto);
  return isNaN(d) ? null : d;
}

/**
 * Resposta JSON padrão
 */
function responderJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 📌 SUAS FUNÇÕES EXISTENTES DA APR CONTINUAM AQUI, INTACTAS
//    (elas usam ID_PLANILHA e não foram removidas)
// ============================================================