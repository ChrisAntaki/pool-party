// Requirements
var _ = require('lodash');
var async = require('async');
var chalk = require('chalk');
var fs = require('fs');
var parse = require('csv-parse');
var path = require('path');
var program = require('commander');
var stringify = require('csv-stringify');

program
    // .version('0.1.0')
    .option('-c, --column [index]', 'Pluck the specified column [0]', '0')
    .option('-f, --filename [name.csv]', 'Pluck from the specified file [name.csv]')
    .parse(process.argv);

if (!program.filename || !program.column) {
    program.help();
}

var file = fs.readFileSync(path.join(__dirname, `../${program.filename}`));
var hashes = [];

parse(file, (err, rows) => {
    _.each(rows, row => {
        hashes.push(row[program.column]);
    });

    console.log(`Found ${chalk.green(hashes.length)} rows.`);

    fs.writeFileSync(path.join(__dirname, `../${program.filename}.plucked.csv`), hashes.join('\n'));

    console.log(`Saved plucked column to ${chalk.blue(`${program.filename}.plucked.csv`)}`);
});
