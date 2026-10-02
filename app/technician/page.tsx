import Link from "next/link";

const jobs = [
  {
    time: "09:00",
    title: "Hood Cleaning",
    client: "Pearl Hotel Doha",
    site: "Main Kitchen",
    asset: "Hood Line H-01",
    priority: "Medium",
    status: "Scheduled",
    next: "Start pre-cleaning inspection",
  },
  {
    time: "11:30",
    title: "Fryer Diagnosis",
    client: "Al Noor Restaurant",
    site: "West Bay Kitchen",
    asset: "Gas Fryer GF-02",
    priority: "High",
    status: "In Progress",
    next: "Add temperature reading and diagnosis photo",
  },
  {
    time: "14:00",
    title: "Cold Room Emergency",
    client: "Marina Catering",
    site: "Central Production Unit",
    asset: "Cold Room CR-1",
    priority: "Emergency",
    status: "Awaiting Approval",
    next: "Follow up condenser fan motor approval",
  },
];

const flow = [
  "Open job",
  "Call / navigate",
  "Start job",
  "Scan QR",
  "Before photos",
  "Checklist",
  "Readings",
  "Parts request",
  "After photos",
  "Client signature",
  "Submit report",
];

const gates = [
  { label: "QR scan", done: true },
  { label: "Before photo", done: true },
  { label: "Checklist", done: false },
  { label: "Readings", done: false },
  { label: "After photo", done: false },
  { label: "Signature", done: false },
];

function badgeClass(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("emergency")) return "bg-red-50 text-red-700 border-red-200";
  if (lower.includes("high") || lower.includes("approval")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (lower.includes("progress")) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

export default function TechnicianApp() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto min-h-screen max-w-md bg-[#f7fafc] text-slate-950 shadow-2xl">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-[#f7fafc]/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-700">OATA Technician</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">Today</h1>
            </div>
            <Link href="/" className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              Admin
            </Link>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5">
          <section className="rounded-[2rem] bg-slate-950 p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-cyan-100/80">Assigned jobs</p>
                <p className="mt-1 text-5xl font-semibold tracking-[-0.08em]">3</p>
              </div>
              <span className="rounded-full bg-red-500 px-3 py-1 text-sm font-semibold">1 Emergency</span>
            </div>
            <button className="mt-6 w-full rounded-2xl bg-cyan-600 px-4 py-4 text-center text-base font-semibold text-white shadow-lg shadow-cyan-900/30">
              Scan QR / Start Job
            </button>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-[-0.03em]">My Jobs</h2>
            <div className="mt-3 space-y-3">
              {jobs.map((job) => (
                <article key={`${job.time}-${job.asset}`} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{job.time} · {job.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{job.client}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(job.priority)}`}>{job.priority}</span>
                  </div>
                  <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                    <p><span className="font-semibold text-slate-800">Site:</span> {job.site}</p>
                    <p className="mt-1"><span className="font-semibold text-slate-800">Asset:</span> {job.asset}</p>
                    <p className="mt-1"><span className="font-semibold text-slate-800">Next:</span> {job.next}</p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button className="flex-1 rounded-2xl bg-cyan-700 px-4 py-3 text-sm font-semibold text-white">Open</button>
                    <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Call</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Evidence Gates</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {gates.map((gate) => (
                <div key={gate.label} className={`rounded-2xl border p-3 text-sm font-semibold ${gate.done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                  {gate.done ? "✓ " : "○ "}{gate.label}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Job Flow</h2>
            <div className="mt-4 space-y-2">
              {flow.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">{index + 1}</span>
                  {step}
                </div>
              ))}
            </div>
          </section>

          <p className="pb-8 text-center text-xs text-slate-400">OATA Care Technician App · Demo PWA</p>
        </div>
      </section>
    </main>
  );
}
