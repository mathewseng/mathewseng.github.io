var gameTileWidth = Math.ceil(gameWidth / bluRad * startingZoom / finalZoom);
var gameTileHeight = Math.ceil(gameWidth / bluRad * startingZoom / finalZoom);
var levelOpacity = 0;
var dirtPixelation = 4;
var grass = "#31ab1f";
var grassVariation = 16;
var dirtDark = "#623f00";
var dirtLight = "#9b6200";
var dirtVariation = 6;

var level = svg.append("g").attr("id", "level");

function tileToCoord(tile, isY) {
    if (isY) return Math.floor(flipY((tile + 1) * bluRad));
    return Math.floor(tile * bluRad);
}

function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function RGBToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function hexToRGB(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
}
function randomizeComponent(comp, variation) {
    return Math.min(Math.max(comp + Math.round(Math.random() * variation * 2 - variation), 0), 255);
}

function varyColor(hex, variation) {
    let newR = randomizeComponent(hexToRGB(hex).r, variation);
    let newG = randomizeComponent(hexToRGB(hex).g, variation);
    let newB = randomizeComponent(hexToRGB(hex).b, variation);
    return RGBToHex(newR, newG, newB);
}

var colorVariations = 256;
var dirtLightVariations = [];
var dirtDarkVariations = [];
for (let i = 0; i < colorVariations; i++) {
    dirtLightVariations.push(varyColor(dirtLight, dirtVariation));
    dirtDarkVariations.push(varyColor(dirtDark, dirtVariation));
}

var defs = svg.append("defs");
for (let i = 0; i < colorVariations; i++) {
    let newGrass = varyColor(grass, grassVariation);
    let grassGradient = defs.append("linearGradient")
        .attr("id", "grassGradient" + i)
        .attr("x1", "0%")
        .attr("x2", "0%")
        .attr("y1", "0%")
        .attr("y2", "100%"); // Vertical linear gradient
    grassGradient.append("stop")
        .attr("offset", "0%")
        .style("stop-color", newGrass)
        .style("stop-opacity", 1);
    grassGradient.append("stop")
        .attr("offset", "25%")
        .style("stop-color", newGrass)
        .style("stop-opacity", 1);
    grassGradient.append("stop")
        .attr("offset", "100%")
        .style("stop-color", newGrass)
        .style("stop-opacity", 0);
}

d3.selection.prototype.moveToFront = function() {
    return this.each(function(){
        this.parentNode.appendChild(this);
    });
};
var levelEditorGridState = 0;
var levelEditorGrid = svg.append("g").attr("id", "levelEditorGrid").attr("class", "levelEditorGrid");
function drawLevelEditorGrid(keyDown) {
    if (levelEditorGridState === 0 && keyDown) {
        levelEditorGrid.moveToFront();
        for (let i = 0; i < gameWidth; i += bluRad) {
            levelEditorGrid.append("rect")
                .attr("class", "levelEditorGrid")
                .attr("x", i)
                .attr("y", 0)
                .attr("width", 1)
                .attr("height", gameHeight);
        }
        for (let i = 0; i < gameHeight; i += bluRad) {
            levelEditorGrid.append("rect")
                .attr("class", "levelEditorGrid")
                .attr("x", 0)
                .attr("y", flipY(i))
                .attr("width", gameWidth)
                .attr("height", 1);
        }
        for (let i = 0; i < gameTileWidth; i++) {
            for (let j = 0; j < gameTileHeight; j++) {
                levelEditorGrid.append("text")
                    .attr("class", "levelEditorGrid")
                    .attr("x", i * bluRad + 1)
                    .attr("y", flipY(j * bluRad + 25 * Math.pow(zoom, zoom > 1 ? 1.125 : 1.5)))
                    .text(d => i);
                levelEditorGrid.append("text")
                    .attr("class", "levelEditorGrid")
                    .attr("x", i * bluRad + 27 * Math.pow(zoom, zoom > 1 ? 1.0925 : 1.25) - 5 * Math.floor(Math.log10(j ? j : 1)))
                    .attr("y", flipY(j * bluRad + 1))
                    .text(d => j);
            }
        }
        levelEditorGridState++;
    } else if (levelEditorGridState === 1 && !keyDown) {
        levelEditorGridState++;
    } else if (levelEditorGridState === 2 && keyDown) {
        d3.select("#levelEditorGrid").selectAll("*").remove()
        levelEditorGridState++;
    } else if (levelEditorGridState === 3 && !keyDown) {
        levelEditorGridState = 0;
    }
}

function updateLevelOpacity(opacity) {
    levelOpacity = opacity;
    d3.selectAll(".levelDisplay")
        .style("opacity", opacity);
}

function createBlock(x, y) {
    let block = (d3.select(".block[xTile='" + x + "'][yTile='" + y + "']").node()
        ? d3.select(".block[xTile='" + x + "'][yTile='" + y + "']")
        : level.append("g"))
            .attr("class", "block")
            .attr("width", bluRad)
            .attr("height", bluRad)
            .attr("x", tileToCoord(x))
            .attr("y", tileToCoord(y, true))
            .attr("xTile", x)
            .attr("yTile", y);
    return block;
}

function createDirtBlock(x, y) {
    let block = createBlock(x, y);
    x = tileToCoord(x);
    y = tileToCoord(y, true);

    for (let i = 0; i < dirtPixelation; i++) {
        for (let j = 0; j < dirtPixelation; j++) {
            if ((i + j) % 2 === 0) {
                (block.select("#dirt" + i + "-" + j).node()
                    ? block.select("#dirt" + i + "-" + j)
                    : block.append("rect"))
                        .attr("class", "levelDisplay")
                        .attr("id", "dirt" + i + "-" + j)
                        .style("opacity", levelOpacity)
                        .attr("fill", dirtLightVariations[(x + y + i * dirtPixelation + j) % colorVariations])
                        .attr("width", Math.ceil(bluRad / dirtPixelation))
                        .attr("height", Math.ceil(bluRad / dirtPixelation))
                        .attr("x", x + bluRad / dirtPixelation * i)
                        .attr("y", y + bluRad / dirtPixelation * j);
            }
        }
    }

    for (let i = 0; i < dirtPixelation; i++) {
        for (let j = 0; j < dirtPixelation; j++) {
            if ((i + j) % 2 === 1) {
                (block.select("#dirt" + i + "-" + j).node()
                    ? block.select("#dirt" + i + "-" + j)
                    : block.append("rect"))
                        .attr("class", "levelDisplay")
                        .attr("id", "dirt" + i + "-" + j)
                        .style("opacity", levelOpacity)
                        .attr("fill", dirtDarkVariations[(x + y + i * dirtPixelation + j) % colorVariations])
                        .attr("width", Math.ceil(bluRad / dirtPixelation))
                        .attr("height", Math.ceil(bluRad / dirtPixelation))
                        .attr("x", x + bluRad / dirtPixelation * i)
                        .attr("y", y + bluRad / dirtPixelation * j);
            }
        }
    }

    return block;
}

function createGrassBlock(x, y) {
    let tileX = x;
    let block = createDirtBlock(x, y);
    x = tileToCoord(x);
    y = tileToCoord(y, true);

    for (let i = 0; i < dirtPixelation; i++) {
        (block.select("#grass" + i).node()
            ? block.select("#grass" + i)
            : block.append("rect"))
                .attr("class", "levelDisplay")
                .style("fill", "url(#grassGradient" + ((tileX * dirtPixelation + i) % colorVariations) + ")")
                .style("opacity", levelOpacity)
                .attr("width", Math.ceil(bluRad / dirtPixelation))
                .attr("height", Math.ceil(bluRad))
                .attr("x", x + i / 4 * bluRad)
                .attr("y", y);
    }

    return block;
}

function create2x2GrassBlock(x, y) {
    createGrassBlock(x, y);
    createGrassBlock(x + 1, y);
    createDirtBlock(x, y - 1);
    createDirtBlock(x + 1, y - 1);
}

function replaceBlock(x, y, createBlockFunction) {
    d3.selectAll(".block").each(function(d) {
        let blockX = d3.select(this).attr("x");
        let blockY = d3.select(this).attr("y");
        if (blockX == tileToCoord(x) && blockY == tileToCoord(y, true)) {
            d3.select(this).remove();
        }
    });
    createBlockFunction(x, y);
}

function createLevel(level) {
    d3.selectAll(".block").remove();
    switch (level) {
        case 1:
            for (let i = 0; i < gameTileWidth; i++) {
                createGrassBlock(i, 1);
                createDirtBlock(i, 0);
            }
            let x = 8;
            let y = 5;
            while (x < gameTileWidth && y < gameTileHeight) {
                create2x2GrassBlock(x, y);
                x += 8;
                y += 4;
            }
            for (let i = 2; i < 11; i++) {
                createDirtBlock(32, i);
            }
            createGrassBlock(32, 11);
            replaceBlock(32, 1, createDirtBlock);
            break;
    }
}
