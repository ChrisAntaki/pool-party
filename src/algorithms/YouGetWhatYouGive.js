'use strict';

// Modules
const _ = require('lodash');
const async = require('async');
const fs = require('fs');
const Organization = require('../Organization');
const path = require('path');
const Submissions = require('../Submissions');

// Modifications
Organization.prototype.requestSubmission = function requestSubmission (params) {
    let eligible = this.eligible[params.from.sources[0]];
    return eligible[_.keys(eligible)[0]];
}

Organization.prototype.giveHash = function giveHash (params) {
    let submission = params.submission;

    this.given[submission.hash] = submission;
    // _.each(submission.sources, (organization) => {
    //     organization.given[submission.hash] = submission;
    // });

    _.each(submission.eligible, (organization) => {
        _.each(organization.eligible, (eligible) => {
            delete eligible[submission.hash];
        });
    });

    params.to.received[submission.hash] = submission;
}

// Class
module.exports = class YouGetWhatYouGive {

    constructor(params) {
        this.callback = params.callback;
        this.free = {};
        this.organizations = params.organizations;
        this.submissions = params.submissions;

        this.start();
    }

    start() {
        async.series([
            // Modifying organization and submissions objects
            (next) => {
                _.each(this.organizations, (organization) => {
                    organization.eligible = {};
                    organization.given = {};
                    organization.received = {};
                    organization.sourced = {};
                });

                _.each(this.submissions.hashes, (submission) => {
                    submission.eligible = {};
                });

                next();
            },

            // Assigning submissions to organizations
            (next) => {
                console.log('Assigning submissions to organizations');
                let sourceMap = {};

                _.each(this.organizations, (organization) => {
                    _.each(organization.sources, (source) => {
                        sourceMap[source] = organization;
                    });
                });

                _.each(this.submissions.hashes, (submission) => {
                    let matched = false;

                    _.each(_.keys(submission.sources), (source) => {
                        let organization = sourceMap[source];
                        if (organization) {
                            submission.sources[organization.sources[0]] = organization;
                            organization.sourced[submission.hash] = submission;
                            matched = true;
                        } else {
                            delete submission.sources[source];
                        }
                    });

                    if (!matched) {
                        this.free[submission.hash] = submission;
                    }
                });

                next();
            },

            // Finding eligible hashes for each organization
            (next) => {
                console.log('Finding eligible hashes for each organization');
                // Creating eligibity objects for every organization, referencing every other organization
                _.each(this.organizations, (organization) => {
                    _.each(this.organizations, (otherOrganization) => {
                        if (organization === otherOrganization) {
                            return;
                        }

                        organization.eligible[otherOrganization.sources[0]] = {};
                    });
                });

                // Assigning eligiblity to submissions
                _.each(this.organizations, (organization) => {
                    _.each(this.submissions.hashes, (submission) => {
                        if (!organization.hashes[submission.hash]) {
                            submission.eligible[organization.sources[0]] = organization;
                            _.each(submission.sources, (otherOrganization) => {
                                let eligible = organization.eligible[otherOrganization.sources[0]];
                                if (eligible) {
                                    eligible[submission.hash] = submission;
                                }
                            });
                        }
                    });
                });

                console.log('Sorting eligible hashes');
                _.each(this.organizations, (organization) => {
                    _.each(organization.eligible, (eligible, source) => {
                        let eligibleArray = [];
                        _.each(eligible, (submission) => {
                            eligibleArray.push(submission);
                        });

                        eligibleArray.sort((a, b) => {
                            return _.keys(a.eligible).length - _.keys(b.eligible).length;
                        });

                        eligible = {};
                        _.each(eligibleArray, (submission) => {
                            eligible[submission.hash] = submission;
                        });
                    });
                });

                next();
            },

            // Swap
            (next) => {
                console.log('Starting swap!');
                for (;;) {
                    let fails = 0;
                    let givingOrganizations = this.getShuffledListOfGivingOrganizations();
                    _.each(givingOrganizations, (givingOrganization) => {
                        let owedOrganizations = this.getShuffledListOfOwedOrganizations({
                            except: givingOrganization,
                        });
                        let success = false;

                        _.each(owedOrganizations, (owedOrganization) => {
                            let desiredSubmission = owedOrganization.requestSubmission({
                                from: givingOrganization,
                            });

                            if (desiredSubmission) {
                                givingOrganization.giveHash({
                                    submission: desiredSubmission,
                                    to: owedOrganization,
                                });

                                success = true;
                                _.pull(owedOrganizations, owedOrganization);
                                return false;
                            }
                        });

                        if (!success) {
                            fails++;
                        }
                    });

                    if (fails === givingOrganizations.length) {
                        console.log('Ran out of hashes to give.');
                        next();
                        break;
                    }
                }
            },

            // Save
            (next) => {
                console.log('Saving hashes for each organization');
                _.each(this.organizations, (organization) => {
                    let data = '';

                    _.each(organization.received, (submission) => {
                        data += submission.hash + '\n';
                    });

                    fs.writeFileSync(path.join(__dirname, `../../output/hashes-${organization.sources[0]}.csv`), data);
                });

                next();
            },
        ], (err) => {
            if (err) {
                console.log(err);
            }

            _.each(this.organizations, (organization) => {
                console.log(organization.name);
                console.log('Given: ' + _.keys(organization.given).length);
                console.log('Received: ' + _.keys(organization.received).length);
                console.log('---');
            });

            console.log('The end');
        });
    }

    getShuffledListOfGivingOrganizations() {
        return _.shuffle(_.filter(this.organizations, (organization) => {
            return Object.keys(organization.given).length <= Object.keys(organization.received).length;
        }));
    }

    getShuffledListOfOwedOrganizations(params) {
        return _.filter(this.organizations, (organization) => {
            return (
                organization !== params.except
                &&
                Object.keys(organization.given).length >= Object.keys(organization.received).length
            );
        }).sort((a, b) => {
            let scoreA = Object.keys(a.given).length - Object.keys(a.received).length;
            let scoreB = Object.keys(b.given).length - Object.keys(b.received).length;
            return scoreB - scoreA;
        });
    }

}
