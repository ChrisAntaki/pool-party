'use strict';
var fs = require('fs');
var parse = require('csv-parse');

module.exports = class Submissions {

    constructor(params) {
        this.hashes = {};
        this.params = params;

        this.collect();
    }

    collect() {
        var parser = parse({
            columns: true,
        });

        parser.on('finish', () => {
            this.params.callback();
        });

        parser.on('readable', () => {
            for (let row; row = parser.read();) {
                this.hashes[row.hash] = row;
            }
        });

        fs.createReadStream(this.params.path).pipe(parser);
    }

}
