import { Controller, Get } from "@nestjs/common";
import { getSamConfigStatus, acquirePartnerToken } from "../../../libs/sam";
import { acquirePartnerCenterToken, listPartnerCenterCustomers } from "../../../libs/partner-center";
import { RequirePartnerAdmin, RequirePermissions } from "../../../libs/guards";

@RequirePartnerAdmin()
@Controller("microsoft")
export class MicrosoftController {
  @RequirePermissions("platform.admin")
  @Get("integration")
  integration() {
    return getSamConfigStatus();
  }

  @RequirePermissions("platform.admin")
  @Get("token")
  async token() {
    return acquirePartnerToken();
  }

  @RequirePermissions("tenant.read")
  @Get("partner-center/customers")
  async partnerCenterCustomers() {
    const token = await acquirePartnerCenterToken();
    if (!token.ok) {
      return {
        customers: [],
        source: "not_configured",
        code: token.code,
        message: token.message,
      };
    }
    const customers = await listPartnerCenterCustomers(token.accessToken);
    return { customers, source: "partner_center" };
  }
}
