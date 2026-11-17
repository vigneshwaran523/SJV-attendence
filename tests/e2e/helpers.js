import { test, expect } from "@playwright/test";

export async function signIn(page, { role, username, password }) {
  test.skip(
    !username || !password,
    `Set ${role === "admin" ? "ADMIN_EMAIL / ADMIN_PASSWORD" : "TL_ID / TL_PASSWORD"} in .env.test to run this sign-in check.`,
  );

  await page.goto(role === "admin" ? "/admin-login" : "/");

  if (role === "admin") {
    await page.locator('input[type="email"]').fill(username);
  } else {
    await page.getByPlaceholder("e.g. TL-1001").fill(username);
  }

  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  try {
    await expect(page).toHaveURL(
      role === "admin" ? /\/admin$/ : /\/attendance$/,
      { timeout: 30_000 },
    );
  } catch (error) {
    const pageText = (await page.locator("body").innerText()).slice(-500);
    throw new Error(
      `${role} sign-in did not complete. Current URL: ${page.url()}. Page message: ${pageText}`,
      { cause: error },
    );
  }
}

export { expect, test };
