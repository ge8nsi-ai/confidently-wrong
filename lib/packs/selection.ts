import type { Pack } from "../types";

export const selection: Pack = {
  id: "selection",
  title: "How natural selection works",
  blurb:
    "Variation, inheritance, and the difference between a population changing and an individual adapting.",
  items: [
    {
      id: "selection-1",
      conceptId: "individual-vs-population",
      stem: "A population of moths becomes darker over many generations as soot covers the trees. What happened?",
      options: [
        {
          id: "a",
          text: "Individual moths gradually darkened to blend in with the soot.",
          correct: false,
          misconception:
            "Individual organisms adapt their own bodies during their lifetime to suit the environment.",
        },
        {
          id: "b",
          text: "Darker moths already present survived and bred more often, so their share grew.",
          correct: true,
        },
        {
          id: "c",
          text: "The moths sensed the danger and produced darker offspring on purpose.",
          correct: false,
          misconception:
            "Organisms can choose to pass on the traits they need.",
        },
        {
          id: "d",
          text: "Soot stained the moths directly, and the stain was passed to their young.",
          correct: false,
          misconception:
            "Traits acquired during life are passed to offspring.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe each moth adjusted its own colour to match the darkened trees.",
        wrong:
          "An individual moth's wing colour is fixed once it emerges; no moth in the population ever changed shade.",
        actual:
          "Moths already varied in colour before the soot arrived. Predators removed the pale ones more often, so the dark variants left more offspring and came to dominate — the population shifted while every individual stayed the same.",
      },
    },
    {
      id: "selection-2",
      conceptId: "not-goal-directed",
      stem: "Which statement about the direction of evolution is accurate?",
      options: [
        {
          id: "a",
          text: "Evolution is aiming at more complex, more advanced organisms.",
          correct: false,
          misconception:
            "Evolution is goal-directed and progresses toward higher forms.",
        },
        {
          id: "b",
          text: "Evolution has no target; it is the local consequence of which variants happen to reproduce more.",
          correct: true,
        },
        {
          id: "c",
          text: "Evolution works toward whatever the species will need in future environments.",
          correct: false,
          misconception:
            "Selection anticipates future needs of the species.",
        },
        {
          id: "d",
          text: "Evolution always increases the number of species over time in a straight line.",
          correct: false,
          misconception: "Evolution is a steady upward march of diversity.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe evolution is climbing toward something better or more advanced.",
        wrong:
          "Tapeworms and cave fish evolved by losing complex organs their ancestors had, and they thrive.",
        actual:
          "Selection only ever compares variants alive right now in the environment right now. Complexity increases in some lineages and collapses in others, which is why apparent 'progress' shows up in some branches and reversal in others.",
      },
    },
    {
      id: "selection-3",
      conceptId: "variation-precedes-need",
      stem: "Bacteria in a hospital become resistant to an antibiotic. Where did the resistance come from?",
      options: [
        {
          id: "a",
          text: "Resistant mutants were already present or arose by chance, and the drug removed the rest.",
          correct: true,
        },
        {
          id: "b",
          text: "The antibiotic triggered the bacteria to develop resistance because they needed it.",
          correct: false,
          misconception:
            "Traits appear because the organism needs them.",
        },
        {
          id: "c",
          text: "The bacteria learned to resist and taught the next generation.",
          correct: false,
          misconception: "Organisms learn adaptations and transmit them.",
        },
        {
          id: "d",
          text: "The antibiotic simply lost its potency over time on its own.",
          correct: false,
          misconception:
            "Resistance is a property of the drug degrading, not of the population changing.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe the bacteria produced resistance because the antibiotic made it necessary.",
        wrong:
          "Experiments that freeze bacterial samples before any drug is applied still find resistant cells already in the frozen stock.",
        actual:
          "Mutation is blind to what would be useful; variation exists first. The antibiotic then kills the susceptible majority, leaving the rare pre-existing resistant cells to repopulate — which is exactly why resistance appears so quickly.",
      },
    },
    {
      id: "selection-4",
      conceptId: "fitness",
      stem: "In biology, what does it mean for an organism to be 'fitter'?",
      options: [
        {
          id: "a",
          text: "It is physically stronger and beats rivals in direct contests.",
          correct: false,
          misconception:
            "'Survival of the fittest' means the strongest individual wins.",
        },
        {
          id: "b",
          text: "It leaves more surviving offspring in its particular environment.",
          correct: true,
        },
        {
          id: "c",
          text: "It lives the longest.",
          correct: false,
          misconception: "Fitness is measured by lifespan.",
        },
        {
          id: "d",
          text: "It is healthier and better adapted in some absolute, environment-independent sense.",
          correct: false,
          misconception:
            "Fitness is an absolute quality rather than relative to a context.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe fitness is about strength — the tougher animal wins the struggle.",
        wrong:
          "A small drab male bird that mates twice out-reproduces a large dominant one that mates once, and selection tracks the small one.",
        actual:
          "Fitness is simply reproductive output relative to others in the same environment. Camouflage, cooperation, small size, or shorter life can all raise it, which is why the 'strongest wins' reading fails to predict what actually spreads.",
      },
    },
    {
      id: "selection-5",
      conceptId: "mutation-randomness",
      stem: "Which best describes mutations?",
      options: [
        {
          id: "a",
          text: "Random with respect to usefulness; most are neutral or harmful, a few happen to help.",
          correct: true,
        },
        {
          id: "b",
          text: "Almost always beneficial, which is how species improve.",
          correct: false,
          misconception:
            "Mutations are the beneficial upgrades that drive improvement.",
        },
        {
          id: "c",
          text: "Always harmful, so evolution must come from something else.",
          correct: false,
          misconception: "Mutations can only damage, never build.",
        },
        {
          id: "d",
          text: "Directed by the environment toward whatever trait is currently advantageous.",
          correct: false,
          misconception:
            "The environment steers which mutations occur.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe mutations are mostly the helpful upgrades that push a species forward.",
        wrong:
          "In sequenced genomes the overwhelming majority of new mutations are neutral, and clearly harmful ones vastly outnumber clearly helpful ones.",
        actual:
          "Mutation supplies undirected variation, and selection does the filtering afterwards. That two-step split is what explains apparent design without anything doing any designing.",
      },
    },
    {
      id: "selection-6",
      conceptId: "use-disuse",
      stem: "A weightlifter builds enormous muscles over a decade. What do their children inherit?",
      options: [
        {
          id: "a",
          text: "Nothing from the training itself; only the variants the parent already carried.",
          correct: true,
        },
        {
          id: "b",
          text: "A head start on muscle mass, because the parent developed it.",
          correct: false,
          misconception:
            "Characteristics built up through use are inherited by offspring.",
        },
        {
          id: "c",
          text: "Nothing at all, since parents pass on no traits to children.",
          correct: false,
          misconception: "Inheritance does not transmit traits.",
        },
        {
          id: "d",
          text: "The muscles, but only if both parents trained.",
          correct: false,
          misconception:
            "Acquired traits are inherited when both parents acquire them.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe the muscle a parent builds during life gives their children a physical head start.",
        wrong:
          "Generations of blacksmiths did not produce children born with thicker arms, which is the observation that sank inheritance-of-use as a theory.",
        actual:
          "Training changes body tissue, not the sequence in the eggs or sperm being passed on. Children inherit whatever genetic variation the parent already had, which is why athletic families reflect shared genes and shared habits rather than transmitted training.",
      },
    },
    {
      id: "selection-7",
      conceptId: "species-intent",
      stem: "Giraffes have long necks. Which explanation matches how selection actually works?",
      options: [
        {
          id: "a",
          text: "Ancestral giraffes varied in neck length; longer-necked individuals reproduced more, shifting the average over generations.",
          correct: true,
        },
        {
          id: "b",
          text: "Ancestral giraffes stretched for high leaves and their necks lengthened, and their calves were born longer-necked.",
          correct: false,
          misconception:
            "Stretching during life lengthens the neck and the change is inherited.",
        },
        {
          id: "c",
          text: "The species collectively decided long necks were needed.",
          correct: false,
          misconception: "Species make adaptive decisions as a group.",
        },
        {
          id: "d",
          text: "Nature produced long necks because tall trees existed and something had to eat them.",
          correct: false,
          misconception:
            "Adaptations appear because an ecological role needs filling.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe reaching for high leaves lengthened necks and that the gain was handed down.",
        wrong:
          "Stretching a limb does not alter the DNA in the cells that make offspring, so there is no route for the gain to be transmitted.",
        actual:
          "Neck length varied among ancestral giraffes for genetic reasons. Individuals at the longer end fed and mated somewhat more successfully, so each generation started slightly longer-necked — the same observation the stretching story tries to explain, but with a mechanism that exists.",
      },
    },
  ],
};
