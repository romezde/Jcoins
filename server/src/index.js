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
const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const reminderOptions = [0, 5, 10, 15, 30, 60];
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
    responses: Array.isArray(system?.responses) ? system.responses : []
  };
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
    return {
      ...base,
      response: response ? {
        submittedAt: response.submittedAt,
        revealed: !!response.revealed,
        revealedAt: response.revealedAt || "",
        assignedGuild: response.revealed ? publicGuild(response.assignedGuildId) : null
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
      wheel: { spinSeconds: 3.3 },
      guild: { revealSeconds: 10 },
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
    feedback: [],
    schedules: [],
    appearanceItems: defaultAppearanceItems,
    appearanceInventory: [],
    appearanceEquipped: {},
    appearanceGifts: [],
    guildSystem: defaultGuildSystem()
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
  db.settings.wheel = { ...d.settings.wheel, ...(db.settings.wheel || {}) };
  db.settings.guild = { ...d.settings.guild, ...(db.settings.guild || {}) };
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
  db.feedback ||= [];
  db.schedules ||= [];
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
}

function purgeOrphanStudentUsers(db) {
  const studentIds = new Set((db.students || []).map((student) => student.id));
  const before = db.users.length;
  db.users = db.users.filter((user) => user.role !== "student" || !user.studentId || studentIds.has(user.studentId));
  return db.users.length !== before;
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

function requestRows(db, requests) {
  return requests.map((request) => {
    const payload = request.payload || {};
    return {
      ...request,
      studentName: studentName(db, request.studentId),
      fromStudentName: studentName(db, request.studentId),
      itemName: payload.itemId ? activeShopPrice(db, payload.itemId)?.name || "Unknown Item" : "",
      toStudentName: payload.toStudentId ? studentName(db, payload.toStudentId) : ""
    };
  });
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

function removeAttendanceWeek(db, weekId) {
  const removedRecordIds = new Set(db.attendanceRecords.filter((record) => record.weekId === weekId).map((record) => record.id));
  db.attendanceWeeks = db.attendanceWeeks.filter((week) => week.id !== weekId);
  db.attendanceRecords = db.attendanceRecords.filter((record) => record.weekId !== weekId);
  db.transactions = db.transactions.filter((transaction) => {
    const meta = transaction.meta || {};
    return meta.weekId !== weekId && !removedRecordIds.has(meta.recordId);
  });
}

function filteredOverview(db, user) {
  const students = scopeStudents(db, user);
  const studentIds = new Set(students.map((s) => s.id));
  const subjectIds = user.role === "teacher" ? new Set(user.subjectIds || []) : null;
  const sectionIds = user.role === "teacher" ? new Set(user.sectionIds || []) : null;
  const visibleScheduleRows = db.schedules.filter((schedule) => {
    if (user.role === "admin") return true;
    if (user.role === "teacher") {
      return (!subjectIds || subjectIds.has(schedule.subjectId)) && (!sectionIds?.size || sectionIds.has(schedule.section));
    }
    if (user.role === "student") {
      const student = db.students.find((s) => s.id === user.studentId);
      return !!student && student.section === schedule.section && (student.subjectIds || []).includes(schedule.subjectId);
    }
    return false;
  });
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
    requests: requestRows(db, db.requests.filter((r) => user.role === "admin" || !r.studentId || studentIds.has(r.studentId)).sort(byDateDesc)),
    feedback: feedbackRows(db, (db.feedback || []).filter((entry) => user.role === "admin" || studentIds.has(entry.studentId))),
    schedules: scheduleRows(db, visibleScheduleRows),
    guildSystem: guildSystemView(db, user)
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
  await writeDb(db);
  res.json({ guildSystem: guildSystemView(db, req.user) });
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
  await writeDb(db);
  res.json({ studentId: student.id, studentName: student.name, guild: publicGuild(guild.id) });
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
  removedWeekIds.forEach((weekId) => removeAttendanceWeek(db, weekId));
  db.schedules = (db.schedules || []).filter((schedule) => schedule.subjectId !== subjectId);
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
  db.schedules = (db.schedules || []).filter((schedule) => schedule.section !== name);
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
  await writeDb(db);
  res.json({ schedule });
});

app.delete("/api/admin/schedules/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const schedule = db.schedules.find((item) => item.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: "Schedule not found." });
  if (!canUseSubject(req.user, schedule.subjectId) || !canUseSection(req.user, schedule.section)) return res.status(403).json({ error: "This schedule is outside your assigned scope." });
  db.schedules = db.schedules.filter((item) => item.id !== schedule.id);
  await writeDb(db);
  res.json({ ok: true });
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
  const hydrated = hydrateStudents(db).find((item) => item.id === student.id) || student;
  const transactions = db.transactions
    .filter((transaction) => transaction.studentId === student.id)
    .map((transaction) => ({ ...transaction, studentName: student.name }))
    .sort(byDateDesc)
    .slice(0, 20);
  const weeks = db.attendanceWeeks
    .filter((week) => (student.subjectIds || []).includes(week.subjectId))
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
  const firstDate = String(req.body.firstDate || "").slice(0, 10);
  const week = { id: randomUUID(), subjectId: req.body.subjectId, title: req.body.title || `Week ${db.attendanceWeeks.length + 1}`, dates: firstDate ? [firstDate] : [], createdAt: now() };
  week.dates.sort();
  db.attendanceWeeks.push(week);
  await writeDb(db);
  res.status(201).json({ week });
});

app.delete("/api/admin/attendance/weeks/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const week = db.attendanceWeeks.find((w) => w.id === req.params.id);
  if (!week) return res.status(404).json({ error: "Week not found." });
  if (!canUseSubject(req.user, week.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
  removeAttendanceWeek(db, week.id);
  await writeDb(db);
  res.json({ ok: true });
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
  if (!canUseSubject(req.user, req.body.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
  const studentIds = [...new Set((Array.isArray(req.body.studentIds) && req.body.studentIds.length ? req.body.studentIds : [req.body.studentId]).filter(Boolean))];
  if (!studentIds.length) return res.status(400).json({ error: "Choose at least one student." });
  if (studentIds.some((studentId) => !allowedStudentIds.has(studentId))) return res.status(403).json({ error: "One or more students are outside your assigned class scope." });
  const students = studentIds.map((studentId) => db.students.find((s) => s.id === studentId));
  if (students.some((student) => !student || !(student.subjectIds || []).includes(req.body.subjectId))) return res.status(400).json({ error: "One or more students are not enrolled in this subject." });
  const amount = Math.min(Number(req.body.amount || 1), db.settings.recitation.maxPoints);
  const createdAt = now();
  const recitations = students.map((student) => ({
    id: randomUUID(),
    studentId: student.id,
    subjectId: req.body.subjectId,
    date: req.body.date || today(),
    amount,
    remarks: req.body.remarks || "",
    createdAt,
    createdBy: req.user.id
  }));
  db.recitations.push(...recitations);
  recitations.forEach((recitation) => {
    db.transactions.push(tx(recitation.studentId, "recitation", amount, `Recitation: ${recitation.remarks || subjectName(db, recitation.subjectId)}`, recitation.createdAt, req.user.id, { kind: "recitation", recitationId: recitation.id, subjectId: recitation.subjectId }));
  });
  db.attendanceWeeks.filter((week) => week.subjectId === req.body.subjectId && (week.dates || []).includes(req.body.date || today())).forEach((week) => {
    students.forEach((student) => syncWeekBonus(db, student.id, week, "recitation-week-bonus", recitationBonus(db, student.id, week), Number(db.settings.recitation.weeklyBonus || 0), req.user.id));
  });
  await writeDb(db);
  res.status(201).json({ createdCount: recitations.length, recitations });
});

app.post("/api/admin/activities", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  if (!canUseSubject(req.user, req.body.subjectId)) return res.status(403).json({ error: "This subject is outside your assigned class scope." });
  const activity = { id: randomUUID(), title: req.body.title || "Activity", subjectId: req.body.subjectId, dateCreated: req.body.dateCreated || today(), deadline: req.body.deadline || today(), type: req.body.type || db.settings.activities.types[0]?.name || "Custom", remarks: req.body.remarks || "", submissions: [], createdAt: now(), createdBy: req.user.id };
  db.activities.push(activity);
  await writeDb(db);
  res.status(201).json({ activity });
});

app.delete("/api/admin/activities/:id", auth, requireRole("admin", "teacher"), async (req, res) => {
  const db = await readDb();
  const activity = db.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: "Activity not found." });
  if (!canUseSubject(req.user, activity.subjectId)) return res.status(403).json({ error: "This activity is outside your assigned class scope." });
  db.activities = db.activities.filter((a) => a.id !== activity.id);
  db.transactions = db.transactions.filter((transaction) => !(transaction.meta?.kind === "activity" && transaction.meta.activityId === activity.id));
  await writeDb(db);
  res.json({ ok: true });
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
  const type = req.body.type || "adjustment";
  if (type === "trade") {
    if (!allowedStudentIds.has(req.body.studentId)) return res.status(403).json({ error: "This student is outside your assigned class scope." });
    if (!allowedStudentIds.has(req.body.fromStudentId)) return res.status(403).json({ error: "The trade source student is outside your assigned class scope." });
    const amount = Math.abs(Number(req.body.amount || 0));
    db.transactions.push(tx(req.body.fromStudentId, "trade", -amount, req.body.remarks || "Trade", now(), req.user.id, { toStudentId: req.body.studentId }));
    db.transactions.push(tx(req.body.studentId, "trade", amount, req.body.remarks || "Trade", now(), req.user.id, { fromStudentId: req.body.fromStudentId }));
  } else {
    const targetIds = [...new Set((Array.isArray(req.body.studentIds) && req.body.studentIds.length ? req.body.studentIds : [req.body.studentId]).filter(Boolean))];
    if (!targetIds.length) return res.status(400).json({ error: "Choose at least one student." });
    if (targetIds.some((studentId) => !allowedStudentIds.has(studentId))) return res.status(403).json({ error: "One or more students are outside your assigned class scope." });
    if (type === "shop") {
      const priced = activeShopPrice(db, req.body.itemId);
      targetIds.forEach((studentId) => {
        db.transactions.push(tx(studentId, "shop", -Math.abs(priced?.activeCost || req.body.amount || 0), req.body.remarks || priced?.name || "Shop", now(), req.user.id, { itemId: req.body.itemId }));
      });
    } else {
      const sign = type === "penalty" ? -1 : 1;
      const amount = sign * Number(req.body.amount || 0);
      targetIds.forEach((studentId) => {
        db.transactions.push(tx(studentId, type, amount, req.body.remarks || type, now(), req.user.id));
      });
    }
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
  const type = String(req.body.type || "").trim();
  const studentId = req.user.studentId || req.body.studentId;
  if (!type) return res.status(400).json({ error: "Request type is required." });
  if (!studentId || !db.students.some((student) => student.id === studentId)) return res.status(400).json({ error: "Valid student is required." });
  if (req.user.role === "student" && db.requests.some((request) => request.studentId === studentId && request.type === type && request.status === "pending")) {
    return res.status(409).json({ error: `You already have a pending ${type} request. Cancel it first before making another.` });
  }
  if (type === "trade") {
    const toStudentId = req.body.payload?.toStudentId;
    const amount = Number(req.body.payload?.amount || 0);
    if (!toStudentId || !db.students.some((student) => student.id === toStudentId)) return res.status(400).json({ error: "Choose a student to trade with." });
    if (toStudentId === studentId) return res.status(400).json({ error: "You cannot trade with yourself." });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Trade amount must be greater than 0." });
  }
  const request = { id: randomUUID(), type, status: "pending", studentId, payload: req.body.payload || {}, remarks: req.body.remarks || "", createdAt: now(), createdBy: req.user.id };
  db.requests.push(request);
  await writeDb(db);
  res.status(201).json({ request });
});

app.post("/api/requests/:id/cancel", auth, async (req, res) => {
  const db = await readDb();
  const request = db.requests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });
  const ownsRequest = req.user.role === "student" && request.studentId === req.user.studentId;
  if (!ownsRequest && req.user.role !== "admin") return res.status(403).json({ error: "You can only cancel your own request." });
  if (request.status !== "pending") return res.status(400).json({ error: "Only pending requests can be cancelled." });
  request.status = "cancelled";
  request.resolvedAt = now();
  request.resolvedBy = req.user.id;
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
  res.json({ feedback: entry });
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
