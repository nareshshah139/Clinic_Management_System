import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PharmacyInvoiceBuilderFixed } from "@/components/pharmacy/PharmacyInvoiceBuilderFixed";
import { BillDiscountInput } from "@/components/pharmacy/sales/BillDiscountInput";
import { apiClient } from "@/lib/api";

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock("@/lib/api", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    getPatients: jest.fn(),
    getUsers: jest.fn(),
    getPatient: jest.fn(),
    getPrescription: jest.fn(),
    getPharmacyInvoicePrintData: jest.fn(),
    getPharmacyInvoiceById: jest.fn(),
  },
}));

const drug = (id: string, name: string, gstRate?: number) => ({
  id,
  name,
  stockName: name,
  manufacturerName: "Acme",
  packSizeLabel: "10 tabs",
  price: 100,
  gstRate,
});

const pendingAttempt = {
  requestKey: "checkout-key",
  confirmed: false,
  payload: {
    patientId: "patient-1",
    doctorId: "",
    prescriptionId: "",
    paymentMethod: "CASH",
    billingName: "Synthetic Patient",
    billingPhone: "0000000000",
    billingAddress: "",
    billingCity: "",
    billingState: "",
    billingPincode: "",
    notes: "",
    items: [],
  },
  previewItems: [],
};

const finishedInvoice = {
  id: "invoice-1",
  invoiceNumber: "PHI-2026-001",
  patientId: "patient-1",
  status: "CONFIRMED",
  paymentStatus: "PAID",
  totalAmount: 0,
  subtotal: 0,
  discountAmount: 0,
  taxAmount: 0,
  items: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  (apiClient.get as jest.Mock).mockImplementation((path: string) =>
    Promise.resolve(
      path === "/drugs/autocomplete"
        ? [drug("drug-5", "Five Percent Tonic", 5), drug("drug-x", "Unknown Rate Syrup")]
        : { data: [] },
    ),
  );
  (apiClient.getPatients as jest.Mock).mockResolvedValue({ data: [] });
  (apiClient.getUsers as jest.Mock).mockResolvedValue({ users: [] });
});

const addDrug = async (query: string, name: string) => {
  fireEvent.change(await screen.findByLabelText("Search Drugs"), { target: { value: query } });
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
};

it("bills a manually added 5% GST medicine at 5% with the GST inside its price, not 18% on top", async () => {
  render(<PharmacyInvoiceBuilderFixed />);
  await addDrug("five", "Five Percent Tonic");

  const gstInput = (await screen.findAllByDisplayValue("5")).find(
    (el) => el.tagName === "INPUT" && (el as HTMLInputElement).type === "number",
  );
  expect(gstInput).toBeDefined();
  expect(screen.queryByDisplayValue("18")).toBeNull();
  expect(screen.getByLabelText("Total for Five Percent Tonic")).toHaveTextContent("₹100.00");
  expect(screen.getByText("Total:").nextSibling).toHaveTextContent("₹100.00");
  expect(screen.getByText("Includes GST:").nextSibling).toHaveTextContent("₹4.76");
});

it("leaves GST pending for a medicine with no known rate instead of charging 18%", async () => {
  render(<PharmacyInvoiceBuilderFixed />);
  await addDrug("unknown", "Unknown Rate Syrup");

  expect(await screen.findByLabelText("Total for Unknown Rate Syrup")).toHaveTextContent("GST pending");
  expect(screen.queryByDisplayValue("18")).toBeNull();
});

it("clears the bill discount when a new invoice is started", async () => {
  sessionStorage.setItem("pharmacy-checkout-attempt-v1", JSON.stringify(pendingAttempt));
  (apiClient.post as jest.Mock).mockResolvedValue(finishedInvoice);
  (apiClient.getPharmacyInvoicePrintData as jest.Mock).mockResolvedValue(finishedInvoice);
  render(<PharmacyInvoiceBuilderFixed />);

  const discount = await screen.findByLabelText("Bill discount");
  fireEvent.change(discount, { target: { value: "25" } });
  expect(discount).toHaveValue(25);

  fireEvent.click(await screen.findByRole("button", { name: "Retry pending checkout" }));
  fireEvent.click(await screen.findByRole("button", { name: "Start a new invoice", hidden: true }));

  await waitFor(() => expect(screen.getByLabelText("Bill discount")).toHaveValue(null));
});

it("BillDiscountInput shows a value changed from outside", () => {
  const { rerender } = render(<BillDiscountInput value={{ kind: "PERCENT", value: 10 }} onChange={jest.fn()} />);
  expect(screen.getByLabelText("Bill discount")).toHaveValue(10);

  rerender(<BillDiscountInput value={{ kind: "AMOUNT", value: 40 }} onChange={jest.fn()} />);
  expect(screen.getByLabelText("Bill discount")).toHaveValue(40);
  expect(screen.getByRole("button", { name: "Rupees" })).toHaveAttribute("aria-pressed", "true");

  rerender(<BillDiscountInput value={null} onChange={jest.fn()} />);
  expect(screen.getByLabelText("Bill discount")).toHaveValue(null);
});
