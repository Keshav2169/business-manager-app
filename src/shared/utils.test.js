import { describe, it, expect } from "vitest";
import {
  calcInvoice, calcPurchase, calcFDMaturity, calcMaturityDate,
  calcAnnualDep, calcClosing, validate, fmt,
} from "./utils.js";

// These are the functions that touch real money on real invoices — GST,
// TDS, FD interest, depreciation. A rounding regression here is silent
// (no crash, no error toast) and shows up as a wrong number on a client
// invoice or a wrong TDS deposit weeks later. That's why these get tests
// and most of the rest of the app doesn't: this is where "looks right in
// the UI" isn't enough on its own.

describe("calcInvoice — intra-state (CGST+SGST)", () => {
  it("splits GST evenly between CGST and SGST and deducts TDS from the grand total", () => {
    const r = calcInvoice({
      labourCharges: 10000, materialCharges: 5000, travelCharges: 0, otherCharges: 0,
      discount: 0, gstType: "CGST+SGST", gstPct: 18,
      tdsApplicable: "Yes", tdsRate: 2,
    });
    expect(r.sub).toBe(15000);
    expect(r.taxable).toBe(15000);
    expect(r.gstAmt).toBe(2700);
    expect(r.cgst).toBe(1350);
    expect(r.sgst).toBe(1350);
    expect(r.igst).toBe(0);
    expect(r.grand).toBe(17700);
    expect(r.tdsAmt).toBe(300);
    expect(r.netPay).toBe(17400);
  });

  it("applies discount before computing GST, not after", () => {
    const r = calcInvoice({
      labourCharges: 20000, materialCharges: 0, travelCharges: 0, otherCharges: 0,
      discount: 2000, gstType: "CGST+SGST", gstPct: 18, tdsApplicable: "No",
    });
    // taxable = 20000 - 2000 = 18000, NOT 20000 with GST then discounted
    expect(r.taxable).toBe(18000);
    expect(r.gstAmt).toBe(3240);
    expect(r.grand).toBe(21240);
    expect(r.tdsAmt).toBe(0);
  });
});

describe("calcInvoice — inter-state (IGST)", () => {
  it("routes the full GST amount to IGST and leaves CGST/SGST at zero", () => {
    const r = calcInvoice({
      labourCharges: 50000, materialCharges: 0, travelCharges: 0, otherCharges: 0,
      discount: 0, gstType: "IGST", gstPct: 18, tdsApplicable: "No",
    });
    expect(r.igst).toBe(9000);
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.grand).toBe(59000);
  });
});

describe("calcInvoice — exempt / nil-rated", () => {
  it.each(["Exempt", "Nil"])("charges zero GST when gstType is %s", (gstType) => {
    const r = calcInvoice({
      labourCharges: 12000, materialCharges: 0, travelCharges: 0, otherCharges: 0,
      discount: 0, gstType, gstPct: 18, tdsApplicable: "No",
    });
    expect(r.gstAmt).toBe(0);
    expect(r.grand).toBe(12000);
  });
});

describe("calcInvoice — TDS defaulting", () => {
  it("defaults TDS rate to 1% when tdsRate is not supplied but TDS is applicable", () => {
    const r = calcInvoice({
      labourCharges: 100000, materialCharges: 0, travelCharges: 0, otherCharges: 0,
      discount: 0, gstType: "Exempt", tdsApplicable: "Yes",
      // tdsRate intentionally omitted
    });
    expect(r.tdsAmt).toBe(1000); // 1% of 100000
  });

  it("charges TDS on the taxable amount, not the GST-inclusive grand total", () => {
    const r = calcInvoice({
      labourCharges: 100000, materialCharges: 0, travelCharges: 0, otherCharges: 0,
      discount: 0, gstType: "IGST", gstPct: 18, tdsApplicable: "Yes", tdsRate: 10,
    });
    // grand = 118000, but TDS must be 10% of the 100000 taxable value (10000),
    // not 10% of 118000 (11800) — a common source of over-deduction bugs.
    expect(r.tdsAmt).toBe(10000);
    expect(r.netPay).toBe(108000);
  });
});

describe("calcPurchase — mirrors calcInvoice logic for vendor bills", () => {
  it("computes CGST+SGST split using independently supplied cgstPct/sgstPct", () => {
    const r = calcPurchase({
      basicAmount: 40000, discount: 0, gstType: "CGST+SGST",
      cgstPct: 9, sgstPct: 9, tdsApplicable: "Yes", tdsRate: 2,
    });
    expect(r.taxable).toBe(40000);
    expect(r.cgst).toBe(3600);
    expect(r.sgst).toBe(3600);
    expect(r.gstTot).toBe(7200);
    expect(r.grand).toBe(47200);
    expect(r.tdsAmt).toBe(800); // 2% of taxable (40000), not of grand
    expect(r.netPay).toBe(46400);
  });

  it("defaults TDS rate to 2% (the purchase-side default) when unspecified", () => {
    const r = calcPurchase({
      basicAmount: 10000, discount: 0, gstType: "Exempt", tdsApplicable: "Yes",
    });
    expect(r.tdsAmt).toBe(200); // 2% of 10000
  });
});

describe("calcFDMaturity — quarterly compounding", () => {
  it("matches A = P(1+r/4)^(4t) for a 1-year FD", () => {
    expect(calcFDMaturity(100000, 7, 12)).toBe(107186);
  });
  it("matches A = P(1+r/4)^(4t) for a sub-year tenure", () => {
    expect(calcFDMaturity(50000, 6.5, 6)).toBe(51638);
  });
  it("matches A = P(1+r/4)^(4t) for a multi-year tenure", () => {
    expect(calcFDMaturity(250000, 8, 24)).toBe(292915);
  });
});

describe("calcMaturityDate", () => {
  it("adds the tenure in months to the deposit date", () => {
    expect(calcMaturityDate("2025-01-15", 12)).toBe("2026-01-15");
  });
  it("correctly rolls over the year when the month overflows", () => {
    expect(calcMaturityDate("2025-06-30", 7)).toBe("2026-01-30");
  });
  it("returns an empty string when either input is missing", () => {
    expect(calcMaturityDate("", 12)).toBe("");
    expect(calcMaturityDate("2025-01-15", 0)).toBe("");
  });
});

describe("calcAnnualDep — straight-line depreciation on cost + install cost", () => {
  it("applies the depreciation rate to cost plus installation cost combined", () => {
    expect(calcAnnualDep(100000, 10000, 15)).toBe(16500);
  });
  it("treats missing installCost as zero rather than throwing", () => {
    expect(calcAnnualDep(100000, undefined, 10)).toBe(10000);
  });
});

describe("calcClosing — running balance (opening + in - out), floored at zero", () => {
  it("adds inflow and subtracts outflow from the opening balance", () => {
    expect(calcClosing(1000, 500, 200)).toBe(1300);
  });
  it("never returns a negative balance even if outflow exceeds opening+inflow", () => {
    expect(calcClosing(100, 0, 500)).toBe(0);
  });
});

describe("validate — required-field and minimum-value form validation", () => {
  it("flags empty, whitespace-only, and literal-zero values as missing when required", () => {
    const errors = validate(
      { name: "", note: "   ", qty: 0 },
      [
        { field: "name", label: "Name", required: true },
        { field: "note", label: "Note", required: true },
        { field: "qty", label: "Quantity", required: true },
      ]
    );
    expect(errors.name).toBeTruthy();
    expect(errors.note).toBeTruthy();
    expect(errors.qty).toBeTruthy();
  });

  it("flags a value below the configured minimum", () => {
    const errors = validate({ rate: 2 }, [{ field: "rate", label: "Rate", min: 5 }]);
    expect(errors.rate).toBe("Rate must be ≥ 5");
  });

  it("passes valid, non-empty, in-range values without error", () => {
    const errors = validate(
      { name: "Triveni Turbine", rate: 18 },
      [
        { field: "name", label: "Name", required: true },
        { field: "rate", label: "Rate", min: 0 },
      ]
    );
    expect(errors).toEqual({});
  });

  // GSTIN/PAN/IFSC/mobile/email used to be plain text fields with no shape
  // checking at all — a mistyped GSTIN would sit in the sheet undetected
  // until it broke a GST report weeks later. These lock in the patterns.
  it("flags a malformed GSTIN, PAN, IFSC, and mobile number", () => {
    const errors = validate(
      { gstin: "09ABC123", pan: "ABCDE12345", ifsc: "SBI0001234", mobile: "12345" },
      [
        { field: "gstin",  label: "GSTIN",  pattern: "gstin" },
        { field: "pan",    label: "PAN",    pattern: "pan" },
        { field: "ifsc",   label: "IFSC",   pattern: "ifsc" },
        { field: "mobile", label: "Mobile", pattern: "mobile" },
      ]
    );
    expect(errors.gstin).toBeTruthy();
    expect(errors.pan).toBeTruthy();
    expect(errors.ifsc).toBeTruthy();
    expect(errors.mobile).toBeTruthy();
  });

  it("accepts correctly formatted GSTIN, PAN, IFSC, and mobile number (case-insensitive)", () => {
    const errors = validate(
      { gstin: "09abcde1234f1z5", pan: "abcde1234f", ifsc: "sbin0001234", mobile: "9812345678" },
      [
        { field: "gstin",  label: "GSTIN",  pattern: "gstin" },
        { field: "pan",    label: "PAN",    pattern: "pan" },
        { field: "ifsc",   label: "IFSC",   pattern: "ifsc" },
        { field: "mobile", label: "Mobile", pattern: "mobile" },
      ]
    );
    expect(errors).toEqual({});
  });

  it("does not run pattern checks against an empty, optional field", () => {
    const errors = validate({ altMobile: "" }, [{ field: "altMobile", label: "Alt. Mobile", pattern: "mobile" }]);
    expect(errors).toEqual({});
  });
});

describe("fmt — currency display formatting", () => {
  it("formats a number with the ₹ symbol and Indian digit grouping", () => {
    expect(fmt(150000)).toBe("₹1,50,000");
  });
  it("treats null/undefined as zero rather than showing NaN or blank", () => {
    expect(fmt(null)).toBe("₹0");
    expect(fmt(undefined)).toBe("₹0");
  });
});
