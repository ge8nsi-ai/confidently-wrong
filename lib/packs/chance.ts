import type { Pack } from "../types";

export const chance: Pack = {
  id: "chance",
  title: "Correlation and chance",
  blurb:
    "Base rates, sample size, and the two or three statistical instincts that are reliably wrong.",
  items: [
    {
      id: "chance-1",
      conceptId: "correlation-causation",
      stem: "Towns with more ice-cream sales also have more drownings. What follows?",
      options: [
        {
          id: "a",
          text: "Ice cream contributes to drowning.",
          correct: false,
          misconception: "A strong correlation implies a causal link.",
        },
        {
          id: "b",
          text: "Something else, such as hot weather, plausibly drives both.",
          correct: true,
        },
        {
          id: "c",
          text: "Nothing whatsoever; correlations carry no information.",
          correct: false,
          misconception:
            "Because correlation is not causation, correlation is worthless.",
        },
        {
          id: "d",
          text: "Drowning risk causes people to buy ice cream.",
          correct: false,
          misconception:
            "If the causal direction is unclear, reversing it resolves the puzzle.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe that because the two move together so tightly, one must be feeding the other.",
        wrong:
          "Both figures climb in July and fall in January, tracking temperature rather than each other.",
        actual:
          "A shared cause produces correlation without any direct link. Hot days push both swimming and ice-cream buying up at once, which explains the pattern you noticed without ice cream doing anything.",
      },
    },
    {
      id: "chance-2",
      conceptId: "gamblers-fallacy",
      stem: "A fair coin has landed heads six times running. What is the chance the next flip is tails?",
      options: [
        {
          id: "a",
          text: "Higher than half — tails is overdue.",
          correct: false,
          misconception:
            "Past independent outcomes change the odds of the next one, so results 'even out'.",
        },
        {
          id: "b",
          text: "Exactly half; the coin has no memory.",
          correct: true,
        },
        {
          id: "c",
          text: "Lower than half — heads is clearly on a run.",
          correct: false,
          misconception: "Streaks are self-sustaining in fair random processes.",
        },
        {
          id: "d",
          text: "Impossible to say without knowing how many flips remain.",
          correct: false,
          misconception:
            "The probability of an independent event depends on the length of the series.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe a tails is now due because the run of heads has to be balanced out.",
        wrong:
          "The coin carries no record of the previous six flips; each toss is decided by its own physics at fifty-fifty.",
        actual:
          "Long-run balance emerges because rare streaks get diluted by many ordinary flips, not because later flips compensate for earlier ones. That is why the ratio settles near half without any single flip ever being 'owed'.",
      },
    },
    {
      id: "chance-3",
      conceptId: "base-rate",
      stem: "A test for a disease affecting 1 in 1,000 people is 99% accurate. Someone tests positive. Roughly how likely is it they have the disease?",
      options: [
        {
          id: "a",
          text: "About 99%.",
          correct: false,
          misconception:
            "Test accuracy is the probability of disease given a positive result; base rates can be ignored.",
        },
        {
          id: "b",
          text: "About 9%.",
          correct: true,
        },
        {
          id: "c",
          text: "About 50%, since the test could go either way.",
          correct: false,
          misconception:
            "Uncertainty defaults to a coin flip regardless of the numbers.",
        },
        {
          id: "d",
          text: "About 1 in 1,000, the same as before the test.",
          correct: false,
          misconception: "A positive result carries no information at all.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe a 99% accurate test that comes back positive means roughly a 99% chance of disease.",
        wrong:
          "Test 1,000 people: about 1 truly has it, and about 10 healthy people also test positive, so a positive is wrong roughly ten times out of eleven.",
        actual:
          "The answer depends on how rare the condition is, not just on the test's accuracy. When the disease is rare, false positives drawn from the huge healthy majority swamp the handful of true positives.",
      },
    },
    {
      id: "chance-4",
      conceptId: "sample-size",
      stem: "Two surveys estimate the same national figure — one polls 40 people, the other 4,000. What should you expect?",
      options: [
        {
          id: "a",
          text: "The 40-person survey will bounce around far more from sample to sample.",
          correct: true,
        },
        {
          id: "b",
          text: "Both are equally trustworthy if both samples were drawn at random.",
          correct: false,
          misconception:
            "Random selection makes small samples as reliable as large ones.",
        },
        {
          id: "c",
          text: "The small survey is more reliable because the data is easier to check.",
          correct: false,
          misconception: "Smaller datasets are cleaner and therefore better.",
        },
        {
          id: "d",
          text: "Sample size affects cost but not accuracy.",
          correct: false,
          misconception: "Sample size is a budget question, not a precision one.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe that as long as a sample is random, forty people tell you as much as four thousand.",
        wrong:
          "Randomness removes bias, not noise: a random sample of forty has roughly ten times the spread of a random sample of four thousand.",
        actual:
          "Small samples are unbiased but volatile, so they land far from the truth more often. That is why tiny studies produce the most extreme results in both directions and are the first to fail replication.",
      },
    },
    {
      id: "chance-5",
      conceptId: "small-sample-extremes",
      stem: "Which hospitals report the highest rates of unusual outcomes, both very good and very bad?",
      options: [
        {
          id: "a",
          text: "The smallest ones, because few cases make rates swing wildly.",
          correct: true,
        },
        {
          id: "b",
          text: "The largest ones, because they treat the hardest cases.",
          correct: false,
          misconception:
            "Extreme rates come from real differences in case mix rather than from sample size.",
        },
        {
          id: "c",
          text: "Mid-sized ones, which sit in the statistical danger zone.",
          correct: false,
          misconception: "Variability peaks at intermediate sample sizes.",
        },
        {
          id: "d",
          text: "Size is irrelevant; only quality of care matters.",
          correct: false,
          misconception:
            "Observed rates reflect quality alone, with no statistical noise.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe hospitals showing the most extreme outcome rates must genuinely differ in what they do.",
        wrong:
          "In national datasets the very best and the very worst rates come from the same place: the smallest hospitals.",
        actual:
          "With few cases, one or two events swing a percentage enormously. Ranking by raw rate therefore mostly ranks by sample size, which is why the same small hospitals appear at both ends of the table.",
      },
    },
    {
      id: "chance-6",
      conceptId: "regression-to-mean",
      stem: "The worst-performing branches get extra coaching and improve the next quarter. What is the safest conclusion?",
      options: [
        {
          id: "a",
          text: "Some of the rise is regression to the mean; the coaching effect is unproven without a control.",
          correct: true,
        },
        {
          id: "b",
          text: "The coaching worked, since branch performance rose right after it.",
          correct: false,
          misconception:
            "Improvement following an intervention demonstrates the intervention caused it.",
        },
        {
          id: "c",
          text: "The coaching failed, since the branches are still below average.",
          correct: false,
          misconception:
            "An intervention only works if it fully closes the gap.",
        },
        {
          id: "d",
          text: "Nothing can ever be learned from before-and-after data.",
          correct: false,
          misconception:
            "Before-and-after comparisons are inherently uninformative.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe the rebound after coaching shows the coaching was what lifted performance.",
        wrong:
          "Groups selected for being extreme drift back toward average on their own, even with no intervention at all.",
        actual:
          "Picking the worst quarter selects partly for genuine weakness and partly for bad luck, and the luck does not repeat. Only a similar group left uncoached can tell you how much of the rebound the coaching actually bought.",
      },
    },
    {
      id: "chance-7",
      conceptId: "conjunction",
      stem: "Which is more probable for a randomly chosen adult: (i) they cycle to work, or (ii) they cycle to work and own a road bike?",
      options: [
        {
          id: "a",
          text: "(i) — it can never be less likely than a more specific version of itself.",
          correct: true,
        },
        {
          id: "b",
          text: "(ii) — the detail makes it a more convincing description.",
          correct: false,
          misconception:
            "A more detailed, coherent story is more probable than a general one.",
        },
        {
          id: "c",
          text: "They are exactly equally likely.",
          correct: false,
          misconception:
            "Adding a condition leaves probability unchanged.",
        },
        {
          id: "d",
          text: "It depends entirely on how many people own road bikes.",
          correct: false,
          misconception:
            "The comparison could reverse given the right ownership rate.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe the richer, more specific description is the likelier one because it hangs together better.",
        wrong:
          "Every person satisfying (ii) also satisfies (i), so (ii)'s group is a subset and can never be larger.",
        actual:
          "Each extra condition can only shrink the set of people who qualify. Detail makes a story feel plausible while making it strictly less probable, which is the trap the question is built on.",
      },
    },
  ],
};
