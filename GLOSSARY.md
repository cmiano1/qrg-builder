# QRG Builder

A cross-platform skill and tooling kit for authoring, checking, reviewing, and releasing Quick Reference Guides without requiring paid desktop Office software.

## Language

**QRG**:
A short, evergreen, US Letter Quick Reference Guide covering one task for one role.
_Avoid_: job aid, work instruction, manual

**Set**:
A single audience or role group within a project (for example, Unit 1 Investigators).
_Avoid_: group, batch, folder

**Guide Source**:
The master authoring definition of a QRG's text, structure, and screenshot references, from which deliverables are generated.
_Avoid_: guide file, source doc

**Working Deliverable**:
An editable Word document designed for Google Docs compatibility and shared with a client during review and comment rounds.
_Avoid_: draft PDF, final copy

**Final Deliverable**:
The approved, clean-named Word document handed over after client comment rounds finish, with an optional matching PDF copy generated when requested.
_Avoid_: working copy, raw build

**Render**:
The visual PDF and per-page images generated from a build so an author or reviewer can inspect the exact page layout.
_Avoid_: screenshot, preview doc

**Review Lock**:
A cryptographic fingerprint recording that a specific built version passed inspection and must not change before release.
_Avoid_: freeze, seal

**OK List**:
The reviewer's sign-off tracker for marking locked QRGs as approved to send or needing fixes.
_Avoid_: checklist, sign-off sheet

**Send Copy**:
A clean-named release copy of an approved, locked QRG staged locally for a human to deliver.
_Avoid_: published file, upload

**Kit**:
The runnable tooling bundle inside the skill that generates, checks, renders, and stages QRGs.
_Avoid_: skill (when referring only to the runnable scripts)

**Skill**:
The complete shareable package combining the AI instructions, writing rules, and the kit.
_Avoid_: kit (when referring to the full package including instructions)
