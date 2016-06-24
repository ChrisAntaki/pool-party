// Requirements
var _ = require('lodash');
var beautify = require('js-beautify').js_beautify
var chalk = require('chalk');
var fs = require('fs');
var path = require('path');
var program = require('commander');
var Promise = require('bluebird');

program
    // .version('0.1.0')
    .option('-s, --save', 'Save the config.json file [false]', false)
    // .option('-f, --filename [config.json]', 'Choose a different filename [config.json]', 'config.json')
    .option('-c, --campaign [ABC]', 'Choose a campaign name [ABC]', 'ABC')
    .parse(process.argv);

var config = {};
config.campaign = program.campaign;
config.organizations = {};

var listings = fs.readdirSync(path.join(__dirname, `../../input/suppression`));
var csvs = _.filter(listings, listing => {
    return listing.match(/.csv$/);
});
_.each(csvs, csv => {
    var org = csv.match(/^\w+/)[0];
    config.organizations[org] = {
        name: org,
        sources: [
            org,
            org + '-emailshare',
            org + '-fbshare',
            org + '-twittershare',
        ],
        states: [],
        swapping: true,
    };
});

var json = beautify(JSON.stringify(config), 4);
if (!program.save) {
    console.log(json);
    process.exit(0);
}

fs.writeFileSync(path.join(__dirname, '../../input/config.json'), json);
console.log('Saved file');
