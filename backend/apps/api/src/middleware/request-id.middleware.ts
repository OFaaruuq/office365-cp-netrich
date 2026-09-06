import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers["x-request-id"] as string) || randomUUID();
    (req as Request & { requestId: string }).requestId = id;
    res.setHeader("x-request-id", id);
    next();
  }
}
