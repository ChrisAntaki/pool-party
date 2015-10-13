'use strict';

// Modules
var fs = require('fs');
var parse = require('csv-parse');

module.exports = class Organization {

        constructor(params) {
            this.hashes = {};
            this.name = params.json.name;
            this.params = params;
            this.source = params.json.source;

            this.collect();
        }

        collect() {
            var parser = parse({
                columns: ['hash'],
            });

            parser.on('finish', () => {
                this.params.callback();
            });

            parser.on('readable', () => {
                for (let row; row = parser.read();) {
                    this.hashes[row.hash] = true;
                }
            });

            fs.createReadStream(this.params.path).pipe(parser);
        }

}
