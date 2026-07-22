import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import AdmZip from "adm-zip";
import webpush from "web-push";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");
const configuredDataDir = String(process.env.JCOINS_DATA_DIR || "").trim();
const dataDir = configuredDataDir ? path.resolve(configuredDataDir) : path.resolve(__dirname, "../data");
const dbPath = path.join(dataDir, "db.json");
const previousDbPath = path.join(dataDir, "db.previous.json");
const localActivityFileDir = path.join(dataDir, "activity-files");
const activityUploadTempDir = path.join(dataDir, "upload-temp");
const assistantUploadTempDir = path.join(dataDir, "assistant-upload-temp");
const PORT = Number(process.env.PORT || 4000);
const JCOINS_STORAGE_MODE = String(process.env.JCOINS_STORAGE_MODE || "").trim().toLowerCase();
const SUPABASE_URL = JCOINS_STORAGE_MODE === "local" ? "" : process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = JCOINS_STORAGE_MODE === "local" ? "" : process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || "jcoins_app_state";
const configuredJwtSecret = String(process.env.JWT_SECRET || "").trim();
const jwtSecretIsPlaceholder = !configuredJwtSecret || [
  "change-this-to-a-long-random-secret",
  "dev-jcoins-secret-change-before-production"
].includes(configuredJwtSecret);
const JWT_SECRET = jwtSecretIsPlaceholder
  ? SUPABASE_SERVICE_ROLE_KEY
    ? createHash("sha256").update(`${SUPABASE_SERVICE_ROLE_KEY}:jcoins-jwt`).digest("hex")
    : randomBytes(32).toString("hex")
  : configuredJwtSecret;
const ALLOWED_ORIGINS = String(process.env.CORS_ORIGINS || "https://jcoins-zeta.vercel.app,https://coins-zeta.vercel.app,http://localhost:5173,http://127.0.0.1:5173,capacitor://localhost,ionic://localhost")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ACTIVITY_FILE_ROW_PREFIX = "activity-file:";
const TRANSACTION_ROW_PREFIX = "transaction:";
const STUDENT_ROW_PREFIX = "student:";
const USER_ROW_PREFIX = "user:";
const ATTENDANCE_RECORD_ROW_PREFIX = "attendance-record:";
const RECITATION_ROW_PREFIX = "recitation:";
const ACTIVITY_ROW_PREFIX = "activity:";
const GROUP_ACTIVITY_ROW_PREFIX = "group-activity:";
const QUIZ_ROW_PREFIX = "quiz:";
const MAJOR_EXAM_ROW_PREFIX = "major-exam:";
const WRITTEN_WORK_ROW_PREFIX = "written-work:";
const GRADE_SETTING_ROW_PREFIX = "grade-setting:";
const GRADE_NOTE_ROW_PREFIX = "grade-note:";
const REQUEST_ROW_PREFIX = "request:";
const FEEDBACK_ROW_PREFIX = "feedback:";
const SCHEDULE_ROW_PREFIX = "schedule:";
const ATTENDANCE_WEEK_ROW_PREFIX = "attendance-week:";
const SUBJECT_ROW_PREFIX = "subject:";
const SECTION_ROW_PREFIX = "section:";
const STUDENT_ASSISTANT_ROW_PREFIX = "student-assistant:";
const SHOP_ITEM_ROW_PREFIX = "shop-item:";
const SALE_ROW_PREFIX = "sale:";
const APPEARANCE_ITEM_ROW_PREFIX = "appearance-item:";
const APPEARANCE_INVENTORY_ROW_PREFIX = "appearance-inventory:";
const APPEARANCE_GIFT_ROW_PREFIX = "appearance-gift:";
const APPEARANCE_EQUIPPED_ROW_PREFIX = "appearance-equipped:";
const GUILD_RESPONSE_ROW_PREFIX = "guild-response:";
const AUDIT_LOG_ROW_PREFIX = "audit-log:";
const PUSH_SUBSCRIPTION_ROW_PREFIX = "push-subscription:";
const PUSH_CONFIG_ROW_ID = "system:push-config";
const ACTIVITY_MATERIAL_OWNER = "__activity_materials";
const STORAGE_ROW_TYPES = [
  { key: "activityFiles", label: "Activity file blobs", prefix: ACTIVITY_FILE_ROW_PREFIX },
  { key: "transactions", label: "Transactions and points", prefix: TRANSACTION_ROW_PREFIX },
  { key: "students", label: "Students", prefix: STUDENT_ROW_PREFIX },
  { key: "users", label: "Users and login accounts", prefix: USER_ROW_PREFIX },
  { key: "attendanceRecords", label: "Attendance records", prefix: ATTENDANCE_RECORD_ROW_PREFIX },
  { key: "recitations", label: "Recitations", prefix: RECITATION_ROW_PREFIX },
  { key: "activities", label: "Activities", prefix: ACTIVITY_ROW_PREFIX },
  { key: "groupActivities", label: "Guild group activities", prefix: GROUP_ACTIVITY_ROW_PREFIX },
  { key: "quizzes", label: "Quizzes", prefix: QUIZ_ROW_PREFIX },
  { key: "majorExams", label: "Major exams", prefix: MAJOR_EXAM_ROW_PREFIX },
  { key: "writtenWorks", label: "Written works", prefix: WRITTEN_WORK_ROW_PREFIX },
  { key: "gradeSettings", label: "Grade settings", prefix: GRADE_SETTING_ROW_PREFIX },
  { key: "gradeNotes", label: "Grade notes and advice", prefix: GRADE_NOTE_ROW_PREFIX },
  { key: "requests", label: "Requests", prefix: REQUEST_ROW_PREFIX },
  { key: "feedback", label: "Feedback", prefix: FEEDBACK_ROW_PREFIX },
  { key: "schedules", label: "Schedules", prefix: SCHEDULE_ROW_PREFIX },
  { key: "attendanceWeeks", label: "Attendance weeks", prefix: ATTENDANCE_WEEK_ROW_PREFIX },
  { key: "subjects", label: "Subjects", prefix: SUBJECT_ROW_PREFIX },
  { key: "sections", label: "Sections", prefix: SECTION_ROW_PREFIX },
  { key: "studentAssistants", label: "Student assistants", prefix: STUDENT_ASSISTANT_ROW_PREFIX },
  { key: "shopItems", label: "Shop items", prefix: SHOP_ITEM_ROW_PREFIX },
  { key: "sales", label: "Sales", prefix: SALE_ROW_PREFIX },
  { key: "appearanceItems", label: "Appearance items", prefix: APPEARANCE_ITEM_ROW_PREFIX },
  { key: "appearanceInventory", label: "Appearance inventory", prefix: APPEARANCE_INVENTORY_ROW_PREFIX },
  { key: "appearanceGifts", label: "Appearance gifts", prefix: APPEARANCE_GIFT_ROW_PREFIX },
  { key: "appearanceEquipped", label: "Equipped appearances", prefix: APPEARANCE_EQUIPPED_ROW_PREFIX },
  { key: "guildResponses", label: "Guild responses", prefix: GUILD_RESPONSE_ROW_PREFIX },
  { key: "auditLogs", label: "Audit logs", prefix: AUDIT_LOG_ROW_PREFIX },
  { key: "pushSubscriptions", label: "Push notification subscriptions", prefix: PUSH_SUBSCRIPTION_ROW_PREFIX }
];
const BACKUP_TIME_ZONE = process.env.BACKUP_TIME_ZONE || "Asia/Manila";
const BACKUP_RETENTION_DAYS = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 30));
const BACKUP_MIRROR_DIR = String(process.env.JCOINS_BACKUP_MIRROR_DIR || "").trim();
const DB_CACHE_TTL_MS = Math.max(0, Number(process.env.DB_CACHE_TTL_MS || 6 * 60 * 60 * 1000));
const RUN_SCHEDULED_JOBS = !["0", "false", "no"].includes(String(process.env.RUN_SCHEDULED_JOBS || "true").trim().toLowerCase());
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const app = express();
let mutationRequestQueue = Promise.resolve();
let quizMutationBatch = [];
let quizMutationBatchTimer = null;
let quizMutationFlushActive = false;
let broadcastChangeTimer = null;
app.disable("x-powered-by");
app.set("trust proxy", 1);
["get", "post", "put", "delete", "patch"].forEach((method) => {
  const original = app[method].bind(app);
  app[method] = (path, ...handlers) => original(path, ...handlers.map((handler, index) => {
    if (typeof handler !== "function" || handler.length === 4) return handler;
    return (req, res, next) => {
      const queuedMutationHandler = index === handlers.length - 1 && req.releaseMutationTurn;
      if (queuedMutationHandler) {
        req.mutationHandlerStarted = true;
        currentMutationRequest = req;
      }
      const result = Promise.resolve().then(() => handler(req, res, next)).catch(next);
      return queuedMutationHandler
        ? result.finally(() => {
          if (currentMutationRequest === req) currentMutationRequest = null;
          req.releaseMutationTurn();
        })
        : result;
    };
  }));
});
const ASSISTANT_FILE_LIMIT_BYTES = 25 * 1024 * 1024;
const ASSISTANT_FILE_TOTAL_LIMIT_BYTES = 100 * 1024 * 1024;
const ASSISTANT_FILE_COUNT_LIMIT = 10;
const ACTIVITY_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
const ACTIVITY_SCORE_RELEASE_DAYS = 7;
const ACTIVITY_PHOTO_TOTAL_LIMIT_BYTES = 100 * 1024 * 1024;
const activityDataUrlLimit = (bytes) => Math.ceil(bytes * 4 / 3) + 2048;
const uploadAssistantReference = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      mkdir(assistantUploadTempDir, { recursive: true }).then(() => callback(null, assistantUploadTempDir)).catch(callback);
    },
    filename(_req, _file, callback) {
      callback(null, `${Date.now()}-${randomUUID()}.reference`);
    }
  }),
  limits: { fileSize: ASSISTANT_FILE_LIMIT_BYTES, files: ASSISTANT_FILE_COUNT_LIMIT }
}).fields([{ name: "files", maxCount: ASSISTANT_FILE_COUNT_LIMIT }, { name: "file", maxCount: 1 }]);
const uploadActivitySubmission = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      mkdir(activityUploadTempDir, { recursive: true }).then(() => callback(null, activityUploadTempDir)).catch(callback);
    },
    filename(_req, _file, callback) {
      callback(null, `${Date.now()}-${randomUUID()}.upload`);
    }
  }),
  limits: { fileSize: ACTIVITY_FILE_LIMIT_BYTES, files: 10, fields: 4 }
}).array("files", 10);
function assistantReferenceUpload(req, res, next) {
  uploadAssistantReference(req, res, (err) => {
    req.referenceFiles = [...(req.files?.files || []), ...(req.files?.file || [])];
    if (err) return cleanupAssistantReferenceFiles(req.referenceFiles).finally(() => {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Reference file is too large. Maximum size is 25 MB." });
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") return res.status(400).json({ error: "Upload up to 10 reference files." });
      return res.status(400).json({ error: err.message || "The reference file could not be uploaded." });
    });
    const totalBytes = req.referenceFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalBytes > ASSISTANT_FILE_TOTAL_LIMIT_BYTES) return cleanupAssistantReferenceFiles(req.referenceFiles)
      .finally(() => res.status(413).json({ error: "Reference files are too large. Maximum combined size is 100 MB." }));
    return next();
  });
}

function cleanupAssistantReferenceFiles(files = []) {
  return Promise.all(files.map((file) => file.path ? rm(file.path, { force: true }).catch(() => {}) : null));
}
function activitySubmissionUpload(req, res, next) {
  if (!req.is("multipart/form-data")) return next();
  uploadActivitySubmission(req, res, (err) => {
    if (err) return cleanupTemporaryActivityFiles(req.files || []).finally(() => {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File is too large. Maximum upload is 50 MB per file." });
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") return res.status(400).json({ error: "Upload one document or up to 10 photos." });
      return res.status(400).json({ error: err.message || "The activity files could not be uploaded." });
    });
    return next();
  });
}
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), payment=()");
  if (req.path.startsWith("/api/auth")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    const error = new Error("Origin not allowed");
    error.status = 403;
    return callback(error);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  maxAge: 86400
}));
app.use(express.json({ limit: "70mb" }));
app.use((req, res, next) => {
  const started = Date.now();
  req.receivedAt = started;
  res.on("finish", () => {
    if (!req.path.startsWith("/api")) return;
    const duration = Date.now() - started;
    if (duration >= 500 || req.path.includes("overview") || req.path.includes("/student/me")) {
      console.info(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});
app.use((req, res, next) => {
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  const bypassQueue = req.path === "/api/auth/login"
    || req.path === "/api/events/token"
    || req.path === "/api/assistant/chat"
    || /^\/api\/student\/quizzes\/[^/]+\/(start|submit)$/.test(req.path);
  if (!isMutation || !req.path.startsWith("/api") || bypassQueue) return next();

  let releaseTurn;
  const turn = new Promise((resolve) => { releaseTurn = resolve; });
  const previous = mutationRequestQueue.catch(() => {});
  mutationRequestQueue = previous.then(() => turn);
  previous.then(() => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseTurn();
    };
    req.releaseMutationTurn = release;
    res.once("finish", release);
    res.once("close", () => {
      if (!req.mutationHandlerStarted) release();
    });
    next();
  }).catch(next);
});
const eventClients = new Map();
const eventTokens = new Map();
const persistedTransactionHashes = new Map();
const persistedStudentHashes = new Map();
const persistedUserHashes = new Map();
const persistedAttendanceRecordHashes = new Map();
const persistedRecitationHashes = new Map();
const persistedActivityHashes = new Map();
const persistedGroupActivityHashes = new Map();
const persistedQuizHashes = new Map();
const persistedMajorExamHashes = new Map();
const persistedWrittenWorkHashes = new Map();
const persistedGradeSettingHashes = new Map();
const persistedGradeNoteHashes = new Map();
const persistedRequestHashes = new Map();
const persistedFeedbackHashes = new Map();
const persistedScheduleHashes = new Map();
const persistedAttendanceWeekHashes = new Map();
const persistedSubjectHashes = new Map();
const persistedSectionHashes = new Map();
const persistedStudentAssistantHashes = new Map();
const persistedShopItemHashes = new Map();
const persistedSaleHashes = new Map();
const persistedAppearanceItemHashes = new Map();
const persistedAppearanceInventoryHashes = new Map();
const persistedAppearanceGiftHashes = new Map();
const persistedAppearanceEquippedHashes = new Map();
const persistedGuildResponseHashes = new Map();
const persistedAuditLogHashes = new Map();
const persistedPushSubscriptionHashes = new Map();
let persistedMainHash = "";
let pushConfigPromise = null;
const stalePushSubscriptionIds = new Set();
let cachedDb = null;
let cachedDbAt = 0;
let cachedAuthUsers = new Map();
let cachedAuthUsernames = new Map();
const hydratedStudentsCache = new WeakMap();
let dbLoadPromise = null;
let ensureDbPromise = null;
let dbWriteQueue = Promise.resolve();
let assistantRewardPromise = null;
let currentMutationRequest = null;

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();

async function withMutationTurn(work) {
  let releaseTurn;
  const turn = new Promise((resolve) => { releaseTurn = resolve; });
  const previous = mutationRequestQueue.catch(() => {});
  mutationRequestQueue = previous.then(() => turn);
  await previous;
  try {
    return await work();
  } finally {
    releaseTurn();
  }
}

function enqueueQuizMutation(execute) {
  return new Promise((resolve, reject) => {
    quizMutationBatch.push({ execute, resolve, reject });
    if (!quizMutationFlushActive && !quizMutationBatchTimer) quizMutationBatchTimer = setTimeout(flushQuizMutationBatch, 200);
  });
}

async function flushQuizMutationBatch() {
  quizMutationBatchTimer = null;
  if (quizMutationFlushActive || !quizMutationBatch.length) return;
  quizMutationFlushActive = true;
  let batch = [];
  try {
    await withMutationTurn(async () => {
      batch = quizMutationBatch.splice(0);
      const db = await readDb();
      const results = batch.map((item) => {
        try {
          return { item, result: item.execute(db) };
        } catch (error) {
          return { item, error };
        }
      });
      const mutations = results.filter(({ result }) => result?.mutated);
      mutations.forEach(({ result }) => {
        if (result.request) recordAutomaticAuditLog(db, result.request);
      });
      if (mutations.length) await writeDb(db, { skipAudit: true });
      results.forEach(({ item, result, error }) => error ? item.reject(error) : item.resolve(result));
    });
  } catch (error) {
    batch.forEach((item) => item.reject(error));
  } finally {
    quizMutationFlushActive = false;
    if (quizMutationBatch.length && !quizMutationBatchTimer) quizMutationBatchTimer = setTimeout(flushQuizMutationBatch, 200);
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value));
  await rename(temporaryPath, filePath);
}

async function writeLocalDb(db) {
  try {
    await copyFile(dbPath, previousDbPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeJsonAtomic(dbPath, db);
}
const localDate = (date = new Date(), timeZone = BACKUP_TIME_ZONE) => new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(date);
const byDateDesc = (a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || ""));
const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const reminderOptions = [0, 5, 10, 15, 30, 60];
const quizDifficulties = ["Easy", "Moderate", "Hard", "Advanced"];
const answerVisibilityOptions = ["immediate", "after_deadline", "scheduled", "never"];
const quizQuestionTypes = ["multiple_choice", "true_false", "fill_blank", "matching", "multiple_select", "numerical", "computation"];
const quizTypes = ["mixed", ...quizQuestionTypes];
const paperQuizTypes = ["multiple_choice", "true_false", "matching"];
const paperQuizVariants = ["A", "B", "C", "D"];
const paperAnswerLetters = ["A", "B", "C", "D"];
const STUDENT_ASSISTANT_DAILY_REWARD = 50;
const STUDENT_ASSISTANT_REWARD_INTERVAL_MS = 15 * 60 * 1000;
const defaultShopItems = [
  { id: "item_hint", tier: "Low", name: "Hint During Quiz", cost: 50, notes: "1 per quiz" },
  { id: "item_seat_choice", tier: "Low", name: "Seat Choice (1 Day)", cost: 80, notes: "" },
  { id: "item_candy_voucher", tier: "Low", name: "Candy Voucher", cost: 100, notes: "" },
  { id: "item_homework_extension", tier: "Low", name: "Homework Extension (1 Day)", cost: 100, notes: "2 per term" },
  { id: "item_music_seatwork", tier: "Low", name: "Listen to Music During Seatwork (1 Class)", cost: 150, notes: "" },
  { id: "item_quiz_question", tier: "Low", name: "Ask One Possible Question from Upcoming Quiz", cost: 200, notes: "" },
  { id: "item_quiz_topic_reveal", tier: "Low", name: "Quiz Topic Reveal", cost: 300, notes: "1 per quiz" },
  { id: "item_plus_1_quiz", tier: "Mid", name: "+1 Quiz Point", cost: 250, notes: "3 per term" },
  { id: "item_homework_pass", tier: "Mid", name: "Homework Pass", cost: 300, notes: "2 per term" },
  { id: "item_first_group_pick", tier: "Mid", name: "First Group Pick", cost: 350, notes: "" },
  { id: "item_dj_day", tier: "Mid", name: "DJ for the Day (Choose Background Music)", cost: 350, notes: "" },
  { id: "item_retake_quiz_item", tier: "Mid", name: "Retake One Quiz Item", cost: 400, notes: "1 per quiz" },
  { id: "item_major_activity_extension", tier: "Mid", name: "Major Activity Extension (1 Day)", cost: 400, notes: "2 per term" },
  { id: "item_snack_pass", tier: "Mid", name: "Snack Pass", cost: 800, notes: "" },
  { id: "item_plus_2_quiz", tier: "High", name: "+2 Quiz Points", cost: 700, notes: "" },
  { id: "item_replace_lowest_quiz", tier: "High", name: "Replace Lowest Quiz Score", cost: 1000, notes: "1 per term" },
  { id: "item_activity_retry", tier: "High", name: "Activity Retry Pass", cost: 1200, notes: "1 per term" },
  { id: "item_quiz_correction", tier: "High", name: "Quiz Correction Pass", cost: 1500, notes: "1 per term" },
  { id: "item_replace_lowest_activity", tier: "Premium", name: "Replace Lowest Activity Score", cost: 2000, notes: "1 per term" },
  { id: "item_academic_shield", tier: "Premium", name: "Academic Shield (Wild Card Pass)", cost: 2500, notes: "Choose one high-tier reward for free; 1 per term" }
];
const appearanceTypes = ["background", "border", "nameColor", "nameFont", "effect", "badge", "avatarFrame", "avatarIcon"];
const appearanceTiers = ["Common", "Rare", "Epic", "Legendary"];
const defaultAppearanceItems = [
  { id: "ap_name_blue", name: "Sky Blue Name", type: "nameColor", price: 15, tier: "Common", preview: "Blue name color", active: true, styleClass: "ap-name-blue" },
  { id: "ap_name_lime", name: "Lime Name", type: "nameColor", price: 15, tier: "Common", preview: "Green name color", active: true, styleClass: "ap-name-lime" },
  { id: "ap_badge_grinder", name: "Daily Grinder", type: "badge", price: 25, tier: "Common", preview: "Daily Grinder title", active: true, styleClass: "ap-badge-grinder" },
  { id: "ap_border_bronze", name: "Bronze Frame", type: "border", price: 35, tier: "Common", preview: "Bronze profile and leaderboard border", active: true, styleClass: "ap-border-bronze" },
  { id: "ap_avatar_neon", name: "Neon Avatar Ring", type: "avatarFrame", price: 45, tier: "Common", preview: "Neon avatar frame", active: true, styleClass: "ap-avatar-neon" },
  { id: "ap_icon_star", name: "Star Avatar Icon", type: "avatarIcon", price: 45, tier: "Common", preview: "Star profile icon", icon: "★", active: true, styleClass: "ap-icon-star" },
  { id: "ap_font_pixel", name: "Pixel Name Font", type: "nameFont", price: 60, tier: "Rare", preview: "Pixel style name", active: true, styleClass: "ap-font-pixel" },
  { id: "ap_icon_crown", name: "Crown Avatar Icon", type: "avatarIcon", price: 75, tier: "Rare", preview: "Crown profile icon", icon: "♛", active: true, styleClass: "ap-icon-crown" },
  { id: "ap_bg_purple", name: "Purple Quest Background", type: "background", price: 70, tier: "Rare", preview: "Purple profile and row background", active: true, styleClass: "ap-bg-purple" },
  { id: "ap_border_neon", name: "Neon Circuit Border", type: "border", price: 85, tier: "Rare", preview: "Glowing cyan border", active: true, styleClass: "ap-border-neon" },
  { id: "ap_badge_slayer", name: "Quiz Slayer", type: "badge", price: 95, tier: "Rare", preview: "Quiz Slayer title", active: true, styleClass: "ap-badge-slayer" },
  { id: "ap_effect_spark", name: "Spark Burst", type: "effect", price: 110, tier: "Rare", preview: "Small sparkle effect", active: true, styleClass: "ap-effect-spark" },
  { id: "ap_border_flame", name: "Flame Border", type: "border", price: 115, tier: "Rare", preview: "Pulsing red flame border", active: true, styleClass: "ap-border-flame" },
  { id: "ap_name_gold", name: "Gold Name", type: "nameColor", price: 125, tier: "Epic", preview: "Gold name color", active: true, styleClass: "ap-name-gold" },
  { id: "ap_icon_bolt", name: "Bolt Avatar Icon", type: "avatarIcon", price: 130, tier: "Epic", preview: "Lightning profile icon", icon: "⚡", active: true, styleClass: "ap-icon-bolt" },
  { id: "ap_bg_galaxy", name: "Galaxy Background", type: "background", price: 150, tier: "Epic", preview: "Animated galaxy background", active: true, styleClass: "ap-bg-galaxy" },
  { id: "ap_border_fire", name: "Burning Flame Effect", type: "effect", price: 170, tier: "Epic", preview: "Actual burning flame effect", active: true, styleClass: "ap-border-fire" },
  { id: "ap_effect_lightning", name: "Lightning Aura", type: "effect", price: 190, tier: "Epic", preview: "Electric aura", active: true, styleClass: "ap-effect-lightning" },
  { id: "ap_badge_legend", name: "Legend Badge", type: "badge", price: 230, tier: "Legendary", preview: "Legend title", active: true, styleClass: "ap-badge-legend" },
  { id: "ap_avatar_dragon", name: "Dragon Avatar Frame", type: "avatarFrame", price: 260, tier: "Legendary", preview: "Dragon frame", active: true, styleClass: "ap-avatar-dragon" },
  { id: "ap_icon_rocket", name: "Rocket Avatar Icon", type: "avatarIcon", price: 280, tier: "Legendary", preview: "Rocket profile icon", icon: "🚀", active: true, styleClass: "ap-icon-rocket" },
  { id: "ap_name_rainbow", name: "Rainbow Pulse Name", type: "nameColor", price: 300, tier: "Legendary", preview: "Animated rainbow name", active: true, styleClass: "ap-name-rainbow" },
  { id: "ap_bg_aurora", name: "Aurora Background", type: "background", price: 95, tier: "Rare", preview: "Moving aurora lights", active: true, styleClass: "ap-bg-aurora" },
  { id: "ap_bg_ocean", name: "Ocean Wave Background", type: "background", price: 105, tier: "Rare", preview: "Deep blue wave motion", active: true, styleClass: "ap-bg-ocean" },
  { id: "ap_bg_night_city", name: "Night City Background", type: "background", price: 160, tier: "Epic", preview: "Neon city glow", active: true, styleClass: "ap-bg-night-city" },
  { id: "ap_border_dash", name: "Dash Border", type: "border", price: 45, tier: "Common", preview: "Broken dash border", active: true, styleClass: "ap-border-dash" },
  { id: "ap_border_spike", name: "Spike Border", type: "border", price: 90, tier: "Rare", preview: "Sharp spiky border", active: true, styleClass: "ap-border-spike" },
  { id: "ap_border_ribbon", name: "Ribbon Border", type: "border", price: 100, tier: "Rare", preview: "Wrapped ribbon border", active: true, styleClass: "ap-border-ribbon" },
  { id: "ap_border_string", name: "String Border", type: "border", price: 120, tier: "Epic", preview: "Threaded string border", active: true, styleClass: "ap-border-string" },
  { id: "ap_border_royal", name: "Royal Heavy Border", type: "border", price: 200, tier: "Legendary", preview: "Thick royal gold border", active: true, styleClass: "ap-border-royal" },
  { id: "ap_name_rose", name: "Rose Name", type: "nameColor", price: 35, tier: "Common", preview: "Rose pink name", active: true, styleClass: "ap-name-rose" },
  { id: "ap_name_violet", name: "Violet Name", type: "nameColor", price: 45, tier: "Common", preview: "Violet name color", active: true, styleClass: "ap-name-violet" },
  { id: "ap_name_ice", name: "Ice Name", type: "nameColor", price: 70, tier: "Rare", preview: "Frozen ice name", active: true, styleClass: "ap-name-ice" },
  { id: "ap_name_emerald", name: "Emerald Name", type: "nameColor", price: 90, tier: "Rare", preview: "Emerald glow name", active: true, styleClass: "ap-name-emerald" },
  { id: "ap_name_shadow", name: "Shadow Name", type: "nameColor", price: 140, tier: "Epic", preview: "Dark shadow name", active: true, styleClass: "ap-name-shadow" },
  { id: "ap_font_serif", name: "Scholar Serif Font", type: "nameFont", price: 55, tier: "Common", preview: "Classic serif name", active: true, styleClass: "ap-font-serif" },
  { id: "ap_font_round", name: "Bubble Round Font", type: "nameFont", price: 65, tier: "Common", preview: "Rounded name font", active: true, styleClass: "ap-font-round" },
  { id: "ap_font_comic", name: "Comic Pop Font", type: "nameFont", price: 85, tier: "Rare", preview: "Comic style name", active: true, styleClass: "ap-font-comic" },
  { id: "ap_font_typewriter", name: "Typewriter Font", type: "nameFont", price: 95, tier: "Rare", preview: "Typewriter name", active: true, styleClass: "ap-font-typewriter" },
  { id: "ap_font_fantasy", name: "Fantasy Quest Font", type: "nameFont", price: 135, tier: "Epic", preview: "Fantasy adventure name", active: true, styleClass: "ap-font-fantasy" },
  { id: "ap_font_stencil", name: "Stencil Font", type: "nameFont", price: 150, tier: "Epic", preview: "Stencil name font", active: true, styleClass: "ap-font-stencil" },
  { id: "ap_font_marker", name: "Marker Font", type: "nameFont", price: 180, tier: "Legendary", preview: "Marker handwritten name", active: true, styleClass: "ap-font-marker" },
  { id: "ap_effect_glitch", name: "Glitch Effect", type: "effect", price: 165, tier: "Epic", preview: "Digital glitch shimmer", active: true, styleClass: "ap-effect-glitch" },
  { id: "ap_effect_spotlight", name: "Spotlight Effect", type: "effect", price: 210, tier: "Legendary", preview: "Moving spotlight shine", active: true, styleClass: "ap-effect-spotlight" },
  { id: "ap_badge_math_mage", name: "Math Mage", type: "badge", price: 65, tier: "Common", preview: "Math Mage title", active: true, styleClass: "ap-badge-math-mage" },
  { id: "ap_badge_science_hero", name: "Science Hero", type: "badge", price: 80, tier: "Rare", preview: "Science Hero title", active: true, styleClass: "ap-badge-science-hero" },
  { id: "ap_badge_attendance_ace", name: "Attendance Ace", type: "badge", price: 100, tier: "Rare", preview: "Attendance Ace title", active: true, styleClass: "ap-badge-attendance-ace" },
  { id: "ap_badge_top_trader", name: "Top Trader", type: "badge", price: 135, tier: "Epic", preview: "Top Trader title", active: true, styleClass: "ap-badge-top-trader" },
  { id: "ap_badge_boss", name: "Quest Boss", type: "badge", price: 240, tier: "Legendary", preview: "Quest Boss title", active: true, styleClass: "ap-badge-boss" },
  { id: "ap_avatar_orbit", name: "Orbit Avatar Frame", type: "avatarFrame", price: 95, tier: "Rare", preview: "Animated orbit frame", active: true, styleClass: "ap-avatar-orbit" },
  { id: "ap_avatar_crystal", name: "Crystal Avatar Frame", type: "avatarFrame", price: 150, tier: "Epic", preview: "Crystal avatar frame", active: true, styleClass: "ap-avatar-crystal" },
  { id: "ap_avatar_rune", name: "Rune Avatar Frame", type: "avatarFrame", price: 220, tier: "Legendary", preview: "Animated rune frame", active: true, styleClass: "ap-avatar-rune" },
  { id: "ap_icon_heart", name: "Heart Avatar Icon", type: "avatarIcon", price: 55, tier: "Common", preview: "Heart profile icon", icon: "\u2665", active: true, styleClass: "ap-icon-heart" },
  { id: "ap_icon_diamond", name: "Diamond Avatar Icon", type: "avatarIcon", price: 100, tier: "Rare", preview: "Diamond profile icon", icon: "\u25C6", active: true, styleClass: "ap-icon-diamond" },
  { id: "ap_icon_gamepad", name: "Gamepad Avatar Icon", type: "avatarIcon", price: 145, tier: "Epic", preview: "Game profile icon", icon: "\u25B6", active: true, styleClass: "ap-icon-gamepad" },
  { id: "ap_icon_moon", name: "Moon Avatar Icon", type: "avatarIcon", price: 190, tier: "Legendary", preview: "Moon profile icon", icon: "\u263E", active: true, styleClass: "ap-icon-moon" },
  { id: "ap_effect_champion", name: "Champion Aura", type: "effect", price: 350, tier: "Legendary", preview: "Full champion glow", active: true, styleClass: "ap-effect-champion" }
];
const guilds = [
  { id: "explorers", name: "Explorers' Guild", trait: "Curiosity", traits: ["Curiosity", "Courage", "Discovery", "Growth"], message: "May your curiosity guide your journey." },
  { id: "innovators", name: "Innovators' Guild", trait: "Innovation", traits: ["Innovation", "Problem Solving", "Improvement", "Vision"], message: "May your ideas shape the future." },
  { id: "creators", name: "Creators' Guild", trait: "Creativity", traits: ["Creativity", "Imagination", "Expression", "Action"], message: "May your imagination bring possibilities to life." },
  { id: "guardians", name: "Guardians' Guild", trait: "Responsibility", traits: ["Support", "Dependability", "Teamwork", "Strength"], message: "May your strength and responsibility protect your path." },
  { id: "traders", name: "Traders' Guild", trait: "Strategy", traits: ["Strategy", "Planning", "Resourcefulness", "Wisdom"], message: "May your strategy and wisdom lead you forward." }
];
const guildQuestions = [
  { id: "q1", text: "I enjoy trying activities that I have never done before.", guildId: "explorers" },
  { id: "q2", text: "I often think of ways to improve things around me.", guildId: "innovators" },
  { id: "q3", text: "I feel satisfied when I help someone solve a problem.", guildId: "guardians" },
  { id: "q4", text: "I enjoy planning ahead before making important decisions.", guildId: "traders" },
  { id: "q5", text: "I like expressing my ideas through projects or creative work.", guildId: "creators" },
  { id: "q6", text: "I am comfortable stepping outside my comfort zone.", guildId: "explorers" },
  { id: "q7", text: "I enjoy finding unique solutions to difficult challenges.", guildId: "innovators" },
  { id: "q8", text: "People often come to me when they need support.", guildId: "guardians" },
  { id: "q9", text: "I enjoy creating something from my own ideas.", guildId: "creators" },
  { id: "q10", text: "I carefully consider the consequences of my decisions.", guildId: "traders" },
  { id: "q11", text: "Learning something completely new excites me.", guildId: "explorers" },
  { id: "q12", text: "I enjoy improving a process that already works.", guildId: "innovators" },
  { id: "q13", text: "I feel responsible for contributing to the success of a group.", guildId: "guardians" },
  { id: "q14", text: "I enjoy managing resources efficiently.", guildId: "traders" },
  { id: "q15", text: "I often imagine how things could be made better.", guildId: "innovators" },
  { id: "q16", text: "I enjoy discovering information on my own.", guildId: "explorers" },
  { id: "q17", text: "I remain dependable even when tasks become difficult.", guildId: "guardians" },
  { id: "q18", text: "I enjoy finding opportunities where everyone benefits.", guildId: "traders" },
  { id: "q19", text: "I like turning ideas into action.", guildId: "creators" },
  { id: "q20", text: "I enjoy taking on challenges that push me to grow.", guildId: "explorers" }
];

function defaultGuildSystem() {
  return {
    status: "not_started",
    questions: guildQuestions,
    responses: [],
    classMemberships: [],
    startedAt: "",
    lockedAt: "",
    ceremonyStartedAt: ""
  };
}

function publicGuild(guildId) {
  const guild = guilds.find((item) => item.id === guildId);
  return guild ? { id: guild.id, name: guild.name, trait: guild.trait, message: guild.message } : null;
}

function sanitizeGuildQuestions(questions = guildQuestions) {
  return questions.map((question) => ({ id: question.id, text: question.text }));
}

function normalizeGuildSystem(system) {
  const base = defaultGuildSystem();
  return {
    ...base,
    ...(system && typeof system === "object" ? system : {}),
    questions: guildQuestions,
    responses: Array.isArray(system?.responses) ? system.responses : [],
    classMemberships: Array.isArray(system?.classMemberships) ? system.classMemberships : []
  };
}

function classMembershipFor(db, studentId, subjectId, section = "") {
  const normalizedSection = String(section || "").trim();
  return (db.guildSystem?.classMemberships || []).find((membership) =>
    membership.studentId === studentId
    && membership.subjectId === subjectId
    && String(membership.section || "").trim() === normalizedSection
  );
}

function studentIsInClass(db, student, subjectId, section = "") {
  if (!student) return false;
  const normalizedSection = String(section || "").trim();
  const regular = (student.subjectIds || []).includes(subjectId) && (!normalizedSection || student.section === normalizedSection);
  return regular || !!classMembershipFor(db, student.id, subjectId, normalizedSection);
}

function studentsForClass(db, subjectId, section = "") {
  return (db.students || [])
    .filter((student) => studentIsInClass(db, student, subjectId, section))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function studentClassGuildId(db, studentId, subjectId, section = "") {
  const membership = classMembershipFor(db, studentId, subjectId, section);
  if (membership?.guildId && guilds.some((guild) => guild.id === membership.guildId)) return membership.guildId;
  const response = guildResponse(db, studentId);
  return response?.revealed ? response.assignedGuildId : "";
}

function guildSection(student) {
  return student?.section || "No section";
}

function guildCountsForStudents(db, students) {
  const counts = Object.fromEntries(guilds.map((guild) => [guild.id, 0]));
  const studentIds = new Set((students || []).map((student) => student.id));
  (db.guildSystem?.responses || []).forEach((response) => {
    if (studentIds.has(response.studentId) && counts[response.assignedGuildId] != null) counts[response.assignedGuildId] += 1;
  });
  return counts;
}

function guildDistribution(db, students = db.students || []) {
  const counts = guildCountsForStudents(db, students);
  return guilds.map((guild) => ({ ...publicGuild(guild.id), count: counts[guild.id] || 0 }));
}

function guildDistributionBySection(db, students = db.students || []) {
  const sectionMap = new Map();
  (students || []).forEach((student) => {
    const section = guildSection(student);
    if (!sectionMap.has(section)) sectionMap.set(section, []);
    sectionMap.get(section).push(student);
  });
  return [...sectionMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([section, sectionStudents]) => ({
      section,
      total: sectionStudents.length,
      guilds: guildDistribution(db, sectionStudents)
    }));
}

function guildCountsForSection(db, section) {
  return guildCountsForStudents(db, (db.students || []).filter((student) => guildSection(student) === section));
}

function guildResponse(db, studentId) {
  return (db.guildSystem?.responses || []).find((response) => response.studentId === studentId);
}

function calculateGuildAffinities(answerMap) {
  const totals = Object.fromEntries(guilds.map((guild) => [guild.id, 0]));
  const counts = Object.fromEntries(guilds.map((guild) => [guild.id, 0]));
  guildQuestions.forEach((question) => {
    totals[question.guildId] += Number(answerMap[question.id] || 0);
    counts[question.guildId] += 1;
  });
  return Object.fromEntries(guilds.map((guild) => [guild.id, Number((totals[guild.id] / Math.max(1, counts[guild.id])).toFixed(2))]));
}

function assignGuild(db, affinities, student) {
  const counts = guildCountsForSection(db, guildSection(student));
  const minCount = Math.min(...guilds.map((guild) => counts[guild.id] || 0));
  return [...guilds].sort((a, b) => {
    const aScore = Number(affinities[a.id] || 0) - ((counts[a.id] || 0) - minCount) * 0.75;
    const bScore = Number(affinities[b.id] || 0) - ((counts[b.id] || 0) - minCount) * 0.75;
    return bScore - aScore || (counts[a.id] || 0) - (counts[b.id] || 0) || a.name.localeCompare(b.name);
  })[0].id;
}

function shuffleList(list) {
  const items = [...list];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function guildTraitPreview(affinities = {}) {
  return [...guilds]
    .sort((a, b) => Number(affinities[b.id] || 0) - Number(affinities[a.id] || 0))
    .flatMap((guild) => guild.traits)
    .filter((trait, index, list) => list.indexOf(trait) === index)
    .slice(0, 8);
}

function guildSystemView(db, user) {
  const system = normalizeGuildSystem(db.guildSystem);
  const visibleStudents = scopeStudents(db, user);
  const base = {
    status: system.status,
    startedAt: system.startedAt || "",
    lockedAt: system.lockedAt || "",
    ceremonyStartedAt: system.ceremonyStartedAt || "",
    guilds: guilds.map((guild) => publicGuild(guild.id)),
    questions: sanitizeGuildQuestions(system.questions),
    distribution: guildDistribution({ ...db, guildSystem: system }, visibleStudents),
    distributionBySection: guildDistributionBySection({ ...db, guildSystem: system }, visibleStudents)
  };
  if (user.role === "student") {
    const response = guildResponse({ ...db, guildSystem: system }, user.studentId);
    const student = db.students.find((item) => item.id === user.studentId);
    const responseByStudentId = new Map(system.responses.map((item) => [item.studentId, item]));
    const members = response?.revealed && response.assignedGuildId && student
      ? db.students
        .filter((item) => item.section === student.section)
        .filter((item) => {
          const memberResponse = responseByStudentId.get(item.id);
          return memberResponse?.revealed && memberResponse.assignedGuildId === response.assignedGuildId;
        })
        .map((item) => ({ studentId: item.id, studentName: item.name, isCurrentStudent: item.id === student.id }))
        .sort((a, b) => Number(b.isCurrentStudent) - Number(a.isCurrentStudent) || a.studentName.localeCompare(b.studentName))
      : [];
    return {
      ...base,
      response: response ? {
        submittedAt: response.submittedAt,
        revealed: !!response.revealed,
        revealedAt: response.revealedAt || "",
        assignedGuild: response.revealed ? publicGuild(response.assignedGuildId) : null,
        section: response.revealed ? student?.section || "" : "",
        members
      } : null
    };
  }
  return {
    ...base,
    students: visibleStudents.map((student) => {
      const response = guildResponse({ ...db, guildSystem: system }, student.id);
      return {
        studentId: student.id,
        studentName: student.name,
        section: student.section || "",
        submitted: !!response,
        revealed: !!response?.revealed,
        submittedAt: response?.submittedAt || "",
        revealedAt: response?.revealedAt || "",
        status: !response ? "Not Submitted" : response.revealed ? "Revealed" : "Submitted / Ready",
        assignedGuild: response?.revealed ? publicGuild(response.assignedGuildId)?.name || "" : "",
        assignedGuildId: user.role === "admin" && response ? response.assignedGuildId || "" : "",
        hiddenAssignedGuild: user.role === "admin" && response && !response.revealed ? publicGuild(response.assignedGuildId)?.name || "" : ""
      };
    })
  };
}

function normalizeGroupActivity(activity, db) {
  activity.title = String(activity.title || "Group Activity").trim().slice(0, 160);
  activity.subjectId = String(activity.subjectId || "");
  activity.section = String(activity.section || "").trim();
  activity.difficulty = quizDifficulties.includes(activity.difficulty) ? activity.difficulty : "Easy";
  activity.rewardValue = quizRewardValue(db, activity.difficulty);
  activity.deadline = normalizeActivityDeadline(activity.deadline);
  activity.instructions = String(activity.instructions || "").trim().slice(0, 3000);
  activity.votes = Array.isArray(activity.votes) ? activity.votes : [];
  activity.guildResults = Array.isArray(activity.guildResults) ? activity.guildResults : [];
  activity.guildResults.forEach((result) => {
    result.guildId = String(result.guildId || "");
    result.leaderId = String(result.leaderId || "");
    result.teacherScore = result.teacherScore == null || result.teacherScore === "" ? null : Math.max(0, Math.min(100, Number(result.teacherScore)));
    result.memberGrades = result.memberGrades && typeof result.memberGrades === "object" && !Array.isArray(result.memberGrades) ? result.memberGrades : {};
  });
  return activity;
}

function groupActivityMembers(db, activity, guildId) {
  return studentsForClass(db, activity.subjectId, activity.section)
    .filter((student) => studentClassGuildId(db, student.id, activity.subjectId, activity.section) === guildId)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function groupActivityResult(activity, guildId, create = false) {
  let result = (activity.guildResults || []).find((item) => item.guildId === guildId);
  if (!result && create) {
    result = { guildId, leaderId: "", leaderFinalizedAt: "", teacherScore: null, teacherGradedAt: "", teacherGradedBy: "", memberGrades: {}, distributedAt: "" };
    activity.guildResults.push(result);
  }
  return result || null;
}

function groupVoteSummary(db, activity, guildId, members = groupActivityMembers(db, activity, guildId)) {
  const memberIds = new Set(members.map((member) => member.id));
  const counts = Object.fromEntries(members.map((member) => [member.id, 0]));
  (activity.votes || []).forEach((vote) => {
    if (vote.guildId === guildId && memberIds.has(vote.studentId) && memberIds.has(vote.candidateId)) counts[vote.candidateId] += 1;
  });
  const ranking = members
    .map((member) => ({ studentId: member.id, studentName: member.name, votes: counts[member.id] || 0 }))
    .sort((a, b) => b.votes - a.votes || a.studentName.localeCompare(b.studentName));
  return { ranking, winner: ranking[0]?.votes > 0 ? ranking[0] : null };
}

function groupActivityDeadlineOpen(activity) {
  const deadline = parseActivityDateTime(activity.deadline, true);
  return !!deadline && Date.now() <= deadline.getTime();
}

function syncGroupActivityRewards(db, activity, result, createdBy) {
  const members = groupActivityMembers(db, activity, result.guildId);
  const memberIds = new Set(members.map((member) => member.id));
  db.transactions = db.transactions.filter((transaction) => !(
    transaction.meta?.groupActivityId === activity.id
    && transaction.meta?.guildId === result.guildId
    && ["group-activity", "group-activity-leader"].includes(transaction.meta?.kind)
  ));
  if (result.teacherScore == null || !result.leaderId || !memberIds.has(result.leaderId)) return;
  const grades = { ...(result.memberGrades || {}), [result.leaderId]: Number(result.teacherScore) };
  result.memberGrades = grades;
  members.forEach((member) => {
    const grade = grades[member.id];
    if (grade == null || grade === "") return;
    const reward = Math.round(Number(activity.rewardValue || 0) * Math.max(0, Math.min(100, Number(grade))) / 100);
    if (reward) db.transactions.push(tx(member.id, "group_activity", reward, `${activity.title} - group activity`, now(), createdBy, {
      kind: "group-activity",
      groupActivityId: activity.id,
      guildId: result.guildId,
      subjectId: activity.subjectId,
      section: activity.section,
      difficulty: activity.difficulty,
      grade: Number(grade)
    }));
  });
  db.transactions.push(tx(result.leaderId, "group_activity_leader", 20, `${activity.title} - group leader bonus`, now(), createdBy, {
    kind: "group-activity-leader",
    groupActivityId: activity.id,
    guildId: result.guildId,
    subjectId: activity.subjectId,
    section: activity.section
  }));
}

function reconcileGroupActivities(db, createdBy = "system") {
  (db.groupActivities || []).forEach((activity) => {
    normalizeGroupActivity(activity, db);
    activity.votes = (activity.votes || []).filter((vote) => {
      const members = groupActivityMembers(db, activity, vote.guildId);
      const memberIds = new Set(members.map((member) => member.id));
      return memberIds.has(vote.studentId) && memberIds.has(vote.candidateId);
    });
    (activity.guildResults || []).forEach((result) => {
      const memberIds = new Set(groupActivityMembers(db, activity, result.guildId).map((member) => member.id));
      if (result.leaderId && !memberIds.has(result.leaderId)) {
        result.leaderId = "";
        result.leaderFinalizedAt = "";
        result.teacherScore = null;
        result.teacherGradedAt = "";
        result.teacherGradedBy = "";
        result.memberGrades = {};
        result.distributedAt = "";
      } else {
        result.memberGrades = Object.fromEntries(Object.entries(result.memberGrades || {}).filter(([studentId]) => memberIds.has(studentId)));
      }
      syncGroupActivityRewards(db, activity, result, createdBy);
    });
  });
}

function publicGroupActivity(db, activity, user) {
  normalizeGroupActivity(activity, db);
  const base = {
    id: activity.id,
    title: activity.title,
    subjectId: activity.subjectId,
    subjectName: subjectName(db, activity.subjectId),
    section: activity.section,
    difficulty: activity.difficulty,
    rewardValue: activity.rewardValue,
    deadline: activity.deadline,
    instructions: activity.instructions,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt || activity.createdAt,
    hasProgress: !!((activity.votes || []).length || (activity.guildResults || []).some((result) => result.teacherScore != null))
  };
  if (user.role === "student") {
    const guildId = studentClassGuildId(db, user.studentId, activity.subjectId, activity.section);
    if (!guildId) return null;
    const members = groupActivityMembers(db, activity, guildId);
    if (!members.some((member) => member.id === user.studentId)) return null;
    const result = groupActivityResult(activity, guildId);
    const myVote = (activity.votes || []).find((vote) => vote.studentId === user.studentId)?.candidateId || "";
    const isLeader = result?.leaderId === user.studentId;
    const visibleGrades = isLeader ? result?.memberGrades || {} : result?.teacherScore != null ? { [user.studentId]: result.memberGrades?.[user.studentId] } : {};
    return {
      ...base,
      guildId,
      guildName: publicGuild(guildId)?.name || "Guild",
      members: members.map((member) => ({ studentId: member.id, studentName: member.name })),
      myVote,
      canVote: !result?.leaderId && groupActivityDeadlineOpen(activity),
      leaderId: result?.leaderId || "",
      leaderName: result?.leaderId ? studentName(db, result.leaderId) : "",
      teacherScore: result?.teacherScore,
      memberGrades: visibleGrades,
      myGrade: result?.memberGrades?.[user.studentId] ?? null,
      canDistribute: isLeader && result?.teacherScore != null
    };
  }
  const guildRows = guilds.map((guild) => {
    const members = groupActivityMembers(db, activity, guild.id);
    if (!members.length) return null;
    const result = groupActivityResult(activity, guild.id);
    const summary = groupVoteSummary(db, activity, guild.id, members);
    return {
      guildId: guild.id,
      guildName: guild.name,
      members: members.map((member) => ({ studentId: member.id, studentName: member.name })),
      voteRanking: summary.ranking,
      proposedLeaderId: summary.winner?.studentId || "",
      proposedLeaderName: summary.winner?.studentName || "",
      leaderId: result?.leaderId || "",
      leaderName: result?.leaderId ? studentName(db, result.leaderId) : "",
      teacherScore: result?.teacherScore,
      memberGrades: result?.memberGrades || {},
      distributedAt: result?.distributedAt || ""
    };
  }).filter(Boolean);
  return { ...base, guildRows };
}

function hydrateGroupActivities(db, user) {
  return (db.groupActivities || [])
    .filter((activity) => {
      if (user.role === "student") {
        const student = db.students.find((item) => item.id === user.studentId);
        return studentIsInClass(db, student, activity.subjectId, activity.section);
      }
      return canUseSubject(user, activity.subjectId) && canUseSection(user, activity.section);
    })
    .map((activity) => publicGroupActivity(db, activity, user))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function groupActivityInput(db, body, user, existing = {}) {
  const title = String(body.title ?? existing.title ?? "").trim().slice(0, 160);
  const subjectId = String(body.subjectId ?? existing.subjectId ?? "");
  const section = String(body.section ?? existing.section ?? "").trim();
  const difficulty = quizDifficulties.includes(body.difficulty ?? existing.difficulty) ? body.difficulty ?? existing.difficulty : "Easy";
  const deadline = normalizeActivityDeadline(body.deadline ?? existing.deadline);
  const instructions = String(body.instructions ?? existing.instructions ?? "").trim().slice(0, 3000);
  if (!title) throw new Error("Activity title is required.");
  if (!db.subjects.some((subject) => subject.id === subjectId)) throw new Error("Choose an existing subject.");
  if (!db.sections.includes(section)) throw new Error("Choose an existing section.");
  if (!canUseSubject(user, subjectId) || !canUseSection(user, section)) throw new Error("This class is outside your assigned scope.");
  if (!parseActivityDateTime(deadline, true)) throw new Error("Choose a valid deadline.");
  return { title, subjectId, section, difficulty, rewardValue: quizRewardValue(db, difficulty), deadline, instructions };
}

async function ensureDb() {
  if (!ensureDbPromise) {
    ensureDbPromise = (async () => {
      if (supabase) {
        const { data, error } = await supabase.from(SUPABASE_STATE_TABLE).select("id").eq("id", "main").maybeSingle();
        if (error) throw supabaseSetupError(error);
        if (!data) {
          const db = await createInitialDb();
          const { error: insertError } = await supabase.from(SUPABASE_STATE_TABLE).insert({ id: "main", state: db });
          if (insertError && insertError.code !== "23505") throw supabaseSetupError(insertError);
        }
        return;
      }
      await mkdir(dataDir, { recursive: true });
      try {
        await readFile(dbPath, "utf8");
      } catch {
        const db = await createInitialDb();
        await writeLocalDb(db);
      }
    })().catch((error) => {
      ensureDbPromise = null;
      throw error;
    });
  }
  return ensureDbPromise;
}

function supabaseSetupError(error) {
  const text = String(error.message || "");
  const setupHint = /does not exist|schema cache|relation/i.test(text)
    ? ` Make sure the ${SUPABASE_STATE_TABLE} table exists. Run server/supabase/schema.sql in Supabase SQL Editor.`
    : "";
  const message = `Supabase database error: ${text}.${setupHint}`;
  const wrapped = new Error(message);
  wrapped.cause = error;
  return wrapped;
}

function defaults() {
  return {
    settings: {
      attendance: { onTimePoints: 5, latePoints: 2, weeklyBonus: 20 },
      recitation: { maxPoints: 10, weeklyBonus: 20 },
      activities: {
        latePenaltyPerDay: 10,
        submittedLabel: "Submitted?",
        types: [
          { name: "Simple", points: 30 },
          { name: "Moderate", points: 40 },
          { name: "Complex", points: 50 }
        ]
      },
      quizzes: {
        defaultPassingPercent: 75,
        defaultAnswerVisibility: "after_deadline",
        difficulties: [
          { name: "Easy", points: 20 },
          { name: "Moderate", points: 30 },
          { name: "Hard", points: 40 },
          { name: "Advanced", points: 50 }
        ]
      },
      grades: {
        weights: { writtenWorks: 20, quizzes: 20, activities: 30, attendance: 10, majorExams: 20 },
        includeWrittenWorks: true,
        recitationBonusMax: 5,
        passingGrade: 75
      },
      wheel: { spinSeconds: 3.3 },
      guild: { revealSeconds: 10 },
      registration: { enabled: false, code: "" },
      ranks: [
        { name: "Apprentice", min: 250 },
        { name: "Adept", min: 500 },
        { name: "Scholar", min: 1000 },
        { name: "Mentor", min: 1750 },
        { name: "Master Scholar", min: 2500 },
        { name: "Grand Scholar", min: 3500 },
        { name: "Grand Scholar+", min: 5001 }
      ]
    }
  };
}

async function createInitialDb() {
  const adminHash = await bcrypt.hash("admin123!", 10);
  return {
    settings: defaults().settings,
    subjects: [],
    sections: [],
    users: [
      { id: "u_admin", username: "admin", passwordHash: adminHash, role: "admin", mustChangePassword: true, studentId: null, subjectIds: [], sectionIds: [] }
    ],
    students: [],
    transactions: [],
    attendanceWeeks: [],
    attendanceRecords: [],
    recitations: [],
    studentAssistants: [],
    activities: [],
    groupActivities: [],
    quizzes: [],
    majorExams: [],
    writtenWorks: [],
    gradeSettings: [],
    gradeNotes: [],
    shopItems: defaultShopItems,
    sales: [],
    requests: [],
    feedback: [],
    schedules: [],
    appearanceItems: defaultAppearanceItems,
    appearanceInventory: [],
    appearanceEquipped: {},
    appearanceGifts: [],
    auditLogs: [],
    pushSubscriptions: [],
    guildSystem: defaultGuildSystem()
  };
}

function tx(studentId, type, amount, note, createdAt = now(), createdBy = "system", meta = {}) {
  return { id: randomUUID(), studentId, type, amount: Number(amount || 0), note: note || "", createdAt, createdBy, meta };
}

function sendEvent(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function broadcastChange(reason = "data_changed") {
  if (!eventClients.size || broadcastChangeTimer) return;
  broadcastChangeTimer = setTimeout(() => {
    broadcastChangeTimer = null;
    const payload = { reason, changedAt: now() };
    for (const [id, res] of eventClients.entries()) {
      if (!sendEvent(res, "change", payload)) eventClients.delete(id);
    }
  }, 1000);
}

function msUntilNextLocalMidnight() {
  const current = new Date();
  const currentDate = localDate(current);
  for (let minutes = 1; minutes <= 36 * 60; minutes += 1) {
    const candidate = new Date(current.getTime() + minutes * 60 * 1000);
    if (localDate(candidate) !== currentDate) {
      return Math.max(1000, candidate.getTime() - current.getTime() + 2000);
    }
  }
  return 24 * 60 * 60 * 1000;
}

function backupRowId(date = localDate()) {
  return `backup-${date}`;
}

async function backupExists(date = localDate()) {
  if (!supabase) {
    try {
      await readFile(path.join(dataDir, "backups", `${backupRowId(date)}.json`), "utf8");
      return true;
    } catch {
      return false;
    }
  }
  const { data, error } = await supabase
    .from(SUPABASE_STATE_TABLE)
    .select("id,state")
    .eq("id", backupRowId(date))
    .maybeSingle();
  if (error) throw supabaseSetupError(error);
  return !!data && Array.isArray(data.state?.storageRows);
}

async function pruneBackupDirectory(backupDir) {
  try {
    const files = (await readdir(backupDir))
      .filter((file) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .sort()
      .reverse();
    await Promise.all(files.slice(BACKUP_RETENTION_DAYS).flatMap((file) => {
      const base = file.replace(/\.json$/, "");
      return [
        rm(path.join(backupDir, file), { force: true }),
        rm(path.join(backupDir, `${base}.activity-files`), { recursive: true, force: true })
      ];
    }));
  } catch {
    // Local backup pruning should never block the running classroom app.
  }
}

async function copyActivityFileBackup(destinationDir) {
  try {
    await rm(destinationDir, { recursive: true, force: true });
    await cp(localActivityFileDir, destinationDir, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function mirrorLocalBackup(backupPath, activityBackupDir = "") {
  if (!BACKUP_MIRROR_DIR) return;
  await mkdir(BACKUP_MIRROR_DIR, { recursive: true });
  const destination = path.join(BACKUP_MIRROR_DIR, path.basename(backupPath));
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await copyFile(backupPath, temporaryPath);
  await rename(temporaryPath, destination);
  if (activityBackupDir) {
    const activityDestination = path.join(BACKUP_MIRROR_DIR, path.basename(activityBackupDir));
    try {
      await rm(activityDestination, { recursive: true, force: true });
      await cp(activityBackupDir, activityDestination, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  await pruneBackupDirectory(BACKUP_MIRROR_DIR);
}

async function pruneSupabaseBackups() {
  const { data, error } = await supabase
    .from(SUPABASE_STATE_TABLE)
    .select("id")
    .like("id", "backup-%")
    .order("updated_at", { ascending: false });
  if (error) throw supabaseSetupError(error);
  const staleIds = (data || []).slice(BACKUP_RETENTION_DAYS).map((row) => row.id);
  if (!staleIds.length) return;
  const { error: deleteError } = await supabase
    .from(SUPABASE_STATE_TABLE)
    .delete()
    .in("id", staleIds);
  if (deleteError) throw supabaseSetupError(deleteError);
}

async function createDailyBackup(reason = "scheduled") {
  const date = localDate();
  const localBackupPath = path.join(dataDir, "backups", `${backupRowId(date)}.json`);
  const localActivityBackupDir = path.join(dataDir, "backups", `${backupRowId(date)}.activity-files`);
  if (await backupExists(date)) {
    if (!supabase) await mirrorLocalBackup(localBackupPath, localActivityBackupDir);
    return false;
  }
  const db = supabase ? await readSupabaseDb() : null;
  const backup = supabase
    ? { date, createdAt: now(), timeZone: BACKUP_TIME_ZONE, reason, state: db, storageRows: await readSupplementalStorageRows() }
    : null;
  if (supabase) {
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .upsert({ id: backupRowId(date), state: backup, updated_at: backup.createdAt });
    if (error) throw supabaseSetupError(error);
    await pruneSupabaseBackups();
    return true;
  }
  const backupDir = path.join(dataDir, "backups");
  await mkdir(backupDir, { recursive: true });
  await copyFile(dbPath, localBackupPath);
  await copyActivityFileBackup(localActivityBackupDir);
  await mirrorLocalBackup(localBackupPath, localActivityBackupDir);
  await pruneBackupDirectory(backupDir);
  return true;
}

async function readSupplementalStorageRows() {
  if (!supabase) {
    try {
      const files = (await readdir(localActivityFileDir)).filter((file) => file.endsWith(".json"));
      const rows = [];
      for (const file of files) {
        const row = JSON.parse(await readFile(path.join(localActivityFileDir, file), "utf8"));
        if (row?.state?.fileStorage === "binary") {
          const bytes = await readFile(localActivityBinaryPath(row.id));
          row.state.fileData = `data:${row.state.fileType || "application/octet-stream"};base64,${bytes.toString("base64")}`;
        }
        rows.push(row);
      }
      return rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }
  const groups = await Promise.all(STORAGE_ROW_TYPES.map((type) => readStorageRowsByPrefix(type.prefix, "id,state,updated_at")));
  const rows = groups.flat();
  return rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function scheduleDailyBackup() {
  const runBackup = async (reason) => {
    try {
      await ensureDb();
      await runStudentAssistantRewardJob();
      await createDailyBackup(reason);
    } catch (err) {
      console.error("Daily backup failed:", err.message);
    }
  };
  runBackup("server-start");
  const scheduleNext = () => {
    if (globalThis.__jcoinsBackupTimer) clearTimeout(globalThis.__jcoinsBackupTimer);
    globalThis.__jcoinsBackupTimer = setTimeout(async () => {
      await runBackup("midnight");
      scheduleNext();
    }, msUntilNextLocalMidnight());
  };
  scheduleNext();
}

async function runStudentAssistantRewardJob() {
  if (assistantRewardPromise) return assistantRewardPromise;
  assistantRewardPromise = (async () => {
    let releaseTurn;
    const turn = new Promise((resolve) => { releaseTurn = resolve; });
    const previous = mutationRequestQueue.catch(() => {});
    mutationRequestQueue = previous.then(() => turn);
    await previous;
    try {
      const db = await readDb();
      const granted = grantStudentAssistantDailyRewards(db);
      const attendanceWeeksChanged = syncScheduledAttendanceWeeks(db);
      if (granted || attendanceWeeksChanged) await writeDb(db);
      return granted;
    } finally {
      releaseTurn();
    }
  })().catch((error) => {
    console.error("Student assistant reward job failed:", error.message);
    return 0;
  }).finally(() => {
    assistantRewardPromise = null;
  });
  return assistantRewardPromise;
}

function scheduleStudentAssistantRewards() {
  if (globalThis.__jcoinsAssistantRewardTimer) clearInterval(globalThis.__jcoinsAssistantRewardTimer);
  globalThis.__jcoinsAssistantRewardTimer = setInterval(runStudentAssistantRewardJob, STUDENT_ASSISTANT_REWARD_INTERVAL_MS);
  globalThis.__jcoinsAssistantRewardTimer.unref?.();
}

function cloneDb(db) {
  return structuredClone(db);
}

function cacheDb(db) {
  cachedAuthUsers = new Map((db.users || []).filter((user) => user?.id).map((user) => [user.id, structuredClone(user)]));
  cachedAuthUsernames = new Map([...cachedAuthUsers.values()].map((user) => [String(user.username || "").toLowerCase(), user]));
  if (!DB_CACHE_TTL_MS) return;
  cachedDb = cloneDb(db);
  cachedDbAt = Date.now();
}

function cachedDbIsFresh() {
  return !!cachedDb && !!DB_CACHE_TTL_MS && Date.now() - cachedDbAt <= DB_CACHE_TTL_MS;
}

async function readRawDb() {
  await dbWriteQueue.catch(() => {});
  if (cachedDbIsFresh()) return cloneDb(cachedDb);
  await ensureDb();
  if (!dbLoadPromise) {
    dbLoadPromise = (async () => {
      const db = supabase ? await readSupabaseDb() : JSON.parse(await readFile(dbPath, "utf8"));
      cacheDb(db);
      return db;
    })().finally(() => {
      dbLoadPromise = null;
    });
  }
  return cloneDb(await dbLoadPromise);
}

async function readSharedDb() {
  await dbWriteQueue.catch(() => {});
  if (!cachedDbIsFresh()) await readDb();
  return cachedDb || readDb();
}

async function readDb() {
  const db = await readRawDb();
  let changed = false;
  const d = defaults();
  db.settings = { ...d.settings, ...(db.settings || {}) };
  db.settings.attendance = { ...d.settings.attendance, ...(db.settings.attendance || {}) };
  db.settings.recitation = { ...d.settings.recitation, ...(db.settings.recitation || {}) };
  db.settings.activities = { ...d.settings.activities, ...(db.settings.activities || {}) };
  db.settings.quizzes = { ...d.settings.quizzes, ...(db.settings.quizzes || {}) };
  db.settings.grades = { ...d.settings.grades, ...(db.settings.grades || {}) };
  db.settings.grades.weights = normalizeGradeWeights(db.settings.grades.weights || d.settings.grades.weights);
  db.settings.grades.includeWrittenWorks = db.settings.grades.includeWrittenWorks !== false;
  db.settings.grades.recitationBonusMax = Math.max(0, Math.min(20, Number(db.settings.grades.recitationBonusMax ?? d.settings.grades.recitationBonusMax)));
  db.settings.grades.passingGrade = Math.max(1, Math.min(100, Number(db.settings.grades.passingGrade || d.settings.grades.passingGrade)));
  db.settings.wheel = { ...d.settings.wheel, ...(db.settings.wheel || {}) };
  db.settings.guild = { ...d.settings.guild, ...(db.settings.guild || {}) };
  db.settings.registration = { ...d.settings.registration, ...(db.settings.registration || {}) };
  db.settings.activities.types ||= d.settings.activities.types;
  db.settings.quizzes.difficulties ||= d.settings.quizzes.difficulties;
  db.settings.quizzes.defaultPassingPercent = Math.max(1, Math.min(100, Number(db.settings.quizzes.defaultPassingPercent || d.settings.quizzes.defaultPassingPercent)));
  db.settings.quizzes.defaultAnswerVisibility = answerVisibilityOptions.includes(db.settings.quizzes.defaultAnswerVisibility) ? db.settings.quizzes.defaultAnswerVisibility : d.settings.quizzes.defaultAnswerVisibility;
  db.settings.quizzes.difficulties = quizDifficulties.map((name) => {
    const existing = (db.settings.quizzes.difficulties || []).find((difficulty) => difficulty.name === name);
    const fallback = d.settings.quizzes.difficulties.find((difficulty) => difficulty.name === name);
    return { name, points: Number(existing?.points ?? fallback?.points ?? 0) };
  });
  db.settings.ranks ||= d.settings.ranks;
  db.subjects ||= [];
  db.sections ||= [...new Set((db.students || []).map((s) => s.section).filter(Boolean))];
  db.attendanceWeeks ||= [];
  db.attendanceWeeks.forEach((week, index) => {
    if (!week.createdAt) {
      week.createdAt = week.dates?.[0] || new Date(Date.now() - (db.attendanceWeeks.length - index) * 1000).toISOString();
      changed = true;
    }
    const section = String(week.section || "").trim();
    if (week.section !== section) {
      week.section = section;
      changed = true;
    }
    const cancelledDates = [...new Set((Array.isArray(week.cancelledDates) ? week.cancelledDates : []).filter((date) => (week.dates || []).includes(date)))].sort();
    if (JSON.stringify(week.cancelledDates || []) !== JSON.stringify(cancelledDates)) {
      week.cancelledDates = cancelledDates;
      changed = true;
    }
  });
  db.attendanceRecords ||= [];
  db.recitations ||= [];
  db.studentAssistants ||= [];
  db.studentAssistants.forEach((assignment) => {
    if (normalizeStudentAssistantAssignment(assignment)) changed = true;
  });
  db.activities ||= [];
  db.groupActivities ||= [];
  db.quizzes ||= [];
  db.quizzes.forEach((quiz) => normalizeQuiz(quiz, db));
  db.majorExams ||= [];
  db.majorExams.forEach((exam) => normalizeMajorExam(exam, db));
  db.writtenWorks ||= [];
  db.writtenWorks.forEach((work) => normalizeWrittenWork(work, db));
  db.gradeSettings ||= [];
  db.gradeSettings.forEach((setting) => normalizeGradeSetting(setting, db));
  db.gradeNotes ||= [];
  db.gradeNotes.forEach((note) => normalizeGradeNote(note, db));
  db.shopItems ||= [];
  defaultShopItems.forEach((item) => {
    if (!db.shopItems.some((existing) => existing.id === item.id)) {
      db.shopItems.push(item);
      changed = true;
    }
  });
  db.shopItems.forEach((item) => { item.tier ||= "Tier 1"; });
  db.sales ||= [];
  db.requests ||= [];
  db.feedback ||= [];
  db.schedules ||= [];
  db.auditLogs ||= [];
  db.pushSubscriptions ||= [];
  if (stalePushSubscriptionIds.size) {
    const before = db.pushSubscriptions.length;
    db.pushSubscriptions = db.pushSubscriptions.filter((subscription) => !stalePushSubscriptionIds.has(subscription.id));
    if (db.pushSubscriptions.length !== before) changed = true;
    stalePushSubscriptionIds.clear();
  }
  const normalizedGuildSystem = normalizeGuildSystem(db.guildSystem);
  if (!db.guildSystem || JSON.stringify(db.guildSystem.questions || []) !== JSON.stringify(guildQuestions)) changed = true;
  db.guildSystem = normalizedGuildSystem;
  db.appearanceItems ||= [];
  db.appearanceInventory ||= [];
  if (!db.appearanceEquipped || Array.isArray(db.appearanceEquipped) || typeof db.appearanceEquipped !== "object") {
    db.appearanceEquipped = {};
    changed = true;
  }
  db.appearanceGifts ||= [];
  defaultAppearanceItems.forEach((item) => {
    if (!db.appearanceItems.some((existing) => existing.id === item.id)) {
      db.appearanceItems.push(item);
      changed = true;
    }
  });
  const burningEffect = db.appearanceItems.find((item) => item.id === "ap_border_fire");
  if (burningEffect && (burningEffect.type !== "effect" || burningEffect.name === "Fire Border")) {
    burningEffect.name = "Burning Flame Effect";
    burningEffect.type = "effect";
    burningEffect.preview = "Actual burning flame effect";
    burningEffect.styleClass = "ap-border-fire";
    changed = true;
  }
  Object.values(db.appearanceEquipped).forEach((equipped) => {
    if (equipped?.border === "ap_border_fire") {
      equipped.effect = "ap_border_fire";
      delete equipped.border;
      changed = true;
    }
  });
  db.appearanceItems.forEach((item) => {
    item.type = appearanceTypes.includes(item.type) ? item.type : "badge";
    item.tier = item.tier || "Common";
    item.price = Number(item.price || 0);
    item.active = item.active !== false;
    item.styleClass ||= item.id;
    item.icon ||= item.type === "avatarIcon" ? "★" : "";
  });
  db.users ||= [];
  db.students ||= [];
  db.transactions ||= [];
  if (purgeOrphanStudentUsers(db)) changed = true;
  db.students.forEach((s) => {
    s.subjectIds ||= db.subjects.map((sub) => sub.id);
    s.profilePhoto ||= "";
  });
  if (assignStudentQuizCodes(db)) changed = true;
  db.users.forEach((u) => { u.subjectIds ||= []; u.sectionIds ||= []; });
  db.users.forEach((u) => {
    if (u.role === "teacher" && !u.subjectIds.length) {
      u.subjectIds = db.subjects.slice(0, 2).map((subject) => subject.id);
      changed = true;
    }
  });
  if (changed) await writeDb(db, { skipAudit: true });
  return db;
}

async function writeDb(db, { skipAudit = false } = {}) {
  if (!skipAudit) recordAutomaticAuditLog(db, currentMutationRequest);
  const snapshot = cloneDb(db);
  dbWriteQueue = dbWriteQueue.catch(() => {}).then(() => persistDb(snapshot));
  return dbWriteQueue;
}

async function persistDb(db) {
  if (supabase) {
    const { db: dbToStore, files } = extractActivityFileRows(db);
    const cacheSnapshot = cloneDb(dbToStore);
    const students = extractEntityRows(dbToStore, "students", STUDENT_ROW_PREFIX);
    const users = extractEntityRows(dbToStore, "users", USER_ROW_PREFIX);
    const attendanceRecords = extractEntityRows(dbToStore, "attendanceRecords", ATTENDANCE_RECORD_ROW_PREFIX);
    const recitations = extractEntityRows(dbToStore, "recitations", RECITATION_ROW_PREFIX);
    const activities = extractEntityRows(dbToStore, "activities", ACTIVITY_ROW_PREFIX);
    const groupActivities = extractEntityRows(dbToStore, "groupActivities", GROUP_ACTIVITY_ROW_PREFIX);
    const quizzes = extractEntityRows(dbToStore, "quizzes", QUIZ_ROW_PREFIX);
    const majorExams = extractEntityRows(dbToStore, "majorExams", MAJOR_EXAM_ROW_PREFIX);
    const writtenWorks = extractEntityRows(dbToStore, "writtenWorks", WRITTEN_WORK_ROW_PREFIX);
    const gradeSettings = extractEntityRows(dbToStore, "gradeSettings", GRADE_SETTING_ROW_PREFIX);
    const gradeNotes = extractEntityRows(dbToStore, "gradeNotes", GRADE_NOTE_ROW_PREFIX);
    const requests = extractEntityRows(dbToStore, "requests", REQUEST_ROW_PREFIX);
    const feedback = extractEntityRows(dbToStore, "feedback", FEEDBACK_ROW_PREFIX);
    const schedules = extractEntityRows(dbToStore, "schedules", SCHEDULE_ROW_PREFIX);
    const attendanceWeeks = extractEntityRows(dbToStore, "attendanceWeeks", ATTENDANCE_WEEK_ROW_PREFIX);
    const subjects = extractEntityRows(dbToStore, "subjects", SUBJECT_ROW_PREFIX);
    const sections = extractStringRows(dbToStore, "sections", SECTION_ROW_PREFIX);
    const studentAssistants = extractEntityRows(dbToStore, "studentAssistants", STUDENT_ASSISTANT_ROW_PREFIX);
    const shopItems = extractEntityRows(dbToStore, "shopItems", SHOP_ITEM_ROW_PREFIX);
    const sales = extractEntityRows(dbToStore, "sales", SALE_ROW_PREFIX);
    const appearanceItems = extractEntityRows(dbToStore, "appearanceItems", APPEARANCE_ITEM_ROW_PREFIX);
    const appearanceInventory = extractEntityRows(dbToStore, "appearanceInventory", APPEARANCE_INVENTORY_ROW_PREFIX);
    const appearanceGifts = extractEntityRows(dbToStore, "appearanceGifts", APPEARANCE_GIFT_ROW_PREFIX);
    const appearanceEquipped = extractObjectRows(dbToStore, "appearanceEquipped", APPEARANCE_EQUIPPED_ROW_PREFIX);
    const guildResponses = extractGuildResponseRows(dbToStore);
    const auditLogs = extractEntityRows(dbToStore, "auditLogs", AUDIT_LOG_ROW_PREFIX);
    const pushSubscriptions = extractEntityRows(dbToStore, "pushSubscriptions", PUSH_SUBSCRIPTION_ROW_PREFIX);
    const { transactions, transactionRowIds } = extractTransactionRows(dbToStore);
    await Promise.all([
      upsertActivityFileRows(files),
      syncEntityRows(students.items, students.rowIds, STUDENT_ROW_PREFIX, persistedStudentHashes),
      syncEntityRows(users.items, users.rowIds, USER_ROW_PREFIX, persistedUserHashes),
      syncEntityRows(attendanceRecords.items, attendanceRecords.rowIds, ATTENDANCE_RECORD_ROW_PREFIX, persistedAttendanceRecordHashes),
      syncEntityRows(recitations.items, recitations.rowIds, RECITATION_ROW_PREFIX, persistedRecitationHashes),
      syncEntityRows(activities.items, activities.rowIds, ACTIVITY_ROW_PREFIX, persistedActivityHashes),
      syncEntityRows(groupActivities.items, groupActivities.rowIds, GROUP_ACTIVITY_ROW_PREFIX, persistedGroupActivityHashes),
      syncEntityRows(quizzes.items, quizzes.rowIds, QUIZ_ROW_PREFIX, persistedQuizHashes),
      syncEntityRows(majorExams.items, majorExams.rowIds, MAJOR_EXAM_ROW_PREFIX, persistedMajorExamHashes),
      syncEntityRows(writtenWorks.items, writtenWorks.rowIds, WRITTEN_WORK_ROW_PREFIX, persistedWrittenWorkHashes),
      syncEntityRows(gradeSettings.items, gradeSettings.rowIds, GRADE_SETTING_ROW_PREFIX, persistedGradeSettingHashes),
      syncEntityRows(gradeNotes.items, gradeNotes.rowIds, GRADE_NOTE_ROW_PREFIX, persistedGradeNoteHashes),
      syncEntityRows(requests.items, requests.rowIds, REQUEST_ROW_PREFIX, persistedRequestHashes),
      syncEntityRows(feedback.items, feedback.rowIds, FEEDBACK_ROW_PREFIX, persistedFeedbackHashes),
      syncEntityRows(schedules.items, schedules.rowIds, SCHEDULE_ROW_PREFIX, persistedScheduleHashes),
      syncEntityRows(attendanceWeeks.items, attendanceWeeks.rowIds, ATTENDANCE_WEEK_ROW_PREFIX, persistedAttendanceWeekHashes),
      syncEntityRows(subjects.items, subjects.rowIds, SUBJECT_ROW_PREFIX, persistedSubjectHashes),
      syncStringRows(sections.items, sections.rowIds, SECTION_ROW_PREFIX, persistedSectionHashes),
      syncEntityRows(studentAssistants.items, studentAssistants.rowIds, STUDENT_ASSISTANT_ROW_PREFIX, persistedStudentAssistantHashes),
      syncEntityRows(shopItems.items, shopItems.rowIds, SHOP_ITEM_ROW_PREFIX, persistedShopItemHashes),
      syncEntityRows(sales.items, sales.rowIds, SALE_ROW_PREFIX, persistedSaleHashes),
      syncEntityRows(appearanceItems.items, appearanceItems.rowIds, APPEARANCE_ITEM_ROW_PREFIX, persistedAppearanceItemHashes),
      syncEntityRows(appearanceInventory.items, appearanceInventory.rowIds, APPEARANCE_INVENTORY_ROW_PREFIX, persistedAppearanceInventoryHashes),
      syncEntityRows(appearanceGifts.items, appearanceGifts.rowIds, APPEARANCE_GIFT_ROW_PREFIX, persistedAppearanceGiftHashes),
      syncObjectRows(appearanceEquipped.items, appearanceEquipped.rowIds, APPEARANCE_EQUIPPED_ROW_PREFIX, persistedAppearanceEquippedHashes),
      syncGuildResponseRows(guildResponses.items, guildResponses.rowIds),
      syncEntityRows(auditLogs.items, auditLogs.rowIds, AUDIT_LOG_ROW_PREFIX, persistedAuditLogHashes),
      syncEntityRows(pushSubscriptions.items, pushSubscriptions.rowIds, PUSH_SUBSCRIPTION_ROW_PREFIX, persistedPushSubscriptionHashes),
      syncTransactionRows(transactions, transactionRowIds)
    ]);
    const mainHash = entityHash(dbToStore);
    if (persistedMainHash !== mainHash) {
      const { error } = await supabase
        .from(SUPABASE_STATE_TABLE)
        .upsert({ id: "main", state: dbToStore, updated_at: now() });
      if (error) throw supabaseSetupError(error);
      persistedMainHash = mainHash;
    }
    cacheDb(cacheSnapshot);
    broadcastChange();
    return;
  }
  const { db: dbToStore, files } = extractActivityFileRows(db);
  await upsertActivityFileRows(files);
  await writeLocalDb(dbToStore);
  cacheDb(dbToStore);
  broadcastChange();
}

async function readSupabaseDb() {
  const { data, error } = await supabase.from(SUPABASE_STATE_TABLE).select("state").eq("id", "main").single();
  if (error) throw supabaseSetupError(error);
  const db = data.state;
  persistedMainHash = entityHash(db);
  [
    db.students,
    db.users,
    db.attendanceRecords,
    db.recitations,
    db.activities,
    db.groupActivities,
    db.quizzes,
    db.majorExams,
    db.writtenWorks,
    db.gradeSettings,
    db.gradeNotes,
    db.requests,
    db.feedback,
    db.schedules,
    db.attendanceWeeks,
    db.subjects,
    db.sections,
    db.studentAssistants,
    db.shopItems,
    db.sales,
    db.appearanceItems,
    db.appearanceInventory,
    db.appearanceGifts,
    db.appearanceEquipped,
    db.guildSystem,
    db.auditLogs,
    db.pushSubscriptions,
    db.transactions
  ] = await Promise.all([
    readEntityRows(STUDENT_ROW_PREFIX, db.students || [], persistedStudentHashes),
    readEntityRows(USER_ROW_PREFIX, db.users || [], persistedUserHashes),
    readEntityRows(ATTENDANCE_RECORD_ROW_PREFIX, db.attendanceRecords || [], persistedAttendanceRecordHashes),
    readEntityRows(RECITATION_ROW_PREFIX, db.recitations || [], persistedRecitationHashes),
    readEntityRows(ACTIVITY_ROW_PREFIX, db.activities || [], persistedActivityHashes),
    readEntityRows(GROUP_ACTIVITY_ROW_PREFIX, db.groupActivities || [], persistedGroupActivityHashes),
    readEntityRows(QUIZ_ROW_PREFIX, db.quizzes || [], persistedQuizHashes),
    readEntityRows(MAJOR_EXAM_ROW_PREFIX, db.majorExams || [], persistedMajorExamHashes),
    readEntityRows(WRITTEN_WORK_ROW_PREFIX, db.writtenWorks || [], persistedWrittenWorkHashes),
    readEntityRows(GRADE_SETTING_ROW_PREFIX, db.gradeSettings || [], persistedGradeSettingHashes),
    readEntityRows(GRADE_NOTE_ROW_PREFIX, db.gradeNotes || [], persistedGradeNoteHashes),
    readEntityRows(REQUEST_ROW_PREFIX, db.requests || [], persistedRequestHashes),
    readEntityRows(FEEDBACK_ROW_PREFIX, db.feedback || [], persistedFeedbackHashes),
    readEntityRows(SCHEDULE_ROW_PREFIX, db.schedules || [], persistedScheduleHashes),
    readEntityRows(ATTENDANCE_WEEK_ROW_PREFIX, db.attendanceWeeks || [], persistedAttendanceWeekHashes),
    readEntityRows(SUBJECT_ROW_PREFIX, db.subjects || [], persistedSubjectHashes),
    readStringRows(SECTION_ROW_PREFIX, db.sections || [], persistedSectionHashes),
    readEntityRows(STUDENT_ASSISTANT_ROW_PREFIX, db.studentAssistants || [], persistedStudentAssistantHashes),
    readEntityRows(SHOP_ITEM_ROW_PREFIX, db.shopItems || [], persistedShopItemHashes),
    readEntityRows(SALE_ROW_PREFIX, db.sales || [], persistedSaleHashes),
    readEntityRows(APPEARANCE_ITEM_ROW_PREFIX, db.appearanceItems || [], persistedAppearanceItemHashes),
    readEntityRows(APPEARANCE_INVENTORY_ROW_PREFIX, db.appearanceInventory || [], persistedAppearanceInventoryHashes),
    readEntityRows(APPEARANCE_GIFT_ROW_PREFIX, db.appearanceGifts || [], persistedAppearanceGiftHashes),
    readObjectRows(APPEARANCE_EQUIPPED_ROW_PREFIX, db.appearanceEquipped || {}, persistedAppearanceEquippedHashes),
    readGuildResponseRows(db.guildSystem),
    readEntityRows(AUDIT_LOG_ROW_PREFIX, db.auditLogs || [], persistedAuditLogHashes),
    readEntityRows(PUSH_SUBSCRIPTION_ROW_PREFIX, db.pushSubscriptions || [], persistedPushSubscriptionHashes),
    readTransactionRows(db.transactions || [])
  ]);
  return db;
}

function activityFileRowId(activityId, studentId, fileIndex) {
  return `${ACTIVITY_FILE_ROW_PREFIX}${activityId}:${studentId}:${fileIndex}`;
}

function activityMaterialFileRowId(activityId, fileIndex) {
  return activityFileRowId(activityId, ACTIVITY_MATERIAL_OWNER, fileIndex);
}

function extractActivityFileRows(db) {
  const dbToStore = structuredClone(db);
  const files = [];
  (dbToStore.activities || []).forEach((activity) => {
    const materialFiles = activityMaterialFiles(activity);
    materialFiles.forEach((file, fileIndex) => {
      if (!file?.fileData) return;
      files.push({
        id: activityMaterialFileRowId(activity.id, fileIndex),
        state: {
          kind: "activity-material",
          activityId: activity.id,
          studentId: ACTIVITY_MATERIAL_OWNER,
          fileIndex,
          fileName: file.fileName || "",
          fileType: file.fileType || "",
          fileSize: file.fileSize || 0,
          uploadedAt: file.uploadedAt || "",
          uploadedBy: file.uploadedBy || "",
          fileData: file.fileData
        }
      });
      delete file.fileData;
    });
    (activity.submissions || []).forEach((submission) => {
      const submissionFiles = activitySubmissionFiles(submission);
      submissionFiles.forEach((file, fileIndex) => {
        if (!file?.fileData) return;
        files.push({
          id: activityFileRowId(activity.id, submission.studentId, fileIndex),
          state: {
            kind: "activity-file",
            activityId: activity.id,
            studentId: submission.studentId,
            fileIndex,
            fileName: file.fileName || "",
            fileType: file.fileType || "",
            fileSize: file.fileSize || 0,
            uploadedAt: file.uploadedAt || "",
            fileData: file.fileData
          }
        });
        delete file.fileData;
      });
      if (submission.file?.fileData) delete submission.file.fileData;
    });
  });
  return { db: dbToStore, files };
}

async function upsertActivityFileRows(files) {
  if (!files.length) return;
  if (!supabase) {
    await mkdir(localActivityFileDir, { recursive: true });
    for (const file of files) {
      const row = { ...file, updated_at: now() };
      await writeJsonAtomic(localActivityFilePath(file.id), row);
    }
    return;
  }
  for (let index = 0; index < files.length; index += 25) {
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .upsert(files.slice(index, index + 25).map((file) => ({ ...file, updated_at: now() })));
    if (error) throw supabaseSetupError(error);
  }
}

async function readActivityFileRow(activityId, studentId, fileIndex) {
  if (!supabase) {
    try {
      const row = JSON.parse(await readFile(localActivityFilePath(activityFileRowId(activityId, studentId, fileIndex)), "utf8"));
      if (row?.state?.fileStorage === "binary") {
        const bytes = await readFile(localActivityBinaryPath(row.id));
        return { ...row.state, fileData: `data:${row.state.fileType || "application/octet-stream"};base64,${bytes.toString("base64")}` };
      }
      return row?.state || null;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }
  const { data, error } = await supabase
    .from(SUPABASE_STATE_TABLE)
    .select("state")
    .eq("id", activityFileRowId(activityId, studentId, fileIndex))
    .maybeSingle();
  if (error) throw supabaseSetupError(error);
  return data?.state || null;
}

function localActivityFilePath(rowId) {
  return path.join(localActivityFileDir, `${encodeURIComponent(rowId)}.json`);
}

function localActivityBinaryPath(rowId) {
  return path.join(localActivityFileDir, `${encodeURIComponent(rowId)}.bin`);
}

async function persistMultipartActivityFiles(activityId, studentId, files, uploadedAt) {
  const metadata = files.map((file, fileIndex) => ({
    fileIndex,
    fileName: file.fileName,
    fileType: file.fileType,
    fileSize: file.fileSize,
    uploadedAt,
    fileStorage: supabase ? "row" : "binary"
  }));
  if (!supabase) {
    await mkdir(localActivityFileDir, { recursive: true });
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      const id = activityFileRowId(activityId, studentId, fileIndex);
      await rm(localActivityBinaryPath(id), { force: true });
      await rename(file.sourcePath, localActivityBinaryPath(id));
      await writeJsonAtomic(localActivityFilePath(id), { id, state: { kind: "activity-file", activityId, studentId, ...metadata[fileIndex] }, updated_at: now() });
    }
    return metadata;
  }
  return Promise.all(files.map(async (file, fileIndex) => {
    const bytes = await readFile(file.sourcePath);
    return { ...metadata[fileIndex], fileData: `data:${file.fileType};base64,${bytes.toString("base64")}` };
  }));
}

async function removeObsoleteActivityFileRows(activityId, studentId, fromIndex, previousCount) {
  if (previousCount <= fromIndex) return;
  const ids = Array.from({ length: previousCount - fromIndex }, (_, offset) => activityFileRowId(activityId, studentId, fromIndex + offset));
  if (!supabase) {
    await Promise.all(ids.flatMap((id) => [
      rm(localActivityFilePath(id), { force: true }),
      rm(localActivityBinaryPath(id), { force: true })
    ]));
    return;
  }
  const { error } = await supabase.from(SUPABASE_STATE_TABLE).delete().in("id", ids);
  if (error) throw supabaseSetupError(error);
}

async function readStorageRowsByPrefix(prefix, fields = "id,state") {
  if (!supabase) return [];
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .select(fields)
      .like("id", `${prefix}%`)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw supabaseSetupError(error);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function countStorageRowsByPrefix(prefix) {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from(SUPABASE_STATE_TABLE)
    .select("id", { count: "exact", head: true })
    .like("id", `${prefix}%`);
  if (error) throw supabaseSetupError(error);
  return count || 0;
}

function reconstructedDataCounts(db) {
  const activityFileReferences = (db.activities || []).reduce((total, activity) => (
    total + (activity.submissions || []).reduce((sum, submission) => sum + activitySubmissionFiles(submission).length, 0)
  ), 0);
  return {
    transactions: (db.transactions || []).length,
    students: (db.students || []).length,
    users: (db.users || []).length,
    attendanceRecords: (db.attendanceRecords || []).length,
    recitations: (db.recitations || []).length,
    activities: (db.activities || []).length,
    groupActivities: (db.groupActivities || []).length,
    activityFiles: activityFileReferences,
    quizzes: (db.quizzes || []).length,
    requests: (db.requests || []).length,
    feedback: (db.feedback || []).length,
    schedules: (db.schedules || []).length,
    attendanceWeeks: (db.attendanceWeeks || []).length,
    subjects: (db.subjects || []).length,
    sections: (db.sections || []).length,
    studentAssistants: (db.studentAssistants || []).length,
    shopItems: (db.shopItems || []).length,
    sales: (db.sales || []).length,
    appearanceItems: (db.appearanceItems || []).length,
    appearanceInventory: (db.appearanceInventory || []).length,
    appearanceGifts: (db.appearanceGifts || []).length,
    appearanceEquipped: Object.keys(db.appearanceEquipped || {}).length,
    guildResponses: (db.guildSystem?.responses || []).length,
    auditLogs: (db.auditLogs || []).length,
    pushSubscriptions: (db.pushSubscriptions || []).length
  };
}

async function storageHealthSummary(db) {
  const reconstructedCounts = reconstructedDataCounts(db);
  let localActivityFileCount = 0;
  if (!supabase) {
    try {
      localActivityFileCount = (await readdir(localActivityFileDir)).filter((file) => file.endsWith(".json")).length;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const rowCounts = supabase
    ? await Promise.all(STORAGE_ROW_TYPES.map((type) => countStorageRowsByPrefix(type.prefix)))
    : STORAGE_ROW_TYPES.map((type) => type.key === "activityFiles" ? localActivityFileCount : reconstructedCounts[type.key] ?? 0);
  const rows = STORAGE_ROW_TYPES.map((type, index) => {
    const visibleCount = reconstructedCounts[type.key] ?? null;
    const rowCount = rowCounts[index];
    return {
      key: type.key,
      label: type.label,
      prefix: type.prefix,
      rowCount,
      visibleCount,
      missingCount: visibleCount == null ? 0 : Math.max(0, visibleCount - rowCount)
    };
  });
  const backup = await latestBackupSummary();
  return {
    storage: supabase ? "supabase" : "file",
    table: supabase ? SUPABASE_STATE_TABLE : null,
    generatedAt: now(),
    rows,
    healthy: rows.every((row) => row.missingCount === 0),
    backup,
    reconstructedCounts,
    note: "Stored rows are compared with records currently reconstructed by the app. Extra stored rows are retained data; only missing rows are flagged."
  };
}

async function latestBackupSummary() {
  if (!supabase) {
    try {
      const files = (await readdir(path.join(dataDir, "backups")))
        .filter((file) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(file))
        .sort()
        .reverse();
      return files.length ? { available: true, date: files[0].slice(7, 17), id: files[0].replace(/\.json$/, "") } : { available: false };
    } catch {
      return { available: false };
    }
  }
  const { data, error } = await supabase
    .from(SUPABASE_STATE_TABLE)
    .select("id,updated_at")
    .like("id", "backup-%")
    .order("updated_at", { ascending: false });
  if (error) throw supabaseSetupError(error);
  const manifest = (data || []).find((row) => /^backup-\d{4}-\d{2}-\d{2}$/.test(row.id));
  return manifest
    ? { available: true, date: manifest.id.slice(7), id: manifest.id, updatedAt: manifest.updated_at }
    : { available: false };
}

function entityRowId(prefix, id) {
  return `${prefix}${id}`;
}

function entityHash(item) {
  return JSON.stringify(item);
}

function encodedRowId(prefix, id) {
  return `${prefix}${encodeURIComponent(id)}`;
}

function extractEntityRows(dbToStore, key, prefix) {
  const items = (dbToStore[key] || []).filter((item) => item?.id);
  const rowIds = new Set(items.map((item) => entityRowId(prefix, item.id)));
  dbToStore[key] = [];
  return { items, rowIds };
}

function extractStringRows(dbToStore, key, prefix) {
  const items = [...new Set((dbToStore[key] || []).map((item) => String(item || "").trim()).filter(Boolean))];
  const rowIds = new Set(items.map((item) => encodedRowId(prefix, item)));
  dbToStore[key] = [];
  return { items, rowIds };
}

function extractObjectRows(dbToStore, key, prefix) {
  const source = dbToStore[key] && typeof dbToStore[key] === "object" && !Array.isArray(dbToStore[key]) ? dbToStore[key] : {};
  const items = Object.entries(source)
    .filter(([id, value]) => id && value && typeof value === "object")
    .map(([id, value]) => ({ id, value }));
  const rowIds = new Set(items.map((item) => encodedRowId(prefix, item.id)));
  dbToStore[key] = {};
  return { items, rowIds };
}

function guildResponseRowId(studentId) {
  return `${GUILD_RESPONSE_ROW_PREFIX}${studentId}`;
}

function extractGuildResponseRows(dbToStore) {
  const responses = (dbToStore.guildSystem?.responses || []).filter((response) => response?.studentId);
  const rowIds = new Set(responses.map((response) => guildResponseRowId(response.studentId)));
  if (dbToStore.guildSystem) dbToStore.guildSystem.responses = [];
  return { items: responses, rowIds };
}

async function readEntityRows(prefix, mainItems = [], hashStore) {
  if (!supabase) return mainItems;
  const rows = await readStorageRowsByPrefix(prefix);
  const itemMap = new Map();
  hashStore.clear();
  rows.forEach((row) => {
    if (!row.state?.id) return;
    itemMap.set(row.state.id, row.state);
    hashStore.set(row.id, entityHash(row.state));
  });
  (mainItems || []).forEach((item) => {
    if (item?.id && !itemMap.has(item.id)) itemMap.set(item.id, item);
  });
  return [...itemMap.values()];
}

async function readStringRows(prefix, mainItems = [], hashStore) {
  if (!supabase) return mainItems;
  const rows = await readStorageRowsByPrefix(prefix);
  const itemSet = new Set();
  hashStore.clear();
  rows.forEach((row) => {
    const value = String(row.state?.value || row.state?.name || "").trim();
    if (!value) return;
    itemSet.add(value);
    hashStore.set(row.id, entityHash({ value }));
  });
  (mainItems || []).forEach((item) => {
    const value = String(item || "").trim();
    if (value) itemSet.add(value);
  });
  return [...itemSet].sort();
}

async function readObjectRows(prefix, mainItems = {}, hashStore) {
  if (!supabase) return mainItems;
  const rows = await readStorageRowsByPrefix(prefix);
  const itemMap = new Map();
  hashStore.clear();
  rows.forEach((row) => {
    if (!row.state?.id || !row.state?.value || typeof row.state.value !== "object") return;
    itemMap.set(row.state.id, row.state.value);
    hashStore.set(row.id, entityHash(row.state));
  });
  Object.entries(mainItems || {}).forEach(([id, value]) => {
    if (id && value && typeof value === "object" && !itemMap.has(id)) itemMap.set(id, value);
  });
  return Object.fromEntries(itemMap);
}

async function syncEntityRows(items, currentRowIds, prefix, hashStore) {
  if (!supabase) return;
  const changedRows = [];
  items.forEach((item) => {
    const id = entityRowId(prefix, item.id);
    const hash = entityHash(item);
    if (hashStore.get(id) === hash) return;
    changedRows.push({ id, state: item, updated_at: now() });
  });
  for (let index = 0; index < changedRows.length; index += 100) {
    const batch = changedRows.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .upsert(batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((row) => hashStore.set(row.id, entityHash(row.state)));
  }
  const staleIds = [...hashStore.keys()].filter((id) => id.startsWith(prefix) && !currentRowIds.has(id));
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .delete()
      .in("id", batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((id) => hashStore.delete(id));
  }
}

async function syncStringRows(items, currentRowIds, prefix, hashStore) {
  if (!supabase) return;
  const changedRows = [];
  items.forEach((item) => {
    const state = { value: item };
    const id = encodedRowId(prefix, item);
    const hash = entityHash(state);
    if (hashStore.get(id) === hash) return;
    changedRows.push({ id, state, updated_at: now() });
  });
  for (let index = 0; index < changedRows.length; index += 100) {
    const batch = changedRows.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .upsert(batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((row) => hashStore.set(row.id, entityHash(row.state)));
  }
  const staleIds = [...hashStore.keys()].filter((id) => id.startsWith(prefix) && !currentRowIds.has(id));
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .delete()
      .in("id", batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((id) => hashStore.delete(id));
  }
}

async function syncObjectRows(items, currentRowIds, prefix, hashStore) {
  if (!supabase) return;
  const changedRows = [];
  items.forEach((item) => {
    const state = { id: item.id, value: item.value };
    const id = encodedRowId(prefix, item.id);
    const hash = entityHash(state);
    if (hashStore.get(id) === hash) return;
    changedRows.push({ id, state, updated_at: now() });
  });
  for (let index = 0; index < changedRows.length; index += 100) {
    const batch = changedRows.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .upsert(batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((row) => hashStore.set(row.id, entityHash(row.state)));
  }
  const staleIds = [...hashStore.keys()].filter((id) => id.startsWith(prefix) && !currentRowIds.has(id));
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .delete()
      .in("id", batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((id) => hashStore.delete(id));
  }
}

async function readGuildResponseRows(guildSystem = defaultGuildSystem()) {
  if (!supabase) return guildSystem;
  const rows = await readStorageRowsByPrefix(GUILD_RESPONSE_ROW_PREFIX);
  const responseMap = new Map();
  persistedGuildResponseHashes.clear();
  rows.forEach((row) => {
    if (!row.state?.studentId) return;
    responseMap.set(row.state.studentId, row.state);
    persistedGuildResponseHashes.set(row.id, entityHash(row.state));
  });
  (guildSystem?.responses || []).forEach((response) => {
    if (response?.studentId && !responseMap.has(response.studentId)) responseMap.set(response.studentId, response);
  });
  return { ...(guildSystem || defaultGuildSystem()), responses: [...responseMap.values()] };
}

async function syncGuildResponseRows(responses, currentRowIds) {
  if (!supabase) return;
  const changedRows = [];
  responses.forEach((response) => {
    const id = guildResponseRowId(response.studentId);
    const hash = entityHash(response);
    if (persistedGuildResponseHashes.get(id) === hash) return;
    changedRows.push({ id, state: response, updated_at: now() });
  });
  for (let index = 0; index < changedRows.length; index += 100) {
    const batch = changedRows.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .upsert(batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((row) => persistedGuildResponseHashes.set(row.id, entityHash(row.state)));
  }
  const staleIds = [...persistedGuildResponseHashes.keys()].filter((id) => !currentRowIds.has(id));
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .delete()
      .in("id", batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((id) => persistedGuildResponseHashes.delete(id));
  }
}

function transactionRowId(transactionId) {
  return `${TRANSACTION_ROW_PREFIX}${transactionId}`;
}

function transactionHash(transaction) {
  return JSON.stringify(transaction);
}

function extractTransactionRows(dbToStore) {
  const transactions = (dbToStore.transactions || []).filter((transaction) => transaction?.id);
  const transactionRowIds = new Set(transactions.map((transaction) => transactionRowId(transaction.id)));
  dbToStore.transactions = [];
  return { transactions, transactionRowIds };
}

async function readTransactionRows(mainTransactions = []) {
  if (!supabase) return mainTransactions;
  const rows = await readStorageRowsByPrefix(TRANSACTION_ROW_PREFIX);
  const transactionMap = new Map();
  persistedTransactionHashes.clear();
  rows.forEach((row) => {
    if (!row.state?.id) return;
    transactionMap.set(row.state.id, row.state);
    persistedTransactionHashes.set(row.id, transactionHash(row.state));
  });
  (mainTransactions || []).forEach((transaction) => {
    if (transaction?.id && !transactionMap.has(transaction.id)) transactionMap.set(transaction.id, transaction);
  });
  return [...transactionMap.values()];
}

async function syncTransactionRows(transactions, currentRowIds) {
  if (!supabase) return;
  const changedRows = [];
  transactions.forEach((transaction) => {
    const id = transactionRowId(transaction.id);
    const hash = transactionHash(transaction);
    if (persistedTransactionHashes.get(id) === hash) return;
    changedRows.push({ id, state: transaction, updated_at: now() });
  });
  for (let index = 0; index < changedRows.length; index += 100) {
    const batch = changedRows.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .upsert(batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((row) => persistedTransactionHashes.set(row.id, transactionHash(row.state)));
  }
  const staleIds = [...persistedTransactionHashes.keys()].filter((id) => !currentRowIds.has(id));
  for (let index = 0; index < staleIds.length; index += 100) {
    const batch = staleIds.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .delete()
      .in("id", batch);
    if (error) throw supabaseSetupError(error);
    batch.forEach((id) => persistedTransactionHashes.delete(id));
  }
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword, studentId: user.studentId, subjectIds: user.subjectIds || [], sectionIds: user.sectionIds || [] };
}

const rateLimitBuckets = new Map();

function rateLimit({ windowMs, max, prefix, key = (req) => req.ip }) {
  return (req, res, next) => {
    const nowMs = Date.now();
    const bucketKey = `${prefix}:${key(req) || "unknown"}`;
    let bucket = rateLimitBuckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= nowMs) bucket = { count: 0, resetAt: nowMs + windowMs };
    bucket.count += 1;
    rateLimitBuckets.set(bucketKey, bucket);
    if (bucket.count > max) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)));
      return res.status(429).json({ error: "Too many attempts. Please wait and try again." });
    }
    if (rateLimitBuckets.size > 5000) {
      for (const [storedKey, stored] of rateLimitBuckets.entries()) {
        if (stored.resetAt <= nowMs) rateLimitBuckets.delete(storedKey);
      }
    }
    return next();
  };
}

const loginIpLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 1200, prefix: "login-ip" });
const loginFailureBuckets = new Map();

function recordLoginFailure(req, username) {
  const nowMs = Date.now();
  const keys = [`account:${username}`, `ip:${req.ip || "unknown"}`];
  let highestCount = 0;
  keys.forEach((key) => {
    let bucket = loginFailureBuckets.get(key);
    if (!bucket || bucket.resetAt <= nowMs) bucket = { count: 0, resetAt: nowMs + 15 * 60 * 1000 };
    bucket.count += 1;
    loginFailureBuckets.set(key, bucket);
    highestCount = Math.max(highestCount, bucket.count);
  });
  if (loginFailureBuckets.size > 5000) {
    for (const [key, bucket] of loginFailureBuckets.entries()) {
      if (bucket.resetAt <= nowMs) loginFailureBuckets.delete(key);
    }
  }
  return Math.min(1500, Math.max(0, highestCount - 3) * 150);
}

function clearLoginFailures(username) {
  loginFailureBuckets.delete(`account:${username}`);
}
const registrationLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 250, prefix: "registration-ip" });
const registrationAccountLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  prefix: "registration-account",
  key: (req) => `${String(req.body?.surname || "").trim().toLowerCase()}:${String(req.body?.firstName || "").trim().toLowerCase()}`
});
const authenticatedMutationLimit = rateLimit({ windowMs: 60 * 1000, max: 300, prefix: "mutation", key: (req) => req.user?.id });
const assistantLimit = rateLimit({ windowMs: 5 * 60 * 1000, max: 30, prefix: "assistant", key: (req) => req.user?.id });

function objectMentionsStudent(value, studentId) {
  if (value == null) return false;
  if (typeof value !== "object") return value === studentId;
  if (Array.isArray(value)) return value.some((entry) => objectMentionsStudent(entry, studentId));
  return Object.entries(value).some(([key, entry]) => {
    const lowerKey = key.toLowerCase();
    return (lowerKey.endsWith("studentid") || lowerKey === "studentid") && entry === studentId
      ? true
      : objectMentionsStudent(entry, studentId);
  });
}

function purgeStudentData(db, studentId) {
  const studentUserIds = new Set(db.users.filter((user) => user.studentId === studentId).map((user) => user.id));
  db.students = db.students.filter((student) => student.id !== studentId);
  db.users = db.users.filter((user) => user.studentId !== studentId);
  db.pushSubscriptions = (db.pushSubscriptions || []).filter((subscription) => !studentUserIds.has(subscription.userId));
  db.transactions = (db.transactions || []).filter((transaction) =>
    transaction.studentId !== studentId
    && !studentUserIds.has(transaction.createdBy)
    && !objectMentionsStudent(transaction.meta, studentId)
  );
  db.attendanceRecords = (db.attendanceRecords || []).filter((record) => record.studentId !== studentId);
  db.recitations = (db.recitations || []).filter((recitation) => recitation.studentId !== studentId);
  db.feedback = (db.feedback || []).filter((entry) => entry.studentId !== studentId);
  db.requests = (db.requests || []).filter((request) =>
    request.studentId !== studentId
    && !studentUserIds.has(request.createdBy)
    && !objectMentionsStudent(request.payload, studentId)
  );
  db.appearanceInventory = (db.appearanceInventory || []).filter((entry) => entry.studentId !== studentId && entry.fromStudentId !== studentId);
  db.appearanceGifts = (db.appearanceGifts || []).filter((gift) => gift.fromStudentId !== studentId && gift.toStudentId !== studentId);
  if (db.guildSystem) db.guildSystem.responses = (db.guildSystem.responses || []).filter((response) => response.studentId !== studentId);
  if (db.appearanceEquipped) delete db.appearanceEquipped[studentId];
  (db.activities || []).forEach((activity) => {
    activity.submissions = (activity.submissions || []).filter((submission) => submission.studentId !== studentId);
  });
  (db.groupActivities || []).forEach((activity) => {
    activity.votes = (activity.votes || []).filter((vote) => vote.studentId !== studentId && vote.candidateId !== studentId);
    (activity.guildResults || []).forEach((result) => {
      if (result.leaderId === studentId) {
        result.leaderId = "";
        result.teacherScore = null;
        result.memberGrades = {};
      } else if (result.memberGrades) {
        delete result.memberGrades[studentId];
      }
    });
  });
  (db.quizzes || []).forEach((quiz) => {
    quiz.submissions = (quiz.submissions || []).filter((submission) => submission.studentId !== studentId);
    quiz.retakeStudentIds = (quiz.retakeStudentIds || []).filter((id) => id !== studentId);
  });
  (db.majorExams || []).forEach((exam) => {
    if (exam.scores && typeof exam.scores === "object") delete exam.scores[studentId];
  });
  (db.writtenWorks || []).forEach((work) => {
    if (work.scores && typeof work.scores === "object") delete work.scores[studentId];
  });
  db.gradeNotes = (db.gradeNotes || []).filter((note) => note.studentId !== studentId);
  reconcileGroupActivities(db);
}

function purgeOrphanStudentUsers(db) {
  const studentIds = new Set((db.students || []).map((student) => student.id));
  const before = db.users.length;
  db.users = db.users.filter((user) => user.role !== "student" || !user.studentId || studentIds.has(user.studentId));
  return db.users.length !== before;
}

function sign(user) {
  return jwt.sign(
    { ...publicUser(user), authVersion: Number(user.authVersion || 0) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" }
  );
}

async function auth(req, res, next) {
  let decoded;
  try {
    const authorization = String(req.headers.authorization || "");
    if (!authorization.startsWith("Bearer ")) throw new Error("Missing bearer token");
    decoded = jwt.verify(authorization.slice(7), JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
  await dbWriteQueue.catch(() => {});
  if (!cachedDbIsFresh() || !cachedAuthUsers.size) await readDb();
  const currentUser = cachedAuthUsers.get(decoded.id);
  if (!currentUser || Number(currentUser.authVersion || 0) !== Number(decoded.authVersion || 0)) return res.status(401).json({ error: "Session expired. Please log in again." });
  req.user = publicUser(currentUser);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return authenticatedMutationLimit(req, res, next);
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });
}

function requireStaffOrAssistant(req, res, next) {
  if (req.user.role === "admin" || req.user.role === "teacher") return next();
  if (req.user.role === "student") return next();
  return res.status(403).json({ error: "Forbidden" });
}

async function getPushConfig() {
  if (pushConfigPromise) return pushConfigPromise;
  pushConfigPromise = (async () => {
    let publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
    let privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
    if ((!publicKey || !privateKey) && supabase) {
      const { data, error } = await supabase
        .from(SUPABASE_STATE_TABLE)
        .select("state")
        .eq("id", PUSH_CONFIG_ROW_ID)
        .maybeSingle();
      if (error) throw supabaseSetupError(error);
      publicKey = String(data?.state?.publicKey || "");
      privateKey = String(data?.state?.privateKey || "");
      if (!publicKey || !privateKey) {
        const generated = webpush.generateVAPIDKeys();
        const inserted = await supabase.from(SUPABASE_STATE_TABLE).insert({
          id: PUSH_CONFIG_ROW_ID,
          state: { publicKey: generated.publicKey, privateKey: generated.privateKey, createdAt: now() },
          updated_at: now()
        });
        if (inserted.error && inserted.error.code !== "23505") throw supabaseSetupError(inserted.error);
        if (inserted.error?.code === "23505") {
          const existing = await supabase.from(SUPABASE_STATE_TABLE).select("state").eq("id", PUSH_CONFIG_ROW_ID).single();
          if (existing.error) throw supabaseSetupError(existing.error);
          publicKey = String(existing.data?.state?.publicKey || "");
          privateKey = String(existing.data?.state?.privateKey || "");
        } else {
          publicKey = generated.publicKey;
          privateKey = generated.privateKey;
        }
      }
    }
    if (!publicKey || !privateKey) return null;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://jcoins-zeta.vercel.app", publicKey, privateKey);
    return { publicKey };
  })().catch((error) => {
    pushConfigPromise = null;
    console.error("Push configuration failed:", error.message);
    return null;
  });
  return pushConfigPromise;
}

function cleanPushSubscription(input = {}) {
  const endpoint = String(input.endpoint || "").trim();
  const p256dh = String(input.keys?.p256dh || "").trim();
  const authKey = String(input.keys?.auth || "").trim();
  if (!endpoint.startsWith("https://") || endpoint.length > 2000 || !p256dh || !authKey) throw new Error("Invalid push subscription.");
  return {
    endpoint,
    expirationTime: input.expirationTime || null,
    keys: { p256dh: p256dh.slice(0, 500), auth: authKey.slice(0, 500) }
  };
}

function pushSubscriptionId(endpoint) {
  return `push_${createHash("sha256").update(endpoint).digest("hex").slice(0, 32)}`;
}

function queuePushToUsers(db, userIds, notification) {
  const targets = new Set((userIds || []).filter(Boolean));
  const subscriptions = (db.pushSubscriptions || []).filter((subscription) => targets.has(subscription.userId));
  if (!subscriptions.length) return;
  const payload = JSON.stringify({
    title: String(notification.title || "JCoins").slice(0, 80),
    body: String(notification.body || "You have a new JCoins notification.").slice(0, 180),
    url: String(notification.url || "/").startsWith("/") ? String(notification.url || "/") : "/",
    tag: String(notification.tag || "jcoins-update").slice(0, 80)
  });
  setTimeout(async () => {
    if (!await getPushConfig()) return;
    await Promise.allSettled(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 60 * 60, urgency: "normal" });
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) stalePushSubscriptionIds.add(subscription.id);
        else console.error(`Push delivery failed [${subscription.id}]:`, error.message);
      }
    }));
  }, 0);
}

function userIdsForStudents(db, studentIds) {
  const targets = new Set(studentIds || []);
  return db.users.filter((user) => user.studentId && targets.has(user.studentId)).map((user) => user.id);
}

function staffUserIdsForStudent(db, studentId) {
  const student = db.students.find((item) => item.id === studentId);
  if (!student) return db.users.filter((user) => user.role === "admin").map((user) => user.id);
  const subjects = new Set(student.subjectIds || []);
  return db.users.filter((user) => user.role === "admin" || (user.role === "teacher"
    && (user.subjectIds || []).some((id) => subjects.has(id))
    && (!(user.sectionIds || []).length || user.sectionIds.includes(student.section)))).map((user) => user.id);
}

function activeStudentAssistant(db, user, date = new Date()) {
  if (user.role !== "student" || !user.studentId) return null;
  const target = date instanceof Date ? date : new Date(date || now());
  return (db.studentAssistants || []).find((assignment) =>
    assignment.studentId === user.studentId
    && assistantAssignmentIsActive(assignment, target)
  ) || null;
}

function assistantScopeStudents(db, assignment) {
  if (!assignment) return [];
  const section = String(assignment.section || "").trim();
  const irregularIds = new Set((db.guildSystem?.classMemberships || [])
    .filter((membership) => String(membership.section || "").trim() === section)
    .map((membership) => membership.studentId));
  return hydrateStudents(db).filter((student) => student.section === section || irregularIds.has(student.id));
}

function scopeStudents(db, user) {
  const hydrated = hydrateStudents(db);
  if (user.role === "admin" || user.role === "display") return hydrated;
  if (user.role === "student") return hydrated.filter((s) => s.id === user.studentId);
  const subjects = new Set(user.subjectIds || []);
  const sections = new Set(user.sectionIds || []);
  return hydrated.filter((s) => {
    const regular = (s.subjectIds || []).some((id) => subjects.has(id)) && (!sections.size || sections.has(s.section));
    if (regular) return true;
    return (db.guildSystem?.classMemberships || []).some((membership) =>
      membership.studentId === s.id
      && subjects.has(membership.subjectId)
      && (!sections.size || sections.has(String(membership.section || "").trim()))
    );
  });
}

function scopedStudentIds(db, user) {
  return new Set(scopeStudents(db, user).map((student) => student.id));
}

function actionScopeStudents(db, user) {
  if (user.role === "student") return assistantScopeStudents(db, activeStudentAssistant(db, user));
  return scopeStudents(db, user);
}

function actionScopedStudentIds(db, user) {
  return new Set(actionScopeStudents(db, user).map((student) => student.id));
}

function canUseSubjectForAction(db, user, subjectId) {
  if (user.role !== "student") return canUseSubject(user, subjectId);
  return actionScopeStudents(db, user).some((student) => (student.subjectIds || []).includes(subjectId));
}

function ensureAssistantAccess(db, user) {
  if (user.role !== "student") return null;
  const assignment = activeStudentAssistant(db, user);
  if (!assignment) throw new Error("You are not the active student assistant this week.");
  return assignment;
}

function assistantCanUseDate(user, assignment, date) {
  if (user.role !== "student") return true;
  const target = String(date || localDate()).slice(0, 10);
  return !!assignment && assistantAssignmentStartDate(assignment) <= target && assistantAssignmentFinishDate(assignment) >= target;
}

function normalizeStudentAssistantAssignment(assignment) {
  const previous = JSON.stringify([assignment.startAt, assignment.finishAt, assignment.weekStart, assignment.weekEnd, assignment.rewardStartsOn, assignment.dailyReward]);
  const legacyStart = String(assignment.weekStart || localDate()).slice(0, 10);
  const legacyEnd = String(assignment.weekEnd || legacyStart).slice(0, 10);
  const start = validDate(assignment.startAt) || new Date(`${legacyStart}T00:00:00+08:00`);
  const finish = validDate(assignment.finishAt) || new Date(`${legacyEnd}T23:59:59+08:00`);
  assignment.startAt = start.toISOString();
  assignment.finishAt = finish.toISOString();
  assignment.weekStart = localDate(start);
  assignment.weekEnd = localDate(finish);
  assignment.rewardStartsOn ||= assignment.createdAt && assignment.startAt === assignment.createdAt ? assignment.weekStart : localDate();
  assignment.dailyReward = STUDENT_ASSISTANT_DAILY_REWARD;
  return previous !== JSON.stringify([assignment.startAt, assignment.finishAt, assignment.weekStart, assignment.weekEnd, assignment.rewardStartsOn, assignment.dailyReward]);
}

function validDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function assistantAssignmentStartDate(assignment) {
  return localDate(validDate(assignment.startAt) || new Date(`${assignment.weekStart}T00:00:00+08:00`));
}

function assistantAssignmentFinishDate(assignment) {
  return localDate(validDate(assignment.finishAt) || new Date(`${assignment.weekEnd}T23:59:59+08:00`));
}

function assistantAssignmentIsActive(assignment, at = new Date()) {
  const target = at instanceof Date ? at : new Date(at);
  const start = validDate(assignment.startAt) || new Date(`${assignment.weekStart}T00:00:00+08:00`);
  const finish = validDate(assignment.finishAt) || new Date(`${assignment.weekEnd}T23:59:59+08:00`);
  return !Number.isNaN(target.getTime()) && start <= target && finish >= target;
}

function grantStudentAssistantDailyRewards(db, at = new Date()) {
  const existingKeys = new Set((db.transactions || []).filter((transaction) => transaction.meta?.kind === "student-assistant-daily")
    .map((transaction) => `${transaction.meta.assignmentId}:${transaction.meta.rewardDate}`));
  let granted = 0;
  for (const assignment of db.studentAssistants || []) {
    normalizeStudentAssistantAssignment(assignment);
    const start = validDate(assignment.startAt);
    const finish = validDate(assignment.finishAt);
    if (!start || !finish || start > at || !db.students.some((student) => student.id === assignment.studentId)) continue;
    const firstDate = [assistantAssignmentStartDate(assignment), assignment.rewardStartsOn || assistantAssignmentStartDate(assignment)].sort().at(-1);
    const lastDate = [assistantAssignmentFinishDate(assignment), localDate(at)].sort()[0];
    for (const rewardDate of dateRange(firstDate, lastDate)) {
      const key = `${assignment.id}:${rewardDate}`;
      if (existingKeys.has(key)) continue;
      db.transactions.push(tx(assignment.studentId, "student_assistant", STUDENT_ASSISTANT_DAILY_REWARD, `Student assistant reward - ${rewardDate}`, now(), "system", {
        kind: "student-assistant-daily",
        assignmentId: assignment.id,
        rewardDate,
        section: assignment.section
      }));
      existingKeys.add(key);
      granted += 1;
    }
  }
  return granted;
}

function dateRange(startText, endText) {
  if (!startText || !endText || startText > endText) return [];
  const dates = [];
  const cursor = new Date(`${startText}T00:00:00Z`);
  const end = new Date(`${endText}T00:00:00Z`);
  while (cursor <= end && dates.length < 370) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function addIsoDays(dateText, amount) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function mondayForDate(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addIsoDays(dateText, -daysSinceMonday);
}

function scheduledAttendanceWeekTitle(weekStart) {
  const date = new Date(`${weekStart}T00:00:00Z`);
  return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

function syncScheduledAttendanceWeeks(db, referenceDate = localDate()) {
  const weekStart = mondayForDate(referenceDate);
  const weekEnd = addIsoDays(weekStart, 6);
  const groups = new Map();
  (db.schedules || [])
    .filter((schedule) => String(schedule.type || "Class").trim().toLowerCase() === "class")
    .filter((schedule) => schedule.subjectId && schedule.section && dayOrder.includes(schedule.day))
    .forEach((schedule) => {
      const key = `${schedule.subjectId}|${schedule.section}`;
      if (!groups.has(key)) groups.set(key, { subjectId: schedule.subjectId, section: schedule.section, days: new Set() });
      groups.get(key).days.add(schedule.day);
    });
  const sectionCountBySubject = new Map();
  groups.forEach((group) => {
    if (!sectionCountBySubject.has(group.subjectId)) sectionCountBySubject.set(group.subjectId, new Set());
    sectionCountBySubject.get(group.subjectId).add(group.section);
  });
  let changes = 0;
  groups.forEach((group) => {
    const scheduledDates = [...group.days]
      .map((day) => addIsoDays(weekStart, dayOrder.indexOf(day)))
      .sort();
    let week = db.attendanceWeeks.find((item) =>
      item.scheduleWeekStart === weekStart
      && item.subjectId === group.subjectId
      && item.section === group.section
    );
    if (!week && sectionCountBySubject.get(group.subjectId)?.size === 1) {
      week = db.attendanceWeeks.find((item) =>
        item.subjectId === group.subjectId
        && !item.section
        && !item.scheduleWeekStart
        && (item.dates || []).some((date) => date >= weekStart && date <= weekEnd)
      );
      if (week) {
        week.section = group.section;
        week.scheduleWeekStart = weekStart;
        week.scheduleLinked = true;
        changes += 1;
      }
    }
    if (!week) {
      week = {
        id: randomUUID(),
        subjectId: group.subjectId,
        section: group.section,
        title: scheduledAttendanceWeekTitle(weekStart),
        dates: scheduledDates,
        cancelledDates: [],
        scheduleWeekStart: weekStart,
        scheduleLinked: true,
        autoCreated: true,
        createdAt: now(),
        createdBy: "system"
      };
      db.attendanceWeeks.push(week);
      changes += 1;
      return;
    }
    const nextDates = [...new Set([...(week.dates || []), ...scheduledDates])].sort();
    if (JSON.stringify(nextDates) !== JSON.stringify(week.dates || [])) {
      week.dates = nextDates;
      changes += 1;
    }
    week.cancelledDates ||= [];
  });
  return changes;
}

function canUseSubject(user, subjectId) {
  return user.role === "admin" || (user.subjectIds || []).includes(subjectId);
}

function subjectName(db, id) {
  return db.subjects.find((s) => s.id === id)?.name || "Unknown";
}

function subjectByNameOrId(db, value) {
  const key = String(value || "").trim().toLowerCase();
  return db.subjects.find((subject) => subject.id.toLowerCase() === key || subject.name.toLowerCase() === key);
}

function studentName(db, id) {
  return db.students.find((s) => s.id === id)?.name || "Unknown";
}

function canUseSection(user, section = "") {
  if (user.role === "admin") return true;
  const sectionIds = new Set(user.sectionIds || []);
  return !sectionIds.size || sectionIds.has(section || "");
}

function canUseActivity(user, activity) {
  return canUseSubject(user, activity.subjectId) && (!activity.section || canUseSection(user, activity.section));
}

function appearanceItem(db, itemId) {
  return db.appearanceItems.find((item) => item.id === itemId);
}

function ownsAppearance(db, studentId, itemId) {
  return db.appearanceInventory.some((entry) => entry.studentId === studentId && entry.itemId === itemId);
}

function studentCoins(db, studentId) {
  return db.transactions.filter((t) => t.studentId === studentId).reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

function studentSurnameFromName(name) {
  const text = String(name || "").trim();
  if (!text) return "student assistant";
  if (text.includes(",")) return text.split(",")[0].trim() || "student assistant";
  return text.split(/\s+/)[0] || "student assistant";
}

function assistantCreditRemark(db, user, remarks = "") {
  const base = String(remarks || "").trim();
  if (user.role !== "student") return base;
  const assistant = db.students.find((student) => student.id === user.studentId);
  const credit = `given by ${studentSurnameFromName(assistant?.name)}`;
  return base ? `${base} | ${credit}` : credit;
}

function equippedAppearance(db, studentId) {
  const equipped = db.appearanceEquipped?.[studentId] || {};
  const entries = Object.fromEntries(appearanceTypes.map((type) => {
    const item = appearanceItem(db, equipped[type]);
    return [type, item ? { id: item.id, name: item.name, type: item.type, styleClass: item.styleClass, tier: item.tier, icon: item.icon || "" } : null];
  }));
  const classes = Object.values(entries).filter(Boolean).map((item) => item.styleClass);
  return { equipped, items: entries, classes };
}

function appearanceGiftRows(db, studentId = null) {
  return db.appearanceGifts
    .filter((gift) => !studentId || gift.fromStudentId === studentId || gift.toStudentId === studentId)
    .map((gift) => ({
      ...gift,
      itemName: appearanceItem(db, gift.itemId)?.name || "Unknown Item",
      fromStudentName: studentName(db, gift.fromStudentId),
      toStudentName: studentName(db, gift.toStudentId)
    }))
    .sort(byDateDesc);
}

function requestRows(db, requests) {
  return requests.map((request) => {
    const payload = request.payload || {};
    const publicPayload = request.type === "registration"
      ? { ...payload, passwordHash: undefined, subjectNames: (payload.subjectIds || []).map((subjectId) => subjectName(db, subjectId)) }
      : payload;
    const trade = request.type === "trade" ? tradeRequestParticipants(request) : null;
    return {
      ...request,
      payload: publicPayload,
      studentName: request.type === "registration" ? payload.fullName || "New student" : studentName(db, request.studentId),
      fromStudentName: studentName(db, request.studentId),
      itemName: payload.itemId ? activeShopPrice(db, payload.itemId)?.name || "Unknown Item" : "",
      toStudentName: payload.toStudentId ? studentName(db, payload.toStudentId) : "",
      tradeSenderName: trade ? studentName(db, trade.senderId) : "",
      tradeRecipientName: trade ? studentName(db, trade.recipientId) : ""
    };
  });
}

function actorName(db, actorId) {
  if (!actorId || actorId === "system") return "system";
  const user = db.users.find((item) => item.id === actorId);
  if (!user) return actorId;
  return user.studentId ? `${user.username} (${studentName(db, user.studentId)})` : user.username;
}

function auditLogRows(db, logs = db.auditLogs || []) {
  return [...logs]
    .sort(byDateDesc)
    .map((log) => ({
      ...log,
      actorName: log.actorName || actorName(db, log.actorId),
      targetStudentName: log.targetStudentId ? studentName(db, log.targetStudentId) : "",
      amount: log.amount == null ? "" : log.amount
    }));
}

function scopedAuditLogs(db, user, studentIds, subjectIds, sectionIds) {
  if (user.role === "admin") return db.auditLogs || [];
  if (user.role !== "teacher") return [];
  return (db.auditLogs || []).filter((log) => {
    const targets = new Set([log.targetStudentId, log.actorStudentId, ...(log.meta?.targetStudentIds || [])].filter(Boolean));
    return log.actorId === user.id
      || [...targets].some((studentId) => studentIds.has(studentId))
      || (!!log.meta?.subjectId && subjectIds?.has(log.meta.subjectId))
      || (!!log.meta?.section && (!sectionIds?.size || sectionIds.has(log.meta.section)));
  });
}

function addAuditLog(db, user, action, details = {}) {
  if (currentMutationRequest) currentMutationRequest.auditRecorded = true;
  db.auditLogs ||= [];
  db.auditLogs.push({
    id: randomUUID(),
    action,
    entityType: details.entityType || "",
    entityId: details.entityId || "",
    targetStudentId: details.targetStudentId || "",
    amount: details.amount ?? null,
    summary: String(details.summary || action).slice(0, 500),
    meta: details.meta || {},
    actorId: user?.id || "system",
    actorRole: user?.role || "system",
    actorStudentId: user?.studentId || "",
    createdAt: now()
  });
  if (db.auditLogs.length > 5000) db.auditLogs.splice(0, db.auditLogs.length - 5000);
}

function recordAutomaticAuditLog(db, req) {
  if (!req || req.auditRecorded || !["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
  const action = automaticAuditAction(req);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const activity = req.params?.id ? db.activities?.find((item) => item.id === req.params.id) : null;
  const quiz = req.params?.id ? db.quizzes?.find((item) => item.id === req.params.id) : null;
  const schedule = req.params?.id ? db.schedules?.find((item) => item.id === req.params.id) : null;
  const week = body.weekId ? db.attendanceWeeks?.find((item) => item.id === body.weekId) : null;
  const targetStudentIds = [...new Set([
    ...(Array.isArray(body.studentIds) ? body.studentIds : []),
    body.studentId,
    req.user?.role === "student" ? req.user.studentId : ""
  ].filter(Boolean))].slice(0, 300);
  const subjectId = body.subjectId || activity?.subjectId || quiz?.subjectId || schedule?.subjectId || week?.subjectId || "";
  const section = body.section || activity?.section || quiz?.section || schedule?.section || "";
  const count = targetStudentIds.length || Number(body.createdCount || 0) || undefined;
  addAuditLog(db, req.user, action, {
    entityType: action.split(".")[0],
    entityId: req.params?.id || "",
    targetStudentId: targetStudentIds.length === 1 ? targetStudentIds[0] : "",
    amount: body.amount == null ? null : Number(body.amount),
    summary: automaticAuditSummary(action, count),
    meta: {
      method: req.method,
      path: String(req.route?.path || req.path || "").replace(/^\/api\//, ""),
      subjectId,
      section,
      targetStudentIds,
      count: count || 0,
      type: String(body.type || "").slice(0, 80),
      status: String(body.status || "").slice(0, 80)
    }
  });
}

function automaticAuditAction(req) {
  const path = String(req.route?.path || req.path || "").toLowerCase();
  const operation = req.method === "DELETE" ? "delete" : req.method === "POST" ? "create" : "update";
  if (path.includes("/activities/") && path.endsWith("/submit")) return "activity.submit";
  if (path.includes("/quizzes/") && path.endsWith("/start")) return "quiz.start";
  if (path.includes("/quizzes/") && path.endsWith("/submit")) return "quiz.submit";
  if (path.includes("/quizzes/") && path.endsWith("/publish")) return "quiz.publish";
  if (path.includes("/quizzes/") && path.endsWith("/close")) return "quiz.close";
  if (path.includes("/attendance/")) return `attendance.${operation}`;
  if (path.includes("/recitation")) return `recitation.${operation}`;
  if (path.includes("/activities")) return `activity.${operation}`;
  if (path.includes("/quizzes")) return `quiz.${operation}`;
  if (path.includes("/student-assistants")) return `student_assistant.${operation}`;
  if (path.includes("/transactions")) return `transaction.${operation}`;
  if (path.includes("/appearance")) return `appearance.${operation}`;
  if (path.includes("/shop")) return `shop.${operation}`;
  if (path.includes("/requests")) return `request.${operation}`;
  if (path.includes("/feedback")) return `feedback.${operation}`;
  if (path.includes("/schedules")) return `schedule.${operation}`;
  if (path.includes("/sections")) return `section.${operation}`;
  if (path.includes("/subjects")) return `subject.${operation}`;
  if (path.includes("/students")) return `student.${operation}`;
  if (path.includes("/users") || path.includes("/auth/")) return `account.${operation}`;
  if (path.includes("/settings")) return `settings.${operation}`;
  if (path.includes("/guild")) return `guild.${operation}`;
  if (path.includes("/push")) return `notification.${operation}`;
  return `system.${operation}`;
}

function automaticAuditSummary(action, count) {
  const [entity, operation] = action.split(".");
  const labels = {
    student_assistant: "student assistant",
    activity: "activity",
    attendance: "attendance",
    recitation: "recitation",
    quiz: "quiz",
    transaction: "transaction",
    appearance: "appearance",
    shop: "shop",
    request: "request",
    feedback: "feedback",
    schedule: "schedule",
    section: "section",
    subject: "subject",
    student: "student",
    account: "account",
    settings: "settings",
    guild: "guild",
    notification: "notification",
    system: "system"
  };
  const verbs = { create: "Created", update: "Updated", delete: "Deleted", submit: "Submitted", start: "Started", publish: "Published", close: "Closed" };
  return `${verbs[operation] || "Changed"} ${count > 1 ? `${count} ` : ""}${labels[entity] || entity}${count > 1 ? " records" : ""}.`;
}

function tradeRequestParticipants(request) {
  const payload = request.payload || {};
  const requesterId = request.studentId;
  const peerId = payload.toStudentId;
  if (payload.requesterRole === "recipient") return { senderId: peerId, recipientId: requesterId };
  return { senderId: requesterId, recipientId: peerId };
}

function formatStudentFullName({ surname, firstName, middleName }) {
  const last = String(surname || "").trim().replace(/\s+/g, " ").toUpperCase();
  const first = String(firstName || "").trim().replace(/\s+/g, " ").toUpperCase();
  const middle = String(middleName || "").trim().replace(/\s+/g, " ").toUpperCase();
  return `${last}, ${[first, middle].filter(Boolean).join(" ")}`.trim();
}

function normalizeStudentName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeStudentQuizCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(-4);
  return digits.length === 4 ? `JCS${digits}` : "";
}

function studentQuizCodeDigits(student) {
  const hash = createHash("sha256").update(String(student.id || student.name || randomUUID())).digest("hex");
  return String((parseInt(hash.slice(0, 8), 16) % 9000) + 1000);
}

function assignStudentQuizCodes(db) {
  const used = new Set();
  let changed = false;
  (db.students || []).forEach((student, index) => {
    const existing = normalizeStudentQuizCode(student.quizCode);
    if (existing && !used.has(existing)) {
      if (student.quizCode !== existing) {
        student.quizCode = existing;
        changed = true;
      }
      used.add(existing);
      return;
    }
    let digits = studentQuizCodeDigits(student);
    for (let offset = 0; offset < 9000; offset++) {
      const candidate = `JCS${String(((Number(digits) - 1000 + index + offset) % 9000) + 1000).padStart(4, "0")}`;
      if (!used.has(candidate)) {
        student.quizCode = candidate;
        used.add(candidate);
        changed = true;
        return;
      }
    }
  });
  return changed;
}

function studentRegistrationUsername({ surname, firstName }) {
  const clean = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `${clean(surname)}.${clean(firstName)}`;
}

function canUseRequest(db, user, request) {
  if (user.role === "admin") return true;
  if (request.type === "registration") {
    const payload = request.payload || {};
    const subjectIds = Array.isArray(payload.subjectIds) ? payload.subjectIds : [];
    return canUseSection(user, payload.section) && subjectIds.every((subjectId) => canUseSubject(user, subjectId));
  }
  if (!request.studentId) return true;
  if (user.role === "student" && request.type === "trade" && request.payload?.toStudentId === user.studentId) return true;
  if (request.type === "trade" && request.payload?.toStudentId && scopedStudentIds(db, user).has(request.payload.toStudentId)) return true;
  return scopedStudentIds(db, user).has(request.studentId);
}

function feedbackRows(db, feedback) {
  return feedback.map((entry) => ({
    ...entry,
    studentName: studentName(db, entry.studentId),
    section: db.students.find((student) => student.id === entry.studentId)?.section || ""
  })).sort(byDateDesc);
}

function normalizeDay(value) {
  const key = String(value || "").trim().toLowerCase();
  return dayOrder.find((day) => day.toLowerCase().startsWith(key)) || "";
}

function cleanTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}

function scheduleFromBody(db, body, user, existing = {}) {
  const subjectId = body.subjectId || subjectByNameOrId(db, body.subject || existing.subjectId)?.id || existing.subjectId || "";
  const section = String(body.section ?? existing.section ?? "").trim();
  const day = normalizeDay(body.day || existing.day);
  const startTime = cleanTime(body.startTime || existing.startTime);
  const endTime = cleanTime(body.endTime || existing.endTime);
  const reminderMinutes = reminderOptions.includes(Number(body.reminderMinutes ?? existing.reminderMinutes))
    ? Number(body.reminderMinutes ?? existing.reminderMinutes)
    : 10;
  if (!subjectId || !db.subjects.some((subject) => subject.id === subjectId)) throw new Error("Valid subject is required.");
  if (!section) throw new Error("Section is required.");
  if (!day) throw new Error("Valid day is required.");
  if (!startTime || !endTime) throw new Error("Start and end time must use HH:MM format.");
  if (startTime >= endTime) throw new Error("End time must be after start time.");
  if (!canUseSubject(user, subjectId) || !canUseSection(user, section)) throw new Error("This schedule is outside your assigned scope.");
  return {
    subjectId,
    section,
    day,
    startTime,
    endTime,
    reminderMinutes,
    room: String(body.room ?? existing.room ?? "").trim().slice(0, 80),
    type: String(body.type ?? existing.type ?? "Class").trim().slice(0, 40) || "Class",
    note: String(body.note ?? existing.note ?? "").trim().slice(0, 240)
  };
}

function scheduleRows(db, schedules) {
  return schedules
    .map((schedule) => ({ ...schedule, subjectName: subjectName(db, schedule.subjectId) }))
    .sort((a, b) => (dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)) || String(a.startTime).localeCompare(String(b.startTime)));
}

function rankFor(coins, ranks) {
  const ordered = [...ranks].sort((a, b) => a.min - b.min);
  const current = [...ordered].reverse().find((rank) => coins >= rank.min);
  const next = ordered.find((rank) => rank.min > coins);
  const currentMin = current?.min ?? 0;
  const nextMin = next?.min ?? Math.max(coins, currentMin);
  const progress = next ? Math.round(Math.max(0, Math.min(100, ((coins - currentMin) / Math.max(1, nextMin - currentMin)) * 100))) : 100;
  return { rank: current?.name ?? "Unranked", nextRank: next?.name ?? "Max Rank", nextTarget: next?.min ?? coins, progress };
}

function hydrateStudents(db) {
  const cached = hydratedStudentsCache.get(db);
  if (cached) return cached;
  const coinsByStudent = new Map();
  (db.transactions || []).forEach((transaction) => {
    coinsByStudent.set(transaction.studentId, Number(coinsByStudent.get(transaction.studentId) || 0) + Number(transaction.amount || 0));
  });
  const accountsByStudent = new Map((db.users || []).filter((user) => user.role === "student" && user.studentId).map((user) => [user.studentId, user]));
  const subjectNamesById = new Map((db.subjects || []).map((subject) => [subject.id, subject.name]));
  const hydrated = db.students.map((student) => {
    const currentJCoins = Number(coinsByStudent.get(student.id) || 0);
    const account = accountsByStudent.get(student.id);
    return { ...student, userId: account?.id || "", username: account?.username || "", currentJCoins, subjectNames: (student.subjectIds || []).map((id) => subjectNamesById.get(id) || "Unknown Subject"), appearance: equippedAppearance(db, student.id), ...rankFor(currentJCoins, db.settings.ranks) };
  }).sort((a, b) => b.currentJCoins - a.currentJCoins);
  hydratedStudentsCache.set(db, hydrated);
  return hydrated;
}

function hideProfilePhotos(students) {
  return students.map((student) => ({ ...student, profilePhoto: "" }));
}

function cleanProfilePhoto(value) {
  const photo = String(value || "");
  if (!photo) return "";
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(photo)) throw new Error("Upload a PNG, JPG, or WEBP image.");
  if (photo.length > 750000) throw new Error("Image is too large. Please upload a smaller photo.");
  return photo;
}

function userWithStudent(user, db) {
  return { ...publicUser(user), studentName: user.studentId ? studentName(db, user.studentId) : "", subjectNames: (user.subjectIds || []).map((id) => subjectName(db, id)), sectionNames: user.sectionIds || [] };
}

function activityBase(db, type) {
  return db.settings.activities.types.find((t) => t.name === type)?.points ?? Number(type || 0) ?? 0;
}

function parseActivityDateTime(value, endOfDay = false) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T${endOfDay ? "23:59:59" : "00:00:00"}+08:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return new Date(`${text}:00+08:00`);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function activityDaysLate(deadline, submittedAt) {
  const due = parseActivityDateTime(deadline, true);
  const submitted = parseActivityDateTime(submittedAt);
  if (!due || !submitted || submitted <= due) return 0;
  return Math.max(1, Math.ceil((submitted - due) / 86400000));
}

function activityMaxScoreAllowed(daysLateValue) {
  return Math.max(0, 100 - Number(daysLateValue || 0) * 10);
}

function activityScoreVisibleAt(activity, submission = {}) {
  const deadline = parseActivityDateTime(activityDeadlineForSubmission(activity, submission), true);
  if (!deadline) return "";
  return new Date(deadline.getTime() + ACTIVITY_SCORE_RELEASE_DAYS * 86400000).toISOString();
}

function activityScoreReleased(activity, submission = {}, at = Date.now()) {
  const visibleAt = activityScoreVisibleAt(activity, submission);
  return !visibleAt || new Date(visibleAt).getTime() <= at;
}

function activitySubmissionScore(submission = {}, maxScoreAllowed = 100) {
  if (!submission.submitted) return "";
  const autoScore = Math.max(0, Math.min(100, Number(maxScoreAllowed || 0)));
  if (submission.score === "" || submission.score == null || submission.scoreMode === "auto") return autoScore;
  const manualScore = Number(submission.score);
  return Number.isFinite(manualScore) ? Math.max(0, Math.min(autoScore, manualScore)) : autoScore;
}

function syncActivityAutoScore(submission = {}, maxScoreAllowed = 100) {
  if (!submission.submitted) {
    if (submission.scoreMode === "auto") {
      delete submission.score;
      delete submission.scoreMode;
    }
    return;
  }
  if (submission.score === "" || submission.score == null || submission.scoreMode === "auto") {
    submission.score = activitySubmissionScore({ ...submission, scoreMode: "auto" }, maxScoreAllowed);
    submission.scoreMode = "auto";
  }
}

function normalizeActivityDeadline(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T23:59`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.slice(0, 16);
  return `${today()}T23:59`;
}

function activityDeadlineForSubmission(activity, submission = {}) {
  if (!submission.extendedDeadline) return activity.deadline;
  const originalDate = parseActivityDateTime(activity.deadline, true);
  const extensionDate = parseActivityDateTime(submission.extendedDeadline, true);
  return originalDate && extensionDate && extensionDate > originalDate ? submission.extendedDeadline : activity.deadline;
}

function activityExtensionDeadline(activity, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(text)) throw new Error("Choose a valid extension date and time.");
  const deadline = normalizeActivityDeadline(text);
  const originalDate = parseActivityDateTime(activity.deadline, true);
  const extensionDate = parseActivityDateTime(deadline, true);
  if (!originalDate || !extensionDate || extensionDate <= originalDate) throw new Error("The individual deadline must be later than the original deadline.");
  return deadline;
}

function cleanActivityFile(file = {}) {
  const fileName = String(file.fileName || "").trim().slice(0, 180);
  const fileType = String(file.fileType || "").trim().slice(0, 120);
  const fileData = String(file.fileData || "");
  const fileSize = Number(file.fileSize || 0);
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const allowedExtensions = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "jpg", "jpeg", "png", "webp", "txt", "csv"];
  if (!fileName || !fileData) throw new Error("Upload a school-related file.");
  if (!allowedExtensions.includes(extension)) throw new Error("Upload PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, JPG/PNG/WEBP, TXT, or CSV only.");
  if (fileSize > ACTIVITY_FILE_LIMIT_BYTES || fileData.length > activityDataUrlLimit(ACTIVITY_FILE_LIMIT_BYTES)) throw new Error("File is too large. Maximum upload is 50 MB.");
  if (!/^data:[^;]+;base64,/i.test(fileData)) throw new Error("File upload was not readable. Please try again.");
  return { fileName, fileType, fileSize, fileData };
}

function activityFileIsImage(file = {}) {
  const extension = String(file.fileName || "").split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "webp"].includes(extension) || String(file.fileType || "").toLowerCase().startsWith("image/");
}

function cleanActivityFiles(body = {}) {
  const incoming = Array.isArray(body.files) && body.files.length ? body.files : [body.file].filter(Boolean);
  if (!incoming.length) throw new Error("Upload a school-related file.");
  if (incoming.length > 10) throw new Error("Upload up to 10 photos at a time.");
  const files = incoming.map(cleanActivityFile);
  if (files.length > 1 && files.some((file) => !activityFileIsImage(file))) throw new Error("Multiple uploads are only for photos. Upload documents one at a time.");
  const totalSize = files.reduce((sum, file) => sum + Number(file.fileSize || 0), 0);
  const totalData = files.reduce((sum, file) => sum + String(file.fileData || "").length, 0);
  if (totalSize > ACTIVITY_PHOTO_TOTAL_LIMIT_BYTES || totalData > activityDataUrlLimit(ACTIVITY_PHOTO_TOTAL_LIMIT_BYTES)) throw new Error("Photos are too large together. Maximum total upload is 100 MB.");
  return files;
}

function cleanMultipartActivityFiles(files = []) {
  if (!files.length) throw new Error("Upload a school-related file.");
  if (files.length > 10) throw new Error("Upload up to 10 photos at a time.");
  const allowedExtensions = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "jpg", "jpeg", "png", "webp", "txt", "csv"];
  const imageExtensions = ["jpg", "jpeg", "png", "webp"];
  const cleaned = files.map((file) => {
    const fileName = String(file.originalname || "").trim().slice(0, 180);
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.includes(extension)) throw new Error("Upload PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, JPG/PNG/WEBP, TXT, or CSV only.");
    if (Number(file.size || 0) > ACTIVITY_FILE_LIMIT_BYTES) throw new Error("File is too large. Maximum upload is 50 MB.");
    return { sourcePath: file.path, fileName, fileType: String(file.mimetype || "application/octet-stream").slice(0, 120), fileSize: Number(file.size || 0), extension };
  });
  if (cleaned.length > 1 && cleaned.some((file) => !imageExtensions.includes(file.extension))) throw new Error("Multiple uploads are only for photos. Upload documents one at a time.");
  if (cleaned.reduce((sum, file) => sum + file.fileSize, 0) > ACTIVITY_PHOTO_TOTAL_LIMIT_BYTES) throw new Error("Photos are too large together. Maximum total upload is 100 MB.");
  return cleaned;
}

function cleanMultipartActivityMaterialFiles(files = []) {
  if (!files.length) throw new Error("Upload at least one activity material.");
  if (files.length > 10) throw new Error("Upload up to 10 activity materials at a time.");
  const allowedExtensions = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "jpg", "jpeg", "png", "webp", "txt", "csv"];
  return files.map((file) => {
    const fileName = String(file.originalname || "").trim().slice(0, 180);
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.includes(extension)) throw new Error("Upload PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, JPG/PNG/WEBP, TXT, or CSV only.");
    if (Number(file.size || 0) > ACTIVITY_FILE_LIMIT_BYTES) throw new Error("File is too large. Maximum upload is 50 MB.");
    return { sourcePath: file.path, fileName, fileType: String(file.mimetype || "application/octet-stream").slice(0, 120), fileSize: Number(file.size || 0), extension };
  });
}

async function cleanupTemporaryActivityFiles(files = []) {
  await Promise.all(files.map((file) => rm(file.path || file.sourcePath || "", { force: true }).catch(() => {})));
}

async function activityFilePreviewText(file = {}) {
  if (activityFileIsImage(file) || !file.fileData) return "";
  const match = String(file.fileData).match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return "";
  try {
    return await extractReferenceText({
      originalname: file.fileName || "submission",
      mimetype: file.fileType || match[1],
      buffer: Buffer.from(match[2], "base64")
    });
  } catch {
    return "";
  }
}

function quizRewardValue(db, difficulty) {
  return db.settings.quizzes.difficulties.find((item) => item.name === difficulty)?.points ?? 0;
}

function cleanQuizQuestion(question = {}) {
  const type = quizQuestionTypes.includes(question.type) ? question.type : "multiple_choice";
  const base = {
    id: question.id || randomUUID(),
    type,
    prompt: String(question.prompt || question.text || "Question").trim().slice(0, 500)
  };
  if (type === "true_false") {
    const answer = String(question.answer || question.correctAnswer || "True").trim();
    return { ...base, options: ["True", "False"], answer: ["True", "False"].includes(answer) ? answer : "True" };
  }
  if (["multiple_choice", "multiple_select"].includes(type)) {
    const options = (Array.isArray(question.options) ? question.options : [])
      .map((option) => String(option || "").trim()).filter(Boolean).slice(0, 8);
    const normalizedOptions = options.length >= 2 ? options : ["Option A", "Option B"];
    if (type === "multiple_select") {
      const requested = Array.isArray(question.answers) ? question.answers : Array.isArray(question.answer) ? question.answer : [question.answer];
      const answers = [...new Set(requested.map((answer) => String(answer || "").trim()).filter((answer) => normalizedOptions.includes(answer)))];
      return { ...base, options: normalizedOptions, answers: answers.length ? answers : [normalizedOptions[0]], answer: answers.length ? answers : [normalizedOptions[0]] };
    }
    const answer = String(question.answer || question.correctAnswer || normalizedOptions[0]).trim();
    return { ...base, options: normalizedOptions, answer: normalizedOptions.includes(answer) ? answer : normalizedOptions[0] };
  }
  if (type === "fill_blank") {
    const requested = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [question.answer || question.correctAnswer];
    const acceptedAnswers = [...new Set(requested.map((answer) => String(answer || "").trim()).filter(Boolean))].slice(0, 12);
    const safeAnswers = acceptedAnswers.length ? acceptedAnswers : ["Answer"];
    return { ...base, options: [], acceptedAnswers: safeAnswers, answer: safeAnswers[0] };
  }
  if (type === "matching") {
    const incomingPairs = Array.isArray(question.matchingPairs) ? question.matchingPairs : Array.isArray(question.pairs) ? question.pairs : [];
    const matchingPairs = incomingPairs.map((pair) => ({
      id: pair.id || randomUUID(),
      left: String(pair.left || pair.prompt || "").trim().slice(0, 160),
      right: String(pair.right || pair.answer || "").trim().slice(0, 160)
    })).filter((pair) => pair.left && pair.right).slice(0, 12);
    const safePairs = matchingPairs.length >= 2 ? matchingPairs : [
      { id: randomUUID(), left: "Item 1", right: "Match 1" },
      { id: randomUUID(), left: "Item 2", right: "Match 2" }
    ];
    return { ...base, options: [], matchingPairs: safePairs };
  }
  const numericAnswer = Number(String(question.answer ?? question.correctAnswer ?? 0).replaceAll(",", ""));
  const tolerance = Math.max(0, Number(question.tolerance || 0));
  return { ...base, options: [], answer: Number.isFinite(numericAnswer) ? numericAnswer : 0, tolerance: Number.isFinite(tolerance) ? tolerance : 0 };
}

function normalizeQuiz(quiz, db) {
  quiz.title = String(quiz.title || "Quiz").trim() || "Quiz";
  quiz.subjectId ||= db.subjects[0]?.id || "";
  quiz.section = String(quiz.section || "").trim();
  quiz.difficulty = quizDifficulties.includes(quiz.difficulty) ? quiz.difficulty : "Easy";
  quiz.rewardValue = Number.isFinite(Number(quiz.rewardValue)) ? Number(quiz.rewardValue) : quizRewardValue(db, quiz.difficulty);
  quiz.deadline ||= today();
  quiz.timeLimitMinutes = Math.max(0, Math.min(240, Number(quiz.timeLimitMinutes || 0)));
  quiz.status = ["draft", "published", "closed"].includes(quiz.status) ? quiz.status : "draft";
  quiz.questions = (Array.isArray(quiz.questions) ? quiz.questions : []).map(cleanQuizQuestion);
  const storedQuizTypes = Array.isArray(quiz.quizTypes) ? quiz.quizTypes.filter((type) => quizQuestionTypes.includes(type)) : [];
  const inferredQuizTypes = quizQuestionTypes.includes(quiz.quizType) ? [quiz.quizType] : [...new Set(quiz.questions.map((question) => question.type))];
  quiz.quizTypes = [...new Set(storedQuizTypes.length ? storedQuizTypes : inferredQuizTypes.length ? inferredQuizTypes : ["multiple_choice"] )];
  quiz.quizType = quiz.quizTypes.length === 1 ? quiz.quizTypes[0] : "mixed";
  quiz.passingScore = Math.max(1, Math.min(Number(quiz.passingScore || Math.ceil(quiz.questions.length * (db.settings.quizzes.defaultPassingPercent || 75) / 100) || 1), Math.max(1, quiz.questions.length)));
  quiz.retakeMode = ["none", "all", "selected"].includes(quiz.retakeMode) ? quiz.retakeMode : "none";
  quiz.retakeStudentIds = Array.isArray(quiz.retakeStudentIds) ? quiz.retakeStudentIds : [];
  quiz.answerVisibility = answerVisibilityOptions.includes(quiz.answerVisibility) ? quiz.answerVisibility : db.settings.quizzes.defaultAnswerVisibility;
  quiz.answerRevealAt = String(quiz.answerRevealAt || "");
  quiz.shuffleQuestions = !!quiz.shuffleQuestions;
  quiz.shuffleOptions = !!quiz.shuffleOptions;
  quiz.submissions = Array.isArray(quiz.submissions) ? quiz.submissions : [];
  quiz.submissions.forEach((submission) => {
    submission.attempts = Array.isArray(submission.attempts) ? submission.attempts : [];
    submission.bestAwarded = Number(submission.bestAwarded || 0);
    submission.bestScore = Number(submission.bestScore || 0);
    submission.activeAttempt = submission.activeAttempt && typeof submission.activeAttempt === "object" ? submission.activeAttempt : null;
  });
  quiz.source = quiz.source || "manual";
  quiz.createdAt ||= now();
  ensureQuizVersion(quiz);
  return quiz;
}

function quizStudents(db, quiz) {
  return studentsForClass(db, quiz.subjectId, quiz.section)
    .map((student) => hydrateStudents(db).find((hydrated) => hydrated.id === student.id) || student);
}

function canUseQuiz(user, quiz) {
  return canUseSubject(user, quiz.subjectId) && canUseSection(user, quiz.section);
}

function canStudentSeeQuiz(db, quiz, studentId) {
  const student = db.students.find((item) => item.id === studentId);
  return studentIsInClass(db, student, quiz.subjectId, quiz.section);
}

function isQuizDeadlineOpen(quiz, at = Date.now()) {
  return !quiz.deadline || new Date(`${quiz.deadline}T23:59:59`).getTime() >= at;
}

function canRetakeQuiz(quiz, studentId, submission) {
  if (!submission?.attempts?.length) return true;
  if (quiz.retakeMode === "all") return true;
  if (quiz.retakeMode === "selected") return (quiz.retakeStudentIds || []).includes(studentId);
  return false;
}

function quizAttemptExpired(attempt) {
  return !!attempt?.dueAt && new Date(attempt.dueAt).getTime() <= Date.now();
}

function quizQuestionSnapshot(questions = []) {
  return questions.map((question) => JSON.parse(JSON.stringify(question)));
}

function quizVersionSignature(quiz) {
  return JSON.stringify({
    questions: quiz.questions || [],
    passingScore: Number(quiz.passingScore || 1),
    difficulty: quiz.difficulty,
    rewardValue: Number(quiz.rewardValue || 0)
  });
}

function ensureQuizVersion(quiz) {
  quiz.versions = Array.isArray(quiz.versions) ? quiz.versions : [];
  const signature = quizVersionSignature(quiz);
  let version = quiz.versions.find((item) => item.signature === signature);
  if (!version) {
    version = {
      id: randomUUID(),
      signature,
      questions: quizQuestionSnapshot(quiz.questions),
      passingScore: Number(quiz.passingScore || 1),
      difficulty: quiz.difficulty,
      rewardValue: Number(quiz.rewardValue || 0),
      createdAt: now()
    };
    quiz.versions.push(version);
  }
  quiz.currentVersionId = version.id;
  return version;
}

function quizForAttempt(quiz, activeAttempt) {
  const version = (quiz.versions || []).find((item) => item.id === activeAttempt?.quizVersionId);
  if (!version) return quiz;
  return {
    ...quiz,
    questions: version.questions,
    passingScore: version.passingScore,
    difficulty: version.difficulty,
    rewardValue: version.rewardValue
  };
}

function publicActiveQuizAttempt(attempt) {
  if (!attempt) return null;
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    dueAt: attempt.dueAt
  };
}

function publicCompletedQuizAttempt(attempt) {
  if (!attempt) return null;
  const { questionSnapshot: privateQuestionSnapshot, ...visible } = attempt;
  return visible;
}

function stableHash32(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicShuffle(items, seed) {
  return [...items].map((item, index) => ({
    item,
    key: stableHash32(`${seed}:${index}:${JSON.stringify(item)}`)
  })).sort((a, b) => a.key - b.key).map((entry) => entry.item);
}

function normalizePaperVariant(value) {
  const variant = String(value || "A").trim().toUpperCase();
  return paperQuizVariants.includes(variant) ? variant : "A";
}

function normalizePaperChoices(rawChoices, correctText) {
  const correct = String(correctText || "");
  const cleaned = (rawChoices || []).map((choice) => String(choice || "").trim()).filter(Boolean);
  let choices = cleaned.slice(0, paperAnswerLetters.length);
  if (correct && !choices.some((choice) => choice === correct)) {
    const correctChoice = cleaned.find((choice) => choice === correct) || correct;
    choices = [...choices.slice(0, paperAnswerLetters.length - 1), correctChoice];
  }
  while (choices.length < paperAnswerLetters.length) choices.push("Not used");
  return choices.slice(0, paperAnswerLetters.length);
}

function paperQuizRows(quiz, variantInput = "A") {
  const variant = normalizePaperVariant(variantInput);
  const seedBase = `${quiz.id}:${quiz.currentVersionId || ""}:${variant}`;
  const rows = [];
  (quiz.questions || []).forEach((question, questionIndex) => {
    if (!paperQuizTypes.includes(question.type)) return;
    if (["multiple_choice", "true_false"].includes(question.type)) {
      const choices = question.type === "true_false"
        ? ["True", "False"]
        : deterministicShuffle(question.options || [], `${seedBase}:options:${question.id}`);
      rows.push({
        questionId: question.id,
        sourceQuestionIndex: questionIndex,
        type: question.type,
        prompt: question.prompt,
        choices,
        correctText: question.answer
      });
      return;
    }
    const pairs = question.matchingPairs || [];
    const choices = deterministicShuffle([...new Set(pairs.map((pair) => pair.right).filter(Boolean))], `${seedBase}:matching:${question.id}`);
    pairs.forEach((pair, pairIndex) => {
      rows.push({
        questionId: question.id,
        pairId: pair.id,
        sourceQuestionIndex: questionIndex,
        sourcePairIndex: pairIndex,
        type: "matching",
        prompt: `${question.prompt}\n${pair.left}`,
        choices,
        correctText: pair.right
      });
    });
  });
  return deterministicShuffle(rows, `${seedBase}:questions`).map((row, index) => {
    const choices = normalizePaperChoices(row.choices, row.correctText);
    const correctIndex = choices.findIndex((choice) => String(choice) === String(row.correctText));
    return {
      ...row,
      number: index + 1,
      choices,
      correctLetter: correctIndex >= 0 ? String.fromCharCode(65 + correctIndex) : ""
    };
  });
}

function paperQuizPassingScore(quiz, total) {
  const questionCount = Math.max(1, (quiz.questions || []).length);
  const ratio = Number(quiz.passingScore || questionCount) / questionCount;
  return Math.max(1, Math.min(total, Math.round(total * ratio)));
}

function scorePaperQuiz(quiz, variant, answers = {}) {
  const rows = paperQuizRows(quiz, variant);
  const normalizedAnswers = {};
  let correct = 0;
  rows.forEach((row) => {
    const answer = String(answers[row.number] ?? answers[String(row.number)] ?? "").trim().toUpperCase().slice(0, 1);
    normalizedAnswers[row.number] = answer;
    if (answer && answer === row.correctLetter) correct += 1;
  });
  const total = rows.length;
  const passingScore = paperQuizPassingScore(quiz, total);
  const rewardValue = Number(quiz.rewardValue || 0);
  const awarded = total ? Math.round(rewardValue * Math.min(correct / passingScore, 1)) : 0;
  return { rows, answers: normalizedAnswers, correct, total, passingScore, rewardValue, awarded };
}

function scoreManualQuiz(quiz, scoreInput, totalInput) {
  const defaultTotal = Math.max(1, paperQuizRows(quiz, "A").length || (quiz.questions || []).length || 1);
  const total = Math.max(1, Math.min(500, Math.round(Number(totalInput || defaultTotal))));
  const correct = Math.max(0, Math.min(total, Math.round(Number(scoreInput || 0))));
  const passingScore = paperQuizPassingScore(quiz, total);
  const rewardValue = Number(quiz.rewardValue || 0);
  const awarded = total ? Math.round(rewardValue * Math.min(correct / passingScore, 1)) : 0;
  return { correct, total, passingScore, rewardValue, awarded };
}

function finishTimedOutQuizAttempt(quiz, submission) {
  const active = submission.activeAttempt;
  if (!active) return null;
  const attemptQuiz = quizForAttempt(quiz, active);
  const result = scoreQuiz(attemptQuiz, {});
  const attempt = {
    id: active.id || randomUUID(),
    attemptNumber: active.attemptNumber || submission.attempts.length + 1,
    answers: {},
    correct: 0,
    total: result.total,
    passingScore: result.passingScore,
    difficulty: attemptQuiz.difficulty,
    rewardValue: result.rewardValue,
    quizVersionId: active.quizVersionId || quiz.currentVersionId || "",
    awarded: 0,
    startedAt: active.startedAt,
    dueAt: active.dueAt,
    submittedAt: now(),
    timedOut: true
  };
  submission.attempts.push(attempt);
  submission.activeAttempt = null;
  return attempt;
}

function canShowQuizAnswers(quiz) {
  if (quiz.answerVisibility === "immediate") return true;
  if (quiz.answerVisibility === "never") return false;
  if (quiz.answerVisibility === "scheduled") return !!quiz.answerRevealAt && new Date(quiz.answerRevealAt).getTime() <= Date.now();
  return !isQuizDeadlineOpen(quiz);
}

function scoreQuiz(quiz, answers = {}) {
  const correct = quiz.questions.reduce((sum, question) => sum + (quizAnswerIsCorrect(question, answers[question.id]) ? 1 : 0), 0);
  const total = quiz.questions.length;
  const passingScore = Math.max(1, Math.min(Number(quiz.passingScore || total || 1), Math.max(1, total)));
  const rewardValue = Number(quiz.rewardValue || 0);
  const awarded = Math.round(rewardValue * Math.min(correct / passingScore, 1));
  return { correct, total, passingScore, rewardValue, awarded };
}

function cleanQuizSubmissionAnswers(quiz, input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return Object.fromEntries((quiz.questions || []).map((question) => {
    const value = source[question.id];
    if (question.type === "multiple_select") {
      const options = new Set(question.options || []);
      return [question.id, [...new Set((Array.isArray(value) ? value : []).map(String).filter((answer) => options.has(answer)))].slice(0, options.size)];
    }
    if (question.type === "matching") {
      const choices = new Set((question.matchingPairs || []).map((pair) => pair.right));
      const submitted = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      return [question.id, Object.fromEntries((question.matchingPairs || []).map((pair) => {
        const answer = String(submitted[pair.id] || "");
        return [pair.id, choices.has(answer) ? answer : ""];
      }))];
    }
    return [question.id, String(value ?? "").slice(0, 500)];
  }));
}

function quizAnswerIsCorrect(question, submitted) {
  if (question.type === "fill_blank") {
    const value = normalizeQuizTextAnswer(submitted);
    return !!value && (question.acceptedAnswers || [question.answer]).some((answer) => normalizeQuizTextAnswer(answer) === value);
  }
  if (question.type === "multiple_select") {
    const expected = [...new Set(question.answers || question.answer || [])].map(String).sort();
    const received = [...new Set(Array.isArray(submitted) ? submitted : [])].map(String).sort();
    return expected.length === received.length && expected.every((answer, index) => answer === received[index]);
  }
  if (question.type === "matching") {
    if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) return false;
    return question.matchingPairs.every((pair) => String(submitted[pair.id] || "") === pair.right);
  }
  if (["numerical", "computation"].includes(question.type)) {
    const received = Number(String(submitted ?? "").replaceAll(",", ""));
    return Number.isFinite(received) && Math.abs(received - Number(question.answer)) <= Number(question.tolerance || 0);
  }
  return String(submitted ?? "") === String(question.answer ?? "");
}

function normalizeQuizTextAnswer(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function publicStudentQuizQuestions(quiz, { showAnswers = false, shuffle = true } = {}) {
  const questions = shuffle && quiz.shuffleQuestions ? [...quiz.questions].sort(() => Math.random() - 0.5) : quiz.questions;
  return questions.map((question) => {
    const canShuffleOptions = ["multiple_choice", "multiple_select"].includes(question.type);
    const options = shuffle && quiz.shuffleOptions && canShuffleOptions ? [...question.options].sort(() => Math.random() - 0.5) : question.options;
    const studentQuestion = {
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options
    };
    if (question.type === "matching") {
      studentQuestion.matchingItems = question.matchingPairs.map((pair) => ({ id: pair.id, text: pair.left }));
      studentQuestion.options = question.matchingPairs.map((pair) => pair.right);
      if (shuffle && quiz.shuffleOptions) studentQuestion.options.sort(() => Math.random() - 0.5);
    }
    if (showAnswers) {
      studentQuestion.answer = question.answer;
      if (question.type === "fill_blank") studentQuestion.acceptedAnswers = question.acceptedAnswers;
      if (question.type === "multiple_select") studentQuestion.answers = question.answers;
      if (question.type === "matching") studentQuestion.matchingAnswers = Object.fromEntries(question.matchingPairs.map((pair) => [pair.id, pair.right]));
      if (["numerical", "computation"].includes(question.type)) studentQuestion.tolerance = question.tolerance;
    }
    return studentQuestion;
  });
}

function publicQuiz(quiz, db, user) {
  const submissions = quiz.submissions || [];
  const students = quizStudents(db, quiz);
  const rows = students.map((student) => {
    const submission = submissions.find((item) => item.studentId === student.id);
    const latest = submission?.attempts?.at(-1);
    return {
      studentId: student.id,
      studentName: student.name,
      studentCode: student.quizCode || "",
      section: student.section || "",
      attempts: submission?.attempts?.length || 0,
      latestScore: latest ? `${latest.correct}/${latest.total}` : "",
      bestScore: submission?.bestScore ?? "",
      bestAwarded: submission?.bestAwarded ?? 0,
      submittedAt: latest?.submittedAt || "",
      canRetake: canRetakeQuiz(quiz, student.id, submission)
    };
  });
  const { versions: privateVersions, ...publicQuizData } = quiz;
  const base = {
    ...publicQuizData,
    subjectName: subjectName(db, quiz.subjectId),
    rewardValue: Number(quiz.rewardValue ?? quizRewardValue(db, quiz.difficulty)),
    studentCount: students.length,
    submittedCount: rows.filter((row) => row.attempts).length,
    tracker: `${rows.filter((row) => row.attempts).length}/${students.length}`,
    rows
  };
  if (user.role === "student") {
    const { submissions: privateSubmissions, ...studentBase } = base;
    const submission = submissions.find((item) => item.studentId === user.studentId);
    const latest = submission?.attempts?.at(-1);
    const showAnswers = canShowQuizAnswers(quiz);
    const activeQuiz = quizForAttempt(quiz, submission?.activeAttempt);
    const latestQuiz = latest ? quizForAttempt(quiz, latest) : null;
    return {
      ...studentBase,
      rows: [],
      questions: publicStudentQuizQuestions(activeQuiz),
      submission: submission ? {
        attempts: submission.attempts.length,
        latest: publicCompletedQuizAttempt(latest),
        bestScore: submission.bestScore,
        bestAwarded: submission.bestAwarded,
        showAnswers,
        reviewQuestions: showAnswers && latestQuiz ? publicStudentQuizQuestions(latestQuiz, { showAnswers: true, shuffle: false }) : [],
        activeAttempt: publicActiveQuizAttempt(submission.activeAttempt)
      } : null,
      canSubmit: quiz.status === "published" && isQuizDeadlineOpen(quiz) && canRetakeQuiz(quiz, user.studentId, submission)
    };
  }
  return base;
}

function hydrateQuizzes(db, user) {
  return (db.quizzes || [])
    .map((quiz) => normalizeQuiz(quiz, db))
    .filter((quiz) => {
      if (user.role === "student") return quiz.status !== "draft" && canStudentSeeQuiz(db, quiz, user.studentId);
      return canUseQuiz(user, quiz);
    })
    .map((quiz) => publicQuiz(quiz, db, user))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function normalizeMajorExam(exam, db) {
  exam.title = String(exam.title || "Major Exam").trim().slice(0, 140) || "Major Exam";
  exam.subjectId = String(exam.subjectId || "");
  exam.section = String(exam.section || "").trim();
  exam.date = String(exam.date || today()).slice(0, 10);
  const rawMaxScore = Number(exam.maxScore || 100);
  exam.maxScore = Number.isFinite(rawMaxScore) ? Math.max(1, Math.min(1000, rawMaxScore)) : 100;
  exam.remarks = String(exam.remarks || "").trim().slice(0, 500);
  exam.scores = exam.scores && typeof exam.scores === "object" && !Array.isArray(exam.scores) ? exam.scores : {};
  const studentIds = new Set(studentsForClass(db, exam.subjectId, exam.section).map((student) => student.id));
  exam.scores = Object.fromEntries(Object.entries(exam.scores)
    .filter(([studentId]) => studentIds.has(studentId))
    .map(([studentId, score]) => [studentId, Math.max(0, Math.min(Number(exam.maxScore), Number(score || 0)))]));
  return exam;
}

function canUseMajorExam(user, exam) {
  return canUseSubject(user, exam.subjectId) && canUseSection(user, exam.section);
}

function majorExamInput(db, body, user, existing = {}) {
  const subjectId = String(body.subjectId ?? existing.subjectId ?? "");
  const section = String(body.section ?? existing.section ?? "").trim();
  if (!subjectId || !db.subjects.some((subject) => subject.id === subjectId) || !canUseSubject(user, subjectId)) throw new Error("Choose an available subject.");
  if (!section || !db.sections.includes(section) || !canUseSection(user, section)) throw new Error("Choose an available section.");
  const rawMaxScore = Number(body.maxScore ?? existing.maxScore ?? 100);
  if (!Number.isFinite(rawMaxScore)) throw new Error("Maximum score must be a number.");
  const maxScore = Math.max(1, Math.min(1000, rawMaxScore));
  return {
    title: String(body.title ?? existing.title ?? "Major Exam").trim().slice(0, 140) || "Major Exam",
    subjectId,
    section,
    date: String(body.date ?? existing.date ?? today()).slice(0, 10),
    maxScore,
    remarks: String(body.remarks ?? existing.remarks ?? "").trim().slice(0, 500)
  };
}

function publicMajorExam(db, exam) {
  normalizeMajorExam(exam, db);
  const students = studentsForClass(db, exam.subjectId, exam.section);
  const rows = students.map((student) => {
    const hasScore = Object.prototype.hasOwnProperty.call(exam.scores || {}, student.id);
    const score = hasScore ? exam.scores[student.id] : "";
    return {
      studentId: student.id,
      studentName: student.name,
      section: student.section || "",
      score,
      percent: hasScore ? Math.round(Number(score || 0) / Number(exam.maxScore || 1) * 100) : "",
      recorded: hasScore
    };
  });
  return {
    ...exam,
    subjectName: subjectName(db, exam.subjectId),
    tracker: `${rows.filter((row) => row.recorded).length}/${rows.length}`,
    studentCount: rows.length,
    rows
  };
}

function hydrateMajorExams(db, user) {
  return (db.majorExams || [])
    .map((exam) => normalizeMajorExam(exam, db))
    .filter((exam) => canUseMajorExam(user, exam))
    .map((exam) => publicMajorExam(db, exam))
    .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
}

const gradeCategories = ["writtenWorks", "quizzes", "activities", "attendance", "majorExams"];

function normalizeGradeWeights(weights = {}) {
  const fallback = defaults().settings.grades.weights;
  return Object.fromEntries(gradeCategories.map((key) => {
    const value = Number(weights[key] ?? fallback[key] ?? 0);
    return [key, Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0];
  }));
}

function gradeClassKey(subjectId, section = "") {
  return `${subjectId}::${String(section || "").trim()}`;
}

function normalizeGradeSetting(setting, db) {
  setting.id ||= gradeClassKey(setting.subjectId || db.subjects[0]?.id || "", setting.section || "");
  setting.subjectId = String(setting.subjectId || "").trim();
  setting.section = String(setting.section || "").trim();
  setting.weights = normalizeGradeWeights(setting.weights || db.settings.grades?.weights);
  setting.includeWrittenWorks = setting.includeWrittenWorks !== false;
  setting.recitationBonusMax = Math.max(0, Math.min(20, Number(setting.recitationBonusMax ?? db.settings.grades?.recitationBonusMax ?? 5)));
  setting.passingGrade = Math.max(1, Math.min(100, Number(setting.passingGrade || db.settings.grades?.passingGrade || 75)));
  setting.releasedAt = String(setting.releasedAt || "");
  return setting;
}

function gradeSettingFor(db, subjectId, section = "", create = false) {
  const normalizedSection = String(section || "").trim();
  let setting = (db.gradeSettings || []).find((item) => item.subjectId === subjectId && String(item.section || "").trim() === normalizedSection);
  if (!setting && create) {
    setting = normalizeGradeSetting({
      id: gradeClassKey(subjectId, normalizedSection),
      subjectId,
      section: normalizedSection,
      weights: db.settings.grades?.weights,
      includeWrittenWorks: db.settings.grades?.includeWrittenWorks !== false,
      recitationBonusMax: db.settings.grades?.recitationBonusMax ?? 5,
      passingGrade: db.settings.grades?.passingGrade ?? 75,
      createdAt: now()
    }, db);
    db.gradeSettings.push(setting);
  }
  return normalizeGradeSetting(setting || {
    id: gradeClassKey(subjectId, normalizedSection),
    subjectId,
    section: normalizedSection,
    weights: db.settings.grades?.weights,
    includeWrittenWorks: db.settings.grades?.includeWrittenWorks !== false,
    recitationBonusMax: db.settings.grades?.recitationBonusMax ?? 5,
    passingGrade: db.settings.grades?.passingGrade ?? 75
  }, db);
}

function gradeSettingInput(db, body, user) {
  const subjectId = String(body.subjectId || "").trim();
  const section = String(body.section || "").trim();
  if (!subjectId || !db.subjects.some((subject) => subject.id === subjectId) || !canUseSubject(user, subjectId)) throw new Error("Choose an available subject.");
  if (!section || !db.sections.includes(section) || !canUseSection(user, section)) throw new Error("Choose an available section.");
  const weights = normalizeGradeWeights(body.weights || {});
  return {
    subjectId,
    section,
    weights,
    includeWrittenWorks: body.includeWrittenWorks !== false,
    recitationBonusMax: Math.max(0, Math.min(20, Number(body.recitationBonusMax ?? db.settings.grades?.recitationBonusMax ?? 5))),
    passingGrade: Math.max(1, Math.min(100, Number(body.passingGrade || db.settings.grades?.passingGrade || 75)))
  };
}

function normalizeWrittenWork(work, db) {
  work.title = String(work.title || "Written Work").trim().slice(0, 140) || "Written Work";
  work.subjectId = String(work.subjectId || "");
  work.section = String(work.section || "").trim();
  work.date = String(work.date || today()).slice(0, 10);
  const rawMaxScore = Number(work.maxScore || 100);
  work.maxScore = Number.isFinite(rawMaxScore) ? Math.max(1, Math.min(1000, rawMaxScore)) : 100;
  work.remarks = String(work.remarks || "").trim().slice(0, 500);
  work.scores = work.scores && typeof work.scores === "object" && !Array.isArray(work.scores) ? work.scores : {};
  const studentIds = new Set(studentsForClass(db, work.subjectId, work.section).map((student) => student.id));
  work.scores = Object.fromEntries(Object.entries(work.scores)
    .filter(([studentId]) => studentIds.has(studentId))
    .map(([studentId, score]) => [studentId, Math.max(0, Math.min(Number(work.maxScore), Number(score || 0)))]));
  return work;
}

function canUseWrittenWork(user, work) {
  return canUseSubject(user, work.subjectId) && canUseSection(user, work.section);
}

function writtenWorkInput(db, body, user, existing = {}) {
  const subjectId = String(body.subjectId ?? existing.subjectId ?? "");
  const section = String(body.section ?? existing.section ?? "").trim();
  if (!subjectId || !db.subjects.some((subject) => subject.id === subjectId) || !canUseSubject(user, subjectId)) throw new Error("Choose an available subject.");
  if (!section || !db.sections.includes(section) || !canUseSection(user, section)) throw new Error("Choose an available section.");
  const rawMaxScore = Number(body.maxScore ?? existing.maxScore ?? 100);
  if (!Number.isFinite(rawMaxScore)) throw new Error("Maximum score must be a number.");
  return {
    title: String(body.title ?? existing.title ?? "Written Work").trim().slice(0, 140) || "Written Work",
    subjectId,
    section,
    date: String(body.date ?? existing.date ?? today()).slice(0, 10),
    maxScore: Math.max(1, Math.min(1000, rawMaxScore)),
    remarks: String(body.remarks ?? existing.remarks ?? "").trim().slice(0, 500)
  };
}

function publicWrittenWork(db, work) {
  normalizeWrittenWork(work, db);
  const students = studentsForClass(db, work.subjectId, work.section);
  const rows = students.map((student) => {
    const recorded = Object.prototype.hasOwnProperty.call(work.scores || {}, student.id);
    const score = recorded ? work.scores[student.id] : "";
    return {
      studentId: student.id,
      studentName: student.name,
      section: student.section || "",
      score,
      percent: recorded ? Math.round(Number(score || 0) / Number(work.maxScore || 1) * 100) : "",
      recorded
    };
  });
  return {
    ...work,
    subjectName: subjectName(db, work.subjectId),
    tracker: `${rows.filter((row) => row.recorded).length}/${rows.length}`,
    studentCount: rows.length,
    rows
  };
}

function hydrateWrittenWorks(db, user) {
  return (db.writtenWorks || [])
    .map((work) => normalizeWrittenWork(work, db))
    .filter((work) => canUseWrittenWork(user, work))
    .map((work) => publicWrittenWork(db, work))
    .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
}

function normalizeGradeNote(note, db) {
  note.id ||= randomUUID();
  note.studentId = String(note.studentId || "");
  note.subjectId = String(note.subjectId || "");
  note.section = String(note.section || "").trim();
  note.privateNote = String(note.privateNote || "").trim().slice(0, 2000);
  note.visibleAdvice = String(note.visibleAdvice || "").trim().slice(0, 2000);
  note.visibleToStudent = note.visibleToStudent !== false;
  note.priority = ["Low", "Medium", "Urgent"].includes(note.priority) ? note.priority : "Medium";
  note.riskStatus = ["Safe", "Watch", "At Risk", "Critical"].includes(note.riskStatus) ? note.riskStatus : "";
  note.missingItems = Array.isArray(note.missingItems) ? note.missingItems.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 30) : [];
  return note;
}

function gradeNoteFor(db, studentId, subjectId, section = "") {
  return (db.gradeNotes || []).find((note) =>
    note.studentId === studentId
    && note.subjectId === subjectId
    && String(note.section || "").trim() === String(section || "").trim()
  ) || null;
}

function quizTotalForStudent(quiz, submission) {
  const attempts = submission?.attempts || [];
  const bestAttempt = attempts.reduce((best, attempt) => Number(attempt.correct || 0) > Number(best?.correct || -1) ? attempt : best, null);
  return Number(bestAttempt?.total || paperQuizRows(quiz, "A").length || (quiz.questions || []).length || 0);
}

function percentAverage(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length);
}

function categorySummary(label, weight, percents, missing, active = true) {
  const categoryWeight = active ? Number(weight || 0) : 0;
  const percent = active ? percentAverage(percents) : null;
  return {
    label,
    weight: categoryWeight,
    configuredWeight: Number(weight || 0),
    percent,
    contribution: percent == null ? 0 : Math.round(percent * categoryWeight) / 100,
    missing,
    active
  };
}

function attendancePercentForStudent(db, studentId, subjectId, section) {
  const cleanSection = String(section || "").trim();
  const weeks = (db.attendanceWeeks || []).filter((week) => {
    const weekSection = String(week.section || "").trim();
    return week.subjectId === subjectId && (!weekSection || weekSection === cleanSection);
  });
  const values = [];
  weeks.forEach((week) => {
    activeAttendanceDates(week).forEach((date) => {
      const status = (db.attendanceRecords || []).find((record) => record.weekId === week.id && record.studentId === studentId && record.date === date)?.status || "";
      values.push(status === "check" ? 100 : ["late", "excused"].includes(status) ? 50 : 0);
    });
  });
  return { values, missing: values.filter((value) => value === 0).length };
}

function gradeRiskStatus(grade, passingGrade = 75) {
  if (grade >= Math.max(85, passingGrade + 10)) return "Safe";
  if (grade >= passingGrade) return "Watch";
  if (grade >= Math.max(0, passingGrade - 15)) return "At Risk";
  return "Critical";
}

function automaticGradeAdvice(summary) {
  const pieces = [];
  if (summary.missingItems.length) pieces.push(`Complete ${summary.missingItems.slice(0, 3).join(", ")}${summary.missingItems.length > 3 ? ", and other missing work" : ""}.`);
  const weak = Object.entries(summary.categories || {})
    .filter(([, category]) => category.percent != null && category.percent < 75 && Number(category.weight || 0) > 0)
    .map(([, category]) => category.label);
  if (weak.length) pieces.push(`Focus review on ${weak.slice(0, 3).join(", ")}.`);
  if (!pieces.length) pieces.push(summary.currentGrade >= 85 ? "Keep the current pace and submit all new work on time." : "Keep submitting requirements and review low quiz or activity scores.");
  return pieces.join(" ");
}

function gradeSummaryForStudent(db, student, subjectId, section, user) {
  const setting = gradeSettingFor(db, subjectId, section);
  if (user.role === "student" && !setting.releasedAt) return null;
  const weights = setting.weights || {};
  const missingItems = [];
  const writtenPercents = [];
  const writtenWorks = (db.writtenWorks || []).filter((work) => work.subjectId === subjectId && work.section === section);
  if (setting.includeWrittenWorks !== false && Number(weights.writtenWorks || 0) > 0) {
    writtenWorks.forEach((work) => {
      const recorded = Object.prototype.hasOwnProperty.call(work.scores || {}, student.id);
      if (recorded) writtenPercents.push(Number(work.scores[student.id] || 0) / Number(work.maxScore || 1) * 100);
      else {
        writtenPercents.push(0);
        missingItems.push(work.title);
      }
    });
  }
  const quizPercents = [];
  const quizzes = (db.quizzes || []).filter((quiz) => quiz.subjectId === subjectId && quiz.section === section && quiz.status !== "draft");
  quizzes.forEach((quiz) => {
    const submission = (quiz.submissions || []).find((item) => item.studentId === student.id);
    const total = quizTotalForStudent(quiz, submission);
    if (submission?.attempts?.length && total) quizPercents.push(Number(submission.bestScore || 0) / total * 100);
    else {
      quizPercents.push(0);
      missingItems.push(quiz.title);
    }
  });
  const activityPercents = [];
  const activities = hydrateActivities(db).filter((activity) => activity.subjectId === subjectId && (!String(activity.section || "").trim() || String(activity.section || "").trim() === section));
  activities.forEach((activity) => {
    const row = (activity.rows || []).find((item) => item.studentId === student.id);
    if (user.role === "student" && row && !row.scoreReleased) return;
    if (row?.submitted && row.score !== "" && row.score != null) activityPercents.push(Number(row.score || 0));
    else {
      activityPercents.push(0);
      missingItems.push(activity.title);
    }
  });
  const attendance = attendancePercentForStudent(db, student.id, subjectId, section);
  const majorPercents = [];
  const majorExams = (db.majorExams || []).filter((exam) => exam.subjectId === subjectId && exam.section === section);
  majorExams.forEach((exam) => {
    const recorded = Object.prototype.hasOwnProperty.call(exam.scores || {}, student.id);
    if (recorded) majorPercents.push(Number(exam.scores[student.id] || 0) / Number(exam.maxScore || 1) * 100);
    else {
      majorPercents.push(0);
      missingItems.push(exam.title);
    }
  });
  if (!majorExams.length && Number(weights.majorExams || 0) > 0) majorPercents.push(100);
  const recitationCount = (db.recitations || []).filter((recitation) => recitation.studentId === student.id && recitation.subjectId === subjectId).length;
  const recitationBonus = Math.min(Number(setting.recitationBonusMax || 0), recitationCount);
  const categories = {
    writtenWorks: categorySummary("Written Works", setting.includeWrittenWorks === false ? 0 : weights.writtenWorks, writtenPercents, missingItems.length, setting.includeWrittenWorks !== false && !!writtenWorks.length),
    quizzes: categorySummary("Quizzes", weights.quizzes, quizPercents, missingItems.length, !!quizzes.length),
    activities: categorySummary("Activities / PT", weights.activities, activityPercents, missingItems.length, !!activities.length),
    attendance: categorySummary("Attendance", weights.attendance, attendance.values, attendance.missing, !!attendance.values.length),
    majorExams: categorySummary("Major Exams", weights.majorExams, majorPercents, missingItems.length, true)
  };
  const activeWeight = Object.values(categories).reduce((sum, category) => sum + Number(category.weight || 0), 0);
  const weightedPercent = activeWeight
    ? Object.values(categories).reduce((sum, category) => sum + Number(category.contribution || 0), 0) / activeWeight * 100
    : 100;
  const rawGrade = weightedPercent + recitationBonus;
  const currentGrade = Math.max(0, Math.min(100, Math.round(rawGrade)));
  const note = gradeNoteFor(db, student.id, subjectId, section);
  const riskStatus = note?.riskStatus || gradeRiskStatus(currentGrade, setting.passingGrade);
  const summary = {
    studentId: student.id,
    studentName: student.name,
    subjectId,
    subjectName: subjectName(db, subjectId),
    section,
    currentGrade,
    passingGrade: setting.passingGrade,
    releasedAt: setting.releasedAt,
    gradesReleased: !!setting.releasedAt,
    riskStatus,
    priority: note?.priority || (["At Risk", "Critical"].includes(riskStatus) ? "Urgent" : riskStatus === "Watch" ? "Medium" : "Low"),
    recitationBonus,
    categories,
    missingItems: [...new Set([...(note?.missingItems || []), ...missingItems])].slice(0, 20),
    privateNote: user.role === "student" ? "" : note?.privateNote || "",
    visibleAdvice: note?.visibleToStudent === false && user.role === "student" ? "" : note?.visibleAdvice || "",
    visibleToStudent: note?.visibleToStudent !== false,
    lastAdvisedAt: note?.updatedAt || note?.createdAt || ""
  };
  if (!summary.visibleAdvice) summary.visibleAdvice = automaticGradeAdvice(summary);
  return summary;
}

function gradeClassKeyParts(subjectId, section = "") {
  return `${subjectId}::${String(section || "").trim()}`;
}

function gradeClassRecordPairs(db) {
  const pairs = new Map();
  const add = (subjectId, section = "") => {
    const cleanSubjectId = String(subjectId || "").trim();
    const cleanSection = String(section || "").trim();
    if (cleanSubjectId && cleanSection) pairs.set(gradeClassKeyParts(cleanSubjectId, cleanSection), { subjectId: cleanSubjectId, section: cleanSection });
  };
  (db.gradeSettings || []).forEach((item) => add(item.subjectId, item.section));
  (db.writtenWorks || []).forEach((item) => add(item.subjectId, item.section));
  (db.quizzes || []).filter((item) => item.status !== "draft").forEach((item) => add(item.subjectId, item.section));
  (db.activities || []).forEach((item) => add(item.subjectId, item.section));
  (db.attendanceWeeks || []).forEach((item) => add(item.subjectId, item.section));
  (db.majorExams || []).forEach((item) => add(item.subjectId, item.section));
  return [...pairs.values()];
}

function gradeClassHasRecords(db, subjectId, section = "") {
  const cleanSection = String(section || "").trim();
  return gradeClassRecordPairs(db).some((item) => item.subjectId === subjectId && item.section === cleanSection);
}

function hydrateGradeSummaries(db, user) {
  const students = scopeStudents(db, user);
  const rows = [];
  const classPairs = new Map();
  students.forEach((student) => {
    (student.subjectIds || []).forEach((subjectId) => classPairs.set(gradeClassKeyParts(subjectId, student.section || ""), { subjectId, section: String(student.section || "").trim() }));
    (db.guildSystem?.classMemberships || [])
      .filter((membership) => membership.studentId === student.id)
      .forEach((membership) => classPairs.set(gradeClassKeyParts(membership.subjectId, membership.section), { subjectId: membership.subjectId, section: String(membership.section || "").trim() }));
  });
  gradeClassRecordPairs(db).forEach((pair) => classPairs.set(gradeClassKeyParts(pair.subjectId, pair.section), pair));
  classPairs.forEach(({ subjectId, section }) => {
    if (!db.subjects.some((subject) => subject.id === subjectId)) return;
    if (user.role !== "student" && (!canUseSubject(user, subjectId) || !canUseSection(user, section))) return;
    const hasRecords = gradeClassHasRecords(db, subjectId, section);
    const classStudentMap = new Map();
    if (hasRecords && section) {
      students
        .filter((student) => String(student.section || "").trim() === section)
        .forEach((student) => classStudentMap.set(student.id, student));
    }
    students
      .filter((student) => studentIsInClass(db, student, subjectId, section))
      .forEach((student) => classStudentMap.set(student.id, student));
    const classStudents = [...classStudentMap.values()];
    classStudents.forEach((student) => {
      const summary = gradeSummaryForStudent(db, student, subjectId, section, user);
      if (summary) rows.push(summary);
    });
  });
  return rows.sort((a, b) => a.subjectName.localeCompare(b.subjectName, undefined, { numeric: true }) || a.section.localeCompare(b.section, undefined, { numeric: true }) || a.studentName.localeCompare(b.studentName));
}

function gradeSettingsForUser(db, user) {
  const classes = new Map();
  scopeStudents(db, user).forEach((student) => {
    (db.subjects || []).forEach((subject) => {
      const sections = new Set();
      if ((student.subjectIds || []).includes(subject.id)) sections.add(student.section || "");
      (db.guildSystem?.classMemberships || []).filter((membership) => membership.studentId === student.id && membership.subjectId === subject.id).forEach((membership) => sections.add(String(membership.section || "").trim()));
      sections.forEach((section) => {
        if (canUseSubject(user, subject.id) && canUseSection(user, section)) classes.set(gradeClassKey(subject.id, section), { subjectId: subject.id, section });
      });
    });
  });
  return [...classes.values()].map(({ subjectId, section }) => ({
    ...gradeSettingFor(db, subjectId, section),
    subjectName: subjectName(db, subjectId),
    weightTotal: Object.values(gradeSettingFor(db, subjectId, section).weights || {}).reduce((sum, value) => sum + Number(value || 0), 0)
  }));
}

function activitySubmissionFiles(sub = {}) {
  return Array.isArray(sub.files) && sub.files.length ? sub.files : sub.file ? [sub.file] : [];
}

function activityMaterialFiles(activity = {}) {
  return Array.isArray(activity.materials) ? activity.materials : [];
}

function publicActivityFile(file, index) {
  return {
    fileIndex: index,
    fileName: file?.fileName || "",
    fileType: file?.fileType || "",
    fileSize: file?.fileSize || 0,
    uploadedAt: file?.uploadedAt || ""
  };
}

function hydrateActivities(db) {
  return db.activities.map((a) => {
    a.section = String(a.section || "").trim();
    a.deadline = normalizeActivityDeadline(a.deadline);
    a.maxScore = 100;
    a.materials = activityMaterialFiles(a).map(publicActivityFile);
    const base = activityBase(db, a.type);
    const submissions = a.submissions || [];
    const rows = studentsForClass(db, a.subjectId, a.section).map((s) => {
      const sub = submissions.find((x) => x.studentId === s.id) || {};
      const submittedAt = sub.submittedAt || sub.dateSubmitted || "";
      const effectiveDeadline = activityDeadlineForSubmission(a, sub);
      const late = sub.submitted ? activityDaysLate(effectiveDeadline, submittedAt) : 0;
      const earned = sub.submitted ? Math.max(0, base - late * db.settings.activities.latePenaltyPerDay) : 0;
      const maxScoreAllowed = activityMaxScoreAllowed(late);
      const score = activitySubmissionScore(sub, maxScoreAllowed);
      const scoreVisibleAt = activityScoreVisibleAt(a, sub);
      const scoreReleased = activityScoreReleased(a, sub);
      const files = activitySubmissionFiles(sub);
      const publicFiles = files.map(publicActivityFile);
      const file = files[0] || null;
      const submissionMethod = sub.submissionMethod || (files.length ? "upload" : sub.submitted ? "physical" : "");
      return {
        studentId: s.id,
        studentName: s.name,
        extendedDeadline: sub.extendedDeadline || "",
        effectiveDeadline,
        submitted: !!sub.submitted,
        status: sub.submitted ? `${late ? "Late" : "Submitted"}${submissionMethod === "physical" ? " - Physical" : ""}` : "Missing",
        submissionMethod,
        dateSubmitted: submittedAt,
        submittedAt,
        daysLate: late,
        maxScoreAllowed,
        earned,
        score,
        scoreVisibleAt,
        scoreReleased,
        remarks: sub.remarks || "",
        studentNote: sub.studentNote || "",
        fileName: file?.fileName || "",
        fileType: file?.fileType || "",
        fileSize: file?.fileSize || 0,
        fileData: "",
        files: publicFiles,
        fileNames: files.map((item) => item.fileName).filter(Boolean).join(", ")
      };
    });
    return { ...a, subjectName: subjectName(db, a.subjectId), basePoints: base, tracker: `${rows.filter((r) => r.submitted).length}/${rows.length}`, rows };
  });
}

function syncActivityRewards(db, activity, createdBy) {
  const basePoints = activityBase(db, activity.type);
  for (const submission of activity.submissions || []) {
    const submittedAt = submission.submittedAt || submission.dateSubmitted || "";
    const daysLate = submission.submitted ? activityDaysLate(activityDeadlineForSubmission(activity, submission), submittedAt) : 0;
    const earned = submission.submitted ? Math.max(0, basePoints - daysLate * Number(db.settings.activities.latePenaltyPerDay || 0)) : 0;
    const maxScoreAllowed = activityMaxScoreAllowed(daysLate);
    syncActivityAutoScore(submission, maxScoreAllowed);
    if (submission.score !== "" && submission.score != null && submission.scoreMode !== "auto") submission.score = Math.max(0, Math.min(Number(submission.score || 0), maxScoreAllowed));
    submission.snapshot = {
      type: activity.type,
      basePoints,
      latePenaltyPerDay: Number(db.settings.activities.latePenaltyPerDay || 0),
      daysLate,
      earned
    };
    const transaction = db.transactions.find((item) => item.meta?.kind === "activity" && item.meta.activityId === activity.id && item.studentId === submission.studentId);
    if (transaction) {
      transaction.amount = earned;
      transaction.note = activity.title;
      transaction.meta = { ...(transaction.meta || {}), subjectId: activity.subjectId, section: activity.section || "" };
    } else if (earned) {
      db.transactions.push(tx(submission.studentId, "activity", earned, activity.title, submittedAt || now(), createdBy, { kind: "activity", activityId: activity.id, subjectId: activity.subjectId, section: activity.section || "" }));
    }
  }
}

function hydrateActivitySummaries(db, visibleStudents = null, subjectIds = null, sectionIds = null) {
  const studentPool = visibleStudents || db.students;
  return db.activities
    .filter((activity) => (!subjectIds || subjectIds.has(activity.subjectId)) && (!sectionIds?.size || !activity.section || sectionIds.has(activity.section)))
    .map((activity) => {
      activity.deadline = normalizeActivityDeadline(activity.deadline);
      activity.section = String(activity.section || "").trim();
      const studentIds = new Set(studentsForClass(db, activity.subjectId, activity.section).map((student) => student.id));
      const students = studentPool.filter((student) => studentIds.has(student.id));
      const submittedCount = students.filter((student) => (activity.submissions || []).some((submission) => submission.studentId === student.id && submission.submitted)).length;
      return {
        id: activity.id,
        title: activity.title,
        subjectId: activity.subjectId,
        subjectName: subjectName(db, activity.subjectId),
        section: activity.section,
        dateCreated: activity.dateCreated,
        deadline: activity.deadline,
        type: activity.type,
        remarks: activity.remarks || "",
        basePoints: activityBase(db, activity.type),
        submittedCount,
        totalRows: students.length,
        tracker: `${submittedCount}/${students.length}`,
        rows: []
      };
    });
}

function lastNDays(days = 14) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function emptyDailyMap(key) {
  return Object.fromEntries(lastNDays().map((date) => [date, { date, [key]: 0 }]));
}

function dashboardSummary(db, user, students, studentIds, activitySummaries) {
  const todayText = today();
  const teacherSubjectIds = user.role === "teacher" ? new Set(user.subjectIds || []) : null;
  const teacherSectionIds = user.role === "teacher" ? new Set(user.sectionIds || []) : null;
  const scopedTransactions = db.transactions.filter((transaction) => studentIds.has(transaction.studentId));
  const scopedRecitations = db.recitations.filter((recitation) => studentIds.has(recitation.studentId));
  const scopedAttendance = db.attendanceRecords.filter((record) => studentIds.has(record.studentId));
  const visibleAttendanceWeeks = db.attendanceWeeks.filter((week) =>
    (!teacherSubjectIds || teacherSubjectIds.has(week.subjectId))
    && (!week.section || !teacherSectionIds?.size || teacherSectionIds.has(week.section))
  );
  const pendingRequests = requestRows(db, db.requests.filter((request) => canUseRequest(db, user, request) && request.status === "pending").sort(byDateDesc));
  const jcoinDailyMap = Object.fromEntries(lastNDays().map((date) => [date, { date, given: 0, removed: 0 }]));
  const transactionDailyMap = emptyDailyMap("transactions");
  const recitationDailyMap = emptyDailyMap("recitations");
  const attendanceDailyMap = Object.fromEntries(lastNDays().map((date) => [date, { date, onTime: 0, late: 0, excused: 0, absent: 0 }]));
  let produced = 0;
  let removed = 0;
  let todaysTransactionsCount = 0;
  scopedTransactions.forEach((transaction) => {
    const amount = Number(transaction.amount || 0);
    if (amount >= 0) produced += amount;
    else removed += Math.abs(amount);
    const date = String(transaction.createdAt || "").slice(0, 10);
    if (date === todayText) todaysTransactionsCount += 1;
    if (jcoinDailyMap[date]) {
      if (amount >= 0) jcoinDailyMap[date].given += amount;
      else jcoinDailyMap[date].removed += Math.abs(amount);
    }
    if (transactionDailyMap[date]) transactionDailyMap[date].transactions += 1;
  });
  scopedRecitations.forEach((recitation) => {
    if (recitationDailyMap[recitation.date]) recitationDailyMap[recitation.date].recitations += 1;
  });
  scopedAttendance.forEach((record) => {
    if (!attendanceDailyMap[record.date]) return;
    const week = db.attendanceWeeks.find((item) => item.id === record.weekId);
    if ((week?.cancelledDates || []).includes(record.date)) return;
    if (record.status === "check") attendanceDailyMap[record.date].onTime += 1;
    else if (record.status === "late") attendanceDailyMap[record.date].late += 1;
    else if (record.status === "excused") attendanceDailyMap[record.date].excused += 1;
    else attendanceDailyMap[record.date].absent += 1;
  });
  const submittedCount = activitySummaries.reduce((sum, activity) => sum + Number(activity.submittedCount || 0), 0);
  const totalRows = activitySummaries.reduce((sum, activity) => sum + Number(activity.totalRows || 0), 0);
  return {
    circulation: students.reduce((sum, student) => sum + Number(student.currentJCoins || 0), 0),
    produced,
    removed,
    todaysTransactionsCount,
    todaysRecitationsCount: scopedRecitations.filter((recitation) => recitation.date === todayText).length,
    pendingRequestsCount: pendingRequests.length,
    submittedPercent: totalRows ? Math.round((submittedCount / totalRows) * 100) : 0,
    attendanceWeeksCount: visibleAttendanceWeeks.length,
    shopItemsCount: db.shopItems.length,
    topThree: [...students].sort((a, b) => b.currentJCoins - a.currentJCoins).slice(0, 3),
    jcoinDaily: Object.values(jcoinDailyMap),
    recitationDaily: Object.values(recitationDailyMap),
    transactionDaily: Object.values(transactionDailyMap),
    attendanceDaily: Object.values(attendanceDailyMap),
    activityMonitor: activitySummaries.slice(0, 8),
    recentTransactions: scopedTransactions.map((transaction) => ({ ...transaction, studentName: studentName(db, transaction.studentId) })).sort(byDateDesc).slice(0, 10),
    recentRecitations: scopedRecitations.map((recitation) => ({ ...recitation, studentName: studentName(db, recitation.studentId), subjectName: subjectName(db, recitation.subjectId) })).sort(byDateDesc).slice(0, 10),
    pendingRequests: pendingRequests.slice(0, 10)
  };
}

function activeShopPrice(db, itemId, date = today()) {
  const item = db.shopItems.find((x) => x.id === itemId);
  if (!item) return null;
  const discounts = db.sales
    .filter((sale) => sale.startDate <= date && sale.endDate >= date && (!(sale.itemIds || []).length || (sale.itemIds || []).includes(itemId)))
    .map((sale) => Number(sale.discount || 0));
  const discount = Math.max(0, ...discounts);
  return { ...item, discount, activeCost: Math.round(Number(item.cost || 0) * (1 - discount / 100)) };
}

function activeAttendanceDates(week) {
  const cancelledDates = new Set(week.cancelledDates || []);
  return (week.dates || []).filter((date) => !cancelledDates.has(date));
}

function attendanceBonus(db, studentId, week) {
  const dates = activeAttendanceDates(week);
  if (!dates.length) return false;
  return dates.every((date) => db.attendanceRecords.find((r) => r.weekId === week.id && r.studentId === studentId && r.date === date)?.status === "check");
}

function recitationBonus(db, studentId, week) {
  const dates = activeAttendanceDates(week);
  if (!dates.length) return false;
  return dates.every((date) => db.recitations.some((r) => r.subjectId === week.subjectId && r.studentId === studentId && r.date === date));
}

function syncAttendanceTransaction(db, record, week, userId = "system", noteSuffix = "") {
  const existingIndex = db.transactions.findIndex((t) => t.meta?.kind === "attendance" && t.meta.recordId === record.id);
  const existing = existingIndex >= 0 ? db.transactions[existingIndex] : null;
  const isCancelled = (week?.cancelledDates || []).includes(record.date);
  const configuredAmount = isCancelled ? 0 : record.status === "check" ? db.settings.attendance.onTimePoints : ["late", "excused"].includes(record.status) ? db.settings.attendance.latePoints : 0;
  const amount = Number(configuredAmount) || 0;
  const baseNote = `${subjectName(db, week?.subjectId)} attendance ${record.date}`;
  const transactionNote = noteSuffix ? `${baseNote} | ${noteSuffix}` : baseNote;
  if (!amount) {
    if (existing) db.transactions.splice(existingIndex, 1);
    return;
  }
  if (existing) {
    existing.amount = amount;
    existing.note = transactionNote;
    existing.studentId = record.studentId;
    existing.type = "attendance";
    existing.meta = { ...(existing.meta || {}), kind: "attendance", recordId: record.id, weekId: record.weekId, date: record.date };
  } else {
    db.transactions.push(tx(record.studentId, "attendance", amount, transactionNote, now(), userId, { kind: "attendance", recordId: record.id, weekId: record.weekId, date: record.date }));
  }
}

function syncWeekBonus(db, studentId, week, kind, earned, amount, userId = "system", noteSuffix = "") {
  const existing = db.transactions.find((t) => t.meta?.kind === kind && t.meta.weekId === week.id && t.studentId === studentId);
  const note = `${subjectName(db, week.subjectId)} ${week.title} bonus${noteSuffix ? ` | ${noteSuffix}` : ""}`;
  if (earned) {
    if (existing) {
      existing.amount = amount;
      existing.note = note;
    } else {
      db.transactions.push(tx(studentId, kind === "attendance-week-bonus" ? "attendance_bonus" : "recitation_bonus", amount, note, now(), userId, { kind, weekId: week.id, subjectId: week.subjectId }));
    }
  } else if (existing) {
    existing.amount = 0;
  }
}

function syncWeekBonuses(db, week, userId = "system", noteSuffix = "") {
  const students = studentsForClass(db, week.subjectId, week.section);
  students.forEach((student) => {
    syncWeekBonus(db, student.id, week, "attendance-week-bonus", attendanceBonus(db, student.id, week), Number(db.settings.attendance.weeklyBonus || 0), userId, noteSuffix);
    syncWeekBonus(db, student.id, week, "recitation-week-bonus", recitationBonus(db, student.id, week), Number(db.settings.recitation.weeklyBonus || 0), userId, noteSuffix);
  });
}

function removeAttendanceWeek(db, weekId) {
  const removedRecordIds = new Set(db.attendanceRecords.filter((record) => record.weekId === weekId).map((record) => record.id));
  db.attendanceWeeks = db.attendanceWeeks.filter((week) => week.id !== weekId);
  db.attendanceRecords = db.attendanceRecords.filter((record) => record.weekId !== weekId);
  db.transactions = db.transactions.filter((transaction) => {
    const meta = transaction.meta || {};
    return meta.weekId !== weekId && !removedRecordIds.has(meta.recordId);
  });
}

function overviewModules(req, defaults = []) {
  const raw = String(req.query.modules || "").trim();
  if (!raw) return null;
  return new Set([...defaults, ...raw.split(",").map((item) => item.trim()).filter(Boolean)]);
}

function wantsModule(modules, name) {
  return !modules || modules.has(name) || modules.has("all");
}

function filteredOverview(db, user, modules = null) {
  const students = scopeStudents(db, user);
  const studentIds = new Set(students.map((s) => s.id));
  const currentStudent = user.role === "student" ? db.students.find((student) => student.id === user.studentId) : null;
  const subjectIds = user.role === "teacher" ? new Set(user.subjectIds || []) : null;
  const sectionIds = user.role === "teacher" ? new Set(user.sectionIds || []) : null;
  const visibleScheduleRows = db.schedules.filter((schedule) => {
    if (user.role === "admin") return true;
    if (user.role === "teacher") {
      return (!subjectIds || subjectIds.has(schedule.subjectId)) && (!sectionIds?.size || sectionIds.has(schedule.section));
    }
    if (user.role === "student") {
      const student = db.students.find((s) => s.id === user.studentId);
      return studentIsInClass(db, student, schedule.subjectId, schedule.section);
    }
    return false;
  });
  const includeDashboard = wantsModule(modules, "dashboard");
  const includeActivities = wantsModule(modules, "activities");
  const includeQuizzes = wantsModule(modules, "quizzes");
  const includeMajorExams = wantsModule(modules, "majorExams");
  const includeGrades = wantsModule(modules, "grades") || (user.role === "student" && wantsModule(modules, "profile"));
  const includeTransactions = wantsModule(modules, "transactions");
  const includeAttendance = wantsModule(modules, "attendance");
  const includeRecitations = wantsModule(modules, "recitations");
  const includeShop = wantsModule(modules, "shop") || wantsModule(modules, "transactions");
  const includeAppearance = wantsModule(modules, "appearance");
  const includeRequests = wantsModule(modules, "requests") || includeShop;
  const includeFeedback = wantsModule(modules, "feedback");
  const includeSchedules = wantsModule(modules, "schedule");
  const includeGuild = wantsModule(modules, "guild") || wantsModule(modules, "settings");
  const includePeople = wantsModule(modules, "people");
  const includeAudit = ["admin", "teacher"].includes(user.role) && wantsModule(modules, "audit");
  const fullActivities = includeActivities ? hydrateActivities(db)
    .filter((activity) => (!subjectIds || subjectIds.has(activity.subjectId))
      && (!sectionIds?.size || !activity.section || sectionIds.has(activity.section))
      && (user.role !== "student" || studentIsInClass(db, currentStudent, activity.subjectId, activity.section)))
    .map((activity) => {
      if (!sectionIds?.size && user.role !== "student") return activity;
      const rows = activity.rows.filter((row) => studentIds.has(row.studentId));
      if (user.role === "student") {
        const studentRows = rows.map((row) => row.scoreReleased ? row : { ...row, score: "", scoreHiddenUntil: row.scoreVisibleAt });
        return { ...activity, rows: studentRows, tracker: `${studentRows.filter((row) => row.submitted).length}/${studentRows.length}` };
      }
      return { ...activity, rows, tracker: `${rows.filter((row) => row.submitted).length}/${rows.length}` };
    }) : [];
  const activitySummaries = includeDashboard && !includeActivities ? hydrateActivitySummaries(db, students, subjectIds, sectionIds) : fullActivities;
  const transactions = includeTransactions ? db.transactions.filter((t) => studentIds.has(t.studentId)).map((t) => ({ ...t, studentName: studentName(db, t.studentId) })).sort(byDateDesc) : [];
  const dashboard = includeDashboard ? dashboardSummary(db, user, students, studentIds, includeActivities ? fullActivities : activitySummaries) : null;
  return {
    user,
    dashboard,
    settings: db.settings,
    subjects: user.role === "teacher" ? db.subjects.filter((subject) => subjectIds.has(subject.id)) : db.subjects,
    sections: db.sections,
    students,
    users: includePeople && user.role === "admin" ? db.users.map((u) => userWithStudent(u, db)) : [],
    transactions,
    attendanceWeeks: includeAttendance ? db.attendanceWeeks.filter((w) =>
      (!subjectIds || subjectIds.has(w.subjectId))
      && (!w.section || !sectionIds?.size || sectionIds.has(w.section))
    ).map((w) => ({ ...w, subjectName: subjectName(db, w.subjectId) })) : [],
    attendanceRecords: includeAttendance ? db.attendanceRecords.filter((r) => studentIds.has(r.studentId)) : [],
    recitations: includeRecitations ? db.recitations.filter((r) => studentIds.has(r.studentId)).map((r) => ({ ...r, studentName: studentName(db, r.studentId), subjectName: subjectName(db, r.subjectId) })).sort(byDateDesc) : [],
    activities: includeActivities ? fullActivities : activitySummaries,
    quizzes: includeQuizzes ? hydrateQuizzes(db, user) : [],
    majorExams: includeMajorExams ? hydrateMajorExams(db, user) : [],
    writtenWorks: includeGrades ? hydrateWrittenWorks(db, user) : [],
    gradeSettings: includeGrades && user.role !== "student" ? gradeSettingsForUser(db, user) : [],
    gradeSummaries: includeGrades ? hydrateGradeSummaries(db, user) : [],
    shopItems: includeShop ? db.shopItems.map((item) => activeShopPrice(db, item.id)) : [],
    sales: includeShop ? db.sales : [],
    appearanceItems: includeAppearance ? db.appearanceItems : [],
    appearanceGifts: includeAppearance && user.role === "admin" ? appearanceGiftRows(db) : [],
    requests: includeRequests
      ? requestRows(db, db.requests.filter((request) => canUseRequest(db, user, request)).sort(byDateDesc))
      : includeDashboard
        ? requestRows(db, db.requests.filter((request) => canUseRequest(db, user, request) && (request.status === "pending" || (request.type === "registration" && request.status === "created"))).sort(byDateDesc)).slice(0, 20)
        : [],
    feedback: includeFeedback
      ? feedbackRows(db, (db.feedback || []).filter((entry) => user.role === "admin" || studentIds.has(entry.studentId)))
      : includeDashboard
        ? feedbackRows(db, (db.feedback || []).filter((entry) => entry.status === "New" && (user.role === "admin" || studentIds.has(entry.studentId)))).slice(0, 20)
        : [],
    schedules: includeSchedules ? scheduleRows(db, visibleScheduleRows) : [],
    guildSystem: includeGuild ? guildSystemView(db, user) : {},
    groupActivities: includeGuild ? hydrateGroupActivities(db, user) : [],
    auditLogs: includeAudit ? auditLogRows(db, scopedAuditLogs(db, user, studentIds, subjectIds, sectionIds)).slice(0, 500) : []
  };
}

function studentAssistantAccess(db, user) {
  const assignment = activeStudentAssistant(db, user);
  if (!assignment) return { active: false };
  const students = assistantScopeStudents(db, assignment);
  const studentIds = new Set(students.map((student) => student.id));
  return {
    active: true,
    assignment,
    students: hideProfilePhotos(students),
    transactions: db.transactions.filter((transaction) => studentIds.has(transaction.studentId)).map((transaction) => ({ ...transaction, studentName: studentName(db, transaction.studentId) })).sort(byDateDesc),
    attendanceRecords: db.attendanceRecords.filter((record) => studentIds.has(record.studentId)),
    recitations: db.recitations.filter((recitation) => studentIds.has(recitation.studentId)).map((recitation) => ({ ...recitation, studentName: studentName(db, recitation.studentId), subjectName: subjectName(db, recitation.subjectId) })).sort(byDateDesc)
  };
}

function assistantAssignmentRows(db, user) {
  return (db.studentAssistants || []).filter((assignment) => canUseSection(user, assignment.section)).map((assignment) => ({
    ...assignment,
    studentName: studentName(db, assignment.studentId),
    assignedByName: db.users.find((user) => user.id === assignment.createdBy)?.username || "system",
    active: assistantAssignmentIsActive(assignment),
    status: assistantAssignmentIsActive(assignment) ? "Active" : new Date(assignment.startAt).getTime() > Date.now() ? "Scheduled" : "Completed",
    dailyReward: STUDENT_ASSISTANT_DAILY_REWARD
  })).sort((a, b) => String(b.startAt).localeCompare(String(a.startAt)) || String(a.section).localeCompare(String(b.section)));
}

app.get("/api/health", (req, res) => res.json({ ok: true, storage: supabase ? "supabase" : "file" }));

app.get("/api/admin/storage-health", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  res.json(await storageHealthSummary(db));
});

app.post("/api/auth/login", loginIpLimit, async (req, res) => {
  await dbWriteQueue.catch(() => {});
  if (!cachedDbIsFresh() || !cachedAuthUsernames.size) await readDb();
  const username = String(req.body.username || "").trim().toLowerCase();
  const user = cachedAuthUsernames.get(username);
  if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash))) {
    const delayMs = recordLoginFailure(req, username);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return res.status(401).json({ error: "Invalid username or password" });
  }
  clearLoginFailures(username);
  res.json({ token: sign(user), user: publicUser(user) });
});

app.post("/api/auth/change-password", auth, async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user || !(await bcrypt.compare(String(req.body.currentPassword || ""), user.passwordHash))) return res.status(401).json({ error: "Current password is wrong." });
  if (String(req.body.newPassword || "").length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  user.passwordHash = await bcrypt.hash(String(req.body.newPassword), 10);
  user.mustChangePassword = false;
  user.authVersion = Number(user.authVersion || 0) + 1;
  addAuditLog(db, user, "account.password.change", {
    entityType: "user",
    entityId: user.id,
    targetStudentId: user.studentId || null,
    summary: `Password changed for ${user.username}.`
  });
  await writeDb(db);
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get("/api/registration/options", async (req, res) => {
  const db = await readSharedDb();
  res.json({
    enabled: !!db.settings.registration?.enabled,
    sections: db.sections || [],
    subjects: db.subjects.map((subject) => ({ id: subject.id, name: subject.name }))
  });
});

app.get("/api/events", (req, res) => {
  const token = String(req.query.token || "");
  const entry = eventTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    eventTokens.delete(token);
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = entry.user;
  const id = randomUUID();
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  sendEvent(res, "ready", { connectedAt: now(), role: user.role });
  eventClients.set(id, res);
  const heartbeat = setInterval(() => {
    if (!sendEvent(res, "ping", { at: now() })) {
      clearInterval(heartbeat);
      eventClients.delete(id);
    }
  }, 25000);
  req.on("close", () => {
    clearInterval(heartbeat);
    eventClients.delete(id);
  });
});

app.get("/api/events/token", auth, (req, res) => {
  const token = randomUUID();
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  eventTokens.set(token, { user: req.user, expiresAt });
  for (const [key, entry] of eventTokens.entries()) {
    if (entry.expiresAt < Date.now()) eventTokens.delete(key);
  }
  res.json({ token, expiresAt: new Date(expiresAt).toISOString() });
});

app.post("/api/auth/register-student", registrationLimit, registrationAccountLimit, async (req, res) => {
  const db = await readDb();
  if (!db.settings.registration?.enabled) return res.status(403).json({ error: "Student registration is currently closed." });
  const surname = String(req.body.surname || "").trim();
  const firstName = String(req.body.firstName || "").trim();
  const middleName = String(req.body.middleName || "").trim();
  const password = String(req.body.password || "");
  const section = String(req.body.section || "").trim();
  const subjectIds = Array.isArray(req.body.subjectIds) ? [...new Set(req.body.subjectIds)] : [];
  const code = String(req.body.registrationCode || "").trim();
  const expectedCode = String(db.settings.registration?.code || "").trim();
  if (!surname || !firstName) return res.status(400).json({ error: "Surname and first name are required." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (!expectedCode) return res.status(403).json({ error: "Registration code is not configured yet." });
  if (code !== expectedCode) return res.status(403).json({ error: "Registration code is incorrect." });
  if (!db.sections.includes(section)) return res.status(400).json({ error: "Choose an existing section." });
  if (!subjectIds.length || subjectIds.some((subjectId) => !db.subjects.some((subject) => subject.id === subjectId))) return res.status(400).json({ error: "Choose existing subjects." });
  const fullName = formatStudentFullName({ surname, firstName, middleName });
  const username = studentRegistrationUsername({ surname, firstName });
  if (!username || username === ".") return res.status(400).json({ error: "Enter a valid surname and first name." });
  const duplicateUser = db.users.some((user) => user.username.toLowerCase() === username.toLowerCase());
  const duplicateStudent = db.students.some((student) => student.name.toLowerCase() === fullName.toLowerCase());
  if (duplicateUser || duplicateStudent) return res.status(409).json({ error: "This student already has an account." });
  const createdAt = now();
  const student = { id: randomUUID(), name: fullName, section, subjectIds, createdAt };
  db.students.push(student);
  db.users.push({ id: randomUUID(), username, passwordHash: await bcrypt.hash(password, 10), role: "student", mustChangePassword: false, studentId: student.id, subjectIds: [], sectionIds: [] });
  db.requests = db.requests.filter((request) => request.type !== "registration" || (
    String(request.payload?.username || "").toLowerCase() !== username.toLowerCase()
    && String(request.payload?.fullName || "").toLowerCase() !== fullName.toLowerCase()
  ));
  db.requests.push({
    id: randomUUID(),
    type: "registration",
    status: "created",
    studentId: student.id,
    payload: {
      surname: surname.toUpperCase(),
      firstName: firstName.toUpperCase(),
      middleName: middleName.toUpperCase(),
      fullName,
      username,
      section,
      subjectIds
    },
    remarks: `Student account created for ${fullName}`,
    createdAt,
    resolvedAt: createdAt,
    createdBy: "self-registration",
    resolvedBy: "self-registration"
  });
  await writeDb(db);
  queuePushToUsers(db, staffUserIdsForStudent(db, student.id), {
    title: "Student account created",
    body: `${fullName} registered in ${section}.`,
    url: "/approvals",
    tag: `registration-${student.id}`
  });
  res.status(201).json({ username, fullName, status: "created" });
});

app.get("/api/leaderboard", async (req, res) => {
  const db = await readSharedDb();
  const students = hideProfilePhotos(hydrateStudents(db)).map((student) => {
    const { username, userId, subjectIds, createdAt, profilePhoto, ...publicStudent } = student;
    return publicStudent;
  });
  res.json({ students, subjects: db.subjects.map((subject) => ({ id: subject.id, name: subject.name })) });
});

app.get("/api/me", auth, async (req, res) => {
  const db = await readSharedDb();
  res.json(filteredOverview(db, req.user, overviewModules(req)));
});

app.get("/api/push/config", auth, async (req, res) => {
  const config = await getPushConfig();
  res.json({ enabled: !!config, publicKey: config?.publicKey || "" });
});

app.post("/api/push/subscribe", auth, async (req, res) => {
  let subscription;
  try {
    subscription = cleanPushSubscription(req.body.subscription || req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!await getPushConfig()) return res.status(503).json({ error: "Push notifications are not configured yet." });
  const db = await readDb();
  const id = pushSubscriptionId(subscription.endpoint);
  const entry = {
    id,
    userId: req.user.id,
    ...subscription,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 240),
    createdAt: db.pushSubscriptions.find((item) => item.id === id)?.createdAt || now(),
    updatedAt: now()
  };
  const withoutEndpoint = db.pushSubscriptions.filter((item) => item.id !== id);
  const currentUserSubscriptions = [...withoutEndpoint.filter((item) => item.userId === req.user.id), entry]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 5);
  db.pushSubscriptions = [
    ...withoutEndpoint.filter((item) => item.userId !== req.user.id),
    ...currentUserSubscriptions
  ];
  await writeDb(db);
  res.status(201).json({ subscribed: true });
});

app.post("/api/push/unsubscribe", auth, async (req, res) => {
  const endpoint = String(req.body.endpoint || "").trim();
  const db = await readDb();
  db.pushSubscriptions = db.pushSubscriptions.filter((item) => item.userId !== req.user.id || item.endpoint !== endpoint);
  await writeDb(db);
  res.json({ subscribed: false });
});

app.get("/api/student/me", auth, requireRole("student"), async (req, res) => {
  const db = await readSharedDb();
  const modules = overviewModules(req, ["leaderboard"]);
  const overview = filteredOverview(db, req.user, modules);
  const student = overview.students[0];
  const allStudents = hideProfilePhotos(hydrateStudents(db));
  const includeProfile = wantsModule(modules, "profile");
  const includeAppearance = wantsModule(modules, "appearance");
  const inventory = includeAppearance ? db.appearanceInventory
    .filter((entry) => entry.studentId === student.id)
    .map((entry) => ({ ...entry, item: appearanceItem(db, entry.itemId) }))
    .filter((entry) => entry.item) : [];
  const gifts = includeAppearance ? appearanceGiftRows(db, student.id) : [];
  const weeks = includeProfile ? db.attendanceWeeks.filter((w) => studentIsInClass(db, student, w.subjectId, w.section)).map((w) => ({
    ...w,
    subjectName: subjectName(db, w.subjectId),
    attendanceBonus: attendanceBonus(db, student.id, w),
    recitationBonus: recitationBonus(db, student.id, w)
  })) : [];
  res.json({ ...overview, students: allStudents, student, appearanceInventory: inventory, appearanceGifts: gifts, weeks, assistantAccess: studentAssistantAccess(db, req.user) });
});

app.post("/api/student/profile-photo", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const student = db.students.find((s) => s.id === req.user.studentId);
  if (!student) return res.status(404).json({ error: "Student not found." });
  try {
    student.profilePhoto = cleanProfilePhoto(req.body.profilePhoto);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  await writeDb(db);
  res.json({ profilePhoto: student.profilePhoto });
});

app.get("/api/admin/overview", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readSharedDb();
  const modules = overviewModules(req, ["dashboard"]);
  const overview = filteredOverview(db, req.user, modules);
  res.json({ ...overview, students: hideProfilePhotos(overview.students), studentAssistants: wantsModule(modules, "people") ? assistantAssignmentRows(db, req.user) : [] });
});

app.post("/api/admin/guild/start-assessment", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = normalizeGuildSystem(db.guildSystem);
  db.guildSystem.status = "open";
  db.guildSystem.startedAt = now();
  db.guildSystem.lockedAt = "";
  await writeDb(db);
  res.json({ guildSystem: guildSystemView(db, req.user) });
});

app.post("/api/admin/guild/lock-assessment", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = normalizeGuildSystem(db.guildSystem);
  db.guildSystem.status = "locked";
  db.guildSystem.lockedAt = now();
  await writeDb(db);
  res.json({ guildSystem: guildSystemView(db, req.user) });
});

app.post("/api/admin/guild/start-ceremony", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = normalizeGuildSystem(db.guildSystem);
  db.guildSystem.status = "ceremony_active";
  db.guildSystem.ceremonyStartedAt = now();
  await writeDb(db);
  res.json({ guildSystem: guildSystemView(db, req.user) });
});

app.post("/api/admin/guild/reset", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = defaultGuildSystem();
  reconcileGroupActivities(db, req.user.id);
  await writeDb(db);
  res.json({ guildSystem: guildSystemView(db, req.user) });
});

app.post("/api/admin/guild/random-distribute", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = normalizeGuildSystem(db.guildSystem);
  const section = String(req.body.section || "").trim();
  if (!section) return res.status(400).json({ error: "Choose a section." });
  if (!canUseSection(req.user, section === "No section" ? "" : section)) return res.status(403).json({ error: "This section is outside your assigned class scope." });
  const scopedIds = scopedStudentIds(db, req.user);
  const sectionStudents = db.students
    .filter((student) => scopedIds.has(student.id) && guildSection(student) === section)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!sectionStudents.length) return res.status(400).json({ error: "No students found in that section." });

  const studentIds = new Set(sectionStudents.map((student) => student.id));
  db.guildSystem.responses = db.guildSystem.responses.filter((response) => !studentIds.has(response.studentId));
  const assignedAt = now();
  const shuffledStudents = shuffleList(sectionStudents);
  const shuffledGuildIds = shuffleList(guilds.map((guild) => guild.id));
  const assignments = shuffledStudents.map((student, index) => {
    const assignedGuildId = shuffledGuildIds[index % shuffledGuildIds.length];
    const response = {
      id: randomUUID(),
      studentId: student.id,
      answers: [],
      affinities: Object.fromEntries(guilds.map((guild) => [guild.id, 0])),
      assignedGuildId,
      revealed: false,
      submittedAt: assignedAt,
      revealedAt: "",
      source: "random_distribution",
      assignedBy: req.user.id,
      assignedAt
    };
    db.guildSystem.responses.push(response);
    return { studentId: student.id, studentName: student.name, section: student.section || "", guild: publicGuild(assignedGuildId) };
  });
  reconcileGroupActivities(db, req.user.id);
  await writeDb(db);
  res.json({ section, assignedCount: assignments.length, assignments });
});

app.get("/api/admin/guild/students/:id/preview", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(req.params.id)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  const response = guildResponse(db, req.params.id);
  if (!response) return res.status(404).json({ error: "Student has not submitted the assessment yet." });
  res.json({ studentId: req.params.id, studentName: studentName(db, req.params.id), traits: guildTraitPreview(response.affinities) });
});

app.post("/api/admin/guild/students/:id/reveal", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = normalizeGuildSystem(db.guildSystem);
  if (db.guildSystem.status !== "ceremony_active") return res.status(400).json({ error: "Start the Sorting Ceremony first." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(req.params.id)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  const response = guildResponse(db, req.params.id);
  if (!response) return res.status(404).json({ error: "Student has not submitted the assessment yet." });
  response.revealed = true;
  response.revealedAt ||= now();
  await writeDb(db);
  res.json({ studentId: req.params.id, studentName: studentName(db, req.params.id), guild: publicGuild(response.assignedGuildId) });
});

app.post("/api/admin/guild/reveal-all", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = normalizeGuildSystem(db.guildSystem);
  if (db.guildSystem.status !== "ceremony_active") return res.status(400).json({ error: "Start the Sorting Ceremony first." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  const revealedAt = now();
  const revealed = [];
  db.guildSystem.responses.forEach((response) => {
    if (!response.revealed && allowedStudentIds.has(response.studentId)) {
      response.revealed = true;
      response.revealedAt = revealedAt;
      revealed.push({
        studentId: response.studentId,
        studentName: studentName(db, response.studentId),
        section: db.students.find((student) => student.id === response.studentId)?.section || "",
        guild: publicGuild(response.assignedGuildId)
      });
    }
  });
  await writeDb(db);
  res.json({ revealedCount: revealed.length, revealed });
});

app.post("/api/admin/guild/students/:id/assign", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = normalizeGuildSystem(db.guildSystem);
  const student = db.students.find((item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found." });
  const guild = guilds.find((item) => item.id === req.body.guildId);
  if (!guild) return res.status(400).json({ error: "Choose a valid guild." });
  let response = guildResponse(db, student.id);
  if (!response) {
    response = {
      id: randomUUID(),
      studentId: student.id,
      answers: [],
      affinities: Object.fromEntries(guilds.map((item) => [item.id, 0])),
      assignedGuildId: guild.id,
      revealed: false,
      submittedAt: now(),
      revealedAt: "",
      source: "admin_assign"
    };
    db.guildSystem.responses.push(response);
  }
  response.assignedGuildId = guild.id;
  response.assignedBy = req.user.id;
  response.assignedAt = now();
  response.source = response.source || "assessment";
  reconcileGroupActivities(db, req.user.id);
  await writeDb(db);
  res.json({ studentId: student.id, studentName: student.name, guild: publicGuild(guild.id) });
});

app.post("/api/admin/guild/students/:id/remove", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = normalizeGuildSystem(db.guildSystem);
  const student = db.students.find((item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found." });
  const before = db.guildSystem.responses.length;
  db.guildSystem.responses = db.guildSystem.responses.filter((response) => response.studentId !== student.id);
  reconcileGroupActivities(db, req.user.id);
  await writeDb(db);
  res.json({ studentId: student.id, studentName: student.name, removed: before !== db.guildSystem.responses.length });
});

app.post("/api/student/guild/submit", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  db.guildSystem = normalizeGuildSystem(db.guildSystem);
  if (db.guildSystem.status !== "open") return res.status(400).json({ error: "The Guild Affinity Assessment is not open right now." });
  if (!db.students.some((student) => student.id === req.user.studentId)) return res.status(404).json({ error: "Student not found." });
  if (guildResponse(db, req.user.studentId)) return res.status(409).json({ error: "You already submitted the assessment." });
  const incoming = Array.isArray(req.body.answers)
    ? Object.fromEntries(req.body.answers.map((entry) => [entry.questionId, entry.value]))
    : req.body.answers || {};
  const answers = {};
  for (const question of guildQuestions) {
    const value = Number(incoming[question.id]);
    if (!Number.isInteger(value) || value < 1 || value > 5) return res.status(400).json({ error: "Answer all questions from 1 to 5 before submitting." });
    answers[question.id] = value;
  }
  const affinities = calculateGuildAffinities(answers);
  const student = db.students.find((item) => item.id === req.user.studentId);
  const assignedGuildId = assignGuild(db, affinities, student);
  const submittedAt = now();
  db.guildSystem.responses.push({
    id: randomUUID(),
    studentId: req.user.studentId,
    answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
    affinities,
    assignedGuildId,
    revealed: false,
    submittedAt,
    revealedAt: ""
  });
  await writeDb(db);
  res.status(201).json({ submittedAt });
});

app.post("/api/admin/guild/group-activities", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  let input;
  try {
    input = groupActivityInput(db, req.body, req.user);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const activity = { id: randomUUID(), ...input, votes: [], guildResults: [], createdAt: now(), createdBy: req.user.id, updatedAt: now() };
  db.groupActivities.push(activity);
  await writeDb(db);
  res.status(201).json({ activity: publicGroupActivity(db, activity, req.user) });
});

app.put("/api/admin/guild/group-activities/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = (db.groupActivities || []).find((item) => item.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Group activity not found." });
  if (!canUseSubject(req.user, activity.subjectId) || !canUseSection(req.user, activity.section)) return res.status(403).json({ error: "This activity is outside your assigned scope." });
  let input;
  try {
    input = groupActivityInput(db, req.body, req.user, activity);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const hasProgress = !!((activity.votes || []).length || (activity.guildResults || []).some((result) => result.teacherScore != null));
  if (hasProgress && (input.subjectId !== activity.subjectId || input.section !== activity.section)) return res.status(409).json({ error: "Subject and section are locked after voting or grading starts." });
  Object.assign(activity, input, { updatedAt: now() });
  (activity.guildResults || []).forEach((result) => {
    if (result.teacherScore != null) syncGroupActivityRewards(db, activity, result, req.user.id);
  });
  await writeDb(db);
  res.json({ activity: publicGroupActivity(db, activity, req.user) });
});

app.delete("/api/admin/guild/group-activities/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = (db.groupActivities || []).find((item) => item.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Group activity not found." });
  if (!canUseSubject(req.user, activity.subjectId) || !canUseSection(req.user, activity.section)) return res.status(403).json({ error: "This activity is outside your assigned scope." });
  db.groupActivities = db.groupActivities.filter((item) => item.id !== activity.id);
  db.transactions = db.transactions.filter((transaction) => transaction.meta?.groupActivityId !== activity.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/student/guild/group-activities/:id/vote", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const activity = (db.groupActivities || []).find((item) => item.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Group activity not found." });
  const guildId = studentClassGuildId(db, req.user.studentId, activity.subjectId, activity.section);
  if (!guildId) return res.status(403).json({ error: "Your guild must be assigned before voting." });
  const members = groupActivityMembers(db, activity, guildId);
  const memberIds = new Set(members.map((member) => member.id));
  if (!memberIds.has(req.user.studentId)) return res.status(403).json({ error: "This group activity is not assigned to you." });
  const result = groupActivityResult(activity, guildId);
  if (result?.leaderId) return res.status(409).json({ error: "The group leader is already finalized." });
  if (!groupActivityDeadlineOpen(activity)) return res.status(400).json({ error: "Leader voting has closed." });
  const candidateId = String(req.body.candidateId || "");
  if (!memberIds.has(candidateId)) return res.status(400).json({ error: "Choose a member of your guild." });
  activity.votes = (activity.votes || []).filter((vote) => vote.studentId !== req.user.studentId);
  activity.votes.push({ studentId: req.user.studentId, candidateId, guildId, createdAt: now() });
  activity.updatedAt = now();
  await writeDb(db);
  res.json({ activity: publicGroupActivity(db, activity, req.user) });
});

app.put("/api/admin/guild/group-activities/:id/leader", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = (db.groupActivities || []).find((item) => item.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Group activity not found." });
  if (!canUseSubject(req.user, activity.subjectId) || !canUseSection(req.user, activity.section)) return res.status(403).json({ error: "This activity is outside your assigned scope." });
  const guildId = String(req.body.guildId || "");
  const leaderId = String(req.body.leaderId || "");
  const members = groupActivityMembers(db, activity, guildId);
  if (!members.length) return res.status(400).json({ error: "This guild has no eligible members in the class." });
  if (!members.some((member) => member.id === leaderId)) return res.status(400).json({ error: "Choose a member of this guild as leader." });
  const result = groupActivityResult(activity, guildId, true);
  const leaderChanged = result.leaderId !== leaderId;
  result.leaderId = leaderId;
  result.leaderFinalizedAt = now();
  if (leaderChanged) result.distributedAt = "";
  if (result.teacherScore != null) {
    result.memberGrades = Object.fromEntries(Object.entries(result.memberGrades || {})
      .filter(([studentId]) => members.some((member) => member.id === studentId))
      .map(([studentId, grade]) => [studentId, Math.min(result.teacherScore, Math.max(0, Number(grade || 0)))]));
    result.memberGrades[leaderId] = result.teacherScore;
    syncGroupActivityRewards(db, activity, result, req.user.id);
  }
  activity.updatedAt = now();
  await writeDb(db);
  res.json({ activity: publicGroupActivity(db, activity, req.user) });
});

app.put("/api/admin/guild/group-activities/:id/grade", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = (db.groupActivities || []).find((item) => item.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Group activity not found." });
  if (!canUseSubject(req.user, activity.subjectId) || !canUseSection(req.user, activity.section)) return res.status(403).json({ error: "This activity is outside your assigned scope." });
  const guildId = String(req.body.guildId || "");
  const members = groupActivityMembers(db, activity, guildId);
  if (!members.length) return res.status(400).json({ error: "This guild has no eligible members in the class." });
  const score = Number(req.body.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) return res.status(400).json({ error: "Teacher grade must be from 0 to 100." });
  const result = groupActivityResult(activity, guildId, true);
  if (!result.leaderId) {
    const winner = groupVoteSummary(db, activity, guildId, members).winner;
    if (!winner) return res.status(400).json({ error: "At least one student must vote before the leader can be finalized." });
    result.leaderId = winner.studentId;
    result.leaderFinalizedAt = now();
  }
  result.teacherScore = Math.round(score);
  result.teacherGradedAt = now();
  result.teacherGradedBy = req.user.id;
  result.memberGrades = Object.fromEntries(Object.entries(result.memberGrades || {})
    .filter(([studentId]) => members.some((member) => member.id === studentId))
    .map(([studentId, grade]) => [studentId, Math.min(result.teacherScore, Math.max(0, Number(grade || 0)))]));
  result.memberGrades[result.leaderId] = result.teacherScore;
  syncGroupActivityRewards(db, activity, result, req.user.id);
  activity.updatedAt = now();
  await writeDb(db);
  res.json({ activity: publicGroupActivity(db, activity, req.user) });
});

app.put("/api/student/guild/group-activities/:id/distribute", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const activity = (db.groupActivities || []).find((item) => item.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Group activity not found." });
  const guildId = studentClassGuildId(db, req.user.studentId, activity.subjectId, activity.section);
  const result = groupActivityResult(activity, guildId);
  if (!result || result.leaderId !== req.user.studentId || result.teacherScore == null) return res.status(403).json({ error: "Only the finalized leader can distribute member grades." });
  const members = groupActivityMembers(db, activity, guildId);
  const incoming = req.body.grades && typeof req.body.grades === "object" && !Array.isArray(req.body.grades) ? req.body.grades : {};
  const memberGrades = { [result.leaderId]: Number(result.teacherScore) };
  for (const member of members) {
    if (member.id === result.leaderId) continue;
    if (!Object.prototype.hasOwnProperty.call(incoming, member.id)) return res.status(400).json({ error: `Give a grade to ${member.name}.` });
    const grade = Number(incoming[member.id]);
    if (!Number.isFinite(grade) || grade < 0 || grade > Number(result.teacherScore)) return res.status(400).json({ error: `Grades must be from 0 to ${result.teacherScore}.` });
    memberGrades[member.id] = Math.round(grade);
  }
  result.memberGrades = memberGrades;
  result.distributedAt = now();
  syncGroupActivityRewards(db, activity, result, req.user.id);
  activity.updatedAt = now();
  await writeDb(db);
  res.json({ activity: publicGroupActivity(db, activity, req.user) });
});

app.post("/api/admin/subjects", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Subject name is required." });
  if (db.subjects.some((subject) => subject.name.trim().toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: "Subject already exists." });
  const subject = { id: randomUUID(), name };
  db.subjects.push(subject);
  await writeDb(db);
  res.status(201).json({ subject });
});

app.put("/api/admin/subjects/:id", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const subject = db.subjects.find((s) => s.id === req.params.id);
  if (!subject) return res.status(404).json({ error: "Subject not found." });
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Subject name is required." });
  if (db.subjects.some((item) => item.id !== subject.id && item.name.trim().toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: "Subject already exists." });
  subject.name = name;
  await writeDb(db);
  res.json({ subject });
});

app.delete("/api/admin/subjects/:id", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const subject = db.subjects.find((s) => s.id === req.params.id);
  if (!subject) return res.status(404).json({ error: "Subject not found." });
  const subjectId = subject.id;
  const removedWeekIds = new Set(db.attendanceWeeks.filter((week) => week.subjectId === subjectId).map((week) => week.id));
  const removedRecordIds = new Set(db.attendanceRecords.filter((record) => removedWeekIds.has(record.weekId)).map((record) => record.id));
  const removedRecitationIds = new Set(db.recitations.filter((recitation) => recitation.subjectId === subjectId).map((recitation) => recitation.id));
  const removedActivityIds = new Set(db.activities.filter((activity) => activity.subjectId === subjectId).map((activity) => activity.id));
  const removedGroupActivityIds = new Set((db.groupActivities || []).filter((activity) => activity.subjectId === subjectId).map((activity) => activity.id));
  const removedQuizIds = new Set((db.quizzes || []).filter((quiz) => quiz.subjectId === subjectId).map((quiz) => quiz.id));
  db.majorExams = (db.majorExams || []).filter((exam) => exam.subjectId !== subjectId);
  db.writtenWorks = (db.writtenWorks || []).filter((work) => work.subjectId !== subjectId);
  db.gradeSettings = (db.gradeSettings || []).filter((setting) => setting.subjectId !== subjectId);
  db.gradeNotes = (db.gradeNotes || []).filter((note) => note.subjectId !== subjectId);
  db.subjects = db.subjects.filter((s) => s.id !== subjectId);
  db.students.forEach((student) => { student.subjectIds = (student.subjectIds || []).filter((id) => id !== subjectId); });
  db.users.forEach((user) => { user.subjectIds = (user.subjectIds || []).filter((id) => id !== subjectId); });
  removedWeekIds.forEach((weekId) => removeAttendanceWeek(db, weekId));
  db.schedules = (db.schedules || []).filter((schedule) => schedule.subjectId !== subjectId);
  db.recitations = db.recitations.filter((recitation) => recitation.subjectId !== subjectId);
  db.activities = db.activities.filter((activity) => activity.subjectId !== subjectId);
  db.groupActivities = (db.groupActivities || []).filter((activity) => activity.subjectId !== subjectId);
  db.quizzes = (db.quizzes || []).filter((quiz) => quiz.subjectId !== subjectId);
  db.transactions = db.transactions.filter((transaction) => {
    const meta = transaction.meta || {};
    return meta.subjectId !== subjectId
      && !removedWeekIds.has(meta.weekId)
      && !removedRecordIds.has(meta.recordId)
      && !removedRecitationIds.has(meta.recitationId)
      && !removedActivityIds.has(meta.activityId)
      && !removedGroupActivityIds.has(meta.groupActivityId)
      && !removedQuizIds.has(meta.quizId);
  });
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/sections", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Section name is required." });
  if (db.sections.some((section) => section.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: "Section already exists." });
  db.sections.push(name);
  db.sections.sort();
  await writeDb(db);
  res.status(201).json({ sections: db.sections });
});

app.delete("/api/admin/sections/:name", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const name = decodeURIComponent(req.params.name);
  if (!db.sections.includes(name)) return res.status(404).json({ error: "Section not found." });
  if (!canUseSection(req.user, name)) return res.status(403).json({ error: "This section is outside your assigned class scope." });
  db.sections = db.sections.filter((section) => section !== name);
  db.schedules = (db.schedules || []).filter((schedule) => schedule.section !== name);
  db.majorExams = (db.majorExams || []).filter((exam) => exam.section !== name);
  db.writtenWorks = (db.writtenWorks || []).filter((work) => work.section !== name);
  db.gradeSettings = (db.gradeSettings || []).filter((setting) => setting.section !== name);
  db.gradeNotes = (db.gradeNotes || []).filter((note) => note.section !== name);
  const removedGroupActivityIds = new Set((db.groupActivities || []).filter((activity) => activity.section === name).map((activity) => activity.id));
  db.groupActivities = (db.groupActivities || []).filter((activity) => activity.section !== name);
  db.transactions = db.transactions.filter((transaction) => !removedGroupActivityIds.has(transaction.meta?.groupActivityId));
  db.students.forEach((student) => {
    if (student.section === name) student.section = "";
  });
  await writeDb(db);
  res.json({ sections: db.sections });
});

app.post("/api/admin/schedules", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  let input;
  try {
    input = scheduleFromBody(db, req.body, req.user);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const schedule = { id: randomUUID(), ...input, createdAt: now(), createdBy: req.user.id, updatedAt: now() };
  db.schedules.push(schedule);
  syncScheduledAttendanceWeeks(db);
  await writeDb(db);
  res.status(201).json({ schedule });
});

app.post("/api/admin/schedules/bulk", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const rows = Array.isArray(req.body.schedules) ? req.body.schedules : [];
  if (!rows.length) return res.status(400).json({ error: "Upload at least one schedule row." });
  if (rows.length > 300) return res.status(400).json({ error: "Import up to 300 schedules at a time." });
  let prepared;
  try {
    prepared = rows.map((row, index) => {
      try {
        return { rowNumber: index + 2, data: scheduleFromBody(db, row, req.user) };
      } catch (err) {
        throw new Error(`Row ${index + 2}: ${err.message}`);
      }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const createdAt = now();
  const created = prepared.map((item) => ({ id: randomUUID(), ...item.data, createdAt, createdBy: req.user.id, updatedAt: createdAt }));
  db.schedules.push(...created);
  syncScheduledAttendanceWeeks(db);
  await writeDb(db);
  res.status(201).json({ createdCount: created.length, schedules: created });
});

app.put("/api/admin/schedules/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const schedule = db.schedules.find((item) => item.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found." });
  let input;
  try {
    input = scheduleFromBody(db, req.body, req.user, schedule);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  Object.assign(schedule, input, { updatedAt: now() });
  syncScheduledAttendanceWeeks(db);
  await writeDb(db);
  res.json({ schedule });
});

app.delete("/api/admin/schedules", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const removableIds = new Set(db.schedules
    .filter((schedule) => canUseSubject(req.user, schedule.subjectId) && canUseSection(req.user, schedule.section))
    .map((schedule) => schedule.id));
  db.schedules = db.schedules.filter((schedule) => !removableIds.has(schedule.id));
  req.body = { ...(req.body || {}), createdCount: removableIds.size };
  syncScheduledAttendanceWeeks(db);
  await writeDb(db);
  res.json({ ok: true, deletedCount: removableIds.size });
});

app.delete("/api/admin/schedules/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const schedule = db.schedules.find((item) => item.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found." });
  if (!canUseSubject(req.user, schedule.subjectId) || !canUseSection(req.user, schedule.section)) return res.status(403).json({ error: "This schedule is outside your assigned scope." });
  db.schedules = db.schedules.filter((item) => item.id !== schedule.id);
  syncScheduledAttendanceWeeks(db);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/students", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const { name, section, username, tempPassword, startingJCoins, subjectIds = [] } = req.body;
  const startingBalance = Number(startingJCoins || 0);
  if (!name || !username || !tempPassword) return res.status(400).json({ error: "Name, username, and temporary password are required." });
  if (String(tempPassword).length < 6) return res.status(400).json({ error: "Temporary password must be at least 6 characters." });
  if (!Number.isFinite(startingBalance) || startingBalance < 0) return res.status(400).json({ error: "Starting JCoins must be zero or greater." });
  if (db.users.some((u) => u.username.toLowerCase() === String(username).toLowerCase())) return res.status(409).json({ error: "Username already exists." });
  if (section && !db.sections.includes(section)) return res.status(400).json({ error: "Choose an existing section." });
  if (!subjectIds.length || subjectIds.some((id) => !db.subjects.some((subject) => subject.id === id))) return res.status(400).json({ error: "Choose one or more existing subjects." });
  if (req.user.role === "teacher") {
    const allowedSubjects = new Set(req.user.subjectIds || []);
    const allowedSections = new Set(req.user.sectionIds || []);
    if (allowedSections.size && !allowedSections.has(section || "")) return res.status(403).json({ error: "This section is outside your assigned class scope." });
    if (!subjectIds.length || subjectIds.some((id) => !allowedSubjects.has(id))) return res.status(403).json({ error: "One or more subjects are outside your assigned class scope." });
  }
  const student = { id: randomUUID(), name, section: section || "", subjectIds, createdAt: now() };
  db.students.push(student);
  assignStudentQuizCodes(db);
  db.users.push({ id: randomUUID(), username, passwordHash: await bcrypt.hash(String(tempPassword), 10), role: "student", mustChangePassword: true, studentId: student.id, subjectIds: [], sectionIds: [] });
  db.transactions.push(tx(student.id, "starting", startingBalance, "Starting balance", now(), req.user.id));
  await writeDb(db);
  res.status(201).json({ student });
});

app.post("/api/admin/students/bulk", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const rows = Array.isArray(req.body.students) ? req.body.students : [];
  if (!rows.length) return res.status(400).json({ error: "Upload at least one student row." });
  if (rows.length > 300) return res.status(400).json({ error: "Import up to 300 students at a time." });

  const existingUsersByUsername = new Map(db.users.map((user) => [user.username.toLowerCase(), user]));
  const existingStudentsById = new Map(db.students.map((student) => [student.id, student]));
  const incomingUsernames = new Set();
  const skipped = [];
  const pendingUpdates = [];
  const allowedSubjects = req.user.role === "teacher" ? new Set(req.user.subjectIds || []) : null;
  const allowedSections = req.user.role === "teacher" ? new Set(req.user.sectionIds || []) : null;
  const subjectLookup = new Map(db.subjects.flatMap((subject) => [
    [subject.id.toLowerCase(), subject.id],
    [subject.name.toLowerCase(), subject.id]
  ]));

  let prepared;
  try {
    prepared = rows.map((row, index) => {
      const rowNumber = index + 2;
      const name = String(row.name || "").trim();
      const username = String(row.username || "").trim();
      const tempPassword = String(row.tempPassword || "").trim();
      const section = String(row.section || "").trim();
      const startingJCoins = Number(row.startingJCoins || 0);
      const requestedSubjects = Array.isArray(row.subjectIds) && row.subjectIds.length
        ? row.subjectIds
        : String(row.subjects || "").split(/[;,]/).map((value) => value.trim()).filter(Boolean);
      const subjectIds = requestedSubjects.map((value) => subjectLookup.get(String(value).toLowerCase()) || "");

      if (!name) throw new Error(`Row ${rowNumber}: name is required.`);
      if (!username) throw new Error(`Row ${rowNumber}: username is required.`);
      if (!tempPassword || tempPassword.length < 6) throw new Error(`Row ${rowNumber}: temporary password must be at least 6 characters.`);
      const normalizedUsername = username.toLowerCase();
      if (incomingUsernames.has(normalizedUsername)) throw new Error(`Row ${rowNumber}: username "${username}" is repeated in this file.`);
      incomingUsernames.add(normalizedUsername);
      if (!Number.isFinite(startingJCoins) || startingJCoins < 0) throw new Error(`Row ${rowNumber}: starting JCoins must be zero or greater.`);
      if (!section || !db.sections.includes(section)) throw new Error(`Row ${rowNumber}: choose an existing section.`);
      if (!subjectIds.length || subjectIds.some((id) => !id)) throw new Error(`Row ${rowNumber}: enter valid subject names or IDs.`);
      if (allowedSections?.size && !allowedSections.has(section)) throw new Error(`Row ${rowNumber}: section "${section}" is outside your assigned class scope.`);
      if (allowedSubjects && subjectIds.some((id) => !allowedSubjects.has(id))) throw new Error(`Row ${rowNumber}: one or more subjects are outside your assigned class scope.`);
      const existingUser = existingUsersByUsername.get(normalizedUsername);
      if (existingUser) {
        const existingStudent = existingStudentsById.get(existingUser.studentId);
        const sameStudent = existingStudent && normalizeStudentName(existingStudent.name) === normalizeStudentName(name);
        if (!sameStudent) throw new Error(`Row ${rowNumber}: username "${username}" belongs to another account. Use a unique username for ${name}.`);
        const missingSubjectIds = subjectIds.filter((id) => !(existingStudent.subjectIds || []).includes(id));
        if (missingSubjectIds.length || existingStudent.section !== section) {
          pendingUpdates.push({ student: existingStudent, section, previousSection: existingStudent.section || "", missingSubjectIds, name, username });
        } else {
          skipped.push({ rowNumber, name, username, reason: "account and subjects already exist" });
        }
        return null;
      }
      return { name, username, tempPassword, section, startingJCoins, subjectIds };
    }).filter(Boolean);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const created = [];
  const updated = [];
  pendingUpdates.forEach((item) => {
    item.student.section = item.section;
    item.student.subjectIds = [...new Set([...(item.student.subjectIds || []), ...item.missingSubjectIds])];
    updated.push({ id: item.student.id, name: item.name, username: item.username, previousSection: item.previousSection, section: item.section, addedSubjectIds: item.missingSubjectIds });
  });
  for (const item of prepared) {
    const student = { id: randomUUID(), name: item.name, section: item.section, subjectIds: item.subjectIds, createdAt: now() };
    db.students.push(student);
    assignStudentQuizCodes(db);
    db.users.push({ id: randomUUID(), username: item.username, passwordHash: await bcrypt.hash(item.tempPassword, 10), role: "student", mustChangePassword: true, studentId: student.id, subjectIds: [], sectionIds: [] });
    db.transactions.push(tx(student.id, "starting", item.startingJCoins, "Starting balance", now(), req.user.id));
    created.push({ id: student.id, name: student.name, username: item.username });
  }
  db.sections.sort();
  reconcileGroupActivities(db, req.user.id);
  await writeDb(db);
  res.status(created.length ? 201 : 200).json({ createdCount: created.length, created, updatedCount: updated.length, updated, skippedCount: skipped.length, skipped });
});

app.post("/api/admin/students/batch-delete", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const targetIds = [...new Set((Array.isArray(req.body.studentIds) ? req.body.studentIds : []).filter(Boolean))];
  if (!targetIds.length) return res.status(400).json({ error: "Choose at least one student to remove." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (targetIds.some((studentId) => !allowedStudentIds.has(studentId))) return res.status(403).json({ error: "One or more students are outside your assigned class scope." });
  const existingIds = targetIds.filter((studentId) => db.students.some((student) => student.id === studentId));
  existingIds.forEach((studentId) => purgeStudentData(db, studentId));
  await writeDb(db);
  res.json({ removedCount: existingIds.length });
});

app.put("/api/admin/students/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(student.id)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  if (req.user.role === "teacher") {
    const allowedSubjects = new Set(req.user.subjectIds || []);
    const allowedSections = new Set(req.user.sectionIds || []);
    const nextSection = String(req.body.section ?? student.section ?? "");
    const nextSubjects = Array.isArray(req.body.subjectIds) ? req.body.subjectIds : student.subjectIds;
    if (allowedSections.size && !allowedSections.has(nextSection)) return res.status(403).json({ error: "This section is outside your assigned class scope." });
    if (nextSubjects.some((id) => !allowedSubjects.has(id))) return res.status(403).json({ error: "One or more subjects are outside your assigned class scope." });
  }
  const nextSection = String(req.body.section ?? student.section ?? "");
  const nextSubjects = Array.isArray(req.body.subjectIds) ? req.body.subjectIds : student.subjectIds;
  if (nextSection && !db.sections.includes(nextSection)) return res.status(400).json({ error: "Choose an existing section." });
  if (!nextSubjects.length || nextSubjects.some((id) => !db.subjects.some((subject) => subject.id === id))) return res.status(400).json({ error: "Choose one or more existing subjects." });
  student.name = String(req.body.name || student.name);
  student.section = nextSection;
  student.subjectIds = nextSubjects;
  reconcileGroupActivities(db, req.user.id);
  await writeDb(db);
  res.json({ student });
});

app.get("/api/admin/students/:id/profile-photo", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(student.id)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  const hydrated = hydrateStudents(db).find((item) => item.id === student.id) || student;
  const transactions = db.transactions
    .filter((transaction) => transaction.studentId === student.id)
    .map((transaction) => ({ ...transaction, studentName: student.name }))
    .sort(byDateDesc)
    .slice(0, 20);
  const weeks = db.attendanceWeeks
    .filter((week) => studentIsInClass(db, student, week.subjectId, week.section))
    .map((week) => ({
      ...week,
      subjectName: subjectName(db, week.subjectId),
      attendanceBonus: attendanceBonus(db, student.id, week),
      recitationBonus: recitationBonus(db, student.id, week)
    }))
    .slice(0, 10);
  const activities = hydrateActivities(db).flatMap((activity) => activity.rows
    .filter((row) => row.studentId === student.id)
    .map((row) => ({ activity: activity.title, subjectName: activity.subjectName, deadline: activity.deadline, submitted: row.submitted, daysLate: row.daysLate, earned: row.earned })))
    .slice(0, 20);
  res.json({ student: { ...hydrated, profilePhoto: student.profilePhoto || "" }, transactions, weeks, activities, profilePhoto: student.profilePhoto || "" });
});

app.post("/api/admin/students/:id/profile-photo", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(student.id)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  try {
    student.profilePhoto = cleanProfilePhoto(req.body.profilePhoto);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  await writeDb(db);
  res.json({ profilePhoto: student.profilePhoto });
});

app.delete("/api/admin/students/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(student.id)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  purgeStudentData(db, student.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/attendance/weeks", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  if (!canUseSubject(req.user, req.body.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
  const section = String(req.body.section || "").trim();
  if (!section || !db.sections.includes(section)) return res.status(400).json({ error: "Choose an existing section." });
  if (!canUseSection(req.user, section)) return res.status(403).json({ error: "This section is outside your assigned class scope." });
  const firstDate = String(req.body.firstDate || "").slice(0, 10);
  const week = { id: randomUUID(), subjectId: req.body.subjectId, section, title: req.body.title || `Week ${db.attendanceWeeks.length + 1}`, dates: firstDate ? [firstDate] : [], cancelledDates: [], createdAt: now() };
  week.dates.sort();
  db.attendanceWeeks.push(week);
  await writeDb(db);
  res.status(201).json({ week });
});

app.delete("/api/admin/attendance/weeks/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const week = db.attendanceWeeks.find((w) => w.id === req.params.id);
  if (!week) return res.status(404).json({ error: "Week not found." });
  if (!canUseSubject(req.user, week.subjectId) || (week.section && !canUseSection(req.user, week.section))) return res.status(403).json({ error: "This attendance week is outside your assigned class scope." });
  removeAttendanceWeek(db, week.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/attendance/weeks/:id/dates", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const week = db.attendanceWeeks.find((w) => w.id === req.params.id);
  if (!week) return res.status(404).json({ error: "Week not found." });
  if (!canUseSubject(req.user, week.subjectId) || (week.section && !canUseSection(req.user, week.section))) return res.status(403).json({ error: "This attendance week is outside your assigned class scope." });
  const date = req.body.date || today();
  if (!week.dates.includes(date)) week.dates.push(date);
  week.dates.sort();
  syncWeekBonuses(db, week, req.user.id);
  await writeDb(db);
  res.json({ week });
});

app.delete("/api/admin/attendance/weeks/:id/dates/:date", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const week = db.attendanceWeeks.find((w) => w.id === req.params.id);
  if (!week) return res.status(404).json({ error: "Week not found." });
  if (!canUseSubject(req.user, week.subjectId) || (week.section && !canUseSection(req.user, week.section))) return res.status(403).json({ error: "This attendance week is outside your assigned class scope." });
  const date = decodeURIComponent(req.params.date);
  const removedRecordIds = new Set(db.attendanceRecords.filter((r) => r.weekId === week.id && r.date === date).map((r) => r.id));
  week.dates = (week.dates || []).filter((d) => d !== date);
  week.cancelledDates = (week.cancelledDates || []).filter((d) => d !== date);
  db.attendanceRecords = db.attendanceRecords.filter((r) => !(r.weekId === week.id && r.date === date));
  db.transactions = db.transactions.filter((t) => !(t.meta?.kind === "attendance" && removedRecordIds.has(t.meta.recordId)));
  syncWeekBonuses(db, week, req.user.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/admin/attendance/weeks/:id/dates/:date/cancelled", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const week = db.attendanceWeeks.find((item) => item.id === req.params.id);
  if (!week) return res.status(404).json({ error: "Week not found." });
  if (!canUseSubject(req.user, week.subjectId) || (week.section && !canUseSection(req.user, week.section))) return res.status(403).json({ error: "This attendance week is outside your assigned class scope." });
  const date = decodeURIComponent(req.params.date);
  if (!(week.dates || []).includes(date)) return res.status(404).json({ error: "Attendance date not found." });
  const cancelled = req.body.cancelled !== false;
  const cancelledDates = new Set(week.cancelledDates || []);
  if (cancelled) cancelledDates.add(date);
  else cancelledDates.delete(date);
  week.cancelledDates = [...cancelledDates].sort();
  db.attendanceRecords.filter((record) => record.weekId === week.id && record.date === date).forEach((record) => {
    syncAttendanceTransaction(db, record, week, req.user.id);
  });
  syncWeekBonuses(db, week, req.user.id);
  await writeDb(db);
  res.json({ week, cancelled });
});

app.put("/api/admin/attendance/records", auth, requireStaffOrAssistant, async (req, res) => {
  const db = await readDb();
  let assistantAssignment = null;
  try { assistantAssignment = ensureAssistantAccess(db, req.user); } catch (err) { if (req.user.role === "student") return res.status(403).json({ error: err.message }); }
  const assistantCredit = assistantCreditRemark(db, req.user);
  const { weekId, date, studentId, status } = req.body;
  if (!["", "check", "late", "excused"].includes(status)) return res.status(400).json({ error: "Invalid attendance status." });
  if (!assistantCanUseDate(req.user, assistantAssignment, date)) return res.status(403).json({ error: "Student assistants can only manage dates inside their assigned week." });
  const allowedStudentIds = actionScopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(studentId)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  const week = db.attendanceWeeks.find((w) => w.id === weekId);
  if (!week) return res.status(404).json({ error: "Week not found." });
  if ((week.cancelledDates || []).includes(date)) return res.status(400).json({ error: "This class date is marked Holiday / Cancelled." });
  const student = db.students.find((item) => item.id === studentId);
  if (!studentIsInClass(db, student, week.subjectId, week.section)) return res.status(400).json({ error: "This student is not enrolled in this attendance class." });
  let record = db.attendanceRecords.find((r) => r.weekId === weekId && r.date === date && r.studentId === studentId);
  if (!record) {
    record = { id: randomUUID(), weekId, date, studentId, status: "" };
    db.attendanceRecords.push(record);
  }
  record.status = status;
  syncAttendanceTransaction(db, record, week, req.user.id, assistantCredit);
  if (week) syncWeekBonuses(db, week, req.user.id, assistantCredit);
  await writeDb(db);
  res.json({ record });
});

app.post("/api/admin/attendance/check-all", auth, requireStaffOrAssistant, async (req, res) => {
  const db = await readDb();
  let assistantAssignment = null;
  try { assistantAssignment = ensureAssistantAccess(db, req.user); } catch (err) { if (req.user.role === "student") return res.status(403).json({ error: err.message }); }
  const assistantCredit = assistantCreditRemark(db, req.user);
  if (!assistantCanUseDate(req.user, assistantAssignment, req.body.date)) return res.status(403).json({ error: "Student assistants can only manage dates inside their assigned week." });
  const week = db.attendanceWeeks.find((w) => w.id === req.body.weekId);
  if (!week) return res.status(404).json({ error: "Week not found." });
  if (!["", "check", "late", "excused"].includes(req.body.status ?? "check")) return res.status(400).json({ error: "Invalid attendance status." });
  if ((week.cancelledDates || []).includes(req.body.date)) return res.status(400).json({ error: "This class date is marked Holiday / Cancelled." });
  const hasSectionScope = Object.prototype.hasOwnProperty.call(req.body, "section");
  const requestedSection = String(hasSectionScope ? req.body.section || "" : week.section || "");
  const students = actionScopeStudents(db, req.user).filter((s) => studentIsInClass(db, s, week.subjectId, requestedSection));
  students.forEach((student) => {
    let record = db.attendanceRecords.find((r) => r.weekId === week.id && r.date === req.body.date && r.studentId === student.id);
    if (!record) {
      record = { id: randomUUID(), weekId: week.id, date: req.body.date, studentId: student.id, status: "check" };
      db.attendanceRecords.push(record);
    }
    record.status = req.body.status ?? "check";
    syncAttendanceTransaction(db, record, week, req.user.id, assistantCredit);
  });
  syncWeekBonuses(db, week, req.user.id, assistantCredit);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/recitations", auth, requireStaffOrAssistant, async (req, res) => {
  const db = await readDb();
  let assistantAssignment = null;
  try { assistantAssignment = ensureAssistantAccess(db, req.user); } catch (err) { if (req.user.role === "student") return res.status(403).json({ error: err.message }); }
  const assistantCredit = assistantCreditRemark(db, req.user);
  const remarks = assistantCreditRemark(db, req.user, req.body.remarks);
  if (!assistantCanUseDate(req.user, assistantAssignment, req.body.date || today())) return res.status(403).json({ error: "Student assistants can only add recitations inside their assigned week." });
  const allowedStudentIds = actionScopedStudentIds(db, req.user);
  if (!canUseSubjectForAction(db, req.user, req.body.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
  const studentIds = [...new Set((Array.isArray(req.body.studentIds) && req.body.studentIds.length ? req.body.studentIds : [req.body.studentId]).filter(Boolean))];
  if (!studentIds.length) return res.status(400).json({ error: "Choose at least one student." });
  if (studentIds.some((studentId) => !allowedStudentIds.has(studentId))) return res.status(403).json({ error: "One or more students are outside your assigned class scope." });
  const students = studentIds.map((studentId) => db.students.find((s) => s.id === studentId));
  const recitationSection = String(req.body.section || "").trim();
  if (students.some((student) => !studentIsInClass(db, student, req.body.subjectId, recitationSection))) return res.status(400).json({ error: "One or more students are not enrolled in this subject." });
  const amount = Math.min(Number(req.body.amount || 1), db.settings.recitation.maxPoints);
  const createdAt = now();
  const recitations = students.map((student) => ({
    id: randomUUID(),
    studentId: student.id,
    subjectId: req.body.subjectId,
    date: req.body.date || today(),
    amount,
    remarks,
    createdAt,
    createdBy: req.user.id
  }));
  db.recitations.push(...recitations);
  recitations.forEach((recitation) => {
    db.transactions.push(tx(recitation.studentId, "recitation", amount, `Recitation: ${recitation.remarks || subjectName(db, recitation.subjectId)}`, recitation.createdAt, req.user.id, { kind: "recitation", recitationId: recitation.id, subjectId: recitation.subjectId }));
  });
  db.attendanceWeeks.filter((week) => week.subjectId === req.body.subjectId && (week.dates || []).includes(req.body.date || today())).forEach((week) => {
    students.filter((student) => studentIsInClass(db, student, week.subjectId, week.section)).forEach((student) => syncWeekBonus(db, student.id, week, "recitation-week-bonus", recitationBonus(db, student.id, week), Number(db.settings.recitation.weeklyBonus || 0), req.user.id, assistantCredit));
  });
  await writeDb(db);
  res.status(201).json({ createdCount: recitations.length, recitations });
});

app.post("/api/admin/activities", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const section = String(req.body.section || "").trim();
  if (!db.subjects.some((subject) => subject.id === req.body.subjectId) || !canUseSubject(req.user, req.body.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
  if (section && (!db.sections.includes(section) || !canUseSection(req.user, section))) return res.status(400).json({ error: "Choose an available section." });
  const activity = { id: randomUUID(), title: req.body.title || "Activity", subjectId: req.body.subjectId, section, dateCreated: req.body.dateCreated || today(), deadline: normalizeActivityDeadline(req.body.deadline), type: req.body.type || db.settings.activities.types[0]?.name || "Custom", maxScore: 100, remarks: req.body.remarks || "", submissions: [], createdAt: now(), createdBy: req.user.id };
  db.activities.push(activity);
  await writeDb(db);
  res.status(201).json({ activity });
});

app.put("/api/admin/activities/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = db.activities.find((item) => item.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Activity not found." });
  if (!canUseActivity(req.user, activity)) return res.status(403).json({ error: "This activity is outside your assigned class scope." });
  const subjectId = String(req.body.subjectId || activity.subjectId);
  const section = String(req.body.section ?? activity.section ?? "").trim();
  if (!db.subjects.some((subject) => subject.id === subjectId) || !canUseSubject(req.user, subjectId)) return res.status(400).json({ error: "Choose an available subject." });
  if (section && (!db.sections.includes(section) || !canUseSection(req.user, section))) return res.status(400).json({ error: "Choose an available section." });
  if ((subjectId !== activity.subjectId || section !== String(activity.section || "")) && (activity.submissions || []).length) {
    return res.status(400).json({ error: "The subject and section cannot be changed after submission records exist." });
  }
  const type = String(req.body.type || activity.type);
  if (!db.settings.activities.types.some((item) => item.name === type)) return res.status(400).json({ error: "Choose an existing activity type." });
  activity.title = String(req.body.title ?? activity.title).trim().slice(0, 120) || "Activity";
  activity.subjectId = subjectId;
  activity.section = section;
  activity.dateCreated = String(req.body.dateCreated ?? activity.dateCreated).slice(0, 10) || today();
  activity.deadline = normalizeActivityDeadline(req.body.deadline ?? activity.deadline);
  (activity.submissions || []).forEach((submission) => {
    if (submission.extendedDeadline && activityDeadlineForSubmission(activity, submission) === activity.deadline) {
      delete submission.extendedDeadline;
      delete submission.extensionUpdatedAt;
      delete submission.extensionUpdatedBy;
    }
  });
  activity.type = type;
  activity.maxScore = 100;
  activity.remarks = String(req.body.remarks ?? activity.remarks ?? "").trim().slice(0, 500);
  activity.updatedAt = now();
  syncActivityRewards(db, activity, req.user.id);
  await writeDb(db);
  res.json({ activity });
});

app.delete("/api/admin/activities/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = db.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Activity not found." });
  if (!canUseActivity(req.user, activity)) return res.status(403).json({ error: "This activity is outside your assigned class scope." });
  db.activities = db.activities.filter((a) => a.id !== activity.id);
  db.transactions = db.transactions.filter((transaction) => !(transaction.meta?.kind === "activity" && transaction.meta.activityId === activity.id));
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/activities/:id/materials", auth, requireRole("admin", "teacher"), activitySubmissionUpload, async (req, res, next) => {
  const temporaryFiles = Array.isArray(req.files) ? req.files : [];
  try {
    const db = await readDb();
    const activity = db.activities.find((a) => a.id === req.params.id);
    if (!activity) return res.status(404).json({ error: "Activity not found." });
    if (!canUseActivity(req.user, activity)) return res.status(403).json({ error: "This activity is outside your assigned class scope." });
    let files;
    try {
      files = cleanMultipartActivityMaterialFiles(temporaryFiles);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const previousFileCount = activityMaterialFiles(activity).length;
    const uploadedAt = now();
    const storedFiles = await persistMultipartActivityFiles(activity.id, ACTIVITY_MATERIAL_OWNER, files, uploadedAt);
    await removeObsoleteActivityFileRows(activity.id, ACTIVITY_MATERIAL_OWNER, storedFiles.length, previousFileCount);
    activity.materials = storedFiles.map((file) => ({ ...file, uploadedAt, uploadedBy: req.user.id }));
    activity.updatedAt = now();
    await writeDb(db);
    queuePushToUsers(db, userIdsForStudents(db, studentsForClass(db, activity.subjectId, activity.section).map((student) => student.id)), {
      title: "Activity materials uploaded",
      body: `${activity.title} has new reference files.`,
      url: "/activities",
      tag: `activity-materials-${activity.id}`
    });
    res.status(201).json({ materials: activity.materials.map(publicActivityFile) });
  } catch (error) {
    next(error);
  } finally {
    await cleanupTemporaryActivityFiles(temporaryFiles);
  }
});

app.delete("/api/admin/activities/:id/materials", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = db.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Activity not found." });
  if (!canUseActivity(req.user, activity)) return res.status(403).json({ error: "This activity is outside your assigned class scope." });
  const previousFileCount = activityMaterialFiles(activity).length;
  activity.materials = [];
  activity.updatedAt = now();
  await removeObsoleteActivityFileRows(activity.id, ACTIVITY_MATERIAL_OWNER, 0, previousFileCount);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/major-exams", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  let input;
  try {
    input = majorExamInput(db, req.body, req.user);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const exam = normalizeMajorExam({ id: randomUUID(), ...input, scores: {}, createdAt: now(), createdBy: req.user.id, updatedAt: now() }, db);
  db.majorExams.push(exam);
  await writeDb(db);
  res.status(201).json({ exam: publicMajorExam(db, exam) });
});

app.put("/api/admin/major-exams/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const exam = (db.majorExams || []).find((item) => item.id === req.params.id);
  if (!exam) return res.status(404).json({ error: "Major exam not found." });
  if (!canUseMajorExam(req.user, exam)) return res.status(403).json({ error: "This exam is outside your assigned class scope." });
  let input;
  try {
    input = majorExamInput(db, req.body, req.user, exam);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const hasScores = Object.keys(exam.scores || {}).length > 0;
  if (hasScores && (input.subjectId !== exam.subjectId || input.section !== exam.section)) {
    return res.status(409).json({ error: "Subject and section are locked after scores are recorded." });
  }
  Object.assign(exam, input, { updatedAt: now(), updatedBy: req.user.id });
  normalizeMajorExam(exam, db);
  await writeDb(db);
  res.json({ exam: publicMajorExam(db, exam) });
});

app.delete("/api/admin/major-exams/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const exam = (db.majorExams || []).find((item) => item.id === req.params.id);
  if (!exam) return res.status(404).json({ error: "Major exam not found." });
  if (!canUseMajorExam(req.user, exam)) return res.status(403).json({ error: "This exam is outside your assigned class scope." });
  db.majorExams = (db.majorExams || []).filter((item) => item.id !== exam.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/admin/major-exams/:id/scores", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const exam = (db.majorExams || []).find((item) => item.id === req.params.id);
  if (!exam) return res.status(404).json({ error: "Major exam not found." });
  if (!canUseMajorExam(req.user, exam)) return res.status(403).json({ error: "This exam is outside your assigned class scope." });
  normalizeMajorExam(exam, db);
  const studentId = String(req.body.studentId || "");
  const student = db.students.find((item) => item.id === studentId);
  if (!scopedStudentIds(db, req.user).has(studentId) || !studentIsInClass(db, student, exam.subjectId, exam.section)) {
    return res.status(403).json({ error: "This student is outside the exam class scope." });
  }
  exam.scores ||= {};
  if (req.body.score === "" || req.body.score == null) {
    delete exam.scores[studentId];
  } else {
    const score = Number(req.body.score);
    if (!Number.isFinite(score) || score < 0 || score > Number(exam.maxScore)) return res.status(400).json({ error: `Score must be from 0 to ${exam.maxScore}.` });
    exam.scores[studentId] = score;
  }
  exam.updatedAt = now();
  exam.updatedBy = req.user.id;
  await writeDb(db);
  res.json({ exam: publicMajorExam(db, exam) });
});

app.put("/api/admin/grades/settings", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  let input;
  try {
    input = gradeSettingInput(db, req.body, req.user);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const existing = (db.gradeSettings || []).find((setting) => setting.subjectId === input.subjectId && setting.section === input.section);
  const updatedAt = now();
  if (existing) {
    Object.assign(existing, input, { updatedAt, updatedBy: req.user.id });
    normalizeGradeSetting(existing, db);
  } else {
    db.gradeSettings ||= [];
    db.gradeSettings.push(normalizeGradeSetting({ id: gradeClassKey(input.subjectId, input.section), ...input, createdAt: updatedAt, createdBy: req.user.id, updatedAt }, db));
  }
  await writeDb(db);
  res.json({ gradeSettings: gradeSettingsForUser(db, req.user), gradeSummaries: hydrateGradeSummaries(db, req.user) });
});

app.post("/api/admin/grades/release", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const subjectId = String(req.body.subjectId || "").trim();
  const section = String(req.body.section || "").trim();
  if (!subjectId || !db.subjects.some((subject) => subject.id === subjectId) || !canUseSubject(req.user, subjectId)) return res.status(400).json({ error: "Choose an available subject." });
  if (!section || !db.sections.includes(section) || !canUseSection(req.user, section)) return res.status(400).json({ error: "Choose an available section." });
  const setting = gradeSettingFor(db, subjectId, section, true);
  setting.releasedAt = now();
  setting.releasedBy = req.user.id;
  setting.updatedAt = setting.releasedAt;
  setting.updatedBy = req.user.id;
  await writeDb(db);
  res.json({ gradeSettings: gradeSettingsForUser(db, req.user), gradeSummaries: hydrateGradeSummaries(db, req.user) });
});

app.post("/api/admin/written-works", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  let input;
  try {
    input = writtenWorkInput(db, req.body, req.user);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const work = normalizeWrittenWork({ id: randomUUID(), ...input, scores: {}, createdAt: now(), createdBy: req.user.id, updatedAt: now() }, db);
  db.writtenWorks ||= [];
  db.writtenWorks.push(work);
  await writeDb(db);
  res.status(201).json({ writtenWork: publicWrittenWork(db, work) });
});

app.put("/api/admin/written-works/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const work = (db.writtenWorks || []).find((item) => item.id === req.params.id);
  if (!work) return res.status(404).json({ error: "Written work not found." });
  if (!canUseWrittenWork(req.user, work)) return res.status(403).json({ error: "This written work is outside your assigned class scope." });
  let input;
  try {
    input = writtenWorkInput(db, req.body, req.user, work);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const hasScores = Object.keys(work.scores || {}).length > 0;
  if (hasScores && (input.subjectId !== work.subjectId || input.section !== work.section)) {
    return res.status(409).json({ error: "Subject and section are locked after scores are recorded." });
  }
  Object.assign(work, input, { updatedAt: now(), updatedBy: req.user.id });
  normalizeWrittenWork(work, db);
  await writeDb(db);
  res.json({ writtenWork: publicWrittenWork(db, work) });
});

app.delete("/api/admin/written-works/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const work = (db.writtenWorks || []).find((item) => item.id === req.params.id);
  if (!work) return res.status(404).json({ error: "Written work not found." });
  if (!canUseWrittenWork(req.user, work)) return res.status(403).json({ error: "This written work is outside your assigned class scope." });
  db.writtenWorks = (db.writtenWorks || []).filter((item) => item.id !== work.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/admin/written-works/:id/scores", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const work = (db.writtenWorks || []).find((item) => item.id === req.params.id);
  if (!work) return res.status(404).json({ error: "Written work not found." });
  if (!canUseWrittenWork(req.user, work)) return res.status(403).json({ error: "This written work is outside your assigned class scope." });
  normalizeWrittenWork(work, db);
  const studentId = String(req.body.studentId || "");
  const student = db.students.find((item) => item.id === studentId);
  if (!scopedStudentIds(db, req.user).has(studentId) || !studentIsInClass(db, student, work.subjectId, work.section)) {
    return res.status(403).json({ error: "This student is outside the written work class scope." });
  }
  work.scores ||= {};
  if (req.body.score === "" || req.body.score == null) {
    delete work.scores[studentId];
  } else {
    const score = Number(req.body.score);
    if (!Number.isFinite(score) || score < 0 || score > Number(work.maxScore)) return res.status(400).json({ error: `Score must be from 0 to ${work.maxScore}.` });
    work.scores[studentId] = score;
  }
  work.updatedAt = now();
  work.updatedBy = req.user.id;
  await writeDb(db);
  res.json({ writtenWork: publicWrittenWork(db, work) });
});

app.put("/api/admin/grades/notes", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const studentId = String(req.body.studentId || "");
  const subjectId = String(req.body.subjectId || "");
  const section = String(req.body.section || "").trim();
  const student = db.students.find((item) => item.id === studentId);
  if (!student || !scopedStudentIds(db, req.user).has(studentId)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  if (!studentIsInClass(db, student, subjectId, section) || !canUseSubject(req.user, subjectId) || !canUseSection(req.user, section)) return res.status(403).json({ error: "This grade note is outside your assigned class scope." });
  db.gradeNotes ||= [];
  let note = gradeNoteFor(db, studentId, subjectId, section);
  const payload = normalizeGradeNote({
    ...(note || {}),
    studentId,
    subjectId,
    section,
    privateNote: req.body.privateNote,
    visibleAdvice: req.body.visibleAdvice,
    visibleToStudent: req.body.visibleToStudent,
    priority: req.body.priority,
    riskStatus: req.body.riskStatus,
    missingItems: req.body.missingItems,
    updatedAt: now(),
    updatedBy: req.user.id
  }, db);
  if (note) Object.assign(note, payload);
  else {
    note = { ...payload, id: randomUUID(), createdAt: now(), createdBy: req.user.id };
    db.gradeNotes.push(note);
  }
  await writeDb(db);
  res.json({ note, gradeSummaries: hydrateGradeSummaries(db, req.user) });
});

app.put("/api/admin/activities/:id/extensions", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = db.activities.find((item) => item.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Activity not found." });
  const studentId = String(req.body.studentId || "");
  const student = db.students.find((item) => item.id === studentId);
  if (!canUseActivity(req.user, activity) || !scopedStudentIds(db, req.user).has(studentId)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  if (!studentIsInClass(db, student, activity.subjectId, activity.section)) return res.status(400).json({ error: "This student is not enrolled in the activity class." });
  let extendedDeadline;
  try {
    extendedDeadline = activityExtensionDeadline(activity, req.body.extendedDeadline);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  activity.submissions ||= [];
  let submission = activity.submissions.find((item) => item.studentId === studentId);
  if (!submission) {
    submission = { studentId };
    activity.submissions.push(submission);
  }
  if (extendedDeadline) {
    submission.extendedDeadline = extendedDeadline;
    submission.extensionUpdatedAt = now();
    submission.extensionUpdatedBy = req.user.id;
  } else {
    delete submission.extendedDeadline;
    delete submission.extensionUpdatedAt;
    delete submission.extensionUpdatedBy;
  }
  syncActivityRewards(db, activity, req.user.id);
  await writeDb(db);
  queuePushToUsers(db, db.users.filter((user) => user.studentId === studentId).map((user) => user.id), {
    title: extendedDeadline ? "Activity deadline extended" : "Activity deadline updated",
    body: extendedDeadline
      ? `${activity.title} is now due ${extendedDeadline.replace("T", " ")}.`
      : `${activity.title} now uses the class deadline.`,
    url: "/activities",
    tag: `activity-extension-${activity.id}-${studentId}`
  });
  res.json({ studentId, extendedDeadline });
});

app.put("/api/admin/activities/:id/submissions", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = db.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Activity not found." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(req.body.studentId) || !canUseActivity(req.user, activity)) return res.status(403).json({ error: "This activity submission is outside your assigned class scope." });
  const targetStudent = db.students.find((student) => student.id === req.body.studentId);
  if (!studentIsInClass(db, targetStudent, activity.subjectId, activity.section)) return res.status(400).json({ error: "This student is not enrolled in the activity class." });
  let sub = activity.submissions.find((s) => s.studentId === req.body.studentId);
  if (!sub) {
    sub = { studentId: req.body.studentId };
    activity.submissions.push(sub);
  }
  sub.submitted = !!req.body.submitted;
  sub.submittedAt = req.body.submittedAt || req.body.dateSubmitted || (sub.submitted ? now() : "");
  sub.dateSubmitted = sub.submittedAt;
  if (sub.submitted && req.body.submissionMethod === "physical") sub.submissionMethod = "physical";
  else if (!sub.submitted) delete sub.submissionMethod;
  const late = sub.submitted ? activityDaysLate(activityDeadlineForSubmission(activity, sub), sub.submittedAt) : 0;
  const maxScoreAllowed = activityMaxScoreAllowed(late);
  if (req.body.score === "" || req.body.score == null) {
    delete sub.scoreMode;
    delete sub.score;
    syncActivityAutoScore(sub, maxScoreAllowed);
  } else {
    const score = Math.max(0, Math.min(Number(req.body.score || 0), maxScoreAllowed));
    sub.score = Number.isFinite(score) ? score : activitySubmissionScore(sub, maxScoreAllowed);
    sub.scoreMode = "manual";
  }
  sub.remarks = req.body.remarks || "";
  const hydrated = hydrateActivities(db).find((a) => a.id === activity.id);
  const row = hydrated.rows.find((r) => r.studentId === sub.studentId);
  sub.snapshot = {
    type: activity.type,
    basePoints: hydrated.basePoints,
    latePenaltyPerDay: Number(db.settings.activities.latePenaltyPerDay || 0),
    daysLate: row.daysLate,
    earned: row.earned
  };
  const existing = db.transactions.find((t) => t.meta?.kind === "activity" && t.meta.activityId === activity.id && t.studentId === sub.studentId);
  if (existing) existing.amount = row.earned;
  else if (row.earned) db.transactions.push(tx(sub.studentId, "activity", row.earned, activity.title, now(), req.user.id, { kind: "activity", activityId: activity.id, subjectId: activity.subjectId, section: activity.section || "" }));
  await writeDb(db);
  res.json({ submission: sub });
});

app.post("/api/admin/activities/:id/submissions/:studentId/files", auth, requireRole("admin", "teacher"), activitySubmissionUpload, async (req, res, next) => {
  const temporaryFiles = Array.isArray(req.files) ? req.files : [];
  try {
    const db = await readDb();
    const activity = db.activities.find((a) => a.id === req.params.id);
    if (!activity) return res.status(404).json({ error: "Activity not found." });
    if (!canUseActivity(req.user, activity) || !scopedStudentIds(db, req.user).has(req.params.studentId)) return res.status(403).json({ error: "This activity submission is outside your assigned class scope." });
    const student = db.students.find((item) => item.id === req.params.studentId);
    if (!studentIsInClass(db, student, activity.subjectId, activity.section)) return res.status(400).json({ error: "This student is not enrolled in the activity class." });
    let files;
    try {
      files = cleanMultipartActivityFiles(temporaryFiles);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    activity.submissions ||= [];
    let sub = activity.submissions.find((item) => item.studentId === student.id);
    if (!sub) {
      sub = { studentId: student.id };
      activity.submissions.push(sub);
    }
    const previousFileCount = activitySubmissionFiles(sub).length;
    const submittedAt = now();
    const storedFiles = await persistMultipartActivityFiles(activity.id, student.id, files, submittedAt);
    await removeObsoleteActivityFileRows(activity.id, student.id, storedFiles.length, previousFileCount);
    sub.files = storedFiles;
    delete sub.file;
    sub.submitted = true;
    sub.submittedAt = submittedAt;
    sub.dateSubmitted = submittedAt;
    sub.submissionMethod = "upload";
    sub.remarks = String(req.body.remarks ?? sub.remarks ?? "");
    syncActivityAutoScore(sub, activityMaxScoreAllowed(activityDaysLate(activityDeadlineForSubmission(activity, sub), submittedAt)));
    syncActivityRewards(db, activity, req.user.id);
    activity.updatedAt = now();
    await writeDb(db);
    queuePushToUsers(db, userIdsForStudents(db, [student.id]), {
      title: "Activity file uploaded",
      body: `${activity.title} has a file uploaded for you.`,
      url: "/activities",
      tag: `activity-submission-upload-${activity.id}-${student.id}`
    });
    res.status(201).json({ submission: sub });
  } catch (error) {
    next(error);
  } finally {
    await cleanupTemporaryActivityFiles(temporaryFiles);
  }
});

app.get("/api/activities/:id/materials/:fileIndex", auth, async (req, res) => {
  const db = await readDb();
  const activity = db.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Activity not found." });
  const staffAllowed = (req.user.role === "admin" || req.user.role === "teacher") && canUseActivity(req.user, activity);
  const student = req.user.role === "student" ? db.students.find((item) => item.id === req.user.studentId) : null;
  const studentAllowed = req.user.role === "student" && studentIsInClass(db, student, activity.subjectId, activity.section);
  if (!staffAllowed && !studentAllowed) return res.status(403).json({ error: "This activity material is outside your class scope." });
  const materials = activityMaterialFiles(activity);
  const fileIndex = Number(req.params.fileIndex);
  if (!Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex >= materials.length) return res.status(404).json({ error: "File not found." });
  let file = materials[fileIndex];
  if (!file?.fileData) {
    const storedFile = await readActivityFileRow(activity.id, ACTIVITY_MATERIAL_OWNER, fileIndex);
    if (storedFile) file = { ...file, ...storedFile };
  }
  if (!file?.fileData) return res.status(404).json({ error: "File data not found." });
  const previewText = await activityFilePreviewText(file);
  res.json({ file: { ...publicActivityFile(file, fileIndex), fileData: file.fileData, previewText } });
});

app.get("/api/activities/:id/submissions/:studentId/files/:fileIndex", auth, async (req, res) => {
  const db = await readDb();
  const activity = db.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Activity not found." });
  const student = db.students.find((s) => s.id === req.params.studentId);
  if (!student) return res.status(404).json({ error: "Student not found." });
  const staffAllowed = (req.user.role === "admin" || req.user.role === "teacher")
    && canUseActivity(req.user, activity)
    && scopedStudentIds(db, req.user).has(student.id);
  const studentAllowed = req.user.role === "student"
    && req.user.studentId === student.id
    && studentIsInClass(db, student, activity.subjectId, activity.section);
  if (!staffAllowed && !studentAllowed) return res.status(403).json({ error: "This activity file is outside your class scope." });
  const sub = (activity.submissions || []).find((submission) => submission.studentId === student.id);
  const files = activitySubmissionFiles(sub);
  const fileIndex = Number(req.params.fileIndex);
  if (!Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex >= files.length) return res.status(404).json({ error: "File not found." });
  let file = files[fileIndex];
  if (!file?.fileData) {
    const storedFile = await readActivityFileRow(activity.id, student.id, fileIndex);
    if (storedFile) file = { ...file, ...storedFile };
  }
  if (!file?.fileData) return res.status(404).json({ error: "File data not found." });
  const previewText = await activityFilePreviewText(file);
  res.json({ file: { ...publicActivityFile(file, fileIndex), fileData: file.fileData, previewText } });
});

app.post("/api/student/activities/:id/submit", auth, requireRole("student"), activitySubmissionUpload, async (req, res, next) => {
  const temporaryFiles = Array.isArray(req.files) ? req.files : [];
  try {
    const db = await readDb();
    const activity = db.activities.find((a) => a.id === req.params.id);
    if (!activity) return res.status(404).json({ error: "Activity not found." });
    const student = db.students.find((s) => s.id === req.user.studentId);
    if (!studentIsInClass(db, student, activity.subjectId, activity.section)) return res.status(403).json({ error: "This activity is not assigned to your class." });
    let files;
    try {
      files = temporaryFiles.length ? cleanMultipartActivityFiles(temporaryFiles) : cleanActivityFiles(req.body);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    let sub = activity.submissions.find((item) => item.studentId === req.user.studentId);
    if (!sub) {
      sub = { studentId: req.user.studentId };
      activity.submissions.push(sub);
    }
    const previousFileCount = activitySubmissionFiles(sub).length;
    const submittedAt = now();
    const storedFiles = temporaryFiles.length
      ? await persistMultipartActivityFiles(activity.id, req.user.studentId, files, submittedAt)
      : files.map((file) => ({ ...file, uploadedAt: submittedAt }));
    await removeObsoleteActivityFileRows(activity.id, req.user.studentId, storedFiles.length, previousFileCount);
    sub.submitted = true;
    sub.submittedAt = submittedAt;
    sub.dateSubmitted = submittedAt;
    sub.submissionMethod = "upload";
    sub.studentNote = String(req.body?.studentNote || "").slice(0, 500);
    sub.files = storedFiles;
    sub.file = sub.files[0] || null;
    syncActivityAutoScore(sub, activityMaxScoreAllowed(activityDaysLate(activityDeadlineForSubmission(activity, sub), submittedAt)));
    const hydrated = hydrateActivities(db).find((a) => a.id === activity.id);
    const row = hydrated.rows.find((item) => item.studentId === req.user.studentId);
    sub.snapshot = {
      type: activity.type,
      basePoints: hydrated.basePoints,
      latePenaltyPerDay: Number(db.settings.activities.latePenaltyPerDay || 0),
      daysLate: row.daysLate,
      earned: row.earned
    };
    const existing = db.transactions.find((t) => t.meta?.kind === "activity" && t.meta.activityId === activity.id && t.studentId === req.user.studentId);
    if (existing) existing.amount = row.earned;
    else if (row.earned) db.transactions.push(tx(req.user.studentId, "activity", row.earned, activity.title, submittedAt, req.user.id, { kind: "activity", activityId: activity.id, subjectId: activity.subjectId, section: activity.section || "" }));
    await writeDb(db);
    queuePushToUsers(db, staffUserIdsForStudent(db, req.user.studentId), {
      title: "Activity submitted",
      body: `${studentName(db, req.user.studentId)} submitted ${activity.title}.`,
      url: "/activities",
      tag: `activity-${activity.id}-${req.user.studentId}`
    });
    res.status(201).json({ submission: { submittedAt, daysLate: row.daysLate, earned: row.earned, fileNames: storedFiles.map((file) => file.fileName) } });
  } catch (error) {
    next(error);
  } finally {
    await cleanupTemporaryActivityFiles(temporaryFiles);
  }
});

function quizFromBody(db, body, user, existing = {}) {
  const subjectId = body.subjectId || existing.subjectId || "";
  const section = String(body.section ?? existing.section ?? "").trim();
  if (!subjectId || !db.subjects.some((subject) => subject.id === subjectId)) throw new Error("Valid subject is required.");
  if (!section) throw new Error("Section is required.");
  if (!canUseSubject(user, subjectId) || !canUseSection(user, section)) throw new Error("This quiz is outside your assigned class scope.");
  const questions = (Array.isArray(body.questions) ? body.questions : existing.questions || []).map(cleanQuizQuestion);
  if (!questions.length) throw new Error("Add at least one question.");
  const requestedQuizTypes = Array.isArray(body.quizTypes) ? body.quizTypes.filter((type) => quizQuestionTypes.includes(type)) : [];
  const existingQuizTypes = Array.isArray(existing.quizTypes) ? existing.quizTypes.filter((type) => quizQuestionTypes.includes(type)) : [];
  const legacyQuizType = body.quizType ?? existing.quizType;
  const quizTypesFromQuestions = [...new Set(questions.map((question) => question.type))];
  const selectedQuizTypes = [...new Set(requestedQuizTypes.length
    ? requestedQuizTypes
    : existingQuizTypes.length
      ? existingQuizTypes
      : quizQuestionTypes.includes(legacyQuizType)
        ? [legacyQuizType]
        : quizTypesFromQuestions)];
  if (!selectedQuizTypes.length) throw new Error("Choose at least one quiz type.");
  if (questions.some((question) => !selectedQuizTypes.includes(question.type))) throw new Error("Every question must use one of the checked quiz types.");
  const difficulty = quizDifficulties.includes(body.difficulty || existing.difficulty) ? body.difficulty || existing.difficulty : "Easy";
  const passingScore = Math.max(1, Math.min(Number(body.passingScore || existing.passingScore || Math.ceil(questions.length * (db.settings.quizzes.defaultPassingPercent || 75) / 100)), questions.length));
  const requestedTimeLimit = Number(body.timeLimitMinutes ?? existing.timeLimitMinutes ?? 30);
  if (!Number.isFinite(requestedTimeLimit) || requestedTimeLimit < 1 || requestedTimeLimit > 240) throw new Error("Time limit must be between 1 and 240 minutes.");
  const timeLimitMinutes = Math.round(requestedTimeLimit);
  const retakeMode = ["none", "all", "selected"].includes(body.retakeMode ?? existing.retakeMode) ? body.retakeMode ?? existing.retakeMode : "none";
  const eligibleStudentIds = new Set(studentsForClass(db, subjectId, section).map((student) => student.id));
  if (!eligibleStudentIds.size) throw new Error("No students are enrolled in this subject and section.");
  const requestedRetakeStudentIds = Array.isArray(body.retakeStudentIds ?? existing.retakeStudentIds) ? body.retakeStudentIds ?? existing.retakeStudentIds : [];
  const retakeStudentIds = retakeMode === "selected" ? [...new Set(requestedRetakeStudentIds)].filter((studentId) => eligibleStudentIds.has(studentId)) : [];
  return {
    title: String(body.title ?? existing.title ?? "Quiz").trim().slice(0, 120) || "Quiz",
    subjectId,
    section,
    difficulty,
    quizType: selectedQuizTypes.length === 1 ? selectedQuizTypes[0] : "mixed",
    quizTypes: selectedQuizTypes,
    rewardValue: Number(existing.rewardValue ?? quizRewardValue(db, difficulty)),
    deadline: String(body.deadline ?? existing.deadline ?? today()).slice(0, 10),
    timeLimitMinutes,
    questions,
    passingScore,
    retakeMode,
    retakeStudentIds,
    answerVisibility: answerVisibilityOptions.includes(body.answerVisibility ?? existing.answerVisibility) ? body.answerVisibility ?? existing.answerVisibility : db.settings.quizzes.defaultAnswerVisibility,
    answerRevealAt: String(body.answerRevealAt ?? existing.answerRevealAt ?? ""),
    shuffleQuestions: !!(body.shuffleQuestions ?? existing.shuffleQuestions),
    shuffleOptions: !!(body.shuffleOptions ?? existing.shuffleOptions),
    source: body.source || existing.source || "manual"
  };
}

app.post("/api/admin/quizzes", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  let input;
  try {
    input = quizFromBody(db, req.body, req.user);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const quiz = normalizeQuiz({ id: randomUUID(), ...input, status: "draft", submissions: [], createdAt: now(), createdBy: req.user.id }, db);
  db.quizzes.push(quiz);
  await writeDb(db);
  res.status(201).json({ quiz: publicQuiz(quiz, db, req.user) });
});

app.put("/api/admin/quizzes/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const quiz = db.quizzes.find((item) => item.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found." });
  if (!canUseQuiz(req.user, quiz)) return res.status(403).json({ error: "This quiz is outside your assigned class scope." });
  let input;
  try {
    input = quizFromBody(db, req.body, req.user, quiz);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const hasAttempts = (quiz.submissions || []).some((submission) => submission.activeAttempt || (submission.attempts || []).length);
  if (hasAttempts && (input.subjectId !== quiz.subjectId || input.section !== quiz.section)) {
    return res.status(400).json({ error: "Subject and section cannot be changed after a student has started the quiz." });
  }
  Object.assign(quiz, input, { rewardValue: quizRewardValue(db, input.difficulty), updatedAt: now() });
  normalizeQuiz(quiz, db);
  await writeDb(db);
  res.json({ quiz: publicQuiz(quiz, db, req.user) });
});

app.post("/api/admin/quizzes/:id/publish", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const quiz = db.quizzes.find((item) => item.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found." });
  if (!canUseQuiz(req.user, quiz)) return res.status(403).json({ error: "This quiz is outside your assigned class scope." });
  normalizeQuiz(quiz, db);
  if (quiz.status === "published") return res.json({ quiz: publicQuiz(quiz, db, req.user), alreadyPublished: true });
  if (!quiz.questions.length) return res.status(400).json({ error: "Add at least one question before publishing." });
  quiz.status = "published";
  quiz.publishedAt = now();
  if (quiz.closedAt) quiz.reopenedAt = now();
  quiz.rewardValue = Number(quiz.rewardValue ?? quizRewardValue(db, quiz.difficulty));
  await writeDb(db);
  const assignedStudentIds = studentsForClass(db, quiz.subjectId, quiz.section).map((student) => student.id);
  queuePushToUsers(db, userIdsForStudents(db, assignedStudentIds), {
    title: "New quiz published",
    body: `${quiz.title} is now available.`,
    url: "/quizzes",
    tag: `quiz-${quiz.id}`
  });
  res.json({ quiz: publicQuiz(quiz, db, req.user) });
});

app.post("/api/admin/quizzes/:id/close", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const quiz = db.quizzes.find((item) => item.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found." });
  if (!canUseQuiz(req.user, quiz)) return res.status(403).json({ error: "This quiz is outside your assigned class scope." });
  quiz.status = "closed";
  quiz.closedAt = now();
  await writeDb(db);
  res.json({ quiz: publicQuiz(quiz, db, req.user) });
});

app.delete("/api/admin/quizzes/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const quiz = db.quizzes.find((item) => item.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found." });
  if (!canUseQuiz(req.user, quiz)) return res.status(403).json({ error: "This quiz is outside your assigned class scope." });
  db.quizzes = db.quizzes.filter((item) => item.id !== quiz.id);
  db.transactions = db.transactions.filter((transaction) => !(transaction.meta?.kind === "quiz" && transaction.meta.quizId === quiz.id));
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/quizzes/:id/paper-submissions", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const quiz = db.quizzes.find((item) => item.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found." });
  normalizeQuiz(quiz, db);
  if (!canUseQuiz(req.user, quiz)) return res.status(403).json({ error: "This quiz is outside your assigned class scope." });
  const studentCode = normalizeStudentQuizCode(req.body.studentCode);
  if (!studentCode) return res.status(400).json({ error: "Enter a valid JCS student code." });
  const student = db.students.find((item) => normalizeStudentQuizCode(item.quizCode) === studentCode);
  if (!student || !studentIsInClass(db, student, quiz.subjectId, quiz.section)) return res.status(404).json({ error: "No enrolled student matches that JCS code for this quiz." });
  if (!scopedStudentIds(db, req.user).has(student.id)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  const variant = normalizePaperVariant(req.body.variant);
  const result = scorePaperQuiz(quiz, variant, req.body.answers || {});
  if (!result.total) return res.status(400).json({ error: "This quiz has no paper-checkable questions. Use Multiple Choice, True/False, or Matching." });
  let submission = quiz.submissions.find((item) => item.studentId === student.id);
  if (!submission) {
    submission = { studentId: student.id, attempts: [], bestScore: 0, bestAwarded: 0, activeAttempt: null };
    quiz.submissions.push(submission);
  }
  const submittedAt = now();
  const attempt = {
    id: randomUUID(),
    attemptNumber: submission.attempts.length + 1,
    answers: result.answers,
    correct: result.correct,
    total: result.total,
    passingScore: result.passingScore,
    difficulty: quiz.difficulty,
    rewardValue: result.rewardValue,
    quizVersionId: quiz.currentVersionId || "",
    awarded: result.awarded,
    startedAt: submittedAt,
    dueAt: "",
    timedOut: false,
    submittedAt,
    source: "paper",
    paperVariant: variant,
    checkedBy: req.user.id
  };
  submission.attempts.push(attempt);
  submission.activeAttempt = null;
  submission.bestScore = Math.max(Number(submission.bestScore || 0), result.correct);
  submission.bestAwarded = Math.max(Number(submission.bestAwarded || 0), result.awarded);
  const existing = db.transactions.find((transaction) => transaction.meta?.kind === "quiz" && transaction.meta.quizId === quiz.id && transaction.studentId === student.id);
  const note = `${quiz.title} quiz reward`;
  const meta = { kind: "quiz", quizId: quiz.id, subjectId: quiz.subjectId, section: quiz.section, difficulty: quiz.difficulty, passingScore: result.passingScore, bestScore: submission.bestScore, source: "paper" };
  if (existing) {
    existing.amount = submission.bestAwarded;
    existing.note = note;
    existing.meta = { ...(existing.meta || {}), ...meta };
  } else if (submission.bestAwarded) {
    db.transactions.push(tx(student.id, "quiz", submission.bestAwarded, note, submittedAt, req.user.id, meta));
  }
  addAuditLog(db, req.user, "quiz.paper.check", {
    entityType: "quiz",
    entityId: quiz.id,
    targetStudentId: student.id,
    amount: result.awarded,
    summary: `Checked paper quiz for ${student.name}: ${result.correct}/${result.total}.`,
    meta: { quizId: quiz.id, variant, studentCode }
  });
  await writeDb(db);
  res.status(201).json({
    attempt: publicCompletedQuizAttempt(attempt),
    student: { id: student.id, name: student.name, quizCode: student.quizCode },
    submission: { attempts: submission.attempts.length, bestScore: submission.bestScore, bestAwarded: submission.bestAwarded }
  });
});

app.post("/api/admin/quizzes/:id/manual-scores", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const quiz = db.quizzes.find((item) => item.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found." });
  normalizeQuiz(quiz, db);
  if (!canUseQuiz(req.user, quiz)) return res.status(403).json({ error: "This quiz is outside your assigned class scope." });
  const student = db.students.find((item) => item.id === req.body.studentId);
  if (!student || !studentIsInClass(db, student, quiz.subjectId, quiz.section)) return res.status(404).json({ error: "No enrolled student matches this quiz." });
  if (!scopedStudentIds(db, req.user).has(student.id)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  const result = scoreManualQuiz(quiz, req.body.score, req.body.total);
  let submission = quiz.submissions.find((item) => item.studentId === student.id);
  if (!submission) {
    submission = { studentId: student.id, attempts: [], bestScore: 0, bestAwarded: 0, activeAttempt: null };
    quiz.submissions.push(submission);
  }
  const submittedAt = now();
  const attempt = {
    id: randomUUID(),
    attemptNumber: submission.attempts.length + 1,
    answers: {},
    correct: result.correct,
    total: result.total,
    passingScore: result.passingScore,
    difficulty: quiz.difficulty,
    rewardValue: result.rewardValue,
    quizVersionId: quiz.currentVersionId || "",
    awarded: result.awarded,
    startedAt: submittedAt,
    dueAt: "",
    timedOut: false,
    submittedAt,
    source: "manual",
    checkedBy: req.user.id,
    remarks: String(req.body.remarks || "").trim()
  };
  submission.attempts.push(attempt);
  submission.activeAttempt = null;
  submission.bestScore = Math.max(Number(submission.bestScore || 0), result.correct);
  submission.bestAwarded = Math.max(Number(submission.bestAwarded || 0), result.awarded);
  const existing = db.transactions.find((transaction) => transaction.meta?.kind === "quiz" && transaction.meta.quizId === quiz.id && transaction.studentId === student.id);
  const note = `${quiz.title} quiz reward`;
  const meta = { kind: "quiz", quizId: quiz.id, subjectId: quiz.subjectId, section: quiz.section, difficulty: quiz.difficulty, passingScore: result.passingScore, bestScore: submission.bestScore, source: "manual" };
  if (existing) {
    existing.amount = submission.bestAwarded;
    existing.note = note;
    existing.meta = { ...(existing.meta || {}), ...meta };
  } else if (submission.bestAwarded) {
    db.transactions.push(tx(student.id, "quiz", submission.bestAwarded, note, submittedAt, req.user.id, meta));
  }
  addAuditLog(db, req.user, "quiz.manual.score", {
    entityType: "quiz",
    entityId: quiz.id,
    targetStudentId: student.id,
    amount: result.awarded,
    summary: `Manually recorded quiz score for ${student.name}: ${result.correct}/${result.total}.`,
    meta: { quizId: quiz.id, score: result.correct, total: result.total }
  });
  await writeDb(db);
  res.status(201).json({
    attempt: publicCompletedQuizAttempt(attempt),
    student: { id: student.id, name: student.name, quizCode: student.quizCode },
    submission: { attempts: submission.attempts.length, bestScore: submission.bestScore, bestAwarded: submission.bestAwarded }
  });
});

function quizMutationResponse(status, body, mutated = false, request = null) {
  return { status, body, mutated, request };
}

function startStudentQuiz(db, req) {
  const quiz = db.quizzes.find((item) => item.id === req.params.id);
  if (!quiz) return quizMutationResponse(404, { error: "Quiz not found." });
  normalizeQuiz(quiz, db);
  if (!canStudentSeeQuiz(db, quiz, req.user.studentId)) return quizMutationResponse(403, { error: "This quiz is not assigned to you." });
  if (quiz.status !== "published") return quizMutationResponse(400, { error: "This quiz is not open." });
  if (!isQuizDeadlineOpen(quiz, req.receivedAt)) return quizMutationResponse(400, { error: "The deadline has passed." });
  let submission = quiz.submissions.find((item) => item.studentId === req.user.studentId);
  if (!submission) {
    submission = { studentId: req.user.studentId, attempts: [], bestScore: 0, bestAwarded: 0, activeAttempt: null };
    quiz.submissions.push(submission);
  }
  if (submission.activeAttempt && quizAttemptExpired(submission.activeAttempt)) finishTimedOutQuizAttempt(quiz, submission);
  if (submission.activeAttempt) return quizMutationResponse(200, { attempt: publicActiveQuizAttempt(submission.activeAttempt) });
  if (!canRetakeQuiz(quiz, req.user.studentId, submission)) return quizMutationResponse(400, { error: "No retake is available for this quiz." });
  const startedAt = new Date(req.receivedAt).toISOString();
  const quizVersion = ensureQuizVersion(quiz);
  submission.activeAttempt = {
    id: randomUUID(),
    attemptNumber: submission.attempts.length + 1,
    startedAt,
    dueAt: new Date(req.receivedAt + quiz.timeLimitMinutes * 60 * 1000).toISOString(),
    quizVersionId: quizVersion.id
  };
  return quizMutationResponse(201, { attempt: publicActiveQuizAttempt(submission.activeAttempt) }, true, req);
}

function submitStudentQuiz(db, req) {
  const quiz = db.quizzes.find((item) => item.id === req.params.id);
  if (!quiz) return quizMutationResponse(404, { error: "Quiz not found." });
  normalizeQuiz(quiz, db);
  if (!canStudentSeeQuiz(db, quiz, req.user.studentId)) return quizMutationResponse(403, { error: "This quiz is not assigned to you." });
  let submission = quiz.submissions.find((item) => item.studentId === req.user.studentId);
  const requestedAttemptId = String(req.body.attemptId || "").trim();
  const completedAttempt = requestedAttemptId && submission?.attempts?.find((attempt) => attempt.id === requestedAttemptId);
  if (completedAttempt) return quizMutationResponse(200, {
    attempt: publicCompletedQuizAttempt(completedAttempt),
    submission: { attempts: submission.attempts.length, bestScore: submission.bestScore, bestAwarded: submission.bestAwarded },
    alreadySubmitted: true
  });
  if (quiz.status !== "published") return quizMutationResponse(400, { error: "This quiz is not open." });
  if (!isQuizDeadlineOpen(quiz, req.receivedAt)) return quizMutationResponse(400, { error: "The deadline has passed." });
  if (!canRetakeQuiz(quiz, req.user.studentId, submission)) return quizMutationResponse(400, { error: "No retake is available for this quiz." });
  if (!submission) {
    submission = { studentId: req.user.studentId, attempts: [], bestScore: 0, bestAwarded: 0, activeAttempt: null };
    quiz.submissions.push(submission);
  }
  const activeAttempt = submission.activeAttempt;
  if (quiz.timeLimitMinutes > 0 && !activeAttempt) return quizMutationResponse(400, { error: "Start the quiz before submitting." });
  if (requestedAttemptId && activeAttempt?.id && requestedAttemptId !== activeAttempt.id) return quizMutationResponse(409, { error: "This quiz attempt is no longer active. Reload the quiz before submitting." });
  if (activeAttempt?.dueAt && req.receivedAt > new Date(activeAttempt.dueAt).getTime() + 90 * 1000) {
    finishTimedOutQuizAttempt(quiz, submission);
    return quizMutationResponse(400, { error: "Time is up. This attempt was recorded as timed out." }, true, req);
  }
  const attemptQuiz = quizForAttempt(quiz, activeAttempt);
  const answers = cleanQuizSubmissionAnswers(attemptQuiz, req.body.answers);
  const result = scoreQuiz(attemptQuiz, answers);
  const submittedAt = new Date(req.receivedAt).toISOString();
  const attempt = {
    id: activeAttempt?.id || randomUUID(), attemptNumber: activeAttempt?.attemptNumber || submission.attempts.length + 1,
    answers, correct: result.correct, total: result.total, passingScore: result.passingScore,
    difficulty: attemptQuiz.difficulty, rewardValue: result.rewardValue,
    quizVersionId: activeAttempt?.quizVersionId || quiz.currentVersionId || "", awarded: result.awarded,
    startedAt: activeAttempt?.startedAt || submittedAt, dueAt: activeAttempt?.dueAt || "", timedOut: false, submittedAt
  };
  submission.attempts.push(attempt);
  submission.activeAttempt = null;
  submission.bestScore = Math.max(Number(submission.bestScore || 0), result.correct);
  submission.bestAwarded = Math.max(Number(submission.bestAwarded || 0), result.awarded);
  const existing = db.transactions.find((transaction) => transaction.meta?.kind === "quiz" && transaction.meta.quizId === quiz.id && transaction.studentId === req.user.studentId);
  const note = `${quiz.title} quiz reward`;
  const meta = { kind: "quiz", quizId: quiz.id, subjectId: quiz.subjectId, section: quiz.section, difficulty: attemptQuiz.difficulty, passingScore: result.passingScore, bestScore: submission.bestScore };
  if (existing) {
    existing.amount = submission.bestAwarded;
    existing.note = note;
    existing.meta = { ...(existing.meta || {}), ...meta };
  } else if (submission.bestAwarded) {
    db.transactions.push(tx(req.user.studentId, "quiz", submission.bestAwarded, note, attempt.submittedAt, req.user.id, meta));
  }
  return quizMutationResponse(201, { attempt: publicCompletedQuizAttempt(attempt), submission: { attempts: submission.attempts.length, bestScore: submission.bestScore, bestAwarded: submission.bestAwarded } }, true, req);
}

async function handleBatchedQuizMutation(req, res, execute) {
  const result = await enqueueQuizMutation((db) => execute(db, req));
  res.status(result.status).json(result.body);
}

app.post("/api/student/quizzes/:id/start", auth, requireRole("student"), (req, res) => handleBatchedQuizMutation(req, res, startStudentQuiz));
app.post("/api/student/quizzes/:id/submit", auth, requireRole("student"), (req, res) => handleBatchedQuizMutation(req, res, submitStudentQuiz));

app.post("/api/admin/transactions", auth, requireStaffOrAssistant, async (req, res) => {
  const db = await readDb();
  try { ensureAssistantAccess(db, req.user); } catch (err) { if (req.user.role === "student") return res.status(403).json({ error: err.message }); }
  const allowedStudentIds = actionScopedStudentIds(db, req.user);
  const type = req.body.type || "adjustment";
  if (!["bonus", "adjustment", "penalty", "shop", "trade"].includes(type)) return res.status(400).json({ error: "Choose a valid transaction type." });
  if (req.user.role === "student" && !["bonus", "adjustment", "penalty"].includes(type)) return res.status(403).json({ error: "Student assistants can only add bonus, adjustment, or penalty transactions." });
  const assistantTransactionRemark = assistantCreditRemark(db, req.user, req.body.remarks);
  if (type === "trade") {
    const targetIds = [...new Set((Array.isArray(req.body.studentIds) ? req.body.studentIds : [req.body.studentId]).filter(Boolean))];
    if (targetIds.length !== 1 || !req.body.fromStudentId) return res.status(400).json({ error: "Choose exactly one From Student and one To Student." });
    if (targetIds[0] !== req.body.studentId) req.body.studentId = targetIds[0];
    if (req.body.studentId === req.body.fromStudentId) return res.status(400).json({ error: "Choose two different students for a trade." });
    if (!allowedStudentIds.has(req.body.studentId)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
    if (!allowedStudentIds.has(req.body.fromStudentId)) return res.status(403).json({ error: "The trade source student is outside your assigned class scope." });
    const requestedAmount = Number(req.body.amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) return res.status(400).json({ error: "Amount must be greater than zero." });
    const amount = Math.abs(requestedAmount);
    db.transactions.push(tx(req.body.fromStudentId, "trade", -amount, req.body.remarks || "Trade", now(), req.user.id, { toStudentId: req.body.studentId }));
    db.transactions.push(tx(req.body.studentId, "trade", amount, req.body.remarks || "Trade", now(), req.user.id, { fromStudentId: req.body.fromStudentId }));
    addAuditLog(db, req.user, "transaction.trade.manual", {
      entityType: "transaction",
      targetStudentId: req.body.studentId,
      amount,
      summary: `Manual trade: ${studentName(db, req.body.fromStudentId)} sent ${amount} JCoins to ${studentName(db, req.body.studentId)}.`,
      meta: { fromStudentId: req.body.fromStudentId, toStudentId: req.body.studentId }
    });
  } else {
    const targetIds = [...new Set((Array.isArray(req.body.studentIds) && req.body.studentIds.length ? req.body.studentIds : [req.body.studentId]).filter(Boolean))];
    if (!targetIds.length) return res.status(400).json({ error: "Choose at least one student." });
    if (targetIds.some((studentId) => !allowedStudentIds.has(studentId))) return res.status(403).json({ error: "One or more students are outside your assigned class scope." });
    let recordedAmount;
    if (type === "shop") {
      const priced = activeShopPrice(db, req.body.itemId);
      if (!priced) return res.status(400).json({ error: "Choose a valid shop item." });
      recordedAmount = -Math.abs(priced.activeCost);
      targetIds.forEach((studentId) => {
        db.transactions.push(tx(studentId, "shop", recordedAmount, req.body.remarks || priced.name || "Shop", now(), req.user.id, { itemId: req.body.itemId }));
      });
    } else {
      const requestedAmount = Number(req.body.amount);
      if (!Number.isFinite(requestedAmount) || requestedAmount === 0) return res.status(400).json({ error: "Amount must be a non-zero number." });
      const amount = type === "penalty" ? -Math.abs(requestedAmount) : type === "bonus" ? Math.abs(requestedAmount) : requestedAmount;
      recordedAmount = amount;
      const note = req.user.role === "student" ? assistantTransactionRemark : req.body.remarks || type;
      targetIds.forEach((studentId) => {
        db.transactions.push(tx(studentId, type, amount, note, now(), req.user.id));
      });
    }
    addAuditLog(db, req.user, "transaction.create", {
      entityType: "transaction",
      targetStudentId: targetIds.length === 1 ? targetIds[0] : "",
      amount: recordedAmount,
      summary: `${type} transaction for ${targetIds.length} student${targetIds.length === 1 ? "" : "s"}.`,
      meta: { type, targetIds, itemId: req.body.itemId || "" }
    });
  }
  await writeDb(db);
  res.status(201).json({ ok: true });
});

app.post("/api/admin/student-assistants", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const student = db.students.find((item) => item.id === req.body.studentId);
  if (!student) return res.status(404).json({ error: "Student not found." });
  const section = String(req.body.section || student.section || "").trim();
  if (!section) return res.status(400).json({ error: "Choose a section." });
  if (student.section !== section) return res.status(400).json({ error: "The selected student is not in that section." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(student.id) || !canUseSection(req.user, section)) return res.status(403).json({ error: "This section is outside your assigned class scope." });
  const start = validDate(req.body.startAt);
  const finish = validDate(req.body.finishAt);
  if (!start || !finish) return res.status(400).json({ error: "Choose valid start and finish dates with times." });
  if (finish <= start) return res.status(400).json({ error: "Finish time must be after the start time." });
  const overlaps = (db.studentAssistants || []).some((assignment) => assignment.section === section
    && new Date(assignment.startAt || `${assignment.weekStart}T00:00:00+08:00`) < finish
    && new Date(assignment.finishAt || `${assignment.weekEnd}T23:59:59+08:00`) > start);
  if (overlaps) return res.status(409).json({ error: "This section already has a student assistant during part of that period." });
  const assignment = {
    id: randomUUID(),
    studentId: student.id,
    section,
    startAt: start.toISOString(),
    finishAt: finish.toISOString(),
    weekStart: localDate(start),
    weekEnd: localDate(finish),
    rewardStartsOn: localDate(start),
    dailyReward: STUDENT_ASSISTANT_DAILY_REWARD,
    createdAt: now(),
    createdBy: req.user.id
  };
  db.studentAssistants.push(assignment);
  const rewardsGranted = grantStudentAssistantDailyRewards(db);
  await writeDb(db);
  res.status(201).json({ assignment, rewardsGranted });
});

app.delete("/api/admin/student-assistants/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const assignment = (db.studentAssistants || []).find((item) => item.id === req.params.id);
  if (!assignment) return res.status(404).json({ error: "Assignment not found." });
  if (!canUseSection(req.user, assignment.section)) return res.status(403).json({ error: "This section is outside your assigned class scope." });
  db.studentAssistants = (db.studentAssistants || []).filter((item) => item.id !== assignment.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/shop/items", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const item = { id: randomUUID(), name: req.body.name || "New Item", cost: Number(req.body.cost || 0), tier: req.body.tier || "Tier 1", notes: req.body.notes || "" };
  db.shopItems.push(item);
  await writeDb(db);
  res.status(201).json({ item });
});

app.put("/api/admin/shop/items/:id", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const item = db.shopItems.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found." });
  item.name = req.body.name ?? item.name;
  item.cost = Number(req.body.cost ?? item.cost);
  item.tier = req.body.tier ?? item.tier ?? "Tier 1";
  item.notes = req.body.notes ?? item.notes;
  await writeDb(db);
  res.json({ item });
});

app.delete("/api/admin/shop/items/:id", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const item = db.shopItems.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found." });
  db.shopItems = db.shopItems.filter((i) => i.id !== item.id);
  db.sales.forEach((sale) => {
    sale.itemIds = (sale.itemIds || []).filter((id) => id !== item.id);
  });
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/shop/sales", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const sale = { id: randomUUID(), name: req.body.name || "Sale", startDate: req.body.startDate || today(), endDate: req.body.endDate || today(), discount: Number(req.body.discount || 0), itemIds: Array.isArray(req.body.itemIds) ? req.body.itemIds : db.shopItems.map((item) => item.id) };
  db.sales.push(sale);
  await writeDb(db);
  res.status(201).json({ sale });
});

app.post("/api/admin/appearance/items", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const type = appearanceTypes.includes(req.body.type) ? req.body.type : "badge";
  const item = {
    id: randomUUID(),
    name: String(req.body.name || "New Cosmetic"),
    type,
    price: Number(req.body.price || 0),
    tier: appearanceTiers.includes(req.body.tier) ? req.body.tier : "Common",
    preview: String(req.body.preview || ""),
    icon: String(req.body.icon || ""),
    active: req.body.active !== false,
    styleClass: String(req.body.styleClass || `ap-custom-${type}`)
  };
  db.appearanceItems.push(item);
  await writeDb(db);
  res.status(201).json({ item });
});

app.put("/api/admin/appearance/items/:id", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const item = appearanceItem(db, req.params.id);
  if (!item) return res.status(404).json({ error: "Appearance item not found." });
  item.name = req.body.name ?? item.name;
  item.type = appearanceTypes.includes(req.body.type) ? req.body.type : item.type;
  item.price = Number(req.body.price ?? item.price);
  item.tier = appearanceTiers.includes(req.body.tier) ? req.body.tier : item.tier;
  item.preview = req.body.preview ?? item.preview ?? "";
  item.icon = req.body.icon ?? item.icon ?? "";
  item.active = typeof req.body.active === "boolean" ? req.body.active : item.active !== false;
  item.styleClass = req.body.styleClass ?? item.styleClass;
  await writeDb(db);
  res.json({ item });
});


app.post("/api/admin/appearance/grants", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const item = appearanceItem(db, req.body.itemId);
  if (!item) return res.status(404).json({ error: "Appearance item not found." });
  const targetIds = req.body.allStudents
    ? db.students.map((student) => student.id)
    : Array.isArray(req.body.studentIds) ? req.body.studentIds : [];
  const uniqueTargetIds = [...new Set(targetIds)].filter((studentId) => db.students.some((student) => student.id === studentId));
  if (!uniqueTargetIds.length) return res.status(400).json({ error: "Select at least one student." });
  const grantedAt = now();
  const grants = [];
  uniqueTargetIds.forEach((studentId) => {
    if (!ownsAppearance(db, studentId, item.id)) {
      const grant = { id: randomUUID(), studentId, itemId: item.id, purchasedAt: grantedAt, source: "admin_grant", grantedBy: req.user.id, note: String(req.body.note || "") };
      db.appearanceInventory.push(grant);
      grants.push(grant);
    }
    if (req.body.autoEquip !== false) {
      db.appearanceEquipped[studentId] ||= {};
      db.appearanceEquipped[studentId][item.type] = item.id;
    }
  });
  await writeDb(db);
  res.status(201).json({ item, granted: grants.length, targeted: uniqueTargetIds.length });
});

app.post("/api/appearance/buy", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const studentId = req.user.studentId;
  const item = appearanceItem(db, req.body.itemId);
  if (!item || item.active === false) return res.status(404).json({ error: "Appearance item is not available." });
  if (ownsAppearance(db, studentId, item.id)) return res.status(409).json({ error: "You already own this appearance item." });
  const price = Number(item.price || 0);
  if (studentCoins(db, studentId) < price) return res.status(400).json({ error: "Not enough JCoins." });
  db.transactions.push(tx(studentId, "appearance_shop", -price, `Bought ${item.name}`, now(), req.user.id, { kind: "appearance-buy", itemId: item.id }));
  db.appearanceInventory.push({ id: randomUUID(), studentId, itemId: item.id, purchasedAt: now(), source: "buy" });
  db.appearanceEquipped[studentId] ||= {};
  db.appearanceEquipped[studentId][item.type] = item.id;
  await writeDb(db);
  res.status(201).json({ item, equipped: db.appearanceEquipped[studentId] });
});

app.post("/api/appearance/gift", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const fromStudentId = req.user.studentId;
  const toStudentId = req.body.toStudentId;
  const item = appearanceItem(db, req.body.itemId);
  if (!item || item.active === false) return res.status(404).json({ error: "Appearance item is not available." });
  if (!db.students.some((student) => student.id === toStudentId)) return res.status(404).json({ error: "Recipient not found." });
  if (toStudentId === fromStudentId) return res.status(400).json({ error: "Use Buy for myself instead." });
  if (ownsAppearance(db, toStudentId, item.id)) return res.status(409).json({ error: "Recipient already owns this item." });
  const price = Number(item.price || 0);
  if (studentCoins(db, fromStudentId) < price) return res.status(400).json({ error: "Not enough JCoins." });
  const gift = { id: randomUUID(), itemId: item.id, fromStudentId, toStudentId, message: String(req.body.message || ""), createdAt: now(), pricePaid: price };
  db.transactions.push(tx(fromStudentId, "appearance_gift", -price, `Gifted ${item.name} to ${studentName(db, toStudentId)}`, gift.createdAt, req.user.id, { kind: "appearance-gift", itemId: item.id, toStudentId, giftId: gift.id }));
  db.appearanceGifts.push(gift);
  db.appearanceInventory.push({ id: randomUUID(), studentId: toStudentId, itemId: item.id, purchasedAt: gift.createdAt, source: "gift", fromStudentId, giftId: gift.id });
  await writeDb(db);
  res.status(201).json({ gift });
});

app.post("/api/appearance/equip", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const studentId = req.user.studentId;
  const item = appearanceItem(db, req.body.itemId);
  if (!item) return res.status(404).json({ error: "Appearance item not found." });
  if (!ownsAppearance(db, studentId, item.id)) return res.status(403).json({ error: "You do not own this item." });
  db.appearanceEquipped[studentId] ||= {};
  db.appearanceEquipped[studentId][item.type] = item.id;
  await writeDb(db);
  res.json({ equipped: db.appearanceEquipped[studentId] });
});

app.post("/api/appearance/unequip", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const studentId = req.user.studentId;
  const type = appearanceTypes.includes(req.body.type) ? req.body.type : "";
  if (!type) return res.status(400).json({ error: "Valid appearance type is required." });
  db.appearanceEquipped[studentId] ||= {};
  delete db.appearanceEquipped[studentId][type];
  await writeDb(db);
  res.json({ equipped: db.appearanceEquipped[studentId] });
});

app.put("/api/admin/settings", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  db.settings = req.body.settings;
  addAuditLog(db, req.user, "settings.update", {
    entityType: "settings",
    summary: "Admin updated system settings."
  });
  await writeDb(db);
  res.json({ settings: db.settings });
});

function stripXmlText(xml = "") {
  return String(xml)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractZipText(buffer, matcher) {
  const zip = new AdmZip(buffer);
  return zip.getEntries()
    .filter((entry) => !entry.isDirectory && matcher(entry.entryName))
    .map((entry) => stripXmlText(entry.getData().toString("utf8")))
    .filter(Boolean)
    .join("\n")
    .slice(0, 30000);
}

async function extractReferenceText(file) {
  if (!file) return "";
  const buffer = file.buffer || await readFile(file.path);
  const name = String(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) return extractZipText(buffer, (entry) => entry.startsWith("word/") && entry.endsWith(".xml"));
  if (name.endsWith(".pptx") || mime.includes("presentationml")) return extractZipText(buffer, (entry) => entry.startsWith("ppt/slides/") && entry.endsWith(".xml"));
  if (name.endsWith(".xlsx") || mime.includes("spreadsheet")) return extractZipText(buffer, (entry) => entry.startsWith("xl/") && entry.endsWith(".xml"));
  if (name.endsWith(".pdf") || mime.includes("pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return String(parsed.text || "").slice(0, 30000);
    } finally {
      await parser.destroy();
    }
  }
  if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".csv")) return buffer.toString("utf8").slice(0, 30000);
  throw new Error("Upload a PPTX, DOCX, PDF, XLSX, TXT, or CSV file.");
}

async function extractReferenceFiles(files = []) {
  if (!files.length) return { text: "", names: [] };
  const perFileCharacterLimit = Math.max(8000, Math.floor(80000 / files.length));
  const sections = [];
  for (const file of files) {
    let text;
    try {
      text = await extractReferenceText(file);
    } catch (error) {
      throw new Error(`${file.originalname}: ${error.message}`);
    }
    sections.push(`REFERENCE FILE: ${file.originalname}\n${text.slice(0, perFileCharacterLimit)}`);
  }
  return {
    text: sections.join("\n\n--- NEXT REFERENCE FILE ---\n\n").slice(0, 80000),
    names: files.map((file) => file.originalname)
  };
}

function parseAiJson(text = "") {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { reply: cleaned || "I could not format a response." };
    try {
      return JSON.parse(match[0]);
    } catch {
      return { reply: cleaned || "I could not format a response." };
    }
  }
}

async function askGemini({ message, referenceText, context }) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return {
      reply: "AI Assistant is ready, but Gemini is not configured yet. Add GEMINI_API_KEY on the backend to enable live AI replies and quiz generation."
    };
  }
  const models = process.env.GEMINI_MODEL
    ? [process.env.GEMINI_MODEL]
    : ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];
  const prompt = [
    "You are the JCoins Arena assistant for Jerome's classroom economy app.",
    "Reply conversationally and briefly.",
    "If the user asks to create a quiz, return a JSON object with reply and quizDraft.",
    "Quiz drafts must only use these auto-gradable types: multiple_choice, true_false, fill_blank, matching, multiple_select, numerical, computation.",
    "When multiple reference files are provided, use every file and distribute the questions across all lessons instead of focusing only on the first file.",
    "For multiple_choice use options plus one answer. For multiple_select use options plus an answers array. For fill_blank use acceptedAnswers. For matching use matchingPairs with id, left, and right. For numerical or computation use a numerical answer and non-negative tolerance.",
    "Do not claim anything is saved or published.",
    "Return only JSON in this shape:",
    "{\"reply\":\"short message\",\"quizDraft\":{\"title\":\"\",\"difficulty\":\"Easy|Moderate|Hard|Advanced\",\"quizType\":\"mixed\",\"passingScore\":0,\"questions\":[{\"type\":\"multiple_choice\",\"prompt\":\"\",\"options\":[\"\",\"\",\"\",\"\"],\"answer\":\"\"}]}}",
    `App context: ${JSON.stringify(context).slice(0, 4000)}`,
    referenceText ? `Reference texts from the uploaded lesson files:\n${referenceText.slice(0, 80000)}` : "No uploaded reference text.",
    `User message: ${message}`
  ].join("\n\n");
  let lastError = "";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "";
      return parseAiJson(text);
    }
    lastError = payload.error?.message || `AI request failed for ${model}.`;
    if (!/not found|not supported|not available/i.test(lastError)) break;
  }
  throw new Error(lastError || "AI request failed.");
}

app.post("/api/assistant/chat", auth, requireRole("admin", "teacher"), assistantLimit, assistantReferenceUpload, async (req, res) => {
  try {
    const db = await readDb();
    const message = String(req.body.message || "").trim();
    if (!message) return res.status(400).json({ error: "Type a message first." });
    const references = await extractReferenceFiles(req.referenceFiles);
    const overview = filteredOverview(db, req.user);
    const result = await askGemini({
      message,
      referenceText: references.text,
      context: {
        role: req.user.role,
        subjects: overview.subjects.map((subject) => subject.name),
        sections: req.user.role === "admin" ? db.sections : req.user.sectionIds || [],
        quizDifficulties: db.settings.quizzes.difficulties
      }
    });
    if (result.quizDraft?.questions) {
      result.quizDraft.questions = result.quizDraft.questions.map(cleanQuizQuestion).slice(0, 60);
      result.quizDraft.difficulty = quizDifficulties.includes(result.quizDraft.difficulty) ? result.quizDraft.difficulty : "Easy";
      result.quizDraft.quizType = quizTypes.includes(result.quizDraft.quizType) ? result.quizDraft.quizType : "mixed";
      result.quizDraft.passingScore = Math.max(1, Math.min(Number(result.quizDraft.passingScore || result.quizDraft.questions.length), Math.max(1, result.quizDraft.questions.length)));
    }
    res.json({ ...result, referenceUsed: !!references.text, referenceFiles: references.names });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    await cleanupAssistantReferenceFiles(req.referenceFiles);
  }
});

app.put("/api/admin/users/:id", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  const role = req.body.role || user.role;
  if (!["admin", "teacher", "student", "display"].includes(role)) return res.status(400).json({ error: "Invalid account role." });
  if (user.id === req.user.id && role !== "admin") return res.status(400).json({ error: "You cannot remove your own admin access while logged in." });
  const subjectIds = Array.isArray(req.body.subjectIds) ? [...new Set(req.body.subjectIds)] : user.subjectIds;
  const sectionIds = Array.isArray(req.body.sectionIds) ? [...new Set(req.body.sectionIds)] : user.sectionIds;
  if (subjectIds.some((id) => !db.subjects.some((subject) => subject.id === id))) return res.status(400).json({ error: "One or more assigned subjects do not exist." });
  if (sectionIds.some((section) => !db.sections.includes(section))) return res.status(400).json({ error: "One or more assigned sections do not exist." });
  user.role = role;
  user.subjectIds = subjectIds;
  user.sectionIds = sectionIds;
  if (typeof req.body.mustChangePassword === "boolean") user.mustChangePassword = req.body.mustChangePassword;
  addAuditLog(db, req.user, "account.update", {
    entityType: "user",
    entityId: user.id,
    targetStudentId: user.studentId || null,
    summary: `Updated account access for ${user.username}.`,
    meta: { role: user.role, subjectIds: user.subjectIds, sectionIds: user.sectionIds }
  });
  await writeDb(db);
  res.json({ user: userWithStudent(user, db) });
});

app.post("/api/admin/users", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const username = String(req.body.username || "").trim();
  const tempPassword = String(req.body.tempPassword || "");
  const role = ["admin", "teacher", "display"].includes(req.body.role) ? req.body.role : "teacher";
  const subjectIds = Array.isArray(req.body.subjectIds) ? [...new Set(req.body.subjectIds)] : [];
  const sectionIds = Array.isArray(req.body.sectionIds) ? [...new Set(req.body.sectionIds)] : [];
  if (!username) return res.status(400).json({ error: "Username is required." });
  if (tempPassword.length < 8) return res.status(400).json({ error: "Temporary password must be at least 8 characters." });
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: "Username already exists." });
  if (subjectIds.some((id) => !db.subjects.some((subject) => subject.id === id))) return res.status(400).json({ error: "One or more assigned subjects do not exist." });
  if (sectionIds.some((section) => !db.sections.includes(section))) return res.status(400).json({ error: "One or more assigned sections do not exist." });
  const user = {
    id: randomUUID(),
    username,
    passwordHash: await bcrypt.hash(tempPassword, 10),
    role,
    mustChangePassword: true,
    studentId: null,
    subjectIds,
    sectionIds
  };
  db.users.push(user);
  addAuditLog(db, req.user, "account.create", {
    entityType: "user",
    entityId: user.id,
    summary: `Created ${role} account ${username}.`,
    meta: { role, subjectIds, sectionIds }
  });
  await writeDb(db);
  res.status(201).json({ user: userWithStudent(user, db) });
});

app.post("/api/admin/users/:id/reset-password", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (req.user.role === "teacher" && user.role !== "student") return res.status(403).json({ error: "Teachers can only reset student passwords." });
  if (req.user.role === "teacher" && (!user.studentId || !scopedStudentIds(db, req.user).has(user.studentId))) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  const tempPassword = String(req.body.tempPassword || "");
  if (tempPassword.length < 6) return res.status(400).json({ error: "Temporary password must be at least 6 characters." });
  user.passwordHash = await bcrypt.hash(tempPassword, 10);
  user.mustChangePassword = true;
  user.authVersion = Number(user.authVersion || 0) + 1;
  addAuditLog(db, req.user, "account.password.reset", {
    entityType: "user",
    entityId: user.id,
    targetStudentId: user.studentId || null,
    summary: `Reset password for ${user.username}.`
  });
  await writeDb(db);
  res.json({ user: userWithStudent(user, db) });
});

app.delete("/api/admin/users/:id", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (user.role === "student") return res.status(400).json({ error: "Remove student accounts from the Students table." });
  if (user.id === req.user.id) return res.status(400).json({ error: "You cannot remove your own account while logged in." });
  db.users = db.users.filter((u) => u.id !== user.id);
  db.pushSubscriptions = (db.pushSubscriptions || []).filter((subscription) => subscription.userId !== user.id);
  addAuditLog(db, req.user, "account.delete", {
    entityType: "user",
    entityId: user.id,
    summary: `Removed ${user.role} account ${user.username}.`,
    meta: { role: user.role }
  });
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/requests", auth, async (req, res) => {
  const db = await readDb();
  const type = String(req.body.type || "").trim();
  const studentId = req.user.studentId || req.body.studentId;
  if (!type) return res.status(400).json({ error: "Request type is required." });
  if (!studentId || !db.students.some((student) => student.id === studentId)) return res.status(400).json({ error: "Valid student is required." });
  if (req.user.role === "student" && type !== "trade" && db.requests.some((request) => request.studentId === studentId && request.type === type && request.status === "pending")) {
    return res.status(409).json({ error: `You already have a pending ${type} request. Cancel it first before making another.` });
  }
  let status = "pending";
  let payload = req.body.payload || {};
  if (type === "trade") {
    const toStudentId = payload.toStudentId;
    const amount = Number(payload.amount || 0);
    const requesterRole = payload.requesterRole === "recipient" ? "recipient" : "sender";
    if (!toStudentId || !db.students.some((student) => student.id === toStudentId)) return res.status(400).json({ error: "Choose a student to trade with." });
    if (toStudentId === studentId) return res.status(400).json({ error: "You cannot trade with yourself." });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Trade amount must be greater than 0." });
    const activeTrade = db.requests.some((request) => request.type === "trade" && ["peer_pending", "pending"].includes(request.status) && (request.studentId === studentId || request.payload?.toStudentId === studentId || request.studentId === toStudentId || request.payload?.toStudentId === toStudentId));
    if (activeTrade) return res.status(409).json({ error: "One of these students already has an active trade request." });
    payload = { toStudentId, amount, requesterRole };
    status = "peer_pending";
  } else if (type === "purchase") {
    const itemId = String(payload.itemId || "").trim();
    const priced = activeShopPrice(db, itemId);
    if (!priced) return res.status(400).json({ error: "Choose a valid shop item." });
    if (studentCoins(db, studentId) < Number(priced.activeCost || 0)) return res.status(400).json({ error: "Not enough JCoins." });
    payload = { itemId };
  }
  const request = { id: randomUUID(), type, status, studentId, payload, remarks: req.body.remarks || "", createdAt: now(), createdBy: req.user.id };
  db.requests.push(request);
  addAuditLog(db, req.user, "request.create", {
    entityType: "request",
    entityId: request.id,
    targetStudentId: studentId,
    amount: type === "trade" ? payload.amount : null,
    summary: `${type} request created with status ${status}.`,
    meta: { type, status, payload }
  });
  await writeDb(db);
  if (type === "trade") {
    queuePushToUsers(db, userIdsForStudents(db, [payload.toStudentId]), {
      title: "Trade needs your approval",
      body: `${studentName(db, studentId)} sent a ${payload.amount} JCoin trade request.`,
      url: "/trade-requests",
      tag: `trade-${request.id}`
    });
  } else {
    queuePushToUsers(db, staffUserIdsForStudent(db, studentId), {
      title: "New student request",
      body: `${studentName(db, studentId)} submitted a ${type} request.`,
      url: "/approvals",
      tag: `request-${request.id}`
    });
  }
  res.status(201).json({ request });
});

app.post("/api/requests/:id/respond", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const request = db.requests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  if (request.type !== "trade") return res.status(400).json({ error: "Only trade requests need student approval." });
  if (request.payload?.toStudentId !== req.user.studentId) return res.status(403).json({ error: "Only the other student can respond to this trade." });
  if (request.status !== "peer_pending") return res.status(400).json({ error: "This trade is no longer waiting for student approval." });
  const decision = req.body.status === "approved" ? "approved" : "rejected";
  if (decision === "approved") {
    request.status = "pending";
    request.peerApprovedAt = now();
    request.peerApprovedBy = req.user.id;
  } else {
    request.status = "rejected";
    request.resolvedAt = now();
    request.resolvedBy = req.user.id;
    request.peerRejectedAt = request.resolvedAt;
    request.peerRejectedBy = req.user.id;
  }
  addAuditLog(db, req.user, decision === "approved" ? "trade.peer.approve" : "trade.peer.reject", {
    entityType: "request",
    entityId: request.id,
    targetStudentId: request.studentId,
    amount: request.payload?.amount ?? null,
    summary: `${studentName(db, req.user.studentId)} ${decision === "approved" ? "accepted" : "rejected"} a trade request.`,
    meta: { requestId: request.id, toStudentId: request.payload?.toStudentId || "" }
  });
  await writeDb(db);
  if (decision === "approved") {
    queuePushToUsers(db, staffUserIdsForStudent(db, request.studentId), {
      title: "Trade awaiting staff approval",
      body: `${studentName(db, req.user.studentId)} accepted a student trade.`,
      url: "/approvals",
      tag: `trade-${request.id}`
    });
  } else {
    queuePushToUsers(db, userIdsForStudents(db, [request.studentId]), {
      title: "Trade request rejected",
      body: `${studentName(db, req.user.studentId)} rejected the trade request.`,
      url: "/trade-requests",
      tag: `trade-${request.id}`
    });
  }
  res.json({ request });
});

app.post("/api/requests/:id/cancel", auth, async (req, res) => {
  const db = await readDb();
  const request = db.requests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  const ownsRequest = req.user.role === "student" && request.studentId === req.user.studentId;
  if (!ownsRequest && req.user.role !== "admin") return res.status(403).json({ error: "You can only cancel your own request." });
  if (!["pending", "peer_pending"].includes(request.status)) return res.status(400).json({ error: "Only active requests can be cancelled." });
  const previousStatus = request.status;
  request.status = "cancelled";
  request.resolvedAt = now();
  request.resolvedBy = req.user.id;
  addAuditLog(db, req.user, "request.cancel", {
    entityType: "request",
    entityId: request.id,
    targetStudentId: request.studentId,
    amount: request.payload?.amount ?? null,
    summary: `${request.type} request cancelled.`,
    meta: { type: request.type, previousStatus }
  });
  await writeDb(db);
  res.json({ request });
});

const feedbackCategories = ["Bug Report", "Suggestion", "Question / Need Help"];
const feedbackStatuses = ["New", "Reviewing", "Planned", "Fixed", "Rejected", "Duplicate", "Cancelled"];
const openFeedbackStatuses = ["New", "Reviewing"];

function cleanScreenshot(value = "") {
  const screenshot = String(value || "");
  if (!screenshot) return "";
  if (!screenshot.startsWith("data:image/")) throw new Error("Screenshot must be an image.");
  if (screenshot.length > 680000) throw new Error("Screenshot is too large. Please upload a smaller image.");
  return screenshot;
}

function feedbackFromBody(body, existing = {}) {
  const category = feedbackCategories.includes(body.category) ? body.category : "Suggestion";
  const title = String(body.title || existing.title || "").trim();
  const details = String(body.details || existing.details || "").trim();
  const feature = String(body.feature || existing.feature || "").trim();
  if (!title) throw new Error("Title is required.");
  if (!details) throw new Error("Details are required.");
  return {
    category,
    title: title.slice(0, 120),
    details: details.slice(0, 1400),
    feature: feature.slice(0, 80),
    screenshot: cleanScreenshot(body.screenshot ?? existing.screenshot ?? "")
  };
}

app.post("/api/feedback", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const studentId = req.user.studentId;
  if ((db.feedback || []).some((entry) => entry.studentId === studentId && openFeedbackStatuses.includes(entry.status))) {
    return res.status(409).json({ error: "You already have open feedback. Edit or delete it before sending another." });
  }
  let input;
  try {
    input = feedbackFromBody(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const entry = { id: randomUUID(), studentId, ...input, status: "New", createdAt: now(), updatedAt: now(), statusChangedAt: now(), statusChangedBy: req.user.id };
  db.feedback.push(entry);
  await writeDb(db);
  queuePushToUsers(db, staffUserIdsForStudent(db, studentId), {
    title: "New student feedback",
    body: `${studentName(db, studentId)} submitted ${entry.category.toLowerCase()}.`,
    url: "/feedback",
    tag: `feedback-${entry.id}`
  });
  res.status(201).json({ feedback: entry });
});

app.put("/api/feedback/:id", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const entry = (db.feedback || []).find((item) => item.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Feedback not found." });
  if (entry.studentId !== req.user.studentId) return res.status(403).json({ error: "You can only edit your own feedback." });
  if (entry.status !== "New") return res.status(400).json({ error: "Only new feedback can be edited." });
  let input;
  try {
    input = feedbackFromBody(req.body, entry);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  Object.assign(entry, input, { updatedAt: now() });
  await writeDb(db);
  res.json({ feedback: entry });
});

app.delete("/api/feedback/:id", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const entry = (db.feedback || []).find((item) => item.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Feedback not found." });
  if (entry.studentId !== req.user.studentId) return res.status(403).json({ error: "You can only delete your own feedback." });
  if (entry.status !== "New") return res.status(400).json({ error: "Only new feedback can be deleted." });
  db.feedback = db.feedback.filter((item) => item.id !== entry.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/admin/feedback/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const entry = (db.feedback || []).find((item) => item.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Feedback not found." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(entry.studentId)) return res.status(403).json({ error: "This feedback is outside your assigned class scope." });
  const status = feedbackStatuses.includes(req.body.status) ? req.body.status : "";
  if (!status) return res.status(400).json({ error: "Valid status is required." });
  entry.status = status;
  entry.adminNote = String(req.body.adminNote ?? entry.adminNote ?? "").slice(0, 500);
  entry.updatedAt = now();
  entry.statusChangedAt = now();
  entry.statusChangedBy = req.user.id;
  await writeDb(db);
  queuePushToUsers(db, userIdsForStudents(db, [entry.studentId]), {
    title: "Feedback updated",
    body: `${entry.title} is now marked ${entry.status}.`,
    url: "/feedback",
    tag: `feedback-${entry.id}`
  });
  res.json({ feedback: entry });
});

app.post("/api/admin/requests/:id/resolve", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const request = db.requests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  if (!canUseRequest(db, req.user, request)) return res.status(403).json({ error: "This request is outside your assigned class scope." });
  if (request.status !== "pending") return res.status(400).json({ error: "Only pending requests can be resolved." });
  if (!["approved", "rejected"].includes(req.body.status)) return res.status(400).json({ error: "Choose approved or rejected." });
  request.status = req.body.status;
  request.resolvedAt = now();
  request.resolvedBy = req.user.id;
  if (request.type === "trade" && request.status === "approved") {
    const payload = request.payload || {};
    const amount = Math.abs(Number(payload.amount || 0));
    const { senderId, recipientId } = tradeRequestParticipants(request);
    if (!senderId || !recipientId || senderId === recipientId) return res.status(400).json({ error: "Trade request has invalid students." });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Trade amount must be greater than 0." });
    if (studentCoins(db, senderId) < amount) return res.status(400).json({ error: `${studentName(db, senderId)} does not have enough JCoins for this trade.` });
    const note = request.remarks || "Student trade";
    db.transactions.push(tx(senderId, "trade", -amount, note, request.resolvedAt, req.user.id, { kind: "student-trade", requestId: request.id, toStudentId: recipientId }));
    db.transactions.push(tx(recipientId, "trade", amount, note, request.resolvedAt, req.user.id, { kind: "student-trade", requestId: request.id, fromStudentId: senderId }));
    addAuditLog(db, req.user, "trade.admin.approve", {
      entityType: "request",
      entityId: request.id,
      targetStudentId: recipientId,
      amount,
      summary: `Approved trade: ${studentName(db, senderId)} sent ${amount} JCoins to ${studentName(db, recipientId)}.`,
      meta: { requestId: request.id, senderId, recipientId }
    });
  }
  if (request.type === "purchase" && request.status === "approved") {
    const payload = request.payload || {};
    const priced = activeShopPrice(db, payload.itemId);
    if (!priced) return res.status(400).json({ error: "Shop item no longer exists." });
    const cost = Math.abs(Number(priced.activeCost || 0));
    if (!Number.isFinite(cost)) return res.status(400).json({ error: "Shop item has an invalid cost." });
    if (studentCoins(db, request.studentId) < cost) return res.status(400).json({ error: `${studentName(db, request.studentId)} does not have enough JCoins for this purchase.` });
    const alreadyCharged = db.transactions.some((transaction) => transaction.meta?.kind === "shop-purchase-request" && transaction.meta?.requestId === request.id);
    if (!alreadyCharged && cost > 0) {
      db.transactions.push(tx(request.studentId, "shop", -cost, request.remarks || priced.name || "Shop purchase", request.resolvedAt, req.user.id, {
        kind: "shop-purchase-request",
        requestId: request.id,
        itemId: priced.id,
        itemName: priced.name,
        originalCost: Number(priced.cost || 0),
        discount: Number(priced.discount || 0)
      }));
    }
    addAuditLog(db, req.user, "shop.purchase.approve", {
      entityType: "request",
      entityId: request.id,
      targetStudentId: request.studentId,
      amount: -cost,
      summary: `Approved purchase: ${studentName(db, request.studentId)} bought ${priced.name} for ${cost} JCoins.`,
      meta: { requestId: request.id, itemId: priced.id, cost }
    });
  }
  if (request.type === "registration" && request.status === "approved") {
    const payload = request.payload || {};
    if (db.users.some((user) => user.username.toLowerCase() === String(payload.username || "").toLowerCase()) || db.students.some((student) => student.name.toLowerCase() === String(payload.fullName || "").toLowerCase())) {
      return res.status(409).json({ error: "This student already has an account." });
    }
    if (!db.sections.includes(payload.section)) return res.status(400).json({ error: "Registration section no longer exists." });
    if (!Array.isArray(payload.subjectIds) || payload.subjectIds.some((subjectId) => !db.subjects.some((subject) => subject.id === subjectId))) return res.status(400).json({ error: "One or more registration subjects no longer exist." });
    const student = { id: randomUUID(), name: payload.fullName, section: payload.section, subjectIds: payload.subjectIds, createdAt: now() };
    db.students.push(student);
    assignStudentQuizCodes(db);
    db.users.push({ id: randomUUID(), username: payload.username, passwordHash: payload.passwordHash, role: "student", mustChangePassword: false, studentId: student.id, subjectIds: [], sectionIds: [] });
    request.studentId = student.id;
    delete request.payload.passwordHash;
  }
  if (request.type === "registration" && request.status !== "approved") delete request.payload.passwordHash;
  if (!["trade", "purchase"].includes(request.type) || request.status !== "approved") {
    addAuditLog(db, req.user, "request.resolve", {
      entityType: "request",
      entityId: request.id,
      targetStudentId: request.studentId,
      amount: request.payload?.amount ?? null,
      summary: `${request.type} request marked ${request.status}.`,
      meta: { type: request.type, status: request.status }
    });
  }
  await writeDb(db);
  const requestStudentIds = [request.studentId];
  if (request.type === "trade" && request.payload?.toStudentId) requestStudentIds.push(request.payload.toStudentId);
  queuePushToUsers(db, userIdsForStudents(db, requestStudentIds), {
    title: `${request.type === "trade" ? "Trade" : "Request"} ${request.status}`,
    body: request.type === "trade"
      ? `Your trade request was ${request.status}.`
      : `${request.type} request was ${request.status}.`,
    url: request.type === "trade" ? "/trade-requests" : "/shop",
    tag: `request-${request.id}`
  });
  res.json({ request });
});

if (RUN_SCHEDULED_JOBS) {
  scheduleDailyBackup();
  scheduleStudentAssistantRewards();
}
app.use((err, req, res, _next) => {
  console.error(`API error [${req.requestId || "unknown"}]:`, err);
  if (res.headersSent) return _next(err);
  const status = Number(err.status || err.statusCode || 500);
  if (status >= 400 && status < 500) {
    const error = status === 413 && req.path.includes("/activities/")
      ? "Activity upload is too large. Maximum is 50 MB for one file or 100 MB total for photos."
      : status === 413 ? "Request is too large." : "Invalid request.";
    return res.status(status).json({ error, requestId: req.requestId });
  }
  return res.status(500).json({ error: "Server error. Please try again.", requestId: req.requestId });
});

app.listen(PORT, () => console.log(`JCoins API running at http://localhost:${PORT}`));
