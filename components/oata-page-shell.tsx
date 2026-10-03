import Link from "next/link";
import type { ReactNode } from "react";

type ActionLink = {
  label: string;
  href: string;
  variant?: "primary" | "gold" | "ghost";
};

type NavItem = {
  label: string;
  href: string;
  icon: string;
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

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "⌂" },
  { label: "Client", href: "/client", icon: "◫" },
  { label: "Request", href: "/client/request", icon: "+" },
  { label: "Approvals", href: "/client/approvals", icon: "✓" },
  { label: "Dispatch", href: "/oata/dispatch", icon: "↗" },
  { label: "Review", href: "/oata/review", icon: "◎" },
  { label: "Technician", href: "/technician", icon: "▣" },
  { label: "Assets", href: "/equipment", icon: "◇" },
  { label: "Reports", href: "/reports", icon: "◷" },
];

function actionClass(variant: ActionLink["variant"] = "ghost") {
  if (variant === "primary") return "bg-[#0872c9] text-white shadow-lg shadow-blue-900/15 hover:bg-[#065fa8]";
  if (variant === "gold") return "bg-[#D6A641] text-[#123747] shadow-lg shadow-amber-900/10 hover:bg-[#e3bb62]";
  return "border border-slate-200 bg-white text-[#123747] hover:border-[#0872c9]/40 hover:bg-blue-50";
}

function fmtUser(userLabel?: string | null) {
  if (!userLabel) return { name: "OATA User", role: "Secure access" };
  const [name, ...rest] = userLabel.split(" · ");
  return { name: name || "OATA User", role: rest.join(" · ") || "Secure access" };
}

function isActiveNav(item: NavItem, eyebrow: string, title: string) {
  const text = `${eyebrow} ${title}`.toLowerCase();
  if (item.href === "/" && text.includes("care portal")) return true;
  if (item.href.includes("request") && text.includes("request")) return true;
  if (item.href.includes("approvals") && text.includes("approval")) return true;
  if (item.href.includes("dispatch") && text.includes("dispatch")) return true;
  if (item.href.includes("review") && text.includes("review")) return true;
  if (item.href.includes("equipment") && (text.includes("asset") || text.includes("equipment"))) return true;
  if (item.href.includes("reports") && (text.includes("report") || text.includes("record"))) return true;
  if (item.href.includes("client") && text.includes("client")) return true;
  return false;
}

function OataSidebar({ eyebrow, title, userLabel }: { eyebrow: string; title: string; userLabel?: string | null }) {
  const user = fmtUser(userLabel);

  return (
    <aside className="hidden min-h-screen w-[280px] shrink-0 flex-col bg-[#052f4f] text-white lg:flex">
      <div className="px-7 py-7">
        <div className="flex items-center gap-3">
          <img src="/oata-logo.png" alt="OATA" className="h-12 w-auto rounded-xl bg-white/95 p-1" />
          <div>
            <p className="text-lg font-semibold leading-none">OATA | أواتا</p>
            <p className="mt-1 text-[11px] text-cyan-100/70">Maintenance and Cleaning</p>
          </div>
        </div>
      </div>

      <nav className="space-y-1 px-4">
        {navItems.map((item) => {
          const active = isActiveNav(item, eyebrow, title);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                active ? "bg-[#0872c9] text-white shadow-lg shadow-blue-950/25" : "text-cyan-50/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-sm">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-7 py-7">
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.07] p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0872c9] text-sm font-bold text-white">
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="mt-1 truncate text-xs capitalize text-cyan-100/65">{user.role.replace(/_/g, " ")}</p>
          </div>
        </div>
        <p className="mt-6 text-xs text-cyan-100/55">OATA Services</p>
        <p className="mt-1 text-xs text-cyan-100/45">Reliable care. Lasting quality.</p>
      </div>
    </aside>
  );
}

function MobileHeader({ title, eyebrow, actions }: { title: string; eyebrow: string; actions: ActionLink[] }) {
  const primaryAction = actions[0] ?? { label: "Dashboard", href: "/" };
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/oata-logo.png" alt="OATA" className="h-11 w-auto" />
          <div>
            <p className="text-sm font-bold text-[#052f4f]">OATA | أواتا</p>
            <p className="text-[11px] text-slate-500">{eyebrow}</p>
          </div>
        </div>
        <Link href={primaryAction.href} className="rounded-full bg-[#0872c9] px-4 py-2 text-xs font-bold text-white shadow-sm">
          {primaryAction.label.replace("← ", "")}
        </Link>
      </div>
      <p className="mt-3 text-sm font-semibold text-[#123747]">{title}</p>
    </header>
  );
}

function TopBar({ title, userLabel, actions }: { title: string; userLabel?: string | null; actions: ActionLink[] }) {
  const user = fmtUser(userLabel);
  return (
    <header className="hidden items-center justify-between gap-5 lg:flex">
      <div>
        <p className="text-sm font-semibold text-[#0872c9]">Reliable care. Lasting quality.</p>
        <h1 className="mt-1 text-3xl font-bold tracking-[-0.05em] text-[#123747]">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden w-[330px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400 xl:flex">
          <span>⌕</span>
          <span>Search jobs, assets, clients...</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#123747]">
          {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date())}
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#052f4f] text-sm font-bold text-white">
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-[#123747]">{user.name}</p>
            <p className="text-xs capitalize text-slate-400">{user.role.replace(/_/g, " ")}</p>
          </div>
        </div>
        {actions.slice(0, 2).map((action) => (
          <Link key={`${action.href}-${action.label}`} href={action.href} className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${actionClass(action.variant)}`}>
            {action.label}
          </Link>
        ))}
      </div>
    </header>
  );
}

export function OataPageShell({ eyebrow, title, description, userLabel, actions = [], children, maxWidth = "7xl" }: OataPageShellProps) {
  return (
    <main className="min-h-screen bg-[#eef5f8] text-slate-950 lg:flex">
      <OataSidebar eyebrow={eyebrow} title={title} userLabel={userLabel} />
      <section className="min-w-0 flex-1">
        <MobileHeader title={title} eyebrow={eyebrow} actions={actions} />
        <div className={`mx-auto ${maxWidthClass[maxWidth]} px-4 py-5 sm:px-6 lg:px-8 lg:py-7`}>
          <TopBar title={title} userLabel={userLabel} actions={actions} />

          <section className="mt-3 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:mt-7 lg:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#327482]">{eyebrow}</p>
                <h2 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-[#123747] sm:text-4xl">{title}</h2>
                {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
              </div>
              {actions.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {actions.map((action) => (
                    <Link key={`${action.href}-${action.label}`} href={action.href} className={`rounded-2xl px-5 py-3 text-sm font-bold transition ${actionClass(action.variant)}`}>
                      {action.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="mt-5 pb-20 lg:pb-0">{children}</section>
        </div>

        <nav className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-500 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] lg:hidden">
          {[
            { label: "Home", href: "/", icon: "⌂" },
            { label: "Client", href: "/client", icon: "◫" },
            { label: "Request", href: "/client/request", icon: "+" },
            { label: "Jobs", href: "/technician", icon: "▣" },
            { label: "Reports", href: "/reports", icon: "◷" },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2">
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}

export function OataLoading({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef5f8]">
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
        <img src="/oata-logo.png" alt="OATA" className="mx-auto h-14 w-auto" />
        <p className="mt-4 text-sm font-semibold text-[#123747]">{label}</p>
        <p className="mt-1 text-xs text-slate-400">Checking secure OATA portal access.</p>
      </div>
    </main>
  );
}

export function OataHero({ eyebrow, title, description, stats }: { eyebrow: string; title: string; description?: string; stats?: Array<[string, string, string]> }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#327482]">{eyebrow}</p>
          <h2 className="mt-3 max-w-3xl text-2xl font-bold tracking-[-0.05em] text-[#123747] sm:text-4xl">{title}</h2>
          {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
        </div>
        {stats && (
          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map(([label, value, detail]) => (
              <div key={label} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-3xl font-bold tracking-[-0.05em] text-[#123747]">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
