/**
 * College Notice and Form Assistant Service
 * Extracts deadlines, eligibility criteria, required documents, and actionable next steps
 * with direct citations to source text, ambiguous/missing markers, and offline .ics reminder export.
 */

export interface NoticeDeadline {
  title: string;
  date: string;
  context: string;
  isCritical: boolean;
}

export interface NoticeEligibility {
  criterion: string;
  context: string;
  isAmbiguous: boolean;
}

export interface NoticeDocumentRequirement {
  name: string;
  context: string;
  notes?: string;
}

export interface NoticeAnalysis {
  summary: string;
  deadlines: NoticeDeadline[];
  eligibility: NoticeEligibility[];
  requiredDocuments: NoticeDocumentRequirement[];
  nextSteps: string[];
  ambiguousOrMissing: string[];
  isAiGenerated: boolean;
}

export const SAMPLE_NOTICES = [
  {
    id: "scholarship-merit",
    title: "National Merit Post-Matric Scholarship Notice 2026",
    description: "Inclusive higher education scholarship notice with deadlines and required certificates.",
    content: `GOVERNMENT HIGHER EDUCATION SCHOLARSHIP CELL
CIRCULAR NO: NMS/2026/04 — DATED: OCTOBER 15, 2026
SUBJECT: POST-MATRIC MERIT-CUM-MEANS SCHOLARSHIP FOR STUDENTS WITH DISABILITIES (ACADEMIC YEAR 2026-2027)

1. ELIGIBILITY CRITERIA:
- The applicant must be a citizen of India enrolled in a recognized undergraduate or postgraduate degree program.
- Minimum qualifying score in the previous academic year: 55% marks (50% for SC/ST applicants).
- Total family annual income from all sources must not exceed INR 6,00,000 per annum as verified by the competent revenue authority.
- The applicant must possess a valid Disability Certificate with at least 40% benchmark disability issued by a Government Medical Board.
- Note: Students receiving duplicate state scholarships are NOT eligible; however, merit-only cash awards are permitted.

2. CRITICAL DATES AND DEADLINES:
- Online application portal opening date: November 01, 2026.
- Last date for online form submission: December 15, 2026 by 23:59 IST. Late applications cannot be processed.
- Hard copy verification and institute endorsement deadline: December 24, 2026 at the college administrative office.
- First round provisional merit list publication: January 18, 2027.
- Final fund disbursement into Aadhaar-seeded bank accounts: Before March 31, 2027.

3. MANDATORY DOCUMENTS CHECKLIST:
All candidates must upload clear, legible scanned PDF copies of:
(a) Recent passport-sized color photograph with white background.
(b) Self-attested copy of Aadhaar Card.
(c) Disability Certificate (minimum 40% disability with UDID card reference).
(d) Marksheets of Class 10th, 12th, and all previous college semesters.
(e) Current academic year institutional fee receipt or enrollment bonafide certificate.
(f) Income Certificate issued on or after April 01, 2026.
(g) Cancelled bank cheque leaf or passbook front page showing IFSC code and student name.

4. NEXT STEPS FOR APPLICANTS:
Step 1: Register on the National Scholarship Portal with Aadhaar and university roll number.
Step 2: Upload all 7 mandatory documents and review form preview carefully.
Step 3: Print physical copy and submit to College Scholarship In-Charge (Room 104) before Dec 24, 2026.
Step 4: Track application status online using your application reference ID.`,
  },
  {
    id: "exam-schedule",
    title: "University Semester End Examination Instructions",
    description: "Exam timetable, scribe allotment guidelines, and exam hall admit card notices.",
    content: `CONTROLLER OF EXAMINATIONS — CENTRAL UNIVERSITY
NOTICE: END-SEMESTER EXAMINATIONS (WINTER 2026 SESSION)

General Instructions for All Candidates:
All regular and backlog examinations for Semester 3 and Semester 5 will commence on December 08, 2026 and conclude on December 22, 2026.

Important Timelines:
- Exam Fee Payment without late fee: November 20, 2026.
- Exam Fee with late fee of INR 500: November 27, 2026.
- Hall Ticket (Admit Card) download commences on December 01, 2026.
- Scribe requisition request deadline: November 25, 2026 at the Office of Student Welfare.

Requirements for Persons with Benchmark Disabilities:
Candidates requiring compensatory extra time (20 minutes per hour) or assistive technology/screen reading terminals must submit their request along with a valid medical certificate by November 25, 2026. Scribes must be one academic grade junior to the candidate.

Required Documents for Exam Entry:
1. Printed Admit Card with invigilator verification barcode.
2. University Student ID Card or government-issued photo ID.
3. Official Scribe Permission Letter (if applicable).`,
  },
];

/**
 * Analyze notice text using server API (with offline rule-based fallback)
 */
export async function analyzeNoticeText(text: string, filename: string): Promise<NoticeAnalysis> {
  try {
    const res = await fetch("/api/notices/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, filename }),
    });

    if (!res.ok) {
      throw new Error(`Server returned error ${res.status}`);
    }

    const json = await res.json();
    if (json.data) {
      return {
        ...json.data,
        isAiGenerated: Boolean(json.isAiGenerated),
      };
    }
  } catch (err) {
    // Client-side fallback
  }

  return localRuleBasedNoticeAnalysis(text, filename);
}

function localRuleBasedNoticeAnalysis(text: string, filename: string): NoticeAnalysis {
  // Regex for dates
  const dateRegex = /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi;
  const matches = Array.from(text.matchAll(dateRegex));

  const deadlines: NoticeDeadline[] = matches.slice(0, 5).map((m, idx) => {
    const start = Math.max(0, (m.index || 0) - 80);
    const end = Math.min(text.length, (m.index || 0) + m[0].length + 80);
    const context = text.slice(start, end).replace(/\s+/g, " ").trim();
    const isCritical = /deadline|last date|due|cutoff|late|submit/i.test(context);
    return {
      title: idx === 0 ? "Application / Submission Deadline" : `Timeline Milestone ${idx + 1}`,
      date: m[0],
      context: `…${context}…`,
      isCritical,
    };
  });

  // Extract eligibility criteria
  const sentences = text.split(/(?<=[.!?])\s+/);
  const eligibility: NoticeEligibility[] = [];

  sentences.forEach((sent) => {
    const lower = sent.toLowerCase();
    if (
      lower.includes("eligible") ||
      lower.includes("eligibility") ||
      lower.includes("must be") ||
      lower.includes("minimum") ||
      lower.includes("qualification") ||
      lower.includes("marks")
    ) {
      eligibility.push({
        criterion: sent.trim(),
        context: sent.trim(),
        isAmbiguous: lower.includes("discretion") || lower.includes("may be") || lower.includes("subject to"),
      });
    }
  });

  // Extract required documents
  const docKeywords = [
    "certificate",
    "marksheet",
    "transcript",
    "photo",
    "id card",
    "aadhaar",
    "income certificate",
    "disability certificate",
    "receipt",
    "passbook",
    "cheque",
  ];
  const requiredDocuments: NoticeDocumentRequirement[] = [];

  sentences.forEach((sent) => {
    const lower = sent.toLowerCase();
    for (const kw of docKeywords) {
      if (lower.includes(kw) && !requiredDocuments.some((d) => d.name.toLowerCase().includes(kw))) {
        requiredDocuments.push({
          name: kw.charAt(0).toUpperCase() + kw.slice(1),
          context: sent.trim(),
        });
      }
    }
  });

  return {
    summary: `Extracted notice details from "${filename || "document"}". Identified ${deadlines.length} key dates, ${eligibility.length} eligibility rules, and ${requiredDocuments.length} document requirements.`,
    deadlines,
    eligibility: eligibility.length > 0 ? eligibility.slice(0, 4) : [
      {
        criterion: "General applicant criteria outlined in document body.",
        context: sentences[0] || "Review full document.",
        isAmbiguous: true,
      },
    ],
    requiredDocuments: requiredDocuments.length > 0 ? requiredDocuments : [
      { name: "Application Form", context: "Official prescribed form." },
    ],
    nextSteps: [
      "1. Check eligibility criteria and prepare required documents.",
      "2. Complete submission before the earliest deadline noted above.",
      "3. Retain a signed physical or digital copy of all submitted materials.",
    ],
    ambiguousOrMissing: [
      "Confirm official office contact hours or helpdesk email address in the original document.",
    ],
    isAiGenerated: false,
  };
}

/**
 * Generates an offline .ics calendar event file string for any deadline
 */
export function generateICalendarEvent(
  title: string,
  dateStr: string,
  description: string
): string {
  // Parse date or fallback to ISO format
  const parsed = new Date(dateStr);
  const isValid = !isNaN(parsed.getTime());
  const eventDate = isValid ? parsed : new Date();

  const startYear = eventDate.getFullYear();
  const startMonth = String(eventDate.getMonth() + 1).padStart(2, "0");
  const startDay = String(eventDate.getDate()).padStart(2, "0");
  const dtStamp = `${startYear}${startMonth}${startDay}T090000Z`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BrailleBridge AI//College Notice Assistant//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:braillebridge-${Date.now()}@braillebridge.ai`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${startYear}${startMonth}${startDay}`,
    `SUMMARY:DEADLINE: ${title.replace(/\n/g, " ")}`,
    `DESCRIPTION:${description.replace(/\n/g, " \\n ")}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder: Deadline tomorrow",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Downloads .ics calendar file for reliable offline reminder creation
 */
export function downloadCalendarReminder(deadline: NoticeDeadline, noticeTitle: string): void {
  const icsContent = generateICalendarEvent(
    `${deadline.title} (${noticeTitle})`,
    deadline.date,
    `Context quote from notice:\n${deadline.context}\n\nGenerated by BrailleBridge AI Notice Assistant.`
  );

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reminder-${deadline.title.toLowerCase().replace(/[^\w]/g, "-")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
