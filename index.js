// Conrad Bradford
// Section 001 IS 403
// this is the backend for a simple web app that displays pokemon
// from a pg database



require("dotenv").config();

let express = require("express");

let session = require("express-session");

let path = require("path");

let app = express();

app.set("view engine", "ejs");

let port  = process.env.PORT || 3000;

app.use(
    session(
        {
            secret: process.env.SESSION_SECRET || "fallback-secret-key",
            resave: false,
            saveUninitialized: false,
        }
    )
);

// after express-session middleware
app.use((req, res, next) => {
  res.locals.session = req.session;   // now every render has session
  next();
});


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

app.use(express.urlencoded({ extended: true }));

// this is the default route that displays the entire pokemon table
app.get('/', (req, res) => {

    if (req.session.isLoggedIn) {

        knex.select()
            .from('pokemon as p')
            .join('pokedex as pd', {'p.pokedex_number': 'pd.pokedex_number'} )
            .orderBy('pd.name')
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

            res.render('login', { error_message: ''});
        }
});

app.post('/login', (req, res) => {
    let sName = req.body.username;
    let sPassword = req.body.password;

    knex.select("username", "password", "level")
    .from('users')
    .where("username", sName)
    .andWhere("password", sPassword)
    .then(users => {
      // Check if a user was found with matching username AND password
      if (users.length > 0) {
        req.session.isLoggedIn = true;
        req.session.username = sName;
        req.session.level = users[0].level
        res.redirect("/");
      } else {
        // No matching user found
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

// this route uses the search button on the index page
// and renders a new page that only displays the pokemon 
// with a matching name from the search bar in a new table
app.post('/searchPokemon', (req, res) => {
    let pokemon_name = req.body.pokemon_name;

    knex.select("pd.name", "p.base_total", "p.description", "p.trainer")
        .from("pokemon as p")
            .join("pokedex as pd", {"p.pokedex_number": "pd.pokedex_number"} )
        .where("pd.name", pokemon_name)
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

app.get('/users', (req, res) =>{
    if (req.session.isLoggedIn) {
        res.render('users');
    }
    
});

app.post('/users', (req, res) => {
        knex("users").insert(req.body)
            .then(users => {
                res.redirect("/users");
            });
});

app.listen(port, () => {
    console.log('the server is listening');
});