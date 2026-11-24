const { test, expect } = require('@playwright/test');

// Unikalne adresy, żeby test można było puszczać wielokrotnie na tej samej bazie.
const run = Date.now();
const ala = { name: 'Ala', email: `ala.${run}@example.com`, password: 'tajnehaslo1' };
const ola = { name: 'Ola', email: `ola.${run}@example.com`, password: 'tajnehaslo2' };

async function register(page, user) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Rejestracja' }).click();
  const form = page.locator('#register-form');
  await form.getByLabel('Imię').fill(user.name);
  await form.getByLabel('E-mail').fill(user.email);
  await form.getByLabel('Hasło').fill(user.password);
  await form.getByRole('button', { name: 'Załóż konto' }).click();
  await expect(page.getByTestId('current-user')).toContainText(user.email);
}

test('API i frontend odpowiadają', async ({ request, page }) => {
  expect((await request.get('/api/health')).ok()).toBeTruthy();
  expect((await request.get('/api/auth/health')).ok()).toBeTruthy();
  await page.goto('/');
  await expect(page).toHaveTitle(/DzielMy/);
  // Niezalogowany użytkownik widzi tylko formularz logowania.
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('#app-view')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Wyloguj' })).toBeHidden();
});

test('błędne hasło nie loguje', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('#login-form');
  await form.getByLabel('E-mail').fill('nie.ma@example.com');
  await form.getByLabel('Hasło').fill('zlehaslo123');
  await form.getByRole('button', { name: 'Zaloguj' }).click();
  await expect(page.locator('#message')).toContainText('Nieprawidłowy e-mail lub hasło');
});

test('pełny scenariusz: rejestracja, grupa, wydatki, rozliczenie', async ({ browser }) => {
  // Ola zakłada konto w osobnej sesji przeglądarki.
  const olaPage = await (await browser.newContext()).newPage();
  await register(olaPage, ola);

  const page = await (await browser.newContext()).newPage();
  await register(page, ala);

  // Grupa i członek
  await page.getByPlaceholder('Nazwa nowej grupy').fill('Mieszkanie');
  await page.getByRole('button', { name: 'Utwórz' }).click();
  await expect(page.getByTestId('group-name')).toHaveText('Mieszkanie');
  await page.getByPlaceholder('E-mail zarejestrowanej osoby').fill(ola.email);
  await page.getByRole('button', { name: 'Dodaj' }).click();
  await expect(page.locator('#member-list')).toContainText('Ola');

  // Dodanie wydatku
  const form = page.locator('#expense-form');
  await form.getByPlaceholder('Opis').fill('Czynsz');
  await form.getByPlaceholder('Kwota').fill('2000');
  await form.getByLabel('Kto zapłacił').selectOption({ label: 'Ala' });
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByTestId('expense-row')).toHaveCount(1);
  await expect(page.getByTestId('transfers')).toContainText('Ola → Ala');
  await expect(page.getByTestId('transfers')).toContainText('1000,00');

  // Edycja wydatku
  await page.getByTestId('expense-row').getByRole('button', { name: 'Edytuj' }).click();
  await form.getByPlaceholder('Kwota').fill('2100,50');
  await form.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByTestId('expense-row')).toContainText('2100,50');
  await expect(page.getByTestId('transfers')).toContainText('1050,25');

  // Ola widzi tę samą grupę i rozliczenie, ale nie ma przycisków właściciela
  await olaPage.reload();
  await olaPage.locator('#group-list').getByText('Mieszkanie').click();
  await expect(olaPage.getByTestId('transfers')).toContainText('Ola → Ala');
  await expect(olaPage.getByRole('button', { name: 'Usuń grupę' })).toBeHidden();
  await expect(olaPage.locator('#member-form')).toBeHidden();

  // Usunięcie wydatku
  await page.getByTestId('expense-row').getByRole('button', { name: 'Usuń' }).click();
  await expect(page.getByTestId('expense-row')).toHaveCount(0);
  await expect(page.getByTestId('transfers')).toContainText('Wszyscy są rozliczeni');
});
