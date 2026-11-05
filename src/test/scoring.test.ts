import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { extractJobTitle, extractYears, parseabilityScore, scoreResume, termsInText } from "@/lib/ats/scoring";

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
