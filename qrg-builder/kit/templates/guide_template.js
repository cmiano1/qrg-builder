// ---- __NN__: __TITLE__ ----
// Sources (newest first, with dates and times): __SOURCES__
// Figures: assets/__KEY____NN__/annotate.json
// Left out until answered (also in the work log): __LEFT_OUT__
//
// Rules this file follows (references/content_rules.md has the full list):
//   - Section order is fixed by qrg.config.json "sections". Write every step as an instruction the reader can do now.
//   - A step you could not confirm (shown on screen, or stated by the process owner) is LEFT OUT and logged, not hedged.
//   - No other guide by title or number, no people's names, no dates, no session or build words.
//   - **Bold** = the on-screen label, spelled exactly as the screen shows it.
//   - One continuous "steps" list. Badge numbers in a figure = the step numbers in its caption.
//   - Put num(..., "steps", true) on the step just before a figure only if you need it; the build keeps every run of
//     steps with the figure after it.
//   - afig(K, "<out png>", "Figure N. <what it shows> (step X)" | "(steps X and Y)" | "(steps X to Y)", <width in>)
//     Keep the call on one line with K as the first argument: the annotator reads the width from it.
// Remove every TODO before a live build. The QA fails on TODO on purpose.
module.exports = (H) => {
  const { h2, h3, para, num, bullet, callout, refTable, titleBlock, afig } = H;
  const K = H.key("__NN__");
  return {
    title: "__TITLE__",
    subtitle: "__SUBTITLE__",
    build() {
      const b = [];
      b.push(...titleBlock(this.title, this.subtitle));

      b.push(h2("Purpose"));
      b.push(para("TODO: one or two sentences. What this task is and why the reader does it."));

      b.push(h2("Who does this"));
      b.push(bullet("**Who:** TODO: the role, as the reader would name it."));
      b.push(bullet("**When:** TODO: the trigger. What tells the reader it is time to do this?"));

      b.push(h2("Before you start"));
      b.push(bullet("TODO: what must be true first (access, a record in a given status, a document at hand)."));

      b.push(h2("Steps"));
      b.push(h3("TODO: a short name for the first part"));
      b.push(num("TODO: the first step."));
      b.push(num("TODO: the second step."));
      // b.push(...afig(K, "__KEY_LOWER____NN___f01_name.png", "Figure 1. TODO what it shows (steps 1 and 2).", 6.0));
      b.push(callout("TODO: a tip, or delete this line.", "tip"));

      b.push(h2("What happens next"));
      b.push(para("TODO: what the reader sees when it worked, and what happens downstream (who is told, what changes, where it shows)."));

      b.push(h2("Troubleshooting"));
      b.push(refTable(
        ["Situation", "What to do"],
        [
          ["TODO: what the reader sees", "TODO: what to do about it"],
        ],
        [3400, 5800]
      ));
      return b;
    },
  };
};
