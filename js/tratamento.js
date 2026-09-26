/**
 * ============================================
 *  TRATAMENTO — LIMPEZA E CONVERSÃO DE DADOS
 * ============================================
 *  Transforma os dados brutos da planilha em
 *  dados prontos para exibição.
 *
 *  Regras aplicadas:
 *  1. Remove registros marcados como excluídos (Exclusao = SIM)
 *  2. Mantém apenas trechos APROVADOS
 *  3. Converte extensão de metros para km
 *  4. Converte datas "dd/mm/aaaa" para formato comparável
 *  5. Converte números no formato BR ("296,07" → 296.07)
 *
 *  ⚠️ IMPORTANTE: dentro dos métodos usamos "Tratamento."
 *  em vez de "this." — assim as funções funcionam mesmo
 *  quando chamadas como apelido global pelo charts.js.
 * ============================================
 */

const Tratamento = {

  /**
   * Converte números no formato brasileiro para valor numérico.
   * Trata os 3 casos encontrados na planilha:
   *   296,07      → 296.07
   *   210.012,00  → 210012.00
   *   296.07      → 296.07 (número já convertido pelo Sheets)
   */
  paraNumero: function (valor) {
    if (typeof valor === "number") return valor;
    if (valor === null || valor === undefined) return 0;

    let texto = String(valor).trim();
    if (texto === "") return 0;

    // Remove pontos de milhar e troca vírgula decimal por ponto
    texto = texto.replace(/\./g, "").replace(",", ".");

    return parseFloat(texto) || 0;
  },

  /**
   * Converte a extensão do trecho (em metros) para km.
   * ⚠️ Se a planilha já registrar em km, remova o "/ 1000".
   */
  kmDoTrecho: function (registro) {
    return Tratamento.paraNumero(registro["EXTENSAO DO TRECHO"]) / 1000;
  },

  /**
   * Converte "dd/mm/aaaa" (ou com hora) para "aaaa-mm-dd".
   * Aceita também objetos Date vindos do Apps Script.
   * Retorna "" se não conseguir converter.
   */
  dataParaISO: function (valorData) {
    if (!valorData) return "";

    // Objeto Date real (antes de virar JSON)
    if (valorData instanceof Date && !isNaN(valorData)) {
      return valorData.toISOString().slice(0, 10);
    }

    const texto = String(valorData).trim();
    if (!texto) return "";

    // Formato ISO (como o Apps Script serializa datas do Sheets)
    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
      return texto.slice(0, 10);
    }

    // Formato brasileiro dd/mm/aaaa (com ou sem hora)
    const partes = texto.slice(0, 10).split("/");
    if (partes.length === 3) {
      return partes[2] + "-" + partes[1] + "-" + partes[0];
    }

    return "";
  },

  /**
   * Normaliza o tipo de execução (Equipe: MANUAL / MECANIZADA)
   */
  tipoExecucao: function (registro) {
    return String(registro["Equipe"] || "").trim().toUpperCase();
  },

  /**
   * Verifica se o registro foi excluído (coluna Exclusao = SIM)
   */
  foiExcluido: function (registro) {
    return String(registro["Exclusao"] || "").trim().toUpperCase() === "SIM";
  },

  /**
   * Verifica se o registro está APROVADO na análise
   */
  ehAprovado: function (registro) {
    return String(registro["Situação analise"] || "").trim().toUpperCase() === "APROVADO";
  },

  /**
   * Aplica todas as regras de validação de uma vez:
   * remove excluídos e mantém apenas aprovados.
   */
  filtrarValidos: function (registros) {
    return registros.filter(function (r) {
      return !Tratamento.foiExcluido(r) && Tratamento.ehAprovado(r);
    });
  },

  /**
   * Soma os km de uma lista de registros
   */
  somarKm: function (registros) {
    return registros.reduce(function (total, r) {
      return total + Tratamento.kmDoTrecho(r);
    }, 0);
  },

  /**
   * Calcula a produção diária média:
   * km total dos lançamentos ÷ quantidade de dias distintos.
   *
   * Exemplo: 3 lançamentos dia 05/06 + 2 no dia 06/06 + 5 no dia 08/06
   * → dias distintos = 3 → produção diária = km total ÷ 3
   *
   * @param {Array}  registros - lista de registros (já filtrados)
   * @param {String} tipoFiltro - opcional: "MANUAL" ou "MECANIZADA".
   *                   Se informado, considera só os lançamentos desse tipo
   *                   e divide pelos dias DELES.
   */
  producaoDiaria: function (registros, tipoFiltro) {
    // Filtra pelo tipo, se informado
    let lista = registros;
    if (tipoFiltro) {
      lista = registros.filter(function (r) {
        return Tratamento.tipoExecucao(r) === tipoFiltro;
      });
    }

    // 1. Dias distintos com lançamento
    const dias = new Set();
    lista.forEach(function (r) {
      const iso = Tratamento.dataParaISO(r["DataInicio"]);
      if (iso) dias.add(iso);
    });

    // 2. Proteção contra divisão por zero
    if (dias.size === 0) return 0;

    // 3. km total ÷ dias distintos
    return Tratamento.somarKm(lista) / dias.size;
  },




  /**
   * Agrupa registros por uma coluna e soma o km de cada grupo.
   * Retorna array de { chave, km } ordenado do maior para o menor.
   * Usado pelos gráficos de polo e encarregado.
   */
  agruparPor: function (registros, coluna) {
    const mapa = {};

    registros.forEach(function (r) {
      const chave = String(r[coluna] || "").trim();
      if (!chave) return;
      mapa[chave] = (mapa[chave] || 0) + Tratamento.kmDoTrecho(r);
    });

    return Object.entries(mapa)
      .map(function (par) {
        return { chave: par[0], km: Number(par[1].toFixed(2)) };
      })
      .sort(function (a, b) { return b.km - a.km; });
  },

  /**
   * Formata km no padrão brasileiro (2 casas decimais)
   */
  formatarKm: function (valor) {
    return valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
};

/**
 * Apelidos globais — mantêm o charts.js funcionando sem alterações,
 * pois ele chama kmDoTrecho(), paraNumero() etc. direto.
 * Como os métodos internos não usam mais "this", os apelidos
 * funcionam em qualquer contexto de chamada.
 */
const paraNumero = Tratamento.paraNumero;
const kmDoTrecho = Tratamento.kmDoTrecho;
const dataParaISO = Tratamento.dataParaISO;
const tipoExecucao = Tratamento.tipoExecucao;
const formatarKm = Tratamento.formatarKm;