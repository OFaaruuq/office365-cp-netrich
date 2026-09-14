import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { withTenantContext } from "../../../libs/prisma";
import { CurrentTenant, RequirePermissions, type TenantContext } from "../../../libs/guards";
import { resolveScopedCustomer } from "../../../libs/tenant-scope";

@Controller()
export class CommerceController {
  @RequirePermissions("subscription.read")
  @Get("subscriptions")
  async subscriptions(
    @CurrentTenant() tenant: TenantContext,
    @Query("customerId") customerId?: string
  ) {
    return withTenantContext(tenant, async (tx) => {
      const customer = await resolveScopedCustomer(tx, tenant, customerId);
      const subscriptions = await tx.cspSubscription.findMany({
        where: { customerId: customer.id },
        orderBy: { name: "asc" },
      });
      return { subscriptions, source: "postgres" };
    });
  }

  @RequirePermissions("subscription.purchase")
  @Post("subscriptions")
  async createSubscription(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      customerId?: string;
      id?: string;
      skuId?: string;
      name?: string;
      purchased?: number;
      used?: number;
      billingCycle?: string;
      unitPrice?: number;
      nextRenewalAt?: string;
      status?: string;
      partnerCenterId?: string;
    }
  ) {
    const name = String(body.name || "").trim();
    if (!name) throw new BadRequestException({ code: "INVALID_INPUT", message: "name is required" });
    return withTenantContext(tenant, async (tx) => {
      const customer = await resolveScopedCustomer(tx, tenant, body.customerId);
      const row = await tx.cspSubscription.create({
        data: {
          id: body.id || undefined,
          customerId: customer.id,
          skuId: body.skuId,
          name,
          purchased: Number(body.purchased || 0),
          used: Number(body.used || 0),
          billingCycle: body.billingCycle || "Monthly",
          unitPrice: Number(body.unitPrice || 0),
          nextRenewalAt: body.nextRenewalAt ? new Date(body.nextRenewalAt) : null,
          status: body.status || "active",
          partnerCenterId: body.partnerCenterId,
        },
      });
      return { subscription: row, source: "postgres" };
    });
  }

  @RequirePermissions("subscription.read")
  @Get("orders")
  async orders(@CurrentTenant() tenant: TenantContext, @Query("customerId") customerId?: string) {
    return withTenantContext(tenant, async (tx) => {
      const customer = await resolveScopedCustomer(tx, tenant, customerId);
      const orders = await tx.cspOrder.findMany({
        where: { customerId: customer.id },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return { orders, source: "postgres" };
    });
  }

  @RequirePermissions("subscription.purchase")
  @Post("orders")
  async createOrder(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      customerId?: string;
      id?: string;
      status?: string;
      totalAmount?: number;
      currency?: string;
      payload?: object;
      items?: Array<{ skuId?: string; name?: string; quantity?: number; unitPrice?: number; action?: string }>;
    }
  ) {
    return withTenantContext(tenant, async (tx) => {
      const customer = await resolveScopedCustomer(tx, tenant, body.customerId);
      const items = Array.isArray(body.items) ? body.items : [];
      const row = await tx.cspOrder.create({
        data: {
          id: body.id || undefined,
          customerId: customer.id,
          status: body.status || "REQUESTED",
          totalAmount: Number(body.totalAmount || 0),
          currency: body.currency || "USD",
          createdBy: tenant.userId || "portal",
          payload: (body.payload || {}) as object,
          items: {
            create: items.map((item) => ({
              skuId: item.skuId,
              name: String(item.name || "Line"),
              quantity: Number(item.quantity || 1),
              unitPrice: Number(item.unitPrice || 0),
              action: item.action || "add",
            })),
          },
        },
        include: { items: true },
      });
      return { order: row, source: "postgres" };
    });
  }

  @RequirePermissions("invoice.read")
  @Get("invoices")
  async invoices(@CurrentTenant() tenant: TenantContext, @Query("customerId") customerId?: string) {
    return withTenantContext(tenant, async (tx) => {
      const customer = await resolveScopedCustomer(tx, tenant, customerId);
      const invoices = await tx.cspInvoice.findMany({
        where: { customerId: customer.id },
        orderBy: { issuedAt: "desc" },
      });
      return { invoices, source: "postgres" };
    });
  }

  @RequirePermissions("invoice.read")
  @Post("invoices")
  async createInvoice(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      customerId?: string;
      id?: string;
      partnerCenterId?: string;
      amount?: number;
      currency?: string;
      status?: string;
      periodStart?: string;
      periodEnd?: string;
    }
  ) {
    return withTenantContext(tenant, async (tx) => {
      const customer = await resolveScopedCustomer(tx, tenant, body.customerId);
      const row = await tx.cspInvoice.create({
        data: {
          id: body.id || undefined,
          customerId: customer.id,
          partnerCenterId: body.partnerCenterId,
          amount: Number(body.amount || 0),
          currency: body.currency || "USD",
          status: body.status || "open",
          periodStart: body.periodStart ? new Date(body.periodStart) : null,
          periodEnd: body.periodEnd ? new Date(body.periodEnd) : null,
        },
      });
      return { invoice: row, source: "postgres" };
    });
  }
}
