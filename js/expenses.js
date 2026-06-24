/**
 * expenses.js – Expenses management page
 * Beskpoke Tailor Shop
 */

const ExpensesPage = (() => {
  let allExpenses = [];
  let editId = null;
  let currentPage = 1;
  const PER_PAGE = 10;

  async function load() {
    allExpenses = await DB.expenses.getAll();
    currentPage = 1;
    render();
    document.getElementById("expenses-search").oninput = render;
  }

  function render() {
    const q = (
      document.getElementById("expenses-search").value || ""
    ).toLowerCase();
    const filtered = allExpenses.filter(
      (e) =>
        e.Name.toLowerCase().includes(q) ||
        (e.Remark || "").toLowerCase().includes(q) ||
        String(e.ExpenseDate).includes(q) ||
        String(e.Amount).includes(q),
    );
    const total = filtered.length;
    const totalAmount = filtered.reduce((s, e) => s + (e.Amount || 0), 0);
    const paged = filtered.slice(
      (currentPage - 1) * PER_PAGE,
      currentPage * PER_PAGE,
    );

    const tbody = document.getElementById("expenses-tbody");
    tbody.innerHTML =
      paged.length === 0
        ? `<tr><td colspan="6" class="table-empty"><div class="empty-icon">💰</div>No expenses found.</td></tr>`
        : paged
            .map(
              (e) => `<tr>
          <td class="font-mono text-muted">#${e.ExpenseID}</td>
          <td>${fmtDate(e.ExpenseDate)}</td>
          <td><strong>${sanitize(e.Name)}</strong></td>
          <td class="text-right font-mono">${fmtCurrency(e.Amount)}</td>
          <td class="text-muted">${sanitize(e.Remark || "—")}</td>
          <td class="text-right">
            <button class="btn btn-ghost btn-sm" onclick="ExpensesPage.edit(${e.ExpenseID})">✏️</button>
            ${Auth.isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="ExpensesPage.delete(${e.ExpenseID})">🗑</button>` : ""}
          </td>
        </tr>`,
            )
            .join("");

    document.getElementById("expenses-count").textContent = total;
    document.getElementById("expenses-total").textContent =
      fmtCurrency(totalAmount);
    renderPagination(
      document.getElementById("expenses-pagination"),
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
    document.getElementById("exp-modal-title").textContent =
      "💰 Add Expense";
    document.getElementById("exp-date").value = todayStr();
    document.getElementById("exp-name").value = "";
    document.getElementById("exp-amount").value = "";
    document.getElementById("exp-remark").value = "";
    document.getElementById("exp-id-hidden").value = "";
    clearValidation(document.getElementById("expense-modal-form"));
    Modal.open("modal-expense");
  }

  async function edit(id) {
    editId = id;
    const e = await DB.expenses.get(id);
    document.getElementById("exp-modal-title").textContent =
      "✏️ Edit Expense";
    document.getElementById("exp-date").value = e.ExpenseDate;
    document.getElementById("exp-name").value = e.Name;
    document.getElementById("exp-amount").value = e.Amount;
    document.getElementById("exp-remark").value = e.Remark || "";
    document.getElementById("exp-id-hidden").value = id;
    clearValidation(document.getElementById("expense-modal-form"));
    Modal.open("modal-expense");
  }

  async function save() {
    if (
      !validateFields([
        { el: document.getElementById("exp-date"), msg: "Date is required." },
        {
          el: document.getElementById("exp-name"),
          msg: "Name is required.",
        },
        {
          el: document.getElementById("exp-amount"),
          msg: "Amount is required.",
        },
      ])
    )
      return;

    const payload = {
      ExpenseDate: document.getElementById("exp-date").value,
      Name: document.getElementById("exp-name").value.trim(),
      Amount: parseFloat(document.getElementById("exp-amount").value),
      Remark:
        document.getElementById("exp-remark").value.trim() || null,
    };

    try {
      if (editId) {
        payload.ExpenseID = editId;
        await DB.expenses.put(payload);
        Toast.success("Expense updated.");
      } else {
        await DB.expenses.add(payload);
        Toast.success("Expense added.");
      }
      Modal.close("modal-expense");
      await load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  async function deleteExpense(id) {
    const ok = await Confirm.show(
      "Delete this expense record?",
      "Delete Expense",
    );
    if (!ok) return;
    try {
      await DB.expenses.delete(id);
      Toast.success("Expense deleted.");
      await load();
    } catch (err) {
      Toast.error(err.message);
    }
  }

  return { load, openAdd, edit, save, delete: deleteExpense };
})();
