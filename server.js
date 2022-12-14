// Built-in Node.js modules
let fs = require('fs');
let path = require('path');
let cors = require('cors');


// NPM modules
let express = require('express');
let sqlite3 = require('sqlite3');
const { query } = require('express');
const { create } = require('domain');
const { parse } = require('path');


let db_filename = path.join(__dirname, 'db', 'stpaul_crime.sqlite3');

let app = express();
let port = 8000;

app.use(cors());
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
    let query = 'SELECT * FROM Codes ORDER BY code'
    let conditions = [
        {
            expression: "code = ?",
            repeatWithOr: true,
            params: parseInts(req.query.code)
        }
    ] 
    
    databaseSelectWhere(query, conditions)
    .then((codes) => {
        res.status(200).type('json').send(codes)
    })
    .catch((err) => {
        res.status(404).type('text/plain').send(err)
    });
});

// GET request handler for neighborhoods
app.get('/neighborhoods', (req, res) => {
    let query = `SELECT * FROM Neighborhoods ORDER BY neighborhood_number`
    let conditions = [
        {
            expression: "neighborhood_number = ?",
            repeatWithOr: true,
            params: parseInts(req.query.id)
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
    let query = `INSERT INTO incidents VALUES (?, ?, ?, ?, ?, ?, ?)`
    let params = [req.body.case_number, req.body.date + 'T' + req.body.time, req.body.code, req.body.incident, 
                    req.body.police_grid, req.body.neighborhood_number, req.body.block]
    databaseRun(query, params)
    .then(() => {
        res.status(200).type('txt').send('OK')
    })
    .catch(() => {
        res.status(500).type('txt').send('Error: Incident already exists')
    })
});

// DELETE request handler for new crime incident
app.delete('/remove-incident', (req, res) => {
    let case_number = parseInt(req.body.case_number);
    let query = `SELECT * FROM Incidents WHERE case_number = ?`
    let params = [case_number]  
    
    databaseSelect(query, params)
    .then((incidents) => {
        //delete
        if(isEmptyOrNull(incidents)){
            reject('Case number does not exist')
        } else{
            let deleteQuery = `DELETE FROM Incidents WHERE case_number = ?`
            return databaseRun(deleteQuery, params)
        }
    })
    .then(() => {
        res.status(200).type('txt').send('OK')
    })
    .catch((err) => {
        res.status(500).type('txt').send('Error deleting incident')
    });
});

// Create Promise for SQLite3 database SELECT query 
function databaseSelect(query, params) {
    console.log(`\nSELECT: \n\tquery: ${query} \n\tparams: ${params}\n`)

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
    console.log(`\nRUN: \n\tquery: ${query} \n\tparams: ${params}\n`)

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
 * Create Promise for SQLite3 database `SELECT` query after inserting a `WHERE` and `LIMIT` clause, if necessary.
 * 
 * `databaseSelectWhere()` will insert all valid conditions into the SQL query; that is, conditions will be included in the `WHERE` clause 
 * only if every question mark in `expression` has an associated parameter in `params`, and if each of these parameters are not null/undefined
 * 
 * @param {string} query a SQL query that does not contain a `WHERE` clause
 * @param {{ expression: string, params: any[], repeatWithOr: boolean, repeatWithAnd: boolean }[]} conditions 
 * @returns 
 */
 function databaseSelectWhere(query, conditions, limit=null) {
    if (query.includes('WHERE')) Error("WHERE clause should not be added manually in databaseSelectWhere()")
    if (query.includes('LIMIT')) Error("LIMIT clause should not be added manually in databaseSelectWhere()")

    let expressions = filterAndFormatExpressions(conditions)
    let params = filterParameters(conditions)
    let editedQuery = query

    if (!isNaN(limit) && limit !== null) {
        editedQuery = insertLimitClause(editedQuery, limit)
    }
    if (!isEmptyOrNull(params)) {
        editedQuery = insertWhereClause(editedQuery, expressions)
    }
    return databaseSelect(editedQuery, params)
}

function insertLimitClause(query, limit) {
    return `${query} LIMIT ${limit}`
}

/**
 * Inserts a `WHERE` clause into query after the `FROM` clause and separates each condition with an `AND`
 * @param {string} query 
 * @param {string[]} expressions 
 * @returns string
 */
 function insertWhereClause(query, expressions) {
    let words = query.split(' ')
    let whereClause = `WHERE ${expressions.join(' AND ')}`
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
            expression = `(${expression.repeatWithDelimeter(c.params.length, ' AND ')})`
        }
        if (c.repeatWithOr) {
            expression = `(${expression.repeatWithDelimeter(c.params.length, ' OR ')})`
        }
        expressions.push(expression)
    }
    return expressions
}

function isConditionValid(condition) {
    function logInvalidCondition(reason) {
        console.error(`invalid condition '${condition.expression}'; ${reason}`)
    }

    let numQuestionMarks = condition.expression.split('').filter(char => char === '?').length

    // if there are no question marks, then we don't need to check params
    if (numQuestionMarks === 0) {
        return true
    }
    // ensure that params is an array
    if (!(condition.params instanceof Array)) {
        logInvalidCondition(`condition.params should be an Array, but is actually ${typeof condition.params}`)
        return false
    }
    // if a condition specifies a '?', check if params is null
    if (numQuestionMarks > 0 && isEmptyOrNull(condition.params)) {
        logInvalidCondition("condition.params is null or undefined.")
        return false
    }
    // if a condition specifies a '?', check that there is an associated parameter for every question mark
    if (numQuestionMarks > condition.params.length) {  
        logInvalidCondition("condition.expression contains more question marks than there are condition.params")
        return false
    }
    // if there is a paramater for every question mark, check that each parameter is valid
    return condition.params.every((p) => 
        p !== undefined && p !== null
    )
}

// extension method for String
String.prototype.repeatWithDelimeter = function(count, delimeter) {
    return arrayOf(count, (i) => this).join(delimeter)
}
    
function arrayOf(size, indexTransform) {
    return Array.from(Array(size)).map((value, index) => indexTransform(index))
}

function parseInts(param, delimeter=',') {
    if (isEmptyOrNull(param)) return []
    return param.split(delimeter).map((c) => parseInt(c))
}

function isEmptyOrNull(list) {
    return list === undefined || list === null || list.length === 0
}

// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
