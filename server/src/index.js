import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const dbPath = path.join(dataDir, "db.json");
const JWT_SECRET = process.env.JWT_SECRET || "dev-jcoins-secret-change-before-production";
const PORT = Number(process.env.PORT || 4000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || "jcoins_app_state";
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const byDateDesc = (a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || ""));
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

async function ensureDb() {
  if (supabase) {
    const { data, error } = await supabase.from(SUPABASE_STATE_TABLE).select("state").eq("id", "main").maybeSingle();
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
    await writeFile(dbPath, JSON.stringify(db, null, 2));
  }
}

function supabaseSetupError(error) {
  const message = [
    `Supabase storage error: ${error.message}`,
    `Make sure the ${SUPABASE_STATE_TABLE} table exists. Run server/supabase/schema.sql in Supabase SQL Editor.`
  ].join(" ");
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
    activities: [],
    shopItems: defaultShopItems,
    sales: [],
    requests: [],
    appearanceItems: defaultAppearanceItems,
    appearanceInventory: [],
    appearanceEquipped: {},
    appearanceGifts: []
  };
}

function tx(studentId, type, amount, note, createdAt = now(), createdBy = "system", meta = {}) {
  return { id: randomUUID(), studentId, type, amount: Number(amount || 0), note: note || "", createdAt, createdBy, meta };
}

async function readDb() {
  await ensureDb();
  const db = supabase ? await readSupabaseDb() : JSON.parse(await readFile(dbPath, "utf8"));
  let changed = false;
  const d = defaults();
  db.settings = { ...d.settings, ...(db.settings || {}) };
  db.settings.attendance = { ...d.settings.attendance, ...(db.settings.attendance || {}) };
  db.settings.recitation = { ...d.settings.recitation, ...(db.settings.recitation || {}) };
  db.settings.activities = { ...d.settings.activities, ...(db.settings.activities || {}) };
  db.settings.activities.types ||= d.settings.activities.types;
  db.settings.ranks ||= d.settings.ranks;
  db.subjects ||= [];
  db.sections ||= [...new Set((db.students || []).map((s) => s.section).filter(Boolean))];
  db.attendanceWeeks ||= [];
  db.attendanceWeeks.forEach((week, index) => {
    if (!week.createdAt) {
      week.createdAt = week.dates?.[0] || new Date(Date.now() - (db.attendanceWeeks.length - index) * 1000).toISOString();
      changed = true;
    }
  });
  db.attendanceRecords ||= [];
  db.recitations ||= [];
  db.activities ||= [];
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
  db.students.forEach((s) => {
    s.subjectIds ||= db.subjects.map((sub) => sub.id);
    s.profilePhoto ||= "";
  });
  db.users.forEach((u) => { u.subjectIds ||= []; u.sectionIds ||= []; });
  db.users.forEach((u) => {
    if (u.role === "teacher" && !u.subjectIds.length) {
      u.subjectIds = db.subjects.slice(0, 2).map((subject) => subject.id);
      changed = true;
    }
  });
  if (changed) await writeDb(db);
  return db;
}

async function writeDb(db) {
  if (supabase) {
    const { error } = await supabase
      .from(SUPABASE_STATE_TABLE)
      .upsert({ id: "main", state: db, updated_at: now() });
    if (error) throw supabaseSetupError(error);
    return;
  }
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

async function readSupabaseDb() {
  const { data, error } = await supabase.from(SUPABASE_STATE_TABLE).select("state").eq("id", "main").single();
  if (error) throw supabaseSetupError(error);
  return data.state;
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword, studentId: user.studentId, subjectIds: user.subjectIds || [], sectionIds: user.sectionIds || [] };
}

function sign(user) {
  return jwt.sign(publicUser(user), JWT_SECRET, { expiresIn: "12h" });
}

function auth(req, res, next) {
  try {
    const token = String(req.headers.authorization || "").replace("Bearer ", "");
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });
}

function scopeStudents(db, user) {
  const hydrated = hydrateStudents(db);
  if (user.role === "admin" || user.role === "display") return hydrated;
  if (user.role === "student") return hydrated.filter((s) => s.id === user.studentId);
  const subjects = new Set(user.subjectIds || []);
  const sections = new Set(user.sectionIds || []);
  return hydrated.filter((s) => (s.subjectIds || []).some((id) => subjects.has(id)) && (!sections.size || sections.has(s.section)));
}

function scopedStudentIds(db, user) {
  return new Set(scopeStudents(db, user).map((student) => student.id));
}

function canUseSubject(user, subjectId) {
  return user.role === "admin" || (user.subjectIds || []).includes(subjectId);
}

function subjectName(db, id) {
  return db.subjects.find((s) => s.id === id)?.name || "Unknown";
}

function studentName(db, id) {
  return db.students.find((s) => s.id === id)?.name || "Unknown";
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
  return db.students.map((student) => {
    const currentJCoins = studentCoins(db, student.id);
    const account = db.users.find((user) => user.role === "student" && user.studentId === student.id);
    return { ...student, userId: account?.id || "", username: account?.username || "", currentJCoins, subjectNames: (student.subjectIds || []).map((id) => subjectName(db, id)), appearance: equippedAppearance(db, student.id), ...rankFor(currentJCoins, db.settings.ranks) };
  }).sort((a, b) => b.currentJCoins - a.currentJCoins);
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

function daysLate(deadline, submittedDate) {
  if (!deadline || !submittedDate) return 0;
  const toDay = (value) => {
    const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const diff = Math.floor((toDay(submittedDate) - toDay(deadline)) / 86400000);
  return Math.max(0, diff);
}

function hydrateActivities(db) {
  return db.activities.map((a) => {
    const base = activityBase(db, a.type);
    const submissions = a.submissions || [];
    const rows = db.students.filter((s) => (s.subjectIds || []).includes(a.subjectId)).map((s) => {
      const sub = submissions.find((x) => x.studentId === s.id) || {};
      const late = sub.submitted ? daysLate(a.deadline, sub.dateSubmitted) : 0;
      const earned = sub.submitted ? Math.max(0, base - late * db.settings.activities.latePenaltyPerDay) : 0;
      return { studentId: s.id, studentName: s.name, submitted: !!sub.submitted, dateSubmitted: sub.dateSubmitted || "", daysLate: late, earned, remarks: sub.remarks || "" };
    });
    return { ...a, subjectName: subjectName(db, a.subjectId), basePoints: base, tracker: `${rows.filter((r) => r.submitted).length}/${rows.length}`, rows };
  });
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

function attendanceBonus(db, studentId, week) {
  const dates = week.dates || [];
  if (!dates.length) return false;
  return dates.every((date) => db.attendanceRecords.find((r) => r.weekId === week.id && r.studentId === studentId && r.date === date)?.status === "check");
}

function recitationBonus(db, studentId, week) {
  const dates = week.dates || [];
  if (!dates.length) return false;
  return dates.every((date) => db.recitations.some((r) => r.subjectId === week.subjectId && r.studentId === studentId && r.date === date));
}

function syncAttendanceTransaction(db, record, week, userId = "system") {
  const existing = db.transactions.find((t) => t.meta?.kind === "attendance" && t.meta.recordId === record.id);
  const amount = record.status === "check" ? db.settings.attendance.onTimePoints : record.status === "late" ? db.settings.attendance.latePoints : 0;
  if (existing) existing.amount = amount;
  else if (amount) db.transactions.push(tx(record.studentId, "attendance", amount, `${subjectName(db, week?.subjectId)} attendance ${record.date}`, now(), userId, { kind: "attendance", recordId: record.id, weekId: record.weekId, date: record.date }));
}

function syncWeekBonus(db, studentId, week, kind, earned, amount, userId = "system") {
  const existing = db.transactions.find((t) => t.meta?.kind === kind && t.meta.weekId === week.id && t.studentId === studentId);
  if (earned) {
    if (existing) existing.amount = amount;
    else db.transactions.push(tx(studentId, kind === "attendance-week-bonus" ? "attendance_bonus" : "recitation_bonus", amount, `${subjectName(db, week.subjectId)} ${week.title} bonus`, now(), userId, { kind, weekId: week.id, subjectId: week.subjectId }));
  } else if (existing) {
    existing.amount = 0;
  }
}

function syncWeekBonuses(db, week, userId = "system") {
  const students = db.students.filter((student) => (student.subjectIds || []).includes(week.subjectId));
  students.forEach((student) => {
    syncWeekBonus(db, student.id, week, "attendance-week-bonus", attendanceBonus(db, student.id, week), Number(db.settings.attendance.weeklyBonus || 0), userId);
    syncWeekBonus(db, student.id, week, "recitation-week-bonus", recitationBonus(db, student.id, week), Number(db.settings.recitation.weeklyBonus || 0), userId);
  });
}

function filteredOverview(db, user) {
  const students = scopeStudents(db, user);
  const studentIds = new Set(students.map((s) => s.id));
  const subjectIds = user.role === "teacher" ? new Set(user.subjectIds || []) : null;
  const sectionIds = user.role === "teacher" ? new Set(user.sectionIds || []) : null;
  const activities = hydrateActivities(db).filter((a) => !subjectIds || subjectIds.has(a.subjectId)).map((activity) => sectionIds?.size ? { ...activity, rows: activity.rows.filter((row) => studentIds.has(row.studentId)), tracker: `${activity.rows.filter((row) => studentIds.has(row.studentId) && row.submitted).length}/${activity.rows.filter((row) => studentIds.has(row.studentId)).length}` } : activity);
  const transactions = db.transactions.filter((t) => studentIds.has(t.studentId)).map((t) => ({ ...t, studentName: studentName(db, t.studentId) })).sort(byDateDesc);
  return {
    user,
    settings: db.settings,
    subjects: user.role === "teacher" ? db.subjects.filter((subject) => subjectIds.has(subject.id)) : db.subjects,
    sections: db.sections,
    students,
    users: user.role === "admin" ? db.users.map((u) => userWithStudent(u, db)) : [],
    transactions,
    attendanceWeeks: db.attendanceWeeks.filter((w) => !subjectIds || subjectIds.has(w.subjectId)).map((w) => ({ ...w, subjectName: subjectName(db, w.subjectId) })),
    attendanceRecords: db.attendanceRecords.filter((r) => studentIds.has(r.studentId)),
    recitations: db.recitations.filter((r) => studentIds.has(r.studentId)).map((r) => ({ ...r, studentName: studentName(db, r.studentId), subjectName: subjectName(db, r.subjectId) })).sort(byDateDesc),
    activities,
    shopItems: db.shopItems.map((item) => activeShopPrice(db, item.id)),
    sales: db.sales,
    appearanceItems: db.appearanceItems,
    appearanceGifts: user.role === "admin" ? appearanceGiftRows(db) : [],
    requests: db.requests.filter((r) => user.role === "admin" || !r.studentId || studentIds.has(r.studentId)).sort(byDateDesc)
  };
}

app.get("/api/health", (req, res) => res.json({ ok: true, storage: supabase ? "supabase" : "file" }));

app.post("/api/auth/login", async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => u.username.toLowerCase() === String(req.body.username || "").toLowerCase());
  if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash))) return res.status(401).json({ error: "Invalid username or password" });
  res.json({ token: sign(user), user: publicUser(user) });
});

app.post("/api/auth/change-password", auth, async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user || !(await bcrypt.compare(String(req.body.currentPassword || ""), user.passwordHash))) return res.status(401).json({ error: "Current password is wrong." });
  if (String(req.body.newPassword || "").length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  user.passwordHash = await bcrypt.hash(String(req.body.newPassword), 10);
  user.mustChangePassword = false;
  await writeDb(db);
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get("/api/leaderboard", async (req, res) => {
  const db = await readDb();
  res.json({ students: hideProfilePhotos(hydrateStudents(db)), subjects: db.subjects });
});

app.get("/api/me", auth, async (req, res) => {
  const db = await readDb();
  res.json(filteredOverview(db, req.user));
});

app.get("/api/student/me", auth, requireRole("student"), async (req, res) => {
  const db = await readDb();
  const overview = filteredOverview(db, req.user);
  const student = overview.students[0];
  const allStudents = hideProfilePhotos(hydrateStudents(db));
  const inventory = db.appearanceInventory
    .filter((entry) => entry.studentId === student.id)
    .map((entry) => ({ ...entry, item: appearanceItem(db, entry.itemId) }))
    .filter((entry) => entry.item);
  const gifts = appearanceGiftRows(db, student.id);
  const weeks = db.attendanceWeeks.filter((w) => (student.subjectIds || []).includes(w.subjectId)).map((w) => ({
    ...w,
    subjectName: subjectName(db, w.subjectId),
    attendanceBonus: attendanceBonus(db, student.id, w),
    recitationBonus: recitationBonus(db, student.id, w)
  }));
  res.json({ ...overview, students: allStudents, student, appearanceInventory: inventory, appearanceGifts: gifts, weeks });
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
  const db = await readDb();
  const overview = filteredOverview(db, req.user);
  res.json({ ...overview, students: hideProfilePhotos(overview.students) });
});

app.post("/api/admin/subjects", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const subject = { id: randomUUID(), name: String(req.body.name || "New Subject") };
  db.subjects.push(subject);
  await writeDb(db);
  res.status(201).json({ subject });
});

app.put("/api/admin/subjects/:id", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const subject = db.subjects.find((s) => s.id === req.params.id);
  if (!subject) return res.status(404).json({ error: "Subject not found." });
  subject.name = String(req.body.name || subject.name);
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
  db.subjects = db.subjects.filter((s) => s.id !== subjectId);
  db.students.forEach((student) => { student.subjectIds = (student.subjectIds || []).filter((id) => id !== subjectId); });
  db.users.forEach((user) => { user.subjectIds = (user.subjectIds || []).filter((id) => id !== subjectId); });
  db.attendanceWeeks = db.attendanceWeeks.filter((week) => week.subjectId !== subjectId);
  db.attendanceRecords = db.attendanceRecords.filter((record) => !removedWeekIds.has(record.weekId));
  db.recitations = db.recitations.filter((recitation) => recitation.subjectId !== subjectId);
  db.activities = db.activities.filter((activity) => activity.subjectId !== subjectId);
  db.transactions = db.transactions.filter((transaction) => {
    const meta = transaction.meta || {};
    return meta.subjectId !== subjectId
      && !removedWeekIds.has(meta.weekId)
      && !removedRecordIds.has(meta.recordId)
      && !removedRecitationIds.has(meta.recitationId)
      && !removedActivityIds.has(meta.activityId);
  });
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/sections", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Section name is required." });
  if (!db.sections.includes(name)) db.sections.push(name);
  db.sections.sort();
  await writeDb(db);
  res.status(201).json({ sections: db.sections });
});

app.delete("/api/admin/sections/:name", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const name = decodeURIComponent(req.params.name);
  if (!db.sections.includes(name)) return res.status(404).json({ error: "Section not found." });
  db.sections = db.sections.filter((section) => section !== name);
  db.students.forEach((student) => {
    if (student.section === name) student.section = "";
  });
  await writeDb(db);
  res.json({ sections: db.sections });
});

app.post("/api/admin/students", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const { name, section, username, tempPassword, startingJCoins, subjectIds = [] } = req.body;
  if (!name || !username || !tempPassword) return res.status(400).json({ error: "Name, username, and temporary password are required." });
  if (db.users.some((u) => u.username.toLowerCase() === String(username).toLowerCase())) return res.status(409).json({ error: "Username already exists." });
  if (req.user.role === "teacher") {
    const allowedSubjects = new Set(req.user.subjectIds || []);
    const allowedSections = new Set(req.user.sectionIds || []);
    if (allowedSections.size && !allowedSections.has(section || "")) return res.status(403).json({ error: "This section is outside your assigned class scope." });
    if (!subjectIds.length || subjectIds.some((id) => !allowedSubjects.has(id))) return res.status(403).json({ error: "One or more subjects are outside your assigned class scope." });
  }
  const student = { id: randomUUID(), name, section: section || "", subjectIds, createdAt: now() };
  if (student.section && !db.sections.includes(student.section)) db.sections.push(student.section);
  db.students.push(student);
  db.users.push({ id: randomUUID(), username, passwordHash: await bcrypt.hash(String(tempPassword), 10), role: "student", mustChangePassword: true, studentId: student.id, subjectIds: [], sectionIds: [] });
  db.transactions.push(tx(student.id, "starting", Number(startingJCoins || 0), "Starting balance", now(), req.user.id));
  await writeDb(db);
  res.status(201).json({ student });
});

app.post("/api/admin/students/bulk", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const rows = Array.isArray(req.body.students) ? req.body.students : [];
  if (!rows.length) return res.status(400).json({ error: "Upload at least one student row." });
  if (rows.length > 300) return res.status(400).json({ error: "Import up to 300 students at a time." });

  const existingUsernames = new Set(db.users.map((user) => user.username.toLowerCase()));
  const incomingUsernames = new Set();
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
      if (!tempPassword) throw new Error(`Row ${rowNumber}: temporary password is required.`);
      if (existingUsernames.has(username.toLowerCase()) || incomingUsernames.has(username.toLowerCase())) throw new Error(`Row ${rowNumber}: username "${username}" is already used.`);
      if (!Number.isFinite(startingJCoins)) throw new Error(`Row ${rowNumber}: starting JCoins must be a number.`);
      if (!subjectIds.length || subjectIds.some((id) => !id)) throw new Error(`Row ${rowNumber}: enter valid subject names or IDs.`);
      if (allowedSections?.size && !allowedSections.has(section)) throw new Error(`Row ${rowNumber}: section "${section}" is outside your assigned class scope.`);
      if (allowedSubjects && subjectIds.some((id) => !allowedSubjects.has(id))) throw new Error(`Row ${rowNumber}: one or more subjects are outside your assigned class scope.`);
      incomingUsernames.add(username.toLowerCase());
      return { name, username, tempPassword, section, startingJCoins, subjectIds };
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const created = [];
  for (const item of prepared) {
    const student = { id: randomUUID(), name: item.name, section: item.section, subjectIds: item.subjectIds, createdAt: now() };
    if (student.section && !db.sections.includes(student.section)) db.sections.push(student.section);
    db.students.push(student);
    db.users.push({ id: randomUUID(), username: item.username, passwordHash: await bcrypt.hash(item.tempPassword, 10), role: "student", mustChangePassword: true, studentId: student.id, subjectIds: [], sectionIds: [] });
    db.transactions.push(tx(student.id, "starting", item.startingJCoins, "Starting balance", now(), req.user.id));
    created.push({ id: student.id, name: student.name, username: item.username });
  }
  db.sections.sort();
  await writeDb(db);
  res.status(201).json({ createdCount: created.length, created });
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
  student.name = String(req.body.name || student.name);
  student.section = String(req.body.section ?? student.section ?? "");
  if (student.section && !db.sections.includes(student.section)) db.sections.push(student.section);
  student.subjectIds = Array.isArray(req.body.subjectIds) ? req.body.subjectIds : student.subjectIds;
  await writeDb(db);
  res.json({ student });
});

app.get("/api/admin/students/:id/profile-photo", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(student.id)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  res.json({ profilePhoto: student.profilePhoto || "" });
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
  db.students = db.students.filter((s) => s.id !== student.id);
  db.users = db.users.filter((u) => u.studentId !== student.id);
  db.transactions = db.transactions.filter((t) => t.studentId !== student.id);
  db.attendanceRecords = db.attendanceRecords.filter((r) => r.studentId !== student.id);
  db.recitations = db.recitations.filter((r) => r.studentId !== student.id);
  db.appearanceInventory = (db.appearanceInventory || []).filter((entry) => entry.studentId !== student.id && entry.fromStudentId !== student.id);
  db.appearanceGifts = (db.appearanceGifts || []).filter((gift) => gift.fromStudentId !== student.id && gift.toStudentId !== student.id);
  if (db.appearanceEquipped) delete db.appearanceEquipped[student.id];
  db.activities.forEach((activity) => {
    activity.submissions = (activity.submissions || []).filter((submission) => submission.studentId !== student.id);
  });
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/attendance/weeks", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const week = { id: randomUUID(), subjectId: req.body.subjectId, title: req.body.title || `Week ${db.attendanceWeeks.length + 1}`, dates: [], createdAt: now() };
  db.attendanceWeeks.push(week);
  await writeDb(db);
  res.status(201).json({ week });
});

app.post("/api/admin/attendance/weeks/:id/dates", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const week = db.attendanceWeeks.find((w) => w.id === req.params.id);
  if (!week) return res.status(404).json({ error: "Week not found." });
  if (!canUseSubject(req.user, week.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
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
  if (!canUseSubject(req.user, week.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
  const date = decodeURIComponent(req.params.date);
  const removedRecordIds = new Set(db.attendanceRecords.filter((r) => r.weekId === week.id && r.date === date).map((r) => r.id));
  week.dates = (week.dates || []).filter((d) => d !== date);
  db.attendanceRecords = db.attendanceRecords.filter((r) => !(r.weekId === week.id && r.date === date));
  db.transactions = db.transactions.filter((t) => !(t.meta?.kind === "attendance" && removedRecordIds.has(t.meta.recordId)));
  syncWeekBonuses(db, week, req.user.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.put("/api/admin/attendance/records", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const { weekId, date, studentId, status } = req.body;
  const allowedStudentIds = new Set(scopeStudents(db, req.user).map((student) => student.id));
  if (!allowedStudentIds.has(studentId)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  let record = db.attendanceRecords.find((r) => r.weekId === weekId && r.date === date && r.studentId === studentId);
  if (!record) {
    record = { id: randomUUID(), weekId, date, studentId, status: "" };
    db.attendanceRecords.push(record);
  }
  record.status = status;
  const week = db.attendanceWeeks.find((w) => w.id === weekId);
  syncAttendanceTransaction(db, record, week, req.user.id);
  if (week) syncWeekBonuses(db, week, req.user.id);
  await writeDb(db);
  res.json({ record });
});

app.post("/api/admin/attendance/check-all", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const week = db.attendanceWeeks.find((w) => w.id === req.body.weekId);
  if (!week) return res.status(404).json({ error: "Week not found." });
  const students = scopeStudents(db, req.user).filter((s) => (s.subjectIds || []).includes(week.subjectId));
  students.forEach((student) => {
    let record = db.attendanceRecords.find((r) => r.weekId === week.id && r.date === req.body.date && r.studentId === student.id);
    if (!record) {
      record = { id: randomUUID(), weekId: week.id, date: req.body.date, studentId: student.id, status: "check" };
      db.attendanceRecords.push(record);
    }
    record.status = req.body.status ?? "check";
    syncAttendanceTransaction(db, record, week, req.user.id);
  });
  syncWeekBonuses(db, week, req.user.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/recitations", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(req.body.studentId)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  if (!canUseSubject(req.user, req.body.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
  const student = db.students.find((s) => s.id === req.body.studentId);
  if (!student || !(student.subjectIds || []).includes(req.body.subjectId)) return res.status(400).json({ error: "Student is not enrolled in this subject." });
  const amount = Math.min(Number(req.body.amount || 1), db.settings.recitation.maxPoints);
  const recitation = { id: randomUUID(), studentId: req.body.studentId, subjectId: req.body.subjectId, date: req.body.date || today(), amount, remarks: req.body.remarks || "", createdAt: now(), createdBy: req.user.id };
  db.recitations.push(recitation);
  db.transactions.push(tx(recitation.studentId, "recitation", amount, `Recitation: ${recitation.remarks || subjectName(db, recitation.subjectId)}`, recitation.createdAt, req.user.id, { kind: "recitation", recitationId: recitation.id, subjectId: recitation.subjectId }));
  db.attendanceWeeks.filter((week) => week.subjectId === recitation.subjectId && (week.dates || []).includes(recitation.date)).forEach((week) => syncWeekBonuses(db, week, req.user.id));
  await writeDb(db);
  res.status(201).json({ recitation });
});

app.post("/api/admin/activities", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  if (!canUseSubject(req.user, req.body.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
  const activity = { id: randomUUID(), title: req.body.title || "Activity", subjectId: req.body.subjectId, dateCreated: req.body.dateCreated || today(), deadline: req.body.deadline || today(), type: req.body.type || db.settings.activities.types[0]?.name || "Custom", remarks: req.body.remarks || "", submissions: [], createdAt: now(), createdBy: req.user.id };
  db.activities.push(activity);
  await writeDb(db);
  res.status(201).json({ activity });
});

app.put("/api/admin/activities/:id/submissions", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = db.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Activity not found." });
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(req.body.studentId) || !canUseSubject(req.user, activity.subjectId)) return res.status(403).json({ error: "This activity submission is outside your assigned class scope." });
  let sub = activity.submissions.find((s) => s.studentId === req.body.studentId);
  if (!sub) {
    sub = { studentId: req.body.studentId };
    activity.submissions.push(sub);
  }
  sub.submitted = !!req.body.submitted;
  sub.dateSubmitted = req.body.dateSubmitted || (sub.submitted ? today() : "");
  sub.remarks = req.body.remarks || "";
  const hydrated = hydrateActivities(db).find((a) => a.id === activity.id);
  const row = hydrated.rows.find((r) => r.studentId === sub.studentId);
  const existing = db.transactions.find((t) => t.meta?.kind === "activity" && t.meta.activityId === activity.id && t.studentId === sub.studentId);
  if (existing) existing.amount = row.earned;
  else if (row.earned) db.transactions.push(tx(sub.studentId, "activity", row.earned, activity.title, now(), req.user.id, { kind: "activity", activityId: activity.id, subjectId: activity.subjectId }));
  await writeDb(db);
  res.json({ submission: sub });
});

app.post("/api/admin/transactions", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const allowedStudentIds = scopedStudentIds(db, req.user);
  if (!allowedStudentIds.has(req.body.studentId)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
  const type = req.body.type || "adjustment";
  if (type === "trade") {
    if (!allowedStudentIds.has(req.body.fromStudentId)) return res.status(403).json({ error: "The trade source student is outside your assigned class scope." });
    const amount = Math.abs(Number(req.body.amount || 0));
    db.transactions.push(tx(req.body.fromStudentId, "trade", -amount, req.body.remarks || "Trade", now(), req.user.id, { toStudentId: req.body.studentId }));
    db.transactions.push(tx(req.body.studentId, "trade", amount, req.body.remarks || "Trade", now(), req.user.id, { fromStudentId: req.body.fromStudentId }));
  } else if (type === "shop") {
    const priced = activeShopPrice(db, req.body.itemId);
    db.transactions.push(tx(req.body.studentId, "shop", -Math.abs(priced?.activeCost || req.body.amount || 0), req.body.remarks || priced?.name || "Shop", now(), req.user.id, { itemId: req.body.itemId }));
  } else {
    const sign = type === "penalty" ? -1 : 1;
    db.transactions.push(tx(req.body.studentId, type, sign * Number(req.body.amount || 0), req.body.remarks || type, now(), req.user.id));
  }
  await writeDb(db);
  res.status(201).json({ ok: true });
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
  await writeDb(db);
  res.json({ settings: db.settings });
});

app.put("/api/admin/users/:id", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  user.role = req.body.role || user.role;
  user.subjectIds = Array.isArray(req.body.subjectIds) ? req.body.subjectIds : user.subjectIds;
  user.sectionIds = Array.isArray(req.body.sectionIds) ? req.body.sectionIds : user.sectionIds;
  if (typeof req.body.mustChangePassword === "boolean") user.mustChangePassword = req.body.mustChangePassword;
  await writeDb(db);
  res.json({ user: userWithStudent(user, db) });
});

app.post("/api/admin/users", auth, requireRole("admin"), async (req, res) => {
  const db = await readDb();
  const username = String(req.body.username || "").trim();
  const tempPassword = String(req.body.tempPassword || "teacher123!");
  const role = ["admin", "teacher", "display"].includes(req.body.role) ? req.body.role : "teacher";
  if (!username) return res.status(400).json({ error: "Username is required." });
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: "Username already exists." });
  const user = {
    id: randomUUID(),
    username,
    passwordHash: await bcrypt.hash(tempPassword, 10),
    role,
    mustChangePassword: true,
    studentId: null,
    subjectIds: Array.isArray(req.body.subjectIds) ? req.body.subjectIds : [],
    sectionIds: Array.isArray(req.body.sectionIds) ? req.body.sectionIds : []
  };
  db.users.push(user);
  await writeDb(db);
  res.status(201).json({ user: userWithStudent(user, db) });
});

app.post("/api/admin/users/:id/reset-password", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (req.user.role === "teacher" && user.role !== "student") return res.status(403).json({ error: "Teachers can only reset student passwords." });
  user.passwordHash = await bcrypt.hash(String(req.body.tempPassword || "temp123"), 10);
  user.mustChangePassword = true;
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
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/requests", auth, async (req, res) => {
  const db = await readDb();
  const request = { id: randomUUID(), type: req.body.type, status: "pending", studentId: req.user.studentId || req.body.studentId, payload: req.body.payload || {}, remarks: req.body.remarks || "", createdAt: now(), createdBy: req.user.id };
  db.requests.push(request);
  await writeDb(db);
  res.status(201).json({ request });
});

app.post("/api/admin/requests/:id/resolve", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const request = db.requests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  request.status = req.body.status || "approved";
  request.resolvedAt = now();
  request.resolvedBy = req.user.id;
  await writeDb(db);
  res.json({ request });
});

app.listen(PORT, () => console.log(`JCoins API running at http://localhost:${PORT}`));
