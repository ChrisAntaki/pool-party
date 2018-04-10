// Config
const config = require('../config');

// Requirements
const _ = require('lodash');
const async = require('async');
const chalk = require('chalk');
const cordiality = +config.get('cordiality');
const fs = require('fs');
const Organization = require('../organization');
const path = require('path');
const Promise = require('bluebird');
const Submissions = require('../submissions');

// Promises
const stringify = Promise.promisify(require('csv-stringify'));

// Modifications
Organization.prototype.hasSubmissionAvailable = function hasSubmissionAvailable() {
    const indexesToRemove = [];
    const submission = _.find(this.eligible, (submission, index) => {
        if (!this.hashes[submission.hash] && submission.givenCount < cordiality) {
            return true;
        } else {
            indexesToRemove.push(index);
            return false;
        }
    });

    if (indexesToRemove.length > 0) {
        _.pullAt(this.eligible, indexesToRemove);
    }

    return !!submission;
}

Organization.prototype.takeSubmission = function takeSubmission() {
    const submission = this.eligible.shift();
    submission.givenCount++;
    this.hashes[submission.hash] = true;
    this.received.push(submission);
}

// Class
module.exports = class Olympic {

    constructor(params) {
        this.callback = params.callback;
        this.organizations = params.organizations;
        this.submissions = params.submissions;
        this.start();
    }

    start() {
        Promise.try(f => {
            // Modifying organization and submissions objects
            _.each(this.organizations, organization => {
                organization.eligible = [];
                organization.eligibleCount = 0;
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
            const sourceMap = {};

            _.each(this.organizations, organization => {
                _.each(organization.sources, source => {
                    sourceMap[source] = organization;
                });
            });

            _.each(this.submissions.hashes, submission => {
                submission.sourceObjects = [];

                _.each(_.keys(submission.sources), source => {
                    const organization = sourceMap[source];
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
            const sourced = _.map(organization.sourced, submission => submission.row);
            return stringify(sourced, {
                header: true,
                quoted: true,
            }).then(csv => {
                const filename = path.join(__dirname, `../../output/${organization.source}-own.csv`);
                fs.writeFileSync(filename, csv);
            });
        })

        // Removing organizations that aren't swapping
        .then(f => {
            this.organizations = _.filter(this.organizations, organization => organization.swapping);
        })

        // Removing submissions sourced from only non-swapping organizations
        .then(f => {
            this.submissions.swappableHashes = _.filter(this.submissions.swappableHashes, submission => {
                if (submission.sourceObjects.length === 0) {
                    return true;
                }

                return !!_.find(submission.sourceObjects, organization => organization.swapping);
            });
        })

        // Assigning eligible organizations to each submission
        .then(f => {
            // Assigning eligiblity to submissions
            _.each(this.submissions.swappableHashes, submission => {
                _.each(this.organizations, organization => {
                    // Skip suppressed hashes
                    if (organization.hashes[submission.hash]) {
                        return;
                    }

                    // Skip submissions from before the organization joined
                    if (organization.joined > submission.created) {
                        return;
                    }

                    // Used to determine rarity of submission
                    submission.eligible.push(organization);
                });
            });
        })

        // Assigning eligible submissions to organizations
        .then(f => {
            _.each(this.submissions.swappableHashes, submission => {
                _.each(submission.eligible, organization => {
                    organization.eligible.push(submission);
                });
            });
        })

        // Sorting eligible submissions
        .then(f => {
            _.each(this.organizations, organization => {
                this.sortEligibleSubmissionsForOrganization(organization);
            });
        })

        // Show amount of eligible hashes per organization
        .then(f => {
            console.log(`Eligible hashes for...`);
            _.each(this.organizations, organization => {
                const eligible = {};
                const eligibleInState = {};

                _.each(organization.eligible, submission => {
                    eligible[submission.hash] = true;

                    if (organization.states.length > 0 && _.includes(organization.states, submission.row.state)) {
                        eligibleInState[submission.hash] = true;
                    }
                });

                organization.eligibleCount = _.size(eligible);
                organization.eligibleInStateCount = _.size(eligibleInState);

                let message = `- ${chalk.yellow(organization.name)}:\n`;

                if (organization.states.length) {
                    message += `    Geolocated: ${chalk.green(organization.eligibleInStateCount)}\n`;
                }

                message += `    Total: ${chalk.green(organization.eligibleCount)}`;

                console.log(message);
            });
        })

        // Swap
        .then(f => {
            let finish;
            const promise = new Promise((resolve, reject) => {
                finish = resolve;
            });

            const organizations = this.getSortedListOfOwedOrganizations();

            async.forever(next => {
                // Check if every organization has bounced
                if (_.isEmpty(organizations)) {
                    next(1);
                    return;
                }

                let organization = organizations[0];
                if (organization.received.length === organization.swappableSourced.length) {
                    // Remove organization
                    _.pull(organizations, organization);

                    // Sort next organization
                    organization = organizations[0];
                    this.sortEligibleSubmissionsForOrganization(organization);

                    // End iteration
                    next();
                    return;
                }

                // Find next submission
                const submission = organization.hasSubmissionAvailable();

                if (!submission) {
                    _.pull(organizations, organization);
                    next();
                    return;
                }

                organization.takeSubmission();

                next();
            }, err => {
                finish();
            });

            return promise;
        })

        // Save summary
        .then(f => {
            const filename = path.join(__dirname, `../../output/summary.csv`);
            let summary = 'Organization,Sourced,Eligible,Received,Percent\n';
            _.each(this.organizations, organization => {
                const eligibleCount = organization.eligibleCount;
                const name = organization.name;
                const receivedTotal = organization.received.length;
                const sourced = organization.swappableSourced.length;
                const percent = ((receivedTotal / sourced) * 100).toFixed(2);
                summary += `${name},${sourced},${eligibleCount},${receivedTotal},${percent}%\n`;
            });
            fs.writeFileSync(filename, summary);
        })

        // Save organization files
        .then(f => this.organizations)
        .each(organization => {
            const received = _.map(organization.received, submission => submission.row);
            return stringify(received, {
                header: true,
                quoted: true,
            }).then(csv => {
                const filename = path.join(__dirname, `../../output/${organization.source}-swapped.csv`);
                fs.writeFileSync(filename, csv);
            });
        })

        // Finish
        .then(f => {
            const count = _.sumBy(this.organizations, organization => {
                return organization.received.length;
            });
            console.log(`Finished. In total, ${chalk.green(count)} names were swapped.`);
        });
    }

    getSortedListOfOwedOrganizations() {
        return _.filter(this.organizations, organization => {
            return (
                organization.swappableSourced.length > organization.received.length
            );
        }).sort((a, b) => {
            // Sort organizations with a higher sourced/eligible ratio earlier
            const ratioA = a.swappableSourced.length / a.eligibleCount;
            const ratioB = b.swappableSourced.length / b.eligibleCount;
            return ratioB - ratioA;
        });
    }

    sortEligibleSubmissionsForOrganization(organization) {
        if (!organization) {
            return;
        }

        const sortingByState = (organization.states && organization.states.length > 0);

        organization.eligible.sort((submissionA, submissionB) => {
            // Sorting less-swapped names earlier
            if (submissionA.givenCount !== submissionB.givenCount) {
                return submissionA.givenCount - submissionB.givenCount;
            }

            // Sorting names in preferred states earlier
            if (sortingByState) {
                const inStateA = +_.includes(organization.states, submissionA.row.state);
                const inStateB = +_.includes(organization.states, submissionB.row.state);

                if (inStateA !== inStateB) {
                    return inStateB - inStateA;
                }
            }

            // Sorting well-known names earlier
            if (submissionA.eligible.length !== submissionB.eligible.length) {
                return submissionA.eligible.length - submissionB.eligible.length;
            }

            return 0;
        });
    }
}
