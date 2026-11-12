type NamedLine = {
  name?: string | null;
  drug?: { name?: string | null } | null;
  package?: { name?: string | null } | null;
};

/** A bill line reads as the stock it sells; the catalogue name only stands in when the line carries no stock name. */
export const billLineName = (line: NamedLine) => line.name || line.drug?.name || line.package?.name || 'Item';

const nameKey = (name: string) => name.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');

/** What the prescription called the line, when that is not already the name the line shows. */
export const prescribedNameShown = (line: NamedLine & { prescribedDrugName?: string }) =>
  line.prescribedDrugName && nameKey(line.prescribedDrugName) !== nameKey(billLineName(line)) ? line.prescribedDrugName : null;

type StockCheckLine = { drugName: string; stockName?: string | null };

/** The name a stock-checked prescription line gets as a bill line when "Load" fills the bill: its stock's name, else what was prescribed. */
export const stockCheckLineName = (line: StockCheckLine) => billLineName({ name: line.stockName, drug: { name: line.drugName } });
