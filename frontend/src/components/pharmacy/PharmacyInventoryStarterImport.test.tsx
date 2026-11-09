import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PharmacyInventoryStarterImport } from "./PharmacyInventoryStarterImport";
import { apiClient } from "@/lib/api";

const toast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
jest.mock("@/lib/api", () => ({
  apiClient: {
    importInventoryStarterExcel: jest.fn(),
    retryInventoryImportRows: jest.fn(),
    getInventoryImportOutcome: jest.fn(),
  },
}));

const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      rows: [{ sourceRow: 2, name: "Synthetic cream", currentStock: 4 }],
    }),
  });
});
afterAll(() => {
  global.fetch = originalFetch;
});

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
  fireEvent.click(screen.getByRole("button", { name: /^Preview import$/i }));
  expect(await screen.findByText("Synthetic cream")).toBeInTheDocument();
  expect(apiClient.importInventoryStarterExcel).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: /confirm opening import/i }),
  );
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
  expect(
    screen.getByRole("button", { name: /^Preview import$/i }),
  ).toBeDisabled();
});

it("retries failed rows in place and shows the authoritative completed outcome", async () => {
  (apiClient.importInventoryStarterExcel as jest.Mock).mockResolvedValue({
    importId: "import-ref",
    totalRows: 2,
    created: 1,
    updated: 0,
    skipped: 1,
    drugsCreated: 1,
    stockAdjusted: 1,
    retryableRows: 1,
    errors: [{ row: 3, message: "Database save failed" }],
  });
  (apiClient.retryInventoryImportRows as jest.Mock).mockResolvedValue({
    importId: "import-ref",
    totalRows: 2,
    created: 2,
    updated: 0,
    skipped: 0,
    drugsCreated: 2,
    stockAdjusted: 2,
    retryableRows: 0,
    errors: [],
  });
  const { container } = render(<PharmacyInventoryStarterImport compact />);
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: { files: [new File(["test"], "stock.xlsx")] },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Preview import$/i }));
  await screen.findByText("Synthetic cream");
  fireEvent.click(
    screen.getByRole("button", { name: /confirm opening import/i }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry failed rows" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText("Row 3: Database save failed"),
    ).not.toBeInTheDocument(),
  );
  expect(toast).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: "Import complete",
      description: "2 created, 0 updated, 0 remaining.",
    }),
  );
  expect(apiClient.retryInventoryImportRows).toHaveBeenCalledWith("import-ref");
});

it("keeps failed rows visible after a lost retry response and allows an outcome check", async () => {
  (apiClient.importInventoryStarterExcel as jest.Mock).mockResolvedValue({
    importId: "unknown-ref",
    totalRows: 1,
    created: 0,
    updated: 0,
    skipped: 1,
    drugsCreated: 0,
    stockAdjusted: 0,
    retryableRows: 1,
    errors: [{ row: 2, message: "Database save failed" }],
  });
  (apiClient.retryInventoryImportRows as jest.Mock).mockRejectedValue(
    new Error("Network timeout"),
  );
  (apiClient.getInventoryImportOutcome as jest.Mock).mockResolvedValue({
    importId: "unknown-ref",
    totalRows: 1,
    created: 1,
    updated: 0,
    skipped: 0,
    drugsCreated: 1,
    stockAdjusted: 1,
    retryableRows: 0,
    errors: [],
  });
  const { container } = render(<PharmacyInventoryStarterImport compact />);
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: { files: [new File(["test"], "stock.xlsx")] },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Preview import$/i }));
  await screen.findByText("Synthetic cream");
  fireEvent.click(
    screen.getByRole("button", { name: /confirm opening import/i }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry failed rows" }),
  );
  await waitFor(() =>
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Import outcome not confirmed" }),
    ),
  );
  expect(screen.getByText("Row 2: Database save failed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check import outcome" }));
  await waitFor(() =>
    expect(
      screen.queryByText("Row 2: Database save failed"),
    ).not.toBeInTheDocument(),
  );
});

it("preserves the previous summary when a retry response does not confirm the import", async () => {
  (apiClient.importInventoryStarterExcel as jest.Mock).mockResolvedValue({
    importId: "confirmed-ref",
    totalRows: 1,
    created: 0,
    updated: 0,
    skipped: 1,
    drugsCreated: 0,
    stockAdjusted: 0,
    retryableRows: 1,
    errors: [{ row: 2, message: "Retry needed" }],
  });
  (apiClient.retryInventoryImportRows as jest.Mock).mockResolvedValue(null);
  const { container } = render(<PharmacyInventoryStarterImport compact />);
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: { files: [new File(["test"], "stock.xlsx")] },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Preview import$/i }));
  await screen.findByText("Synthetic cream");
  fireEvent.click(
    screen.getByRole("button", { name: /confirm opening import/i }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry failed rows" }),
  );
  await waitFor(() =>
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Import outcome not confirmed" }),
    ),
  );
  expect(screen.getByText("Row 2: Retry needed")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Check import outcome" }),
  ).toBeEnabled();
});

const praneeta = { id: "doc-1", firstName: "Praneeta", lastName: "Rao" };
const heldSummary = (status: string, extra: Record<string, unknown> = {}) => ({
  importId: "held-ref",
  totalRows: 2,
  created: 0,
  updated: 0,
  skipped: 2,
  drugsCreated: 0,
  stockAdjusted: 0,
  pendingRows: 2,
  errors: [
    { row: 2, message: "This row has not finished." },
    { row: 3, message: "This row has not finished." },
  ],
  approval: { status, requestedBy: null, reviewedBy: null, reviewedAt: null, note: null },
  ...extra,
});
const confirmUpload = async (layout: { compact?: boolean } = {}) => {
  const { container } = render(<PharmacyInventoryStarterImport {...layout} />);
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: { files: [new File(["test"], "stock.xlsx")] },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Preview import$/i }));
  fireEvent.click(await screen.findByRole("button", { name: /confirm opening import/i }));
};

it.each([{ compact: true }, {}])(
  "tells staff the file went to a doctor and offers no retry while it waits (%j)",
  async (layout) => {
    (apiClient.importInventoryStarterExcel as jest.Mock).mockResolvedValue({
      status: "PENDING_APPROVAL",
      ...heldSummary("PENDING"),
    });
    await confirmUpload(layout);
    const results = await screen.findByRole("region", { name: "Opening stock import results" });
    expect(within(results).getByRole("status")).toHaveTextContent(
      "Sent to a doctor for approval. No stock changes until it is approved.2 rows are waiting for review.Check import outcomeImport reference: held-ref",
    );
    expect(within(results).queryByRole("button", { name: /Retry failed rows|Resume unfinished rows/ })).toBeNull();
    expect(toast.mock.calls).toEqual([[{ title: "Sent to a doctor for approval", description: "No stock changes until it is approved." }]]);
  },
);

it("shows the normal results with retry once a doctor approved the file", async () => {
  (apiClient.importInventoryStarterExcel as jest.Mock).mockResolvedValue({
    status: "PENDING_APPROVAL",
    ...heldSummary("PENDING"),
  });
  (apiClient.getInventoryImportOutcome as jest.Mock).mockResolvedValue(
    heldSummary("APPROVED", {
      created: 1,
      skipped: 1,
      pendingRows: 0,
      retryableRows: 1,
      errors: [{ row: 3, message: "Could not save this row (P2028)." }],
      approval: { status: "APPROVED", requestedBy: null, reviewedBy: praneeta, reviewedAt: null, note: null },
    }),
  );
  await confirmUpload();
  fireEvent.click(await screen.findByRole("button", { name: "Check import outcome" }));
  expect(await screen.findByText("Row 3: Could not save this row (P2028).")).toBeInTheDocument();
  expect(screen.getByText("Approved by Praneeta Rao")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry failed rows" })).toBeEnabled();
  expect(apiClient.getInventoryImportOutcome).toHaveBeenCalledWith("held-ref");
});

it("shows the doctor's rejection note when staff check a rejected file", async () => {
  (apiClient.importInventoryStarterExcel as jest.Mock).mockResolvedValue({
    status: "PENDING_APPROVAL",
    ...heldSummary("PENDING"),
  });
  (apiClient.getInventoryImportOutcome as jest.Mock).mockResolvedValue(
    heldSummary("REJECTED", {
      approval: { status: "REJECTED", requestedBy: null, reviewedBy: praneeta, reviewedAt: null, note: "Counts are from last year" },
    }),
  );
  await confirmUpload({ compact: true });
  fireEvent.click(await screen.findByRole("button", { name: "Check import outcome" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("This import was rejected: Counts are from last year");
  expect(alert).toHaveTextContent("Rejected by Praneeta Rao. No stock was changed.");
  expect(toast).toHaveBeenLastCalledWith({
    variant: "destructive",
    title: "Import rejected",
    description: "Counts are from last year",
  });
});
