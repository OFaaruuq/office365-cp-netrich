"use client";

import { useEffect, useState } from "react";
import { portalFetch } from "@/lib/admin-api";
import { AdminHero } from "@/components/admin/AdminHero";

type PriceList = {
  id: string;
  name: string;
  currency: string;
  items: Array<{
    productId: string;
    listPrice: number;
    partnerCost: number;
    netrichPrice: number;
    customerDiscount: number;
  }>;
};

export default function Page() {
  const [lists, setLists] = useState<PriceList[]>([]);
  useEffect(() => {
    void portalFetch("/api/csp/price-lists")
      .then((r) => r.json())
      .then((d) => setLists(d.priceLists || []));
  }, []);
  return (
    <div className="nt-fade-in">
      <AdminHero
        title="Pricing engine"
        subtitle="List / partner cost / Netrich base / customer discount → margin (Foundation)."
      />
      {lists.map((list) => (
        <div key={list.id} className="nt-card mb-4 overflow-hidden">
          <div className="border-b border-nt-border px-4 py-3 text-sm font-semibold">
            {list.name} · {list.currency}
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-nt-text-subtle">
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">List</th>
                <th className="px-4 py-2">Cost</th>
                <th className="px-4 py-2">Netrich</th>
                <th className="px-4 py-2">Discount</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Margin</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((i) => {
                const customer = i.netrichPrice - i.customerDiscount;
                const margin = customer - i.partnerCost;
                return (
                  <tr key={i.productId} className="border-t border-nt-border/80">
                    <td className="px-4 py-2 font-medium">{i.productId}</td>
                    <td className="px-4 py-2">${i.listPrice.toFixed(2)}</td>
                    <td className="px-4 py-2">${i.partnerCost.toFixed(2)}</td>
                    <td className="px-4 py-2">${i.netrichPrice.toFixed(2)}</td>
                    <td className="px-4 py-2">-${i.customerDiscount.toFixed(2)}</td>
                    <td className="px-4 py-2 font-semibold">${customer.toFixed(2)}</td>
                    <td className="px-4 py-2 text-nt-success">${margin.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
