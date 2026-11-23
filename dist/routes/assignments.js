"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../data/db");
const auth_1 = require("../middleware/auth");
const envelope_1 = require("../utils/envelope");
const ids_1 = require("../utils/ids");
const notifications_1 = require("../utils/notifications");
const academicGrade_1 = require("../utils/academicGrade");
const router = (0, express_1.Router)();
// GET /api/assignments/courses — helper to get course list for assignment creation
router.get("/courses", auth_1.requireAuth, async (req, res, next) => {
    try {
        const [courses, studyPrograms, lecturers] = await Promise.all([
            (0, db_1.readJson)("courses"),
            (0, db_1.readJson)("studyPrograms"),
            (0, db_1.readJson)("lecturers"),
        ]);
        let availableCourses = courses;
        if (req.user?.role === "lecturer" && req.user.refId) {
            const lecturer = lecturers.find((l) => l.id === req.user.refId);
            if (lecturer) {
                availableCourses = courses.filter((c) => c.studyProgramId === lecturer.studyProgramId);
            }
        }
        const result = availableCourses.map((c) => {
            const sp = studyPrograms.find((s) => s.id === c.studyProgramId);
            return {
                id: c.id,
                code: c.code,
                name: c.name,
                sks: c.sks,
                studyProgramId: c.studyProgramId,
                studyProgramName: sp?.name || "Program Studi",
            };
        });
        return (0, envelope_1.sendSuccess)(res, result);
    }
    catch (err) {
        return next(err);
    }
});
// GET /api/assignments/mine — list assignments for current user
router.get("/mine", auth_1.requireAuth, async (req, res, next) => {
    try {
        const [assignments, submissions, courses, studyPrograms, students, enrollments, classes] = await Promise.all([
            (0, db_1.readJson)("assignments"),
            (0, db_1.readJson)("submissions"),
            (0, db_1.readJson)("courses"),
            (0, db_1.readJson)("studyPrograms"),
            (0, db_1.readJson)("students"),
            (0, db_1.readJson)("enrollments"),
            (0, db_1.readJson)("classes"),
        ]);
        const user = req.user;
        if (user.role === "lecturer") {
            // Dosen sees assignments they created
            const myAssignments = assignments
                .filter((a) => a.lecturerId === user.refId || !user.refId)
                .map((a) => {
                const subs = submissions.filter((s) => s.assignmentId === a.id);
                const course = courses.find((c) => c.id === a.courseId);
                const sp = studyPrograms.find((s) => s.id === a.studyProgramId);
                return {
                    ...a,
                    courseName: a.courseName || course?.name || "Mata Kuliah",
                    studyProgramName: a.studyProgramName || sp?.name || "Program Studi",
                    submissionCount: subs.length,
                };
            });
            return (0, envelope_1.sendSuccess)(res, myAssignments);
        }
        if (user.role === "student") {
            // Mahasiswa sees assignments for enrolled classes/courses or their study program
            const student = students.find((s) => s.id === user.refId);
            const myEnrollments = enrollments.filter((e) => e.studentId === user.refId && e.status === "Disetujui");
            const enrolledClassIds = new Set(myEnrollments.map((e) => e.classId));
            const enrolledCourseIds = new Set(classes.filter((c) => enrolledClassIds.has(c.id)).map((c) => c.courseId));
            const relevant = assignments
                .filter((a) => enrolledCourseIds.has(a.courseId) ||
                (student && a.studyProgramId === student.studyProgramId) ||
                enrolledCourseIds.size === 0)
                .map((a) => {
                const mySub = submissions.find((s) => s.assignmentId === a.id && s.studentId === user.refId);
                const course = courses.find((c) => c.id === a.courseId);
                const sp = studyPrograms.find((s) => s.id === a.studyProgramId);
                return {
                    ...a,
                    courseName: a.courseName || course?.name || "Mata Kuliah",
                    studyProgramName: a.studyProgramName || sp?.name || "Program Studi",
                    mySubmission: mySub || null,
                };
            });
            return (0, envelope_1.sendSuccess)(res, relevant);
        }
        // Admin sees all
        const all = assignments.map((a) => {
            const subs = submissions.filter((s) => s.assignmentId === a.id);
            return {
                ...a,
                submissionCount: subs.length,
            };
        });
        return (0, envelope_1.sendSuccess)(res, all);
    }
    catch (err) {
        return next(err);
    }
});
// POST /api/assignments — create assignment (Lecturer only, admin is read-only)
router.post("/", auth_1.requireAuth, (0, auth_1.requireRole)("lecturer"), async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            title: zod_1.z.string().min(3, "Judul tugas minimal 3 karakter"),
            courseId: zod_1.z.string().min(1, "Mata kuliah wajib dipilih"),
            description: zod_1.z.string().default(""),
            dueDate: zod_1.z.string().min(1, "Batas waktu pengumpulan wajib diisi"),
            maxScore: zod_1.z.number().min(1).default(100),
            attachmentLink: zod_1.z.string().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return (0, envelope_1.sendError)(res, parsed.error.errors[0]?.message || "Data tugas tidak valid", 400);
        }
        const [assignments, courses, studyPrograms, lecturers] = await Promise.all([
            (0, db_1.readJson)("assignments"),
            (0, db_1.readJson)("courses"),
            (0, db_1.readJson)("studyPrograms"),
            (0, db_1.readJson)("lecturers"),
        ]);
        const course = courses.find((c) => c.id === parsed.data.courseId);
        if (!course) {
            return (0, envelope_1.sendError)(res, "Mata kuliah tidak ditemukan", 404);
        }
        const sp = studyPrograms.find((s) => s.id === course.studyProgramId);
        const lecturer = lecturers.find((l) => l.id === req.user.refId);
        const now = new Date().toISOString();
        const newAssignment = {
            id: (0, ids_1.createId)("asg"),
            courseId: course.id,
            courseName: course.name,
            studyProgramId: course.studyProgramId,
            studyProgramName: sp?.name || "Program Studi",
            lecturerId: req.user.refId || "lec-admin",
            lecturerName: lecturer?.name || req.user.name,
            title: parsed.data.title,
            description: parsed.data.description,
            dueDate: parsed.data.dueDate,
            maxScore: parsed.data.maxScore,
            attachmentLink: parsed.data.attachmentLink || "",
            createdAt: now,
        };
        assignments.push(newAssignment);
        await (0, db_1.writeJson)("assignments", assignments);
        // Trigger notification for students in this study program!
        await (0, notifications_1.addNotification)({
            recipientRole: "student",
            recipientStudyProgramId: course.studyProgramId,
            title: `Tugas Baru: ${newAssignment.title}`,
            message: `${newAssignment.lecturerName} telah memberikan tugas baru pada mata kuliah ${course.name}. Batas pengumpulan: ${new Date(newAssignment.dueDate).toLocaleDateString("id-ID")}.`,
            type: "assignment",
            actionUrl: "/assignments",
        });
        return (0, envelope_1.sendSuccess)(res, newAssignment, "Tugas berhasil dibuat dan dibagikan ke mahasiswa");
    }
    catch (err) {
        return next(err);
    }
});
// GET /api/assignments/:id — get assignment detail
router.get("/:id", auth_1.requireAuth, async (req, res, next) => {
    try {
        const [assignments, submissions] = await Promise.all([
            (0, db_1.readJson)("assignments"),
            (0, db_1.readJson)("submissions"),
        ]);
        const assignment = assignments.find((a) => a.id === req.params.id);
        if (!assignment) {
            return (0, envelope_1.sendError)(res, "Tugas tidak ditemukan", 404);
        }
        const mySub = submissions.find((s) => s.assignmentId === assignment.id && s.studentId === req.user.refId);
        return (0, envelope_1.sendSuccess)(res, {
            ...assignment,
            mySubmission: mySub || null,
        });
    }
    catch (err) {
        return next(err);
    }
});
// PUT /api/assignments/:id — update assignment (Lecturer only)
router.put("/:id", auth_1.requireAuth, (0, auth_1.requireRole)("lecturer"), async (req, res, next) => {
    try {
        const assignments = await (0, db_1.readJson)("assignments");
        const idx = assignments.findIndex((a) => a.id === req.params.id);
        if (idx === -1) {
            return (0, envelope_1.sendError)(res, "Tugas tidak ditemukan", 404);
        }
        const existing = assignments[idx];
        const { title, description, dueDate, maxScore, attachmentLink } = req.body;
        if (title !== undefined)
            existing.title = title;
        if (description !== undefined)
            existing.description = description;
        if (dueDate !== undefined)
            existing.dueDate = dueDate;
        if (maxScore !== undefined)
            existing.maxScore = Number(maxScore);
        if (attachmentLink !== undefined)
            existing.attachmentLink = attachmentLink;
        assignments[idx] = existing;
        await (0, db_1.writeJson)("assignments", assignments);
        return (0, envelope_1.sendSuccess)(res, existing, "Tugas berhasil diperbarui");
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /api/assignments/:id — delete assignment (Lecturer only)
router.delete("/:id", auth_1.requireAuth, (0, auth_1.requireRole)("lecturer"), async (req, res, next) => {
    try {
        const assignments = await (0, db_1.readJson)("assignments");
        const filtered = assignments.filter((a) => a.id !== req.params.id);
        if (filtered.length === assignments.length) {
            return (0, envelope_1.sendError)(res, "Tugas tidak ditemukan", 404);
        }
        await (0, db_1.writeJson)("assignments", filtered);
        return (0, envelope_1.sendSuccess)(res, null, "Tugas berhasil dihapus");
    }
    catch (err) {
        return next(err);
    }
});
// POST /api/assignments/:id/submit — student submits assignment
router.post("/:id/submit", auth_1.requireAuth, (0, auth_1.requireRole)("student"), async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            content: zod_1.z.string().min(1, "Jawaban atau penjelasan tugas wajib diisi"),
            link: zod_1.z.string().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return (0, envelope_1.sendError)(res, parsed.error.errors[0]?.message || "Data pengumpulan tidak valid", 400);
        }
        const [assignments, submissions, students] = await Promise.all([
            (0, db_1.readJson)("assignments"),
            (0, db_1.readJson)("submissions"),
            (0, db_1.readJson)("students"),
        ]);
        const assignment = assignments.find((a) => a.id === req.params.id);
        if (!assignment) {
            return (0, envelope_1.sendError)(res, "Tugas tidak ditemukan", 404);
        }
        const student = students.find((s) => s.id === req.user.refId);
        const studentName = student?.name || req.user.name;
        const studentNim = student?.nim || "-";
        const now = new Date().toISOString();
        let subIdx = submissions.findIndex((s) => s.assignmentId === assignment.id && s.studentId === req.user.refId);
        let finalSub;
        if (subIdx >= 0) {
            submissions[subIdx].content = parsed.data.content;
            submissions[subIdx].link = parsed.data.link || submissions[subIdx].link;
            submissions[subIdx].submittedAt = now;
            finalSub = submissions[subIdx];
        }
        else {
            finalSub = {
                id: (0, ids_1.createId)("sub"),
                assignmentId: assignment.id,
                studentId: req.user.refId,
                studentName,
                studentNim,
                content: parsed.data.content,
                link: parsed.data.link || "",
                submittedAt: now,
                score: null,
                feedback: null,
                gradedAt: null,
                gradedBy: null,
            };
            submissions.push(finalSub);
        }
        await (0, db_1.writeJson)("submissions", submissions);
        // Notify the lecturer!
        await (0, notifications_1.addNotification)({
            recipientUserId: assignment.lecturerId,
            recipientRole: "lecturer",
            title: `Pengumpulan Tugas: ${assignment.title}`,
            message: `Mahasiswa ${studentName} (${studentNim}) telah mengumpulkan tugas pada mata kuliah ${assignment.courseName}.`,
            type: "submission",
            actionUrl: "/assignments",
        });
        return (0, envelope_1.sendSuccess)(res, finalSub, "Tugas berhasil dikumpulkan!");
    }
    catch (err) {
        return next(err);
    }
});
// GET /api/assignments/:id/submissions — lecturer views submissions
router.get("/:id/submissions", auth_1.requireAuth, (0, auth_1.requireRole)("lecturer", "admin"), async (req, res, next) => {
    try {
        const [assignments, submissions, students] = await Promise.all([
            (0, db_1.readJson)("assignments"),
            (0, db_1.readJson)("submissions"),
            (0, db_1.readJson)("students"),
        ]);
        const assignment = assignments.find((a) => a.id === req.params.id);
        if (!assignment) {
            return (0, envelope_1.sendError)(res, "Tugas tidak ditemukan", 404);
        }
        const assignmentSubs = submissions
            .filter((s) => s.assignmentId === assignment.id)
            .map((s) => {
            const student = students.find((st) => st.id === s.studentId);
            return {
                ...s,
                studentNim: s.studentNim || student?.nim || "-",
                studentName: s.studentName || student?.name || "Mahasiswa",
            };
        });
        return (0, envelope_1.sendSuccess)(res, assignmentSubs);
    }
    catch (err) {
        return next(err);
    }
});
// PUT /api/submissions/:id/grade — lecturer grades a submission (Lecturer only)
router.put("/submissions/:id/grade", auth_1.requireAuth, (0, auth_1.requireRole)("lecturer"), async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            score: zod_1.z.number().min(0, "Nilai minimal 0"),
            feedback: zod_1.z.string().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return (0, envelope_1.sendError)(res, parsed.error.errors[0]?.message || "Format nilai tidak valid", 400);
        }
        const [submissions, assignments, users] = await Promise.all([
            (0, db_1.readJson)("submissions"),
            (0, db_1.readJson)("assignments"),
            (0, db_1.readJson)("users"),
        ]);
        const subIdx = submissions.findIndex((s) => s.id === req.params.id);
        if (subIdx === -1) {
            return (0, envelope_1.sendError)(res, "Pengumpulan tugas tidak ditemukan", 404);
        }
        const sub = submissions[subIdx];
        const assignment = assignments.find((a) => a.id === sub.assignmentId);
        sub.score = parsed.data.score;
        sub.feedback = parsed.data.feedback || "";
        sub.gradedAt = new Date().toISOString();
        sub.gradedBy = req.user.name;
        submissions[subIdx] = sub;
        await (0, db_1.writeJson)("submissions", submissions);
        // Sinkronisasi otomatis IPK mahasiswa berdasarkan formula penilaian baru
        await (0, academicGrade_1.syncStudentGpa)(sub.studentId);
        // Find user id for student
        const studentUser = users.find((u) => u.refId === sub.studentId);
        // Notify student about grade!
        await (0, notifications_1.addNotification)({
            recipientUserId: studentUser?.id || sub.studentId,
            recipientRole: "student",
            title: `Nilai Tugas Diterbitkan: ${assignment?.title || "Tugas"}`,
            message: `Tugas Anda pada mata kuliah ${assignment?.courseName || ""} telah dinilai. Nilai: ${sub.score}/${assignment?.maxScore || 100}. Catatan: ${sub.feedback || "Tidak ada catatan."}`,
            type: "grade",
            actionUrl: "/assignments",
        });
        return (0, envelope_1.sendSuccess)(res, sub, "Nilai tugas berhasil disimpan");
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
