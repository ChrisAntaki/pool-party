'use strict';
var fs = require('fs');
var path = require('path');

function loadSetFromMissesFile(source) {
    var file = fs.readFileSync(path.join(__dirname, `output/misses-${source}.csv`), 'utf-8');
    return new Set(JSON.parse(file));
}

function setMinusSet(set, minusSet) {
    var count = 0;

    minusSet.forEach((value) => {
        var success = set.delete(value);

        if (success) {
            count++;
        }
    });

    console.log(count + ' hashes taken by ' + process.argv[2]);
}

var minusSet = loadSetFromMissesFile(process.argv[2]);
var set = loadSetFromMissesFile(process.argv[3]);

setMinusSet(set, minusSet);

console.log(set.size + ' hashes remaining for ' + process.argv[3]);
