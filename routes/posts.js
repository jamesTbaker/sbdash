
// ----- PULL IN MODULES, GET EXPRESS ROUTER

const express = require('express');
const posts = require('../modules/posts');

const router = express.Router();

// ----- CONFIG EXPRESS ROUTER

// GET ---

router.get('/', (req, res, next) => {
	posts.Post()
		.then((result) => { res.json(result); })
		.catch((error) => { res.json(error); });
});

// ----- EXPORT EXPRESS ROUTER

module.exports = router;
