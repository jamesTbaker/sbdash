
/*********************************************************************
	PULL IN MODULES
*********************************************************************/

// use the "dbQueries" module; this allows us to use some standardized and convenient query methods
const dbQueries = require('./dbQueries');
// use the "utilities" neso module; this allows us to use some date and time functions
const utilities = require('./utilities');
// use the "settings" module; this allows us to get system-wide settings
const settings = require('./settings');
// use the "moment" and "moment-holiday" modules; these help with date and time stuff
const moment = require('moment');
const momentHoliday = require('moment-holiday');



/*********************************************************************
	DEFINE SETTINGS FUNCTIONS
*********************************************************************/

module.exports = {

	"ReturnNowLocalDateTimeUTCFormat": () => utilities.ReturnFormattedDateTime({ "dateTimeString": "nowLocal" }),

	"ReturnCurrentLocalTimezoneOffset": () => moment(module.exports.ReturnNowLocalDateTimeUTCFormat()).format("Z"),

	"ReturnTodayLocalUTCFormat": () => utilities.ReturnFormattedDateTime({ "dateTimeString": "nowLocal", "returnFormat": "YYYY-MM-DD" }),

	"ReturnThisYearFourDigits": () => utilities.ReturnFormattedDateTime({ "dateTimeString": "nowLocal", "returnFormat": "YYYY" }),

	"ReturnStartOfTurkeyDayLocalUTCFormat": () => momentHoliday().holiday('Thanksgiving Day').format(),

	"ReturnEndOfTurkeyDayLocalUTCFormat": () => moment(module.exports.ReturnStartOfTurkeyDayLocalUTCFormat()).add(23, "hours").add(59, "minutes").format(),

	"ReturnDayAfterTurkeyDayLocalUTCFormat": () => moment(module.exports.ReturnStartOfTurkeyDayLocalUTCFormat()).add(24, "hours").format(),

	"ReturnCurrentPostSchedulingSeason": () => {
		// return a new promise
		return new Promise(function (resolve, reject) {
			// get the current local time in UTC format
			const nowLocal = module.exports.ReturnNowLocalDateTimeUTCFormat();
			// get the current year to use in constructing times
			var thisYear = module.exports.ReturnThisYearFourDigits();
			// get the relevant datetimes for Thanksgiving this year
			var startOfTurkeyDay = module.exports.ReturnStartOfTurkeyDayLocalUTCFormat();
			var endOfTurkeyDay = module.exports.ReturnEndOfTurkeyDayLocalUTCFormat();
			var dayAfterTurkeyDay = module.exports.ReturnDayAfterTurkeyDayLocalUTCFormat();
			// get a promise to get post scheduling settings from db
			settings.ReturnPostSchedulingSettings()
			// if the promise is resolved with the settings
			.then(function (postSchedulingSettings) {
				// iterate over the seasonal settings
				for (const { name, friendlyName, seasonStartDateTime, seasonEndDateTime } of postSchedulingSettings.postScheduling.seasonal) {
					// get the season's start and end datetimes
					let thisSeasonStartDateTime = '';
					let thisSeasonEndDateTime = '';
					if (seasonStartDateTime === "endOfTurkeyDay") {
						thisSeasonStartDateTime = endOfTurkeyDay;
					} else if (seasonStartDateTime === "dayAfterTurkeyDay") {
						thisSeasonStartDateTime = dayAfterTurkeyDay;
					} else {
						thisSeasonStartDateTime = moment(thisYear + "-" + seasonStartDateTime + ":00" + module.exports.ReturnCurrentLocalTimezoneOffset());
					}
					if (seasonEndDateTime === "endOfTurkeyDay") {
						thisSeasonEndDateTime = endOfTurkeyDay;
					} else if (seasonEndDateTime === "dayAfterTurkeyDay") {
						thisSeasonEndDateTime = dayAfterTurkeyDay;
					} else {
						thisSeasonEndDateTime = moment(thisYear + "-" + seasonEndDateTime + ":00" + module.exports.ReturnCurrentLocalTimezoneOffset());
					}
					// if the current datetime is between this season's start and end datetime
					if (moment(nowLocal).isBetween(thisSeasonStartDateTime, thisSeasonEndDateTime)) {
						// resolve this promise with this season
						resolve({ name, friendlyName, seasonStartDateTime, seasonEndDateTime });
					}
				}
			})
			// if the promise is rejected with an error, reject this promise with the error
			.catch(function (error) { reject(error) });
		});
	},

	"ReturnNowIsInsidePostingWindow": () => {
		// return a new promise
		return new Promise(function (resolve, reject) {
			// get the current local time in UTC format
			var nowLocal = module.exports.ReturnNowLocalDateTimeUTCFormat();
			// get the current date to use in constructing times
			var today = module.exports.ReturnTodayLocalUTCFormat();
			// get a promise to get post scheduling settings from db
			settings.ReturnPostSchedulingSettings()
				// if the promise is resolved with the settings
				.then(function (postSchedulingSettings) {
					// get datetime for start and end of posting window
					const postingWindowStartDateTime = moment(today + "T" + postSchedulingSettings.postScheduling.daily.dayStartTime).format();
					const postingWindowEndDateTime = moment(today + "T" + postSchedulingSettings.postScheduling.daily.dayEndTime).format();
					// resolve this promise with evaluation of statement that nowLocal is between posting window start and end datetimes
					resolve(moment(nowLocal).isBetween(postingWindowStartDateTime, postingWindowEndDateTime));
				})
				// if the promise is rejected with an error
				.catch(function (error) {
					// reject this promise with the error
					reject(error);
				});
		});
	},
	
	"UpdateTimeOfLastPosting": () => {
		// return a new promise
		return new Promise(function (resolve, reject) {
			// get the current local time in UTC format
			var nowLocal = module.exports.ReturnNowLocalDateTimeUTCFormat();
			// get a promise to retrieve the first document from the lastPostDateTime document collection
			dbQueries.ReturnFirstDocFromCollection('lastPostDateTime')
			// if the promise is resolved with the docs, then resolve this promise with the docs
			.then(function (lastPostDateTimeDoc) {
				// get a promise to overwrite the single document in the lastPostDateTime document collection
				dbQueries.OverwriteDocInCollection(lastPostDateTimeDoc.docs._id, { 'datetime': nowLocal }, 'lastPostDateTime')
				// if the promise is resolved with the docs, then resolve this promise with the docs
				.then(function (result) { resolve(result) })
				// if the promise is rejected with an error, then reject this promise with an error
				.catch(function (error) { reject(error) });
			})
			// if the promise is rejected with an error, then reject this promise with an error
			.catch(function (error) { reject(error) });
		});
	},

	"ReturnQuantityOfPostsReadyThisSeason": () => {
		// return a new promise
		return new Promise(function (resolve, reject) {
			// get a promise to return the current season
			module.exports.ReturnCurrentPostSchedulingSeason()
			// if the promise is resolved with the current season
			.then(function (currentPostSchedulingSeason) {
				// get a promise to retrieve all posts for the current season that aren't marked as posted
				dbQueries.ReturnAllSpecifiedDocsFromCollection("posts", { $and: [ { "season": currentPostSchedulingSeason.name }, { "posted": { $ne: true } }] }, {} )
				// if the promise is resolved with the posts
				.then(function (posts) {
					// resolve this promise with the quantity of the posts
					resolve(posts.docs.length) 
				})
				// if the promise is rejected with an error, then reject this promise with an error
				.catch(function (error) { reject(error) });
			})
			// if the promise is rejected with an error, then reject this promise with an error
			.catch(function (error) { reject(error) });
		});
	},

	"ReturnLongEnoughSinceLastPost": () => {
		// return a new promise
		return new Promise(function (resolve, reject) {
			// get a promise to get post scheduling settings from db
			settings.ReturnPostSchedulingSettings()
			// if the promise is resolved with the settings
			.then(function (postSchedulingSettings) {
				// get a promise to get post scheduling settings from db
				module.exports.ReturnCurrentPostSchedulingSeason()
				// if the promise is resolved with the settings
				.then(function (currentPostSchedulingSeasonResults) {
					// get a promise to retrieve the first document from the lastPostDateTime document collection
					dbQueries.ReturnFirstDocFromCollection('lastPostDateTime')
					// if the promise is resolved with the document
					.then(function (lastPostDateTimeResult) {                    
						// get a promise to retrieve the quantity of posts ready for posting this season
						module.exports.ReturnQuantityOfPostsReadyThisSeason()
						// if the promise is resolved with the quantity
						.then(function (quantityOfPostsReadyThisSeason) {
							// set up basic vars and do some calculations
							const today = module.exports.ReturnTodayLocalUTCFormat();
							const thisYear = module.exports.ReturnThisYearFourDigits();
							const dailyPostSchedulingSettings = postSchedulingSettings.postScheduling.daily;
							const seasonalPostSchedulingSettings = postSchedulingSettings.postScheduling.seasonal;
							const nowLocal = module.exports.ReturnNowLocalDateTimeUTCFormat();
							const currentPostSchedulingSeasonName = currentPostSchedulingSeasonResults.name;
							const lastPostDateTime = lastPostDateTimeResult.docs.datetime;
							const postingWindowStartDateTime = moment(today + "T" + dailyPostSchedulingSettings.dayStartTime);
							const postingWindowEndDateTime = moment(today + "T" + dailyPostSchedulingSettings.dayEndTime);
							const minutesInPostingWindow = postingWindowEndDateTime.diff(postingWindowStartDateTime, 'minutes');
							const endDateThisPostSchedulingSeason = thisYear + "-" + currentPostSchedulingSeasonResults.seasonEndDateTime + ":00" + module.exports.ReturnCurrentLocalTimezoneOffset();
							const quantityDaysLeftInThisPostSchedulingSeason = moment(endDateThisPostSchedulingSeason).diff(moment(today), 'days') + 1; // the +1 is today
							const quantityOfPostsReadyThisSeasonPerDaysLeftInThisPostSchedulingSeason = quantityOfPostsReadyThisSeason / quantityDaysLeftInThisPostSchedulingSeason;
							let quantityOfPostsPerDay = dailyPostSchedulingSettings.minimumQuantityOfPostsPerDay;
							// if the number of posts remaining for this season  relative to the number of days remaining in the season is more than the minimum number of posts per day
							if (quantityOfPostsReadyThisSeasonPerDaysLeftInThisPostSchedulingSeason != null && quantityOfPostsReadyThisSeasonPerDaysLeftInThisPostSchedulingSeason > dailyPostSchedulingSettings.minimumQuantityOfPostsPerDay) {
								// use the higher number of posts per day
								quantityOfPostsPerDay = quantityOfPostsReadyThisSeasonPerDaysLeftInThisPostSchedulingSeason;
							}
							const minutesBetweenPosts = Math.ceil(minutesInPostingWindow / quantityOfPostsPerDay);
							const nextPostDateTime = moment(lastPostDateTime).add(minutesBetweenPosts, 'minutes').format();
							// if it's later than nextPostDateTime
							if (moment(nowLocal).isAfter(nextPostDateTime)) {
								// resolve this promise with true
								resolve (true);
							// if it's NOT later than nextPostDateTime
							} else {
								// resolve this promise with false
								resolve(false);
							}
						})
						// if the promise is rejected with an error, then reject this promise with the error
						.catch(function (error) { reject(error); });
					})
					// if the promise is rejected with an error, then reject this promise with the error
					.catch(function (error) { reject(error); });
				})
				// if the promise is rejected with an error, then reject this promise with the error
				.catch(function (error) { reject(error); });
			})
			// if the promise is rejected with an error, then reject this promise with the error
			.catch(function (error) { reject(error); });
		});
	}
};