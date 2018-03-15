// Requirements
const _ = require('lodash');
const chalk = require('chalk');
const fs = require('fs');
const parse = require('csv-parse');
const path = require('path');

// Class
module.exports = class Organization {

    constructor(params) {
        this.hashes = {};
        this.name = params.json.name;
        this.params = params;
        this.joined = new Date(params.json.joined || 0);
        this.source = params.json.sources[0];
        this.sources = params.json.sources;
        this.states = params.json.states;
        this.swapping = params.json.swapping;

        if (this.swapping) {
            this.collectAtOnce();
        }
    }

    collectAtOnce() {
        const suppressions = this.params.json.suppression || [this.source];
        _.each(suppressions, suppression => {
            const url = path.join(__dirname, `../input/suppression/${suppression}.csv`);

            _.each(
                fs.readFileSync(url, 'utf-8')
                    .replace(/"/g, '')
                    .replace(/\r/g, '\n')
                    .replace(/\n\n/g, '\n')
                    .split('\n'),

                (row, i) => {
                    const hash = row.trim();

                    // Check for @ signs, in the first few rows
                    if (i < 5) {
                        if (hash.match('@')) {
                            console.log(`${chalk.red('Warning:')} '${suppression}.csv' contains ${chalk.green('@')} symbols`);
                            throw '@ symbols in suppression list';
                        }
                    }

                    this.hashes[hash] = true;
                }
            );
        });
    }

    // collectByStreaming() {
    //     const parser = parse({
    //         columns: ['hash'],
    //     });
    //
    //     parser.on('finish', () => {
    //         this.params.callback();
    //         delete this.params;
    //     });
    //
    //     parser.on('readable', () => {
    //         for (const row; row = parser.read();) {
    //             this.hashes[row.hash] = true;
    //         }
    //     });
    //
    //     fs.createReadStream(this.params.path).pipe(parser);
    // }

}
