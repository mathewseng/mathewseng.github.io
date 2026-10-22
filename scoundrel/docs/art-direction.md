# Ash & Briar

Visual thesis: original expressive fantasy characters and objects painted in broad shapes, each with a distinct small story and local color palette, presented against a quiet dark dungeon and gallery.

Content plan: the game shows four readable encounters; the collection presents all 44 artworks with names and values, suit filters and search; the focused art viewer adds role, one line of flavor and the relevant game rule.

Interaction thesis: cards lift and rotate slightly toward the pointer, a soft light follows the surface, and brief entrance and viewer transitions make navigation feel tangible. Touch taps open artwork and horizontal swipes browse it. All movement respects reduced motion; every action has a keyboard and touch equivalent.

## The deck

- **Spades · Stonekin:** living slate and charcoal people, from a tiny pebble thief to an ancient coastal giant. Vary age, proportions, stone shape, expression and role.
- **Clubs · Treefolk:** living wooden creatures with green foliage, from a seed sprite and vine herald to thicket beasts and dreaming elders. Leaf shape, canopy, anatomy and scale can vary widely.
- **Diamonds · Weapons:** blue-steel dagger, hooked sickle, bearded axe, spear, mace, dueling saber, warhammer, greatsword and flail. Handles, bindings, local materials, environment and lighting are individual.
- **Hearts · Potions:** recognizable red liquid in distinct fresh scarlet, rose, brick, vermilion, garnet, ruby wine, copper red, dark cherry and coral shades. Bottle shapes, stopper, glass, wrapping and setting are distinct too.

All 44 names have distinct meaningful words. Avoid repeated material roots and repeated weather/sky themes in weapon names. The races are cosmetic identities; both monster suits retain the same game rules.

## Color and detail

The suit color belongs to the subject, not the whole painting. A grey Stonekin can appear beneath teal fabric on terracotta steps; blue steel can sit against burgundy leather; a garnet potion can hang against turquoise plaster. Keep two or three distinct supporting color families, warm/cool contrast and the local colors of materials.

Use strong silhouettes, broad opaque gouache-like paint shapes, quiet areas and selective crisp detail at the face or item edge. One or two meaningful contextual details should tell the scene. Vary lighting, time of day, setting, gesture, framing and scale. Do not default to the same portrait, pedestal or matching colored background for a suit. Avoid surface microdetail, ornate filigree, particles everywhere and overly crowded scenes.

The user's references are [Legends of Runeterra's official card illustrations](https://developer.riotgames.com/docs/lor#data-dragon), especially the local colors and moments in Greenglade Caretaker, Inspiring Mentor, Cithria of Cloudfield and Scarthane Steffen. Characters and scenes in this deck are original. Earlier concepts and name revisions remain in [the study archive](ash-and-briar/README.md).

## Delivery

`catalog.js` is shared by the game, report histories and dedicated `/scoundrel/gallery/` page. Names, roles, lore, weapon types, potion targets and image paths live there. `art-prompts.json` records the exact prompts, source references and final artwork hashes. The built-in image generation tool made each illustration independently; no recolors or crops of a shared character are used.

Card paintings have no baked-in text, suit marks, value seals or borders. Code supplies those elements. Full WebPs are 960px wide and responsive thumbnails 320px, proportionally compressed with `cwebp`. Artwork keeps its own colors across all dungeon atmospheres. The eight approved color-story samples are retained in the final set.

The gallery uses four columns on desktop, five on wide displays, three on tablets and two on phones. Search and filters update the visible count and URL. Card links include a stable hash, and the viewer navigates only the filtered set. Native modal focus handling, close/backdrop controls, focus restoration, dynamic viewport bounds and reduced-motion behavior apply throughout.
