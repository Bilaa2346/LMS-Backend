"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../data/db");
const auth_1 = require("../middleware/auth");
const envelope_1 = require("../utils/envelope");
const password_1 = require("../utils/password");
const ids_1 = require("../utils/ids");
const router = (0, express_1.Router)();
// GET /api/users — List all users (admin only)
router.get("/", auth_1.requireAuth, (0, auth_1.requireRole)("admin"), async (_req, res, next) => {
    try {
        const [users, students, lecturers, studyPrograms, faculties] = await Promise.all([
            (0, db_1.readJson)("users"),
            (0, db_1.readJson)("students"),
            (0, db_1.readJson)("lecturers"),
            (0, db_1.readJson)("studyPrograms"),
            (0, db_1.readJson)("faculties"),
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
        return (0, envelope_1.sendSuccess)(res, formatted);
    }
    catch (err) {
        return next(err);
    }
});
// POST /api/users — Create new user (admin only)
router.post("/", auth_1.requireAuth, (0, auth_1.requireRole)("admin"), async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(2, "Nama minimal 2 karakter"),
            email: zod_1.z.string().email("Format email tidak valid"),
            role: zod_1.z.enum(["admin", "student", "lecturer"]),
            status: zod_1.z.enum(["active", "inactive"]).default("active"),
            password: zod_1.z.string().min(6, "Password minimal 6 karakter").default("Kampus123!"),
            studentId: zod_1.z.string().optional(),
            nim: zod_1.z.string().optional(),
            nidn: zod_1.z.string().optional(),
            faculty: zod_1.z.string().optional(),
            studyProgram: zod_1.z.string().optional(),
            studyProgramId: zod_1.z.string().optional(),
            angkatan: zod_1.z.coerce.number().optional(),
            currentSemester: zod_1.z.coerce.number().optional(),
            uktGroup: zod_1.z.coerce.number().optional(),
            position: zod_1.z.string().optional(),
            expertise: zod_1.z.string().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return (0, envelope_1.sendError)(res, parsed.error.errors[0]?.message || "Data user tidak valid", 400);
        }
        const users = await (0, db_1.readJson)("users");
        const existing = users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
        if (existing) {
            return (0, envelope_1.sendError)(res, "Email sudah terdaftar dalam sistem", 400);
        }
        // Determine target study program
        const studyPrograms = await (0, db_1.readJson)("studyPrograms");
        let chosenSpId = parsed.data.studyProgramId;
        if (!chosenSpId && parsed.data.studyProgram) {
            const match = studyPrograms.find((sp) => sp.name.toLowerCase() === parsed.data.studyProgram?.toLowerCase() || sp.id === parsed.data.studyProgram);
            if (match)
                chosenSpId = match.id;
        }
        if (!chosenSpId && studyPrograms.length > 0) {
            chosenSpId = studyPrograms[0].id;
        }
        const now = new Date().toISOString();
        const plainPassword = parsed.data.password?.trim() || "Kampus123!";
        const newUser = {
            id: (0, ids_1.createId)("usr"),
            email: parsed.data.email.toLowerCase(),
            name: parsed.data.name,
            role: parsed.data.role,
            password: (0, password_1.hashPassword)(plainPassword),
            status: parsed.data.status,
            isActive: parsed.data.status === "active",
            refId: null,
            createdAt: now,
        };
        // If student, create student profile & initialize enrollment and UKT bill
        if (parsed.data.role === "student") {
            const students = await (0, db_1.readJson)("students");
            const nim = parsed.data.studentId?.trim() ||
                parsed.data.nim?.trim() ||
                `2026${Math.floor(100000 + Math.random() * 900000)}`;
            const newStudent = {
                id: (0, ids_1.createId)("stu"),
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
            await (0, db_1.writeJson)("students", students);
            newUser.refId = newStudent.id;
            // Auto-generate initial UKT bill for this student
            try {
                const uktBills = await (0, db_1.readJson)("uktBills");
                const uktAmounts = {
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
                    id: (0, ids_1.createId)("bil"),
                    studentId: newStudent.id,
                    semesterId: "sem-1",
                    uktGroup: newStudent.uktGroup,
                    amount: uktAmounts[newStudent.uktGroup] || 2500000,
                    dueDate: "2026-12-31",
                    status: "Belum Bayar",
                    createdAt: now,
                };
                uktBills.push(newBill);
                await (0, db_1.writeJson)("uktBills", uktBills);
            }
            catch (e) {
                // Continue if uktBills write fails
            }
            // Auto-enroll student into foundational classes (cls-1, cls-2)
            try {
                const enrollments = await (0, db_1.readJson)("enrollments");
                enrollments.push({
                    id: (0, ids_1.createId)("enr"),
                    studentId: newStudent.id,
                    classId: "cls-1",
                    semesterId: "sem-1",
                    status: "Disetujui",
                    createdAt: now,
                }, {
                    id: (0, ids_1.createId)("enr"),
                    studentId: newStudent.id,
                    classId: "cls-2",
                    semesterId: "sem-1",
                    status: "Disetujui",
                    createdAt: now,
                });
                await (0, db_1.writeJson)("enrollments", enrollments);
            }
            catch (e) {
                // Continue if enrollments write fails
            }
        }
        // If lecturer, create lecturer profile
        if (parsed.data.role === "lecturer") {
            const lecturers = await (0, db_1.readJson)("lecturers");
            const nidn = parsed.data.nidn?.trim() ||
                parsed.data.studentId?.trim() ||
                `00${Math.floor(10000000 + Math.random() * 90000000)}`;
            const newLecturer = {
                id: (0, ids_1.createId)("lec"),
                nidn,
                name: newUser.name,
                email: newUser.email,
                studyProgramId: chosenSpId || "sp-1",
                expertise: parsed.data.expertise?.trim() || "Informatika & Basis Data",
                position: parsed.data.position?.trim() || "Lektor",
            };
            lecturers.push(newLecturer);
            await (0, db_1.writeJson)("lecturers", lecturers);
            newUser.refId = newLecturer.id;
        }
        users.push(newUser);
        await (0, db_1.writeJson)("users", users);
        const { password: _p, ...safe } = newUser;
        return (0, envelope_1.sendSuccess)(res, safe, "Akun pengguna berhasil dibuat dan dapat langsung digunakan untuk login");
    }
    catch (err) {
        return next(err);
    }
});
// PUT /api/users/:id — Update user or toggle active/inactive status (admin only)
router.put("/:id", auth_1.requireAuth, (0, auth_1.requireRole)("admin"), async (req, res, next) => {
    try {
        const users = await (0, db_1.readJson)("users");
        const idx = users.findIndex((u) => u.id === req.params.id);
        if (idx === -1) {
            return (0, envelope_1.sendError)(res, "Pengguna tidak ditemukan", 404);
        }
        const user = users[idx];
        const { name, email, role, status, password, studentId, nim, nidn, studyProgramId, currentSemester, angkatan, uktGroup, position, expertise, } = req.body;
        if (name)
            user.name = name;
        if (email)
            user.email = email.toLowerCase();
        if (role)
            user.role = role;
        if (status) {
            user.status = status === "active" ? "active" : "inactive";
            user.isActive = status === "active";
        }
        if (password && typeof password === "string" && password.trim().length >= 6) {
            user.password = (0, password_1.hashPassword)(password.trim());
        }
        // Sync student profile if applicable
        if (user.role === "student" && user.refId) {
            const students = await (0, db_1.readJson)("students");
            const stIdx = students.findIndex((s) => s.id === user.refId);
            if (stIdx !== -1) {
                if (status)
                    students[stIdx].status = user.status === "active" ? "Aktif" : "Nonaktif";
                if (name)
                    students[stIdx].name = name;
                if (email)
                    students[stIdx].email = email;
                if (studentId || nim)
                    students[stIdx].nim = (studentId || nim).trim();
                if (studyProgramId)
                    students[stIdx].studyProgramId = studyProgramId;
                if (currentSemester)
                    students[stIdx].currentSemester = Number(currentSemester);
                if (angkatan)
                    students[stIdx].angkatan = Number(angkatan);
                if (uktGroup)
                    students[stIdx].uktGroup = Number(uktGroup);
                await (0, db_1.writeJson)("students", students);
            }
        }
        // Sync lecturer profile if applicable
        if (user.role === "lecturer" && user.refId) {
            const lecturers = await (0, db_1.readJson)("lecturers");
            const lecIdx = lecturers.findIndex((l) => l.id === user.refId);
            if (lecIdx !== -1) {
                if (name)
                    lecturers[lecIdx].name = name;
                if (email)
                    lecturers[lecIdx].email = email;
                if (nidn || studentId)
                    lecturers[lecIdx].nidn = (nidn || studentId).trim();
                if (studyProgramId)
                    lecturers[lecIdx].studyProgramId = studyProgramId;
                if (position)
                    lecturers[lecIdx].position = position;
                if (expertise)
                    lecturers[lecIdx].expertise = expertise;
                await (0, db_1.writeJson)("lecturers", lecturers);
            }
        }
        users[idx] = user;
        await (0, db_1.writeJson)("users", users);
        const { password: _p, ...safe } = user;
        return (0, envelope_1.sendSuccess)(res, safe, `Data pengguna ${user.name} berhasil diperbarui`);
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /api/users/:id — Delete user (admin only)
router.delete("/:id", auth_1.requireAuth, (0, auth_1.requireRole)("admin"), async (req, res, next) => {
    try {
        const users = await (0, db_1.readJson)("users");
        const user = users.find((u) => u.id === req.params.id);
        if (!user) {
            return (0, envelope_1.sendError)(res, "Pengguna tidak ditemukan", 404);
        }
        if (user.id === req.user.id) {
            return (0, envelope_1.sendError)(res, "Anda tidak dapat menghapus akun administrator Anda sendiri", 400);
        }
        // Clean up related student / lecturer profile
        if (user.refId) {
            if (user.role === "student") {
                const students = await (0, db_1.readJson)("students");
                await (0, db_1.writeJson)("students", students.filter((s) => s.id !== user.refId));
                // Clean up enrollments and bills
                try {
                    const enrollments = await (0, db_1.readJson)("enrollments");
                    await (0, db_1.writeJson)("enrollments", enrollments.filter((e) => e.studentId !== user.refId));
                    const bills = await (0, db_1.readJson)("uktBills");
                    await (0, db_1.writeJson)("uktBills", bills.filter((b) => b.studentId !== user.refId));
                }
                catch {
                    // ignore
                }
            }
            else if (user.role === "lecturer") {
                const lecturers = await (0, db_1.readJson)("lecturers");
                await (0, db_1.writeJson)("lecturers", lecturers.filter((l) => l.id !== user.refId));
            }
        }
        const filtered = users.filter((u) => u.id !== req.params.id);
        await (0, db_1.writeJson)("users", filtered);
        return (0, envelope_1.sendSuccess)(res, null, "Pengguna berhasil dihapus");
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
