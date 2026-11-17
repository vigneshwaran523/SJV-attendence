const allowedSites = new Set([
  "Sastri",
  "Balaji Nagar",
  "Kaveri",
  "Venkatesh Nagar",
  "K.K site",
  "Aani",
  "Amathur",
  "Other",
]);

const allowedStatuses = new Set(["Present", "Half Day", "Absent"]);

function attendanceId(employeeId, date) {
  return `${employeeId}_${date}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function prepareAttendance({ profile, activeWorkers, data }) {
  const employeeId = String(profile?.employeeId || profile?.empId || "").trim();
  if (!employeeId || String(data?.employeeId || "").trim() !== employeeId) {
    throw new Error("The submitted team leader does not match the signed-in profile.");
  }

  const date = String(data?.date || "").trim();
  if (!validDate(date)) throw new Error("Enter a valid attendance date.");

  if (!Array.isArray(activeWorkers) || !Array.isArray(data?.workers)) {
    throw new Error("The team roster or submitted worker list is invalid.");
  }
  if (activeWorkers.length === 0 || activeWorkers.length > 100) {
    throw new Error("The active team roster size is invalid.");
  }
  if (data.workers.length !== activeWorkers.length) {
    throw new Error("Submit every active worker assigned to your team exactly once.");
  }

  const rosterById = new Map(activeWorkers.map((worker) => [String(worker.id), worker]));
  const seen = new Set();
  const totalsBySite = new Map();
  let overtimeCount = 0;
  let totalPayment = 0;

  const workers = data.workers.map((row) => {
    const id = String(row?.id || "").trim();
    if (!id || seen.has(id) || !rosterById.has(id)) {
      throw new Error("A submitted worker is missing, duplicated, or not assigned to this team.");
    }
    seen.add(id);

    const rosterWorker = rosterById.get(id);
    const status = String(row.status || "");
    if (!allowedStatuses.has(status)) throw new Error(`Invalid attendance status for worker ${id}.`);

    const ot = Number(row.ot || 0);
    if (!Number.isInteger(ot) || ot < 0 || ot > 20 || (status !== "Present" && ot !== 0)) {
      throw new Error(`Invalid overtime units for worker ${id}.`);
    }

    const site = String(row.site || rosterWorker.site || "").trim();
    if (site && !allowedSites.has(site)) throw new Error(`Invalid work site for worker ${id}.`);

    const rate = Number(rosterWorker.rate);
    if (!Number.isFinite(rate) || rate < 0) throw new Error(`The stored rate for worker ${id} is invalid.`);

    const attendanceDays = status === "Present" ? 1 : status === "Half Day" ? 0.5 : 0;
    const payment = Math.round((rate * (attendanceDays + ot * 0.5) + Number.EPSILON) * 100) / 100;
    const normalized = {
      id,
      name: String(rosterWorker.name || "").trim(),
      role: String(rosterWorker.role || "Worker").trim(),
      rate,
      site,
      status,
      ot,
      attendanceDays,
      payment,
    };

    const siteKey = site || "Unassigned";
    const siteTotal = totalsBySite.get(siteKey) || { site: siteKey, amount: 0, workers: 0 };
    siteTotal.amount = Math.round((siteTotal.amount + payment) * 100) / 100;
    siteTotal.workers += 1;
    totalsBySite.set(siteKey, siteTotal);
    overtimeCount += ot;
    totalPayment = Math.round((totalPayment + payment) * 100) / 100;
    return normalized;
  });

  const note = String(data.note || "").trim();
  if (note.length > 1000) throw new Error("The approver note must be 1,000 characters or fewer.");

  const rosterSummary = [
    `Attendance date: ${date}. Team roster submitted by ${String(profile.name || employeeId)}.`,
    `Present: ${workers.filter((worker) => worker.status === "Present").length}; Half Day: ${workers.filter((worker) => worker.status === "Half Day").length}; Absent: ${workers.filter((worker) => worker.status === "Absent").length}.`,
    `Worker roster:\n${workers.map((worker) => `${worker.name} (${worker.id}): ${worker.status}, Site ${worker.site || "Not selected"}, OT ${worker.ot} half-day units`).join("\n")}`,
  ].join("\n\n");

  return {
    id: attendanceId(employeeId, date),
    payload: {
      employeeId,
      employeeName: String(profile.name || employeeId),
      site: "Multiple sites",
      date,
      status: "Submitted",
      reviewStatus: "Pending",
      editAllowed: false,
      overtimeCount,
      totalPayment,
      siteTotals: [...totalsBySite.values()],
      workers,
      note,
      rosterSummary,
    },
  };
}

module.exports = { attendanceId, prepareAttendance };
