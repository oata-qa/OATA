import Link from "next/link";
import type { ReactNode } from "react";

type ActionLink = {
  label: string;
  href: string;
  variant?: "primary" | "gold" | "ghost";
};

type OataPageShellProps = {
  eyebrow: string;
  title: string;
  description?: string;
  userLabel?: string | null;
  actions?: ActionLink[];
  children: ReactNode;
  maxWidth?: "5xl" | "6xl" | "7xl";
};

const maxWidthClass = {
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
};

function actionClass(variant: ActionLink["variant"] = "ghost") {
  if (variant === "primary") return "bg-[#123747] text-white hover:bg-[#1a4b5d]";
  if (variant === "gold") return "bg-[#D6A641] text-[#123747] hover:bg-[#e3bb62]";
  return "border border-[#327482]/25 bg-white text-[#327482] hover:bg-[#f0fbfc]";
}

export function OataPageShell({ eyebrow, title, description, userLabel, actions = [], children, maxWidth = "7xl" }: OataPageShellProps) {
  return (
    <main className="min-h-screen bg-[#eef5f8] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-8">
        <div className={`mx-auto flex ${maxWidthClass[maxWidth]} flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex items-center gap-4">
            <img src="/oata-logo.png" alt="OATA" className="h-14 w-auto sm:h-16" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#327482]">{eyebrow}</p>
              <h1 className="text-2xl font-bold tracking-[-0.05em] text-[#123747] sm:text-3xl">{title}</h1>
              {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {userLabel && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                {userLabel}
              </span>
            )}
            {actions.map((action) => (
              <Link key={`${action.href}-${action.label}`} href={action.href} className={`rounded-full px-4 py-2 text-sm font-bold transition ${actionClass(action.variant)}`}>
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <section className={`mx-auto ${maxWidthClass[maxWidth]} px-4 py-5 sm:px-6 lg:px-8`}>
        {children}
      </section>
    </main>
  );
}

export function OataLoading({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef5f8]">
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
        <p className="text-sm font-semibold text-[#123747]">{label}</p>
        <p className="mt-1 text-xs text-slate-400">Checking secure OATA portal access.</p>
      </div>
    </main>
  );
}

export function OataHero({ eyebrow, title, description, stats }: { eyebrow: string; title: string; description?: string; stats?: Array<[string, string, string]> }) {
  return (
    <div className="rounded-[2rem] bg-[#123747] p-6 text-white shadow-xl shadow-slate-900/10 lg:p-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#9deaf2]">{eyebrow}</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-bold tracking-[-0.06em] sm:text-5xl">{title}</h2>
          {description && <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72">{description}</p>}
        </div>
        {stats && (
          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map(([label, value, detail]) => (
              <div key={label} className="rounded-2xl border border-white/12 bg-white/[0.08] p-4">
                <p className="text-sm text-white/66">{label}</p>
                <p className="mt-1 text-3xl font-bold tracking-[-0.05em] text-white">{value}</p>
                <p className="mt-1 text-xs text-white/58">{detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
