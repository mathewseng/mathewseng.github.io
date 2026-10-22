var cards = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]
var svgSize = Math.floor(Math.min(window.innerWidth - 32, Math.max(390, window.innerHeight - 180)) / 13) * 13
var fontSize = Math.max(12, svgSize / 13 / 4)

var svg = d3.select("#legacy-stage").append("svg")
    .attr("width", svgSize)
    .attr("height", svgSize)

for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
        let g = svg.append("g")
            .attr("width", svgSize / 13)
            .attr("height", svgSize / 13)
            .attr("x", svgSize / 13 * i)
            .attr("y", svgSize / 13 * j)
        g.append("rect")
            .attr("width", svgSize / 13)
            .attr("height", svgSize / 13)
            .attr("x", svgSize / 13 * i)
            .attr("y", svgSize / 13 * j)
            .attr("fill", "rgb(" + Math.round(255/13 * i) + "," + Math.round(255/13 * j) + ", 0)")
        g.append("text")
            .attr("class", "text")
            .attr("x", svgSize / 13 * i)
            .attr("y", svgSize / 13 * j + fontSize - 2)
            .style("font-size", fontSize)
            .text(i == j ? cards[i] + cards[j] : i < j ? cards[i] + cards[j] + "o" : cards[j] + cards[i] + "s")
    }
}

function roll() {
    document.getElementById("prototype-roll").textContent = "Roll: " + Math.floor(Math.random() * 100)
}