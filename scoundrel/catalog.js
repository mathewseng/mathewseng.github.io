/* Original encounters: two peoples, many silhouettes, a distinct scene per card. */
(function (root) {
  "use strict";
  const catalog = {
  "2s": {
    "id": "2s",
    "name": "Wick Thief",
    "role": "Ember imp",
    "subject": "Tiny wiry crimson imp with oversized ears and candle-wick horns sneaking across a candle-maker's workbench carrying an enormous stolen candle. Cheeky sideways glance, high three-quarter view, small body against huge wax spools. Golden candlelight, dusty blue windows. A playful theft caught in the act.",
    "lore": "A little light goes a long way in the wrong hands.",
    "race": "Cinderkin",
    "image": "assets/cards/2s.webp"
  },
  "3s": {
    "id": "3s",
    "name": "Kilnback",
    "role": "Ash salamander",
    "subject": "Squat charcoal salamander with chunky terracotta ceramic back plates, glowing ember belly and broad toothy grin, waddling through pale lavender wildflowers on steaming basalt. Full-body side profile, ground-level camera. Sage grass, peach dawn, lavender blooms, warm orange belly, open airy landscape.",
    "lore": "It sleeps in the kiln. The potters have learned to share.",
    "race": "Cinderkin",
    "image": "assets/cards/3s.webp"
  },
  "4s": {
    "id": "4s",
    "name": "Sootwing Courier",
    "role": "Winged scout",
    "subject": "Lean ash-grey bat-winged imp messenger with an orange scarf and leather scroll satchel diving diagonally between tall ochre rooftop chimneys. Arm reaching forward, wings swept back, determined expression. Bird's-eye tilted perspective, tiny town far below. Clear cyan sky, cream clouds, orange scarf; fast graphic silhouette.",
    "lore": "Neither ash nor falling masonry shall delay the post.",
    "race": "Cinderkin",
    "image": "assets/cards/4s.webp"
  },
  "5s": {
    "id": "5s",
    "name": "Copperhorn Brawler",
    "role": "Horned bruiser",
    "subject": "Stocky muscular brick-red Cinderkin with huge curled copper ram horns and mismatched boxing gauntlets laughing while cracking his knuckles in a pottery bazaar. Low three-quarter waist-up close composition, one foreshortened fist. Turquoise awnings, sunlit ceramics, warm skin and white teeth. Broad cheerful silhouette, no helmet.",
    "lore": "He calls it a friendly disagreement. The walls disagree.",
    "race": "Cinderkin",
    "image": "assets/cards/5s.webp"
  },
  "6s": {
    "id": "6s",
    "name": "Glassmoth Seer",
    "role": "Moth oracle",
    "subject": "Floating insectoid Cinderkin seer with four delicate arms, smooth obsidian face and enormous translucent stained-glass moth wings in turquoise, lilac and gold. Suspended sideways over a reflective cavern pool, one hand touching a ripple. Elegant asymmetrical wing composition, full creature visible. Deep blue water, brilliant prismatic wings; graceful and uncanny.",
    "lore": "The future arrives in pieces. She remembers the pattern.",
    "race": "Cinderkin",
    "image": "assets/cards/6s.webp"
  },
  "7s": {
    "id": "7s",
    "name": "Ashstep Duelist",
    "role": "Blade dancer",
    "subject": "Lean ash-white horned Cinderkin woman with short black hair and flowing vermilion sash twisting through a sweeping dual-curved-dagger attack in a rain-soaked courtyard. Athletic full figure in a strong diagonal, three-quarter side view, cloth and rain tracing her spin. Pale jade architecture, scarlet fabric, silver rain, expressive face.",
    "lore": "The first step is a courtesy. The second is a warning.",
    "race": "Cinderkin",
    "image": "assets/cards/7s.webp"
  },
  "8s": {
    "id": "8s",
    "name": "Furnace Hound",
    "role": "Cinder beast",
    "subject": "Massive coal-black mastiff beast with broad angular basalt plates, glowing gold cracks and furnace-bright jaw turning its head toward viewer while striding through a blue-white mountain blizzard. Tight dramatic head-and-shoulders three-quarter composition, enormous paw foreground. Icy cyan snow, amber eyes and molten orange mouth; breath becomes steam.",
    "lore": "Even the mountain takes a step back.",
    "race": "Cinderkin",
    "image": "assets/cards/8s.webp"
  },
  "9s": {
    "id": "9s",
    "name": "Bellows Ogre",
    "role": "Forge giant",
    "subject": "Rotund blue-grey horned Cinderkin ogre glassblower in a leather apron inflating a huge glowing amber glass bubble on a long blowpipe. Oblique high-angle view of an open-air workshop, tiny tools emphasize enormous hands. Round bubble balances round body. Amber glass, steel-blue skin, burgundy roof tiles, afternoon light; personality and craft.",
    "lore": "He makes beautiful things. Usually by accident.",
    "race": "Cinderkin",
    "image": "assets/cards/9s.webp"
  },
  "Ts": {
    "id": "Ts",
    "name": "Coalheart Witch",
    "role": "Ember weaver",
    "subject": "Elderly dark-skinned Cinderkin witch with small curled horns, silver braids and teal embroidered cloak gently releasing three tiny orange firebirds from cupped hands into pale mint swamp mist. Intimate expressive waist-up profile with horizontal arc of birds and wise smile. Teal, cream mist, orange accents, soft daylight and worn fabric.",
    "lore": "She keeps the last warmth of every home she has lost.",
    "race": "Cinderkin",
    "image": "assets/cards/Ts.webp"
  },
  "Js": {
    "id": "Js",
    "name": "Brasswing Lancer",
    "role": "Sky knight",
    "subject": "Bronze-armored horned Cinderkin lancer riding a lean winged ember drake banking sharply over red sandstone spires. Rider leans forward with long lance. Sweeping S-shaped full mount silhouette, low upward view. Lavender sky, cream clouds, copper wings, brilliant red saddle; epic readable action, no static portrait.",
    "lore": "The sky has no roads. He prefers it that way.",
    "race": "Cinderkin",
    "image": "assets/cards/Js.webp"
  },
  "Qs": {
    "id": "Qs",
    "name": "Lady of Cinders",
    "role": "Ash noble",
    "subject": "Regal copper-skinned Cinderkin woman with fan-shaped black-glass horn crown and huge ivory-and-rose feathered mantle seated sideways on a red marble balcony ledge examining a tiny floating coal above one fingertip. Fashion-like full seated figure, amused expression. Sunlit ivory architecture, dusty rose, burgundy, warm jewelry; quiet power.",
    "lore": "Her invitations are warm. Her patience is not.",
    "race": "Cinderkin",
    "image": "assets/cards/Qs.webp"
  },
  "Ks": {
    "id": "Ks",
    "name": "Basalt Colossus",
    "role": "Living mountain",
    "subject": "Immense asymmetrical quadrupedal basalt creature with a jagged volcano-shaped back and huge stony forearms hauling itself out of the sea, molten cracks steaming in crashing surf. Very low upward perspective, tiny cliffside lighthouse establishes scale. Charcoal rock, white foam, coral dawn, narrow orange lava seams; monumental nonhuman silhouette.",
    "lore": "The oldest island remembers how to walk.",
    "race": "Cinderkin",
    "image": "assets/cards/Ks.webp"
  },
  "As": {
    "id": "As",
    "name": "The Sun Eater",
    "role": "Elder Cinderkin",
    "subject": "Colossal sinuous horned ash dragon with six sweeping wings of obsidian feathers and ember-gold undersides curling around a solar eclipse above distant pale mountains. Full serpentine body forms an open crescent, head faces down toward viewer. Monumental aerial composition, ivory sky, black feathers, luminous gold corona, restrained crimson; mythic graphic shape.",
    "lore": "When its shadow passes, even fire grows cold.",
    "race": "Cinderkin",
    "image": "assets/cards/As.webp"
  },
  "2c": {
    "id": "2c",
    "name": "Pearl Pilferer",
    "role": "Reef sprite",
    "subject": "Tiny round turquoise amphibious reef sprite with enormous orange eyes and frilled ear fins hauling a pearl almost as large as itself across a pink shell-market counter. Very close low viewpoint, mischievous grin, wet webbed hands. Coral pink shells, turquoise skin, buttery sunlight, cream pearl; humorous scale and expression.",
    "lore": "It insists the oyster was finished with it.",
    "race": "Tideborn",
    "image": "assets/cards/2c.webp"
  },
  "3c": {
    "id": "3c",
    "name": "Kelp Skipper",
    "role": "Tide runner",
    "subject": "Small jade-green long-legged frog-like Tideborn scout in a yellow rain cape leaping between giant lily pads with a reed pole over a bright coastal marsh. Side-on full-body silhouette stretched mid-leap, trailing water droplets. Sunny lime reeds, blue sky, yellow cape, pink lilies; lively outdoor story.",
    "lore": "Never once has he used a bridge.",
    "race": "Tideborn",
    "image": "assets/cards/3c.webp"
  },
  "4c": {
    "id": "4c",
    "name": "Shellback Squire",
    "role": "Crab knight",
    "subject": "Young squat coral-orange crab-like Tideborn squire with round shell torso, two expressive eyes, four small walking legs and one oversized polished shell shield bracing against a tiny beach wave. Low heroic three-quarter view with clearly arranged limbs. Cream sand, turquoise shallows, vermilion shell, violet pennant, earnest determined face.",
    "lore": "Every wave is a worthy opponent.",
    "race": "Tideborn",
    "image": "assets/cards/4c.webp"
  },
  "5c": {
    "id": "5c",
    "name": "Reef Prowler",
    "role": "Fin beast",
    "subject": "Sleek indigo panther-shaped aquatic predator with translucent fan fins and speckled pale belly swimming through a sunlit yellow coral arch, looking back over its shoulder. Horizontal prowling S-curve, whole quadruped visible underwater, upward perspective through rippling surface. Cobalt hide, golden coral, clear aqua light, luminous eyes.",
    "lore": "The reef goes quiet long before it arrives.",
    "race": "Tideborn",
    "image": "assets/cards/5c.webp"
  },
  "6c": {
    "id": "6c",
    "name": "Lantern Angler",
    "role": "Deepwater guide",
    "subject": "Lanky plum-purple fishfolk guide with a huge translucent anglerfish lantern on a curved head stalk wearing patchwork seaweed coat, rowing a tiny boat through a flooded cavern. Three-quarter overhead view, diagonal boat and exaggerated long limbs. Honey-yellow lantern, violet face, ink-blue water, green reflected crystals, curious gentle expression.",
    "lore": "Follow the light. Ignore the teeth.",
    "race": "Tideborn",
    "image": "assets/cards/6c.webp"
  },
  "7c": {
    "id": "7c",
    "name": "Breakwater Guard",
    "role": "Turtle sentinel",
    "subject": "Broad weathered sea-turtle Tideborn guardian with heavy jade shell and pale leathery face holding a barnacled anchor like a shield, kneeling to shelter a small seabird from a crashing wave. Low side view, triangular powerful silhouette. White spray, emerald shell, rusty red anchor, storm-blue ocean, stoic kind expression.",
    "lore": "Nothing behind him has ever learned to fear a storm.",
    "race": "Tideborn",
    "image": "assets/cards/7c.webp"
  },
  "8c": {
    "id": "8c",
    "name": "Stormfin Raider",
    "role": "Shark corsair",
    "subject": "Athletic slate-blue shark-headed Tideborn pirate in a vivid magenta coat and brass buckles swinging from ship rigging with a curved cutlass in the other hand. Dynamic diagonal full-body action, toothy grin, tilted deck below. Cobalt storm sky, pink coat, white lightning, golden brass, clear silhouette.",
    "lore": "The boarding plank is mostly decorative.",
    "race": "Tideborn",
    "image": "assets/cards/8c.webp"
  },
  "9c": {
    "id": "9c",
    "name": "Inkveil Enchanter",
    "role": "Octopus mage",
    "subject": "Elegant pearl-skinned octopus Tideborn scholar with dark plum mantle and multiple curling tentacles suspended underwater in a circular library of coral shelves, conjuring luminous turquoise ink from an open book. Three-quarter overhead view, tentacles spiral around intelligent expressive face. Violet, sea-glass green, cream parchment, warm library lamps.",
    "lore": "Some spells are best written in disappearing ink.",
    "race": "Tideborn",
    "image": "assets/cards/9c.webp"
  },
  "Tc": {
    "id": "Tc",
    "name": "Coral Charger",
    "role": "Reef behemoth",
    "subject": "Enormous armored seahorse-dragon with long curling tail, fanlike scarlet dorsal fins and peach coral crest charging up from a turquoise wave. Entire tall elegant S-shaped body, low upward view, sheets of water from plated chest. Teal sea, pink coral, tangerine fins, pale gold sunrise; striking nonhumanoid anatomy.",
    "lore": "The tide does not ask permission.",
    "race": "Tideborn",
    "image": "assets/cards/Tc.webp"
  },
  "Jc": {
    "id": "Jc",
    "name": "Riptide Marshal",
    "role": "Manta rider",
    "subject": "Silver-blue fin-eared Tideborn marshal in pearl armor riding a vast dark manta ray just below the ocean surface, thrusting a long coral trident forward. Three-quarter side view, ray wings sweep horizontally through portrait. Bright sea-glass water, scarlet saddle cloth, ivory armor, golden rays; heroic motion.",
    "lore": "One signal, and the current changes sides.",
    "race": "Tideborn",
    "image": "assets/cards/Jc.webp"
  },
  "Qc": {
    "id": "Qc",
    "name": "Queen of Tides",
    "role": "Reef sovereign",
    "subject": "Proud deep-brown-skinned merfolk queen with pale blue fin ears, sea-green flowing hair, asymmetrical red branching coral crown and layered pearl armor standing in waist-deep rose tidal water. Close waist-up portrait from below, arm raised lifting a water spiral. Peach sunset, jade fabric, crimson coral, reflected gold; commanding expressive face.",
    "lore": "Her court reaches every shore.",
    "race": "Tideborn",
    "image": "assets/cards/Qc.webp"
  },
  "Kc": {
    "id": "Kc",
    "name": "Trench Leviathan",
    "role": "Abyssal ancient",
    "subject": "Gigantic ancient nautilus-like sea creature with a spiral shell of weathered ivory and dark violet, many thick tentacles and one immense amber eye emerging behind a tiny wrecked sailing ship in a storm. Diagonal looming side view, shell spiral dominates upper frame. Ink-blue sea, ivory shell, violet lightning, yellow eye; terrifying scale, no human face.",
    "lore": "The maps call its home an empty sea.",
    "race": "Tideborn",
    "image": "assets/cards/Kc.webp"
  },
  "Ac": {
    "id": "Ac",
    "name": "The Worldturtle",
    "role": "Elder Tideborn",
    "subject": "Colossal ancient sea turtle bearing a thriving island of pink blossom trees, waterfalls and pale temple ruins on its mossy shell rising through sunlit clouds above a turquoise ocean. Aerial three-quarter perspective, wise eye and flippers readable, tiny boats establish scale. Luminous aqua, green, blush pink, cream sunlight; magical living landscape.",
    "lore": "Entire kingdoms have mistaken it for solid ground.",
    "race": "Tideborn",
    "image": "assets/cards/Ac.webp"
  },
  "2d": {
    "id": "2d",
    "name": "Smuggler’s Shiv",
    "role": "Hidden blade",
    "subject": "Short chipped curved sea-glass green dagger with rope-wrapped grip half hidden in an open leather boot on a sunny dock. Oblique overhead close still life, strong diagonal blade, scattered copper coins, red fabric scrap. Warm weathered wood, turquoise water between planks, red cloth; tactile and roguish.",
    "lore": "Small enough to hide. Sharp enough to matter.",
    "race": null,
    "image": "assets/cards/2d.webp"
  },
  "3d": {
    "id": "3d",
    "name": "Ember Hatchet",
    "role": "Forge axe",
    "subject": "Chunky copper-and-black iron hatchet with crescent glowing amber edge just struck into a split log in a snowy campsite, flying wood chips and sparks. Low side view, diagonal handle, blue forest distance. Icy blue snow, copper-orange blade, warm split timber; captured impact, no person.",
    "lore": "Kindling is a matter of perspective.",
    "race": null,
    "image": "assets/cards/3d.webp"
  },
  "4d": {
    "id": "4d",
    "name": "Reefhook",
    "role": "Coral spear",
    "subject": "Hooked ivory-and-coral fishing spear caught diagonally in a green fishing net drifting beneath clear water, rose coral point tipped with silver, sea-blue wrapped shaft. Underwater view toward bright surface, bubbles and gold sunlight. Turquoise, cream, coral pink; entire distinctive hooked weapon visible.",
    "lore": "Made to catch supper. Repurposed in an emergency.",
    "race": null,
    "image": "assets/cards/4d.webp"
  },
  "5d": {
    "id": "5d",
    "name": "Gale Saber",
    "role": "Wind blade",
    "subject": "Elegant silver saber with sweeping open brass guard floating horizontally on a curl of pale mint wind above sunlit grass on a high cliff. Three-quarter view, long curved blade prominent, yellow ribbon whipping from pommel. Sky blue, silver, warm gold, vivid green; airy lively composition, crisp blade edge.",
    "lore": "The wind is very particular about who holds it.",
    "race": null,
    "image": "assets/cards/5d.webp"
  },
  "6d": {
    "id": "6d",
    "name": "Thunder Maul",
    "role": "Storm hammer",
    "subject": "Massive square-headed blue stone warhammer with brass bands and short leather grip crashing into flat rock, branching white-blue lightning connecting its head to clouds. Low foreshortened impact perspective, suspended stone fragments, no wielder. Deep violet sky, electric cyan, warm brass, grey stone; bold chunky silhouette.",
    "lore": "Subtlety was never part of the commission.",
    "race": null,
    "image": "assets/cards/6d.webp"
  },
  "7d": {
    "id": "7d",
    "name": "Moonfang",
    "role": "Crescent glaive",
    "subject": "Double-ended crescent glaive of polished moon-silver with deep indigo grip and hanging pearls resting across dark-blue silk on a balcony under cherry blossoms. Close overhead diagonal still life, both curved blades visible. Pale pink petals, navy silk, silver, soft moonlit lavender; quiet precision and luxury.",
    "lore": "It remembers the shape of every moon.",
    "race": null,
    "image": "assets/cards/7d.webp"
  },
  "8d": {
    "id": "8d",
    "name": "Sunspike",
    "role": "Radiant lance",
    "subject": "Ornate sun-gold lance with huge angular radiant spearhead and flowing crimson pennant suspended diagonally in a ruined white-marble temple, dust in a strong sunbeam. View upward along shaft, spearhead foremost, entire weapon recognizable. Ivory stone, gold metal, red fabric, blue sky through broken roof.",
    "lore": "The dawn leaves a point to remember.",
    "race": null,
    "image": "assets/cards/8d.webp"
  },
  "9d": {
    "id": "9d",
    "name": "Tidebreaker",
    "role": "Anchor greataxe",
    "subject": "Enormous nautical greataxe shaped from black ship's anchor with sharp turquoise crystal edges and rope-bound handle embedded in a barnacled rock as a wave breaks. Low three-quarter angle, broad asymmetrical head. Navy iron, glowing sea-green edge, white foam, peach horizon; weight and power.",
    "lore": "No harbor chain could hold it. No armor will either.",
    "race": null,
    "image": "assets/cards/9d.webp"
  },
  "Td": {
    "id": "Td",
    "name": "Dawnbringer",
    "role": "Sovereign sword",
    "subject": "Magnificent broad ivory-steel longsword with open golden sunburst guard and ruby pommel rising point-up from bright red poppies in grass, gold sparks drifting from blade. Low close perspective, blade angled away, distant pale mountains at sunrise. Cream, scarlet flowers, gold metal, fresh green; hopeful legendary centerpiece.",
    "lore": "A promise forged before the first sunrise.",
    "race": null,
    "image": "assets/cards/Td.webp"
  },
  "2h": {
    "id": "2h",
    "name": "Hearthsip",
    "role": "Warming draught",
    "subject": "Tiny round amber potion vial with crooked cork and red yarn handle beside a steaming rustic teacup on a cozy kitchen windowsill. Intimate close tabletop view, snow outside, glowing golden liquid. Honey brown, winter blue, red yarn, cream ceramic; comforting small-scale story, no labels.",
    "lore": "A borrowed minute by the fire.",
    "race": null,
    "image": "assets/cards/2h.webp"
  },
  "3h": {
    "id": "3h",
    "name": "Dewdrop Tonic",
    "role": "Forest remedy",
    "subject": "Emerald healing potion in a leaf-shaped green glass flask suspended from a fern by a vine, enormous sparkling dewdrops and sun shafts. Macro close-up in lush sunlit forest, organically tilted bottle, copper acorn stopper. Lime green, amber sunlight, mint background; fresh and airy, no labels.",
    "lore": "Gathered before the forest wakes.",
    "race": null,
    "image": "assets/cards/3h.webp"
  },
  "4h": {
    "id": "4h",
    "name": "Coral Cordial",
    "role": "Reef medicine",
    "subject": "Luminous turquoise healing drink in a spiral pink conch-shell flask with pearl stopper nestled in white sand beneath clear shallow water. Close top-down view, sunlight caustics, tiny orange starfish. Pastel pink, electric turquoise, ivory sand, warm coral accents; unusual unmistakable vessel, no label.",
    "lore": "A whole sea breeze in one swallow.",
    "race": null,
    "image": "assets/cards/4h.webp"
  },
  "5h": {
    "id": "5h",
    "name": "Sunberry Brew",
    "role": "Orchard cordial",
    "subject": "Squat orange glass potion jug with woven basket sleeve and green leaf stopper on a wooden orchard crate amid split red-orange berries. Ground-level three-quarter view, sunlit leaves behind, golden liquid splash beside mouth. Orange, scarlet, fresh green, golden afternoon; rustic abundance, no writing.",
    "lore": "Sweet enough to make the bruises worthwhile.",
    "race": null,
    "image": "assets/cards/5h.webp"
  },
  "6h": {
    "id": "6h",
    "name": "Violet Reverie",
    "role": "Dream elixir",
    "subject": "Tall asymmetrical violet crystal bottle holding swirling lavender healing liquid and one tiny star-shaped light hovering above an open velvet travel case. Close side view, purple vapor, crescent silver stopper. Midnight blue velvet, luminous lavender, silver, pink moonlight; dreamy quiet scene, no symbols or lettering.",
    "lore": "Close your eyes. Let the world mend itself.",
    "race": null,
    "image": "assets/cards/6h.webp"
  },
  "7h": {
    "id": "7h",
    "name": "Frostmilk",
    "role": "Glacial remedy",
    "subject": "Broad faceted pale-blue ice flask with thick ivory leather collar holding luminous opaque white healing liquid half buried in fresh snow beside red berries. Very low close view, distant pink snowy peaks at dawn. White, glacier cyan, blush pink, red berries; frosty tactile surface, no lettering.",
    "lore": "Cold enough to wake what pain has put to sleep.",
    "race": null,
    "image": "assets/cards/7h.webp"
  },
  "8h": {
    "id": "8h",
    "name": "Phoenix Tears",
    "role": "Firebird essence",
    "subject": "Orange-red healing liquid in a flame-shaped clear crystal ampoule with two small golden wings and red feather stopper suspended over warm ashes as luminous feathers spiral around it. Upward close view, bottle tilted. Scarlet, burnished gold, charcoal violet backdrop, orange light; energetic flame silhouette, no text.",
    "lore": "Not every ending has to take.",
    "race": null,
    "image": "assets/cards/8h.webp"
  },
  "9h": {
    "id": "9h",
    "name": "Starlight Nectar",
    "role": "Celestial elixir",
    "subject": "Round dark-blue glass astrolabe flask in a delicate brass ring cradle containing silver-white sparkling healing liquid like a galaxy, on a stargazer's wooden desk beside a folded blue cloak. High oblique view, glowing stars outside arched window. Cobalt, brushed brass, pearly white, lilac; enchanting still life, no writing.",
    "lore": "For nights that last longer than they should.",
    "race": null,
    "image": "assets/cards/9h.webp"
  },
  "Th": {
    "id": "Th",
    "name": "The Last Sunrise",
    "role": "Royal restorative",
    "subject": "Exquisite tall golden chalice with lotus-shaped rim holding radiant rose-gold healing nectar floating over a mirror lake at sunrise. Low close three-quarter view, droplet rising above cup, distant blue mountains. Blush sky, luminous gold, aqua reflections, ivory petals; serene legendary treasure, elegant silhouette, no text.",
    "lore": "One more dawn. That is all anyone ever asks.",
    "race": null,
    "image": "assets/cards/Th.webp"
  }
};
  root.ScoundrelCatalog = catalog;
  if (typeof module !== "undefined" && module.exports) module.exports = catalog;
})(typeof self !== "undefined" ? self : globalThis);
