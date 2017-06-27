const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const utils = require("./passport-utils");
// Load user model
const User = require("../models/user");
const config = require("../config/database");

const user_defaults = "_id username priviledges profile_pic banned is_super";

module.exports = (passport) => {
	let opts = {};
	opts.jwtFromRequest = ExtractJwt.fromAuthHeader(); //Change auth header in prod
	opts.secretOrKey = config.secret;
	opts.algorithms = ["HS512"],
	passport.use(new JwtStrategy(opts,  (jwt_payload, done) => {
		User.findOne({"_id": jwt_payload.iss}, user_defaults, (err, user) => {
			// This field will contain user and the refreshed token
			if(err){
				return done(err, false);
			}
			if(user){
				//const credentials = user;
				const credentials = {
					"data": user,
					"new_token": utils.createToken(user, config.secret)
				};
				done(null, credentials);
			}
			else{
				done(null, false);
			}
		});
	}));
};