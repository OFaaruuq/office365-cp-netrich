import Link from "next/link";
import { Database, Mail, HardDrive } from "lucide-react";

const items = [
  {
    title: "Exchange Online",
    description: "Business email, calendars, and contacts hosted in Microsoft 365.",
    icon: Mail,
  },
  {
    title: "OneDrive for Business",
    description: "Personal cloud storage with enterprise security and sharing controls.",
    icon: HardDrive,
  },
  {
    title: "SharePoint & Lists",
    description: "Structured data and document management for teams.",
    icon: Database,
  },
];

export default function EmailDataPage() {
  return (
    <div className="nt-fade-in">
      <h1 className="nt-page-title">Email And Data</h1>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-nt-text-muted">
        Protect and manage organizational email and data with Microsoft 365 workloads
        provisioned by netrichtechnologies.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.title} className="nt-card group p-6 transition hover:-translate-y-0.5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-nt-purple-light to-nt-purple text-white shadow-sm transition group-hover:shadow-[var(--shadow-glow)]">
                <Icon size={20} />
              </div>
              <h2 className="font-semibold tracking-tight">{t.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-nt-text-muted">{t.description}</p>
              <Link href="/catalog/microsoft-365" className="nt-link mt-4 inline-block">
                View catalog
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
