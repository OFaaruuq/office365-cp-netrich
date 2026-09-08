"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { portalFetch, useSuperAdminHeaders } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type Customer = { id: string; name: string; status?: string };
type CatalogProduct = { id: string; name: string; priceMonthly: number; catalog: string; active?: boolean };
type QuoteItem = { productId: string; name: string; qty: number; unitPrice: number };
type Quote = {
  id: string;
  customerId: string;
  status: string;
  currency: string;
  items: QuoteItem[];
  notes?: string;
  validUntil?: string;
  createdBy?: string;
  updatedAt: string;
};

export default function Page() {
  const headers = useSuperAdminHeaders();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [items, setItems] = useState<QuoteItem[]>([]);

  const customerName = useMemo(
    () => customers.find((c) => c.id === customerId)?.name || customerId,
    [customers, customerId]
  );

  const load = useCallback(async () => {
    const [q, c, p] = await Promise.all([
      portalFetch("/api/csp/quotes").then((r) => r.json()),
      portalFetch("/api/csp/customers").then((r) => r.json()),
      portalFetch("/api/admin/catalog").then((r) => r.json()),
    ]);
    setQuotes(q.quotes || []);
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
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        name: p.name,
        qty: Math.max(1, qty),
        unitPrice: Number(unitPrice) || 0,
      },
    ]);
  }

  function removeLine(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function createQuote(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await portalFetch("/api/csp/quotes", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId,
          currency,
          notes: notes || undefined,
          validUntil: validUntil || undefined,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create quote");
        return;
      }
      setOk(`Quote ${data.quote.id} created for ${customerName}`);
      setItems([]);
      setNotes("");
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
      const res = await portalFetch(`/api/csp/quotes/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      if (status === "ordered" && data.order) {
        setOk(`Quote converted to order ${data.order.id}`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function invoiceFromQuote(q: Quote) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await portalFetch("/api/csp/invoices", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId: q.customerId,
          quoteId: q.id,
          currency: q.currency,
          notes: `Generated from quote ${q.id}`,
          status: "draft",
          items: q.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            qty: i.qty,
            unitPrice: i.unitPrice,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate invoice");
        return;
      }
      setOk(`Invoice ${data.invoice.id} drafted — open Billing → Invoices`);
    } finally {
      setBusy(false);
    }
  }

  const draftTotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Quotes"
        subtitle="Generate customer quotations, send for approval, convert to order, or create an invoice."
        actions={
          <button type="button" className="nt-btn-on-brand text-xs" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "Generate quote"}
          </button>
        }
      />

      {ok && (
        <div className="mb-4 rounded-lg border border-nt-success/30 bg-nt-success/10 px-4 py-3 text-sm text-nt-success">
          {ok}{" "}
          {ok.includes("Invoice") && (
            <Link href="/admin/billing/invoices" className="underline">
              View invoices
            </Link>
          )}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-nt-danger/30 bg-nt-danger/10 px-4 py-3 text-sm text-nt-danger">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={createQuote} className="nt-card mb-6 space-y-4 p-5">
          <div className="text-sm font-semibold">New quotation</div>
          <div className="grid gap-3 sm:grid-cols-2">
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
              Currency
              <select
                className="nt-input mt-1"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-nt-text-muted">
              Valid until
              <input
                type="date"
                className="nt-input mt-1"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-nt-text-muted sm:col-span-2">
              Notes
              <input
                className="nt-input mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional commercial notes"
              />
            </label>
          </div>

          <div className="rounded-lg border border-nt-border bg-nt-surface-muted/40 p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-nt-text-subtle">
              Line items
            </div>
            {customers.length === 0 && (
              <p className="mb-2 text-xs text-nt-danger">
                No customers available. Create/approve a tenant first.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-4">
              <select
                className="nt-input sm:col-span-2"
                value={productId}
                onChange={(e) => onPickProduct(e.target.value)}
              >
                {products.length === 0 && <option value="">No catalog products</option>}
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
                placeholder="Qty"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                className="nt-input"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value))}
                placeholder="Unit price"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="nt-btn-outline text-xs" onClick={addLine} disabled={!productId && products.length === 0}>
                Add catalog line
              </button>
              <button
                type="button"
                className="nt-btn-outline text-xs"
                onClick={() => {
                  const name = window.prompt("Custom line item name");
                  if (!name?.trim()) return;
                  setItems((prev) => [
                    ...prev,
                    {
                      productId: `custom-${Date.now().toString(36)}`,
                      name: name.trim(),
                      qty: Math.max(1, qty),
                      unitPrice: Number(unitPrice) || 0,
                    },
                  ]);
                }}
              >
                Add custom line
              </button>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {items.map((i, idx) => (
                <li key={`${i.productId}-${idx}`} className="flex items-center justify-between gap-2">
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
              <div className="mt-2 text-sm font-semibold">
                Quote total: ${draftTotal.toFixed(2)} {currency}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="nt-btn-outline" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="nt-btn-primary" disabled={busy || items.length === 0}>
              {busy ? "Saving…" : "Generate quote"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {quotes.map((q) => {
          const total = q.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
          const name = customers.find((c) => c.id === q.customerId)?.name || q.customerId;
          return (
            <div key={q.id} className="nt-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{q.id}</div>
                  <div className="text-xs text-nt-text-muted">
                    {name} · {q.status} · {q.currency} {total.toFixed(2)}
                    {q.createdBy ? ` · by ${q.createdBy}` : ""}
                  </div>
                  {q.validUntil && (
                    <div className="text-xs text-nt-text-subtle">Valid until {q.validUntil}</div>
                  )}
                  {q.notes && <div className="mt-1 text-xs text-nt-text-muted">{q.notes}</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {q.status === "draft" && (
                    <button
                      type="button"
                      className="nt-btn-outline text-xs"
                      disabled={busy}
                      onClick={() => void setStatus(q.id, "sent")}
                    >
                      Send
                    </button>
                  )}
                  {q.status === "sent" && (
                    <button
                      type="button"
                      className="nt-btn-primary text-xs"
                      disabled={busy}
                      onClick={() => void setStatus(q.id, "approved")}
                    >
                      Mark approved
                    </button>
                  )}
                  {(q.status === "approved" || q.status === "sent") && (
                    <button
                      type="button"
                      className="nt-btn-outline text-xs"
                      disabled={busy}
                      onClick={() => void invoiceFromQuote(q)}
                    >
                      Generate invoice
                    </button>
                  )}
                  {q.status === "approved" && (
                    <button
                      type="button"
                      className="nt-btn-primary text-xs"
                      disabled={busy}
                      onClick={() => void setStatus(q.id, "ordered")}
                    >
                      Convert to order
                    </button>
                  )}
                </div>
              </div>
              <ul className="mt-2 text-sm text-nt-text-muted">
                {q.items.map((i, idx) => (
                  <li key={idx}>
                    {i.qty} × {i.name} @ ${i.unitPrice.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {quotes.length === 0 && (
          <div className="nt-card p-6 text-sm text-nt-text-muted">
            No quotes yet. Click <strong>Generate quote</strong> to create one.
          </div>
        )}
      </div>
    </div>
  );
}
