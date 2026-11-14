const { journey } = require("./lib.cjs");

module.exports = journey(
  { id: "j08", title: "Sign in and reach today's work", story: "SIGNIN-NAVIGATION", persona: null },
  async (ui) => {
    const user = ui.info.users.reception;
    await ui.start("/login");
    await ui.screen("login");
    await ui.fill('input[placeholder="Phone or email"]', user.email, "Phone or email");
    await ui.fill('input[type="password"]', user.password, "Password");
    await ui.click(ui.page.getByRole("button", { name: "Sign in" }), "Sign in");
    await ui.page.waitForURL(/\/dashboard/);
    await ui.page.getByText(user.firstName, { exact: false }).first().waitFor();
    await ui.screen("landing");
    await ui.click(ui.page.getByRole("link", { name: "Appointments" }), "Menu: Appointments");
    await ui.page.getByPlaceholder("Name or phone").waitFor();
    await ui.page.getByText("Vikram Patil").first().waitFor();
    await ui.screen("today-schedule");
    ui.goal(/\/dashboard\/appointments/.test(ui.page.url()), "receptionist sees today's schedule with booked patients");
  },
);
if (require.main === module) module.exports.cli();
