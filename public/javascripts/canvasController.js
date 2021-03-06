//Create local 'state' objects to remember all the canvas related logic objects.
//This will be a storage of all the content nodes, and all the 'resource' nodes (To be implemented later..)
//Access to the relationship objects will be done VIA the content nodes, and they cannot exist in isolation.
//(See the OOP modelling for nodes)
const canvasState = {
    contentNodeList : [],   //Initially, there are no nodes! Of course there must be some 'load' function to reload previous projects.
    resourceNodeList : [],
    contextNode: null,      //A node object which represents the 'current view context'. The node that has been 'zoomed into' so to speak.
    rootNodes : [],         //The root nodes of the current view context, relative to the context node! Indicate which nodes should appear as roots on the screen
    viewDepth : 50,         //The current maximum view depth to be displayed on the canvas.
    hierarchyLines : [],
    showingNodes : [],      //List of all content nodes which are currently 'showing' their info (i.e. expanded)
    projectLoaded : false,
    globalContextArrangement : ""
};

let ajaxHandler = null;
let hasWritePermission = false;

let undoHandler = null;
const MAX_UNDO_STATES = 50;     //How many changes to locally remember, for undoing.


//Define a default translation (relative to the drawing canvas) to place newly created nodes at.
//Later on, we should probably make nodes appear on a cursor translation, or something more user-friendly.
const defaultNodePosition = {
    x : 200,     //Corresponding values to CSS 'absolute translation' coordinates.
    y : 200
};
const defaultColour = "#a6cdf2";
const defaultNodeSize = {
    height : 60,
    width  : 120
};

//Define a threshold constant for determining how tall a content node needs to be in order for the title text to
//appear CENTRED (vertically), as oppossed to sticking at the top of the element!
const CENTRE_VERTICAL_ALIGNMENT_HEIGHT_THRESHOLD = 90;
const MAX_NODE_TITLE_LENGTH                      = 50;
const MAX_NODES_SHOWING_CONCURRENT_INFO          = 4;
const CANVAS_HEIGHT                              = 3000;    //Pixels (MAKE SURE IT MATCHES THE CSS VALUE!)
const CANVAS_WIDTH                               = 3000;    //Pixels (MAKE SURE IT MATCHES THE CSS VALUE!)

const MIN_NODE_WIDTH  = 100;
const MAX_NODE_WIDTH  = 300;
const MIN_NODE_HEIGHT = 50;
const MAX_NODE_HEIGHT = 200;

const TOOLBAR_FADEOUT_TIME_MS = 5000;   //Millisecond; how long to wait until the toolbar should fade out if the mouse has not entered it.
let toolbarFadeTimeoutId;

const defaultNodeTitle = "New concept";
const defaultNodeDesc  = "See the 'Help' page for some tips on using Holistik!";
const defaultHierarchicalRelationshipLabel = "Child";

//Define a counter which will track the current 'id' number to append
let currIdNum = 0;
const idPrefix  = "contentNode";

//Define default spacing between 'auto arranged' nodes, which will define spacing for whenever we need to re-arrange guys
let childrenVerticalSpacing   = 35;   //pixels. Vertical space between parents and children.
let childrenHorizontalSpacing = 20;   //pixels. Horizontal space between children.
let verticalSpacing           = 50;   //pixels. Vertical space between un-related nodes. (not including semantic relationships).
let horizontalSpcaing         = 60;   //pixels. Horizontal space between un-related nodes. (not including semantic relationships).

let currTopZIndex = 2;      //TODO figure out a non-cancerous non-overflow-vulnerable way of tracking the 'top' of the render stack

// ---------------------------------------------------------------------------------------------------------------------
// --- Initialisation logic for when page first loads ------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Define initialisation behviour when the page finishes loading
 */
window.onload = function() {
    console.log("Loading page");

    console.log(window);

    //Set up the project loader object to manage our saving and loading. Get the respective project id from local browser memory
    let projectIdString = window.localStorage.getItem("projectId");
    if (projectIdString === undefined || projectIdString == null) {
        //Guest user!
    }
    else {
        console.log("Loading page: Project id (as string) is "+projectIdString);
        console.log(typeof(projectIdString));

        ajaxHandler = new AjaxProjectLoader(projectIdString);

        //Load the project we are associated with!
        ajaxHandler.loadProjectFromServer();

        //Set the title of the project as well
        let title = window.localStorage.getItem("projectName");
        if (title !== undefined && title != null) {
            document.getElementById("sidebarProjectTitle").innerText = title;
        }

        let wp = window.localStorage.getItem("writePermission");
        if (wp !== undefined && wp != null && wp === "true") {
            hasWritePermission = true;  //Set a flag, so tha we know not to attempt to send save requests during this session, since they will just fail.
        }
        else {
            //Disable the save button, and inform them that pressing save is not allowed.
            let saveBtn = document.getElementById("testButton2");
            saveBtn.setAttribute("disabled","true");
            saveBtn.setAttribute("title","You do not have permission to save changes to this project!");
        }
    }

    //Set up the undo handler after everything else is loaded!
    undoHandler = new UndoManager(MAX_UNDO_STATES);

    setupToolbarFading();
};

function setupToolbarFading() {
    //Set up faded in and out callbacks for the toolbar. This will make it fade away to invisible if the mouse has not entered it for a specified time.
    let toolbar = document.getElementById("toolbar");
    toolbar.addEventListener("mouseenter", function(event) {
        //Cancel any previous timeout event!
        if (toolbarFadeTimeoutId !== undefined) {
            clearTimeout(toolbarFadeTimeoutId);
        }

        let elem = event.currentTarget;

        //Make it instantly visible!
        elem.style.transitionProperty = "opacity";
        elem.style.transitionDuration = "0s";
        elem.style.opacity = "1.0";
    });
    toolbar.addEventListener("mouseleave", function(event) {
        //Set a timeout callback, to invoke the fade out after some specified time...
        //Make sure to save the id! that way we can cancel the timer if the mouse reenters the toolbar!!
        toolbarFadeTimeoutId = setTimeout(function(elem) {
            //Make the passed element fade out.
            elem.style.transitionProperty = "opacity";
            elem.style.transitionDuration = "1s";
            elem.style.opacity = "0.0";
        }, TOOLBAR_FADEOUT_TIME_MS, event.currentTarget);
    });

    //Set up the intial fade timeout event..
    toolbarFadeTimeoutId = setTimeout(function(elem) {
        //Make the passed element fade out.
        elem.style.transitionProperty = "opacity";
        elem.style.transitionDuration = "1s";
        elem.style.opacity = "0.0";
    }, TOOLBAR_FADEOUT_TIME_MS, toolbar);
}

function saveProject() {
    if (ajaxHandler !== undefined && ajaxHandler != null) {
        //We must be logged in
        ajaxHandler.saveProjectToServer();
    }
    else {
        //TODO: Guest user saving (local save)
    }
}

function loadProject() {
    if (ajaxHandler !== undefined && ajaxHandler != null) {
        //We must be logged in
        ajaxHandler.loadProjectFromServer();
    }
    else {
        //TODO: Guest user loading (local load)
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// --- Node creation functionality -------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
// These functions will access the page DOM and generate new or delete old HTML elements, representing 'content nodes'
// to be rendered on the page. Accordingly, the logical models of these elements will be updated in the canvasState
// object structure as well.

/**
 * This function is only invoked by the USER (by pressing a ui element), and creates a brand new node on the current
 * canvas. This funciton is how they add new nodes to their project.
 *
 * Note that this function is not responsible for BUILDING THE OBJECT ITSELF, rather, it invokes buildContentNode()
 * and then adds the resulting node to the canvas state.
 */
function createNewContentNode() {
    //Create the HTML element for this node by directly editing the browser DOM.
    //The creation method will return the new html element object, and it's id string.

    //assign an id for the new element based on the current 'tracking'
    let idString = idPrefix + currIdNum;
    currIdNum++;

    let newNode = buildContentNode(idString, true);  //True to indicate we are adding it as a root.

    canvasState.contentNodeList.push(newNode);
    addNewRootNode(newNode);    //Any newly created node is automatically said to be an additional root node, by design.

    //call edit window TODO: MAKE IT SO THAT THE EDIT WINDOW SUBMIT BUTTON IS WHAT CREATES THE NEW NODE, NOT THE OTHER WAY ROUND
    newNode.editNodeContent();

    /*TODO - automatically rearrange nodes on screen after placing a new one, since it may be overlapping if there was a node already in the default spawn location*/

    undoHandler.recordChange();
}

/**
 * This function will simply create a new content node OBJECT and place it at the specified default location.
 * Accordingly, the new node will be tracked by the canvasState.
 * The new node will have an associated HTML div element in the DOM, such that it can be rendered.
 * The HTML element will have a unique id, and have the associated class types to allow interact.js library to
 * apply it's drag/drop/resize functionality to the node.
 */
function buildContentNode(idString, buildAsRoot) {
    //Get the scroll position of the canvas window so we can always spawn a new node such that it is visible
    let canvasWindow = document.getElementById("canvasWindow");
    let xpos = canvasWindow.scrollLeft + defaultNodePosition.x;
    let ypos = canvasWindow.scrollTop + defaultNodePosition.y;

    let newElemDetails = createNewContentNode_HtmlElement(xpos, ypos, idString);

    //Use the returned details to create a new logical object representing the HTML element, and store it.
    let newNode = new ContentNode(newElemDetails.elementReference, newElemDetails.elementId, newElemDetails.x, newElemDetails.y, newElemDetails.height, newElemDetails.width, newElemDetails.observer);

    if (!buildAsRoot) {
        removeRootNode(newNode);    //Don't add this boy as a root!
    }

    return newNode;
}

function createNewContentNode_HtmlElement(xPos, yPos, idString) {
    //Access the DOM, and find the drawingCanvas element. We will add the new content node as a DIV nested inside of this
    let drawingCanvas = document.getElementById("drawingCanvas");

    let newElem = document.createElement("div");

    //Add element as a child of the canvas object!
    drawingCanvas.appendChild(newElem);

    newElem.setAttribute("id", idString);    //Assign the id.
    //Assign the classes we need. Most of them facilitate interaction with interact.js library.
    newElem.setAttribute("class", "draggable drag-drop dropzone contentNode node");

    //We will store the translation VALUES as attributes in the HTML DOM object itself, so that the interaction libraries can easily access them!
    newElem.setAttribute("xTranslation", xPos.toString());
    newElem.setAttribute("yTranslation", yPos.toString());
    newElem.setAttribute("xSize", defaultNodeSize.width.toString());
    newElem.setAttribute("ySize", defaultNodeSize.height.toString());

    newElem.style.backgroundColor = defaultColour;  //Colour will determine the background colour of the element, since that forms actual 'fill colour'
    newElem.style.height = defaultNodeSize.height + "px";
    newElem.style.width  = defaultNodeSize.width  + "px";
    newElem.style.transform = 'translate(' + xPos + 'px, ' + yPos + 'px)';

    //Add the expand children button, and the show info button
    addExpandChildrenHTMLButton(newElem);
    addShowInfoButton(newElem);
    addEditButton(newElem);
    addRootNodeBorderElem(newElem);
    addTitleTextElem(newElem, defaultNodeTitle, defaultNodeDesc);

    //Add a double click listener to invoke the 'zoom in' functionality.
    newElem.addEventListener("dblclick", zoomContextIn);

    //Add a 'mouseEnter' listener to activate visibility on the utility elements of the nodes, and a 'mouseLeave' listener to hide them
    newElem.addEventListener("mouseenter", function(event) {
        event.currentTarget.getElementsByClassName("showInfoButton").item(0).style.opacity       = "1";
        event.currentTarget.getElementsByClassName("expandChildrenButton").item(0).style.opacity = "1";
        event.currentTarget.getElementsByClassName("editButton").item(0).style.opacity           = "1";
    });
    newElem.addEventListener("mouseleave", function(event) {
        event.currentTarget.getElementsByClassName("showInfoButton").item(0).style.opacity       = "0";
        event.currentTarget.getElementsByClassName("expandChildrenButton").item(0).style.opacity = "0";
        event.currentTarget.getElementsByClassName("editButton").item(0).style.opacity           = "0";
    });

    //Set up an observer for this HTML element, so that we can respond whenever the element is moved
    let observer = setupElementObserver(newElem);

    //Return the html element we just made, and it's id string.
    return {
        elementReference : newElem,
        elementId        : idString,
        x                : xPos,
        y                : yPos,
        height           : defaultNodeSize.height,
        width            : defaultNodeSize.width,
        observer         : observer
    };
}

function addTitleTextElem(elem, name, desc) {
    //The title of the node will be contained within a separate div, so that we can control it's position and visibility
    //independently of the node itself!
    let form = document.createElement("div");
    form.classList.add("nodeTitleText");
    form.innerText = name;

    elem.appendChild(form);

    let descriptionText = document.createElement("div");
    descriptionText.classList.add("nodeDescriptionText");
    descriptionText.innerText = desc;
    descriptionText.style.opacity = "0";

    elem.appendChild(descriptionText);
}

function addRootNodeBorderElem(elem) {
    let extraBorder = document.createElement("div");
    extraBorder.classList.add("rootNodeBorderElement");     //Supply static styling elements

    extraBorder.style.height = (defaultNodeSize.height+8)+"px";      //Initialise dynamic styling
    extraBorder.style.width  = (defaultNodeSize.width+8)+"px";
    extraBorder.style.display = "block";

    elem.appendChild(extraBorder);
}

function addEditButton(elem) {
    let button = document.createElement("div");
    button.classList.add("editButton");
    button.classList.add("utilityButton");  //Indicate that this is some kind of interactable button. Needed to cancel out nested events
    button.addEventListener("click", editButtonCallback); //add a listener for the button
    button.style.left = (defaultNodeSize.width-40)+"px";
    button.style.top = (defaultNodeSize.height-17)+"px";
    button.style.opacity = "0";

    elem.appendChild(button);
}

function editButtonCallback(event) {
    let nodeElem = event.currentTarget.parentNode;
    let node     = getContentNode(nodeElem);

    node.editNodeContent();
}

function addShowInfoButton(elem) {
    let button = document.createElement("div");
    button.classList.add("showInfoButton");
    button.classList.add("utilityButton");  //Indicate that this is some kind of interactable button. Needed to cancel out nested events
    button.style.left = (defaultNodeSize.width-20)+"px";
    button.style.top = (defaultNodeSize.height-17)+"px";
    button.style.opacity = "0";

    //Add an onlick listener to the button.
    button.addEventListener("click", showInfoButtonCallback);

    elem.appendChild(button);
}
function showInfoButtonCallback(event) {
    let nodeElem = event.currentTarget.parentNode;
    let node     = getContentNode(nodeElem);

    if (!node.isShowingInfo) {
        node.showInfo();
    }
    else {
        node.hideInfo();
    }
}

function addExpandChildrenHTMLButton(elem) {
    //This function adds a button to the nodes that will be used to expand/collapse (show hide children)
    //Create a new div.
    let button = document.createElement("div");

    //Add styling class
    button.classList.add("expandChildrenButton");               //General button styling.
    button.classList.add("expandChildrenButton_expanded");      //Styling to supply the correct rotation.
    button.classList.add("utilityButton");  //Indicate that this is some kind of interactable button. Needed to cancel out nested events

    button.style.top = (defaultNodeSize.height-17)+"px";
    button.style.left = "6px";

    button.style.opacity = "0";

    //Add an onclick listener to the button.
    button.addEventListener("click", expandChildrenButtonClickedCallback);

    elem.appendChild(button);
}
function expandChildrenButtonClickedCallback(event) {
    console.log("expand button clicked");

    //Access the html element which was clicked, then traverse to the direct parent in order to find the HTML node element.
    let nodeElem = event.target.parentNode;

    //Find the logical node object which corresponds to this.
    let node = getContentNode(nodeElem);

    //Toggle the isExpanded state! Equally, apply visual styling changes to the button element to reflect the change.
    if (node.isExpanded) {
        node.collapse();
        event.target.classList.remove("expandChildrenButton_expanded");
        event.target.classList.add("expandChildrenButton_collapsed");
    }
    else {
        node.expand();
        event.target.classList.remove("expandChildrenButton_collapsed");
        event.target.classList.add("expandChildrenButton_expanded");
    }

    //Track this change in the undo manager!
    undoHandler.recordChange();
}

function setupElementObserver(element) {
    console.log("Setting up an observer for the HTML element just created!");
    //Set up the configuration options object, which will determine what DOM changes are listened for by this observer.
    let config = { attributes : true }; //{ attributeFilter : ["xTranslation", "yTranslation"] };   //Only listen for transform updates!

    //TODO: figure out how to use the attribute filter option to only listen for transform changes, not ALL changes

    //Create an observer object, and pass in the callback function it will invoke when a listened event fires.
    let observer = new MutationObserver(nodeMovedCallback);

    // Start observing the target node for configured mutations
    observer.observe(element, config);

    return observer;
}

// ---------------------------------------------------------------------------------------------------------------------
// --- Node deletion functionality -------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------

/**
 * This function will PERMANENTLY delete a node from memory and from the page.
 * It removes all reference to it in the canvasState and removes all of the relationships it had to it's children and parents.
 *
 * When invoking this function, you can optionally choose to 'stitch' the broken tree links back together.
 *
 * -- stitching the tree will make all the children of the deleted node become direct children of the deleted node's immediate parents,
 * -- provided that the parent -> deleted node label is the same as the deleted node -> child relationship label.
 * --
 * -- To avoid semantic confusion, we should only stitch together parents and children that are associated with the deleted node
 * -- with MATCHING LABELS. Otherwise, the resulting 'stitched' relationships will probably make no sense.
 * --
 * -- E.g. if A --contains--> B --contains--> C, then deleting node B with the stitch flag set to TRUE will result in
 * --      the following tree: A --contains--> C.
 * -- But  if A --contains--> B --explains--> C, then deleting node B with the stich flag set to TRUE will result in
 * --      the followinf tree: A, C (A will not be connected to C, as there is no way to congruently stitch two different
 * --      relation types!
 *
 * -- NOT stitching the tree will make all the children of the deleted node parentless root nodes. This essentially silently moves them
 * -- to being 'top level' nodes. However, the moved nodes will be added to the context view, and become rootNodes of the current
 * -- canvas view/context!
 *
 * @param node the node to be deleted.
 * @param stitchTree flag to determine if the tree should be stitched.
 */
function deleteContentNode(node, stitchTree) {
    console.log("we were just asked to delete the node: "+node.idString);

    if (stitchTree) {
        //Alright, we have to stitch the tree! Then, we just delete this node as usual!
        //Cycle through every parent of the to-delete node. Then, for each parent, check to see if the to-delete node
        //has a child relationship with a matching label. If one is found, call addChild() on the parent relationship,
        //adding every node from the child relationship into the parent relationship!
        for (let parentRel of node.parentList) {
            for (let childRel of node.childrenList) {
                if (parentRel.compareLabel(childRel.categoryLabel)) {
                    //Matched! Add all children of this relationship to the corresponding parent label!
                    for (let matchedChildNode of childRel.children) {
                        parentRel.addChild(matchedChildNode, false);
                    }
                }
            }
        }
    }

    //Remove the logical node from the rootNode list, if it is there.
    let index = canvasState.rootNodes.indexOf(node);
    if (index !== -1) {
        canvasState.rootNodes.splice(index,1);

        //Now, if the node that was just deleted was a root node, then we should add the children of that root node as new
        //root nodes. This ensures that children don't randomly disappear.
        for (let rel of node.childrenList) {
            for (let child of rel.children) {
                if (canvasState.rootNodes.indexOf(child) === -1) {
                    addNewRootNode(child);
                }
            }
        }
    }

    //Okay, now let's just directly delete this node and make all of it's children rootNodes of the current context!
    node.detachFromAllChildren();
    node.detachFromAllParents();

    //Okay. Now we can delete the node completely!

    //Get the node's DOM mutation listener to stop observing.
    node.mutationObserver.disconnect();

    //Remove the html node from the DOM.
    let drawingCanvas = document.getElementById("drawingCanvas");
    drawingCanvas.removeChild(node.htmlElement);

    //Remove the logical node from all canvasState memory
    index = canvasState.contentNodeList.indexOf(node);
    if (index === -1) {
        alert("CRITICAL ERROR: attempted to delete a node that wasn't even stored in the contentNodeList!");
    }
    else {
        canvasState.contentNodeList.splice(index,1);    //Delete one element, from the 'index' position
    }

    rebuildVisibility();
}

// ---------------------------------------------------------------------------------------------------------------------
// --- Functions for accessing into the aggregated nodes ---------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------

function getContentNode(element) {
    //Find by id.
    let id = element.getAttribute("id");

    for (let node of canvasState.contentNodeList) {
        if (node.idString === id) {
            return node;
        }
    }

    //We didn't find it...
    alert("Could not find a matching node object with id: "+id);
    console.trace("Could not find a matching node object with id: "+id);
    return null;
}

//Recursive function to BFS through all children of this node, and delete a class from the corresponding html element.
function removeHtmlClassFromAllDescendants(node, className) {
    node.htmlElement.classList.remove(className);

    //recurse to all children
    for (let rel of node.childrenList) {
        for (let child of rel.children) {
            removeHtmlClassFromAllDescendants(child, className);
        }
    }
}

//Recursive function to BFS through all children of this node, and delete a class from the corresponding html element.
function addHtmlClassFromAllDescendants(node, className) {
    node.htmlElement.classList.add(className);

    //recurse to all children
    for (let rel of node.childrenList) {
        for (let child of rel.children) {
            addHtmlClassFromAllDescendants(child, className);
        }
    }
}


// ---------------------------------------------------------------------------------------------------------------------
// --- Node overlap detection and rearranging functions ----------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------

function detectOverlaps() {
    //TODO
}

function detectOverlaps(movedNode) {
    //TODO
}

function rearrangeAllNodes() {
    //TODO
}

function rearrangeNodes(overlappingNodes) {
    //TODO
}


//----------------------------------------------------------------------------------------------------------------------
//--- Visibility management and context switching ----------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------------------

/**
 * This function simply adds a passed content node to the root node collection.
 *
 * Being a root node on the given canvas context ENSURES that the node is visible. Thus, whenever a node is added as a
 * root node, it is automatically made 'visible' as well. Furthermore, the descendants of root nodes are determined as
 * visible if their parent is expanded, vsiible, and they are not greater than the 'view depth' steps from the root node.
 *
 * Thus, to avoid cluttering the interface, any node that has just recently been added to the canvas state should be
 * 'collapsed' proir to being added.
 *
 * If the passed node was already a root node, this function has no effect.
 *
 * @param node
 */
function addNewRootNode(node) {
    //Okay. Firstly, we need to check if the node was already a root node in teh given context.
    let index = canvasState.rootNodes.indexOf(node);
    if (index !== -1) {
        //Was already in the root node list! Do nothing.
        return;
    }
    //DEBUG
    //console.log("ADDING A NEW ROOT!");

    //Alright. Let's push this node into the root node list
    canvasState.rootNodes.push(node);

    //Add custom root node styling
    node.htmlElement.classList.add("rootNode");

    //Make the root node 'border effect' visible by accessing the hidden child element with said border.
    node.htmlElement.getElementsByClassName('rootNodeBorderElement').item(0).style.display = "block";

    //Now that hte state has changed, we should rebuild the visibility
    rebuildVisibility();
}

function removeRootNode(node) {
    let index = canvasState.rootNodes.indexOf(node);
    if (index !== -1) {
        //Add custom root node styling
        //node.htmlElement.classList.add("rootNode");
        canvasState.rootNodes.splice(index, 1);
    }

    //Remove custom root node styling
    node.htmlElement.classList.remove("rootNode");

    //Make the root node 'border effect' invisible by accessing the hidden child element with said border.
    node.htmlElement.getElementsByClassName('rootNodeBorderElement').item(0).style.display = "none";
}

/**
 * This method is invoked whenever the node state/structure is updated. It rebuilds an understanding of what nodes are
 * visible on the canvas, and which nodes are not, FROM SCRATCH, whenever it is invoked.
 *
 * Advantage of doing this over the state-tracking method is much easier, encapsulated logic.
 * Disadvantage of this method is that we have to do 2 full scans of all nodes which exist. O(n) could be slow for every
 * single node change.
 */
function rebuildVisibility() {
    //let visibleNodes = [];     //New list, that is going to be used to store references to nodes we calculate as 'visible'

    //DEBUG
    //console.log("REBUILDING VISIBILITY: Currently have "+canvasState.rootNodes.length+" root node");
    //printTestSerialistation();


    // Set the visibility flag for all nodes to be invisible, so we can then calculate the visibility from roots
    for (let node of canvasState.contentNodeList) {
        node.isVisible = false;
    }
    for (let line of canvasState.hierarchyLines) {
        line.isVisible = false;
    }

    // Searching from all roots, explore their children so long as we don't exceed the view depth. From this, determine visible nodes!
    for (let root of canvasState.rootNodes) {
        //Begin a recursive depth first search from this root. Each node we reach will be set as 'visible'.
        //The search will ONLY recurse if the viewDepth is greater than zero, and if the current node is expanded.
        traverseForVisibility(root, canvasState.viewDepth);
    }

    //Okay, by now, all the nodes in existence should have their 'isVisible' flag set correctly. Thus, we can iterate
    //through all of the nodes and set their visibility accordingly. Equally, we can tell every node to render it's
    //parent-lines if and only if each parent is visible and expanded!
    for (let node of canvasState.contentNodeList) {
        if (node.isVisible) {
            node.makeVisible();     //Show the node!
        }
        else {
            node.makeInvisible();   //Hide the node!
        }
    }
    for (let line of canvasState.hierarchyLines) {
        if (line.isVisible) {
            line.showLine();
        }
        else {
            line.hideLine();
        }
    }

    //sidebar cancer refresh
    refreshSidebar(canvasState.contentNodeList);
}

function traverseForVisibility(curr, depth) {
    curr.isVisible = true;

    //If the depth is not zero yet, and the current node is 'expanded' then keep searching deeper.
    if (depth > 0 && curr.isExpanded) {
        for (let rel of curr.childrenList) {
            //Recurse for all children, making them visible
            for (let child of rel.children) {
                //Recurse within this child
                traverseForVisibility(child, depth - 1);
            }

            //We just made all of this node's children visible, thus those lines should be visible!
            for (let line of rel.lineList) {
                line.isVisible = true;
            }
        }
    }
}

/**
 * This function will switch the context of the view canvas, and 'reset' the view.
 *
 * This happens whenever a node is 'zoomed into' or 'zoomed out of'; the passed node becomes the 'context'
 * of the view canvas, and the direct descendants of the context node become the new root nodes.
 *
 * If the context node is null, we interpret this as 'global context' - I.e. we are zoomed out as far as we can go.
 * In this case, all parentless nodes will become root nodes of the global context.
 *
 * So, when this function is called, we will simply wipe the root node list, set the new context node, then rebuild the
 * root node list based on teh context node's children. Finally, we will invoke 'rebuildVisibility()' in order to
 * render the new context.
 *
 * @param newContextNode the new node object to become the new context, OR null, to imply global context.
 */
function switchContext(newContextNode, loadArrangementFromNewContext, animate) {
    //We are switching context. In order to preserve this particular arrangement when we return to this arrangement, we should save this current arrangement
    //as a JSON string within the current context node!
    if (canvasState.contextNode === null) {
        canvasState.globalContextArrangement = serialiseNodeArrangement();
    }
    else {
        canvasState.contextNode.contextArrangement = serialiseNodeArrangement();
    }

    //Attain access to the context display object.
    let contextBox = document.getElementById("contextIndicatorBox");
    let backButton = contextBox.getElementsByTagName("button").item(0);   //Only one button.
    let contextText = document.getElementById("contextNameTextBox");

    //Safety check: if undefined is passed, we should just set to global context!
    if (newContextNode === undefined) {
        console.log("WARNING: switchContext method was passed UNDEFINED as object value. We are handling this by just switching to global context");
        newContextNode = null;
    }

    //Set the context node in the canvas state to be whatever was just passed in!
    canvasState.contextNode = newContextNode;

    //If the passed node is null, switch to global context.
    if (newContextNode === null) {
        //Hide the back button since we cannot zoom out any more..
        backButton.style.display = "none";

        //Set the context text to be 'global context'
        contextText.innerText = "Global context";

        //Okay, reset the root nodes to all nodes which have no parents. Need to explicitly loop and 'remove' every node so that root node styling also disappears.
        for (let i=canvasState.rootNodes.length-1; i >=0; i--) {
            removeRootNode(canvasState.rootNodes[i]);
        }
        canvasState.rootNodes = []; //SANITY CHECK
        for (let node of canvasState.contentNodeList) {
            if (node.parentList.length === 0) {
                //This node has no parents! thus, we should make it a root node.
                addNewRootNode(node);
            }
        }
    }
    //If the passed node is not null, then it becomes the new context!
    else {
        backButton.style.display = "inline";
        contextText.innerText = newContextNode.titleText;

        //Okay, reset the root nodes to all nodes which are children of the new context node.
        for (let i=canvasState.rootNodes.length-1; i >=0; i--) {
            removeRootNode(canvasState.rootNodes[i]);
        }
        canvasState.rootNodes = [];     //SANITY CHECK
        for (let rel of newContextNode.childrenList) {
            for (let child of rel.children) {
                addNewRootNode(child);
            }
        }
    }

    //Finally, we should update the arrangement based on the new context's saved arrangement string, if the parameter says we should.
    if (loadArrangementFromNewContext) {
        let arrangementString;
        if (newContextNode === null) {
            arrangementString = canvasState.globalContextArrangement;
        }
        else {
            arrangementString = newContextNode.contextArrangement;
        }

        //If the arrangement string is null, undefined, or empty, then we should trigger an auto arragement, since this context has never been arranged before!
        if (arrangementString === undefined || arrangementString === null || arrangementString === "") {
            autoArrangeVisibleNodes(false);
        }
        else {
            //Load the arrangement, but DO NOT HIDE MISSING NODES, as we still want to show everything which is in this context!
            //Updated arrangements which hide missing nodes will be for when the user wishes to return to viewing a previously saved arrangement.
            //Missing nodes occur when there is a saved arrangement here, but since the arrangement was last saved, the user has added more nodes, and thus,
            //they are now missing.
            updateArrangementFromJSON(arrangementString, false, animate, false);    //False for hiding missing nodes, and False for triggering another context switch (avoid potential inf. recurse).
        }
    }

    //Now, we just need to rebuild the visibility!!
    rebuildVisibility();
}

/** invoked to zoom out the context. For safety, performs a null check even though it should never be called with null. */
function zoomContextOut() {
    hideAllInfo();  //Don't allow nodes to be showing info if we are in the middle of context switching.

    if (canvasState.contextNode === null) { return; }

    //TODO: NEED TO DETERMINE LOGIC FOR HANDLING ZOOM OUT WHEN THE CURRENT CONTEXT HAS MORE THAN ONE PARENT!!
    //TODO: NEED TO DETERMINE LOGIC FOR HANDLING ZOOM OUT WHEN THE CURRENT CONTEXT HAS MORE THAN ONE PARENT!!
    //TODO: NEED TO DETERMINE LOGIC FOR HANDLING ZOOM OUT WHEN THE CURRENT CONTEXT HAS MORE THAN ONE PARENT!!
    //TODO: NEED TO DETERMINE LOGIC FOR HANDLING ZOOM OUT WHEN THE CURRENT CONTEXT HAS MORE THAN ONE PARENT!!

    //For now, i'm just going to pick the first parent in the list, although this is a bad solution. I'm doing this just
    //to facilitate further development of features and not getting stuck.
    if (canvasState.contextNode.parentList.length === 0) {
        //The current context has no parent! Thus, we should move to global context.
        switchContext(null, true, true);
    }
    else {
        switchContext(canvasState.contextNode.parentList[0].parentNode, true, true);
    }

    //Track this change in the undo manager!
    undoHandler.recordChange();
}

/**
 * This is a callback invoked by the nodes that have been double clicked. For now, this will be how we invoke the 'zoom
 * into node' functionality.
 *
 * @param event MouseDoubleClick DOM event
 */
function zoomContextIn(event) {
    hideAllInfo();  //Don't allow nodes to be showing info if we are in the middle of context switching.

    //Gain access to the node, then context switch to it!
    let node = getContentNode(event.currentTarget);     //NOTE: using currentTarget instead of target because we only want to access the element the
                                                        //listener is ATTATCHED TO (i.e. the node div itself) rather than the element which triggered the
                                                        //the event!
    //We DO NOT want to zoom if the item clicked is not the outer node element itself. This is becuase if the double click ocurred on one of the
    //utility buttons, we don't want to also zoom. That would be confusing.
    //we also do not want to allow zoom in event if ANY node is showing info -- REVERTED 16/05/2018
    if (event.target.classList.contains("utilityButton") /* ##REVERTED## || node.isShowingInfo ##REVERTED## */ ) {
        return;
    }

    switchContext(node, true, true);

    //Track this change in the undo manager!
    undoHandler.recordChange();
}

//----------------------------------------------------------------------------------------------------------------------
//--- Additional callback functions ------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------------------
/**
 * This function is being used as the callback for handling DOM Mutation events for all content nodes.
 * In other words, whenever a node is moved, this will be invoked so that we can update that node's lines.
 *
 * See the following for reference of how this stuff works:
 * https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
 * https://dom.spec.whatwg.org/#mutationobserver
 * https://dom.spec.whatwg.org/#mutationrecord
 *
 * @param mutationsList
 */
function nodeMovedCallback(mutationsList) {
    //console.log("Transform change detected!");
    //For these observations, we are only listening for attribute updates.
    //Thus, the mutation.type is always going to 'attributes'
    //Equally, we are only listening for updates to the 'transform' attribute, thus, it should only fire when a node has moved.
    for (let mutation of mutationsList) {
        let movedElement = mutation.target;
        let movedNode    = getContentNode(movedElement);
        //Ask all of the node's child relationships to update the line!
        for (let rel of movedNode.childrenList) {
            rel.onParentMoved();
        }
        //Ask all of the node's parent relationships to update the line!
        for (let rel of movedNode.parentList) {
            rel.onChildMoved(movedNode);
        }
    }
}

/**
 * This function is used to make an existing node visible on the canvas.
 *
 * It will locate a node via it's id. Then, if the node is invisible and UNRELATED to the current context node
 * (i.e. it is not a descendant nor an ancestor) then we will simply add the node as a new root on the canvas to make
 * make it visible!.
 *
 * However, if the identified node IS related to the context, we will trigger a context switch to that node
 * instead. This is so that you cannot instantiate two visible trees containing the same nodes.
 */
function reinstantiateExistingNode(id, x, y) {
    console.log("Sidebar drag is instantiating a node at position x = "+x+" y= "+y);

    //Find the node.
    let toAdd = null;
    for (let node of canvasState.contentNodeList) {
        if (node.idString === id) {
            toAdd = node;
        }
    }
    if (toAdd == null) {
        alert("FAILED TO FIND NODE UPON INSTANTIATION. Id we looked for was " + id);
        console.trace("FAILED TO FIND NODE UPON INSTANTIATION. Id we looked for was " + id);
        return;
    }

    //Okay, now we need to determine if the node is an ancestor, or descendant, of the context node.
    if (canvasState.contextNode == null || areHierarchicallyRelated(toAdd, canvasState.contextNode)) {
        switchContext(toAdd, true, true);
    }
    else {
        addNewRootNode(toAdd);
        toAdd.moveNodeTo(x, y, false);  //No animation
    }

    /*TODO - automatically rearrange nodes on screen after placing a new one, since it may be overlapping if there was a node already in the default spawn location*/
}


// ---------------------------------------------------------------------------------------------------------------------
// --- HELPER FUNCTIONS ------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Determines if two nodes are related. I.e is node 1 is a descendant or ancestor of node 2 (hierarcically) then
 * this ill return true. Otherwise, return false
 */
function areHierarchicallyRelated(node1, node2) {
    return (node1 === node2 || searchUp(node1,node2) || searchDown(node1, node2));
}

function searchUp(node1, node2) {
    if (node1 === node2) {
        return true;    //Found a match!
    }
    for (let rel of node1.parentList) {
        if (rel.parentNode) {
            if (searchUp(rel.parentNode, node2)) {
                //Found a match, we can just return true!
                return true;
            }
            else {
                //Keep looking...
            }
        }
    }
    return false;   //No matches found! We have run out of parents!
}

function searchDown(node1, node2) {
    if (node1 === node2) {
        return true;    //Found a match!
    }
    for (let rel of node1.childrenList) {
        for (let child of rel.children) {
            if (searchDown(child, node2)) {
                return true;    //Found a match somewhere down this way!
            }
            else {
                //Keep looking...
            }
        }
    }
    return false;   //No matches found! We have run out of children!
}

/**
 * This function will completely clear the entire canvas state, and the entire HTML DOM of Content Nodes.
 */
function clearCanvasState() {
    canvasState.rootNodes = [];
    canvasState.showingNodes = [];
    canvasState.contextNode = null;

    //Delete every node from the DOM
    let drawingCanvas = document.getElementById("drawingCanvas");
    for (let node of canvasState.contentNodeList) {
        drawingCanvas.removeChild(node.htmlElement);

        //Get the node's DOM mutation listener to stop observing.
        node.mutationObserver.disconnect();
    }
    canvasState.contentNodeList = [];

    //Delete every SVG line from the DOM
    let svg = document.getElementById("svgObject");
    for (let line of canvasState.hierarchyLines) {
        svg.removeChild(line.line);
    }
    canvasState.hierarchyLines = [];
}

/**
 * Used to 'block' the rest of the canvas while some other action is performed and we do not want to allow user actions on the canvas
 * E.g. when node edit window is open, or project data is loading.
 */
function addBlackoutEffect() {
    //fully sick blackout effect
    let blackoutElem = document.getElementById("fade");
    blackoutElem.style.display = "block";
    blackoutElem.style.opacity = "0.5";
}

/**
 * Removes the blocking effect.
 */
function removeBlackoutEffect() {
    //remove fully sick blackout effect
    let blackoutElem = document.getElementById("fade");
    blackoutElem.style.display = "none";
    blackoutElem.style.opacity = "0";
}

function showLoadingWindow(message) {
    let window = document.getElementById("loadingScreenWindow");
    if (message !== undefined && message != null) {
        window.getElementsByTagName("span").item(0).innerHTML = message;
    }
    else {
        window.getElementsByTagName("span").item(0).innerHTML = "Loading your project...";
    }

    window.style.display = "inline-block";
}

function hideLoadingWindow() {
    document.getElementById("loadingScreenWindow").style.display = "none";
}

function cancelCurrentLoadRequest() {
    ajaxHandler.cancelPendingLoadRequests();
}

/*
Reusable error window to display errors passed in from the server
 */

function showErrorWindow(errorMessage) {
   let e = document.getElementById("errorWindow");
   if (errorMessage !== undefined && errorMessage != null) {
       e.getElementsByTagName("span").item(0).innerHTML = errorMessage;
   }
   else {
       e.getElementsByTagName("span").item(0).innerHTML = "Error displaying error message...";
   }

    e.style.display = "inline-block";
}

function hideErrorWindow() {
    document.getElementById("errorWindow").style.display = "none";
    removeBlackoutEffect();
}

/**
 * This function simply 'minimises' all nodes which are currently showing info. After invoking this, you should be confident there
 * are no nodes showing info anymoe
 */
function hideAllInfo() {
    //Iterate backwards through the list, since it will be removing items as we go.
    for (let i = canvasState.showingNodes.length - 1; i >= 0; i--) {
        canvasState.showingNodes[i].hideInfo()
    }
}

function autoArrangeButtonClicked() {
    autoArrangeVisibleNodes(false);

    //Track this change in the undo manager!
    undoHandler.recordChange();
}

function undoButtonClicked() {
    if (undoHandler) undoHandler.undo();
}

function redoButtonClicked() {
    if (undoHandler) undoHandler.redo();
}
