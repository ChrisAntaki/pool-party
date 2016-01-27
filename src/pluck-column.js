'use strict';

// Modules
let _ = require('lodash');
let async = require('async');
let chalk = require('chalk');
let fs = require('fs');
let parse = require('csv-parse');
let path = require('path');
let program = require('commander');
let stringify = require('csv-stringify');

program
    // .version('0.1.0')
    .option('-c, --column [index]', 'Pluck the specified column [0]', '0')
    .option('-f, --filename [name.csv]', 'Pluck from the specified file [name.csv]')
    .parse(process.argv);

if (!program.filename || !program.column) {
    program.help();
}

let file = fs.readFileSync(path.join(__dirname, `../input/suppression/${program.filename}`));
let hashes = [];

parse(file, (err, rows) => {
    _.each(rows, (row) => {
        hashes.push(row[program.column]);
    });

    console.log(`Found ${chalk.green(hashes.length)} rows.`);

    fs.writeFileSync(path.join(__dirname, `../input/suppression/${program.filename}.plucked.csv`), hashes.join('\n'));

    console.log(`Saved plucked column to ${chalk.blue(`${program.filename}.plucked.csv`)}`);
});
