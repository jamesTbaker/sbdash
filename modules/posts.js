
/*********************************************************************
	PULL IN MODULES
*********************************************************************/

// use the "dbQueries" module; this allows us to use some standardized and convenient query methods
const dbQueries = require('./dbQueries');
// use the "utilities" neso module; this allows us to use some misc utility functions
// const utilities = require('./utilities');
// use the "settings" module; this allows us to get system-wide settings
const settings = require('./settings');
// use the "datesTimes" module; this allows us to use functions that help with date and time stuff
const datesTimes = require('./datesTimes');
// use the "tumblr" module; this allows us to use the Tumblr API
const tumblr = require('tumblr.js');



/*********************************************************************
	DEFINE SETTINGS FUNCTIONS
*********************************************************************/

module.exports = {

	"UpdatePostPostedProperty": (post) => {
		// overwrite property in the in-memory post
		post.posted = true;
		// get a promise to overwrite the post in db, but don't wait for resolution
		dbQueries.OverwriteDocInCollection(post._id, post, "posts");
	},

	"IncreasePostErrorQuantity": (post) => {
		// extract the actual post data for convenience
		post = post["docs"][0];
		// get qty times this post has been involved in a posting error
		let postErrorQuantity = 0;
		if (typeof (post.postErrorQuantity) != "undefined") {
			postErrorQuantity = post.postErrorQuantity;
		}
		// incrment error quantity and store back to in-memory post
		post.postErrorQuantity = postErrorQuantity + 1;
		// get a promise to overwrite the post in db, but don't wait for resolution
		dbQueries.OverwriteDocInCollection(post._id, post, "posts");
	},

	"DeletePost": (post) => {
		// get a promise to delete the post in db, but don't wait for resolution
		dbQueries.DeleteDocFromCollection(post._id, "posts");
	},

	"ReturnTumblrReblogParameters": (tumblrSettings, postInfo) => {
		postInfo = postInfo["docs"][0];
		// set up basic params
		const tumblrReblogParameters = {
			"id": postInfo.tumblrID,
			"reblog_key": postInfo.tumblrReblogKey
		};
		if (typeof (postInfo.tags) !== "undefined" && postInfo.tags != "") {
			tumblrReblogParameters.tags = tumblrSettings.tumblr.defaultTags + ", " + postInfo.tags;
		} else {
			tumblrReblogParameters.tags = tumblrSettings.tumblr.defaultTags;
		}
		if (typeof (postInfo.addedCaption) !== "undefined" && postInfo.addedCaption != "") {
			tumblrReblogParameters.comment = postInfo.addedCaption;
		}
		return tumblrReblogParameters;
	},

	"PostToTumblr": () => {
		// return a new promise
		return new Promise(function (resolve, reject) {
			// get a promise to get post scheduling settings from db
			settings.ReturnTumblrSettings()
            // if the promise is resolved with the settings
			.then(function (tumblrSettings) {
				// get a promise to get current post scheduling season info
				datesTimes.ReturnCurrentPostSchedulingSeason()
				// if the promise is resolved with the season info
				.then(function (currentPostSchedulingSeasonInfo) {
					// get a promise to get a post from the database
					dbQueries.ReturnOneRandomSampleFromSpecifiedDocsFromCollection("posts", { $and: [{ "season": currentPostSchedulingSeasonInfo.name }, { "posted": { $ne: true } }] })
					// if the promise is resolved with the post info
					.then(function (postInfo) {
						// create a Tumblr client
						const tumblrClient = tumblr.createClient({
							consumer_key: tumblrSettings.tumblr.consumerKey,
							consumer_secret: tumblrSettings.tumblr.consumerSecret,
							token: tumblrSettings.tumblr.oauthToken,
							token_secret: tumblrSettings.tumblr.oauthTokenSecret
						});
						// create an object of reblog parameters from postInfo
						const tumblrReblogParameters = module.exports.ReturnTumblrReblogParameters(tumblrSettings, postInfo);
						// attempt to post
						tumblrClient.reblogPost(tumblrSettings.tumblr.blogName, tumblrReblogParameters, function (tumblrResponse) {
							// if Tumblr didn't return an error, resolve this promise with a message
							if (typeof (tumblrResponse) != "undefined" && tumblrResponse == null && !(tumblrResponse instanceof Error)) { resolve({ 'error': false, "post": postInfo }) }
							// if Tumblr returned an error, reject this promise with a message
							else { reject({ 'error': true, "tumblrError": tumblrResponse, "post": postInfo }) }
						});
					})
					// if the promise is rejected with an error, reject this promise with the error
					.catch(function (error) { reject(error) });
				})
				// if the promise is rejected with an error, reject this promise with the error
				.catch(function (error) { reject(error) });
            })
            // if the promise is rejected with an error, reject this promise with the error
            .catch(function (error) { reject(error) });
		});
	},

	"Post": () => {
		// return a new promise
		return new Promise(function (resolve, reject) {
			// get a promise to retrieve flag indicating whether it's been long enough since the last post (true) or not (false)
			datesTimes.ReturnLongEnoughSinceLastPost()
			// if the promise is resolved with the flag
			.then(function (longEnoughSinceLastPost) { 
				// get a promise to retrieve flag indicating whether it's inside the posting window (true) or not (false)
				datesTimes.ReturnNowIsInsidePostingWindow()
				// if the promise is resolved with the flag
				.then(function (nowIsInsidePostingWindow) {
					// if it's inside the posting window and it's been long enough since the last post
					if (longEnoughSinceLastPost && nowIsInsidePostingWindow) {
						// get a promise to try to post to Tumblr
						module.exports.PostToTumblr()
						// if the promise is resolved with a success message
						.then(function (result) {
							// mark the post as posted
							module.exports.UpdatePostPostedProperty(result["post"]["docs"][0]);
							// update the last posted time
							datesTimes.UpdateTimeOfLastPosting();
							// resolve this promise with the PostToTumblr result
							resolve(result);
						})
						// if the promise is rejected with an error, then reject this promise with an error
						.catch(function (error) { 
							// get qty times this post has been involved in a posting error
							let postErrorQuantity = 0;
							if (typeof (error["post"]["docs"][0]["postErrorQuantity"]) != "undefined") {
								postErrorQuantity = error["post"]["docs"][0]["postErrorQuantity"];
							}
							// if there have been 3+ errors (including this one)
							if (postErrorQuantity >= 2) {
								// delete the post
								module.exports.DeletePost(error["post"]["docs"][0]);
							// if post's error qty < 2 (i.e., if there have been less than 3 errors)
							} else {
								// increase postErrorQuantity
								module.exports.IncreasePostErrorQuantity(error["post"]);
							}
							reject(error)
						});
					} else {
						resolve({"error": false, "message": "Not inside posting window OR not long enough since last post"})
					}
				})
				// if the promise is rejected with an error, then reject this promise with an error
				.catch(function (error) { reject(error) });
			})
			// if the promise is rejected with an error, then reject this promise with an error
			.catch(function (error) { reject(error) });
		});
	}
};