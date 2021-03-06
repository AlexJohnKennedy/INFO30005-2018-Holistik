// ---------------------------------------------------------------------------------------------------------------------
// --- RenderLine object prototype -------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------

function RenderLine(sourceNode, destNode) {
    console.log("a new RenderLine was created, from "+sourceNode.idString+" and "+destNode.idString);

    //Store reference to the information we are going to need.
    this.sourceNode = sourceNode;
    this.destNode   = destNode;

    this.sourceHtmlElement = sourceNode.htmlElement;
    this.destHtmlElement   = destNode.htmlElement;

    //When the RenderLine is created, we access the SVG canvas object and add a 'line' to it, spanning from source to destination
    let svg = document.getElementById("svgObject");

    //Create a <polyline> and store it as a property of this object.
    let line = document.createElementNS('http://www.w3.org/2000/svg', "polyline");
    //string concatenation to for a line with a point in the middle to allow for a mid-line svg object
    let x1 = (sourceNode.translation.x + 0.5*sourceNode.size.width).toString();
    let y1 = (sourceNode.translation.y + 0.5*sourceNode.size.height).toString();
    let x2 = (destNode.translation.x + 0.5*sourceNode.size.width).toString();
    let y2 = (destNode.translation.y + 0.5*sourceNode.size.height).toString();
    let pointsString = x1+","+y1+" "+((x1+x2)/2)+","+((y1+y2)/2)+" "+x2+","+y2;
    line.setAttribute("points", pointsString);
    line.setAttribute("marker-mid", "url(#Triangle)");
    svg.appendChild(line);

    this.line = line;

    //The line objects will also have a 'isVisible' flag which we can use to determine visibility in the same way
    //as the nodes.
    this.isVisible = true;  //Default to being visible

    //Add this line to the global collection of lines, so that we can reference it in the visibilty calculations.
    canvasState.hierarchyLines.push(this);
}

/**
 * This function is intended to be called whenever the source or dest nodes move on screen, so that the line can follow their positions.
 *
 * Access the source and destination elements, and directly extract the x and y translation values.
 * Then, update the <line> attributes to move the line in accordance to the node positions.
 */
RenderLine.prototype.update = function() {
    let x1 = parseFloat(this.sourceHtmlElement.getAttribute('xTranslation')) + 0.5*parseFloat(this.sourceHtmlElement.style.width);
    let y1 = parseFloat(this.sourceHtmlElement.getAttribute('yTranslation')) + 0.5*parseFloat(this.sourceHtmlElement.style.height);
    let x2 = parseFloat(this.destHtmlElement.getAttribute('xTranslation')) + 0.5*parseFloat(this.destHtmlElement.style.width);
    let y2 = parseFloat(this.destHtmlElement.getAttribute('yTranslation')) + 0.5*parseFloat(this.destHtmlElement.style.height);

    let pointsString = (x1.toString())+","+
                       (y1.toString())+" "+
                       ((x1+x2)/2).toString()+","+
                       ((y1+y2)/2).toString()+" "+
                       (x2.toString())+","+
                       (y2.toString());
    this.line.setAttribute("points", pointsString);
    this.line.setAttribute("marker-mid", "url(#Triangle)");
};

RenderLine.prototype.hideLine = function() {
    this.line.style.display = "none";
};

RenderLine.prototype.showLine = function () {
    this.line.style.display = "inline";
};

RenderLine.prototype.deleteLine = function() {
    console.log("Render line being deleted");
    let svg = document.getElementById("svgObject");
    svg.removeChild(this.line);

    //Remove from the canvas state as well!
    let index = canvasState.hierarchyLines.indexOf(this);
    if (index !== -1) {
        canvasState.hierarchyLines.splice(index,1);
    }
};