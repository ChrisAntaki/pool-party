'use strict';

// Modules
const _ = require('lodash');
const async = require('async');
const config = require('../../input/config');
const fs = require('fs');
const Organization = require('../Organization');
const path = require('path');
const Submissions = require('../Submissions');

// Modifications
Organization.prototype.requestSubmission = function requestSubmission (params) {
    let eligible = params.free ? this.eligible.free : this.eligible[params.from.sources[0]];
    let lostIndexes = [];
    let submission = _.find(eligible, (submission, index) => {
        if (!params.given[submission.hash]) {
            return true;
        } else {
            lostIndexes.push(index);
            return false;
        }
    });

    if (lostIndexes.length > 0) {
        _.pullAt(eligible, lostIndexes);
    }

    return submission;
}

Organization.prototype.giveSubmission = function giveSubmission (params) {
    let submission = params.submission;
    params.given[submission.hash] = submission;
    params.to.received.push(submission);
    this.given.push(submission);
}

Organization.prototype.takeFreeSubmission = function takeFreeSubmission (params) {
    let submission = params.submission;
    params.given[submission.hash] = submission;
    this.received.push(submission);
    this.freeCount++;
}

// Class
module.exports = class YouGetWhatYouGive {

    constructor(params) {
        this.callback = params.callback;
        this.highestSwapCount = +process.argv[4] || 0;
        this.organizations = params.organizations;
        this.submissions = params.submissions;

        console.log(`Swap count to beat is ${this.highestSwapCount}`);

        async.timesSeries(+process.argv[3], (n, next) => {
            console.log(`Starting algorithm iteration ${n + 1} of ${process.argv[3]} total`);

            this.start(next);
        });
    }

    start(next) {
        async.series([
            // Resetting instance variables
            (next) => {
                this.given = {};

                next();
            },

            // Modifying organization and submissions objects
            (next) => {
                _.each(this.organizations, (organization) => {
                    organization.eligible = {};
                    organization.freeCount = 0;
                    organization.given = [];
                    organization.received = [];
                    organization.sacrificing = false;
                    organization.sourced = [];
                });

                _.each(this.submissions.hashes, (submission) => {
                    // Used to determine rarity of submission
                    submission.eligible = [];
                    submission.sacrificed = false;
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
                    submission.sourceObjects = [];

                    _.each(_.keys(submission.sources), (source) => {
                        let organization = sourceMap[source];
                        if (organization) {
                            organization.sourced.push(submission);
                            submission.sourceObjects.push(organization);
                        }
                    });
                });

                next();
            },

            // Finding eligible hashes for each organization
            (next) => {
                console.log('Finding eligible hashes for each organization');
                // Creating eligibity arrays
                _.each(this.organizations, (organization) => {
                    organization.eligible.free = [];

                    _.each(this.organizations, (otherOrganization) => {
                        if (organization === otherOrganization) {
                            return;
                        }

                        organization.eligible[otherOrganization.sources[0]] = [];
                    });
                });

                // Assigning eligiblity to submissions
                _.each(this.submissions.hashes, (submission) => {
                    _.each(this.organizations, (organization) => {
                        // Skip suppressed hashes
                        if (organization.hashes[submission.hash]) {
                            return;
                        }

                        // Used to determine rarity of submission
                        submission.eligible.push(organization);
                    });
                });

                next();
            },

            // Sort submissions by eligibility
            (next) => {
                this.submissions.hashes.sort((a, b) => a.eligible.length - b.eligible.length);

                next();
            },

            // Repayments
            (next) => {
                console.log('Repayments');
                _.each(config.sourcesToRepay, (amount, source) => {
                    let organization = _.find(this.organizations, (organization) => {
                        return source === organization.sources[0];
                    });

                    // Source unsourced submissions, from the recipient's suppression list
                    _.each(this.submissions.hashes, (submission) => {
                        if (
                            organization.hashes[submission.hash]
                            &&
                            submission.sourceObjects.length === 0
                        ) {
                            submission.sourceObjects.push(organization);
                            amount--;
                        }

                        if (amount === 0) {
                            console.log('Repayed everything to ' + organization.name);
                            return false;
                        }
                    });
                });

                next();
            },

            // Destroy remaining unsourced submissions
            (next) => {
                console.log('Destroying unsourced submissions');
                let indexesToRemove = [];

                _.each(this.submissions.hashes, (submission, index) => {
                    if (submission.sourceObjects.length === 0) {
                        indexesToRemove.push(index);
                    }
                });

                console.log(`Destroying ${indexesToRemove.length} unsourced submissions`);

                _.pullAt(this.submissions.hashes, indexesToRemove);

                next();
            },

            // Honorable sacrifice
            (next) => {
                console.log('Honorable sacrifice');
                let sacrificers = _.filter(
                    this.organizations,
                    (organization) => _.includes(config.sourcesToSacrifice, organization.sources[0])
                );

                _.each(sacrificers, (sacrificer) => {
                    console.log(sacrificer.name);
                    sacrificer.sacrificing = true;

                    // Remove all references to sourceObjects
                    let count = 0;

                    _.each(this.submissions.hashes, (submission, index) => {
                        if (_.includes(submission.sourceObjects, sacrificer)) {
                            _.pull(submission.sourceObjects, sacrificer);
                            count++;
                        }

                    });

                    console.log(`Removed a source from ${count} submissions.`);
                });

                next();
            },

            // Assigning eligiblity to organizations
            (next) => {
                console.log('Assigning eligiblity to organizations');
                _.each(this.submissions.hashes, (submission) => {
                    let isFree = submission.sourceObjects.length === 0;

                    _.each(submission.eligible, (organization) => {
                        if (isFree) {
                            organization.eligible.free.push(submission);
                        } else {
                            _.each(submission.sourceObjects, (otherOrganization) => {
                                if (organization === otherOrganization) {
                                    return;
                                }

                                organization.eligible[otherOrganization.sources[0]].push(submission);
                            });
                        }
                    });
                });

                next();
            },

            // Swap
            (next) => {
                console.log('Starting swap!');
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
                                given: this.given,
                            });

                            if (desiredSubmission) {
                                givingOrganization.giveSubmission({
                                    given: this.given,
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
                        next(1);
                    } else {
                        next();
                    }
                }, () => {
                    console.log('Trading has halted');
                    next();
                });
            },

            // Distributing free submissions
            (next) => {
                console.log('Distributing free submissions');
                let validOrganizations = _.filter(this.organizations, (organization) => !organization.sacrificing);

                async.forever((next) => {
                    // Check if every organization has bounced
                    if (_.isEmpty(validOrganizations)) {
                        next(1);
                        return;
                    }

                    // Find the organization who has taken the least free submissions
                    let organization = _.min(validOrganizations, organization => organization.freeCount);

                    // Stop when an organization has been repayed
                    if (organization.received.length >= organization.sourced.length) {
                        console.log(organization.name + ' is bowing out.');
                        _.pull(validOrganizations, organization);
                        next();
                        return;
                    }

                    let submission = organization.requestSubmission({
                        free: true,
                        given: this.given,
                    });

                    if (!submission) {
                        console.log(organization.name + ' is bowing out.');
                        _.pull(validOrganizations, organization);
                        next();
                        return;
                    }

                    organization.takeFreeSubmission({
                        given: this.given,
                        submission: submission,
                    });

                    next();
                }, (err) => {
                    next();
                });
            },

            // Save, if swap count is higher than a previous iteration
            (next) => {
                let count = this.getSwapCount();
                if (this.highestSwapCount < count) {
                    console.log(`:D The new count (${count}) is larger than the existing count (${this.highestSwapCount}).`);
                    this.highestSwapCount = count;
                } else {
                    console.log(`¯\\_(ツ)_/¯ The new count (${count}) is smaller than the existing count (${this.highestSwapCount}).`);
                    next();
                    return;
                }

                console.log('Saving hashes for each organization');
                _.each(this.organizations, (organization) => {
                    if (organization.sacrificing) {
                        return;
                    }

                    let data = '';

                    _.each(organization.received, (submission) => {
                        data += submission.hash + '\n';
                    });

                    fs.writeFileSync(path.join(__dirname, `../../output/hashes-${organization.sources[0]}.csv`), data);
                });

                let summary = this.getSummary();
                fs.writeFileSync(path.join(__dirname, `../../output/summary.csv`), summary);

                console.log('-------');
                console.log(summary);
                console.log('-------');

                next();
            },
        ], next);
    }

    getSwapCount() {
        return _.sum(this.organizations, (organization) => {
            if (organization.sacrificing) {
                return 0;
            }

            return organization.received.length;
        });
    }

    getSummary() {
        let summary = 'Organization,Owed,Received From Swap,Received From Sacrifice,Received Total\n';
        _.each(this.organizations, (organization) => {
            if (organization.sacrificing) {
                return;
            }

            let keyCount = organization.received.length;
            summary += `${organization.name},${organization.sourced.length},${keyCount - organization.freeCount},${organization.freeCount},${keyCount}\n`;
        });

        return summary;
    }

    getShuffledListOfGivingOrganizations() {
        return _.shuffle(_.filter(this.organizations, (organization) => {
            if (organization.sacrificing) {
                return false;
            }

            return (
                organization.given.length <= organization.received.length
            );
        }));
    }

    getShuffledListOfOwedOrganizations(params) {
        return _.filter(this.organizations, (organization) => {
            if (organization.sacrificing) {
                return false;
            }

            return (
                organization !== params.except
                &&
                organization.given.length >= organization.received.length
            );
        }).sort((a, b) => {
            let scoreA = a.given.length - a.received.length;
            let scoreB = b.given.length - b.received.length;
            return scoreB - scoreA;
        });
    }

}
