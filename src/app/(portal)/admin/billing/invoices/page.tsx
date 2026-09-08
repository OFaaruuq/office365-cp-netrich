"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type Customer = { id: string; name: string; status?: string };
type CatalogProduct = { id: string; name: string; priceMonthly: number; active?: boolean };
type Line = { productId?: string; name: string; qty: number; unitPrice: number };
type Invoice = {
  id: string;
  customerId: string;
  customerName: string;
  quoteId?: string;
  orderId?: string;
  period: string;
  currency: string;
  items: Line[];
  microsoftCost: number;
  netrichMarkup: number;
  taxRate: number;
  tax: number;
  subtotal: number;
  total: number;
  status: string;
  notes?: string;
  dueAt?: string;
  paidAt?: string;
  createdBy: string;
  createdAt: string;
};

export default function Page() {
  const headers = useSuperAdminHeaders();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState(5);
  const [microsoftCost, setMicrosoftCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [items, setItems] = useState<Line[]>([]);

  const subtotal = useMemo(
    () => Number(items.reduce((s, i) => s + i.qty * i.unitPrice, 0).toFixed(2)),
    [items]
  );
  const tax = useMemo(() => Number(((subtotal * taxRate) / 100).toFixed(2)), [subtotal, taxRate]);
  const markup = useMemo(
    () => Number(Math.max(0, subtotal - microsoftCost).toFixed(2)),
    [subtotal, microsoftCost]
  );
  const total = useMemo(() => Number((subtotal + tax).toFixed(2)), [subtotal, tax]);

  const load = useCallback(async () => {
    const [inv, c, p] = await Promise.all([
      portalFetch("/api/csp/invoices").then((r) => r.json()),
      portalFetch("/api/csp/customers").then((r) => r.json()),
      portalFetch("/api/admin/catalog").then((r) => r.json()),
    ]);
    setRows(inv.invoices || []);
    const list = (c.customers || []).filter((x: Customer) => x.status !== "rejected");
    setCustomers(list);
    setCustomerId((prev) => prev || list[0]?.id || "");
    const prods = ((p.products || []) as CatalogProduct[]).filter((x) => x.active !== false);
    setProducts(prods);
    setProductId((prev) => {
      if (prev) return prev;
      const first = prods[0];
      if (first) setUnitPrice(first.priceMonthly);
      return first?.id || "";
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onPickProduct(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) setUnitPrice(p.priceMonthly);
  }

  function addLine() {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const next = {
      productId: p.id,
      name: p.name,
      qty: Math.max(1, qty),
      unitPrice: Number(unitPrice) || 0,
    };
    setItems((prev) => [...prev, next]);
    const lineTotal = next.qty * next.unitPrice;
    setMicrosoftCost((prev) => Number((prev + lineTotal * 0.82).toFixed(2)));
  }

  function removeLine(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await portalFetch("/api/csp/invoices", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId,
          period,
          currency,
          taxRate,
          microsoftCost,
          netrichMarkup: markup,
          tax,
          notes: notes || undefined,
          dueAt,
          status: "draft",
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create invoice");
        return;
      }
      setOk(`Invoice ${data.invoice.id} generated ($${data.invoice.total.toFixed(2)})`);
      setItems([]);
      setNotes("");
      setMicrosoftCost(0);
      setShowForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await portalFetch(`/api/csp/invoices/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setOk(`Invoice ${id} → ${status}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Invoices"
        subtitle="Generate customer invoices (Microsoft cost + Netrich markup + tax). You can also create invoices from approved quotes."
        actions={
          <div className="flex gap-2">
            <Link href="/admin/commerce/quotes" className="nt-btn-outline text-xs !text-white !border-white/40">
              Quotes
            </Link>
            <button type="button" className="nt-btn-on-brand text-xs" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Close form" : "Generate invoice"}
            </button>
          </div>
        }
      />

      {ok && (
        <div className="mb-4 rounded-lg border border-nt-success/30 bg-nt-success/10 px-4 py-3 text-sm text-nt-success">
          {ok}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-nt-danger/30 bg-nt-danger/10 px-4 py-3 text-sm text-nt-danger">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={createInvoice} className="nt-card mb-6 space-y-4 p-5">
          <div className="text-sm font-semibold">New invoice</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs font-medium text-nt-text-muted">
              Customer
              <select
                className="nt-input mt-1"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-nt-text-muted">
              Billing period
              <input
                type="month"
                className="nt-input mt-1"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs font-medium text-nt-text-muted">
              Due date
              <input
                type="date"
                className="nt-input mt-1"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-nt-text-muted">
              Currency
              <select className="nt-input mt-1" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-nt-text-muted">
              Tax rate (%)
              <input
                type="number"
                min={0}
                step="0.1"
                className="nt-input mt-1"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
              />
            </label>
            <label className="block text-xs font-medium text-nt-text-muted">
              Microsoft cost
              <input
                type="number"
                min={0}
                step="0.01"
                className="nt-input mt-1"
                value={microsoftCost}
                onChange={(e) => setMicrosoftCost(Number(e.target.value))}
              />
            </label>
            <label className="block text-xs font-medium text-nt-text-muted sm:col-span-2 lg:col-span-3">
              Notes
              <input
                className="nt-input mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional invoice notes"
              />
            </label>
          </div>

          <div className="rounded-lg border border-nt-border bg-nt-surface-muted/40 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-nt-text-subtle">
              Line items
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <select
                className="nt-input sm:col-span-2"
                value={productId}
                onChange={(e) => onPickProduct(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (${p.priceMonthly.toFixed(2)})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                className="nt-input"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                className="nt-input"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value))}
              />
            </div>
            <button type="button" className="nt-btn-outline mt-2 text-xs" onClick={addLine}>
              Add line
            </button>
            <ul className="mt-3 space-y-1 text-sm">
              {items.map((i, idx) => (
                <li key={`${i.name}-${idx}`} className="flex items-center justify-between gap-2">
                  <span>
                    {i.qty} × {i.name} @ ${i.unitPrice.toFixed(2)}
                  </span>
                  <button type="button" className="text-xs text-nt-danger" onClick={() => removeLine(idx)}>
                    Remove
                  </button>
                </li>
              ))}
              {items.length === 0 && (
                <li className="text-xs text-nt-text-muted">Add at least one product line.</li>
              )}
            </ul>
            {items.length > 0 && (
              <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                <div>Subtotal: ${subtotal.toFixed(2)}</div>
                <div>MS cost: ${microsoftCost.toFixed(2)}</div>
                <div>Netrich markup: ${markup.toFixed(2)}</div>
                <div>
                  Tax ({taxRate}%): ${tax.toFixed(2)}
                </div>
                <div className="font-semibold sm:col-span-2">
                  Invoice total: ${total.toFixed(2)} {currency}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="nt-btn-outline" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="nt-btn-primary" disabled={busy || items.length === 0}>
              {busy ? "Saving…" : "Generate invoice"}
            </button>
          </div>
        </form>
      )}

      <div className="nt-card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-nt-border bg-nt-surface-muted text-[11px] uppercase text-nt-text-subtle">
              <th className="px-4 py-2">Invoice</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Period</th>
              <th className="px-4 py-2">MS cost</th>
              <th className="px-4 py-2">Markup</th>
              <th className="px-4 py-2">Tax</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-nt-border/50 align-top">
                <td className="px-4 py-2">
                  <div className="font-medium">{r.id}</div>
                  {r.quoteId && <div className="text-[11px] text-nt-text-subtle">Quote {r.quoteId}</div>}
                  <div className="text-[11px] text-nt-text-subtle">Due {r.dueAt || "—"}</div>
                </td>
                <td className="px-4 py-2 font-medium">{r.customerName}</td>
                <td className="px-4 py-2">{r.period}</td>
                <td className="px-4 py-2">${r.microsoftCost.toFixed(2)}</td>
                <td className="px-4 py-2">${r.netrichMarkup.toFixed(2)}</td>
                <td className="px-4 py-2">${r.tax.toFixed(2)}</td>
                <td className="px-4 py-2 font-semibold">${r.total.toFixed(2)}</td>
                <td className="px-4 py-2 capitalize">{r.status}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-col gap-1">
                    {r.status === "draft" && (
                      <button
                        type="button"
                        className="nt-btn-outline py-1 text-[11px]"
                        disabled={busy}
                        onClick={() => void setStatus(r.id, "sent")}
                      >
                        Send
                      </button>
                    )}
                    {(r.status === "sent" || r.status === "draft") && (
                      <button
                        type="button"
                        className="nt-btn-outline py-1 text-[11px]"
                        disabled={busy}
                        onClick={() => void setStatus(r.id, "open")}
                      >
                        Mark open
                      </button>
                    )}
                    {(r.status === "open" || r.status === "sent") && (
                      <button
                        type="button"
                        className="nt-btn-primary py-1 text-[11px]"
                        disabled={busy}
                        onClick={() => void setStatus(r.id, "paid")}
                      >
                        Mark paid
                      </button>
                    )}
                    {r.status !== "void" && r.status !== "paid" && (
                      <button
                        type="button"
                        className="text-[11px] text-nt-danger"
                        disabled={busy}
                        onClick={() => void setStatus(r.id, "void")}
                      >
                        Void
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-nt-text-muted">
                  No invoices yet. Click <strong>Generate invoice</strong> or create one from a quote.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
