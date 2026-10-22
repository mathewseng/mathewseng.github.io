var bluYFlipped = flipY(bluY);

// Make this not delete and create every element each frame
function drawBlu() {
    bluYFlipped = flipY(bluY);

    let blu = (d3.select("#blu").node()
        ? d3.select("#blu")
        : svg.append("g"))
        .attr("id", "blu")
        .attr("class", "blu");

    // Blu Orange Tip
    (d3.select("#bluOrangeTip").node()
        ? d3.select("#bluOrangeTip")
        : blu.append("ellipse"))
        .attr("id", "bluOrangeTip")
        .attr("class", "blu bluOrange")
        .attr("cx", bluX)
        .attr("cy", bluYFlipped - bluRY)
        .attr("rx", bluRX / 16)
        .attr("ry", bluRY / 8);

    // Blu Main Body
    (d3.select("#bluMainBody").node()
        ? d3.select("#bluMainBody")
        : blu.append("ellipse"))
        .attr("id", "bluMainBody")
        .attr("class", "blu bluBlue")
        .attr("cx", bluX)
        .attr("cy", bluYFlipped)
        .attr("rx", bluRX)
        .attr("ry", bluRY);

    (d3.select("#bluBottomLeft").node()
        ? d3.select("#bluBottomLeft")
        : blu.append("ellipse"))
        .attr("id", "bluBottomLeft")
        .attr("class", "blu bluBlue")
        .attr("cx", bluX - bluRX / 2)
        .attr("cy", bluYFlipped + bluRY / 2)
        .attr("rx", bluRX / 2)
        .attr("ry", bluRY / 2);

    (d3.select("#bluBottomRight").node()
        ? d3.select("#bluBottomRight")
        : blu.append("ellipse"))
        .attr("id", "bluBottomRight")
        .attr("class", "blu bluBlue")
        .attr("cx", bluX + bluRX / 2)
        .attr("cy", bluYFlipped + bluRY / 2)
        .attr("rx", bluRX / 2)
        .attr("ry", bluRY / 2);

    (d3.select("#bluBottom").node()
        ? d3.select("#bluBottom")
        : blu.append("rect"))
        .attr("id", "bluBottom")
        .attr("class", "blu bluBlue")
        .attr("x", bluX - bluRX)
        .attr("y", bluYFlipped)
        .attr("width", bluRX * 2)
        .attr("height", bluRY / 2);

    // Blu Green Spot
    (d3.select("#bluGreenSpot").node()
        ? d3.select("#bluGreenSpot")
        : blu.append("ellipse"))
        .attr("id", "bluGreenSpot")
        .attr("class", "blu bluGreen")
        .attr("cx", bluX)
        .attr("cy", bluYFlipped + bluRY / 2)
        .attr("rx", bluRX * 5/8)
        .attr("ry", bluRY * 7/16);

    (d3.select("#bluGreenSpotBottomLeft").node()
        ? d3.select("#bluGreenSpotBottomLeft")
        : blu.append("path"))
        .attr("id", "bluGreenSpotBottomLeft")
        .attr("class", "blu bluGreen")
        .attr("transform", "translate(" + bluX + ", " + (bluYFlipped + bluRY / 2) + ") scale(" + 1 + "," + (bluRY / bluRX * 5/4) + ")")
        .attr("d", d3.arc()
            .innerRadius(0)
            .outerRadius(bluRX * 5/8)
            .startAngle(-Math.PI / 2)
            .endAngle(-Math.PI * 11/16)
        );

    (d3.select("#bluGreenSpotBottomRight").node()
        ? d3.select("#bluGreenSpotBottomRight")
        : blu.append("path"))
        .attr("id", "bluGreenSpotBottomRight")
        .attr("class", "blu bluGreen")
        .attr("transform", "translate(" + bluX + ", " + (bluYFlipped + bluRY / 2) + ") scale(" + 1 + "," + (bluRY / bluRX * 5/4) + ")")
        .attr("d", d3.arc()
            .innerRadius(0)
            .outerRadius(bluRX * 5/8)
            .startAngle(Math.PI / 2)
            .endAngle(Math.PI * 11/16)
        );

    (d3.select("#bluGreenSpotBottom").node()
        ? d3.select("#bluGreenSpotBottom")
        : blu.append("rect"))
        .attr("id", "bluGreenSpotBottom")
        .attr("class", "blu bluGreen")
        .attr("x", bluX - bluRX / 2)
        .attr("y", bluYFlipped + bluRY * 3/4)
        .attr("width", bluRX)
        .attr("height", bluRY * 1/8);

    // Blu Green Line
    (d3.select("#bluGreenLine").node()
        ? d3.select("#bluGreenLine")
        : blu.append("rect"))
        .attr("id", "bluGreenLine")
        .attr("class", "blu bluGreenLine")
        .attr("x", bluX - bluRX / 32)
        .attr("y", bluYFlipped + bluRY / 2)
        .attr("width", bluRX / 16)
        .attr("height", bluRY / 2);

    (d3.select("#bluGreenLineTip").node()
        ? d3.select("#bluGreenLineTip")
        : blu.append("ellipse"))
        .attr("id", "bluGreenLineTip")
        .attr("class", "blu bluGreenLine")
        .attr("cx", bluX)
        .attr("cy", bluYFlipped + bluRY / 2)
        .attr("rx", bluRX / 32)
        .attr("ry", bluRY / 32);

    // Cover bottom part of green spot
    (d3.select("#bluGreenSpotInnerCover").node()
        ? d3.select("#bluGreenSpotInnerCover")
        : blu.append("rect"))
        .attr("id", "bluGreenSpotInnerCover")
        .attr("class", "blu bluBlue")
        .attr("x", bluX - bluRX * 2/3)
        .attr("y", bluYFlipped + bluRY * 7/8)
        .attr("width", bluRX * 4/3)
        .attr("height", bluRY * 1/16);

    (d3.select("#bluGreenSpotOuterCover").node()
        ? d3.select("#bluGreenSpotOuterCover")
        : blu.append("rect"))
        .attr("id", "bluGreenSpotOuterCover")
        .attr("class", "blu bluBlue")
        .attr("x", bluX - bluRX / 2)
        .attr("y", bluYFlipped + bluRY * 7/8)
        .attr("width", bluRX)
        .attr("height", bluRY * 1/8);

    // Blu Eyes
    (d3.select("#bluLeftEye").node()
        ? d3.select("#bluLeftEye")
        : blu.append("ellipse"))
        .attr("id", "bluLeftEye")
        .attr("class", "blu black")
        .attr("cx", bluX - bluRX * 13/32)
        .attr("cy", bluYFlipped - bluRY * 13/32)
        .attr("rx", bluRX / 8)
        .attr("ry", bluRY / 8);

    (d3.select("#bluRightEye").node()
        ? d3.select("#bluRightEye")
        : blu.append("ellipse"))
        .attr("id", "bluRightEye")
        .attr("class", "blu black")
        .attr("cx", bluX + bluRX * 13/32)
        .attr("cy", bluYFlipped - bluRY * 13/32)
        .attr("rx", bluRX / 8)
        .attr("ry", bluRY / 8);

    // Blu Mouth
    (d3.select("#bluMouth").node()
        ? d3.select("#bluMouth")
        : blu.append("path"))
        .attr("id", "bluMouth")
        .attr("class", "blu black")
        .attr("transform", "translate(" + bluX + ", " + (bluYFlipped - bluRY / 3) + ") scale(" + 1 + "," + (bluRY / bluRX) + ")")
        .attr("d", d3.arc()
            .innerRadius(bluRX / 5)
            .outerRadius(bluRX / 4)
            .startAngle(Math.PI * 3/4)
            .endAngle(Math.PI * 5/4)
        );

    (d3.select("#bluMouthLeftTip").node()
        ? d3.select("#bluMouthLeftTip")
        : blu.append("ellipse"))
        .attr("id", "bluMouthLeftTip")
        .attr("class", "blu black")
        .attr("cx", bluX - bluRX * 9/40 * Math.sqrt(2) / 2)
        .attr("cy", bluYFlipped + bluRY * (-1/3 + 9/40 * Math.sqrt(2) / 2))
        .attr("rx", bluRX / 40)
        .attr("ry", bluRY / 40);

    (d3.select("#bluMouthRightTip").node()
        ? d3.select("#bluMouthRightTip")
        : blu.append("ellipse"))
        .attr("id", "bluMouthRightTip")
        .attr("class", "blu black")
        .attr("cx", bluX + bluRX * 9/40 * Math.sqrt(2) / 2)
        .attr("cy", bluYFlipped + bluRY * (-1/3 + 9/40 * Math.sqrt(2) / 2))
        .attr("rx", bluRX / 40)
        .attr("ry", bluRY / 40);

    // Blu Outline
    (d3.select("#bluOutlineTop").node()
        ? d3.select("#bluOutlineTop")
        : blu.append("path"))
        .attr("id", "bluOutlineTop")
        .attr("class", "blu bluOutline")
        .attr("transform", "translate(" + bluX + ", " + bluYFlipped + ") scale(" + 1 + "," + (bluRY / bluRX) + ")")
        .attr("d", d3.arc()
            .innerRadius(bluRX * 15/16)
            .outerRadius(bluRX)
            .startAngle(-Math.PI / 2)
            .endAngle(Math.PI / 2)
        );

    (d3.select("#bluOutlineLeft").node()
        ? d3.select("#bluOutlineLeft")
        : blu.append("rect"))
        .attr("id", "bluOutlineLeft")
        .attr("class", "blu bluOutline")
        .attr("x", bluX - bluRX)
        .attr("y", bluYFlipped)
        .attr("width", bluRX / 16)
        .attr("height", bluRY / 2);

    (d3.select("#bluOutlineRight").node()
        ? d3.select("#bluOutlineRight")
        : blu.append("rect"))
        .attr("id", "bluOutlineRight")
        .attr("class", "blu bluOutline")
        .attr("x", bluX + bluRX * 15/16)
        .attr("y", bluYFlipped)
        .attr("width", bluRX / 16)
        .attr("height", bluRY / 2);

    (d3.select("#bluOutlineBottomLeft").node()
        ? d3.select("#bluOutlineBottomLeft")
        : blu.append("path"))
        .attr("id", "bluOutlineBottomLeft")
        .attr("class", "blu bluOutline")
        .attr("transform", "translate(" + (bluX - bluRX / 2) + ", " + (bluYFlipped + bluRY / 2) + ") scale(" + 1 + "," + (bluRY / bluRX) + ")")
        .attr("d", d3.arc()
            .innerRadius(bluRX * 7/16)
            .outerRadius(bluRX / 2)
            .startAngle(Math.PI)
            .endAngle(Math.PI * 3/2)
        );

    (d3.select("#bluOutlineBottomRight").node()
        ? d3.select("#bluOutlineBottomRight")
        : blu.append("path"))
        .attr("id", "bluOutlineBottomRight")
        .attr("class", "blu bluOutline")
        .attr("transform", "translate(" + (bluX + bluRX / 2) + ", " + (bluYFlipped + bluRY / 2) + ") scale(" + 1 + "," + (bluRY / bluRX) + ")")
        .attr("d", d3.arc()
            .innerRadius(bluRX * 7/16)
            .outerRadius(bluRX / 2)
            .startAngle(Math.PI / 2)
            .endAngle(Math.PI)
        );

    (d3.select("#bluOutlineBottom").node()
        ? d3.select("#bluOutlineBottom")
        : blu.append("rect"))
        .attr("id", "bluOutlineBottom")
        .attr("class", "blu bluOutline")
        .attr("x", bluX - bluRX / 2)
        .attr("y", bluYFlipped + bluRY * 15/16)
        .attr("width", bluRX)
        .attr("height", bluRY / 16);

    // Blu Inner Outline
        (d3.select("#bluInnerOutlineTop").node()
        ? d3.select("#bluInnerOutlineTop")
        : blu.append("path"))
        .attr("id", "bluInnerOutlineTop")
        .attr("class", "blu bluInnerOutline")
        .attr("transform", "translate(" + bluX + ", " + bluYFlipped + ") scale(" + 1 + "," + (bluRY / bluRX) + ")")
        .attr("d", d3.arc()
            .innerRadius(bluRX * 14/16)
            .outerRadius(bluRX * 15/16)
            .startAngle(-Math.PI / 2)
            .endAngle(Math.PI / 2)
        );

    (d3.select("#bluInnerOutlineLeft").node()
        ? d3.select("#bluInnerOutlineLeft")
        : blu.append("rect"))
        .attr("id", "bluInnerOutlineLeft")
        .attr("class", "blu bluInnerOutline")
        .attr("x", bluX - bluRX * 15/16)
        .attr("y", bluYFlipped)
        .attr("width", bluRX / 16)
        .attr("height", bluRY / 2);

    (d3.select("#bluInnerOutlineRight").node()
        ? d3.select("#bluInnerOutlineRight")
        : blu.append("rect"))
        .attr("id", "bluInnerOutlineRight")
        .attr("class", "blu bluInnerOutline")
        .attr("x", bluX + bluRX * 14/16)
        .attr("y", bluYFlipped)
        .attr("width", bluRX / 16)
        .attr("height", bluRY / 2);

    (d3.select("#bluInnerOutlineBottomLeft").node()
        ? d3.select("#bluInnerOutlineBottomLeft")
        : blu.append("path"))
        .attr("id", "bluInnerOutlineBottomLeft")
        .attr("class", "blu bluInnerOutline")
        .attr("transform", "translate(" + (bluX - bluRX / 2) + ", " + (bluYFlipped + bluRY / 2) + ") scale(" + 1 + "," + (bluRY / bluRX) + ")")
        .attr("d", d3.arc()
            .innerRadius(bluRX * 6/16)
            .outerRadius(bluRX * 7/16)
            .startAngle(Math.PI)
            .endAngle(Math.PI * 3/2)
        );

    (d3.select("#bluInnerOutlineBottomRight").node()
        ? d3.select("#bluInnerOutlineBottomRight")
        : blu.append("path"))
        .attr("id", "bluInnerOutlineBottomRight")
        .attr("class", "blu bluInnerOutline")
        .attr("transform", "translate(" + (bluX + bluRX / 2) + ", " + (bluYFlipped + bluRY / 2) + ") scale(" + 1 + "," + (bluRY / bluRX) + ")")
        .attr("d", d3.arc()
            .innerRadius(bluRX * 6/16)
            .outerRadius(bluRX * 7/16)
            .startAngle(Math.PI / 2)
            .endAngle(Math.PI)
        );

    (d3.select("#bluInnerOutlineBottom").node()
        ? d3.select("#bluInnerOutlineBottom")
        : blu.append("rect"))
        .attr("id", "bluInnerOutlineBottom")
        .attr("class", "blu bluInnerOutline")
        .attr("x", bluX - bluRX / 2)
        .attr("y", bluYFlipped + bluRY * 14/16)
        .attr("width", bluRX)
        .attr("height", bluRY / 16);
}

drawBlu();
