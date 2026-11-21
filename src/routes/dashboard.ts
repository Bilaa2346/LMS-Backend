import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { readJson } from "../data/db";
import { sendSuccess } from "../utils/envelope";
import type {
  Student,
  Lecturer,
  Course,
  ClassSection,
  Enrollment,
  Semester,
  Announcement,
  CalendarEvent,
  UktBill,
  UktPayment,
} from "../models/entities";

const router = Router();

const DAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const role = req.user!.role;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const todayDay = DAY_NAMES[now.getDay()];

    const announcements = await readJson<Announcement>("announcements");
    const events = (await readJson<CalendarEvent>("calendarEvents"))
      .filter((e) => e.startDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5);

    // ADMIN
    if (role === "admin") {
      const [students, lecturers, courses, classes, payments] = await Promise.all([
        readJson<Student>("students"),
        readJson<Lecturer>("lecturers"),
        readJson<Course>("courses"),
        readJson<ClassSection>("classes"),
        readJson<UktPayment>("uktPayments"),
      ]);

      return sendSuccess(res, {
        stats: {
          students: students.length,
          lecturers: lecturers.length,
          courses: courses.length,
          classes: classes.length,
          pendingPayments: payments.filter((p) => p.status === "Menunggu Verifikasi").length,
          pendingConcentrations: 0,
          totalUktPaid: payments
            .filter((p) => p.status === "Terverifikasi")
            .reduce((sum, p) => sum + p.amount, 0),
        },
        recentAnnouncements: announcements.slice(0, 5),
        upcomingEvents: events,
      });
    }

    // LECTURER
    if (role === "lecturer") {
      const lecturerId = req.user!.refId;
      const classes = (await readJson<ClassSection>("classes")).filter(
        (c) => c.lecturerId === lecturerId
      );
      const enrollments = await readJson<Enrollment>("enrollments");
      const myClassIds = classes.map((c) => c.id);

      return sendSuccess(res, {
        stats: {
          classes: classes.length,
          students: new Set(
            enrollments
              .filter((e) => myClassIds.includes(e.classId) && e.status === "Disetujui")
              .map((e) => e.studentId)
          ).size,
          pendingKrs: enrollments.filter(
            (e) => myClassIds.includes(e.classId) && e.status === "Menunggu"
          ).length,
          ungradedSubmissions: 0,
        },
        todaySchedule: classes.filter((c) => c.day === todayDay),
        recentAnnouncements: announcements.slice(0, 5),
        upcomingEvents: events,
      });
    }

    // STUDENT
    const studentId = req.user!.refId;
    const [enrollments, classes, courses, bills, semesters] = await Promise.all([
      readJson<Enrollment>("enrollments"),
      readJson<ClassSection>("classes"),
      readJson<Course>("courses"),
      readJson<UktBill>("uktBills"),
      readJson<Semester>("semesters"),
    ]);

    const activeSemester = semesters.find((s) => s.isActive);
    const activeSemesterId = activeSemester?.id ?? "";

    const myEnrollments = enrollments.filter(
      (e) => e.studentId === studentId && e.status === "Disetujui"
    );
    const currentClasses = classes.filter(
      (c) =>
        c.semesterId === activeSemesterId &&
        myEnrollments.some((e) => e.classId === c.id)
    );
    const currentSks = currentClasses.reduce((sum, c) => {
      const course = courses.find((co) => co.id === c.courseId);
      return sum + (course?.sks ?? 0);
    }, 0);

    return sendSuccess(res, {
      stats: {
        ipk: 0, // wired in the grades milestone
        totalSks: 0, // wired in the grades milestone
        currentSks,
        attendanceRate: 0, // wired in the attendance milestone
      },
      todaySchedule: currentClasses.filter((c) => c.day === todayDay),
      upcomingDeadlines: [], // wired with assignments/quizzes
      ukt: bills.find((b) => b.studentId === studentId && b.semesterId === activeSemesterId) ?? null,
      recentAnnouncements: announcements.slice(0, 5),
      upcomingEvents: events,
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
