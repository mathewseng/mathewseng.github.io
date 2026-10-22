const unit = 50
const hexUnit = unit / Math.sqrt(3)
const widthUnits = 26
const heightUnits = 15
const gameWidth = widthUnits * unit
const gameHeight = heightUnits * unit
const center = [gameWidth / 2, gameHeight / 2]
const gridLineWidth = 1
const hatBorderWidth = 3
const svg = d3.select("body")
    .append("svg")
    .attr("width", gameWidth)
    .attr("height", gameHeight + 1)
    .attr("viewBox", `0 0 ${gameWidth} ${gameHeight + 1}`)
    .style("position", "absolute")

function hexToCoord(x, y) {
    return {x: x * unit, y: (x + y * 2) * hexUnit}
}
function drawHex(x, y) {
    let coord = hexToCoord(x, y)
    let points = [
        [-unit / 3, -hexUnit],
        [unit / 3, -hexUnit],
        [unit / 3 * 2, 0],
        [unit / 3, hexUnit],
        [-unit / 3, hexUnit],
        [-unit / 3 * 2, 0]
    ]
    for (point of points) {
        point[0] += coord.x
        point[1] += coord.y
    }
    svg.append("polygon")
        .attr("points", points.join(" "))
        .style("stroke-width", gridLineWidth)
        .attr("class", "hexLine")
}
function drawGrid() {
    for (let i = 0; i <= widthUnits; i++) {
        svg.append("rect")
            .attr("x", unit * i - gridLineWidth / 2)
            .attr("y", 0)
            .attr("width", gridLineWidth)
            .attr("height", gameHeight)
            .attr("class", "gridLine")
    }
    for (let i = -widthUnits; i < widthUnits / 2; i++) {
        svg.append("rect")
            .attr("x", unit * i - gridLineWidth / 2)
            .attr("y", 0)
            .attr("width", gridLineWidth)
            .attr("height", gameHeight * 2)
            .attr("class", "gridLine")
            .attr("transform", "rotate(-60)")
    }
    for (let i = -widthUnits; i < 0; i++) {
        svg.append("rect")
            .attr("x", unit * i - gridLineWidth / 2)
            .attr("y", -gameHeight)
            .attr("width", gridLineWidth)
            .attr("height", gameHeight * 3)
            .attr("class", "gridLine")
            .attr("transform", "rotate(-120)")
    }
    for (let x = 0; x < widthUnits + 1; x++) {
        for (let y = Math.floor(-x * heightUnits / widthUnits); y < widthUnits - x * heightUnits / widthUnits; y++) {
            drawHex(x, y)
        }
    }
}
drawGrid()

function drawHat(x, y, r, flip) {
    let colorClass = "color" + r + (flip ? "f" : "")
    let coord = hexToCoord(x, y)
    let points = [
        [0, 0],
        [0, -hexUnit],
        [unit / 3, -hexUnit],
        [unit / 2, -hexUnit / 2 * 3],
        [unit, -hexUnit],
        [unit, 0],
        [unit / 3 * 4, 0],
        [unit / 2 * 3, hexUnit / 2],
        [unit, hexUnit],
        [unit / 2, hexUnit / 2],
        [unit / 3, hexUnit],
        [-unit / 3, hexUnit],
        [-unit / 2, hexUnit / 2]
    ]
    if (flip) {
        for (point of points) {
            point[1] *= -1
        }
    }
    r *= Math.PI / 3
    for (point of points) {
        let x = point[0]
        let y = point[1]
        point[0] = x * Math.cos(r) - y * Math.sin(r) + coord.x
        point[1] = x * Math.sin(r) + y * Math.cos(r) + coord.y
    }
    svg.append("polygon")
        .attr("points", points.join(" "))
        .style("stroke-width", hatBorderWidth)
        .attr("class", "hat " + colorClass)
}
drawHat(5, 0, 0)
drawHat(6, 1, 4)
drawHat(5, 1, 3)
drawHat(4, 1, 4)
drawHat(4, 0, 0, true)
drawHat(5, -1, 4)
drawHat(6, -1, 5)
drawHat(7, -1, 2)