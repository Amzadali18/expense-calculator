// Validation functions (testable)
function validateEmail(email) {
  return typeof email === "string" && email.includes("@");
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 6;
}

// Login function
function loginUser(email, password) {
  if (!validateEmail(email)) {
    return "Invalid email";
  }
  if (!validatePassword(password)) {
    return "Password must be at least 6 characters";
  }
  return "Success"; // Firebase call happens separately
}

// Signup function
function signupUser(name, email, password) {
  if (!name) return "Name required";
  if (!validateEmail(email)) return "Invalid email";
  if (!validatePassword(password)) return "Weak password";
  return "Account created";
}

// Export for Jest
module.exports = {
  validateEmail,
  validatePassword,
  loginUser,
  signupUser
};