/**
 * dashboard.js – Dashboard / Home page with live stats
 * Beskpoke Tailor Shop
 */

const DashboardPage = (() => {
  async function load() {
    await refresh();
  }

  async function refresh() {
    const [orders, customers, items, lines] = await Promise.all([
      DB.orders.getAll(),
      DB.customers.getAll(),
      DB.items.getAll(),
      DB.orderlines.getAll(),
    ]);

    const totalRevenue = orders.reduce((s, o) => s + (o.TotalAmount || 0), 0);
    const todayOrders = orders.filter((o) => o.OrderDate === todayStr()).length;
    const avgOrderVal = orders.length ? totalRevenue / orders.length : 0;

    document.getElementById("stat-total-revenue").textContent =
      fmtCurrency(totalRevenue);
    document.getElementById("stat-total-orders").textContent = orders.length;
    document.getElementById("stat-total-customers").textContent =
      customers.length;
    document.getElementById("stat-today-orders").textContent = todayOrders;

    // Recent orders
    const recent = [...orders]
      .sort((a, b) => new Date(b.OrderDate) - new Date(a.OrderDate))
      .slice(0, 6);
    const custMap = Object.fromEntries(customers.map((c) => [c.CustomerID, c]));

    const tbody = document.getElementById("recent-orders-tbody");
    tbody.innerHTML =
      recent.length === 0
        ? `<tr><td colspan="4" class="table-empty">No orders yet.</td></tr>`
        : recent
            .map(
              (o) => `<tr>
          <td class="font-mono text-gold">#${o.OrderID}</td>
          <td>${sanitize(custMap[o.CustomerID]?.Name || "Unknown")}</td>
          <td>${fmtDate(o.OrderDate)}</td>
          <td class="text-right font-bold">${fmtCurrency(o.TotalAmount)}</td>
        </tr>`,
            )
            .join("");

    // Top items
    const itemCount = {};
    lines.forEach((l) => {
      itemCount[l.ItemID] = (itemCount[l.ItemID] || 0) + l.Quantity;
    });
    const topItems = Object.entries(itemCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const itemMap = Object.fromEntries(items.map((i) => [i.ItemID, i]));
    const maxQty = topItems[0]?.[1] || 1;

    // Top items logic removed

    // avg order value
    document.getElementById("stat-avg-order").textContent =
      fmtCurrency(avgOrderVal);

    // Greeting
    const user = Auth.currentUser();
    const hr = new Date().getHours();
    const greet =
      hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    document.getElementById("dashboard-greeting").textContent =
      `${greet}, ${user?.Name || user?.Username}!`;
  }

  return { load, refresh };
})();
