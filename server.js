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
    let query = `SELECT * FROM Neighborhoods ORDER BY neighborhood_number`
    let conditions = [
        {
            expression: "neighborhood_number >= ?",
            repeatWithDelimeter: true,
            params: parseInts(req.query.neighborhood_number)
        }
    ] 
    
    databaseSelectWhere(query, conditions)
    .then((neighborhoods) => {
        res.status(200).type('json').send(neighborhoods)
    })
    .catch((err) => {
        res.status(404).type('text/plain').send(err)
    });
});

// GET request handler for crime incidents
app.get('/incidents', (req, res) => {
    let query = `SELECT * FROM Incidents`
    let limit = parseInt(req.query.limit)
    let conditions = [
        { 
            expression: "DATE(date_time) >= ?", 
            params: [req.query.start_date] 
        },
        { 
            expression: "DATE(date_time) <= ?", 
            params: [req.query.end_date] 
        },
        { 
            expression: "neighborhood_number = ?",  
            repeatWithOr: true, 
            params: parseInts(req.query.neighborhood) 
        },
        { 
            expression: 'code = ?', 
            repeatWithOr: true, 
            params: parseInts(req.query.code) 
        },
        { 
            expression: 'police_grid = ?', 
            repeatWithOr: true, 
            params: parseInts(req.query.grid) 
        }
    ]

    databaseSelectWhere(query, conditions, limit)
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

// Create Promise for SQLite3 database SELECT query 
function databaseSelect(query, params) {
    console.log(
        `SELECT:
            query: ${query}
            params: ${params}
        `
    )
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
    console.log(
        `RUN:
            query: ${query}
            params: ${params}
        `
    )
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
 * Create Promise for SQLite3 database `SELECT` query after inserting a `WHERE` and `LIMIT` clause, if necessary
 * 
 * @param {string} query a SQL query that does not contain a `WHERE` clause
 * @param {{ expression: string, params: any[], repeatWithOr: boolean, repeatWithAnd: boolean }[]} conditions 
 * @returns 
 */
 function databaseSelectWhere(query, conditions, limit=null) {
    if (query.includes('WHERE')) Error("WHERE clause should not be added manually")

    let expressions = filterAndFormatExpressions(conditions)
    let params = filterParameters(conditions)
    let editedQuery = query

    if (!isNaN(limit)) {
        editedQuery = insertLimitClause(editedQuery, limit)
    }
    if (!isEmpty(params)) {
        editedQuery = insertWhereClause(editedQuery, expressions)
    }
    return databaseSelect(editedQuery, params)
}

/**
 * Create Promise for SQLite3 database `INSERT` or `DELETE` query after inserting a `WHERE` clause
 * 
 * @param {string} query a SQL query that does not contain a `WHERE` clause
 * @param {{ expression: string, params: any[], repeatWithOr: boolean, repeatWithAnd: boolean }[]} conditions 
 * @returns 
 */
function databaseRunWhere(query, conditions) {
    if (query.includes('WHERE')) Error("WHERE clause should not be added manually")

    let expressions = filterAndFormatExpressions(conditions)
    let params = filterParameters(conditions)
    let editedQuery = query

    if (!isEmpty(editedQuery)) {
        editedQuery = insertWhereClause(editedQuery, expressions)
    }
    return databaseRun(editedQuery, params)
}

function insertLimitClause(query, limit) {
    return `${query} LIMIT ${limit}`
}

/**
 * Inserts a `WHERE` clause into query after the `FROM` clause and separates each condition with an `AND`
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

function filterParameters(conditions) {
    let parameters = []
    for (let c of conditions.filter(isConditionValid)) {
        parameters = parameters.concat(c.params)
    }
    return parameters
}

function filterAndFormatExpressions(conditions) {
    let expressions = []
    for (let c of conditions.filter(isConditionValid)) {
        let expression = c.expression
    
        if (c.repeatWithAnd) {
            expression = c.expression.repeatWithDelimeter(c.params.length, ' AND ')
            expression = `(${expression})`
        }
        if (c.repeatWithOr) {
            expression = c.expression.repeatWithDelimeter(c.params.length, ' OR ')
            expression = `(${expression})`
        }
        expressions.push(expression)
    }
    return expressions
}

function isConditionValid(condition) {
    if (condition.expression.includes('?') && !isEmpty(condition.params)) {
        return false
    }
    return condition.params.every((p) => 
        p !== undefined && p !== null
    )
}

// extension method for String
String.prototype.repeatWithDelimeter = (count, delimeter) => 
    arrayOf(count, (i) => this).join(delimeter)

function arrayOf(size, indexTransform) {
    return Array.from(Array(size)).map((value, index) => indexTransform(index))
}

function parseInts(param, delimeter=',') {
    if (isEmpty(param)) return []
    return param.split(delimeter).map((c) => parseInt(c))
}

function isEmpty(list) {
    return list === undefined || list === null || list.length === 0
}

// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
