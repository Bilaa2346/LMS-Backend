import type { Request, Response } from "express";
import { sendError } from "../utils/envelope";

export default function notFound(_req: Request, res: Response) {
  return sendError(res, "Endpoint tidak ditemukan", 404);
}
