import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PharmacyInventoryStarterImport } from "./PharmacyInventoryStarterImport";
import { apiClient } from "@/lib/api";

const toast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
jest.mock("@/lib/api", () => ({
  apiClient: { importInventoryStarterExcel: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

it("shows every failed row and a failure toast in the inventory page compact uploader", async () => {
  const errors = Array.from({ length: 7 }, (_, i) => ({
    row: i + 2,
    message: `Invalid row ${i + 2}`,
  }));
  (apiClient.importInventoryStarterExcel as jest.Mock).mockResolvedValue({
    totalRows: 7,
    created: 0,
    updated: 0,
    skipped: 7,
    drugsCreated: 0,
    stockAdjusted: 0,
    errors,
  });
  const { container } = render(<PharmacyInventoryStarterImport compact />);
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: { files: [new File(["test"], "stock.xlsx")] },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Import$/ }));
  expect(await screen.findByText("Row 8: Invalid row 8")).toBeInTheDocument();
  expect(toast).toHaveBeenCalledWith(
    expect.objectContaining({
      variant: "destructive",
      title: "No inventory rows imported",
    }),
  );
});

it("rejects oversized files before submitting an import", async () => {
  const { container } = render(<PharmacyInventoryStarterImport compact />);
  const file = new File(["test"], "stock.xlsx");
  Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 + 1 });
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: { files: [file] },
  });
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "File too large" }),
    ),
  );
  expect(screen.getByRole("button", { name: /^Import$/ })).toBeDisabled();
});
