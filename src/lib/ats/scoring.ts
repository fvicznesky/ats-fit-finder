// Deterministic ATS-style resume vs job-description scoring.
// Ported from the original Python scoring module, with accuracy fixes:
// - years only come from "N+ years of experience" style phrases
// - generic headings ("Job Description") are never taken as the job title
// - matching uses light word stems, so "Communications" covers "communication"
// - "|" in the headline/contact lines no longer triggers the table warning
// - missing-skill advice asks for real evidence instead of template bullets
import { DEGREE_TERMS, SECTION_HEADERS, SKILL_ALIASES, STOPWORDS } from "./keywords";

export const TARGET_SCORE = 90;

export type Recommendation = {
  priority: "keep" | "high" | "medium" | "low";
  title: string;
  detail: string;
  suggested_text: string;
  estimated_gain: number;
};

export type ScoreResult = {
  score: number;
  target: number;
  projected_score: number;
  breakdown: { label: string; weight: number; score: number; weighted: number }[];
  matched_keywords: string[];
  missing_required: string[];
  missing_preferred: string[];
  recommendations: Recommendation[];
  sections_found: string[];
  warnings: string[];
  job_title: string;
  years_required: number | null;
};

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/&/g, " and ")
    .replace(/[/\\]/g, " ")
    .replace(/[^a-z0-9+#.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Light suffix stemmer, applied identically to resume and keyword text. */
export function stem(word: string): string {
  if (!/^[a-z]+$/.test(word) || word.length <= 3) return word;
  let w = word;
  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  return w;
}

function stemSeq(text: string): string {
  // Trailing sentence periods would glue onto words; drop periods not inside a token like "node.js".
  const tokens = normalizeText(text)
    .split(" ")
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
  return " " + tokens.map(stem).join(" ") + " ";
}

const ALIAS_TO_CANONICAL: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    // A canonical name is only an alias when it appears in its own list (e.g. "go" does not).
    for (const a of aliases) m.set(stemSeq(a).trim(), canonical);
  }
  return m;
})();
const ALIASES_LONGEST_FIRST = [...ALIAS_TO_CANONICAL.keys()].sort((a, b) => b.length - a.length);

const YEARS_EXPERIENCE_RE =
  /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)(?:'s)?\s+(?:of\s+)?(?:[a-z-]+\s+){0,3}?(?:experience|exp\b)/gi;
const ANY_YEARS_RE = /(\d+)\s*\+?\s*(?:years|yrs|year)\b/i;
const METRIC_RE =
  /(\d[\d,]*\s*%|\$\s*\d[\d,.]*|\b\d[\d,]*\+?\s*(million|billion|k|m)\b|\b\d{1,3}(?:,\d{3})+\b)/i;
const TITLE_HINT_RE = /^(?:job title|title|position|role)\s*[:-]\s*(.+)/i;
const GENERIC_HEADINGS = new Set([
  "job description", "description", "job details", "job summary", "summary", "overview",
  "about", "about us", "about the company", "about the role", "about the job", "the role",
  "responsibilities", "requirements", "qualifications", "job posting", "posting", "apply",
  "apply now", "careers", "position summary", "role overview", "who we are", "company overview",
  "essential responsibilities", "key responsibilities", "primary responsibilities",
  "main responsibilities", "core responsibilities", "general responsibilities",
  "duties", "essential duties", "key duties", "primary duties", "job duties",
  "essential functions", "key functions", "primary functions",
  "what you will do", "what you'll do", "your role", "the job", "position overview",
  "job overview", "role summary", "position description", "job requirements",
  "minimum qualifications", "preferred qualifications", "basic qualifications",
  "skills", "benefits", "compensation", "location", "schedule",
]);

export function scoreResume(resumeText: string, jobText: string): ScoreResult {
  const resume = resumeText.trim();
  const job = jobText.trim();
  const warnings: string[] = [];
  if (!resume) warnings.push("Resume is empty.");
  if (!job) warnings.push("Job description is empty.");

  const resumeStem = stemSeq(resume);
  const resumeNorm = normalizeText(resume);
  const sections = detectSections(resume);
  const [requiredTerms, preferredTerms] = extractJobTerms(job);
  const title = extractJobTitle(job);
  const yearsRequired = extractYears(job);

  const reqHits = requiredTerms.map((t) => ({ term: t, matched: matchTerm(t, resumeStem, resumeNorm) }));
  const prefHits = preferredTerms.map((t) => ({ term: t, matched: matchTerm(t, resumeStem, resumeNorm) }));
  const cov = (h: { matched: boolean }[]) => (h.length ? h.filter((x) => x.matched).length / h.length : 1);

  const titleScore = titleAlignment(title, resumeStem);
  const sectionScore = ["contact", "skills", "experience", "education"].filter((s) => sections.has(s)).length / 4;
  const quant = quantificationScore(resume);
  const [parse, parseWarnings] = parseabilityScore(resume);
  warnings.push(...parseWarnings);

  const weights: [string, number, number][] = [
    ["Required keywords", 0.5, cov(reqHits)],
    ["Preferred keywords", 0.15, cov(prefHits)],
    ["Title alignment", 0.1, titleScore],
    ["Resume sections", 0.1, sectionScore],
    ["Quantified impact", 0.08, quant],
    ["ATS parseability", 0.07, parse],
  ];
  const score = Math.round(100 * weights.reduce((s, [, w, v]) => s + w * v, 0));
  const breakdown = weights.map(([label, w, v]) => ({
    label,
    weight: Math.round(w * 100),
    score: Math.round(v * 100),
    weighted: Math.round(w * v * 1000) / 10,
  }));

  const matched = [...new Set([...reqHits, ...prefHits].filter((h) => h.matched).map((h) => h.term))].sort();
  const missingRequired = reqHits.filter((h) => !h.matched).map((h) => h.term);
  const missingPreferred = prefHits.filter((h) => !h.matched).map((h) => h.term);

  const recs = buildRecommendations({
    missingRequired, missingPreferred, title, titleScore, sections, quant, yearsRequired, resume, warnings,
  });
  let projected = Math.min(99, score + recs.reduce((s, r) => s + r.estimated_gain, 0));
  if (score >= TARGET_SCORE) {
    recs.unshift({
      priority: "keep",
      title: "You are already at the 90%+ target",
      detail: "Tune wording if you want, but keyword coverage is already in a strong ATS range.",
      suggested_text: "",
      estimated_gain: 0,
    });
    projected = Math.max(projected, score);
  }

  return {
    score, target: TARGET_SCORE, projected_score: projected, breakdown,
    matched_keywords: matched, missing_required: missingRequired, missing_preferred: missingPreferred,
    recommendations: recs, sections_found: [...sections].sort(), warnings,
    job_title: title, years_required: yearsRequired,
  };
}

export function termsInText(text: string): Set<string> {
  const blob = stemSeq(text);
  const found = new Set<string>();
  for (const alias of ALIASES_LONGEST_FIRST) {
    if (blob.includes(` ${alias} `)) found.add(ALIAS_TO_CANONICAL.get(alias)!);
  }
  for (const [canonical, variants] of Object.entries(DEGREE_TERMS)) {
    if (variants.some((v) => blob.includes(stemSeq(v)))) found.add(canonical);
  }
  return found;
}

export function extractJobTerms(jobText: string): [string[], string[]] {
  const lines = jobText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let required = new Set<string>();
  const preferred = new Set<string>();
  let preferredMode = false;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (["nice to have", "preferred", "bonus", "plus:"].some((k) => lower.includes(k))) preferredMode = true;
    if (["required", "must have", "minimum qualifications", "what you will need"].some((k) => lower.includes(k)))
      preferredMode = false;
    const found = termsInText(line);
    if (!found.size) continue;
    const target = preferredMode || lower.includes("preferred") || lower.includes("nice to have") ? preferred : required;
    found.forEach((t) => target.add(t));
  }
  required = new Set([...required].filter((t) => !preferred.has(t)));
  if (!required.size && !preferred.size) required = termsInText(jobText);
  return [[...required].sort(), [...preferred].sort()];
}

export function extractJobTitle(jobText: string): string {
  const lines = jobText.split(/\r?\n/).map((l) => l.trim().replace(/^[-*•\s]+/, "")).filter(Boolean);
  // First pass: explicit hints like "Title:", "Position:", "Role:" anywhere in the posting.
  for (const s of lines) {
    const hinted = TITLE_HINT_RE.exec(s);
    if (hinted) {
      const t = cleanTitle(hinted[1] ?? "");
      if (t) return t;
    }
  }
  // Second pass: first short line that is not a generic section header or duties line.
  for (const s of lines) {
    const key = s.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
    if (!key || GENERIC_HEADINGS.has(key)) continue;
    if (s.length <= 80 && !/[.:]$/.test(s)) return cleanTitle(s);
  }
  return "";
}

/** Years of experience the posting asks for, read only from "N+ years of experience" style phrases. */
export function extractYears(text: string): number | null {
  const found = [...text.matchAll(YEARS_EXPERIENCE_RE)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 40);
  return found.length ? Math.max(...found) : null;
}

export function detectSections(resume: string): Set<string> {
  const found = new Set<string>();
  for (const line of resume.split(/\r?\n/)) {
    const key = line.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
    if (!key) continue;
    for (const [name, headers] of Object.entries(SECTION_HEADERS)) {
      if (headers.some((h) => key === h || key.startsWith(h))) found.add(name);
    }
  }
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(resume) || /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(resume)) found.add("contact");
  return found;
}

export function matchTerm(term: string, resumeStem: string, resumeNorm: string): boolean {
  const variants = new Set(SKILL_ALIASES[term] ?? [term]);
  if (SKILL_ALIASES[term]?.includes(term) || !SKILL_ALIASES[term]) variants.add(term);
  (DEGREE_TERMS[term] ?? []).forEach((v) => variants.add(v));
  const compactResume = resumeNorm.replace(/ /g, "");
  for (const v of [...variants].sort((a, b) => b.length - a.length)) {
    if (resumeStem.includes(stemSeq(v))) return true;
    const norm = normalizeText(v);
    if (/[.+#]/.test(norm) && compactResume.includes(norm.replace(/ /g, ""))) return true;
  }
  return false;
}

function titleAlignment(title: string, resumeStem: string): number {
  if (!title) return 1;
  const tokens = normalizeText(title).split(" ").filter((t) => t && !STOPWORDS.has(t));
  if (!tokens.length) return 1;
  return tokens.filter((t) => resumeStem.includes(` ${stem(t)} `)).length / tokens.length;
}

function quantificationScore(resume: string): number {
  const lines = resume.split(/\r?\n/);
  let bullets = lines.filter((l) => /^\s*[-*•]/.test(l));
  if (!bullets.length) bullets = lines.filter((l) => l.trim());
  return Math.min(1, bullets.filter((l) => METRIC_RE.test(l) || /\b\d+\b/.test(l)).length / 4);
}

/**
 * Table/column detection. A headline or contact line like "Name | email | phone" is normal
 * in single-column resumes, so the first lines are skipped and we need several separate
 * table-like rows further down before warning.
 */
export function parseabilityScore(resume: string): [number, string[]] {
  const warnings: string[] = [];
  let score = 1;
  const lines = resume.split(/\r?\n/).filter((l) => l.trim());
  const body = lines.slice(6);
  const tableRows = body.filter((l) => (l.match(/\|/g)?.length ?? 0) >= 2 || (l.match(/\t/g)?.length ?? 0) >= 2);
  if (tableRows.length >= 4) {
    score -= 0.35;
    warnings.push("This resume looks multi-column or table-based, which many ATS parsers scramble.");
  }
  if (/\[image\]|text box|smartart/i.test(resume)) {
    score -= 0.25;
    warnings.push("Remove images, text boxes, and SmartArt; ATS tools often skip them.");
  }
  if (resume.length > 80 && !detectSections(resume).size) {
    score -= 0.2;
    warnings.push("No standard section headings were detected.");
  }
  return [Math.max(0, score), warnings];
}

function buildRecommendations(a: {
  missingRequired: string[]; missingPreferred: string[]; title: string; titleScore: number;
  sections: Set<string>; quant: number; yearsRequired: number | null; resume: string; warnings: string[];
}): Recommendation[] {
  const recs: Recommendation[] = [];
  if (a.missingRequired.length) {
    recs.push({
      priority: "high",
      title: "Review missing required keywords",
      detail:
        "The posting names these skills and your resume doesn't. Only add the ones you genuinely have, using the posting's wording.",
      suggested_text: "Missing: " + a.missingRequired.slice(0, 12).join(", "),
      estimated_gain: Math.min(28, 4 * Math.min(7, a.missingRequired.length)),
    });
    for (const term of a.missingRequired.slice(0, 5)) {
      recs.push({
        priority: "high",
        title: `Missing skill: ${term}. Do you have real evidence for it?`,
        detail:
          `If you've actually used ${term}, add a bullet describing what you did with it and the real result. ` +
          "If you haven't, leave it out: adding skills you don't have is keyword stuffing and falls apart in an interview.",
        suggested_text: "",
        estimated_gain: 3,
      });
    }
  }
  if (a.title && a.titleScore < 0.8) {
    recs.push({
      priority: "high",
      title: "Mirror the target job title in your headline",
      detail: "Many ATS systems compare the resume headline/target role to the posting title.",
      suggested_text: `${a.title} | [Your current title] | [City or Remote]`,
      estimated_gain: 6,
    });
  }
  const sectionRecs: [string, Recommendation][] = [
    ["summary", { priority: "medium", title: "Use a standard Summary heading", detail: "Headings like \"Executive Profile\" may not be recognized. \"Summary\" is safest.", suggested_text: "Summary", estimated_gain: 0 }],
    ["skills", { priority: "high", title: "Add a dedicated Skills section", detail: "A section headed simply \"Skills\" is one of the most reliable ATS parse targets.", suggested_text: "Skills\n[Skills you actually have]", estimated_gain: 5 }],
    ["experience", { priority: "high", title: "Label your work history as Experience", detail: "Use a standard heading such as Experience or Work Experience.", suggested_text: "Experience", estimated_gain: 4 }],
    ["education", { priority: "medium", title: "Add an Education section heading", detail: "Even a short Education block helps parsers fill the education field.", suggested_text: "Education\n[Degree], [School], [Year]", estimated_gain: 3 }],
    ["contact", { priority: "medium", title: "Put email and phone on the first lines", detail: "Plain-text contact details parse more reliably than headers, images, or text boxes.", suggested_text: "[Name]\n[email] | [phone] | [City] | [LinkedIn URL]", estimated_gain: 3 }],
  ];
  for (const [name, rec] of sectionRecs) if (!a.sections.has(name)) recs.push(rec);

  if (a.quant < 0.6) {
    recs.push({
      priority: "medium",
      title: "Quantify at least 4 experience bullets",
      detail: "Numbers survive ATS parsing and give recruiters a reason to keep reading. Use your real figures.",
      suggested_text: "",
      estimated_gain: 5,
    });
  }
  if (a.yearsRequired && !ANY_YEARS_RE.test(a.resume)) {
    recs.push({
      priority: "medium",
      title: `State your years of experience (posting asks for ${a.yearsRequired}+)`,
      detail: "If you meet the bar, say so in the summary so both ATS and humans can see it.",
      suggested_text: `[Your title] with ${a.yearsRequired}+ years of experience in [your area].`,
      estimated_gain: 3,
    });
  }
  if (a.missingPreferred.length) {
    recs.push({
      priority: "low",
      title: "Name preferred skills you actually have",
      detail: "Do not invent skills. If you have used them, name them the same way the posting does.",
      suggested_text: "Preferred, not found: " + a.missingPreferred.slice(0, 8).join(", "),
      estimated_gain: Math.min(8, 2 * Math.min(4, a.missingPreferred.length)),
    });
  }
  for (const w of a.warnings) {
    if (/table|column/i.test(w)) {
      recs.push({
        priority: "medium",
        title: "Replace multi-column or table layouts",
        detail: w,
        suggested_text: "Use a single-column .docx or .pdf with standard headings and bullet lists.",
        estimated_gain: 3,
      });
    }
  }
  const seen = new Set<string>();
  return recs.filter((r) => (seen.has(r.title) ? false : (seen.add(r.title), true)));
}

function cleanTitle(v: string): string {
  return v.replace(/\s+/g, " ").replace(/^[\s\-:|]+|[\s\-:|]+$/g, "");
}
