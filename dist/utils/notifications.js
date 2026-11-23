"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addNotification = addNotification;
const db_1 = require("../data/db");
const ids_1 = require("./ids");
async function addNotification(params) {
    const notifications = await (0, db_1.readJson)("notifications");
    const newNotif = {
        id: (0, ids_1.createId)("notif"),
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
    await (0, db_1.writeJson)("notifications", notifications);
    return newNotif;
}
