/* Ash & Briar: 44 independent encounters, one shared catalog for game and gallery. */
(function (root) {
  "use strict";
  const catalog = {
  "2s": {
    "id": "2s",
    "name": "Pebble Sneak",
    "role": "Stonekin sneak",
    "subject": "Tiny slate Stonekin stealing a brass coin on terracotta steps beneath a teal awning, with a plum sash.",
    "lore": "A small fortune fits in a small hand.",
    "race": "Stonekin",
    "image": "assets/cards/2s.webp"
  },
  "3s": {
    "id": "3s",
    "name": "Flint Scout",
    "role": "Pathfinder",
    "subject": "Flint Scout: a LEAN ADULT dark-slate living stone person with a small WEDGE-SHAPED head, very long narrow limbs, pointed rock nose, shallow-set SMALL black eyes and no round child cheeks. Balancing full-body SIDE PROFILE along a pale weathered cliff ledge in a high coastal wind. A single long turquoise scarf, one plain horizontal wooden pole. Stormy lavender-grey sky, pale cream rock and dark sea-green water below. Cool overcast daylight with one thin warm sunbeam at his face. Entirely different adult anatomy from the round Pebble Sneak; simple broad shapes, open clean silhouette, no medieval village or repeated warm ochre background.",
    "lore": "The quietest route is rarely the shortest.",
    "race": "Stonekin",
    "image": "assets/cards/3s.webp"
  },
  "4s": {
    "id": "4s",
    "name": "Shale Sentry",
    "role": "Gate guard",
    "subject": "Shale Sentry: a MATURE broad squared STONEKIN guard with a low rectangular head, huge angular jaw, SMALL inset stern eyes, two short blunt brow horns and thick rectangular hands. Dark blue-slate body, no round childlike head or huge eyes. Half-body front three-quarter view at a quiet NIGHT checkpoint, holding one vertical plain broad stone club. A single ivory stone doorway frames deep desaturated BLUE night; one dusty-RED pennant above, and a warm amber light outside frame catches just one side of his slate face and brown shoulder mantle. Bold square adult silhouette, calm simple masses, no sunny terracotta village.",
    "lore": "He has held this doorway longer than the wall.",
    "race": "Stonekin",
    "image": "assets/cards/4s.webp"
  },
  "5s": {
    "id": "5s",
    "name": "Cobble Brawler",
    "role": "Pit fighter",
    "subject": "Cobble Brawler: a ROTUND ADULT cobble-stone fighter with a large round belly, heavy short legs, flat wide mature stone face, VERY SMALL amused eyes, broad nose, chipped front tooth in a big grin. No horns, giant child eyes, spherical baby head or athletic six-pack. Squatting low in a quirky ready stance, one giant fist wrapped in BURGUNDY cloth extended toward viewer. A simple pale sage training-floor plane, dark INDIGO wall, one warm cream hanging cloth square in background. Broad adult comic silhouette, warm stone highlights and cool blue-purple shadow, only one ochre waist tie. Original character, not a copy of the Pebble Sneak.",
    "lore": "A grin is his only warning.",
    "race": "Stonekin",
    "image": "assets/cards/5s.webp"
  },
  "6s": {
    "id": "6s",
    "name": "Slate Warden",
    "role": "Shield bearer",
    "subject": "Slate Warden: a TALL gaunt ADULT living stone person with a long narrow triangular head, tall neck, tiny patient eyes and smooth flat slate-blue body. One long rectangular blue-grey stone shield almost as tall as the body and a plain off-white cloak. Full-body SIDE PROFILE walking across a snowy hillside, one olive-green cloth fastening at shoulder. Quiet ivory sky, muted pine-green tree mass, pale lavender snow shadows; a small warm yellow reflection at the face. Clean elongated watchful silhouette rather than chibi proportions. No round head, enormous child eyes, horns, sand dunes or orange village setting.",
    "lore": "Some promises are built to last.",
    "race": "Stonekin",
    "image": "assets/cards/6s.webp"
  },
  "7s": {
    "id": "7s",
    "name": "Cairn Keeper",
    "role": "Memorial keeper",
    "subject": "Stooped old slate Stonekin carefully balancing a single pale pebble atop a small cairn of three huge smooth stones, one broad hand poised delicately. High oblique half-body view. A plain russet-orange leaf-shaped cloak over narrow shoulders; soft violet mist, muted green moss, creamy dawn light. An intimate quiet act with open negative space, no grave inscriptions or tiny rock clutter.",
    "lore": "Every small stone has someone to remember.",
    "race": "Stonekin",
    "image": "assets/cards/7s.webp"
  },
  "8s": {
    "id": "8s",
    "name": "Basalt Brute",
    "role": "River brute",
    "subject": "Enormous charcoal-black basalt Stonekin, long thick arms and small blocky head, leaning backward while hauling ONE thick orange rope out of a turquoise river. Full-body side view, exaggerated powerful diagonal stance, bare feet planted on a pale sandy bank. A few broad sage reeds and apricot sky. Black body with wide blue-grey highlights, no glowing cracks or lava; rope provides the warm accent. Broad simple water shapes.",
    "lore": "The river yields before the rope does.",
    "race": "Stonekin",
    "image": "assets/cards/8s.webp"
  },
  "9s": {
    "id": "9s",
    "name": "Quarry Hurler",
    "role": "Siege thrower",
    "subject": "Broad slate Stonekin hurler twisting his squat torso to throw ONE huge pale round boulder, foreshortened open hand sweeping toward upper left. Low three-quarter full-body action, stone being released still close to palm. A simple teal waist sash; dusty coral quarry cliff and pale cream sky. Face grey, warm pink rock, small muted green vegetation. Motion expressed by pose, no flying particle cloud.",
    "lore": "He has never run out of ammunition.",
    "race": "Stonekin",
    "image": "assets/cards/9s.webp"
  },
  "Ts": {
    "id": "Ts",
    "name": "Obsidian Knight",
    "role": "Glass knight",
    "subject": "Slender very tall living OBSIDIAN Stonekin knight, smooth near-black glass body described by a few broad cool reflections. Kneeling sideways beside one still rose-colored reflecting pool, plain long navy cloak flowing behind, one unornamented silver-blue blade resting across knees. Moonlit pale jade walls and a single cream moon shape. Quiet silhouette, soft mauve ambient light, no armor filigree, tiny mirrored facets or stars everywhere.",
    "lore": "Even darkness can hold an edge.",
    "race": "Stonekin",
    "image": "assets/cards/Ts.webp"
  },
  "Js": {
    "id": "Js",
    "name": "Onyx Marshal",
    "role": "Field marshal",
    "subject": "Older female ONYX Stonekin commander with flat black stone cheek planes and a simple cream shoulder mantle. High-angle close view as one broad hand moves a single brass marker across an UNLETTERED dark pine-green wooden campaign board. Restrained burnt-ochre lantern light catches her face, cool blue-grey shadow behind. Plain slate head, no crown, calm focused expression. Few broad board lines only, no writing or other figures.",
    "lore": "She moves one marker. The valley answers.",
    "race": "Stonekin",
    "image": "assets/cards/Js.webp"
  },
  "Qs": {
    "id": "Qs",
    "name": "Granite Matriarch",
    "role": "Clan matriarch",
    "subject": "Elder female GRANITE Stonekin with pale grey broad cheek planes and a simple natural three-point ridge on her head. Seated sideways on a sunlit ivory balcony, holding ONE modest bronze cup loosely in an enormous hand. A dusty-rose shawl forms a single clear sweeping fabric shape. Calm profile portrait, warm cream light, cobalt-blue background shadow, silver-grey skin. Stately original stone person, not a human in ornate armor.",
    "lore": "Her patience has outlasted empires.",
    "race": "Stonekin",
    "image": "assets/cards/Qs.webp"
  },
  "Ks": {
    "id": "Ks",
    "name": "Crag Sovereign",
    "role": "High sovereign",
    "subject": "Weathered old slate Stonekin sovereign with broad asymmetrical brow, wide sturdy body and short heavy legs, seated low on one plain block-shaped stone seat. One royal-plum sash across chest, no elaborate throne or jeweled crown. Low upward full-body composition, grey head against a pale turquoise sky, ochre grass field and one dark blue ridge. Golden late-day side light and cool shadows. Quiet commanding shape.",
    "lore": "The crown is younger than its wearer.",
    "race": "Stonekin",
    "image": "assets/cards/Ks.webp"
  },
  "As": {
    "id": "As",
    "name": "The First Mountain",
    "role": "Ancient Stonekin",
    "subject": "Ancient coastal Stonekin rising above turquoise water, grey granite and moss against a peach dawn.",
    "lore": "The oldest shore remembers his name.",
    "race": "Stonekin",
    "image": "assets/cards/As.webp"
  },
  "2c": {
    "id": "2c",
    "name": "Sproutling",
    "role": "Seed sprite",
    "subject": "A small two-leaf seed Treefolk sitting on a garden step, admiring rainwater in a purple seashell.",
    "lore": "Every day is its first adventure.",
    "race": "Treefolk",
    "image": "assets/cards/2c.webp"
  },
  "3c": {
    "id": "3c",
    "name": "Bramble Skulker",
    "role": "Hedge stalker",
    "subject": "Thin angular Treefolk skulker with twig limbs, a large pointed nose and a moss-green leaf cloak, peeking sideways around ONE broken terracotta garden pot. Crouched oblique full-body view, one root foot curling around pot rim. Soft lilac courtyard floor, honey-brown wooden face, muted mint foliage and a warm cream light patch. One dark oval eye in sharp focus; broad thorn branches only, not a dense tangle.",
    "lore": "The hedge has been watching you.",
    "race": "Treefolk",
    "image": "assets/cards/3c.webp"
  },
  "4c": {
    "id": "4c",
    "name": "Willow Watcher",
    "role": "Marsh lookout",
    "subject": "Slender willow Treefolk with three broad drooping green leaf masses and a smooth warm wooden face, standing sideways ankle-deep in still pale golden water. One very long plain reed pole stretches horizontally across frame. Full-body airy composition, pale periwinkle mist and one off-white bridge silhouette far away. Green leaves, ochre wood, pale blue water shadows. Early morning, one gentle ripple, no fine leaf texture.",
    "lore": "Nothing crosses the water unseen.",
    "race": "Treefolk",
    "image": "assets/cards/4c.webp"
  },
  "5c": {
    "id": "5c",
    "name": "Hazel Guard",
    "role": "Orchard guard",
    "subject": "Sturdy pear-shaped hazel Treefolk with rounded nut-like cheeks and broad fresh green leaf shoulders, standing in a relaxed ready stance behind ONE round leaf-shaped wooden shield. Short amber cape tied at neck. Low three-quarter full-body view, pale blue garden gate and muted rose orchard wall, warm ivory light. Honey-brown wood, forest-green shield, one cream hazelnut-shaped buckle. Friendly but resolute.",
    "lore": "He knows every branch by name.",
    "race": "Treefolk",
    "image": "assets/cards/5c.webp"
  },
  "6c": {
    "id": "6c",
    "name": "Birch Seer",
    "role": "Whitewood oracle",
    "subject": "Graceful birch Treefolk with smooth IVORY wooden body marked by only THREE broad charcoal bands, a fan of dark emerald leaves and an elongated thoughtful face. Leaning forward to touch one fingertip to a broad rose-pink reflecting pool, side profile half-body view. Twilight mint bank, blue-violet far background, small warm golden reflection at hand. Strong contrast of white bark and green canopy, no many bark scratches.",
    "lore": "The pool remembers tomorrow.",
    "race": "Treefolk",
    "image": "assets/cards/6c.webp"
  },
  "7c": {
    "id": "7c",
    "name": "Rootbound Shaman",
    "role": "Seed shaman",
    "subject": "Short twisted-root Treefolk shaman with an oversized cream moss beard and dark green leaf mantle, seated cross-legged within one broad arching root. Holding ONE warm ochre glowing seed close to face with both hands, eye closed in concentration. High intimate view, lavender dusk and russet grass below. Warm brown body, dark green, cream beard and localized honey light. No floating sparks, rune patterns or dense roots.",
    "lore": "A forest begins with a whispered word.",
    "race": "Treefolk",
    "image": "assets/cards/7c.webp"
  },
  "8c": {
    "id": "8c",
    "name": "Oak Sentinel",
    "role": "Grove sentinel",
    "subject": "A broad green Treefolk sheltering an amber lantern at a bridge in violet twilight rain.",
    "lore": "No small light is left in the rain.",
    "race": "Treefolk",
    "image": "assets/cards/8c.webp"
  },
  "9c": {
    "id": "9c",
    "name": "Thornback",
    "role": "Thicket beast",
    "subject": "A distinctly NONHUMANOID Treefolk beast on four broad root limbs, barrel body covered in THREE dark fern-green bush masses, with exactly THREE large curved bare thorns along its back. Wide flat wooden face and sleepy watchful eyes. Resting sideways on a pale sand riverbank, turquoise water behind and one muted coral rock. Full creature visible, honey wood highlights and cool violet shadow. Clean broad silhouette, no thorn microdetail.",
    "lore": "The bramble patch takes one more step.",
    "race": "Treefolk",
    "image": "assets/cards/9c.webp"
  },
  "Tc": {
    "id": "Tc",
    "name": "Ironbark Champion",
    "role": "Living champion",
    "subject": "Athletic broad-shouldered Treefolk champion charging forward on thick root legs, deep green leaf poncho, honey-dark wooden arms, one broad worn BLUE IRON buckler raised. Low action angle, full figure bent into a diagonal, one simple ochre footbridge underneath and lavender cream storm clouds behind. Few russet leaf accents; wooden face stern and mouth open. Bold paint masses, no leaf debris or elaborate armor.",
    "lore": "Old wood. Unbroken resolve.",
    "race": "Treefolk",
    "image": "assets/cards/Tc.webp"
  },
  "Jc": {
    "id": "Jc",
    "name": "Briar Herald",
    "role": "Valley herald",
    "subject": "Very thin elegant vine-bodied Treefolk herald in a theatrical sweeping pose, head tipped back while blowing ONE plain ivory conch horn. Dark green leaf cape swings in a wide crescent, warm slender wood limbs. Side-view full body on a terracotta plaza step, one broad dusty-lavender wisteria shape and cream sky behind. Small red-orange cloth banner at waist. Original expressive face, open silhouette, no dense vines or extra figures.",
    "lore": "One note wakes the sleeping grove.",
    "race": "Treefolk",
    "image": "assets/cards/Jc.webp"
  },
  "Qc": {
    "id": "Qc",
    "name": "Queen of Vines",
    "role": "Grove queen",
    "subject": "Regal female Treefolk with a long warm wooden neck and a crown made from just FOUR large sweeping vine loops. Broad dark green leaf mantle, one huge ivory flower resting at a shoulder as her single distinctive ornament. Close waist-up three-quarter view, calm commanding face looking over open hand. Pale jade pool behind, dusty-rose wall, soft gold side light. Broad wood and leaf planes, no floral microtexture, scattered petals or intricate crown.",
    "lore": "A soft word can turn a thousand roots.",
    "race": "Treefolk",
    "image": "assets/cards/Qc.webp"
  },
  "Kc": {
    "id": "Kc",
    "name": "Elderbough",
    "role": "Ancient wanderer",
    "subject": "Tall very bent ancient Treefolk wanderer, narrow wooden body and long pale moss beard, sparse deep olive canopy with three large leaf shapes. One simple root cane. Full-body profile crossing a quiet pale snowy clearing, small ochre scarf and ONE tiny red-breasted bird perched on cane top. Cool lavender snow shadows, creamy winter sky and warm honey face; leaves remain green. Intimate gentle story with uncluttered setting.",
    "lore": "He remembers when the road was a river.",
    "race": "Treefolk",
    "image": "assets/cards/Kc.webp"
  },
  "Ac": {
    "id": "Ac",
    "name": "The Verdant Dream",
    "role": "Dreaming elder",
    "subject": "Colossal reclining Treefolk elder whose long wooden face and one folded root hand emerge from a rolling dark emerald canopy. Very low landscape-like portrait view across a deep blue-violet lake, sleeping giant fills central frame with one vast arch of shoulder. Soft pale pink clouds and peach dawn, large green grass masses and a SINGLE oversized cream blossom on brow. Mythic restful form, few broad layered shapes, no field of tiny flowers, buildings or crowds.",
    "lore": "While it sleeps, the valley grows.",
    "race": "Treefolk",
    "image": "assets/cards/Ac.webp"
  },
  "2d": {
    "id": "2d",
    "name": "Gutter Shiv",
    "role": "Improvised dagger",
    "subject": "A short blue-steel dagger with a burgundy handle on an olive satchel in warm window light.",
    "lore": "Every locked purse has a loose thread.",
    "race": null,
    "image": "assets/cards/2d.webp",
    "weaponType": "Improvised dagger"
  },
  "3d": {
    "id": "3d",
    "name": "Hooktooth",
    "role": "Hooked sickle",
    "subject": "ONE hooked BLUE-STEEL sickle with a short bone-colored handle and a single dark red cloth tie. Its dramatic open curved blade hangs from one thick wooden barn peg above a broad golden wheat bundle suggested as three stalk shapes. Side three-quarter close view, warm ochre wood and pale mint daylight behind, cool steel-blue blade with one sharp cream edge. Functional hooked silhouette, no runes, jewelry, detailed straw or extra tools.",
    "lore": "A harvest tool with a second purpose.",
    "race": null,
    "image": "assets/cards/3d.webp",
    "weaponType": "Hooked sickle"
  },
  "4d": {
    "id": "4d",
    "name": "Splitter Axe",
    "role": "Bearded axe",
    "subject": "ONE functional BLUE-STEEL bearded axe with a broad low cutting blade and plain brown ashwood handle embedded shallowly in one large cut stump. Low close side view, head upper left and handle leaning right. Deep aubergine forest shadows, muted mint distant tree mass and a single saffron leaf caught on the stump. Warm cream daylight, blue blade distinct from warm wood. Broad simple growth rings, no tiny chips, magic or ornament.",
    "lore": "It divides the question cleanly.",
    "race": null,
    "image": "assets/cards/4d.webp",
    "weaponType": "Bearded axe"
  },
  "5d": {
    "id": "5d",
    "name": "Wayfarer's Spear",
    "role": "Travel spear",
    "subject": "ONE travel spear with a broad leaf-shaped BLUE-STEEL point and cream cloth binding on a dark wooden shaft. Leans steeply against a plain dusty-rose roadside milestone with NO writing, a modest worn brown leather strap loops from shaft. Close low view with full recognizable spearhead and most of shaft; pale sage horizon and amber dry grass under cream sky. Simple spacious wayfarer's still life, muted blue point, warm rock and leather.",
    "lore": "Made for the miles between shelter.",
    "race": null,
    "image": "assets/cards/5d.webp",
    "weaponType": "Travel spear"
  },
  "6d": {
    "id": "6d",
    "name": "Cobalt Mace",
    "role": "Flanged mace",
    "subject": "A blue flanged mace with ivory wrapping and a brass collar against ochre sandstone and a mauve pennant.",
    "lore": "A persuasive answer to a difficult question.",
    "race": null,
    "image": "assets/cards/6d.webp",
    "weaponType": "Flanged mace"
  },
  "7d": {
    "id": "7d",
    "name": "Duelist's Saber",
    "role": "Dueling saber",
    "subject": "ONE slender curved BLUE-STEEL saber with an elegant plain single-arc brass guard and plum leather handle. Lies horizontally across ONE pair of folded cream fencing gloves on a pale stone courtyard bench. High oblique still life, long clean curved edge, blue-violet cool shade and warm ivory sunlit background with one broad dusty-rose flower mass far away. Few precise blade highlights, no elaborate filigree or additional weapons.",
    "lore": "One line. One opening.",
    "race": null,
    "image": "assets/cards/7d.webp",
    "weaponType": "Dueling saber"
  },
  "8d": {
    "id": "8d",
    "name": "Bellringer",
    "role": "Warhammer",
    "subject": "ONE immense square-headed BLUE-STEEL warhammer with a plain broad brass collar and dark leather grip, resting across a warm burnt-orange forge workbench. Low side viewpoint emphasizes the broad square head, handle recedes upward to left. Quiet charcoal-teal forge wall and one muted cream furnace-light rectangle; soft lavender shadows on the blue head. Few clean planes, no fire particles, complex tools or decorative engravings.",
    "lore": "The last sound a gate remembers.",
    "race": null,
    "image": "assets/cards/8d.webp",
    "weaponType": "Warhammer"
  },
  "9d": {
    "id": "9d",
    "name": "Headsman's Greatsword",
    "role": "Executioner's greatsword",
    "subject": "ONE broad straight BLUE-STEEL executioner's greatsword with a squared clipped tip, short plain black crossguard and long black leather grip. Rests almost vertically against a single dark wooden block; one broad burgundy velvet curtain folds behind. Slight low three-quarter view, blade edge catches a clean white shaft of light, cream stone floor and cool grey shadow. Solemn quiet material contrast, no gore, people, heraldry or ornate hilt.",
    "lore": "It ends what the verdict begins.",
    "race": null,
    "image": "assets/cards/9d.webp",
    "weaponType": "Executioner's greatsword"
  },
  "Td": {
    "id": "Td",
    "name": "Oathbreaker",
    "role": "Chained flail",
    "subject": "ONE heavy BLUE-STEEL flail: a compact faceted BLUNT head, exactly FOUR large dark chain links and a short ivory-wrapped handle. Arranged in a loose open S on a broad pale sage courtyard stone, one faded ochre banner corner beneath it. Overhead view shows entire head, chain and grip, warm late sunlight and muted plum cast shadow. Simple distinct silhouette, no spikes, blood, tiny chain tangle, writing or additional weapons.",
    "lore": "No oath survives the second swing.",
    "race": null,
    "image": "assets/cards/Td.webp",
    "weaponType": "Chained flail"
  },
  "2h": {
    "id": "2h",
    "name": "Mender's Sip",
    "role": "Field remedy",
    "subject": "A scarlet field-healing vial wrapped in cream linen on dusty blue cloth beside a roll of bandage.",
    "lore": "A little care goes a long way.",
    "race": null,
    "image": "assets/cards/2h.webp",
    "potionColor": {
      "shade": "Fresh scarlet",
      "target": "#D94A45"
    }
  },
  "3h": {
    "id": "3h",
    "name": "Rosehip Tonic",
    "role": "Rosehip restorative",
    "subject": "Rosehip Tonic: a SMALL PERFECTLY SPHERICAL clear-glass flask with a short narrow neck and a broad plain BRASS screw-cap. NO handles, rope, cork, leather tag, side loops or hanging cord. Liquid is a subdued semi-cloudy ROSE RED #C6546A, visibly PINKER and PALER than bright scarlet healing potion, dusty cranberry-rose with soft milky rose highlights, still recognizably red. Overhead close view sitting on a simple white ceramic tray beside THREE red rosehips, soft sage greenhouse background and pale lavender cast shadow. Small blank sage paper collar. Broad gouache shapes, quiet calm light; no glossy saturated crimson, no twin-handled Sanguine Brew bottle.",
    "lore": "For the scrapes worth remembering.",
    "race": null,
    "image": "assets/cards/3h.webp",
    "potionColor": {
      "shade": "Rose red",
      "target": "#C6546A"
    }
  },
  "4h": {
    "id": "4h",
    "name": "Hearth Cordial",
    "role": "Fireside cordial",
    "subject": "Hearth Cordial: a LOW WIDE squat clear-glass JUG with ONE single large dark wooden loop handle on its RIGHT SIDE and a tiny off-white stopper. A broad short neck, flat heavy base, entirely different silhouette from round double-handled bottles. Liquid is muted BRICK RED #A8443B, russet-red and deep OXBLOOD shade, not bright scarlet, cherry or purple. Calm close side view on a large pale cream hearthstone, a midnight-cobalt cloth under the jug and soft AMBER off-screen hearthlight against cool lilac stone background. Large simple material planes, no etched details, red seal tag or cords; warm comfort, bottle retains subdued brown-red color with only one orange light reflection.",
    "lore": "Warmth that travels with you.",
    "race": null,
    "image": "assets/cards/4h.webp",
    "potionColor": {
      "shade": "Brick red",
      "target": "#A8443B"
    }
  },
  "5h": {
    "id": "5h",
    "name": "Scarlet Draught",
    "role": "Field draught",
    "subject": "ONE tall narrow triangular clear-glass healing flask filled with vivid VERMILION RED liquid target #D84B36, red dominant rather than orange. Plain cork and one soft grey leather neck loop. Lies diagonally inside an open muted INDIGO travel case with a single broad cream blank cloth flap. High oblique still life, warm gold wood beneath and pale sage light. Three large glass facets, modest practical vessel, no letters, elaborate inserts or clutter.",
    "lore": "The road can wait one more minute.",
    "race": null,
    "image": "assets/cards/5h.webp",
    "potionColor": {
      "shade": "Vermilion red",
      "target": "#D84B36"
    }
  },
  "6h": {
    "id": "6h",
    "name": "Sanguine Brew",
    "role": "Herbal infusion",
    "subject": "A suspended two-handled garnet potion flask against turquoise plaster with copper window light.",
    "lore": "Patiently steeped. Carefully carried.",
    "race": null,
    "image": "assets/cards/6h.webp",
    "potionColor": {
      "shade": "Deep garnet",
      "target": "#882C44"
    }
  },
  "7h": {
    "id": "7h",
    "name": "Ruby Elixir",
    "role": "Jeweled elixir",
    "subject": "ONE low lozenge-shaped clear cut-glass healing bottle filled with rich RUBY WINE RED liquid target #AE2E53, dark red center and rosy-red transmitted light. A simple cream stopper and ONE plain brass ring stand. On soft off-white velvet beside a broad royal-blue curtain, warm peach side light creates large simple glass reflections. Three-quarter close view, bottle horizontal diamond silhouette, not a round vial. No tiny jewels, filigree, sparkle scatter or text.",
    "lore": "A little luxury for a hard return.",
    "race": null,
    "image": "assets/cards/7h.webp",
    "potionColor": {
      "shade": "Ruby wine",
      "target": "#AE2E53"
    }
  },
  "8h": {
    "id": "8h",
    "name": "Phoenix Tears",
    "role": "Ash remedy",
    "subject": "ONE asymmetrical TEARDROP clear-glass healing ampoule filled with COPPER RED liquid target #C9503D, clearly red with warmer orange-red edges, dark cherry core. A crooked broad cork with a SINGLE red feather tied at the neck. Upright in a shallow notch of one charred wooden block, pale cool grey ash plane and soft mint sky behind. Low close view, warm cream light, black char and red potion contrasted. Quiet renewal, no flying feathers, fire effects or tiny ash particles.",
    "lore": "Something living remains.",
    "race": null,
    "image": "assets/cards/8h.webp",
    "potionColor": {
      "shade": "Copper red",
      "target": "#C9503D"
    }
  },
  "9h": {
    "id": "9h",
    "name": "King's Remedy",
    "role": "Royal remedy",
    "subject": "ONE broad flattened hexagonal clear-glass healing flask filled with deep DARK CHERRY RED liquid target #982D3F, garnet-red center and scarlet transmitted edge. Wide plain pale pewter stopper, one navy leather band around the neck and a single blank brass seal. Upright close three-quarter view on white silk, soft lilac shadow and warm golden sunset reflection. Calm luxurious materials with large flat planes, no crowns, heraldry, labels or ornate jewelry.",
    "lore": "Even a king must ask for another day.",
    "race": null,
    "image": "assets/cards/9h.webp",
    "potionColor": {
      "shade": "Dark cherry",
      "target": "#982D3F"
    }
  },
  "Th": {
    "id": "Th",
    "name": "Second Dawn",
    "role": "Last restorative",
    "subject": "ONE wide-bulbed long-necked clear-glass healing bottle, plain pale wooden stopper, filled with bright CORAL RED liquid target #DC6A60, red-pink coral with a carmine base, not orange or white. Stands on one off-white folded travel cloth beside an open window, early sunrise colors: pale peach sky, muted sage frame and cool blue-grey distant hills. Low hopeful angle, one broad warm reflected light through liquid, simple elegant silhouette. No chalice, wings, particles, ornate frame or text.",
    "lore": "One more dawn is enough.",
    "race": null,
    "image": "assets/cards/Th.webp",
    "potionColor": {
      "shade": "Coral red",
      "target": "#DC6A60"
    }
  }
};
  root.ScoundrelCatalog = catalog;
  if (typeof module !== "undefined" && module.exports) module.exports = catalog;
})(typeof self !== "undefined" ? self : globalThis);
