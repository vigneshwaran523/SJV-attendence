import { expect, signIn, test } from "./helpers.js";

const credentials = {
  role: "admin",
  username: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
};

test("admin can sign in and open the dashboard", async ({ page }) => {
  await signIn(page, credentials);
  await expect(page.locator("body")).toBeVisible();
});

test("signed-out visitors are redirected away from the admin dashboard", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Welcome back")).toBeVisible();
});

test("admin cannot open team leader attendance", async ({ page }) => {
  await signIn(page, credentials);
  await page.goto("/attendance");
  await expect(page).toHaveURL(/\/$/);
});
