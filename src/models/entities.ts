export type Role = "admin" | "student" | "lecturer";

export interface User {
  id: string;
  email: string;
  password: string; // bcrypt hash — never returned
  role: Role;
  name: string;
  refId: string | null; // student or lecturer id, null for admin
  avatar?: string;
  status?: "active" | "inactive";
  isActive?: boolean;
  createdAt: string;
}

export interface Faculty {
  id: string;
  code: string;
  name: string;
  dean?: string;
  email?: string;
  description?: string;
  status?: "active" | "inactive";
  isActive?: boolean;
  createdAt?: string;
}

export interface StudyProgram {
  id: string;
  facultyId: string;
  code: string;
  name: string;
  degree: string;
  headOfProgram?: string;
  status?: "active" | "inactive";
  isActive?: boolean;
  createdAt?: string;
}

export interface Semester {
  id: string;
  name: string;
  year: string;
  term: "Ganjil" | "Genap";
  startDate: string;
  endDate: string;
  isActive: boolean;
  krsOpen: boolean;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  sks: number;
  studyProgramId: string;
  type: string;
  description: string;
}

export interface ClassSection {
  id: string;
  courseId: string;
  lecturerId: string;
  semesterId: string;
  name: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  capacity: number;
}

export interface Enrollment {
  id: string;
  studentId: string;
  classId: string;
  semesterId: string;
  status: "Menunggu" | "Disetujui" | "Ditolak";
  createdAt: string;
}

export interface Student {
  id: string;
  nim: string;
  name: string;
  email: string;
  studyProgramId: string;
  currentSemester: number;
  angkatan: number;
  uktGroup: number;
  status: string;
  advisorId: string | null;
  gpa?: number;
  phone?: string;
}

export interface Lecturer {
  id: string;
  nidn: string;
  name: string;
  email: string;
  studyProgramId: string;
  expertise: string;
  position: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target: string;
  authorUserId: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  category: string;
  semesterId: string;
  authorName?: string;
  createdAt?: string;
}

export interface UktBill {
  id: string;
  studentId: string;
  semesterId: string;
  uktGroup: number;
  amount: number;
  dueDate: string;
  status: "Belum Bayar" | "Menunggu Verifikasi" | "Lunas";
  createdAt: string;
}

export interface UktPayment {
  id: string;
  billId: string;
  studentId: string;
  method: string;
  vaNumber: string;
  amount: number;
  status: "Menunggu Verifikasi" | "Terverifikasi" | "Ditolak";
  paidAt: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  answerIndex: number;
  points: number;
}

export interface Quiz {
  id: string;
  classId?: string;
  courseId: string;
  courseName?: string;
  studyProgramId: string;
  studyProgramName?: string;
  lecturerId: string;
  lecturerName?: string;
  title: string;
  type: "Kuis" | "UTS" | "UAS";
  description: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  published: boolean;
  questions: Question[];
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  studentId: string;
  studentName?: string;
  studentNim?: string;
  answers: (number | null)[];
  score: number | null;
  maxScore: number;
  startedAt: string;
  submittedAt: string | null;
}

export interface Assignment {
  id: string;
  courseId: string;
  courseName?: string;
  studyProgramId: string;
  studyProgramName?: string;
  lecturerId: string;
  lecturerName?: string;
  title: string;
  description: string;
  dueDate: string;
  maxScore: number;
  attachmentLink?: string;
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName?: string;
  studentNim?: string;
  content: string;
  link?: string;
  submittedAt: string;
  score: number | null;
  feedback: string | null;
  gradedAt: string | null;
  gradedBy: string | null;
}

export interface AppNotification {
  id: string;
  recipientUserId?: string | null;
  recipientRole?: Role | "all";
  recipientStudyProgramId?: string | null;
  title: string;
  message: string;
  type: "quiz" | "assignment" | "ukt" | "submission" | "grade" | "calendar" | "system";
  actionUrl?: string;
  readUserIds: string[];
  createdAt: string;
}

/** User object safe to return to clients (no password). */
export type SafeUser = Omit<User, "password">;
