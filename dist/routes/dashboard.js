"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../data/db");
const envelope_1 = require("../utils/envelope");
const academicGrade_1 = require("../utils/academicGrade");
const router = (0, express_1.Router)();
const DAY_NAMES = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
];
router.get("/", auth_1.requireAuth, async (req, res, next) => {
    try {
        const role = req.user.role;
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const todayDay = DAY_NAMES[now.getDay()];
        const announcements = await (0, db_1.readJson)("announcements");
        const events = (await (0, db_1.readJson)("calendarEvents"))
            .filter((e) => e.startDate >= todayStr)
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .slice(0, 5);
        // ADMIN
        if (role === "admin") {
            const [students, lecturers, courses, classes, payments] = await Promise.all([
                (0, db_1.readJson)("students"),
                (0, db_1.readJson)("lecturers"),
                (0, db_1.readJson)("courses"),
                (0, db_1.readJson)("classes"),
                (0, db_1.readJson)("uktPayments"),
            ]);
            return (0, envelope_1.sendSuccess)(res, {
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
            const lecturerId = req.user.refId;
            const classes = (await (0, db_1.readJson)("classes")).filter((c) => c.lecturerId === lecturerId);
            const enrollments = await (0, db_1.readJson)("enrollments");
            const myClassIds = classes.map((c) => c.id);
            return (0, envelope_1.sendSuccess)(res, {
                stats: {
                    classes: classes.length,
                    students: new Set(enrollments
                        .filter((e) => myClassIds.includes(e.classId) && e.status === "Disetujui")
                        .map((e) => e.studentId)).size,
                    pendingKrs: enrollments.filter((e) => myClassIds.includes(e.classId) && e.status === "Menunggu").length,
                    ungradedSubmissions: 0,
                },
                todaySchedule: classes.filter((c) => c.day === todayDay),
                recentAnnouncements: announcements.slice(0, 5),
                upcomingEvents: events,
            });
        }
        // STUDENT
        const studentId = req.user.refId || "";
        const [enrollments, classes, courses, bills, semesters, academicSummary] = await Promise.all([
            (0, db_1.readJson)("enrollments"),
            (0, db_1.readJson)("classes"),
            (0, db_1.readJson)("courses"),
            (0, db_1.readJson)("uktBills"),
            (0, db_1.readJson)("semesters"),
            studentId ? (0, academicGrade_1.calculateStudentGpa)(studentId) : Promise.resolve(null),
        ]);
        const activeSemester = semesters.find((s) => s.isActive);
        const activeSemesterId = activeSemester?.id ?? "";
        const myEnrollments = enrollments.filter((e) => e.studentId === studentId && e.status === "Disetujui");
        const currentClasses = classes.filter((c) => c.semesterId === activeSemesterId &&
            myEnrollments.some((e) => e.classId === c.id));
        const currentSks = currentClasses.reduce((sum, c) => {
            const course = courses.find((co) => co.id === c.courseId);
            return sum + (course?.sks ?? 0);
        }, 0);
        return (0, envelope_1.sendSuccess)(res, {
            stats: {
                ipk: academicSummary?.gpa ?? 3.5,
                predicate: academicSummary?.predicate ?? "Sangat Memuaskan",
                totalSks: academicSummary?.totalSks ?? 21,
                currentSks: currentSks || 21,
                completedQuizzes: academicSummary?.completedQuizzesCount ?? 0,
                completedAssignments: academicSummary?.completedAssignmentsCount ?? 0,
                attendanceRate: 95,
            },
            courseGrades: academicSummary?.courseGrades ?? [],
            todaySchedule: currentClasses.filter((c) => c.day === todayDay),
            upcomingDeadlines: [],
            ukt: bills.find((b) => b.studentId === studentId && b.semesterId === activeSemesterId) ?? null,
            recentAnnouncements: announcements.slice(0, 5),
            upcomingEvents: events,
        });
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
