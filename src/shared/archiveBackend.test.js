// Tests the ACTUAL FY-archiving functions in apps-script-backend.js (not a
// duplicated copy) via the module.exports test hook at the bottom of that
// file. Apps Script's SpreadsheetApp/LockService/Logger globals are faked
// here with just enough surface for the functions under test — see FakeSheet
// / FakeSpreadsheet below.
import { describe, it, expect, beforeEach } from "vitest";

// ─── Minimal fake GAS Sheet/Spreadsheet ─────────────────────────────────────
class FakeSheet {
  constructor(name, headers, rows = []) {
    this.name = name;
    this.values = [headers, ...rows]; // row 0 = header row, matches getDataRange()
  }
  getDataRange() {
    return { getValues: () => this.values.map(r => [...r]) };
  }
  getLastRow() { return this.values.length; }
  getRange(row, col, numRows, numCols) {
    const self = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const srcRow = self.values[row - 1 + r] || [];
          out.push(srcRow.slice(col - 1, col - 1 + numCols));
        }
        return out;
      },
      setValues(newRows) {
        for (let r = 0; r < newRows.length; r++) {
          const targetIdx = row - 1 + r;
          while (self.values.length <= targetIdx) self.values.push([]);
          const existing = self.values[targetIdx];
          const merged = [...existing];
          for (let c = 0; c < newRows[r].length; c++) merged[col - 1 + c] = newRows[r][c];
          self.values[targetIdx] = merged;
        }
      },
      clearContent() {
        for (let r = 0; r < numRows; r++) {
          const targetIdx = row - 1 + r;
          if (self.values[targetIdx]) self.values[targetIdx] = [];
        }
        // Trim fully-empty trailing rows so getLastRow()/getDataRange() behave.
        while (self.values.length && self.values[self.values.length - 1].length === 0) self.values.pop();
      },
      setFontWeight() { return this; },
      setBackground() { return this; },
      setFontColor() { return this; },
    };
  }
  setFrozenRows() {}
  setTabColor() {}
}

class FakeSpreadsheet {
  constructor() { this.sheets = {}; }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    const ws = new FakeSheet(name, []);
    this.sheets[name] = ws;
    return ws;
  }
  addSheet(name, headers, rows) {
    const ws = new FakeSheet(name, headers, rows);
    this.sheets[name] = ws;
    return ws;
  }
}

global.SpreadsheetApp = { openById: () => global.__fakeSS };
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.Logger = { log() {} };

const backend = await import("../../apps-script-backend.js");
const {
  currentAndRecentFYs, isRowArchiveEligible,
  archiveSheetFYs, archivePreview, archiveAllOldFYs, detectFY,
} = backend.default ?? backend;

const CUR_FY = detectFY();
const [curStartYear] = CUR_FY.split("-").map(Number);
const PRIOR_FY = `${curStartYear - 1}-${String(curStartYear).slice(2)}`;
const OLD_FY   = `${curStartYear - 5}-${String(curStartYear - 4).slice(2)}`;

const SI_HEADERS = ["Invoice No.","FY","Created At","Created By","Payment Status"];

beforeEach(() => {
  global.__fakeSS = new FakeSpreadsheet();
});

describe("currentAndRecentFYs", () => {
  it("keeps the current FY plus (yearsToKeep-1) prior FYs", () => {
    const keep = currentAndRecentFYs(2);
    expect(keep.has(CUR_FY)).toBe(true);
    expect(keep.has(PRIOR_FY)).toBe(true);
    expect(keep.has(OLD_FY)).toBe(false);
  });
});

describe("isRowArchiveEligible", () => {
  const keepFYs = currentAndRecentFYs(2);

  it("old-FY + Pending Sales Invoice stays live (open, not eligible)", () => {
    const row = ["INV-1", OLD_FY, "", "", "Pending"];
    expect(isRowArchiveEligible("Sales Invoices", row, SI_HEADERS, keepFYs)).toBe(false);
  });

  it("old-FY + Paid Sales Invoice is eligible", () => {
    const row = ["INV-2", OLD_FY, "", "", "Paid"];
    expect(isRowArchiveEligible("Sales Invoices", row, SI_HEADERS, keepFYs)).toBe(true);
  });

  it("in-keep-window row is never eligible regardless of status", () => {
    const row = ["INV-3", CUR_FY, "", "", "Pending"];
    expect(isRowArchiveEligible("Sales Invoices", row, SI_HEADERS, keepFYs)).toBe(false);
  });

  it("a sheet with no guard entry (Expenses) archives by FY alone", () => {
    const headers = ["Voucher No.","FY","Amount (Rs)"];
    expect(isRowArchiveEligible("Expenses", ["V1", OLD_FY, "100"], headers, keepFYs)).toBe(true);
    expect(isRowArchiveEligible("Expenses", ["V2", CUR_FY, "100"], headers, keepFYs)).toBe(false);
  });
});

describe("archiveSheetFYs", () => {
  it("moves only closed old-FY rows, leaves open ones live, and copies to the Archive tab", () => {
    global.__fakeSS.addSheet("Sales Invoices", SI_HEADERS, [
      ["INV-OLD-PAID",    OLD_FY, "t", "u", "Paid"],
      ["INV-OLD-PENDING", OLD_FY, "t", "u", "Pending"],
      ["INV-CUR",         CUR_FY, "t", "u", "Pending"],
    ]);

    const result = archiveSheetFYs("Sales Invoices", 2, global.__fakeSS);

    expect(result).toMatchObject({ sheet: "Sales Invoices", totalRows: 3, archived: 1, kept: 2, skippedOpen: 1 });

    const live = global.__fakeSS.getSheetByName("Sales Invoices").getDataRange().getValues();
    const liveInvoiceNos = live.slice(1).map(r => r[0]);
    expect(liveInvoiceNos).toEqual(["INV-OLD-PENDING", "INV-CUR"]);

    const archive = global.__fakeSS.getSheetByName("Sales Invoices Archive").getDataRange().getValues();
    expect(archive.slice(1).map(r => r[0])).toEqual(["INV-OLD-PAID"]);
  });

  it("cascades archived Sales Invoices into Sales Invoice Items and leaves other invoices' items alone", () => {
    global.__fakeSS.addSheet("Sales Invoices", SI_HEADERS, [
      ["INV-OLD-PAID", OLD_FY, "t", "u", "Paid"],
      ["INV-CUR",      CUR_FY, "t", "u", "Pending"],
    ]);
    const itemHeaders = ["Invoice No.","FY","SR No.","Item Description","Deleted"];
    global.__fakeSS.addSheet("Sales Invoice Items", itemHeaders, [
      ["INV-OLD-PAID", OLD_FY, "1", "Bearing", ""],
      ["INV-CUR",      CUR_FY, "1", "Seal",    ""],
    ]);

    const result = archiveSheetFYs("Sales Invoices", 2, global.__fakeSS);
    expect(result.cascadedItems).toBe(1);

    const liveItems = global.__fakeSS.getSheetByName("Sales Invoice Items").getDataRange().getValues();
    expect(liveItems.slice(1).map(r => r[0])).toEqual(["INV-CUR"]);

    const archivedItems = global.__fakeSS.getSheetByName("Sales Invoice Items Archive").getDataRange().getValues();
    expect(archivedItems.slice(1).map(r => r[0])).toEqual(["INV-OLD-PAID"]);
  });

  it("a sheet with no guard entry (Expenses) archives by FY alone — regression guard", () => {
    global.__fakeSS.addSheet("Expenses", ["Voucher No.","FY","Amount (Rs)"], [
      ["V1", OLD_FY, "500"],
      ["V2", CUR_FY, "700"],
    ]);
    const result = archiveSheetFYs("Expenses", 2, global.__fakeSS);
    expect(result).toMatchObject({ archived: 1, kept: 1, skippedOpen: 0 });
  });

  it("no eligible rows means the live sheet is left untouched", () => {
    global.__fakeSS.addSheet("Sales Invoices", SI_HEADERS, [
      ["INV-CUR", CUR_FY, "t", "u", "Pending"],
    ]);
    const before = global.__fakeSS.getSheetByName("Sales Invoices").getDataRange().getValues();
    const result = archiveSheetFYs("Sales Invoices", 2, global.__fakeSS);
    expect(result.archived).toBe(0);
    const after = global.__fakeSS.getSheetByName("Sales Invoices").getDataRange().getValues();
    expect(after).toEqual(before);
    expect(global.__fakeSS.getSheetByName("Sales Invoices Archive")).toBeNull();
  });
});

describe("archivePreview vs archiveSheetFYs agreement", () => {
  it("preview's eligibleToArchive/skippedOpen match the real run's archived/skippedOpen, for every ARCHIVABLE_SHEETS entry present", () => {
    global.__fakeSS.addSheet("Sales Invoices", SI_HEADERS, [
      ["INV-OLD-PAID",    OLD_FY, "t", "u", "Paid"],
      ["INV-OLD-PENDING", OLD_FY, "t", "u", "Pending"],
      ["INV-CUR",         CUR_FY, "t", "u", "Pending"],
    ]);
    global.__fakeSS.addSheet("Expenses", ["Voucher No.","FY","Amount (Rs)"], [
      ["V1", OLD_FY, "500"],
      ["V2", CUR_FY, "700"],
    ]);
    for (const name of ["Purchase Invoices","Jobs","Quotations","TDS","Petty Cash","Attendance","Vehicles","Ledger"]) {
      global.__fakeSS.addSheet(name, ["FY"], []);
    }
    // archivePreview() reads via getSheet(name) with NO ss override — it
    // always opens CONFIG.SHEET_ID via SpreadsheetApp.openById, which we've
    // stubbed to return global.__fakeSS, so this exercises the real path.
    const preview = archivePreview(2);
    const real = ["Sales Invoices", "Expenses"].map(name => archiveSheetFYs(name, 2, global.__fakeSS));

    for (const name of ["Sales Invoices", "Expenses"]) {
      const p = preview.find(r => r.sheet === name);
      const r = real.find(r => r.sheet === name);
      expect(p.eligibleToArchive).toBe(r.archived);
      expect(p.skippedOpen).toBe(r.skippedOpen);
    }
  });
});

describe("archiveAllOldFYs", () => {
  it("logs one Archive Log row per sheet with correct counts", () => {
    global.__fakeSS.addSheet("Sales Invoices", SI_HEADERS, [
      ["INV-OLD-PAID", OLD_FY, "t", "u", "Paid"],
      ["INV-CUR",      CUR_FY, "t", "u", "Pending"],
    ]);
    global.__fakeSS.addSheet("Expenses", ["Voucher No.","FY","Amount (Rs)"], [
      ["V1", OLD_FY, "500"],
    ]);
    global.__fakeSS.addSheet("Archive Log", ["Run At","Run By","Years Kept","Sheet","Archived","Kept","Skipped Open"], []);
    // Every other ARCHIVABLE_SHEETS entry: give it an empty sheet so
    // archiveSheetFYs doesn't throw on a missing tab.
    for (const name of ["Purchase Invoices","Jobs","Quotations","TDS","Petty Cash","Attendance","Vehicles","Ledger"]) {
      global.__fakeSS.addSheet(name, ["FY"], []);
    }

    archiveAllOldFYs(2, "Test Admin");

    const log = global.__fakeSS.getSheetByName("Archive Log").getDataRange().getValues();
    const rows = log.slice(1);
    const si = rows.find(r => r[3] === "Sales Invoices");
    const ex = rows.find(r => r[3] === "Expenses");
    // columns: Run At, Run By, Years Kept, Sheet, Archived, Kept, Skipped Open
    expect(si[1]).toBe("Test Admin");
    expect(si[2]).toBe(2);
    expect(si[4]).toBe(1); // Archived
    expect(si[5]).toBe(1); // Kept
    expect(si[6]).toBe(0); // Skipped Open
    expect(ex[4]).toBe(1); // Archived
    expect(rows.length).toBe(10); // one row per ARCHIVABLE_SHEETS entry
  });
});
