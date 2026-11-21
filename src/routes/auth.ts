import { Router } from "express";
import { z } from "zod";
import { readJson, writeJson } from "../data/db";
import type { User, Student, Lecturer, SafeUser } from "../models/entities";
import { signToken } from "../utils/jwt";
import { hashPassword, comparePassword } from "../utils/password";
import { sendSuccess, sendError } from "../utils/envelope";
import { requireAuth } from "../middleware/auth";

const router = Router();

const isProd = process.env.NODE_ENV === "production";
const COOKIE_NAME = "lms_token";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  secure: isProd,
  path: "/",
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
};

function toSafeUser(user: User): SafeUser {
  const { password: _password, ...safe } = user;
  return safe;
}

async function profileFor(user: User): Promise<Student | Lecturer | null> {
  if (user.role === "student" && user.refId) {
    const students = await readJson<Student>("students");
    return students.find((s) => s.id === user.refId) ?? null;
  }
  if (user.role === "lecturer" && user.refId) {
    const lecturers = await readJson<Lecturer>("lecturers");
    return lecturers.find((l) => l.id === user.refId) ?? null;
  }
  return null;
}

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const parsed = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, "Email dan password wajib diisi", 400);
    }

    const { email, password } = parsed.data;
    const users = await readJson<User>("users");
    const user = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

    if (!user || !comparePassword(password, user.password)) {
      return sendError(res, "Email atau password salah", 401);
    }

    const token = signToken({
      id: user.id,
      role: user.role,
      refId: user.refId,
      name: user.name,
      email: user.email,
    });

    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);

    const profile = await profileFor(user);
    return sendSuccess(res, { token, user: toSafeUser(user), profile }, "Login berhasil");
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    secure: isProd,
    path: "/",
  });
  res.cookie(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    secure: isProd,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return sendSuccess(res, null, "Logout berhasil");
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const users = await readJson<User>("users");
    const user = users.find((u) => u.id === req.user!.id);
    if (!user) {
      return sendError(res, "Pengguna tidak ditemukan", 404);
    }
    const profile = await profileFor(user);
    return sendSuccess(res, { user: toSafeUser(user), profile });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/auth/password
router.put("/password", requireAuth, async (req, res, next) => {
  try {
    const parsed = z
      .object({
        oldPassword: z.string().min(1),
        newPassword: z.string().min(6),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return sendError(res, "Password baru minimal 6 karakter", 400);
    }

    const { oldPassword, newPassword } = parsed.data;
    const users = await readJson<User>("users");
    const index = users.findIndex((u) => u.id === req.user!.id);
    if (index === -1) {
      return sendError(res, "Pengguna tidak ditemukan", 404);
    }
    if (!comparePassword(oldPassword, users[index].password)) {
      return sendError(res, "Password lama salah", 400);
    }

    users[index].password = hashPassword(newPassword);
    await writeJson("users", users);
    return sendSuccess(res, null, "Password berhasil diubah");
  } catch (err) {
    return next(err);
  }
});

export default router;
