import type { Pack } from "../types";

export const seasons: Pack = {
  id: "seasons",
  title: "Why summer is hot",
  blurb:
    "Earth's tilt, sunlight angle, and the distance myth almost everyone carries out of school.",
  items: [
    {
      id: "seasons-1",
      conceptId: "cause-of-seasons",
      stem: "What is the main reason summer is hotter than winter where you live?",
      sourceNote: "Earth's orbit is very nearly circular; tilt does the work.",
      options: [
        {
          id: "a",
          text: "Earth is closer to the Sun during summer.",
          correct: false,
          misconception:
            "Seasons are caused by Earth's changing distance from the Sun.",
        },
        {
          id: "b",
          text: "Earth's axis is tilted, so sunlight strikes your hemisphere at a steeper angle for longer each day.",
          correct: true,
        },
        {
          id: "c",
          text: "The Sun burns hotter at certain times of year.",
          correct: false,
          misconception: "The Sun's output rises and falls with our seasons.",
        },
        {
          id: "d",
          text: "Earth spins faster in summer, so days are longer.",
          correct: false,
          misconception: "Day length changes because Earth's spin rate changes.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe summer is hot because Earth swings closer to the Sun at that time of year.",
        wrong:
          "Earth is actually closest to the Sun in early January, in the middle of the northern winter.",
        actual:
          "Earth's axis is tilted about 23.5 degrees, so in your summer your hemisphere leans toward the Sun. Sunlight arrives at a steeper angle and for more hours per day, which is what makes it feel hotter.",
      },
    },
    {
      id: "seasons-2",
      conceptId: "perihelion",
      stem: "When is Earth actually closest to the Sun?",
      options: [
        {
          id: "a",
          text: "Early January.",
          correct: true,
        },
        {
          id: "b",
          text: "Early July.",
          correct: false,
          misconception:
            "Closest approach to the Sun lines up with northern summer.",
        },
        {
          id: "c",
          text: "At both equinoxes, in March and September.",
          correct: false,
          misconception: "Equinoxes mark the points of closest approach.",
        },
        {
          id: "d",
          text: "The distance never changes.",
          correct: false,
          misconception: "Earth's orbit is a perfect circle.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe Earth reaches its closest point to the Sun during the northern summer.",
        wrong:
          "Closest approach, called perihelion, falls in the first days of January — northern midwinter.",
        actual:
          "Earth's orbit is a very slightly squashed circle, and the timing of its closest point has nothing to do with our seasons. The tilt of the axis, not the few million kilometres of orbital variation, sets which hemisphere gets summer.",
      },
    },
    {
      id: "seasons-3",
      conceptId: "hemispheres",
      stem: "It is July in London. What season is it in Sydney?",
      options: [
        {
          id: "a",
          text: "Summer, the same as London.",
          correct: false,
          misconception:
            "Both hemispheres share the same season at the same time.",
        },
        {
          id: "b",
          text: "Winter, the opposite of London.",
          correct: true,
        },
        {
          id: "c",
          text: "Sydney has no seasons because it is far south.",
          correct: false,
          misconception: "Seasons only exist in the northern hemisphere.",
        },
        {
          id: "d",
          text: "Autumn, because seasons shift by three months per hemisphere.",
          correct: false,
          misconception: "Seasons lag by a quarter year between hemispheres.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe the whole planet moves through the same season at the same time.",
        wrong:
          "Australians hold beach Christmases in the middle of their summer while Europe is under snow.",
        actual:
          "One end of the tilted axis leans toward the Sun while the other leans away, so the hemispheres are always in opposite seasons. That is exactly what a distance-based explanation cannot account for: both hemispheres sit at the same distance from the Sun.",
      },
    },
    {
      id: "seasons-4",
      conceptId: "equator",
      stem: "Why does the equator stay warm all year with little seasonal swing?",
      options: [
        {
          id: "a",
          text: "Because it is the part of Earth nearest to the Sun.",
          correct: false,
          misconception:
            "The equator is warm because it is physically closer to the Sun.",
        },
        {
          id: "b",
          text: "Because sunlight lands nearly straight down there all year, so the angle barely changes.",
          correct: true,
        },
        {
          id: "c",
          text: "Because the equator is unaffected by Earth's tilt in any way.",
          correct: false,
          misconception:
            "The tilt has literally no effect at the equator, so nothing changes there.",
        },
        {
          id: "d",
          text: "Because equatorial regions receive no winter darkness at all, unlike everywhere else.",
          correct: false,
          misconception:
            "Only the equator has daylight all year; elsewhere the Sun disappears in winter.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe the equator is hot because that bulge of Earth sits closer to the Sun.",
        wrong:
          "The few kilometres of equatorial bulge are nothing next to 150 million kilometres of distance to the Sun.",
        actual:
          "Near the equator the Sun passes close to overhead throughout the year, so each square metre of ground collects concentrated light in every month. The angle of arrival, not the distance, is what keeps it warm.",
      },
    },
    {
      id: "seasons-5",
      conceptId: "sun-overhead",
      stem: "At noon in midsummer in Paris, where is the Sun?",
      options: [
        {
          id: "a",
          text: "Directly overhead, at the zenith.",
          correct: false,
          misconception:
            "The noon Sun is directly overhead everywhere, at least in summer.",
        },
        {
          id: "b",
          text: "High in the sky but still clearly south of straight up.",
          correct: true,
        },
        {
          id: "c",
          text: "Exactly halfway up the sky, at 45 degrees, every day of the year.",
          correct: false,
          misconception: "The noon Sun sits at a fixed height year round.",
        },
        {
          id: "d",
          text: "Directly north of straight up.",
          correct: false,
          misconception:
            "In the northern hemisphere the noon Sun appears to the north.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe the midday Sun climbs to straight overhead, at least in summer.",
        wrong:
          "The Sun only ever reaches true overhead between the tropics; Paris sits well north of that band, so its shadows never vanish at noon.",
        actual:
          "The highest the noon Sun gets depends on your latitude and the tilt of the axis. In Paris it tops out roughly 65 degrees above the horizon in June, which is why summer noon shadows are short but never absent.",
      },
    },
    {
      id: "seasons-6",
      conceptId: "sunlight-angle",
      stem: "Why does light arriving at a shallow angle heat the ground less?",
      options: [
        {
          id: "a",
          text: "Because the same amount of energy is spread over a larger patch of ground.",
          correct: true,
        },
        {
          id: "b",
          text: "Because slanted light has travelled further from the Sun and cooled down on the way.",
          correct: false,
          misconception: "Sunlight loses heat during its journey.",
        },
        {
          id: "c",
          text: "Because slanted light is a different, weaker kind of light.",
          correct: false,
          misconception: "Low-angle sunlight is intrinsically weaker radiation.",
        },
        {
          id: "d",
          text: "It does not; angle makes no difference to heating.",
          correct: false,
          misconception: "The angle of incidence is irrelevant to warming.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe slanted sunlight is weaker because of something that happens to it on the way here.",
        wrong:
          "A torch held straight at a wall makes a small bright circle; tilt it and the same beam smears into a dim ellipse. Nothing about the beam changed.",
        actual:
          "A tilted surface intercepts the same beam across a wider footprint, so each square metre receives a smaller share of the energy. This is the whole mechanism behind seasons and behind the cold poles.",
      },
    },
    {
      id: "seasons-7",
      conceptId: "lag",
      stem: "The longest day in the northern hemisphere is around 21 June, yet the hottest weeks usually come in late July. Why?",
      options: [
        {
          id: "a",
          text: "Land and oceans take weeks to accumulate heat, so peak temperature lags peak sunlight.",
          correct: true,
        },
        {
          id: "b",
          text: "Earth keeps moving closer to the Sun after June.",
          correct: false,
          misconception: "Temperature tracks decreasing distance to the Sun.",
        },
        {
          id: "c",
          text: "The tilt keeps increasing until late July.",
          correct: false,
          misconception: "Earth's axial tilt changes over the course of a year.",
        },
        {
          id: "d",
          text: "Thermometers are calibrated to lag the solstice.",
          correct: false,
          misconception: "The lag is a measurement artefact, not physical.",
        },
      ],
      fallbackRefutation: {
        believe:
          "You believe the hottest weeks arrive later because Earth is still closing in on the Sun.",
        wrong:
          "Earth is in fact moving away from the Sun through July, heading toward its farthest point in early July and beyond.",
        actual:
          "Oceans, soil, and air store heat, so temperature keeps rising while incoming sunlight still exceeds outgoing heat. Peak warmth therefore trails the solstice by several weeks, exactly like a pan that keeps heating after you turn the flame down.",
      },
    },
  ],
};
