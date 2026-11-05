# Ats Fit Finder

Can you grab the code from https://github.com/fvicznesky/ats-score-agent and start a new project? I have some fixes that need to be completed. They are attached.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ats-fit-finder.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0a4207c7-87c6-4e47-8c0c-85c4178783ba).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```


# ATS Fit Finder — System Documentation & README Requirements

A modern, accurate Applicant Tracking System (ATS) resume analyzer and job-matching tool. This document details the application's core architecture, scoring rules, implemented fixes, and alignment with enterprise ATS systems (Workday, Greenhouse, Lever, Taleo, iCIMS).

---

## 1. Overview & Objective

ATS Fit Finder compares a candidate's resume against a specific job posting to estimate parsing readiness, keyword coverage, and recruiter search visibility. Rather than encouraging artificial "keyword stuffing," the tool provides honest, evidence-based recommendations to help candidates highlight legitimate experience and align formatting with enterprise parsing standards.

---

## 2. Alignment with Real-World ATS Systems

### How Enterprise ATS Parsers Actually Work
- **Document Ingestion & NER:** Enterprise ATS platforms (powered by parsing engines such as Sovren/Textkernel) parse resumes and job postings into structured entities (Titles, Skills, Years of Experience, Education, Contact Info) using Named Entity Recognition (NER).
- **Recruiter Search Priority:** Recruiter searches prioritize **Job Title** and **Core Skills** above all else. If an ATS fails to extract a candidate's headline or past titles accurately, the profile can be downranked or omitted from candidate searches.
- **Section & Layout Recognition:** True enterprise parsers ignore generic section headers (e.g., "About the Company", "Responsibilities", "Qualifications") when resolving the actual job title.
- **Scoring Reality:** Enterprise ATSs rarely present a rigid "percentage score" to recruiters; instead, they rank relevance based on keyword density, title alignment, and boolean query matching. ATS Fit Finder models these criteria through a weighted score breakdown while allowing user overrides.

---

## 3. Core Engine Rules & Implemented Fixes

### A. Job Title Detection & Alignment
1. **Header Exclusion Heuristics:**
   - Filters out section headings such as *"Essential Responsibilities"*, *"Key Responsibilities"*, *"Duties"*, *"Qualifications"*, *"Requirements"*, and bulleted text from being treated as the job title.
   - Prioritizes explicit markers (`Title:`, `Role:`, `Position:`) or early unbulleted title lines.
2. **Target Title Override:**
   - Provides an optional input field before scoring so the user can explicitly declare the target job title.
3. **Live Title Recalculation:**
   - The detected job title in the scoring results is directly editable. Modifying it recalculates the **Title Alignment (10%)** score and headline recommendations immediately without requiring a full re-parse.

### B. Experience & Seniority Detection
1. **Context-Restricted Experience Extraction:**
   - Prevents false-positive experience requirements (e.g., mistaking company history like *"over 100 years of student transportation"* for a requirement of "100+ years of experience").
   - Restricts years extraction to explicit phrases matching patterns such as `X+ years of experience`, `minimum of X years`, or `X years in [domain]`.

### C. False Keyword Collision Prevention
1. **Short & Common Word Guardrails:**
   - Short technical terms that collide with common English words (such as `Go`, `UI`, `RAG`) require contextual validation or exact casing/terminology (`Golang`, `Go programming`) to avoid false-negative "missing skill" flags.
2. **Stemming & Morphological Variations:**
   - Uses root stemming to recognize plural, singular, and morphological matches (e.g., matching a posting's *"communication"* against a resume's *"Executive Stakeholder Communications"*).

### D. Formatting & ATS Layout Heuristics
1. **Single-Column Validation:**
   - Ignores pipe separators (`|`) commonly used in standard contact details and resume headlines so they are not misclassified as complex multi-column or table layouts.
2. **Standard Section Recognition:**
   - Evaluates standard section header naming conventions (`Summary`, `Experience`, `Skills`, `Education`) and suggests high-compatibility renames.

### E. Evidence-Based Recommendations
1. **Avoiding Keyword Stuffing:**
   - Replaces generic fill-in-the-blank bullet templates with targeted gap analysis: lists missing skills and asks the user whether they have verified real-world evidence before suggesting additions.

---

## 4. UI & Workflow Features

- **Multi-Format Ingestion:** Supports pasting raw text or uploading files (`.pdf`, `.docx`, `.txt`) for both resume and job description.
- **Section Clear Controls:** Dedicated "Clear" buttons on both the Resume and Job Description inputs to quickly clear either field.
- **Global Reset / Start Over:** One-click reset to clear all input fields, uploaded files, and generated scoring results.
- **Interactive Score Breakdown:**
  - **Keyword Match (40%):** Hard skills, tools, and domain keywords found vs. missing.
  - **Experience & Seniority (30%):** Years of experience and level matching.
  - **Title Alignment (10%):** Target title overlap in headline and recent work history.
  - **Formatting & Structure (20%):** Section headers, bullet count, and parsing readability.
