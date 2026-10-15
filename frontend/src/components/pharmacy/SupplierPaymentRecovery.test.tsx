import { fireEvent, render, screen } from "@testing-library/react";
import { SupplierPaymentRecovery, type RecoverableSupplierPayment } from "./SupplierPaymentRecovery";
import { apiClient } from "@/lib/api";

jest.mock("@/lib/api", () => ({ apiClient: { post: jest.fn() } }));
const payment: RecoverableSupplierPayment = {
  id: "payment-1", updatedAt: "2026-10-15T10:00:00.000Z", paymentDate: "2026-10-01", amount: 100, mode: "NEFT",
  allocations: [{ purchaseInvoiceId: "invoice-a", invoiceNumber: "SYN-A", amount: 100 }],
};
const invoices = [{ id: "invoice-a", invoiceNumber: "SYN-A", outstanding: 0 }, { id: "invoice-b", invoiceNumber: "SYN-B", outstanding: 100 }];
const onChanged = jest.fn().mockResolvedValue(undefined);
const post = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: jest.fn().mockReturnValue("synthetic-attempt") });
});
const show = (canWrite = true, payments = [payment]) => render(<SupplierPaymentRecovery payments={payments} invoices={invoices} canWrite={canWrite} onChanged={onChanged} />);
const reverse = () => { fireEvent.click(screen.getByRole("button", { name: "Reverse payment" })); fireEvent.change(screen.getByLabelText("Reason for correction"), { target: { value: "Incorrect amount recorded" } }); };

it("requires a reason before reversing and refreshes only after a confirmed result", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Reverse payment" }));
  expect(screen.getByRole("button", { name: "Confirm reversal" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for correction"), { target: { value: "Incorrect amount recorded" } });
  post.mockResolvedValue({ original: { ...payment, reversedAt: "2026-10-15T11:00:00Z" }, replacement: null });
  fireEvent.click(screen.getByRole("button", { name: "Confirm reversal" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Payment reversed");
  expect(post).toHaveBeenCalledWith("/pharmacy/purchase-ledger/payments/payment-1/reverse", {
    requestKey: "synthetic-attempt", expectedUpdatedAt: payment.updatedAt, reason: "Incorrect amount recorded",
  });
  expect(onChanged).toHaveBeenCalledTimes(1);
});

it("reuses the same correction key and revision after a lost response", async () => {
  show(); reverse();
  post.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ original: { ...payment, reversedAt: "2026-10-15T11:00:00Z" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm reversal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("check the outcome");
  fireEvent.click(screen.getByRole("button", { name: "Confirm reversal" }));
  await screen.findByRole("status");
  expect(post.mock.calls[1][1]).toEqual(post.mock.calls[0][1]);
});

it("keeps the original amount and offers paid invoices their own allocation back when reallocating", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Reallocate payment" }));
  fireEvent.change(screen.getByLabelText("Reason for correction"), { target: { value: "Wrong invoice selected" } });
  fireEvent.change(screen.getByLabelText(/^SYN-A/), { target: { value: "0" } });
  expect(screen.getByRole("button", { name: "Confirm reallocation" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/^SYN-B/), { target: { value: "100" } });
  post.mockResolvedValue({ original: { ...payment, reversedAt: "2026-10-15T11:00:00Z" }, replacement: { ...payment, id: "replacement", replacesPaymentId: payment.id } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm reallocation" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Payment reallocated");
  expect(post.mock.calls[0][1].allocations).toEqual([{ purchaseInvoiceId: "invoice-b", amount: 100 }]);
});

it("does not announce a malformed response as a successful reversal", async () => {
  show(); reverse(); post.mockResolvedValue({});
  fireEvent.click(screen.getByRole("button", { name: "Confirm reversal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("not confirmed");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(onChanged).not.toHaveBeenCalled();
});

it("hides correction actions without write permission and preserves reversed history", () => {
  const { rerender } = show(false);
  expect(screen.queryByRole("button", { name: "Reverse payment" })).not.toBeInTheDocument();
  rerender(<SupplierPaymentRecovery payments={[{ ...payment, reversedAt: "2026-10-15T11:00:00Z", reversalReason: "Wrong amount" }]} invoices={invoices} canWrite onChanged={onChanged} />);
  expect(screen.getByText("Reversed · Wrong amount")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reallocate payment" })).not.toBeInTheDocument();
});

it("closes a stale correction when refreshed payment data has changed", async () => {
  const { rerender } = show(); reverse();
  rerender(<SupplierPaymentRecovery payments={[{ ...payment, updatedAt: "2026-10-15T12:00:00.000Z" }]} invoices={invoices} canWrite onChanged={onChanged} />);
  expect(await screen.findByRole("status")).toHaveTextContent("payment changed");
  expect(screen.queryByRole("button", { name: "Confirm reversal" })).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
