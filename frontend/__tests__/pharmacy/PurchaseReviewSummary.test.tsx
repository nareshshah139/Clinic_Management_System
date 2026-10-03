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
  expect(screen.getByText("Enter bill total to compare")).toBeVisible();
  expect(screen.getByText("Compare every item with the bill")).toBeVisible();
  expect(screen.queryByText(/Add stock complete/)).not.toBeInTheDocument();
  view.rerender(<PurchaseReviewSummary {...props} printed={110} />);
  expect(screen.getByText(/₹2.00 — check amounts/)).toBeVisible();
  view.rerender(<PurchaseReviewSummary {...props} printed={112} />);
  expect(screen.getByText("Totals match")).toBeVisible();
});
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
