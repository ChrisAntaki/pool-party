// Config
var config = require('../config');

// Requirements
var _ = require('lodash');
var async = require('async');
var chalk = require('chalk');
var cordiality = +config.get('cordiality');
var fs = require('fs');
var Organization = require('../Organization');
var path = require('path');
var Promise = require('bluebird');
var Submissions = require('../Submissions');

// Promises
var stringify = Promise.promisify(require('csv-stringify'));

// Modifications
Organization.prototype.requestSubmission = function requestSubmission(params) {
    var eligible = params.free ? this.eligible.free : this.eligible[params.from.source];
    var lostIndexes = [];
    var submission = _.find(eligible, (submission, index) => {
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
    var submission = params.submission;
    params.to.hashes[submission.hash] = true;
    params.to.eligible[this.source].shift();
    params.to.received.push(submission);
    submission.givenCount++;
    this.givenCount++;
}

Organization.prototype.takeFreeSubmission = function takeFreeSubmission(params) {
    var submission = params.submission;
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

    start() {
        Promise.resolve('everything')
        .then(f => {
            // Modifying organization and submissions objects
            _.each(this.organizations, organization => {
                organization.eligible = {};
                organization.eligibleCount = 0;
                organization.freeCount = 0;
                organization.givenCount = 0;
                organization.received = [];
                organization.source = organization.sources[0];
                organization.sourced = [];
                organization.states = organization.states || [];
                organization.swappableSourced = [];
            });

            _.each(this.submissions.hashes, submission => {
                // Used to determine rarity of submission
                submission.eligible = [];
                submission.givenCount = 0;
            });
        })

        // Assigning submissions to organizations
        .then(f => {
            var sourceMap = {};

            _.each(this.organizations, organization => {
                _.each(organization.sources, source => {
                    sourceMap[source] = organization;
                });
            });

            _.each(this.submissions.hashes, submission => {
                submission.sourceObjects = [];

                _.each(_.keys(submission.sources), source => {
                    var organization = sourceMap[source];
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
        })

        // Remove duplicates
        .then(f => {
            _.each(this.submissions.hashes, submission => {
                submission.sourceObjects = _.uniq(submission.sourceObjects);
            });

            _.each(this.organizations, organization => {
                organization.sourced = _.uniq(organization.sourced);
                organization.swappableSourced = _.uniq(organization.swappableSourced);
            });
        })

        // Saving sourced signatures
        .then(f => this.organizations)
        .each(organization => {
            var sourced = _.map(organization.sourced, submission => submission.row);
            return stringify(sourced, {
                header: true,
                quoted: true,
            }).then(csv => {
                var filename = path.join(__dirname, `../../output/${organization.source}-own.csv`);
                fs.writeFileSync(filename, csv);
            });
        })

        // Removing organizations that aren't swapping
        .then(f => {
            this.organizations = _.filter(this.organizations, organization => organization.swapping);
        })

        // Assigning eligible organizations to each submission
        .then(f => {
            // Creating eligibity arrays
            _.each(this.organizations, organization => {
                organization.eligible.free = [];

                _.each(this.organizations, otherOrganization => {
                    if (organization === otherOrganization) {
                        return;
                    }

                    organization.eligible[otherOrganization.source] = [];
                });
            });

            // Assigning eligiblity to submissions
            _.each(this.submissions.swappableHashes, submission => {
                _.each(this.organizations, organization => {
                    // Skip suppressed hashes
                    if (organization.hashes[submission.hash]) {
                        return;
                    }

                    // Used to determine rarity of submission
                    submission.eligible.push(organization);
                });
            });
        })

        // Sort submissions by eligibility
        // Most common to most rare
        .then(f => {
            this.submissions.swappableHashes.sort((a, b) => a.eligible.length - b.eligible.length);
        })

        // Assigning eligible submissions to organizations
        .then(f => {
            _.each(this.submissions.swappableHashes, submission => {
                var isFree = submission.sourceObjects.length === 0;

                _.each(submission.eligible, organization => {
                    if (isFree) {
                        organization.eligible.free.push(submission);
                    } else {
                        _.each(submission.sourceObjects, otherOrganization => {
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
        })

        // Modifying eligibility based on organizational state preference
        .then(f => {
            _.each(this.organizations, organization => {
                if (!organization.states || organization.states.length === 0) {
                    return;
                }

                _.each(organization.eligible, submissions => {
                    submissions.sort((submissionA, submissionB) => {
                        var inStateA = +_.includes(organization.states, submissionA.row.state);
                        var inStateB = +_.includes(organization.states, submissionB.row.state);
                        return inStateB - inStateA;
                    });
                });
            });
        })

        // Show amount of eligible hashes per organization
        .then(f => {
            console.log(`Eligible hashes for...`);
            _.each(this.organizations, organization => {
                var eligible = {};
                var eligibleInState = {};

                _.each(organization.eligible, group => {
                    _.each(group, submission => {
                        eligible[submission.hash] = true;

                        if (organization.states.length > 0 && _.includes(organization.states, submission.row.state)) {
                            eligibleInState[submission.hash] = true;
                        }
                    });
                });

                organization.eligibleCount = _.size(eligible);
                organization.eligibleInStateCount = _.size(eligibleInState);

                var message = `- ${chalk.blue(organization.name)}:\n`;

                if (organization.states.length) {
                    message += `    Geolocated: ${chalk.green(organization.eligibleInStateCount)}\n`;
                }

                message += `    Total: ${chalk.green(organization.eligibleCount)}`;

                console.log(message);
            });
        })

        // Swap
        .then(f => this.swap())

        // Distributing free submissions
        .then(f => this.distributeUnsourcedSubmissions())

        // Save summary
        .then(f => {
            var filename = path.join(__dirname, `../../output/summary.csv`);
            var summary = this.getSummary();
            fs.writeFileSync(filename, summary);
        })

        // Save organization files
        .then(f => this.organizations)
        .each(organization => {
            var received = _.map(organization.received, submission => submission.row);
            return stringify(received, {
                header: true,
                quoted: true,
            }).then(csv => {
                var filename = path.join(__dirname, `../../output/${organization.source}-swapped.csv`);
                fs.writeFileSync(filename, csv);
            });
        })

        // Finish
        .then(f => {
            var count = this.getSwapCount();
            console.log(`Finished. In total, ${chalk.green(count)} names were swapped.`);
        });
    }

    swap() {
        var finish;
        var promise = new Promise((resolve, reject) => {
            finish = resolve;
        });

        console.log('Starting swap...');
        async.forever(next => {
            var success = false;

            var owedOrganizations = this.getSortedListOfOwedOrganizations();

            _.each(owedOrganizations, owedOrganization => {
                // Find the best submission
                // Usually this will be the most common submission
                // If a group prefers certain states, that distinction will come first though
                var givingOrganizations = _.without(this.organizations, owedOrganization);
                var bestSubmission;
                var bestSubmissionOwner;
                var bestSubmissionFitness;
                _.each(givingOrganizations, givingOrganization => {
                    var submission = owedOrganization.requestSubmission({
                        from: givingOrganization,
                    });

                    var stateFitnessBonus = 0;

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
        }, err => {
            finish();
        });

        return promise;
    }

    distributeUnsourcedSubmissions() {
        var finish;
        var promise = new Promise((resolve, reject) => {
            finish = resolve;
        });

        var organizations = this.getSortedListOfOwedOrganizations();

        async.forever(next => {
            // Check if every organization has bounced
            if (_.isEmpty(organizations)) {
                next(1);
                return;
            }

            // Find the organization who is the farthest from matching their sourced count
            var organization = _.max(organizations, organization => organization.swappableSourced.length - organization.received.length);

            if (organization.received.length === organization.swappableSourced.length) {
                _.pull(organizations, organization);
                next();
                return;
            }

            var submission = organization.requestSubmission({
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
        }, err => {
            finish();
        });

        return promise;
    }

    getSwapCount() {
        return _.sumBy(this.organizations, organization => {
            return organization.received.length;
        });
    }

    getSummary() {
        var summary = 'Organization,Sourced,Eligible,Received,Percent,(Sourced),(Unsourced)\n';
        _.each(this.organizations, organization => {
            var eligibleCount = organization.eligibleCount;
            var name = organization.name;
            var receivedTotal = organization.received.length;
            var sourced = organization.swappableSourced.length;
            var percent = ((receivedTotal / sourced) * 100).toFixed(2);
            var receivedUnsourced = organization.freeCount;
            var receivedSourced = receivedTotal - receivedUnsourced;
            summary += `${name},${sourced},${eligibleCount},${receivedTotal},${percent}%,${receivedSourced},${receivedUnsourced}\n`;
        });

        return summary;
    }

    getSortedListOfOwedOrganizations() {
        return _.filter(this.organizations, organization => {
            return (
                organization.swappableSourced.length > organization.received.length
            );
        }).sort((a, b) => {
            // Sort those who've sourced the most first
            return b.swappableSourced.length - a.swappableSourced.length;
        });
    }

}
