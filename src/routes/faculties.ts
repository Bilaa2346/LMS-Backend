import { Router } from "express";
import { z } from "zod";
import { readJson, writeJson } from "../data/db";
import type { Faculty, StudyProgram } from "../models/entities";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendSuccess, sendError } from "../utils/envelope";
import { createId } from "../utils/ids";

const router = Router();

// GET /api/faculties — List all faculties (supports ?onlyActive=true)
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const faculties = await readJson<Faculty>("faculties");
    const onlyActive = req.query.onlyActive === "true";

    const result = faculties
      .map((f) => ({
        ...f,
        status: f.status || (f.isActive === false ? "inactive" : "active"),
      }))
      .filter((f) => (onlyActive ? f.status === "active" : true));

    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
});

// POST /api/faculties — Create new faculty (admin only)
router.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(3, "Nama fakultas minimal 3 karakter"),
      code: z.string().min(2, "Kode fakultas minimal 2 karakter"),
      dean: z.string().optional(),
      email: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["active", "inactive"]).default("active"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, parsed.error.errors[0]?.message || "Data fakultas tidak valid", 400);
    }

    const faculties = await readJson<Faculty>("faculties");
    const codeExists = faculties.some(
      (f) => f.code.toLowerCase() === parsed.data.code.toLowerCase()
    );
    if (codeExists) {
      return sendError(res, "Kode fakultas sudah digunakan", 400);
    }

    const newFaculty: Faculty = {
      id: createId("fac"),
      name: parsed.data.name,
      code: parsed.data.code.toUpperCase(),
      dean: parsed.data.dean || "",
      email: parsed.data.email || "",
      description: parsed.data.description || "",
      status: parsed.data.status,
      isActive: parsed.data.status === "active",
      createdAt: new Date().toISOString().slice(0, 10),
    };

    faculties.push(newFaculty);
    await writeJson("faculties", faculties);

    return sendSuccess(res, newFaculty, "Fakultas berhasil ditambahkan");
  } catch (err) {
    return next(err);
  }
});

// PUT /api/faculties/:id — Update faculty or toggle active status (admin only)
router.put("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const faculties = await readJson<Faculty>("faculties");
    const idx = faculties.findIndex((f) => f.id === req.params.id);
    if (idx === -1) {
      return sendError(res, "Fakultas tidak ditemukan", 404);
    }

    const faculty = faculties[idx];
    const { name, code, dean, email, description, status } = req.body;

    if (name) faculty.name = name;
    if (code) faculty.code = code.toUpperCase();
    if (dean !== undefined) faculty.dean = dean;
    if (email !== undefined) faculty.email = email;
    if (description !== undefined) faculty.description = description;
    if (status) {
      faculty.status = status === "active" ? "active" : "inactive";
      faculty.isActive = status === "active";
    }

    faculties[idx] = faculty;
    await writeJson("faculties", faculties);

    return sendSuccess(res, faculty, `Fakultas berhasil diperbarui (Status: ${faculty.status})`);
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/faculties/:id — Delete faculty (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const [faculties, studyPrograms] = await Promise.all([
      readJson<Faculty>("faculties"),
      readJson<StudyProgram>("studyPrograms"),
    ]);

    const hasPrograms = studyPrograms.some((sp) => sp.facultyId === req.params.id);
    if (hasPrograms) {
      return sendError(
        res,
        "Fakultas ini masih memiliki program studi terdaftar. Harap pindahkan atau hapus program studi terkait terlebih dahulu.",
        400
      );
    }

    const filtered = faculties.filter((f) => f.id !== req.params.id);
    if (filtered.length === faculties.length) {
      return sendError(res, "Fakultas tidak ditemukan", 404);
    }

    await writeJson("faculties", filtered);
    return sendSuccess(res, null, "Fakultas berhasil dihapus");
  } catch (err) {
    return next(err);
  }
});

// ==========================================
// STUDY PROGRAMS (PROGRAM STUDI)
// ==========================================

// GET /api/faculties/programs — List all study programs
router.get("/programs", requireAuth, async (_req, res, next) => {
  try {
    const [programs, faculties] = await Promise.all([
      readJson<StudyProgram>("studyPrograms"),
      readJson<Faculty>("faculties"),
    ]);

    const result = programs.map((p) => {
      const f = faculties.find((fac) => fac.id === p.facultyId);
      const isFacultyActive = f ? (f.status !== "inactive" && f.isActive !== false) : true;
      return {
        ...p,
        facultyName: f?.name || "Fakultas",
        facultyStatus: isFacultyActive ? "active" : "inactive",
        status: p.status || (p.isActive === false ? "inactive" : "active"),
      };
    });

    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
});

// POST /api/faculties/programs — Create new study program (admin only)
router.post("/programs", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      facultyId: z.string().min(1, "Fakultas wajib dipilih"),
      name: z.string().min(2, "Nama program studi minimal 2 karakter"),
      code: z.string().min(2, "Kode program studi minimal 2 karakter"),
      degree: z.enum(["D3", "D4", "S1", "S2", "S3"]).default("S1"),
      headOfProgram: z.string().optional(),
      status: z.enum(["active", "inactive"]).default("active"),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, parsed.error.errors[0]?.message || "Data program studi tidak valid", 400);
    }

    const [faculties, programs] = await Promise.all([
      readJson<Faculty>("faculties"),
      readJson<StudyProgram>("studyPrograms"),
    ]);

    // VALIDASI LOGIKA: FAKULTAS YANG DIPILIH TIDAK BOLEH BERSTATUS NONAKTIF
    const faculty = faculties.find((f) => f.id === parsed.data.facultyId);
    if (!faculty) {
      return sendError(res, "Fakultas yang dipilih tidak ditemukan", 404);
    }

    const isFacultyActive = faculty.status !== "inactive" && faculty.isActive !== false;
    if (!isFacultyActive) {
      return sendError(
        res,
        `Fakultas "${faculty.name}" sedang berstatus NONAKTIF. Anda tidak dapat menambahkan program studi ke fakultas yang dinonaktifkan. Silakan aktifkan fakultas terlebih dahulu.`,
        400
      );
    }

    const newProgram: StudyProgram = {
      id: createId("sp"),
      facultyId: faculty.id,
      name: parsed.data.name,
      code: parsed.data.code.toUpperCase(),
      degree: parsed.data.degree,
      headOfProgram: parsed.data.headOfProgram || "",
      status: parsed.data.status,
      isActive: parsed.data.status === "active",
      createdAt: new Date().toISOString().slice(0, 10),
    };

    programs.push(newProgram);
    await writeJson("studyPrograms", programs);

    return sendSuccess(res, newProgram, "Program studi berhasil ditambahkan");
  } catch (err) {
    return next(err);
  }
});

// PUT /api/faculties/programs/:id — Update study program
router.put("/programs/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const [programs, faculties] = await Promise.all([
      readJson<StudyProgram>("studyPrograms"),
      readJson<Faculty>("faculties"),
    ]);

    const idx = programs.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      return sendError(res, "Program studi tidak ditemukan", 404);
    }

    const program = programs[idx];
    const { facultyId, name, code, degree, headOfProgram, status } = req.body;

    if (facultyId && facultyId !== program.facultyId) {
      const targetFaculty = faculties.find((f) => f.id === facultyId);
      if (!targetFaculty) {
        return sendError(res, "Fakultas tujuan tidak ditemukan", 404);
      }
      const isTargetActive = targetFaculty.status !== "inactive" && targetFaculty.isActive !== false;
      if (!isTargetActive) {
        return sendError(
          res,
          `Fakultas tujuan "${targetFaculty.name}" sedang NONAKTIF. Tidak dapat memindahkan program studi ke fakultas nonaktif.`,
          400
        );
      }
      program.facultyId = facultyId;
    }

    if (name) program.name = name;
    if (code) program.code = code.toUpperCase();
    if (degree) program.degree = degree;
    if (headOfProgram !== undefined) program.headOfProgram = headOfProgram;
    if (status) {
      program.status = status === "active" ? "active" : "inactive";
      program.isActive = status === "active";
    }

    programs[idx] = program;
    await writeJson("studyPrograms", programs);

    return sendSuccess(res, program, "Program studi berhasil diperbarui");
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/faculties/programs/:id — Delete study program
router.delete("/programs/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const programs = await readJson<StudyProgram>("studyPrograms");
    const filtered = programs.filter((p) => p.id !== req.params.id);
    if (filtered.length === programs.length) {
      return sendError(res, "Program studi tidak ditemukan", 404);
    }

    await writeJson("studyPrograms", filtered);
    return sendSuccess(res, null, "Program studi berhasil dihapus");
  } catch (err) {
    return next(err);
  }
});

export default router;
