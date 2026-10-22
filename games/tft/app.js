
		var width = $(window).width(),
				height = $(window).height(),
				padding = 0;

		var scale = 0.4,
				xOffset = 0,
				yOffset = 0;

		var flats = true,
				spellUpwards = true;

		var toolbarHeight = height * 0.1;

		// Create svg
		var svg = d3.select("body").append("svg")
			.attr("width", width)
			.attr("height", height);

		clearKeys();

		// Create the svg:defs element and the main gradient definition.
    var svgDefs = svg.append("defs");

    var mainGradient = svgDefs.append("linearGradient")
			.attr("gradientTransform", "rotate(" + 100 + ")")
			.attr("id", "mainGradient");

    // Create the stops of the main gradient. Each stop will be assigned
    // a class to style the stop using CSS.
    mainGradient.append("stop")
			.attr("class", "color1")
			.attr("offset", "0");

    mainGradient.append("stop")
			.attr("class", "color2")
			.attr("offset", "1");

		//make background
		svg.append("rect")
			.classed("filled", true)
			.attr("x", padding)
			.attr("y", padding)
			.attr("width", width - 2 * padding)
			.attr("height", height - 2 * padding);

		//make toolbar
		svg.append("rect")
			.classed("filled", true)
			.attr("x", padding)
			.attr("y", padding)
			.attr("width", width - 2 * padding)
			.attr("height", toolbarHeight);

    // Use the gradient to set the shape fill, via CSS.
    // svg.append("rect")
		// 	.classed("filled", true)
		// 	.attr("x", padding)
		// 	.attr("y", padding)
		// 	.attr("width", (width / 2) - 1.5 * padding)
		// 	.attr("height", height - 2 * padding);
		//
    // // Use the gradient to set the shape stroke, via CSS.
    // svg.append("rect")
		// 	.classed("outlined", true)
		// 	.attr("x", width / 2 + padding / 2)
		// 	.attr("y", padding)
		// 	.attr("width", (width / 2) - 1.5 * padding)
		// 	.attr("height", height - 2 * padding);

		var keyImages = [
			"/music/ewi-fingerings/circle-key.png",
			"/music/ewi-fingerings/left-index-key.png",
			"/music/ewi-fingerings/circle-key.png",
			"/music/ewi-fingerings/circle-key.png",
			"/music/ewi-fingerings/left-pinky-key-1.png",
			"/music/ewi-fingerings/left-pinky-key-2.png",
			"/music/ewi-fingerings/right-index-key.png",
			"/music/ewi-fingerings/circle-key.png",
			"/music/ewi-fingerings/circle-key.png",
			"/music/ewi-fingerings/circle-key.png",
			"/music/ewi-fingerings/right-pinky-key-1.png",
			"/music/ewi-fingerings/right-pinky-key-2.png",
			"/music/ewi-fingerings/right-pinky-key-3.png"
		]

		var keyImagesOn = [
			"/music/ewi-fingerings/circle-key-on.png",
			"/music/ewi-fingerings/left-index-key-on.png",
			"/music/ewi-fingerings/circle-key-on.png",
			"/music/ewi-fingerings/circle-key-on.png",
			"/music/ewi-fingerings/left-pinky-key-1-on.png",
			"/music/ewi-fingerings/left-pinky-key-2-on.png",
			"/music/ewi-fingerings/right-index-key-on.png",
			"/music/ewi-fingerings/circle-key-on.png",
			"/music/ewi-fingerings/circle-key-on.png",
			"/music/ewi-fingerings/circle-key-on.png",
			"/music/ewi-fingerings/right-pinky-key-1-on.png",
			"/music/ewi-fingerings/right-pinky-key-2-on.png",
			"/music/ewi-fingerings/right-pinky-key-3-on.png"
		]

		var keyXOffsets = [0, 60, 140, 280, 350, 400, 520, 680, 820, 960, 1040, 1100, 1145];
		var keyYOffsets = [125, 121, 125, 125, 50, 0, 125, 125, 125, 125, 125, 125, 125];
		var keySizes = [99, 107, 99, 99, 175, 225, 175, 99, 99, 99, 161, 208, 275];

		var imgs = svg.selectAll("image").data([0]);

		/*makeKey(0 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImages[0]);
		makeKey(60 * scale + xOffset, 121 * scale + yOffset, 107 * scale, keyImages[1]);
		makeKey(140 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImages[2]);
		makeKey(280 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImages[3]);
		makeKey(350 * scale + xOffset, 50 * scale + yOffset, 175 * scale, keyImages[4]);
		makeKey(400 * scale + xOffset, 0 * scale + yOffset, 225 * scale, keyImages[5]);
		makeKey(520 * scale + xOffset, 125 * scale + yOffset, 175 * scale, keyImages[6]);
		makeKey(680 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImages[7]);
		makeKey(820 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImages[8]);
		makeKey(960 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImages[9]);
		makeKey(1040 * scale + xOffset, 125 * scale + yOffset, 161 * scale, keyImages[10]);
		makeKey(1100 * scale + xOffset, 125 * scale + yOffset, 208 * scale, keyImages[11]);
		makeKey(1145 * scale + xOffset, 125 * scale + yOffset, 275 * scale, keyImages[12]);

		yOffset += 350 * scale;

		makeKey(0 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImagesOn[0]);
		makeKey(60 * scale + xOffset, 121 * scale + yOffset, 107 * scale, keyImagesOn[1]);
		makeKey(140 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImagesOn[2]);
		makeKey(280 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImagesOn[3]);
		makeKey(350 * scale + xOffset, 50 * scale + yOffset, 175 * scale, keyImagesOn[4]);
		makeKey(400 * scale + xOffset, 0 * scale + yOffset, 225 * scale, keyImagesOn[5]);
		makeKey(520 * scale + xOffset, 125 * scale + yOffset, 175 * scale, keyImagesOn[6]);
		makeKey(680 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImagesOn[7]);
		makeKey(820 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImagesOn[8]);
		makeKey(960 * scale + xOffset, 125 * scale + yOffset, 99 * scale, keyImagesOn[9]);
		makeKey(1040 * scale + xOffset, 125 * scale + yOffset, 161 * scale, keyImagesOn[10]);
		makeKey(1100 * scale + xOffset, 125 * scale + yOffset, 208 * scale, keyImagesOn[11]);
		makeKey(1145 * scale + xOffset, 125 * scale + yOffset, 275 * scale, keyImagesOn[12]);*/

    /*imgs.enter()
      .append("svg:image")
      .attr("xlink:href", "/music/ewi-fingerings/circle-key.png")
      .attr("x", "60")
      .attr("y", "60")
      .attr("width", "100")
      .attr("height", "100");
		imgs.enter()
      .append("svg:image")
      .attr("xlink:href", "/music/ewi-fingerings/left-index-key.png")
      .attr("x", "130")
      .attr("y", "60")
      .attr("width", "100")
      .attr("height", "100");*/

		function makeKey(x, y, h, link) {
			imgs.enter()
	      .append("svg:image")
	      .attr("xlink:href", link)
	      .attr("x", x)
	      .attr("y", y)
	      .attr("width", h)
	      .attr("height", h);
		}

		//there are 17 notes because it goes from Bb to D an octave above
		//there are 13 keys and its formated in binary for ease of input to the array
		//fingerings taken from patchmanmusic.com/EWIFingeringOneWatts.pdf
		var fingerings = [
			[//Bb
				"1011010111011"
			],
			[//B
				"1011010111001"
			],
			[//C
				"1011000111001",
				"1011010111010"
			],
			[//Db
				"1011000111010",
				"1011010111000",
				"1011100111001"
			],
			[//D
				"1011000111000",
				"1011000110001",
				"1011000101010",
				"1011000011001",
				"1011000111001"
			],
			[//Eb
				"1011000111100",
				"1011100111000",
				"1011000101000",
				"1001010111000",
				"1001000111010"
			],
			[//E
				"1011000110000",
				"1011000011000",
				"1001000111000",
				"1011010100000",
				"1011000010001",
				"1001000110001"
			],
			[//F
				"1011000100000",
				"1011000000001",
				"1011000001000",
				"1001000101000",
				"1001000100001",
				"1010000111000"
			],
			[//Gb
				"1011000010000",
				"1001000110000",
				"1011000000010",
				"1011010000000"
			],
			[//G
				"1011000000000",
				"1010000110000",
				"1010000001000",
				"1001000100000",
				"1001000001000",
				"1010000000001",
				"0011000110000",
				"1000000111000",
				"0011000011000"
			],
			[//Ab
				"1011100000000",
				"1011001000000",
				"1011000000100",
				"1001000010000",
				"0011000001000",
				"1010000100000",
				"1010000010000",
				"0011000100000"
			],
			[//A
				"1010000000000",
				"1001000000000",
				"1000000001000",
				"1000000000001",
				"0000000111000",
				"0010000101000",
				"0001000000001",
				"0001000100000",
				"0011000010000"
			],
			[//Bb
				"1100000000000",
				"1000000100000",
				"1000000010000",
				"0011000000000",
				"0000000101000",
				"0000000011000",
				"0000000000011",
				"0000010000001",
				"0010000001000",
				"0001000010000",
				"0010000110000"
			],
			[//B
				"1000000000000",
				"0001000000000",
				"0000000000001",
				"0000000001000",
				"0110000000000"
			],
			[//C
				"0010000000000",
				"0000000100000",
				"0000000010000",
				"0000010000000",
				"0000000000010"
			],
			[//Db
				"0000000000000",
				"0000110000000"
			],
			[//D
				"0000001000000",
				"0000100000000"
			]
		]

		var commonFingerings = [
			[14, 0],//C
			[15, 0],//Db
			[4, 0],//D
			[5, 2],//Eb
			[6, 0],//E
			[7, 0],//F
			[8, 0],//Gb
			[9, 0],//G
			[10, 7],//Ab
			[11, 0],//A
			[12, 3],//Bb
			[13, 0]//B
		];

		var notesFlat = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
		var noteSharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

		var scaleIntervals = [
			2221221,//Lydian
			2212221,//Ionian
			2212212,//Mixolydian
			2122212,//Dorian
			2122122,//Aeolian
			1222122,//Phrygian
			1221222,//Locrian
			2221212,//Lydian Dominant
			2212122,//Aeolian Dominant
			1312122,//Phrygian Dominant
			1311222,//Locrian Dominant
			2222121,//Lydian Augmented
			2122221,//Melodic Minor
			2122131,//Harmonic Minor
			22121121,//Bebop Major
			22122111,//Bebop Dominant
			21112212,//Bebop Dorian 1
			21222111,//Bebop Dorian 2
			21221121,//Bebop Melodic Minor
			21221211,//Bebop Harmonic Minor
			12121212,//Half-Whole Diminished
			21212121,//Whole-Half Diminished
			1212222,//Altered
			111111111111,//Chromatic
			222222,//Whole Tone
			22323,//Major Pentatonic
			32232,//Minor Pentatonic
			321132,//Blues
			313131,//Augmented
			1312131,//Double Harmonic Major
			2131131//Double Harmonic Minor
		];

		var chordIntervals = [
			43,//Major
			34,//Minor
			33,//Diminished
			44,//Augmented
			25,//Suspended 2
			52,//Suspended 4
			432,//Major 6
			342,//Minor 6
			434,//Major 7
			433,//Dominant 7
			343,//Minor 7
			344,//Minor Major 7
			334,//Half Diminished 7
			333,//Fully Diminished 7
			434343,//Major 13(#11)
			433434,//Dominant 13
			433443,//Dominant 13(#11)
			343434,//Minor 13
			4333,//Altered b9
			4335,//Altered #9
			43335,//Altered b9, #11
			43353,//Altered #9, #11
			433352,//Altered b9, #11, b13
			433532,//Altered #9, #11, b13
			43434343434343434//Super Ultra Hyper Mega Meta Lydian
		];

		function convertFingeringToBoolArray(f) {
			var boolArray = [];
			for (var i = 0; i < 13; i++) {
				if (f.charAt(0) === "0")
					boolArray[i] = false;
				else
					boolArray[i] = true;
				f = f.substring(1);
			}
			return boolArray;
		}

		function displayFingering(note, fingering) {
			//idk why this shit aint working
			var realNote = note - 2;
			if (realNote <= 0)
				realNote += 12;
			if (flats) {
				svg.append("p")
					.attr("class", "text")
					.html(notesFlat[realNote]);
			} else {
				svg.append("p")
					.attr("class", "text")
					.html(notesSharp[realNote]);
			}

			var isOn = convertFingeringToBoolArray(fingerings[note][fingering]);
			for (var i = 0; i < 13; i++) {
				if (isOn[i])
					makeKey(keyXOffsets[i] * scale + xOffset, keyYOffsets[i] * scale + yOffset, keySizes[i] * scale, keyImagesOn[i]);
				else {
					makeKey(keyXOffsets[i] * scale + xOffset, keyYOffsets[i] * scale + yOffset, keySizes[i] * scale, keyImages[i]);
				}
			}
			yOffset += 300 * scale;
		}

		function rescale(h) {
			if ($(window).height() / h < $(window).width() / 1650)
				scale = $(window).height() / h * 0.8;//test out numbers here
			else
				scale = $(window).width() / 1650;
		}

		function clearKeys() {
			toolbarHeight = height * 0.1;
			yOffset = 50 + toolbarHeight;
			xOffset = 50;
			svg.selectAll("image").remove();
		}

		function displayNote(note) {
			clearKeys();
			rescale(700 + fingerings[commonFingerings[note][0]].length * 300 + 300);
			displayFingering(commonFingerings[note][0], commonFingerings[note][1]);
			for (var i = 0; i < fingerings[note + 2].length; i++)
				displayFingering(note + 2, i);
		}

		function displayScale(scaleInt, n) {
			clearKeys();
		  var scale = scaleIntervals[scaleInt].toString();
		  var note = n;
			rescale(700 + scale.length * 300);
		  for (var i = 0; i <= scale.length; i++) {
		    displayFingering(commonFingerings[n][0], commonFingerings[n][1]);
				if (spellUpwards) {
			    if (i < scale.length)
			      n -= parseInt(scale.charAt(scale.length - 1 - i));
			    if (n < 0)
			      n += 12;
				} else {
					if (i < scale.length)
			      n += parseInt(scale.charAt(i));
			    if (n >= 12)
			      n -= 12;
				}
		  }
		}

		function displayChord(chordInt, n) {
			clearKeys();
		  var chord = chordIntervals[chordInt].toString();
		  var note = n;
			rescale(700 + chord.length * 300);
			if (spellUpwards) {
				for (var i = 0; i < chord.length; i++) {
					n += parseInt(chord.charAt(i));
					if (n >= 12)
						n -= 12;
				}
			}
		  for (var i = 0; i <= chord.length; i++) {
		    displayFingering(commonFingerings[n][0], commonFingerings[n][1]);
				if (spellUpwards) {
			    if (i < chord.length)
			      n -= parseInt(chord.charAt(chord.length - 1 - i));
			    if (n < 0)
			      n += 12;
				} else {
					if (i < chord.length)
			      n += parseInt(chord.charAt(i));
			    if (n >= 12)
			      n -= 12;
				}
		  }
		}

		//displayChord(24, 0);
