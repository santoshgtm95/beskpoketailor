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

    // Clear / New order
    document
      .getElementById("btn-clear-order")
      .addEventListener("click", resetOrderForm);

    // Save new customer from modal
    document
      .getElementById("btn-save-customer-inline")
      .addEventListener("click", saveCustomerInline);
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

  async function populateCategories() {
    pickerCats = await DB.categories.getAll();
    pickerSubs = await DB.subcategories.getAll();
    renderCatCards();
    showStep("cat");
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

    if (selectedCat.Name === "Jacket") {
      // Measurements Modal explicitly for Jacket
      document.getElementById("meas-cat-sub-name").textContent =
        `${selectedCat.Name} — ${selectedSub.Name}`;

      const measImgWrap = document.getElementById("meas-sub-image-wrap");
      if (selectedSub.Image) {
        measImgWrap.innerHTML = `<img src="${selectedSub.Image}" alt="${sanitize(selectedSub.Name)}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />`;
      } else {
        measImgWrap.innerHTML = `<div style="display: flex; width: 150px; height: 150px; border-radius: 6px; background: linear-gradient(135deg, var(--gold-dark), var(--gold)); color: #fff; align-items: center; justify-content: center; font-size: 48px; font-weight: bold; border: 1px solid var(--border);">🧵</div>`;
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
      document.getElementById("meas-chk-sloping-shoulder").checked = false;
      document.getElementById("meas-chk-hunched-back").checked = false;
      document.getElementById("meas-chk-belly").checked = false;
      document.getElementById("meas-chk-sway-back").checked = false;
      document.getElementById("meas-chk-male").checked = false;
      document.getElementById("meas-chk-female").checked = false;
      document.getElementById("meas-chk-low-leg").checked = false;
      document.getElementById("meas-chk-left-lower").checked = false;
      document.getElementById("meas-qty").value = "1";
      document.getElementById("meas-color").value = "";
      document.getElementById("meas-unit-price").value = "";

      Modal.open("modal-measurements");
    } else if (selectedCat.Name === "Pant") {
      // Measurements Modal explicitly for Pant
      document.getElementById("meas-pant-cat-sub-name").textContent =
        `${selectedCat.Name} — ${selectedSub.Name}`;

      const measImgWrap = document.getElementById("meas-pant-sub-image-wrap");
      if (selectedSub.Image) {
        measImgWrap.innerHTML = `<img src="${selectedSub.Image}" alt="${sanitize(selectedSub.Name)}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />`;
      } else {
        measImgWrap.innerHTML = `<div style="display: flex; width: 150px; height: 150px; border-radius: 6px; background: linear-gradient(135deg, var(--gold-dark), var(--gold)); color: #fff; align-items: center; justify-content: center; font-size: 48px; font-weight: bold; border: 1px solid var(--border);">🧵</div>`;
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

      Modal.open("modal-meas-pant");
    } else if (selectedCat.Name === "Shirt") {
      // Measurements Modal explicitly for Shirt
      document.getElementById("meas-shirt-cat-sub-name").textContent =
        `${selectedCat.Name} — ${selectedSub.Name}`;

      const measImgWrap = document.getElementById("meas-shirt-sub-image-wrap");
      if (selectedSub.Image) {
        measImgWrap.innerHTML = `<img src="${selectedSub.Image}" alt="${sanitize(selectedSub.Name)}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);" />`;
      } else {
        measImgWrap.innerHTML = `<div style="display: flex; width: 150px; height: 150px; border-radius: 6px; background: linear-gradient(135deg, var(--gold-dark), var(--gold)); color: #fff; align-items: center; justify-content: center; font-size: 48px; font-weight: bold; border: 1px solid var(--border);">🧵</div>`;
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
      document.getElementById("meas-shirt-chk-plain-back").checked = false;
      document.getElementById("meas-shirt-chk-center-pleat").checked = false;
      document.getElementById("meas-shirt-chk-side-pleats").checked = false;
      document.getElementById("meas-shirt-qty").value = "1";
      document.getElementById("meas-shirt-color").value = "";
      document.getElementById("meas-shirt-unit-price").value = "";

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

    orderLines.push(line);
    renderOrderLines();
    updateOrderTotal();

    Toast.success(`Added: ${selectedCat.Name} – ${selectedSub.Name}`);

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
    if (getChk("meas-pant-chk-male")) chks.push("Male");
    if (getChk("meas-pant-chk-female")) chks.push("Female");
    if (getChk("meas-pant-chk-front-thigh")) chks.push("Prominent Front Thigh");

    const color = getVal("meas-pant-color");
    const desc = getVal("meas-pant-description");

    let customDesc = `${selectedCat.Name} – ${selectedSub.Name}`;
    if (desc) customDesc += ` | ${desc}`;
    if (color) customDesc += ` | Color: ${color}`;
    if (m.length) customDesc += ` | Meas: ${m.join(", ")}`;
    if (chks.length) customDesc += ` | Traits: ${chks.join(", ")}`;

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
    };

    orderLines.push(line);
    renderOrderLines();
    updateOrderTotal();

    Toast.success(`Added: ${selectedCat.Name} – ${selectedSub.Name}`);

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
      chks.push("Sloping Shoulder (ไหล่เทา)");
    if (getChk("meas-shirt-chk-belly")) chks.push("Belly (มีพุง)");
    if (getChk("meas-shirt-chk-hunched-back"))
      chks.push("Hunched Back (หลังค่อม)");
    if (getChk("meas-shirt-chk-male")) chks.push("Male (ผู้ชาย)");
    if (getChk("meas-shirt-chk-female")) chks.push("Female (ผู้หญิง)");
    if (getChk("meas-shirt-chk-pointed")) chks.push("Pointed (แหลม (F))");
    if (getChk("meas-shirt-chk-square")) chks.push("Square (ป้าน (I))");
    if (getChk("meas-shirt-chk-wide-square"))
      chks.push("Wide Square (ป้าน (180))");
    if (getChk("meas-shirt-chk-collar-roll"))
      chks.push("Collar Roll (คุมใบปก)");
    if (getChk("meas-shirt-chk-lapel-gorge"))
      chks.push("Lapel Gorge (จุมไตปก)");
    if (getChk("meas-shirt-chk-plain-back"))
      chks.push("Plain Back (หลังเรียบ (X))");
    if (getChk("meas-shirt-chk-center-pleat"))
      chks.push("Center Pleat (จีบกลาง (TT))");
    if (getChk("meas-shirt-chk-side-pleats"))
      chks.push("Side Pleats (จีบข้าง (TT))");

    const color = getVal("meas-shirt-color");
    const desc = getVal("meas-shirt-description");

    let customDesc = `${selectedCat.Name} – ${selectedSub.Name}`;
    if (desc) customDesc += ` | ${desc}`;
    if (color) customDesc += ` | Color: ${color}`;
    if (m.length) customDesc += ` | Meas: ${m.join(", ")}`;
    if (chks.length) customDesc += ` | Traits: ${chks.join(", ")}`;

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
    };

    orderLines.push(line);
    renderOrderLines();
    updateOrderTotal();

    Toast.success(`Added: ${selectedCat.Name} – ${selectedSub.Name}`);

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
    ];
    fields.forEach((f) => {
      const v = getVal("meas-" + f);
      if (v) m.push(`${f.charAt(0).toUpperCase() + f.slice(1)}: ${v}`);
    });

    const chks = [];
    if (getChk("meas-chk-sloping-shoulder")) chks.push("Sloping Shoulder");
    if (getChk("meas-chk-hunched-back")) chks.push("Hunched Back");
    if (getChk("meas-chk-belly")) chks.push("Belly");
    if (getChk("meas-chk-sway-back")) chks.push("Sway Back");
    if (getChk("meas-chk-male")) chks.push("Male");
    if (getChk("meas-chk-female")) chks.push("Female");
    if (getChk("meas-chk-low-leg")) chks.push("Low Leg");
    if (getChk("meas-chk-left-lower")) chks.push("Left Side Lower");

    const color = getVal("meas-color");
    const desc = getVal("meas-description");

    let customDesc = `${selectedCat.Name} – ${selectedSub.Name}`;
    if (desc) customDesc += ` | ${desc}`;
    if (color) customDesc += ` | Color: ${color}`;
    if (m.length) customDesc += ` | Meas: ${m.join(", ")}`;
    if (chks.length) customDesc += ` | Traits: ${chks.join(", ")}`;

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
    };

    orderLines.push(line);
    renderOrderLines();
    updateOrderTotal();

    Toast.success(`Added: ${selectedCat.Name} – ${selectedSub.Name}`);

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

  function updateOrderTotal() {
    const total = orderLines.reduce((s, l) => s + l.LineTotal, 0);
    document.getElementById("order-grand-total").textContent =
      fmtCurrency(total);
    document.getElementById("order-line-count").textContent = orderLines.length;
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

    const totalAmount = orderLines.reduce((s, l) => s + l.LineTotal, 0);
    const user = Auth.currentUser();

    try {
      let orderId;
      if (editingOrderId) {
        const existing = await DB.orders.get(editingOrderId);
        await DB.orders.put({
          ...existing,
          CustomerID: custId,
          OrderDate: orderDate,
          TotalAmount: +totalAmount.toFixed(2),
        });
        await DB.orderlines.deleteByOrder(editingOrderId);
        orderId = editingOrderId;
      } else {
        orderId = await DB.orders.add({
          CustomerID: custId,
          UserID: user.UserID,
          OrderDate: orderDate,
          TotalAmount: +totalAmount.toFixed(2),
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
        });
      }

      await audit(
        editingOrderId ? "UpdateOrder" : "CreateOrder",
        `Order #${orderId} for customer ${custId}, total ${fmtCurrency(totalAmount)}`,
      );

      Toast.success(
        editingOrderId
          ? `Order #${orderId} updated!`
          : `Order #${orderId} saved!`,
      );
      resetOrderForm();
      if (typeof DashboardPage !== "undefined") DashboardPage.refresh();
    } catch (err) {
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

    showStep("cat");
    renderOrderLines();
    updateOrderTotal();
    Toast.info("Order form cleared.");
  }

  // Load order into the edit form
  async function loadOrderForEdit(orderId) {
    await AppShell.navigate("order-entry", true);

    const order = await DB.orders.get(orderId);
    const lines = await DB.orderlines.getByOrder(orderId);
    const cust = await DB.customers.get(order.CustomerID);

    editingOrderId = orderId;
    selectedCustomer = cust;

    document.getElementById("customer-search").value = cust.Name;
    document.getElementById("customer-id-hidden").value = cust.CustomerID;
    document.getElementById("order-date").value = order.OrderDate;

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
      });
    }

    renderOrderLines();
    updateOrderTotal();
    Toast.info(`Editing Order #${orderId}`);
  }

  // ── Inline new-customer form ───────────────────────────────────
  function clearCustomerForm() {
    ["cust-name", "cust-phone", "cust-email", "cust-address"].forEach((id) => {
      document.getElementById(id).value = "";
    });
    document.getElementById("cust-id-hidden").value = "";
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

    if (orderId) {
      const order = await DB.orders.get(orderId);
      printOrderLines = await DB.orderlines.getByOrder(orderId);
      printCustomer = await DB.customers.get(order.CustomerID);
      printTotal = order.TotalAmount;
      printDate = order.OrderDate;
      printOrderId = order.OrderID;
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
      <div>
        <h1 class="brand">✂ SIAM BESPOKE</h1>
        <div class="sub-brand">Tailor Shop</div>
      </div>
      <div>
        <h2 class="invoice-title">Receipt</h2>
        <div style="text-align: right; color: #666; font-size: 14px;">Order #${printOrderId}</div>
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
    allOrders.sort((a, b) => new Date(b.OrderDate) - new Date(a.OrderDate));
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
      const custMatch =
        !q ||
        (cust?.Name || "").toLowerCase().includes(q) ||
        String(o.OrderID).includes(q);
      const dateMatch = !date || o.OrderDate === date;
      return custMatch && dateMatch;
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

          return `<tr>
          <td class="font-mono" style="color: var(--text-primary)">#${o.OrderID}</td>
          <td>${fmtDate(o.OrderDate)}</td>
          <td><strong>${sanitize(cust?.Name || "Unknown")}</strong><br>
              <small class="text-muted">${sanitize(cust?.Phone || "")}</small></td>
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

  async function viewOrder(orderId) {
    const order = await DB.orders.get(orderId);
    const lines = await DB.orderlines.getByOrder(orderId);
    const cust = await DB.customers.get(order.CustomerID);

    let linesHtml = "";
    let total = 0;
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
      let parts = (desc || "").split(" | ");
      let formattedDesc = `<strong>${sanitize(parts[0])}</strong>`;
      if (parts.length > 1) {
        formattedDesc += `<ul style="margin:6px 0 0 16px; padding-left: 10px; color: var(--text-secondary); font-size: 14px; line-height: 1.5;">`;
        for (let i = 1; i < parts.length; i++) {
          formattedDesc += `<li style="margin-bottom: 4px;">${sanitize(parts[i])}</li>`;
        }
        formattedDesc += `</ul>`;
      }

      linesHtml += `<tr>
        <td style="vertical-align: top; padding-top: 14px;">${formattedDesc}</td>
        <td class="text-right" style="vertical-align: top; padding-top: 14px;">${l.Quantity}</td>
        <td class="text-right" style="vertical-align: top; padding-top: 14px;">${fmtCurrency(l.UnitPrice)}</td>
        <td class="text-right font-bold text-gold" style="vertical-align: top; padding-top: 14px; color: var(--text-primary);">${fmtCurrency(l.LineTotal)}</td>
      </tr>`;
      total += l.LineTotal;
    }

    document.getElementById("view-order-content").innerHTML = `
      <div class="grid-2 mb-3" style="background: var(--bg-panel); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border);">
        <div>
          <div class="text-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Customer Info</div>
          <div class="font-bold" style="font-size:18px;">${sanitize(cust?.Name || "—")}</div>
          <div class="text-secondary" style="font-size:14px;margin-top:2px;">${sanitize(cust?.Phone || "No phone")} | ${sanitize(cust?.Email || "No email")}</div>
        </div>
        <div style="text-align: right;">
          <div class="text-muted" style="font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Order Status</div>
          <div class="font-bold" style="font-size:20px;">#${order.OrderID}</div>
          <div class="text-secondary" style="font-size:14px;margin-top:2px;">${fmtDate(order.OrderDate)}</div>
        </div>
      </div>
      <div class="order-table-wrap" style="box-shadow: var(--shadow-sm);">
        <table class="data-table">
          <thead><tr><th>Description</th><th class="text-right">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Line Total</th></tr></thead>
          <tbody>${linesHtml}</tbody>
        </table>
      </div>
      <div class="order-total-bar" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center; padding: 16px; background: var(--bg-panel); border-radius: var(--radius-md); border: 1px solid var(--border);">
        <div class="total-label" style="font-size:16px; font-weight:bold;">ORDER TOTAL</div>
        <div class="total-amount" style="font-size:22px; font-weight:bold; color: var(--text-primary);">${fmtCurrency(total)}</div>
      </div>
      <div class="flex gap-2 mt-3" style="justify-content: flex-end;">
        <button class="btn btn-primary btn-sm" onclick="OrdersPage.editFromView(${orderId})">✏️ Edit Order</button>
      </div>`;
    Modal.open("modal-view-order");
  }

  async function editFromView(orderId) {
    Modal.close("modal-view-order");
    await loadOrderForEdit(orderId);
  }

  async function deleteOrder(orderId) {
    const ok = await Confirm.show(
      `Delete Order #${orderId}? This cannot be undone.`,
      "Delete Order",
      true,
    );
    if (!ok) return;
    try {
      await DB.orderlines.deleteByOrder(orderId);
      await DB.orders.delete(orderId);
      await audit("DeleteOrder", `Deleted order #${orderId}`);
      Toast.success(`Order #${orderId} deleted.`);
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
    viewOrder,
    editFromView,
    deleteOrder,
    printReceipt,
    addLineItemFromModal,
    addLineItemFromPantModal,
    addLineItemFromShirtModal,
    // Picker callbacks (called from inline HTML)
    _pickCat,
    _pickSub,
  };
})();
