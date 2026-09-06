import { redirect } from "next/navigation";

export default async function LegacyCustomerDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/tenants/${id}`);
}
