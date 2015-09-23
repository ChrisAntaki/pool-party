var exec = require('child_process').exec;
var crypto = require('crypto');
var fs = require('fs');
var numeral = require('numeral');

var then = Date.now();

var organizations = require('./input/organizations.json');

function NewHash(params) {
    this.email = params.email;
    this.given = false;
    this.hash = params.hash;
    this.timestamp = params.timestamp;

    this.organizations = {};
}

// Create an Array of NewHash objects.
console.log('Creating array of new hashes.');
var newHashes = (function() {
    var obj = {};

    var lines = fs.readFileSync('input/new.csv', 'utf-8').split('\n');

    for (var i = 1; i < lines.length; i++) {
        if (!lines[i]) {
            continue;
        }

        var values = lines[i].split(',');

        var email = values[2]
            .replace(/"/g, '')
            .trim()
            .toLowerCase();

        var hash = crypto.createHash('md5').update(email).digest('hex');

        if (!hash) {
            continue;
        }

        obj[hash] = new NewHash({
            hash: hash,
            email: email,
            timestamp: +values[0].replace(/"/g, ''),
        });
    }

    return obj;
})();

// Create HashMaps for each organization.
console.log('Creating hashmaps for each organization.');
organizations.forEach(function(organization) {
    console.log('Organization: ' + organization.id);
    console.log('Reading CSV.');
    var hashes = fs.readFileSync('input/org-' + organization.id + '.csv', 'utf-8').split('\n');

    organization.hasHash = {};

    console.log('Saving hashes.');
    hashes.forEach(function(hash) {
        hash = hash
            .trim()
            .toLowerCase();

        organization.hasHash[hash] = true;
    });

    organization.hashesGiven = [];
    organization.potentialHashes = [];
});

// Note potential matches for each organization.
console.log('Noting potential matches for each organization.');
for (var hash in newHashes) {
    var hashObj = newHashes[hash];
    organizations.forEach(function(organization) {
        if (!organization.hasHash[hash] && hashObj.timestamp > organization.starting) {
            hashObj.organizations[organization.id] = true;
            organization.potentialHashes.push(hashObj);
        }
    });
}

// Sorting available arrays.
console.log('Sorting available arrays.');
organizations.forEach(function(org) {
    org.potentialHashes.sort(function(a, b) {
        var countA = Object.keys(a.organizations).length;
        var countB = Object.keys(b.organizations).length;

        if (countA === countB) {
            return 0;
        } else if (countA < countB) {
            return -1;
        } else {
            return +1;
        }
    });
});
console.log('Sorted available array.');

function findNextRecipient() {
    var bestShare = 0;
    var bestCandidate = organizations[0];

    organizations.forEach(function(organization) {
        var currentShare = 0;
        if (hashesGiven > 0) {
            currentShare = organization.hashesGiven.length / hashesGiven;
        }

        var combinedShare = (organization.share / 100) - currentShare;
        if (bestShare < combinedShare) {
            bestShare = combinedShare;
            bestCandidate = organization;
        }
    });

    return bestCandidate;
}

function findNextHash(org) {
    while (org.potentialHashes[0] && org.potentialHashes[0].given) {
        org.potentialHashes.splice(0, 1);
    }

    return org.potentialHashes[0];
}

function printStatus() {
    var total = 0;
    organizations.forEach(function(organization) {
        console.log(organization.id + ' was given ' + organization.hashesGiven.length + ' hashes.');
        total += organization.hashesGiven.length;
    });
    console.log('In total? ' + total);
    console.log('');
}

console.log('Distributing hashes.');
var hashesGiven = 0;
while (true) {
    var org = findNextRecipient();
    var hash = findNextHash(org);

    if (!hash) {
        break;
    }

    org.hashesGiven.push(hash);
    hash.given = true;
    hashesGiven++;
}

printStatus();

console.log('Time taken:', Date.now() - then);
console.log('Size:', Object.keys(newHashes).length);

console.log('Saving new email CSVs.');
process.chdir('output');
organizations.forEach(function(org) {
    var emails = '';
    org.hashesGiven.map(function(hashObj) {
        emails += hashObj.email + '\n';
    });
    var filename = './org-' + org.id + '-emails.csv';
    fs.writeFile(filename, emails, function(err) {
        exec('7z a -t7z ' + filename + '.7z ' + filename + ' -p"' + org.pass + '"', function(err) {
            fs.unlink(filename);
        });
    });

    var count = numeral(org.hashesGiven.length).format('0,0');
    fs.writeFile('./org-' + org.id + '-count.txt', 'You received ' + count + ' new emails.');
});
