// pages/LoginPage.js

class LoginPage {
  constructor(page) {
    this.page = page;
    this.emailInput    = page.getByTestId('email');
    this.passwordInput = page.getByTestId('password');
    this.submitButton  = page.getByTestId('submit');
    this.errorMessage  = page.getByTestId('error'); // sesuaikan jika selector berbeda
  }

  async goto() {
    await this.page.goto('http://localhost:3030/login');
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async isErrorVisible() {
    return await this.errorMessage.isVisible();
  }
}

module.exports = { LoginPage };
