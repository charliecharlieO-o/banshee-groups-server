const express = require("express");
const jwt = require("jwt-simple");
const passport = require("passport");
const crypto = require("crypto");
const uuid = require("uuid");
const passport_utils = require("../config/passport-utils");
const router = express.Router();

const config = require("../config/database");
const utils = require("../config/utils");
const settings = require("../config/settings");

const default_user_list = "_id username banned profile_pic last_log";

// Include passport module as passport strategy
require("../config/passport")(passport);

// Models
const User = require("../models/user");
const Request = require("../models/request");
const Notification = require("../models/notification");

//=================================================================================
//									--	USERS --
//=================================================================================

const user_list_default = "_id username last_log banned";

/*DEV*/
router.get("/list/all", (req, res) => {
  User.find({}, (err, users) => {
    res.json(users);
  })
});

/* GET users that registered between X and Y dates */
router.get("/list/by-date", passport.authenticate("jwt", {session: false}), (req, res) => {
  if(utils.hasRequiredPriviledges(req.user.data.priviledges, ["admin_admins"])){
    User.find({}, default_user_list, { "sort": { "signedup_at": -1 }}, (err, users) => {
      if(err || !users){
        res.json({ "success": false });
      }
      else{
        res.json({ "success": true, "doc": users });
      }
    });
  }
  else{
    res.status(401).send("Unauthorized");
  }
});

/* GET user */
router.get("/:user_id/profile", passport.authenticate("jwt", {session: false}), (req, res) => {
  // If an admin is requestinig the profile
  if(utils.hasRequiredPriviledges(req.user.data.priviledges, ["admin_admins"])){
    User.findById(req.params.user_id, { "password": 0 }, (err, user) => {
      if(err || !user){
        res.json({ "success": false });
      }
      else {
        res.json({ "success": true, "doc": user });
      }
    });
  }
  else{
    if(req.user.data._id == req.params.user_id){
      // If the requested user equals the requesting user give profile
      User.findById(req.params.user_id, { "password": 0 }, (err, user) => {
        if(err || !user){
          res.json({ "success": false });
        }
        else {
          res.json({ "success": true, "doc": user });
        }
      });
    }
    else{
      Request.findOne({ "actors": req.user.data._id }, "has_access", (err, request) => {
        if(err){
          res.json({ "success": false });
        }
        else{
          if(request && request.has_access){
            // if the requested user allowed requesting user, give info
            User.findById(req.params.user_id, "username profile_pic contact_info last_log", (err, user) => {
              if(err || !user){
                res.json({ "success": false });
              }
              else{
                res.json({ "success": true, "doc": user });
              }
            });
          }
          else{
            // give limited access
            User.findById(req.params.user_id, "username profile_pic", (err, user) => {
              if(err || !user){
                res.json({ "success": false });
              }
              else{
                res.json({ "success": true, "doc": user });
              }
            });
          }
        }
      });
    }
  }
});

/* POST register new user (Must be protected) */
router.post("/register", (req, res) => {
	let newUser = new User({
		"username": req.body.username,
		"password": req.body.password,
    "profile_pic": {
      "picture": "/default/def.jpg",
      "thumbnail": "/default/def.jpg"
    },
		"contact_info": [],
		"info_requests": [],
		"alerts": [],
		"phone_number": req.body.phone_number,
		"last_log": Date.now(),
    "priviledges": ["search_user","can_reply","can_post"]
	});
	User.create(newUser, (err, user) => {
		if(err){
			// Check for validation errors
			res.json({ "success": false });
		}
		else{
			user.password = null;
			res.json({ "success": true, "doc": user });
		}
	});
});

/* POST login user (Captcha protected) */
router.post("/login/phone", (req, res) => {
	User.findOne({
		"phone_number": req.body.phone_number
	}, (err, user) => {
		if(err)
			throw err;
		if(!user){
			res.send({ "success": false });
		}
		else{
			// Check if password matches
			user.comparePassword(req.body.password, (err, isMatch) => {
				if(isMatch && !err){
					// User save last log
					user.last_log = Date.now();
					user.save((err) => {
						if(err){
							res.json({"error":"Log in failed"});
						}
						else{
							// If user is found and password is right create a token
							const token = passport_utils.createToken(user, config.secret);
							// Return the information including token as JSON
							res.json({"success": true, "token": token});
						}
					});
				}
				else{
					res.json({ "success": false });
				}
			});
		}
	});
});

/* POST login with username and password */
router.post("/login/standard", (req, res) => {
  User.findOne({
		"username": req.body.username
	}, (err, user) => {
		if(err)
			throw err;
		if(!user){
			res.send({ "success": false });
		}
		else{
			// Check if password matches
			user.comparePassword(req.body.password, (err, isMatch) => {
				if(isMatch && !err){
					// User save last log
					user.last_log = Date.now();
					user.save((err) => {
						if(err){
							res.json({"error":"Log in failed"});
						}
						else{
							// If user is found and password is right create a token
							const token = passport_utils.createToken(user, config.secret);
							// Return the information including token as JSON
							res.json({"success": true, "token": token});
						}
					});
				}
				else{
					res.json({ "success": false });
				}
			});
		}
	});
});

/* PUT edit user profile */
router.put("/update-profile", passport.authenticate("jwt", {session: false}), (req, res) => {
  if(utils.hasRequiredPriviledges(req.user.data.priviledges, ["edit_user"]) || req.user.data._id == req.body.user_id){
    // Edit profile information
    User.findById(req.body.user_id, (err, user) => {
      if(err || !user || user.is_super && user._id != req.user.data._id){
        res.json({ "success": false });
      }
      else{
        // Add profile pic
        const user_info = {
          "contact_info": (req.body.contact_info != null)? JSON.parse(req.body.contact_info) : user.contact_info,
          "phone_number": (req.body.phone_number != null)? req.body.phone_number : user.phone_number
        };
        user.contact_info = user_info.contact_info;
        user.phone_number = user_info.phone_number;
        user.save((err) => {
          if(err){
            res.json({ "success": false });
          }
          else{
            res.json({ "success": true });
          }
        });
      }
    });
  }
  else{
    res.status(401).send("Unauthorized");
  }
});

/* POST search user by username with filters */
router.post("/search", passport.authenticate("jwt", {session: false}), (req, res) => {
  if(utils.hasRequiredPriviledges(req.user.data.priviledges, ["search_user"])){
    User.find(
      { "$text": { "$search": req.body.username }},
      { "score": { "$meta": "textScore" }}
    ).select(
      user_list_default
    ).sort(
      { "score": { "$meta": "textScore" }}
    ).limit(
      settings.max_user_search_results
    ).exec((err, users) => {
      if(err || !users){
        res.json({ "success": false });
      }
      else{
        res.json({ "success": true, "doc": users });
      }
    });
  }
  else{
    res.status(401).send("Unauthorized");
  }
});

/* PUT ban user */ //(GENERATES NOTIFICATION)
router.put("/ban", passport.authenticate("jwt", {session: false}), (req, res) => {
  if(utils.hasRequiredPriviledges(req.user.data.priviledges, ["ban_user"])){
    User.findOneAndUpdate({ "_id": req.body.user_id, "is_super": false },
    {
      "$set": {
        "banned": {
          "is_banned": true,
          "banned_by": req.user.data._id,
          "banned_until": req.body.banned_until
        }
      }
    }, (err, user) => {
      if(err || !user){
        res.json({ "success": false });
      }
      else{
        res.json({ "success": true });
      }
    });
  }
  else{
    res.status(401).send("Unauthorized");
  }
});

/* PUT unban user */
router.put("/unban", passport.authenticate("jwt", {session: false}), (req, res) => {
  if(utils.hasRequiredPriviledges(req.user.data.priviledges, ["unban_user"])){
    User.findOneAndUpdate({ "_id": req.body.user_id },
    {
      "$set": {
        "banned": {
          "is_banned": false,
          "banned_by": null,
          "banned_until": null
        }
      }
    }, (err, user) => {
      if(err || !user){
        res.json({ "success": false });
      }
      else{
        res.json({ "success": true });
      }
    });
  }
  else{
    res.status(401).send("Unauthorized");
  }
});

/* PUT change user's password */
router.put("/password", passport.authenticate("jwt", {session: false}), (req, res) => {
  User.findOneAndUpdate({ "_id": req.user.data._id },
  {
    "$set":{ "password": req.body.new_password }
  }, (err, user) => {
    if(err || !user){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true });
    }
  });
});

/* DELETE user */
router.delete("/remove", passport.authenticate("jwt", {session: false}), (req, res) => {
  if(utils.hasRequiredPriviledges(req.user.data.priviledges, ["delete_user"])){
    User.remove({ "_id": req.body.user_id, "is_super": false }, (err) => {
      if(err){
        res.json({ "success": false });
      }
      else{
        res.json({ "success": true });
      }
    });
  }
  else{
    res.status(401).send("Unauthorized");
  }
});

/* POST upgrade a user's priviledges or remove them */ //(GENERATES NOTIFICATION)
router.post("/promote", passport.authenticate("jwt", {session: false}), (req, res) => {
  if(utils.hasRequiredPriviledges(req.user.data.priviledges, ["promote_user"])){
    const priviledges = (req.body.priviledges != null)? JSON.parse(req.body.priviledges) : [];
    User.findOneAndUpdate({ "_id": req.body.user_id, "is_super": false },
    {
      "$set": {
        "priviledges": priviledges
      }
    }, (err, user) => {
      if(err || !user){
        res.json({ "success": false });
      }
      else{
        res.json({ "success": true });
      }
    });
  }
  else{
    res.status(401).send("Unauthorized");
  }
});

//=================================================================================
//									--	INFO REQUESTS --
//=================================================================================

// List items to show
const default_request_list = "to requested_by date_requested";

/* GET specific info request */
router.get("/request/:request_id", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.findById({ "_id": req.params.request_id, "actors": { "$in": [req.user.data._id]}},
  "to requested_by has_access", (err, request) => {
    if(err || !request){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true, "doc": request });
    }
  });
});

/* GET check if user has info access */
router.get("/is-friend/:user_id", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.findOne({ "actors": { "$all": [req.user.data._id, req.params.user_id]}}, "has_access", (err, request) => {
    if(err || !request){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true, "is_friend": request.has_access });
    }
  });
});

/* POST create an info request */ //(GENERATES NOTIFICATION)
router.post("/request", passport.authenticate("jwt", {session: false}),(req, res) => {
  let newRequest = new Request({
    "to": {
      "id": req.body.to_userid
    },
    "requested_by": {
      "username": req.user.data.username,
      "id": req.user.data._id,
      "thumbnail_pic": req.user.data.profile_pic.thumbnail
    },
    "actors": [req.body.to_userid, req.user.data._id]
  });
  Request.findOne({ "actors": { "$all": [req.user.data._id, newRequest.to.id]}}, "has_access", (err, request) => {
    if(err){
      res.json({ "success": false });
    }
    else{
      if(request){
        // A relationship has already been established
        res.json({ "success": true, "is_friend": request.has_access });
      }
      else{
        User.findOne({ "_id": newRequest.to.id }, "username profile_pic new_requests", (err, user) => {
          if(err || !user || user._id == req.user.data._id){
            res.json({ "success": false });
          }
          else{
            newRequest.to["username"] = user.username;
            newRequest.to["thumbnail_pic"] = user.profile_pic.thumbnail;
            Request.create(newRequest, (err, request) => {
              if(err || !request){
                console.log(newRequest);
                console.log(err);
                res.json({ "success": false });
              }
              else{
                user.new_requests += 1;
                user.save();
                res.json({ "success": true });
              }
            });
          }
        });
      }
    }
  });
});

/* GET list of user's forward info requests */
router.get("/sent-requests", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.find({ "requested_by.id": req.user.data._id, "responded": false }).select(
    default_request_list
  ).sort(
    { "date_requested": -1 }
  ).exec((err, requests) => {
    if(err || !requests){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true, "doc": requests })
    }
  });
});

/* GET list of user's incoming info requests */
router.get("/my-requests", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.find({ "to.id": req.user.data._id, "responded": false }).select(
    default_request_list
  ).sort(
    { "date_requested": -1 }
  ).exec((err, requests) => {
    if(err || !requests){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true, "doc": requests });
    }
  });
});

/* POST accept all info requests */
router.post("/requests/accept-all", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.update({ "to.id": req.user.data._id, "responded": false },
  {
    "$set": {
      "responded": true,
      "has_access": true
    }
  }, (err) => {
    if(err){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true });
    }
  });
});

/* POST deny all info requests */
router.post("/requests/deny-all", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.update({ "to.id": req.user.data._id, "responded": false },
  {
    "$set": {
      "responded": true,
      "has_access": false
    }
  }, (err) => {
    if(err){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true });
    }
  });
});

/* GET list of users with granted access */
router.get("/friends", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.find({ "actors": req.user.data._id, "has_access": true }).select(
    default_request_list
  ).sort(
    { "date_requested": -1 }
  ).exec((err, requests) => {
    if(err || !requests){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true, "doc": requests });
    }
  });
});

/* GET list of users which access has been denied */
router.get("/foes", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.find({ "to.id": req.user.data._id, "responded": true ,"has_access": false }).select(
    default_request_list
  ).sort(
    { "date_requested": -1 }
  ).exec((err, requests) => {
    if(err || !requests){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true, "doc": requests });
    }
  });
});

/* PUT accept or deny an info request */ //(GENERATES NOTIFICATION)
router.put("/request/:request_id/respond", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.findOneAndUpdate({ "to.id": req.user.data._id, "_id": req.params.request_id, "responded": false },
  {
    "$set": {
      "responded": true,
      "has_access": req.body.has_access
    }
  }, (err, request) => {
    if(err || !request){ // If there's an error
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true });
    }
  });
});

/* DELETE revoke an user's info access */
router.delete("/request/:request_id/remove", passport.authenticate("jwt", {session: false}), (req, res) => {
  Request.remove({ "_id": req.params.request_id, "actors": { "$in": [req.user.data._id]}}, (err) => {
    if(err){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true })
    }
  });
});

//=================================================================================
//									--	NOTIFICATIONS --
//=================================================================================

/* GET specific notification */
router.get("/notification/:notif_id", passport.authenticate("jwt", {session: false}), (req, res) => {
  Notification.findOne({ "_id": req.params.notif_id, "owner": req.user.data._id }, (err, notif) => {
    if(err || !notif){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true, "doc": notif });
    }
  });
});

/* GET unseen notifications */
router.get("/notifications", passport.authenticate("jwt", {session: false}), (req, res) => {
  Notification.find({ "owner": req.user.data._id, "seen": false }).sort(
    { "date_alerted": -1 }
  ).exec((err, notifications) => {
    if(err || notifications){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true, "doc": notifications });
    }
  });
});

/* PUT set all unseen notifs as seen */
router.put("/notifications/set-seen", passport.authenticate("jwt", {session: false}), (req, res) => {
  const now = (new Date()).now;
  Notifications.update({ "ower": req.user.data._id, "seen": false },
  {
    "$set": { "seen": true, "date_seen": now }
  }, { "multi": true }, (err) => {
    if(err){
      res.json({ "success": false });
    }
    else {
      res.json({ "success": true });
    }
  });
});

/* GET latest notifications (first X) */
router.get("/notifications/list-short", passport.authenticate("jwt", {session: false}), (req, res) => {
  Notifications.find({ "owner": req.user.data._id }).sort(
    { "date_alerted": -1 }
  ).limit(
    settings.max_notif_list_results
  ).exec((err, notifications) => {
    if(err || !notifications){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true, "doc": notifications });
    }
  });
});

/* DELETE remove a notification */
router.get("/notification/:notif_id/remove", passport.authenticate("jwt", {session: false}), (req, res) => {
  Notifications.remove({ "_id": req.params.notif_id, "owner": req.user.data._id }, (err) => {
    if(err){
      res.json({ "success": false });
    }
    else{
      res.json({ "success": true });
    }
  });
});

module.exports = router;
