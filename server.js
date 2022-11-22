// Built-in Node.js modules
let fs = require('fs');
let path = require('path');

// NPM modules
let express = require('express');
let sqlite3 = require('sqlite3');
const { query } = require('express');
const { create } = require('domain');
const { parse } = require('path');


let db_filename = path.join(__dirname, 'db', 'stpaul_crime.sqlite3');

let app = express();
let port = 8000;

app.use(express.json());    // when we're uploading data, express will automatically parse JSON for us

// Open SQLite3 database (in read-write mode)
let db = new sqlite3.Database(db_filename, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.log('Error opening ' + path.basename(db_filename));
    }
    else {
        console.log('Now connected to ' + path.basename(db_filename));
    }
});


// GET request handler for crime codes
app.get('/codes', (req, res) => {
    console.log(req.query); // query object (key-value pairs after the ? in the url)
    
    res.status(200).type('json').send({}); // <-- you will need to change this
});

// GET request handler for neighborhoods
app.get('/neighborhoods', (req, res) => {
    console.log(req.query); // query object (key-value pairs after the ? in the url)
    
    res.status(200).type('json').send({}); // <-- you will need to change this
});

// GET request handler for crime incidents
app.get('/incidents', (req, res) => {
    console.log(req.query);
    let query = `SELECT code FROM Incidents LIMIT 50`
    let neighborhood = parseInt(req.query.neighborhood)
    let codes = req.query.code.split(',').map((c) => parseInt(c))
    let whereConditions = [
        ["neighborhood_number = ?", neighborhood],
        [repeatWithOr('code = ?', codes.length), ...codes],
    ]

    databaseSelectWhere(query, whereConditions)
    .then((incidents) => {
        res.status(200).type('json').send(incidents)
    })
    .catch((err) => {
        res.status(404).type('text/plain').send(err)
    })
});

// PUT request handler for new crime incident
app.put('/new-incident', (req, res) => {
    console.log(req.body); // uploaded data
    
    res.status(200).type('txt').send('OK'); // <-- you may need to change this
});

// DELETE request handler for new crime incident
app.delete('/remove-incident', (req, res) => {
    console.log(req.body); // uploaded data
    
    res.status(200).type('txt').send('OK'); // <-- you may need to change this
});

/**
 * Create Promise for SQLite3 database `SELECT` query after inserting a `WHERE` clause
 * @param {string} query a SQL query that does not contain a `WHERE` clause
 * @param {any[][]} conditionsAndParams a list where the first element is a query string with a placeholder (`?`), and the following elements are the respective params
 * @returns 
 */
function databaseSelectWhere(query, conditionsAndParams) {
    let [conditions, params] = filterValidConditionsAndParams(conditionsAndParams)

    if (conditions.length === 0 || params.length === 0) {
        return databaseSelect(query, [])
    }
    return databaseSelect(insertWhereClause(query, conditions), params)
}

/**
 * Create Promise for SQLite3 database `INSERT` or `DELETE` query after inserting a `WHERE` clause
 * @param {string} query a SQL query that does not contain a `WHERE` clause
 * @param {any[][]} conditionsAndParams a list where the first element is a query string with a placeholder (`?`), and the following elements are the respective params
 * @returns 
 */
function databaseRunWhere(query, conditionsAndParams) {
    let [conditions, params] = filterValidConditionsAndParams(conditionsAndParams)

    if (conditions.length === 0 || params.length === 0) {
        return databaseRun(query, [])
    }
    return databaseRun(insertWhereClause(query, conditions), params)
}

// Create Promise for SQLite3 database SELECT query 
function databaseSelect(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(rows);
            }
        })
    })
}

// Create Promise for SQLite3 database INSERT or DELETE query
function databaseRun(query, params) {
    return new Promise((resolve, reject) => {
        db.run(query, params, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    })
}


/**
 * Inserts a `WHERE` clause into query after the `FROM` clause, where each condition is separated by an `AND`
 * @param {string} query 
 * @param {string[]} conditions 
 * @returns string
 */
function insertWhereClause(query, conditions) {
    let words = query.split(' ')
    let whereClause = `WHERE ${conditions.join(' AND ')}`
    let whereIndex = words.indexOf('FROM') + 2
    words.splice(whereIndex, 0, whereClause) // confusingly, this is how you insert items in JS
    return words.join(' ')
}

/**
 * filters conditions and associated params where the param is valid (not `undefined`, `NaN`, or `null`)
 * 
 * @param {any[][]} conditionsAndParams input from databaseRun() or databaseSelect()
 * @returns a list containing two lists - one for conditions, and the other for params
 */
function filterValidConditionsAndParams(conditionsAndParams) {
    let whereConditions = []
    let queryParams = []

    // append where clause conditions if the URL query param exists
    for (let condParams of conditionsAndParams) {
        let condition = condParams[0]
        let params = condParams.slice(1)
        let allParamsAreValid = params.every((p) => 
            p !== undefined && !isNaN(p) && p !== null
        )
        
        if (allParamsAreValid) {
            whereConditions.push(condition)
            queryParams = queryParams.concat(params)
        } else {
            console.error(`could not add ${condition} because ${params} contains invalid parameters`);
        }
    }
    
    return [whereConditions, queryParams]
}

function repeatWithOr(condition, count) {
    return condition.repeatWithDelimeter(count, ' OR ')
}

function repeatWithAnd(condition, count) {
    return condition.repeatWithDelimeter(count, ' OR ')
}

// extension method for String
String.prototype.repeatWithDelimeter = 
    function(count, delimeter) {
        return arrayOf(count, (i) => this).join(delimeter)
    } 

function arrayOf(size, indexTransform) {
    return Array.from(Array(size)).map((value, index) => indexTransform(index))
}

// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
