/**
 * Tabela de acompanhamento das OS.
 * Consolida os dados contratados da aba GERAL com a produção aprovada.
 */
(function () {
  const CAMPOS_GERAL = {
    os: "OS",
    polo: "POLO",
    kmContratado: "EXTENSÃO",
    status: "STATUS"
  };
  const CAMPO_DATA_PRODUCAO = "DataInicio";
  const formatoKm = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const formatoPercentual = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  let ordens = [];
  let registrosGerais = [];
  let registrosProducao = [];
  const graficos = {};
  const situacoesContagem = [
    "À RETORNAR",
    "EM EXECUÇÃO",
    "QUASE CONCLUINDO",
    "À INICIAR",
    "CONCLUÍDO"
  ];
  const situacoesKm = [
    { label: ["EM", "EXECUÇÃO"], situacao: "EM EXECUÇÃO" },
    { label: ["QUASE", "CONCLUINDO"], situacao: "QUASE CONCLUINDO" },
    { label: ["À INICIAR"], situacao: "À INICIAR" }
  ];
  const coresGraficos = ["#0d4b82", "#0d4b82", "#dfc329", "#0d4b82", "#0d4b82"];
  const coresPorPolo = {
    GUARAI: "#1684ed",
    PALMAS: "#666666",
    PARAISO: "#2029a8",
    PORTO: "#e65c2f"
  };

  const rotulosBarras = {
    id: "rotulosBarrasOS",
    afterDatasetsDraw: function (grafico) {
      const ctx = grafico.ctx;
      grafico.data.datasets.forEach(function (dataset, indiceDataset) {
        const meta = grafico.getDatasetMeta(indiceDataset);
        meta.data.forEach(function (elemento, indice) {
          const valor = dataset.data[indice];
          if (!valor) return;
          ctx.save();
          ctx.fillStyle = "#303030";
          ctx.font = "600 12px Arial, sans-serif";
          if (grafico.options.indexAxis === "y") {
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#718096";
            ctx.fillRect(elemento.x + 5, elemento.y - 12, 30, 24);
            ctx.fillStyle = "#fff";
            ctx.fillText(String(valor), elemento.x + 20, elemento.y);
          } else {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(
              formatoKm.format(valor).replace(/,00$/, ""),
              elemento.x,
              elemento.y - 5
            );
          }
          ctx.restore();
        });
      });
    }
  };

  const rotulosPizza = {
    id: "rotulosPizzaOS",
    afterDatasetsDraw: function (grafico) {
      const dataset = grafico.data.datasets[0];
      if (!dataset || !dataset.data.some(function (valor) { return valor > 0; })) return;
      const ctx = grafico.ctx;
      const meta = grafico.getDatasetMeta(0);
      const total = dataset.data.reduce(function (soma, valor) { return soma + valor; }, 0);

      meta.data.forEach(function (arco, indice) {
        const valor = dataset.data[indice];
        if (!valor || !grafico.getDataVisibility(indice)) return;
        const angulo = (arco.startAngle + arco.endAngle) / 2;
        const cos = Math.cos(angulo);
        const sin = Math.sin(angulo);
        const raio = arco.outerRadius;
        const x1 = arco.x + cos * raio;
        const y1 = arco.y + sin * raio;
        const x2 = arco.x + cos * (raio + 10);
        const y2 = arco.y + sin * (raio + 10);
        const x3 = x2 + (cos >= 0 ? 14 : -14);
        const percentual = (valor / total * 100).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        });
        const rotulo = valor + " (" + percentual + "%)";

        ctx.save();
        ctx.strokeStyle = "#999";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y2);
        ctx.stroke();
        ctx.fillStyle = "#303030";
        ctx.font = "600 11px Arial, sans-serif";
        const larguraRotulo = ctx.measureText(rotulo).width;
        const espacoEsquerdo = x3;
        const espacoDireito = grafico.width - x3;
        ctx.textAlign = cos >= 0 ? "left" : "right";
        let posicaoTexto = x3 + (cos >= 0 ? 4 : -4);
        if (ctx.textAlign === "right" && espacoEsquerdo < larguraRotulo + 4) {
          ctx.textAlign = "left";
          posicaoTexto = 4;
        } else if (ctx.textAlign === "left" && espacoDireito < larguraRotulo + 4) {
          ctx.textAlign = "right";
          posicaoTexto = grafico.width - 4;
        }
        ctx.textBaseline = "middle";
        ctx.fillText(rotulo, posicaoTexto, y2);
        ctx.restore();
      });
    }
  };

  function normalizar(valor) {
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function normalizarChaveOS(valor) {
    const texto = normalizar(valor);
    if (!texto) return "";
    if (/^\d+$/.test(texto)) return texto.replace(/^0+(?=\d)/, "");
    return texto.toLocaleUpperCase("pt-BR");
  }

  function normalizarTexto(valor) {
    return normalizar(valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleUpperCase("pt-BR");
  }

  function paraNumero(valor) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
    let texto = normalizar(valor).replace(/[^\d,.-]/g, "");
    if (!texto) return 0;
    if (texto.includes(",")) {
      texto = texto.replace(/\./g, "").replace(",", ".");
    }
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
  }

  function dataParaISO(valor) {
    return Tratamento.dataParaISO(valor);
  }

  function situacaoOS(status, percentualFalta) {
    switch (normalizarTexto(status)) {
      case "CONTRATADO":
        return "À INICIAR";
      case "FINALIZADO":
        return "CONCLUÍDO";
      case "ABERTO":
        return percentualFalta !== null && percentualFalta < 0.1
          ? "QUASE CONCLUINDO"
          : "EM EXECUÇÃO";
      case "DESLIGAMENTO PROGRAMADO":
        return "À RETORNAR";
      default:
        return "";
    }
  }

  function registroValido(registro) {
    return Tratamento.ehAprovado(registro) && !Tratamento.foiExcluido(registro);
  }

  function estaNoPeriodo(registro, inicio, fim) {
    if (!inicio && !fim) return true;
    const data = dataParaISO(registro[CAMPO_DATA_PRODUCAO]);
    if (!data) return false;
    return (!inicio || data >= inicio) && (!fim || data <= fim);
  }

  function agregarProducao(registros, inicio, fim) {
    const mapa = new Map();
    registros.forEach(function (registro) {
      if (!registroValido(registro) || !estaNoPeriodo(registro, inicio, fim)) return;
      const chave = normalizarChaveOS(registro.OS);
      if (!chave) return;
      const km = Tratamento.kmDoTrecho(registro);
      mapa.set(chave, (mapa.get(chave) || 0) + km);
    });
    return mapa;
  }

  function criarOrdens(registrosGerais, registrosProducao, inicio, fim) {
    const producao = agregarProducao(registrosProducao, inicio, fim);
    return registrosGerais
      .filter(function (registro) { return normalizar(registro[CAMPOS_GERAL.os]) !== ""; })
      .map(function (registro) {
        const os = normalizar(registro[CAMPOS_GERAL.os]);
        const kmContratado = paraNumero(registro[CAMPOS_GERAL.kmContratado]);
        const kmProduzido = producao.get(normalizarChaveOS(os)) || 0;
        const percentualExecutado = kmContratado > 0 ? kmProduzido / kmContratado : null;
        const percentualFalta = percentualExecutado === null
          ? null
          : 1 - percentualExecutado;

        return {
          os: os,
          polo: normalizar(registro[CAMPOS_GERAL.polo]),
          kmContratado: kmContratado,
          kmProduzido: kmProduzido,
          percentualExecutado: percentualExecutado,
          percentualFalta: percentualFalta,
          situacao: situacaoOS(registro[CAMPOS_GERAL.status], percentualFalta)
        };
      });
  }

  function preencherOpcoes(select, valores, textoInicial) {
    const selecionado = select.value;
    select.replaceChildren(new Option(textoInicial, ""));
    Array.from(new Set(valores.filter(Boolean)))
      .sort(function (a, b) { return a.localeCompare(b, "pt-BR"); })
      .forEach(function (valor) {
        select.add(new Option(valor, valor));
      });
    if (Array.from(select.options).some(function (option) { return option.value === selecionado; })) {
      select.value = selecionado;
    }
  }

  function atualizarOpcoes() {
    preencherOpcoes(
      document.getElementById("filtro-os"),
      ordens.map(function (ordem) { return ordem.os; }),
      "Todas"
    );
    preencherOpcoes(
      document.getElementById("filtro-polo"),
      ordens.map(function (ordem) { return ordem.polo; }),
      "Todos"
    );
  }

  function correspondeSituacao(ordem, filtro) {
    const situacao = normalizarTexto(ordem.situacao);
    const filtros = {
      retornar: "A RETORNAR",
      execucao: "EM EXECUCAO",
      "quase-concluindo": "QUASE CONCLUINDO",
      iniciar: "A INICIAR",
      concluido: "CONCLUIDO"
    };
    return !filtro || situacao === filtros[filtro];
  }

  function filtrarOrdens() {
    const filtroOS = document.getElementById("filtro-os").value;
    const filtroStatus = document.getElementById("filtro-status").value;
    const filtroPolo = document.getElementById("filtro-polo").value;
    const inicio = document.getElementById("filtro-data-inicio").value;
    const fim = document.getElementById("filtro-data-fim").value;

    ordens = criarOrdens(registrosGerais, registrosProducao, inicio, fim);
    return ordens.filter(function (ordem) {
      return (!filtroOS || ordem.os === filtroOS) &&
        (!filtroPolo || normalizarTexto(ordem.polo) === normalizarTexto(filtroPolo)) &&
        correspondeSituacao(ordem, filtroStatus);
    });
  }

  function renderizarGraficos(dados) {
    if (typeof Chart === "undefined") {
      throw new Error("A biblioteca Chart.js não foi carregada.");
    }

    const contagens = situacoesContagem.map(function (situacao) {
      return dados.filter(function (ordem) {
        return normalizarTexto(ordem.situacao) === normalizarTexto(situacao);
      }).length;
    });

    const valoresKm = situacoesKm.map(function (situacao) {
      return dados
        .filter(function (ordem) {
          return normalizarTexto(ordem.situacao) === normalizarTexto(situacao.situacao);
        })
        .reduce(function (total, ordem) { return total + ordem.kmContratado; }, 0);
    });

    const ordensAbertas = dados.filter(function (ordem) {
      return ["EM EXECUCAO", "QUASE CONCLUINDO", "A INICIAR"]
        .includes(normalizarTexto(ordem.situacao));
    });
    const polos = Array.from(new Set(ordensAbertas.map(function (ordem) {
      return ordem.polo;
    }).filter(Boolean))).sort(function (a, b) {
      const quantidadeA = ordensAbertas.filter(function (ordem) {
        return normalizarTexto(ordem.polo) === normalizarTexto(a);
      }).length;
      const quantidadeB = ordensAbertas.filter(function (ordem) {
        return normalizarTexto(ordem.polo) === normalizarTexto(b);
      }).length;
      return quantidadeB - quantidadeA;
    });
    const contagemPolos = polos.map(function (polo) {
      return ordensAbertas.filter(function (ordem) {
        return normalizarTexto(ordem.polo) === normalizarTexto(polo);
      }).length;
    });

    Object.keys(graficos).forEach(function (chave) {
      graficos[chave].destroy();
      delete graficos[chave];
    });

    graficos.situacao = new Chart(document.getElementById("grafico-situacao"), {
      type: "bar",
      data: {
        labels: situacoesContagem,
        datasets: [{
          data: contagens,
          backgroundColor: coresGraficos,
          borderWidth: 0,
          barPercentage: 0.78,
          categoryPercentage: 0.9
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 40, left: 4, top: 4, bottom: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          x: { display: false, beginAtZero: true, grid: { display: false } },
          y: {
            grid: { display: false },
            ticks: {
              color: "#222",
              font: { size: 12, weight: "600" },
              callback: function (valor) {
                const rotulo = this.getLabelForValue(valor);
                return rotulo === "QUASE CONCLUINDO" ? "QUASE CON..." : rotulo;
              }
            },
            border: { display: false }
          }
        }
      },
      plugins: [rotulosBarras]
    });

    graficos.kmSituacao = new Chart(document.getElementById("grafico-km-situacao"), {
      type: "bar",
      data: {
        labels: situacoesKm.map(function (situacao) { return situacao.label; }),
        datasets: [{
          data: valoresKm,
          backgroundColor: "#0d4b82",
          borderWidth: 0,
          barPercentage: 0.72,
          categoryPercentage: 0.8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18, right: 8, left: 4, bottom: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (contexto) { return formatoKm.format(contexto.parsed.y) + " km"; }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: "Situação OS", color: "#333" },
            grid: { display: false },
            ticks: {
              color: "#555",
              autoSkip: false,
              maxRotation: 0,
              minRotation: 0,
              font: { size: 8 }
            }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "Soma de EXTENSÃO", color: "#555" },
            ticks: { color: "#666" },
            grid: { color: "#dedede", borderDash: [2, 3] }
          }
        }
      },
      plugins: [rotulosBarras]
    });

    graficos.polo = new Chart(document.getElementById("grafico-os-polo"), {
      type: "pie",
      data: {
        labels: polos,
        datasets: [{
          data: contagemPolos,
          backgroundColor: polos.map(function (polo, indice) {
            const normalizado = normalizarTexto(polo).replace(/[^A-Z]/g, "");
            return coresPorPolo[normalizado] || ["#0d9488", "#7c3aed"][indice % 2];
          }),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 12, right: 8, bottom: 12, left: 8 } },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              pointStyle: "circle",
              boxWidth: 8,
              padding: 10,
              font: { size: 9 }
            }
          },
          tooltip: {
            callbacks: {
              label: function (contexto) {
                const soma = contexto.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                const percentual = soma ? contexto.parsed / soma * 100 : 0;
                return contexto.label + ": " + contexto.parsed + " (" +
                  percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%)";
              }
            }
          }
        }
      },
      plugins: [rotulosPizza]
    });
  }

  function renderizarPainel() {
    const corpo = document.getElementById("corpo-tabela-os");
    const filtradas = filtrarOrdens();
    renderizarGraficos(filtradas);
    corpo.replaceChildren();
    if (!filtradas.length) {
      const linha = corpo.insertRow();
      const celula = linha.insertCell();
      celula.colSpan = 7;
      celula.textContent = "Nenhuma OS encontrada para os filtros selecionados.";
    } else {
      filtradas.forEach(function (ordem) {
        const linha = corpo.insertRow();
        const valores = [
          ordem.os,
          ordem.polo || "—",
          formatoKm.format(ordem.kmContratado),
          formatoKm.format(ordem.kmProduzido),
          ordem.percentualExecutado === null
            ? "—"
            : formatoPercentual.format(ordem.percentualExecutado * 100) + "%",
          ordem.percentualFalta === null
            ? "—"
            : formatoPercentual.format(ordem.percentualFalta * 100) + "%",
          ordem.situacao || "—"
        ];
        valores.forEach(function (valor) {
          linha.insertCell().textContent = valor;
        });
      });
    }

    document.getElementById("os-atualizacao").textContent =
      filtradas.length + " OS" +
      " — atualizado em " + new Date().toLocaleString("pt-BR");
  }

  async function inicializar() {
    const corpo = document.getElementById("corpo-tabela-os");
    try {
      const resultados = await Promise.all([
        API.buscarDadosGeral(),
        API.buscarDadosDashboard()
      ]);
      registrosGerais = resultados[0];
      registrosProducao = resultados[1];

      if (!Array.isArray(registrosGerais) || !Array.isArray(registrosProducao)) {
        throw new Error("A API retornou dados em um formato inesperado.");
      }

      ordens = criarOrdens(registrosGerais, registrosProducao, "", "");
      atualizarOpcoes();
      ["filtro-os", "filtro-status", "filtro-polo",
        "filtro-data-inicio", "filtro-data-fim"].forEach(function (id) {
        document.getElementById(id).addEventListener("change", renderizarPainel);
      });
      renderizarPainel();
    } catch (erro) {
      console.error("[os.js] Erro ao carregar os dados das OS:", erro);
      corpo.replaceChildren();
      const linha = corpo.insertRow();
      const celula = linha.insertCell();
      celula.colSpan = 7;
      celula.textContent = "Erro ao carregar os dados: " + erro.message;
    }
  }

  document.addEventListener("DOMContentLoaded", inicializar);
})();
