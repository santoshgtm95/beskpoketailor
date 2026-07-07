/**
 * sell-fabric.js – Sell Fabric controller
 * Beskpoke Tailor Shop
 */

const SellFabricPage = (() => {
  let allSales = [];
  let allFabrics = [];
  let currentPage = 1;
  const PER_PAGE = 10;

  async function load() {
    currentPage = 1;
    document.getElementById("sell-date").value = todayStr();
    document.getElementById("sell-qty").value = "";
    document.getElementById("sell-price-input").value = "";
    document.getElementById("sell-unit-price").value = "";
    document.getElementById("sell-total").value = "";

    await Promise.all([fetchFabrics(), fetchSalesHistory()]);

    // Bind search handler
    document.getElementById("fabric-sales-search").oninput = renderHistory;
  }

  async function fetchFabrics() {
    try {
      allFabrics = await DB.inventory.getAll();
      const select = document.getElementById("sell-fabric-select");

      // Preserve choice or clear
      select.innerHTML = '<option value="">-- Choose Fabric --</option>';
      allFabrics.forEach((f) => {
        const option = document.createElement("option");
        option.value = f.FabricID;
        option.dataset.price = f.Price;
        option.dataset.count = f.Count;
        option.dataset.unit = f.Unit;
        option.textContent = `${sanitize(f.Name)} [${sanitize(f.Color)}] - ${f.Count.toFixed(2)} ${sanitize(f.Unit)} available`;
        select.appendChild(option);
      });
    } catch (err) {
      Toast.error("Failed to load inventory: " + err.message);
    }
  }

  async function fetchSalesHistory() {
    try {
      allSales = await DB.fabricSales.getAll();
      renderHistory();
    } catch (err) {
      Toast.error("Failed to load sales history: " + err.message);
    }
  }

  function onFabricChange() {
    const select = document.getElementById("sell-fabric-select");
    const option = select.options[select.selectedIndex];

    if (option && option.value) {
      const price = option.dataset.price;
      document.getElementById("sell-unit-price").value = price;
      document.getElementById("sell-price-input").value = price;
      document.getElementById("sell-qty").placeholder =
        `Available: ${Number(option.dataset.count).toFixed(2)}`;
    } else {
      document.getElementById("sell-unit-price").value = "";
      document.getElementById("sell-price-input").value = "";
      document.getElementById("sell-qty").placeholder = "e.g. 5.5";
    }
    calcTotal();
  }

  function calcTotal() {
    const qty = parseFloat(document.getElementById("sell-qty").value) || 0;
    const price =
      parseFloat(document.getElementById("sell-price-input").value) || 0;
    const total = qty * price;
    document.getElementById("sell-total").value = total ? total.toFixed(2) : "";
  }

  function renderHistory() {
    const q = (
      document.getElementById("fabric-sales-search").value || ""
    ).toLowerCase();
    const filtered = allSales.filter((s) => {
      return (
        s.FabricName.toLowerCase().includes(q) ||
        (s.FabricCode || "").toLowerCase().includes(q) ||
        s.FabricColor.toLowerCase().includes(q) ||
        String(s.Quantity).includes(q) ||
        String(s.SellingPrice).includes(q) ||
        String(s.TotalAmount).includes(q) ||
        s.SaleDate.includes(q)
      );
    });

    const total = filtered.length;
    const totalSum = filtered.reduce((acc, s) => acc + (s.TotalAmount || 0), 0);

    const paged = filtered.slice(
      (currentPage - 1) * PER_PAGE,
      currentPage * PER_PAGE,
    );

    const tbody = document.getElementById("fabric-sales-tbody");
    tbody.innerHTML =
      paged.length === 0
        ? `<tr><td colspan="8" class="table-empty">No sales history found.</td></tr>`
        : paged
            .map(
              (s) => `<tr>
          <td class="font-mono text-muted">#${s.SaleID}</td>
          <td>${fmtDate(s.SaleDate)}</td>
          <td><strong>${sanitize(s.FabricName)}</strong> ${s.FabricCode ? `<span class="text-muted">(${sanitize(s.FabricCode)})</span>` : ""}</td>
          <td>${sanitize(s.FabricColor)}</td>
          <td class="text-right">${s.Quantity.toFixed(2)} ${sanitize(s.FabricUnit)}</td>
          <td class="text-right font-mono">${fmtCurrency(s.UnitPrice)}</td>
          <td class="text-right font-mono">${fmtCurrency(s.SellingPrice)}</td>
          <td class="text-right font-bold font-mono text-gold">${fmtCurrency(s.TotalAmount)}</td>
        </tr>`,
            )
            .join("");

    renderPagination(
      document.getElementById("fabric-sales-pagination"),
      total,
      PER_PAGE,
      currentPage,
      (p) => {
        currentPage = p;
        renderHistory();
      },
    );
  }

  async function save() {
    const dateEl = document.getElementById("sell-date");
    const selectEl = document.getElementById("sell-fabric-select");
    const qtyEl = document.getElementById("sell-qty");
    const priceEl = document.getElementById("sell-price-input");

    clearValidation(document.getElementById("sell-fabric-form"));

    if (
      !validateFields([
        { el: dateEl, msg: "Date is required." },
        { el: selectEl, msg: "Select a fabric." },
        { el: qtyEl, msg: "Quantity is required." },
        { el: priceEl, msg: "Selling Price is required." },
      ])
    ) {
      return;
    }

    const fabricId = parseInt(selectEl.value, 10);
    const qty = parseFloat(qtyEl.value);
    const sellingPrice = parseFloat(priceEl.value);
    const costPrice =
      parseFloat(document.getElementById("sell-unit-price").value) || 0;

    if (qty <= 0) {
      showFieldError(qtyEl, "Quantity must be greater than zero.");
      return;
    }

    // Check available inventory quantity client-side
    const option = selectEl.options[selectEl.selectedIndex];
    const available = parseFloat(option.dataset.count) || 0;
    if (qty > available) {
      showFieldError(
        qtyEl,
        `Insufficient fabric in stock. Max available: ${available.toFixed(2)}`,
      );
      return;
    }

    const payload = {
      SaleDate: dateEl.value,
      FabricID: fabricId,
      Quantity: qty,
      UnitPrice: costPrice,
      SellingPrice: sellingPrice,
      TotalAmount: qty * sellingPrice,
    };

    try {
      await DB.fabricSales.add(payload);
      Toast.success("Fabric sale recorded successfully.");

      // Reset form and reload
      document.getElementById("sell-qty").value = "";
      document.getElementById("sell-total").value = "";
      await load();
    } catch (err) {
      Toast.error("Failed to save sale: " + err.message);
    }
  }

  return { load, onFabricChange, calcTotal, save };
})();
