const { journey } = require("./lib.cjs");

module.exports = journey(
  { id: "j08", title: "Sign in and reach today's work", story: "SIGNIN-NAVIGATION", persona: null },
  async (ui) => {
    const user = ui.info.users.reception;
    const booked = ui.info.seeded.appointments.today.map((a) => a.patient);
    await ui.start("/login");
    await ui.screen("login");
    await ui.fill(ui.page.getByLabel("Phone or email"), user.email, "Phone or email");
    await ui.fill(ui.page.getByLabel("Password"), user.password, "Password");
    await ui.click(ui.page.getByRole("button", { name: "Sign in" }), "Sign in");
    await ui.page.waitForURL(/\/dashboard$/);
    const schedule = ui.page.getByRole("list", { name: "Today's appointments" });
    for (const name of booked) await schedule.getByText(name, { exact: false }).first().waitFor();
    await ui.screen("landing");
    const shown = await schedule.innerText();
    ui.goal(
      /\/dashboard$/.test(ui.page.url()) && booked.every((name) => shown.includes(name)),
      `receptionist sees today's schedule with booked patients (${booked.join(", ")}) on the landing page`,
    );
  },
);
if (require.main === module) module.exports.cli();
