import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { readJson, writeJson } from "../data/db";
import { sendSuccess, sendError } from "../utils/envelope";
import type { Student, Lecturer, StudyProgram, Faculty } from "../models/entities";

const router = Router();

// GET /api/students - Directory of students
// - Lecturer: filters to lecturer's study program automatically
// - Admin: returns all students with study programs categorization
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const [students, studyPrograms, faculties, lecturers] = await Promise.all([
      readJson<Student>("students"),
      readJson<StudyProgram>("studyPrograms"),
      readJson<Faculty>("faculties"),
      readJson<Lecturer>("lecturers"),
    ]);

    const facultyMap = new Map(faculties.map((f) => [f.id, f.name]));
    const programMap = new Map(
      studyPrograms.map((p) => [
        p.id,
        {
          ...p,
          facultyName: facultyMap.get(p.facultyId) || "Fakultas",
        },
      ])
    );
    const lecturerMap = new Map(lecturers.map((l) => [l.id, l.name]));

    // 1. LECTURER VIEW: Restricted to lecturer's own study program
    if (user.role === "lecturer") {
      const lecturer = lecturers.find((l) => l.id === user.refId);
      if (!lecturer) {
        return sendError(res, "Profil dosen tidak ditemukan", 404);
      }

      const lecturerProgram = programMap.get(lecturer.studyProgramId);
      const programStudents = students.filter(
        (s) => s.studyProgramId === lecturer.studyProgramId
      );

      const enriched = programStudents.map((s) => ({
        id: s.id,
        nim: s.nim,
        name: s.name,
        email: s.email,
        studyProgramId: s.studyProgramId,
        studyProgramName: lecturerProgram?.name || "Program Studi",
        studyProgramCode: lecturerProgram?.code || "",
        facultyName: lecturerProgram?.facultyName || "Fakultas",
        currentSemester: s.currentSemester,
        angkatan: s.angkatan,
        uktGroup: s.uktGroup,
        status: s.status,
        advisorId: s.advisorId,
        advisorName: s.advisorId ? lecturerMap.get(s.advisorId) || "Dosen PA" : "Belum Ditentukan",
        gpa: s.gpa || 3.5,
        phone: s.phone || "-",
        isAdvisee: s.advisorId === lecturer.id,
      }));

      // Sort by Semester descending, then Name ascending
      enriched.sort((a, b) => b.currentSemester - a.currentSemester || a.name.localeCompare(b.name));

      return sendSuccess(res, {
        students: enriched,
        studyProgram: lecturerProgram,
        totalStudents: enriched.length,
        adviseeCount: enriched.filter((s) => s.isAdvisee).length,
      });
    }

    // 2. ADMIN VIEW: Full university-wide access with Study Program categorizer
    if (user.role === "admin") {
      const { studyProgramId, semester, status } = req.query;

      let filtered = [...students];

      if (studyProgramId && typeof studyProgramId === "string" && studyProgramId !== "all") {
        filtered = filtered.filter((s) => s.studyProgramId === studyProgramId);
      }
      if (semester && typeof semester === "string" && semester !== "all") {
        filtered = filtered.filter((s) => s.currentSemester === parseInt(semester, 10));
      }
      if (status && typeof status === "string" && status !== "all") {
        filtered = filtered.filter((s) => s.status.toLowerCase() === status.toLowerCase());
      }

      const enriched = filtered.map((s) => {
        const prog = programMap.get(s.studyProgramId);
        return {
          id: s.id,
          nim: s.nim,
          name: s.name,
          email: s.email,
          studyProgramId: s.studyProgramId,
          studyProgramName: prog?.name || "Program Studi",
          studyProgramCode: prog?.code || "",
          facultyName: prog?.facultyName || "Fakultas",
          currentSemester: s.currentSemester,
          angkatan: s.angkatan,
          uktGroup: s.uktGroup,
          status: s.status,
          advisorId: s.advisorId,
          advisorName: s.advisorId ? lecturerMap.get(s.advisorId) || "Dosen PA" : "Belum Ditentukan",
          gpa: s.gpa || 3.5,
          phone: s.phone || "-",
          isAdvisee: false,
        };
      });

      // Study program categorization stats
      const programStats = studyPrograms.map((prog) => {
        const count = students.filter((s) => s.studyProgramId === prog.id).length;
        return {
          id: prog.id,
          name: prog.name,
          code: prog.code,
          degree: prog.degree,
          facultyName: facultyMap.get(prog.facultyId) || "Fakultas",
          studentCount: count,
        };
      });

      enriched.sort((a, b) => a.nim.localeCompare(b.nim));

      return sendSuccess(res, {
        students: enriched,
        studyPrograms: programStats,
        totalStudents: enriched.length,
        universityTotal: students.length,
      });
    }

    // 3. STUDENT VIEW: Classmates in the same study program
    const currentStudent = students.find((s) => s.id === user.refId);
    const progId = currentStudent?.studyProgramId || "sp-1";
    const prog = programMap.get(progId);
    const peers = students.filter((s) => s.studyProgramId === progId).map((s) => ({
      id: s.id,
      nim: s.nim,
      name: s.name,
      email: s.email,
      studyProgramId: s.studyProgramId,
      studyProgramName: prog?.name || "Program Studi",
      studyProgramCode: prog?.code || "",
      facultyName: prog?.facultyName || "Fakultas",
      currentSemester: s.currentSemester,
      angkatan: s.angkatan,
      uktGroup: s.uktGroup,
      status: s.status,
      advisorId: s.advisorId,
      advisorName: s.advisorId ? lecturerMap.get(s.advisorId) || "Dosen PA" : "-",
      gpa: s.gpa || 3.5,
      phone: s.phone || "-",
      isAdvisee: false,
    }));

    return sendSuccess(res, {
      students: peers,
      studyProgram: prog,
      totalStudents: peers.length,
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/students/stats - High level summary statistics
router.get("/stats", requireAuth, async (req, res, next) => {
  try {
    const [students, studyPrograms] = await Promise.all([
      readJson<Student>("students"),
      readJson<StudyProgram>("studyPrograms"),
    ]);

    const activeCount = students.filter((s) => s.status.toLowerCase() === "aktif").length;
    const cutiCount = students.filter((s) => s.status.toLowerCase() === "cuti").length;
    const avgGpa =
      students.length > 0
        ? students.reduce((acc, s) => acc + (s.gpa || 3.5), 0) / students.length
        : 3.5;

    // Semester distribution
    const semesterDistribution: Record<number, number> = {};
    for (const s of students) {
      semesterDistribution[s.currentSemester] = (semesterDistribution[s.currentSemester] || 0) + 1;
    }

    return sendSuccess(res, {
      totalStudents: students.length,
      activeCount,
      cutiCount,
      averageGpa: parseFloat(avgGpa.toFixed(2)),
      semesterDistribution,
      totalPrograms: studyPrograms.length,
    });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/students/:id/status - Toggle student academic status (Admin & Lecturer)
router.put("/:id/status", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role !== "admin" && user.role !== "lecturer") {
      return sendError(res, "Hanya Admin dan Dosen yang dapat memperbarui status mahasiswa", 403);
    }

    const { status } = req.body;
    if (!status) {
      return sendError(res, "Status akademik wajib disertakan", 400);
    }

    const students = await readJson<Student>("students");
    const index = students.findIndex((s) => s.id === req.params.id);
    if (index === -1) {
      return sendError(res, "Mahasiswa tidak ditemukan", 404);
    }

    students[index].status = status;
    await writeJson("students", students);

    return sendSuccess(res, students[index]);
  } catch (err) {
    return next(err);
  }
});

export default router;
