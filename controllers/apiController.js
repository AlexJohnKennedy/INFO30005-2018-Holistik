/*
 * This file contains and defines the functionality for the server API controller. In other words, controller logic for
 * how the server handles project save and load data requests (AJAX from the front end) is contained here!
 */

const db = require('../models/db.js');

const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;     //How many iterations for bcrypt will use for hasing password with the generated salt

//Import passport and username/password module, to handle login authentication and session handling.
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

//Globally run code (invoked when this module is 'required') to configure the passport library
passport.use(new LocalStrategy({
        //Specify what fields passport will look for as our login credientials from the associated HTTP request (the one attempting to login)
        usernameField: 'email',
        passwordField: 'password',
        passReqToCallback: true
    },
    function(req, email, password, done) {
        console.log(email + " " + password);
        //Get a corresponding user by the passed email.
        let databasePromise = db.getOneUserByEmail(email);

        //Okay, let's attach our handler callbacks to the promise
        databasePromise.then(function(user) {
            //Okay, we successfully got a result from the database.
            //console.log(user);

            //If the user account corresponding with the email did not exist:
            if (!user) {
                return done(null, false, { message: 'Incorrect username.' });
            }
            //Okay, the user exists! Now we need to use bcrypt to compare the password with the hash!
            bcrypt.compare(password, user.hash).then(function(isMatch) {
                console.log("Finished bcrypt comparison, we are entering the callback");
                console.log("isMatch == "+isMatch);

                //If the crypto call succeeded this happens.
                if (isMatch) {
                    //Woo! the password matched after it was hashed with da salt!
                    return done(null, user);
                }
                else {
                    //Passwords did not match.
                    return done(null, false);
                }
            }).catch(function(err) {
                console.log("Entered error catch block, line 52, apiController.js!");
                return done(err, false);
            });

        }).catch(function(err) {
            console.log("Database error on login (not found)");
            //Catching database lookup error!
            return done(err);
        });
    }
));

//Setup the logic for how passport will serialise and deserialise user data from the session cookie info passed in
//requests, when it authenticates them!
passport.serializeUser(function(user, done) {
    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Passport is calling the serialise method we specified!!");
    done(null, user.email);     //The only thing we want our session info to know about is the unique email identifier
});

passport.deserializeUser(function(email, done) {
    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> Passport is calling the DEserialise method we specified!!");
    let databasePromise = db.getOneUserByEmail(email);
    databasePromise.then(function(user) {
        console.log("deserialisation success");
        done(null, user);   //Error object is null, because we succeeded!
    }).catch(function(err) {
        console.trace("deseiralistaion FAILURE");
        done(err);
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// --- User registration and login establishment -----------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------

async function registerNewUser(req, res) {
    console.log("Attempting to save a new user. req.body:");
    console.log(req.body);

    //Call the bcrypt library to hash our plaintext password and automatically create an asociated salt.
    //When that completes (asynchronously), we will ask the db to create a new user record
    bcrypt.hash(req.body.password, SALT_ROUNDS).then(async function(hashResult) {
        let newCreatedUser = await db.createNewUser(req.body, hashResult);

        //If we got an undefined result, then there was a database error!
        if (newCreatedUser === undefined) {
            res.send("DATABASSE ERROR - On createnew user attempt!");
        }
        else {
            //All good!
            res.send(newCreatedUser);
        }
    }).catch(function(err) {
        res.send("Bcrypt failed to fucking hash dat shit:\n"+err);
    });
}

function loginUser(req, res) {
    console.log("We reached the login user apiController callback! Based on how our /login route is configured, this will have already passed through" +
        " the 'passport.authenticate()' check! Passport.authenticate() should have parsed the user details into the req.user before reaching here");
    console.log("req.user: \n");
    console.log(req.user);

    res.send(req.user);
}

function logoutUser(req, res) {
    //TODO
}

// ---------------------------------------------------------------------------------------------------------------------
// --- Functions which will be invoked by the router. ------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
function projectLoad(req, res) {

}

function loadArrangement(req, res) {

}

async function projectSave(req, res) {
    console.log("received request to save a currently existing project!");
    console.log("The user making the save request is: ");
    console.log(req.user);
    console.log("The project data passed to us is: ");
    console.log(req.body);

    //Okay! we just got a save project request.
    //Firstly, we need to ensure that the user is logged in. If they are NOT, then there is some error, and we should do nothing!
    if (!req.user || !req.isAuthenticated()) {
        //No session established...
        console.trace("ERROR: We got a project save request but there was no user session associated with the request:");
        return res.redirect("/");
    }

    //Get the project model object from the database, making sure to WAIT for the response before continuing
    let projectModel = await db.getOneProjectById(req.body.projectId);

    //If the result is undefined, then our projectId did not match any existing projects.. That is not good!
    if (projectModel === null) {
        return res.send("ERROR: Client passed a project id that returned no results in the database during save operation");
    }

    //Alright! We got the project object. Now, let's get the user document for this user as well, so we can check if the user has permission to save this project
    let userModel = await db.getOneUserByEmail(req.user.email);
    if (userModel === undefined) {
        //SHOULD BE IMPOSSIBLE UNLESS SOMETHING HAS GONE TERRIBLY WRONG
        console.trace("CRITICAL DATABASE ERROR: LOGGED IN USER HAD EMAIL NOT FOUND IN DATABASE!!");
        return res.send("CRITICAL DATABASE ERROR: LOGGED IN USER HAD EMAIL NOT FOUND IN DATABASE!!");
    }

    //Okay, let's make sure the user has the correct permissions.
    if (db.hasWritePermission(userModel, projectModel)) {
        //They have permission to save to this project! So, let's update the project model!
        let updatedProjectModel = await db.updateProject(projectModel, req.body.structure, req.body.arrangement);
        if (updatedProjectModel === undefined) {
            res.send("DATABASE ERROR: Failed to update project details");
        }
        else {
            //Success!
            res.send(updatedProjectModel);
        }
    }
    else {
        //NO PERMISSION! throw an error!
        console.log("ERROR: User tried to save project but did not have write permission for it!");
        res.send("ERROR: Client user does not have write permission for this project");
    }
}

function saveArrangement(req, res) {

}

async function projectCreate(req, res) {
    console.log("Attempting to save a new project. req.body:");
    console.log(req.body);

    //authenticate
    if (!req.isAuthenticated()) {
        console.log("User failed to pass Passport authentication. Redirecting to the landing page.");
        return res.redirect("/");
    }
    //check that the user is logged in
    if (!req.user) {
        console.log("No user session detected (req.user was null)");
        return res.redirect("/");
    }

    //user is authenticated! let's create a new project in the db
    let projectModel = await db.createNewProject(req.body);
    if (projectModel === undefined) {
        return res.send("Database error: failed to create a new project");
    }

    //we need to add the new project to the current users' list
    let user = await db.getOneUserByEmail(req.user.email);
    if (user === undefined) {
        return res.send("Database error: failed to get a user based on cookie data");
    }

    let updatedUser = await db.addProjectToUser(user, projectModel, true);
    if (updatedUser === undefined) {
        return res.send("Database error: failed to update user with new project");
    }

    //All succeeded!
    res.redirect("/profile");   //Refresh the page so that the new entry shows up
}

module.exports = {
    projectLoad              : projectLoad,
    loadArrangement          : loadArrangement,

    projectSave              : projectSave,
    saveArrangement          : saveArrangement,

    projectCreate            : projectCreate,

    registerNewUser          : registerNewUser,
    loginUser                : loginUser,
    logoutUser               : logoutUser,

    passport                 : passport
};