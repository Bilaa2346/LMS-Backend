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
    const [users, students, lecturers, studyPrograms, faculties] = await Promise.all([
      readJson<User>("users"),
      readJson<Student>("students"),
      readJson<Lecturer>("lecturers"),
      readJson<{ id: string; facultyId: string; name: string }>("studyPrograms"),
      readJson<{ id: string; name: string }>("faculties"),
    ]);

    const formatted = users.map((u) => {
      const student = u.role === "student" && u.refId ? students.find((s) => s.id === u.refId) : null;
      const lecturer = u.role === "lecturer" && u.refId ? lecturers.find((l) => l.id === u.refId) : null;

      const spId = student?.studyProgramId || lecturer?.studyProgramId;
      const prog = studyPrograms.find((sp) => sp.id === spId);
      const fac = prog ? faculties.find((f) => f.id === prog.facultyId) : null;
      const progName = prog?.name || (u.role === "admin" ? "Administrasi Kampus" : "Teknik Informatika");
      const facName = fac?.name || (u.role === "admin" ? "Biro Rektorat" : "Fakultas Ilmu Komputer");

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status || (u.isActive === false ? "inactive" : "active"),
        studentId: student?.nim || lecturer?.nidn,
        nidn: lecturer?.nidn,
        faculty: facName,
        studyProgram: progName,
        studyProgramId: spId,
        currentSemester: student?.currentSemester,
        angkatan: student?.angkatan,
        uktGroup: student?.uktGroup,
        position: lecturer?.position,
        expertise: lecturer?.expertise,
        refId: u.refId,
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
      password: z.string().min(6, "Password minimal 6 karakter").default("Kampus123!"),
      studentId: z.string().optional(),
      nim: z.string().optional(),
      nidn: z.string().optional(),
      faculty: z.string().optional(),
      studyProgram: z.string().optional(),
      studyProgramId: z.string().optional(),
      angkatan: z.coerce.number().optional(),
      currentSemester: z.coerce.number().optional(),
      uktGroup: z.coerce.number().optional(),
      position: z.string().optional(),
      expertise: z.string().optional(),
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

    // Determine target study program
    const studyPrograms = await readJson<{ id: string; facultyId: string; name: string }>("studyPrograms");
    let chosenSpId = parsed.data.studyProgramId;
    if (!chosenSpId && parsed.data.studyProgram) {
      const match = studyPrograms.find(
        (sp) => sp.name.toLowerCase() === parsed.data.studyProgram?.toLowerCase() || sp.id === parsed.data.studyProgram
      );
      if (match) chosenSpId = match.id;
    }
    if (!chosenSpId && studyPrograms.length > 0) {
      chosenSpId = studyPrograms[0].id;
    }

    const now = new Date().toISOString();
    const plainPassword = parsed.data.password?.trim() || "Kampus123!";
    const newUser: User = {
      id: createId("usr"),
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      role: parsed.data.role,
      password: hashPassword(plainPassword),
      status: parsed.data.status,
      isActive: parsed.data.status === "active",
      refId: null,
      createdAt: now,
    };

    // If student, create student profile & initialize enrollment and UKT bill
    if (parsed.data.role === "student") {
      const students = await readJson<Student>("students");
      const nim =
        parsed.data.studentId?.trim() ||
        parsed.data.nim?.trim() ||
        `2026${Math.floor(100000 + Math.random() * 900000)}`;

      const newStudent: Student = {
        id: createId("stu"),
        nim,
        name: newUser.name,
        email: newUser.email,
        studyProgramId: chosenSpId || "sp-1",
        currentSemester: parsed.data.currentSemester || 1,
        angkatan: parsed.data.angkatan || 2026,
        uktGroup: parsed.data.uktGroup || 3,
        status: newUser.status === "active" ? "Aktif" : "Cuti",
        advisorId: "lec-1",
        gpa: 3.5,
        phone: "0812-3456-7890",
      };
      students.push(newStudent);
      await writeJson("students", students);
      newUser.refId = newStudent.id;

      // Auto-generate initial UKT bill for this student
      try {
        const uktBills = await readJson<any>("uktBills");
        const uktAmounts: Record<number, number> = {
          1: 500000,
          2: 1000000,
          3: 2500000,
          4: 4000000,
          5: 5500000,
          6: 7000000,
          7: 8500000,
          8: 10000000,
        };
        const newBill = {
          id: createId("bil"),
          studentId: newStudent.id,
          semesterId: "sem-1",
          uktGroup: newStudent.uktGroup,
          amount: uktAmounts[newStudent.uktGroup] || 2500000,
          dueDate: "2026-12-31",
          status: "Belum Bayar",
          createdAt: now,
        };
        uktBills.push(newBill);
        await writeJson("uktBills", uktBills);
      } catch (e) {
        // Continue if uktBills write fails
      }

      // Auto-enroll student into foundational classes (cls-1, cls-2)
      try {
        const enrollments = await readJson<any>("enrollments");
        enrollments.push(
          {
            id: createId("enr"),
            studentId: newStudent.id,
            classId: "cls-1",
            semesterId: "sem-1",
            status: "Disetujui",
            createdAt: now,
          },
          {
            id: createId("enr"),
            studentId: newStudent.id,
            classId: "cls-2",
            semesterId: "sem-1",
            status: "Disetujui",
            createdAt: now,
          }
        );
        await writeJson("enrollments", enrollments);
      } catch (e) {
        // Continue if enrollments write fails
      }
    }

    // If lecturer, create lecturer profile
    if (parsed.data.role === "lecturer") {
      const lecturers = await readJson<Lecturer>("lecturers");
      const nidn =
        parsed.data.nidn?.trim() ||
        parsed.data.studentId?.trim() ||
        `00${Math.floor(10000000 + Math.random() * 90000000)}`;

      const newLecturer: Lecturer = {
        id: createId("lec"),
        nidn,
        name: newUser.name,
        email: newUser.email,
        studyProgramId: chosenSpId || "sp-1",
        expertise: parsed.data.expertise?.trim() || "Informatika & Basis Data",
        position: parsed.data.position?.trim() || "Lektor",
      };
      lecturers.push(newLecturer);
      await writeJson("lecturers", lecturers);
      newUser.refId = newLecturer.id;
    }

    users.push(newUser);
    await writeJson("users", users);

    const { password: _p, ...safe } = newUser;
    return sendSuccess(res, safe, "Akun pengguna berhasil dibuat dan dapat langsung digunakan untuk login");
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
    const {
      name,
      email,
      role,
      status,
      password,
      studentId,
      nim,
      nidn,
      studyProgramId,
      currentSemester,
      angkatan,
      uktGroup,
      position,
      expertise,
    } = req.body;

    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (role) user.role = role;
    if (status) {
      user.status = status === "active" ? "active" : "inactive";
      user.isActive = status === "active";
    }
    if (password && typeof password === "string" && password.trim().length >= 6) {
      user.password = hashPassword(password.trim());
    }

    // Sync student profile if applicable
    if (user.role === "student" && user.refId) {
      const students = await readJson<Student>("students");
      const stIdx = students.findIndex((s) => s.id === user.refId);
      if (stIdx !== -1) {
        if (status) students[stIdx].status = user.status === "active" ? "Aktif" : "Nonaktif";
        if (name) students[stIdx].name = name;
        if (email) students[stIdx].email = email;
        if (studentId || nim) students[stIdx].nim = (studentId || nim).trim();
        if (studyProgramId) students[stIdx].studyProgramId = studyProgramId;
        if (currentSemester) students[stIdx].currentSemester = Number(currentSemester);
        if (angkatan) students[stIdx].angkatan = Number(angkatan);
        if (uktGroup) students[stIdx].uktGroup = Number(uktGroup);
        await writeJson("students", students);
      }
    }

    // Sync lecturer profile if applicable
    if (user.role === "lecturer" && user.refId) {
      const lecturers = await readJson<Lecturer>("lecturers");
      const lecIdx = lecturers.findIndex((l) => l.id === user.refId);
      if (lecIdx !== -1) {
        if (name) lecturers[lecIdx].name = name;
        if (email) lecturers[lecIdx].email = email;
        if (nidn || studentId) lecturers[lecIdx].nidn = (nidn || studentId).trim();
        if (studyProgramId) lecturers[lecIdx].studyProgramId = studyProgramId;
        if (position) lecturers[lecIdx].position = position;
        if (expertise) lecturers[lecIdx].expertise = expertise;
        await writeJson("lecturers", lecturers);
      }
    }

    users[idx] = user;
    await writeJson("users", users);

    const { password: _p, ...safe } = user;
    return sendSuccess(res, safe, `Data pengguna ${user.name} berhasil diperbarui`);
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

    // Clean up related student / lecturer profile
    if (user.refId) {
      if (user.role === "student") {
        const students = await readJson<Student>("students");
        await writeJson("students", students.filter((s) => s.id !== user.refId));

        // Clean up enrollments and bills
        try {
          const enrollments = await readJson<any>("enrollments");
          await writeJson("enrollments", enrollments.filter((e: any) => e.studentId !== user.refId));
          const bills = await readJson<any>("uktBills");
          await writeJson("uktBills", bills.filter((b: any) => b.studentId !== user.refId));
        } catch {
          // ignore
        }
      } else if (user.role === "lecturer") {
        const lecturers = await readJson<Lecturer>("lecturers");
        await writeJson("lecturers", lecturers.filter((l) => l.id !== user.refId));
      }
    }

    const filtered = users.filter((u) => u.id !== req.params.id);
    await writeJson("users", filtered);

    return sendSuccess(res, null, "Pengguna berhasil dihapus");
  } catch (err) {
    return next(err);
  }
});

export default router;
