
			//focus on text box and press enter to click the find button
			document.getElementById("input").focus();
			$("#input").keyup(function(event) {
				if (event.keyCode === 13) {
						$("#find").click();
				}
			});

			var dataset = "";
			jQuery.get("harry-potter-and-the-philosopher-s-stone.txt", function(data) {
                dataset = data;
                init();
                document.getElementById("find").disabled = false;
                document.getElementById("output").textContent = "Ready. Enter a phrase to find its letters hidden in the text.";
            }).fail(function() {
                document.getElementById("output").textContent = "The source text could not be loaded. Please refresh to try again.";
            });

			var datasetElements = [];
			function init() {
				console.log("loaded");
				for (var i = 0; i < dataset.length; i++) {
					datasetElements.push([i, dataset.charAt(i).toLowerCase()]);
				}
			}

			//define all variables outside for debugging
			var phraseOriginal = "";
            var phrase = "";
			var charsInPhrase = [];
			var tempDatasetElements = [];
			var newtempDatasetElements = [];
			var startingIndexes = [];
			var tempStartingIndex = 0;
			var phraseElementsArray = [];
			var shortestLength = 0;
			var shortestElements = [];
			var startPoint = 0;
			var endPoint = 0;
			var passage = [];
			function find() {
				phraseOriginal = document.getElementById("input").value;
                phrase = phraseOriginal.replace(/\s+/g, "").toLowerCase();
				if (phrase.length < 2) {
					document.getElementById("output").innerHTML = "The phrase must be at least 2 characters long";
					return;
				}
				//puts all the characters in the phrase into an array in the form of [index, char]
				charsInPhrase = [];
				for (var i = 0; i < phrase.length; i++) {
					var alreadyInList = false;
					for (var j = 0; j < charsInPhrase.length; j++) {
						if (phrase.charAt(i) === charsInPhrase[j]) {
							alreadyInList = true;
							break;
						}
					}
					if (!alreadyInList) {
                        charsInPhrase.push(phrase.charAt(i));
					}
				}

				//curates the dataset so it only contains the characters in the phrase
				tempDatasetElements = datasetElements.slice();
				newtempDatasetElements = [];
				for (var i = 0; i < tempDatasetElements.length; i++) {
					var matchesChar = false;
					for (var j = 0; j < charsInPhrase.length; j++) {
						if (tempDatasetElements[i][1] === charsInPhrase[j]) {
							matchesChar = true;
							break;
						}
					}
					if (matchesChar) {
						newtempDatasetElements.push(tempDatasetElements[i]);
					}
				}
				tempDatasetElements = newtempDatasetElements;

				//finds the indexes of the first character of the phrase in tempDatasetElements
				startingIndexes = [];
				tempStartingIndex = 0;
				while (true) {
					var firstIndex = -1;
					for (var i = tempStartingIndex; i < tempDatasetElements.length; i++) {
						if (tempDatasetElements[i][1] === phrase.charAt(0)) {
							firstIndex = i;
							break;
						}
					}
					if (firstIndex === -1) {
						break;
					}
					var secondIndex;
					for (var i = firstIndex; i < tempDatasetElements.length; i++) {
						if (tempDatasetElements[i][1] === phrase.charAt(1)) {
							secondIndex = i;
							break;
						}
					}
					for (var i = secondIndex - 1; i > firstIndex; i--) {
						if (tempDatasetElements[i][1] === phrase.charAt(0)) {
							firstIndex = i;
							break;
						}
					}
					//add the index of the character in tempDatasetElements
					tempDatasetElements[firstIndex].push(firstIndex);
					startingIndexes.push(tempDatasetElements[firstIndex]);
					tempStartingIndex = firstIndex + 1;
				}

				//finds all the characters of the phrase in order
				phraseElementsArray = [];
				for (var i = 0; i < startingIndexes.length; i++) {
					var phraseElements = [];
					var startIndex = startingIndexes[i][2];
					for (var j = 0; j < phrase.length; j++) {
						for (var k = startIndex; k < tempDatasetElements.length; k++) {
							if (tempDatasetElements[k][1] === phrase.charAt(j)) {
								phraseElements.push(tempDatasetElements[k]);
								startIndex = k + 1;
								break;
							}
						}
					}
					if (phraseElements.length != phrase.length) {
						break;
					}
					phraseElementsArray.push(phraseElements);
				}

				//find the shortest passage with the phrase in it
				shortestLength = dataset.length;
				shortestElements = [];
				for (var i = 0; i < phraseElementsArray.length; i++) {
					var length = phraseElementsArray[i][phrase.length - 1][0] - phraseElementsArray[i][0][0];
					if (length < shortestLength) {
						shortestLength = length;
						shortestElements = phraseElementsArray[i];
					}
				}

				if (!shortestElements.length) {
                    document.getElementById("output").textContent = "No passage contains that phrase.";
                    return;
                }
                //start and end the passage with a full word
				startPoint = shortestElements[0][0];
				while (startPoint > 0) {
					if (dataset.charAt(startPoint) === " " || dataset.charAt(startPoint) === dataset.charAt(0)) {//dataset.charAt(0) is the return key
						startPoint++;
						break;
					}
					startPoint--;
				}
				endPoint = shortestElements[phrase.length - 1][0];
				while (endPoint < dataset.length) {
					if (dataset.charAt(endPoint) === " " || dataset.charAt(endPoint) === dataset.charAt(0)) {
						break;
					}
					endPoint++;
				}
				passage = dataset.substring(startPoint, endPoint);
				for (var i = 0; i < phrase.length; i++) {
					var index = shortestElements[i][0] - startPoint + i * 2;
					passage = passage.slice(0, index) + "[" + dataset.charAt(shortestElements[i][0]) + "]" + passage.slice(index + 1);
				}
				passage = passage.replace(/\]\[/g, "");

				document.getElementById("output").textContent = passage;
			}
