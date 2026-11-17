import { useEffect, useMemo, useState } from "react";

import { createTeamLeaderAccount, signOut } from "../services/auth";
import { createWorker, getAdminRoster } from "../services/admin";
import { decideEmployeeRemoval, getEmployeeRemovalRequests } from "../services/admin";
import * as XLSX from "xlsx";

import {

  getAllAttendance,

  getAllEditRequests,

  decideEditRequest,

  updateAttendanceReview,

} from "../services/attendance";

const money = (value) => new Intl.NumberFormat("en-IN", {

  style: "currency", currency: "INR", maximumFractionDigits: 0,

}).format(Number(value || 0));

const dateText = (value) => value

  ? new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })

  : "—";

function localToday() {

  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

}

function weekStart(value) {

  if (!value) return "";

  const [y, m, d] = value.split("-").map(Number);

  const date = new Date(y, m - 1, d);

  date.setDate(date.getDate() - date.getDay());

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

}

function shiftDate(value, amount) {

  const [y, m, d] = value.split("-").map(Number);

  const date = new Date(y, m - 1, d);

  date.setDate(date.getDate() + amount);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

}

function csvCell(value) {

  return `"${String(value ?? "").replace(/"/g, '""')}"`;

}

function downloadCSV(filename, headers, rows) {

  const csv = "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;

  link.download = filename;

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);

}

const workerHeaders = [

  "Date", "Team Leader ID", "Team Leader", "Worker ID", "Worker Name",

  "Role", "Site", "Attendance Status", "Work Days", "OT Units",

  "Daily Rate", "Worker Payment", "Team Total", "Submission Status",

];

function workerExportRows(records) {

  const output = [];

  records.forEach(record => {

    (record.workers || []).forEach(worker => output.push([

      record.date, record.employeeId, record.employeeName, worker.id, worker.name,

      worker.role, worker.site, worker.status,

      worker.attendanceDays ?? (worker.status === "Present" ? 1 : worker.status === "Half Day" ? 0.5 : 0),

      worker.ot ?? 0, worker.rate ?? 0,
      worker.payment ?? (Number(worker.rate || 0) * ((worker.status === "Present" ? 1 : worker.status === "Half Day" ? 0.5 : 0) + Number(worker.ot || 0) * 0.5)),

      record.totalPayment ?? 0, record.reviewStatus || record.status,

    ]));

  });

  return output;

}

export default function AdminDashboard() {

  const [records, setRecords] = useState([]);

  const [editRequests, setEditRequests] = useState([]);

  const [selectedDate, setSelectedDate] = useState(localToday);

  const [siteFilter, setSiteFilter] = useState("All Sites");

  const [teamFilter, setTeamFilter] = useState("All Teams");

  const [search, setSearch] = useState("");

  const [queueTab, setQueueTab] = useState("Pending");

  const [expandedTeams, setExpandedTeams] = useState({});

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");

  const [notice, setNotice] = useState("");

  const [teamLeaders, setTeamLeaders] = useState([]);
  const [rosterWorkers, setRosterWorkers] = useState([]);
  const [removalRequests, setRemovalRequests] = useState([]);

  const [managementBusy, setManagementBusy] = useState(false);

  const [managementError, setManagementError] = useState("");

  const [managementNotice, setManagementNotice] = useState("");

  const [workerForm, setWorkerForm] = useState({ id: "", name: "", role: "", rate: "", site: "", teamLeaderEmployeeId: "" });

  const [leaderForm, setLeaderForm] = useState({ name: "", employeeId: "", password: "" });

  const week = weekStart(selectedDate);

  const weekEnd = shiftDate(week, 6);

async function refresh() {

  setBusy(true);

  setError("");

  try {

    console.log("Checking admin Firestore access...");

    let attendance = [];

    let editRequests = [];

    try {

      attendance = await getAllAttendance();

      console.log("Attendance access: SUCCESS", attendance);

    } catch (error) {

      console.error("Attendance access: FAILED", error);

      throw new Error(

        "Attendance permission error: " + error.message

      );

    }

    try {

      editRequests = await getAllEditRequests();

      console.log("Edit requests access: SUCCESS", editRequests);

    } catch (error) {

      console.error("Edit requests access: FAILED", error);

      throw new Error(

        "Edit requests permission error: " + error.message

      );

    }

    setRecords(attendance);

    setEditRequests(editRequests);

    try { setRemovalRequests(await getEmployeeRemovalRequests()); } catch (requestError) { console.warn("Could not load employee removal requests", requestError); }

    console.log("Admin dashboard data loaded successfully.");

  } catch (error) {

    console.error("ADMIN FIRESTORE ERROR:", error);

    setError(error.message || "Unable to load dashboard data.");

  } finally {

    setBusy(false);

  }

}

  async function loadTeamLeaders() {
    try {
      const roster = await getAdminRoster();
      setTeamLeaders(roster.teamLeaders.filter(leader => leader.status === "active"));
      setRosterWorkers(roster.workers);
    } catch (loadError) {
      setManagementError(loadError?.message || "Could not load team leaders. Check admin Firestore permissions.");
    }
  }

  useEffect(() => { refresh(); loadTeamLeaders(); }, []);

  async function handleAddWorker(event) {
    event.preventDefault();
    setManagementBusy(true);
    setManagementError("");
    setManagementNotice("");
    try {
      await createWorker(workerForm);
      setWorkerForm({ id: "", name: "", role: "", rate: "", site: "", teamLeaderEmployeeId: "" });
      setManagementNotice(`Labour ${workerForm.name.trim()} added under ${workerForm.teamLeaderEmployeeId}.`);
    } catch (addError) {
      setManagementError(addError?.message || "Could not add labour. Check Firestore rules and worker details.");
    } finally {
      setManagementBusy(false);
    }
  }

  async function handleAddTeamLeader(event) {
    event.preventDefault();
    setManagementBusy(true);
    setManagementError("");
    setManagementNotice("");
    try {
      await createTeamLeaderAccount(leaderForm);
      const employeeId = leaderForm.employeeId.trim().toUpperCase();
      setLeaderForm({ name: "", employeeId: "", password: "" });
      await loadTeamLeaders();
      setManagementNotice(`Team leader ${employeeId} added. They can sign in with that employee ID and the password you set.`);
    } catch (addError) {
      setManagementError(addError?.message || "Could not add team leader. Check Firebase Authentication and Firestore rules.");
    } finally {
      setManagementBusy(false);
    }
  }

  const weekRecords = useMemo(

    () => records.filter(record => record.date && weekStart(record.date) === week),

    [records, week]

  );

  const allSites = useMemo(() => {

    const names = new Set();

    weekRecords.forEach(record => {

      (record.siteTotals || []).forEach(site => site.site && names.add(site.site));

      (record.workers || []).forEach(worker => worker.site && names.add(worker.site));

    });

    return [...names].sort();

  }, [weekRecords]);

  const allTeams = useMemo(() => [...new Set(weekRecords.map(r => r.employeeId).filter(Boolean))].sort(), [weekRecords]);

  const filteredRecords = useMemo(() => {

    const term = search.trim().toLowerCase();

    return weekRecords.filter(record => {

      const teamMatch = teamFilter === "All Teams" || record.employeeId === teamFilter;

      const siteMatch = siteFilter === "All Sites" ||

        (record.workers || []).some(w => w.site === siteFilter) ||

        (record.siteTotals || []).some(s => s.site === siteFilter);

      const textMatch = !term || [record.employeeId, record.employeeName, record.date, record.status,

        ...(record.workers || []).flatMap(w => [w.name, w.id, w.role, w.site])]

        .some(value => String(value || "").toLowerCase().includes(term));

      return teamMatch && siteMatch && textMatch;

    });

  }, [weekRecords, teamFilter, siteFilter, search]);

  const totals = useMemo(() => {

    const workerRows = filteredRecords.flatMap(record => record.workers || []);

    return {

      payment: filteredRecords.reduce((sum, r) => sum + Number(r.totalPayment || 0), 0),

      teams: new Set(filteredRecords.map(r => r.employeeId)).size,

      submissions: filteredRecords.length,

      workers: workerRows.length,

      days: workerRows.reduce((sum, w) => sum + Number(w.attendanceDays ?? (w.status === "Present" ? 1 : w.status === "Half Day" ? 0.5 : 0)), 0),

      ot: workerRows.reduce((sum, w) => sum + Number(w.ot || 0), 0),

    };

  }, [filteredRecords]);

  const teamGroups = useMemo(() => {

    const grouped = {};

    filteredRecords.forEach(record => {

      const id = record.employeeId || "Unknown";

      if (!grouped[id]) grouped[id] = { id, name: record.employeeName || id, records: [], workers: [], total: 0, days: 0, ot: 0, sites: new Set() };

      const group = grouped[id];

      group.records.push(record);

      group.total += Number(record.totalPayment || 0);

      (record.workers || []).forEach(worker => {

        group.workers.push({ ...worker, attendanceDate: record.date, submissionStatus: record.reviewStatus || record.status });

        group.days += Number(worker.attendanceDays ?? (worker.status === "Present" ? 1 : worker.status === "Half Day" ? 0.5 : 0));

        group.ot += Number(worker.ot || 0);

        if (worker.site) group.sites.add(worker.site);

      });

    });

    return Object.values(grouped).sort((a, b) => b.total - a.total);

  }, [filteredRecords]);

  const siteGroups = useMemo(() => {

    const grouped = {};

    filteredRecords.forEach(record => {

      (record.siteTotals || []).forEach(site => {

        const name = site.site || "Unassigned";

        if (!grouped[name]) grouped[name] = { name, payment: 0, workers: 0, days: 0, ot: 0, teams: new Set() };

        grouped[name].payment += Number(site.amount || 0);

        grouped[name].workers += Number(site.workers || 0);

        if (record.employeeId) grouped[name].teams.add(record.employeeId);

      });

      // Fallback for older records without siteTotals.

      if (!(record.siteTotals || []).length) {

        (record.workers || []).forEach(worker => {

          const name = worker.site || "Unassigned";

          if (!grouped[name]) grouped[name] = { name, payment: 0, workers: 0, days: 0, ot: 0, teams: new Set() };

          grouped[name].payment += Number(worker.payment || 0);

          grouped[name].workers += 1;

          grouped[name].days += Number(worker.attendanceDays || 0);

          grouped[name].ot += Number(worker.ot || 0);

          if (record.employeeId) grouped[name].teams.add(record.employeeId);

        });

      }

    });

    return Object.values(grouped).sort((a, b) => b.payment - a.payment);

  }, [filteredRecords]);

  const pendingSubmissions = weekRecords.filter(r => (r.reviewStatus || "Pending") === "Pending" || r.reviewStatus === "Pending Review");

  const approvedSubmissions = weekRecords.filter(r => r.reviewStatus === "Approved");

  const rejectedSubmissions = weekRecords.filter(r => r.reviewStatus === "Rejected");

  const pendingEditRequests = editRequests.filter(r => r.status === "pending");

  const visibleQueue = queueTab === "Pending" ? pendingSubmissions : queueTab === "Approved" ? approvedSubmissions : rejectedSubmissions;

  async function reviewSubmission(record, status) {

    const action = status === "Approved" ? "approve" : "reject";

    if (!window.confirm(`Are you sure you want to ${action} ${record.employeeId} attendance for ${dateText(record.date)}?`)) return;

    setBusy(true); setError(""); setNotice("");

    try {

      await updateAttendanceReview(record.id, status);

      setNotice(`Attendance ${status.toLowerCase()} successfully.`);

      await refresh();

    } catch (e) {

      console.error("Submission review failed", e);

      setError(e?.message || "Could not update submission status.");

    } finally { setBusy(false); }

  }

  async function reviewEditRequest(request, status) {

    setBusy(true); setError(""); setNotice("");

    try {

      await decideEditRequest({ ...request, status });

      setNotice(status === "approved" ? "One-time edit permission approved." : "Edit request rejected.");

      await refresh();

    } catch (e) {

      console.error("Edit request review failed", e);

      setError(e?.message || "Could not process edit request.");

    } finally { setBusy(false); }

  }

  function exportAll() {

    downloadCSV(`ConstructPulse_All_Attendance\_${localToday()}.csv`, workerHeaders, workerExportRows(records));

  }

  function exportMuster(selectedRecords, filename) {
    const dayDates = Array.from({ length: 7 }, (_, index) => shiftDate(week, index));
    const teams = new Map();

    selectedRecords.forEach(record => {
      const teamId = record.employeeId || "Unknown";
      if (!teams.has(teamId)) teams.set(teamId, { name: record.employeeName || teamId, workers: new Map() });
      const team = teams.get(teamId);
      (record.workers || []).forEach(worker => {
        const key = `${worker.id || worker.name || "Unknown"}|${worker.name || ""}`;
        if (!team.workers.has(key)) team.workers.set(key, {
          name: worker.name || "", attendance: Object.fromEntries(dayDates.map(date => [date, { site: "", days: 0 }])),
          days: 0, rate: Number(worker.rate || 0), payment: 0,
        });
        const row = team.workers.get(key);
        const days = Number(worker.attendanceDays ?? (worker.status === "Present" ? 1 : worker.status === "Half Day" ? 0.5 : 0));
        if (row.attendance[record.date]) {
          row.attendance[record.date].site = worker.site || "";
          row.attendance[record.date].days += days;
        }
        row.days += days;
        row.rate = Number(worker.rate ?? row.rate);
        row.payment += Number(worker.payment ?? (Number(worker.rate || 0) * (days + Number(worker.ot || 0) * 0.5)));
      });
    });

    const workbook = XLSX.utils.book_new();
    const dayHeaderRow = ["S.no", "Name", ...dayDates.flatMap(date => [new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long" }), ""]), "Total", "Salary per day", "Total", "Advance", "Tea / water", "Total"];
    const usedNames = new Set();
    teams.forEach((team, teamId) => {
      const workers = [...team.workers.values()].sort((a, b) => a.name.localeCompare(b.name));
      const rows = [[`Weekly Attendance report · ${teamId} · ${team.name}`], dayHeaderRow];
      workers.forEach((worker, index) => {
        rows.push([index + 1, worker.name, ...dayDates.flatMap(date => [worker.attendance[date].site, ""]), "", "", "", "", "", ""]);
        rows.push(["", "", ...dayDates.flatMap(date => ["", worker.attendance[date].days || ""]), worker.days, worker.rate, worker.payment, 0, 0, worker.payment]);
      });
      rows.push(["", "Grand Total", ...dayDates.flatMap(date => ["", workers.reduce((sum, worker) => sum + worker.attendance[date].days, 0)]),
        workers.reduce((sum, worker) => sum + worker.days, 0), "", workers.reduce((sum, worker) => sum + worker.payment, 0), "", "", workers.reduce((sum, worker) => sum + worker.payment, 0)]);
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      const lastColumn = 1 + 1 + dayDates.length * 2 + 6 - 1;
      sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } },
        ...dayDates.map((_, index) => ({ s: { r: 1, c: 2 + index * 2 }, e: { r: 1, c: 3 + index * 2 } }))];
      sheet["!cols"] = [{ wch: 7 }, { wch: 22 }, ...dayDates.flatMap(() => [{ wch: 17 }, { wch: 8 }]),
        { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
      sheet["!freeze"] = { xSplit: 2, ySplit: 2 };
      const baseName = `${teamId} ${team.name}`.replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "Team Muster";
      let sheetName = baseName, suffix = 2;
      while (usedNames.has(sheetName.toLowerCase())) sheetName = `${baseName.slice(0, 27)} ${suffix++}`;
      usedNames.add(sheetName.toLowerCase());
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    });
    if (!teams.size) {
      const sheet = XLSX.utils.aoa_to_sheet([[`Weekly Attendance report · ${dateText(week)} – ${dateText(weekEnd)}`], dayHeaderRow]);
      XLSX.utils.book_append_sheet(workbook, sheet, "Weekly Muster");
    }
    XLSX.writeFile(workbook, filename);
  }

  function exportWeek() {
    exportMuster(filteredRecords, `ConstructPulse_Weekly_Payment_${week}.xlsx`);
  }

  function exportMonth() {
    const month = selectedDate.slice(0, 7);
    const monthRecords = records.filter(record => record.date?.startsWith(month));
    const employeeRows = rosterWorkers.map(worker => ({ "Employee ID": worker.id, "Employee Name": worker.name, Role: worker.role || "Worker", "Team Leader ID": worker.teamLeaderEmployeeId || "", Site: worker.site || "", "Daily Rate": Number(worker.rate || 0), Status: worker.active === false ? "Inactive" : "Active" }));
    const attendanceRows = workerExportRows(monthRecords).map(row => Object.fromEntries(workerHeaders.map((header, index) => [header, row[index]])));
    const paymentRows = monthRecords.flatMap(record => (record.workers || []).map(worker => ({ Date: record.date, "Team Leader ID": record.employeeId, "Team Leader": record.employeeName, "Employee ID": worker.id, "Employee Name": worker.name, Site: worker.site || "Unassigned", "Attendance Status": worker.status, "Work Days": worker.attendanceDays ?? (worker.status === "Present" ? 1 : worker.status === "Half Day" ? 0.5 : 0), "OT Units": Number(worker.ot || 0), "Daily Rate": Number(worker.rate || 0), Payment: Number(worker.payment ?? (Number(worker.rate || 0) * ((worker.status === "Present" ? 1 : worker.status === "Half Day" ? 0.5 : 0) + Number(worker.ot || 0) * 0.5))) })));
    const workbook = XLSX.utils.book_new();
    [["Employees", employeeRows], ["Attendance", attendanceRows], ["Payments", paymentRows]].forEach(([name, rows]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name));
    XLSX.writeFile(workbook, `ConstructPulse_Monthly_Reports_${month}.xlsx`);
  }

  async function reviewRemovalRequest(request, status) {
    setBusy(true); setError(""); setNotice("");
    try {
      await decideEmployeeRemoval(request, status);
      setNotice(status === "approved" ? `${request.employeeName} is now inactive.` : `Deletion request for ${request.employeeName} rejected.`);
      await refresh(); await loadTeamLeaders();
    } catch (e) { setError(e?.message || "Could not review deletion request."); }
    finally { setBusy(false); }
  }

  function exportTeam(team) {

    const selected = filteredRecords.filter(r => r.employeeId === team.id);

    exportMuster(selected, `ConstructPulse_Team_${team.id}_${week}.xlsx`);

  }

  function exportSite(site) {

    const selected = filteredRecords.map(record => ({

      ...record,

      workers: (record.workers || []).filter(worker => worker.site === site.name),

    })).filter(record => record.workers.length);

    downloadCSV(`ConstructPulse_Site\_${site.name.replace(/[^a-z0-9]/gi, "_")}\_${week}.csv`, workerHeaders, workerExportRows(selected));

  }

  function toggleTeam(id) {

    setExpandedTeams(current => ({ ...current, [id]: !current[id] }));

  }

  return (

    <div className="min-h-screen bg-[#f5f7fc] text-slate-900">

      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-[#101a30] px-4 py-3 text-white shadow-lg sm:px-6">

        <div className="flex items-center gap-3">

          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 font-black">CP</div>

          <div className="text-base font-extrabold leading-tight">ConstructPulse<small className="block text-[10px] font-semibold tracking-wide text-slate-300">FIELD PORTAL · ADMIN</small></div>

        </div>

        <div className="flex items-center gap-2 text-xs">

          <span className="rounded-full bg-orange-500 px-3 py-1.5 font-bold">ADMIN PORTAL</span>

          <span className="hidden rounded-full bg-emerald-900/70 px-3 py-1.5 text-emerald-200 sm:inline">Live Firestore Data</span>

          <button onClick={() => signOut()} className="rounded-lg border border-white/20 px-3 py-2 font-semibold hover:bg-white/10">Sign out</button>

        </div>

      </header>

      <main className="mx-auto flex max-w-[1500px] flex-col gap-4 px-3 py-4 sm:px-5 lg:px-6">

        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-950">
          Spark plan workflow: team-leader submissions and their payout figures are unverified estimates. Approval recalculates pay from the current stored worker rates; check attendance, site, overtime, and roster changes before approval.
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">

          <div><b className="mr-2">ADMIN CONTROL</b> Review attendance, monitor team payments, and manage one-time correction requests.</div>

          <span className="rounded-md bg-amber-100 px-2 py-1 font-bold">Weekly payroll workspace</span>

        </div>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

          <div className="flex items-center gap-2">

            <button aria-label="Previous week" onClick={() => setSelectedDate(shiftDate(week, -7))} className="rounded-lg border px-3 py-2 hover:bg-slate-50">‹</button>

            <div className="min-w-[230px]">

              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payroll week · Sunday to Saturday</div>

              <div className="text-sm font-bold">{dateText(week)} – {dateText(weekEnd)}</div>

              <input aria-label="Choose payroll week" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="mt-1 rounded-md border border-slate-200 px-2 py-1 text-xs" />

            </div>

            <button aria-label="Next week" onClick={() => setSelectedDate(shiftDate(week, 7))} className="rounded-lg border px-3 py-2 hover:bg-slate-50">›</button>

            <button onClick={() => setSelectedDate(localToday())} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">Current Week</button>

          </div>

          <div className="flex flex-wrap items-center gap-2">

            <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option>All Sites</option>{allSites.map(site => <option key={site}>{site}</option>)}</select>

            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option>All Teams</option>{allTeams.map(team => <option key={team}>{team}</option>)}</select>

            <button onClick={refresh} disabled={busy} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50">{busy ? "Refreshing…" : "↻ Refresh Data"}</button>

            <button onClick={exportAll} disabled={!records.length} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">↓ Export All Reports (.csv)</button>

            <button onClick={exportMonth} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">↓ Monthly exports (.xlsx)</button>

          </div>

        </section>

        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

          <div className="mb-3"><h2 className="font-extrabold">Add Labour & Team Leader</h2><p className="text-xs text-slate-500">Create a team leader, then assign labour to that leader’s roster.</p></div>

          {managementError && <div role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{managementError}</div>}

          {managementNotice && <div role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{managementNotice}</div>}

          <div className="grid gap-4 lg:grid-cols-2">

            <form onSubmit={handleAddWorker} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
              <h3 className="text-sm font-bold sm:col-span-2">Add labour under a team leader</h3>
              <input required pattern="[A-Za-z0-9_-]+" title="Letters, numbers, hyphens, and underscores" value={workerForm.id} onChange={e => setWorkerForm({ ...workerForm, id: e.target.value })} placeholder="Labour ID" className="rounded-md border px-3 py-2 text-sm" />
              <input required value={workerForm.name} onChange={e => setWorkerForm({ ...workerForm, name: e.target.value })} placeholder="Labour name" className="rounded-md border px-3 py-2 text-sm" />
              <input value={workerForm.role} onChange={e => setWorkerForm({ ...workerForm, role: e.target.value })} placeholder="Role" className="rounded-md border px-3 py-2 text-sm" />
              <input required type="number" min="0" step="0.01" value={workerForm.rate} onChange={e => setWorkerForm({ ...workerForm, rate: e.target.value })} placeholder="Daily rate (₹)" className="rounded-md border px-3 py-2 text-sm" />
              <input value={workerForm.site} onChange={e => setWorkerForm({ ...workerForm, site: e.target.value })} placeholder="Default site (optional)" className="rounded-md border px-3 py-2 text-sm" />
              <select required value={workerForm.teamLeaderEmployeeId} onChange={e => setWorkerForm({ ...workerForm, teamLeaderEmployeeId: e.target.value })} className="rounded-md border bg-white px-3 py-2 text-sm">
                <option value="">Select team leader</option>
                {teamLeaders.map(leader => <option key={leader.uid} value={leader.employeeId}>{leader.name} · {leader.employeeId}</option>)}
              </select>
              <button type="submit" disabled={managementBusy || !teamLeaders.length} className="rounded-md bg-orange-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{managementBusy ? "Saving…" : "Add Labour"}</button>
              {!teamLeaders.length && <p className="text-xs text-amber-700 sm:col-span-2">Add a team leader first to assign labour.</p>}
            </form>

            <form onSubmit={handleAddTeamLeader} className="grid content-start gap-2 rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-bold">Add team leader</h3>
              <input required value={leaderForm.name} onChange={e => setLeaderForm({ ...leaderForm, name: e.target.value })} placeholder="Team leader name" className="rounded-md border px-3 py-2 text-sm" />
              <input required pattern="[A-Za-z0-9._-]+" title="Letters, numbers, dots, underscores, and hyphens" value={leaderForm.employeeId} onChange={e => setLeaderForm({ ...leaderForm, employeeId: e.target.value })} placeholder="Employee ID (e.g. TL-1002)" className="rounded-md border px-3 py-2 text-sm" />
              <input required minLength={6} type="password" autoComplete="new-password" value={leaderForm.password} onChange={e => setLeaderForm({ ...leaderForm, password: e.target.value })} placeholder="Initial password (6+ characters)" className="rounded-md border px-3 py-2 text-sm" />
              <p className="text-[11px] leading-4 text-slate-500">The leader signs in with their employee ID. The password is not saved in Firestore.</p>
              <button type="submit" disabled={managementBusy} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{managementBusy ? "Saving…" : "Add Team Leader"}</button>
            </form>

          </div>

        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">

          {[

            ["WEEKLY PAYROLL TOTAL", money(totals.payment), "Includes unverified estimates until approval", "text-slate-950"],

            ["ACTIVE TEAMS", totals.teams, `${filteredRecords.length} team-date submissions`, "text-slate-950"],

            ["DEPLOYED WORKERS", totals.workers, "Worker entries this week", "text-slate-950"],

            ["TOTAL WORKER-DAYS", totals.days.toFixed(1), "Present + half days", "text-slate-950"],

            ["OVERTIME UNITS", `${totals.ot} OT`, "Each OT unit = 0.5 day", "text-slate-950"],

            ["PENDING REVIEWS", pendingSubmissions.length, `${pendingEditRequests.length} edit requests`, "text-orange-700"],

          ].map(([label, value, hint, color]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[10px] font-bold tracking-wide text-slate-500">{label}</div><div className={`mt-2 text-2xl font-black ${color}`}>{value}</div><div className="mt-1 text-[10px] text-slate-500">{hint}</div></article>)}

        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white p-4">

            <div><h2 className="font-extrabold">Team-wise Payment & Worker Muster Roll</h2><p className="text-xs text-slate-500">Pending amounts are unverified estimates. Approval recalculates pay from stored worker rates.</p></div>

            <div className="flex flex-wrap gap-2">

              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team, worker, ID or site…" className="w-64 rounded-lg border px-3 py-2 text-sm" />

              <button onClick={exportWeek} disabled={!filteredRecords.length} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">↓ Download Weekly Payment (.xlsx)</button>

            </div>

          </div>

          <div className="divide-y divide-slate-200">

            {teamGroups.map(team => <div key={team.id}>

              <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/70 px-4 py-3">

                <div className="flex items-center gap-3">

                  <button onClick={() => toggleTeam(team.id)} className="rounded-md border bg-white px-2 py-1 text-sm font-bold">{expandedTeams[team.id] ? "−" : "+"}</button>

                  <div><div className="text-sm font-extrabold">{team.id} <span className="font-medium text-slate-600">· {team.name}</span></div><div className="text-[11px] text-slate-500">Sites: {[...team.sites].join(", ") || "Not specified"}</div></div>

                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"><span>Members: <b>{team.workers.length}</b></span><span>Work-days: <b>{team.days.toFixed(1)}</b></span><span>Team OT: <b>{team.ot}</b></span><b className="text-orange-700">Payable: {money(team.total)}</b><button onClick={() => exportTeam(team)} className="rounded-md border border-orange-200 bg-white px-2 py-1 font-bold text-orange-700">Download Team</button></div>

              </div>

              {expandedTeams[team.id] && <div className="overflow-x-auto">

                <table className="w-full min-w-[980px] text-left text-xs">

                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{["Date", "Worker ID", "Worker Name", "Job Role", "Site", "Status", "Work Days", "OT Units", "Daily Rate", "Total Payable"].map(h => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>

                  <tbody>{team.workers.map((worker, index) => <tr key={`${worker.id}-${worker.attendanceDate}-${index}`} className="border-t"><td className="px-3 py-3">{dateText(worker.attendanceDate)}</td><td className="px-3 py-3">{worker.id || "—"}</td><td className="px-3 py-3 font-semibold">{worker.name || "—"}</td><td className="px-3 py-3">{worker.role || "—"}</td><td className="px-3 py-3">{worker.site || "Unassigned"}</td><td className="px-3 py-3">{worker.status || "—"}</td><td className="px-3 py-3">{Number(worker.attendanceDays ?? (worker.status === "Present" ? 1 : worker.status === "Half Day" ? 0.5 : 0)).toFixed(1)}</td><td className="px-3 py-3">{Number(worker.ot || 0)}</td><td className="px-3 py-3">{money(worker.rate)}</td><td className="px-3 py-3 font-bold">{money(worker.payment)}</td></tr>)}</tbody>

                </table>

              </div>}

            </div>)}

            {!teamGroups.length && <p className="p-8 text-center text-sm text-slate-500">No attendance submissions found for this week and filter.</p>}

          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 px-4 py-3 text-white"><b className="text-sm">Grand Total · {totals.teams} Teams · {totals.workers} Worker Entries · {totals.days.toFixed(1)} Worker-Days</b><strong className="text-xl">{money(totals.payment)}</strong></div>

        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold">Site-wise Workforce & Payment Distribution</h2><p className="text-xs text-slate-500">Payment allocation from each team's submitted worker site details.</p></div><button onClick={() => downloadCSV(`ConstructPulse_Site_Summary\_${week}.csv`, ["Site", "Teams", "Worker Entries", "Site Payment"], siteGroups.map(s => [s.name, s.teams.size, s.workers, s.payment]))} disabled={!siteGroups.length} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40">↓ Download Site Summary (.csv)</button></div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

            {siteGroups.map(site => <article key={site.name} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-bold">{site.name}</h3><span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800">{site.teams.size} Teams</span></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>Worker entries</span><b className="text-slate-900">{site.workers}</b></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Team allocation</span><b className="text-slate-900">{site.teams.size}</b></div><div className="mt-3 border-t pt-3"><div className="text-[10px] font-bold uppercase text-slate-500">Total Site Payment</div><div className="mt-1 text-xl font-black text-orange-700">{money(site.payment)}</div></div><button onClick={() => exportSite(site)} className="mt-3 text-xs font-bold text-orange-700 hover:underline">Download Site Report →</button></article>)}

            {!siteGroups.length && <p className="text-sm text-slate-500">No site payment data for this week.</p>}

          </div>

        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-extrabold">Attendance Submissions & Approval Queue</h2><p className="text-xs text-slate-500">Verify attendance, site, overtime, and rates before approving the submitted estimate.</p></div><div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">{["Pending", "Approved", "Rejected"].map(tab => <button key={tab} onClick={() => setQueueTab(tab)} className={`rounded-md px-3 py-2 text-xs font-bold ${queueTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{tab} ({tab === "Pending" ? pendingSubmissions.length : tab === "Approved" ? approvedSubmissions.length : rejectedSubmissions.length})</button>)}</div></div>

          <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Team Leader", "Date", "Headcount", "Present / Half / Absent", "OT Units", "Submitted Estimate", "Status", "Quick Actions"].map(h => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>

            {visibleQueue.map(record => {

              const workers = record.workers || [];

              const present = workers.filter(w => w.status === "Present").length;

              const half = workers.filter(w => w.status === "Half Day").length;

              const absent = workers.filter(w => w.status === "Absent").length;

              const status = record.reviewStatus || "Pending";

              return <tr key={record.id} className="border-t"><td className="px-3 py-3"><b>{record.employeeName || record.employeeId}</b><div className="text-[10px] text-slate-500">{record.employeeId}</div></td><td className="px-3 py-3">{dateText(record.date)}</td><td className="px-3 py-3">{workers.length}</td><td className="px-3 py-3"><span className="text-emerald-700">{present} P</span> / <span className="text-amber-700">{half} HD</span> / <span className="text-rose-700">{absent} A</span></td><td className="px-3 py-3">{Number(record.overtimeCount || 0)}</td><td className="px-3 py-3 font-bold">{money(record.totalPayment)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status === "Approved" ? "bg-emerald-100 text-emerald-800" : status === "Rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{status}</span></td><td className="px-3 py-3"><div className="flex gap-2">{status !== "Approved" && <button disabled={busy} onClick={() => reviewSubmission(record, "Approved")} className="rounded-md bg-emerald-600 px-2 py-1.5 font-bold text-white disabled:opacity-40">Verify & Approve</button>}{status !== "Rejected" && <button disabled={busy} onClick={() => reviewSubmission(record, "Rejected")} className="rounded-md border border-rose-200 px-2 py-1.5 font-bold text-rose-700 disabled:opacity-40">Reject</button>}</div></td></tr>;

            })}

            {!visibleQueue.length && <tr><td colSpan={8} className="p-8 text-center text-slate-500">No {queueTab.toLowerCase()} submissions for this week.</td></tr>}

          </tbody></table></div>

        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

          <div><h2 className="font-extrabold">Employee Deletion Requests</h2><p className="text-xs text-slate-500">Approved requests mark the employee inactive and remove them from future attendance rosters.</p></div>
          <div className="mt-4 space-y-3">
            {removalRequests.filter(request => request.status === "pending").map(request => <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3"><div><b>{request.employeeName} · {request.employeeId}</b><div className="text-xs text-slate-600">Requested by {request.teamLeaderName} · {request.teamLeaderId}</div></div><div className="flex gap-2"><button disabled={busy} onClick={() => reviewRemovalRequest(request, "approved")} className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Approve · Deactivate</button><button disabled={busy} onClick={() => reviewRemovalRequest(request, "rejected")} className="rounded-md border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700">Reject</button></div></article>)}
            {!removalRequests.some(request => request.status === "pending") && <p className="text-sm text-slate-500">No pending employee deletion requests.</p>}
          </div>
          <div className="mt-8"><h2 className="font-extrabold">Team Leader Correction / Edit Requests</h2><p className="text-xs text-slate-500">Approving grants one correction for that team and date. The team leader must submit again to lock the record.</p></div>

          <div className="mt-4 space-y-3">

            {pendingEditRequests.map(request => <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3"><div><div className="font-bold">{request.employeeId} · {dateText(request.date)}</div><div className="text-xs text-slate-600">{request.employeeName || "Team leader"} · {request.reason || "Correction requested"}</div><div className="mt-1 text-[10px] text-slate-500">Attendance record: {request.attendanceId}</div></div><div className="flex gap-2"><button disabled={busy} onClick={() => reviewEditRequest(request, "approved")} className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Approve one-time edit</button><button disabled={busy} onClick={() => reviewEditRequest(request, "rejected")} className="rounded-md border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-40">Reject</button></div></article>)}

            {!pendingEditRequests.length && <p className="text-sm text-slate-500">No pending correction requests.</p>}

          </div>

        </section>

      </main>

      <footer className="border-t bg-white px-5 py-5 text-center text-xs text-slate-500">ConstructPulse Field Portal · Admin payroll and attendance management</footer>

    </div>

  );

}

