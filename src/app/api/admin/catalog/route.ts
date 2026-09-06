import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/auth/guards";
import {
  deleteCatalogProduct,
  listCatalogProducts,
  setCatalogProductActive,
  upsertCatalogProduct,
  type CatalogId,
} from "@/lib/catalog-store";
import { writeAudit } from "@/lib/audit-log";

/** Super Admin — manage global catalog products & pricing */
export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const catalog = new URL(request.url).searchParams.get("catalog") as CatalogId | null;
  const products = listCatalogProducts({
    catalog: catalog || undefined,
  });

  return NextResponse.json({
    products,
    summary: {
      total: products.length,
      active: products.filter((p) => p.active).length,
      byCatalog: {
        "microsoft-365": products.filter((p) => p.catalog === "microsoft-365").length,
        "dynamics-365": products.filter((p) => p.catalog === "dynamics-365").length,
        azure: products.filter((p) => p.catalog === "azure").length,
        "server-software": products.filter((p) => p.catalog === "server-software").length,
      },
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  if (!body.name || !body.catalog || !body.description || !body.category) {
    return NextResponse.json(
      { error: "name, catalog, description, and category are required" },
      { status: 400 }
    );
  }

  const product = upsertCatalogProduct(
    {
      id: body.id,
      name: body.name,
      description: body.description,
      category: body.category,
      catalog: body.catalog,
      priceMonthly: Number(body.priceMonthly ?? 0),
      priceYearly:
        body.priceYearly === "" || body.priceYearly == null
          ? null
          : Number(body.priceYearly),
      attachMonthly: body.attachMonthly != null ? Number(body.attachMonthly) : null,
      attachYearly: body.attachYearly != null ? Number(body.attachYearly) : null,
      compatibleAddons: Boolean(body.compatibleAddons),
      filters: Array.isArray(body.filters) ? body.filters : undefined,
      active: body.active !== false,
    },
    auth.session.email
  );

  writeAudit({
    action: "tenant.configure",
    actorAccountId: auth.session.accountId,
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    detail: `Catalog upsert ${product.id} · ${product.name}`,
    meta: {
      productId: product.id,
      catalog: product.catalog,
      priceMonthly: product.priceMonthly,
    },
  });

  return NextResponse.json({ product, message: "Product saved. Client tenants can purchase it." });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (body.action === "deactivate" || body.action === "activate") {
    const product = setCatalogProductActive(
      body.id,
      body.action === "activate",
      auth.session.email
    );
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ product });
  }

  const product = upsertCatalogProduct(
    {
      id: body.id,
      name: body.name,
      description: body.description,
      category: body.category,
      catalog: body.catalog,
      priceMonthly: body.priceMonthly,
      priceYearly: body.priceYearly,
      attachMonthly: body.attachMonthly,
      attachYearly: body.attachYearly,
      compatibleAddons: body.compatibleAddons,
      filters: body.filters,
      active: body.active,
    },
    auth.session.email
  );

  return NextResponse.json({ product });
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("error" in auth) return auth.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = deleteCatalogProduct(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  writeAudit({
    action: "tenant.configure",
    actorAccountId: auth.session.accountId,
    actorEmail: auth.session.email,
    actorRole: auth.session.role,
    detail: `Catalog product deleted ${id}`,
    meta: { productId: id },
  });

  return NextResponse.json({ ok: true });
}
