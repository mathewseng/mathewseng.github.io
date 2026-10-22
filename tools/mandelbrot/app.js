
		var svg = d3.select("body").append("svg")
			.attr("viewBox", "0 0 1000 1000")
            .attr("width", 1000)
			.attr("height", 1000);
		svg.append("g")
			.attr("transform", "translate(0, 500)");

		var zoom = 1;
		var xCenter = 0;
		var yCenter = 0;
		var pixels = 250;
		var iterations = 50;
		var colorfulness = 1;
		var size = 1000 / pixels;
		var set = [];
    for (var i = 0; i < pixels; i++) {
			set[i] = new Array(pixels);
    }
		var basicSet = [];
		var space = false;
		var spaceOld = false;
		var up = false;
		var down = false;
		var left = false;
		var right = false;
		var z = false;
		var x = false;
		var borderWidth = 10;
		var moveSpeed = 0.15;
		var zoomSpeed = 1.05;
		var borderVisible = true;
		var sqrtSet = true;
		var borderColor = 0;

		// Z = Z^2 + c
		// cr = real portion of constant; ci = imaginary portion of constant
		function calculate() {
			for (var i = 0; i < pixels; i++) {
				for (var j = 0; j < pixels; j++) {
					var zr = 0;
					var zi = 0;
					var cr = (i - pixels / 2) / (zoom * pixels) * 4 + xCenter;
					var ci = (j - pixels / 2) / (zoom * pixels) * 4 - yCenter;
					var k = 0;
					for (; k < iterations; k++) {
						var zrOld = zr;
						zr = zr * zr + -1 * zi * zi + cr;
						zi = 2 * zrOld * zi + ci;
						if (zr > 2) break;
					}
					if (sqrtSet) {
						set[i][j] = Math.sqrt(k - 2) / Math.sqrt(iterations);
					} else {
						set[i][j] = (k - 2) / iterations;
					}
				}
			}
		}

		calculate();
		basicSet = $.extend(true, [], set);

		function display() {
			for (var i = 0; i < pixels; i++) {
				for (var j = 0; j < pixels; j++) {
					d3.select("svg").append("rect")
						.attr("width", size)
						.attr("height", size)
						.attr("transform", "translate(" + i * size + ", " + j * size + ")")
						.style('fill', 'hsl(' + set[i][j] * 240 * colorfulness + ', 100%, 50%)');
				}
			}
		}

		display();

		$(document).on("keydown", function(e) {if (e.which === 32) {space = true;}});
		$(document).on("keydown", function(e) {if (e.which === 87) {up = true;}});
		$(document).on("keydown", function(e) {if (e.which === 83) {down = true;}});
		$(document).on("keydown", function(e) {if (e.which === 65) {left = true;}});
		$(document).on("keydown", function(e) {if (e.which === 68) {right = true;}});
		$(document).on("keydown", function(e) {if (e.which === 90) {z = true;}});
		$(document).on("keydown", function(e) {if (e.which === 88) {x = true;}});

		$(document).on("keyup", function(e) {if (e.which === 32) {space = false;}});
		$(document).on("keyup", function(e) {if (e.which === 87) {up = false;}});
		$(document).on("keyup", function(e) {if (e.which === 83) {down = false;}});
		$(document).on("keyup", function(e) {if (e.which === 65) {left = false;}});
		$(document).on("keyup", function(e) {if (e.which === 68) {right = false;}});
		$(document).on("keyup", function(e) {if (e.which === 90) {z = false;}});
		$(document).on("keyup", function(e) {if (e.which === 88) {x = false;}});

		function move() {
			if (up) {
				yCenter += moveSpeed / zoom;
			}
			if (down) {
				yCenter -= moveSpeed / zoom;
			}
			if (left) {
				xCenter -= moveSpeed / zoom;
			}
			if (right) {
				xCenter += moveSpeed / zoom;
			}
			if (z) {
				zoom /= zoomSpeed;
			}
			if (x) {
				zoom *= zoomSpeed;
			}

			d3.selectAll(".selection").remove();

			if (borderVisible) {
				d3.select("svg").append("rect")
					.attr("width", 1000 / zoom + borderWidth * 2)
					.attr("height", borderWidth)
					.attr("transform", "translate(" + (xCenter * 250 - 1000 / zoom / 2 + 500 - borderWidth) + ", " + (-yCenter * 250 - 1000 / zoom / 2 + 500 - borderWidth) + ")")
					.attr("class", "selection")
					.style("fill", "#ffffff");
				d3.select("svg").append("rect")
					.attr("width", 1000 / zoom + borderWidth * 2)
					.attr("height", borderWidth)
					.attr("transform", "translate(" + (xCenter * 250 - 1000 / zoom / 2 + 500 - borderWidth) + ", " + (-yCenter * 250 + 1000 / zoom / 2 + 500) + ")")
					.attr("class", "selection")
					.style("fill", "#ffffff");
				d3.select("svg").append("rect")
					.attr("width", borderWidth)
					.attr("height", 1000 / zoom + borderWidth * 2)
					.attr("transform", "translate(" + (xCenter * 250 - 1000 / zoom / 2 + 500 - borderWidth) + ", " + (-yCenter * 250 - 1000 / zoom / 2 + 500 - borderWidth) + ")")
					.attr("class", "selection")
					.style("fill", "#ffffff");
				d3.select("svg").append("rect")
					.attr("width", borderWidth)
					.attr("height", 1000 / zoom + borderWidth * 2)
					.attr("transform", "translate(" + (xCenter * 250 + 1000 / zoom / 2 + 500) + ", " + (-yCenter * 250  - 1000 / zoom / 2 + 500 - borderWidth) + ")")
					.attr("class", "selection")
					.style("fill", "#ffffff");
			}

			if (space == true && spaceOld == false) {
				if (borderVisible) {
					d3.selectAll("rect").remove();
					borderVisible = false;
					calculate();
					display();
					console.log("Zoom: " + zoom + " | xCenter: " + xCenter + " | yCenter: " + yCenter);
				} else {
					d3.selectAll("rect").remove();
					borderVisible = true;
					zoom = 1;
					xCenter = 0;
					yCenter = 0;
					set = $.extend(true, [], basicSet);
					display();
				}
			}
			spaceOld = space;

			if (borderColor === 36) {
				borderColor = -36;
			} else {
				borderColor += 2;
			}
			if (borderColor >= 0) {
				d3.selectAll(".selection")
					.style('fill', 'hsl(0, 0%, ' + (100 - borderColor) + '%)');
			} else {
				d3.selectAll(".selection")
					.style('fill', 'hsl(0, 0%, ' + (100 + borderColor) + '%)');
			}
			//console.log("Space: " + space + " | Up: " + up + " | Down: " + down + " | Left: " + left + " | Right: " + right);
		}

		var tickTimer = setInterval(tick, 10);

		function tick() {
			move();
		}

document.addEventListener("keydown", function(event) { if (event.code === "Space") event.preventDefault(); });
