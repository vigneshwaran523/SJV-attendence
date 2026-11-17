
import { expect, signIn, test } from "./helpers.js";

const credentials = {
  role: "teamleader",
  username: process.env.TL_ID,
  password: process.env.TL_PASSWORD,
};

// TEST 1: Team Leader can login and open attendance
test("team leader can sign in and open attendance", async ({ page }) => {
  await signIn(page, credentials);

  await expect(
    page.getByText(/attendance/i).first()
  ).toBeVisible();
});

// TEST 2: Signed-out visitors cannot access attendance
test("signed-out visitors are redirected away from attendance", async ({ page }) => {
  await page.goto("/attendance");

  await expect(page).toHaveURL(/\/$/);

  await expect(
    page.getByText("Welcome back")
  ).toBeVisible();
});

// TEST 3: Team Leader cannot access Admin dashboard
test("team leader cannot open the admin dashboard", async ({ page }) => {
  await signIn(page, credentials);

  await page.goto("/admin");

  await expect(page).toHaveURL(/\/$/);
});