/**
 * catalog.js – Customers, Categories, Subcategories, Items management pages
 * Beskpoke Tailor Shop
 */

// ══════════════════════════════════════════════════════════════
// CUSTOMERS PAGE
// ══════════════════════════════════════════════════════════════
const CustomersPage = (() => {
  let allCustomers = [];
  let editId = null;
  let currentPage = 1;
  const PER_PAGE = 10;

  async function load() {
    allCustomers = await DB.customers.getAll();
    currentPage = 1;
    render();
    document.getElementById("customers-search").oninput = render;
  }

  function render() {
    const q = (
      document.getElementById("customers-search").value || ""
    ).toLowerCase();
    const filtered = allCustomers.filter(
      (c) =>
        c.Name.toLowerCase().includes(q) ||
        (c.Phone || "").includes(q) ||
        (c.Email || "").toLowerCase().includes(q),
    );
    const total = filtered.length;
    const paged = filtered.slice(
      (currentPage - 1) * PER_PAGE,
      currentPage * PER_PAGE,
    );

    const tbody = document.getElementById("customers-tbody");
    tbody.innerHTML =
      paged.length === 0
        ? `<tr><td colspan="6" class="table-empty"><div class="empty-icon">👥</div>No customers found.</td></tr>`
        : paged
            .map(
              (c) => `<tr>
          <td class="font-mono text-muted">#${c.CustomerID}</td>
          <td><strong>${sanitize(c.Name)}</strong></td>
          <td>${sanitize(c.Phone || "—")}</td>
          <td>${sanitize(c.Email || "—")}</td>
          <td>${sanitize(c.Address || "—")}</td>
          <td class="text-right">
            <button class="btn btn-ghost btn-sm" onclick="CustomersPage.edit(${c.CustomerID})">✏️</button>
            ${Auth.isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="CustomersPage.delete(${c.CustomerID})">🗑</button>` : ""}
          </td>
        </tr>`,
            )
            .join("");

    document.getElementById("customers-count").textContent = total;
    renderPagination(
      document.getElementById("customers-pagination"),
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
    document.getElementById("customer-modal-title").textContent =
      "➕ Add Customer";
    ["cm-name", "cm-phone", "cm-email", "cm-address"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
    document.getElementById("cm-id-hidden").value = "";
    clearValidation(document.getElementById("customer-modal-form"));
    Modal.open("modal-edit-customer");
  }

  async function edit(id) {
    editId = id;
    const c = await DB.customers.get(id);
    document.getElementById("customer-modal-title").textContent =
      "✏️ Edit Customer";
    document.getElementById("cm-name").value = c.Name;
    document.getElementById("cm-phone").value = c.Phone || "";
    document.getElementById("cm-email").value = c.Email || "";
    document.getElementById("cm-address").value = c.Address || "";
    document.getElementById("cm-id-hidden").value = id;
    clearValidation(document.getElementById("customer-modal-form"));
    Modal.open("modal-edit-customer");
  }

  async function save() {
    if (
      !validateFields([
        { el: document.getElementById("cm-name"), msg: "Name is required." },
      ])
    )
      return;
    const data = {
      Name: document.getElementById("cm-name").value.trim(),
      Phone: document.getElementById("cm-phone").value.trim(),
      Email: document.getElementById("cm-email").value.trim(),
      Address: document.getElementById("cm-address").value.trim(),
    };
    if (editId) {
      data.CustomerID = editId;
      await DB.customers.put(data);
      await audit(
        "UpdateCustomer",
        `Updated customer #${editId}: ${data.Name}`,
      );
      Toast.success("Customer updated!");
    } else {
      await DB.customers.add(data);
      await audit("CreateCustomer", `New customer: ${data.Name}`);
      Toast.success("Customer added!");
    }
    Modal.close("modal-edit-customer");
    await load();
  }

  async function del(id) {
    const c = await DB.customers.get(id);
    const ok = await Confirm.show(
      `Delete customer "${c.Name}"?`,
      "Delete Customer",
      true,
    );
    if (!ok) return;
    try {
      await DB.customers.delete(id);
      await audit("DeleteCustomer", `Deleted customer #${id}: ${c.Name}`);
      Toast.success("Customer deleted.");
      await load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  return { load, render, openAdd, edit, save, delete: del };
})();

// ══════════════════════════════════════════════════════════════
// CATALOG PAGE (Categories, Subcategories, Items)
// ══════════════════════════════════════════════════════════════
const CatalogPage = (() => {
  let allCats = [],
    allSubs = [];
  let editCatId = null,
    editSubId = null;

  let uploadInitialized = false;

  async function load() {
    [allCats, allSubs] = await Promise.all([
      DB.categories.getAll(),
      DB.subcategories.getAll(),
    ]);
    renderCats();
    renderSubs();
    populateCatDropdowns();

    // Initialize Subcategory Local Image upload handler
    if (!uploadInitialized) {
      const fileInput = document.getElementById("sub-image-file");
      if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          // Show selected file name
          document.getElementById("sub-image-filename").textContent = file.name;

          // Perform background upload using FormData
          const formData = new FormData();
          formData.append("image", file);

          try {
            Toast.info("Uploading image…");
            const res = await fetch("/api/subcategories/upload", {
              method: "POST",
              body: formData,
            });
            if (!res.ok) throw new Error("File upload failed on server.");
            const data = await res.json();

            // Set hidden path value and show thumbnail preview
            document.getElementById("sub-image-url").value = data.filePath;
            const preview = document.getElementById("sub-image-preview");
            preview.src = data.filePath;
            document.getElementById("sub-image-preview-wrap").style.display =
              "block";
            Toast.success("Image uploaded successfully!");
          } catch (err) {
            console.error("File upload failed:", err);
            Toast.error("Failed to upload subcategory image.");
          }
        });
      }
      uploadInitialized = true;
    }
  }

  // ── Categories ─────────────────────────────────────────────────
  function renderCats() {
    // Categories UI removed. Let's just do a no-op so we don't break code calling renderCats.
  }

  function openAddCat() {
    editCatId = null;
    document.getElementById("cat-modal-title").textContent = "➕ Add Category";
    document.getElementById("cat-name").value = "";
    Modal.open("modal-cat");
  }

  async function editCat(id) {
    editCatId = id;
    const c = allCats.find((x) => x.CategoryID === id);
    document.getElementById("cat-modal-title").textContent = "✏️ Edit Category";
    document.getElementById("cat-name").value = c.Name;
    Modal.open("modal-cat");
  }

  async function saveCat() {
    const name = document.getElementById("cat-name").value.trim();
    if (!name) {
      Toast.warning("Category name is required.");
      return;
    }
    if (editCatId) {
      await DB.categories.put({ CategoryID: editCatId, Name: name });
      Toast.success("Category updated!");
    } else {
      await DB.categories.add({ Name: name });
      Toast.success("Category added!");
    }
    Modal.close("modal-cat");
    await load();
  }

  async function deleteCat(id) {
    const hasSubs = allSubs.some((s) => s.CategoryID === id);
    if (hasSubs) {
      Toast.error("Remove all subcategories first.");
      return;
    }
    const ok = await Confirm.show(
      "Delete this category?",
      "Delete Category",
      true,
    );
    if (!ok) return;
    try {
      await DB.categories.delete(id);
      Toast.success("Category deleted.");
      await load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  // ── Subcategories ──────────────────────────────────────────────
  function renderSubs() {
    const tbody = document.getElementById("subs-tbody");
    const catMap = Object.fromEntries(allCats.map((c) => [c.CategoryID, c]));
    tbody.innerHTML =
      allSubs.length === 0
        ? `<tr><td colspan="3" class="table-empty">No subcategories.</td></tr>`
        : allSubs
            .map((s) => {
              const imgHtml = s.Image
                ? `<img src="${s.Image}" style="width:36px; height:36px; object-fit:cover; border-radius:6px; border:1px solid var(--border); box-shadow:0 1px 4px rgba(0,0,0,0.2); vertical-align:middle; margin-right:12px" />`
                : `<div style="display:inline-flex; width:36px; height:36px; border-radius:6px; background:linear-gradient(135deg, var(--gold-dark), var(--gold)); color:#fff; align-items:center; justify-content:center; font-size:16px; font-weight:bold; margin-right:12px; vertical-align:middle">🧵</div>`;
              return `<tr>
            <td>
              <div style="display:flex; align-items:center">
                ${imgHtml}
                <span class="font-bold">${sanitize(s.Name)}</span>
              </div>
            </td>
            <td><span class="badge badge-blue">${sanitize(catMap[s.CategoryID]?.Name || "—")}</span></td>
            <td class="text-right">
              <button class="btn btn-ghost btn-sm" onclick="CatalogPage.editSub(${s.SubcatID})">✏️</button>
              ${Auth.isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="CatalogPage.deleteSub(${s.SubcatID})">🗑</button>` : ""}
            </td>
          </tr>`;
            })
            .join("");
  }

  function openAddSub() {
    editSubId = null;
    document.getElementById("sub-modal-title").textContent =
      "➕ Add Subcategory";
    document.getElementById("sub-name").value = "";
    if (allCats.length > 0) {
      document.getElementById("sub-cat-id").value = allCats[0].CategoryID;
    }

    // Reset file uploader and preview
    document.getElementById("sub-image-file").value = "";
    document.getElementById("sub-image-url").value = "";
    document.getElementById("sub-image-filename").textContent =
      "No image chosen";
    document.getElementById("sub-image-preview-wrap").style.display = "none";
    document.getElementById("sub-image-preview").src = "";

    Modal.open("modal-sub");
  }

  async function editSub(id) {
    editSubId = id;
    const s = allSubs.find((x) => x.SubcatID === id);
    document.getElementById("sub-modal-title").textContent =
      "✏️ Edit Subcategory";
    document.getElementById("sub-name").value = s.Name;
    document.getElementById("sub-cat-id").value = s.CategoryID;

    // Set file uploader and preview
    document.getElementById("sub-image-file").value = "";
    const imageUrl = s.Image || "";
    document.getElementById("sub-image-url").value = imageUrl;

    if (imageUrl) {
      document.getElementById("sub-image-filename").textContent = imageUrl
        .split("/")
        .pop();
      const preview = document.getElementById("sub-image-preview");
      preview.src = imageUrl;
      document.getElementById("sub-image-preview-wrap").style.display = "block";
    } else {
      document.getElementById("sub-image-filename").textContent =
        "No image chosen";
      document.getElementById("sub-image-preview-wrap").style.display = "none";
      document.getElementById("sub-image-preview").src = "";
    }

    Modal.open("modal-sub");
  }

  async function saveSub() {
    const name = document.getElementById("sub-name").value.trim();
    const catId = parseInt(document.getElementById("sub-cat-id").value);
    const imageUrl = document.getElementById("sub-image-url").value;

    if (!name) {
      Toast.warning("Name is required.");
      return;
    }
    if (!catId) {
      Toast.warning("Category is required.");
      return;
    }

    if (editSubId) {
      await DB.subcategories.put({
        SubcatID: editSubId,
        CategoryID: catId,
        Name: name,
        Image: imageUrl,
      });
      Toast.success("Subcategory updated!");
    } else {
      await DB.subcategories.add({
        CategoryID: catId,
        Name: name,
        Image: imageUrl,
      });
      Toast.success("Subcategory added!");
    }
    Modal.close("modal-sub");
    await load();
  }

  async function deleteSub(id) {
    const ok = await Confirm.show(
      "Delete this subcategory?",
      "Delete Subcategory",
      true,
    );
    if (!ok) return;
    try {
      await DB.subcategories.delete(id);
      Toast.success("Subcategory deleted.");
      await load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  function populateCatDropdowns() {
    const sel = document.getElementById("sub-cat-id");
    if (!sel) return;
    sel.innerHTML = "";
    allCats.forEach(
      (c) =>
        (sel.innerHTML += `<option value="${c.CategoryID}">${c.Name}</option>`),
    );
  }

  return {
    load,
    openAddCat,
    editCat,
    saveCat,
    deleteCat,
    openAddSub,
    editSub,
    saveSub,
    deleteSub,
  };
})();

// ══════════════════════════════════════════════════════════════
// USERS PAGE (Admin only)
// ══════════════════════════════════════════════════════════════
const UsersPage = (() => {
  let allUsers = [];
  let editId = null;

  async function load() {
    allUsers = await DB.users.getAll();
    render();
  }

  function render() {
    const tbody = document.getElementById("users-tbody");
    tbody.innerHTML = allUsers
      .map(
        (u) => `<tr>
      <td>
        <div class="user-chip" style="display:inline-flex;padding:6px 10px;border-radius:8px">
          <div class="user-avatar" style="width:28px;height:28px;font-size:12px;flex-shrink:0">${(u.Name || u.Username)[0].toUpperCase()}</div>
          <div style="margin-left:8px">
            <div class="font-bold">${sanitize(u.Name || u.Username)}</div>
            <div class="text-muted" style="font-size:11px">@${sanitize(u.Username)}</div>
          </div>
        </div>
      </td>
      <td>${sanitize(u.Email || "—")}</td>
      <td><span class="badge ${u.Role === "Admin" ? "badge-gold" : "badge-blue"}">${u.Role}</span></td>
      <td class="text-right">
        <button class="btn btn-ghost btn-sm" onclick="UsersPage.edit(${u.UserID})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="UsersPage.delete(${u.UserID})">🗑</button>
      </td>
    </tr>`,
      )
      .join("");
  }

  function openAdd() {
    editId = null;
    document.getElementById("user-modal-title").textContent = "➕ Add User";
    ["um-name", "um-username", "um-email", "um-phone", "um-password"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
    document.getElementById("um-role").value = "Clerk";
    Modal.open("modal-user");
  }

  async function edit(id) {
    editId = id;
    const u = allUsers.find((x) => x.UserID === id);
    document.getElementById("user-modal-title").textContent = "✏️ Edit User";
    document.getElementById("um-name").value = u.Name || "";
    document.getElementById("um-username").value = u.Username;
    document.getElementById("um-email").value = u.Email || "";
    document.getElementById("um-phone").value = u.Phone || "";
    document.getElementById("um-role").value = u.Role;
    document.getElementById("um-password").value = "";
    Modal.open("modal-user");
  }

  async function save() {
    const username = document.getElementById("um-username").value.trim();
    const password = document.getElementById("um-password").value;
    if (!username) {
      Toast.warning("Username is required.");
      return;
    }
    if (!editId && !password) {
      Toast.warning("Password is required for new users.");
      return;
    }

    const data = {
      Name: document.getElementById("um-name").value.trim(),
      Username: username,
      Email: document.getElementById("um-email").value.trim(),
      Phone: document.getElementById("um-phone").value.trim(),
      Role: document.getElementById("um-role").value,
    };

    if (editId) {
      const existing = allUsers.find((u) => u.UserID === editId);
      data.UserID = editId;
      data.PasswordHash = password || existing.PasswordHash;
      await DB.users.put(data);
      Toast.success("User updated!");
    } else {
      data.PasswordHash = password;
      await DB.users.add(data);
      Toast.success("User added!");
    }

    Modal.close("modal-user");
    await audit("UserSave", `User ${data.Username} saved.`);
    await load();
  }

  async function del(id) {
    const u = allUsers.find((x) => x.UserID === id);
    if (u.UserID === Auth.currentUser().UserID) {
      Toast.error("You can't delete your own account.");
      return;
    }
    const ok = await Confirm.show(
      `Delete user "${u.Username}"?`,
      "Delete User",
      true,
    );
    if (!ok) return;
    try {
      await DB.users.delete(id);
      Toast.success("User deleted.");
      await load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  return { load, openAdd, edit, save, delete: del };
})();

// ══════════════════════════════════════════════════════════════
// AUDIT LOG PAGE (Admin only)
// ══════════════════════════════════════════════════════════════
const AuditPage = (() => {
  let logs = [];
  let currentPage = 1;
  const PER_PAGE = 15;

  async function load() {
    logs = await DB.auditlog.getAll();
    logs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    currentPage = 1;
    render();
    document.getElementById("audit-search").oninput = () => {
      currentPage = 1;
      render();
    };
  }

  function render() {
    const q = (
      document.getElementById("audit-search").value || ""
    ).toLowerCase();
    const filtered = logs.filter(
      (l) =>
        l.Action.toLowerCase().includes(q) ||
        (l.Details || "").toLowerCase().includes(q),
    );
    const total = filtered.length;
    const paged = filtered.slice(
      (currentPage - 1) * PER_PAGE,
      currentPage * PER_PAGE,
    );

    const ACTION_COLORS = {
      Login: "badge-green",
      Logout: "badge-blue",
      CreateOrder: "badge-gold",
      UpdateOrder: "badge-gold",
      DeleteOrder: "badge-red",
      CreateCustomer: "badge-green",
      DeleteCustomer: "badge-red",
      UserSave: "badge-blue",
    };

    const tbody = document.getElementById("audit-tbody");
    tbody.innerHTML =
      paged.length === 0
        ? `<tr><td colspan="4" class="table-empty">No log entries.</td></tr>`
        : paged
            .map(
              (l) => `<tr>
          <td class="text-muted font-mono" style="white-space:nowrap">${fmtDateTime(l.Timestamp)}</td>
          <td><span class="badge ${ACTION_COLORS[l.Action] || "badge-blue"}">${sanitize(l.Action)}</span></td>
          <td>${sanitize(l.Details || "")}</td>
          <td class="text-muted">#${l.UserID}</td>
        </tr>`,
            )
            .join("");

    renderPagination(
      document.getElementById("audit-pagination"),
      total,
      PER_PAGE,
      currentPage,
      (p) => {
        currentPage = p;
        render();
      },
    );
  }

  return { load };
})();
