
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginAdmin } from "../services/auth";

export default function AdminLogin() {
  const [email, E] = useState("");
  const [password, P] = useState("");
  const [err, Er] = useState("");
  const [busy, B] = useState(false);

  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    B(true);
    Er("");

    try {
      await loginAdmin(email, password);
      nav("/admin");
    } catch (x) {
      Er(x.message || "Sign in failed");
    } finally {
      B(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl sm:p-9">
        <div className="mb-4 text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">SECURE ADMINISTRATION</div>

        <h2 className="mb-2 text-2xl font-bold tracking-tight text-slate-950">Administrator sign in</h2>

        <p className="mb-6 text-sm leading-6 text-slate-500">
          Use your authorized admin email and password.
        </p>

        <form onSubmit={submit}>
          <label className="block text-sm font-semibold text-slate-800">Email address</label>

          <input
            className="mb-4 mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            type="email"
            value={email}
            onChange={(e) => E(e.target.value)}
            required
          />

          <label className="block text-sm font-semibold text-slate-800">Password</label>

          <input
            className="mb-4 mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            type="password"
            value={password}
            onChange={(e) => P(e.target.value)}
            required
          />

          {err && <div className="my-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}

          <button className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy}>
            {busy ? "Verifying…" : "Sign in securely"}
          </button>
        </form>

        <Link
          to="/"
          className="mt-5 block text-center text-xs text-slate-500 hover:text-blue-700"
          
        >
          ← Back to team leader login
        </Link>
      </div>
    </div>
  );
}
