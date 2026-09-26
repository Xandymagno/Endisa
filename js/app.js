/**
 * ============================================
 *  APP — LÓGICA PRINCIPAL DO DASHBOARD
 * ============================================
 *  Fluxo: carregar → tratar → calcular KPIs →
 *  preencher filtros → gráficos.
 * ============================================
 */
let periodoJaInicializado = false;

/**
 * Retorna primeiro e último dia do mês vigente (aaaa-mm-dd)
 */
function periodoMesVigente() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  return {
    inicio: ano + "-" + mes + "-01",
    fim: ano + "-" + mes + "-" + String(ultimoDia).padStart(2, "0")
  };
}

// Dados brutos (como vêm da API) e válidos (já tratados)
let dadosBrutos = [];
let dadosValidos = [];

// Instâncias dos gráficos (para destruir/recriar ao filtrar)
let graficos = {};

/**
 * Inicia o carregamento assim que a página abre
 */
document.addEventListener("DOMContentLoaded", async function () {
  await carregarDados();
  document.getElementById("btn-aplicar-filtros")
    .addEventListener("click", aplicarFiltros);
  // Datas reagem na hora da mudança
  ["filtro-inicio", "filtro-fim"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", aplicarFiltros);
  });
});

/**
 * Busca os dados na API, aplica o tratamento e atualiza a tela
 */
async function carregarDados() {
  const overlay = document.getElementById("loading-overlay");
  try {
    // 🗓️ ETAPA 1: preenche o período com o mês vigente na primeira carga
    if (!periodoJaInicializado) {
      const periodo = periodoMesVigente();
      document.getElementById("filtro-inicio").value = periodo.inicio;
      document.getElementById("filtro-fim").value = periodo.fim;
      periodoJaInicializado = true;
    }
    dadosBrutos = await API.buscarDadosDashboard();
    dadosValidos = Tratamento.filtrarValidos(dadosBrutos);
    Multiselect.inicializar({
      os: valoresUnicos(dadosValidos, "OS"),
      encarregado: valoresUnicos(dadosValidos, "Encarregado"),
      polo: valoresUnicos(dadosValidos, "Polo")
    }, aplicarFiltros);
    aplicarFiltros(); // já respeita o mês vigente pré-preenchido
    document.getElementById("footer-atualizacao").textContent =
      "Última atualização: " + new Date().toLocaleString("pt-BR");
  } catch (erro) {
    console.error("[app.js] Erro ao carregar dados:", erro);
    alert("Erro ao carregar dados: " + erro.message);
  } finally {
    overlay.classList.add("oculto");
  }
}

/**
 * Atualiza KPIs e gráficos com uma lista de registros
 */
function atualizarTela(registros) {
  calcularKPIs(registros);
  Charts.renderizarTodos(registros, graficos);
}

/**
 * Aplica os filtros selecionados e reatualiza a tela.
 * Listas vazias = sem filtro naquele campo.
 */
function aplicarFiltros() {
  const os = Multiselect.valores("os");
  const encarregado = Multiselect.valores("encarregado");
  const polo = Multiselect.valores("polo");
  const inicio = document.getElementById("filtro-inicio").value;
  const fim = document.getElementById("filtro-fim").value;
  const filtrados = dadosValidos.filter(function (r) {
    if (os.length && !os.includes(String(r["OS"]).trim())) return false;
    if (encarregado.length && !encarregado.includes(String(r["Encarregado"]).trim())) return false;
    if (polo.length && !polo.includes(String(r["Polo"]).trim())) return false;
    // Período: converte a data do registro e compara com o intervalo
    if (inicio || fim) {
      const iso = Tratamento.dataParaISO(r["DataInicio"]);
      if (!iso) return false;
      if (inicio && iso < inicio) return false;
      if (fim && iso > fim) return false;
    }
    return true;
  });
  atualizarTela(filtrados);
}

/**
 * Calcula os 4 KPIs de produção em km.
 * Recebe apenas registros válidos (já tratados).
 */
function calcularKPIs(registros) {
  // KPI 1: Produção Geral (Manual / Mecanizada)
  const manual = registros.filter(r => Tratamento.tipoExecucao(r) === "MANUAL");
  const mecanizada = registros.filter(r => Tratamento.tipoExecucao(r) === "MECANIZADA");
  document.getElementById("kpi-prod-manual").textContent =
    Tratamento.formatarKm(Tratamento.somarKm(manual));
  document.getElementById("kpi-prod-mecanizada").textContent =
    Tratamento.formatarKm(Tratamento.somarKm(mecanizada));

  // KPI 2: Produção Diária Geral (média por dia de cada tipo)
  document.getElementById("kpi-diaria-manual").textContent =
    Tratamento.formatarKm(Tratamento.producaoDiaria(registros, "MANUAL"));
  document.getElementById("kpi-diaria-mecanizada").textContent =
    Tratamento.formatarKm(Tratamento.producaoDiaria(registros, "MECANIZADA"));

  // KPI 3: Produção Geral Total
  document.getElementById("kpi-prod-total").textContent =
    Tratamento.formatarKm(Tratamento.somarKm(registros));

  // KPI 4: Produção Diária Total (média por dia geral)
  document.getElementById("kpi-diaria-total").textContent =
    Tratamento.formatarKm(Tratamento.producaoDiaria(registros));
}

/**
 * Extrai valores únicos e ordenados de uma coluna
 */
function valoresUnicos(registros, coluna) {
  const conjunto = new Set(
    registros.map(r => String(r[coluna] || "").trim()).filter(v => v !== "")
  );
  return Array.from(conjunto).sort();
}