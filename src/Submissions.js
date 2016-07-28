// Requirements
const _ = require('lodash');
const chalk = require('chalk');
const crypto = require('crypto');
const fs = require('fs');
const Promise = require('bluebird');

// Promises
const parse = Promise.promisify(require('csv-parse'));

// Class
module.exports = class Submissions {

    constructor(params) {
        this.hashes = {};
        this.params = params;

        // Bind
        this.collect = this.collect.bind(this);
    }

    parse() {
        return new Promise(this.collect);
    }

    collect(fulfill, reject) {
        const input = fs.readFileSync(this.params.path);
        const options = { columns: true };

        parse(input, options)
        .then(rows => {
            const submissions = {};

            _.each(rows, row => {
                const email = row.email.trim().toUpperCase();
                const hash = crypto.createHash('md5').update(email).digest('hex');
                let submission = submissions[hash];

                if (!submission) {
                    submission = submissions[hash] = {
                        hash: hash,
                        row: row,
                        sources: {},
                        swappable: false,
                    };
                }

                submission.sources[row.source] = true;

                const createdAt = new Date(row.created_at);
                if (!submission.created || submission.created < createdAt) {
                    submission.created = createdAt;
                }

                if (row.swappable === 'consent') {
                    submission.swappable = true;
                }

                delete row.created_at;
                delete row.source;
                delete row.swappable;
            });

            this.hashes = _.values(submissions);
            this.swappableHashes = _.filter(this.hashes, submission => submission.swappable);

            console.log(`Found ${chalk.green(this.swappableHashes.length)} unique swappable submissions.`);

            fulfill(submissions);
        })
        .catch(reject);
    }

}
