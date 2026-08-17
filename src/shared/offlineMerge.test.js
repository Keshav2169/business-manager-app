import { describe, it, expect } from "vitest";
import { mergeQueueIntoResult, rowsConflict, isNetworkFailure } from "./offlineMerge.js";

// mergeQueueIntoResult is what makes offline reads and online reads show the
// same thing (queued edits already applied) — get this wrong and a person
// offline either doesn't see their own new job, or sees it twice after sync.

const HEADERS = ["Job ID", "FY", "Created At", "Created By", "Client", "Status"];
const baseResult = () => ({
  status: "ok", sheet: "Jobs", fy: "2026-27", headers: HEADERS,
  data: [
    { "Job ID": "KE-JOB-001", "FY": "2026-27", "Created At": "10/8/2026, 9:00:00 am", "Created By": "Keshav Sharma", "Client": "Dhampur Sugar Mills", "Status": "Enquiry", _rowNum: 2 },
    { "Job ID": "KE-JOB-002", "FY": "2026-27", "Created At": "11/8/2026, 9:00:00 am", "Created By": "Staff User",    "Client": "Triveni Engineering",  "Status": "Scheduled", _rowNum: 3 },
  ],
});

describe("mergeQueueIntoResult — append", () => {
  it("appends a queued offline-created row into the result with pending-sync flags", () => {
    const queue = [{ sheet: "Jobs", action: "append", fy: "2026-27", localId: "q1", queuedAt: 1,
      row: ["DRAFT-JOB-1", "2026-27", "12/8/2026, 9:00:00 am", "Keshav Sharma", "New Client", "Enquiry"] }];
    const merged = mergeQueueIntoResult("Jobs", "2026-27", baseResult(), queue);
    expect(merged.data).toHaveLength(3);
    const draft = merged.data.find(r => r["Job ID"] === "DRAFT-JOB-1");
    expect(draft).toBeTruthy();
    expect(draft._pendingSync).toBe(true);
    expect(draft._localId).toBe("q1");
    expect(draft._rowNum).toBeNull();
  });

  it("does not leak a queued append into a different FY's view", () => {
    const queue = [{ sheet: "Jobs", action: "append", fy: "2025-26", localId: "q1", queuedAt: 1,
      row: ["DRAFT-JOB-1", "2025-26", "t", "u", "Client", "Enquiry"] }];
    const merged = mergeQueueIntoResult("Jobs", "2026-27", baseResult(), queue);
    expect(merged.data).toHaveLength(2);
  });

  it("ignores queue entries for a different sheet", () => {
    const queue = [{ sheet: "Clients", action: "append", fy: "2026-27", localId: "q1", queuedAt: 1, row: ["x"] }];
    const merged = mergeQueueIntoResult("Jobs", "2026-27", baseResult(), queue);
    expect(merged.data).toHaveLength(2);
  });
});

describe("mergeQueueIntoResult — update", () => {
  it("overlays a queued edit onto the matching row by _rowNum, keeping other rows untouched", () => {
    const queue = [{ sheet: "Jobs", action: "update", rowIndex: 3, localId: "q2", queuedAt: 1,
      row: ["KE-JOB-002", "2026-27", "13/8/2026, 9:00:00 am", "Staff User", "Triveni Engineering", "In Progress"] }];
    const merged = mergeQueueIntoResult("Jobs", "2026-27", baseResult(), queue);
    const edited = merged.data.find(r => r._rowNum === 3);
    expect(edited.Status).toBe("In Progress");
    expect(edited._pendingSync).toBe(true);
    expect(edited._queuedAction).toBe("update");
    const untouched = merged.data.find(r => r._rowNum === 2);
    expect(untouched.Status).toBe("Enquiry");
    expect(untouched._pendingSync).toBeUndefined();
  });

  it("flags _conflict when the queue entry's status is conflict", () => {
    const queue = [{ sheet: "Jobs", action: "update", rowIndex: 2, localId: "q3", queuedAt: 1, status: "conflict",
      row: ["KE-JOB-001", "2026-27", "t", "u", "Dhampur Sugar Mills", "Scheduled"] }];
    const merged = mergeQueueIntoResult("Jobs", "2026-27", baseResult(), queue);
    expect(merged.data.find(r => r._rowNum === 2)._conflict).toBe(true);
  });
});

describe("mergeQueueIntoResult — softDelete", () => {
  it("marks the Status column Deleted and flags the row as pending", () => {
    const queue = [{ sheet: "Jobs", action: "softDelete", rowIndex: 2, localId: "q4", queuedAt: 1 }];
    const merged = mergeQueueIntoResult("Jobs", "2026-27", baseResult(), queue);
    const row = merged.data.find(r => r._rowNum === 2);
    expect(row.Status).toBe("Deleted");
    expect(row._pendingSync).toBe(true);
    expect(row._queuedAction).toBe("softDelete");
  });
});

describe("mergeQueueIntoResult — edge cases", () => {
  it("returns the result unchanged when the queue is empty", () => {
    const result = baseResult();
    expect(mergeQueueIntoResult("Jobs", "2026-27", result, [])).toBe(result);
  });

  it("passes through an error result without touching it", () => {
    const errResult = { error: "Access denied" };
    expect(mergeQueueIntoResult("Jobs", "2026-27", errResult, [{ sheet: "Jobs", action: "append" }])).toBe(errResult);
  });

  it("silently skips an update/delete whose row is not present in this view", () => {
    const queue = [{ sheet: "Jobs", action: "update", rowIndex: 999, localId: "q5", queuedAt: 1, row: [] }];
    const merged = mergeQueueIntoResult("Jobs", "2026-27", baseResult(), queue);
    expect(merged.data).toHaveLength(2);
  });
});

describe("rowsConflict", () => {
  it("is false when there is no baseline to compare against (cache was cold)", () => {
    expect(rowsConflict(null, { createdAt: "a", createdBy: "b" })).toBe(false);
  });

  it("is false when the live createdAt/createdBy still match the baseline", () => {
    const snap = { createdAt: "10/8/2026", createdBy: "Keshav Sharma" };
    expect(rowsConflict(snap, { createdAt: "10/8/2026", createdBy: "Keshav Sharma" })).toBe(false);
  });

  it("is true when someone else's edit changed createdAt/createdBy since the baseline", () => {
    const snap = { createdAt: "10/8/2026", createdBy: "Keshav Sharma" };
    expect(rowsConflict(snap, { createdAt: "11/8/2026", createdBy: "Staff User" })).toBe(true);
  });

  it("is true even if only the timestamp changed (same user editing twice elsewhere)", () => {
    const snap = { createdAt: "10/8/2026", createdBy: "Keshav Sharma" };
    expect(rowsConflict(snap, { createdAt: "11/8/2026", createdBy: "Keshav Sharma" })).toBe(true);
  });
});

describe("isNetworkFailure", () => {
  it("treats an explicitly tagged network error as a network failure", () => {
    const e = new Error("boom"); e.isNetworkError = true;
    expect(isNetworkFailure(e)).toBe(true);
  });

  it("treats a TypeError (fetch's own failure mode) as a network failure", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not treat a plain application error as a network failure", () => {
    expect(isNetworkFailure(new Error("Access denied — your role does not have access to \"Jobs\""))).toBe(false);
  });

  it("does not treat an HTTP status error as a network failure", () => {
    expect(isNetworkFailure(new Error("HTTP 500"))).toBe(false);
  });

  it("returns false for no error", () => {
    expect(isNetworkFailure(null)).toBe(false);
  });
});
