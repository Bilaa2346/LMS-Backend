"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../data/db");
const auth_1 = require("../middleware/auth");
const envelope_1 = require("../utils/envelope");
const router = (0, express_1.Router)();
// GET /api/notifications — get relevant notifications for current user
router.get("/", auth_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const [allNotifs, students, lecturers] = await Promise.all([
            (0, db_1.readJson)("notifications"),
            (0, db_1.readJson)("students"),
            (0, db_1.readJson)("lecturers"),
        ]);
        let userStudyProgramId = null;
        if (user.role === "student" && user.refId) {
            const stu = students.find((s) => s.id === user.refId);
            userStudyProgramId = stu?.studyProgramId || null;
        }
        else if (user.role === "lecturer" && user.refId) {
            const lec = lecturers.find((l) => l.id === user.refId);
            userStudyProgramId = lec?.studyProgramId || null;
        }
        // Filter notifications relevant to this user
        const userNotifs = allNotifs.filter((n) => {
            // Direct recipient user ID
            if (n.recipientUserId && n.recipientUserId === user.id) {
                return true;
            }
            // Specific user targeted by role refId
            if (n.recipientUserId && n.recipientUserId === user.refId) {
                return true;
            }
            // Role filter
            if (n.recipientRole && n.recipientRole !== "all" && n.recipientRole !== user.role) {
                return false;
            }
            // Study program filter
            if (n.recipientStudyProgramId &&
                userStudyProgramId &&
                n.recipientStudyProgramId !== userStudyProgramId) {
                return false;
            }
            return true;
        });
        const enriched = userNotifs.map((n) => ({
            ...n,
            isRead: n.readUserIds.includes(user.id),
        }));
        const unreadCount = enriched.filter((n) => !n.isRead).length;
        return (0, envelope_1.sendSuccess)(res, {
            notifications: enriched,
            unreadCount,
        });
    }
    catch (err) {
        return next(err);
    }
});
// PUT /api/notifications/:id/read — mark single notification as read
router.put("/:id/read", auth_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const notifs = await (0, db_1.readJson)("notifications");
        const idx = notifs.findIndex((n) => n.id === req.params.id);
        if (idx !== -1) {
            if (!notifs[idx].readUserIds.includes(user.id)) {
                notifs[idx].readUserIds.push(user.id);
                await (0, db_1.writeJson)("notifications", notifs);
            }
        }
        return (0, envelope_1.sendSuccess)(res, null, "Notifikasi ditandai dibaca");
    }
    catch (err) {
        return next(err);
    }
});
// PUT /api/notifications/read-all — mark all notifications as read for current user
router.put("/read-all", auth_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        const notifs = await (0, db_1.readJson)("notifications");
        notifs.forEach((n) => {
            if (!n.readUserIds.includes(user.id)) {
                n.readUserIds.push(user.id);
            }
        });
        await (0, db_1.writeJson)("notifications", notifs);
        return (0, envelope_1.sendSuccess)(res, null, "Semua notifikasi ditandai dibaca");
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
