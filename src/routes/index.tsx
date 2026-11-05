import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { extractText } from "@/lib/ats/extract";
import { scoreResume, type ScoreResult } from "@/lib/ats/scoring";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ATS Score Agent — Resume vs job description match" },
      { name: "description", content: "Paste or upload a resume and a job posting to get a transparent ATS match score and honest fixes." },
      { property: "og:title", content: "ATS Score Agent" },
      { property: "og:description", content: "Transparent resume-to-job keyword scoring with honest recommendations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Panel({ title, value, onChange }: { title: string; value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-xl">{title}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setErr("");
            }}
            disabled={!value}
            className="rounded-full border px-3 py-1 text-sm hover:bg-accent disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="rounded-full border px-3 py-1 text-sm hover:bg-accent"
          >
            {busy ? "Reading…" : "Upload"}
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".txt,.md,.pdf,.docx"
          className="hidden"
          aria-label={`Upload ${title}`}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            setErr("");
            try {
              onChange(await extractText(f));
            } catch (x) {
              setErr(x instanceof Error ? x.message : "Could not read that file.");
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Paste ${title.toLowerCase()} text, or upload .txt / .pdf / .docx`}
        className="min-h-72 flex-1 rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </section>
  );
}

function Index() {
  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState("");

  const rescore = (resumeText: string, jobText: string, title: string) => {
    setResult(scoreResume(resumeText, jobText, { titleOverride: title }));
  };

  return (
    <div className="mx-auto max-w-5xl px-5 pb-20 pt-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Private · Runs in your browser · Keyword-faithful scoring
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold tracking-tight md:text-5xl">ATS Score Agent</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Feed a resume and a job description. Get a transparent match score and the honest edits most likely to
          move it toward <strong className="text-foreground">90%+</strong>.
        </p>
      </header>

      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!resume.trim() || !job.trim()) {
            setError("Both resume and job description are required.");
            return;
          }
          setError("");
          rescore(resume, job, titleOverride);
          setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 50);
        }}
      >
        <Panel title="Resume" value={resume} onChange={setResume} />
        <Panel title="Job description" value={job} onChange={setJob} />
        <div className="md:col-span-2">
          <label htmlFor="target-title" className="mb-1 block text-sm font-medium">
            Target job title <span className="font-normal text-muted-foreground">(optional — overrides the detected title)</span>
          </label>
          <input
            id="target-title"
            type="text"
            value={titleOverride}
            onChange={(e) => {
              setTitleOverride(e.target.value);
              if (result) rescore(resume, job, e.target.value);
            }}
            placeholder="e.g. Director of IT Applications"
            className="w-full max-w-md rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-4 md:col-span-2">
          <button className="rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground hover:opacity-90">
            Score resume
          </button>
          <button
            type="button"
            onClick={() => {
              setResume("");
              setJob("");
              setTitleOverride("");
              setResult(null);
              setError("");
            }}
            className="rounded-full border px-6 py-2.5 font-medium hover:bg-accent"
          >
            Start over
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>

      {result && (
        <Results
          r={result}
          titleOverride={titleOverride}
          onTitleChange={(t) => {
            setTitleOverride(t);
            rescore(resume, job, t);
          }}
        />
      )}
    </div>
  );
}

function Results({
  r,
  titleOverride,
  onTitleChange,
}: {
  r: ScoreResult;
  titleOverride: string;
  onTitleChange: (t: string) => void;
}) {
  const tone = r.score >= 90 ? "var(--success)" : r.score >= 70 ? "var(--primary)" : "var(--destructive)";
  const gap = Math.max(0, r.target - r.score);
  return (
    <section id="results" className="mt-10 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-6">
        <div
          className="grid h-36 w-36 place-items-center rounded-full"
          style={{ background: `conic-gradient(${tone} ${r.score * 3.6}deg, var(--muted) 0deg)` }}
        >
          <div className="grid h-28 w-28 place-items-center rounded-full bg-card text-center">
            <div>
              <div className="font-serif text-3xl font-bold">{r.score}%</div>
              <div className="text-xs text-muted-foreground">ATS score</div>
            </div>
          </div>
        </div>
        <div className="space-y-1 text-sm">
          <p>
            {gap === 0
              ? "Already in the 90%+ target range for this posting."
              : `${gap} points below the 90% target. Start with the high-priority items.`}
          </p>
          <p className="text-muted-foreground">Projected if you can honestly apply every item: {r.projected_score}%.</p>
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <label htmlFor="detected-title">Detected job title:</label>
            <input
              id="detected-title"
              type="text"
              value={titleOverride || r.job_title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Type the exact title from the posting"
              className="min-w-56 rounded-md border bg-background px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            {r.years_required ? `· ${r.years_required}+ years of experience requested` : ""}
          </p>
        </div>
      </div>

      {r.warnings.length > 0 && (
        <div className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {r.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <h3 className="mt-8 font-serif text-lg">Score breakdown</h3>
      <div className="mt-3 space-y-2">
        {r.breakdown.map((b) => (
          <div key={b.label} className="grid grid-cols-[12rem_1fr_3rem] items-center gap-3 text-sm">
            <span>
              {b.label} ({b.weight}%)
            </span>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${b.score}%` }} />
            </div>
            <span className="text-right">{b.score}%</span>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Chips title="Matched keywords" items={r.matched_keywords} empty="None yet." />
        <Chips title="Missing required" items={r.missing_required} empty="None — required keywords are covered." missing />
      </div>

      <h3 className="mt-8 font-serif text-lg">Recommended changes</h3>
      <ol className="mt-3 space-y-3">
        {r.recommendations.map((rec) => (
          <li key={rec.title} className="rounded-lg border bg-background p-4 text-sm">
            <span className="mr-2 rounded-full bg-accent px-2 py-0.5 text-xs uppercase">{rec.priority}</span>
            <strong>{rec.title}</strong>
            <p className="mt-1 text-muted-foreground">
              {rec.detail}
              {rec.estimated_gain ? ` ~+${rec.estimated_gain} pts` : ""}
            </p>
            {rec.suggested_text && (
              <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">{rec.suggested_text}</pre>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Chips({ title, items, empty, missing }: { title: string; items: string[]; empty: string; missing?: boolean }) {
  return (
    <div>
      <h3 className="font-serif text-lg">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {items.length === 0 && <span className="text-muted-foreground">{empty}</span>}
        {items.map((t) => (
          <span
            key={t}
            className={`rounded-full border px-2.5 py-0.5 ${missing ? "border-destructive/40 text-destructive" : "border-success/40 text-success"}`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
