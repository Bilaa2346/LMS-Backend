import { writeJson } from "../data/db";
import { hashPassword } from "../utils/password";
import type {
  User,
  Faculty,
  StudyProgram,
  Semester,
  Course,
  ClassSection,
  Enrollment,
  Student,
  Lecturer,
  Announcement,
  CalendarEvent,
  UktBill,
  UktPayment,
  Quiz,
  QuizAttempt,
  Assignment,
  Submission,
  AppNotification,
} from "../models/entities";

export async function seedDatabase() {
  const now = new Date().toISOString();

  const faculties: Faculty[] = [
    { id: "fac-1", code: "FIK", name: "Fakultas Ilmu Komputer" },
    { id: "fac-2", code: "FEB", name: "Fakultas Ekonomi dan Bisnis" },
  ];

  const studyPrograms: StudyProgram[] = [
    { id: "sp-1", facultyId: "fac-1", code: "IF", name: "Teknik Informatika", degree: "S1" },
    { id: "sp-2", facultyId: "fac-1", code: "SI", name: "Sistem Informasi", degree: "S1" },
  ];

  const semesters: Semester[] = [
    {
      id: "sem-1",
      name: "Ganjil 2026/2027",
      year: "2026/2027",
      term: "Ganjil",
      startDate: "2026-09-01",
      endDate: "2027-01-31",
      isActive: true,
      krsOpen: true,
    },
  ];

  const lecturers: Lecturer[] = [
    {
      id: "lec-1",
      nidn: "0010010001",
      name: "Dr. Budi Santoso, M.Kom.",
      email: "dosen@kampus.ac.id",
      studyProgramId: "sp-1",
      expertise: "Pemrograman & Algoritma",
      position: "Lektor",
    },
    {
      id: "lec-2",
      nidn: "0020020002",
      name: "Dr. Siti Rahmawati, M.T.",
      email: "dosen2@kampus.ac.id",
      studyProgramId: "sp-2",
      expertise: "Sistem Informasi",
      position: "Lektor",
    },
  ];

  const students: Student[] = [
    {
      id: "stu-1",
      nim: "2023101001",
      name: "Andi Pratama",
      email: "mahasiswa@kampus.ac.id",
      studyProgramId: "sp-1",
      currentSemester: 7,
      angkatan: 2023,
      uktGroup: 3,
      status: "Aktif",
      advisorId: "lec-1",
    },
    {
      id: "stu-2",
      nim: "2023102002",
      name: "Dewi Lestari",
      email: "mahasiswa2@kampus.ac.id",
      studyProgramId: "sp-2",
      currentSemester: 5,
      angkatan: 2023,
      uktGroup: 4,
      status: "Aktif",
      advisorId: "lec-2",
    },
  ];

  const courses: Course[] = [
    {
      id: "crs-1",
      code: "IF101",
      name: "Pemrograman Dasar",
      sks: 3,
      studyProgramId: "sp-1",
      type: "Wajib",
      description: "Dasar pemrograman, algoritma, dan logika.",
    },
    {
      id: "crs-2",
      code: "IF202",
      name: "Struktur Data",
      sks: 3,
      studyProgramId: "sp-1",
      type: "Wajib",
      description: "Array, linked list, stack, queue, tree, graph.",
    },
    {
      id: "crs-3",
      code: "SI101",
      name: "Dasar Sistem Informasi",
      sks: 3,
      studyProgramId: "sp-2",
      type: "Wajib",
      description: "Pengantar sistem informasi dan organisasi.",
    },
  ];

  const classes: ClassSection[] = [
    {
      id: "cls-1",
      courseId: "crs-1",
      lecturerId: "lec-1",
      semesterId: "sem-1",
      name: "A",
      day: "Senin",
      startTime: "08:00",
      endTime: "10:00",
      room: "R-101",
      capacity: 40,
    },
    {
      id: "cls-2",
      courseId: "crs-2",
      lecturerId: "lec-2",
      semesterId: "sem-1",
      name: "A",
      day: "Selasa",
      startTime: "10:00",
      endTime: "12:00",
      room: "R-102",
      capacity: 35,
    },
    {
      id: "cls-3",
      courseId: "crs-3",
      lecturerId: "lec-2",
      semesterId: "sem-1",
      name: "A",
      day: "Rabu",
      startTime: "13:00",
      endTime: "15:00",
      room: "R-103",
      capacity: 40,
    },
  ];

  const enrollments: Enrollment[] = [
    { id: "enr-1", studentId: "stu-1", classId: "cls-1", semesterId: "sem-1", status: "Disetujui", createdAt: now },
    { id: "enr-2", studentId: "stu-1", classId: "cls-2", semesterId: "sem-1", status: "Disetujui", createdAt: now },
    { id: "enr-3", studentId: "stu-2", classId: "cls-3", semesterId: "sem-1", status: "Menunggu", createdAt: now },
  ];

  const announcements: Announcement[] = [
    {
      id: "ann-1",
      title: "Selamat Datang Semester Ganjil 2026/2027",
      content: "Perkuliahan dimulai 1 September 2026. Selamat belajar!",
      target: "semua",
      authorUserId: "usr-admin",
      createdAt: now,
    },
    {
      id: "ann-2",
      title: "Jadwal UTS",
      content: "UTS dilaksanakan pada minggu ke-8 semester.",
      target: "mahasiswa",
      authorUserId: "usr-admin",
      createdAt: now,
    },
  ];

  const calendarEvents: CalendarEvent[] = [
    { id: "cal-1", title: "Pembukaan KRS", description: "Periode KRS dibuka", startDate: "2026-09-01", endDate: "2026-09-15", category: "KRS", semesterId: "sem-1" },
    { id: "cal-2", title: "Ujian Tengah Semester", description: "UTS", startDate: "2026-11-02", endDate: "2026-11-09", category: "Ujian", semesterId: "sem-1" },
    { id: "cal-3", title: "Libur Nasional", description: "Hari libur", startDate: "2026-12-25", endDate: "2026-12-25", category: "Libur", semesterId: "sem-1" },
  ];

  const uktBills: UktBill[] = [
    { id: "bil-1", studentId: "stu-1", semesterId: "sem-1", uktGroup: 3, amount: 2500000, dueDate: "2026-10-15", status: "Lunas", createdAt: now },
    { id: "bil-2", studentId: "stu-2", semesterId: "sem-1", uktGroup: 4, amount: 4000000, dueDate: "2026-10-15", status: "Belum Bayar", createdAt: now },
  ];

  const uktPayments: UktPayment[] = [
    {
      id: "pay-1",
      billId: "bil-1",
      studentId: "stu-1",
      method: "Virtual Account BNI",
      vaNumber: "88082023101001",
      amount: 2500000,
      status: "Terverifikasi",
      paidAt: "2026-09-20",
      verifiedAt: "2026-09-22",
      verifiedBy: "usr-admin",
    },
  ];

  const users: User[] = [
    { id: "usr-admin", email: "admin@kampus.ac.id", password: hashPassword("password123"), role: "admin", name: "Admin BAAK", refId: null, createdAt: now },
    { id: "usr-lec-1", email: "dosen@kampus.ac.id", password: hashPassword("password123"), role: "lecturer", name: "Dr. Budi Santoso, M.Kom.", refId: "lec-1", createdAt: now },
    { id: "usr-lec-2", email: "dosen2@kampus.ac.id", password: hashPassword("password123"), role: "lecturer", name: "Dr. Siti Rahmawati, M.T.", refId: "lec-2", createdAt: now },
    { id: "usr-stu-1", email: "mahasiswa@kampus.ac.id", password: hashPassword("password123"), role: "student", name: "Andi Pratama", refId: "stu-1", createdAt: now },
    { id: "usr-stu-2", email: "mahasiswa2@kampus.ac.id", password: hashPassword("password123"), role: "student", name: "Dewi Lestari", refId: "stu-2", createdAt: now },
  ];

  const quizzes: Quiz[] = [
    {
      id: "qiz-1",
      courseId: "crs-1",
      courseName: "Pemrograman Dasar",
      studyProgramId: "sp-1",
      studyProgramName: "Teknik Informatika",
      lecturerId: "lec-1",
      lecturerName: "Dr. Budi Santoso, M.Kom.",
      title: "Kuis 1: Konsep Dasar Pemrograman & Algoritma",
      type: "Kuis",
      description: "Kuis pengantar logika pemrograman dan struktur kontrol alur program.",
      startAt: "2026-09-10T08:00:00.000Z",
      endAt: "2027-01-31T23:59:59.000Z",
      durationMinutes: 30,
      published: true,
      questions: [
        {
          id: "qst-1",
          text: "Manakah di bawah ini yang merupakan tipe data untuk bilangan bulat dalam pemrograman?",
          options: ["float", "int", "char", "boolean"],
          answerIndex: 1,
          points: 20,
        },
        {
          id: "qst-2",
          text: "Struktur kontrol percabangan dalam bahasa C / Java menggunakan kata kunci?",
          options: ["loop", "if - else", "function", "class"],
          answerIndex: 1,
          points: 20,
        },
        {
          id: "qst-3",
          text: "Kompleksitas waktu terbaik dari pencarian Binary Search pada array terurut adalah?",
          options: ["O(1)", "O(n)", "O(log n)", "O(n^2)"],
          answerIndex: 0,
          points: 20,
        },
        {
          id: "qst-4",
          text: "Operasi LIFO (Last In First Out) merupakan prinsip kerja struktur data apa?",
          options: ["Queue", "Stack", "Tree", "Graph"],
          answerIndex: 1,
          points: 20,
        },
        {
          id: "qst-5",
          text: "Manakah yang BUKAN merupakan 4 pilar utama Pemrograman Berorientasi Objek (OOP)?",
          options: ["Encapsulation", "Inheritance", "Compilation", "Polymorphism"],
          answerIndex: 2,
          points: 20,
        },
      ],
      createdAt: now,
    },
    {
      id: "qiz-2",
      courseId: "crs-2",
      courseName: "Struktur Data",
      studyProgramId: "sp-1",
      studyProgramName: "Teknik Informatika",
      lecturerId: "lec-1",
      lecturerName: "Dr. Budi Santoso, M.Kom.",
      title: "UTS: Struktur Data & Kompleksitas Algoritma",
      type: "UTS",
      description: "Ujian Tengah Semester menguji Linked List, Stack, Queue, dan Tree.",
      startAt: "2026-11-01T08:00:00.000Z",
      endAt: "2027-01-31T23:59:59.000Z",
      durationMinutes: 60,
      published: true,
      questions: [
        {
          id: "qst-6",
          text: "Struktur data linier yang elemen-elemennya terhubung melalui pointer disebut?",
          options: ["Linked List", "Array Statis", "Hash Map", "Binary Heap"],
          answerIndex: 0,
          points: 25,
        },
        {
          id: "qst-7",
          text: "Operasi penambahan elemen pada Queue disebut?",
          options: ["Push", "Enqueue", "Pop", "Dequeue"],
          answerIndex: 1,
          points: 25,
        },
        {
          id: "qst-8",
          text: "Traversal pada binary tree yang mengunjungi Root kemudian Left lalu Right adalah?",
          options: ["Inorder", "Postorder", "Preorder", "Level-order"],
          answerIndex: 2,
          points: 25,
        },
        {
          id: "qst-9",
          text: "Keuntungan utama dari Doubly Linked List dibandingkan Singly Linked List adalah?",
          options: [
            "Membutuhkan memori lebih sedikit",
            "Dapat ditelusuri dua arah (maju dan mundur)",
            "Tidak memerlukan pointer",
            "Akses elemen acak O(1)",
          ],
          answerIndex: 1,
          points: 25,
        },
      ],
      createdAt: now,
    },
  ];

  const quizAttempts: QuizAttempt[] = [];

  const assignments: Assignment[] = [
    {
      id: "asg-1",
      courseId: "crs-1",
      courseName: "Pemrograman Dasar",
      studyProgramId: "sp-1",
      studyProgramName: "Teknik Informatika",
      lecturerId: "lec-1",
      lecturerName: "Dr. Budi Santoso, M.Kom.",
      title: "Tugas 1: Analisis Kompleksitas & Algoritma Rekursif",
      description: "Implementasikan fungsi rekursif untuk faktorial, deret fibonacci, dan simulasi menara Hanoi dalam bahasa C / Python. Sertakan analisis kompleksitas Big-O untuk tiap fungsi.",
      dueDate: "2026-11-28T23:59:59.000Z",
      maxScore: 100,
      attachmentLink: "https://drive.google.com/sample-modul-tugas1",
      createdAt: now,
    },
    {
      id: "asg-2",
      courseId: "crs-2",
      courseName: "Struktur Data",
      studyProgramId: "sp-1",
      studyProgramName: "Teknik Informatika",
      lecturerId: "lec-1",
      lecturerName: "Dr. Budi Santoso, M.Kom.",
      title: "Tugas 2: Implementasi Binary Search Tree & Graph",
      description: "Buatlah program struktur data Binary Search Tree lengkap dengan operasi insert, search, delete, dan transversal inorder, preorder, serta postorder. Berikan contoh kasus dan tangkapan layar eksekusi program.",
      dueDate: "2026-12-05T23:59:59.000Z",
      maxScore: 100,
      attachmentLink: "",
      createdAt: now,
    },
  ];

  const submissions: Submission[] = [
    {
      id: "sub-1",
      assignmentId: "asg-1",
      studentId: "stu-1",
      studentName: "Andi Pratama",
      studentNim: "2023101001",
      content: "Berikut laporan tugas rekursif dan analisis Big-O. Seluruh kode program telah diuji coba dan berjalan dengan baik.",
      link: "https://github.com/andipratama/tugas-pemrograman-dasar",
      submittedAt: "2026-11-20T10:15:00.000Z",
      score: 92,
      feedback: "Implementasi fungsi rekursif sangat terstruktur dan rapi. Analisis kompleksitas Big-O sangat akurat. Pertahankan prestasinya!",
      gradedAt: "2026-11-20T16:00:00.000Z",
      gradedBy: "Dr. Budi Santoso, M.Kom.",
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: "notif-1",
      recipientRole: "student",
      recipientStudyProgramId: "sp-1",
      title: "Tugas Baru: Analisis Kompleksitas & Algoritma Rekursif",
      message: "Dr. Budi Santoso, M.Kom. telah mengunggah tugas baru pada mata kuliah Pemrograman Dasar. Batas pengumpulan: 28 Nov 2026.",
      type: "assignment",
      actionUrl: "/assignments",
      readUserIds: [],
      createdAt: "2026-11-20T08:00:00.000Z",
    },
    {
      id: "notif-2",
      recipientRole: "student",
      recipientStudyProgramId: "sp-1",
      title: "Kuis 1 Telah Dibuka: Konsep Dasar Pemrograman",
      message: "Kuis 1 Pemrograman Dasar telah dapat dikerjakan. Durasi pengerjaan: 30 menit.",
      type: "quiz",
      actionUrl: "/quizzes",
      readUserIds: [],
      createdAt: "2026-11-20T09:00:00.000Z",
    },
    {
      id: "notif-3",
      recipientRole: "student",
      recipientUserId: "usr-stu-1",
      title: "Pembayaran UKT Berhasil Diverifikasi",
      message: "Pembayaran UKT Semester Ganjil 2026/2027 sebesar Rp 2.500.000 telah terverifikasi LUNAS.",
      type: "ukt",
      actionUrl: "/ukt",
      readUserIds: [],
      createdAt: "2026-11-20T11:00:00.000Z",
    },
    {
      id: "notif-4",
      recipientRole: "student",
      recipientUserId: "usr-stu-1",
      title: "Nilai Tugas Diterbitkan: Tugas 1 Pemrograman Dasar",
      message: "Tugas Anda telah dinilai oleh Dr. Budi Santoso, M.Kom. Nilai perolehan: 92 / 100.",
      type: "grade",
      actionUrl: "/assignments",
      readUserIds: [],
      createdAt: "2026-11-20T16:05:00.000Z",
    },
    {
      id: "notif-5",
      recipientRole: "lecturer",
      recipientUserId: "usr-lec-1",
      title: "Pengumpulan Tugas Baru: Pemrograman Dasar",
      message: "Mahasiswa Andi Pratama (NIM: 2023101001) telah mengumpulkan Tugas 1: Analisis Kompleksitas & Algoritma Rekursif.",
      type: "submission",
      actionUrl: "/assignments",
      readUserIds: [],
      createdAt: "2026-11-20T10:16:00.000Z",
    },
  ];

  await Promise.all([
    writeJson("faculties", faculties),
    writeJson("studyPrograms", studyPrograms),
    writeJson("semesters", semesters),
    writeJson("lecturers", lecturers),
    writeJson("students", students),
    writeJson("courses", courses),
    writeJson("classes", classes),
    writeJson("enrollments", enrollments),
    writeJson("announcements", announcements),
    writeJson("calendarEvents", calendarEvents),
    writeJson("uktBills", uktBills),
    writeJson("uktPayments", uktPayments),
    writeJson("quizzes", quizzes),
    writeJson("quizAttempts", quizAttempts),
    writeJson("assignments", assignments),
    writeJson("submissions", submissions),
    writeJson("notifications", notifications),
    writeJson("users", users),
  ]);

  console.log("Seed complete. Demo password: password123");
}

if (require.main === module) {
  seedDatabase().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
