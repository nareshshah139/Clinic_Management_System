import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { InventoryMovements } from "@/components/inventory/InventoryMovements";
import { apiClient } from "@/lib/api";

jest.mock("@/lib/api", () => ({ apiClient: { get: jest.fn() } }));

function History({
  onBatch,
  initialQuery = {},
}: {
  onBatch: (id: string) => void;
  initialQuery?: Record<string, string>;
}) {
  const [query, setQuery] = useState(initialQuery);
  return (
    <InventoryMovements
      onBatch={onBatch}
      query={query}
      navigate={(changes) =>
        setQuery((previous) => ({ ...previous, ...changes }))
      }
    />
  );
}

const movement = {
  id: "movement-1",
  itemId: "batch-1",
  itemName: "Example cream",
  batchNumber: "B-1",
  unit: "TUBES",
  type: "PURCHASE",
  quantity: 12,
  delta: 12,
  reference: "BILL-5",
  reason: "Stock received",
  actorName: "Clinic Staff",
  createdAt: "2026-11-05T10:00:00.000Z",
};
const page = { rows: [movement], page: 1, limit: 30, total: 1, totalPages: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.get as jest.Mock).mockResolvedValue(page);
});

it("restores applied history state from its URL query", async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    ...page,
    page: 2,
    total: 31,
    totalPages: 2,
  });
  render(
    <History
      onBatch={jest.fn()}
      initialQuery={{
        historyLayout: "ledger",
        historyPage: "2",
        historySearch: "cream",
        historyType: "PURCHASE",
        historyFrom: "2026-11-01",
        historyTo: "2026-11-05",
      }}
    />,
  );
  await screen.findByRole("table");
  expect(
    screen.getByRole("button", { name: "Ledger", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Medicine, batch or reference")).toHaveValue(
    "cream",
  );
  expect(screen.getByLabelText("Movement type")).toHaveValue("PURCHASE");
  expect(screen.getByLabelText("From date")).toHaveValue("2026-11-01");
  expect(screen.getByLabelText("To date")).toHaveValue("2026-11-05");
  expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
});

it("shows an error for an invalid date in a history URL", async () => {
  render(
    <History
      onBatch={jest.fn()}
      initialQuery={{ historyFrom: "2026-02-30" }}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose valid dates for stock history.",
  );
  expect(apiClient.get).not.toHaveBeenCalled();
});

it("shows the same movement in timeline and ledger and opens its batch", async () => {
  const onBatch = jest.fn();
  render(<History onBatch={onBatch} />);
  expect(screen.getByText("Loading stock history…")).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Example cream" }));
  expect(onBatch).toHaveBeenCalledWith("batch-1");
  expect(screen.getByText(/\+12 tubes/)).toBeInTheDocument();
  expect(screen.getByText("BILL-5 · Stock received")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ledger", exact: true }));
  const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
  expect(cells[1]).toHaveTextContent("Example creamBatch B-1 · tubes");
  expect(cells[3]).toHaveTextContent("12");
  expect(cells[4]).toHaveTextContent("0");
  expect(cells[5]).toHaveTextContent("BILL-5Stock received");
  expect(
    screen.getByRole("button", { name: "Ledger", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(apiClient.get).toHaveBeenCalledTimes(1);
});

it("does not invent a direction or balance for legacy adjustments", async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    ...page,
    rows: [{ ...movement, type: "ADJUSTMENT", delta: null, quantity: 7 }],
  });
  render(<History onBatch={jest.fn()} />);
  expect(await screen.findByText("Direction unknown")).toBeInTheDocument();
  expect(screen.getByText("7 tubes recorded")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ledger", exact: true }));
  expect(screen.getAllByText("Unknown")).toHaveLength(2);
  expect(
    screen.getByText("Direction unknown · 7 recorded"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("columnheader", { name: /balance/i }),
  ).not.toBeInTheDocument();
});

it("applies filters to the server and resets pagination", async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    ...page,
    total: 31,
    totalPages: 2,
  });
  render(<History onBatch={jest.fn()} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Next", exact: true }),
  );
  await waitFor(() =>
    expect(apiClient.get).toHaveBeenLastCalledWith(
      "/inventory/workspace/movements",
      expect.objectContaining({ page: 2 }),
    ),
  );
  fireEvent.change(screen.getByLabelText("Medicine, batch or reference"), {
    target: { value: "BILL-5" },
  });
  fireEvent.change(screen.getByLabelText("Movement type"), {
    target: { value: "PURCHASE" },
  });
  fireEvent.change(screen.getByLabelText("From date"), {
    target: { value: "2026-11-05" },
  });
  fireEvent.change(screen.getByLabelText("To date"), {
    target: { value: "2026-11-05" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() =>
    expect(apiClient.get).toHaveBeenLastCalledWith(
      "/inventory/workspace/movements",
      {
        search: "BILL-5",
        type: "PURCHASE",
        page: 1,
        limit: 30,
        dateFrom: new Date("2026-11-05T00:00:00").toISOString(),
        dateTo: new Date("2026-11-05T23:59:59.999").toISOString(),
      },
    ),
  );
});

it("rejects an inverted date range without fetching it", async () => {
  render(<History onBatch={jest.fn()} />);
  await screen.findByText("Example cream");
  fireEvent.change(screen.getByLabelText("From date"), {
    target: { value: "2026-11-06" },
  });
  fireEvent.change(screen.getByLabelText("To date"), {
    target: { value: "2026-11-05" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Start date must be on or before end date.",
  );
  expect(apiClient.get).toHaveBeenCalledTimes(1);
});

it("distinguishes errors from an empty history and retries", async () => {
  (apiClient.get as jest.Mock)
    .mockRejectedValueOnce(new Error("History unavailable"))
    .mockResolvedValue({ ...page, rows: [], total: 0, totalPages: 0 });
  render(<History onBatch={jest.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "History unavailable",
  );
  expect(
    screen.queryByText("No stock movements recorded yet"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
  expect(
    await screen.findByText("No stock movements recorded yet"),
  ).toBeInTheDocument();
});

it("ignores a superseded response after filters change", async () => {
  let resolveOld!: (value: typeof page) => void;
  (apiClient.get as jest.Mock)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValue({ ...page, rows: [], total: 0, totalPages: 0 });
  render(<History onBatch={jest.fn()} />);
  fireEvent.change(screen.getByLabelText("Medicine, batch or reference"), {
    target: { value: "absent" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await screen.findByText("No movements match these filters");
  resolveOld(page);
  await waitFor(() =>
    expect(screen.queryByText("Example cream")).not.toBeInTheDocument(),
  );
});

it("returns to an available page when refreshed history has fewer pages", async () => {
  (apiClient.get as jest.Mock)
    .mockResolvedValueOnce({ ...page, total: 31, totalPages: 2 })
    .mockResolvedValueOnce({
      ...page,
      rows: [{ ...movement, id: "last", itemName: "Last medicine" }],
      page: 2,
      total: 31,
      totalPages: 2,
    })
    .mockResolvedValueOnce({
      ...page,
      rows: [],
      page: 2,
      total: 1,
      totalPages: 1,
    })
    .mockResolvedValue(page);
  render(<History onBatch={jest.fn()} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Next", exact: true }),
  );
  await screen.findByText("Last medicine");
  fireEvent.click(screen.getByRole("button", { name: "Refresh", exact: true }));
  expect(await screen.findByText("Example cream")).toBeInTheDocument();
  expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
});
