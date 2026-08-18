import { describe, it, expect } from "vitest";
import {
  calcInvoice, calcPurchase, calcFDMaturity, calcMaturityDate,
  calcAnnualDep, calcClosing, validate, fmt, calcItemsTotal, buildInvoiceItemRow,
  buildLeadRow, calcWinRate,
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

describe("calcInvoice — multi-item line items (materialCharges source)", () => {
  it("derives materialCharges from a populated items array instead of the typed field", () => {
    const r = calcInvoice({
      labourCharges: 0, materialCharges: 999999, travelCharges: 0, otherCharges: 0,
      items: [{ qty: 2, rate: 500 }, { qty: 3, rate: 1000 }],
      discount: 0, gstType: "IGST", gstPct: 18, tdsApplicable: "No",
    });
    // 2*500 + 3*1000 = 4000, NOT the stale 999999 typed field
    expect(r.materialCharges).toBe(4000);
    expect(r.sub).toBe(4000);
    expect(r.taxable).toBe(4000);
    expect(r.gstAmt).toBe(720);
    expect(r.grand).toBe(4720);
  });

  it("falls back to the legacy materialCharges field when items is empty/missing (regression guard for old invoices)", () => {
    const withEmptyItems = calcInvoice({
      labourCharges: 1000, materialCharges: 2000, travelCharges: 0, otherCharges: 0,
      items: [], discount: 0, gstType: "IGST", gstPct: 18, tdsApplicable: "No",
    });
    const withNoItemsField = calcInvoice({
      labourCharges: 1000, materialCharges: 2000, travelCharges: 0, otherCharges: 0,
      discount: 0, gstType: "IGST", gstPct: 18, tdsApplicable: "No",
    });
    expect(withEmptyItems.materialCharges).toBe(2000);
    expect(withEmptyItems.sub).toBe(3000);
    expect(withNoItemsField.materialCharges).toBe(2000);
    expect(withNoItemsField.sub).toBe(3000);
  });
});

describe("calcItemsTotal", () => {
  it("sums qty*rate across items, treating missing values as zero", () => {
    expect(calcItemsTotal([{ qty: 2, rate: 100 }, { qty: 1, rate: 50 }])).toBe(250);
    expect(calcItemsTotal([{ qty: 2 }, { rate: 50 }])).toBe(0);
    expect(calcItemsTotal([])).toBe(0);
    expect(calcItemsTotal(undefined)).toBe(0);
  });
});

describe("buildInvoiceItemRow — column order matches the \"Sales Invoice Items\" sheet schema", () => {
  it("builds a row in [invoiceNo, fy, srNo, description, hsn, qty, unit, rate, amount, createdAt, deleted] order", () => {
    const row = buildInvoiceItemRow(
      { description: "Turbine Bearing SKF 6310", hsn: "84821010", qty: 2, unit: "Pcs", rate: 1200 },
      "KE/INV/2026-27/010", "2026-27", 1
    );
    expect(row[0]).toBe("KE/INV/2026-27/010"); // Invoice No.
    expect(row[1]).toBe("2026-27");            // FY
    expect(row[2]).toBe(1);                    // SR No.
    expect(row[3]).toBe("Turbine Bearing SKF 6310");
    expect(row[4]).toBe("84821010");
    expect(row[5]).toBe(2);                    // Quantity
    expect(row[6]).toBe("Pcs");                 // Unit
    expect(row[7]).toBe(1200);                  // Rate
    expect(row[8]).toBe(2400);                  // Amount = qty*rate
    expect(row[10]).toBe(false);                // Deleted — fresh row, never soft-deleted
    expect(row.length).toBe(11);
  });
});

describe("buildLeadRow — column order matches the \"IndiaMART Leads\" sheet schema", () => {
  it("builds a full row in FIELD_MAPS[\"IndiaMART Leads\"] order from a fully-populated form", () => {
    const f = {
      leadId:"KE/IM/2026-27/010", queryId:"IM-QID-12345",
      dateReceived:"2026-08-10", companyName:"Ganga Paper Mills", contactPerson:"Ms. Priya Sharma",
      mobile:"9902345678", altMobile:"9902345679", whatsappOpted:"Yes", email:"priya@gangapaper.com",
      city:"Saharanpur", state:"Uttar Pradesh",
      productEnquired:"Dynamic balancing service", requirementDetails:"1.2MW turbine vibration",
      leadType:"Buy Lead", budget:120000, priority:"High",
      status:"Quoted", quotationRef:"KE/QT/2026-27/006", quotedValue:110000,
      firstContactedAt:"10/8/2026, 3:40:00 pm", responseTimeHrs:2.1,
      followUpDate:"2026-08-25", wonDate:"", lostReason:"", competitorMentioned:"",
      assignedTo:"Keshav Sharma", remarks:"Awaiting PO",
    };
    const row = buildLeadRow(f, "2026-27", "Keshav Sharma");
    // 30 headers in, 30 fields out.
    expect(row.length).toBe(30);
    expect(row).toEqual([
      "KE/IM/2026-27/010", "2026-27", row[2], "Keshav Sharma", // row[2] is ts() — timestamp, checked separately below
      "2026-08-10", "IM-QID-12345",
      "Ganga Paper Mills", "Ms. Priya Sharma", "9902345678", "9902345679",
      "Yes", "priya@gangapaper.com",
      "Saharanpur", "Uttar Pradesh",
      "Dynamic balancing service", "1.2MW turbine vibration",
      "Buy Lead", 120000, "High",
      "Quoted", "KE/QT/2026-27/006", 110000,
      "10/8/2026, 3:40:00 pm", 2.1,
      "2026-08-25", "", "",
      "", "Keshav Sharma", "Awaiting PO",
    ]);
    expect(typeof row[2]).toBe("string"); // Created At timestamp, non-empty
    expect(row[2].length).toBeGreaterThan(0);
  });

  it("blank optional fields come out as empty strings (never \"undefined\") and blank numbers as 0 (never \"NaN\")", () => {
    const f = {
      leadId:"KE/IM/2026-27/011",
      dateReceived:"2026-08-15", companyName:"Test Co", contactPerson:"Mr. Test",
      mobile:"9812345678",
      productEnquired:"Turbine inspection",
      leadType:"Buy Lead", priority:"Medium", status:"New",
      // Every optional field intentionally omitted below.
    };
    const row = buildLeadRow(f, "2026-27", "Keshav Sharma");
    expect(row.length).toBe(30);
    // Optional text fields → "" not "undefined"
    [5,9,11,12,13,15,20,22,24,25,26,27,28,29].forEach(i => {
      expect(row[i]).toBe("");
      expect(row[i]).not.toBe("undefined");
    });
    // Numeric fields → 0 not "NaN"
    expect(row[17]).toBe(0); // Budget Indicated
    expect(row[21]).toBe(0); // Quoted Value
    expect(row[23]).toBe(0); // Response Time (Hrs)
    expect(Number.isNaN(row[17])).toBe(false);
    expect(Number.isNaN(row[21])).toBe(false);
    expect(Number.isNaN(row[23])).toBe(false);
    // whatsappOpted defaults to "No" when omitted (see buildLeadRow)
    expect(row[10]).toBe("No");
  });
});

describe("calcWinRate — IndiaMART Leads win-rate KPI", () => {
  it("shows \"—\" (not \"NaN%\" or \"Infinity%\") when there are zero Won and zero Lost leads", () => {
    expect(calcWinRate(0,0)).toBe("—");
  });
  it("computes a rounded percentage once there's at least one closed lead", () => {
    expect(calcWinRate(3,1)).toBe("75%");
    expect(calcWinRate(1,3)).toBe("25%");
    expect(calcWinRate(1,2)).toBe("33%"); // rounds, doesn't truncate
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
