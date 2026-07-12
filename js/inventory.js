/**
 * inventory.js – Fabric Inventory management page
 * Beskpoke Tailor Shop
 */

const InventoryPage = (() => {
  let allFabrics = [];
  let usedCountByFabricId = new Map();
  let editId = null;
  let currentPage = 1;
  const PER_PAGE = 10;

  async function load() {
    allFabrics = await DB.inventory.getAll();
    const orderLines = await DB.orderlines.getAll().catch(() => []);
    const fabricSales = await DB.fabricSales.getAll().catch(() => []);
    usedCountByFabricId = new Map();

    for (const line of orderLines) {
      if (!line.FabricID || line.UseCount == null || line.UseCount <= 0) {
        continue;
      }

      const currentUsed = usedCountByFabricId.get(line.FabricID) || 0;
      usedCountByFabricId.set(
        line.FabricID,
        currentUsed + Number(line.UseCount),
      );
    }

    // Also count fabric sold directly via Sell Fabric page
    for (const sale of fabricSales) {
      if (!sale.FabricID || sale.Quantity == null || sale.Quantity <= 0) {
        continue;
      }
      const currentUsed = usedCountByFabricId.get(sale.FabricID) || 0;
      usedCountByFabricId.set(
        sale.FabricID,
        currentUsed + Number(sale.Quantity),
      );
    }

    currentPage = 1;
    render();
    document.getElementById("inventory-search").oninput = render;
  }

  function formatCount(value) {
    return Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function render() {
    const q = (
      document.getElementById("inventory-search").value || ""
    ).toLowerCase();
    const filtered = allFabrics.filter(
      (f) =>
        f.Name.toLowerCase().includes(q) ||
        (f.Code || "").toLowerCase().includes(q) ||
        f.Color.toLowerCase().includes(q) ||
        (f.Remark || "").toLowerCase().includes(q),
    );
    const total = filtered.length;
    const paged = filtered.slice(
      (currentPage - 1) * PER_PAGE,
      currentPage * PER_PAGE,
    );

    const tbody = document.getElementById("inventory-tbody");
    tbody.innerHTML =
      paged.length === 0
        ? `<tr><td colspan="10" class="table-empty"><div class="empty-icon">🧶</div>No fabrics found.</td></tr>`
        : paged
            .map((f) => {
              const remainingCount = Number(f.Count || 0);
              const usedCount = Number(
                usedCountByFabricId.get(f.FabricID) || 0,
              );
              const registeredCount = remainingCount + usedCount;

              return `<tr>
          <td class="font-mono text-muted">#${f.FabricID}</td>
          <td><strong>${sanitize(f.Name)}</strong></td>
          <td class="text-muted">${sanitize(f.Code || "—")}</td>
          <td>${sanitize(f.Color)}</td>
          <td class="text-right">${formatCount(registeredCount)} ${sanitize(f.Unit)}</td>
          <td class="text-right">${formatCount(usedCount)} ${sanitize(f.Unit)}</td>
          <td class="text-right">${formatCount(remainingCount)} ${sanitize(f.Unit)}</td>
          <td class="text-right">${fmtCurrency(f.Price)}   </td>
          <td class="text-muted">${sanitize(f.Remark || "—")}</td>
          <td class="text-right">
            <button class="btn btn-ghost btn-sm" onclick="InventoryPage.edit(${f.FabricID})">✏️</button>
            ${Auth.isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="InventoryPage.delete(${f.FabricID})">🗑</button>` : ""}
          </td>
        </tr>`;
            })
            .join("");

    document.getElementById("inventory-count").textContent = total;
    renderPagination(
      document.getElementById("inventory-pagination"),
      total,
      PER_PAGE,
      currentPage,
      (p) => {
        currentPage = p;
        render();
      },
    );
  }

  function openAdd() {
    editId = null;
    document.getElementById("inv-modal-title").textContent = "➕ Add Fabric";
    [
      "inv-name",
      "inv-code",
      "inv-color",
      "inv-count",
      "inv-price",
      "inv-remark",
    ].forEach((id) => (document.getElementById(id).value = ""));
    document.getElementById("inv-unit").value = "yards";
    document.getElementById("inv-id-hidden").value = "";
    clearValidation(document.getElementById("inventory-modal-form"));
    Modal.open("modal-inventory");
  }

  async function edit(id) {
    editId = id;
    const f = await DB.inventory.get(id);
    document.getElementById("inv-modal-title").textContent = "✏️ Edit Fabric";
    document.getElementById("inv-name").value = f.Name;
    document.getElementById("inv-code").value = f.Code || "";
    document.getElementById("inv-color").value = f.Color;
    document.getElementById("inv-count").value = f.Count;
    document.getElementById("inv-unit").value = f.Unit || "yards";
    document.getElementById("inv-price").value = f.Price;
    document.getElementById("inv-remark").value = f.Remark || "";
    document.getElementById("inv-id-hidden").value = id;
    clearValidation(document.getElementById("inventory-modal-form"));
    Modal.open("modal-inventory");
  }

  async function save() {
    if (
      !validateFields([
        { el: document.getElementById("inv-name"), msg: "Name is required." },
        { el: document.getElementById("inv-color"), msg: "Color is required." },
        { el: document.getElementById("inv-count"), msg: "Count is required." },
        { el: document.getElementById("inv-price"), msg: "Price is required." },
      ])
    )
      return;

    const payload = {
      Name: document.getElementById("inv-name").value.trim(),
      Code: document.getElementById("inv-code").value.trim() || null,
      Color: document.getElementById("inv-color").value.trim(),
      Count: parseFloat(document.getElementById("inv-count").value),
      Unit: document.getElementById("inv-unit").value,
      Price: parseFloat(document.getElementById("inv-price").value),
      Remark: document.getElementById("inv-remark").value.trim() || null,
    };

    try {
      if (editId) {
        payload.FabricID = editId;
        await DB.inventory.put(payload);
        Toast.success("Fabric updated.");
      } else {
        await DB.inventory.add(payload);
        Toast.success("Fabric added.");
      }
      Modal.close("modal-inventory");
      await load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  async function deleteFabric(id) {
    const ok = await Confirm.show(
      "Delete this fabric from inventory?",
      "Delete Fabric",
    );
    if (!ok) return;
    try {
      await DB.inventory.delete(id);
      Toast.success("Fabric deleted.");
      await load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  return { load, openAdd, edit, save, delete: deleteFabric };
})();
