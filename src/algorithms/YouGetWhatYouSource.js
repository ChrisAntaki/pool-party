'use strict';

// Modules
let _ = require('lodash');
let async = require('async');
let config = require('../config');
let fs = require('fs');
let stringify = require('csv-stringify');
let Organization = require('../Organization');
let path = require('path');
let Submissions = require('../Submissions');

// Settings
let cordiality = +config.get('cordiality');

// Modifications
Organization.prototype.requestSubmission = function requestSubmission(params) {
    let eligible = params.free ? this.eligible.free : this.eligible[params.from.source];
    let lostIndexes = [];
    let submission = _.find(eligible, (submission, index) => {
        if (!this.hashes[submission.hash] && submission.givenCount < cordiality) {
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

Organization.prototype.giveSubmission = function giveSubmission(params) {
    let submission = params.submission;
    params.to.hashes[submission.hash] = true;
    params.to.eligible[this.source].shift();
    params.to.received.push(submission);
    submission.givenCount++;
    this.givenCount++;
}

Organization.prototype.takeFreeSubmission = function takeFreeSubmission(params) {
    let submission = params.submission;
    submission.givenCount++;
    this.eligible.free.shift();
    this.freeCount++;
    this.hashes[submission.hash] = true;
    this.received.push(submission);
}

// Class
module.exports = class YouGetWhatYouSource {

    constructor(params) {
        this.callback = params.callback;
        this.organizations = params.organizations;
        this.submissions = params.submissions;
        this.start();
    }

    start(next) {
        async.series([
            // Modifying organization and submissions objects
            (next) => {
                _.each(this.organizations, (organization) => {
                    organization.eligible = {};
                    organization.eligibleCount = 0;
                    organization.freeCount = 0;
                    organization.givenCount = 0;
                    organization.received = [];
                    organization.source = organization.sources[0];
                    organization.sourced = [];
                    organization.swappableSourced = [];
                });

                _.each(this.submissions.hashes, (submission) => {
                    // Used to determine rarity of submission
                    submission.eligible = [];
                    submission.givenCount = 0;
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
                            organization.hashes[submission.hash] = true;
                            organization.sourced.push(submission);
                            submission.sourceObjects.push(organization);

                            if (submission.swappable) {
                                organization.swappableSourced.push(submission);
                            }
                        }
                    });
                });

                // Remove duplicates
                _.each(this.submissions.hashes, (submission) => {
                    submission.sourceObjects = _.uniq(submission.sourceObjects);
                });
                _.each(this.organizations, (organization) => {
                    organization.sourced = _.uniq(organization.sourced);
                    organization.swappableSourced = _.uniq(organization.swappableSourced);
                });

                next();
            },

            // Saving sourced signatures
            (next) => {
                async.eachSeries(this.organizations, (organization, next) => {
                    let sourced = _.map(organization.sourced, submission => submission.row);
                    stringify(sourced, {
                        header: true,
                        quoted: true,
                    }, (err, csv) => {
                        fs.writeFileSync(path.join(__dirname, `../../output/${organization.source}-own.csv`), csv);
                        next();
                    });
                }, next);
            },

            // Removing organizations that aren't swapping
            (next) => {
                this.organizations = _.filter(this.organizations, (organization) => {
                    return organization.swapping;
                });
                next();
            },

            // Assigning eligible organizations to each submission
            (next) => {
                console.log('Finding eligible hashes for each organization');
                // Creating eligibity arrays
                _.each(this.organizations, (organization) => {
                    organization.eligible.free = [];

                    _.each(this.organizations, (otherOrganization) => {
                        if (organization === otherOrganization) {
                            return;
                        }

                        organization.eligible[otherOrganization.source] = [];
                    });
                });

                // Assigning eligiblity to submissions
                _.each(this.submissions.swappableHashes, (submission) => {
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
            // Most common to most rare
            (next) => {
                this.submissions.swappableHashes.sort((a, b) => a.eligible.length - b.eligible.length);

                next();
            },

            // Assigning eligible submissions to organizations
            (next) => {
                console.log('Assigning eligiblity to organizations');
                _.each(this.submissions.swappableHashes, (submission) => {
                    let isFree = submission.sourceObjects.length === 0;

                    _.each(submission.eligible, (organization) => {
                        if (isFree) {
                            organization.eligible.free.push(submission);
                        } else {
                            _.each(submission.sourceObjects, (otherOrganization) => {
                                if (organization === otherOrganization) {
                                    return;
                                }

                                if (!otherOrganization.swapping) {
                                    return;
                                }

                                organization.eligible[otherOrganization.source].push(submission);
                            });
                        }
                    });
                });

                next();
            },

            // Modifying eligibility based on organizational state preference
            (next) => {
                console.log('Modifying eligibility based on organizational state preference');
                _.each(this.organizations, (organization) => {
                    if (!organization.states || organization.states.length === 0) {
                        return;
                    }

                    _.each(organization.eligible, (submissions) => {
                        submissions.sort((submissionA, submissionB) => {
                            let inStateA = +_.includes(organization.states, submissionA.row.state);
                            let inStateB = +_.includes(organization.states, submissionB.row.state);
                            return inStateB - inStateA;
                        });
                    });
                });

                next();
            },

            // Show amount of eligible hashes per organization
            (next) => {
                console.log('Eligible hashes per organization...');
                _.each(this.organizations, (organization) => {
                    let eligible = {};
                    let eligibleInState = {};

                    _.each(organization.eligible, (group) => {
                        _.each(group, (submission) => {
                            eligible[submission.hash] = true;

                            if (organization.states.length > 0 && _.includes(organization.states, submission.row.state)) {
                                eligibleInState[submission.hash] = true;
                            }
                        });
                    });

                    organization.eligibleCount = _.size(eligible);
                    organization.eligibleInStateCount = _.size(eligibleInState);

                    let message = `Eligible hashes for ${organization.source}: `;

                    if (organization.states.length) {
                        message +=
`
Overall: ${organization.eligibleCount}
In-state: ${organization.eligibleInStateCount}
`;
                    } else {
                        message +=
`${organization.eligibleCount}
`;
                    }

                    console.log(message);
                });

                next();
            },

            // Swap
            (next) => {
                this.swap(next);
            },

            // Distributing free submissions
            (next) => {
                this.distributeUnsourcedSubmissions(next);
            },

            // Save
            (next) => {
                let count = this.getSwapCount();
                console.log(`${count} names were swapped!`);

                let summary = this.getSummary();
                fs.writeFileSync(path.join(__dirname, `../../output/summary.csv`), summary);

                console.log('Saving hashes for each organization');
                async.eachSeries(this.organizations, (organization, next) => {
                    let received = _.map(organization.received, submission => submission.row);
                    stringify(received, {
                        header: true,
                        quoted: true,
                    }, (err, csv) => {
                        fs.writeFileSync(path.join(__dirname, `../../output/${organization.source}-swapped.csv`), csv);
                        next();
                    });
                }, next);
            },
        ], next);
    }

    swap(next) {
        console.log('Starting swap');
        async.forever((next) => {
            let success = false;

            let owedOrganizations = this.getSortedListOfOwedOrganizations();

            _.each(owedOrganizations, (owedOrganization) => {
                // Find the best submission
                // Usually this will be the most common submission
                // If a group prefers certain states, that distinction will come first though
                let givingOrganizations = _.without(this.organizations, owedOrganization);
                let bestSubmission;
                let bestSubmissionOwner;
                let bestSubmissionFitness;
                _.each(givingOrganizations, (givingOrganization) => {
                    let submission = owedOrganization.requestSubmission({
                        from: givingOrganization,
                    });

                    let stateFitnessBonus = 0;

                    if (submission && owedOrganization.states) {
                        if (_.includes(owedOrganization.states, submission.row.state)) {
                            stateFitnessBonus = 100;
                        }
                    }

                    if (
                        submission &&
                        (!bestSubmission ||
                            bestSubmissionFitness > submission.eligible.length - stateFitnessBonus
                        )
                    ) {
                        bestSubmission = submission;
                        bestSubmissionOwner = givingOrganization;
                        bestSubmissionFitness = bestSubmission.eligible.length - stateFitnessBonus;
                    }
                });

                if (bestSubmission) {
                    bestSubmissionOwner.giveSubmission({
                        submission: bestSubmission,
                        to: owedOrganization,
                    });

                    success = true;
                }

                // If there was a match, break the loop
                if (success) {
                    return false;
                }
            });

            next(!success);
        }, () => {
            console.log('Trading has completed');
            next();
        });
    }

    distributeUnsourcedSubmissions(next) {
        console.log('Distributing unsourced submissions');
        let organizations = this.getSortedListOfOwedOrganizations();

        async.forever((next) => {
            // Check if every organization has bounced
            if (_.isEmpty(organizations)) {
                next(1);
                return;
            }

            // Find the organization who is the farthest from matching their sourced count
            let organization = _.max(organizations, organization => organization.swappableSourced.length - organization.received.length);

            if (organization.received.length === organization.swappableSourced.length) {
                _.pull(organizations, organization);
                next();
                return;
            }

            let submission = organization.requestSubmission({
                free: true,
            });

            if (!submission) {
                _.pull(organizations, organization);
                next();
                return;
            }

            organization.takeFreeSubmission({
                submission: submission,
            });

            next();
        }, (err) => {
            next();
        });
    }

    getSwapCount() {
        return _.sum(this.organizations, (organization) => {
            return organization.received.length;
        });
    }

    getSummary() {
        let summary = 'Organization,Sourced,Eligible,Received,Percent,(Sourced),(Unsourced)\n';
        _.each(this.organizations, (organization) => {
            let eligibleCount = organization.eligibleCount;
            let name = organization.name;
            let receivedTotal = organization.received.length;
            let sourced = organization.swappableSourced.length;
            let percent = ((receivedTotal / sourced) * 100).toFixed(2);
            let receivedUnsourced = organization.freeCount;
            let receivedSourced = receivedTotal - receivedUnsourced;
            summary += `${name},${sourced},${eligibleCount},${receivedTotal},${percent}%,${receivedSourced},${receivedUnsourced}\n`;
        });

        return summary;
    }

    getSortedListOfOwedOrganizations() {
        return _.filter(this.organizations, (organization) => {
            return (
                organization.swappableSourced.length > organization.received.length
            );
        }).sort((a, b) => {
            // Sort those who've sourced the most first
            return b.swappableSourced.length - a.swappableSourced.length;
        });
    }

}
