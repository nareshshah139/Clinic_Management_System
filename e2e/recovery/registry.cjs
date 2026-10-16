module.exports = Object.freeze([
  {
    id: "partner",
    category: "production-ui",
    checkpoints: ["partial", "matched", "recovered"],
  },
  {
    id: "supplier",
    category: "production-ui",
    checkpoints: [
      "reallocation",
      "reallocated",
      "reversal-unconfirmed",
      "reversed",
    ],
  },
  {
    id: "opening",
    category: "production-ui",
    checkpoints: [
      "failed-row",
      "retry-unconfirmed",
      "recovered",
      "legacy-reconciliation",
    ],
  },
  {
    id: "stock",
    category: "http-database",
    checkpoints: ["partial", "recovered"],
  },
]);
