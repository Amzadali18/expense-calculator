// auth.js
// Handles Login and Signup using Firebase Authentication

// ── Show/hide Login vs Signup form ──────────────────
function showTab(tab) {
  // Remove 'active' from all tabs and content
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  // Activate the selected tab
  document.querySelector(`[onclick="showTab('${tab}')"]`).classList.add("active");
  document.getElementById(`${tab}-tab`).classList.add("active");

  // Clear any previous messages
  showMessage("", "");
}

// ── Show message to user ─────────────────────────────
function showMessage(text, type) {
  const el = document.getElementById("auth-message");
  if (!text) { el.classList.add("hidden"); return; }
  el.textContent = text;
  el.className = `message ${type}`;
}

// ── SIGNUP: Create new account ───────────────────────
async function signupUser() {
  const name     = document.getElementById("signup-name").value.trim();
  const email    = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  // Basic validation
  if (!name || !email || !password) {
    return showMessage("Please fill in all fields.", "error");
  }
  if (password.length < 6) {
    return showMessage("Password must be at least 6 characters.", "error");
  }

  try {
    // Create user in Firebase Authentication
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    
    // Update their display name
    await userCredential.user.updateProfile({ displayName: name });

    showMessage("Account created! Redirecting...", "success");
    
    // Wait 1.5 seconds then go to dashboard
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1500);

  } catch (error) {
    // Firebase gives error codes we can translate to friendly messages
    const msg = {
      "auth/email-already-in-use": "This email is already registered.",
      "auth/invalid-email":        "Please enter a valid email.",
      "auth/weak-password":        "Password is too weak.",
    }[error.code] || error.message;

    showMessage(msg, "error");
  }
}

// ── LOGIN: Sign into existing account ────────────────
async function loginUser() {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    return showMessage("Please enter your email and password.", "error");
  }

  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    showMessage("Login successful! Redirecting...", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 1000);

  } catch (error) {
    const msg = {
      "auth/user-not-found":  "No account found with this email.",
      "auth/wrong-password":  "Incorrect password.",
      "auth/invalid-email":   "Invalid email address.",
    }[error.code] || "Login failed. Please try again.";

    showMessage(msg, "error");
  }
}

// ── Auto-redirect if already logged in ───────────────
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    // User is already logged in, go to dashboard
    window.location.href = "dashboard.html";
  }
});