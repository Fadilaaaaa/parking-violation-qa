// pages/ViolationPage.js

class ViolationPage {
  constructor(page) {
    this.page = page;
    this.violationTypeSelect = page.getByTestId('vtype');
    this.plateSelect         = page.getByTestId('plate');
    this.locationInput       = page.getByTestId('location');
    this.occurredAtInput     = page.getByTestId('occurred-at');
    this.submitButton        = page.getByTestId('submit-violation');
    this.successMessage      = page.getByTestId('success'); // sesuaikan jika selector berbeda
    this.errorMessage        = page.getByTestId('error');   // sesuaikan jika selector berbeda
  }

  async submitViolation({ plate, type, location, occurredAt }) {
    await this.violationTypeSelect.selectOption(type);
    await this.plateSelect.selectOption(plate);
    await this.locationInput.fill(location);
    await this.occurredAtInput.fill(occurredAt);
    await this.submitButton.click();
  }

  async isSuccessVisible() {
    return await this.successMessage.isVisible();
  }

  async isErrorVisible() {
    return await this.errorMessage.isVisible();
  }
}

module.exports = { ViolationPage };
