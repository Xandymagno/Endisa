/**
 * ============================================
 *  CHARTS — GRÁFICOS DO DASHBOARD
 * ============================================
 *  Usa a biblioteca Chart.js (carregada no index.html).
 *
 *  Gráficos (espelham o Power BI):
 *  1. Produção em km por Polo (barras Manual × Mecanizada)
 *  2. Produção em km por Encarregado (ranking)
 *  3. Produção em km Linear Total por Polo (rosca)
 *  4. % Supressão de Vegetação (pizza por tipo de limpeza)
 *
 *  Design das pizzas/rosca (conforme referência):
 *  - Legenda à esquerda com círculos coloridos
 *  - Porcentagens fora do gráfico, com linhas de chamada
 *  - Paleta em tons de azul e verde
 * ============================================
 */

/**
 * Plugin: desenha o valor no fim de cada barra (gráficos 1 e 2).
 */
const pluginValoresNasBarras = {
  id: "valoresNasBarras",
  afterDatasetsDraw: function (chart) {
    const ctx = chart.ctx;
    chart.data.datasets.forEach(function (dataset, i) {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach(function (barra, j) {
        const valor = dataset.data[j];
        if (!valor) return; // não desenha zero
        ctx.save();
        ctx.fillStyle = "#1f2937";
        ctx.font = "600 11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
          Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
          barra.x + 5,
          barra.y
        );
        ctx.restore();
      });
    });
  }
};

/**
 * Plugin: porcentagens FORA da pizza/rosca, com linhas de chamada
 * conectando cada fatia ao seu rótulo (estilo Power BI).
 * Recalcula as % considerando apenas as fatias visíveis.
 */
const pluginRotulosPercentuais = {
  id: "rotulosPercentuais",
  afterDatasetsDraw: function (chart) {
    const tipo = chart.config.type;
    if (tipo !== "pie" && tipo !== "doughnut") return;

    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    const data = chart.data.datasets[0].data;

    // Total apenas das fatias visíveis (respeita cliques na legenda)
    let total = 0;
    data.forEach(function (v, i) {
      if (chart.getDataVisibility(i)) total += v;
    });
    if (!total) return;

    const area = chart.chartArea;
    const cx = area.left + (area.right - area.left) / 2;
    const cy = area.top + (area.bottom - area.top) / 2;
    const raio = meta.data[0] ? meta.data[0].outerRadius : 0;

    meta.data.forEach(function (arco, i) {
      if (!chart.getDataVisibility(i)) return;
      const pct = ((data[i] / total) * 100).toFixed(1) + "%";

      const angulo = (arco.startAngle + arco.endAngle) / 2;
      const cos = Math.cos(angulo);
      const sin = Math.sin(angulo);

      // Linha de chamada: borda da fatia → ponto externo → segmento reto
      const x1 = cx + cos * raio;
      const y1 = cy + sin * raio;
      const x2 = cx + cos * (raio + 10);
      const y2 = cy + sin * (raio + 10);
      const x3 = x2 + (cos >= 0 ? 12 : -12);

      ctx.save();
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y2);
      ctx.stroke();

      ctx.fillStyle = "#1f2937";
      ctx.font = "600 12px sans-serif";
      ctx.textAlign = cos >= 0 ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(pct, x3 + (cos >= 0 ? 4 : -4), y2);
      ctx.restore();
    });
  }
};

/**
 * Plugin: escreve o total no centro da rosca (gráfico 3).
 * O texto é definido em options.plugins.textoCentral.
 */
const pluginTextoCentral = {
  id: "textoCentral",
  afterDraw: function (chart) {
    const cfg = chart.options.plugins.textoCentral;
    if (!cfg || !cfg.texto) return;

    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data[0]) return;

    const cx = (meta.data[0].x);
    const cy = (meta.data[0].y);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#111827";
    ctx.font = "700 20px sans-serif";
    ctx.fillText(cfg.texto, cx, cy - 8);
    ctx.fillStyle = "#6b7280";
    ctx.font = "500 11px sans-serif";
    ctx.fillText(cfg.subtitulo || "", cx, cy + 12);
    ctx.restore();
  }
};

const Charts = {

  /**
   * Renderiza (ou re-renderiza) os 4 gráficos.
   * Chamado pelo app.js a cada filtro aplicado.
   */
  renderizarTodos: function (registros, graficos) {
    this.graficoPorPolo(registros, graficos);
    this.graficoPorEncarregado(registros, graficos);
    this.graficoLinearPolo(registros, graficos);
    this.graficoSupressao(registros, graficos);
  },

  /**
   * Destrói um gráfico anterior antes de recriar
   */
  destruirSeExistir: function (graficos, chave) {
    if (graficos[chave]) {
      graficos[chave].destroy();
    }
  },

  /**
   * Paleta azul/verde da referência
   */
  cores: ["#1e40af", "#2563eb", "#0d9488", "#22c55e", "#60a5fa", "#34d399"],

  /**
   * Opções comuns de pizza/rosca: legenda à esquerda com círculos
   */
  opcoesPizza: function (extras) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 30 }, // espaço para os rótulos externos
      plugins: {
        legend: {
          position: "left",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 8,
            padding: 12
          }
        }
      }
    }, extras || {});
  },

  /**
   * 1. Barras horizontais agrupadas: km por Polo, Manual × Mecanizada
   */
  graficoPorPolo: function (registros, graficos) {
    this.destruirSeExistir(graficos, "polo");

    const mapa = {};
    registros.forEach(function (r) {
      const polo = String(r["Polo"] || "").trim();
      if (!polo) return;
      if (!mapa[polo]) mapa[polo] = { manual: 0, mecanizada: 0 };
      if (tipoExecucao(r) === "MANUAL") {
        mapa[polo].manual += kmDoTrecho(r);
      } else if (tipoExecucao(r) === "MECANIZADA") {
        mapa[polo].mecanizada += kmDoTrecho(r);
      }
    });

    // Ordena do maior total para o menor
    const pares = Object.entries(mapa).sort(function (a, b) {
      return (b[1].manual + b[1].mecanizada) - (a[1].manual + a[1].mecanizada);
    });

    const polos = pares.map(p => p[0]);
    const kmManual = pares.map(p => Number(p[1].manual.toFixed(2)));
    const kmMecanizada = pares.map(p => Number(p[1].mecanizada.toFixed(2)));

    graficos.polo = new Chart(
      document.getElementById("grafico-prod-polo"),
      {
        type: "bar",
        data: {
          labels: polos,
          datasets: [
            { label: "Manual", data: kmManual, backgroundColor: "#93c5fd" },
            { label: "Mecanizada", data: kmMecanizada, backgroundColor: "#1e40af" }
          ]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "top" } },
          scales: { x: { beginAtZero: true } }
        },
        plugins: [pluginValoresNasBarras]
      }
    );
  },

  /**
   * 2. Barras horizontais: km por Encarregado (ranking decrescente)
   */
  graficoPorEncarregado: function (registros, graficos) {
    this.destruirSeExistir(graficos, "encarregado");

    const agrupado = Tratamento.agruparPor(registros, "Encarregado");
    const nomes = agrupado.map(a => a.chave);
    const valores = agrupado.map(a => a.km);

    graficos.encarregado = new Chart(
      document.getElementById("grafico-prod-encarregado"),
      {
        type: "bar",
        data: {
          labels: nomes,
          datasets: [{
            label: "km executados",
            data: valores,
            backgroundColor: "#2563eb"
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true } }
        },
        plugins: [pluginValoresNasBarras]
      }
    );
  },

  /**
   * 3. Rosca: participação de cada polo no km linear total,
   * com o total no centro e % externas com linhas de chamada.
   */
  graficoLinearPolo: function (registros, graficos) {
    this.destruirSeExistir(graficos, "linear");

    const agrupado = Tratamento.agruparPor(registros, "Polo");
    const polos = agrupado.map(a => a.chave);
    const valores = agrupado.map(a => a.km);
    const totalKm = valores.reduce((a, b) => a + b, 0);

    graficos.linear = new Chart(
      document.getElementById("grafico-linear-polo"),
      {
        type: "doughnut",
        data: {
          labels: polos,
          datasets: [{
            data: valores,
            backgroundColor: this.cores.slice(0, polos.length),
            borderWidth: 2,
            borderColor: "#ffffff"
          }]
        },
        options: this.opcoesPizza({
          cutout: "55%",
          plugins: {
            legend: {
              position: "left",
              labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 12 }
            },
            textoCentral: {
              texto: Tratamento.formatarKm(totalKm),
              subtitulo: "km total"
            },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = ((ctx.raw / total) * 100).toFixed(1);
                  return ctx.label + ": " + Tratamento.formatarKm(ctx.raw) + " km (" + pct + "%)";
                }
              }
            }
          }
        }),
        plugins: [pluginRotulosPercentuais, pluginTextoCentral]
      }
    );
  },

  /**
   * 4. Pizza: % Supressão de Vegetação por tipo de limpeza.
   * Categorias = Equipe + TipodaLimpeza (MEC_DENSA, MEC_RALA,
   * MAN_RALA, MAN_DENSA). A % é calculada sobre os km de cada tipo.
   */
  graficoSupressao: function (registros, graficos) {
    this.destruirSeExistir(graficos, "supressao");

    const mapa = {};
    registros.forEach(function (r) {
      const equipe = String(r["Equipe"] || "").trim().toUpperCase().slice(0, 3); // MEC / MAN
      const limpeza = String(r["TipodaLimpeza"] || "").trim().toUpperCase();     // DENSA / RALA
      if (!equipe || !limpeza) return;
      const chave = equipe + "_" + limpeza;
      mapa[chave] = (mapa[chave] || 0) + kmDoTrecho(r);
    });

    const categorias = Object.keys(mapa);
    const valores = categorias.map(c => Number(mapa[c].toFixed(2)));

    graficos.supressao = new Chart(
      document.getElementById("grafico-supressao"),
      {
        type: "pie",
        data: {
          labels: categorias,
          datasets: [{
            data: valores,
            backgroundColor: this.cores.slice(0, categorias.length),
            borderWidth: 2,
            borderColor: "#ffffff"
          }]
        },
        options: this.opcoesPizza({
          plugins: {
            legend: {
              position: "left",
              labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 12 }
            },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = ((ctx.raw / total) * 100).toFixed(1);
                  return ctx.label + ": " + pct + "%";
                }
              }
            }
          }
        }),
        plugins: [pluginRotulosPercentuais]
      }
    );
  }
};

