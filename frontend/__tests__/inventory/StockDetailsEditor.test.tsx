import React from "react";
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

describe("standard medicine name", () => {
  const recorded = {
    name: "13 74 | Flutas 150Mg(Pc)", type: "MEDICINE", form: null, brandName: null, strength: null, isCombination: false, itemCode: null,
    batchNumber: "B1", expiryDate: null, metadata: {}, status: "ACTIVE",
    nameSuggestion: { form: "TABLET", brandName: "Flutas", strength: "150 mg", isCombination: false, itemCode: "13 74", standardName: "Tab. Flutas 150 mg" },
  };
  function Harness({ item, onSave = jest.fn() }: { item: any; onSave?: jest.Mock }) {
    const [value, setValue] = React.useState<any>({ ...item, reason: "" });
    return <StockDetailsEditor item={item} value={value} onChange={setValue} onSave={onSave} onCancel={jest.fn()} busy={false} />;
  }
  it("offers the name read from the recorded label and previews the change", () => {
    render(<Harness item={recorded} />);
    fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect(screen.getByTestId("medicine-name-preview")).toHaveTextContent("Tab. Flutas 150 mg");
    const preview = screen.getByRole("region", { name: "Check your changes" });
    expect(within(preview).getByText("13 74 | Flutas 150Mg(Pc)")).toBeVisible();
    expect(within(preview).getByText("Tab. Flutas 150 mg")).toBeVisible();
    expect(within(preview).getByText("Tablet")).toBeVisible();
    expect(screen.queryByLabelText("Product name")).not.toBeInTheDocument();
  });
  it("refuses to clear a saved strength", () => {
    const onSave = jest.fn();
    const named = { ...recorded, name: "Tab. Flutas 150 mg", form: "TABLET", brandName: "Flutas", strength: "150 mg", nameSuggestion: null };
    render(<Harness item={named} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/^Strength/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Why are you changing it?"), { target: { value: "Checked pack" } });
    fireEvent.click(screen.getByRole("button", { name: "Save corrected details" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the strength, for example 150 mg, or tick Combination product.");
    expect(onSave).not.toHaveBeenCalled();
  });
  it("lets an unknown strength stay blank while other details are corrected", () => {
    const onSave = jest.fn();
    const acnosis = { ...recorded, name: "Tab. Acnosis", form: "TABLET", brandName: "Acnosis", strength: null, nameSuggestion: null };
    render(<Harness item={acnosis} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Rack / shelf"), { target: { value: "A-1" } });
    fireEvent.change(screen.getByLabelText("Why are you changing it?"), { target: { value: "Moved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save corrected details" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
