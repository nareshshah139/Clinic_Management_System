import { fireEvent, render, screen, within } from "@testing-library/react";
import { StockDetailsEditor } from "@/components/inventory/StockDetailsEditor";

const item = {
  name: "Cream",
  batchNumber: "B1",
  expiryDate: "2028-01-31T23:59:59.999Z",
  metadata: {},
  status: "ACTIVE",
};
it("compares corrections with the saved date and requires a reason before save", () => {
  const props = {
    item,
    value: { ...item, expiryDate: "2028-02-29" },
    onSave: jest.fn(),
    onCancel: jest.fn(),
    onChange: jest.fn(),
    busy: false,
  };
  const view = render(<StockDetailsEditor {...props} />);
  const preview = screen.getByRole("region", { name: "Check your changes" });
  expect(within(preview).getByText("2028-01-31")).toBeVisible();
  expect(within(preview).getByText("2028-02-29")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Save corrected details" }),
  ).toBeDisabled();
  view.rerender(
    <StockDetailsEditor
      {...props}
      value={{ ...props.value, reason: "Checked pack" }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Save corrected details" }),
  );
  expect(props.onSave).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onCancel).toHaveBeenCalled();
});
it("ignores time-of-day differences and does not force unknown legacy details to be invented", () => {
  render(
    <StockDetailsEditor
      item={{ ...item, batchNumber: null, expiryDate: null }}
      value={{ ...item, batchNumber: "", expiryDate: "" }}
      onSave={jest.fn()}
      onChange={jest.fn()}
      onCancel={jest.fn()}
      busy={false}
    />,
  );
  expect(screen.getByLabelText("Batch number")).not.toBeRequired();
  expect(screen.getByLabelText("Expiry date")).not.toBeRequired();
  expect(screen.getByText("No changes yet.")).toBeVisible();
});
