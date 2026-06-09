/**
 * ui.js – Shared UI utilities: toasts, modals, confirm dialogs, clock
 * Beskpoke Tailor Shop
 */

// ── Toast Notifications ────────────────────────────────────────
const Toast = (() => {
  let container;

  function getContainer() {
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    return container;
  }

  const ICONS = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };

  function show(message, type = "info", duration = 3200) {
    const c = getContainer();
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${ICONS[type]}</span><span>${message}</span>`;
    c.appendChild(t);

    setTimeout(() => {
      t.classList.add("toast-out");
      t.addEventListener("animationend", () => t.remove(), { once: true });
    }, duration);
  }

  return {
    success: (m, d) => show(m, "success", d),
    error: (m, d) => show(m, "error", d),
    info: (m, d) => show(m, "info", d),
    warning: (m, d) => show(m, "warning", d),
  };
})();

// ── Modal Manager ──────────────────────────────────────────────
const Modal = (() => {
  function open(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add("show");
      el.querySelector(".modal")?.focus?.();
    }
  }

  function close(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("show");
  }

  function closeAll() {
    document
      .querySelectorAll(".modal-overlay.show")
      .forEach((m) => m.classList.remove("show"));
  }

  // Close on backdrop click
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.classList.remove("show");
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });

  return { open, close, closeAll };
})();

// ── Confirm Dialog ─────────────────────────────────────────────
const Confirm = (() => {
  let _resolve = null;

  function show(message, title = "Confirm", danger = false) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    const btn = document.getElementById("confirm-ok");
    btn.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
    btn.textContent = danger ? "Delete" : "Confirm";
    Modal.open("confirm-modal");
    return new Promise((resolve) => {
      _resolve = resolve;
    });
  }

  function resolve(val) {
    Modal.close("confirm-modal");
    if (_resolve) {
      _resolve(val);
      _resolve = null;
    }
  }

  return { show, resolve };
})();

// ── Clock ──────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById("topbar-clock");
  if (!el) return;
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  tick();
  setInterval(tick, 1000);
}

// ── Autocomplete ───────────────────────────────────────────────
function makeAutocomplete(inputEl, dropdownEl, getItems, onSelect) {
  let items = [];
  let highlighted = -1;

  inputEl.addEventListener("input", async () => {
    const q = inputEl.value.trim().toLowerCase();
    items = await getItems(q);
    renderDropdown(q);
    highlighted = -1;
  });

  inputEl.addEventListener("focus", async () => {
    const q = inputEl.value.trim().toLowerCase();
    items = await getItems(q);
    renderDropdown(q);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (!dropdownEl.classList.contains("open")) return;
    const rows = dropdownEl.querySelectorAll(".autocomplete-item");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, rows.length - 1);
      updateHighlight(rows);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
      updateHighlight(rows);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && items[highlighted])
        selectItem(items[highlighted]);
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  });

  document.addEventListener("click", (e) => {
    if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target))
      closeDropdown();
  });

  function updateHighlight(rows) {
    rows.forEach((r, i) =>
      r.classList.toggle("highlighted", i === highlighted),
    );
    rows[highlighted]?.scrollIntoView({ block: "nearest" });
  }

  function renderDropdown(q) {
    if (items.length === 0) {
      closeDropdown();
      return;
    }
    dropdownEl.innerHTML = "";
    items.forEach((item, i) => {
      const div = document.createElement("div");
      div.className = "autocomplete-item";
      const name = item.Name || item.Username || "";
      div.innerHTML =
        highlight(name, q) +
        (item.Phone ? `<small>${item.Phone}</small>` : "") +
        (item.Email ? `<small>${item.Email}</small>` : "");
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectItem(item);
      });
      dropdownEl.appendChild(div);
    });
    dropdownEl.classList.add("open");
  }

  function highlight(text, q) {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return text;
    return (
      text.slice(0, idx) +
      "<mark>" +
      text.slice(idx, idx + q.length) +
      "</mark>" +
      text.slice(idx + q.length)
    );
  }

  function selectItem(item) {
    inputEl.value = item.Name || item.Username || "";
    closeDropdown();
    onSelect(item);
  }

  function closeDropdown() {
    dropdownEl.classList.remove("open");
    dropdownEl.innerHTML = "";
    highlighted = -1;
  }

  return {
    close: closeDropdown,
    reset: () => {
      inputEl.value = "";
      closeDropdown();
    },
  };
}

// ── Format currency ────────────────────────────────────────────
function fmtCurrency(n) {
  return (
    "THB " +
    Number(n || 0)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  );
}

// ── Format date ────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Today's date string (YYYY-MM-DD) ──────────────────────────
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ── Sanitize input ─────────────────────────────────────────────
function sanitize(str) {
  return String(str || "")
    .trim()
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Validate required fields ───────────────────────────────────
function validateFields(fields) {
  let valid = true;
  fields.forEach(({ el, msg }) => {
    const val = el.value.trim();
    const errEl = el.parentElement.querySelector(".field-error");
    if (!val) {
      el.classList.add("input-error");
      if (errEl) {
        errEl.textContent = msg || "This field is required.";
        errEl.style.display = "block";
      }
      valid = false;
    } else {
      el.classList.remove("input-error");
      if (errEl) errEl.style.display = "none";
    }
  });
  return valid;
}

function clearValidation(form) {
  form
    .querySelectorAll(".input-error")
    .forEach((el) => el.classList.remove("input-error"));
  form.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
    el.style.display = "none";
  });
}

// ── Pagination helper ──────────────────────────────────────────
function renderPagination(container, total, perPage, current, onChange) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = "";

  const prev = document.createElement("button");
  prev.className = "page-btn";
  prev.textContent = "‹";
  prev.disabled = current <= 1;
  prev.onclick = () => onChange(current - 1);
  container.appendChild(prev);

  for (let i = 1; i <= pages; i++) {
    const btn = document.createElement("button");
    btn.className = "page-btn" + (i === current ? " active" : "");
    btn.textContent = i;
    btn.onclick = () => onChange(i);
    container.appendChild(btn);
  }

  const next = document.createElement("button");
  next.className = "page-btn";
  next.textContent = "›";
  next.disabled = current >= pages;
  next.onclick = () => onChange(current + 1);
  container.appendChild(next);
}

// ── Audit log helper ───────────────────────────────────────────
async function audit(action, details) {
  const u = Auth.currentUser();
  await DB.auditlog.add({
    UserID: u?.UserID || 0,
    Action: action,
    Timestamp: new Date().toISOString(),
    Details: details,
  });
}
