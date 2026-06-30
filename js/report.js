/**
 * report.js – Reports Module
 * Beskpoke Tailor Shop
 */

const ReportView = (() => {
  let ordersList = [];
  let customersList = [];
  let expensesList = [];
  let fabricList = [];

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

  async function loadData() {
    try {
      ordersList = await DB.orders.getAll();
      customersList = await DB.customers.getAll();
      expensesList = await DB.expenses.getAll();
      fabricList = await DB.inventory.getAll().catch(() => []);

      const type = fType().value;
      let filtered = [];
      let filteredExpenses = [];

      if (type === "daily") {
        const d = valDate().value;
        filtered = ordersList.filter((o) => o.OrderDate === d);
        filteredExpenses = expensesList.filter((e) => e.ExpenseDate === d);
      } else if (type === "monthly") {
        const m = valMonth().value; // YYYY-MM
        filtered = ordersList.filter((o) => o.OrderDate.startsWith(m));
        filteredExpenses = expensesList.filter((e) =>
          String(e.ExpenseDate).startsWith(m),
        );
      } else if (type === "yearly") {
        const y = valYear().value; // YYYY
        filtered = ordersList.filter((o) => o.OrderDate.startsWith(y));
        filteredExpenses = expensesList.filter((e) =>
          String(e.ExpenseDate).startsWith(y),
        );
      }

      renderReport(filtered, filteredExpenses);
    } catch (err) {
      console.error(err);
      UI.showToast("Error loading reports", "error");
    }
  }

  function renderReport(orders, expenses = []) {
    let totalOrders = orders.length;
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalFees = 0;

    const tbody = document.getElementById("report-table-body");
    tbody.innerHTML = "";

    orders.sort((a, b) => new Date(b.OrderDate) - new Date(a.OrderDate)); // Descending

    orders.forEach((o) => {
      totalRevenue += o.TotalAmount || 0;
      totalFees += o.TransactionFee || 0;

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

    expenses.forEach((e) => {
      totalExpenses += e.Amount || 0;
    });

    document.getElementById("report-total-orders").innerText = totalOrders;
    document.getElementById("report-total-revenue").innerText =
      `${fmtCurrency(totalRevenue)}`;
    const expEl = document.getElementById("report-total-expenses");
    if (expEl) expEl.innerText = `${fmtCurrency(totalExpenses)}`;

    const feesEl = document.getElementById("report-total-fees");
    if (feesEl) feesEl.innerText = `${fmtCurrency(totalFees)}`;

    // Profit is finalized in calculateItems() once fabric cost is known
    const profitEl = document.getElementById("report-total-profit");
    if (profitEl) profitEl.innerText = fmtCurrency(0);

    calculateItems(orders, totalRevenue, totalExpenses, totalFees);
  }

  async function calculateItems(orders, totalRevenue = 0, totalExpenses = 0, totalFees = 0) {
    let totalItems = 0;
    let totalJackets = 0;
    let totalPants = 0;
    let totalShirts = 0;
    let totalFabricCost = 0;

    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.OrderID);
      const allOrderLines = await DB.orderlines.getAll();

      // Only count lines belonging to the currently filtered orders
      const relevantLines = allOrderLines.filter((line) =>
        orderIds.includes(line.OrderID),
      );

      const fabricMap = Object.fromEntries(
        fabricList.map((f) => [f.FabricID, f]),
      );

      relevantLines.forEach((line) => {
        const qty = line.Quantity || 1;
        totalItems += qty;

        // Categories: 1 = Jacket, 2 = Pant, 3 = Shirt (based on initial DB setup and data)
        if (line.CategoryID === 1) totalJackets += qty;
        else if (line.CategoryID === 2) totalPants += qty;
        else if (line.CategoryID === 3) totalShirts += qty;

        // Fabric cost: UseCount × fabric unit price
        if (line.FabricID && line.UseCount > 0) {
          const fabric = fabricMap[line.FabricID];
          if (fabric && fabric.Price > 0) {
            totalFabricCost += line.UseCount * fabric.Price;
          }
        }
      });
    }

    document.getElementById("report-total-items").innerText = totalItems;
    document.getElementById("report-total-jackets").innerText = totalJackets;
    document.getElementById("report-total-pants").innerText = totalPants;
    document.getElementById("report-total-shirts").innerText = totalShirts;

    const fabricCostEl = document.getElementById("report-total-fabric-cost");
    if (fabricCostEl) fabricCostEl.innerText = fmtCurrency(totalFabricCost);

    // Total Profit = Total Revenue - (Total Expenses + Total Fabric Cost + Total Card Fees)
    const profitEl = document.getElementById("report-total-profit");
    if (profitEl)
      profitEl.innerText = fmtCurrency(totalRevenue - totalExpenses - totalFabricCost - totalFees);
  }

  return { init, onFilterTypeChange, loadData };
})();
