# ORNL Active Careers Re-Scan

**Date:** 2026-06-28  
**Source:** Official ORNL careers search page (`jobs.ornl.gov`) + prior repo/transcript audit  
**Live inventory:** `WEB-TRACKER/research/ornl-active-careers-2026-06-28-listing.json`  

## Why This Re-Scan Was Needed

The previous ORNL work had two reliability problems:

- `ornl-open-positions-2026-06.json` explicitly marked the Parallel result as incomplete. It fully extracted only 3 positions and partially identified a few others.
- The Jobs to Consider dashboard later marked the three ORNL roles as `closed`, but the stored liveness reason was a navigation error (`ERR_NETWORK_IO_SUSPENDED`), not evidence that ORNL had closed the postings.

The current official ORNL listing shows 124 live postings. The three earlier dashboard roles are still present:

- Applications Engineer - Advanced Manufacturing
- Control System Software Engineer
- Instrument Design Engineer

So those were false closures and have been restored to `to_consider` with active liveness.

## Current Shortlist

### 1. Control System Software Engineer (Req 16433)

**URL:** [ORNL posting](https://jobs.ornl.gov/job/Oak-Ridge-Control-System-Software-Engineer-TN-37830/1390611000/)  
**Status:** active in official ORNL listing  
**Score:** 3.9/5  
**Why:** Best reachable ORNL fit. The role accepts BS + 2 years or relevant MS + 1 year and maps to Linux control applications, embedded/systems programming, hardware interfaces, FPGA-adjacent troubleshooting, and scientific facility controls.

**Risk:** No visa sponsorship. C++/EPICS are the main technical gaps.

### 2. Applications Engineer - Advanced Manufacturing (Req 16196)

**URL:** [ORNL posting](https://jobs.ornl.gov/job/Knoxville-Applications-Engineer-Advanced-Manufacturing-TN-37932/1379754100/)  
**Status:** active in official ORNL listing  
**Score:** 3.8/5  
**Why:** Strong overlap with sensor instrumentation, real-time DAQ software, calibration quality, Python, CAD, and manufacturing measurement systems.

**Risk:** Requires BS + 4 years. No visa sponsorship.

### 3. Instrument Design Engineer (Req 16596)

**URL:** [ORNL posting](https://jobs.ornl.gov/job/Oak-Ridge-Instrument-Design-Engineer-TN-37830/1398654400/)  
**Status:** active in official ORNL listing  
**Score:** 3.6/5  
**Why:** Strong thematic match with HFIR/SNS scientific instruments, CAD, vacuum/pressure-vessel-adjacent work, validation testing, and multidisciplinary technical teams.

**Risk:** Requires BS + 5 years. No visa sponsorship.

### 4. Beam Instrumentation Systems Lead (Req 16335)

**URL:** [ORNL posting](https://jobs.ornl.gov/job/Oak-Ridge-Beam-Instrumentation-Systems-Lead-TN-37830/1386142900/)  
**Status:** active in official ORNL listing  
**Score:** 3.4/5  
**Why:** Newly relevant compared with the earlier dashboard state. It directly touches SNS beam instrumentation, diagnostic/control systems, NI/LabVIEW, motion control, instrumentation calibration, vacuum systems, RF measurement equipment, and large scientific user facility work.

**Risk:** The level is high: BS in electrical engineering technology or related field plus at least 5 years. It is a stretch/recruiter-outreach target, not the first application.

### 5. Technical Professional Staff Member - Mechanical Design and Test Engineer (Temporary)

**URL:** [ORNL posting](https://jobs.ornl.gov/job/Oak-Ridge-Technical-Professional-Staff-Member-Mechanical-Design-and-Test-Engineer-%28Temporary%29-TN-37830/1403782600/)  
**Status:** active in official ORNL listing  
**Score:** 3.7/5  
**Why:** Strongest temporary technical match. The posting asks for mechanical design, integration, testing and verification of advanced additive manufacturing systems; CAD models, assemblies, drawings, sensor integrations, fixtures, test methods, programming for test automation, data processing, and hardware integration all map well to Harsh's profile.

**Risk:** Serious export-control risk. The posting says candidates must be qualified for access to export-controlled technology without an export-control license. Harsh is on F-1 OPT and is a foreign person for export-control purposes. Added to the dashboard because the user explicitly asked to include it, but it needs an early recruiter clarification.

### 6. Technician - Grid Systems Hardware (Temporary)

**URL:** [ORNL posting](https://jobs.ornl.gov/job/Oak-Ridge-Technician-Grid-Systems-Hardware-%28Temporary%29-TN-37830/1399116900/)  
**Status:** active in official ORNL listing  
**Score:** 3.1/5  
**Why:** Lower-level but plausibly relevant fallback for hands-on electrical/electronic system build, mechanical tools, high-voltage awareness, and lab hardware support.

**Risk:** Technician-track and below the M.Eng target level. Requires at least 2 years of relevant experience and 480 V electrical system exposure. No visa sponsorship and no relocation assistance.

## High-Fit But Not Shortlisted

### Technical Professional Staff Member - Mechanical Design and Test Engineer (Temporary)

This looked technically strong: mechanical design, test and verification, additive manufacturing systems, SolidWorks, sensors, controls, instrumentation, test stands, and lab equipment.

It was later added to `to_consider` at the user's request, but the export-control risk remains the main caveat.

### HFIR Instrument Support - Electrical

Strong facility-instrument relevance, but the role requires a bachelor's in electrical engineering/electrical engineering technology or related technical field plus at least 5 years of electrical design, maintenance, installation, or support experience. It is more electrical-facility support than Harsh's current instrumentation profile.

### Experiment Project Engineer

Added to `to_consider` with cover letter at user request. Requires ability to obtain and maintain a DOE clearance; no visa sponsorship; BS+5 years in nuclear environment. See `ornl-experiment-project-engineer-16622`.

### I&C System Engineer

Hard skip. Clearance language appears in the posting, and the domain is nuclear facility systems rather than accessible early-career instrumentation.

### Thermal Mechanical Engineer / Maintenance Engineer / Associate Materials Analyst

Not shortlisted because the captured posting text includes clearance, Q clearance, polygraph, or other access restrictions and/or the role is not close enough to Harsh's instrumentation-first profile.

## Internship, Assistantship, and Education-Side Routes

ORNL has a separate education site under `www.ornl.gov/education`, which is not the same as the employee job board. The relevant subpages checked were:

- Undergraduate Student Opportunities
- Recent Graduate Opportunities
- Graduate Student Opportunities
- Postdoctoral Program
- Find a Mentor

The current recent-graduate and graduate pages list these programs:

- DOE Science Undergraduate Laboratory Internships (SULI)
- ORNL Research Student Internships (RSI)
- ORNL Technical and Professional Internships (TPI)
- Graduate Research at ORNL (GRO)
- DOE Office of Science Graduate Student Research (SCGSR)
- NNSA IMPACT
- GEM Fellowship
- SkillBridge Military Internship

Findings for Harsh:

- RSI Fall 2026 is not viable now because the Zintellect page requires U.S. citizen or lawful permanent resident status.
- TPI Fall 2026 is not viable now because the Zintellect page requires U.S. citizen or lawful permanent resident status.
- SULI is also U.S. citizen/lawful permanent resident gated.
- SkillBridge is only for active-duty U.S. military personnel.
- SCGSR is for thesis-based doctoral students conducting dissertation research at a DOE national laboratory.
- GRO is a mentor-first thesis/dissertation route for students actively enrolled in a master's or doctoral program requiring original research. **Added to dashboard** (`ornl-gro-graduate-research-opportunities`) after user correction — it had been documented but wrongly omitted.
- Find-a-mentor pathway added via ORNL staff directory (`ornl-find-a-mentor`).
- SCGSR, UT-ORII PhD Programs, GEM Fellowship, and postdoc board filter also added as `to_consider` research routes (see `WEB-TRACKER/research/ornl-graduate-research-pathways-2026.md`).
- NNSA IMPACT is national-security-oriented and not a good match for F-1/no-clearance constraints.

So the hidden education-side routes are now on the dashboard. RSI/TPI/SULI remain excluded (U.S. citizen/LPR). The practical ORNL employee path remains postings without Q/L clearance where possible, **plus GRO mentor outreach as the highest-priority research route.**

### Experiment Project Engineer (Req 16622)

Added to dashboard with cover letter. **Hard constraints:** DOE clearance required, BS+5 years nuclear environment, no visa sponsorship. Score 2.4/5 — user-requested application pack.

## Filter Applied Across The 124 Roles

The scan used the current profile constraints:

- F-1 OPT now, sponsorship needed after OPT/STEM OPT.
- Not eligible for U.S. security clearance.
- Not a U.S. person for ITAR/EAR purposes.
- Strongest target axes: plasma diagnostics, detector readout, HV/DAQ automation, ion optics, scientific instrumentation, test engineering, and systems-level lab hardware.

Hard skips included:

- Postdoctoral roles requiring a PhD.
- Roles requiring Q/L clearance or U.S. citizenship.
- Roles requiring unrestricted export-control access without a license.
- Senior director/manager/group-leader roles.
- Pure administrative, radiological technician, security, craft labor, and unrelated HPC/geospatial roles.

## Dashboard Changes

Updated `data/jobs-to-consider.json` and synced `WEB-TRACKER/data/jobs-to-consider.json`:

- Restored `ornl-control-system-software-engineer-16433` to `to_consider`, `liveness: active`.
- Restored `ornl-applications-engineer-advanced-manufacturing-16196` to `to_consider`, `liveness: active`.
- Restored `ornl-instrument-design-engineer-16596` to `to_consider`, `liveness: active`.
- Added `ornl-beam-instrumentation-systems-lead-16335` as a stretch `to_consider` role.
- Added `ornl-mechanical-design-and-test-engineer-temporary-1403782600` as a high-fit but export-control-risk temporary role.
- Added `ornl-technician-grid-systems-hardware-temporary-1399116900` as a lower-level temporary hardware fallback.

Generated or linked resume and cover-letter resources for all six ORNL `to_consider` roles.
