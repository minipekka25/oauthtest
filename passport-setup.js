const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const data = require('./data')
require('dotenv').config();


const workspaceSchema = require('./schemas/workspace')
const userSchema = require('./schemas/user')







passport.serializeUser(function (user, done) {
    /*
    From the user take just the id (to minimize the cookie size) and just pass the id of the user
    to the done callback
    PS: You dont have to do it like this its just usually done like this
    */
    done(null, user);
});

passport.deserializeUser(function (user, done) {
    /*
    Instead of user this function usually recives the id 
    then you use the id to select the user from the db and pass the user obj to the done callback
    PS: You can later access this data in any routes in: req.user
    */
    done(null, user);
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL
},
    function (accessToken, refreshToken, profile, done) {
        console.log(accessToken, refreshToken)
        var db = data.getDatabaseConnection('black_master')
        const user = db.model('user', userSchema)



         var query = user.where({ name: profile._json.name });
         query.findOne(function (err, kitten) {
             if (err) {
                console.log('found error' + err)
            }
            if (kitten == null) {
                 let newUser = new user({
                     name: profile._json.name,
                     email: profile._json.email,
                     picture: profile._json.picture,
                     googleId: profile._json.sub,
                 })
                 newUser.save().then((data) => console.log('saved data' + data))
             }
         });
        /*
         use the profile info (mainly profile id) to check if the user is registerd in ur db
         If yes select the user and pass him to the done callback
         If not create the user and then select him and pass to callback
        */
        return done(null, profile);
        
    }
));