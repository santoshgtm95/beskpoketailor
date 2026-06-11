/**
 * app.js – Application Shell: routing, initialization, event wiring
 * Beskpoke Tailor Shop
 */

const AppShell = (() => {
  // ── Navigation ─────────────────────────────────────────────────
  const NAV_ITEMS = [
    { id: "dashboard", icon: "🏠", label: "Dashboard", section: "main" },
    { id: "order-entry", icon: "✂️", label: "New Order", section: "main" },
    {
      id: "order-history",
      icon: "📋",
      label: "Order History",
      section: "main",
    },
    { id: "report", icon: "📊", label: "Report", section: "main" },
    { id: "customers", icon: "👥", label: "Customers", section: "manage" },
    { id: "catalog", icon: "🧵", label: "Catalog", section: "manage" },
    {
      id: "users",
      icon: "🔐",
      label: "Users",
      section: "admin",
      adminOnly: true,
    },
    {
      id: "auditlog",
      icon: "📜",
      label: "Audit Log",
      section: "admin",
      adminOnly: true,
    },
  ];

  let _currentPage = null;

  function buildNav() {
    const nav = document.getElementById("sidebar-nav");
    const isAdm = Auth.isAdmin();
    nav.innerHTML = "";

    const sections = ["main", "manage", "admin"];
    const labels = {
      main: "Navigation",
      manage: "Management",
      admin: "Administration",
    };

    sections.forEach((sec) => {
      const items = NAV_ITEMS.filter(
        (n) => n.section === sec && (!n.adminOnly || isAdm),
      );
      if (items.length === 0) return;

      nav.innerHTML += `<div class="nav-section-label">${labels[sec]}</div>`;
      items.forEach((item) => {
        nav.innerHTML += `
          <div class="nav-item" id="nav-${item.id}" onclick="AppShell.navigate('${item.id}')">
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
          </div>`;
      });
    });
  }

  async function navigate(pageId, forceReload = false) {
    const alreadyHere = _currentPage === pageId;
    _currentPage = pageId;

    // Update nav highlight
    document
      .querySelectorAll(".nav-item")
      .forEach((n) => n.classList.remove("active"));
    const activeNav = document.getElementById("nav-" + pageId);
    if (activeNav) activeNav.classList.add("active");

    // Show page
    document
      .querySelectorAll(".page")
      .forEach((p) => p.classList.remove("active"));
    const page = document.getElementById("page-" + pageId);
    if (page) page.classList.add("active");

    // Update topbar title
    const navItem = NAV_ITEMS.find((n) => n.id === pageId);
    if (navItem) {
      document.getElementById("topbar-title").innerHTML =
        `<span>${navItem.icon}</span> ${navItem.label}`;
    }

    // Skip re-loading data if already on this page (unless forced)
    if (alreadyHere && !forceReload) return;

    // Load page data
    switch (pageId) {
      case "dashboard":
        await DashboardPage.load();
        break;
      case "order-entry":
        await OrdersPage.populateCategories();
        break;
      case "order-history":
        await OrdersPage.loadHistory();
        break;
      case "report":
        await ReportView.init();
        break;
      case "customers":
        await CustomersPage.load();
        break;
      case "catalog":
        await CatalogPage.load();
        break;
      case "users":
        await UsersPage.load();
        break;
      case "auditlog":
        await AuditPage.load();
        break;
    }
  }

  // ── Login flow ─────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    const btn = document.getElementById("login-btn");

    errEl.classList.remove("show");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';

    try {
      await Auth.login(username, password);
      showApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add("show");
      document.getElementById("login-password").value = "";
    } finally {
      btn.disabled = false;
      btn.innerHTML = "Sign In";
    }
  }

  function showApp() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app").classList.add("visible");

    const user = Auth.currentUser();
    document.getElementById("sidebar-user-name").textContent =
      user.Name || user.Username;
    document.getElementById("sidebar-user-role").textContent = user.Role;
    document.getElementById("sidebar-user-avatar").textContent = (user.Name ||
      user.Username)[0].toUpperCase();

    buildNav();
    startClock();
    navigate("dashboard");
  }

  async function handleLogout() {
    const ok = await Confirm.show("Sign out of Siam Bespoke?", "Logout");
    if (!ok) return;
    await Auth.logout();
    document.getElementById("app").classList.remove("visible");
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("login-username").value = "";
    document.getElementById("login-password").value = "";
    document.getElementById("login-error").classList.remove("show");
    _currentPage = null;
  }

  // ── Init ───────────────────────────────────────────────────────
  async function init() {
    await DB.init();

    // Load HTML templates dynamically
    const views = [
      { id: "login-screen-placeholder", url: "views/login.html" },
      { id: "page-dashboard-placeholder", url: "views/dashboard.html" },
      { id: "page-order-entry-placeholder", url: "views/order-entry.html" },
      { id: "page-order-history-placeholder", url: "views/order-history.html" },
      { id: "page-report-placeholder", url: "views/report.html" },
      { id: "page-customers-placeholder", url: "views/customers.html" },
      { id: "page-catalog-placeholder", url: "views/catalog.html" },
      { id: "page-users-placeholder", url: "views/users.html" },
      { id: "page-auditlog-placeholder", url: "views/auditlog.html" },
      { id: "modals-placeholder", url: "views/modals.html" },
    ];

    try {
      await Promise.all(
        views.map(async (v) => {
          const el = document.getElementById(v.id);
          if (el) {
            const html = await fetch(v.url).then((r) => {
              if (!r.ok)
                throw new Error(`HTTP error ${r.status} fetching ${v.url}`);
              return r.text();
            });
            el.outerHTML = html;
          }
        }),
      );
    } catch (err) {
      console.error("Failed to load modular views:", err);
      // Wait for UI logic to be ready to show Toast if present
      setTimeout(() => {
        if (typeof Toast !== "undefined")
          Toast.error("Error loading UI elements.");
      }, 500);
    }

    // Login form
    document
      .getElementById("login-form")
      .addEventListener("submit", handleLogin);

    // Logout buttons
    document
      .querySelectorAll(".btn-logout")
      .forEach((b) => b.addEventListener("click", handleLogout));

    // Confirm modal buttons
    document
      .getElementById("confirm-ok")
      .addEventListener("click", () => Confirm.resolve(true));
    document
      .getElementById("confirm-cancel")
      .addEventListener("click", () => Confirm.resolve(false));

    // Check existing session
    Auth.loadSession();
    if (Auth.isLoggedIn()) {
      showApp();
    }

    // Order entry initialization
    await OrdersPage.init();

    // Bind modal save buttons
    document
      .getElementById("btn-save-customer-modal")
      .addEventListener("click", () => CustomersPage.save());
    // removed btn-save-cat event listener
    document
      .getElementById("btn-save-sub")
      .addEventListener("click", () => CatalogPage.saveSub());
    document
      .getElementById("btn-save-user")
      .addEventListener("click", () => UsersPage.save());

    // Quick action buttons
    document
      .getElementById("quick-new-order")
      .addEventListener("click", () => navigate("order-entry"));
    document
      .getElementById("quick-new-customer")
      .addEventListener("click", () => navigate("customers"));

    // Catalog tabs
    document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = btn.dataset.group;
        document
          .querySelectorAll(`.tab-btn[data-group="${group}"]`)
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document
          .querySelectorAll(`.tab-panel[data-group="${group}"]`)
          .forEach((p) => p.classList.remove("active"));
        document
          .getElementById("tab-" + btn.dataset.tab)
          ?.classList.add("active");
      });
    });
  }

  return { init, navigate, handleLogout };
})();

// Boot
document.addEventListener("DOMContentLoaded", () => AppShell.init());
