// expenses.js
// Handles all expense operations: Add, Edit, Delete, List, Chart
const API_BASE = window.location.origin + "/api";  // Dynamically points to Nginx proxy

let currentUser   = null;  // Stores logged-in user info
let authToken     = null;  // Firebase ID token for API requests
let expenseChart  = null;  // Chart.js instance
let allExpenses   = [];    // Local copy of expenses
let budgetLimit   = 5000;  // Custom budget limit

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
  await loadBudgetLimit();
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
        <div class="expense-meta">
          ${exp.category} · ${exp.date}${exp.note ? " · " + escapeHtml(exp.note) : ""}
          ${exp.receipt_url ? ` · <a href="${exp.receipt_url}" target="_blank" style="color: #6c63ff; text-decoration: none; font-weight: 600;">📸 View Receipt</a>` : ""}
        </div>
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
    // ── Upload Receipt if present ──
    const fileInput = document.getElementById("exp-receipt");
    if (fileInput && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append("receipt", file);
      
      const msgEl = document.getElementById("receipt-upload-msg");
      if (msgEl) msgEl.style.display = "block";

      const uploadRes = await fetch(`${API_BASE}/upload-receipt`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${authToken}` },
        body: formData
      });
      
      if (msgEl) msgEl.style.display = "none";

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        payload.receipt_url = uploadData.receipt_url;
      } else {
        console.error("Failed to upload receipt:", await uploadRes.text());
      }
    }

    if (editId) {
      // UPDATE existing expense
      const res = await fetch(`${API_BASE}/expenses/${editId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        let errMsg = "Failed to update expense";
        try {
          const errorData = await res.json();
          errMsg = errorData.error || errMsg;
        } catch (e) {
          errMsg = `Server Error (${res.status}): Please check backend container logs.`;
        }
        throw new Error(errMsg);
      }
      showFormMessage("Expense updated!", "success");
      cancelEdit();  // Reset form

    } else {
      // ADD new expense
      const res = await fetch(`${API_BASE}/expenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        let errMsg = "Failed to add expense";
        try {
          const errorData = await res.json();
          errMsg = errorData.error || errMsg;
        } catch (e) {
          errMsg = `Server Error (${res.status}): Please check backend container logs.`;
        }
        throw new Error(errMsg);
      }
      showFormMessage("Expense added!", "success");
      clearForm();
    }

    // Refresh the list
    setTimeout(() => {
      loadExpenses();
      hideFormMessage();
    }, 1000);

  } catch (err) {
    showFormMessage(err.message || "Something went wrong. Try again.", "error");
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
  const fileInput = document.getElementById("exp-receipt");
  if (fileInput) fileInput.value = "";
  const fileDisplay = document.getElementById("file-name-display");
  if (fileDisplay) fileDisplay.innerText = "Click to select receipt image";
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
  if (total < budgetLimit) return;  // only alert if over budget limit

  const month = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  try {
    await emailjs.send("service_qcsgyl8", "template_ns6icld", {
      to_name:  currentUser.displayName || "User",
      to_email: currentUser.email,
      total:    total.toFixed(2),
      month:    month,
      limit:    budgetLimit
    });
    console.log("Alert email sent!");
  } catch (err) {
    console.error("Email alert failed:", err);
  }
}

// ── Budget Limit Logic ────────────────────────────────
async function loadBudgetLimit() {
  try {
    const response = await fetch(`${API_BASE}/budget`, {
      headers: { "Authorization": `Bearer ${authToken}` }
    });
    const data = await response.json();
    budgetLimit = data.limit || 5000;
    const inputField = document.getElementById("budget-limit");
    if (inputField) inputField.value = budgetLimit;
  } catch (err) {
    console.error("Failed to load budget limit:", err);
  }
}

// ── Export to CSV ─────────────────────────────────────
function exportToCSV() {
  if (!allExpenses || allExpenses.length === 0) {
    alert("No expenses to export!");
    return;
  }
  
  const headers = ["Date", "Category", "Title", "Amount", "Note", "Receipt URL"];
  
  const rows = allExpenses.map(exp => {
    return [
      exp.date,
      `"${exp.category}"`,
      `"${exp.title.replace(/"/g, '""')}"`,
      exp.amount,
      `"${(exp.note || "").replace(/"/g, '""')}"`,
      `"${exp.receipt_url || ""}"`
    ].join(",");
  });
  
  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `expenses_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link); // Required for FF
  link.click();
  document.body.removeChild(link);
}

async function saveBudgetLimit() {
  const newLimit = parseFloat(document.getElementById("budget-limit").value);
  if (!newLimit || newLimit <= 0) return;

  try {
    const response = await fetch(`${API_BASE}/budget`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({ limit: newLimit })
    });
    
    if (response.ok) {
      budgetLimit = newLimit;
      const msg = document.getElementById("budget-message");
      msg.style.display = "block";
      setTimeout(() => msg.style.display = "none", 3000);
      
      // Re-check expenses against new limit
      const total = parseFloat(document.getElementById("total-amount").textContent);
      checkSpendingAlert(total);
    }
  } catch (err) {
    console.error("Failed to save budget limit:", err);
  }
}