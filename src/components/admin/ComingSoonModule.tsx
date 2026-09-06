"use client";

import Link from "next/link";
import { AdminHero } from "@/components/admin/AdminHero";

export function ComingSoonModule({
  title,
  subtitle,
  stage = "Microsoft Connected / Full CSP",
  href = "/admin",
}: {
  title: string;
  subtitle: string;
  stage?: string;
  href?: string;
}) {
  return (
    <div className="nt-fade-in">
      <AdminHero title={title} subtitle={subtitle} />
      <div className="nt-card p-6">
        <div className="text-sm font-semibold text-nt-text">Not enabled in Foundation yet</div>
        <p className="mt-2 text-sm text-nt-text-muted">
          This module is part of the CSP production roadmap ({stage}). Secure Application Model, Graph,
          and Partner Center read-only sync land before transactional commerce.
        </p>
        <Link href={href} className="nt-link mt-4 inline-block text-sm">
          Back to Overview
        </Link>
      </div>
    </div>
  );
}
