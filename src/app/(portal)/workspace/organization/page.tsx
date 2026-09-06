"use client";

import { useEffect, useState } from "react";
import { InspectTenantGate } from "@/hooks/useInspectCustomer";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type Contact = { id: string; type: string; name: string; email: string; phone?: string };

export default function Page() {
  return (
    <InspectTenantGate title="Select a customer for Organization">
      {(customerId) => <Body customerId={customerId} />}
    </InspectTenantGate>
  );
}

function Body({ customerId }: { customerId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [domains, setDomains] = useState<Array<{ name: string; verified: boolean; primary: boolean }>>(
    []
  );
  const [profile, setProfile] = useState<{ name?: string; domain?: string; status?: string } | null>(
    null
  );

  useEffect(() => {
    void portalFetch(`/api/csp/customers/${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.customer || null);
        setContacts(d.contacts || []);
        setDomains(d.domains || []);
      });
  }, [customerId]);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Organization"
        subtitle="Customer profile, Microsoft domains, and operational contacts."
      />
      {profile && (
        <div className="nt-card mb-4 p-4">
          <div className="text-lg font-semibold">{profile.name}</div>
          <div className="text-sm text-nt-text-muted">
            {profile.domain} · {profile.status}
          </div>
        </div>
      )}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="nt-card p-4">
          <div className="mb-2 text-sm font-semibold">Contacts</div>
          <ul className="space-y-2 text-sm">
            {contacts.map((c) => (
              <li key={c.id} className="flex justify-between gap-2 border-b border-nt-border/40 py-2">
                <span>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-nt-text-muted"> · {c.type}</span>
                  <div className="text-xs text-nt-text-muted">{c.email}</div>
                </span>
              </li>
            ))}
            {contacts.length === 0 && <li className="text-nt-text-muted">No contacts.</li>}
          </ul>
        </div>
        <div className="nt-card p-4">
          <div className="mb-2 text-sm font-semibold">Microsoft tenants / domains</div>
          <ul className="space-y-2 text-sm">
            {domains.map((d) => (
              <li key={d.name}>
                {d.name}{" "}
                {d.primary && (
                  <span className="text-[10px] font-semibold text-nt-purple">PRIMARY</span>
                )}{" "}
                {d.verified ? "✓" : "unverified"}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
