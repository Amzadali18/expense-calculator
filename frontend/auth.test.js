const {
  validateEmail,
  validatePassword,
  loginUser,
  signupUser
} = require('./js/auth');

// Email Tests
test("Valid email should pass", () => {
  expect(validateEmail("test@gmail.com")).toBe(true);
});

test("Invalid email should fail", () => {
  expect(validateEmail("abc")).toBe(false);
});

// Password Tests
test("Valid password should pass", () => {
  expect(validatePassword("123456")).toBe(true);
});

test("Short password should fail", () => {
  expect(validatePassword("123")).toBe(false);
});

// Login Tests
test("Login fails with invalid email", () => {
  expect(loginUser("abc", "123456")).toBe("Invalid email");
});

test("Login fails with short password", () => {
  expect(loginUser("test@gmail.com", "123")).toBe(
    "Password must be at least 6 characters"
  );
});

test("Login success case", () => {
  expect(loginUser("test@gmail.com", "123456")).toBe("Success");
});

// Signup Tests
test("Signup fails without name", () => {
  expect(signupUser("", "test@gmail.com", "123456")).toBe("Name required");
});

test("Signup fails with invalid email", () => {
  expect(signupUser("Amzad", "abc", "123456")).toBe("Invalid email");
});

test("Signup success", () => {
  expect(signupUser("Amzad", "test@gmail.com", "123456"))
    .toBe("Account created");
});