'use strict';
var fs = require('fs');
var path = require('path');

var file = fs.readFileSync(path.join(__dirname, 'output/counts.json'), 'utf-8');
var counts = JSON.parse(file);

var owed = 0;
for (var key in counts) {
    var organization = counts[key];

    var matches = organization.clicks.matches;

    owed += matches;

    if (matches === 0) {
        console.log(organization.name + ' should send a new clicklist');
    }
}

console.log(owed + ' hashes are owed');
