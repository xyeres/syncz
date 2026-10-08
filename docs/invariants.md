# Syncz — Domain Invariants

Rules the system must enforce, grouped by module. These drive the aggregate design for the domain layer.

**Scope tags**

- **[A] Aggregate** — enforced inside a single aggregate root, transactionally.
- **[X] Cross-aggregate** — spans aggregates; enforced by a domain service / policy (may be eventually consistent).
- **[P] Projection** — a guarantee about a derived read model, not a write-side rule.

**Global conventions**

- Aggregates are consistency boundaries, not object containers. Aggregates reference each other **by ID only**.
- Money is integer **cents**, single currency **USD**.
- Percentages are integer **hundredths of a percent** ("bps", 10000 = 100.00%).
- A rejected command is never silent: the domain returns the violated invariant(s), and the UI shows the user why.

---

## Account / Channel — root: `Account`

1. **ACC-1 [A]** An account is linked to exactly one YouTube channel. Videos, splits, collaborators, reports and payments are all scoped to that channel.
2. **ACC-2 [A]** Revenue figures come from YouTube and are read-only. The app never creates or edits revenue.

## Splits — root: `Split`

References: `VideoId[]`, `CollaboratorId[]`

1. **SPL-1 [A]** On save, shares total exactly 100.00% (10000 bps). Drafts may be incomplete.
2. **SPL-2 [A]** Shares are integer hundredths of a percent, never floats.
3. **SPL-3 [A]** Every collaborator share is at least 0.10% (10 bps). 0% shares are not allowed.
4. **SPL-4 [A]** The owner appears exactly once in every split and cannot be removed. The owner's share may be 0% (the owner may give away 100%); if non-zero it follows SPL-3.
5. **SPL-5 [A]** A collaborator appears at most once in a split.
6. **SPL-6 [A]** A split has a non-blank name and at least one video.
7. **SPL-7 [X]** A video belongs to at most one split at a time.
8. **SPL-8 [X]** A split only references videos from the linked channel and collaborators that are not deleted.
9. **SPL-9 [A]** Split percentages apply to whole months — no mid-month effective dating. The split as it stands when a report revision is created applies to that entire month.
10. **SPL-10 [X]** Editing or deleting a split never changes an existing report revision. Only Recalculate does.
11. **SPL-11 [A]** A split may be deleted at any time. Deletion releases its videos (they become available to other splits) and only affects report revisions created afterwards. Report revisions keep the split's name in their snapshot.

## Collaborators — root: `Collaborator`

1. **COL-1 [A]** A collaborator has a non-blank name and a valid email address.
2. **COL-2 [X]** Email is unique per channel (trimmed, case-insensitive). Soft-deleted collaborators still hold their email. A collaborator may not use the owner's email.
3. **COL-3 [A]** Role is one of the predefined roles, or "Other" with a non-blank custom label.
4. **COL-4 [X]** A collaborator cannot be deleted while referenced by any split.
5. **COL-5 [A]** Deletion is a soft delete. Identity is retained so payments and report history stay meaningful.
6. **COL-6 [X]** Editing a collaborator never alters existing report revisions or statements.
7. **COL-7 [A]** The owner is not a collaborator: it cannot be edited, deleted, or paid through the app.

## Reports — root: `MonthlyReport`

References: `ChannelId`, `CollaboratorId` (with snapshotted name/email), `VideoId` (with snapshotted title), `SplitId`

1. **REP-1 [X]** At most one report per channel per calendar month.
2. **REP-2 [A]** A report covers exactly one calendar month that has already ended. The latest month that can be generated is always last month. No current or future months.
3. **REP-3 [A]** Revenue is frozen when the month's report is first generated (Revision 1). Later revisions reuse the frozen revenue and never re-fetch it.
4. **REP-4 [A]** All allocation lines in a revision (owner included) sum **exactly** to the frozen gross revenue, to the cent.
5. **REP-5 [A]** A collaborator's per-video amount is `floor(videoRevenue × bps / 10000)` cents (always rounded down). The owner absorbs the remainder per video, so the owner's amount is never negative, even at 0%.
6. **REP-6 [A]** A collaborator's amount due in a revision equals the sum of their per-video amounts.
7. **REP-7 [A]** A revision's snapshot is immutable. Only Recalculate creates a new revision. Revision numbers start at 1 and increase by exactly 1. Prior revisions are never rewritten.
8. **REP-8 [A]** A revision snapshots each collaborator's name and email as they were at that moment.
9. **REP-9 [A]** The activity log is append-only.
10. **REP-10 [A]** Reports cannot be deleted.
11. **REP-11 [A]** A recalculation must change something: at least one party's amounts (due or per-video lines) or snapshotted details (name, email). A recalculation that would produce an identical revision is rejected, and no revision is created.

## Payments — root: `PaymentLedger` (one per collaborator per period)

References: `ReportId`, `CollaboratorId`

1. **PAY-1 [A]** Payment records are append-only. They are never edited or deleted.
2. **PAY-2 [A]** A payment amount is greater than zero. (Reversals and settlements are negative entries.)
3. **PAY-3 [A]** A reversal cancels exactly one earlier payment, for exactly its amount. A payment can be reversed at most once.
4. **PAY-4 [A]** Net paid for a collaborator/period is never negative.
5. **PAY-5 [X]** Payments can only be recorded against a generated report, for a collaborator present on that report.
6. **PAY-6 [X]** "Mark paid" is the only way to record a payment. It records exactly the current balance (current revision's due − net paid), and only when that balance is greater than zero. There are no partial or arbitrary-amount payments.
7. **PAY-7 [A]** Overpayment is allowed and surfaced. It is settled outside the app and then recorded as a settlement (PAY-9). It is never auto-corrected or carried forward to another period.
8. **PAY-8 [X]** Recalculation never creates, modifies, or removes payments or settlements.
9. **PAY-9 [A]** A settlement can only be recorded when the balance is below zero. Its amount is exactly the overpaid amount, so the balance returns to $0. There is a single settlement type; an optional note may describe how it was settled. Settlements are undone by reversal, like payments.

## Statements — projection of `MonthlyReport` (not an aggregate)

1. **STM-1 [P]** A statement renders exactly one report revision. Its total equals that collaborator's due in that revision.
2. **STM-2 [P]** A statement is flagged "resend" if and only if the collaborator's current due differs from their due in the last revision marked sent (or Revision 1 if none was marked sent).
3. **STM-3 [A]** "Mark sent" can only reference the report's current revision, for a collaborator who appears on any revision of the report (including one who dropped to $0). A collaborator's sent revision never moves backwards. *(Owned by `MonthlyReport`.)*

---

## Decision log

| Date | Decision |
|---|---|
| 2026-10-07 | Minimum collaborator share is 0.10%. 0% shares forbidden. |
| 2026-10-07 | Owner may give away 100% (owner share may be 0%). |
| 2026-10-07 | Revenue is frozen at first report generation. Recalculate only re-applies splits. |
| 2026-10-07 | Reports cannot be deleted. |
| 2026-10-07 | Single currency: USD. |
| 2026-10-07 | Payments are their own aggregate (`PaymentLedger`), referencing report and collaborator by ID. |
| 2026-10-07 | Overpayments are surfaced, never carried forward. |
| 2026-10-07 | Overpayments settled outside the app are recorded as a single settlement type (no returned/forgiven distinction). |
| 2026-10-07 | Collaborators may not use the owner's email; deleted collaborators keep their email reserved. |
| 2026-10-07 | No mid-month reports: the latest reportable month is always last month. |
| 2026-10-07 | Domain rule violations are never silent; the user always sees why an action was rejected. |
| 2026-10-07 | Splits can be deleted at any time; deletion frees their videos and never alters existing reports. |
| 2026-10-07 | No partial payments: "Mark paid" always records the full balance. |
| 2026-10-07 | A recalculation must change at least one line (REP-11). |
| 2026-10-07 | Collaborator amounts round down (floor); the owner absorbs the remainder and can never go negative (REP-5). |
| 2026-10-07 | A name/email-only change counts as a change for REP-11, so corrected details can be issued as a new revision. The resend flag (STM-2) still compares amounts only. |
| 2026-10-07 | "Mark sent" works for anyone ever listed on the report, so a $0 resend flag can be cleared. |
| 2026-10-07 | Split drafts live on screen only; they are never persisted. |
| 2026-10-07 | One channel per account; no unlink or switch for now. |

## Open questions

- **Concurrency (noted, low priority):** SPL-7, COL-2 and REP-1 are check-then-act. When persistence lands, back them with unique constraints or optimistic versioning.

- Should Revision 1 be blocked until N days after month end? YouTube revises estimated revenue after the month closes, and REP-3 freezes whatever exists at generation time.
