/**
 * orders.js – New Order Entry & Order History pages
 * Beskpoke Tailor Shop
 */

const OrdersPage = (() => {
  // ── State ──────────────────────────────────────────────────────
  let selectedCustomer = null;
  let orderLines = []; // { tempId, CategoryID, SubcatID, CategoryName, SubcatName, SubcatImage, Quantity, UnitPrice, LineTotal }
  let editingOrderId = null;
  let acInstance = null;

  // Picker state
  let pickerCats = [];
  let pickerSubs = [];
  let selectedCat = null; // { CategoryID, Name }
  let selectedSub = null; // { SubcatID, Name, Image, CategoryID }
  let editingLineIdx = null;

  // Fabric inventory state (shared across all subcategory modals)
  let fabricCache = [];

  // History state
  let allOrders = [];
  let historyPage = 1;
  const PER_PAGE = 12;

  // ── Init ───────────────────────────────────────────────────────
  async function init() {
    bindOrderEntry();
    bindHistory();
  }

  // ══════════════════════════════════════════════════════════════
  // NEW ORDER ENTRY
  // ══════════════════════════════════════════════════════════════

  function bindOrderEntry() {
    // Set today's date
    document.getElementById("order-date").value = todayStr();

    // Customer autocomplete
    const custInput = document.getElementById("customer-search");
    const custDrop = document.getElementById("customer-dropdown");
    acInstance = makeAutocomplete(
      custInput,
      custDrop,
      async (q) => {
        const all = await DB.customers.getAll();
        return q
          ? all.filter(
              (c) =>
                c.Name.toLowerCase().includes(q) || (c.Phone || "").includes(q),
            )
          : all;
      },
      (c) => {
        selectedCustomer = c;
        document.getElementById("customer-id-hidden").value = c.CustomerID;
      },
    );

    // New customer button
    document
      .getElementById("btn-new-customer")
      .addEventListener("click", () => {
        clearCustomerForm();
        Modal.open("modal-customer");
      });

    // Picker navigation
    document
      .getElementById("btn-order-back-cat")
      .addEventListener("click", () => showStep("cat"));
    document
      .getElementById("btn-order-back-sub")
      .addEventListener("click", () => showStep("sub"));

    // Add item to order
    document
      .getElementById("btn-add-item")
      .addEventListener("click", addLineItem);

    // Save order
    document
      .getElementById("btn-save-order")
      .addEventListener("click", saveOrder);

    // Zero-pad the Order ID to 0001 format when leaving the field
    const orderIdInput = document.getElementById("order-id-input");
    if (orderIdInput) {
      orderIdInput.addEventListener("blur", () => {
        const raw = orderIdInput.value.trim();
        if (/^\d+$/.test(raw) && parseInt(raw, 10) > 0) {
          orderIdInput.value = fmtOrderId(parseInt(raw, 10));
          setOrderIdError("");
        }
      });
    }

    // Clear / New order
    document
      .getElementById("btn-clear-order")
      .addEventListener("click", resetOrderForm);

    // Save new customer from modal
    document
      .getElementById("btn-save-customer-inline")
      .addEventListener("click", saveCustomerInline);

    // Live recalculate remaining balance when deposit or discount changes
    document
      .getElementById("order-deposit")
      .addEventListener("input", updateRemainingBalance);
    document
      .getElementById("order-discount")
      .addEventListener("input", updateRemainingBalance);

    // Live recalculate remaining balance when payment method changes
    document
      .querySelectorAll('input[name="order-payment-method"]')
      .forEach((el) => {
        el.addEventListener("change", updateRemainingBalance);
      });

    // Initialize Inline Customer Photo upload handler
    const custImageFileInput = document.getElementById("cust-image-file");
    if (custImageFileInput) {
      custImageFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        document.getElementById("cust-image-filename").textContent = file.name;

        const formData = new FormData();
        formData.append("image", file);

        try {
          Toast.info("Uploading photo…");
          const res = await fetch("/api/customers/upload", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error("File upload failed on server.");
          const data = await res.json();

          document.getElementById("cust-image-url").value = data.filePath;
          const preview = document.getElementById("cust-image-preview");
          preview.src = data.filePath;
          document.getElementById("cust-image-preview-wrap").style.display =
            "block";
          Toast.success("Photo uploaded successfully!");
        } catch (err) {
          console.error("File upload failed:", err);
          Toast.error("Failed to upload customer photo.");
        }
      });
    }
  }

  // ── Picker Steps ──────────────────────────────────────────────

  function showStep(step) {
    document.getElementById("order-step-cat").style.display =
      step === "cat" ? "" : "none";
    document.getElementById("order-step-sub").style.display =
      step === "sub" ? "" : "none";
    document.getElementById("order-step-qty").style.display =
      step === "qty" ? "" : "none";
  }

  async function refreshNextOrderId() {
    const el = document.getElementById("order-id-input");
    if (!el) return;
    setOrderIdError("");
    if (editingOrderId) {
      // Order ID cannot be changed while editing an existing order
      el.value = fmtOrderId(editingOrderId);
      el.disabled = true;
    } else {
      el.disabled = false;
      try {
        const orders = await DB.orders.getAll();
        const maxId =
          orders.length > 0 ? Math.max(...orders.map((o) => o.OrderID)) : 0;
        el.value = fmtOrderId(maxId + 1);
      } catch {
        el.value = "";
      }
    }
  }

  function setOrderIdError(msg) {
    const input = document.getElementById("order-id-input");
    if (!input) return;
    const errEl = input.parentElement.querySelector(".field-error");
    if (msg) {
      input.classList.add("input-error");
      if (errEl) {
        errEl.textContent = msg;
        errEl.style.display = "block";
      }
    } else {
      input.classList.remove("input-error");
      if (errEl) {
        errEl.textContent = "";
        errEl.style.display = "none";
      }
    }
  }

  async function populateCategories() {
    pickerCats = await DB.categories.getAll();
    pickerSubs = await DB.subcategories.getAll();
    renderCatCards();
    showStep("cat");
    await refreshNextOrderId();
    // Pre-load fabric inventory so it's ready when a modal opens
    loadFabricCache();
  }

  // ── Fabric Inventory helpers ────────────────────────────────────
  async function loadFabricCache() {
    try {
      fabricCache = await DB.inventory.getAll();
    } catch (err) {
      console.error("Failed to load fabric inventory:", err);
      fabricCache = [];
    }
  }

  // Populate the fabric <select> for a given modal prefix (meas / meas-pant / meas-shirt)
  function populateFabricDropdown(prefix) {
    const sel = document.getElementById(`${prefix}-fabric`);
    if (!sel) return;

    // Only show fabrics that still have stock available
    const available = fabricCache.filter(
      (f) => f.Count != null && Number(f.Count) > 0,
    );

    // Preserve the placeholder
    const placeholder = '<option value="">— Select fabric —</option>';
    if (available.length === 0) {
      sel.innerHTML =
        placeholder +
        '<option value="" disabled>(no fabrics in stock)</option>';
    } else {
      sel.innerHTML =
        placeholder +
        available
          .map((f) => {
            const code = f.Code ? ` - ${sanitize(f.Code)}` : "";
            return `<option value="${f.FabricID}">${sanitize(f.Name)}${code}  (Stock: ${f.Count} ${sanitize(f.Unit || "")})</option>`;
          })
          .join("");
    }

    // Reset the info row
    const info = document.getElementById(`${prefix}-fabric-info`);
    if (info) info.style.display = "none";
    const useInput = document.getElementById(`${prefix}-use-count`);
    if (useInput) useInput.value = "";
  }

  // Called when a fabric option is chosen (from the onchange handler)
  function _pickFabric(prefix) {
    const sel = document.getElementById(`${prefix}-fabric`);
    const info = document.getElementById(`${prefix}-fabric-info`);
    const remainingEl = document.getElementById(`${prefix}-fabric-remaining`);
    const unitEl = document.getElementById(`${prefix}-fabric-unit`);
    const useInput = document.getElementById(`${prefix}-use-count`);

    const fabricId = parseInt(sel.value, 10);
    const fabric = fabricCache.find((f) => f.FabricID === fabricId);

    if (!fabric) {
      if (info) info.style.display = "none";
      if (useInput) useInput.value = "";
      return;
    }

    if (remainingEl)
      remainingEl.textContent = `${fabric.Count} ${fabric.Unit || ""}`;
    if (unitEl) unitEl.textContent = fabric.Unit || "";
    if (info) info.style.display = "flex";
    if (useInput && !useInput.value) useInput.value = "";
  }

  // Read the fabric selection for a modal prefix into { FabricID, UseCount, FabricUnit }
  function readFabricSelection(prefix) {
    const sel = document.getElementById(`${prefix}-fabric`);
    if (!sel || !sel.value) return null;

    const fabricId = parseInt(sel.value, 10);
    const fabric = fabricCache.find((f) => f.FabricID === fabricId);
    if (!fabric) return null;

    const useInput = document.getElementById(`${prefix}-use-count`);
    let useCount = useInput ? parseFloat(useInput.value) : NaN;
    if (isNaN(useCount) || useCount < 0) useCount = 0;

    return {
      FabricID: fabric.FabricID,
      FabricName: fabric.Name,
      FabricCode: fabric.Code || "",
      UseCount: useCount,
      FabricUnit: fabric.Unit || "",
    };
  }

  function renderCatCards() {
    const grid = document.getElementById("order-cat-cards");
    if (pickerCats.length === 0) {
      grid.innerHTML = `<div style="color:var(--text-muted);font-size:13px">No categories found. Add some in the Catalog page.</div>`;
      return;
    }
    // Map each category to count of subcategories
    grid.innerHTML = pickerCats
      .map((cat) => {
        const subCount = pickerSubs.filter(
          (s) => s.CategoryID === cat.CategoryID,
        ).length;
        return `
        <button class="picker-cat-card" onclick="OrdersPage._pickCat(${cat.CategoryID})">
          <div class="picker-cat-icon">🧵</div>
          <div class="picker-cat-name">${sanitize(cat.Name)}</div>
          <div class="picker-cat-sub">${subCount} style${subCount !== 1 ? "s" : ""}</div>
        </button>`;
      })
      .join("");
  }

  function _pickCat(catId) {
    selectedCat = pickerCats.find((c) => c.CategoryID === catId);
    if (!selectedCat) return;

    const subs = pickerSubs.filter((s) => s.CategoryID === catId);
    document.getElementById("order-subcat-heading").textContent =
      `${selectedCat.Name} — Choose a Style`;

    const grid = document.getElementById("order-sub-cards");
    if (subs.length === 0) {
      grid.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px">No subcategories yet for this category.</div>`;
    } else {
      grid.innerHTML = subs
        .map((sub) => {
          const imgHtml = sub.Image
            ? `<img src="${sub.Image}" alt="${sanitize(sub.Name)}" class="picker-sub-img" />`
            : `<div class="picker-sub-img picker-sub-noimg">🧵</div>`;
          return `
          <button class="picker-sub-card" onclick="OrdersPage._pickSub(${sub.SubcatID})">
            ${imgHtml}
            <div class="picker-sub-name">${sanitize(sub.Name)}</div>
          </button>`;
        })
        .join("");
    }
    showStep("sub");
  }

  function _pickSub(subcatId) {
    selectedSub = pickerSubs.find((s) => s.SubcatID === subcatId);
    if (!selectedSub) return;

    // Show summary of selected
    const summary = document.getElementById("order-selected-summary");
    const imgHtml = selectedSub.Image
      ? `<img src="${selectedSub.Image}" alt="${sanitize(selectedSub.Name)}" class="picker-summary-img" />`
      : `<span class="picker-summary-noimg">🧵</span>`;
    summary.innerHTML = `
      ${imgHtml}
      <div>
        <div class="picker-summary-cat">${sanitize(selectedCat.Name)}</div>
        <div class="picker-summary-sub">${sanitize(selectedSub.Name)}</div>
      </div>`;

    // Reset qty/price
    document.getElementById("item-qty").value = "1";
    document.getElementById("item-unit-price").value = "";

    if (selectedCat.Name === "Jacket & Vest") {
      // Measurements Modal explicitly for Jacket
      populateFabricDropdown("meas");
      document.getElementById("meas-cat-sub-name").textContent =
        `${selectedCat.Name} — ${selectedSub.Name}`;

      const measImgWrap = document.getElementById("meas-sub-image-wrap");
      if (selectedSub.Image) {
        measImgWrap.innerHTML = `<img src="${selectedSub.Image}" alt="${sanitize(selectedSub.Name)}" style="width: 220px; height: 220px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />`;
      } else {
        measImgWrap.innerHTML = `<div style="display: flex; width: 220px; height: 220px; border-radius: 6px; background: linear-gradient(135deg, var(--gold-dark), var(--gold)); color: #fff; align-items: center; justify-content: center; font-size: 56px; font-weight: bold; border: 1px solid var(--border);">🧵</div>`;
      }

      // Reset modal fields
      document.getElementById("meas-description").value = "";
      document.getElementById("meas-length").value = "";
      document.getElementById("meas-chest").value = "";
      document.getElementById("meas-waist").value = "";
      document.getElementById("meas-hips").value = "";
      document.getElementById("meas-shoulder").value = "";
      document.getElementById("meas-sleeves").value = "";
      document.getElementById("meas-front").value = "";
      document.getElementById("meas-back").value = "";
      document.getElementById("meas-neck").value = "";
      document.getElementById("meas-front-length").value = "";
      document.getElementById("meas-back-length").value = "";
      document.getElementById("meas-bust-height").value = "";
      document.getElementById("meas-bust-width").value = "";
      document.getElementById("meas-arm").value = "";
      document.getElementById("meas-chk-sloping-shoulder").checked = false;
      document.getElementById("meas-chk-hunched-back").checked = false;
      document.getElementById("meas-chk-belly").checked = false;
      document.getElementById("meas-chk-sway-back").checked = false;
      document.getElementById("meas-chk-male").checked = false;
      document.getElementById("meas-chk-female").checked = false;
      document.getElementById("meas-chk-low-leg").checked = false;
      document.getElementById("meas-chk-left-lower").checked = false;
      document.getElementById("meas-chk-closed-back").checked = false;
      document.getElementById("meas-chk-center-pleat").checked = false;
      document.getElementById("meas-chk-side-pleats").checked = false;
      document.getElementById("meas-qty").value = "1";
      document.getElementById("meas-color").value = "";
      document.getElementById("meas-unit-price").value = "";
      document.getElementById("meas-tailor-fees").value = "";

      Modal.open("modal-measurements");
    } else if (selectedCat.Name === "Trousers & Skirt") {
      // Measurements Modal explicitly for Pant
      populateFabricDropdown("meas-pant");
      document.getElementById("meas-pant-cat-sub-name").textContent =
        `${selectedCat.Name} — ${selectedSub.Name}`;

      const measImgWrap = document.getElementById("meas-pant-sub-image-wrap");
      if (selectedSub.Image) {
        measImgWrap.innerHTML = `<img src="${selectedSub.Image}" alt="${sanitize(selectedSub.Name)}" style="width: 220px; height: 220px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />`;
      } else {
        measImgWrap.innerHTML = `<div style="display: flex; width: 220px; height: 220px; border-radius: 6px; background: linear-gradient(135deg, var(--gold-dark), var(--gold)); color: #fff; align-items: center; justify-content: center; font-size: 56px; font-weight: bold; border: 1px solid var(--border);">🧵</div>`;
      }

      // Reset modal fields
      document.getElementById("meas-pant-description").value = "";
      document.getElementById("meas-pant-waist").value = "";
      document.getElementById("meas-pant-hips").value = "";
      document.getElementById("meas-pant-crotch").value = "";
      document.getElementById("meas-pant-thighs").value = "";
      document.getElementById("meas-pant-knee").value = "";
      document.getElementById("meas-pant-bottom").value = "";
      document.getElementById("meas-pant-length").value = "";
      document.getElementById("meas-pant-shorts").value = "";
      document.getElementById("meas-pant-stomach").value = "";
      document.getElementById("meas-pant-skirt-length").value = "";
      document.getElementById("meas-pant-chk-flat-seat").checked = false;
      document.getElementById("meas-pant-chk-prominent-seat").checked = false;
      document.getElementById("meas-pant-chk-front-low").checked = false;
      document.getElementById("meas-pant-chk-male").checked = false;
      document.getElementById("meas-pant-chk-female").checked = false;
      document.getElementById("meas-pant-chk-front-thigh").checked = false;
      document.getElementById("meas-pant-qty").value = "1";
      document.getElementById("meas-pant-color").value = "";
      document.getElementById("meas-pant-unit-price").value = "";
      document.getElementById("meas-pant-tailor-fees").value = "";

      Modal.open("modal-meas-pant");
    } else if (selectedCat.Name === "Shirt & Dress") {
      // Measurements Modal explicitly for Shirt
      populateFabricDropdown("meas-shirt");
      document.getElementById("meas-shirt-cat-sub-name").textContent =
        `${selectedCat.Name} — ${selectedSub.Name}`;

      const measImgWrap = document.getElementById("meas-shirt-sub-image-wrap");
      if (selectedSub.Image) {
        measImgWrap.innerHTML = `<img src="${selectedSub.Image}" alt="${sanitize(selectedSub.Name)}" style="width: 220px; height: 220px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />`;
      } else {
        measImgWrap.innerHTML = `<div style="display: flex; width: 220px; height: 220px; border-radius: 6px; background: linear-gradient(135deg, var(--gold-dark), var(--gold)); color: #fff; align-items: center; justify-content: center; font-size: 56px; font-weight: bold; border: 1px solid var(--border);">🧵</div>`;
      }

      // Reset modal fields
      document.getElementById("meas-shirt-description").value = "";
      document.getElementById("meas-shirt-length").value = "";
      document.getElementById("meas-shirt-chest").value = "";
      document.getElementById("meas-shirt-waist").value = "";
      document.getElementById("meas-shirt-hips").value = "";
      document.getElementById("meas-shirt-shoulder").value = "";
      document.getElementById("meas-shirt-sleeves").value = "";
      document.getElementById("meas-shirt-neck").value = "";
      document.getElementById("meas-shirt-cuffs").value = "";
      document.getElementById("meas-shirt-front-length").value = "";
      document.getElementById("meas-shirt-back-length").value = "";
      document.getElementById("meas-shirt-bust-height").value = "";
      document.getElementById("meas-shirt-bust-width").value = "";
      document.getElementById("meas-shirt-front").value = "";
      document.getElementById("meas-shirt-back").value = "";
      document.getElementById("meas-shirt-skirt-length").value = "";
      document.getElementById("meas-shirt-arm").value = "";

      document.getElementById("meas-shirt-chk-sloping-shoulder").checked =
        false;
      document.getElementById("meas-shirt-chk-belly").checked = false;
      document.getElementById("meas-shirt-chk-hunched-back").checked = false;
      document.getElementById("meas-shirt-chk-male").checked = false;
      document.getElementById("meas-shirt-chk-female").checked = false;
      document.getElementById("meas-shirt-chk-pointed").checked = false;
      document.getElementById("meas-shirt-chk-square").checked = false;
      document.getElementById("meas-shirt-chk-wide-square").checked = false;
      document.getElementById("meas-shirt-chk-collar-roll").checked = false;
      document.getElementById("meas-shirt-chk-lapel-gorge").checked = false;
      document.getElementById("meas-shirt-chk-back-pleat").checked = false;
      document.getElementById("meas-shirt-chk-plain-back").checked = false;
      document.getElementById("meas-shirt-chk-center-pleat").checked = false;
      document.getElementById("meas-shirt-chk-side-pleats").checked = false;
      document.getElementById("meas-shirt-qty").value = "1";
      document.getElementById("meas-shirt-color").value = "";
      document.getElementById("meas-shirt-unit-price").value = "";
      document.getElementById("meas-shirt-tailor-fees").value = "";

      Modal.open("modal-meas-shirt");
    } else {
      showStep("qty");
      document.getElementById("item-unit-price").focus();
    }
  }

  // ── Add Line ──────────────────────────────────────────────────

  async function addLineItem() {
    if (!selectedCat || !selectedSub) {
      Toast.warning("Please select a Category and Subcategory first.");
      showStep("cat");
      return;
    }

    const qty = parseFloat(document.getElementById("item-qty").value);
    const price = parseFloat(document.getElementById("item-unit-price").value);

    let errs = [];
    if (!qty || qty <= 0) errs.push("Quantity must be > 0.");
    if (isNaN(price) || price < 0) errs.push("Unit Price must be ≥ 0.");
    if (errs.length) {
      Toast.warning(errs[0]);
      return;
    }

    const line = {
      tempId: Date.now(),
      CategoryID: selectedCat.CategoryID,
      SubcatID: selectedSub.SubcatID,
      CategoryName: selectedCat.Name,
      SubcatName: selectedSub.Name,
      SubcatImage: selectedSub.Image || "",
      Quantity: qty,
      UnitPrice: price,
      LineTotal: +(qty * price).toFixed(2),
    };

    const wasEditing = editingLineIdx !== null;
    if (wasEditing) {
      orderLines[editingLineIdx] = line;
      editingLineIdx = null;
    } else {
      orderLines.push(line);
    }
    renderOrderLines();
    updateOrderTotal();

    Toast.success(
      `${wasEditing ? "Updated" : "Added"}: ${selectedCat.Name} – ${selectedSub.Name}`,
    );

    // Go back to category picker for next item
    showStep("cat");
    selectedCat = null;
    selectedSub = null;
  }

  async function addLineItemFromPantModal() {
    if (!selectedCat || !selectedSub) {
      Toast.warning("Please select a Category and Subcategory first.");
      return;
    }

    const qty = parseFloat(document.getElementById("meas-pant-qty").value);
    const price = parseFloat(
      document.getElementById("meas-pant-unit-price").value,
    );

    let errs = [];
    if (!qty || qty <= 0) errs.push("Quantity must be > 0.");
    if (isNaN(price) || price < 0) errs.push("Unit Price must be ≥ 0.");
    if (errs.length) {
      Toast.warning(errs[0]);
      return;
    }

    const getVal = (id) => document.getElementById(id).value.trim();
    const getChk = (id) => document.getElementById(id).checked;

    const m = [];
    const fields = [
      "waist",
      "hips",
      "crotch",
      "thighs",
      "knee",
      "bottom",
      "length",
      "shorts",
      "stomach",
      "skirt-length",
    ];
    fields.forEach((f) => {
      const v = getVal("meas-pant-" + f);
      if (v) {
        // convert to Title Case
        const label = f
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
        m.push(`${label}: ${v}`);
      }
    });

    const chks = [];
    if (getChk("meas-pant-chk-flat-seat")) chks.push("Flat Seat");
    if (getChk("meas-pant-chk-prominent-seat")) chks.push("Prominent Seat");
    if (getChk("meas-pant-chk-front-low")) chks.push("Front Low");
    if (getChk("meas-pant-chk-male")) chks.push("Gents");
    if (getChk("meas-pant-chk-female")) chks.push("Ladies");
    if (getChk("meas-pant-chk-front-thigh")) chks.push("Prominent Front Thigh");

    const color = getVal("meas-pant-color");
    const desc = getVal("meas-pant-description");

    let customDesc = `${selectedCat.Name} – ${selectedSub.Name}`;
    if (desc) customDesc += ` | ${desc}`;
    if (color) customDesc += ` | Color: ${color}`;
    if (m.length) customDesc += ` | Meas: ${m.join(", ")}`;
    if (chks.length) customDesc += ` | Traits: ${chks.join(", ")}`;

    const fabricSel = readFabricSelection("meas-pant");
    if (fabricSel) {
      customDesc += ` | Fabric: ${fabricSel.FabricName}${fabricSel.FabricCode ? " (" + fabricSel.FabricCode + ")" : ""}`;
      if (fabricSel.UseCount > 0)
        customDesc += ` | Fabric Used: ${fabricSel.UseCount} ${fabricSel.FabricUnit}`;
    }

    const tailorFees =
      parseFloat(document.getElementById("meas-pant-tailor-fees").value) || 0;

    const line = {
      tempId: Date.now(),
      CategoryID: selectedCat.CategoryID,
      SubcatID: selectedSub.SubcatID,
      CategoryName: selectedCat.Name,
      SubcatName: selectedSub.Name,
      SubcatImage: selectedSub.Image || "",
      Quantity: qty,
      UnitPrice: price,
      LineTotal: +(qty * price).toFixed(2),
      CustomDesc: customDesc,
      FabricID: fabricSel ? fabricSel.FabricID : null,
      UseCount: fabricSel ? fabricSel.UseCount : null,
      FabricUnit: fabricSel ? fabricSel.FabricUnit : null,
      TailorFees: tailorFees,
    };

    const wasEditing = editingLineIdx !== null;
    if (wasEditing) {
      orderLines[editingLineIdx] = line;
      editingLineIdx = null;
    } else {
      orderLines.push(line);
    }
    renderOrderLines();
    updateOrderTotal();

    Toast.success(
      `${wasEditing ? "Updated" : "Added"}: ${selectedCat.Name} – ${selectedSub.Name}`,
    );

    Modal.close("modal-meas-pant");
    showStep("cat");
    selectedCat = null;
    selectedSub = null;
  }

  async function addLineItemFromShirtModal() {
    if (!selectedCat || !selectedSub) {
      Toast.warning("Please select a Category and Subcategory first.");
      return;
    }

    const qty = parseFloat(document.getElementById("meas-shirt-qty").value);
    const price = parseFloat(
      document.getElementById("meas-shirt-unit-price").value,
    );

    let errs = [];
    if (!qty || qty <= 0) errs.push("Quantity must be > 0.");
    if (isNaN(price) || price < 0) errs.push("Unit Price must be ≥ 0.");
    if (errs.length) {
      Toast.warning(errs[0]);
      return;
    }

    const getVal = (id) => document.getElementById(id).value.trim();
    const getChk = (id) => document.getElementById(id).checked;

    const m = [];
    const fields = [
      "length",
      "chest",
      "waist",
      "hips",
      "shoulder",
      "sleeves",
      "neck",
      "cuffs",
      "front-length",
      "back-length",
      "bust-height",
      "bust-width",
      "front",
      "back",
      "skirt-length",
      "arm",
    ];
    fields.forEach((f) => {
      const v = getVal("meas-shirt-" + f);
      if (v) {
        const label = f
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
        m.push(`${label}: ${v}`);
      }
    });

    const chks = [];
    if (getChk("meas-shirt-chk-sloping-shoulder"))
      chks.push("ไหล่เท (Sloping Shoulders)");
    if (getChk("meas-shirt-chk-belly"))
      chks.push("มีพุง (Protruding Belly / Stomach)");
    if (getChk("meas-shirt-chk-hunched-back"))
      chks.push("หลังค่อม (Hunched Back)");
    if (getChk("meas-shirt-chk-male")) chks.push("Gents (ผู้ชาย)");
    if (getChk("meas-shirt-chk-female")) chks.push("Ladies (ผู้หญิง)");
    if (getChk("meas-shirt-chk-pointed")) chks.push("แหลม (F) (Point Collar)");
    if (getChk("meas-shirt-chk-square"))
      chks.push("ป้าน (I) (Semi-Spread Collar)");
    if (getChk("meas-shirt-chk-wide-square"))
      chks.push("ป้าน (180) (Wide Spread Collar (180°))");
    if (getChk("meas-shirt-chk-collar-roll"))
      chks.push("คุมบนปก (Top Collar Stitching)");
    if (getChk("meas-shirt-chk-lapel-gorge"))
      chks.push("คุมใต้ปก (Under Collar Stitching)");
    if (getChk("meas-shirt-chk-back-pleat")) chks.push("คาร์ท (Back Pleat)");
    if (getChk("meas-shirt-chk-plain-back"))
      chks.push("หลังเรียบ (X) (Plain Back / No Pleat)");
    if (getChk("meas-shirt-chk-center-pleat"))
      chks.push("จีบกลาง (TT) (Center Pleat)");
    if (getChk("meas-shirt-chk-side-pleats"))
      chks.push("จีบข้าง (TT) (Side Pleats)");

    const color = getVal("meas-shirt-color");
    const desc = getVal("meas-shirt-description");

    let customDesc = `${selectedCat.Name} – ${selectedSub.Name}`;
    if (desc) customDesc += ` | ${desc}`;
    if (color) customDesc += ` | Color: ${color}`;
    if (m.length) customDesc += ` | Meas: ${m.join(", ")}`;
    if (chks.length) customDesc += ` | Traits: ${chks.join(", ")}`;

    const fabricSel = readFabricSelection("meas-shirt");
    if (fabricSel) {
      customDesc += ` | Fabric: ${fabricSel.FabricName}${fabricSel.FabricCode ? " (" + fabricSel.FabricCode + ")" : ""}`;
      if (fabricSel.UseCount > 0)
        customDesc += ` | Fabric Used: ${fabricSel.UseCount} ${fabricSel.FabricUnit}`;
    }

    const tailorFees =
      parseFloat(document.getElementById("meas-shirt-tailor-fees").value) || 0;

    const line = {
      tempId: Date.now(),
      CategoryID: selectedCat.CategoryID,
      SubcatID: selectedSub.SubcatID,
      CategoryName: selectedCat.Name,
      SubcatName: selectedSub.Name,
      SubcatImage: selectedSub.Image || "",
      Quantity: qty,
      UnitPrice: price,
      LineTotal: +(qty * price).toFixed(2),
      CustomDesc: customDesc,
      FabricID: fabricSel ? fabricSel.FabricID : null,
      UseCount: fabricSel ? fabricSel.UseCount : null,
      FabricUnit: fabricSel ? fabricSel.FabricUnit : null,
      TailorFees: tailorFees,
    };

    const wasEditing = editingLineIdx !== null;
    if (wasEditing) {
      orderLines[editingLineIdx] = line;
      editingLineIdx = null;
    } else {
      orderLines.push(line);
    }
    renderOrderLines();
    updateOrderTotal();

    Toast.success(
      `${wasEditing ? "Updated" : "Added"}: ${selectedCat.Name} – ${selectedSub.Name}`,
    );

    Modal.close("modal-meas-shirt");
    showStep("cat");
    selectedCat = null;
    selectedSub = null;
  }

  async function addLineItemFromModal() {
    if (!selectedCat || !selectedSub) {
      Toast.warning("Please select a Category and Subcategory first.");
      return;
    }

    const qty = parseFloat(document.getElementById("meas-qty").value);
    const price = parseFloat(document.getElementById("meas-unit-price").value);

    let errs = [];
    if (!qty || qty <= 0) errs.push("Quantity must be > 0.");
    if (isNaN(price) || price < 0) errs.push("Unit Price must be ≥ 0.");
    if (errs.length) {
      Toast.warning(errs[0]);
      return;
    }

    const getVal = (id) => document.getElementById(id).value.trim();
    const getChk = (id) => document.getElementById(id).checked;

    const m = [];
    const fields = [
      "length",
      "chest",
      "waist",
      "hips",
      "shoulder",
      "sleeves",
      "front",
      "back",
      "neck",
      "front-length",
      "back-length",
      "bust-height",
      "bust-width",
      "arm",
    ];
    fields.forEach((f) => {
      const v = getVal("meas-" + f);
      if (v) {
        const label = f
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
        m.push(`${label}: ${v}`);
      }
    });

    const chks = [];
    if (getChk("meas-chk-sloping-shoulder")) chks.push("Sloping Shoulder");
    if (getChk("meas-chk-hunched-back")) chks.push("Hunched Back");
    if (getChk("meas-chk-belly")) chks.push("Belly");
    if (getChk("meas-chk-sway-back")) chks.push("Sway Back");
    if (getChk("meas-chk-male")) chks.push("Gents");
    if (getChk("meas-chk-female")) chks.push("Ladies");
    if (getChk("meas-chk-low-leg")) chks.push("Low Leg");
    if (getChk("meas-chk-left-lower")) chks.push("Left Side Lower");
    if (getChk("meas-chk-closed-back")) chks.push("หลังปิด (X) (Closed Back)");
    if (getChk("meas-chk-center-pleat"))
      chks.push("ผ่ากลาง (T) ① (Center Pleat)");
    if (getChk("meas-chk-side-pleats"))
      chks.push("ผ่าข้าง (TT) ② (Side Pleats)");

    const color = getVal("meas-color");
    const desc = getVal("meas-description");

    let customDesc = `${selectedCat.Name} – ${selectedSub.Name}`;
    if (desc) customDesc += ` | ${desc}`;
    if (color) customDesc += ` | Color: ${color}`;
    if (m.length) customDesc += ` | Meas: ${m.join(", ")}`;
    if (chks.length) customDesc += ` | Traits: ${chks.join(", ")}`;

    const fabricSel = readFabricSelection("meas");
    if (fabricSel) {
      customDesc += ` | Fabric: ${fabricSel.FabricName}${fabricSel.FabricCode ? " (" + fabricSel.FabricCode + ")" : ""}`;
      if (fabricSel.UseCount > 0)
        customDesc += ` | Fabric Used: ${fabricSel.UseCount} ${fabricSel.FabricUnit}`;
    }

    const tailorFees =
      parseFloat(document.getElementById("meas-tailor-fees").value) || 0;

    const line = {
      tempId: Date.now(),
      CategoryID: selectedCat.CategoryID,
      SubcatID: selectedSub.SubcatID,
      CategoryName: selectedCat.Name,
      SubcatName: selectedSub.Name,
      SubcatImage: selectedSub.Image || "",
      Quantity: qty,
      UnitPrice: price,
      LineTotal: +(qty * price).toFixed(2),
      CustomDesc: customDesc,
      FabricID: fabricSel ? fabricSel.FabricID : null,
      UseCount: fabricSel ? fabricSel.UseCount : null,
      FabricUnit: fabricSel ? fabricSel.FabricUnit : null,
      TailorFees: tailorFees,
    };

    const wasEditing = editingLineIdx !== null;
    if (wasEditing) {
      orderLines[editingLineIdx] = line;
      editingLineIdx = null;
    } else {
      orderLines.push(line);
    }
    renderOrderLines();
    updateOrderTotal();

    Toast.success(
      `${wasEditing ? "Updated" : "Added"}: ${selectedCat.Name} – ${selectedSub.Name}`,
    );

    Modal.close("modal-measurements");
    showStep("cat");
    selectedCat = null;
    selectedSub = null;
  }

  function renderOrderLines() {
    const tbody = document.getElementById("order-lines-body");
    if (orderLines.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">
        <div class="empty-icon">🧵</div>No items added yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = orderLines
      .map((l, idx) => {
        const imgHtml = l.SubcatImage
          ? `<img src="${l.SubcatImage}" alt="${sanitize(l.SubcatName)}" class="line-thumb" />`
          : `<span class="line-thumb-icon">🧵</span>`;
        return `
        <tr>
          <td><span class="badge badge-blue">${sanitize(l.CategoryName)}</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              ${imgHtml}
              <span class="badge badge-gold">${sanitize(l.SubcatName)}</span>
            </div>
          </td>
          <td class="text-right font-mono">${l.Quantity}</td>
          <td class="text-right font-mono">${fmtCurrency(l.UnitPrice)}</td>
          <td class="text-right font-mono text-gold font-bold">${fmtCurrency(l.LineTotal)}</td>
          <td class="text-right">
            <button class="btn btn-primary btn-sm btn-icon" onclick="OrdersPage.editLine(${idx})" title="Edit" style="margin-right:4px;">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="OrdersPage.removeLine(${idx})" title="Remove">✕</button>
          </td>
        </tr>`;
      })
      .join("");
  }

  function removeLine(idx) {
    orderLines.splice(idx, 1);
    renderOrderLines();
    updateOrderTotal();
  }

  function parseCustomDesc(customDesc) {
    const out = { description: "", color: "", meas: {}, traits: [] };
    if (!customDesc) return out;
    const segs = customDesc.split(" | ").slice(1);
    for (const s of segs) {
      if (s.startsWith("Color: ")) {
        out.color = s.slice(7);
      } else if (s.startsWith("Meas: ")) {
        s.slice(6)
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .forEach((p) => {
            const i = p.indexOf(":");
            if (i > 0) out.meas[p.slice(0, i).trim()] = p.slice(i + 1).trim();
          });
      } else if (s.startsWith("Traits: ")) {
        out.traits = s
          .slice(8)
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
      } else if (s.startsWith("Fabric: ") || s.startsWith("Fabric Used: ")) {
        // handled via line.FabricID
      } else if (!out.description) {
        out.description = s;
      }
    }
    return out;
  }

  const JACKET_MEAS = {
    Length: "meas-length",
    Chest: "meas-chest",
    Waist: "meas-waist",
    Hips: "meas-hips",
    Shoulder: "meas-shoulder",
    Sleeves: "meas-sleeves",
    Front: "meas-front",
    Back: "meas-back",
    Neck: "meas-neck",
    "Front Length": "meas-front-length",
    "Back Length": "meas-back-length",
    "Bust Height": "meas-bust-height",
    "Bust Width": "meas-bust-width",
    Arm: "meas-arm",
  };
  const JACKET_TRAITS = {
    "Sloping Shoulder": "meas-chk-sloping-shoulder",
    "Hunched Back": "meas-chk-hunched-back",
    Belly: "meas-chk-belly",
    "Sway Back": "meas-chk-sway-back",
    Gents: "meas-chk-male",
    Ladies: "meas-chk-female",
    "Low Leg": "meas-chk-low-leg",
    "Left Side Lower": "meas-chk-left-lower",
    "หลังปิด (X) (Closed Back)": "meas-chk-closed-back",
    "ผ่ากลาง (T) ① (Center Pleat)": "meas-chk-center-pleat",
    "ผ่าข้าง (TT) ② (Side Pleats)": "meas-chk-side-pleats",
  };
  const PANT_MEAS = {
    Waist: "meas-pant-waist",
    Hips: "meas-pant-hips",
    Crotch: "meas-pant-crotch",
    Thighs: "meas-pant-thighs",
    Knee: "meas-pant-knee",
    Bottom: "meas-pant-bottom",
    Length: "meas-pant-length",
    Shorts: "meas-pant-shorts",
    Stomach: "meas-pant-stomach",
    "Skirt Length": "meas-pant-skirt-length",
  };
  const PANT_TRAITS = {
    "Flat Seat": "meas-pant-chk-flat-seat",
    "Prominent Seat": "meas-pant-chk-prominent-seat",
    "Front Low": "meas-pant-chk-front-low",
    Gents: "meas-pant-chk-male",
    Ladies: "meas-pant-chk-female",
    "Prominent Front Thigh": "meas-pant-chk-front-thigh",
  };
  const SHIRT_MEAS = {
    Length: "meas-shirt-length",
    Chest: "meas-shirt-chest",
    Waist: "meas-shirt-waist",
    Hips: "meas-shirt-hips",
    Shoulder: "meas-shirt-shoulder",
    Sleeves: "meas-shirt-sleeves",
    Neck: "meas-shirt-neck",
    Cuffs: "meas-shirt-cuffs",
    "Front Length": "meas-shirt-front-length",
    "Back Length": "meas-shirt-back-length",
    "Bust Height": "meas-shirt-bust-height",
    "Bust Width": "meas-shirt-bust-width",
    Front: "meas-shirt-front",
    Back: "meas-shirt-back",
    "Skirt Length": "meas-shirt-skirt-length",
    Arm: "meas-shirt-arm",
  };
  const SHIRT_TRAITS = {
    "ไหล่เท (Sloping Shoulders)": "meas-shirt-chk-sloping-shoulder",
    "มีพุง (Protruding Belly / Stomach)": "meas-shirt-chk-belly",
    "หลังค่อม (Hunched Back)": "meas-shirt-chk-hunched-back",
    "Gents (ผู้ชาย)": "meas-shirt-chk-male",
    "Ladies (ผู้หญิง)": "meas-shirt-chk-female",
    "แหลม (F) (Point Collar)": "meas-shirt-chk-pointed",
    "ป้าน (I) (Semi-Spread Collar)": "meas-shirt-chk-square",
    "ป้าน (180) (Wide Spread Collar (180°))": "meas-shirt-chk-wide-square",
    "คุมบนปก (Top Collar Stitching)": "meas-shirt-chk-collar-roll",
    "คุมใต้ปก (Under Collar Stitching)": "meas-shirt-chk-lapel-gorge",
    "คาร์ท (Back Pleat)": "meas-shirt-chk-back-pleat",
    "หลังเรียบ (X) (Plain Back / No Pleat)": "meas-shirt-chk-plain-back",
    "จีบกลาง (TT) (Center Pleat)": "meas-shirt-chk-center-pleat",
    "จีบข้าง (TT) (Side Pleats)": "meas-shirt-chk-side-pleats",
  };

  function ensureFabricOption(selectId, line) {
    const sel = document.getElementById(selectId);
    if (!sel || !line.FabricID) return;
    if (![...sel.options].some((o) => o.value === String(line.FabricID))) {
      const fab = fabricCache.find((f) => f.FabricID === line.FabricID);
      const label = fab
        ? `${fab.Name}${fab.Code ? " - " + fab.Code : ""}  (Stock: ${fab.Count} ${fab.Unit || ""})`
        : `Fabric #${line.FabricID}`;
      const opt = document.createElement("option");
      opt.value = String(line.FabricID);
      opt.textContent = label;
      sel.appendChild(opt);
    }
  }

  function editLine(idx) {
    const line = orderLines[idx];
    if (!line) return;
    editingLineIdx = idx;
    selectedCat = { CategoryID: line.CategoryID, Name: line.CategoryName };
    selectedSub = {
      SubcatID: line.SubcatID,
      Name: line.SubcatName,
      Image: line.SubcatImage || "",
      CategoryID: line.CategoryID,
    };

    const summary = document.getElementById("order-selected-summary");
    if (summary) {
      const imgHtml = line.SubcatImage
        ? `<img src="${line.SubcatImage}" alt="${sanitize(line.SubcatName)}" class="picker-summary-img" />`
        : `<span class="picker-summary-noimg">🧵</span>`;
      summary.innerHTML = `
        ${imgHtml}
        <div>
          <div class="picker-summary-cat">${sanitize(line.CategoryName)}</div>
          <div class="picker-summary-sub">${sanitize(line.SubcatName)}</div>
        </div>`;
    }

    const parsed = parseCustomDesc(line.CustomDesc);
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v == null ? "" : v;
    };
    const setChk = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!v;
    };

    if (line.CategoryName === "Jacket & Vest") {
      populateFabricDropdown("meas");
      ensureFabricOption("meas-fabric", line);
      document.getElementById("meas-cat-sub-name").textContent =
        `${line.CategoryName} — ${line.SubcatName}`;
      const wrap = document.getElementById("meas-sub-image-wrap");
      wrap.innerHTML = line.SubcatImage
        ? `<img src="${line.SubcatImage}" alt="${sanitize(line.SubcatName)}" style="width: 220px; height: 220px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />`
        : `<div style="display: flex; width: 220px; height: 220px; border-radius: 6px; background: linear-gradient(135deg, var(--gold-dark), var(--gold)); color: #fff; align-items: center; justify-content: center; font-size: 56px; font-weight: bold; border: 1px solid var(--border);">🧵</div>`;

      Object.values(JACKET_TRAITS).forEach((id) => setChk(id, false));
      Object.values(JACKET_MEAS).forEach((id) => setVal(id, ""));
      setVal("meas-description", parsed.description);
      setVal("meas-color", parsed.color);
      for (const [k, v] of Object.entries(parsed.meas)) {
        const id = JACKET_MEAS[k];
        if (id) setVal(id, v);
      }
      for (const t of parsed.traits) {
        const id = JACKET_TRAITS[t];
        if (id) setChk(id, true);
      }
      setVal("meas-qty", line.Quantity);
      setVal("meas-unit-price", line.UnitPrice);
      setVal("meas-tailor-fees", line.TailorFees || "");
      if (line.FabricID) {
        setVal("meas-fabric", String(line.FabricID));
        _pickFabric("meas");
        setVal("meas-use-count", line.UseCount || "");
      } else {
        setVal("meas-fabric", "");
      }
      Modal.open("modal-measurements");
    } else if (line.CategoryName === "Trousers & Skirt") {
      populateFabricDropdown("meas-pant");
      ensureFabricOption("meas-pant-fabric", line);
      document.getElementById("meas-pant-cat-sub-name").textContent =
        `${line.CategoryName} — ${line.SubcatName}`;
      const wrap = document.getElementById("meas-pant-sub-image-wrap");
      wrap.innerHTML = line.SubcatImage
        ? `<img src="${line.SubcatImage}" alt="${sanitize(line.SubcatName)}" style="width: 220px; height: 220px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />`
        : `<div style="display: flex; width: 220px; height: 220px; border-radius: 6px; background: linear-gradient(135deg, var(--gold-dark), var(--gold)); color: #fff; align-items: center; justify-content: center; font-size: 56px; font-weight: bold; border: 1px solid var(--border);">🧵</div>`;

      Object.values(PANT_TRAITS).forEach((id) => setChk(id, false));
      Object.values(PANT_MEAS).forEach((id) => setVal(id, ""));
      setVal("meas-pant-description", parsed.description);
      setVal("meas-pant-color", parsed.color);
      for (const [k, v] of Object.entries(parsed.meas)) {
        const id = PANT_MEAS[k];
        if (id) setVal(id, v);
      }
      for (const t of parsed.traits) {
        const id = PANT_TRAITS[t];
        if (id) setChk(id, true);
      }
      setVal("meas-pant-qty", line.Quantity);
      setVal("meas-pant-unit-price", line.UnitPrice);
      setVal("meas-pant-tailor-fees", line.TailorFees || "");
      if (line.FabricID) {
        setVal("meas-pant-fabric", String(line.FabricID));
        _pickFabric("meas-pant");
        setVal("meas-pant-use-count", line.UseCount || "");
      } else {
        setVal("meas-pant-fabric", "");
      }
      Modal.open("modal-meas-pant");
    } else if (line.CategoryName === "Shirt & Dress") {
      populateFabricDropdown("meas-shirt");
      ensureFabricOption("meas-shirt-fabric", line);
      document.getElementById("meas-shirt-cat-sub-name").textContent =
        `${line.CategoryName} — ${line.SubcatName}`;
      const wrap = document.getElementById("meas-shirt-sub-image-wrap");
      wrap.innerHTML = line.SubcatImage
        ? `<img src="${line.SubcatImage}" alt="${sanitize(line.SubcatName)}" style="width: 220px; height: 220px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />`
        : `<div style="display: flex; width: 220px; height: 220px; border-radius: 6px; background: linear-gradient(135deg, var(--gold-dark), var(--gold)); color: #fff; align-items: center; justify-content: center; font-size: 56px; font-weight: bold; border: 1px solid var(--border);">🧵</div>`;

      Object.values(SHIRT_TRAITS).forEach((id) => setChk(id, false));
      Object.values(SHIRT_MEAS).forEach((id) => setVal(id, ""));
      setVal("meas-shirt-description", parsed.description);
      setVal("meas-shirt-color", parsed.color);
      for (const [k, v] of Object.entries(parsed.meas)) {
        const id = SHIRT_MEAS[k];
        if (id) setVal(id, v);
      }
      for (const t of parsed.traits) {
        const id = SHIRT_TRAITS[t];
        if (id) setChk(id, true);
      }
      setVal("meas-shirt-qty", line.Quantity);
      setVal("meas-shirt-unit-price", line.UnitPrice);
      setVal("meas-shirt-tailor-fees", line.TailorFees || "");
      if (line.FabricID) {
        setVal("meas-shirt-fabric", String(line.FabricID));
        _pickFabric("meas-shirt");
        setVal("meas-shirt-use-count", line.UseCount || "");
      } else {
        setVal("meas-shirt-fabric", "");
      }
      Modal.open("modal-meas-shirt");
    } else {
      Toast.warning("Editing this item type is not supported yet.");
      editingLineIdx = null;
    }
  }

  function updateOrderTotal() {
    const total = orderLines.reduce((s, l) => s + l.LineTotal, 0);
    document.getElementById("order-grand-total").textContent =
      fmtCurrency(total);
    document.getElementById("order-line-count").textContent = orderLines.length;
    updateRemainingBalance();
  }

  function updateRemainingBalance() {
    const total = orderLines.reduce((s, l) => s + l.LineTotal, 0);
    const deposit =
      parseFloat(document.getElementById("order-deposit").value) || 0;
    const discount =
      parseFloat(document.getElementById("order-discount").value) || 0;
    const remaining = Math.max(0, total - deposit - discount);
    document.getElementById("order-remaining-balance").textContent =
      fmtCurrency(remaining);

    // Card transaction fee (3.5%) row handling
    const pmRadio = document.querySelector(
      'input[name="order-payment-method"]:checked',
    );
    const isCard = pmRadio && pmRadio.value === "Card";
    const feeRow = document.getElementById("order-fee-row");

    if (isCard) {
      const fee = +(total * 0.035).toFixed(2);
      document.getElementById("order-transaction-fee").textContent =
        fmtCurrency(fee);
      if (feeRow) feeRow.style.display = "flex";
    } else {
      if (feeRow) feeRow.style.display = "none";
    }
  }

  async function saveOrder() {
    const custId = parseInt(
      document.getElementById("customer-id-hidden").value,
    );
    const orderDate = document.getElementById("order-date").value;

    if (!custId) {
      Toast.warning("Please select a Customer.");
      return;
    }
    if (!orderDate) {
      Toast.warning("Please enter an Order Date.");
      return;
    }
    if (orderLines.length === 0) {
      Toast.warning("Add at least one item.");
      return;
    }

    // Validate the user-entered Order ID (new orders only)
    let enteredOrderId = null;
    if (!editingOrderId) {
      const idInput = document.getElementById("order-id-input");
      const idRaw = idInput.value.trim();
      if (!idRaw) {
        setOrderIdError("Order ID is required.");
        Toast.warning("Please enter an Order ID.");
        return;
      }
      if (!/^\d+$/.test(idRaw)) {
        setOrderIdError("Order ID must contain digits only (e.g. 0033).");
        Toast.warning("Order ID must contain digits only (e.g. 0033).");
        return;
      }
      enteredOrderId = parseInt(idRaw, 10);
      if (enteredOrderId <= 0) {
        setOrderIdError("Order ID must be greater than 0000.");
        Toast.warning("Order ID must be greater than 0000.");
        return;
      }
      idInput.value = fmtOrderId(enteredOrderId);
      try {
        const existingOrders = await DB.orders.getAll();
        if (existingOrders.some((o) => o.OrderID === enteredOrderId)) {
          setOrderIdError(
            `Order ${fmtOrderId(enteredOrderId)} already exists.`,
          );
          Toast.error(
            `Order ID ${fmtOrderId(enteredOrderId)} already exists. Please use a different one.`,
          );
          return;
        }
      } catch (err) {
        Toast.error("Could not verify Order ID: " + err.message);
        return;
      }
      setOrderIdError("");
    }

    const totalAmount = orderLines.reduce((s, l) => s + l.LineTotal, 0);
    const user = Auth.currentUser();
    const paymentMethod =
      document.querySelector('input[name="order-payment-method"]:checked')
        ?.value || "Cash";
    const deposit = +(
      parseFloat(document.getElementById("order-deposit").value) || 0
    ).toFixed(2);
    const discount = +(
      parseFloat(document.getElementById("order-discount").value) || 0
    ).toFixed(2);
    const remainingBalance = +Math.max(
      0,
      totalAmount - deposit - discount,
    ).toFixed(2);
    const transactionFee =
      paymentMethod === "Card" ? +(totalAmount * 0.035).toFixed(2) : 0;

    try {
      let orderId;
      if (editingOrderId) {
        const existing = await DB.orders.get(editingOrderId);
        await DB.orders.put({
          ...existing,
          CustomerID: custId,
          OrderDate: orderDate,
          TotalAmount: +totalAmount.toFixed(2),
          PaymentMethod: paymentMethod,
          Deposit: deposit,
          Discount: discount,
          RemainingBalance: remainingBalance,
          TransactionFee: transactionFee,
        });
        await DB.orderlines.deleteByOrder(editingOrderId);
        orderId = editingOrderId;
      } else {
        orderId = await DB.orders.add({
          OrderID: enteredOrderId,
          CustomerID: custId,
          UserID: user.UserID,
          OrderDate: orderDate,
          TotalAmount: +totalAmount.toFixed(2),
          PaymentMethod: paymentMethod,
          Deposit: deposit,
          Discount: discount,
          RemainingBalance: remainingBalance,
          TransactionFee: transactionFee,
        });
      }

      for (const l of orderLines) {
        await DB.orderlines.add({
          OrderID: orderId,
          ItemID: null,
          CategoryID: l.CategoryID,
          SubcatID: l.SubcatID,
          Description: l.CustomDesc || `${l.CategoryName} – ${l.SubcatName}`,
          Quantity: l.Quantity,
          UnitPrice: l.UnitPrice,
          LineTotal: l.LineTotal,
          FabricID: l.FabricID || null,
          UseCount: l.UseCount == null ? null : l.UseCount,
          FabricUnit: l.FabricUnit || null,
          TailorFees: l.TailorFees || 0,
        });
      }

      await audit(
        editingOrderId ? "UpdateOrder" : "CreateOrder",
        `Order ${fmtOrderId(orderId)} for customer ${custId}, total ${fmtCurrency(totalAmount)}`,
      );

      Toast.success(
        editingOrderId
          ? `Order ${fmtOrderId(orderId)} updated!`
          : `Order ${fmtOrderId(orderId)} saved!`,
      );
      resetOrderForm();
      if (typeof DashboardPage !== "undefined") DashboardPage.refresh();
    } catch (err) {
      if (/already exists/i.test(err.message)) setOrderIdError(err.message);
      Toast.error("Failed to save order: " + err.message);
    }
  }

  async function resetOrderForm() {
    selectedCustomer = null;
    orderLines = [];
    editingOrderId = null;
    selectedCat = null;
    selectedSub = null;

    if (acInstance) acInstance.reset();
    document.getElementById("customer-id-hidden").value = "";
    document.getElementById("order-date").value = todayStr();
    document.getElementById("item-qty").value = "1";
    document.getElementById("item-unit-price").value = "";
    document.getElementById("order-deposit").value = "";
    document.getElementById("order-discount").value = "";
    document.getElementById("order-remaining-balance").textContent = "THB 0.00";
    const cashRadio = document.getElementById("payment-cash");
    if (cashRadio) cashRadio.checked = true;

    showStep("cat");
    renderOrderLines();
    updateOrderTotal();
    await refreshNextOrderId();
    Toast.info("Order form cleared.");
  }

  // Load order into the edit form
  async function loadOrderForEdit(orderId) {
    await AppShell.navigate("order-entry", true);
    await loadFabricCache();

    const order = await DB.orders.get(orderId);
    const lines = await DB.orderlines.getByOrder(orderId);
    const cust = await DB.customers.get(order.CustomerID);

    editingOrderId = orderId;
    selectedCustomer = cust;

    document.getElementById("customer-search").value = cust.Name;
    document.getElementById("customer-id-hidden").value = cust.CustomerID;
    document.getElementById("order-date").value = order.OrderDate;

    // Restore payment fields
    const paymentVal =
      order.PaymentMethod === "Credit" ? "Card" : order.PaymentMethod || "Cash";
    const pmRadio = document.querySelector(
      `input[name="order-payment-method"][value="${paymentVal}"]`,
    );
    if (pmRadio) pmRadio.checked = true;
    document.getElementById("order-deposit").value = order.Deposit || "";
    document.getElementById("order-discount").value = order.Discount || "";

    orderLines = [];
    for (const l of lines) {
      // Support both new-style (CategoryID/SubcatID) and old-style (ItemID) lines
      let catName = "—",
        subcatName = "—",
        subImage = "";
      let catId = l.CategoryID,
        subcatId = l.SubcatID;

      if (catId && subcatId) {
        const cat = pickerCats.find((c) => c.CategoryID === catId);
        const subcat = pickerSubs.find((s) => s.SubcatID === subcatId);
        catName = cat?.Name || l.Description?.split(" – ")[0] || "—";
        subcatName = subcat?.Name || l.Description?.split(" – ")[1] || "—";
        subImage = subcat?.Image || "";
      } else if (l.Description) {
        const parts = l.Description.split(" – ");
        catName = parts[0] || "—";
        subcatName = parts[1] || "—";
      } else if (l.ItemID) {
        // Legacy item-based line
        const item = await DB.items.get(l.ItemID);
        const cat = item ? await DB.categories.get(item.CategoryID) : null;
        const subcat = item ? await DB.subcategories.get(item.SubcatID) : null;
        catName = cat?.Name || "—";
        subcatName = subcat?.Name || "—";
        subImage = subcat?.Image || "";
        catId = item?.CategoryID;
        subcatId = item?.SubcatID;
      }

      orderLines.push({
        tempId: l.LineID,
        CategoryID: catId,
        SubcatID: subcatId,
        CategoryName: catName,
        SubcatName: subcatName,
        SubcatImage: subImage,
        Quantity: l.Quantity,
        UnitPrice: l.UnitPrice,
        LineTotal: l.LineTotal,
        CustomDesc: l.Description,
        FabricID: l.FabricID || null,
        UseCount: l.UseCount || null,
        FabricUnit: l.FabricUnit || null,
        TailorFees: l.TailorFees || 0,
      });
    }

    renderOrderLines();
    updateOrderTotal();
    await refreshNextOrderId();
    Toast.info(`Editing Order ${fmtOrderId(orderId)}`);
  }

  // ── Inline new-customer form ───────────────────────────────────
  function clearCustomerForm() {
    ["cust-name", "cust-phone", "cust-email", "cust-address"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    document.getElementById("cust-id-hidden").value = "";
    document.getElementById("cust-image-file").value = "";
    document.getElementById("cust-image-url").value = "";
    document.getElementById("cust-image-filename").textContent =
      "No photo chosen";
    document.getElementById("cust-image-preview").src = "";
    document.getElementById("cust-image-preview-wrap").style.display = "none";
    clearValidation(document.getElementById("customer-form"));
  }

  async function saveCustomerInline() {
    const nameEl = document.getElementById("cust-name");
    if (!validateFields([{ el: nameEl, msg: "Customer name is required." }]))
      return;

    const data = {
      Name: nameEl.value.trim(),
      Phone: document.getElementById("cust-phone").value.trim(),
      Email: document.getElementById("cust-email").value.trim(),
      Address: document.getElementById("cust-address").value.trim(),
      Image: document.getElementById("cust-image-url").value || null,
    };

    try {
      const id = await DB.customers.add(data);
      data.CustomerID = id;
      selectedCustomer = data;
      document.getElementById("customer-search").value = data.Name;
      document.getElementById("customer-id-hidden").value = id;
      Modal.close("modal-customer");
      Toast.success(`Customer "${data.Name}" created!`);
      await audit("CreateCustomer", `New customer: ${data.Name}`);
    } catch (err) {
      Toast.error("Failed to save customer: " + err.message);
    }
  }

  // ── Print receipt ──────────────────────────────────────────────
  async function printReceipt(orderId) {
    let printOrderLines, printCustomer, printTotal, printDate, printOrderId;
    let printPaymentMethod, printDeposit, printDiscount, printRemainingBalance;

    if (orderId) {
      const order = await DB.orders.get(orderId);
      printOrderLines = await DB.orderlines.getByOrder(orderId);
      printCustomer = await DB.customers.get(order.CustomerID);
      printTotal = order.TotalAmount;
      printDate = order.OrderDate;
      printOrderId = order.OrderID;
      printPaymentMethod =
        order.PaymentMethod === "Credit"
          ? "Card"
          : order.PaymentMethod || "Cash";
      printDeposit = order.Deposit || 0;
      printDiscount = order.Discount || 0;
      printRemainingBalance =
        order.RemainingBalance != null
          ? order.RemainingBalance
          : Math.max(0, printTotal - printDeposit - printDiscount);
    } else {
      return;
    }

    if (printOrderLines.length === 0) {
      Toast.warning("No items in order.");
      return;
    }

    const receiptHtml = `<!DOCTYPE html><html><head>
    <title></title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      /* Keep page margins at zero so browser print metadata can be suppressed. */
      @page { size: A4; margin: 0; }
      body { font-family: 'Inter', sans-serif; color: #111; line-height: 1.6; margin: 0; font-size: 14px; -webkit-print-color-adjust: exact; }
      .receipt-page { padding: 20mm; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 20px; margin-bottom: 30px; }
      .brand { font-size: 28px; font-weight: 800; letter-spacing: 1.5px; margin: 0; line-height: 1; }
      .sub-brand { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 2px; margin-top: 6px; }
      .invoice-title { font-size: 24px; font-weight: 700; color: #111; margin: 0 0 5px 0; text-align: right; text-transform: uppercase; letter-spacing: 1px; }
      .info-section { display: flex; justify-content: space-between; margin-bottom: 40px; }
      .info-block { font-size: 14px; }
      .info-block strong { font-weight: 600; display: block; margin-bottom: 4px; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      th, td { padding: 14px 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
      th { font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600; letter-spacing: 1px; border-bottom: 2px solid #111; }
      .text-right { text-align: right; }
      .item-name { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
      .item-details { color: #555; font-size: 12px; line-height: 1.5; }
      .item-details ul { margin: 4px 0 0; padding-left: 16px; }
      .total-row { font-weight: 700; font-size: 18px; border-top: 2px solid #111; }
      .total-row td { padding-top: 18px; border-bottom: none; }
      .footer { text-align: center; margin-top: 60px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
    </style>
    </head><body><div class="receipt-page">
    <div class="header">
      <div style="display: flex; align-items: center; gap: 15px;">
        <img src="${window.location.origin}/logo.png" style="width: 100px; height: 100px; object-fit: contain;" alt="Logo" />
        <div>
          <h1 class="brand">SIAM BESPOKE</h1>
          <div class="sub-brand">Tailor Shop</div>
        </div>
      </div>
      <div>
        <h2 class="invoice-title">Receipt</h2>
        <div style="text-align: right; color: #666; font-size: 14px;">Order ${fmtOrderId(printOrderId)}</div>
      </div>
    </div>
    
    <div class="info-section">
      <div class="info-block">
        <strong>Bill To</strong>
        <div style="font-size: 16px; font-weight: 600; color: #111;">${sanitize(printCustomer.Name)}</div>
        <div style="color: #555; margin-top: 2px;">${sanitize(printCustomer.Phone || "")}</div>
        <div style="color: #555;">${sanitize(printCustomer.Email || "")}</div>
      </div>
      <div class="info-block" style="text-align: right;">
        <strong>Date</strong>
        <div>${fmtDate(printDate)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right" style="width: 80px;">Qty</th>
          <th class="text-right" style="width: 120px;">Unit Price</th>
          <th class="text-right" style="width: 120px;">Line Total</th>
        </tr>
      </thead>
      <tbody>
    ${printOrderLines
      .map((l) => {
        const rawDesc =
          l.CustomDesc ||
          l.Description ||
          `${l.CategoryName} \u2013 ${l.SubcatName}`;
        const parts = rawDesc.split(" | ");
        const mainName = sanitize(parts[0]);
        let detailsHtml = "";
        if (parts.length > 1) {
          detailsHtml =
            `<div class="item-details"><ul>` +
            parts
              .slice(1)
              .map((p) => `<li>${sanitize(p)}</li>`)
              .join("") +
            `</ul></div>`;
        }
        return `<tr>
          <td>
            <div class="item-name">${mainName}</div>
          
          </td>
          <td class="text-right">${l.Quantity}</td>
          <td class="text-right">${fmtCurrency(l.UnitPrice)}</td>
          <td class="text-right" style="font-weight: 600;">${fmtCurrency(l.LineTotal)}</td>
        </tr>`;
      })
      .join("")}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="3" class="text-right" style="padding-right: 16px;">ORDER TOTAL</td>
          <td class="text-right">${fmtCurrency(printTotal)}</td>
        </tr>
        ${printDeposit > 0 ? `<tr style="font-size:13px;"><td colspan="3" class="text-right" style="padding-right:16px;border-bottom:none;padding-top:8px;">Deposit (${printPaymentMethod})</td><td class="text-right" style="border-bottom:none;padding-top:8px;">${fmtCurrency(printDeposit)}</td></tr>` : ""}
        ${printDiscount > 0 ? `<tr style="font-size:13px;"><td colspan="3" class="text-right" style="padding-right:16px;border-bottom:none;padding-top:4px;">Discount</td><td class="text-right" style="border-bottom:none;padding-top:4px;">${fmtCurrency(printDiscount)}</td></tr>` : ""}
        ${printDeposit > 0 || printDiscount > 0 ? `<tr style="font-weight:700;font-size:16px;border-top:2px solid #111;"><td colspan="3" class="text-right" style="padding-right:16px;padding-top:14px;border-bottom:none;">REMAINING BALANCE</td><td class="text-right" style="padding-top:14px;border-bottom:none;">${fmtCurrency(printRemainingBalance)}</td></tr>` : ""}
      </tfoot>
    </table>
    
    <div class="footer">
      <strong>Thank you for choosing Siam Bespoke!</strong><br>
      Est. 2024 · Quality Tailoring
    </div>
    </div></body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    iframe.contentWindow.document.write(receiptHtml);
    iframe.contentWindow.document.close();
    iframe.contentWindow.document.title = "";

    // Give fonts a moment to load before triggering print
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 250);
  }

  // ══════════════════════════════════════════════════════════════
  // ORDER HISTORY
  // ══════════════════════════════════════════════════════════════

  function bindHistory() {
    document.getElementById("history-search").addEventListener("input", () => {
      historyPage = 1;
      renderHistory();
    });
    document
      .getElementById("history-filter-date")
      .addEventListener("change", () => {
        historyPage = 1;
        renderHistory();
      });
  }

  async function loadHistory() {
    allOrders = await DB.orders.getAll();
    allOrders.sort((a, b) => {
      const aStamp = a.CreatedAt || `${a.OrderDate}T00:00:00+07:00`;
      const bStamp = b.CreatedAt || `${b.OrderDate}T00:00:00+07:00`;
      return new Date(bStamp) - new Date(aStamp);
    });
    historyPage = 1;
    renderHistory();
  }

  async function renderHistory() {
    const q = (
      document.getElementById("history-search").value || ""
    ).toLowerCase();
    const date = document.getElementById("history-filter-date").value;

    const customers = await DB.customers.getAll();
    const custMap = Object.fromEntries(customers.map((c) => [c.CustomerID, c]));
    const orderLines = await DB.orderlines.getAll();
    const categories = await DB.categories.getAll();
    const subcategories = await DB.subcategories.getAll();
    const catMap = Object.fromEntries(
      categories.map((c) => [c.CategoryID, c.Name]),
    );
    const subMap = Object.fromEntries(
      subcategories.map((s) => [s.SubcatID, s.Name]),
    );

    const linesByOrder = {};
    for (const l of orderLines) {
      if (!linesByOrder[l.OrderID]) linesByOrder[l.OrderID] = [];
      linesByOrder[l.OrderID].push(l);
    }

    let filtered = allOrders.filter((o) => {
      const cust = custMap[o.CustomerID];
      const [yy, mm, dd] = (o.OrderDate || "").split("-");
      const dmy = dd && mm && yy ? `${dd}/${mm}/${yy}` : "";
      const searchMatch =
        !q ||
        (cust?.Name || "").toLowerCase().includes(q) ||
        (cust?.Phone || "").toLowerCase().includes(q) ||
        (cust?.Address || "").toLowerCase().includes(q) ||
        String(o.OrderID).includes(q) ||
        fmtOrderId(o.OrderID).toLowerCase().includes(q) ||
        (o.OrderDate || "").toLowerCase().includes(q) ||
        dmy.includes(q);
      const dateMatch = !date || o.OrderDate === date;
      return searchMatch && dateMatch;
    });

    const total = filtered.length;
    const start = (historyPage - 1) * PER_PAGE;
    const paged = filtered.slice(start, start + PER_PAGE);

    const tbody = document.getElementById("history-tbody");
    if (paged.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">
        <div class="empty-icon">📋</div>No orders found.</td></tr>`;
    } else {
      tbody.innerHTML = paged
        .map((o) => {
          const cust = custMap[o.CustomerID];
          const lines = linesByOrder[o.OrderID] || [];
          const itemsCount = lines.reduce(
            (sum, l) => sum + (l.Quantity || 1),
            0,
          );

          let itemsLabel = "—";
          if (lines.length > 0) {
            const parts = lines.slice(0, 2).map((l) => {
              const cName =
                catMap[l.CategoryID] ||
                (l.Description || "").split(" | ")[0] ||
                "Item";
              const qty = l.Quantity || 1;
              return `${qty}x ${sanitize(cName)}`;
            });
            itemsLabel = parts.join(", ");
            if (lines.length > 2) itemsLabel += `, +${lines.length - 2} more`;
          }

          const stamp = o.CreatedAt || `${o.OrderDate}T00:00:00+07:00`;
          const dt = new Date(stamp);
          const bkkParts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Bangkok",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
            .formatToParts(dt)
            .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
          const dateTimeStr = `${bkkParts.day}/${bkkParts.month}/${bkkParts.year} ${bkkParts.hour}:${bkkParts.minute}`;

          return `<tr>
          <td class="font-mono" style="color: var(--text-primary)">${fmtOrderId(o.OrderID)}</td>
          <td>${dateTimeStr}</td>
          <td><strong>${sanitize(cust?.Name || "Unknown")}</strong><br>
              <small class="text-muted">${sanitize(cust?.Phone || "No phone")}</small><br>
              <small class="text-muted">${sanitize(cust?.Address || "No address")}</small></td>
          <td class="text-muted"><strong>${itemsCount} item${itemsCount !== 1 ? "s" : ""}</strong><br>
              <small class="text-muted">${itemsLabel}</small></td>
          <td class="text-right font-mono font-bold" style="color: var(--text-primary)">${fmtCurrency(o.TotalAmount)}</td>
          <td class="text-right">
            <button class="btn btn-ghost btn-sm" onclick="OrdersPage.viewOrder(${o.OrderID})">👁 View</button>
            <button class="btn btn-ghost btn-sm" onclick="OrdersPage.printReceipt(${o.OrderID})">🖨 Print</button>
            ${Auth.isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="OrdersPage.deleteOrder(${o.OrderID})">🗑</button>` : ""}
          </td>
        </tr>`;
        })
        .join("");
    }

    const pgEl = document.getElementById("history-pagination");
    renderPagination(pgEl, total, PER_PAGE, historyPage, (p) => {
      historyPage = p;
      renderHistory();
    });

    document.getElementById("history-total-count").textContent = total;
    const totalRev = filtered.reduce((s, o) => s + (o.TotalAmount || 0), 0);
    document.getElementById("history-total-revenue").textContent =
      fmtCurrency(totalRev);
  }

  let viewingOrder = null;
  let viewingLines = [];

  async function viewOrder(orderId) {
    await loadFabricCache();
    const order = await DB.orders.get(orderId);
    const lines = await DB.orderlines.getByOrder(orderId);
    const cust = await DB.customers.get(order.CustomerID);
    viewingOrder = order;
    viewingLines = lines;

    let linesHtml = "";
    let total = 0;
    let totalTailorFees = 0;
    const allSubcats = await DB.subcategories.getAll().catch(() => []);
    const subcatMap = Object.fromEntries(
      allSubcats.map((s) => [s.SubcatID, s]),
    );
    for (const l of lines) {
      let desc = l.Description;
      if (!desc) {
        if (l.ItemID) {
          const item = await DB.items.get(l.ItemID).catch(() => null);
          desc = item?.Name || "Unknown Item";
        } else {
          desc = "—";
        }
      }

      // Build fabric info row (from DB fields, not parsed from Description)
      let fabricHtml = "";
      if (l.FabricID) {
        const fab = fabricCache.find((f) => f.FabricID === l.FabricID);
        const fabName = fab ? fab.Name : "Unknown";
        const fabCode = fab && fab.Code ? ` (${fab.Code})` : "";
        fabricHtml = `<div style="margin-top:6px;padding:4px 8px;background:var(--bg-input,#2a2a2a);border-radius:4px;font-size:12px;color:var(--text-secondary);">🧶 Fabric: <strong style="color:var(--gold-light)">${sanitize(fabName)}${sanitize(fabCode)}</strong>`;
        if (l.UseCount && l.UseCount > 0) {
          fabricHtml += ` &nbsp;|&nbsp; Used: <strong style="color:var(--gold-light)">${l.UseCount} ${sanitize(l.FabricUnit || "")}</strong>`;
        }
        fabricHtml += `</div>`;
      }

      const lineTailorFees = Number(l.TailorFees) || 0;
      const tailorFeesHtml = `<div style="margin-top:6px;padding:4px 8px;background:var(--bg-input,#2a2a2a);border-radius:4px;font-size:12px;color:var(--text-secondary);">✂️ Tailor Fees: <strong style="color:var(--gold-light)">${fmtCurrency(lineTailorFees)}</strong></div>`;
      totalTailorFees += lineTailorFees;

      let parts = (desc || "").split(" | ");
      let formattedDesc = `<strong>${sanitize(parts[0])}</strong>`;
      if (parts.length > 1) {
        formattedDesc += `<ul style="margin:6px 0 0 16px; padding-left: 10px; color: var(--text-secondary); font-size: 14px; line-height: 1.5;">`;
        for (let i = 1; i < parts.length; i++) {
          // Skip fabric info in Description since we show it separately via DB fields
          const p = parts[i];
          if (p.startsWith("Fabric: ") || p.startsWith("Fabric Used: "))
            continue;
          formattedDesc += `<li style="margin-bottom: 4px;">${sanitize(p)}</li>`;
        }
        formattedDesc += `</ul>`;
      }
      formattedDesc += fabricHtml;
      formattedDesc += tailorFeesHtml;

      const subImg = l.SubcatID ? subcatMap[l.SubcatID]?.Image : "";
      const subImgHtml = subImg
        ? `<img src="${subImg}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0;" />`
        : `<div style="display:flex;width:64px;height:64px;border-radius:6px;background:linear-gradient(135deg, var(--gold-dark), var(--gold));color:#fff;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;">🧵</div>`;

      linesHtml += `<tr>
        <td style="vertical-align: top; padding-top: 14px;">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            ${subImgHtml}
            <div style="flex:1;min-width:0;">${formattedDesc}</div>
          </div>
        </td>
        <td class="text-right" style="vertical-align: top; padding-top: 14px;">${l.Quantity}</td>
        <td class="text-right" style="vertical-align: top; padding-top: 14px;">${fmtCurrency(l.UnitPrice)}</td>
        <td class="text-right font-bold text-gold" style="vertical-align: top; padding-top: 14px; color: var(--text-primary);">${fmtCurrency(l.LineTotal)}</td>
      </tr>`;
      total += l.LineTotal;
    }

    const deposit = order.Deposit || 0;
    const discount = order.Discount || 0;
    const transactionFee = order.TransactionFee || 0;
    const remaining =
      order.RemainingBalance != null
        ? order.RemainingBalance
        : Math.max(0, total - deposit - discount);
    const paymentMethod =
      order.PaymentMethod === "Credit" ? "Card" : order.PaymentMethod || "Cash";
    const showCardFee = transactionFee > 0 || paymentMethod === "Card";

    document.getElementById("view-order-content").innerHTML = `
      <div class="grid-2 mb-3" style="background: var(--bg-panel); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border);">
        <div style="display:flex;gap:14px;align-items:flex-start;">
          ${
            cust?.Image
              ? `<img src="${cust.Image}" alt="${sanitize(cust?.Name || "")}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);flex-shrink:0;" />`
              : `<div style="display:flex;width:80px;height:80px;border-radius:8px;background:linear-gradient(135deg, var(--gold-dark), var(--gold));color:#fff;align-items:center;justify-content:center;font-size:32px;flex-shrink:0;">👤</div>`
          }
          <div>
            <div class="text-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Customer Info</div>
            <div class="font-bold" style="font-size:14px;">Name: ${sanitize(cust?.Name || "—")}</div>
            <div class="font-bold" style="font-size:14px;margin-top:2px;">Phone: ${sanitize(cust?.Phone || "No phone")} </div>
            <div class="font-bold" style="font-size:14px;margin-top:2px;">Email: ${sanitize(cust?.Email || "No email")}</div>
            <div class="font-bold" style="font-size:14px;margin-top:2px;">Address: ${sanitize(cust?.Address || "No address")}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div class="font-bold" style="font-size:20px;">${fmtOrderId(order.OrderID)}</div>
          <div class="text-secondary" style="font-size:14px;margin-top:2px;">${fmtDate(order.OrderDate)}</div>
        </div>
      </div>
      <div class="order-table-wrap" style="box-shadow: var(--shadow-sm);">
        <table class="data-table">
          <thead><tr><th>Description</th><th class="text-right">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Line Total</th></tr></thead>
          <tbody>${linesHtml}</tbody>
        </table>
      </div>
      <div style="margin-top: 16px; background: var(--bg-panel); border-radius: var(--radius-md); border: 1px solid var(--border); overflow: hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border);">
          <div style="font-size:16px;font-weight:bold;">ORDER TOTAL</div>
          <div style="font-size:22px;font-weight:bold;">${fmtCurrency(total)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;color:var(--text-secondary);">Payment Method</div>
          <div style="font-size:13px;font-weight:600;">${sanitize(paymentMethod)}</div>
        </div>
        ${
          showCardFee
            ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;color:var(--text-secondary);">Card Fee (3.5%)</div>
          <div style="font-size:13px;font-weight:600;color:var(--accent-red);">${fmtCurrency(transactionFee)}</div>
        </div>`
            : ""
        }
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;color:var(--text-secondary);">Total Tailor Fees</div>
          <div style="font-size:13px;font-weight:600;">${fmtCurrency(totalTailorFees)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;color:var(--text-secondary);">Paid Amount</div>
          <div style="font-size:13px;font-weight:600;">${fmtCurrency(deposit)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;color:var(--text-secondary);">Discount</div>
          <div style="font-size:13px;font-weight:600;">${fmtCurrency(discount)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--bg-surface);">
          <div style="font-size:15px;font-weight:bold;">REMAINING BALANCE</div>
          <div style="font-size:20px;font-weight:bold;color:var(--gold-light);">${fmtCurrency(remaining)}</div>
        </div>
      </div>`;
    Modal.open("modal-view-order");
  }

  async function editFromView(orderId) {
    Modal.close("modal-view-order");
    await loadOrderForEdit(orderId);
  }

  async function editFromViewCurrent() {
    if (!viewingOrder) return;
    await editFromView(viewingOrder.OrderID);
  }

  const THAI = {
    // Sections
    Color: "สี",
    Meas: "ขนาด",
    Traits: "ลักษณะพิเศษ",
    Fabric: "ผ้า",
    Quantity: "จำนวน",
    Date: "วันที่",
    Description: "รายละเอียด",
    // Jacket measurements
    Length: "ยาว",
    Chest: "อก",
    Waist: "เอว",
    Hips: "สะโพก",
    Shoulder: "ไหล่",
    Sleeves: "แขน",
    Front: "บ่าหน้า",
    Back: "บ่าหลัง",
    Neck: "คอ",
    // Pant measurements
    Crotch: "เป้า",
    Thighs: "โคนขา",
    Knee: "เข่า",
    Bottom: "ปลายขา",
    Shorts: "ขาสั้น",
    Stomach: "หน้าท้อง",
    "Skirt Length": "กระโปรงยาว",
    // Shirt measurements
    Cuffs: "ข้อมือ",
    "Front Length": "ยาวหน้า",
    "Back Length": "ยาวหลัง",
    "Bust Height": "อกสูง",
    "Bust Width": "อกห่าง",
    Arm: "วงแขน",
    // Traits
    "Sloping Shoulder": "ไหล่เท",
    "Sloping Shoulders": "ไหล่เท",
    "Hunched Back": "หลังค่อม",
    Belly: "มีพุง",
    "Protruding Belly": "มีพุง",
    "Sway Back": "หลังแอ่น",
    Swayback: "หลังแอ่น",
    "Low Leg": "ขาต่ำ",
    "Left Side Lower": "ซ้ายต่ำ",
    "Right Shoulder Lower": "ขวาต่ำ",
    "Left Shoulder Lower": "ซ้ายต่ำ",
    "Flat Seat": "ก้นแบน",
    "Prominent Seat": "ก้นงอน",
    "Front Low": "หน้าต่ำ",
    "Prominent Front Thigh": "มีหนาบา",
    Gents: "ผู้ชาย",
    Ladies: "ผู้หญิง",
  };

  function bilingual(label) {
    const th = THAI[label];
    return th ? `${th} (${label})` : label;
  }

  function bilingualizeSegment(seg) {
    // Already bilingual (Thai chars mixed in) — leave alone
    if (/[฀-๿]/.test(seg)) return seg;

    const colonIdx = seg.indexOf(":");
    if (colonIdx === -1) {
      return bilingual(seg.trim());
    }
    const head = seg.slice(0, colonIdx).trim();
    const body = seg.slice(colonIdx + 1).trim();

    if (head === "Meas") {
      const items = body
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const idx = p.indexOf(":");
          if (idx === -1) return p;
          const k = p.slice(0, idx).trim();
          const v = p.slice(idx + 1).trim();
          return `${bilingual(k)}: ${v}`;
        });
      return `${items.join(", ")}`;
    }

    if (head === "Traits") {
      const items = body
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => bilingual(p));
      return `${bilingual("Traits")}: ${items.join(", ")}`;
    }

    return `${bilingual(head)}: ${body}`;
  }

  const TRAIT_CATALOG = {
    1: [
      "Sloping Shoulder",
      "Hunched Back",
      "Belly",
      "Sway Back",
      "Low Leg",
      "Left Side Lower",
      "หลังปิด (X) (Closed Back)",
      "ผ่ากลาง (T) ① (Center Pleat)",
      "ผ่าข้าง (TT) ② (Side Pleats)",
    ],
    2: ["Flat Seat", "Prominent Seat", "Front Low", "Prominent Front Thigh"],
    3: [
      "ไหล่เท (Sloping Shoulders)",
      "มีพุง (Protruding Belly / Stomach)",
      "หลังค่อม (Hunched Back)",
      "แหลม (F) (Point Collar)",
      "ป้าน (I) (Semi-Spread Collar)",
      "ป้าน (180) (Wide Spread Collar (180°))",
      "คุมบนปก (Top Collar Stitching)",
      "คุมใต้ปก (Under Collar Stitching)",
      "คาร์ท (Back Pleat)",
      "หลังเรียบ (X) (Plain Back / No Pleat)",
      "จีบกลาง (TT) (Center Pleat)",
      "จีบข้าง (TT) (Side Pleats)",
    ],
  };

  function printDescription() {
    if (!viewingOrder || !viewingLines.length) {
      Toast.warning("No order loaded.");
      return;
    }

    const order = viewingOrder;
    const stamp = order.CreatedAt || `${order.OrderDate}T00:00:00+07:00`;
    const dt = new Date(stamp);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(dt)
      .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
    const dateStr = `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;

    const pageHtml = viewingLines
      .map((l) => {
        const raw = l.Description || l.CustomDesc || "—";
        const allSegs = raw.split(" | ").filter((p) => {
          return !p.startsWith("Fabric: ") && !p.startsWith("Fabric Used: ");
        });
        const title = sanitize(allSegs[0] || "—");

        const traitsSeg = allSegs.slice(1).find((p) => p.startsWith("Traits:"));
        const measSeg = allSegs.slice(1).find((p) => p.startsWith("Meas:"));
        const otherSegs = allSegs
          .slice(1)
          .filter((p) => !p.startsWith("Traits:") && !p.startsWith("Meas:"));

        const detailsList = otherSegs.length
          ? `<ul>${otherSegs
              .map((p) => `<li>${sanitize(bilingualizeSegment(p))}</li>`)
              .join("")}</ul>`
          : "";

        let measHtml = "";
        if (measSeg) {
          const body = measSeg.slice("Meas:".length).trim();
          const items = body
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => {
              const idx = p.indexOf(":");
              if (idx === -1) return { k: p, v: "" };
              return {
                k: p.slice(0, idx).trim(),
                v: p.slice(idx + 1).trim(),
              };
            });
          measHtml = `<div class="meas">
            <div class="meas-label">${sanitize(bilingual("Meas"))}</div>
            <div class="meas-grid">${items
              .map(
                (it) =>
                  `<div class="meas-item"><span class="meas-k">${sanitize(bilingual(it.k))}</span><span class="meas-v">${sanitize(it.v)}</span></div>`,
              )
              .join("")}</div>
          </div>`;
        }

        const checkedTraits = traitsSeg
          ? traitsSeg
              .slice("Traits:".length)
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean)
          : [];
        const checkedSet = new Set(checkedTraits);

        const catalog = TRAIT_CATALOG[l.CategoryID] || [];
        // Preserve any checked items not in the catalog (backwards-compat)
        const extras = checkedTraits.filter(
          (t) =>
            !catalog.includes(t) &&
            t !== "Gents" &&
            t !== "Ladies" &&
            t !== "Gents (ผู้ชาย)" &&
            t !== "Ladies (ผู้หญิง)",
        );
        const fullList = [...catalog, ...extras];

        let genderHtml = "";
        const genders = [
          "Gents",
          "Ladies",
          "Gents (ผู้ชาย)",
          "Ladies (ผู้หญิง)",
        ];
        const genderChecked = checkedTraits.find((t) => genders.includes(t));
        if (genderChecked || l.CategoryID) {
          const gentsChecked =
            genderChecked === "Gents" || genderChecked === "Gents (ผู้ชาย)";
          const ladiesChecked =
            genderChecked === "Ladies" || genderChecked === "Ladies (ผู้หญิง)";
          genderHtml = `<div class="gender-row">
            <span class="lbl">Gender — เพศ</span>
            <span class="gender-opt"><span class="chk">${gentsChecked ? "☑" : "☐"}</span>${sanitize(bilingual("Gents"))}</span>
            <span class="gender-opt"><span class="chk">${ladiesChecked ? "☑" : "☐"}</span>${sanitize(bilingual("Ladies"))}</span>
          </div>`;
        }

        let traitsHtml = "";
        if (fullList.length) {
          traitsHtml = `<div class="traits">
            <div class="traits-label">${sanitize(bilingual("Traits"))}</div>
            ${genderHtml}
            <div class="traits-grid">${fullList
              .map((t) => {
                const isChecked = checkedSet.has(t);
                return `<div class="trait-item"><span class="chk">${isChecked ? "☑" : "☐"}</span><span>${sanitize(bilingual(t))}</span></div>`;
              })
              .join("")}</div>
          </div>`;
        } else if (genderHtml) {
          traitsHtml = `<div class="traits">
            <div class="traits-label">${sanitize(bilingual("Traits"))}</div>
            ${genderHtml}
          </div>`;
        }

        let fabricLine = "";
        if (l.FabricID) {
          const fab = fabricCache.find((f) => f.FabricID === l.FabricID);
          const fabName = fab ? fab.Name : "Unknown";
          const fabCode = fab && fab.Code ? ` (${fab.Code})` : "";
          const used =
            l.UseCount && l.UseCount > 0
              ? ` — Used: ${l.UseCount} ${sanitize(l.FabricUnit || "")}`
              : "";
          fabricLine = `<div class="row"><span class="lbl">${bilingual("Fabric")}</span><span class="val">${sanitize(fabName)}${sanitize(fabCode)}${used}</span></div>`;
        }

        return `<section class="page">
          <div class="header">
            <div class="brand">SIAM BESPOKE</div>
            <div class="order-id">Order ${fmtOrderId(order.OrderID)}</div>
          </div>
          <h1 class="title">${title}</h1>
          ${detailsList ? `<div class="details">${detailsList}</div>` : ""}
          ${measHtml}
          ${traitsHtml}
          <div class="meta">
            ${fabricLine}
            <div class="row"><span class="lbl">${bilingual("Quantity")}</span><span class="val">${l.Quantity}</span></div>
            <div class="row"><span class="lbl">${bilingual("Date")}</span><span class="val">${dateStr}</span></div>
          </div>
        </section>`;
      })
      .join("");

    const html = `<!DOCTYPE html><html><head>
    <title>Order ${fmtOrderId(order.OrderID)} — Descriptions</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { font-family: 'Inter', 'Noto Sans Thai', sans-serif; color: #111; margin: 0; -webkit-print-color-adjust: exact; }
      .page { width: 210mm; min-height: 297mm; padding: 25mm 22mm; page-break-after: always; display: flex; flex-direction: column; }
      .page:last-child { page-break-after: auto; }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 40px; }
      .brand { font-size: 20px; font-weight: 800; letter-spacing: 2px; }
      .order-id { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1.5px; }
      .title { font-size: 34px; font-weight: 800; margin: 0 0 24px 0; line-height: 1.2; color: #111; }
      .details ul { margin: 0 0 32px 0; padding-left: 22px; color: #333; font-size: 16px; line-height: 1.9; }
      .details li { margin-bottom: 6px; }
      .meas { margin: 0 0 32px 0; }
      .meas-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; font-weight: 700; margin-bottom: 12px; }
      .meas-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 32px; }
      .meas-item { display: flex; align-items: baseline; gap: 12px; font-size: 15px; color: #111; }
      .meas-k { flex: 1; font-weight: 500; color: #333; }
      .meas-v { min-width: 70px; font-weight: 700; text-align: right; border-bottom: 2px solid #111; padding: 0 4px 2px 4px; letter-spacing: 0.5px; }
      .traits { margin: 0 0 32px 0; }
      .traits-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; font-weight: 700; margin-bottom: 12px; }
      .traits-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; }
      .trait-item { display: flex; align-items: center; gap: 10px; font-size: 15px; color: #111; font-weight: 500; }
      .trait-item .chk { font-size: 20px; color: #111; line-height: 1; }
      .gender-row { display: flex; align-items: center; gap: 24px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed #ddd; font-size: 15px; }
      .gender-row .lbl { flex: 0 0 auto !important; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 700; font-size: 11px; }
      .gender-opt { display: inline-flex; align-items: center; gap: 8px; color: #111; font-weight: 500; }
      .gender-opt .chk { font-size: 20px; line-height: 1; }
      .meta { margin-top: auto; border-top: 1px solid #ddd; padding-top: 20px; }
      .row { display: flex; padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 15px; }
      .row:last-child { border-bottom: none; }
      .lbl { flex: 0 0 200px; font-size: 11px; letter-spacing: 1px; color: #888; font-weight: 600; padding-top: 2px; text-transform: uppercase; }
      .val { flex: 1; color: #111; font-weight: 600; }
    </style>
    </head><body>${pageHtml}</body></html>`;

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

  async function deleteOrder(orderId) {
    const ok = await Confirm.show(
      `Delete Order ${fmtOrderId(orderId)}? This cannot be undone.`,
      "Delete Order",
      true,
    );
    if (!ok) return;
    try {
      await DB.orderlines.deleteByOrder(orderId);
      await DB.orders.delete(orderId);
      await audit("DeleteOrder", `Deleted order ${fmtOrderId(orderId)}`);
      Toast.success(`Order ${fmtOrderId(orderId)} deleted.`);
      await loadHistory();
      if (typeof DashboardPage !== "undefined") DashboardPage.refresh();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  // ── Public ─────────────────────────────────────────────────────
  return {
    init,
    populateCategories,
    loadHistory,
    removeLine,
    editLine,
    viewOrder,
    editFromView,
    editFromViewCurrent,
    deleteOrder,
    printReceipt,
    printDescription,
    addLineItemFromModal,
    addLineItemFromPantModal,
    addLineItemFromShirtModal,
    // Picker callbacks (called from inline HTML)
    _pickCat,
    _pickSub,
    _pickFabric,
  };
})();
