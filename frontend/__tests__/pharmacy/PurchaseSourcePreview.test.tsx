import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  PurchaseSourcePreview,
  PurchaseSourceContext,
  SourceFieldLink,
} from "@/components/pharmacy/PurchaseSourcePreview";
import {
  sourceRegion,
  sourceValueChanged,
  type PurchaseSourceMap,
  type SourceTarget,
} from "@/lib/purchase-invoice-source";
import { apiClient } from "@/lib/api";
jest.mock("@/lib/api", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));
const map: PurchaseSourceMap = {
  version: 1,
  pages: [
    { page: 1, width: 1600, height: 1400, rotation: 270 },
    { page: 2, width: 1000, height: 1400, rotation: 0 },
  ],
  headers: { invoiceNumber: { value: "S-1", box: [1, 50, 40, 150, 80] } },
  rows: [
    {
      index: 0,
      values: { batchNumber: "B1", quantityPurchased: "6" },
      regions: { quantityPurchased: [2, 100, 200, 150, 230] },
    },
  ],
};
const targets: SourceTarget[] = [
  {
    id: "invoice-number",
    field: "invoiceNumber",
    label: "Invoice number",
    value: "S-2",
  },
  {
    id: "row-qty",
    field: "quantityPurchased",
    label: "Line 1: Paid quantity",
    value: "6",
    sourceRef: "doc:0",
    row: { batchNumber: "B1" },
  },
];
beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.get as jest.Mock).mockResolvedValue({ sourceMap: map });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["synthetic"], { type: "image/jpeg" }),
  });
  URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
  URL.revokeObjectURL = jest.fn();
});
const props = {
  document: {
    id: "doc",
    fileName: "original.pdf",
    mimeType: "application/pdf",
  },
  targets,
  selectedId: "invoice-number",
  onSelect: jest.fn(),
  canLocate: true,
};
it("shows captured and edited values, rotates the original and supports image-to-field links", async () => {
  render(<PurchaseSourcePreview {...props} />);
  expect(await screen.findByText(/captured: S-1/)).toBeInTheDocument();
  expect(screen.getByText(/Edited value: S-2/)).toBeInTheDocument();
  const box = await screen.findByRole("button", {
    name: "Show field Invoice number: S-1",
  });
  expect(box).toHaveAttribute("x", "80");
  expect(box.closest("g")).toHaveAttribute(
    "transform",
    "translate(0 1600) rotate(270)",
  );
  fireEvent.keyDown(box, { key: "Enter" });
  expect(props.onSelect).toHaveBeenCalledWith("invoice-number");
  fireEvent.click(
    screen.getByRole("button", { name: "Rotate original clockwise" }),
  );
  expect(box.closest("g")).not.toHaveAttribute("transform");
});
it("changes to the source page and releases rendered image URLs", async () => {
  const view = render(
    <PurchaseSourcePreview {...props} selectedId="row-qty" />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Invoice source page")).toHaveValue("2"),
  );
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/pharmacy/purchase-invoices/documents/doc/pages/2",
      expect.anything(),
    ),
  );
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it("locates legacy sources only after an explicit click and reports failure without losing the original link", async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({ sourceMap: null });
  (apiClient.post as jest.Mock).mockRejectedValue(
    new Error("Source service unavailable"),
  );
  render(<PurchaseSourcePreview {...props} />);
  const button = await screen.findByRole("button", {
    name: "Locate source fields",
  });
  expect(apiClient.post).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(
    await screen.findByText("Source service unavailable"),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
    "href",
    "/api/pharmacy/purchase-invoices/documents/doc",
  );
});
it("shows every PDF page even before an older upload has source locations", async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    sourceMap: null,
    pageCount: 3,
  });
  render(<PurchaseSourcePreview {...props} />);
  await screen.findByRole("button", { name: "Locate source fields" });
  fireEvent.change(screen.getByLabelText("Invoice source page"), {
    target: { value: "3" },
  });
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/pharmacy/purchase-invoices/documents/doc/pages/3",
      expect.anything(),
    ),
  );
  expect(apiClient.post).not.toHaveBeenCalled();
});
it("never remaps a removed/reordered row by array position, or crosses documents", () => {
  expect(sourceRegion(map, targets[1], "doc")?.value).toBe("6");
  expect(sourceRegion(map, targets[1], "different")).toBeUndefined();
  expect(
    sourceRegion(
      map,
      { ...targets[1], sourceRef: undefined, row: { batchNumber: "UNKNOWN" } },
      "doc",
    ),
  ).toBeUndefined();
  expect(sourceValueChanged("6.00", "6")).toBe(false);
});

it("keeps source navigation usable after the invoice form is locked", () => {
  const select = jest.fn();
  render(
    <PurchaseSourceContext.Provider value={{ enabled: true, select }}>
      <fieldset disabled>
        <SourceFieldLink id="invoice-number" label="Invoice number" />
      </fieldset>
    </PurchaseSourceContext.Provider>,
  );
  const link = screen.getByRole("button", {
    name: "Show source for Invoice number",
  });
  expect(link).not.toBeDisabled();
  fireEvent.click(link);
  expect(select).toHaveBeenCalledWith("invoice-number");
});
