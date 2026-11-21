import { Router } from "express";
import { readJson, writeJson } from "../data/db";
import type { AppNotification, Student, Lecturer } from "../models/entities";
import { requireAuth } from "../middleware/auth";
import { sendSuccess, sendError } from "../utils/envelope";

const router = Router();

// GET /api/notifications — get relevant notifications for current user
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const [allNotifs, students, lecturers] = await Promise.all([
      readJson<AppNotification>("notifications"),
      readJson<Student>("students"),
      readJson<Lecturer>("lecturers"),
    ]);

    let userStudyProgramId: string | null = null;
    if (user.role === "student" && user.refId) {
      const stu = students.find((s) => s.id === user.refId);
      userStudyProgramId = stu?.studyProgramId || null;
    } else if (user.role === "lecturer" && user.refId) {
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
      if (
        n.recipientStudyProgramId &&
        userStudyProgramId &&
        n.recipientStudyProgramId !== userStudyProgramId
      ) {
        return false;
      }

      return true;
    });

    const enriched = userNotifs.map((n) => ({
      ...n,
      isRead: n.readUserIds.includes(user.id),
    }));

    const unreadCount = enriched.filter((n) => !n.isRead).length;

    return sendSuccess(res, {
      notifications: enriched,
      unreadCount,
    });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/notifications/:id/read — mark single notification as read
router.put("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const notifs = await readJson<AppNotification>("notifications");
    const idx = notifs.findIndex((n) => n.id === req.params.id);

    if (idx !== -1) {
      if (!notifs[idx].readUserIds.includes(user.id)) {
        notifs[idx].readUserIds.push(user.id);
        await writeJson("notifications", notifs);
      }
    }

    return sendSuccess(res, null, "Notifikasi ditandai dibaca");
  } catch (err) {
    return next(err);
  }
});

// PUT /api/notifications/read-all — mark all notifications as read for current user
router.put("/read-all", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const notifs = await readJson<AppNotification>("notifications");

    notifs.forEach((n) => {
      if (!n.readUserIds.includes(user.id)) {
        n.readUserIds.push(user.id);
      }
    });

    await writeJson("notifications", notifs);
    return sendSuccess(res, null, "Semua notifikasi ditandai dibaca");
  } catch (err) {
    return next(err);
  }
});

export default router;
