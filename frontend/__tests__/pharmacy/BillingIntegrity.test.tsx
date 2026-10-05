import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PharmacyInvoiceBuilderFixed } from "@/components/pharmacy/PharmacyInvoiceBuilderFixed";
import { PharmacyInvoiceList } from "@/components/pharmacy/PharmacyInvoiceList";
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
    getPharmacyInvoices: jest.fn(),
    getPharmacyInvoicePrintData: jest.fn(),
    getPharmacyInvoiceById: jest.fn(),
  },
}));

const pending = {
  requestKey: "checkout-persisted-key",
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
    items: [
      {
        itemType: "DRUG",
        drugId: "drug-1",
        inventoryItemId: "stock-1",
        quantity: 5,
        unitPrice: 20,
        discountPercent: 0,
        taxPercent: 0,
      },
    ],
  },
  previewItems: [
    {
      id: "line-1",
      itemType: "DRUG",
      drugId: "drug-1",
      quantity: 5,
      unitPrice: 20,
      discountPercent: 0,
      discountAmount: 0,
      taxPercent: 0,
      taxAmount: 0,
      totalAmount: 100,
    },
  ],
};
const invoice = {
  id: "invoice-1",
  invoiceNumber: "PHI-2026-001",
  patientId: "patient-1",
  status: "CONFIRMED",
  paymentStatus: "PARTIALLY_PAID",
  paymentMethod: "CASH",
  totalAmount: 100,
  subtotal: 100,
  discountAmount: 0,
  taxAmount: 0,
  invoiceDate: "2026-10-05T00:00:00.000Z",
  billingName: "Synthetic Patient",
  billingPhone: "0000000000",
  patient: { name: "Synthetic Patient" },
  items: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.spyOn(window, "alert").mockImplementation(() => {});
  (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
  (apiClient.getPatients as jest.Mock).mockResolvedValue({ data: [] });
  (apiClient.getUsers as jest.Mock).mockResolvedValue({ users: [] });
  (apiClient.getPharmacyInvoices as jest.Mock).mockResolvedValue({
    data: [invoice],
    pagination: { page: 1, limit: 20, total: 1, pages: 1 },
  });
});
afterEach(() => jest.restoreAllMocks());

it("reconciles the same checkout payload after a lost response and remount", async () => {
  sessionStorage.setItem(
    "pharmacy-checkout-attempt-v1",
    JSON.stringify(pending),
  );
  (apiClient.post as jest.Mock).mockRejectedValueOnce(
    new Error("Response lost"),
  );
  const first = render(<PharmacyInvoiceBuilderFixed />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry pending checkout" }),
  );
  await waitFor(() =>
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    ),
  );
  expect(
    JSON.parse(sessionStorage.getItem("pharmacy-checkout-attempt-v1")!),
  ).toEqual(pending);
  first.unmount();
  (apiClient.post as jest.Mock).mockResolvedValueOnce(invoice);
  (apiClient.getPharmacyInvoicePrintData as jest.Mock).mockResolvedValue(
    invoice,
  );
  render(<PharmacyInvoiceBuilderFixed />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry pending checkout" }),
  );
  await waitFor(() =>
    expect(
      JSON.parse(sessionStorage.getItem("pharmacy-checkout-attempt-v1")!)
        .confirmed,
    ).toBe(true),
  );
  expect((apiClient.post as jest.Mock).mock.calls).toEqual([
    [
      "/pharmacy/invoices/checkout",
      { ...pending.payload, requestKey: pending.requestKey },
    ],
    [
      "/pharmacy/invoices/checkout",
      { ...pending.payload, requestKey: pending.requestKey },
    ],
  ]);
  expect(apiClient.patch).not.toHaveBeenCalled();
});

it("collects the authoritative remaining 20 rather than the original 100", async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    ...invoice,
    payments: [
      { amount: 80, status: "COMPLETED" },
      { amount: 10, status: "FAILED" },
    ],
  });
  (apiClient.post as jest.Mock).mockResolvedValue({
    id: "payment-1",
    amount: 20,
  });
  render(<PharmacyInvoiceList />);
  fireEvent.click(await screen.findByTitle("Mark as Paid"));
  await waitFor(() =>
    expect(window.alert).toHaveBeenCalledWith(
      "Invoice marked as paid successfully",
    ),
  );
  expect((apiClient.post as jest.Mock).mock.calls[0]).toEqual([
    "/pharmacy/invoices/invoice-1/payments",
    {
      requestKey: expect.any(String),
      amount: 20,
      method: "CASH",
      reference: "Payment for PHI-2026-001",
    },
  ]);
  expect(
    sessionStorage.getItem("pharmacy-payment-attempt:invoice-1"),
  ).toBeNull();
});

it("reuses the original payment after a lost response even when reloaded balance is zero", async () => {
  (apiClient.get as jest.Mock).mockResolvedValue({
    ...invoice,
    payments: [{ amount: 80, status: "COMPLETED" }],
  });
  (apiClient.post as jest.Mock).mockRejectedValueOnce(
    new Error("Response lost"),
  );
  const first = render(<PharmacyInvoiceList />);
  fireEvent.click(await screen.findByTitle("Mark as Paid"));
  await waitFor(() =>
    expect(window.alert).toHaveBeenCalledWith(
      "Payment could not be confirmed. Retry to reconcile the same payment.",
    ),
  );
  const saved = JSON.parse(
    sessionStorage.getItem("pharmacy-payment-attempt:invoice-1")!,
  );
  expect(saved.amount).toBe(20);
  first.unmount();
  (apiClient.get as jest.Mock).mockResolvedValue({
    ...invoice,
    payments: [{ amount: 100, status: "COMPLETED" }],
  });
  (apiClient.post as jest.Mock).mockResolvedValueOnce({
    id: "payment-1",
    amount: 20,
  });
  (apiClient.getPharmacyInvoices as jest.Mock).mockResolvedValue({
    data: [{ ...invoice, paymentStatus: "COMPLETED" }],
    pagination: { page: 1, limit: 20, total: 1, pages: 1 },
  });
  render(<PharmacyInvoiceList />);
  fireEvent.click(await screen.findByTitle("Retry Payment"));
  await waitFor(() =>
    expect(window.alert).toHaveBeenCalledWith(
      "Invoice marked as paid successfully",
    ),
  );
  expect((apiClient.post as jest.Mock).mock.calls).toEqual([
    ["/pharmacy/invoices/invoice-1/payments", saved],
    ["/pharmacy/invoices/invoice-1/payments", saved],
  ]);
});

it.each(["prescription", "visit", "patient", "initial"])(
  "ignores a late %s load after starting a new invoice",
  async (source) => {
    sessionStorage.setItem(
      "pharmacy-checkout-attempt-v1",
      JSON.stringify({ ...pending, confirmed: true })
    );
    const oldPatient = {
      id: "patient-old",
      name: "Previous Patient",
      phone: "0000000001",
    };
    const oldDoctor = {
      id: "doctor-old",
      firstName: "Previous",
      lastName: "Doctor",
    };
    const oldPrescription = {
      id: "rx-old",
      visit: { patient: oldPatient, doctor: oldDoctor },
      items: [],
    };
    let resolveLate!: (value: any) => void;
    let started = false;
    const late = new Promise((resolve) => {
      resolveLate = resolve;
    });
    const startLoad = () => {
      started = true;
      return late;
    };
    (apiClient.getPrescription as jest.Mock).mockResolvedValue(oldPrescription);
    (apiClient.getUsers as jest.Mock).mockResolvedValue({ users: [oldDoctor] });
    let prefill: {
      patientId?: string;
      doctorId?: string;
      prescriptionId?: string;
      visitId?: string;
    };
    let response: any;
    if (source === "prescription") {
      prefill = { prescriptionId: "rx-old" };
      (apiClient.getPrescription as jest.Mock).mockImplementation(startLoad);
      response = oldPrescription;
    } else if (source === "visit") {
      prefill = { visitId: "visit-old" };
      (apiClient.get as jest.Mock).mockImplementation((url) =>
        url === "/visits/visit-old"
          ? startLoad()
          : Promise.resolve({ data: [] })
      );
      response = {
        patient: oldPatient,
        doctor: oldDoctor,
        prescription: { id: "rx-old" },
      };
    } else if (source === "patient") {
      prefill = { patientId: "patient-old" };
      (apiClient.getPatients as jest.Mock).mockResolvedValue({
        data: [{ id: "patient-other", name: "Another Patient" }],
      });
      (apiClient.getPatient as jest.Mock).mockImplementation(startLoad);
      response = oldPatient;
    } else {
      prefill = { patientId: "patient-old", doctorId: "doctor-old" };
      (apiClient.getPatients as jest.Mock).mockImplementation(startLoad);
      response = { data: [oldPatient] };
    }
    render(<PharmacyInvoiceBuilderFixed prefill={prefill} />);
    await waitFor(() => expect(started).toBe(true));
    fireEvent.click(
      await screen.findByRole("button", { name: "Start a new invoice" })
    );
    await act(async () => resolveLate(response));
    expect(screen.getByLabelText("Patient *")).toHaveValue("");
    expect(screen.getByLabelText("Billing Name *")).toHaveValue("");
    expect(screen.getByLabelText("Phone *")).toHaveValue("");
    expect(
      screen.queryByRole("heading", { name: "Linked Prescription" })
    ).not.toBeInTheDocument();
    expect(sessionStorage.getItem("pharmacy-checkout-attempt-v1")).toBeNull();
    expect(apiClient.post).not.toHaveBeenCalled();
  }
);
