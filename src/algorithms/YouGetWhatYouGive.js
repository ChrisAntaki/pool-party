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
    return this.eligible[params.from.sources[0]][0];
}

Organization.prototype.giveHash = function giveHash (params) {
    let submission = params.submission;

    this.given.push(submission);

    _.each(submission.eligible, (organization) => {
        _.each(organization.eligible, (eligible) => {
            _.each(eligible, (eligibleSubmission, index) => {
                if (eligibleSubmission === submission) {
                    _.pullAt(eligible, index);
                    return false;
                }
            });
        });
    });

    params.to.received.push(submission);
}

// Class
module.exports = class YouGetWhatYouGive {

    constructor(params) {
        this.callback = params.callback;
        this.free = [];
        this.organizations = params.organizations;
        this.submissions = params.submissions;

        // Logging
        this.reportInterval = null;
        this.previousHashCount = 0;

        this.start();
    }

    start() {
        async.series([
            // Modifying organization and submissions objects
            (next) => {
                _.each(this.organizations, (organization) => {
                    organization.eligible = {};
                    organization.given = [];
                    organization.received = [];
                });

                _.each(this.submissions.hashes, (submission) => {
                    submission.eligible = [];
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
                            matched = true;
                        } else {
                            delete submission.sources[source];
                        }
                    });

                    if (!matched) {
                        this.free.push(submission);
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

                        organization.eligible[otherOrganization.sources[0]] = [];
                    });
                });

                // Assigning eligiblity to submissions
                _.each(this.organizations, (organization) => {
                    _.each(this.submissions.hashes, (submission) => {
                        if (!organization.hashes[submission.hash]) {
                            submission.eligible.push(organization);
                            _.each(submission.sources, (otherOrganization) => {
                                if (organization === otherOrganization) {
                                    return;
                                }

                                organization.eligible[otherOrganization.sources[0]].push(submission);
                            });
                        }
                    });
                });

                console.log('Sorting eligible hashes');
                _.each(this.organizations, (organization) => {
                    _.each(organization.eligible, (eligible) => {
                        eligible.sort((a, b) => {
                            return a.eligible.length - b.eligible.length;
                        });
                    });
                });

                next();
            },

            // Swap
            (next) => {
                console.log('Starting swap!');
                this.reportInterval = setInterval(() => {
                    this.printStatus();
                }, 1000);

                async.forever((next) => {
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
                        clearInterval(this.reportInterval);
                        next(1);
                    } else {
                        next();
                    }
                }, () => {
                    next();
                });
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

            this.printStatus();

            console.log('The end');
        });
    }

    printStatus() {
        console.log('-------');

        let count = 0;

        _.each(this.organizations, (organization) => {
            let keyCount = organization.received.length;
            console.log(organization.sources[0] + ' | ' +  keyCount);
            count += keyCount;
        });

        console.log((count - this.previousHashCount) + ' hashes/second');

        this.previousHashCount = count;
    }

    getShuffledListOfGivingOrganizations() {
        return _.shuffle(_.filter(this.organizations, (organization) => {
            return (
                organization.given.length <= organization.received.length
            );
        }));
    }

    getShuffledListOfOwedOrganizations(params) {
        return _.filter(this.organizations, (organization) => {
            return (
                organization !== params.except
                &&
                organization.given.length >= organization.received.length
            );
        }).sort((a, b) => {
            let scoreA = a.given.length - a.received.length;
            let scoreB = b.given.length - b.received.length;
            return scoreB - scoreA; // Sorting rarity ASC
        });
    }

}
