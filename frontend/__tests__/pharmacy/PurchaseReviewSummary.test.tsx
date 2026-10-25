import { fireEvent, render, screen } from "@testing-library/react";
import { PurchaseReviewSummary } from "@/components/pharmacy/PurchaseReviewSummary";
const props = {
  hasContent: true,
  saved: false,
  committed: false,
  cancelled: false,
  unknown: false,
  checks: 0,
  lines: 2,
  calculated: 112,
  printed: null,
};
it("distinguishes missing totals, mismatches and matched totals without claiming human verification", () => {
  const view = render(<PurchaseReviewSummary {...props} />);
  expect(screen.getByText("Enter bill total to compare").closest("[data-review-state]")).toHaveAttribute("data-review-state", "warning");
  expect(screen.getByText("Compare every item with the bill")).toBeVisible();
  expect(screen.queryByText(/Add stock complete/)).not.toBeInTheDocument();
  view.rerender(<PurchaseReviewSummary {...props} printed={110} />);
  expect(screen.getByText(/₹2.00 — check amounts/).closest("[data-review-state]")).toHaveAttribute("data-review-state", "error");
  view.rerender(<PurchaseReviewSummary {...props} printed={112} />);
  expect(screen.getByText("Totals match").closest("[data-review-state]")).toHaveAttribute("data-review-state", "success");
});
it.each([0.01, -0.01, 0.04, -0.04, 1, -1])(
  "shows a %s rupee difference within tolerance without implying approval",
  (difference) => {
    render(<PurchaseReviewSummary {...props} calculated={5520 + difference} printed={5520} checks={2} />);
    const status = screen.getByText(/within ₹1.00 tolerance/);
    expect(status.closest("[data-review-state]")).toHaveAttribute("data-review-state", "neutral");
    expect(status).toHaveTextContent(new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(difference));
    expect(screen.getByText("You can proceed with review. Other checks still apply.")).toBeVisible();
    expect(screen.getByText("2 checks left")).toBeVisible();
    expect(screen.queryByText("Totals match")).not.toBeInTheDocument();
    expect(screen.queryByText(/Verified|Add stock complete/)).not.toBeInTheDocument();
  },
);
it.each([1.01, -1.01])("requires correction above the tolerance in either direction (%s)", (difference) => {
  render(<PurchaseReviewSummary {...props} calculated={5520 + difference} printed={5520} />);
  expect(screen.getByText(/check amounts/).closest("[data-review-state]")).toHaveAttribute("data-review-state", "error");
  expect(screen.queryByText(/You can proceed/)).not.toBeInTheDocument();
});
it.each([null, undefined, "", NaN, Infinity])("keeps unavailable printed totals unknown (%s)", (printed) => {
  render(<PurchaseReviewSummary {...props} printed={printed} />);
  expect(screen.getByText("Enter bill total to compare").closest("[data-review-state]")).toHaveAttribute("data-review-state", "warning");
  expect(screen.queryByText(/You can proceed/)).not.toBeInTheDocument();
});
it.each([{ unknown: true }, { cancelled: true }, { committed: true }])(
  "does not suggest proceeding for a paused or posted invoice (%j)",
  (state) => {
    render(<PurchaseReviewSummary {...props} {...state} calculated={5520.04} printed={5520} />);
    expect(screen.getByText(/within ₹1.00 tolerance/)).toBeVisible();
    expect(screen.queryByText(/You can proceed/)).not.toBeInTheDocument();
  },
);
it("opens a collapsed correction target and moves keyboard focus to it", () => {
  render(
    <>
      <PurchaseReviewSummary {...props} />
      <details>
        <summary>Hidden totals</summary>
        <h3 id="purchase-totals">Totals</h3>
      </details>
    </>,
  );
  fireEvent.click(screen.getByRole("link", { name: "Check total" }));
  expect(screen.getByText("Totals")).toBeVisible();
  expect(screen.getByText("Totals")).toHaveFocus();
});
