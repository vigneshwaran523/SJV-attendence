import { expect, signIn, test } from "./helpers.js";

test("admin and team leader can stay signed in at the same time without sharing roles", async ({ browser }) => {
  test.setTimeout(90_000);
  const adminContext = await browser.newContext();
  const teamLeaderContext = await browser.newContext();

  try {
    const adminPage = await adminContext.newPage();
    const teamLeaderPage = await teamLeaderContext.newPage();

    // Separate browser contexts represent two people using separate sessions.
    await Promise.all([
      signIn(adminPage, {
        role: "admin",
        username: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
       
      }),
      signIn(teamLeaderPage, {
        role: "teamleader",
        username: process.env.TL_ID,
        password: process.env.TL_PASSWORD,
        username: process.env.TL_ID1,
        password: process.env.TL_PASSWORD1,
      }),
    ]);

    await expect(adminPage).toHaveURL(/\/admin$/);
    await expect(teamLeaderPage).toHaveURL(/\/attendance$/);

    // An admin's access check cannot promote the team leader, or sign them out.
    await adminPage.goto("/attendance");
    await expect(adminPage).toHaveURL(/\/$/);
    await expect(teamLeaderPage).toHaveURL(/\/attendance$/);

    // A team leader's access check cannot grant admin access, or sign the admin out.
    await teamLeaderPage.goto("/admin");
    await expect(teamLeaderPage).toHaveURL(/\/$/);
    await adminPage.goto("/admin");
    await expect(adminPage).toHaveURL(/\/admin$/);
    await teamLeaderPage.goto("/attendance");
    await expect(teamLeaderPage).toHaveURL(/\/attendance$/);
  } finally {
    await Promise.all([
      adminContext.close(),
      teamLeaderContext.close(),
    ]);
  }
});

test("a second team leader sign-in ends the first session and shows a message", async ({ browser }) => {
  test.setTimeout(90_000);
  const firstDevice = await browser.newContext();
  const secondDevice = await browser.newContext();

  try {
    const firstPage = await firstDevice.newPage();
    const secondPage = await secondDevice.newPage();
    const leaderCredentials = {
      role: "teamleader",
      username: process.env.TL_ID,
      password: process.env.TL_PASSWORD,
    };

    await signIn(firstPage, leaderCredentials);
    await signIn(secondPage, leaderCredentials);

    await expect(firstPage).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(
      firstPage.getByText(/signed out because this account was used to sign in on another device/i),
    ).toBeVisible();
    await expect(secondPage).toHaveURL(/\/attendance$/);
  } finally {
    await Promise.all([firstDevice.close(), secondDevice.close()]);
  }
});
