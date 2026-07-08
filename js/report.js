/**
 * report.js – Reports Module
 * Beskpoke Tailor Shop
 *
 * Report is split into four sections:
 *   1. Summary            – combined totals across all sale types
 *   2. Orders             – bespoke tailoring orders
 *   3. Fabric Sales       – fabric sold directly from inventory
 *   4. Ready Made Products – ready made product sales
 */

const ReportView = (() => {
  let ordersList = [];
  let customersList = [];
  let expensesList = [];
  let fabricList = [];
  let fabricSalesList = [];
  let readyMadeSalesList = [];
  let readyMadeProductsList = [];

  // Snapshot of the last rendered report (used by PDF export)
  let lastFiltered = {
    orders: [],
    expenses: [],
    fabricSales: [],
    readyMadeSales: [],
  };
  let lastStats = null; // { summary, orderStats, fsStats, rmStats }

  const fType = () => document.getElementById("report-filter-type");
  const fDaily = () => document.getElementById("report-daily-filter");
  const fMonthly = () => document.getElementById("report-monthly-filter");
  const fYearly = () => document.getElementById("report-yearly-filter");

  const valDate = () => document.getElementById("report-date");
  const valMonth = () => document.getElementById("report-month");
  const valYear = () => document.getElementById("report-year");

  async function init() {
    // Current date setup
    const today = todayStr();

    valDate().value = today;
    valMonth().value = today.slice(0, 7); // YYYY-MM
    valYear().value = today.slice(0, 4);

    onFilterTypeChange();
    await loadData();
  }

  function onFilterTypeChange() {
    const type = fType().value;
    fDaily().style.display = type === "daily" ? "block" : "none";
    fMonthly().style.display = type === "monthly" ? "block" : "none";
    fYearly().style.display = type === "yearly" ? "block" : "none";
    loadData();
  }

  // Returns a predicate matching a YYYY-MM-DD date string against the
  // currently selected period.
  function periodMatcher() {
    const type = fType().value;
    let prefix = "";
    if (type === "daily") prefix = valDate().value;
    else if (type === "monthly") prefix = valMonth().value; // YYYY-MM
    else if (type === "yearly") prefix = valYear().value; // YYYY
    return (dateStr) => String(dateStr || "").startsWith(prefix);
  }

  async function loadData() {
    try {
      [
        ordersList,
        customersList,
        expensesList,
        fabricList,
        fabricSalesList,
        readyMadeSalesList,
        readyMadeProductsList,
      ] = await Promise.all([
        DB.orders.getAll(),
        DB.customers.getAll(),
        DB.expenses.getAll(),
        DB.inventory.getAll().catch(() => []),
        DB.fabricSales.getAll().catch(() => []),
        DB.readyMadeSales.getAll().catch(() => []),
        DB.readyMadeProducts.getAll().catch(() => []),
      ]);

      const inPeriod = periodMatcher();

      const orders = ordersList.filter((o) => inPeriod(o.OrderDate));
      const expenses = expensesList.filter((e) => inPeriod(e.ExpenseDate));
      const fabricSales = fabricSalesList.filter((s) => inPeriod(s.SaleDate));
      const readyMadeSales = readyMadeSalesList.filter((s) =>
        inPeriod(s.SaleDate),
      );

      lastFiltered = { orders, expenses, fabricSales, readyMadeSales };
      await renderReport(orders, expenses, fabricSales, readyMadeSales);
    } catch (err) {
      console.error(err);
      UI.showToast("Error loading reports", "error");
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  const fmtQty = (n) =>
    Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toFixed(2);

  async function renderReport(orders, expenses, fabricSales, readyMadeSales) {
    /* ── Section 2: Orders ─────────────────────────────────── */
    const orderStats = {
      count: orders.length,
      revenue: 0,
      cardFees: 0,
      fabricCost: 0,
      tailorFees: 0,
      items: 0,
      jackets: 0,
      pants: 0,
      shirts: 0,
    };

    orders.forEach((o) => {
      orderStats.revenue += o.TotalAmount || 0;
      orderStats.cardFees += o.TransactionFee || 0;
    });

    const fabricMap = Object.fromEntries(
      fabricList.map((f) => [f.FabricID, f]),
    );

    if (orders.length > 0) {
      const orderIds = new Set(orders.map((o) => o.OrderID));
      const allOrderLines = await DB.orderlines.getAll();

      allOrderLines
        .filter((line) => orderIds.has(line.OrderID))
        .forEach((line) => {
          const qty = line.Quantity || 1;
          orderStats.items += qty;

          // Categories: 1 = Jacket & Vest, 2 = Trousers & Skirt, 3 = Shirt & Dress
          if (line.CategoryID === 1) orderStats.jackets += qty;
          else if (line.CategoryID === 2) orderStats.pants += qty;
          else if (line.CategoryID === 3) orderStats.shirts += qty;

          // Fabric cost: UseCount × fabric unit price
          if (line.FabricID && line.UseCount > 0) {
            const fabric = fabricMap[line.FabricID];
            if (fabric && fabric.Price > 0) {
              orderStats.fabricCost += line.UseCount * fabric.Price;
            }
          }

          orderStats.tailorFees += Number(line.TailorFees) || 0;
        });
    }

    orderStats.profit =
      orderStats.revenue -
      orderStats.fabricCost -
      orderStats.tailorFees -
      orderStats.cardFees;

    /* ── Section 3: Fabric Sales ───────────────────────────── */
    const fsStats = {
      count: fabricSales.length,
      revenue: 0,
      fabricCost: 0,
      qty: 0,
    };

    fabricSales.forEach((s) => {
      const qty = s.Quantity || 0;
      fsStats.revenue += s.TotalAmount || 0;
      // UnitPrice is the fabric cost per unit recorded at sale time
      fsStats.fabricCost += qty * (s.UnitPrice || 0);
      fsStats.qty += qty;
    });

    fsStats.profit = fsStats.revenue - fsStats.fabricCost;

    /* ── Section 4: Ready Made Products ────────────────────── */
    const productMap = Object.fromEntries(
      readyMadeProductsList.map((p) => [p.ProductID, p]),
    );

    const rmStats = {
      count: readyMadeSales.length,
      revenue: 0,
      cost: 0,
      fabricCost: 0,
      tailorFees: 0,
      units: 0,
    };

    readyMadeSales.forEach((s) => {
      const qty = s.Quantity || 0;
      rmStats.revenue += s.TotalAmount || 0;
      rmStats.units += qty;

      const product = productMap[s.ProductID];
      if (product) {
        rmStats.cost += (product.Cost || 0) * qty;
        rmStats.tailorFees += (product.TailorFees || 0) * qty;

        if (product.FabricID && product.FabricQtyUsed > 0) {
          const fabric = fabricMap[product.FabricID];
          if (fabric && fabric.Price > 0) {
            rmStats.fabricCost += product.FabricQtyUsed * fabric.Price * qty;
          }
        }
      }
    });

    rmStats.profit =
      rmStats.revenue - rmStats.cost - rmStats.fabricCost - rmStats.tailorFees;

    /* ── Section 1: Summary ────────────────────────────────── */
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.Amount || 0), 0);

    const summary = {
      revenue: orderStats.revenue + fsStats.revenue + rmStats.revenue,
      expenses: totalExpenses,
      fabricCost:
        orderStats.fabricCost + fsStats.fabricCost + rmStats.fabricCost,
      tailorFees: orderStats.tailorFees + rmStats.tailorFees,
      cardFees: orderStats.cardFees,
      profit:
        orderStats.profit + fsStats.profit + rmStats.profit - totalExpenses,
      transactions: orderStats.count + fsStats.count + rmStats.count,
      items: orderStats.items + rmStats.units,
    };

    /* ── Render ────────────────────────────────────────────── */
    // Summary section
    setText("report-sum-revenue", fmtCurrency(summary.revenue));
    setText("report-sum-expenses", fmtCurrency(summary.expenses));
    setText("report-sum-fabric-cost", fmtCurrency(summary.fabricCost));
    setText("report-sum-tailor-fees", fmtCurrency(summary.tailorFees));
    setText("report-sum-card-fees", fmtCurrency(summary.cardFees));
    setText("report-sum-profit", fmtCurrency(summary.profit));
    setText("report-sum-transactions", summary.transactions);
    setText("report-sum-items", summary.items);
    setText("report-sum-fabric-qty", fmtQty(fsStats.qty));
    setText("report-sum-rm-units", rmStats.units);

    // Orders section
    setText("report-order-revenue", fmtCurrency(orderStats.revenue));
    setText("report-order-fabric-cost", fmtCurrency(orderStats.fabricCost));
    setText("report-order-tailor-fees", fmtCurrency(orderStats.tailorFees));
    setText("report-order-card-fees", fmtCurrency(orderStats.cardFees));
    setText("report-order-profit", fmtCurrency(orderStats.profit));
    setText("report-order-count", orderStats.count);
    setText("report-order-items", orderStats.items);
    setText("report-order-jackets", orderStats.jackets);
    setText("report-order-pants", orderStats.pants);
    setText("report-order-shirts", orderStats.shirts);

    // Fabric Sales section
    setText("report-fs-revenue", fmtCurrency(fsStats.revenue));
    setText("report-fs-fabric-cost", fmtCurrency(fsStats.fabricCost));
    setText("report-fs-profit", fmtCurrency(fsStats.profit));
    setText("report-fs-count", fsStats.count);
    setText("report-fs-qty", fmtQty(fsStats.qty));

    // Ready Made Products section
    setText("report-rm-revenue", fmtCurrency(rmStats.revenue));
    setText("report-rm-cost", fmtCurrency(rmStats.cost));
    setText("report-rm-fabric-cost", fmtCurrency(rmStats.fabricCost));
    setText("report-rm-tailor-fees", fmtCurrency(rmStats.tailorFees));
    setText("report-rm-profit", fmtCurrency(rmStats.profit));
    setText("report-rm-count", rmStats.count);
    setText("report-rm-units", rmStats.units);

    lastStats = { summary, orderStats, fsStats, rmStats };

    renderOrderTable(orders);
  }

  function periodLabel() {
    const type = fType().value;
    if (type === "daily") return `Daily Report — ${fmtDate(valDate().value)}`;
    if (type === "monthly") {
      const [y, m] = valMonth().value.split("-");
      const monthName = new Date(+y, +m - 1).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
      return `Monthly Report — ${monthName}`;
    }
    return `Yearly Report — ${valYear().value}`;
  }

  async function printPdf() {
    const { orders, fabricSales, readyMadeSales } = lastFiltered;
    const stats = lastStats;
    if (!stats) {
      Toast.warning("Report not loaded yet.");
      return;
    }

    const fabricMap = Object.fromEntries(
      fabricList.map((f) => [f.FabricID, f]),
    );
    const productMap = Object.fromEntries(
      readyMadeProductsList.map((p) => [p.ProductID, p]),
    );

    // Per-order tailor fees & fabric cost
    const allOrderLines = await DB.orderlines.getAll().catch(() => []);
    const perOrder = {};
    allOrderLines.forEach((line) => {
      if (!perOrder[line.OrderID]) {
        perOrder[line.OrderID] = { tailorFees: 0, fabricCost: 0 };
      }
      perOrder[line.OrderID].tailorFees += Number(line.TailorFees) || 0;
      if (line.FabricID && line.UseCount > 0) {
        const fabric = fabricMap[line.FabricID];
        if (fabric && fabric.Price > 0) {
          perOrder[line.OrderID].fabricCost += line.UseCount * fabric.Price;
        }
      }
    });

    /* ── Summary section ── */
    const s = stats.summary;
    const summaryRows = [
      ["Total Revenue", fmtCurrency(s.revenue)],
      ["Total Expenses", fmtCurrency(s.expenses)],
      ["Total Fabric Cost", fmtCurrency(s.fabricCost)],
      ["Total Tailor Fees", fmtCurrency(s.tailorFees)],
      ["Card Fees", fmtCurrency(s.cardFees)],
      ["Total Profit", fmtCurrency(s.profit)],
      ["Transactions", String(s.transactions)],
      ["Items Sold", String(s.items)],
    ]
      .map(
        ([k, v]) =>
          `<tr><td>${k}</td><td class="num">${v}</td></tr>`,
      )
      .join("");

    /* ── Orders section ── */
    const sortedOrders = [...orders].sort(
      (a, b) => new Date(a.OrderDate) - new Date(b.OrderDate),
    );
    let oTotals = { total: 0, fees: 0, tailor: 0, fabric: 0 };
    const orderRows = sortedOrders
      .map((o) => {
        const pm =
          o.PaymentMethod === "Credit" ? "Card" : o.PaymentMethod || "Cash";
        const fee = o.TransactionFee || 0;
        const po = perOrder[o.OrderID] || { tailorFees: 0, fabricCost: 0 };
        oTotals.total += o.TotalAmount || 0;
        oTotals.fees += fee;
        oTotals.tailor += po.tailorFees;
        oTotals.fabric += po.fabricCost;
        return `<tr>
          <td>${fmtOrderId(o.OrderID)}</td>
          <td>${fmtDate(o.OrderDate)}</td>
          <td class="num">${fmtCurrency(o.TotalAmount)}</td>
          <td>${pm}</td>
          <td class="num">${fmtCurrency(fee)}</td>
          <td class="num">${fmtCurrency(po.tailorFees)}</td>
          <td class="num">${fmtCurrency(po.fabricCost)}</td>
        </tr>`;
      })
      .join("");
    const ordersTable = sortedOrders.length
      ? `<table>
          <thead><tr><th>Order ID</th><th>Date</th><th class="num">Order Total</th><th>Payment Method</th><th class="num">Card Fees</th><th class="num">Tailor Fees</th><th class="num">Fabric Cost</th></tr></thead>
          <tbody>${orderRows}</tbody>
          <tfoot><tr><td colspan="2">Total (${sortedOrders.length} orders)</td><td class="num">${fmtCurrency(oTotals.total)}</td><td></td><td class="num">${fmtCurrency(oTotals.fees)}</td><td class="num">${fmtCurrency(oTotals.tailor)}</td><td class="num">${fmtCurrency(oTotals.fabric)}</td></tr></tfoot>
        </table>`
      : `<p class="empty">No orders in this period.</p>`;

    /* ── Fabric Sales section ── */
    const sortedFs = [...fabricSales].sort(
      (a, b) => new Date(a.SaleDate) - new Date(b.SaleDate),
    );
    let fsTotals = { qty: 0, total: 0 };
    const fsRows = sortedFs
      .map((x) => {
        fsTotals.qty += x.Quantity || 0;
        fsTotals.total += x.TotalAmount || 0;
        return `<tr>
          <td>${fmtDate(x.SaleDate)}</td>
          <td>${sanitize(x.FabricName)}${x.FabricCode ? ` (${sanitize(x.FabricCode)})` : ""}</td>
          <td>${sanitize(x.FabricColor || "—")}</td>
          <td class="num">${fmtQty(x.Quantity || 0)} ${sanitize(x.FabricUnit || "")}</td>
          <td class="num">${fmtCurrency(x.UnitPrice)}</td>
          <td class="num">${fmtCurrency(x.SellingPrice)}</td>
          <td class="num">${fmtCurrency(x.TotalAmount)}</td>
        </tr>`;
      })
      .join("");
    const fsTable = sortedFs.length
      ? `<table>
          <thead><tr><th>Date</th><th>Fabric</th><th>Color</th><th class="num">Qty Sold</th><th class="num">Cost Price</th><th class="num">Sell Price</th><th class="num">Total Amount</th></tr></thead>
          <tbody>${fsRows}</tbody>
          <tfoot><tr><td colspan="3">Total (${sortedFs.length} sales)</td><td class="num">${fmtQty(fsTotals.qty)}</td><td></td><td></td><td class="num">${fmtCurrency(fsTotals.total)}</td></tr></tfoot>
        </table>`
      : `<p class="empty">No fabric sales in this period.</p>`;

    /* ── Ready Made Sales section ── */
    const sortedRm = [...readyMadeSales].sort(
      (a, b) => new Date(a.SaleDate) - new Date(b.SaleDate),
    );
    let rmTotals = { qty: 0, fabric: 0, tailor: 0, total: 0 };
    const rmRows = sortedRm
      .map((x) => {
        const qty = x.Quantity || 0;
        const product = productMap[x.ProductID];
        let fabricCost = 0;
        let tailorFees = 0;
        if (product) {
          tailorFees = (product.TailorFees || 0) * qty;
          if (product.FabricID && product.FabricQtyUsed > 0) {
            const fabric = fabricMap[product.FabricID];
            if (fabric && fabric.Price > 0) {
              fabricCost = product.FabricQtyUsed * fabric.Price * qty;
            }
          }
        }
        rmTotals.qty += qty;
        rmTotals.fabric += fabricCost;
        rmTotals.tailor += tailorFees;
        rmTotals.total += x.TotalAmount || 0;
        return `<tr>
          <td>${fmtDate(x.SaleDate)}</td>
          <td>${sanitize(x.ProductName)}</td>
          <td class="num">${qty} pcs</td>
          <td class="num">${fmtCurrency(fabricCost)}</td>
          <td class="num">${fmtCurrency(tailorFees)}</td>
          <td class="num">${fmtCurrency(x.SellingPrice)}</td>
          <td class="num">${fmtCurrency(x.TotalAmount)}</td>
        </tr>`;
      })
      .join("");
    const rmTable = sortedRm.length
      ? `<table>
          <thead><tr><th>Date</th><th>Product Name</th><th class="num">Qty Sold</th><th class="num">Fabric Cost</th><th class="num">Tailor Fees</th><th class="num">Selling Price</th><th class="num">Total Amount</th></tr></thead>
          <tbody>${rmRows}</tbody>
          <tfoot><tr><td colspan="2">Total (${sortedRm.length} sales)</td><td class="num">${rmTotals.qty} pcs</td><td class="num">${fmtCurrency(rmTotals.fabric)}</td><td class="num">${fmtCurrency(rmTotals.tailor)}</td><td></td><td class="num">${fmtCurrency(rmTotals.total)}</td></tr></tfoot>
        </table>`
      : `<p class="empty">No ready made sales in this period.</p>`;

    const html = `<!DOCTYPE html><html><head>
    <title>${periodLabel()}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      @page { size: A4; margin: 15mm 12mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Noto Sans Thai', sans-serif; color: #111; margin: 0; font-size: 12px; -webkit-print-color-adjust: exact; }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
      .brand { font-size: 18px; font-weight: 800; letter-spacing: 2px; }
      .report-title { font-size: 13px; color: #444; font-weight: 600; text-align: right; }
      h2 { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; margin: 26px 0 10px 0; padding-bottom: 6px; border-bottom: 1px solid #111; page-break-after: avoid; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th, td { padding: 7px 8px; border-bottom: 1px solid #eee; text-align: left; }
      th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #666; font-weight: 700; border-bottom: 2px solid #111; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      tfoot td { font-weight: 700; border-top: 2px solid #111; border-bottom: none; padding-top: 9px; }
      .summary-table { max-width: 380px; }
      .summary-table td { font-size: 13px; padding: 8px; }
      .summary-table tr:last-of-type td { border-bottom: none; }
      .empty { color: #888; font-style: italic; font-size: 12px; }
      tr { page-break-inside: avoid; }
    </style>
    </head><body>
      <div class="header">
        <div class="brand">SIAM BESPOKE</div>
        <div class="report-title">${periodLabel()}<br><span style="font-weight:400;color:#888;">Generated: ${fmtDate(todayStr())}</span></div>
      </div>
      <h2>Summary</h2>
      <table class="summary-table"><tbody>${summaryRows}</tbody></table>
      <h2>Orders</h2>
      ${ordersTable}
      <h2>Fabric Sales</h2>
      ${fsTable}
      <h2>Ready Made Sales</h2>
      ${rmTable}
    </body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 300);
  }

  function renderOrderTable(orders) {
    const tbody = document.getElementById("report-table-body");
    tbody.innerHTML = "";

    orders.sort((a, b) => new Date(b.OrderDate) - new Date(a.OrderDate)); // Descending

    orders.forEach((o) => {
      const cust = customersList.find((c) => c.CustomerID === o.CustomerID);
      const custName = cust ? cust.Name : "Unknown";

      const paymentMethod =
        o.PaymentMethod === "Credit" ? "Card" : o.PaymentMethod || "Cash";
      const netAmount = (o.TotalAmount || 0) - (o.TransactionFee || 0);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtOrderId(o.OrderID)}</td>
        <td>${fmtDate(o.OrderDate)}</td>
        <td>${custName}</td>
        <td><span class="badge ${paymentMethod === "Card" ? "badge-blue" : "badge-green"}">${paymentMethod}</span></td>
        <td class="text-right">${fmtCurrency(o.TotalAmount)}</td>
        <td class="text-right" style="color: var(--accent-red);">${o.TransactionFee > 0 ? fmtCurrency(o.TransactionFee) : "—"}</td>
        <td class="text-right text-gold font-bold">${fmtCurrency(netAmount)}</td>
      `;
      tbody.appendChild(tr);
    });

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">No orders found for this period.</td></tr>`;
    }
  }

  return { init, onFilterTypeChange, loadData, printPdf };
})();
