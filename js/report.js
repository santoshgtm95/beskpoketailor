/**
 * report.js – Reports Module
 * Beskpoke Tailor Shop
 */

const ReportView = (() => {
  let ordersList = [];
  let customersList = [];

  const fType = () => document.getElementById("report-filter-type");
  const fDaily = () => document.getElementById("report-daily-filter");
  const fMonthly = () => document.getElementById("report-monthly-filter");
  const fYearly = () => document.getElementById("report-yearly-filter");

  const valDate = () => document.getElementById("report-date");
  const valMonth = () => document.getElementById("report-month");
  const valYear = () => document.getElementById("report-year");

  async function init() {
    // Current date setup
    const now = new Date();

    valDate().value = now.toISOString().split("T")[0];
    valMonth().value = now.toISOString().slice(0, 7); // YYYY-MM
    valYear().value = now.getFullYear();

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

      const type = fType().value;
      let filtered = [];

      if (type === "daily") {
        const d = valDate().value;
        filtered = ordersList.filter((o) => o.OrderDate === d);
      } else if (type === "monthly") {
        const m = valMonth().value; // YYYY-MM
        filtered = ordersList.filter((o) => o.OrderDate.startsWith(m));
      } else if (type === "yearly") {
        const y = valYear().value; // YYYY
        filtered = ordersList.filter((o) => o.OrderDate.startsWith(y));
      }

      renderReport(filtered);
    } catch (err) {
      console.error(err);
      UI.showToast("Error loading reports", "error");
    }
  }

  function renderReport(orders) {
    let totalOrders = orders.length;
    let totalRevenue = 0;

    const tbody = document.getElementById("report-table-body");
    tbody.innerHTML = "";

    orders.sort((a, b) => new Date(b.OrderDate) - new Date(a.OrderDate)); // Descending

    orders.forEach((o) => {
      totalRevenue += o.TotalAmount || 0;

      const cust = customersList.find((c) => c.CustomerID === o.CustomerID);
      const custName = cust ? cust.Name : "Unknown";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>#${o.OrderID}</td>
        <td>${fmtDate(o.OrderDate)}</td>
        <td>${custName}</td>
        <td class="text-right">$${parseFloat(o.TotalAmount).toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center">No orders found for this period.</td></tr>`;
    }

    document.getElementById("report-total-orders").innerText = totalOrders;
    document.getElementById("report-total-revenue").innerText =
      `$${totalRevenue.toFixed(2)}`;

    calculateItems(orders);
  }

  async function calculateItems(orders) {
    let totalItems = 0;
    let totalJackets = 0;
    let totalPants = 0;
    let totalShirts = 0;

    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.OrderID);
      const allOrderLines = await DB.orderlines.getAll();

      // Only count lines belonging to the currently filtered orders
      const relevantLines = allOrderLines.filter((line) =>
        orderIds.includes(line.OrderID),
      );

      relevantLines.forEach((line) => {
        const qty = line.Quantity || 1;
        totalItems += qty;

        // Categories: 1 = Jacket, 2 = Pant, 3 = Shirt (based on initial DB setup and data)
        if (line.CategoryID === 1) totalJackets += qty;
        else if (line.CategoryID === 2) totalPants += qty;
        else if (line.CategoryID === 3) totalShirts += qty;
      });
    }

    document.getElementById("report-total-items").innerText = totalItems;
    document.getElementById("report-total-jackets").innerText = totalJackets;
    document.getElementById("report-total-pants").innerText = totalPants;
    document.getElementById("report-total-shirts").innerText = totalShirts;
  }

  return { init, onFilterTypeChange, loadData };
})();
