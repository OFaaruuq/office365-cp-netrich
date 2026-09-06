import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "fs";
import path from "path";
import {
  azureCatalog,
  dynamics365Catalog,
  microsoft365Catalog,
  serverSoftwareCatalog,
} from "@/lib/mock-data";
import type { CatalogProduct } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "catalog-products.json");

export type CatalogId = CatalogProduct["catalog"];

export type ManagedCatalogProduct = CatalogProduct & {
  /** Visible to client tenants when true */
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
};

function seed(): ManagedCatalogProduct[] {
  const now = new Date().toISOString();
  const all = [
    ...microsoft365Catalog,
    ...dynamics365Catalog,
    ...azureCatalog,
    ...serverSoftwareCatalog,
  ];
  return all.map((p) => ({
    ...p,
    // Partner-managed catalog — purchase state lives on the tenant, not the SKU
    status: "available" as const,
    qty: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: "system-seed",
  }));
}

function atomicWrite(filePath: string, contents: string) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, filePath);
}

export function loadCatalogProducts(): ManagedCatalogProduct[] {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(FILE)) {
      const s = seed();
      atomicWrite(FILE, JSON.stringify(s, null, 2));
      return s;
    }
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as ManagedCatalogProduct[];
    if (!Array.isArray(parsed)) return seed();
    return parsed;
  } catch {
    if (existsSync(FILE)) return [];
    return seed();
  }
}

export function saveCatalogProducts(products: ManagedCatalogProduct[]) {
  atomicWrite(FILE, JSON.stringify(products, null, 2));
}

export function listCatalogProducts(filter?: {
  catalog?: CatalogId;
  activeOnly?: boolean;
}): ManagedCatalogProduct[] {
  let list = loadCatalogProducts();
  if (filter?.catalog) list = list.filter((p) => p.catalog === filter.catalog);
  if (filter?.activeOnly) list = list.filter((p) => p.active !== false);
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function getCatalogProduct(id: string): ManagedCatalogProduct | undefined {
  return loadCatalogProducts().find((p) => p.id === id);
}

export function upsertCatalogProduct(
  input: Partial<ManagedCatalogProduct> &
    Pick<ManagedCatalogProduct, "name" | "catalog" | "description" | "category">,
  actorEmail: string
): ManagedCatalogProduct {
  const products = loadCatalogProducts();
  const now = new Date().toISOString();
  const existingIdx = input.id ? products.findIndex((p) => p.id === input.id) : -1;

  if (existingIdx >= 0) {
    const next: ManagedCatalogProduct = {
      ...products[existingIdx],
      ...input,
      id: products[existingIdx].id,
      updatedAt: now,
      updatedBy: actorEmail,
    };
    products[existingIdx] = next;
    saveCatalogProducts(products);
    return next;
  }

  const created: ManagedCatalogProduct = {
    id: input.id || `sku-${Date.now().toString(36)}`,
    name: input.name,
    description: input.description,
    category: input.category,
    catalog: input.catalog,
    status: "available",
    qty: 0,
    priceMonthly: Number(input.priceMonthly ?? 0),
    priceYearly: input.priceYearly ?? null,
    attachMonthly: input.attachMonthly ?? null,
    attachYearly: input.attachYearly ?? null,
    compatibleAddons: Boolean(input.compatibleAddons),
    filters: input.filters?.length
      ? input.filters
      : [input.category, `All ${input.catalog} Products`],
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
    createdBy: actorEmail,
    updatedBy: actorEmail,
  };
  products.unshift(created);
  saveCatalogProducts(products);
  return created;
}

export function deleteCatalogProduct(id: string): boolean {
  const products = loadCatalogProducts();
  const next = products.filter((p) => p.id !== id);
  if (next.length === products.length) return false;
  saveCatalogProducts(next);
  return true;
}

export function setCatalogProductActive(id: string, active: boolean, actorEmail: string) {
  const products = loadCatalogProducts();
  const idx = products.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  products[idx] = {
    ...products[idx],
    active,
    updatedAt: new Date().toISOString(),
    updatedBy: actorEmail,
  };
  saveCatalogProducts(products);
  return products[idx];
}
