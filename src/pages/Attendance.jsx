import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Construction,
  Clock3,
  Timer,
  Users,
  Search,
  ListFilter,
  RotateCcw,
  CheckCheck,
  Save,
  Send,
  ClipboardList,
  CircleAlert,
  LogOut,
  MoreVertical,
} from "lucide-react";
import { requestWorkerRemoval } from "../services/admin";
import { signOut } from "../services/auth";
import { useAuth } from "../auth/AuthProvider";
import {
  getAttendanceForDate,
  getMyAttendance,
  getMyEditRequests,
  getTeamWorkers,
  requestAttendanceEdit,
  submitAttendance,
} from "../services/attendance";
const statusOptions = ["Present", "Half Day", "Absent"];
const sites = [
  "Sastri",
  "Balaji Nagar",
  "Kaveri",
  "Venkatesh Nagar",
  "K.K site",
  "Aani",
  "Amathur",
  "Other",
];
const money = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
export default function Attendance() {
  const { profile, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [teamRoster, setTeamRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("Muster");
  const emp = profile?.employeeId || profile?.empId || "";
  const leaderName = profile?.name || user?.email || "Team Leader";
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateRecord, setDateRecord] = useState(null);
  const [dateLoading, setDateLoading] = useState(true);
  const [dateCheckFailed, setDateCheckFailed] = useState(false);
  const [editRequests, setEditRequests] = useState([]);
  const [editReason, setEditReason] = useState("");
  const [showEditRequest, setShowEditRequest] = useState(false);
  const isLocked = Boolean(dateRecord && dateRecord.editAllowed !== true);
  const pendingRequest = editRequests.some(
    (request) => request.date === selectedDate && request.status === "pending",
  );

  useEffect(() => {
    if (!emp) {
      setTeamRoster([]);
      setWorkers([]);
      setRosterLoading(false);
      setError("Your team leader employee ID is missing. Sign in again before loading attendance.");
      return;
    }
    let active = true;
    setRosterLoading(true);
    getTeamWorkers(emp)
      .then((loadedWorkers) => {
        if (!active) return;
        setTeamRoster(loadedWorkers);
        setError(
          loadedWorkers.length
            ? ""
            : `No active workers are assigned to team ${emp}. Ask your administrator to check the workers collection.`,
        );
      })
      .catch((loadError) => {
        if (!active) return;
        setError(
          `Could not load your workers (${loadError?.code || "error"}): ${loadError?.message || "Check Firestore access and worker assignments."}`,
        );
      })
      .finally(() => active && setRosterLoading(false));
    return () => { active = false; };
  }, [emp]);

  useEffect(() => {
    if (!emp) return;
    let active = true;
    getMyAttendance(emp)
      .then((records) => active && setRows(records))
      .catch((loadError) => active && setError(
        `Could not load saved submissions (${loadError?.code || "error"}): ${loadError?.message || "Check Firestore permissions."}`,
      ));
    return () => { active = false; };
  }, [emp]);

  useEffect(() => {
    if (!emp || !selectedDate || rosterLoading) return;
    let active = true;
    setDateLoading(true);
    setDateCheckFailed(false);
    setDateRecord(null);
    setWorkers(teamRoster.map((worker) => ({ ...worker, status: "Present", ot: 0 })));
    setNote("");
    async function loadSelectedDate() {
      try {
        const [record, requests] = await Promise.all([
          getAttendanceForDate(emp, selectedDate),
          getMyEditRequests(emp),
        ]);
        if (!active) return;
        setDateRecord(record);
        setEditRequests(requests);
        if (Array.isArray(record?.workers)) {
          setWorkers(record.workers.map((worker) => ({ ...worker, ot: Number(worker.ot) || 0 })));
          setNote(record.note || "");
          if (teamRoster.length > 0) setError("");
        } else if (!record) {
          const draft = localStorage.getItem(`constructpulse-draft-${emp}-${selectedDate}`);
          if (draft) {
            const saved = JSON.parse(draft);
            if (Array.isArray(saved.workers)) setWorkers(saved.workers);
            setNote(saved.note || "");
          }
        }
        setDateLoading(false);
      } catch (loadError) {
        if (active) {
          setError(`Could not check this attendance date (${loadError?.code || "error"}): ${loadError?.message || "Check Firestore permissions."}`);
          setDateCheckFailed(true);
          setDateLoading(false);
        }
      }
    }
    loadSelectedDate();
    return () => { active = false; };
  }, [emp, selectedDate, teamRoster, rosterLoading]);
  const filtered = useMemo(
    () =>
      workers.filter((worker) =>
        `${worker.name} ${worker.id} ${worker.role}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [workers, search],
  );
  const totals = useMemo(() => {
    const present = workers.filter((worker) => worker.status === "Present").length;
    const half = workers.filter((worker) => worker.status === "Half Day").length;
    const absent = workers.filter((worker) => worker.status === "Absent").length;
    const otHours = workers.reduce(
      (sum, worker) => sum + Number(worker.ot || 0),
      0,
    );
    return { present, half, absent, otHours };
  }, [workers]);
  const paymentFor = (worker) => {
    const dayFraction = worker.status === "Present" ? 1 : worker.status === "Half Day" ? 0.5 : 0;
    return Number(worker.rate || 0) * (dayFraction + Number(worker.ot || 0) * 0.5);
  };
  const paymentTotal = workers.reduce((sum, worker) => sum + paymentFor(worker), 0);
  const siteTotals = Object.values(workers.reduce((totalsBySite, worker) => {
    const site = worker.site || "Unassigned";
    if (!totalsBySite[site]) totalsBySite[site] = { site, amount: 0, workers: 0 };
    totalsBySite[site].amount += paymentFor(worker);
    totalsBySite[site].workers += 1;
    return totalsBySite;
  }, {}));
  const isEditable = !dateLoading && !dateCheckFailed && (!dateRecord || dateRecord.editAllowed === true);
function changeWorker(id, changes) {
    if (!isEditable) return;
    setWorkers((current) =>
      current.map((worker) =>
        worker.id === id ? { ...worker, ...changes } : worker,
      ),
    );
    setMessage("");
  }
  function markAllPresent() {
    if (!isEditable) return;
    setWorkers((current) =>
      current.map((worker) => ({ ...worker, status: "Present" })),
    );
    setMessage("All workers marked present. Review before submitting.");
  }
  function saveDraft() {
    if (!isEditable) {
      setError("This attendance date is locked. Request admin permission before editing it.");
      return;
    }
    try {
      localStorage.setItem(
        `constructpulse-draft-${emp}-${selectedDate}`,
        JSON.stringify({ date: selectedDate, workers, note }),
      );
      setMessage("Draft saved in this browser.");
      setError("");
    } catch {
      setError("Could not save draft in this browser.");
    }
  }
  async function submitRoster() {
    if (!emp || !workers.length) {
      setError("Your team roster is empty. Check the workers collection and team assignment.");
      return;
    }
    if (!isEditable) {
      setError("This attendance date is locked. Request admin permission before submitting changes.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const rosterSummary = workers
        .map(
          (worker) =>
            `${worker.name} (${worker.id}): ${worker.status}, Site ${worker.site || "Not selected"}, OT ${Number(worker.ot || 0)} half-day units`,
        )
        .join("\n");
      const fullNote = [
        `Attendance date: ${selectedDate}. Team roster submitted by ${leaderName}.`,
        `Present: ${totals.present}; Half Day: ${totals.half}; Absent: ${totals.absent}.`,
        note.trim() ? `Leader note: ${note.trim()}` : "",
        `Worker roster:\n${rosterSummary}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      await submitAttendance({
        employeeId: emp,
        employeeName: leaderName,
        site: "Multiple sites",
        date: selectedDate,
        status: "Submitted",
        overtimeCount: totals.otHours,
        totalPayment: paymentTotal,
        siteTotals,
        workers,
        note: note.trim(),
        rosterSummary: fullNote,
      });
      setRows(await getMyAttendance(emp));
      setDateRecord(await getAttendanceForDate(emp, selectedDate));
      localStorage.removeItem(`constructpulse-draft-${emp}-${selectedDate}`);
      setMessage("Attendance submitted. Payroll is an unverified estimate until an administrator reviews and approves it.");
    } catch (submitError) {
      setError(
        submitError?.message || "Unable to submit. Check Firestore rules.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function sendEditRequest() {
    if (!dateRecord || !editReason.trim()) {
      setError("Enter a reason for requesting this attendance edit.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestAttendanceEdit({
        attendanceId: dateRecord.id,
        employeeId: emp,
        employeeName: leaderName,
        date: selectedDate,
        reason: editReason,
      });
      setEditRequests(await getMyEditRequests(emp));
      setEditReason("");
      setShowEditRequest(false);
      setMessage("Edit request sent to the administrator.");
    } catch (requestError) {
      setError(`Could not send edit request (${requestError?.code || "error"}): ${requestError?.message || "Check Firestore permissions."}`);
    } finally {
      setBusy(false);
    }
  }
  async function sendWorkerRemovalRequest(worker) {
    setBusy(true); setError(""); setMessage("");
    try {
      await requestWorkerRemoval(worker, { employeeId: emp, name: leaderName });
      setMessage(`Deletion request sent for ${worker.name}.`);
    } catch (requestError) {
      setError(requestError?.message || "Could not send deletion request.");
    } finally { setBusy(false); }
  }
  function handleTabClick(label) {
    setTab(label);
    if (label === "Submit") {
      document
        .querySelector(".bottom-actions")
        ?.scrollIntoView({ behavior: "smooth", block: "end" });
    } else if (label === "Gang Summary") {
      document
        .querySelector(".summary-cards")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (label === "Overtime") {
      document
        .querySelector(".worker-list")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  return (
    <div className="min-h-screen bg-slate-100 pb-28 text-slate-900">
      <header className="bg-[#111b31] px-4 pb-5 pt-3 text-white shadow-lg sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
  <div className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
    <Construction
      size={20}
      strokeWidth={2.8}
      className="text-orange-400"
    />
    <span>
      ConstructPulse <b>Field Portal</b>
    </span>
  </div>
  <button
    type="button"
    onClick={() => setCalendarOpen(!calendarOpen)}
    className="rounded-xl p-2 text-white hover:bg-white/10"
    aria-label="Open calendar"
  >
    <CalendarDays size={20} />
  </button>
</div>
{/* Calendar popup */}
{calendarOpen && (
  <div className="mx-auto mt-3 max-w-3xl rounded-xl bg-white p-4 text-slate-900 shadow-lg">
    <label className="mb-2 block text-sm font-semibold">
      Select attendance date
    </label>
    <input
      type="date"
      value={selectedDate}
      onChange={(e) => setSelectedDate(e.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2"
    />
    <p className="mt-3 text-sm text-slate-600">
      {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })}
    </p>
    <button
      type="button"
      onClick={() => setCalendarOpen(false)}
      className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
    >
      Done
    </button>
  </div>
)}
        <div className="mx-auto mt-4 flex max-w-3xl items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-950">
            {String(leaderName)
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-1 flex-col text-sm">
            <strong className="truncate font-bold">{leaderName}</strong>
            <span className="truncate text-xs text-slate-300">
              Team Leader · {emp || "Employee ID unavailable"}
            </span>
          </div>
          <span className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold sm:inline-flex">
            <i /> Live Sync Active
          </span>
        </div>
        <div className="mx-auto mt-4 flex max-w-3xl items-center justify-between gap-3 text-xs font-semibold">
          <span className="flex items-center gap-2">
          </span>
          {/*sign out button */}
          <button
  type="button"
  onClick={async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  }}
  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-800"
>
  <LogOut size={18} />
  <span>Sign Out</span>
</button>
        </div>
        <div className="mx-auto mt-4 flex w-full max-w-3xl flex-row items-center gap-2">
          <span className="inline-flex w-full items-center gap-2 whitespace-nowrap rounded-xl bg-white px-3 py-3 text-xs font-semibold text-slate-900 sm:px-4 sm:text-sm">
            <CalendarDays size={14} className="text-orange-600" />
            Date: {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-GB")}
          </span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-5 sm:px-5">
        <div className="flex items-start gap-3 border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <CircleAlert size={17} className="shrink-0" />
          <div className="flex flex-col gap-1 text-xs">
            <b>Site Rule: Mandatory Hard Hats &amp; Steel-Toe Boots</b>
            <span>
              Muster cut-off time for Gang #104 is 09:30 AM. OT auto-logs at
              17:30.
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm font-semibold">
          <span>Shift Workforce Status</span>
            <small>{rosterLoading ? "Loading roster…" : `Total: ${workers.length} workers`}</small>
        </div>
        <div className="summary-cards grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
            <small className="text-[10px] font-bold tracking-wide text-slate-500">
              TOTAL
            </small>
            <strong className="my-1 text-2xl font-extrabold">
              {workers.length}
            </strong>
            <span className="text-[10px] text-slate-500">Enrolled</span>
          </div>
          <div className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
            <small className="text-[10px] font-bold tracking-wide text-emerald-700">
              PRESENT
            </small>
            <strong className="my-1 text-2xl font-extrabold">
              {totals.present}
            </strong>
            <span className="text-[10px] text-emerald-700">Full Day (1.0)</span>
          </div>
          <div className="flex flex-col rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
            <small className="text-[10px] font-bold tracking-wide text-amber-700">
              HALF DAY
            </small>
            <strong className="my-1 text-2xl font-extrabold">
              {totals.half}
            </strong>
            <span className="text-[10px] text-amber-700">Half Day (0.5)</span>
          </div>
          <div className="flex flex-col rounded-xl border border-rose-200 bg-rose-50 p-3 shadow-sm">
            <small className="text-[10px] font-bold tracking-wide text-rose-700">
              ABSENT
            </small>
            <strong className="my-1 text-2xl font-extrabold">
              {totals.absent}
            </strong>
            <span className="text-[10px] text-rose-700">No payout</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-slate-800">
          <span className="flex items-center gap-2">
            <Clock3 size={18} /> Work Days: {" "}
            <b>{(totals.present + totals.half * 0.5).toFixed(1)} Days</b>
          </span>
          <span className="flex items-center gap-2">
            <Timer size={18} /> OT half-day units: <b>{totals.otHours}</b>
          </span>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="flex items-center justify-between gap-2"><b>Unverified payment estimate</b><strong>{money(paymentTotal)}</strong></div>
          <p className="mt-1 text-xs">Submitted figures are not verified by the free Firebase plan. An administrator must check attendance and worker rates before approval.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {siteTotals.map((total) => <span key={total.site}>{total.site}: {money(total.amount)} ({total.workers})</span>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-3 text-sm font-bold text-white hover:bg-slate-800"
            onClick={markAllPresent}
            disabled={!isEditable || !workers.length}
            type="button"
          >
            <CheckCheck size={19} /> Mark All Present ({workers.length})
          </button>
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            title="Show all workers"
            onClick={() => setSearch("")}
            type="button"
          >
            <ListFilter size={20} />
          </button>
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            title="Reset roster"
            onClick={() => {
              setWorkers(teamRoster.map((worker) => ({ ...worker, status: "Present", ot: 0 })));
              setMessage("");
              setError("");
            }}
            disabled={!isEditable || !workers.length}
            type="button"
          >
            <RotateCcw size={19} />
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-500 shadow-sm">
          <Search size={17} className="shrink-0" />
          <input
            className="w-full min-w-0 bg-transparent text-sm text-slate-900 outline-none"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search worker by name or Aadhaar/ID..."
          />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs font-bold tracking-wide text-slate-600">
          <span>ACTIVE GANG ROSTER ({workers.length})</span>
          <small className="flex items-center gap-1">
            <Users size={13} /> Tap status to toggle
          </small>
        </div>
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {dateRecord && (
          <div className={`rounded-xl border p-3 text-sm ${isLocked ? "border-amber-300 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
            <strong>{isLocked ? "Attendance submitted and locked" : "Admin approved this date for editing"}</strong>
            {isLocked && (
              <div className="mt-2">
                {pendingRequest ? (
                  <span>Your edit request is waiting for admin review.</span>
                ) : showEditRequest ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                      value={editReason}
                      onChange={(event) => setEditReason(event.target.value)}
                      placeholder="Reason for the correction"
                    />
                    <button type="button" onClick={sendEditRequest} disabled={busy} className="rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white disabled:opacity-50">Send request</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowEditRequest(true)} className="mt-2 rounded-lg border border-amber-500 px-3 py-2 font-semibold">Request edit permission</button>
                )}
              </div>
            )}
          </div>
        )}
        <section className="worker-list flex flex-col gap-3">
          {rosterLoading && <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Loading your team roster…</div>}
          {filtered.map((worker) => {
            return (
              <article
                className={`rounded-xl border bg-white p-3 shadow-sm ${
                  worker.status === "Absent"
                    ? "border-rose-200"
                    : "border-slate-200"
                }`}
                key={worker.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-slate-100 text-sm font-bold text-slate-700">
                      {worker.avatar}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1 text-sm">
                      <strong className="truncate font-bold text-slate-900">
                        {worker.name}
                      </strong>
                      <span className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                        {worker.id}
                        <em className="rounded-full bg-slate-100 px-2 py-0.5 not-italic text-slate-700">
                          {worker.role}
                        </em>
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs font-bold text-slate-800">
                    <small className="block text-[9px] tracking-wide text-slate-500">
                      BASE RATE
                    </small>
                    <strong className="text-xs">
                      {money(worker.rate)}
                      <small className="text-slate-500"> /day</small>
                    </strong>
                  </div>
                </div>
                <details className="group relative mt-2 flex justify-end">
                  <summary aria-label={`More actions for ${worker.name}`} className="list-none cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100"><MoreVertical size={18} /></summary>
                  <div className="absolute right-0 top-8 z-10 min-w-44 rounded-lg border bg-white p-1 shadow-lg">
                    <button type="button" disabled={busy} onClick={() => sendWorkerRemovalRequest(worker)} className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Delete · request approval</button>
                  </div>
                </details>
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
                  {statusOptions.map((statusOption) => {
                    const isSelected = worker.status === statusOption;
                    const selectedClass =
                      statusOption === "Present"
                        ? "bg-emerald-600 text-white"
                        : statusOption === "Half Day"
                          ? "bg-amber-500 text-white"
                          : statusOption === "Absent"
                            ? "bg-rose-600 text-white"
                            : "bg-slate-700 text-white";
                    return (
                      <button
                        key={statusOption}
                        type="button"
                        className={`flex min-w-0 flex-col items-center justify-center rounded-lg px-1 py-2 text-[11px] sm:text-xs ${
                          isSelected
                            ? selectedClass
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        disabled={!isEditable}
                        onClick={() =>
                          changeWorker(worker.id, {
                            status: statusOption,
                            ...(statusOption !== "Present" ? { ot: 0 } : {}),
                          })
                        }
                      >
                        <span>{statusOption}</span>
                        <small>
                          {statusOption === "Present"
                            ? "1.0 Day"
                            : statusOption === "Half Day"
                              ? "0.5 Day"
                              : "0.0"}
                        </small>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-2 items-start gap-3 border-t border-slate-100 pt-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-700">
                    {worker.status === "Present" ? (
                      <>
                        <span className="flex items-center gap-1">
                          <Timer size={13} /> OT units:
                        </span>
                        <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white">
                          <button
                            className="px-3 py-2 hover:bg-slate-100"
                            disabled={!isEditable}
                            onClick={() =>
                              changeWorker(worker.id, {
                                ot: Math.max(0, Number(worker.ot) - 1),
                              })
                            }
                            aria-label="Decrease overtime"
                            type="button"
                          >
                            −
                          </button>
                          <b className="px-2">
                            {Number(worker.ot || 0)} × 0.5 day
                          </b>
                          <button
                            className="px-3 py-2 hover:bg-slate-100"
                            disabled={!isEditable}
                            onClick={() =>
                              changeWorker(worker.id, {
                                ot: Math.min(20, Number(worker.ot || 0) + 1),
                              })
                            }
                            aria-label="Increase overtime"
                            type="button"
                          >
                            +
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {worker.status === "Absent"
                          ? "⊘ Marked Absent • No Payout"
                          : "⊘ No OT (Half-Day)"}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label htmlFor={`site-${worker.id}`} className="text-[10px] font-semibold text-slate-500">Work Site</label>
                    <select
                      id={`site-${worker.id}`}
                      value={worker.site || ""}
                      disabled={!isEditable}
                      onChange={(event) => changeWorker(worker.id, { site: event.target.value })}
                      className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-800"
                    >
                      <option value="">Select site</option>
                      {sites.map((siteName) => <option key={siteName} value={siteName}>{siteName}</option>)}
                    </select>
                  </div>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No workers match your search.
            </div>
          )}
        </section>
        {rows.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-bold">Recent submissions ({rows.length})</h3>
            {rows.slice(0, 3).map((row) => (
              <div
                className="flex items-center justify-between gap-3 border-t border-slate-100 py-3 text-sm"
                key={row.id}
              >
                <span className="flex flex-col">
                  <b>{row.site}</b>
                  <small>
                    {row.submittedAt?.toDate?.().toLocaleDateString?.() ||
                      "Recently submitted"}
                  </small>
                </span>
                <strong>{row.overtimeCount || row.overtimeHours || 0} OT units</strong>
              </div>
            ))}
          </section>
        )}
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <label htmlFor="leader-note">Note for approver (optional)</label>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            id="leader-note"
            disabled={!isEditable}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a short note for this muster"
          />
        </div>
      </main>
      <div className="bottom-actions fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-3xl gap-2 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <button
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-800"
          onClick={saveDraft}
          disabled={!isEditable}
          type="button"
        >
          <Save size={15} /> Save Draft
        </button>
        <button
          className="flex flex-[1.3] items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60"
          disabled={busy || !isEditable || workers.length === 0}
          onClick={submitRoster}
          type="button"
        >
          {busy ? "Submitting…" : isLocked ? "Date Locked" : dateRecord ? "Resubmit & Lock" : "Submit for Approval"} <Send size={16} />
        </button>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-3xl grid-cols-4 border-t border-slate-200 bg-white px-2 py-2 shadow-[0\\\_-4px_12px_rgba(0,0,0,0.08)]"
        aria-label="Attendance navigation"
      >
        {[
          ["Muster", ClipboardList],
          ["Gang Summary", Users],
          ["Overtime", Timer],
          ["Submit", Send],
        ].map(([label, Icon]) => (
          <button
            key={label}
            type="button"
            className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium sm:text-xs ${
              tab === label
                ? "bg-orange-500 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            onClick={() => handleTabClick(label)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
