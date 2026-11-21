import { readJson, writeJson } from "../data/db";
import type { AppNotification, Role } from "../models/entities";
import { createId } from "./ids";

interface CreateNotificationParams {
  recipientUserId?: string | null;
  recipientRole?: Role | "all";
  recipientStudyProgramId?: string | null;
  title: string;
  message: string;
  type: "quiz" | "assignment" | "ukt" | "submission" | "grade" | "calendar" | "system";
  actionUrl?: string;
}

export async function addNotification(params: CreateNotificationParams): Promise<AppNotification> {
  const notifications = await readJson<AppNotification>("notifications");

  const newNotif: AppNotification = {
    id: createId("notif"),
    recipientUserId: params.recipientUserId || null,
    recipientRole: params.recipientRole || "all",
    recipientStudyProgramId: params.recipientStudyProgramId || null,
    title: params.title,
    message: params.message,
    type: params.type,
    actionUrl: params.actionUrl || "/",
    readUserIds: [],
    createdAt: new Date().toISOString(),
  };

  notifications.unshift(newNotif); // newest first

  // Keep last 100 notifications to prevent unbounded growth in JSON
  if (notifications.length > 100) {
    notifications.length = 100;
  }

  await writeJson("notifications", notifications);
  return newNotif;
}
