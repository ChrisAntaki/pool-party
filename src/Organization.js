'use strict';

// Modules
const fs = require('fs');
const parse = require('csv-parse');

module.exports = class Organization {

        constructor(params) {
            this.hashes = {};
            this.name = params.json.name;
            this.params = params;
            this.sources = params.json.sources;

            this.collect();
        }

        collect() {
            const parser = parse({
                columns: ['hash'],
            });

            parser.on('finish', () => {
                this.params.callback();
                delete this.params;
            });

            parser.on('readable', () => {
                for (let row; row = parser.read();) {
                    this.hashes[row.hash] = true;
                }
            });

            fs.createReadStream(this.params.path).pipe(parser);
        }

}
