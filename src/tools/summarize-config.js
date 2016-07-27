// Requirements
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const config = require('../../input/config');
const Promise = require('bluebird');

let message = '';

_.each(config.organizations, organization => {
    const swapping = organization.swapping ? '✓' : '✕';
    const sources = `Sources: ${organization.sources}`;
    message += `
(${swapping}) ${organization.name}
        ${sources}`;
    if (swapping && organization.states.length) {
        message += `
        Prefers users from: ${organization.states}`;
    }
    message += '\n';
});

console.log(message);
