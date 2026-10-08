export type ColType = "decimal" | "integer" | "string" | "timestamp";
export interface Column { name: string; type: ColType; nullable: boolean }
export interface Contract {
  version: string;
  signedAt: string;
  producer: string;
  consumer: string;
  columns: Column[];
  priceMean: { min: number; max: number };
  slaPerHourUsd: number;
}

export const CONTRACTS: Contract[] = [
  {
    version: "1.0.0", signedAt: "2026-06-01", producer: "Checkout Platform", consumer: "Revenue Analytics",
    columns: [
      { name: "order_id", type: "string", nullable: false },
      { name: "price", type: "decimal", nullable: false },
      { name: "currency", type: "string", nullable: false },
      { name: "created_at", type: "timestamp", nullable: false },
    ],
    priceMean: { min: 100, max: 200 }, slaPerHourUsd: 4200,
  },
  {
    version: "1.1.0", signedAt: "2026-08-14", producer: "Checkout Platform", consumer: "Revenue Analytics",
    columns: [
      { name: "order_id", type: "string", nullable: false },
      { name: "price", type: "decimal", nullable: false },
      { name: "currency", type: "string", nullable: false },
      { name: "created_at", type: "timestamp", nullable: false },
      { name: "coupon_code", type: "string", nullable: true },
    ],
    priceMean: { min: 100, max: 200 }, slaPerHourUsd: 4200,
  },
  {
    version: "2.0.0-draft", signedAt: "pending", producer: "Checkout Platform", consumer: "Revenue Analytics",
    columns: [
      { name: "order_id", type: "string", nullable: false },
      { name: "price", type: "integer", nullable: false },
      { name: "created_at", type: "timestamp", nullable: true },
      { name: "coupon_code", type: "string", nullable: true },
    ],
    priceMean: { min: 50, max: 400 }, slaPerHourUsd: 4200,
  },
];

export interface Change { kind: "breaking" | "safe"; message: string }

export function detectChanges(prev: Contract, next: Contract): Change[] {
  const out: Change[] = [];
  const prevMap = new Map(prev.columns.map((c) => [c.name, c]));
  const nextMap = new Map(next.columns.map((c) => [c.name, c]));
  for (const c of prev.columns) {
    const n = nextMap.get(c.name);
    if (!n) { out.push({ kind: "breaking", message: `Column "${c.name}" removed` }); continue; }
    if (n.type !== c.type) out.push({ kind: "breaking", message: `"${c.name}" type ${c.type} → ${n.type}` });
    if (!c.nullable && n.nullable) out.push({ kind: "breaking", message: `"${c.name}" became nullable` });
  }
  for (const n of next.columns) if (!prevMap.has(n.name))
    out.push({ kind: n.nullable ? "safe" : "breaking", message: `Column "${n.name}" added${n.nullable ? " (nullable)" : " (required)"}` });
  if (next.priceMean.min < prev.priceMean.min || next.priceMean.max > prev.priceMean.max)
    out.push({ kind: "breaking", message: `Price guarantee loosened to ${next.priceMean.min}–${next.priceMean.max}` });
  else if (next.priceMean.min !== prev.priceMean.min || next.priceMean.max !== prev.priceMean.max)
    out.push({ kind: "safe", message: `Price guarantee tightened to ${next.priceMean.min}–${next.priceMean.max}` });
  return out;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function checkMean(m: number, c: Contract) {
  return m >= c.priceMean.min && m <= c.priceMean.max;
}

/** Dollar impact: hourly SLA × hours (min 1) × severity multiplier (how far out of bounds). */
export function breachImpact(m: number, c: Contract, hours = 1) {
  const { min, max } = c.priceMean;
  const dist = m > max ? (m - max) / max : m < min ? (min - m) / min : 0;
  const severity = Math.min(5, 1 + dist);
  return Math.round(c.slaPerHourUsd * Math.max(1, hours) * severity);
}

export function diagnose(m: number, c: Contract) {
  if (m > c.priceMean.max * 50) return { cause: "Price emitted in cents instead of dollars", factor: 100 };
  if (m < c.priceMean.min) return { cause: "Prices collapsed — likely zero/default values", factor: 1 };
  return { cause: "Mean shifted outside guaranteed range", factor: 1 };
}

export function generateDbtPr(m: number, c: Contract) {
  const d = diagnose(m, c);
  const fix = d.factor === 100
    ? `-    price::decimal(12,2) as price,\n+    case when price > ${c.priceMean.max * 10} then price / 100.0\n+         else price end::decimal(12,2) as price,`
    : `-    price::decimal(12,2) as price,\n+    nullif(price, 0)::decimal(12,2) as price,`;
  return {
    title: `fix(stg_orders): ${d.cause.toLowerCase()}`,
    branch: `drift-insurance/fix-price-${Date.now().toString(36)}`,
    diff: `--- a/models/staging/stg_orders.sql\n+++ b/models/staging/stg_orders.sql\n@@ select\n     order_id,\n${fix}\n     currency,\n     created_at\n from {{ source('kafka', 'orders') }}\n\n--- a/models/staging/schema.yml\n+++ b/models/staging/schema.yml\n+      - dbt_expectations.expect_column_mean_to_be_between:\n+          min_value: ${c.priceMean.min}\n+          max_value: ${c.priceMean.max}`,
  };
}
