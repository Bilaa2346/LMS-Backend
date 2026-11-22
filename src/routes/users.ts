import { Router } from "express";
import { z } from "zod";
import { readJson, writeJson } from "../data/db";
import type { User, Student, Lecturer } from "../models/entities";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendSuccess, sendError } from "../utils/envelope";
import { hashPassword } from "../utils/password";
import { createId } from "../utils/ids";

const router = Router();

// GET /api/users — List all users (admin only)
router.get("/", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    const [users, students, lecturers, studyPrograms] = await Promise.all([
      readJson<User>("users"),
      readJson<Student>("students"),
      readJson<Lecturer>("lecturers"),
      readJson<{ id: string; name: string }>("studyPrograms"),
    ]);

    const formatted = users.map((u) => {
      const student = u.role === "student" && u.refId ? students.find((s) => s.id === u.refId) : null;
      const lecturer = u.role === "lecturer" && u.refId ? lecturers.find((l) => l.id === u.refId) : null;

      const spId = student?.studyProgramId || lecturer?.studyProgramId;
      const prog = studyPrograms.find((sp) => sp.id === spId);
      const progName = prog?.name || (u.role === "admin" ? "Administrasi Kampus" : "Teknik Informatika");

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status || (u.isActive === false ? "inactive" : "active"),
        studentId: student?.nim,
        faculty: progName,
        studyProgram: progName,
        createdAt: u.createdAt,
      };
    });

    return sendSuccess(res, formatted);
  } catch (err) {
    return next(err);
  }
});

// POST /api/users — Create new user (admin only)
router.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(2, "Nama minimal 2 karakter"),
      email: z.string().email("Format email tidak valid"),
      role: z.enum(["admin", "student", "lecturer"]),
      status: z.enum(["active", "inactive"]).default("active"),
      password: z.string().min(6).default("Kampus123!"),
      studentId: z.string().optional(),
      faculty: z.string().optional(),
      studyProgram: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, parsed.error.errors[0]?.message || "Data user tidak valid", 400);
    }

    const users = await readJson<User>("users");
    const existing = users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
    if (existing) {
      return sendError(res, "Email sudah terdaftar dalam sistem", 400);
    }

    const now = new Date().toISOString();
    const newUser: User = {
      id: createId("usr"),
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      role: parsed.data.role,
      password: hashPassword(parsed.data.password),
      status: parsed.data.status,
      isActive: parsed.data.status === "active",
      refId: null,
      createdAt: now,
    };

    // If student, create student profile
    if (parsed.data.role === "student") {
      const students = await readJson<Student>("students");
      const newStudent: Student = {
        id: createId("stu"),
        nim: parsed.data.studentId || `2026${Math.floor(1000 + Math.random() * 9000)}`,
        name: newUser.name,
        email: newUser.email,
        studyProgramId: "sp-1",
        currentSemester: 1,
        angkatan: 2026,
        uktGroup: 3,
        status: newUser.status === "active" ? "Aktif" : "Cuti",
        advisorId: null,
        gpa: 3.5,
      };
      students.push(newStudent);
      await writeJson("students", students);
      newUser.refId = newStudent.id;
    }

    // If lecturer, create lecturer profile
    if (parsed.data.role === "lecturer") {
      const lecturers = await readJson<Lecturer>("lecturers");
      const newLecturer: Lecturer = {
        id: createId("lec"),
        nidn: `04${Math.floor(10000000 + Math.random() * 90000000)}`,
        name: newUser.name,
        email: newUser.email,
        studyProgramId: "sp-1",
        expertise: "Informatika & Basis Data",
        position: "Lektor",
      };
      lecturers.push(newLecturer);
      await writeJson("lecturers", lecturers);
      newUser.refId = newLecturer.id;
    }

    users.push(newUser);
    await writeJson("users", users);

    const { password: _p, ...safe } = newUser;
    return sendSuccess(res, safe, "User berhasil ditambahkan");
  } catch (err) {
    return next(err);
  }
});

// PUT /api/users/:id — Update user or toggle active/inactive status (admin only)
router.put("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const users = await readJson<User>("users");
    const idx = users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      return sendError(res, "Pengguna tidak ditemukan", 404);
    }

    const user = users[idx];
    const { name, email, role, status, password } = req.body;

    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (role) user.role = role;
    if (status) {
      user.status = status === "active" ? "active" : "inactive";
      user.isActive = status === "active";
    }
    if (password && password.length >= 6) {
      user.password = hashPassword(password);
    }

    users[idx] = user;
    await writeJson("users", users);

    // If student, sync status
    if (user.role === "student" && user.refId) {
      const students = await readJson<Student>("students");
      const stIdx = students.findIndex((s) => s.id === user.refId);
      if (stIdx !== -1) {
        students[stIdx].status = user.status === "active" ? "Aktif" : "Nonaktif";
        if (name) students[stIdx].name = name;
        if (email) students[stIdx].email = email;
        await writeJson("students", students);
      }
    }

    const { password: _p, ...safe } = user;
    return sendSuccess(res, safe, `Status pengguna berhasil diperbarui menjadi ${user.status}`);
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/users/:id — Delete user (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const users = await readJson<User>("users");
    const user = users.find((u) => u.id === req.params.id);
    if (!user) {
      return sendError(res, "Pengguna tidak ditemukan", 404);
    }

    if (user.id === req.user!.id) {
      return sendError(res, "Anda tidak dapat menghapus akun administrator Anda sendiri", 400);
    }

    const filtered = users.filter((u) => u.id !== req.params.id);
    await writeJson("users", filtered);

    return sendSuccess(res, null, "Pengguna berhasil dihapus");
  } catch (err) {
    return next(err);
  }
});

export default router;
