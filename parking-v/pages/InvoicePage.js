// pages/InvoicePage.js

class InvoicePage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('http://localhost:3030/');
  }

  /**
   * Klik tombol Pay (span) pada row invoice tertentu berdasarkan invoiceId.
   * Dari recording: page.getByRole('row', { name: '...' }).locator('span').click()
   * Karena invoiceId di seed berubah tiap reset DB, kita pakai pendekatan
   * yang lebih fleksibel — cari row pertama dengan status 'pending'.
   */
  async clickPayOnFirstPendingInvoice() {
    // Cari row yang mengandung teks 'pending' dan klik span (tombol Pay) di dalamnya
    const pendingRow = this.page
      .getByRole('row')
      .filter({ hasText: 'pending' })
      .first();

    // Ambil invoiceId dari data-testid pay-success button di row tersebut
    const paySuccessBtn = pendingRow.locator('[data-testid^="pay-success-"]');
    const testId = await paySuccessBtn.getAttribute('data-testid');
    this.currentInvoiceId = testId.replace('pay-success-', '');

    // Klik span (toggle/expand row) untuk munculkan tombol Pay
    await pendingRow.locator('span').first().click();
    return this.currentInvoiceId;
  }

  async paySuccess(invoiceId) {
    await this.page.getByTestId(`pay-success-${invoiceId}`).click();
  }

  async payFail(invoiceId) {
    await this.page.getByTestId(`pay-simulate-fail-${invoiceId}`).click();
  }

  /** Helper: klik pay span lalu langsung bayar sukses */
  async payFirstPendingWithSuccess() {
    const invoiceId = await this.clickPayOnFirstPendingInvoice();
    await this.paySuccess(invoiceId);
    return invoiceId;
  }

  /** Helper: klik pay span lalu simulate gagal */
  async payFirstPendingWithFail() {
    const invoiceId = await this.clickPayOnFirstPendingInvoice();
    await this.payFail(invoiceId);
    return invoiceId;
  }

  /** Ambil status dari row invoice berdasarkan invoiceId */
  async getInvoiceStatus(invoiceId) {
    const row = this.page
      .getByRole('row')
      .filter({ hasText: invoiceId });
    const text = await row.textContent();
    if (text.includes('paid')) return 'paid';
    if (text.includes('failed')) return 'failed';
    if (text.includes('pending')) return 'pending';
    return 'unknown';
  }

  async isPaidStatusVisible(invoiceId) {
    const row = this.page
      .getByRole('row')
      .filter({ hasText: invoiceId });
    return await row.locator(':has-text("paid")').isVisible();
  }

  async isPayButtonVisible(invoiceId) {
    return await this.page.getByTestId(`pay-success-${invoiceId}`).isVisible();
  }
}

module.exports = { InvoicePage };
