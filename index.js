// Conrad Bradford
// Section 001 IS 403
// this is the backend for a simple web app that displays pokemon
// from a pg database
// pokemon are linked to trainers
// trainers can log in to manager their pokemon
// admin accounts can add additional users



// Load environment variables from .env file
require("dotenv").config();

// Import required modules
let express = require("express");
let session = require("express-session");
let path = require("path");

// Initialize Express app
let app = express();

// Set EJS as the view engine for rendering templates
app.set("view engine", "ejs");

// Set port from environment variable or default to 3000
let port  = process.env.PORT || 3000;

// Configure session middleware for user authentication
app.use(
    session(
        {
            secret: process.env.SESSION_SECRET || "fallback-secret-key",
            resave: false,
            saveUninitialized: false,
        }
    )
);

// Make session data available to all EJS templates
app.use((req, res, next) => {
  res.locals.session = req.session;   // now every render has session
  next();
});


// Configure database connection using Knex.js
const knex = require("knex")({
    client: "pg",
    connection: {
        host: process.env.RDS_HOSTNAME || process.env.DB_HOST || "localhost",
        user: process.env.RDS_HOSTNAME || process.env.DB_USER || "postgres",
        password: process.env.RDS_HOSTNAME || process.env.DB_PASSWORD || "admin",
        database: process.env.RDS_HOSTNAME || process.env.DB_NAME || "assignment3",
        port: process.env.RDS_HOSTNAME || process.env.DB_PORT || 5434,

        ssl: process.env.DB_SSL ? {rejectUnauthorized: false} : false
    }
});

// Middleware to parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Default route - displays the pokemon table
// Shows all pokemon for managers, only user's pokemon for regular users
app.get('/', (req, res) => {

    if (req.session.isLoggedIn) {
        // Query pokemon table joined with pokedex to get pokemon names
        let query = knex.select("p.id", "p.trainer", "pd.name", "p.description", "p.base_total")
            .from('pokemon as p')
            .join('pokedex as pd', {"p.pokedex_number" : "pd.pokedex_number"});
        
        // Regular users can only see their own pokemon
        if (req.session.level === 'u') {
            query = query.where('trainer', req.session.username);
        }
        
        // Execute query and render results
        query.orderBy('trainer')
            .then(pokemon => {
                console.log(`successfully retrieved ${pokemon.length} pokemon from database`);
                let p_headers = pokemon.length ? Object.keys(pokemon[0]) : [];
                
                res.render('index', 
                    { 
                        pokemon: pokemon,
                        p_headers: p_headers,
                    });
            })
            .catch ((err) => {
                console.log('database query error:', err.message);
                res.render('index', {
                    pokemon: [],
                    error_message: `database error: ${err.message}. please check if the 'pokemon' table exists.`,
                });
            });

        } else {
            // User not logged in, show login page
            res.render('login', { error_message: ''});
        }
});

// Login route - authenticates user and creates session
app.post('/login', (req, res) => {
    let sName = req.body.username;
    let sPassword = req.body.password;

    // Check if username and password match a user in the database
    knex.select("username", "password", "level")
    .from('users')
    .where("username", sName)
    .andWhere("password", sPassword)
    .then(users => {
      // Check if a user was found with matching username AND password
      if (users.length > 0) {
        // Create session for authenticated user
        req.session.isLoggedIn = true;
        req.session.username = sName;
        req.session.level = users[0].level
        res.redirect("/");
      } else {
        // No matching user found - show error
        res.render("login", { error_message: "Invalid login" });
      }
    })
    .catch(err => {
      console.error("Login error:", err);
      res.render("login", { error_message: "Invalid login" });
    });
});

// Logout route
app.get("/logout", (req, res) => {
    // Get rid of the session object
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
        }
        res.redirect("/");
    });
});

// Helper function to convert string to Title Case (first letter of each word capitalized)
function toTitleCase(str) {
    return str
      .toLowerCase()
      .split(' ')                    // split on spaces
      .filter(word => word.length)   // skip empty strings from extra spaces
      .map(word => word[0].toUpperCase() + word.slice(1))
      .join(' ');
  }
  
// Search route - searches pokedex table for pokemon by name
app.post('/searchPokedex', (req, res) => {
    let pokemon_name = req.body.pokemon_name;

    // Search pokedex table for matching pokemon name
    knex.select()
        .from("pokedex")
        .where({ name : toTitleCase(pokemon_name) })
        .then(pokemon => {       
            let p_headers = pokemon.length ? Object.keys(pokemon[0]) : [];  
            res.render("searchedPokemon", {
                pokemon: pokemon,
                p_headers: p_headers,
            });
        })
        .catch ((err) => {
            console.log('database query error:', err.message);
            res.render('searchedPokemon', {
                pokemon: [],
                error_message: `database error: ${err.message}. please check if the 'pokemon' table exists.`,
            });
        });
});

// GET route to display the add pokemon form
app.get('/pokemon/add', (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect("/");
    }
    
    // Fetch pokemon names from pokedex for dropdown
    knex.select("pokedex_number", "name")
        .from("pokedex")
        .orderBy("name")
        .then(pokedexEntries => {
            // If admin, fetch all trainers for dropdown
            if (req.session.level === 'm') {
                knex.select("username")
                    .from("users")
                    .then(trainers => {
                        res.render('addpokemon', { trainers: trainers, pokedexEntries: pokedexEntries });
                    })
                    .catch(err => {
                        console.error("Error fetching trainers:", err);
                        res.redirect("/");
                    });
            } else {
                // Regular users don't need trainer list (they can only add for themselves)
                res.render('addpokemon', { trainers: [], pokedexEntries: pokedexEntries });
            }
        })
        .catch(err => {
            console.error("Error fetching pokedex:", err);
            res.redirect("/");
        });
});

// POST route to handle adding a new pokemon
app.post('/pokemon/add', (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect("/");
    }
    
    // Regular users can only add pokemon for themselves
    if (req.session.level === 'u') {
        req.body.trainer = req.session.username;
    }
    
    // Look up pokedex_number from the selected pokemon name
    const pokemonName = req.body.pokemon_name;
    delete req.body.pokemon_name; // Remove pokemon_name from body as it's not a pokemon table field
    
    // Find the pokedex_number for the selected pokemon name
    knex.select("pokedex_number")
        .from("pokedex")
        .where("name", pokemonName)
        .then(pokedexResult => {
            if (pokedexResult.length === 0) {
                console.error("Pokemon name not found in pokedex");
                return res.redirect("/pokemon/add");
            }
            
            // Add pokedex_number to the pokemon data
            req.body.pokedex_number = pokedexResult[0].pokedex_number;
            
            // Insert new pokemon into database
            knex("pokemon")
                .insert(req.body)
                .then(() => {
                    res.redirect("/");
                })
                .catch(err => {
                    console.error("Error adding pokemon:", err);
                    res.redirect("/");
                });
        })
        .catch(err => {
            console.error("Error looking up pokedex_number:", err);
            res.redirect("/");
        });
});

// GET route to display the edit pokemon form
app.get('/pokemon/edit/:id', (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect("/");
    }
    
    // Query pokemon by ID
    let query = knex.select()
        .from("pokemon")
        .where("id", req.params.id);
    
    // Regular users can only edit their own pokemon
    if (req.session.level === 'u') {
        query = query.where('trainer', req.session.username);
    }
    
    // Fetch pokemon and render edit form if user has permission
    query.then(pokemon => {
            if (pokemon.length === 0) {
                // Pokemon doesn't exist or user doesn't have permission
                res.redirect("/");
            } else {
                res.render('editpokemon', { pokemon: pokemon[0] });
            }
        })
        .catch(err => {
            console.error("Error fetching pokemon:", err);
            res.redirect("/");
        });
});

// POST route to handle updating a pokemon
app.post('/pokemon/edit/:id', (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect("/");
    }
    
    // Build update query
    let query = knex("pokemon")
        .where("id", req.params.id);
    
    // Regular users can only edit their own pokemon
    if (req.session.level === 'u') {
        query = query.where('trainer', req.session.username);
    }
    
    // Update pokemon if user has permission
    query.update(req.body)
        .then(updated => {
            if (updated === 0) {
                // No rows updated - user doesn't have permission
                res.redirect("/");
            } else {
                res.redirect("/");
            }
        })
        .catch(err => {
            console.error("Error updating pokemon:", err);
            res.redirect("/");
        });
});

// GET route to handle deleting a pokemon
app.get('/pokemon/delete/:id', (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect("/");
    }
    
    // Build delete query
    let query = knex("pokemon")
        .where({ id: req.params.id });
    
    // Regular users can only delete their own pokemon
    if (req.session.level === 'u') {
        query = query.where('trainer', req.session.username);
    }
    
    // Delete pokemon if user has permission
    query.delete()
        .then(deleted => {
            if (deleted === 0) {
                // No rows deleted - user doesn't have permission
                res.redirect("/");
            } else {
                res.redirect("/");
            }
        })
        .catch(err => {
            console.error("Error deleting pokemon:", err);
            res.redirect("/");
        });
});

// GET route to display users management page (admin only)
app.get('/users', (req, res) =>{
    if (req.session.isLoggedIn) {
        // Fetch all users from database
        knex.select("username", "password", "level")
            .from("users")
            .then(users => {
                res.render('users', { users: users });
            });
    }
    
});

// POST route to add a new user/trainer
app.post('/users', (req, res) => {
        knex("users").insert(req.body)
            .then(users => {
                res.redirect("/users");
            });
});

// GET route to display edit user form
app.get('/users/edit/:username', (req, res) => {
    knex.select("username", "password", "level")
    .from("users")
    .where("username", req.params.username)
    .then(user => {
        res.render('edituser', { user: user[0] });
    });
});

// POST route to handle updating a user
app.post('/users/edit/:username', (req, res) => {
    knex("users").update(req.body)
    .where("username", req.params.username)
    .then(user => {
        res.redirect("/users");
    });
});

// GET route to handle deleting a user
app.get('/users/delete/:username', (req, res) => {
    knex("users").delete()
    .where({ username : req.params.username })
    .then( user => {
        res.redirect('/users')
    })
})

// Start the server and listen on the specified port
app.listen(port, () => {
    console.log('the server is listening');
});