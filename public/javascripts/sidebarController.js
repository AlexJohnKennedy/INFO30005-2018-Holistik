//
function SidebarController() {
    this.sidebar = document.getElementById("sidebar");
    this.listContainer = document.getElementById("listContainer");
}

SidebarController.prototype.clearList = function() {
    //fuck off all of the current list elements
    this.listContainer.innerHTML = null;

};

SidebarController.prototype.buildListElements = function(nodeList) {
    for (let node of nodeList) {
       if (node.parentList.length === 0) {
           this.constructTree(node, 0);
       }
    }
};

//breadth first search to construct the indented lists. note that nodes may appear more than once since node structure
//is not a DAG.
SidebarController.prototype.constructTree = function (curr, depth) {
    //define identifier
    let idPrefix = "unorderedListOfDepth";

    //get the ul corresponding to the current depth, if it doesn't exist, make it!
    let currList = document.getElementById(idPrefix+depth.toString());
    if (currList === null) {
        currList = document.createElement("ul");
        currList.setAttribute("id", idPrefix+depth.toString());
        //add this list as a child of the list of one less depth
        //if depth is zero, dump the list in the list container
        if (depth === 0) {
            this.listContainer.appendChild(currList);
        } else {
            document.getElementById(idPrefix+(depth-1).toString()).appendChild(currList);
        }
    }

    //build a corresponding sidebar element object
    let newSidebarElem = new SidebarElement(curr.idString, document.getElementById(idPrefix+depth.toString()));

    //iterate over children and do the same shit
    for (let rel of curr.childrenList) {
        //Recurse for all children, making them visible
        for (let child of rel.children) {
            //Recurse within this child
            this.constructTree(child, depth+1);
        }
    }
};

//wrapper function to be called any time something has changed in the canvas
SidebarController.prototype.refresh = function(nodeList) {
    this.clearList();
    this.buildListElements(nodeList);
};