import { Controller, Get } from "@nestjs/common";
import { getSamConfigStatus, acquirePartnerTokenStub } from "../../../libs/sam";
import { RequirePartnerAdmin } from "../../../libs/guards";

@RequirePartnerAdmin()
@Controller("microsoft")
export class MicrosoftController {
  @Get("integration")
  integration() {
    return getSamConfigStatus();
  }

  @Get("token")
  async token() {
    return acquirePartnerTokenStub();
  }
}
