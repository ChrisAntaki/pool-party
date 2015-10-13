'use strict';

// Modules
const _ = require('lodash');
const fs = require('fs');
const parse = require('csv-parse');

module.exports = class Organization {

        constructor(params) {
            this.hashes = {};
            this.name = params.json.name;
            this.params = params;
            this.sources = params.json.sources;

            // this.collectByStreaming();
            this.collectAtOnce();
        }

        collectAtOnce() {
            _.each(
                fs.readFileSync(this.params.path, 'utf-8')
                    .replace(/"/g, '')
                    .replace(/\r/g, '\n')
                    .replace(/\n\n/g, '\n')
                    .split('\n'),

                (row) => {
                    this.hashes[row.trim()] = true;
                }
            );

            this.params.callback();
        }

        collectByStreaming() {
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
