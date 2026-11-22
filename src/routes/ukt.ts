import { Router } from "express";
import { z } from "zod";
import { readJson, writeJson } from "../data/db";
import type {
  UktBill,
  UktPayment,
  Student,
  Semester,
  StudyProgram,
  AppNotification,
} from "../models/entities";
import { requireAuth } from "../middleware/auth";
import { sendSuccess, sendError } from "../utils/envelope";

const router = Router();

// GET /api/ukt - Get UKT bills and payment history
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const { status, semesterId, search } = req.query;

    const [bills, payments, students, semesters, programs] = await Promise.all([
      readJson<UktBill>("uktBills"),
      readJson<UktPayment>("uktPayments"),
      readJson<Student>("students"),
      readJson<Semester>("semesters"),
      readJson<StudyProgram>("studyPrograms"),
    ]);

    const programMap = new Map(programs.map((p) => [p.id, p.name]));
    const semesterMap = new Map(semesters.map((s) => [s.id, s.name]));
    const studentMap = new Map(students.map((s) => [s.id, s]));

    if (user.role === "student") {
      // Find current student
      const currentStudent = students.find(
        (s) => s.id === user.refId || s.email.toLowerCase() === user.email.toLowerCase()
      );

      const studentId = currentStudent ? currentStudent.id : user.refId || "";
      const myBills = bills.filter((b) => b.studentId === studentId);
      const myPayments = payments.filter((p) => p.studentId === studentId);

      const enrichedBills = myBills.map((b) => {
        const payment = myPayments.find((p) => p.billId === b.id);
        return {
          ...b,
          semesterName: semesterMap.get(b.semesterId) || b.semesterId,
          payment: payment || null,
        };
      });

      const totalAmount = enrichedBills.reduce((acc, curr) => acc + curr.amount, 0);
      const paidAmount = enrichedBills
        .filter((b) => b.status === "Lunas")
        .reduce((acc, curr) => acc + curr.amount, 0);

      return sendSuccess(res, {
        student: currentStudent
          ? {
              ...currentStudent,
              studyProgramName: programMap.get(currentStudent.studyProgramId) || "-",
            }
          : null,
        bills: enrichedBills,
        payments: myPayments,
        summary: {
          totalBills: enrichedBills.length,
          totalAmount,
          paidAmount,
          hasUnpaid: enrichedBills.some((b) => b.status !== "Lunas"),
        },
      });
    }

    // Admin & Lecturer
    let enrichedBills = bills.map((b) => {
      const student = studentMap.get(b.studentId);
      const payment = payments.find((p) => p.billId === b.id);
      return {
        ...b,
        studentName: student?.name || "Mahasiswa",
        studentNim: student?.nim || "-",
        studentEmail: student?.email || "-",
        studyProgramName: student ? programMap.get(student.studyProgramId) || "-" : "-",
        semesterName: semesterMap.get(b.semesterId) || b.semesterId,
        payment: payment || null,
      };
    });

    if (status && status !== "all") {
      enrichedBills = enrichedBills.filter(
        (b) => b.status.toLowerCase() === String(status).toLowerCase()
      );
    }

    if (semesterId && semesterId !== "all") {
      enrichedBills = enrichedBills.filter((b) => b.semesterId === semesterId);
    }

    if (search && typeof search === "string" && search.trim()) {
      const q = search.toLowerCase().trim();
      enrichedBills = enrichedBills.filter(
        (b) =>
          b.studentName.toLowerCase().includes(q) ||
          b.studentNim.toLowerCase().includes(q) ||
          b.studyProgramName.toLowerCase().includes(q)
      );
    }

    // Calculate Summary Stats
    const totalBills = bills.length;
    const lunasCount = bills.filter((b) => b.status === "Lunas").length;
    const pendingCount = bills.filter((b) => b.status === "Menunggu Verifikasi").length;
    const unpaidCount = bills.filter((b) => b.status === "Belum Bayar").length;
    const totalNominal = bills.reduce((acc, b) => acc + b.amount, 0);
    const totalCollected = bills
      .filter((b) => b.status === "Lunas")
      .reduce((acc, b) => acc + b.amount, 0);

    return sendSuccess(res, {
      bills: enrichedBills,
      payments,
      semesters,
      summary: {
        totalBills,
        lunasCount,
        pendingCount,
        unpaidCount,
        totalNominal,
        totalCollected,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/ukt/pay - Student initiates or submits payment
router.post("/pay", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const schema = z.object({
      billId: z.string().min(1),
      method: z.string().min(1),
      instantVerify: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, "Parameter pembayaran tidak valid", 400);
    }

    const { billId, method, instantVerify } = parsed.data;

    const [bills, payments, students] = await Promise.all([
      readJson<UktBill>("uktBills"),
      readJson<UktPayment>("uktPayments"),
      readJson<Student>("students"),
    ]);

    const billIndex = bills.findIndex((b) => b.id === billId);
    if (billIndex === -1) {
      return sendError(res, "Tagihan UKT tidak ditemukan", 404);
    }

    const bill = bills[billIndex];
    if (bill.status === "Lunas") {
      return sendError(res, "Tagihan UKT ini sudah lunas", 400);
    }

    const student = students.find((s) => s.id === bill.studentId);
    const nimPart = student?.nim || "101001";
    let bankCode = "8808";
    if (method.includes("Mandiri")) bankCode = "8950";
    if (method.includes("BCA")) bankCode = "1234";
    if (method.includes("BRI")) bankCode = "0020";

    const vaNumber = `${bankCode}${nimPart}`;
    const now = new Date().toISOString();
    const isInstant = !!instantVerify;

    const newPayment: UktPayment = {
      id: `pay-${Date.now()}`,
      billId: bill.id,
      studentId: bill.studentId,
      method,
      vaNumber,
      amount: bill.amount,
      status: isInstant ? "Terverifikasi" : "Menunggu Verifikasi",
      paidAt: now,
      verifiedAt: isInstant ? now : null,
      verifiedBy: isInstant ? "SYSTEM_AUTO_VERIFY" : null,
    };

    // Update or add payment record
    const existingPaymentIndex = payments.findIndex((p) => p.billId === bill.id);
    if (existingPaymentIndex !== -1) {
      payments[existingPaymentIndex] = newPayment;
    } else {
      payments.push(newPayment);
    }

    // Update bill status
    bills[billIndex] = {
      ...bill,
      status: isInstant ? "Lunas" : "Menunggu Verifikasi",
    };

    await Promise.all([
      writeJson("uktBills", bills),
      writeJson("uktPayments", payments),
    ]);

    // Send notification
    try {
      const notifs = await readJson<AppNotification>("notifications");
      notifs.unshift({
        id: `notif-${Date.now()}`,
        title: isInstant ? "Pembayaran UKT Berhasil" : "Konfirmasi Pembayaran UKT",
        message: isInstant
          ? `Pembayaran UKT sebesar Rp ${bill.amount.toLocaleString("id-ID")} melalui ${method} telah berhasil diverifikasi.`
          : `Pembayaran UKT sebesar Rp ${bill.amount.toLocaleString("id-ID")} sedang menunggu verifikasi oleh bagian keuangan BAAK.`,
        type: "ukt",
        recipientRole: "student",
        recipientUserId: user.id,
        actionUrl: "/ukt",
        createdAt: now,
        readUserIds: [],
      });
      await writeJson("notifications", notifs);
    } catch {
      // Ignore notif errors
    }

    return sendSuccess(
      res,
      { bill: bills[billIndex], payment: newPayment },
      isInstant ? "Pembayaran UKT berhasil diverifikasi" : "Konfirmasi pembayaran diterima"
    );
  } catch (err) {
    return next(err);
  }
});

// PUT /api/ukt/verify/:paymentId - Admin verifies or rejects a payment
router.put("/verify/:paymentId", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role !== "admin") {
      return sendError(res, "Hanya Administrator BAAK yang dapat memverifikasi UKT", 403);
    }

    const { paymentId } = req.params;
    const { action } = req.body; // "approve" or "reject"

    if (action !== "approve" && action !== "reject") {
      return sendError(res, "Aksi tidak valid (approve atau reject)", 400);
    }

    const [bills, payments, students] = await Promise.all([
      readJson<UktBill>("uktBills"),
      readJson<UktPayment>("uktPayments"),
      readJson<Student>("students"),
    ]);

    const paymentIndex = payments.findIndex((p) => p.id === paymentId);
    if (paymentIndex === -1) {
      return sendError(res, "Data pembayaran tidak ditemukan", 404);
    }

    const payment = payments[paymentIndex];
    const billIndex = bills.findIndex((b) => b.id === payment.billId);
    const now = new Date().toISOString();

    if (action === "approve") {
      payments[paymentIndex] = {
        ...payment,
        status: "Terverifikasi",
        verifiedAt: now,
        verifiedBy: user.id,
      };

      if (billIndex !== -1) {
        bills[billIndex] = {
          ...bills[billIndex],
          status: "Lunas",
        };
      }
    } else {
      payments[paymentIndex] = {
        ...payment,
        status: "Ditolak",
        verifiedAt: now,
        verifiedBy: user.id,
      };

      if (billIndex !== -1) {
        bills[billIndex] = {
          ...bills[billIndex],
          status: "Belum Bayar",
        };
      }
    }

    await Promise.all([
      writeJson("uktBills", bills),
      writeJson("uktPayments", payments),
    ]);

    // Send student notification
    try {
      const student = students.find((s) => s.id === payment.studentId);
      const notifs = await readJson<AppNotification>("notifications");
      notifs.unshift({
        id: `notif-${Date.now()}`,
        title: action === "approve" ? "Status UKT: LUNAS Terverifikasi" : "Status UKT: Pembayaran Ditolak",
        message: action === "approve"
          ? `Selamat! Tagihan UKT Anda telah diverifikasi Lunas oleh Biro Administrasi Akademik.`
          : `Pembayaran UKT Anda tidak dapat diverifikasi. Silakan hubungi bagian keuangan kampus atau lakukan transfer ulang.`,
        type: "ukt",
        recipientRole: "student",
        recipientUserId: student ? student.id : undefined,
        actionUrl: "/ukt",
        createdAt: now,
        readUserIds: [],
      });
      await writeJson("notifications", notifs);
    } catch {
      // Ignore notif errors
    }

    return sendSuccess(
      res,
      { payment: payments[paymentIndex], bill: billIndex !== -1 ? bills[billIndex] : null },
      action === "approve" ? "Pembayaran UKT berhasil diverifikasi" : "Pembayaran UKT ditolak"
    );
  } catch (err) {
    return next(err);
  }
});

// POST /api/ukt/bills - Admin creates or generates a new UKT bill
router.post("/bills", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    if (user.role !== "admin") {
      return sendError(res, "Hanya Administrator yang dapat membuat tagihan UKT", 403);
    }

    const schema = z.object({
      studentId: z.string().min(1),
      semesterId: z.string().min(1),
      uktGroup: z.number().min(1).max(8),
      amount: z.number().min(500000),
      dueDate: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, "Format data tagihan tidak valid", 400);
    }

    const [bills] = await Promise.all([readJson<UktBill>("uktBills")]);

    const newBill: UktBill = {
      id: `bil-${Date.now()}`,
      studentId: parsed.data.studentId,
      semesterId: parsed.data.semesterId,
      uktGroup: parsed.data.uktGroup,
      amount: parsed.data.amount,
      dueDate: parsed.data.dueDate,
      status: "Belum Bayar",
      createdAt: new Date().toISOString(),
    };

    bills.unshift(newBill);
    await writeJson("uktBills", bills);

    return sendSuccess(res, newBill, "Tagihan UKT berhasil diterbitkan", 201);
  } catch (err) {
    return next(err);
  }
});

export default router;
