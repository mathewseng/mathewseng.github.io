# Cinder & Tide

Visual thesis: expressive painted fantasy scenes, luminous color and bold silhouettes set into an aged, quiet dungeon table.

Content plan: four readable encounter artworks form the playing surface; strength, name and faction stay visible; actions explain the selected encounter; the collection reveals each illustration and its short story.

Interaction thesis: staggered dealing establishes the room, a small lift identifies the selected encounter, and a full-art collection view lets the painting breathe. Reduced motion removes movement. Touch never depends on hover.

## Two peoples, many forms

Spades are **Cinderkin**, a volcanic people ranging from wick-stealing imps and glass-winged seers to horned artisans and ancient ash dragons. Copper craft, ember eyes and volcanic materials connect them without prescribing one anatomy, one palette or one pose.

Clubs are **Tideborn**, an ocean people ranging from amphibious sprites and armored crab squires to tentacled scholars, reef royalty and island-bearing elders. Shell, coral, fins and pearls connect them; reefs, marshes, ships, deep water and sunlit shores create different settings.

The two suits remain mechanically identical monsters. Race, role and flavor are cosmetic. Weapons and healing potions retain their original values and rules.

## Variation requirements

- Every card has its own name, subject, illustration and miniature story.
- Alternate small/large, humanlike/beastlike, round/angular, graceful/heavy, comic/solemn and still/active silhouettes.
- Alternate close portraits, profiles, aerial views, low angles, full-body actions, monumental landscapes and object still lifes.
- Use different local color stories: icy blue versus amber, coral versus turquoise, rose versus ivory, silver versus violet, fresh green versus gold.
- Characters act in a place. Avoid a procession of front-facing figures in the same dark alcove.
- Weapons vary in shape, orientation and environment. Potions vary in vessel, liquid color, material and staging.
- No blanket desaturation or hue shift on card artwork. The atmosphere setting changes the table lighting only.
- Original artwork generated independently per card. No extracted game assets, logos, UI frames, painted numbers or lettering.

## References

The user's references guide broad compositional qualities: expressive silhouettes and vibrant painted worlds in [Legends of Runeterra's official art](https://playruneterra.com/en-us/news/game-updates/patch-2-12-0-notes/) and [Hearthstone's full-art card presentation](https://hearthstone.blizzard.com/en-us/news/24244424/34-2-patch-notes-events-and-features). Characters, cultures and images are original.

## Responsive presentation

Desktop uses a four-card row and an adjacent adventurer rail. Portrait phones use a two-by-two room with compact health/weapon status, visible names and comfortably sized action buttons. Names wrap; no ellipsis or line clamping hides content. On short screens and with enlarged text, the document may scroll rather than crop actions. Dialogs respect the dynamic viewport and safe areas.

`catalog.js` is the encounter source. `art-prompts.json` records the complete image prompts and final asset paths.
