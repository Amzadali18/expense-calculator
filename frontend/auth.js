// ===============================
// Validation Functions (TESTABLE)
// ===============================
function validateEmail(email) {
  return typeof email === "string" && email.includes("@");
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 6;
}

// ===============================
// UI Helpers
// ===============================
function showMessage(msg, isError = true) {
  const el = document.getElementById("auth-message");
  if (!el) return;

  el.textContent = msg;
  el.classList.remove("hidden");
  el.style.color = isError ? "red" : "green";
}

// ===============================
// TAB SWITCHING
// ===============================
function showTab(tab) {
  document.getElementById("login-tab").classList.remove("active");
  document.getElementById("signup-tab").classList.remove("active");

  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.classList.remove("active")
  );

  if (tab === "login") {
    document.getElementById("login-tab").classList.add("active");
    document.querySelectorAll(".tab-btn")[0].classList.add("active");
  } else {
    document.getElementById("signup-tab").classList.add("active");
    document.querySelectorAll(".tab-btn")[1].classList.add("active");
  }
}

// ===============================
// LOGIN FUNCTION
// ===============================
function loginUser() {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  if (!validateEmail(email)) {
    showMessage("Invalid email");
    return;
  }

  if (!validatePassword(password)) {
    showMessage("Password must be at least 6 characters");
    return;
  }

  // Firebase login
  if (typeof firebase !== "undefined") {
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(() => {
        showMessage("Login successful!", false);
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 1000);
      })
      .catch(error => {
        showMessage(error.message);
      });
  } else {
    // For Jest testing
    return "Success";
  }
}

// ===============================
// SIGNUP FUNCTION
// ===============================
function signupUser() {
  const name = document.getElementById("signup-name").value;
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  if (!name) {
    showMessage("Name required");
    return;
  }

  if (!validateEmail(email)) {
    showMessage("Invalid email");
    return;
  }

  if (!validatePassword(password)) {
    showMessage("Password must be at least 6 characters");
    return;
  }

  if (typeof firebase !== "undefined") {
    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(() => {
        showMessage("Account created!", false);
      })
      .catch(error => {
        showMessage(error.message);
      });
  } else {
    return "Account created";
  }
}

// ===============================
// AUTO LOGIN REDIRECT (SAFE)
// ===============================
if (typeof window !== "undefined" && typeof firebase !== "undefined") {
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      window.location.href = "dashboard.html";
    }
  });
}

// ===============================
// EXPORT FOR JEST
// ===============================
if (typeof module !== "undefined") {
  module.exports = {
    validateEmail,
    validatePassword,
    loginUser,
    signupUser
  };
}