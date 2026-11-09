import { downloadCsv } from "./workspace-model";

it("keeps negative amounts numeric while neutralising formula-like text", async () => {
  let blob: Blob | undefined;
  URL.createObjectURL = jest.fn((value: Blob) => { blob = value; return "blob:csv"; });
  URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

  downloadCsv("returns.csv", [{ Item: "=HYPERLINK(1)", Amount: -110.5, Note: "-5 strips" }]);

  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob!);
  });
  expect(text.replace(/^﻿/, "")).toBe('"Item","Amount","Note"\r\n"\'=HYPERLINK(1)","-110.5","\'-5 strips"');
});
