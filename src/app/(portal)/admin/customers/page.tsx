import { redirect } from "next/navigation";

/** Legacy path — Super Admin Tenants lives at /admin/tenants */
export default function LegacyCustomersRedirect() {
  redirect("/admin/tenants");
}
