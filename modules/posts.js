
// ----- PULL IN MODULES

const dbQueries = require('./dbQueries');
const settings = require('./settings');
const datesTimes = require('./datesTimes');
const tumblr = require('tumblr.js');

// ----- DEFINE SETTINGS FUNCTIONS

module.exports = {

	UpdatePostPostedProperty: (post) => {
		// overwrite property of copy of the in-memory post
		const postToUse = post;
		postToUse.posted = true;
		// get a promise to overwrite the post in db, but don't wait for resolution
		dbQueries.OverwriteDocInCollection(postToUse._id, postToUse, 'posts');
	},

	IncreasePostErrorQuantity: (post) => {
		// copy / extract the actual post data for convenience
		const postDataToUse = post.docs[0];
		// get qty times this post has been involved in a posting error
		let postErrorQuantity = 0;
		if (typeof (postDataToUse.postErrorQuantity) !== 'undefined') {
			postErrorQuantity = { postErrorQuantity };
		}
		// incrment error quantity and store back to in-memory post
		postDataToUse.postErrorQuantity = postErrorQuantity + 1;
		// get a promise to overwrite the post in db, but don't wait for resolution
		dbQueries.OverwriteDocInCollection(postDataToUse._id, postDataToUse, 'posts');
	},

	DeletePost: (post) => {
		// get a promise to delete the post in db, but don't wait for resolution
		dbQueries.DeleteDocFromCollection(post._id, 'posts');
	},

	ReturnTumblrReblogParameters: (tumblrSettings, post) => {
		// copy / extract the actual post data for convenience
		const postDataToUse = post.docs[0];
		// set up basic params
		const tumblrReblogParameters = {
			id: postDataToUse.tumblrID,
			reblog_key: postDataToUse.tumblrReblogKey,
		};
		if (typeof (postDataToUse.tags) !== 'undefined' && postDataToUse.tags !== '') {
			tumblrReblogParameters.tags = `${tumblrSettings.tumblr.defaultTags}, ${postDataToUse.tags}`;
		} else {
			tumblrReblogParameters.tags = tumblrSettings.tumblr.defaultTags;
		}
		if (typeof (postDataToUse.addedCaption) !== 'undefined' && postDataToUse.addedCaption !== '') {
			tumblrReblogParameters.comment = postDataToUse.addedCaption;
		}
		return tumblrReblogParameters;
	},

	PostToTumblr: () =>
		// return a new promise
		new Promise(((resolve, reject) => {			
			// get promise to get tumblr settings
			const getTumblrSettings = settings.ReturnTumblrSettings()
				// if the promise is rejected with an error, reject this promise with the error
				.catch((error) => { reject(error); });
			// get a promise to get current post scheduling season info
			const getCurrentPostSchedulingSeasonInfo = datesTimes.ReturnCurrentPostSchedulingSeason()
				// if the promise is rejected with an error, reject this promise with the error
				.catch((error) => { reject(error); });
			// when those promises have resolved
			Promise.all([getTumblrSettings, getCurrentPostSchedulingSeasonInfo])
				.then((results) => {
					// extract results
					const [tumblrSettings, currentPostSchedulingSeasonInfo] = results;
					// if successful retrieving tumblrSettings and currentPostSchedulingSeasonInfo
					if (typeof (tumblrSettings) !== 'undefined' && typeof (currentPostSchedulingSeasonInfo) !== 'undefined') {
						// get a promise to get a post from the database
						dbQueries.ReturnOneRandomSampleFromSpecifiedDocsFromCollection('posts', { $and: [{ season: currentPostSchedulingSeasonInfo.name }, { posted: { $ne: true } }] })
							// if the promise is resolved with the post info
							.then((postInfo) => {
								// create a Tumblr client
								const tumblrClient = tumblr.createClient({
									consumer_key: tumblrSettings.tumblr.consumerKey,
									consumer_secret: tumblrSettings.tumblr.consumerSecret,
									token: tumblrSettings.tumblr.oauthToken,
									token_secret: tumblrSettings.tumblr.oauthTokenSecret,
								});
								// create an object of reblog parameters from postInfo
								const tumblrReblogParameters =
									module.exports.ReturnTumblrReblogParameters(tumblrSettings, postInfo);
								// attempt to post
								tumblrClient
									.reblogPost(
										tumblrSettings.tumblr.blogName,
										tumblrReblogParameters,
										(tumblrResponse) => {
											// if Tumblr didn't return an error, resolve this promise with a message
											if (typeof (tumblrResponse) !== 'undefined'
												&& tumblrResponse == null
												&& !(tumblrResponse instanceof Error)) {
												resolve({ error: false, post: postInfo });
											// if Tumblr returned an error, reject this promise with a message
											} else {
												const tumblrError = {
													error: true,
													tumblrError: tumblrResponse,
													post: postInfo,
												};
												reject(tumblrError);
											}
										} // eslint-disable-line comma-dangle
									);
							})
							// if the promise is rejected with an error, reject this promise with the error
							.catch((error) => { reject(error); });
					// if either tumblrSettings or currentPostSchedulingSeasonInfo is undefined
					} else {
						// resolve with an error message
						resolve({ error: true, message: 'Unable to retrieve either tumblrSettings or currentPostSchedulingSeasonInfo' });
					}
				})
				// if the promise is rejected with an error, reject this promise with the error
				.catch((error) => { reject(error); });
		})),
	

	Post: () =>
		// return a new promise
		new Promise(((resolve, reject) => {
			// get a promise to retrieve flag indicating it's been long enough since the last post
			const getLongEnoughSinceLastPost = datesTimes.ReturnLongEnoughSinceLastPost()
				// if the promise is rejected with an error, reject this promise with the error
				.catch((error) => { reject(error); });
			// get a promise to retrieve flag indicating it's inside the posting window
			const getNowIsInsidePostingWindow = datesTimes.ReturnNowIsInsidePostingWindow()
				// if the promise is rejected with an error, reject this promise with the error
				.catch((error) => { reject(error); });
			// when those promises have resolved
			Promise.all([getLongEnoughSinceLastPost, getNowIsInsidePostingWindow])
				.then((results) => {
					// extract results
					const [longEnoughSinceLastPost, nowIsInsidePostingWindow] = results;
					// if it's inside the posting window and it's been long enough since the last post
					if (longEnoughSinceLastPost && nowIsInsidePostingWindow) {
						// get a promise to try to post to Tumblr
						module.exports.PostToTumblr()
							// if the promise is resolved with a success message
							.then((result) => {
								// mark the post as posted
								module.exports.UpdatePostPostedProperty(result.post.docs[0]);
								// update the last posted time
								datesTimes.UpdateTimeOfLastPosting();
								// resolve this promise with the PostToTumblr result
								resolve(result);
							})
							// if the promise is rejected with an error, then reject this promise with an error
							.catch((error) => {
								// get qty times this post has been involved in a posting error
								let postErrorQuantity = 0;
								if (typeof (error.post.docs[0].postErrorQuantity) !== 'undefined') {
									postErrorQuantity = { postErrorQuantity };
								}
								// if there have been 3+ errors (including this one)
								if (postErrorQuantity >= 2) {
									// delete the post
									module.exports.DeletePost(error.post.docs[0]);
									// if post's error qty < 2 (i.e., if there have been less than 3 errors)
								} else {
									// increase postErrorQuantity
									module.exports.IncreasePostErrorQuantity(error.post);
								}
								reject(error);
							});
					} else {
						resolve({ error: false, message: 'Not inside posting window OR not long enough since last post' });
					}
				})
				// if the promise is rejected with an error, then reject this promise with an error
				.catch((error) => { reject(error); });
		})),
};
