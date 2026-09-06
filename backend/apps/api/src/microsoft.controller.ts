import { Controller, Get } from "@nestjs/common";
import { getSamConfigStatus, acquirePartnerTokenStub } from "../../../libs/sam";

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
