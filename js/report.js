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

    renderOrderTable(orders);
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

  return { init, onFilterTypeChange, loadData };
})();
