
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginLeader } from "../services/auth";
import { configured } from "../services/firebase";

export default function TeamLeaderLogin() {
  const [id, Sid] = useState("");
  const [password, setPassword] = useState("");
  const [err, Serr] = useState("");
  const [busy, Sbusy] = useState(false);

  const nav = useNavigate();

  useEffect(() => {
    if (sessionStorage.getItem("constructpulse-session-expired") === "true") {
      sessionStorage.removeItem("constructpulse-session-expired");
      Serr("You were signed out because this account was used to sign in on another device.");
    }
  }, []);

  async function submit(e) {
    e.preventDefault();
    Sbusy(true);
    Serr("");

    try {
      await loginLeader(id, password);
      nav("/attendance");
    } catch (x) {
      Serr(x.message || "Sign in failed");
    } finally {
      Sbusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <section className="hidden bg-slate-950 px-10 py-14 text-white lg:flex lg:items-center lg:px-16">
        <div>
          <div className="mb-4 text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">
            CONSTRUCT
          </div>

          <h1 className="my-6 text-5xl font-black leading-tight tracking-tight text-white">
            Every site.
            <br />
            <em className="not-italic text-orange-400">In sync.</em>
          </h1>

          <p className="max-w-lg text-lg leading-8 text-slate-300">
            One simple place for your team’s attendance, site activity,
            and daily workforce updates.
          </p>

          <p className="mt-10 text-sm leading-7 text-slate-400">
            01 &nbsp; Team attendance
            <br />
            <br />
            02 &nbsp; Site-wise records
            <br />
            <br />
            03 &nbsp; Admin oversight
          </p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:min-h-screen">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl sm:p-9">
          <div className="mb-4 text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">
            TEAM LEADER ACCESS
          </div>

          <h2 className="mb-2 text-3xl font-bold tracking-tight text-slate-950">Welcome back</h2>

          <p className="mb-6 text-sm leading-6 text-slate-500">
            Sign in with your employee ID and password.
          </p>

          {!configured && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Setup required: configure your Firebase values in .env or .env.local.
              See README.md.
            </div>
          )}

          <form onSubmit={submit}>
            <label className="block text-sm font-semibold text-slate-800">Employee ID</label>

            <input
              className="mb-4 mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={id}
              onChange={(e) => Sid(e.target.value)}
              placeholder="e.g. TL-1001"
              required
            />

            <label className="block text-sm font-semibold text-slate-800">Password</label>

            <input
              className="mb-4 mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />

            {err && <div className="my-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}

            <button className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to portal →"}
            </button>
          </form>

          <div className="my-6 border-t border-slate-200" />

          <button
            className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-800 transition hover:bg-slate-50"
            onClick={() => nav("/admin-login")}
          >
            Administrator login →
          </button>

          <p className="mt-5 block text-center text-xs leading-5 text-slate-500">
            Access is restricted to approved team leaders.
          </p>
        </div>
      </section>
    </div>
  );
}
