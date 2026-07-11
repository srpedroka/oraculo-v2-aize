import assert from "node:assert/strict";
import { formatKpiCompact, verifyKpiFormatCases } from "../src/lib/kpi.ts";

verifyKpiFormatCases();
assert.equal(formatKpiCompact(1_234_567, "currency", { maximumFractionDigits: 2 }), "R$ 1,23 mi");
assert.equal(formatKpiCompact(1_234_567, "currency", { maximumFractionDigits: 4 }), "R$ 1,2346 mi");
assert.equal(formatKpiCompact(12.4567, "percent", { maximumFractionDigits: 2 }), "12,46%");
assert.equal(formatKpiCompact(12.4567, "percent", { maximumFractionDigits: 4 }), "12,4567%");

console.log("KPI format fixtures: OK");
