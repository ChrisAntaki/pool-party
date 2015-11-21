'use strict';

// Modules
const _ = require('lodash');
const fs = require('fs');
const parse = require('csv-parse');
const path = require('path');

// Class
module.exports = class Organization {

        constructor(params) {
            this.hashes = {};
            this.name = params.json.name;
            this.params = params;
            this.source = params.json.sources[0];
            this.sources = params.json.sources;
            this.swapping = params.json.swapping;

            // this.collectByStreaming();
            if (this.swapping) {
                this.collectAtOnce();
            } else {
                this.params.callback();
            }
        }

        collectAtOnce() {
            let suppressions = this.params.json.suppression || [this.source];
            console.log(suppressions);
            _.each(suppressions, (suppression) => {
                const url = path.join(__dirname, `../input/suppression/${suppression}.csv`);

                _.each(
                    fs.readFileSync(url, 'utf-8')
                        .replace(/"/g, '')
                        .replace(/\r/g, '\n')
                        .replace(/\n\n/g, '\n')
                        .split('\n'),

                    (row) => {
                        this.hashes[row.trim()] = true;
                    }
                );
            });

            this.params.callback();
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
        //         for (let row; row = parser.read();) {
        //             this.hashes[row.hash] = true;
        //         }
        //     });
        //
        //     fs.createReadStream(this.params.path).pipe(parser);
        // }

}
