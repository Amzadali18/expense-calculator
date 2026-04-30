// expenses.js
// Handles all expense operations: Add, Edit, Delete, List, Chart
const API_BASE = "https://expense-calculator-pkjs.onrender.com";  // Flask backend URL

let currentUser   = null;  // Stores logged-in user info
let authToken     = null;  // Firebase ID token for API requests
let expenseChart  = null;  // Chart.js instance
let allExpenses   = [];    // Local copy of expenses

// ── Category icon mapping ─────────────────────────────
const CATEGORY_ICONS = {
  "Food":          "🍔",
  "Travel":        "✈️",
  "Shopping":      "🛍️",
  "Bills":         "💡",
  "Health":        "💊",
  "Entertainment": "🎬",
  "Education":     "📚",
  "Other":         "📦",
};

// ── Wait for Firebase to confirm login ───────────────
firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("exp-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("month-filter").value = new Date().toISOString().slice(0, 7);
  authToken = await user.getIdToken();

  emailjs.init("_CZ14jL2sTIJQf_Uh");

  loadExpenses();
});

// ── Fetch expenses from Flask backend ────────────────
async function loadExpenses() {
  const month = document.getElementById("month-filter").value;

  try {
    const response = await fetch(`${API_BASE}/expenses?month=${month}`, {
      headers: { "Authorization": `Bearer ${authToken}` }
    });

    const data = await response.json();
    allExpenses = data.expenses || [];

    // Update UI
    displayExpenses(allExpenses);
    updateSummaryCard(data.total, allExpenses.length);
    checkSpendingAlert(data.total);
    loadChart(month);

  } catch (err) {
    console.error("Error loading expenses:", err);
  }
}

// ── Render expense list on screen ────────────────────
function displayExpenses(expenses) {
  const container = document.getElementById("expense-list");

  if (expenses.length === 0) {
    container.innerHTML = `<p class="no-data-msg">No expenses this month. Add your first one!</p>`;
    return;
  }

  // Build HTML for each expense
  container.innerHTML = expenses.map(exp => `
    <div class="expense-item" id="item-${exp.id}">
      <div class="category-badge">${CATEGORY_ICONS[exp.category] || "📦"}</div>
      <div class="expense-info">
        <div class="expense-title">${escapeHtml(exp.title)}</div>
        <div class="expense-meta">${exp.category} · ${exp.date}${exp.note ? " · " + escapeHtml(exp.note) : ""}</div>
      </div>
      <div class="expense-amount">₹${exp.amount.toFixed(2)}</div>
      <div class="expense-actions">
        <button class="btn-edit"   onclick="editExpense('${exp.id}')">✏️ Edit</button>
        <button class="btn-delete" onclick="deleteExpense('${exp.id}')">🗑️ Del</button>
      </div>
    </div>
  `).join("");
}

// ── Update the total card ─────────────────────────────
function updateSummaryCard(total, count) {
  document.getElementById("total-amount").textContent = total.toFixed(2);
  document.getElementById("expense-count").textContent = `${count} expense${count !== 1 ? "s" : ""}`;
}

// ── Load/Update the category chart ───────────────────
async function loadChart(month) {
  try {
    const response = await fetch(`${API_BASE}/summary?month=${month}`, {
      headers: { "Authorization": `Bearer ${authToken}` }
    });

    const data = await response.json();
    const summary = data.summary || {};
    const labels  = Object.keys(summary);
    const values  = Object.values(summary);

    const noMsg = document.getElementById("no-chart-msg");
    const canvas = document.getElementById("categoryChart");

    if (labels.length === 0) {
      noMsg.style.display = "block";
      canvas.style.display = "none";
      return;
    }

    noMsg.style.display = "none";
    canvas.style.display = "block";

    // Pretty colors for each category
    const colors = ["#6c63ff","#22c55e","#f59e0b","#ef4444","#06b6d4","#ec4899","#8b5cf6","#84cc16"];

    // Destroy old chart before creating new one
    if (expenseChart) expenseChart.destroy();

    expenseChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: "#1a1d27",
          borderWidth: 3,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#8891aa", font: { size: 11, family: "Sora" }, padding: 12 }
          },
          tooltip: {
            callbacks: {
              // Show amount in tooltip
              label: (ctx) => ` ₹${ctx.raw.toFixed(2)}`
            }
          }
        }
      }
    });

  } catch (err) {
    console.error("Error loading chart:", err);
  }
}

// ── Save expense (Add or Update) ─────────────────────
async function saveExpense() {
  const title    = document.getElementById("exp-title").value.trim();
  const amount   = document.getElementById("exp-amount").value;
  const category = document.getElementById("exp-category").value;
  const date     = document.getElementById("exp-date").value;
  const note     = document.getElementById("exp-note").value.trim();
  const editId   = document.getElementById("edit-id").value;

  // Validation
  if (!title) return showFormMessage("Please enter a title.", "error");
  if (!amount || parseFloat(amount) <= 0) return showFormMessage("Please enter a valid amount.", "error");
  if (!date)   return showFormMessage("Please select a date.", "error");

  const payload = { title, amount: parseFloat(amount), category, date, note };

  try {
    if (editId) {
      // UPDATE existing expense
      await fetch(`${API_BASE}/expenses/${editId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });
      showFormMessage("Expense updated!", "success");
      cancelEdit();  // Reset form

    } else {
      // ADD new expense
      await fetch(`${API_BASE}/expenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });
      showFormMessage("Expense added!", "success");
      clearForm();
    }

    // Refresh the list
    setTimeout(() => {
      loadExpenses();
      hideFormMessage();
    }, 1000);

  } catch (err) {
    showFormMessage("Something went wrong. Try again.", "error");
  }
}

// ── Pre-fill form for editing ─────────────────────────
function editExpense(id) {
  // Find the expense in our local array
  const exp = allExpenses.find(e => e.id === id);
  if (!exp) return;

  // Fill the form
  document.getElementById("exp-title").value    = exp.title;
  document.getElementById("exp-amount").value   = exp.amount;
  document.getElementById("exp-category").value = exp.category;
  document.getElementById("exp-date").value     = exp.date;
  document.getElementById("exp-note").value     = exp.note || "";
  document.getElementById("edit-id").value      = id;

  // Update form UI to show "Edit" mode
  document.getElementById("form-title").textContent = "✏️ Edit Expense";
  document.getElementById("cancel-btn").classList.remove("hidden");

  // Scroll to form
  document.querySelector(".form-card").scrollIntoView({ behavior: "smooth" });
}

// ── Delete an expense ─────────────────────────────────
async function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;

  try {
    await fetch(`${API_BASE}/expenses/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${authToken}` }
    });

    // Remove from UI immediately (no need to reload)
    const item = document.getElementById(`item-${id}`);
    if (item) item.remove();

    // Reload to update total
    loadExpenses();

  } catch (err) {
    alert("Failed to delete. Please try again.");
  }
}

// ── Cancel editing ────────────────────────────────────
function cancelEdit() {
  clearForm();
  document.getElementById("edit-id").value = "";
  document.getElementById("form-title").textContent = "➕ Add New Expense";
  document.getElementById("cancel-btn").classList.add("hidden");
}

// ── Clear the form inputs ─────────────────────────────
function clearForm() {
  document.getElementById("exp-title").value  = "";
  document.getElementById("exp-amount").value = "";
  document.getElementById("exp-note").value   = "";
  document.getElementById("exp-date").value   = new Date().toISOString().split("T")[0];
  document.getElementById("exp-category").value = "Food";
}

// ── Logout ────────────────────────────────────────────
function logoutUser() {
  firebase.auth().signOut().then(() => {
    window.location.href = "index.html";
  });
}

// ── Utility: Show/hide form messages ─────────────────
function showFormMessage(text, type) {
  const el = document.getElementById("form-message");
  el.textContent = text;
  el.className = `message ${type}`;
}
function hideFormMessage() {
  document.getElementById("form-message").className = "message hidden";
}

// ── Utility: Prevent XSS (security) ──────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
// ── Email Alert (EmailJS) ─────────────────────────

async function checkSpendingAlert(total) {
  if (total < 5000) return;  // only alert if over ₹5000

  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  try {
    await emailjs.send("service_qcsgyl8", "template_ns6icld", {
      to_name:  currentUser.displayName || "User",
      to_email: currentUser.email,
      total:    total.toFixed(2),
      month:    month
    });
    console.log("Alert email sent!");
  } catch (err) {
    console.error("Email alert failed:", err);
  }
}