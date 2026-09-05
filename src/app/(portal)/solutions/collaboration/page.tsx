import Link from "next/link";
import { MessageSquare, Users, Video } from "lucide-react";

const tools = [
  {
    title: "Microsoft Teams",
    description: "Chat, meetings, calling, and collaboration for your workforce.",
    icon: MessageSquare,
  },
  {
    title: "SharePoint Online",
    description: "Intranet, document libraries, and team sites.",
    icon: Users,
  },
  {
    title: "Microsoft Stream / Meetings",
    description: "Video meetings and recorded content across your organization.",
    icon: Video,
  },
];

export default function CollaborationPage() {
  return (
    <div className="nt-fade-in">
      <h1 className="nt-page-title">Collaboration Tools</h1>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-nt-text-muted">
        Solution path for modern workplace collaboration — Teams, SharePoint, and related
        Microsoft 365 services sold and managed through netrichtechnologies.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {tools.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.title} className="nt-card group p-6 transition hover:-translate-y-0.5">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-nt-purple-light to-nt-purple text-white shadow-sm transition group-hover:shadow-[var(--shadow-glow)]">
                <Icon size={20} />
              </div>
              <h2 className="font-semibold tracking-tight">{t.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-nt-text-muted">{t.description}</p>
              <Link href="/catalog/microsoft-365" className="nt-link mt-4 inline-block">
                Browse products
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
