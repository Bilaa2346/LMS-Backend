import { Router } from "express";
import { z } from "zod";
import { readJson, writeJson } from "../data/db";
import type {
  Quiz,
  Question,
  QuizAttempt,
  Course,
  StudyProgram,
  ClassSection,
  Enrollment,
  Student,
  Lecturer,
} from "../models/entities";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendSuccess, sendError } from "../utils/envelope";
import { createId } from "../utils/ids";
import { addNotification } from "../utils/notifications";

const router = Router();

// GET /api/quizzes/courses — helper to get courses list for quiz creation
router.get("/courses", requireAuth, async (req, res, next) => {
  try {
    const [courses, studyPrograms, lecturers, classes] = await Promise.all([
      readJson<Course>("courses"),
      readJson<StudyProgram>("studyPrograms"),
      readJson<Lecturer>("lecturers"),
      readJson<ClassSection>("classes"),
    ]);

    let availableCourses = courses;

    // If lecturer, filter or prioritize courses in lecturer's study program or classes
    if (req.user?.role === "lecturer" && req.user.refId) {
      const lecturer = lecturers.find((l) => l.id === req.user!.refId);
      if (lecturer) {
        availableCourses = courses.filter(
          (c) => c.studyProgramId === lecturer.studyProgramId
        );
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

    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
});

// GET /api/quizzes/mine — list quizzes relevant to current user
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const [quizzes, attempts, courses, studyPrograms, students, enrollments, classes] =
      await Promise.all([
        readJson<Quiz>("quizzes"),
        readJson<QuizAttempt>("quizAttempts"),
        readJson<Course>("courses"),
        readJson<StudyProgram>("studyPrograms"),
        readJson<Student>("students"),
        readJson<Enrollment>("enrollments"),
        readJson<ClassSection>("classes"),
      ]);

    const user = req.user!;

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

      return sendSuccess(res, myQuizzes);
    }

    if (user.role === "student") {
      // Mahasiswa sees published quizzes for their enrolled classes/courses or their study program
      const student = students.find((s) => s.id === user.refId);
      const myEnrollments = enrollments.filter(
        (e) => e.studentId === user.refId && e.status === "Disetujui"
      );
      const enrolledClassIds = new Set(myEnrollments.map((e) => e.classId));
      const enrolledCourseIds = new Set(
        classes.filter((c) => enrolledClassIds.has(c.id)).map((c) => c.courseId)
      );

      const relevantQuizzes = quizzes
        .filter(
          (q) =>
            q.published &&
            (enrolledCourseIds.has(q.courseId) ||
              (student && q.studyProgramId === student.studyProgramId) ||
              enrolledCourseIds.size === 0)
        )
        .map((q) => {
          const myAttempt = attempts.find(
            (a) => a.quizId === q.id && a.studentId === user.refId
          );
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

      return sendSuccess(res, relevantQuizzes);
    }

    // Admin sees all quizzes
    const all = quizzes.map((q) => {
      const quizAttempts = attempts.filter((a) => a.quizId === q.id && a.submittedAt);
      return {
        ...q,
        attemptCount: quizAttempts.length,
      };
    });
    return sendSuccess(res, all);
  } catch (err) {
    return next(err);
  }
});

// POST /api/quizzes — create quiz (lecturer/admin)
router.post(
  "/",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res, next) => {
    try {
      const questionSchema = z.object({
        text: z.string().min(1, "Pertanyaan tidak boleh kosong"),
        options: z.array(z.string().min(1)).min(2, "Minimal 2 pilihan opsi"),
        answerIndex: z.number().int().min(0),
        points: z.number().min(1).default(10),
      });

      const schema = z.object({
        courseId: z.string().min(1, "Mata kuliah wajib dipilih"),
        title: z.string().min(3, "Judul kuis minimal 3 karakter"),
        type: z.enum(["Kuis", "UTS", "UAS"]).default("Kuis"),
        description: z.string().default(""),
        durationMinutes: z.number().int().min(1).default(30),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        published: z.boolean().default(true),
        questions: z.array(questionSchema).min(1, "Minimal 1 pertanyaan"),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(
          res,
          parsed.error.errors[0]?.message || "Data kuis tidak valid",
          400
        );
      }

      const [quizzes, courses, studyPrograms, lecturers] = await Promise.all([
        readJson<Quiz>("quizzes"),
        readJson<Course>("courses"),
        readJson<StudyProgram>("studyPrograms"),
        readJson<Lecturer>("lecturers"),
      ]);

      const course = courses.find((c) => c.id === parsed.data.courseId);
      if (!course) {
        return sendError(res, "Mata kuliah tidak ditemukan", 404);
      }

      const sp = studyPrograms.find((s) => s.id === course.studyProgramId);
      const lecturer = lecturers.find((l) => l.id === req.user!.refId);

      const now = new Date().toISOString();
      const newQuiz: Quiz = {
        id: createId("qiz"),
        courseId: course.id,
        courseName: course.name,
        studyProgramId: course.studyProgramId,
        studyProgramName: sp?.name || "Program Studi",
        lecturerId: req.user!.refId || "lec-admin",
        lecturerName: lecturer?.name || req.user!.name,
        title: parsed.data.title,
        type: parsed.data.type,
        description: parsed.data.description,
        durationMinutes: parsed.data.durationMinutes,
        startAt: parsed.data.startAt || now,
        endAt:
          parsed.data.endAt ||
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        published: parsed.data.published,
        questions: parsed.data.questions.map((q, idx) => ({
          id: createId(`qst-${idx + 1}`),
          text: q.text,
          options: q.options,
          answerIndex: q.answerIndex,
          points: q.points,
        })),
        createdAt: now,
      };

      quizzes.push(newQuiz);
      await writeJson("quizzes", quizzes);

      if (newQuiz.published) {
        await addNotification({
          recipientRole: "student",
          recipientStudyProgramId: course.studyProgramId,
          title: `${newQuiz.type} Baru: ${newQuiz.title}`,
          message: `${newQuiz.lecturerName} telah mempublikasikan ${newQuiz.type} pada mata kuliah ${course.name}. Durasi: ${newQuiz.durationMinutes} menit.`,
          type: "quiz",
          actionUrl: "/quizzes",
        });
      }

      return sendSuccess(res, newQuiz, "Kuis berhasil dibuat");
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/quizzes/:id — get quiz detail
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const [quizzes, attempts] = await Promise.all([
      readJson<Quiz>("quizzes"),
      readJson<QuizAttempt>("quizAttempts"),
    ]);

    const quiz = quizzes.find((q) => q.id === req.params.id);
    if (!quiz) {
      return sendError(res, "Kuis tidak ditemukan", 404);
    }

    const user = req.user!;

    // Lecturer / Admin gets full quiz with answerIndex
    if (user.role === "lecturer" || user.role === "admin") {
      return sendSuccess(res, quiz);
    }

    // Student: check attempt & strip answerIndex
    const myAttempt = attempts.find(
      (a) => a.quizId === quiz.id && a.studentId === user.refId
    );

    const safeQuestions = quiz.questions.map((q) => ({
      id: q.id,
      text: q.text,
      options: q.options,
      points: q.points,
    }));

    return sendSuccess(res, {
      ...quiz,
      questions: safeQuestions,
      myAttempt: myAttempt || null,
    });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/quizzes/:id — update or publish/unpublish quiz
router.put(
  "/:id",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res, next) => {
    try {
      const quizzes = await readJson<Quiz>("quizzes");
      const idx = quizzes.findIndex((q) => q.id === req.params.id);
      if (idx === -1) {
        return sendError(res, "Kuis tidak ditemukan", 404);
      }

      const existing = quizzes[idx];
      const { title, description, published, durationMinutes, type, questions } =
        req.body;

      if (title !== undefined) existing.title = title;
      if (description !== undefined) existing.description = description;
      if (published !== undefined) existing.published = Boolean(published);
      if (durationMinutes !== undefined)
        existing.durationMinutes = Number(durationMinutes);
      if (type !== undefined) existing.type = type;
      if (Array.isArray(questions) && questions.length > 0) {
        existing.questions = questions.map((q: any, i: number) => ({
          id: q.id || createId(`qst-${i + 1}`),
          text: q.text,
          options: q.options,
          answerIndex: Number(q.answerIndex),
          points: Number(q.points || 10),
        }));
      }

      quizzes[idx] = existing;
      await writeJson("quizzes", quizzes);

      return sendSuccess(res, existing, "Kuis berhasil diperbarui");
    } catch (err) {
      return next(err);
    }
  }
);

// DELETE /api/quizzes/:id — delete quiz
router.delete(
  "/:id",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res, next) => {
    try {
      const quizzes = await readJson<Quiz>("quizzes");
      const filtered = quizzes.filter((q) => q.id !== req.params.id);
      if (filtered.length === quizzes.length) {
        return sendError(res, "Kuis tidak ditemukan", 404);
      }

      await writeJson("quizzes", filtered);
      return sendSuccess(res, null, "Kuis berhasil dihapus");
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/quizzes/:id/start — student starts quiz
router.post(
  "/:id/start",
  requireAuth,
  requireRole("student"),
  async (req, res, next) => {
    try {
      const [quizzes, attempts, students] = await Promise.all([
        readJson<Quiz>("quizzes"),
        readJson<QuizAttempt>("quizAttempts"),
        readJson<Student>("students"),
      ]);

      const quiz = quizzes.find((q) => q.id === req.params.id);
      if (!quiz) {
        return sendError(res, "Kuis tidak ditemukan", 404);
      }

      if (!quiz.published) {
        return sendError(res, "Kuis belum dipublikasikan oleh dosen", 400);
      }

      const student = students.find((s) => s.id === req.user!.refId);

      // Check if attempt already exists
      const existing = attempts.find(
        (a) => a.quizId === quiz.id && a.studentId === req.user!.refId
      );

      if (existing) {
        if (existing.submittedAt) {
          return sendError(res, "Anda sudah menyelesaikan kuis ini", 400);
        }
        return sendSuccess(res, existing, "Melanjutkan pengerjaan kuis");
      }

      const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);
      const newAttempt: QuizAttempt = {
        id: createId("atm"),
        quizId: quiz.id,
        studentId: req.user!.refId!,
        studentName: student?.name || req.user!.name,
        studentNim: student?.nim || "",
        answers: new Array(quiz.questions.length).fill(null),
        score: null,
        maxScore,
        startedAt: new Date().toISOString(),
        submittedAt: null,
      };

      attempts.push(newAttempt);
      await writeJson("quizAttempts", attempts);

      return sendSuccess(res, newAttempt, "Kuis dimulai");
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/quizzes/:id/submit — student submits quiz answers and gets auto-graded
router.post(
  "/:id/submit",
  requireAuth,
  requireRole("student"),
  async (req, res, next) => {
    try {
      const parsed = z
        .object({
          answers: z.array(z.number().nullable()),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return sendError(res, "Format jawaban tidak valid", 400);
      }

      const [quizzes, attempts, students] = await Promise.all([
        readJson<Quiz>("quizzes"),
        readJson<QuizAttempt>("quizAttempts"),
        readJson<Student>("students"),
      ]);

      const quiz = quizzes.find((q) => q.id === req.params.id);
      if (!quiz) {
        return sendError(res, "Kuis tidak ditemukan", 404);
      }

      const student = students.find((s) => s.id === req.user!.refId);
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
      let attemptIdx = attempts.findIndex(
        (a) => a.quizId === quiz.id && a.studentId === req.user!.refId
      );

      let finalAttempt: QuizAttempt;

      if (attemptIdx >= 0) {
        attempts[attemptIdx].answers = studentAnswers;
        attempts[attemptIdx].score = totalScore;
        attempts[attemptIdx].maxScore = maxScore;
        attempts[attemptIdx].submittedAt = now;
        finalAttempt = attempts[attemptIdx];
      } else {
        finalAttempt = {
          id: createId("atm"),
          quizId: quiz.id,
          studentId: req.user!.refId!,
          studentName: student?.name || req.user!.name,
          studentNim: student?.nim || "",
          answers: studentAnswers,
          score: totalScore,
          maxScore,
          startedAt: now,
          submittedAt: now,
        };
        attempts.push(finalAttempt);
      }

      await writeJson("quizAttempts", attempts);

      const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      // Notify lecturer about student quiz completion
      await addNotification({
        recipientUserId: quiz.lecturerId,
        recipientRole: "lecturer",
        title: `Penyelesaian ${quiz.type}: ${quiz.title}`,
        message: `Mahasiswa ${finalAttempt.studentName} (${finalAttempt.studentNim}) telah mengumpulkan ${quiz.type} pada mata kuliah ${quiz.courseName || ""} dengan nilai ${totalScore}/${maxScore} (${percentage}%).`,
        type: "quiz",
        actionUrl: "/quizzes",
      });

      return sendSuccess(
        res,
        {
          attempt: finalAttempt,
          score: totalScore,
          maxScore,
          percentage,
          correctCount,
          totalQuestions: quiz.questions.length,
        },
        "Jawaban berhasil dikirim! Nilai Anda telah tercatat."
      );
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/quizzes/:id/attempts — lecturer sees student attempts and scores
router.get(
  "/:id/attempts",
  requireAuth,
  requireRole("lecturer", "admin"),
  async (req, res, next) => {
    try {
      const [quizzes, attempts, students] = await Promise.all([
        readJson<Quiz>("quizzes"),
        readJson<QuizAttempt>("quizAttempts"),
        readJson<Student>("students"),
      ]);

      const quiz = quizzes.find((q) => q.id === req.params.id);
      if (!quiz) {
        return sendError(res, "Kuis tidak ditemukan", 404);
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
            percentage:
              a.maxScore > 0 && a.score !== null
                ? Math.round((a.score / a.maxScore) * 100)
                : 0,
            submittedAt: a.submittedAt,
          };
        });

      return sendSuccess(res, quizAttempts);
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
