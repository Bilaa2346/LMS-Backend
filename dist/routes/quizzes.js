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
// GET /api/quizzes/courses — helper to get courses list for quiz creation
router.get("/courses", auth_1.requireAuth, async (req, res, next) => {
    try {
        const [courses, studyPrograms, lecturers, classes] = await Promise.all([
            (0, db_1.readJson)("courses"),
            (0, db_1.readJson)("studyPrograms"),
            (0, db_1.readJson)("lecturers"),
            (0, db_1.readJson)("classes"),
        ]);
        let availableCourses = courses;
        // If lecturer, filter or prioritize courses in lecturer's study program or classes
        if (req.user?.role === "lecturer" && req.user.refId) {
            const lecturer = lecturers.find((l) => l.id === req.user.refId);
            if (lecturer) {
                availableCourses = courses.filter((c) => c.studyProgramId === lecturer.studyProgramId);
            }
        }
        const result = availableCourses.map((c) => {
            const sp = studyPrograms.find((s) => s.id === c.studyProgramId);
            const cls = classes.find((cl) => cl.courseId === c.id);
            return {
                id: c.id,
                code: c.code,
                name: c.name,
                sks: c.sks,
                studyProgramId: c.studyProgramId,
                studyProgramName: sp?.name || "Program Studi",
                classId: cls?.id,
            };
        });
        return (0, envelope_1.sendSuccess)(res, result);
    }
    catch (err) {
        return next(err);
    }
});
// GET /api/quizzes/mine — list quizzes relevant to current user
router.get("/mine", auth_1.requireAuth, async (req, res, next) => {
    try {
        const [quizzes, attempts, courses, studyPrograms, students, enrollments, classes] = await Promise.all([
            (0, db_1.readJson)("quizzes"),
            (0, db_1.readJson)("quizAttempts"),
            (0, db_1.readJson)("courses"),
            (0, db_1.readJson)("studyPrograms"),
            (0, db_1.readJson)("students"),
            (0, db_1.readJson)("enrollments"),
            (0, db_1.readJson)("classes"),
        ]);
        const user = req.user;
        if (user.role === "lecturer") {
            // Dosen sees quizzes they created
            const myQuizzes = quizzes
                .filter((q) => q.lecturerId === user.refId || !user.refId)
                .map((q) => {
                const quizAttempts = attempts.filter((a) => a.quizId === q.id && a.submittedAt);
                const course = courses.find((c) => c.id === q.courseId);
                const sp = studyPrograms.find((s) => s.id === q.studyProgramId);
                return {
                    ...q,
                    courseName: q.courseName || course?.name || "Mata Kuliah",
                    studyProgramName: q.studyProgramName || sp?.name || "Program Studi",
                    attemptCount: quizAttempts.length,
                };
            });
            return (0, envelope_1.sendSuccess)(res, myQuizzes);
        }
        if (user.role === "student") {
            // Mahasiswa sees published quizzes for their enrolled classes/courses or their study program
            const student = students.find((s) => s.id === user.refId);
            const myEnrollments = enrollments.filter((e) => e.studentId === user.refId && e.status === "Disetujui");
            const enrolledClassIds = new Set(myEnrollments.map((e) => e.classId));
            const enrolledCourseIds = new Set(classes.filter((c) => enrolledClassIds.has(c.id)).map((c) => c.courseId));
            const relevantQuizzes = quizzes
                .filter((q) => q.published &&
                (enrolledCourseIds.has(q.courseId) ||
                    (student && q.studyProgramId === student.studyProgramId) ||
                    enrolledCourseIds.size === 0))
                .map((q) => {
                const myAttempt = attempts.find((a) => a.quizId === q.id && a.studentId === user.refId);
                const course = courses.find((c) => c.id === q.courseId);
                const sp = studyPrograms.find((s) => s.id === q.studyProgramId);
                // Strip question answer keys from list view
                const safeQuestions = q.questions.map((ques) => ({
                    id: ques.id,
                    text: ques.text,
                    options: ques.options,
                    points: ques.points,
                }));
                return {
                    id: q.id,
                    title: q.title,
                    type: q.type,
                    description: q.description,
                    courseId: q.courseId,
                    courseName: q.courseName || course?.name || "Mata Kuliah",
                    studyProgramId: q.studyProgramId,
                    studyProgramName: q.studyProgramName || sp?.name || "Program Studi",
                    lecturerName: q.lecturerName || "Dosen Pengampu",
                    startAt: q.startAt,
                    endAt: q.endAt,
                    durationMinutes: q.durationMinutes,
                    questionCount: q.questions.length,
                    totalPoints: q.questions.reduce((sum, item) => sum + item.points, 0),
                    myAttempt: myAttempt
                        ? {
                            id: myAttempt.id,
                            score: myAttempt.score,
                            maxScore: myAttempt.maxScore,
                            submittedAt: myAttempt.submittedAt,
                            isFinished: !!myAttempt.submittedAt,
                        }
                        : null,
                };
            });
            return (0, envelope_1.sendSuccess)(res, relevantQuizzes);
        }
        // Admin sees all quizzes
        const all = quizzes.map((q) => {
            const quizAttempts = attempts.filter((a) => a.quizId === q.id && a.submittedAt);
            return {
                ...q,
                attemptCount: quizAttempts.length,
            };
        });
        return (0, envelope_1.sendSuccess)(res, all);
    }
    catch (err) {
        return next(err);
    }
});
// POST /api/quizzes — create quiz (lecturer only, admin is read-only)
router.post("/", auth_1.requireAuth, (0, auth_1.requireRole)("lecturer"), async (req, res, next) => {
    try {
        const questionSchema = zod_1.z.object({
            text: zod_1.z.string().min(1, "Pertanyaan tidak boleh kosong"),
            options: zod_1.z.array(zod_1.z.string().min(1)).min(2, "Minimal 2 pilihan opsi"),
            answerIndex: zod_1.z.number().int().min(0),
            points: zod_1.z.number().min(1).default(10),
        });
        const schema = zod_1.z.object({
            courseId: zod_1.z.string().min(1, "Mata kuliah wajib dipilih"),
            title: zod_1.z.string().min(3, "Judul kuis minimal 3 karakter"),
            type: zod_1.z.enum(["Kuis", "UTS", "UAS"]).default("Kuis"),
            description: zod_1.z.string().default(""),
            durationMinutes: zod_1.z.number().int().min(1).default(30),
            startAt: zod_1.z.string().optional(),
            endAt: zod_1.z.string().optional(),
            published: zod_1.z.boolean().default(true),
            questions: zod_1.z.array(questionSchema).min(1, "Minimal 1 pertanyaan"),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return (0, envelope_1.sendError)(res, parsed.error.errors[0]?.message || "Data kuis tidak valid", 400);
        }
        const [quizzes, courses, studyPrograms, lecturers] = await Promise.all([
            (0, db_1.readJson)("quizzes"),
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
        const newQuiz = {
            id: (0, ids_1.createId)("qiz"),
            courseId: course.id,
            courseName: course.name,
            studyProgramId: course.studyProgramId,
            studyProgramName: sp?.name || "Program Studi",
            lecturerId: req.user.refId || "lec-admin",
            lecturerName: lecturer?.name || req.user.name,
            title: parsed.data.title,
            type: parsed.data.type,
            description: parsed.data.description,
            durationMinutes: parsed.data.durationMinutes,
            startAt: parsed.data.startAt || now,
            endAt: parsed.data.endAt ||
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            published: parsed.data.published,
            questions: parsed.data.questions.map((q, idx) => ({
                id: (0, ids_1.createId)(`qst-${idx + 1}`),
                text: q.text,
                options: q.options,
                answerIndex: q.answerIndex,
                points: q.points,
            })),
            createdAt: now,
        };
        quizzes.push(newQuiz);
        await (0, db_1.writeJson)("quizzes", quizzes);
        if (newQuiz.published) {
            await (0, notifications_1.addNotification)({
                recipientRole: "student",
                recipientStudyProgramId: course.studyProgramId,
                title: `${newQuiz.type} Baru: ${newQuiz.title}`,
                message: `${newQuiz.lecturerName} telah mempublikasikan ${newQuiz.type} pada mata kuliah ${course.name}. Durasi: ${newQuiz.durationMinutes} menit.`,
                type: "quiz",
                actionUrl: "/quizzes",
            });
        }
        return (0, envelope_1.sendSuccess)(res, newQuiz, "Kuis berhasil dibuat");
    }
    catch (err) {
        return next(err);
    }
});
// GET /api/quizzes/:id — get quiz detail
router.get("/:id", auth_1.requireAuth, async (req, res, next) => {
    try {
        const [quizzes, attempts] = await Promise.all([
            (0, db_1.readJson)("quizzes"),
            (0, db_1.readJson)("quizAttempts"),
        ]);
        const quiz = quizzes.find((q) => q.id === req.params.id);
        if (!quiz) {
            return (0, envelope_1.sendError)(res, "Kuis tidak ditemukan", 404);
        }
        const user = req.user;
        // Lecturer / Admin gets full quiz with answerIndex
        if (user.role === "lecturer" || user.role === "admin") {
            return (0, envelope_1.sendSuccess)(res, quiz);
        }
        // Student: check attempt & strip answerIndex
        const myAttempt = attempts.find((a) => a.quizId === quiz.id && a.studentId === user.refId);
        const safeQuestions = quiz.questions.map((q) => ({
            id: q.id,
            text: q.text,
            options: q.options,
            points: q.points,
        }));
        return (0, envelope_1.sendSuccess)(res, {
            ...quiz,
            questions: safeQuestions,
            myAttempt: myAttempt || null,
        });
    }
    catch (err) {
        return next(err);
    }
});
// PUT /api/quizzes/:id — update or publish/unpublish quiz (lecturer only)
router.put("/:id", auth_1.requireAuth, (0, auth_1.requireRole)("lecturer"), async (req, res, next) => {
    try {
        const quizzes = await (0, db_1.readJson)("quizzes");
        const idx = quizzes.findIndex((q) => q.id === req.params.id);
        if (idx === -1) {
            return (0, envelope_1.sendError)(res, "Kuis tidak ditemukan", 404);
        }
        const existing = quizzes[idx];
        const { title, description, published, durationMinutes, type, questions } = req.body;
        if (title !== undefined)
            existing.title = title;
        if (description !== undefined)
            existing.description = description;
        if (published !== undefined)
            existing.published = Boolean(published);
        if (durationMinutes !== undefined)
            existing.durationMinutes = Number(durationMinutes);
        if (type !== undefined)
            existing.type = type;
        if (Array.isArray(questions) && questions.length > 0) {
            existing.questions = questions.map((q, i) => ({
                id: q.id || (0, ids_1.createId)(`qst-${i + 1}`),
                text: q.text,
                options: q.options,
                answerIndex: Number(q.answerIndex),
                points: Number(q.points || 10),
            }));
        }
        quizzes[idx] = existing;
        await (0, db_1.writeJson)("quizzes", quizzes);
        return (0, envelope_1.sendSuccess)(res, existing, "Kuis berhasil diperbarui");
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /api/quizzes/:id — delete quiz (lecturer only)
router.delete("/:id", auth_1.requireAuth, (0, auth_1.requireRole)("lecturer"), async (req, res, next) => {
    try {
        const quizzes = await (0, db_1.readJson)("quizzes");
        const filtered = quizzes.filter((q) => q.id !== req.params.id);
        if (filtered.length === quizzes.length) {
            return (0, envelope_1.sendError)(res, "Kuis tidak ditemukan", 404);
        }
        await (0, db_1.writeJson)("quizzes", filtered);
        return (0, envelope_1.sendSuccess)(res, null, "Kuis berhasil dihapus");
    }
    catch (err) {
        return next(err);
    }
});
// POST /api/quizzes/:id/start — student starts quiz
router.post("/:id/start", auth_1.requireAuth, (0, auth_1.requireRole)("student"), async (req, res, next) => {
    try {
        const [quizzes, attempts, students] = await Promise.all([
            (0, db_1.readJson)("quizzes"),
            (0, db_1.readJson)("quizAttempts"),
            (0, db_1.readJson)("students"),
        ]);
        const quiz = quizzes.find((q) => q.id === req.params.id);
        if (!quiz) {
            return (0, envelope_1.sendError)(res, "Kuis tidak ditemukan", 404);
        }
        if (!quiz.published) {
            return (0, envelope_1.sendError)(res, "Kuis belum dipublikasikan oleh dosen", 400);
        }
        const student = students.find((s) => s.id === req.user.refId);
        // Check if attempt already exists
        const existing = attempts.find((a) => a.quizId === quiz.id && a.studentId === req.user.refId);
        if (existing) {
            if (existing.submittedAt) {
                return (0, envelope_1.sendError)(res, "Anda sudah menyelesaikan kuis ini", 400);
            }
            return (0, envelope_1.sendSuccess)(res, existing, "Melanjutkan pengerjaan kuis");
        }
        const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);
        const newAttempt = {
            id: (0, ids_1.createId)("atm"),
            quizId: quiz.id,
            studentId: req.user.refId,
            studentName: student?.name || req.user.name,
            studentNim: student?.nim || "",
            answers: new Array(quiz.questions.length).fill(null),
            score: null,
            maxScore,
            startedAt: new Date().toISOString(),
            submittedAt: null,
        };
        attempts.push(newAttempt);
        await (0, db_1.writeJson)("quizAttempts", attempts);
        return (0, envelope_1.sendSuccess)(res, newAttempt, "Kuis dimulai");
    }
    catch (err) {
        return next(err);
    }
});
// POST /api/quizzes/:id/submit — student submits quiz answers and gets auto-graded
router.post("/:id/submit", auth_1.requireAuth, (0, auth_1.requireRole)("student"), async (req, res, next) => {
    try {
        const parsed = zod_1.z
            .object({
            answers: zod_1.z.array(zod_1.z.number().nullable()),
        })
            .safeParse(req.body);
        if (!parsed.success) {
            return (0, envelope_1.sendError)(res, "Format jawaban tidak valid", 400);
        }
        const [quizzes, attempts, students] = await Promise.all([
            (0, db_1.readJson)("quizzes"),
            (0, db_1.readJson)("quizAttempts"),
            (0, db_1.readJson)("students"),
        ]);
        const quiz = quizzes.find((q) => q.id === req.params.id);
        if (!quiz) {
            return (0, envelope_1.sendError)(res, "Kuis tidak ditemukan", 404);
        }
        const student = students.find((s) => s.id === req.user.refId);
        const studentAnswers = parsed.data.answers;
        // Grade automatically
        let totalScore = 0;
        let maxScore = 0;
        let correctCount = 0;
        quiz.questions.forEach((q, index) => {
            maxScore += q.points;
            const answer = studentAnswers[index];
            if (answer !== null && answer !== undefined && answer === q.answerIndex) {
                totalScore += q.points;
                correctCount += 1;
            }
        });
        const now = new Date().toISOString();
        let attemptIdx = attempts.findIndex((a) => a.quizId === quiz.id && a.studentId === req.user.refId);
        let finalAttempt;
        if (attemptIdx >= 0) {
            attempts[attemptIdx].answers = studentAnswers;
            attempts[attemptIdx].score = totalScore;
            attempts[attemptIdx].maxScore = maxScore;
            attempts[attemptIdx].submittedAt = now;
            finalAttempt = attempts[attemptIdx];
        }
        else {
            finalAttempt = {
                id: (0, ids_1.createId)("atm"),
                quizId: quiz.id,
                studentId: req.user.refId,
                studentName: student?.name || req.user.name,
                studentNim: student?.nim || "",
                answers: studentAnswers,
                score: totalScore,
                maxScore,
                startedAt: now,
                submittedAt: now,
            };
            attempts.push(finalAttempt);
        }
        await (0, db_1.writeJson)("quizAttempts", attempts);
        // Sinkronisasi otomatis IPK mahasiswa berdasarkan formula penilaian baru
        if (req.user?.refId) {
            await (0, academicGrade_1.syncStudentGpa)(req.user.refId);
        }
        const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
        // Notify lecturer about student quiz completion
        await (0, notifications_1.addNotification)({
            recipientUserId: quiz.lecturerId,
            recipientRole: "lecturer",
            title: `Penyelesaian ${quiz.type}: ${quiz.title}`,
            message: `Mahasiswa ${finalAttempt.studentName} (${finalAttempt.studentNim}) telah mengumpulkan ${quiz.type} pada mata kuliah ${quiz.courseName || ""} dengan nilai ${totalScore}/${maxScore} (${percentage}%).`,
            type: "quiz",
            actionUrl: "/quizzes",
        });
        return (0, envelope_1.sendSuccess)(res, {
            attempt: finalAttempt,
            score: totalScore,
            maxScore,
            percentage,
            correctCount,
            totalQuestions: quiz.questions.length,
        }, "Jawaban berhasil dikirim! Nilai Anda telah tercatat.");
    }
    catch (err) {
        return next(err);
    }
});
// GET /api/quizzes/:id/attempts — lecturer sees student attempts and scores
router.get("/:id/attempts", auth_1.requireAuth, (0, auth_1.requireRole)("lecturer", "admin"), async (req, res, next) => {
    try {
        const [quizzes, attempts, students] = await Promise.all([
            (0, db_1.readJson)("quizzes"),
            (0, db_1.readJson)("quizAttempts"),
            (0, db_1.readJson)("students"),
        ]);
        const quiz = quizzes.find((q) => q.id === req.params.id);
        if (!quiz) {
            return (0, envelope_1.sendError)(res, "Kuis tidak ditemukan", 404);
        }
        const quizAttempts = attempts
            .filter((a) => a.quizId === quiz.id && a.submittedAt)
            .map((a) => {
            const student = students.find((s) => s.id === a.studentId);
            return {
                id: a.id,
                studentId: a.studentId,
                studentNim: a.studentNim || student?.nim || "-",
                studentName: a.studentName || student?.name || "Mahasiswa",
                score: a.score,
                maxScore: a.maxScore,
                percentage: a.maxScore > 0 && a.score !== null
                    ? Math.round((a.score / a.maxScore) * 100)
                    : 0,
                submittedAt: a.submittedAt,
            };
        });
        return (0, envelope_1.sendSuccess)(res, quizAttempts);
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
