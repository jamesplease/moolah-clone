'use strict';

const _ = require('lodash');
const pgp = require('pg-promise');
const baseSql = require('./base-sql');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// This is copy+pasted from Fortune's source, for now
function createId() {
  // eslint-disable-next-line
  return Date.now() + '-' + ('00000000' + Math.floor(Math.random() * Math.pow(2, 32)).toString(16)).slice(-8);
}

function findUser(db, googleId) {
  return db.one(`SELECT * FROM user_account WHERE google_id=$[googleId]`, {googleId});
}

module.exports = function(db) {
  function googleStrategyCallback(req, accessToken, refreshToken, profile, done) {
    // User is already logged in; probably through another account. We also
    // associate their Google account with the login.
    if (req.user) {

    }
    // User is not logged in. Let's log them in!
    else {
      const googleId = profile.id;

      // Let's see if we already have an account for this user
      findUser(db, googleId)
        // If we do, then we return it
        .then(
          result => {
            done(null, result);
          },
          // Otherwise, we create a new account for them
          err => {
            const queryErrorCode = pgp.errors.queryResultErrorCode;
            const errorKey = _.findKey(queryErrorCode, c => c === err.code);

            if (errorKey === 'noData') {
              const query = baseSql.create('user_account', ['id', 'google_id']);
              db.one(query, {google_id: googleId, id: createId()})
                .then(result => {
                  return done(null, result);
                }, () => {
                  return done(null, false);
                });
            } else {
              return done(null, false);
            }
          }
        );
    }
  }

  // These should be configurable via env variables
  const appUrlBase = process.env.APP_DOMAIN ? process.env.APP_DOMAIN : 'http://localhost:5000';

  const googleStrategy = new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${appUrlBase}/auth/google/callback`,
    passReqToCallback: true
  }, googleStrategyCallback);

  passport.use('google', googleStrategy);

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Retrieves a user account from the DB
  passport.deserializeUser((id, done) => {
    const readQuery = baseSql.read('user_account', ['id'], {
      singular: true
    });
    db.one(readQuery, {id})
      .then(
        result => {
          done(null, result);
        },
        () => {
          done(null, false);
        }
      );
  });
};
