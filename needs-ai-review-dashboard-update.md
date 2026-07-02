# Deep Research: Needs AI Review Page

## Executive Summary

The "Needs AI Review" page should be treated as a Human-in-the-Loop (HITL) review queue, not as a static task list. Best-practice guidance points to a structured workflow where only selected AI outputs enter review based on routing triggers (low confidence, validator failures, policy risk, or escalation events). The queue should expose explicit states, reviewer actions, and queue health metrics so humans can focus attention where review has the highest impact.

## Practical Update Checklist

1. Show queue lanes (P0/P1/P2) to prioritize urgent work.
2. Show workflow states (New, In review, Needs user, Completed, Failed).
3. Surface queue health metrics:
   - Open queue size
   - In-review count
   - Needs-user count
   - Oldest open item age
4. Keep "copy prompt" action prominent so work can be handed to Cursor quickly.
5. Preserve human final approval (no auto-send, no auto-submit actions).

## New Guardrail for Application Artifacts

Add a review rule for same-company, multi-role applications:

- If a new cover letter is generated for a different role at the same company, require a "materially different" check before completion.
- Reject near-duplicate drafts that only swap role titles.
- Allow "I already applied" language only when a prior application to that company was actually submitted within the last 30 days.
- Require explicit reviewer confirmation when this rule is triggered.

## Source Run

- Run ID: `trun_dd47611047ba4519a094cae029f54fa4`
- Result URL: [parallel deep research run](https://platform.parallel.ai/play/deep-research/trun_dd47611047ba4519a094cae029f54fa4)
