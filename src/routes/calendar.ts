import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { readJson, writeJson } from "../data/db";
import { sendSuccess, sendError } from "../utils/envelope";
import { addNotification } from "../utils/notifications";
import type { CalendarEvent, Semester, User } from "../models/entities";

const router = Router();

// GET /api/calendar - List all calendar events (accessible by all authenticated users)
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const events = await readJson<CalendarEvent>("calendarEvents");
    const { category, semesterId } = req.query;

    let filtered = [...events];
    if (category && typeof category === "string" && category !== "all") {
      filtered = filtered.filter(
        (e) => e.category.toLowerCase() === category.toLowerCase()
      );
    }
    if (semesterId && typeof semesterId === "string" && semesterId !== "all") {
      filtered = filtered.filter((e) => e.semesterId === semesterId);
    }

    // Sort chronologically by startDate
    filtered.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return sendSuccess(res, filtered);
  } catch (err) {
    return next(err);
  }
});

// GET /api/calendar/semesters - List available semesters
router.get("/semesters", requireAuth, async (req, res, next) => {
  try {
    const semesters = await readJson<Semester>("semesters");
    return sendSuccess(res, semesters);
  } catch (err) {
    return next(err);
  }
});

// POST /api/calendar - Create new academic event (Admin and Lecturer only)
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role !== "admin" && user.role !== "lecturer") {
      return sendError(res, "Hanya Admin dan Dosen yang memiliki hak untuk menambah agenda kalender akademik.", 403);
    }

    const { title, description, startDate, endDate, category, semesterId } = req.body;

    if (!title || !startDate) {
      return sendError(res, "Judul agenda dan tanggal mulai wajib diisi.", 400);
    }

    const events = await readJson<CalendarEvent>("calendarEvents");

    const newEvent: CalendarEvent = {
      id: `cal-${Date.now()}`,
      title: title.trim(),
      description: (description || "").trim(),
      startDate,
      endDate: endDate || startDate,
      category: category || "Perkuliahan",
      semesterId: semesterId || "sem-1",
      authorName: user.name,
      createdAt: new Date().toISOString(),
    };

    events.push(newEvent);
    await writeJson("calendarEvents", events);

    // Broadcast notification to students and campus
    try {
      const formattedDate = newEvent.startDate === newEvent.endDate
        ? newEvent.startDate
        : `${newEvent.startDate} s/d ${newEvent.endDate}`;

      await addNotification({
        title: `Agenda Baru: ${newEvent.title}`,
        message: `Kegiatan akademik baru '${newEvent.title}' dijadwalkan pada ${formattedDate}. Kategori: ${newEvent.category}.`,
        type: "calendar",
        recipientRole: "all",
        actionUrl: "/calendar",
      });
    } catch {
      // Notification fail shouldn't block creation
    }

    return sendSuccess(res, newEvent, "Agenda akademik berhasil diterbitkan.", 201);
  } catch (err) {
    return next(err);
  }
});

// PUT /api/calendar/:id - Update academic event (Admin and Lecturer only)
router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role !== "admin" && user.role !== "lecturer") {
      return sendError(res, "Hanya Admin dan Dosen yang dapat memperbarui agenda kalender akademik.", 403);
    }

    const { id } = req.params;
    const { title, description, startDate, endDate, category, semesterId } = req.body;

    const events = await readJson<CalendarEvent>("calendarEvents");
    const index = events.findIndex((e) => e.id === id);

    if (index === -1) {
      return sendError(res, "Agenda kegiatan akademik tidak ditemukan.", 404);
    }

    events[index] = {
      ...events[index],
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(startDate !== undefined && { startDate }),
      ...(endDate !== undefined && { endDate }),
      ...(category !== undefined && { category }),
      ...(semesterId !== undefined && { semesterId }),
    };

    await writeJson("calendarEvents", events);
    return sendSuccess(res, events[index], "Agenda akademik berhasil diperbarui.");
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/calendar/:id - Delete academic event (Admin and Lecturer only)
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role !== "admin" && user.role !== "lecturer") {
      return sendError(res, "Hanya Admin dan Dosen yang dapat menghapus agenda kalender akademik.", 403);
    }

    const { id } = req.params;
    const events = await readJson<CalendarEvent>("calendarEvents");
    const index = events.findIndex((e) => e.id === id);

    if (index === -1) {
      return sendError(res, "Agenda kegiatan tidak ditemukan.", 404);
    }

    const deleted = events.splice(index, 1)[0];
    await writeJson("calendarEvents", events);

    return sendSuccess(res, deleted, "Agenda kalender akademik berhasil dihapus.");
  } catch (err) {
    return next(err);
  }
});

export default router;
