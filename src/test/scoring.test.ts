import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { extractJobTitle, extractYears, parseabilityScore, scoreResume, termsInText } from "@/lib/ats/scoring";
import { reviewRequirements } from "@/lib/ats/requirements";

const load = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf-8");

describe("original behaviour", () => {
  it("weak resume is below target and missing python", () => {
    const r = scoreResume(load("resume_weak.txt"), load("job.txt"));
    expect(r.score).toBeLessThan(70);
    expect(r.missing_required).toContain("python");
  });
  it("strong resume reaches target", () => {
    const r = scoreResume(load("resume_strong.txt"), load("job.txt"));
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.missing_required).toEqual([]);
  });
});

describe("fixes", () => {
  it("prefers a real role title to the Fifth Third slogan", () => {
    expect(extractJobTitle("Job description\nMake banking a Fifth Third better®\nEssential Duties and Responsibilities\nDirector, Software Engineering")).toBe("Director, Software Engineering");
  });
  it("ignores company-history years; reads only years of experience", () => {
    expect(extractYears("For over 100 years we have provided student transportation.")).toBeNull();
    expect(extractYears("Over 100 years of service. Requires 10+ years of experience.")).toBe(10);
  });
  it("skips a 'Job Description' heading when finding the title", () => {
    expect(extractJobTitle("Job Description\nDirector of IT Applications\nWe are hiring...")).toBe(
      "Director of IT Applications",
    );
  });
  it("never takes 'Essential Responsibilities' or other duties headers as the title", () => {
    for (const header of [
      "Essential Responsibilities",
      "Key Responsibilities:",
      "- Primary Responsibilities",
      "Responsibilities",
      "Qualifications",
      "Requirements",
      "Duties",
      "Overview",
    ]) {
      expect(extractJobTitle(`${header}\nSenior Backend Engineer\nWe are hiring...`)).toBe(
        "Senior Backend Engineer",
      );
    }
    expect(extractJobTitle("Essential Responsibilities\n- Build APIs\n- Review code")).toBe("");
  });
  it("prefers an explicit Title: hint over section headers", () => {
    expect(
      extractJobTitle("Essential Responsibilities\n- Build APIs\nTitle: Senior Backend Engineer"),
    ).toBe("Senior Backend Engineer");
  });
  it("a user-supplied title override wins over detection", () => {
    const r = scoreResume("Skills\nPython", "Title: Data Analyst\nRequired:\n- Python", {
      titleOverride: "Senior Backend Engineer",
    });
    expect(r.job_title).toBe("Senior Backend Engineer");
  });
  it("does not treat the English word 'go' as the Go language", () => {
    expect(termsInText("Ready to go above and beyond? Let's go.").has("go")).toBe(false);
    expect(termsInText("Experience with Golang services").has("go")).toBe(true);
  });
  it("matches plural forms via stems", () => {
    const r = scoreResume("Skills\nExecutive Stakeholder Communications", "Required: strong communication skills");
    expect(r.matched_keywords).toContain("communication");
  });
  it("pipes in headline and contact lines do not trigger the table warning", () => {
    const resume = [
      "Fred V",
      "IT Director | Applications Leader | Agile",
      "fred@x.com | 555-555-5555 | Ohio | linkedin.com/in/fred",
      "Summary",
      "Leader of teams.",
      "Experience",
      "- Did things",
    ].join("\n");
    expect(parseabilityScore(resume)[1]).toEqual([]);
  });
  it("never suggests template bullets with placeholders for missing skills", () => {
    const r = scoreResume("Skills\nExcel", "Required:\n- Python\n- SQL");
    for (const rec of r.recommendations) expect(rec.suggested_text).not.toMatch(/Delivered production/);
    expect(r.recommendations.some((x) => x.title.includes("real evidence"))).toBe(true);
  });
});

describe("job requirement evidence review", () => {
  it("flags decomposition evidence missing despite matching API keywords", () => {
    const r = reviewRequirements("Skills\nAPI, Kubernetes", "Decompose monolithic applications and establish domain boundaries and service contracts.");
    expect(r.gaps[0]?.status).toBe("not_found");
    expect(r.gaps[0]?.missing).toContain("Decomposing legacy or monolithic applications");
  });
  it("shows migration as partial evidence when legacy retirement is absent", () => {
    const r = reviewRequirements("- Led a 48-hour migration of 25 servers with zero downtime.", "Deliver incremental migrations, parallel operations, and legacy decommissioning.");
    expect(r.gaps[0]?.status).toBe("partial");
    expect(r.gaps[0]?.missing).toEqual(["Legacy retirement or decommissioning"]);
    expect(r.gaps[0]?.evidence).toContain("48-hour migration");
    expect(r.gaps[0]?.requirement).toContain("legacy decommissioning");
  });
  it("does not flag absent requirements", () => {
    expect(reviewRequirements("- Led 35 engineers.", "Required: Python")).toEqual({ checked: 0, covered: 0, gaps: [] });
  });
  it("recognizes delivery evidence without changing the keyword weights", () => {
    const resume = "- Directed decomposition of monolithic applications, defining domain boundaries and service contracts.";
    const job = "Decompose monolithic applications and establish domain boundaries and service contracts.";
    expect(reviewRequirements(resume, job)).toEqual({ checked: 1, covered: 1, gaps: [] });
    expect(scoreResume(resume, job).breakdown.map(x => x.weight)).toEqual([50, 15, 10, 10, 8, 7]);
  });
  it("requires coaching evidence beyond managing engineers", () => {
    const r = reviewRequirements("- Led an organization of 35 engineers supporting nine applications.", "Coach engineering managers and build succession planning.");
    expect(r.gaps[0]?.missing).toEqual(["Coaching or developing engineering talent", "Succession planning"]);
  });
  it("joins wrapped evidence lines", () => {
    const r = reviewRequirements("- Led a platform migration\n  and legacy decommissioning.", "Deliver migrations and legacy decommissioning.");
    expect(r.covered).toBe(1);
  });
  it("joins PDF line wraps without indentation", () => {
    const r = reviewRequirements("- Led a platform migration and legacy\ndecommissioning.", "Deliver migrations and legacy decommissioning.");
    expect(r.covered).toBe(1);
  });
});
