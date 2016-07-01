// Requirements
var _ = require('lodash');
var fs = require('fs');
var parse = require('csv-parse');
var path = require('path');

// Class
module.exports = class Organization {

    constructor(params) {
        this.hashes = {};
        this.name = params.json.name;
        this.params = params;
        this.source = params.json.sources[0];
        this.sources = params.json.sources;
        this.states = params.json.states;
        this.swapping = params.json.swapping;

        if (this.swapping) {
            this.collectAtOnce();
        }
    }

    collectAtOnce() {
        var suppressions = this.params.json.suppression || [this.source];
        _.each(suppressions, suppression => {
            var url = path.join(__dirname, `../input/suppression/${suppression}.csv`);

            _.each(
                fs.readFileSync(url, 'utf-8')
                    .replace(/"/g, '')
                    .replace(/\r/g, '\n')
                    .replace(/\n\n/g, '\n')
                    .split('\n'),

                row => {
                    this.hashes[row.trim()] = true;
                }
            );
        });
    }

    // collectByStreaming() {
    //     var parser = parse({
    //         columns: ['hash'],
    //     });
    //
    //     parser.on('finish', () => {
    //         this.params.callback();
    //         delete this.params;
    //     });
    //
    //     parser.on('readable', () => {
    //         for (var row; row = parser.read();) {
    //             this.hashes[row.hash] = true;
    //         }
    //     });
    //
    //     fs.createReadStream(this.params.path).pipe(parser);
    // }

}
