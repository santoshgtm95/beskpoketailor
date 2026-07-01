/**
 * dashboard.js – Professional Dashboard with Charts
 * Beskpoke Tailor Shop
 */

const DashboardPage = (() => {
  // Chart instances – destroyed & re-created on each refresh
  let _charts = {};

  // Chart.js global defaults (dark theme)
  function applyChartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.color = '#aeb6c4';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
  }

  function destroyChart(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function getPeriodDays() {
    const el = document.getElementById('dash-period');
    return el ? parseInt(el.value, 10) : 30;
  }

  function filterByPeriod(rows, dateField) {
    const days = getPeriodDays();
    if (days === 0) return rows;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return rows.filter(r => (r[dateField] || '') >= cutoffStr);
  }

  // Group rows by date → sum a numeric field
  function groupByDate(rows, dateField, valueField) {
    const map = {};
    rows.forEach(r => {
      const d = (r[dateField] || '').slice(0, 10);
      if (!d) return;
      map[d] = (map[d] || 0) + (r[valueField] || 0);
    });
    return map;
  }

  // Return an array of YYYY-MM-DD strings for the past N days
  function lastNDays(n) {
    const dates = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  // Smart x-axis labels: for ≤30 days show day/month, else show month
  function smartLabels(dateStrs) {
    return dateStrs.map(d => {
      const dt = new Date(d + 'T00:00:00');
      return dateStrs.length <= 31
        ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        : dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    });
  }

  // Group by month key YYYY-MM → sum
  function groupByMonth(rows, dateField, valueField) {
    const map = {};
    rows.forEach(r => {
      const m = (r[dateField] || '').slice(0, 7);
      if (!m) return;
      map[m] = (map[m] || 0) + (r[valueField] || 0);
    });
    return map;
  }

  // ── Status helpers ───────────────────────────────────────────────
  const STATUS_COLORS = {
    'Pending':    '#fca83e',
    'In Progress':'#5baaff',
    'Ready':      '#a78bfa',
    'Delivered':  '#41d188',
    'Cancelled':  '#ff6b6b',
  };

  function statusBadge(status) {
    const colors = {
      'Pending':    '#fca83e',
      'In Progress':'#5baaff',
      'Ready':      '#a78bfa',
      'Delivered':  '#41d188',
      'Cancelled':  '#ff6b6b',
    };
    const c = colors[status] || '#aeb6c4';
    return `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${c}22;color:${c};font-size:11px;font-weight:600;">${status || '—'}</span>`;
  }

  // ── Chart builders ───────────────────────────────────────────────

  function buildRevenueOrdersChart(filteredOrders) {
    destroyChart('revenue-orders');
    const ctx = document.getElementById('chart-revenue-orders');
    if (!ctx || !window.Chart) return;

    const days = getPeriodDays();
    let labels, revenueData, ordersData;

    if (days > 0 && days <= 90) {
      const dateList = lastNDays(days);
      const revMap = groupByDate(filteredOrders, 'OrderDate', 'TotalAmount');
      const cntMap = {};
      filteredOrders.forEach(o => {
        const d = (o.OrderDate || '').slice(0, 10);
        cntMap[d] = (cntMap[d] || 0) + 1;
      });
      labels = smartLabels(dateList);
      revenueData = dateList.map(d => revMap[d] || 0);
      ordersData  = dateList.map(d => cntMap[d] || 0);
    } else {
      // Group by month
      const revMap = groupByMonth(filteredOrders, 'OrderDate', 'TotalAmount');
      const cntMap = {};
      filteredOrders.forEach(o => {
        const m = (o.OrderDate || '').slice(0, 7);
        if (m) cntMap[m] = (cntMap[m] || 0) + 1;
      });
      const months = [...new Set([...Object.keys(revMap), ...Object.keys(cntMap)])].sort();
      labels = months.map(m => {
        const [y, mo] = m.split('-');
        return new Date(+y, +mo - 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      });
      revenueData = months.map(m => revMap[m] || 0);
      ordersData  = months.map(m => cntMap[m] || 0);
    }

    _charts['revenue-orders'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Revenue (THB)',
            data: revenueData,
            backgroundColor: 'rgba(220,179,96,0.7)',
            borderColor: '#dcb360',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'yRev',
          },
          {
            label: 'Orders',
            data: ordersData,
            type: 'line',
            borderColor: '#5baaff',
            backgroundColor: 'rgba(91,170,255,0.12)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.4,
            fill: true,
            yAxisID: 'yOrd',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10, padding: 14 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                if (ctx.datasetIndex === 0) return ` Revenue: THB ${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                return ` Orders: ${ctx.parsed.y}`;
              }
            }
          }
        },
        scales: {
          yRev: { position: 'left',  grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => 'THB ' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } },
          yOrd: { position: 'right', grid: { drawOnChartArea: false }, ticks: { stepSize: 1 } },
          x:    { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 12, maxRotation: 45 } },
        },
      },
    });
  }

  function buildProfitDonut(totalRevenue, totalExpenses) {
    destroyChart('profit-donut');
    const ctx = document.getElementById('chart-profit-donut');
    if (!ctx || !window.Chart) return;

    const netProfit = totalRevenue - totalExpenses;
    const profitColor = netProfit >= 0 ? '#41d188' : '#ff6b6b';

    // Summary text
    const summary = document.getElementById('profit-summary');
    if (summary) {
      summary.innerHTML = `
        <div class="profit-row"><span>Revenue</span><span style="color:var(--gold)">${fmtCurrency(totalRevenue)}</span></div>
        <div class="profit-row"><span>Expenses</span><span style="color:var(--accent-red)">${fmtCurrency(totalExpenses)}</span></div>
        <div class="profit-row profit-net"><span>Net Profit</span><span style="color:${profitColor}">${fmtCurrency(netProfit)}</span></div>
      `;
    }

    _charts['profit-donut'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Revenue', 'Expenses'],
        datasets: [{
          data: [Math.max(totalRevenue, 0), Math.max(totalExpenses, 0)],
          backgroundColor: ['rgba(220,179,96,0.8)', 'rgba(255,107,107,0.75)'],
          borderColor: ['#dcb360', '#ff6b6b'],
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12 } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${fmtCurrency(ctx.parsed)}`
            }
          }
        },
      },
    });
  }

  function buildExpensesBar(filteredExpenses) {
    destroyChart('expenses-bar');
    const ctx = document.getElementById('chart-expenses-bar');
    if (!ctx || !window.Chart) return;

    // Group by name (category proxy)
    const map = {};
    filteredExpenses.forEach(e => {
      const name = e.Name || 'Other';
      map[name] = (map[name] || 0) + (e.Amount || 0);
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sorted.map(([k]) => k);
    const data   = sorted.map(([, v]) => v);

    const palette = ['#dcb360','#5baaff','#41d188','#fca83e','#a78bfa','#ff6b6b','#f2ce8a','#64c8ff','#6ee7b7','#fbbf24'];

    _charts['expenses-bar'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Amount (THB)',
          data,
          backgroundColor: labels.map((_, i) => palette[i % palette.length] + 'cc'),
          borderColor:      labels.map((_, i) => palette[i % palette.length]),
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${fmtCurrency(ctx.parsed.x)}` } }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => 'THB ' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  }

  function buildTopItemsChart(lines, items) {
    destroyChart('top-items');
    const ctx = document.getElementById('chart-top-items');
    if (!ctx || !window.Chart) return;

    const itemMap = Object.fromEntries(items.map(i => [i.ItemID, i.Name || `Item #${i.ItemID}`]));
    const counts = {};
    lines.forEach(l => {
      const name = itemMap[l.ItemID] || `Item #${l.ItemID}`;
      counts[name] = (counts[name] || 0) + (l.Quantity || 1);
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const labels = sorted.map(([k]) => k);
    const data   = sorted.map(([, v]) => v);

    _charts['top-items'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Qty Ordered',
          data,
          backgroundColor: 'rgba(91,170,255,0.75)',
          borderColor: '#5baaff',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` Qty: ${ctx.parsed.y}` } }
        },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { stepSize: 1 } },
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxRotation: 35 } },
        },
      },
    });
  }

  function buildInventoryChart(fabrics, usedMap) {
    destroyChart('inventory');
    const ctx = document.getElementById('chart-inventory');
    if (!ctx || !window.Chart) return;

    const top = [...fabrics].sort((a, b) => b.Count - a.Count).slice(0, 8);
    const labels   = top.map(f => f.Name);
    const available = top.map(f => Number(f.Count || 0));
    const used     = top.map(f => Number(usedMap.get(f.FabricID) || 0));

    _charts['inventory'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Available',
            data: available,
            backgroundColor: 'rgba(65,209,136,0.75)',
            borderColor: '#41d188',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Used',
            data: used,
            backgroundColor: 'rgba(252,168,62,0.75)',
            borderColor: '#fca83e',
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index' }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxRotation: 35 } },
          y: { stacked: false, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    });
  }

  function buildOrderStatusChart(allOrders) {
    destroyChart('order-status');
    const ctx = document.getElementById('chart-order-status');
    if (!ctx || !window.Chart) return;

    const counts = {};
    allOrders.forEach(o => {
      const s = o.Status || 'Pending';
      counts[s] = (counts[s] || 0) + 1;
    });
    const statusOrder = ['Pending', 'In Progress', 'Ready', 'Delivered', 'Cancelled'];
    const labels = statusOrder.filter(s => counts[s]);
    const data   = labels.map(s => counts[s]);
    const colors = labels.map(s => STATUS_COLORS[s] || '#aeb6c4');

    // Legend
    const legendEl = document.getElementById('order-status-legend');
    if (legendEl) {
      legendEl.innerHTML = labels.map((s, i) =>
        `<span class="status-legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${s}: <strong>${data[i]}</strong></span>`
      ).join('');
    }

    _charts['order-status'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} orders` } }
        },
      },
    });
  }

  // ── Main Refresh ─────────────────────────────────────────────────
  async function load() {
    await refresh();
  }

  async function refresh() {
    applyChartDefaults();

    // Set date display
    const dateEl = document.getElementById('dashboard-date');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
    }

    // Greeting
    const user = Auth.currentUser();
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const greetEl = document.getElementById('dashboard-greeting');
    if (greetEl) greetEl.textContent = `${greet}, ${user?.Name || user?.Username}!`;

    // Fetch all data in parallel
    const [allOrders, allCustomers, allItems, allLines, allExpenses, allFabrics, allOrderLines] = await Promise.all([
      DB.orders.getAll(),
      DB.customers.getAll(),
      DB.items.getAll(),
      DB.orderlines.getAll(),
      DB.expenses.getAll(),
      DB.inventory.getAll(),
      DB.orderlines.getAll(),
    ]);

    // Build used-fabric map
    const usedMap = new Map();
    allOrderLines.forEach(l => {
      if (l.FabricID && l.UseCount > 0) {
        usedMap.set(l.FabricID, (usedMap.get(l.FabricID) || 0) + Number(l.UseCount));
      }
    });

    // Period filter
    const filteredOrders   = filterByPeriod(allOrders,   'OrderDate');
    const filteredExpenses = filterByPeriod(allExpenses,  'ExpenseDate');
    const filteredLines    = allLines.filter(l => {
      const order = allOrders.find(o => o.OrderID === l.OrderID);
      if (!order) return false;
      const days = getPeriodDays();
      if (days === 0) return true;
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
      return new Date(order.OrderDate + 'T00:00:00') >= cutoff;
    });

    // KPI calculations
    const totalRevenue   = filteredOrders.reduce((s, o) => s + (o.TotalAmount || 0), 0);
    const totalExpenses  = filteredExpenses.reduce((s, e) => s + (e.Amount || 0), 0);
    const avgOrderVal    = filteredOrders.length ? totalRevenue / filteredOrders.length : 0;

    // Update KPI cards
    setText('stat-total-revenue',   fmtCurrency(totalRevenue));
    setText('stat-total-orders',    filteredOrders.length);
    setText('stat-total-customers', allCustomers.length);
    setText('stat-total-expenses',  fmtCurrency(totalExpenses));
    setText('stat-avg-order',       fmtCurrency(avgOrderVal));
    setText('stat-inventory-count', allFabrics.length);

    // ── Render Charts ──
    buildRevenueOrdersChart(filteredOrders);
    buildProfitDonut(totalRevenue, totalExpenses);
    buildExpensesBar(filteredExpenses);
    buildTopItemsChart(filteredLines, allItems);
    buildInventoryChart(allFabrics, usedMap);
    buildOrderStatusChart(allOrders);

    // ── Recent Orders table ──
    const custMap = Object.fromEntries(allCustomers.map(c => [c.CustomerID, c]));
    const recent = [...allOrders]
      .sort((a, b) => new Date(b.OrderDate) - new Date(a.OrderDate))
      .slice(0, 8);
    const tbody = document.getElementById('recent-orders-tbody');
    if (tbody) {
      tbody.innerHTML = recent.length === 0
        ? `<tr><td colspan="5" class="table-empty">No orders yet.</td></tr>`
        : recent.map(o => `<tr>
            <td class="font-mono text-gold">${fmtOrderId(o.OrderID)}</td>
            <td>${sanitize(custMap[o.CustomerID]?.Name || 'Unknown')}</td>
            <td>${fmtDate(o.OrderDate)}</td>
            <td>${statusBadge(o.Status)}</td>
            <td class="text-right font-bold">${fmtCurrency(o.TotalAmount)}</td>
          </tr>`).join('');
    }

    // ── Recent Expenses table ──
    const recentExp = [...allExpenses]
      .sort((a, b) => new Date(b.ExpenseDate) - new Date(a.ExpenseDate))
      .slice(0, 6);
    const expTbody = document.getElementById('recent-expenses-tbody');
    if (expTbody) {
      expTbody.innerHTML = recentExp.length === 0
        ? `<tr><td colspan="3" class="table-empty">No expenses yet.</td></tr>`
        : recentExp.map(e => `<tr>
            <td>${fmtDate(e.ExpenseDate)}</td>
            <td>${sanitize(e.Name)}</td>
            <td class="text-right font-mono" style="color:var(--accent-red)">${fmtCurrency(e.Amount)}</td>
          </tr>`).join('');
    }

    // Wire quick actions
    const qno = document.getElementById('quick-new-order');
    if (qno) qno.onclick = () => AppShell.navigate('order-entry');
    const qnc = document.getElementById('quick-new-customer');
    if (qnc) qnc.onclick = () => {
      AppShell.navigate('customers');
      setTimeout(() => {
        const btn = document.getElementById('btn-add-customer');
        if (btn) btn.click();
      }, 400);
    };
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function statusBadge(status) {
    const colors = {
      'Pending':    '#fca83e',
      'In Progress':'#5baaff',
      'Ready':      '#a78bfa',
      'Delivered':  '#41d188',
      'Cancelled':  '#ff6b6b',
    };
    const c = colors[status] || '#aeb6c4';
    return `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${c}22;color:${c};font-size:11px;font-weight:600;">${status || '—'}</span>`;
  }

  return { load, refresh };
})();
