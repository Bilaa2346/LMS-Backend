"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../data/db");
const envelope_1 = require("../utils/envelope");
const notifications_1 = require("../utils/notifications");
const router = (0, express_1.Router)();
// GET /api/calendar - List all calendar events (accessible by all authenticated users)
router.get("/", auth_1.requireAuth, async (req, res, next) => {
    try {
        const events = await (0, db_1.readJson)("calendarEvents");
        const { category, semesterId } = req.query;
        let filtered = [...events];
        if (category && typeof category === "string" && category !== "all") {
            filtered = filtered.filter((e) => e.category.toLowerCase() === category.toLowerCase());
        }
        if (semesterId && typeof semesterId === "string" && semesterId !== "all") {
            filtered = filtered.filter((e) => e.semesterId === semesterId);
        }
        // Sort chronologically by startDate
        filtered.sort((a, b) => a.startDate.localeCompare(b.startDate));
        return (0, envelope_1.sendSuccess)(res, filtered);
    }
    catch (err) {
        return next(err);
    }
});
// GET /api/calendar/semesters - List available semesters
router.get("/semesters", auth_1.requireAuth, async (req, res, next) => {
    try {
        const semesters = await (0, db_1.readJson)("semesters");
        return (0, envelope_1.sendSuccess)(res, semesters);
    }
    catch (err) {
        return next(err);
    }
});
// POST /api/calendar - Create new academic event (Admin and Lecturer only)
router.post("/", auth_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        if (user.role !== "admin" && user.role !== "lecturer") {
            return (0, envelope_1.sendError)(res, "Hanya Admin dan Dosen yang memiliki hak untuk menambah agenda kalender akademik.", 403);
        }
        const { title, description, startDate, endDate, category, semesterId } = req.body;
        if (!title || !startDate) {
            return (0, envelope_1.sendError)(res, "Judul agenda dan tanggal mulai wajib diisi.", 400);
        }
        const events = await (0, db_1.readJson)("calendarEvents");
        const newEvent = {
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
        await (0, db_1.writeJson)("calendarEvents", events);
        // Broadcast notification to students and campus
        try {
            const formattedDate = newEvent.startDate === newEvent.endDate
                ? newEvent.startDate
                : `${newEvent.startDate} s/d ${newEvent.endDate}`;
            await (0, notifications_1.addNotification)({
                title: `Agenda Baru: ${newEvent.title}`,
                message: `Kegiatan akademik baru '${newEvent.title}' dijadwalkan pada ${formattedDate}. Kategori: ${newEvent.category}.`,
                type: "calendar",
                recipientRole: "all",
                actionUrl: "/calendar",
            });
        }
        catch {
            // Notification fail shouldn't block creation
        }
        return (0, envelope_1.sendSuccess)(res, newEvent, "Agenda akademik berhasil diterbitkan.", 201);
    }
    catch (err) {
        return next(err);
    }
});
// PUT /api/calendar/:id - Update academic event (Admin and Lecturer only)
router.put("/:id", auth_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        if (user.role !== "admin" && user.role !== "lecturer") {
            return (0, envelope_1.sendError)(res, "Hanya Admin dan Dosen yang dapat memperbarui agenda kalender akademik.", 403);
        }
        const { id } = req.params;
        const { title, description, startDate, endDate, category, semesterId } = req.body;
        const events = await (0, db_1.readJson)("calendarEvents");
        const index = events.findIndex((e) => e.id === id);
        if (index === -1) {
            return (0, envelope_1.sendError)(res, "Agenda kegiatan akademik tidak ditemukan.", 404);
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
        await (0, db_1.writeJson)("calendarEvents", events);
        return (0, envelope_1.sendSuccess)(res, events[index], "Agenda akademik berhasil diperbarui.");
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /api/calendar/:id - Delete academic event (Admin and Lecturer only)
router.delete("/:id", auth_1.requireAuth, async (req, res, next) => {
    try {
        const user = req.user;
        if (user.role !== "admin" && user.role !== "lecturer") {
            return (0, envelope_1.sendError)(res, "Hanya Admin dan Dosen yang dapat menghapus agenda kalender akademik.", 403);
        }
        const { id } = req.params;
        const events = await (0, db_1.readJson)("calendarEvents");
        const index = events.findIndex((e) => e.id === id);
        if (index === -1) {
            return (0, envelope_1.sendError)(res, "Agenda kegiatan tidak ditemukan.", 404);
        }
        const deleted = events.splice(index, 1)[0];
        await (0, db_1.writeJson)("calendarEvents", events);
        return (0, envelope_1.sendSuccess)(res, deleted, "Agenda kalender akademik berhasil dihapus.");
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
