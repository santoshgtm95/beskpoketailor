/**
 * ready-made.js – Ready Made Products controller
 * Beskpoke Tailor Shop
 */

const ReadyMadePage = (() => {
  let allProducts = [];
  let allSales = [];
  let allFabrics = [];
  let editId = null;
  let currentPageProducts = 1;
  let currentPageSales = 1;
  const PER_PAGE = 10;

  async function load() {
    currentPageProducts = 1;
    currentPageSales = 1;
    editId = null;

    await Promise.all([fetchProducts(), fetchFabrics()]);

    document.getElementById("ready-products-search").oninput = renderProducts;
    document.getElementById("ready-sales-search").oninput = renderSales;
  }

  async function fetchProducts() {
    try {
      allProducts = await DB.readyMadeProducts.getAll();
      renderProducts();
    } catch (err) {
      Toast.error("Failed to load products: " + err.message);
    }
  }

  async function fetchFabrics() {
    try {
      allFabrics = await DB.inventory.getAll();
      const select = document.getElementById("rm-fabric-id");
      
      // Preserve selection or set default
      select.innerHTML = '<option value="">-- No Fabric (No Deduction) --</option>';
      allFabrics.forEach((f) => {
        const option = document.createElement("option");
        option.value = f.FabricID;
        option.dataset.count = f.Count;
        option.dataset.unit = f.Unit;
        option.textContent = `${sanitize(f.Name)} [${sanitize(f.Color)}] - ${f.Count.toFixed(2)} ${sanitize(f.Unit)} available`;
        select.appendChild(option);
      });
    } catch (err) {
      Toast.error("Failed to load fabrics: " + err.message);
    }
  }

  async function loadSalesHistory() {
    try {
      allSales = await DB.readyMadeSales.getAll();
      renderSales();
    } catch (err) {
      Toast.error("Failed to load sales history: " + err.message);
    }
  }

  function onFabricSelectChange() {
    const select = document.getElementById("rm-fabric-id");
    const option = select.options[select.selectedIndex];
    const qtyInput = document.getElementById("rm-fabric-qty");
    
    if (option && option.value) {
      qtyInput.placeholder = `e.g. 2.5 ${sanitize(option.dataset.unit)}`;
      if (!qtyInput.value) qtyInput.value = "1.0";
    } else {
      qtyInput.placeholder = "yards used per item";
      qtyInput.value = "";
    }
  }

  function renderProducts() {
    const q = (document.getElementById("ready-products-search").value || "").toLowerCase();
    const filtered = allProducts.filter((p) => {
      return (
        p.Name.toLowerCase().includes(q) ||
        p.Category.toLowerCase().includes(q) ||
        (p.Type || "").toLowerCase().includes(q) ||
        (p.Size || "").toLowerCase().includes(q) ||
        (p.Color || "").toLowerCase().includes(q)
      );
    });

    const total = filtered.length;
    document.getElementById("ready-products-count").textContent = total;

    const paged = filtered.slice(
      (currentPageProducts - 1) * PER_PAGE,
      currentPageProducts * PER_PAGE
    );

    const tbody = document.getElementById("ready-products-tbody");
    tbody.innerHTML =
      paged.length === 0
        ? `<tr><td colspan="12" class="table-empty">No products found.</td></tr>`
        : paged
            .map((p) => {
              const fabricInfo = p.FabricID
                ? `${sanitize(p.FabricName)} (${p.FabricQtyUsed} ${sanitize(p.FabricUnit || "yds")})`
                : '<span class="text-muted">—</span>';
              
              return `<tr>
          <td class="font-mono text-muted">#${p.ProductID}</td>
          <td><strong>${sanitize(p.Name)}</strong></td>
          <td><span class="badge badge-accent">${sanitize(p.Category)}</span></td>
          <td>${sanitize(p.Type || "—")}</td>
          <td><span class="font-bold">${sanitize(p.Size || "—")}</span></td>
          <td>${sanitize(p.Color || "—")}</td>
          <td class="text-right font-bold">${p.Count} pcs</td>
          <td class="text-right font-mono">${fmtCurrency(p.Cost)}</td>
          <td class="text-right font-mono text-gold">${fmtCurrency(p.SellingPrice)}</td>
          <td class="text-right font-mono text-muted">${fmtCurrency(p.TailorFees)}</td>
          <td>${fabricInfo}</td>
          <td class="text-right">
            <button class="btn btn-gold btn-sm" style="width:100%;margin-bottom:10px;" onclick="ReadyMadePage.openSell(${p.ProductID})">💸 Sell</button>
            <button class="btn btn-ghost btn-sm" onclick="ReadyMadePage.edit(${p.ProductID})">✏️</button>
            ${Auth.isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="ReadyMadePage.deleteProduct(${p.ProductID})">🗑</button>` : ""}
          </td>
        </tr>`;
            })
            .join("");

    renderPagination(
      document.getElementById("ready-products-pagination"),
      total,
      PER_PAGE,
      currentPageProducts,
      (page) => {
        currentPageProducts = page;
        renderProducts();
      }
    );
  }

  function renderSales() {
    const q = (document.getElementById("ready-sales-search").value || "").toLowerCase();
    const filtered = allSales.filter((s) => {
      return (
        s.ProductName.toLowerCase().includes(q) ||
        s.ProductCategory.toLowerCase().includes(q) ||
        (s.ProductSize || "").toLowerCase().includes(q) ||
        s.SaleDate.includes(q)
      );
    });

    const total = filtered.length;
    document.getElementById("ready-sales-count").textContent = total;

    const totalSum = filtered.reduce((acc, s) => acc + (s.TotalAmount || 0), 0);
    document.getElementById("ready-sales-sum").textContent = fmtCurrency(totalSum);

    const paged = filtered.slice(
      (currentPageSales - 1) * PER_PAGE,
      currentPageSales * PER_PAGE
    );

    const tbody = document.getElementById("ready-sales-tbody");
    tbody.innerHTML =
      paged.length === 0
        ? `<tr><td colspan="9" class="table-empty">No sales history found.</td></tr>`
        : paged
            .map(
              (s) => `<tr>
          <td class="font-mono text-muted">#${s.SaleID}</td>
          <td>${fmtDate(s.SaleDate)}</td>
          <td><strong>${sanitize(s.ProductName)}</strong></td>
          <td><span class="badge badge-accent">${sanitize(s.ProductCategory)}</span></td>
          <td>${sanitize(s.ProductSize || "—")}</td>
          <td class="text-right font-bold">${s.Quantity} pcs</td>
          <td class="text-right font-mono">${fmtCurrency(s.SellingPrice)}</td>
          <td class="text-right font-bold font-mono text-gold">${fmtCurrency(s.TotalAmount)}</td>
          <td class="text-right">
            ${Auth.isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="ReadyMadePage.deleteSale(${s.SaleID})">🗑</button>` : ""}
          </td>
        </tr>`
            )
            .join("");

    renderPagination(
      document.getElementById("ready-sales-pagination"),
      total,
      PER_PAGE,
      currentPageSales,
      (page) => {
        currentPageSales = page;
        renderSales();
      }
    );
  }

  function openAdd() {
    editId = null;
    document.getElementById("rm-modal-title").textContent = "👔 Register Ready Made Product";
    document.getElementById("rm-id-hidden").value = "";
    document.getElementById("rm-name").value = "";
    document.getElementById("rm-category").value = "";
    document.getElementById("rm-type").value = "";
    document.getElementById("rm-size").value = "";
    document.getElementById("rm-color").value = "";
    document.getElementById("rm-cost").value = "";
    document.getElementById("rm-selling-price").value = "";
    document.getElementById("rm-tailor-fees").value = "";
    document.getElementById("rm-fabric-id").value = "";
    document.getElementById("rm-fabric-qty").value = "";
    document.getElementById("rm-fabric-qty").placeholder = "yards used per item";
    
    const countEl = document.getElementById("rm-count");
    countEl.value = "";
    countEl.disabled = false;
    countEl.parentElement.style.opacity = "1";

    clearValidation(document.getElementById("ready-made-form"));
    Modal.open("modal-ready-made");
  }

  async function edit(id) {
    try {
      editId = id;
      const p = await DB.readyMadeProducts.get(id);
      document.getElementById("rm-modal-title").textContent = "✏️ Edit Product";
      document.getElementById("rm-id-hidden").value = p.ProductID;
      document.getElementById("rm-name").value = p.Name;
      document.getElementById("rm-category").value = p.Category;
      document.getElementById("rm-type").value = p.Type || "";
      document.getElementById("rm-size").value = p.Size || "";
      document.getElementById("rm-color").value = p.Color || "";
      document.getElementById("rm-cost").value = p.Cost;
      document.getElementById("rm-selling-price").value = p.SellingPrice;
      document.getElementById("rm-tailor-fees").value = p.TailorFees || 0;
      document.getElementById("rm-fabric-id").value = p.FabricID || "";
      document.getElementById("rm-fabric-qty").value = p.FabricQtyUsed || "";
      
      const countEl = document.getElementById("rm-count");
      countEl.value = p.Count;
      // Disable editing counts during update to prevent retro-active fabric inventory issues.
      // Stock updates can be made by adding a new registration or manually in db.
      countEl.disabled = true;
      countEl.parentElement.style.opacity = "0.6";

      clearValidation(document.getElementById("ready-made-form"));
      Modal.open("modal-ready-made");
    } catch (err) {
      Toast.error("Failed to load product details: " + err.message);
    }
  }

  async function save() {
    const nameEl = document.getElementById("rm-name");
    const catEl = document.getElementById("rm-category");
    const sizeEl = document.getElementById("rm-size");
    const costEl = document.getElementById("rm-cost");
    const sellPriceEl = document.getElementById("rm-selling-price");
    const countEl = document.getElementById("rm-count");
    const fabricSelect = document.getElementById("rm-fabric-id");
    const fabricQtyEl = document.getElementById("rm-fabric-qty");

    clearValidation(document.getElementById("ready-made-form"));

    if (
      !validateFields([
        { el: nameEl, msg: "Product Name is required." },
        { el: catEl, msg: "Category is required." },
        { el: costEl, msg: "Cost Price is required." },
        { el: sellPriceEl, msg: "Selling Price is required." },
        { el: countEl, msg: "Quantity is required." },
      ])
    ) {
      return;
    }

    const count = parseInt(countEl.value, 10);
    const fabricId = parseInt(fabricSelect.value, 10) || null;
    const fabricQty = parseFloat(fabricQtyEl.value) || 0;

    if (count < 0) {
      showFieldError(countEl, "Quantity cannot be negative.");
      return;
    }

    // If adding a new product and using fabric, check client-side fabric availability
    if (!editId && fabricId && fabricQty > 0) {
      const option = fabricSelect.options[fabricSelect.selectedIndex];
      const available = parseFloat(option.dataset.count) || 0;
      const needed = fabricQty * count;
      if (needed > available) {
        showFieldError(fabricQtyEl, `Insufficient fabric in stock. Needed: ${needed.toFixed(2)}, Available: ${available.toFixed(2)}`);
        return;
      }
    }

    const payload = {
      Name: nameEl.value.trim(),
      Category: catEl.value,
      Type: document.getElementById("rm-type").value.trim() || null,
      Size: sizeEl.value.trim(),
      Cost: parseFloat(costEl.value),
      FabricID: fabricId,
      FabricQtyUsed: fabricQty,
      Color: document.getElementById("rm-color").value.trim() || null,
      Count: count,
      SellingPrice: parseFloat(sellPriceEl.value),
      TailorFees: parseFloat(document.getElementById("rm-tailor-fees").value) || 0,
    };

    try {
      if (editId) {
        payload.ProductID = editId;
        await DB.readyMadeProducts.put(payload);
        Toast.success("Product updated successfully.");
      } else {
        await DB.readyMadeProducts.add(payload);
        Toast.success("Product registered successfully.");
      }
      Modal.close("modal-ready-made");
      await load();
    } catch (err) {
      Toast.error("Failed to save product: " + err.message);
    }
  }

  async function deleteProduct(id) {
    const ok = await Confirm.show("Delete this ready made product? It will not delete historical sales.", "Delete Product");
    if (!ok) return;

    try {
      await DB.readyMadeProducts.delete(id);
      Toast.success("Product deleted.");
      await load();
    } catch (err) {
      Toast.error("Failed to delete product: " + err.message);
    }
  }

  async function deleteSale(id) {
    const ok = await Confirm.show(
      "Delete this sale? The sold quantity will be returned to product stock.",
      "Delete Sale",
      true,
    );
    if (!ok) return;

    try {
      await DB.readyMadeSales.delete(id);
      Toast.success("Sale deleted and stock restored.");
      await Promise.all([fetchProducts(), loadSalesHistory()]);
    } catch (err) {
      Toast.error("Failed to delete sale: " + err.message);
    }
  }

  // ── Selling Dialog Logic ──────────────────────────────────────────
  async function openSell(id) {
    try {
      const p = await DB.readyMadeProducts.get(id);
      if (p.Count <= 0) {
        Toast.error("This product is currently out of stock.");
        return;
      }

      document.getElementById("sale-product-id").value = p.ProductID;
      document.getElementById("sale-product-name").value = p.Name;
      document.getElementById("sale-date").value = todayStr();
      document.getElementById("sale-price").value = p.SellingPrice;
      document.getElementById("sale-avail-qty").value = p.Count;
      document.getElementById("sale-qty").value = "1";
      document.getElementById("sale-total").value = p.SellingPrice.toFixed(2);

      clearValidation(document.getElementById("ready-made-sale-form"));
      Modal.open("modal-sell-ready-made");
    } catch (err) {
      Toast.error("Error loading product for sale: " + err.message);
    }
  }

  function calcSaleTotal() {
    const qty = parseInt(document.getElementById("sale-qty").value, 10) || 0;
    const price = parseFloat(document.getElementById("sale-price").value) || 0;
    const total = qty * price;
    document.getElementById("sale-total").value = total ? total.toFixed(2) : "";
  }

  async function saveSale() {
    const dateEl = document.getElementById("sale-date");
    const qtyEl = document.getElementById("sale-qty");
    const priceEl = document.getElementById("sale-price");
    const idEl = document.getElementById("sale-product-id");

    clearValidation(document.getElementById("ready-made-sale-form"));

    if (
      !validateFields([
        { el: dateEl, msg: "Date is required." },
        { el: qtyEl, msg: "Quantity is required." },
        { el: priceEl, msg: "Selling Price is required." },
      ])
    ) {
      return;
    }

    const productId = parseInt(idEl.value, 10);
    const qty = parseInt(qtyEl.value, 10);
    const sellingPrice = parseFloat(priceEl.value);
    const available = parseInt(document.getElementById("sale-avail-qty").value, 10) || 0;

    if (qty <= 0) {
      showFieldError(qtyEl, "Quantity must be at least 1.");
      return;
    }

    if (qty > available) {
      showFieldError(qtyEl, `Insufficient stock. Max available: ${available}`);
      return;
    }

    const payload = {
      ProductID: productId,
      SaleDate: dateEl.value,
      Quantity: qty,
      SellingPrice: sellingPrice,
      TotalAmount: qty * sellingPrice,
    };

    try {
      await DB.readyMadeSales.add(payload);
      Toast.success("Product sold successfully.");
      Modal.close("modal-sell-ready-made");
      
      // Reload products list
      await load();
    } catch (err) {
      Toast.error("Failed to confirm sale: " + err.message);
    }
  }

  return {
    load,
    loadSalesHistory,
    onFabricSelectChange,
    openAdd,
    edit,
    save,
    deleteProduct,
    deleteSale,
    openSell,
    calcSaleTotal,
    saveSale,
  };
})();
