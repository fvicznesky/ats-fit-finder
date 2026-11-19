export type RequirementGap = {
  capability: string;
  requirement: string;
  status: "partial" | "not_found";
  evidence: string;
  missing: string[];
};
export type RequirementReview = { checked: number; covered: number; gaps: RequirementGap[] };

type Concept = { label: string; pattern: RegExp };
type Capability = { name: string; trigger: RegExp; concepts: Concept[] };
const capabilities: Capability[] = [
  { name: "Legacy application decomposition", trigger: /decompos|monolith|domain boundaries/i, concepts: [
    { label: "Decomposing legacy or monolithic applications", pattern: /decompos|monolith|modulariz/i },
    { label: "Domain boundaries or service contracts", pattern: /domain boundar|service contracts?|domain.oriented/i },
  ] },
  { name: "Migration and legacy retirement", trigger: /legacy (?:retirement|decommission)|retirement of legacy|legacy decommission|parallel operations/i, concepts: [
    { label: "Platform migration or conversion", pattern: /migrat|replatform|platform conversion/i },
    { label: "Legacy retirement or decommissioning", pattern: /retir|decommission/i },
  ] },
  { name: "Engineering talent development", trigger: /coach|succession|grow technical talent/i, concepts: [
    { label: "Coaching or developing engineering talent", pattern: /coach|mentor|talent development|develop(?:ed|ing)? (?:engineering )?(?:managers|leaders|talent|engineers)/i },
    { label: "Succession planning", pattern: /succession/i },
  ] },
  { name: "Hiring and workforce strategy", trigger: /hiring|workforce|insourcing/i, concepts: [
    { label: "Hiring or recruiting", pattern: /hir(?:e|ed|ing)|recruit/i },
    { label: "Workforce or sourcing strategy", pattern: /workforce|insourc|offshore|nearshore|onshore/i },
  ] },
  { name: "Product and business partnership", trigger: /partner(?:ship|s)? with product|partner with product|product and .*business leaders/i, concepts: [
    { label: "Working with Product or product management", pattern: /\bproduct (?:management|managers?|leaders?|teams?)\b|\bpartner\w* with product\b/i },
    { label: "Client or business outcomes", pattern: /client|customer|business value|business outcomes|receivables|revenue/i },
  ] },
  { name: "Commercial client journeys", trigger: /client journey|commercial digital banking|commercial client experience/i, concepts: [
    { label: "Commercial banking client experience", pattern: /commercial (?:banking|clients?|digital)|treasury/i },
    { label: "Client journeys, onboarding, or transaction approvals", pattern: /client journey|onboarding|transaction approvals?|client servicing/i },
  ] },
  { name: "Identity and entitlements", trigger: /authentication|authorization|entitlements|client identity/i, concepts: [
    { label: "Authentication or identity ownership", pattern: /authentication|client identity|identity management|\bIAM\b/i },
    { label: "Authorization or entitlements", pattern: /authorization|entitlements|access controls?/i },
  ] },
  { name: "Container-based cloud delivery", trigger: /container|kubernetes|orchestration/i, concepts: [
    { label: "Containerization or orchestration delivery", pattern: /container|kubernetes|orchestration|docker/i },
    { label: "Cloud platform delivery", pattern: /cloud|\bAWS\b|\bAzure\b|\bGCP\b/i },
  ] },
  { name: "API and event-driven architecture", trigger: /api.first|event.driven|micro.frontend/i, concepts: [
    { label: "API-first or service architecture", pattern: /api.first|\bAPIs?\b|service contracts?|shared.service/i },
    { label: "Event-driven or micro-frontend architecture", pattern: /event.driven|micro.frontend/i },
  ] },
  { name: "Modernization roadmap ownership", trigger: /modernization roadmap|multi.year.*roadmap/i, concepts: [
    { label: "Roadmap ownership or delivery sequencing", pattern: /roadmap|delivery sequenc/i },
    { label: "Modernization delivery", pattern: /moderniz|replatform/i },
  ] },
  { name: "Technical debt and capacity tradeoffs", trigger: /technical debt|capacity decisions|capacity constraints/i, concepts: [
    { label: "Managing technical debt", pattern: /technical debt/i },
    { label: "Capacity planning or prioritization tradeoffs", pattern: /capacity|prioritiz|trade.?offs?/i },
  ] },
  { name: "Production readiness and operational ownership", trigger: /production.readiness|production readiness/i, concepts: [
    { label: "Production readiness, release controls, or operational ownership", pattern: /production.readiness|release (?:controls?|practices)|operational ownership/i },
    { label: "Recovery, observability, or incident response", pattern: /recovery|observability|incident|operational visibility/i },
  ] },
];

/** Limited, deterministic evidence checks. Absence of wording is not absence of experience. */
export function reviewRequirements(resume: string, job: string): RequirementReview {
  const requirements = job.split(/\r?\n|(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const evidenceLines: string[] = [];
  for (const raw of resume.split(/\r?\n/)) {
    const previous = evidenceLines.at(-1);
    if (previous && (/^\s+\S/.test(raw) || (!/[.!?]$/.test(previous) && /^[a-z0-9]/.test(raw.trim())))) {
      evidenceLines[evidenceLines.length - 1] += ` ${raw.trim()}`;
    } else if (/\b(?:led|directed|managed|built|architected|established|coordinated|oversaw|maintained|spearheaded|implemented|delivered|developed|partnered|reduced|cut|authored|supported)\b/i.test(raw)) {
      evidenceLines.push(raw.replace(/^\s*[-*•●▪◦‣]\s*/, "").trim());
    }
  }
  const gaps: RequirementGap[] = [];
  let checked = 0;
  let covered = 0;
  for (const capability of capabilities) {
    const matchedRequirements = requirements.filter(line => capability.trigger.test(line));
    if (!matchedRequirements.length) continue;
    checked++;
    // Only ask about concepts actually present in this posting, not every concept in the catalog.
    const requested = capability.concepts.filter(concept => concept.pattern.test(job));
    if (!requested.length) { checked--; continue; }
    const sourceLines = new Set([matchedRequirements[0]]);
    for (const concept of requested) {
      const source = requirements.find(line => concept.pattern.test(line));
      if (source) sourceLines.add(source);
    }
    const requirement = [...sourceLines].join("\n");
    const ranked = evidenceLines.map(text => ({ text, hits: requested.filter(c => c.pattern.test(text)) }))
      .sort((a, b) => b.hits.length - a.hits.length);
    const best = ranked[0];
    const missing = requested.filter(c => !evidenceLines.some(line => c.pattern.test(line))).map(c => c.label);
    if (!missing.length) { covered++; continue; }
    gaps.push({ capability: capability.name, requirement, status: best?.hits.length ? "partial" : "not_found", evidence: best?.hits.length ? best.text : "", missing });
  }
  return { checked, covered, gaps };
}
import { STOPWORDS } from "./keywords";
import { normalizeText, stem } from "./scoring";

const FILLER = new Set(["manage", "managing", "oversee", "overseeing", "develop", "establish", "maintain", "drive", "collaborate", "partner", "identify", "implement", "overall", "similar", "proven", "familiarity", "ideal", "bring", "focus", "ensure", "provide", "support", "lead", "drive", "help", "assist", "etc", "various", "related", "relevant", "appropriate", "effective", "effectively", "excellent", "proven", "demonstrated", "knowledge", "understanding", "skills", "skill", "level", "all", "any", "more", "most", "one", "two", "three", "who", "what", "when", "where", "how", "which", "can", "have", "has", "not", "per", "out", "other", "key", "own", "make", "makes"]);
const contentWords = (s: string) => [...new Set(normalizeText(s).split(" ").filter(w => w.length > 2 && !STOPWORDS.has(w) && !FILLER.has(w) && !/^\d+$/.test(w)))];

/** Generic check for any posting: each job bullet vs. the closest resume line by shared content words. */
export function reviewJobBullets(resume: string, job: string, skip: string[] = []): RequirementReview {
  // Bulleted lines, or plain lines listed under a heading like "Key Responsibilities:" (pasted postings lose bullets).
  let underHeading = false;
  const bullets = job.split(/\r?\n/).filter(l => {
    const t = l.trim();
    if (!t) { underHeading = false; return false; }
    if (/:$/.test(t) && t.split(/\s+/).length <= 6) { underHeading = true; return false; }
    return underHeading || /^\s*[-*•●▪◦‣·]|^\s*\d+[.)]\s/.test(l);
  })
    .map(l => l.replace(/^\s*(?:[-*•●▪◦‣·]|\d+[.)])\s*/, "").trim())
    .filter(l => contentWords(l).length >= 3 && !skip.some(s => s.includes(l)));
  const lines: string[] = [];
  for (const raw of resume.split(/\r?\n/)) {
    const t = raw.replace(/^\s*[-*•●▪◦‣]\s*/, "").trim();
    if (!t) continue;
    const prev = lines.at(-1);
    if (prev && !/^\s*[-*•●▪◦‣]/.test(raw) && !/[.!?]$/.test(prev) && /^[a-z0-9]/.test(t)) lines[lines.length - 1] += ` ${t}`;
    else lines.push(t);
  }
  const lineStems = lines.map(l => new Set(normalizeText(l).split(" ").map(stem)));
  const all = new Set(lineStems.flatMap(s => [...s]));
  const gaps: RequirementGap[] = [];
  let covered = 0;
  for (const req of bullets) {
    const words = contentWords(req);
    let bestI = -1, bestHits = 0;
    lineStems.forEach((s, i) => { const h = words.filter(w => s.has(stem(w))).length; if (h > bestHits) { bestHits = h; bestI = i; } });
    const missing = words.filter(w => !all.has(stem(w)));
    const ratio = bestHits / words.length;
    if (ratio >= 0.6) { covered++; continue; }
    gaps.push({ capability: req.split(/\s+/).slice(0, 8).join(" ") + (req.split(/\s+/).length > 8 ? "…" : ""), requirement: req,
      status: ratio >= 0.25 ? "partial" : "not_found", evidence: ratio >= 0.25 ? (lines[bestI] ?? "") : "",
      missing: missing.length ? [`Wording not found anywhere in your resume: ${missing.join(", ")}`] : ["Terms appear in your resume, but not together in one achievement"] });
  }
  return { checked: bullets.length, covered, gaps };
}

/** Catalog checks plus generic per-bullet checks for anything the catalog didn't cover. */
export function reviewAll(resume: string, job: string): RequirementReview {
  const a = reviewRequirements(resume, job);
  const b = reviewJobBullets(resume, job, a.gaps.map(g => g.requirement));
  return { checked: a.checked + b.checked, covered: a.covered + b.covered, gaps: [...a.gaps, ...b.gaps] };
}
