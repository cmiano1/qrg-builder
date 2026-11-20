// ---- 01: Log a Call on a Case (worked example) ----
// A complete, QA-clean example guide. The screenshot is a made-up screen (templates/example/make_example_png.js), so
// this guide shows the format only. Delete it, or replace it with a real task, once your first real guide is built.
// Figures: assets/<assetKey>01/annotate.json (two crops of src/example_case.png, badges 1 to 5).
module.exports = (H) => {
  const { h2, h3, para, num, bullet, callout, refTable, titleBlock, afig } = H;
  const K = H.key("01");
  return {
    title: "Log a Call on a Case",
    subtitle: "Record a Phone Call in the Case Activity",
    build() {
      const b = [];
      b.push(...titleBlock(this.title, this.subtitle));

      b.push(h2("Purpose"));
      b.push(para("Use these steps to record a phone call on the case it was about. The call then shows in the case activity, so anyone who opens the case can see what was discussed and when."));

      b.push(h2("Who does this"));
      b.push(bullet("**Who:** Case Workers."));
      b.push(bullet("**When:** right after a phone call about an open case."));

      b.push(h2("Before you start"));
      b.push(bullet("Open the case the call was about."));
      b.push(bullet("Have your notes from the call at hand."));

      b.push(h2("Steps"));
      b.push(h3("Open the call form"));
      b.push(num("On the case, click the **Activity** tab."));
      b.push(num("Click **Log a Call**. The call form opens below the buttons."));
      b.push(...afig(K, "ex01_f01_logacall.png", "Figure 1. The Activity tab and the Log a Call button (steps 1 and 2).", 6.0));

      b.push(h3("Fill in the call and save it"));
      b.push(num("In **Subject**, type a short summary of the call, for example **Called about missing documents**."));
      b.push(num("In **Comments**, add what was discussed and anything you agreed to do."));
      b.push(num("Click **Save**. To leave without saving, click **Cancel** instead."));
      b.push(...afig(K, "ex01_f02_callform.png", "Figure 2. The call form with Subject, Comments, and Save (steps 3 to 5).", 6.0));
      b.push(callout("Log the call while it is fresh. A short, plain **Subject** makes the call easy to find in the activity list later.", "tip"));

      b.push(h2("What happens next"));
      b.push(para("The call shows at the top of the **Activity** tab with your name and the time you saved it. Anyone who can open the case can read it."));

      b.push(h2("Troubleshooting"));
      b.push(refTable(
        ["Situation", "What to do"],
        [
          ["**Log a Call** is not on the **Activity** tab", "Check that you opened the case itself, not a list of cases. The button is on the case record only."],
          ["A message appears when you click **Save**", "Read the message. **Subject** is required, so fill it in and click **Save** again."],
          ["The call is not in the activity list", "Refresh the page. If it is still missing, the form was closed without **Save**. Log the call again."],
        ],
        [3400, 5800]
      ));
      return b;
    },
  };
};
