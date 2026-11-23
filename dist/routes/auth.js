"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../data/db");
const jwt_1 = require("../utils/jwt");
const password_1 = require("../utils/password");
const envelope_1 = require("../utils/envelope");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const isProd = process.env.NODE_ENV === "production";
const COOKIE_NAME = "lms_token";
const COOKIE_OPTS = {
    httpOnly: true,
    sameSite: (isProd ? "none" : "lax"),
    secure: isProd,
    path: "/",
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
};
function toSafeUser(user) {
    const { password: _password, ...safe } = user;
    return safe;
}
async function profileFor(user) {
    if (user.role === "student" && user.refId) {
        const students = await (0, db_1.readJson)("students");
        return students.find((s) => s.id === user.refId) ?? null;
    }
    if (user.role === "lecturer" && user.refId) {
        const lecturers = await (0, db_1.readJson)("lecturers");
        return lecturers.find((l) => l.id === user.refId) ?? null;
    }
    return null;
}
// POST /api/auth/login
router.post("/login", async (req, res, next) => {
    try {
        const parsed = zod_1.z
            .object({ email: zod_1.z.string().email(), password: zod_1.z.string().min(1) })
            .safeParse(req.body);
        if (!parsed.success) {
            return (0, envelope_1.sendError)(res, "Email dan password wajib diisi", 400);
        }
        const { email, password } = parsed.data;
        const users = await (0, db_1.readJson)("users");
        const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user || !(0, password_1.comparePassword)(password, user.password)) {
            return (0, envelope_1.sendError)(res, "Email atau password salah", 401);
        }
        // Blokir akses login jika akun user berstatus nonaktif (deactivated)
        if (user.status === "inactive" || user.isActive === false) {
            return (0, envelope_1.sendError)(res, "Akun Anda telah dinonaktifkan oleh administrator. Akses login ditolak. Silakan hubungi BAAK / pihak kampus.", 403);
        }
        const token = (0, jwt_1.signToken)({
            id: user.id,
            role: user.role,
            refId: user.refId,
            name: user.name,
            email: user.email,
        });
        res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
        const profile = await profileFor(user);
        return (0, envelope_1.sendSuccess)(res, { token, user: toSafeUser(user), profile }, "Login berhasil");
    }
    catch (err) {
        return next(err);
    }
});
// POST /api/auth/logout
router.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        sameSite: (isProd ? "none" : "lax"),
        secure: isProd,
        path: "/",
    });
    res.cookie(COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: (isProd ? "none" : "lax"),
        secure: isProd,
        path: "/",
        expires: new Date(0),
        maxAge: 0,
    });
    return (0, envelope_1.sendSuccess)(res, null, "Logout berhasil");
});
// GET /api/auth/me
router.get("/me", auth_1.requireAuth, async (req, res, next) => {
    try {
        const users = await (0, db_1.readJson)("users");
        const user = users.find((u) => u.id === req.user.id);
        if (!user) {
            return (0, envelope_1.sendError)(res, "Pengguna tidak ditemukan", 404);
        }
        if (user.status === "inactive" || user.isActive === false) {
            return (0, envelope_1.sendError)(res, "Akun Anda telah dinonaktifkan oleh administrator.", 403);
        }
        const profile = await profileFor(user);
        return (0, envelope_1.sendSuccess)(res, { user: toSafeUser(user), profile });
    }
    catch (err) {
        return next(err);
    }
});
// PUT /api/auth/password
router.put("/password", auth_1.requireAuth, async (req, res, next) => {
    try {
        const parsed = zod_1.z
            .object({
            oldPassword: zod_1.z.string().min(1),
            newPassword: zod_1.z.string().min(6),
        })
            .safeParse(req.body);
        if (!parsed.success) {
            return (0, envelope_1.sendError)(res, "Password baru minimal 6 karakter", 400);
        }
        const { oldPassword, newPassword } = parsed.data;
        const users = await (0, db_1.readJson)("users");
        const index = users.findIndex((u) => u.id === req.user.id);
        if (index === -1) {
            return (0, envelope_1.sendError)(res, "Pengguna tidak ditemukan", 404);
        }
        if (!(0, password_1.comparePassword)(oldPassword, users[index].password)) {
            return (0, envelope_1.sendError)(res, "Password lama salah", 400);
        }
        users[index].password = (0, password_1.hashPassword)(newPassword);
        await (0, db_1.writeJson)("users", users);
        return (0, envelope_1.sendSuccess)(res, null, "Password berhasil diubah");
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
