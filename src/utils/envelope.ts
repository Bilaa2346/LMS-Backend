import type { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  status = 200
) {
  const body: { success: true; data: T; message?: string } = {
    success: true,
    data,
  };
  if (message) body.message = message;
  return res.status(status).json(body);
}

export function sendError(
  res: Response,
  message: string,
  status = 400,
  errors?: Record<string, unknown>
) {
  const body: { success: false; message: string; errors?: Record<string, unknown> } = {
    success: false,
    message,
  };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}
