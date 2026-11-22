import { readJson, writeJson } from "../data/db";
import type {
  Student,
  Course,
  ClassSection,
  Enrollment,
  Submission,
  QuizAttempt,
  Quiz,
  Assignment,
} from "../models/entities";

export interface CourseGradeResult {
  courseId: string;
  courseName: string;
  sks: number;
  assignmentAvg: number | null;
  quizAvg: number | null;
  finalScore: number;
  letterGrade: "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D" | "E";
  gradePoint: number; // 0.00 to 4.00
}

export interface StudentAcademicSummary {
  studentId: string;
  gpa: number; // 0.00 - 4.00
  predicate: string;
  totalSks: number;
  completedQuizzesCount: number;
  completedAssignmentsCount: number;
  courseGrades: CourseGradeResult[];
}

/**
 * Konversi Nilai Angka (0 - 100) ke Bobot Mutu & Huruf Mutu
 * Standar Nasional Pendidikan Tinggi (SN-Dikti):
 * A   : 85 - 100 (4.00)
 * A-  : 80 - 84.99 (3.75)
 * B+  : 75 - 79.99 (3.50)
 * B   : 70 - 74.99 (3.00)
 * B-  : 65 - 69.99 (2.75)
 * C+  : 60 - 64.99 (2.50)
 * C   : 55 - 59.99 (2.00)
 * D   : 45 - 54.99 (1.00)
 * E   : < 45       (0.00)
 */
export function scoreToGrade(score: number): {
  letter: "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D" | "E";
  point: number;
} {
  if (score >= 85) return { letter: "A", point: 4.0 };
  if (score >= 80) return { letter: "A-", point: 3.75 };
  if (score >= 75) return { letter: "B+", point: 3.5 };
  if (score >= 70) return { letter: "B", point: 3.0 };
  if (score >= 65) return { letter: "B-", point: 2.75 };
  if (score >= 60) return { letter: "C+", point: 2.5 };
  if (score >= 55) return { letter: "C", point: 2.0 };
  if (score >= 45) return { letter: "D", point: 1.0 };
  return { letter: "E", point: 0.0 };
}

export function gpaToPredicate(gpa: number): string {
  if (gpa >= 3.51) return "Dengan Pujian (Cum Laude)";
  if (gpa >= 3.01) return "Sangat Memuaskan";
  if (gpa >= 2.76) return "Memuaskan";
  if (gpa >= 2.0) return "Cukup";
  return "Perlu Perbaikan Akademik";
}

/**
 * Formula Terbaik Penentuan Nilai Akhir & IPK:
 * Bobot Penilaian per Mata Kuliah:
 * - Tugas Mandiri & Terstruktur (Assignments): 40%
 * - Kuis & Ujian Evaluasi CBT (Quizzes): 60%
 *
 * Nilai Akhir Mata Kuliah = (0.40 * Nilai Tugas) + (0.60 * Nilai Kuis)
 * IPK Kumulatif = SUM(Bobot Mutu Matkul * SKS) / SUM(SKS)
 */
export async function calculateStudentGpa(studentId: string): Promise<StudentAcademicSummary> {
  const [
    students,
    courses,
    classes,
    enrollments,
    submissions,
    quizAttempts,
    quizzes,
    assignments,
  ] = await Promise.all([
    readJson<Student>("students"),
    readJson<Course>("courses"),
    readJson<ClassSection>("classes"),
    readJson<Enrollment>("enrollments"),
    readJson<Submission>("submissions"),
    readJson<QuizAttempt>("quizAttempts"),
    readJson<Quiz>("quizzes"),
    readJson<Assignment>("assignments"),
  ]);

  const student = students.find((s) => s.id === studentId);
  const baselineGpa = student?.gpa || 3.5;

  // Temukan kelas dan mata kuliah yang diambil mahasiswa
  const myEnrollments = enrollments.filter(
    (e) => e.studentId === studentId && (e.status === "Disetujui" || !e.status)
  );
  const enrolledClassIds = new Set(myEnrollments.map((e) => e.classId));
  const activeClasses = classes.filter((c) => enrolledClassIds.has(c.id));

  // Kumpulkan mata kuliah unik mahasiswa
  const courseMap = new Map<string, Course>();
  for (const cls of activeClasses) {
    const course = courses.find((co) => co.id === cls.courseId);
    if (course) {
      courseMap.set(course.id, course);
    }
  }

  // Jika belum ada mata kuliah di enrollment, gunakan courses dari prodi mahasiswa sebagai default
  if (courseMap.size === 0 && student) {
    const prodiCourses = courses.filter((c) => c.studyProgramId === student.studyProgramId);
    for (const c of prodiCourses.slice(0, 5)) {
      courseMap.set(c.id, c);
    }
  }

  // Filter pengumpulan tugas & kuis milik mahasiswa ini
  const mySubmissions = submissions.filter((s) => s.studentId === studentId);
  const myAttempts = quizAttempts.filter(
    (a) => a.studentId === studentId && a.submittedAt && a.score !== null
  );

  const courseGrades: CourseGradeResult[] = [];
  let totalWeightedPoints = 0;
  let totalSks = 0;

  for (const [courseId, course] of courseMap.entries()) {
    const sks = course.sks || 3;

    // 1. Ambil semua tugas untuk mata kuliah ini
    const courseAssignments = assignments.filter((a) => a.courseId === courseId);
    const courseAssignmentIds = new Set(courseAssignments.map((a) => a.id));
    const gradedSubs = mySubmissions.filter(
      (s) => courseAssignmentIds.has(s.assignmentId) && s.score !== null
    );

    let assignmentAvg: number | null = null;
    if (gradedSubs.length > 0) {
      const sum = gradedSubs.reduce((acc, curr) => acc + (curr.score || 0), 0);
      assignmentAvg = Math.round(sum / gradedSubs.length);
    }

    // 2. Ambil semua kuis untuk mata kuliah ini
    const courseQuizzes = quizzes.filter((q) => q.courseId === courseId);
    const courseQuizIds = new Set(courseQuizzes.map((q) => q.id));
    const submittedAttempts = myAttempts.filter((a) => courseQuizIds.has(a.quizId));

    let quizAvg: number | null = null;
    if (submittedAttempts.length > 0) {
      const sumPercentage = submittedAttempts.reduce((acc, curr) => {
        const pct = curr.maxScore > 0 ? (curr.score! / curr.maxScore) * 100 : curr.score || 0;
        return acc + pct;
      }, 0);
      quizAvg = Math.round(sumPercentage / submittedAttempts.length);
    }

    // 3. Tentukan Nilai Akhir Angka (NA)
    let finalScore: number;
    if (assignmentAvg !== null && quizAvg !== null) {
      // Pembobotan standar: 40% Tugas + 60% Kuis & Ujian CBT
      finalScore = Math.round(0.4 * assignmentAvg + 0.6 * quizAvg);
    } else if (assignmentAvg !== null) {
      finalScore = assignmentAvg;
    } else if (quizAvg !== null) {
      finalScore = quizAvg;
    } else {
      // Belum ada tugas/kuis yang dikerjakan pada matkul ini: gunakan baseline mahasiswa
      finalScore = Math.round(baselineGpa * 23.5); // contoh 3.82 -> ~90 (A)
    }

    // Pastikan batas rentang 0 - 100
    finalScore = Math.max(0, Math.min(100, finalScore));

    const { letter, point } = scoreToGrade(finalScore);

    courseGrades.push({
      courseId,
      courseName: course.name,
      sks,
      assignmentAvg,
      quizAvg,
      finalScore,
      letterGrade: letter,
      gradePoint: point,
    });

    totalWeightedPoints += point * sks;
    totalSks += sks;
  }

  // Hitung IPK Akhir
  const calculatedGpa =
    totalSks > 0 ? parseFloat((totalWeightedPoints / totalSks).toFixed(2)) : baselineGpa;

  return {
    studentId,
    gpa: calculatedGpa,
    predicate: gpaToPredicate(calculatedGpa),
    totalSks: totalSks || 21,
    completedQuizzesCount: myAttempts.length,
    completedAssignmentsCount: mySubmissions.filter((s) => s.score !== null).length,
    courseGrades,
  };
}

/**
 * Sinkronisasi otomatis IPK mahasiswa ke database `students.json`
 */
export async function syncStudentGpa(studentId: string): Promise<number> {
  try {
    const summary = await calculateStudentGpa(studentId);
    const students = await readJson<Student>("students");
    const idx = students.findIndex((s) => s.id === studentId);
    if (idx !== -1) {
      students[idx].gpa = summary.gpa;
      await writeJson("students", students);
    }
    return summary.gpa;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Gagal sinkronisasi IPK mahasiswa:", err);
    return 3.5;
  }
}
